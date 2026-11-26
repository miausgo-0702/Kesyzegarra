/* ==========================================================================
   Pantalla de televisores: recibe el estado público de la terminal por
   SSE / polling / localStorage y muestra el mercado en grande.
   - eventos de caída/subida a pantalla completa y cuenta regresiva final;
   - destellos cuando cambia un precio;
   - corrige la diferencia de reloj con el servidor;
   - mantiene la pantalla encendida (Wake Lock) y oculta el cursor.
   ========================================================================== */
(function () {
  'use strict';

  var D = window.SernovaData;
  var C = window.SernovaChart;
  var Sync = window.SernovaSync;
  var esc = D.esc;

  var ROTATE_MS = 12000;
  var current = null;
  var source = 'local';
  var connected = true;
  var focusIndex = 0;
  var focusId = '';
  var eventTimer = null;
  var lastEventTs = null;
  var clockOffset = 0;
  var prevPrices = {};
  var shownTotal = null;
  var idleTimer = null;
  var wakeLock = null;
  var chartKey = '';

  function $(id) { return document.getElementById(id); }
  function arrow(dir) { return dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■'; }
  function dirClass(dir) { return dir === 'up' ? 'up' : dir === 'down' ? 'down' : 'flat'; }
  function nowTs() { return Date.now() + clockOffset; }

  function changeOf(market) {
    if (!market) return { dir: 'flat', pct: 0 };
    var h = market.history || [];
    var last = h[h.length - 1];
    if (!last || h.length < 2) return { dir: 'flat', pct: 0 };
    var prev = h[h.length - 2].price;
    return { dir: last.dir, pct: prev ? (last.price - prev) / prev * 100 : 0, kind: last.kind };
  }

  function nameOf(id) {
    var d = D.byId(id);
    if (d) return d.name;
    var entries = (current && current.entries) || [];
    for (var i = entries.length - 1; i >= 0; i--) if (entries[i].drinkId === id) return entries[i].name;
    return id;
  }

  function flash(el, dir) {
    if (!el || !dir || dir === 'flat') return;
    el.classList.remove('flash-up', 'flash-down');
    void el.offsetWidth;
    el.classList.add(dir === 'up' ? 'flash-up' : 'flash-down');
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
    var from = nowTs() - 4 * 60 * 1000;
    var units = 0;
    s.entries.forEach(function (e) { if (e.drinkId === id && e.ts >= from) units += e.qty; });
    return units;
  }

  function crashRemaining() {
    if (!current || !current.nextCrashAt) return 0;
    var a = current.admin || {};
    var ref = a.paused && a.pausedAt ? a.pausedAt : nowTs();
    return Math.max(0, Math.ceil((current.nextCrashAt - ref) / 1000));
  }

  /* ------------------------------------------------------------ recibir */

  function applyState(s, src) {
    if (src === 'down') { connected = false; renderStatus(); return; }
    if (src === 'up') { connected = true; renderStatus(); return; }
    if (!s || !s.market || !s.entries) {
      if (!current) $('tv-waiting').hidden = false;
      return;
    }
    connected = true;
    if (src !== 'sse' && src !== 'frame' && current && s.updatedAt && current.updatedAt && s.updatedAt < current.updatedAt && s.sessionId === current.sessionId) return;
    if (s.serverAt && src !== 'local') clockOffset = s.serverAt - Date.now();
    var newSession = !current || current.sessionId !== s.sessionId;
    current = s;
    if (src === 'sse' || src === 'frame' || (source !== 'sse' && source !== 'frame')) source = src || 'local';
    D.applyCatalog(s.catalog || null);
    D.available().forEach(function (d) {
      if (s.market[d.id]) return;
      s.market[d.id] = {
        price: d.price, open: d.price, high: d.price, low: d.price,
        history: [{ ts: nowTs(), price: d.price, qty: 0, dir: 'flat', synthetic: true, kind: 'apertura', demand: 0 }]
      };
    });
    if (newSession) { prevPrices = {}; shownTotal = null; }
    $('tv-waiting').hidden = true;
    detectEvent(s);
    render();
  }

  function detectEvent(s) {
    var ev = s.lastEvent;
    var ts = ev ? ev.ts : 0;
    if (lastEventTs === null) { lastEventTs = ts; return; }       // no repetir eventos viejos al abrir
    if (ts > lastEventTs && nowTs() - ts < 30000) showEvent(ev);
    lastEventTs = Math.max(lastEventTs, ts);
  }

  function showEvent(ev) {
    var box = $('tv-event');
    var crash = ev.kind === 'crash';
    var secs = Math.round((ev.durationMs || 60000) / 1000);
    $('tv-countbig').hidden = true;
    box.className = 'tv-event ' + (crash ? 'crash' : 'rally');
    box.hidden = false;
    $('tv-event-arrow').textContent = crash ? '▼' : '▲';
    $('tv-event-title').textContent = crash ? '¡PRECIO DE COSTO!' : ev.kind === 'recover' ? 'FIN DEL PRECIO DE COSTO' : 'SUBIDA GENERAL';
    $('tv-event-detail').textContent = crash
      ? 'Toda la carta al costo durante ' + (secs >= 60 && secs % 60 === 0 ? (secs / 60) + (secs === 60 ? ' minuto' : ' minutos') : secs + ' segundos') + ' · ¡pedí ahora!'
      : ev.kind === 'recover' ? 'Los precios volvieron a la normalidad' : 'Todos los precios subieron ' + (ev.pct || 7) + '%';
    clearTimeout(eventTimer);
    eventTimer = setTimeout(function () {
      box.classList.add('out');
      setTimeout(function () { box.hidden = true; }, 600);
    }, ev.kind === 'recover' ? 3000 : 5200);
  }

  function costLeft() {
    if (!current || !current.crash || !current.crash.active) return 0;
    var a = current.admin || {};
    var ref = a.paused && a.pausedAt ? a.pausedAt : nowTs();
    return Math.max(0, Math.ceil((current.crash.until - ref) / 1000));
  }

  /* ------------------------------------------------------------- render */

  function focusDrink() {
    var list = D.available();
    if (!list.length) return null;
    var fixed = current.tvFocusId ? D.byId(current.tvFocusId) : null;
    if (fixed && fixed.enabled !== false) return fixed;
    if (current.tvRotate === false) return list[focusIndex % list.length];
    return list[focusIndex % list.length];
  }

  function renderStatus() {
    var status = $('tv-status');
    var label, cls;
    if (!connected && source !== 'local') { label = 'SIN SEÑAL'; cls = 'down'; }
    else if (source === 'sse' || source === 'frame') { label = 'EN VIVO'; cls = ''; }
    else if (source === 'poll' || source === 'initial') { label = 'EN VIVO · RED'; cls = ''; }
    else { label = Sync.inFrame ? 'EN VIVO' : 'EN VIVO · ESTE EQUIPO'; cls = ''; }
    status.className = 'tv-status ' + cls;
    status.querySelector('span').textContent = label;
  }

  function renderHeader() {
    $('tv-table').textContent = current.table || '—';
    var a = current.admin || {};
    var atCost = !!(current.crash && current.crash.active);
    var left = costLeft();
    var remaining = atCost ? left : crashRemaining();
    var total = Math.max(1, (atCost ? (a.crashDurationMs || 60000) : (a.crashMs || 120000)) / 1000);
    var box = $('tv-countdown-box');
    $('tv-countdown').textContent = a.paused ? 'PAUSA' : String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0');
    $('tv-countdown-label').textContent = a.paused ? 'MERCADO' : atCost ? 'PRECIO DE COSTO' : 'CAÍDA A COSTO EN';
    $('tv-ring').style.strokeDashoffset = (119.4 * (1 - remaining / total)).toFixed(1);
    box.className = 'tv-countdown' + (a.paused ? ' paused' : atCost ? ' atcost' : remaining <= 10 ? ' urgent' : '');
    var strip = $('tv-cost-strip');
    strip.hidden = !atCost;
    if (atCost) $('tv-cost-left').textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
    document.body.classList.toggle('at-cost', atCost);
    if (atCost) remaining = 999;
    var big = $('tv-countbig');
    var showBig = !a.paused && remaining > 0 && remaining <= 5 && current.table && $('tv-event').hidden;
    if (showBig) {
      var n = $('tv-countbig-n');
      if (n.textContent !== String(remaining) || big.hidden) {
        n.textContent = remaining;
        n.style.animation = 'none'; void n.offsetWidth; n.style.animation = '';
      }
    }
    big.hidden = !showBig;
    renderStatus();
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
    var track = $('tv-ticker');
    track.innerHTML = items + items;
    track.style.animationDuration = Math.max(50, D.available().length * 3.4) + 's';
  }

  function renderQuote(swap) {
    var d = focusDrink();
    if (!d || !current.market[d.id]) return;
    var m = current.market[d.id];
    var ch = changeOf(m);
    var fixed = !!(current.tvFocusId && D.byId(current.tvFocusId));
    var vs = d.price ? (m.price - d.price) / d.price * 100 : 0;
    var changedDrink = focusId !== d.id;
    focusId = d.id;

    $('tv-focus-tag').textContent = fixed ? 'TRAGO FIJADO' : (current.tvRotate === false ? 'ROTACIÓN DETENIDA' : 'ROTACIÓN AUTO');
    var bar = $('tv-rotate-bar');
    if (fixed || current.tvRotate === false) bar.className = '';
    else if (swap || !bar.className) { bar.className = ''; void bar.offsetWidth; bar.className = 'run'; }

    if (changedDrink) {
      var body = $('tv-quote-body');
      body.classList.remove('swap'); void body.offsetWidth; body.classList.add('swap');
    }
    var sernova = d.category !== 'Tragos';
    $('tv-cat').textContent = sernova ? 'COCKTAIL SERNOVA' : 'TRAGO';
    $('tv-cat').className = 'tv-cat' + (sernova ? '' : ' trago');
    $('tv-drink').textContent = d.name;
    $('tv-desc').textContent = d.description || '';
    var priceEl = $('tv-price');
    priceEl.className = 'tv-price ' + dirClass(ch.dir);
    priceEl.textContent = D.money(m.price);
    var pk = 'q' + d.id;
    if (!changedDrink && prevPrices[pk] !== undefined && prevPrices[pk] !== m.price) flash(priceEl, m.price > prevPrices[pk] ? 'up' : 'down');
    prevPrices[pk] = m.price;
    var change = $('tv-change');
    change.className = 'tv-change ' + dirClass(ch.dir);
    change.textContent = arrow(ch.dir) + ' ' + (ch.pct ? D.pct(ch.pct) : 'SIN CAMBIO') + ' · ' + D.pct(vs) + ' vs. carta';

    $('tv-kpis').innerHTML =
      '<div class="tv-kpi"><span>Precio carta</span><b class="gold-t">' + D.money(d.price) + '</b></div>' +
      '<div class="tv-kpi"><span>Apertura</span><b>' + D.money(m.open || d.price) + '</b></div>' +
      '<div class="tv-kpi"><span>Máximo</span><b class="up">' + D.money(m.high || m.price) + '</b></div>' +
      '<div class="tv-kpi"><span>Mínimo</span><b class="down">' + D.money(m.low || m.price) + '</b></div>' +
      '<div class="tv-kpi"><span>Demanda 4 min</span><b>' + demandOf(current, d.id) + ' u.</b></div>' +
      '<div class="tv-kpi"><span>Pedidos mesa</span><b>' + (computeStats(current).counts[d.id] || 0) + ' u.</b></div>';

    var key = d.id;
    C.render($('tv-chart'), d, m, { mode: 'ambos', range: 'todo', big: true, fill: true, tooltip: false, animate: key !== chartKey });
    chartKey = key;
  }

  function renderAside() {
    var st = computeStats(current);
    var totalEl = $('tv-total');
    if (shownTotal !== null && shownTotal !== st.total) flash(totalEl, st.total > shownTotal ? 'up' : 'down');
    shownTotal = st.total;
    totalEl.textContent = D.money(st.total);
    $('tv-total-sub').textContent = st.units
      ? st.units + (st.units === 1 ? ' trago · ' : ' tragos · ') + st.ops + (st.ops === 1 ? ' registro' : ' registros') + (current.guests ? ' · ' + current.guests + ' comensales' : '')
      : 'Sin consumos registrados';
    $('tv-mini-kpis').innerHTML =
      '<div><span>Subidas</span><b class="up">' + st.ups + '</b></div>' +
      '<div><span>Bajadas</span><b class="down">' + st.downs + '</b></div>' +
      '<div><span>Promedio</span><b>' + D.moneyShort(st.avg) + '</b></div>';

    var movers = D.available().map(function (d) {
      var m = current.market[d.id];
      return { name: d.name, price: m.price, pct: (m.price - d.price) / d.price * 100 };
    }).sort(function (a, b) { return b.pct - a.pct; });
    var mUp = movers.slice(0, 2), mDown = movers.slice(-2).reverse();
    function mv(x) {
      var cls = x.pct > 0 ? 'up' : x.pct < 0 ? 'down' : 'flat';
      return '<div class="tv-mover"><span>' + esc(x.name) + '</span><b>' + D.money(x.price) + '</b><em class="' + cls + '">' + arrow(cls) + D.pct(x.pct) + '</em></div>';
    }
    $('tv-movers').innerHTML = mUp.map(mv).join('') + mDown.map(mv).join('');

    var ranked = Object.keys(st.counts).sort(function (a, b) { return st.counts[b] - st.counts[a]; }).slice(0, 6);
    $('tv-ranking').innerHTML = ranked.length ? ranked.map(function (id, i) {
      return '<div class="tv-rank-row"><span class="tv-rank-name"><i>' + (i + 1) + '</i><span>' + esc(nameOf(id)) + '</span></span>' +
        '<span class="tv-rank-qty">' + st.counts[id] + ' u.</span></div>';
    }).join('') : '<div class="tv-empty">Sin consumos todavía</div>';

    var moves = [];
    Object.keys(current.market).forEach(function (id) {
      var m = current.market[id];
      (m.history || []).forEach(function (h) {
        if (h.synthetic || h.kind === 'apertura') return;
        moves.push({ ts: h.ts, id: id, h: h });
      });
    });
    moves.sort(function (a, b) { return b.ts - a.ts; });
    // Agrupa los eventos generales (un renglón por caída/subida)
    var seen = {}, rows = [];
    moves.forEach(function (mvv) {
      if (rows.length >= 7) return;
      if (mvv.h.kind === 'crash' || mvv.h.kind === 'rally' || mvv.h.kind === 'recover') {
        var k = mvv.h.kind + mvv.ts;
        if (seen[k]) return;
        seen[k] = true;
        rows.push({ ts: mvv.ts, label: mvv.h.kind === 'crash' ? 'A COSTO' : mvv.h.kind === 'recover' ? 'VUELVE' : 'SUBIDA', kind: mvv.h.kind, name: 'Toda la carta', dir: mvv.h.dir, price: null });
        return;
      }
      rows.push({ ts: mvv.ts, label: { consumo: 'PEDIDO', ajuste: 'AJUSTE', admin: 'ADMIN' }[mvv.h.kind] || 'MERCADO', kind: mvv.h.kind, name: nameOf(mvv.id), dir: mvv.h.dir, price: mvv.h.price });
    });
    $('tv-moves').innerHTML = rows.map(function (r) {
      return '<div class="tv-move-row"><span><small class="k-' + r.kind + '">' + r.label + '</small>' + esc(r.name) + '</span>' +
        '<span class="tv-move-px ' + dirClass(r.dir) + '">' + arrow(r.dir) + (r.price ? ' ' + D.money(r.price) : '') +
        '<time>' + D.clock(r.ts) + '</time></span></div>';
    }).join('') || '<div class="tv-empty">Esperando movimientos…</div>';
  }

  function renderBoard() {
    var list = D.available().map(function (d) {
      return { drink: d, market: current.market[d.id] };
    }).filter(function (row) { return !!row.market; });
    list.sort(function (a, b) { return b.market.price - a.market.price; });
    $('tv-board-count').textContent = list.length + ' precios · ordenados por precio';
    var grid = $('tv-board');
    grid.innerHTML = list.map(function (row) {
      var ch = changeOf(row.market);
      var id = row.drink.id;
      var prev = prevPrices[id];
      var fl = prev !== undefined && prev !== row.market.price ? (row.market.price > prev ? ' flash-up' : ' flash-down') : '';
      prevPrices[id] = row.market.price;
      return '<div class="tv-board-item' + fl + '"><span>' + esc(row.drink.name) + '</span>' +
        '<b class="' + dirClass(ch.dir) + '">' + D.money(row.market.price) +
        (ch.pct ? '<i>' + arrow(ch.dir) + D.pct(ch.pct) + '</i>' : '') + '</b></div>';
    }).join('');
    // Ajusta columnas para que entre toda la carta sin scroll.
    var itemH = grid.firstChild ? grid.firstChild.offsetHeight || 22 : 22;
    var rows = Math.max(1, Math.floor((grid.clientHeight || 160) / itemH));
    var cols = Math.min(6, Math.max(window.innerWidth < 860 ? 2 : 3, Math.ceil(list.length / rows)));
    grid.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';
  }

  function renderMood() {
    var avg = 0, n = 0;
    D.available().forEach(function (d) {
      var m = current.market[d.id];
      if (m) { avg += (m.price - d.price) / d.price; n++; }
    });
    avg = n ? avg / n : 0;
    document.body.classList.toggle('mood-up', avg > 0.03);
    document.body.classList.toggle('mood-down', avg < -0.03);
  }

  function render() {
    if (!current) return;
    renderHeader();
    renderTicker();
    renderQuote(false);
    renderAside();
    renderBoard();
    renderMood();
  }

  /* --------------------------------------------------------------- loop */

  function renderClock() {
    $('tv-clock').textContent = new Date(nowTs()).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
    if (current) renderHeader();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
  }

  function requestWakeLock() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    navigator.wakeLock.request('screen').then(function (lock) { wakeLock = lock; }).catch(function () { /* no soportado */ });
  }

  function poke() {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { document.body.classList.add('idle'); }, 3500);
  }

  function init() {
    $('tv-fullscreen').addEventListener('click', toggleFullscreen);
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'f' || ev.key === 'F') toggleFullscreen();
      if (ev.key === 'Escape' && Sync.inFrame && !document.fullscreenElement) {
        try { window.parent.postMessage({ sernova: 'close-tv' }, '*'); } catch (e) { /* noop */ }
      }
      if (!current) return;
      if (ev.key === 'ArrowRight') { focusIndex++; renderQuote(true); }
      if (ev.key === 'ArrowLeft') { focusIndex = Math.max(0, focusIndex - 1); renderQuote(true); }
    });
    document.addEventListener('dblclick', toggleFullscreen);
    ['mousemove', 'pointerdown', 'keydown'].forEach(function (t) { document.addEventListener(t, poke, { passive: true }); });
    poke();
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') requestWakeLock(); });
    requestWakeLock();

    setInterval(function () {
      if (!current || current.tvFocusId || current.tvRotate === false) return;
      focusIndex++;
      renderQuote(true);
    }, ROTATE_MS);
    setInterval(renderClock, 1000);
    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { chartKey = ''; render(); }, 200); });
    renderClock();
    Sync.subscribe(applyState);
    void wakeLock;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
