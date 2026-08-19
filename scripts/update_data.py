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
import time
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
    {"key": "sp500", "symbol": "^GSPC", "cnbc": ".SPX", "stooq": "^spx", "label": "S&P 500", "category": "actions", "currency": "USD"},
    {"key": "cac40", "symbol": "^FCHI", "cnbc": ".FCHI", "stooq": "^cac", "label": "CAC 40", "category": "actions", "currency": "EUR"},
    {"key": "immobilier", "symbol": "VNQ", "cnbc": "VNQ", "stooq": "vnq.us", "label": "Immobilier (ETF VNQ)", "category": "immobilier", "currency": "USD"},
    {"key": "or", "symbol": "GC=F", "cnbc": "@GC.1", "stooq": "xauusd", "coingecko": "pax-gold", "label": "Or (kilo)", "category": "or", "currency": "USD", "oz_to_kg": True},
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
    # Le 429 de Yahoo depuis les runners GitHub est souvent intermittent :
    # on retente sur les deux hotes avec une pause croissante.
    last_exc = None
    payload = None
    for attempt, host in enumerate(["query1", "query2"]):
        url = (
            f"https://{host}.finance.yahoo.com/v8/finance/chart/"
            + urllib.parse.quote(symbol)
            + "?range=5d&interval=1d"
        )
        try:
            payload = json.loads(fetch(url))
            break
        except Exception as exc:
            last_exc = exc
            time.sleep(2 * (attempt + 1))
    if payload is None:
        raise last_exc
    meta = payload["chart"]["result"][0]["meta"]
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


def fetch_cnbc(symbol):
    """API de cotation publique de CNBC (cours + variation directement)."""
    url = (
        "https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol"
        "?symbols=" + urllib.parse.quote(symbol)
        + "&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json"
    )
    quote = json.loads(fetch(url))["FormattedQuoteResult"]["FormattedQuote"][0]
    price = float(str(quote["last"]).replace(",", "").replace("$", ""))
    change_pct = None
    raw = str(quote.get("change_pct", "")).strip()
    if raw and raw.upper() != "UNCH":
        try:
            change_pct = round(float(raw.replace("%", "").replace("+", "")), 2)
        except ValueError:
            pass
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
    if entry.get("cnbc"):
        providers.append(("cnbc", lambda: fetch_cnbc(entry["cnbc"])))
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

    # Conversion once troy -> kilogramme pour l'or (32,1507466 oz/kg)
    if price is not None and entry.get("oz_to_kg"):
        price = price * 32.1507466

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
            # Seuls les liens http(s) sont acceptes (jamais de javascript:, data:, etc.)
            if not title or not link.lower().startswith(("http://", "https://")):
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
    latest_prev = load_json(LATEST_PATH, {"days": []})
    markets = [fetch_market(m) for m in MARKETS]
    news = collect_news(deleted_ids)

    # Si toutes les sources ont echoue pour un actif, on conserve le dernier
    # cours connu (marque "stale_from" avec sa date) plutot que rien.
    prev_prices = {}
    for d in sorted(latest_prev.get("days", []), key=lambda d: d["date"], reverse=True):
        for m in d.get("markets", []):
            if m.get("price") is not None and m["key"] not in prev_prices:
                prev_prices[m["key"]] = {
                    "price": m["price"],
                    "date": m.get("stale_from") or d["date"],
                }
    for m in markets:
        if m["price"] is None and m["key"] in prev_prices:
            prev = prev_prices[m["key"]]
            m["price"] = prev["price"]
            m["stale_from"] = prev["date"]

    today_entry = {
        "date": today,
        "updated_at": now.isoformat(timespec="seconds"),
        "markets": markets,
        "news": news,
    }

    days = {d["date"]: d for d in latest_prev.get("days", [])}
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

    # Enrichissement IA du jour du haut (résumé matinal en deux lignes)
    briefing = generate_briefing(today_entry)
    if briefing:
        today_entry["briefing"] = briefing
        # Regenerer latest.json avec le briefing inclus
        save_json(
            LATEST_PATH,
            {"generated_at": now.isoformat(timespec="seconds"), "days": kept},
        )

    total_news = sum(len(v) for v in news.values())
    ok_markets = sum(1 for m in markets if m["ok"])
    print(f"Termine : {ok_markets}/{len(markets)} cours recuperes, {total_news} actualites.")


