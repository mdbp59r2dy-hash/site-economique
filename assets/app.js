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
  var HIDDEN_KEY = "pulse-eco-hidden-ids";
  var THEME_KEY = "pulse-eco-theme";

  var state = {
    view: "latest", // "latest" | "archive"
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
        (monthFiles || []).forEach(function (mf) { all = all.concat(mf.days || []); });
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
    el.edition.hidden = false;
  }

  /* ---------- Rendu : marchés (bento double-bezel) ---------- */
  function renderMarkets(day) {
    el.markets.innerHTML = "";
    if (!day || !day.markets) { el.markets.hidden = true; return; }
    day.markets.forEach(function (m, i) {
      var shell = document.createElement("div");
      shell.className = "m-shell reveal";
      shell.style.transitionDelay = (i * 0.07) + "s";
      var card = document.createElement("div");
      card.className = "market-card spot" + (m.ok || m.stale_from ? "" : " unavailable");
      var cls = "flat", arrow = "→";
      if (m.change_pct > 0) { cls = "up"; arrow = "▲"; }
      if (m.change_pct < 0) { cls = "down"; arrow = "▼"; }
      var changeHtml;
      if (m.stale_from) {
        changeHtml = "dernier cours du " + fmtDateShort(m.stale_from);
        cls = "flat";
      } else if (m.change_pct == null) {
        changeHtml = "—";
      } else {
        changeHtml = arrow + " " + Math.abs(m.change_pct).toLocaleString("fr-FR") + " %";
      }
      var parts = fmtPriceParts(m);
      var priceHtml = m.price == null
        ? '<div class="m-price"><span class="p-val">indisponible</span></div>'
        : '<div class="m-price"><span class="p-val">0</span><span class="cur">' + esc(parts.currency) + '</span></div>';
      card.innerHTML =
        '<div class="m-label">' + esc(m.label) + "</div>" +
        priceHtml +
        '<div class="m-change ' + cls + '">' + esc(changeHtml) + "</div>";

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
    observeReveals();
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
    rub.className = "rub";
    var rubKey = state.view + ":" + day.date + ":" + r.cat;
    if (state.rubClosed[rubKey]) rub.classList.add("closed");
    var head = document.createElement("button");
    head.className = "rub-head spot";
    head.setAttribute("aria-expanded", state.rubClosed[rubKey] ? "false" : "true");
    head.innerHTML =
      '<span class="rub-num">' + ROMAN[idx] + "</span>" +
      '<span class="rub-name">' + esc(r.label) + "</span>" +
      '<span class="rub-line"></span>' +
      '<span class="rub-count">' + items.length + "</span>" +
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
    items.forEach(function (it) { innerEl.appendChild(makeNewsCard(it)); });
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
      .then(function (data) { state.archiveData = data; render(); })
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
  window.addEventListener("scroll", function () {
    if (scrollScheduled) return;
    scrollScheduled = true;
    requestAnimationFrame(function () {
      scrollScheduled = false;
      el.btnTop.hidden = window.scrollY < 400;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      progressEl.style.transform = "scaleX(" + (max > 0 ? window.scrollY / max : 0) + ")";
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

  loadLatest();
})();
