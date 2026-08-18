#!/usr/bin/env python3
"""Collecte quotidienne des donnees de marche et des actualites economiques.

- Recupere les cours (actions, immobilier, or, crypto) via l'API publique Yahoo Finance.
- Recupere les actualites via les flux RSS Google News (requetes en francais).
- Conserve les 3 derniers jours dans data/latest.json.
- Deplace les jours plus anciens dans data/archive/AAAA-MM.json (toujours accessibles).
- Retire les elements listes dans data/deleted.json (suppression definitive par l'utilisateur).

Aucune dependance externe : uniquement la bibliotheque standard Python.
"""

import hashlib
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
ARCHIVE_DIR = os.path.join(DATA_DIR, "archive")
LATEST_PATH = os.path.join(DATA_DIR, "latest.json")
DELETED_PATH = os.path.join(DATA_DIR, "deleted.json")
ARCHIVE_INDEX_PATH = os.path.join(ARCHIVE_DIR, "index.json")

DAYS_KEPT = 3  # nombre de jours visibles avant archivage

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

# Indices et actifs suivis. Plusieurs sources par actif (repli automatique) :
# yahoo -> stooq (CSV gratuit) -> coingecko (crypto / or via PAXG).
MARKETS = [
    {"key": "sp500", "symbol": "^GSPC", "stooq": "^spx", "label": "S&P 500", "category": "actions", "currency": "USD"},
    {"key": "cac40", "symbol": "^FCHI", "stooq": "^cac", "label": "CAC 40", "category": "actions", "currency": "EUR"},
    {"key": "immobilier", "symbol": "VNQ", "stooq": "vnq.us", "label": "Immobilier (ETF VNQ)", "category": "immobilier", "currency": "USD"},
    {"key": "or", "symbol": "GC=F", "stooq": "xauusd", "coingecko": "pax-gold", "label": "Or (once)", "category": "or", "currency": "USD"},
    {"key": "btc", "symbol": "BTC-USD", "stooq": "btcusd", "coingecko": "bitcoin", "label": "Bitcoin", "category": "crypto", "currency": "USD"},
    {"key": "eth", "symbol": "ETH-USD", "stooq": "ethusd", "coingecko": "ethereum", "label": "Ethereum", "category": "crypto", "currency": "USD"},
]

# Requetes Google News par categorie
NEWS_QUERIES = {
    "declarations": [
        "Trump économie marchés",
        "Jerome Powell Fed taux",
        "Christine Lagarde BCE",
        "Larry Fink BlackRock",
        "Warren Buffett investissement",
        "Jamie Dimon économie",
    ],
    "actions": [
        "marchés actions bourse Wall Street",
        "CAC 40 bourse Paris",
    ],
    "immobilier": [
        "marché immobilier investissement",
        "taux crédit immobilier",
    ],
    "or": [
        "cours de l'or once",
        "or valeur refuge investisseurs",
    ],
    "crypto": [
        "bitcoin cours marché",
        "cryptomonnaies régulation investissement",
    ],
}

MAX_ITEMS = {"declarations": 12, "actions": 8, "immobilier": 8, "or": 8, "crypto": 8}