# ---------------------------------------------------------------------------
# Résumé matinal généré par Claude Haiku 4.5 (Anthropic)
# ---------------------------------------------------------------------------
BRIEFING_SYSTEM = (
    "Vous êtes le rédacteur en chef d'un journal financier haut de gamme "
    "de langue française. Votre style est concis, littéraire, factuel, sans "
    "sensationnalisme et sans conseil en investissement. Vous écrivez à la "
    "manière d'un éditorial matinal du Monde ou des Echos."
)

BRIEFING_USER_TEMPLATE = """Voici les données du jour ({date}).

MARCHÉS :
{markets_lines}

TITRES DU JOUR (5 principaux) :
{news_lines}

Rédigez le « Résumé du matin » en EXACTEMENT deux lignes courtes séparées par un saut de ligne.
- Ligne 1 : verdict des marchés (ton éditorial, une idée forte, chiffres saillants inclus).
- Ligne 2 : le fait politique/économique dominant du jour (nom propre, verbe fort, angle éditorial).

Contraintes :
- Français impeccable, phrases complètes, ponctuation soignée.
- Pas d'introduction, pas de guillemets globaux, pas de tirets à puces.
- Chaque ligne fait 90 à 160 caractères.
- Pas de conseil d'investissement, pas de spéculation.

Retournez uniquement les deux lignes, rien d'autre."""


def generate_briefing(day_entry):
    """Appelle Claude Haiku 4.5 pour produire un éditorial en deux lignes.
    Renvoie {"line1", "line2", "model", "generated_at"} ou None si indisponible.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        print("[briefing] ANTHROPIC_API_KEY absent, résumé IA sauté.", file=sys.stderr)
        return None
    try:
        from anthropic import Anthropic  # type: ignore
    except Exception as exc:
        print(f"[briefing] SDK anthropic indisponible: {exc}", file=sys.stderr)
        return None

    # Résumer les marchés en une ligne par actif
    market_lines = []
    for m in (day_entry.get("markets") or []):
        if m.get("price") is None:
            continue
        cur = "€" if m.get("currency") == "EUR" else "$"
        chg = m.get("change_pct")
        chg_txt = f"{chg:+.2f} %" if isinstance(chg, (int, float)) else "—"
        market_lines.append(
            f"- {m['label']} : {m['price']:.2f} {cur} ({chg_txt})"
        )

    # 5 titres tous cats confondues, triés par date
    all_news = []
    for cat, items in (day_entry.get("news") or {}).items():
        for it in items:
            all_news.append({**it, "cat": cat})
    all_news.sort(key=lambda x: x.get("published") or "", reverse=True)
    news_lines = []
    for it in all_news[:5]:
        src = f" — {it['source']}" if it.get("source") else ""
        news_lines.append(f"- [{it['cat']}] {it['title']}{src}")

    prompt = BRIEFING_USER_TEMPLATE.format(
        date=day_entry.get("date", ""),
        markets_lines="\n".join(market_lines) or "- (aucun cours disponible)",
        news_lines="\n".join(news_lines) or "- (aucun titre disponible)",
    )

    try:
        client = Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-haiku-4-5",
            system=BRIEFING_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=350,
            temperature=0.4,
        )
        text = "".join(
            b.text for b in response.content
            if getattr(b, "type", None) == "text"
        ).strip()
    except Exception as exc:
        print(f"[briefing] appel Claude échoué: {type(exc).__name__}: {exc}", file=sys.stderr)
        return None

    if not text:
        print("[briefing] réponse vide.", file=sys.stderr)
        return None

    # Extraction robuste des deux lignes
    lines = [l.strip(" \"«»\t").rstrip(".") + "." for l in text.split("\n") if l.strip()]
    # Supprimer d'éventuels préfixes type "Ligne 1 :" ou tirets
    cleaned = []
    for l in lines:
        l = re.sub(r"^(ligne\s*\d+\s*[:\-–—]\s*|[-–—•]\s*)", "", l, flags=re.IGNORECASE)
        if l:
            cleaned.append(l)
    if len(cleaned) < 2:
        print(f"[briefing] format inattendu: {text!r}", file=sys.stderr)
        return None

    return {
        "line1": cleaned[0],
        "line2": cleaned[1],
        "model": "claude-haiku-4-5",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


if __name__ == "__main__":
    main()
