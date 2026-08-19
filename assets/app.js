/* Pulse Éco — logique du site (aucune dépendance externe). */
(function () {
  "use strict";

  var CATEGORIES = ["declarations", "actions", "immobilier", "or", "crypto"];
  var RUBRIQUES = [
    { cat: "declarations", label: "Déclarations" },
    { cat: "actions", label: "Actions" },
    { cat: "immobilier", label: "Immobilier" },
    { cat: "or", label: "Or" },
    { cat: "crypto", label: "Crypto" }
  ];
  var ROMAN = ["I", "II", "III", "IV", "V"];

  // Libellés élégants pour les sous-catégories (basés sur la requête d'origine)
  var QUERY_LABELS = {
    "Trump économie marchés": "Donald Trump",
    "Jerome Powell Fed taux": "Jerome Powell · Fed",
    "Christine Lagarde BCE": "Christine Lagarde · BCE",
    "Larry Fink BlackRock": "Larry Fink · BlackRock",
    "Warren Buffett investissement": "Warren Buffett",
    "Jamie Dimon économie": "Jamie Dimon · JPMorgan",
    "marchés actions bourse Wall Street": "Wall Street",
    "CAC 40 bourse Paris": "Paris · CAC 40",
    "marché immobilier investissement": "Marché immobilier",
    "taux crédit immobilier": "Taux & crédit",
    "cours de l'or once": "Cours de l'or",
    "or valeur refuge investisseurs": "Valeur refuge",
    "bitcoin cours marché": "Bitcoin",
    "cryptomonnaies régulation investissement": "Régulation crypto"
  };
  function prettyQueryLabel(q) {
    return QUERY_LABELS[q] || (q && q.charAt(0).toUpperCase() + q.slice(1)) || "Divers";
  }

  var HIDDEN_KEY = "pulse-eco-hidden-ids";
  var THEME_KEY = "pulse-eco-theme";
  var VIEW_KEY = "pulse-eco-days-view";
  var PERIOD_KEY = "pulse-eco-market-period";
  var CHAT_ENDPOINT_KEY = "pulse-eco-chat-endpoint";
  var CHAT_HISTORY_KEY = "pulse-eco-chat-history";
  var CHAT_HISTORY_MAX_PAIRS = 5; // dernières 5 Q/R

  var state = {
    view: "latest", // "latest" | "archive"
    daysView: loadDaysView(), // "list" | "magazine" | "mosaic"
    marketPeriod: loadMarketPeriod(), // "day" | "week" | "month" | "year"
    category: "toutes",
    rubClosed: {},
    query: "",
    latest: null,
    archiveIndex: null,
    archiveMonth: null,
    archiveData: null,
    history: null, // {cle: [{date, price}]} pour les sparklines
    collapsed: {},
    hidden: loadHidden(),
    lastHidden: null
  };

  var el = {
    status: document.getElementById("status"),
    ticker: document.getElementById("ticker"),
    tickerTrack: document.getElementById("ticker-track"),
    edition: document.getElementById("edition"),
    editionDate: document.getElementById("edition-date"),
    editionMeta: document.getElementById("edition-meta"),
    markets: document.getElementById("markets"),
    toolbar: document.getElementById("toolbar"),
    tabs: document.getElementById("tabs"),
    search: document.getElementById("search"),
    days: document.getElementById("days"),
    editBar: document.getElementById("edit-bar"),
    hiddenCount: document.getElementById("hidden-count"),
    archivePicker: document.getElementById("archive-picker"),
    modal: document.getElementById("modal"),
    idsBox: document.getElementById("ids-box"),
    generatedAt: document.getElementById("generated-at"),
    btnLatest: document.getElementById("btn-view-latest"),
    btnArchive: document.getElementById("btn-view-archive"),
    btnEdit: document.getElementById("btn-edit-mode"),
    btnTheme: document.getElementById("btn-theme"),
    btnTop: document.getElementById("btn-top"),
    toast: document.getElementById("toast"),
    toastMsg: document.getElementById("toast-msg"),
    toastUndo: document.getElementById("toast-undo")
  };

  /* ---------- Rideau d'ouverture ---------- */
  window.addEventListener("load", function () {
    setTimeout(function () { document.body.classList.add("loaded"); }, 100);
  });

  /* ---------- Curseur signature ---------- */
  (function () {
    if (window.matchMedia && window.matchMedia("(hover: none)").matches) return;
    var cursor = document.getElementById("cursor");
    if (!cursor) return;
    var dot = cursor.querySelector(".cursor-dot");
    var ring = cursor.querySelector(".cursor-ring");
    var mx = 0, my = 0, rx = 0, ry = 0, dx = 0, dy = 0;
    document.addEventListener("mousemove", function (e) {
      mx = e.clientX; my = e.clientY;
      dx = mx; dy = my;
    });
    function raf() {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      dot.style.transform = "translate(" + (dx - 3) + "px," + (dy - 3) + "px)";
      ring.style.transform = "translate(" + (rx - 16) + "px," + (ry - 16) + "px)";
      requestAnimationFrame(raf);
    }
    raf();
    // Rendre les liens/boutons "magnétiques"
    document.addEventListener("mouseover", function (e) {
      if (e.target.closest("a, button, .market-card, .rub-head, .month-btn, .tab, .ticker-item")) {
        document.body.classList.add("hover-link");
      }
    });
    document.addEventListener("mouseout", function (e) {
      if (e.target.closest("a, button, .market-card, .rub-head, .month-btn, .tab, .ticker-item")) {
        document.body.classList.remove("hover-link");
      }
    });
  })();

  /* ---------- Splittage de la manchette pour reveal mot par mot ---------- */
  function splitWordsReveal(elText) {
    if (!elText) return;
    var text = elText.textContent.trim();
    if (!text) return;
    var words = text.split(/\s+/);
    elText.innerHTML = "";
    words.forEach(function (w, i) {
      var span = document.createElement("span");
      span.className = "word";
      var inner = document.createElement("span");
      inner.textContent = w + (i < words.length - 1 ? "\u00a0" : "");
      inner.style.animationDelay = (0.05 + i * 0.09) + "s";
      if (i === words.length - 1 && /^\d{4}$/.test(w)) inner.classList.add("em");
      span.appendChild(inner);
      elText.appendChild(span);
    });
  }

  /* ---------- Compteur animé (odomètre) ---------- */
  function animateNumber(node, from, to, opts) {
    opts = opts || {};
    var duration = opts.duration || 1200;
    var symbol = opts.symbol || "";
    var start = performance.now();
    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
    function step(now) {
      var p = Math.min(1, (now - start) / duration);
      var v = from + (to - from) * easeOut(p);
      node.textContent = v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
      if (opts.after) node.textContent += opts.after;
      if (p < 1) requestAnimationFrame(step);
      else if (opts.done) opts.done();
    }
    requestAnimationFrame(step);
  }

  /* ---------- Thème clair / sombre ---------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    el.btnTheme.textContent = theme === "light" ? "☀" : "☾";
    localStorage.setItem(THEME_KEY, theme);
  }
  var urlTheme = new URLSearchParams(location.search).get("theme");
  applyTheme(urlTheme === "light" || urlTheme === "dark"
    ? urlTheme
    : localStorage.getItem(THEME_KEY) || "dark");
  el.btnTheme.addEventListener("click", function () {
    var current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "light" ? "dark" : "light");
  });

  /* ---------- Persistance locale des infos masquées ---------- */
  function loadHidden() {
    try {
      return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]"));
    } catch (e) {
      return new Set();
    }
  }
  function saveHidden() {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(state.hidden)));
  }
  function loadDaysView() {
    var v = localStorage.getItem(VIEW_KEY);
    return (v === "magazine" || v === "mosaic") ? v : "list";
  }
  function saveDaysView() {
    localStorage.setItem(VIEW_KEY, state.daysView);
  }
  function loadMarketPeriod() {
    var v = localStorage.getItem(PERIOD_KEY);
    return (v === "week" || v === "month" || v === "year") ? v : "day";
  }
  function saveMarketPeriod() {
    localStorage.setItem(PERIOD_KEY, state.marketPeriod);
  }
  function applyDaysView() {
    var container = el.days;
    if (!container) return;
    container.classList.remove("days-view-list", "days-view-magazine", "days-view-mosaic");
    container.classList.add("days-view-" + state.daysView);
    var btns = document.querySelectorAll("#view-switcher .view-btn");
    Array.prototype.forEach.call(btns, function (b) {
      b.classList.toggle("active", b.dataset.view === state.daysView);
    });
  }

  /* ---------- Conversion once → kilo pour l'or ---------- */
  var OZ_TO_KG = 32.1507466;
  function normalizeGold(market) {
    if (!market || market.key !== "or") return market;
    var lbl = String(market.label || "").toLowerCase();
    if (lbl.indexOf("kilo") !== -1) return market;
    if (lbl.indexOf("once") !== -1 || market.price != null && market.price < 30000) {
      // On considère qu'un prix inférieur à 30k USD est une valeur en once,
      // supérieur : déjà converti en kilo. Robuste au futur.
      if (market.price != null) market.price = Math.round(market.price * OZ_TO_KG * 100) / 100;
    }
    market.label = "Or (kilo)";
    return market;
  }
  function normalizeDay(day) {
    if (!day) return day;
    if (Array.isArray(day.markets)) day.markets = day.markets.map(normalizeGold);
    return day;
  }

  /* ---------- Utilitaires ---------- */
  function esc(s) {
    var div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }
  function fmtDate(iso) {
    return new Date(iso + "T12:00:00Z").toLocaleDateString("fr-FR", {
      weekday: "long", day: "numeric", month: "long", year: "numeric"
    });
  }
  function fmtDateShort(iso) {
    return new Date(iso + "T12:00:00Z").toLocaleDateString("fr-FR", {
      day: "numeric", month: "short"
    });
  }
  function fmtDateTime(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  }
  function dayLabel(dateStr) {
    var today = new Date(); today.setHours(12, 0, 0, 0);
    var target = new Date(dateStr + "T12:00:00");
    var diff = Math.round((today - target) / 86400000);
    if (diff === 0) return "Aujourd'hui";
    if (diff === 1) return "Hier";
    if (diff === 2) return "Avant-hier";
    return null;
  }
  function fmtPriceParts(m) {
    if (m.price == null) return { value: "indisponible", currency: "" };
    var symbol = m.currency === "EUR" ? "€" : "$";
    return {
      value: m.price.toLocaleString("fr-FR", { maximumFractionDigits: 2 }),
      raw: m.price,
      currency: symbol
    };
  }
  function fmtPrice(m) {
    if (m.price == null) return "indisponible";
    var symbol = m.currency === "EUR" ? "€" : "$";
    return m.price.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " " + symbol;
  }
  function fetchJSON(path) {
    return fetch(path, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status + " sur " + path);
      return r.json();
    });
  }
  function matchesQuery(it) {
    if (!state.query) return true;
    return (it.title + " " + (it.source || "")).toLowerCase().indexOf(state.query) !== -1;
  }
  function byDateDesc(a, b) {
    var pa = a.published || "", pb = b.published || "";
    return pa > pb ? -1 : pa < pb ? 1 : 0;
  }
  function visibleItems(day, category) {
    var items = (day.news && day.news[category]) || [];
    return items.filter(function (it) {
      return !state.hidden.has(it.id) && matchesQuery(it);
    }).sort(byDateDesc);
  }
  function fmtRelative(iso) {
    if (!iso) return "—";
    var mins = (Date.now() - new Date(iso).getTime()) / 60000;
    if (mins < 1) return "à l'instant";
    if (mins < 60) return "il y a " + Math.round(mins) + " min";
    if (mins < 36 * 60) return "il y a " + Math.round(mins / 60) + " h";
    return fmtDateTime(iso);
  }
  function isFresh(iso) {
    if (!iso) return false;
    return Date.now() - new Date(iso).getTime() < 12 * 3600 * 1000;
  }

  /* ---------- Toast ---------- */
  var toastTimer = null;
  function showToast(msg, withUndo) {
    el.toastMsg.textContent = msg;
    el.toastUndo.hidden = !withUndo;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 5000);
  }
  el.toastUndo.addEventListener("click", function () {
    if (state.lastHidden) {
      state.hidden.delete(state.lastHidden);
      state.lastHidden = null;
      saveHidden();
      render();
    }
    el.toast.hidden = true;
  });

  /* ---------- Sparklines ---------- */
  var sparkTip = null;
  function ensureSparkTip() {
    if (!sparkTip) {
      sparkTip = document.createElement("div");
      sparkTip.className = "spark-tip";
      sparkTip.hidden = true;
      document.body.appendChild(sparkTip);
    }
    return sparkTip;
  }

  function buildSparkline(card, points, currency) {
    if (!points || points.length < 2) return;
    var W = 100, H = 34, PAD = 3;
    var min = Infinity, max = -Infinity;
    points.forEach(function (p) {
      if (p.price < min) min = p.price;
      if (p.price > max) max = p.price;
    });
    var span = max - min || 1;
    var coords = points.map(function (p, i) {
      var x = PAD + (W - 2 * PAD) * (points.length === 1 ? 0.5 : i / (points.length - 1));
      var y = H - PAD - (H - 2 * PAD) * ((p.price - min) / span);
      return [x, y];
    });
    var trend = points[points.length - 1].price >= points[0].price ? "var(--up)" : "var(--down)";

    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "sparkline");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");

    var area = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    area.setAttribute("class", "spark-fill");
    area.setAttribute("fill", trend);
    area.setAttribute("points",
      coords.map(function (c) { return c.join(","); }).join(" ") +
      " " + coords[coords.length - 1][0] + "," + (H - 1) + " " + coords[0][0] + "," + (H - 1));
    svg.appendChild(area);

    var line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute("class", "spark-line");
    line.setAttribute("stroke", trend);
    line.setAttribute("vector-effect", "non-scaling-stroke");
    line.setAttribute("points", coords.map(function (c) { return c.join(","); }).join(" "));
    svg.appendChild(line);

    // Point final : trait d'un seul point à bout rond (reste circulaire malgré
    // l'étirement du viewBox, grâce à non-scaling-stroke)
    var last = coords[coords.length - 1];
    var dot = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    dot.setAttribute("stroke", trend);
    dot.setAttribute("stroke-width", "6");
    dot.setAttribute("vector-effect", "non-scaling-stroke");
    dot.setAttribute("points", last.join(",") + " " + last.join(","));
    svg.appendChild(dot);

    // Infobulle : point le plus proche du curseur
    svg.addEventListener("mousemove", function (e) {
      var rect = svg.getBoundingClientRect();
      var rel = (e.clientX - rect.left) / rect.width;
      var idx = Math.round(rel * (points.length - 1));
      idx = Math.max(0, Math.min(points.length - 1, idx));
      var p = points[idx];
      var tip = ensureSparkTip();
      var symbol = currency === "EUR" ? "€" : "$";
      tip.textContent = fmtDateShort(p.date) + " · " +
        p.price.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " " + symbol;
      tip.hidden = false;
      tip.style.left = (e.clientX + 12) + "px";
      tip.style.top = (e.clientY - 10) + "px";
    });
    svg.addEventListener("mouseleave", function () {
      if (sparkTip) sparkTip.hidden = true;
    });

    card.appendChild(svg);
  }

  function loadHistory() {
    // Historique des cours : archives récentes + 3 derniers jours.
    fetchJSON("data/archive/index.json")
      .then(function (idx) {
        var months = (idx.months || []).slice(0, 3).map(function (m) { return m.month; });
        return Promise.all(months.map(function (month) {
          return fetchJSON("data/archive/" + month + ".json").catch(function () { return { days: [] }; });
        }));
      })
      .catch(function () { return []; })
      .then(function (monthFiles) {
        var all = [];
        (monthFiles || []).forEach(function (mf) {
          (mf.days || []).forEach(normalizeDay);
          all = all.concat(mf.days || []);
        });
        if (state.latest) all = all.concat(state.latest.days || []);
        var byKey = {};
        all.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
        var seenDates = {};
        all.forEach(function (day) {
          if (seenDates[day.date]) return;
          seenDates[day.date] = true;
          (day.markets || []).forEach(function (m) {
            if (m.price == null || m.stale_from) return;
            (byKey[m.key] = byKey[m.key] || []).push({ date: day.date, price: m.price });
          });
        });
        state.history = byKey;
        render();
      });
  }

  /* ---------- Rendu : bandeau défilant + manchette ---------- */
  function tickerItemHtml(m) {
    if (m.price == null) return "";
    var cls = "flat", arrow = "→";
    if (m.change_pct > 0) { cls = "up"; arrow = "▲"; }
    if (m.change_pct < 0) { cls = "down"; arrow = "▼"; }
    var change = m.stale_from || m.change_pct == null
      ? ""
      : '<span class="t-change ' + cls + '">' + arrow + " " +
        Math.abs(m.change_pct).toLocaleString("fr-FR") + " %</span>";
    return '<span class="ticker-item" data-cat="' + esc(m.category) + '">' +
      '<span class="t-label">' + esc(m.label) + "</span>" +
      '<span class="t-price">' + esc(fmtPrice(m)) + "</span>" + change + "</span>";
  }

  function renderTicker(day) {
    if (!day || !day.markets) { el.ticker.hidden = true; return; }
    var html = day.markets.map(tickerItemHtml).join("");
    if (!html) { el.ticker.hidden = true; return; }
    el.tickerTrack.innerHTML = html + html; // doublé pour un défilement sans couture
    el.ticker.hidden = false;
  }
  el.tickerTrack.addEventListener("click", function (e) {
    var item = e.target.closest(".ticker-item");
    if (!item || CATEGORIES.indexOf(item.dataset.cat) === -1) return;
    state.view = "latest";
    state.category = item.dataset.cat;
    render();
    var target = document.getElementById("chapter-news") || el.toolbar;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  function renderEdition(days) {
    var day = days[0];
    if (state.view !== "latest" || !day) { el.edition.hidden = true; return; }
    el.editionDate.textContent = fmtDate(day.date);
    // Splittage mot par mot pour reveal cinématographique
    requestAnimationFrame(function () { splitWordsReveal(el.editionDate); });

    // Numéro d'édition = jours depuis un ancrage éditorial (fictif mais stable)
    var editionNumEl = document.getElementById("edition-number");
    if (editionNumEl) {
      var anchor = new Date("2024-01-01T12:00:00Z").getTime();
      var target = new Date(day.date + "T12:00:00Z").getTime();
      var n = Math.max(1, Math.round((target - anchor) / 86400000));
      editionNumEl.textContent = n.toLocaleString("fr-FR");
    }

    var nNews = 0;
    CATEGORIES.forEach(function (c) { nNews += ((day.news && day.news[c]) || []).length; });
    var nMarkets = (day.markets || []).filter(function (m) { return m.price != null; }).length;
    el.editionMeta.innerHTML =
      '<span class="num">' + nNews + '</span>&nbsp;chroniques<span class="sep">◆</span>' +
      '<span class="num">' + nMarkets + '</span>&nbsp;baromètres suivis<span class="sep">◆</span>' +
      'clos&nbsp;à&nbsp;<span class="num">' + esc(fmtDateTime(day.updated_at)) + '</span>';

    buildBriefing(day);
    el.edition.hidden = false;
  }

  /* ---------- Résumé matinal : deux lignes éditoriales ---------- */
  function buildBriefing(day) {
    var box = document.getElementById("edition-briefing");
    var l1 = document.getElementById("briefing-l1");
    var l2 = document.getElementById("briefing-l2");
    var kicker = box ? box.querySelector(".briefing-kicker span:not(.briefing-diamond)") : null;
    if (!box || !l1 || !l2) return;

    // Priorité à l'éditorial IA (Claude Haiku 4.5) généré par la GitHub Action
    if (day.briefing && day.briefing.line1 && day.briefing.line2) {
      if (kicker) kicker.textContent = "L'éditorial du matin";
      l1.innerHTML = esc(day.briefing.line1);
      l2.innerHTML = esc(day.briefing.line2);
      // Petite mention en pied
      var meta = box.querySelector(".briefing-signature");
      if (!meta) {
        meta = document.createElement("span");
        meta.className = "briefing-signature";
        box.appendChild(meta);
      }
      meta.innerHTML = '<span class="brf-quill">✒</span> écrit par la rédaction, épaulée par Claude Haiku';
      // Redémarrage des animations
      [l1, l2].forEach(function (n) {
        n.style.animation = "none"; void n.offsetWidth; n.style.animation = "";
      });
      box.hidden = false;
      return;
    }

    if (kicker) kicker.textContent = "Le résumé du matin";
    var sig = box.querySelector(".briefing-signature");
    if (sig) sig.remove();

    // === Fallback : ligne 1 = humeur des marchés ===
    var markets = (day.markets || []).filter(function (m) {
      return m.price != null && m.change_pct != null && !m.stale_from;
    });
    var line1 = "";
    if (markets.length) {
      var ups   = markets.filter(function (m) { return m.change_pct > 0; }).sort(function (a, b) { return b.change_pct - a.change_pct; });
      var downs = markets.filter(function (m) { return m.change_pct < 0; }).sort(function (a, b) { return a.change_pct - b.change_pct; });
      var netChange = markets.reduce(function (s, m) { return s + m.change_pct; }, 0);
      var mood;
      if (netChange > 1.2)        mood = "Belle séance sur les marchés";
      else if (netChange > 0.2)   mood = "Marchés en légère progression";
      else if (netChange > -0.2)  mood = "Séance sans grand relief";
      else if (netChange > -1.2)  mood = "Marchés hésitants";
      else                        mood = "Séance rouge sur les marchés";

      var focus = downs.length && (!ups.length || Math.abs(downs[0].change_pct) >= ups[0].change_pct) ? downs[0] : ups[0];
      var counter = downs.length && ups.length
        ? (focus.change_pct < 0 ? ups[0] : downs[0])
        : null;

      var focusHtml = focus
        ? ' — <span class="accent">' + esc(focus.label) + '</span>' +
          ' <span class="' + (focus.change_pct >= 0 ? 'up' : 'down') + '">' +
          (focus.change_pct >= 0 ? '+' : '−') +
          Math.abs(focus.change_pct).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + '\u202f%</span>'
        : "";
      var counterHtml = counter
        ? ', tandis que ' + esc(counter.label) +
          ' <span class="' + (counter.change_pct >= 0 ? 'up' : 'down') + '">' +
          (counter.change_pct >= 0 ? '+' : '−') +
          Math.abs(counter.change_pct).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + '\u202f%</span>' +
          ' tient le cap'
        : "";
      line1 = mood + focusHtml + counterHtml + ".";
    } else {
      line1 = "Une matinée feutrée sur les places financières, en attente du premier signal.";
    }

    // === Ligne 2 : thème éditorial dominant ===
    var priorityCats = ["declarations", "actions", "crypto", "or", "immobilier"];
    var catLead = { declarations: "Sur le fil politique", actions: "Côté actions", crypto: "Dans l'univers crypto", or: "Sur le marché de l'or", immobilier: "Côté pierre" };
    var headline = null, headlineCat = null;
    for (var i = 0; i < priorityCats.length && !headline; i++) {
      var cat = priorityCats[i];
      var items = ((day.news && day.news[cat]) || [])
        .filter(function (it) { return !state.hidden.has(it.id); })
        .sort(byDateDesc);
      if (items.length) { headline = items[0]; headlineCat = cat; }
    }
    var line2;
    if (headline) {
      var title = String(headline.title || "").replace(/\s+-\s+[^-]+$/, "").trim();
      if (title.length > 150) title = title.slice(0, 147).replace(/\s+\S*$/, "") + "…";
      line2 = catLead[headlineCat] + ', <em>«&nbsp;' + esc(title) + '&nbsp;»</em>' +
        (headline.source ? ' — ' + esc(headline.source) : '') + '.';
    } else {
      line2 = "La chronique reste à écrire — les premiers signaux du jour arrivent.";
    }

    l1.innerHTML = line1;
    l2.innerHTML = line2;
    // Redémarrage des animations à chaque render
    [l1, l2].forEach(function (n) {
      n.style.animation = "none"; void n.offsetWidth; n.style.animation = "";
    });
    box.hidden = false;
  }

  /* ---------- Calcul de variation selon la période ---------- */
  var PERIOD_DAYS = { day: 1, week: 7, month: 30, year: 365 };
  var PERIOD_LABELS = { day: "Depuis hier", week: "Sur 7 jours", month: "Sur 30 jours", year: "Sur 1 an" };
  function computeChangeForPeriod(market, refDateISO) {
    if (state.marketPeriod === "day") {
      // Utiliser la variation Yahoo native, ou fallback depuis history
      if (market.change_pct != null) return { pct: market.change_pct, hasData: true };
    }
    if (market.price == null) return { pct: null, hasData: false };
    var hist = state.history && state.history[market.key];
    if (!hist || hist.length < 2) return { pct: null, hasData: false };
    var refTime = new Date((refDateISO || hist[hist.length - 1].date) + "T12:00:00Z").getTime();
    var daysBack = PERIOD_DAYS[state.marketPeriod] || 1;
    var thresholdMs = refTime - daysBack * 86400000;
    // Trouver le point le plus proche antérieur au seuil
    var earlier = null;
    for (var i = hist.length - 1; i >= 0; i--) {
      var dMs = new Date(hist[i].date + "T12:00:00Z").getTime();
      if (dMs <= thresholdMs) { earlier = hist[i]; break; }
    }
    if (!earlier) return { pct: null, hasData: false };
    var pct = ((market.price - earlier.price) / earlier.price) * 100;
    return { pct: Math.round(pct * 100) / 100, hasData: true, from: earlier };
  }

  /* ---------- Rendu : marchés (bento double-bezel) ---------- */
  function renderMarkets(day) {
    el.markets.innerHTML = "";
    if (!day || !day.markets) { el.markets.hidden = true; return; }
    var periodSwitcher = document.getElementById("period-switcher");
    if (periodSwitcher) periodSwitcher.hidden = false;
    day.markets.forEach(function (m, i) {
      var shell = document.createElement("div");
      shell.className = "m-shell reveal";
      shell.style.transitionDelay = (i * 0.07) + "s";
      var card = document.createElement("div");
      card.className = "market-card spot" + (m.ok || m.stale_from ? "" : " unavailable");

      // Calcul de la variation selon la période
      var change = computeChangeForPeriod(m, day.date);
      var cls = "flat", arrow = "→";
      if (change.pct != null && change.pct > 0) { cls = "up"; arrow = "▲"; }
      if (change.pct != null && change.pct < 0) { cls = "down"; arrow = "▼"; }
      var changeHtml;
      if (m.stale_from && state.marketPeriod === "day") {
        changeHtml = "dernier cours du " + fmtDateShort(m.stale_from);
        cls = "flat";
      } else if (change.pct == null) {
        changeHtml = "données insuffisantes";
        cls = "flat";
      } else {
        changeHtml = arrow + " " + Math.abs(change.pct).toLocaleString("fr-FR") + " %";
      }
      var parts = fmtPriceParts(m);
      var priceHtml = m.price == null
        ? '<div class="m-price"><span class="p-val">indisponible</span></div>'
        : '<div class="m-price"><span class="p-val">0</span><span class="cur">' + esc(parts.currency) + '</span></div>';
      var hint = state.marketPeriod !== "day"
        ? '<div class="m-period-hint">' + esc(PERIOD_LABELS[state.marketPeriod] || "") + '</div>'
        : '';
      card.innerHTML =
        '<div class="m-label">' + esc(m.label) + "</div>" +
        priceHtml +
        '<div class="m-change ' + cls + '">' + esc(changeHtml) + "</div>" +
        hint;

      // Count-up animé sur le prix
      if (m.price != null) {
        var pv = card.querySelector(".p-val");
        var start = 0.75 * m.price;
        setTimeout(function () {
          animateNumber(pv, start, m.price, { duration: 1400 });
        }, 200 + i * 90);
      }

      if (state.history && state.history[m.key]) {
        buildSparkline(card, state.history[m.key].slice(-30), m.currency);
      }

      // Clic sur une carte -> onglet de la catégorie correspondante
      if (CATEGORIES.indexOf(m.category) !== -1) {
        card.title = "Voir les actualités « " + m.label + " »";
        card.addEventListener("click", function () {
          state.category = m.category;
          render();
          document.getElementById("chapter-news").scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      shell.appendChild(card);
      el.markets.appendChild(shell);
    });
    el.markets.hidden = false;
    updatePeriodButtons();
    observeReveals();
  }

  function updatePeriodButtons() {
    var btns = document.querySelectorAll("#period-switcher .period-btn");
    // Vérifier disponibilité des données pour chaque période
    var histLens = {};
    if (state.latest && state.latest.days && state.latest.days[0]) {
      (state.latest.days[0].markets || []).forEach(function (m) {
        var h = state.history && state.history[m.key];
        histLens[m.key] = h ? h.length : 0;
      });
    }
    Array.prototype.forEach.call(btns, function (b) {
      b.classList.toggle("active", b.dataset.period === state.marketPeriod);
      // Désactiver si aucun cours n'a l'historique suffisant
      var needed = PERIOD_DAYS[b.dataset.period] || 1;
      if (b.dataset.period === "day") { b.disabled = false; return; }
      var anyEnough = Object.keys(histLens).some(function (k) { return histLens[k] >= needed; });
      b.disabled = !anyEnough;
      b.title = b.disabled ? "Historique encore incomplet pour cette période" : "";
    });
  }

  /* ---------- Squelettes de chargement ---------- */
  function renderSkeletons() {
    el.markets.innerHTML = "";
    for (var i = 0; i < 6; i++) {
      var sk = document.createElement("div");
      sk.className = "m-shell";
      sk.innerHTML = '<div class="skeleton sk-market"></div>';
      el.markets.appendChild(sk);
    }
    el.markets.hidden = false;
    el.days.innerHTML = "";
    for (var j = 0; j < 5; j++) {
      var row = document.createElement("div");
      row.className = "skeleton sk-row";
      el.days.appendChild(row);
    }
  }

  /* ---------- Révélation au défilement ---------- */
  var revealObserver = null;
  function observeReveals() {
    if (!("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(document.querySelectorAll(".reveal"), function (n) {
        n.classList.add("in");
      });
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            revealObserver.unobserve(entry.target);
          }
        });
      }, { rootMargin: "0px 0px -8% 0px" });
    }
    Array.prototype.forEach.call(document.querySelectorAll(".reveal:not(.in)"), function (n) {
      // Déjà visible à l'écran -> révélation immédiate, sans attendre l'observer
      if (n.getBoundingClientRect().top < window.innerHeight * 0.96) {
        requestAnimationFrame(function () { n.classList.add("in"); });
      } else {
        revealObserver.observe(n);
      }
    });
  }

  /* ---------- Rendu : jours ---------- */
  function currentDays() {
    if (state.view === "latest") return (state.latest && state.latest.days) || [];
    return (state.archiveData && state.archiveData.days) || [];
  }

  function makeNewsCard(it, opts) {
    opts = opts || {};
    var card = document.createElement("article");
    card.className = "news-card" + (opts.lead ? " lead" : "");
    var fresh = isFresh(it.published) ? '<span class="fresh" title="Publié il y a moins de 12 h"></span>' : "";
    var inner =
      (opts.lead ? '<div class="lead-kicker">' + esc(opts.kicker || "À la une") + "</div>" : "") +
      fresh +
      '<a href="' + esc(it.link) + '" target="_blank" rel="noopener">' + esc(it.title) + "</a>" +
      '<div class="news-meta">' +
      (it.source ? '<span class="src">' + esc(it.source) + "</span> · " : "") +
      '<time title="' + esc(fmtDateTime(it.published)) + '">' + esc(fmtRelative(it.published)) + "</time>" +
      ' · <code title="Identifiant pour la suppression définitive">' + esc(it.id) + "</code></div>" +
      '<button class="del-btn" title="Masquer cette information">✕</button>';
    card.innerHTML = opts.lead ? '<div class="lead-inner spot">' + inner + "</div>" : inner;
    card.querySelector(".del-btn").addEventListener("click", function () {
      card.classList.add("removing");
      setTimeout(function () {
        state.hidden.add(it.id);
        state.lastHidden = it.id;
        saveHidden();
        render();
        showToast("Info masquée sur ce navigateur.", true);
      }, 220);
    });
    return card;
  }

  function makeRubrique(day, r, idx, excludeId) {
    var items = visibleItems(day, r.cat).filter(function (it) { return it.id !== excludeId; });
    if (!items.length) return null;
    var rub = document.createElement("section");
    rub.className = "rub dossier";
    var rubKey = state.view + ":" + day.date + ":" + r.cat;
    if (state.rubClosed[rubKey]) rub.classList.add("closed");

    // Groupement en sous-catégories via le champ .query
    var groupsMap = {};
    var order = [];
    items.forEach(function (it) {
      var q = it.query || "Divers";
      if (!(q in groupsMap)) { groupsMap[q] = []; order.push(q); }
      groupsMap[q].push(it);
    });
    var subgroups = order.map(function (q) {
      return { query: q, label: prettyQueryLabel(q), items: groupsMap[q] };
    });
    // Trier les sous-groupes : d'abord ceux avec l'info la plus récente
    subgroups.sort(function (a, b) {
      var la = a.items[0].published || "";
      var lb = b.items[0].published || "";
      return lb.localeCompare(la);
    });

    var head = document.createElement("button");
    head.className = "rub-head spot";
    head.setAttribute("aria-expanded", state.rubClosed[rubKey] ? "false" : "true");
    head.innerHTML =
      '<span class="rub-num">' + ROMAN[idx] + "</span>" +
      '<span class="rub-name">' + esc(r.label) + "</span>" +
      '<span class="rub-line"></span>' +
      '<span class="rub-count">' + items.length + " chronique" + (items.length > 1 ? "s" : "") + "</span>" +
      '<span class="rub-chev">▾</span>';
    head.addEventListener("click", function () {
      state.rubClosed[rubKey] = !state.rubClosed[rubKey];
      rub.classList.toggle("closed");
      head.setAttribute("aria-expanded", state.rubClosed[rubKey] ? "false" : "true");
    });
    var body = document.createElement("div");
    body.className = "rub-body";
    var innerEl = document.createElement("div");
    innerEl.className = "rub-inner";

    // Rendu par sous-catégories si plusieurs, sinon liste plate
    if (subgroups.length > 1) {
      subgroups.forEach(function (sg) {
        var subEl = document.createElement("div");
        subEl.className = "subgroup";
        var subHead = document.createElement("div");
        subHead.className = "subgroup-head";
        subHead.innerHTML =
          '<span class="sub-dot"></span>' +
          '<span class="sub-name">' + esc(sg.label) + "</span>" +
          '<span class="sub-line"></span>' +
          '<span class="sub-count">' + sg.items.length + "</span>";
        var subList = document.createElement("div");
        subList.className = "subgroup-list";
        sg.items.forEach(function (it) { subList.appendChild(makeNewsCard(it)); });
        subEl.appendChild(subHead);
        subEl.appendChild(subList);
        innerEl.appendChild(subEl);
      });
    } else {
      items.forEach(function (it) { innerEl.appendChild(makeNewsCard(it)); });
    }

    body.appendChild(innerEl);
    rub.appendChild(head);
    rub.appendChild(body);
    return rub;
  }

  function renderDays(days) {
    el.days.innerHTML = "";
    if (!days || !days.length) {
      el.days.innerHTML = '<p class="empty-cat">Aucune donnée disponible pour le moment.</p>';
      return;
    }
    var isAll = state.category === "toutes";
    days.forEach(function (day) {
      var block = document.createElement("section");
      block.className = "day-block reveal";
      var collapseKey = state.view + ":" + day.date;
      if (state.collapsed[collapseKey]) block.classList.add("collapsed");

      // Contenu d'abord, pour connaître le nombre total d'infos du jour
      var content = document.createElement("div");
      content.className = "news-list";
      var total = 0;

      if (isAll) {
        var all = [];
        RUBRIQUES.forEach(function (r) {
          visibleItems(day, r.cat).forEach(function (it) {
            all.push({ it: it, label: r.label });
          });
        });
        total = all.length;
        if (total) {
          all.sort(function (a, b) { return byDateDesc(a.it, b.it); });
          var lead = all[0];
          content.appendChild(makeNewsCard(lead.it, { lead: true, kicker: "À la une · " + lead.label }));
          RUBRIQUES.forEach(function (r, idx) {
            var rub = makeRubrique(day, r, idx, lead.it.id);
            if (rub) content.appendChild(rub);
          });
        }
      } else {
        var items = visibleItems(day, state.category);
        total = items.length;
        items.forEach(function (it, i) {
          content.appendChild(makeNewsCard(it, i === 0 ? { lead: true } : {}));
        });
      }

      var title = document.createElement("h2");
      title.className = "day-title";
      var rel = state.view === "latest" ? dayLabel(day.date) : null;
      title.innerHTML =
        '<span class="chevron">▼</span>' +
        (rel ? rel + ' <span class="badge">' + esc(fmtDate(day.date)) + "</span>"
             : esc(fmtDate(day.date))) +
        ' <span class="n-items">' + total + " info(s)</span>";
      title.addEventListener("click", function () {
        state.collapsed[collapseKey] = !state.collapsed[collapseKey];
        block.classList.toggle("collapsed");
      });
      block.appendChild(title);

      if (!total) {
        var p = document.createElement("p");
        p.className = "empty-cat";
        p.textContent = state.query
          ? "Aucun résultat pour cette recherche ce jour-là."
          : "Aucune information dans cette catégorie pour ce jour.";
        block.appendChild(p);
      } else {
        block.appendChild(content);
      }
      el.days.appendChild(block);
    });
  }

  /* ---------- Rendu : sélecteur d'archives ---------- */
  function renderArchivePicker() {
    el.archivePicker.innerHTML = "";
    var months = (state.archiveIndex && state.archiveIndex.months) || [];
    if (!months.length) {
      el.archivePicker.innerHTML =
        '<span class="empty">Aucune archive pour le moment — les jours de plus de 3 jours seront archivés ici automatiquement.</span>';
      return;
    }
    months.forEach(function (m) {
      var btn = document.createElement("button");
      btn.className = "month-btn" + (m.month === state.archiveMonth ? " active" : "");
      var d = new Date(m.month + "-15T12:00:00");
      btn.textContent = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) +
        " (" + m.days + " j)";
      btn.addEventListener("click", function () { loadArchiveMonth(m.month); });
      el.archivePicker.appendChild(btn);
    });
  }

  /* ---------- Rendu global ---------- */
  function render() {
    applyDaysView();
    el.btnLatest.classList.toggle("active", state.view === "latest");
    el.btnArchive.classList.toggle("active", state.view === "archive");
    el.archivePicker.hidden = state.view !== "archive";
    el.toolbar.hidden = false;

    var days = currentDays();

    Array.prototype.forEach.call(el.tabs.querySelectorAll(".tab"), function (t) {
      t.classList.toggle("active", t.dataset.cat === state.category);
      var n = 0;
      var cats = t.dataset.cat === "toutes" ? CATEGORIES : [t.dataset.cat];
      days.forEach(function (d) {
        cats.forEach(function (c) { n += visibleItems(d, c).length; });
      });
      t.querySelector(".count").textContent = n ? String(n) : "";
    });

    var hiddenN = state.hidden.size;
    el.hiddenCount.textContent = hiddenN ? "(" + hiddenN + " info(s) masquée(s))" : "";

    renderEdition(days);
    if (state.view === "latest") {
      renderTicker(days[0]);
      renderMarkets(days[0]);
      renderDays(days);
    } else {
      el.ticker.hidden = true;
      renderArchivePicker();
      if (state.archiveData) {
        el.markets.hidden = true;
        renderDays(days);
      } else {
        el.markets.hidden = true;
        el.days.innerHTML = '<p class="empty-cat">Choisissez un mois ci-dessus pour consulter les archives.</p>';
      }
    }
    observeReveals();
  }

  /* ---------- Chargement ---------- */
  function loadLatest() {
    renderSkeletons();
    fetchJSON("data/latest.json")
      .then(function (data) {
        (data.days || []).forEach(normalizeDay);
        state.latest = data;
        el.status.hidden = true;
        el.generatedAt.textContent = fmtDateTime(data.generated_at);
        render();
        loadHistory();
      })
      .catch(function (err) {
        el.markets.hidden = true;
        el.days.innerHTML = "";
        el.status.hidden = false;
        el.status.textContent =
          "Impossible de charger les données (" + err.message + "). " +
          "La première mise à jour automatique n'a peut-être pas encore eu lieu.";
      });
  }

  function loadArchiveIndex() {
    return fetchJSON("data/archive/index.json")
      .then(function (idx) { state.archiveIndex = idx; })
      .catch(function () { state.archiveIndex = { months: [] }; });
  }

  function loadArchiveMonth(month) {
    state.archiveMonth = month;
    state.archiveData = null;
    render();
    fetchJSON("data/archive/" + month + ".json")
      .then(function (data) {
        (data.days || []).forEach(normalizeDay);
        state.archiveData = data;
        render();
      })
      .catch(function () {
        el.days.innerHTML = '<p class="empty-cat">Impossible de charger ce mois d\'archive.</p>';
      });
  }

  /* ---------- Événements ---------- */
  el.btnLatest.addEventListener("click", function () {
    state.view = "latest";
    render();
  });
  el.btnArchive.addEventListener("click", function () {
    state.view = "archive";
    loadArchiveIndex().then(render);
  });

  el.tabs.addEventListener("click", function (e) {
    var btn = e.target.closest(".tab");
    if (!btn) return;
    state.category = btn.dataset.cat;
    render();
  });

  // Sélecteur de vue (Liste / Magazine / Mosaïque)
  var viewSwitcher = document.getElementById("view-switcher");
  if (viewSwitcher) {
    viewSwitcher.addEventListener("click", function (e) {
      var btn = e.target.closest(".view-btn");
      if (!btn) return;
      var v = btn.dataset.view;
      if (v !== "list" && v !== "magazine" && v !== "mosaic") return;
      state.daysView = v;
      saveDaysView();
      render();
      // Petit feedback tactile
      var days = document.getElementById("days");
      if (days) {
        days.style.animation = "none"; void days.offsetWidth;
        days.style.animation = "brf-in 0.5s var(--ease-out) both";
      }
    });
  }

  // Sélecteur de période (Marchés)
  var periodSwitcher = document.getElementById("period-switcher");
  if (periodSwitcher) {
    periodSwitcher.addEventListener("click", function (e) {
      var btn = e.target.closest(".period-btn");
      if (!btn || btn.disabled) return;
      var p = btn.dataset.period;
      if (["day", "week", "month", "year"].indexOf(p) === -1) return;
      state.marketPeriod = p;
      saveMarketPeriod();
      // Re-rendu des marchés uniquement
      var day = state.view === "latest"
        ? (state.latest && state.latest.days && state.latest.days[0])
        : null;
      if (day) renderMarkets(day);
    });
  }

  var searchTimer = null;
  el.search.addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.query = el.search.value.trim().toLowerCase();
      render();
    }, 150);
  });

  el.btnEdit.addEventListener("click", function () {
    document.body.classList.add("edit-mode");
    el.editBar.hidden = false;
  });
  document.getElementById("btn-close-edit").addEventListener("click", function () {
    document.body.classList.remove("edit-mode");
    el.editBar.hidden = true;
  });
  document.getElementById("btn-restore").addEventListener("click", function () {
    state.hidden.clear();
    saveHidden();
    render();
    showToast("Toutes les infos masquées ont été restaurées.", false);
  });
  document.getElementById("btn-permanent").addEventListener("click", function () {
    el.idsBox.value = Array.from(state.hidden).join(",");
    el.modal.hidden = false;
  });
  document.getElementById("btn-close-modal").addEventListener("click", function () {
    el.modal.hidden = true;
  });
  document.getElementById("btn-copy-ids").addEventListener("click", function () {
    el.idsBox.select();
    try { navigator.clipboard.writeText(el.idsBox.value); } catch (e) { document.execCommand("copy"); }
    showToast("Identifiants copiés dans le presse-papier.", false);
  });
  el.modal.addEventListener("click", function (e) {
    if (e.target === el.modal) el.modal.hidden = true;
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") el.modal.hidden = true;
  });

  // Halo doré qui suit le curseur sur les surfaces marquées .spot
  function trackSpotlight(container) {
    container.addEventListener("pointermove", function (e) {
      var s = e.target.closest(".spot");
      if (!s) return;
      var r = s.getBoundingClientRect();
      s.style.setProperty("--mx", (e.clientX - r.left) + "px");
      s.style.setProperty("--my", (e.clientY - r.top) + "px");
    });
  }
  trackSpotlight(el.markets);
  trackSpotlight(el.days);

  var progressEl = document.getElementById("progress");
  var scrollScheduled = false;

  /* ---------- Effet cinéma au scroll : poussière d'or + parallaxe + rail ---------- */
  var scrollFx = (function () {
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var canvas = document.getElementById("scroll-canvas");
    if (!canvas || reduced) return { onScroll: function () {} };

    var ctx = canvas.getContext("2d");
    var dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    var W = 0, H = 0;
    function resize() {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    var particles = [];
    var lastY = window.scrollY;
    var lastT = performance.now();
    var velocity = 0; // px / ms
    var idleTimer = null;
    var scrolling = false;
    var aurora = document.querySelectorAll(".aurora-blob");
    var rail = document.querySelector(".ink-rail");

    function emit(count, direction) {
      for (var i = 0; i < count; i++) {
        // Émission depuis les côtés vers l'intérieur, hauteur variable
        var side = Math.random() < 0.5 ? 0 : 1;
        var x = side === 0 ? Math.random() * 60 : W - Math.random() * 60;
        var y = Math.random() * H;
        particles.push({
          x: x,
          y: y,
          vx: (side === 0 ? 1 : -1) * (0.4 + Math.random() * 0.9),
          vy: direction * (1.2 + Math.random() * 2.2) + (Math.random() - 0.5) * 0.6,
          life: 1,
          decay: 0.006 + Math.random() * 0.008,
          size: 0.7 + Math.random() * 1.9,
          hue: 42 + Math.random() * 14  // dorés variés
        });
      }
      // Limite mémoire
      if (particles.length > 220) particles.splice(0, particles.length - 220);
    }

    function tick() {
      // Effacer avec un léger flou (trainées)
      ctx.clearRect(0, 0, W, H);
      for (var i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.02; // gravité légère
        p.life -= p.decay;
        if (p.life <= 0 || p.y > H + 20 || p.y < -20) { particles.splice(i, 1); continue; }
        var alpha = Math.max(0, p.life) * 0.9;
        ctx.beginPath();
        ctx.fillStyle = "hsla(" + p.hue + ", 78%, 68%, " + alpha + ")";
        ctx.shadowColor = "hsla(" + p.hue + ", 80%, 72%, " + (alpha * 0.9) + ")";
        ctx.shadowBlur = 10;
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      if (particles.length) requestAnimationFrame(tick);
    }

    function onScroll() {
      var now = performance.now();
      var y = window.scrollY;
      var dt = Math.max(1, now - lastT);
      velocity = (y - lastY) / dt;
      lastY = y; lastT = now;

      // Parallaxe aurore : décalage inverse subtil selon la profondeur
      // (via propriété `translate` pour ne pas écraser l'animation `transform`)
      if (aurora.length) {
        aurora[0].style.translate = (y * -0.02) + "px " + (y * 0.08) + "px";
        if (aurora[1]) aurora[1].style.translate = (y * 0.04) + "px " + (y * -0.05) + "px";
        if (aurora[2]) aurora[2].style.translate = (y * -0.03) + "px " + (y * 0.06) + "px";
      }

      // Filet d'encre : goutte dorée qui suit la position
      if (rail) {
        var progress = Math.min(1, Math.max(0, y / Math.max(1, document.documentElement.scrollHeight - H)));
        rail.style.setProperty("--ink-y", (progress * (H - 60)) + "px");
      }

      // Poussière d'or : émission proportionnelle à la vitesse
      var speed = Math.abs(velocity);
      if (speed > 0.3) {
        var count = Math.min(6, Math.floor(speed * 3));
        var direction = velocity > 0 ? 1 : -1;
        emit(count, direction);
        if (particles.length && !tickScheduled) { tickScheduled = true; requestAnimationFrame(function () { tickScheduled = false; tick(); }); }
      }

      // État "scrolling" pour révéler le rail
      if (!scrolling) {
        scrolling = true;
        document.body.classList.add("scrolling");
      }
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function () {
        scrolling = false;
        document.body.classList.remove("scrolling");
      }, 900);
    }
    var tickScheduled = false;

    return { onScroll: onScroll };
  })();

  window.addEventListener("scroll", function () {
    if (scrollScheduled) return;
    scrollScheduled = true;
    requestAnimationFrame(function () {
      scrollScheduled = false;
      el.btnTop.hidden = window.scrollY < 400;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      progressEl.style.transform = "scaleX(" + (max > 0 ? window.scrollY / max : 0) + ")";
      scrollFx.onScroll();
    });
  }, { passive: true });
  el.btnTop.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // Lien vers le workflow de suppression (déduit de l'URL GitHub Pages si possible)
  (function () {
    var link = document.getElementById("delete-workflow-link");
    var m = location.hostname.match(/^([^.]+)\.github\.io$/);
    var repo = location.pathname.split("/")[1] || "";
    if (m && repo) {
      link.href = "https://github.com/" + m[1] + "/" + repo + "/actions/workflows/delete.yml";
    } else {
      link.href = "https://github.com/mdbp59r2dy-hash/site-economique/actions/workflows/delete.yml";
    }
  })();

  /* ---------- Assistant IA (chat drawer) ---------- */
  (function () {
    var btnChat = document.getElementById("btn-chat");
    var drawer = document.getElementById("chat-drawer");
    var backdrop = document.getElementById("chat-backdrop");
    var closeBtn = document.getElementById("btn-chat-close");
    var body = document.getElementById("chat-body");
    var form = document.getElementById("chat-form");
    var input = document.getElementById("chat-input");
    var configBox = document.getElementById("chat-config");
    var endpointInput = document.getElementById("chat-endpoint");
    var saveBtn = document.getElementById("btn-save-endpoint");
    var clearBtn = document.getElementById("btn-clear-chat");
    var intro = body ? body.querySelector(".chat-intro") : null;
    if (!btnChat || !drawer) return;

    function getEndpoint() { return (localStorage.getItem(CHAT_ENDPOINT_KEY) || "").trim(); }
    function setEndpoint(v) { localStorage.setItem(CHAT_ENDPOINT_KEY, v.trim()); }

    /* --- Mémoire persistante (5 dernières Q/R) --- */
    function loadChatHistory() {
      try {
        var arr = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || "[]");
        return Array.isArray(arr) ? arr : [];
      } catch (e) { return []; }
    }
    function saveChatHistory(history) {
      // Garder au plus 2 * CHAT_HISTORY_MAX_PAIRS messages
      var trimmed = history.slice(-CHAT_HISTORY_MAX_PAIRS * 2);
      localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(trimmed));
    }
    function pushHistory(role, text) {
      var h = loadChatHistory();
      h.push({ role: role, text: text, ts: Date.now() });
      saveChatHistory(h);
    }
    function clearHistory() {
      localStorage.removeItem(CHAT_HISTORY_KEY);
      // Retirer les messages du DOM
      Array.prototype.forEach.call(body.querySelectorAll(".chat-msg"), function (n) { n.remove(); });
      updateHistoryControls();
      if (intro) intro.style.display = "";
    }
    function updateHistoryControls() {
      if (!clearBtn) return;
      var h = loadChatHistory();
      clearBtn.hidden = h.length === 0;
    }

    function renderHistoryToDom() {
      // Restaurer les messages sauvegardés
      var h = loadChatHistory();
      // Retirer messages précédents (garder l'intro)
      Array.prototype.forEach.call(body.querySelectorAll(".chat-msg"), function (n) { n.remove(); });
      if (h.length && intro) intro.style.display = "none";
      h.forEach(function (m) { renderMsg(m.role, m.text); });
      updateHistoryControls();
      // Scroll bottom
      body.scrollTop = body.scrollHeight;
    }

    function open() {
      document.body.classList.add("chat-open");
      drawer.hidden = false;
      backdrop.hidden = false;
      if (!getEndpoint()) { configBox.hidden = false; endpointInput.value = ""; }
      renderHistoryToDom();
      setTimeout(function () { input.focus(); }, 300);
    }
    function close() {
      document.body.classList.remove("chat-open");
      setTimeout(function () { drawer.hidden = true; backdrop.hidden = true; }, 500);
    }
    btnChat.addEventListener("click", open);
    closeBtn.addEventListener("click", close);
    backdrop.addEventListener("click", close);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && document.body.classList.contains("chat-open")) close();
    });
    if (clearBtn) clearBtn.addEventListener("click", clearHistory);

    saveBtn.addEventListener("click", function () {
      var v = endpointInput.value.trim();
      if (!/^https?:\/\//.test(v)) {
        endpointInput.style.borderColor = "var(--down)";
        return;
      }
      setEndpoint(v);
      configBox.hidden = true;
      var msg = "Connexion établie. Posez-moi votre question quand vous voulez.";
      renderMsg("assistant", msg);
    });

    document.querySelectorAll(".chat-sug").forEach(function (b) {
      b.addEventListener("click", function () {
        input.value = b.dataset.q || b.textContent;
        form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      });
    });

    function renderMsg(role, text) {
      // Cacher l'intro dès qu'il y a une conversation
      if (intro && !intro.style.display) intro.style.display = "none";
      var node = document.createElement("div");
      node.className = "chat-msg " + role;
      if (role === "assistant") {
        var label = document.createElement("span");
        label.className = "msg-label";
        label.textContent = "L'oracle";
        node.appendChild(label);
        node.appendChild(document.createTextNode(text));
      } else {
        node.textContent = text;
      }
      body.appendChild(node);
      body.scrollTop = body.scrollHeight;
      return node;
    }

    function buildContext() {
      var day = (state.latest && state.latest.days && state.latest.days[0]) || null;
      if (!day) return "Aucune édition disponible.";
      var lines = ["Édition du " + day.date + ".", ""];
      if (day.briefing) {
        lines.push("Éditorial du matin :", "- " + day.briefing.line1, "- " + day.briefing.line2, "");
      }
      lines.push("Marchés :");
      (day.markets || []).forEach(function (m) {
        if (m.price == null) return;
        var cur = m.currency === "EUR" ? "€" : "$";
        var chg = m.change_pct != null ? " (" + (m.change_pct >= 0 ? "+" : "") + m.change_pct + " %)" : "";
        lines.push("- " + m.label + " : " + m.price.toLocaleString("fr-FR") + " " + cur + chg);
      });
      lines.push("", "Chroniques du jour (titres) :");
      CATEGORIES.forEach(function (c) {
        var items = ((day.news && day.news[c]) || []).slice(0, 5);
        if (!items.length) return;
        lines.push("• " + c + " :");
        items.forEach(function (it) {
          lines.push("  - " + it.title + (it.source ? " — " + it.source : ""));
        });
      });
      return lines.join("\n");
    }

    function buildMessagesPayload(newQuestion) {
      var h = loadChatHistory();
      var msgs = h.map(function (m) { return { role: m.role, content: m.text }; });
      msgs.push({ role: "user", content: newQuestion });
      // Garder max 10 messages (5 paires) + le nouveau = 11 max, mais on limite à 10 exactement
      if (msgs.length > CHAT_HISTORY_MAX_PAIRS * 2 + 1) {
        msgs = msgs.slice(-(CHAT_HISTORY_MAX_PAIRS * 2 + 1));
      }
      return msgs;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var q = input.value.trim();
      if (!q) return;
      var ep = getEndpoint();
      if (!ep) { configBox.hidden = false; endpointInput.focus(); return; }
      renderMsg("user", q);
      pushHistory("user", q);
      updateHistoryControls();
      input.value = "";
      var thinking = renderMsg("assistant", "");
      thinking.classList.add("thinking");
      thinking.innerHTML = "L'oracle rédige";

      fetch(ep, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q, // fallback pour anciens workers
          context: buildContext(),
          messages: buildMessagesPayload(q)
        })
      }).then(function (r) {
        return r.json().then(function (d) { return { ok: r.ok, data: d }; });
      }).then(function (res) {
        thinking.remove();
        if (!res.ok) throw new Error((res.data && res.data.error) || "Erreur " + res.ok);
        var answer = (res.data && (res.data.answer || res.data.text)) || "Je n'ai pas pu formuler de réponse.";
        renderMsg("assistant", answer);
        pushHistory("assistant", answer);
        updateHistoryControls();
      }).catch(function (err) {
        thinking.remove();
        var msg = document.createElement("div");
        msg.className = "chat-msg error";
        msg.textContent = "Impossible de joindre l'oracle : " + err.message + ". Vérifiez l'URL de votre worker dans les paramètres.";
        body.appendChild(msg);
        configBox.hidden = false;
        endpointInput.value = ep;
        body.scrollTop = body.scrollHeight;
      });
    });
  })();

  loadLatest();
})();