def fetch(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def load_json(path, default):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return default


def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")


def item_id(title, link):
    return hashlib.sha1((title + "|" + link).encode("utf-8")).hexdigest()[:12]


def fetch_yahoo(symbol):
    url = (
        "https://query1.finance.yahoo.com/v8/finance/chart/"
        + urllib.parse.quote(symbol)
        + "?range=5d&interval=1d"
    )
    meta = json.loads(fetch(url))["chart"]["result"][0]["meta"]
    price = meta.get("regularMarketPrice")
    if price is None:
        raise ValueError("pas de cours")
    prev = meta.get("chartPreviousClose") or meta.get("previousClose")
    change_pct = round((price - prev) / prev * 100, 2) if prev else None
    return price, change_pct


def fetch_stooq(symbol):
    """Historique quotidien CSV de stooq.com : Date,Open,High,Low,Close[,Volume]."""
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    d1 = (now - timedelta(days=21)).strftime("%Y%m%d")
    d2 = now.strftime("%Y%m%d")
    url = (
        "https://stooq.com/q/d/l/?s=" + urllib.parse.quote(symbol)
        + f"&i=d&d1={d1}&d2={d2}"
    )
    lines = [l for l in fetch(url).decode("utf-8", "replace").splitlines() if l.strip()]
    closes = []
    for line in lines[1:]:  # saute l'en-tete
        parts = line.split(",")
        if len(parts) >= 5:
            try:
                closes.append(float(parts[4]))
            except ValueError:
                continue
    if not closes:
        raise ValueError("CSV vide")
    price = closes[-1]
    change_pct = round((price - closes[-2]) / closes[-2] * 100, 2) if len(closes) >= 2 else None
    return price, change_pct


_COINGECKO_CACHE = None


def fetch_coingecko(cg_id):
    global _COINGECKO_CACHE
    if _COINGECKO_CACHE is None:
        url = (
            "https://api.coingecko.com/api/v3/simple/price"
            "?ids=bitcoin,ethereum,pax-gold&vs_currencies=usd&include_24hr_change=true"
        )
        _COINGECKO_CACHE = json.loads(fetch(url))
    data = _COINGECKO_CACHE[cg_id]
    change = data.get("usd_24h_change")
    return data["usd"], round(change, 2) if change is not None else None


def fetch_market(entry):
    providers = [("yahoo", lambda: fetch_yahoo(entry["symbol"]))]
    if entry.get("stooq"):
        providers.append(("stooq", lambda: fetch_stooq(entry["stooq"])))
    if entry.get("coingecko"):
        providers.append(("coingecko", lambda: fetch_coingecko(entry["coingecko"])))

    price = change_pct = None
    for name, fn in providers:
        try:
            price, change_pct = fn()
            break
        except Exception as exc:  # reseau, format, symbole retire...
            print(f"[marche] echec {entry['key']} via {name}: {exc}", file=sys.stderr)
    return {
        "key": entry["key"],
        "label": entry["label"],
        "category": entry["category"],
        "currency": entry["currency"],
        "price": round(price, 2) if price is not None else None,
        "change_pct": change_pct,
        "ok": price is not None,
    }


def strip_html(text):
    return re.sub(r"<[^>]+>", "", text or "").strip()


def fetch_news_query(query):
    url = (
        "https://news.google.com/rss/search?q="
        + urllib.parse.quote(query)
        + "&hl=fr&gl=FR&ceid=FR:fr"
    )
    items = []
    try:
        root = ET.fromstring(fetch(url))
        for node in root.iter("item"):
            title = strip_html(node.findtext("title") or "")
            link = (node.findtext("link") or "").strip()
            if not title or not link:
                continue
            source = strip_html(node.findtext("source") or "")
            pub = node.findtext("pubDate") or ""
            try:
                published = parsedate_to_datetime(pub).astimezone(timezone.utc).isoformat()
            except Exception:
                published = None
            items.append(
                {
                    "id": item_id(title, link),
                    "title": title,
                    "link": link,
                    "source": source,
                    "published": published,
                    "query": query,
                }
            )
    except Exception as exc:
        print(f"[actus] echec '{query}': {exc}", file=sys.stderr)
    return items


def collect_news(deleted_ids):
    news = {}
    for category, queries in NEWS_QUERIES.items():
        seen = set()
        collected = []
        per_query = []
        for q in queries:
            per_query.append(fetch_news_query(q))
        # Alternance entre requetes pour varier les sources
        idx = 0
        while len(collected) < MAX_ITEMS[category]:
            progressed = False
            for lst in per_query:
                if idx < len(lst):
                    it = lst[idx]
                    if it["id"] not in seen and it["id"] not in deleted_ids:
                        seen.add(it["id"])
                        collected.append(it)
                        if len(collected) >= MAX_ITEMS[category]:
                            break
                    progressed = True
            if not progressed:
                break
            idx += 1
        news[category] = collected
    return news


def scrub_day(day, deleted_ids):
    for category, items in list(day.get("news", {}).items()):
        day["news"][category] = [it for it in items if it["id"] not in deleted_ids]
    return day


def archive_days(days, deleted_ids):
    """Deplace les jours donnes vers les fichiers d'archive mensuels."""
    by_month = {}
    for day in days:
        month = day["date"][:7]
        by_month.setdefault(month, []).append(day)
    for month, month_days in by_month.items():
        path = os.path.join(ARCHIVE_DIR, f"{month}.json")
        existing = load_json(path, {"month": month, "days": []})
        merged = {d["date"]: d for d in existing["days"]}
        for d in month_days:
            merged[d["date"]] = d
        all_days = [scrub_day(d, deleted_ids) for d in merged.values()]
        all_days.sort(key=lambda d: d["date"], reverse=True)
        existing["days"] = all_days
        save_json(path, existing)


def rebuild_archive_index():
    months = []
    if os.path.isdir(ARCHIVE_DIR):
        for name in sorted(os.listdir(ARCHIVE_DIR), reverse=True):
            if re.fullmatch(r"\d{4}-\d{2}\.json", name):
                month = name[:-5]
                data = load_json(os.path.join(ARCHIVE_DIR, name), {"days": []})
                months.append({"month": month, "days": len(data.get("days", []))})
    save_json(ARCHIVE_INDEX_PATH, {"months": months})


def main():
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")

    deleted = load_json(DELETED_PATH, {"ids": []})
    deleted_ids = set(deleted.get("ids", []))

    print(f"Collecte des donnees pour le {today}...")
    markets = [fetch_market(m) for m in MARKETS]
    news = collect_news(deleted_ids)

    today_entry = {
        "date": today,
        "updated_at": now.isoformat(timespec="seconds"),
        "markets": markets,
        "news": news,
    }

    latest = load_json(LATEST_PATH, {"days": []})
    days = {d["date"]: d for d in latest.get("days", [])}
    days[today] = today_entry
    ordered = sorted(days.values(), key=lambda d: d["date"], reverse=True)

    kept = [scrub_day(d, deleted_ids) for d in ordered[:DAYS_KEPT]]
    to_archive = ordered[DAYS_KEPT:]
    if to_archive:
        print(f"Archivage de {len(to_archive)} jour(s): "
              + ", ".join(d["date"] for d in to_archive))
        archive_days(to_archive, deleted_ids)

    save_json(
        LATEST_PATH,
        {"generated_at": now.isoformat(timespec="seconds"), "days": kept},
    )
    if not os.path.exists(DELETED_PATH):
        save_json(DELETED_PATH, {"ids": []})
    rebuild_archive_index()

    total_news = sum(len(v) for v in news.values())
    ok_markets = sum(1 for m in markets if m["ok"])
    print(f"Termine : {ok_markets}/{len(markets)} cours recuperes, {total_news} actualites.")


if __name__ == "__main__":
    main()
