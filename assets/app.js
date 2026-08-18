/* Pulse Éco — logique du site (aucune dépendance externe). */
(function () {
  "use strict";

  var CATEGORIES = ["declarations", "actions", "immobilier", "or", "crypto"];
  var HIDDEN_KEY = "pulse-eco-hidden-ids";

  var state = {
    view: "latest", // "latest" | "archive"
    category: "declarations",
    latest: null,
    archiveIndex: null,
    archiveMonth: null,
    archiveData: null,
    hidden: loadHidden()
  };

  var el = {
    status: document.getElementById("status"),
    markets: document.getElementById("markets"),
    tabs: document.getElementById("tabs"),
    days: document.getElementById("days"),
    editBar: document.getElementById("edit-bar"),
    hiddenCount: document.getElementById("hidden-count"),
    archivePicker: document.getElementById("archive-picker"),
    modal: document.getElementById("modal"),
    idsBox: document.getElementById("ids-box"),
    generatedAt: document.getElementById("generated-at"),
    btnLatest: document.getElementById("btn-view-latest"),
    btnArchive: document.getElementById("btn-view-archive"),
    btnEdit: document.getElementById("btn-edit-mode")
  };

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
  function fmtDate(iso) {
    var d = new Date(iso + "T12:00:00Z");
    return d.toLocaleDateString("fr-FR", {
      weekday: "long", day: "numeric", month: "long", year: "numeric"
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

  /* ---------- Rendu : marchés ---------- */
  function renderMarkets(day) {
    el.markets.innerHTML = "";
    if (!day || !day.markets) { el.markets.hidden = true; return; }
    day.markets.forEach(function (m) {
      var card = document.createElement("div");
      card.className = "market-card" + (m.ok ? "" : " unavailable");
      var cls = "flat", arrow = "→";
      if (m.change_pct > 0) { cls = "up"; arrow = "▲"; }
      if (m.change_pct < 0) { cls = "down"; arrow = "▼"; }
      card.innerHTML =
        '<div class="m-label">' + esc(m.label) + "</div>" +
        '<div class="m-price">' + esc(fmtPrice(m)) + "</div>" +
        '<div class="m-change ' + cls + '">' +
        (m.change_pct == null ? "—" : arrow + " " + Math.abs(m.change_pct).toLocaleString("fr-FR") + " %") +
        "</div>";
      el.markets.appendChild(card);
    });
    el.markets.hidden = false;
  }

  function esc(s) {
    var div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }

  /* ---------- Rendu : jours ---------- */
  function renderDays(days) {
    el.days.innerHTML = "";
    if (!days || !days.length) {
      el.days.innerHTML = '<p class="empty-cat">Aucune donnée disponible pour le moment.</p>';
      return;
    }
    days.forEach(function (day) {
      var block = document.createElement("section");
      block.className = "day-block";

      var title = document.createElement("h2");
      title.className = "day-title";
      var rel = state.view === "latest" ? dayLabel(day.date) : null;
      title.innerHTML = (rel ? rel + ' <span class="badge">' + esc(fmtDate(day.date)) + "</span>"
                             : esc(fmtDate(day.date)));
      block.appendChild(title);

      var items = (day.news && day.news[state.category]) || [];
      items = items.filter(function (it) { return !state.hidden.has(it.id); });

      if (!items.length) {
        var p = document.createElement("p");
        p.className = "empty-cat";
        p.textContent = "Aucune information dans cette catégorie pour ce jour.";
        block.appendChild(p);
      } else {
        var list = document.createElement("div");
        list.className = "news-list";
        items.forEach(function (it) {
          var card = document.createElement("article");
          card.className = "news-card";
          card.dataset.id = it.id;
          card.innerHTML =
            '<a href="' + esc(it.link) + '" target="_blank" rel="noopener">' + esc(it.title) + "</a>" +
            '<div class="news-meta">' +
            (it.source ? esc(it.source) + " · " : "") + esc(fmtDateTime(it.published)) +
            ' · <code title="Identifiant pour la suppression définitive">' + esc(it.id) + "</code></div>" +
            '<button class="del-btn" title="Masquer cette information">✕</button>';
          card.querySelector(".del-btn").addEventListener("click", function () {
            state.hidden.add(it.id);
            saveHidden();
            render();
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
    el.tabs.hidden = false;

    Array.prototype.forEach.call(el.tabs.querySelectorAll(".tab"), function (t) {
      t.classList.toggle("active", t.dataset.cat === state.category);
    });

    var n = state.hidden.size;
    el.hiddenCount.textContent = n ? "(" + n + " info(s) masquée(s))" : "";

    if (state.view === "latest") {
      var days = (state.latest && state.latest.days) || [];
      renderMarkets(days[0]);
      renderDays(days);
    } else {
      renderArchivePicker();
      if (state.archiveData) {
        renderMarkets(null);
        renderDays(state.archiveData.days);
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
  });
  el.modal.addEventListener("click", function (e) {
    if (e.target === el.modal) el.modal.hidden = true;
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
