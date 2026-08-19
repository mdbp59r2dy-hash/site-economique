/* Pulse Éco — logique du site (aucune dépendance externe). */
(function () {
  "use strict";

  var CATEGORIES = ["declarations", "actions", "immobilier", "or", "crypto"];
  var HIDDEN_KEY = "pulse-eco-hidden-ids";
  var THEME_KEY = "pulse-eco-theme";

  var state = {
    view: "latest", // "latest" | "archive"
    category: "declarations",
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
  function visibleItems(day, category) {
    var items = (day.news && day.news[category]) || [];
    return items.filter(function (it) {
      return !state.hidden.has(it.id) && matchesQuery(it);
    });
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
    line.setAttribute("stroke", trend);
    line.setAttribute("points", coords.map(function (c) { return c.join(","); }).join(" "));
    svg.appendChild(line);

    var dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("class", "spark-dot");
    dot.setAttribute("fill", trend);
    dot.setAttribute("cx", coords[coords.length - 1][0]);
    dot.setAttribute("cy", coords[coords.length - 1][1]);
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
    el.toolbar.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  function renderEdition(days) {
    var day = days[0];
    if (state.view !== "latest" || !day) { el.edition.hidden = true; return; }
    el.editionDate.textContent = fmtDate(day.date);
    var nNews = 0;
    CATEGORIES.forEach(function (c) { nNews += ((day.news && day.news[c]) || []).length; });
    var nMarkets = (day.markets || []).filter(function (m) { return m.price != null; }).length;
    el.editionMeta.innerHTML =
      esc(nNews + " informations") + '<span class="sep">·</span>' +
      esc(nMarkets + " marchés suivis") + '<span class="sep">·</span>' +
      esc("mise à jour " + fmtDateTime(day.updated_at));
    el.edition.hidden = false;
  }

  /* ---------- Rendu : marchés ---------- */
  function renderMarkets(day) {
    el.markets.innerHTML = "";
    if (!day || !day.markets) { el.markets.hidden = true; return; }
    day.markets.forEach(function (m, i) {
      var card = document.createElement("div");
      card.className = "market-card" + (m.ok || m.stale_from ? "" : " unavailable");
      card.style.animationDelay = (i * 0.05) + "s";
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
      card.innerHTML =
        '<div class="m-label">' + esc(m.label) + "</div>" +
        '<div class="m-price">' + esc(fmtPrice(m)) + "</div>" +
        '<div class="m-change ' + cls + '">' + esc(changeHtml) + "</div>";

      if (state.history && state.history[m.key]) {
        buildSparkline(card, state.history[m.key].slice(-30), m.currency);
      }

      // Clic sur une carte -> onglet de la catégorie correspondante
      if (CATEGORIES.indexOf(m.category) !== -1) {
        card.title = "Voir les actualités « " + m.label + " »";
        card.addEventListener("click", function () {
          state.category = m.category;
          render();
          el.toolbar.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      el.markets.appendChild(card);
    });
    el.markets.hidden = false;
  }

  /* ---------- Rendu : jours ---------- */
  function currentDays() {
    if (state.view === "latest") return (state.latest && state.latest.days) || [];
    return (state.archiveData && state.archiveData.days) || [];
  }

  function renderDays(days) {
    el.days.innerHTML = "";
    if (!days || !days.length) {
      el.days.innerHTML = '<p class="empty-cat">Aucune donnée disponible pour le moment.</p>';
      return;
    }
    days.forEach(function (day) {
      var block = document.createElement("section");
      block.className = "day-block";
      var collapseKey = state.view + ":" + day.date;
      if (state.collapsed[collapseKey]) block.classList.add("collapsed");

      var items = visibleItems(day, state.category);

      var title = document.createElement("h2");
      title.className = "day-title";
      var rel = state.view === "latest" ? dayLabel(day.date) : null;
      title.innerHTML =
        '<span class="chevron">▼</span>' +
        (rel ? rel + ' <span class="badge">' + esc(fmtDate(day.date)) + "</span>"
             : esc(fmtDate(day.date))) +
        ' <span class="n-items">' + items.length + " info(s)</span>";
      title.addEventListener("click", function () {
        state.collapsed[collapseKey] = !state.collapsed[collapseKey];
        block.classList.toggle("collapsed");
      });
      block.appendChild(title);

      if (!items.length) {
        var p = document.createElement("p");
        p.className = "empty-cat";
        p.textContent = state.query
          ? "Aucun résultat pour cette recherche ce jour-là."
          : "Aucune information dans cette catégorie pour ce jour.";
        block.appendChild(p);
      } else {
        var list = document.createElement("div");
        list.className = "news-list";
        items.forEach(function (it, i) {
          var card = document.createElement("article");
          card.className = "news-card";
          card.style.animationDelay = (Math.min(i, 10) * 0.03) + "s";
          card.innerHTML =
            '<a href="' + esc(it.link) + '" target="_blank" rel="noopener">' + esc(it.title) + "</a>" +
            '<div class="news-meta">' +
            (it.source ? '<span class="src">' + esc(it.source) + "</span> · " : "") + esc(fmtDateTime(it.published)) +
            ' · <code title="Identifiant pour la suppression définitive">' + esc(it.id) + "</code></div>" +
            '<button class="del-btn" title="Masquer cette information">✕</button>';
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
          list.appendChild(card);
        });
        block.appendChild(list);
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
      days.forEach(function (d) { n += visibleItems(d, t.dataset.cat).length; });
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
  }

  /* ---------- Chargement ---------- */
  function loadLatest() {
    el.status.textContent = "Chargement des données…";
    fetchJSON("data/latest.json")
      .then(function (data) {
        state.latest = data;
        el.status.hidden = true;
        el.generatedAt.textContent = fmtDateTime(data.generated_at);
        render();
        loadHistory();
      })
      .catch(function (err) {
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

  window.addEventListener("scroll", function () {
    el.btnTop.hidden = window.scrollY < 400;
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
