/* ==========================================================================
   Pantalla de televisores: recibe el estado de la terminal por SSE / polling
   y muestra el mercado en grande, sin controles de edición.
   ========================================================================== */
(function () {
  'use strict';

  var D = window.SernovaData;
  var C = window.SernovaChart;
  var Sync = window.SernovaSync;

  var current = null;
  var source = 'local';
  var focusIndex = 0;
  var rotateTimer = null;
  var bannerTimer = null;
  var lastEventTs = { crash: 0, rally: 0 };
  var eventBaselineReady = false;

  function $(id) { return document.getElementById(id); }
  function esc(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function arrow(dir) { return dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■'; }
  function dirClass(dir) { return dir === 'up' ? 'up' : dir === 'down' ? 'down' : 'flat'; }

  function changeOf(market) {
    if (!market) return { dir: 'flat', pct: 0 };
    var h = market.history || [];
    var last = h[h.length - 1];
    if (!last || h.length < 2) return { dir: 'flat', pct: 0 };
    var prev = h[h.length - 2].price;
    return { dir: last.dir, pct: prev ? (last.price - prev) / prev * 100 : 0 };
  }

  function nameOf(id) {
    var d = D.byId(id);
    if (d) return d.name;
    var entries = (current && current.entries) || [];
    for (var i = entries.length - 1; i >= 0; i--) if (entries[i].drinkId === id) return entries[i].name;
    return id;
  }

  function computeStats(s) {
    var total = 0, units = 0, ops = 0, ups = 0, downs = 0;
    var counts = {};
    s.entries.forEach(function (e) {
      total += e.subtotal; units += e.qty; ops++;
      counts[e.drinkId] = (counts[e.drinkId] || 0) + e.qty;
    });
    Object.keys(s.market).forEach(function (id) {
      (s.market[id].history || []).forEach(function (h) {
        if (h.synthetic) return;
        if (h.dir === 'up') ups++; else if (h.dir === 'down') downs++;
      });
    });
    return { total: total, units: units, ops: ops, ups: ups, downs: downs, counts: counts, avg: units ? total / units : 0 };
  }

  function demandOf(s, id) {
    var from = Date.now() - 4 * 60 * 1000;
    var units = 0;
    s.entries.forEach(function (e) { if (e.drinkId === id && e.ts >= from) units += e.qty; });
    return units;
  }

  /* ------------------------------------------------------------ recibir */

  function applyState(s, src) {
    if (!s || !s.market || !s.entries) {
      $('tv-waiting').hidden = false;
      return;
    }
    if (src !== 'sse' && current && s.updatedAt && current.updatedAt && s.updatedAt < current.updatedAt) return;
    current = s;
    if (src === 'sse' || source !== 'sse') source = src || 'local';
    D.applyCatalog(s.catalog || null);
    D.available().forEach(function (d) {
      if (s.market[d.id]) return;
      s.market[d.id] = {
        price: d.price, open: d.price, high: d.price, low: d.price,
        history: [{ ts: Date.now(), price: d.price, qty: 0, dir: 'flat', synthetic: true, kind: 'apertura', demand: 0 }]
      };
    });
    $('tv-waiting').hidden = true;
    detectEvents(s);
    render();
  }

  function detectEvents(s) {
    var found = { crash: 0, rally: 0 };
    ['crash', 'rally'].forEach(function (kind) {
      Object.keys(s.market).forEach(function (id) {
        (s.market[id].history || []).forEach(function (h) {
          if (h.kind === kind && h.ts > found[kind]) found[kind] = h.ts;
        });
      });
    });
    if (!eventBaselineReady) {
      lastEventTs = found;
      eventBaselineReady = true;
      return;
    }
    ['crash', 'rally'].forEach(function (kind) {
      if (found[kind] > lastEventTs[kind]) showBanner(kind);
      lastEventTs[kind] = found[kind];
    });
  }

  function showBanner(kind) {
    var banner = $('tv-banner');
    banner.hidden = false;
    banner.style.background = kind === 'crash'
      ? 'linear-gradient(90deg, rgba(255,107,122,.18), rgba(255,107,122,.32))'
      : 'linear-gradient(90deg, rgba(242,189,99,.16), rgba(242,189,99,.30))';
    $('tv-banner-title').style.color = kind === 'crash' ? 'var(--red)' : 'var(--gold)';
    $('tv-banner-title').textContent = kind === 'crash' ? 'CAÍDA GENERAL' : 'SUBIDA GENERAL';
    $('tv-banner-detail').textContent = kind === 'crash'
      ? 'Todos los precios bajaron 10%'
      : 'Todos los precios subieron 7%';
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { banner.hidden = true; }, 9000);
  }

  /* ------------------------------------------------------------- render */

  function focusDrink() {
    var list = D.available();
    if (!list.length) return null;
    var fixed = current.tvFocusId ? D.byId(current.tvFocusId) : null;
    if (fixed && fixed.enabled !== false) return fixed;
    if (current.tvRotate === false) return list[0];
    return list[focusIndex % list.length];
  }

  function renderHeader() {
    $('tv-table').textContent = current.table || '—';
    var remaining = current.nextCrashAt ? Math.max(0, Math.ceil((current.nextCrashAt - Date.now()) / 1000)) : 0;
    $('tv-countdown').textContent = String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0');
    var status = $('tv-status');
    status.className = 'tv-status' + (source === 'local' ? ' off' : '');
    status.innerHTML = '<i></i> ' + (source === 'sse' ? 'EN VIVO · SERVIDOR' : source === 'poll' ? 'EN VIVO · RED' : 'MODO LOCAL');
  }

  function renderTicker() {
    var items = D.available().map(function (d) {
      var m = current.market[d.id];
      if (!m) return '';
      var ch = changeOf(m);
      return '<span class="tv-ticker-item"><b>' + esc(d.name) + '</b>' +
        '<span class="tv-px ' + dirClass(ch.dir) + '">' + D.money(m.price) + ' ' + arrow(ch.dir) +
        (ch.pct ? ' ' + D.pct(ch.pct) : '') + '</span></span>';
    }).join('');
    $('tv-ticker').innerHTML = items + items;
  }

  function renderQuote() {
    var list = D.available();
    var d = focusDrink();
    if (!d || !current.market[d.id]) return;
    var m = current.market[d.id];
    var ch = changeOf(m);
    var fixed = !!(current.tvFocusId && D.byId(current.tvFocusId));

    $('tv-focus-tag').textContent = fixed ? 'TRAGO FIJADO POR ADMIN' : (current.tvRotate === false ? 'ROTACIÓN DETENIDA' : 'ROTACIÓN AUTO · 12 s');
    $('tv-drink').textContent = d.name;
    $('tv-desc').textContent = d.description || '';
    $('tv-price').className = 'tv-price ' + dirClass(ch.dir);
    $('tv-price').textContent = D.money(m.price);
    var change = $('tv-change');
    change.className = 'tv-change ' + dirClass(ch.dir);
    change.textContent = arrow(ch.dir) + ' ' + (ch.pct ? D.pct(ch.pct) : 'SIN CAMBIO') + (ch.pct ? ' vs. tick anterior' : '');

    $('tv-kpis').innerHTML =
      '<div class="tv-kpi"><span>Precio carta</span><b>' + D.money(d.price) + '</b></div>' +
      '<div class="tv-kpi"><span>Apertura</span><b>' + D.money(m.open || d.price) + '</b></div>' +
      '<div class="tv-kpi"><span>Máximo</span><b class="up">' + D.money(m.high || m.price) + '</b></div>' +
      '<div class="tv-kpi"><span>Mínimo</span><b class="down">' + D.money(m.low || m.price) + '</b></div>' +
      '<div class="tv-kpi"><span>Demanda 4 min</span><b class="up">' + demandOf(current, d.id) + ' u.</b></div>' +
      '<div class="tv-kpi"><span>Consumos</span><b>' + (computeStats(current).counts[d.id] || 0) + ' u.</b></div>';

    C.render($('tv-chart'), d, m, { mode: 'ambos', range: 'todo' });
  }

  function renderAside() {
    var st = computeStats(current);
    $('tv-total').textContent = D.money(st.total);
    $('tv-total-sub').textContent = st.units
      ? st.units + ' tragos · ' + st.ops + ' registros'
      : 'Sin consumos registrados';
    $('tv-mini-kpis').innerHTML =
      '<div><span>Subidas</span><b class="up">' + st.ups + '</b></div>' +
      '<div><span>Bajadas</span><b class="down">' + st.downs + '</b></div>' +
      '<div><span>Promedio</span><b>' + D.money(st.avg) + '</b></div>';

    var ranked = Object.keys(st.counts).sort(function (a, b) { return st.counts[b] - st.counts[a]; }).slice(0, 7);
    $('tv-ranking').innerHTML = ranked.length ? ranked.map(function (id, i) {
      return '<div class="tv-rank-row"><span class="tv-rank-name">' + (i + 1) + '. ' + esc(nameOf(id)) + '</span>' +
        '<span class="tv-rank-qty">' + st.counts[id] + ' u.</span></div>';
    }).join('') : '<div class="tv-move-row"><span>Sin consumos todavía</span></div>';

    var moves = [];
    Object.keys(current.market).forEach(function (id) {
      var m = current.market[id];
      (m.history || []).forEach(function (h) {
        if (h.synthetic || h.kind === 'apertura') return;
        moves.push({ ts: h.ts, id: id, h: h });
      });
    });
    moves.sort(function (a, b) { return b.ts - a.ts; });
    var labels = { consumo: 'CONSUMO', ajuste: 'AJUSTE', crash: 'CAÍDA', rally: 'SUBIDA', admin: 'ADMIN' };
    $('tv-moves').innerHTML = moves.slice(0, 6).map(function (mv) {
      return '<div class="tv-move-row"><span>' + (labels[mv.h.kind] || 'MERCADO') + ' · ' + esc(nameOf(mv.id)) + '</span>' +
        '<span class="tv-move-px ' + dirClass(mv.h.dir) + '">' + arrow(mv.h.dir) + ' ' + D.money(mv.h.price) +
        ' <time>' + D.clock(mv.ts) + '</time></span></div>';
    }).join('') || '<div class="tv-move-row"><span>Esperando movimientos…</span></div>';
  }

  function renderBoard() {
    var list = D.available().map(function (d) {
      return { drink: d, market: current.market[d.id] };
    }).filter(function (row) { return !!row.market; });
    list.sort(function (a, b) { return b.market.price - a.market.price; });
    $('tv-board-count').textContent = list.length + ' precios';
    $('tv-board').innerHTML = list.map(function (row) {
      var ch = changeOf(row.market);
      return '<div class="tv-board-item"><span>' + esc(row.drink.name) + '</span>' +
        '<b class="' + dirClass(ch.dir) + '">' + D.money(row.market.price) +
        (ch.pct ? '<i>' + arrow(ch.dir) + D.pct(ch.pct) + '</i>' : '') + '</b></div>';
    }).join('');
  }

  function render() {
    if (!current) return;
    renderHeader();
    renderTicker();
    renderQuote();
    renderAside();
    renderBoard();
  }

  /* --------------------------------------------------------------- loop */

  function renderClock() {
    $('tv-clock').textContent = new Date().toLocaleTimeString('es-AR', { hour12: false });
    if (current) renderHeader();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
  }

  function init() {
    $('tv-fullscreen').addEventListener('click', toggleFullscreen);
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'f' || ev.key === 'F') toggleFullscreen();
    });
    rotateTimer = setInterval(function () {
      if (!current || current.tvFocusId || current.tvRotate === false) return;
      focusIndex++;
      renderQuote();
    }, 12000);
    setInterval(renderClock, 1000);
    renderClock();
    Sync.subscribe(applyState);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
