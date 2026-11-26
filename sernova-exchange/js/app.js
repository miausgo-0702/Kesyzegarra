/* ==========================================================================
   Interfaz: mesa, carta, ticket, mercado, cuenta y panel de administrador.
   Todo texto que puede venir del usuario (nombres de mesa, tragos creados,
   responsables, registros) se escapa antes de insertarse en el HTML.
   ========================================================================== */
(function () {
  'use strict';

  var D = window.SernovaData;
  var S = window.SernovaStore;
  var C = window.SernovaChart;
  var Sync = window.SernovaSync;
  var esc = D.esc;

  var els = {};
  var setupTable = '';
  var setupGuests = 2;
  var modalQty = 1;
  var modalDrinkId = null;
  var adminTab = 'mercado';
  var adminArchiveView = null;
  var bannerTimer = null;
  var marketTimer = null;
  var lastFocus = null;
  var dialogClose = null;
  var askCallback = null;
  var prevPrices = {};
  var shownTotal = 0;
  var searchTimer = null;
  var heroTimer = null;

  function $(id) { return document.getElementById(id); }

  function cacheEls() {
    [
      'setup', 'app', 'table-grid', 'table-selected-hint', 'custom-table', 'guests-value',
      'waiter', 'saved-hint', 'btn-continue', 'btn-open', 'table-label', 'session-meta',
      'admin-badge', 'btn-admin', 'btn-admin-setup', 'btn-tv', 'btn-tv-setup', 'btn-help',
      'btn-theme', 'btn-new', 'btn-lock', 'ticker-track', 'table-pill', 'sync-pill', 'hero-board',
      'ticker-clock', 'crash-countdown', 'market-banner', 'market-name', 'market-desc',
      'market-select', 'quote-price', 'quote-change', 'quote-stats', 'chart', 'chart-legend',
      'mode-switch', 'range-switch', 'density-switch', 'category-tabs', 'tag-chips', 'sort-select', 'search',
      'drink-grid', 'empty-menu', 'total-value', 'total-caption', 'total-split', 'kpi-grid', 'share-bar',
      'share-legend', 'ledger-count', 'ledger-list', 'btn-undo', 'btn-export', 'btn-clear',
      'movers-list', 'ranking-list', 'toasts', 'modal-root', 'admin-root', 'print-root',
      'crash-flash', 'mobile-total', 'mobile-count', 'btn-quick-add', 'ledger-panel'
    ].forEach(function (id) { els[id] = $(id); });
  }

  function state() { return S.getState(); }
  function arrow(dir) { return dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■'; }
  function dirCls(dir) { return dir === 'up' ? 'up' : dir === 'down' ? 'down' : 'flat'; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function drinkName(id) {
    var d = D.byId(id);
    if (d) return d.name;
    var entries = state().entries;
    for (var i = entries.length - 1; i >= 0; i--) if (entries[i].drinkId === id) return entries[i].name;
    return id;
  }

  function fmtCountdown(seconds) {
    var m = Math.floor(seconds / 60), s = seconds % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function animateNumber(el, from, to, fmt) {
    if (from === to || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(to); return; }
    var start = performance.now(), dur = 520;
    function step(t) {
      var p = Math.min(1, (t - start) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function flash(el, dir) {
    if (!el || !dir || dir === 'flat') return;
    el.classList.remove('flash-up', 'flash-down');
    void el.offsetWidth;
    el.classList.add(dir === 'up' ? 'flash-up' : 'flash-down');
  }

  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* noop */ } }

  /* ------------------------------------------------------------- tema */
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'light' ? '#f3f1ec' : '#07080d';
  }

  function toggleTheme() {
    var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    if (state()) S.setTheme(next);
    if (S.hasSession() && !els.app.hidden) renderMarket();
    toast('Tema ' + (next === 'dark' ? 'oscuro' : 'claro'), '', 'info');
  }

  /* ----------------------------------------------------------- setup */
  function renderTableGrid() {
    var html = '';
    var saved = S.hasSession() ? state().table : '';
    for (var i = 1; i <= 24; i++) {
      var t = String(i);
      html += '<button type="button" class="table-num' + (setupTable === t ? ' active' : '') + (saved === t ? ' saved' : '') +
        '" data-action="table" data-table="' + i + '" aria-pressed="' + (setupTable === t) + '"' +
        (saved === t ? ' title="Sesión guardada"' : '') + '>' + String(i).padStart(2, '0') + '</button>';
    }
    els['table-grid'].innerHTML = html;
  }

  function selectTable(value, fromCustom) {
    setupTable = String(value || '').trim();
    if (!fromCustom) els['custom-table'].value = '';
    renderTableGrid();
    els['table-selected-hint'].textContent = setupTable ? 'Mesa ' + setupTable : 'Sin seleccionar';
    els['table-selected-hint'].classList.toggle('ok', !!setupTable);
    updateSavedHint();
  }

  function updateSavedHint() {
    var saved = state();
    var match = S.hasSession() && saved.table === setupTable && saved.entries.length;
    if (match) {
      els['saved-hint'].hidden = false;
      els['saved-hint'].innerHTML = '<b>Sesión guardada</b> para la mesa ' + esc(setupTable) + ': ' +
        plural(saved.entries.length, 'consumo', 'consumos') + ' por <b>' + D.money(S.stats().total) + '</b>. ' +
        '«Continuar» la recupera; «Abrir mesa» la archiva y empieza de cero.';
      els['btn-continue'].hidden = false;
    } else {
      els['saved-hint'].hidden = true;
      els['btn-continue'].hidden = !(S.hasSession() && saved.table === setupTable);
    }
  }

  function renderHero() {
    var s = state();
    var list = D.available().slice(0, 4).concat(D.available().slice(-3));
    els['hero-board'].innerHTML = list.map(function (d) {
      var m = s && s.market[d.id];
      var price = m ? m.price : d.price;
      var hist = m ? m.history : null;
      var ch = s && m ? S.lastChange(d.id) : { dir: 'flat', pct: 0 };
      return '<div class="hero-row"><span>' + esc(d.name) + '</span>' +
        '<i class="hero-spark">' + (hist ? C.sparkline(hist, 12) : '') + '</i>' +
        '<b class="' + dirCls(ch.dir) + '">' + D.money(price) + '</b></div>';
    }).join('');
  }

  function openSetup(prefill) {
    closeAdmin();
    closeDialog();
    els.setup.hidden = false;
    els.app.hidden = true;
    var t = prefill || (S.hasSession() ? state().table : '');
    setupTable = t;
    setupGuests = S.hasSession() ? state().guests : 2;
    var isGridTable = /^\d+$/.test(t) && Number(t) >= 1 && Number(t) <= 24;
    els['custom-table'].value = t && !isGridTable ? t : '';
    els['guests-value'].textContent = setupGuests;
    els.waiter.value = S.hasSession() ? state().waiter : '';
    renderTableGrid();
    els['table-selected-hint'].textContent = t ? 'Mesa ' + t : 'Sin seleccionar';
    els['table-selected-hint'].classList.toggle('ok', !!t);
    updateSavedHint();
    renderHero();
    clearInterval(heroTimer);
    heroTimer = setInterval(renderHero, 5000);
    window.scrollTo(0, 0);
  }

  function startApp() {
    clearInterval(heroTimer);
    els.setup.hidden = true;
    els.app.hidden = false;
    applyTheme(state().theme || 'dark');
    prevPrices = {};
    shownTotal = S.stats().total;
    renderAll();
    window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------ header */
  function renderHeader() {
    var s = state();
    els['table-label'].textContent = s.table;
    var meta = 'Abierta ' + D.clock(s.startedAt) + ' · ' + plural(s.guests, 'comensal', 'comensales');
    if (s.waiter) meta += ' · ' + s.waiter;
    els['session-meta'].textContent = meta;
    els['admin-badge'].hidden = !S.isAdmin();
  }

  function renderSync(st) {
    var pill = els['sync-pill'];
    if (!pill) return;
    var map = {
      local: ['local', 'Este equipo', 'Sin servidor: la pantalla TV funciona en este navegador (botón TV). Para TVs en red, iniciá INICIAR.bat / start.sh.'],
      idle: ['idle', 'Conectando', 'Buscando el servidor SERNOVA…'],
      online: ['online', st.clients ? 'TV · ' + st.clients : 'En línea', 'Publicando en vivo para las pantallas.'],
      offline: ['offline', 'Sin servidor', 'El servidor no responde. La terminal sigue funcionando y reintenta sola.'],
      auth: ['auth', 'Falta clave', 'Ingresá la clave de publicación en Admin → Sistema.'],
      error: ['offline', 'Error', st.error || 'Error de sincronización.']
    };
    var v = map[st.state] || map.local;
    pill.className = 'sync-pill ' + v[0];
    pill.title = v[2];
    pill.querySelector('span').textContent = v[1];
  }

  function renderClock() {
    els['ticker-clock'].textContent = new Date().toLocaleString('es-AR', {
      weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false
    }).toUpperCase();
  }

  function updateCountdowns() {
    if (!S.hasSession()) return;
    var s = state();
    var secs = S.crashRemaining();
    var cd = els['crash-countdown'];
    var atCost = S.crashActive();
    var left = S.crashLeft();
    if (s.admin.paused) {
      cd.innerHTML = '<b>MERCADO EN PAUSA</b>';
      cd.className = 'ticker-countdown paused';
    } else if (atCost) {
      cd.innerHTML = '<span>PRECIO DE COSTO · TERMINA EN</span> <b>' + fmtCountdown(left) + '</b>';
      cd.className = 'ticker-countdown atcost';
    } else {
      cd.innerHTML = '<span>CAÍDA A COSTO EN</span> <b>' + fmtCountdown(secs) + '</b>';
      cd.className = 'ticker-countdown' + (secs <= 10 ? ' urgent' : '');
    }
    // Franja fija mientras dura el precio de costo
    var b = els['market-banner'];
    if (atCost) {
      clearTimeout(bannerTimer);
      b.hidden = false;
      b.className = 'market-banner atcost';
      b.innerHTML = '<strong>▼ PRECIO DE COSTO</strong><span>Toda la carta al costo · termina en <b>' + fmtCountdown(left) + '</b></span>';
    } else if (b.classList.contains('atcost')) {
      b.hidden = true;
      b.className = 'market-banner';
    }
    document.body.classList.toggle('at-cost', atCost);
    var ac = $('admin-countdown');
    if (ac) ac.textContent = atCost ? 'COSTO ' + fmtCountdown(left) : fmtCountdown(secs);
  }

  /* ------------------------------------------------------------ ticker */
  function renderTicker() {
    var s = state();
    var items = D.available().map(function (d) {
      var ch = S.lastChange(d.id);
      var kindTag = ch.kind === 'crash' ? '<em>A COSTO</em>' : ch.kind === 'rally' ? '<em class="gold">SUBIDA</em>' : '';
      return '<span class="ticker-item"><b>' + esc(d.name) + '</b>' +
        '<span class="tp">' + D.money(s.market[d.id].price) + '</span>' +
        '<span class="' + dirCls(ch.dir) + '">' + arrow(ch.dir) + ' ' + D.pct(ch.pct) + '</span>' + kindTag + '</span>';
    }).join('');
    els['ticker-track'].innerHTML = items + items;
    els['ticker-track'].style.animationDuration = Math.max(40, D.available().length * 2.6) + 's';
  }

  /* ------------------------------------------------------------ mercado */
  function renderSelect() {
    var s = state();
    var chosen = D.byId(s.selectedId);
    var first = D.available()[0];
    if ((!chosen || chosen.enabled === false) && first) s.selectedId = first.id;
    var groups = {};
    D.available().forEach(function (d) {
      (groups[d.category] = groups[d.category] || []).push('<option value="' + esc(d.id) + '">' + esc(d.name) + ' · ' + D.money(s.market[d.id].price) + '</option>');
    });
    els['market-select'].innerHTML = Object.keys(groups).map(function (cat) {
      return '<optgroup label="' + esc(cat) + '">' + groups[cat].join('') + '</optgroup>';
    }).join('');
    els['market-select'].value = s.selectedId;
  }

  function statCell(label, value, cls) {
    return '<div class="stat-cell"><span>' + label + '</span><strong' + (cls ? ' class="' + cls + '"' : '') + '>' + value + '</strong></div>';
  }

  function renderLegend(mode) {
    var items = mode === 'demanda'
      ? [['line', 'var(--gold)', 'Demanda (4 min)'], ['bar', 'var(--gold)', 'Unidades por evento']]
      : [['line', 'var(--green)', 'Precio (verde si sube en la sesión)'], ['dash', 'var(--gold)', 'Media móvil 5'],
         ['dot', 'var(--gold)', 'Precio de carta'], ['bar', 'var(--green)', 'Consumo'], ['bar', 'var(--blue)', 'Ajuste auto'], ['bar', 'var(--red)', 'Precio de costo'], ['bar', 'var(--gold)', 'Vuelta de precios']];
    els['chart-legend'].innerHTML = items.map(function (it) {
      return '<span><i class="lk lk-' + it[0] + '" style="--c:' + it[1] + '"></i>' + it[2] + '</span>';
    }).join('');
  }

  function renderMarket() {
    var s = state();
    var drink = D.byId(s.selectedId) || D.available()[0] || D.DRINKS[0];
    var m = s.market[drink.id];
    if (!m) return;
    var ch = S.lastChange(drink.id);
    var vsList = drink.price ? (m.price - drink.price) / drink.price * 100 : 0;
    var ops = m.history.filter(function (h) { return !h.synthetic; });
    var units = ops.filter(function (h) { return h.kind === 'consumo'; }).reduce(function (a, h) { return a + h.qty; }, 0);
    var ups = ops.filter(function (h) { return h.dir === 'up'; }).length;
    var downs = ops.filter(function (h) { return h.dir === 'down'; }).length;
    var dem = S.demand(drink.id);

    els['market-name'].textContent = drink.name;
    els['market-desc'].textContent = drink.description + ' · ' + drink.category;
    var qp = els['quote-price'];
    var prev = prevPrices['__q' + drink.id];
    qp.textContent = D.money(m.price);
    qp.className = 'quote-price ' + dirCls(ch.dir);
    if (prev !== undefined && prev !== m.price) flash(qp, m.price > prev ? 'up' : 'down');
    prevPrices['__q' + drink.id] = m.price;

    var kindNote = S.crashActive() ? 'Precio de costo' : ch.kind === 'recover' ? 'Fin del precio de costo' : ch.kind === 'crash' ? 'Caída a costo' : ch.kind === 'rally' ? 'Subida general' : ch.kind === 'admin' ? 'Ajuste admin' : ch.kind === 'ajuste' ? 'Ajuste automático' : ch.kind === 'consumo' ? 'Por consumo' : 'Apertura';
    els['quote-change'].innerHTML =
      '<span class="change-pill ' + dirCls(ch.dir) + '">' + arrow(ch.dir) + ' ' + D.pct(ch.pct) + '</span>' +
      '<small>' + kindNote + ' · <span class="' + dirCls(vsList > 0 ? 'up' : vsList < 0 ? 'down' : 'flat') + '">' + D.pct(vsList) + '</span> vs. carta</small>';

    var heat = Math.min(100, dem.units / 8 * 100);
    els['quote-stats'].innerHTML =
      statCell('Carta', D.money(drink.price)) +
      statCell('Máximo', D.money(m.high), 'up') +
      statCell('Mínimo', D.money(m.low), 'down') +
      statCell('Consumo', units + ' u.') +
      statCell('Subas / bajas', ups + ' / ' + downs) +
      '<div class="stat-cell heat"><span>Demanda 4 min</span><strong>' + dem.units + ' u.</strong><i><b style="width:' + heat + '%"></b></i></div>';

    var animate = els.chart.dataset.drawn !== drink.id + s.mode + s.range;
    els.chart.dataset.drawn = drink.id + s.mode + s.range;
    C.render(els.chart, drink, m, { mode: s.mode, range: s.range, animate: animate });
    renderLegend(s.mode);

    document.querySelectorAll('#mode-switch button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.mode === s.mode);
      b.setAttribute('aria-pressed', b.dataset.mode === s.mode);
    });
    document.querySelectorAll('#range-switch button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.range === s.range);
      b.setAttribute('aria-pressed', b.dataset.range === s.range);
    });
    els['btn-quick-add'].dataset.id = drink.id;
  }

  /* -------------------------------------------------------------- carta */
  function renderTabs() {
    var s = state();
    els['category-tabs'].innerHTML = D.CATEGORIES.map(function (cat) {
      var count = cat === 'Todos' ? D.available().length : D.available().filter(function (d) { return d.category === cat; }).length;
      return '<button type="button" role="tab" aria-selected="' + (s.category === cat) + '" data-action="category" data-value="' + esc(cat) +
        '" class="' + (s.category === cat ? 'active' : '') + '">' + esc(cat) + '<span class="tab-count">' + count + '</span></button>';
    }).join('');
  }

  function renderChips() {
    var s = state();
    var used = {};
    D.available().forEach(function (d) { d.tags.forEach(function (t) { used[t] = true; }); });
    els['tag-chips'].innerHTML = D.TAGS.filter(function (t) { return t === 'Todos' || used[t]; }).map(function (tag) {
      return '<button type="button" class="chip' + (s.tag === tag ? ' active' : '') +
        '" aria-pressed="' + (s.tag === tag) + '" data-action="tag" data-value="' + esc(tag) + '">' + esc(tag) + '</button>';
    }).join('');
  }

  function normalize(t) { return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function filteredDrinks() {
    var s = state();
    var q = normalize(s.search || '').trim();
    var counts = S.stats().counts;
    var mk = s.market;
    var list = D.available().filter(function (d) {
      if (s.category !== 'Todos' && d.category !== s.category) return false;
      if (s.tag !== 'Todos' && d.tags.indexOf(s.tag) < 0) return false;
      if (q && normalize(d.name).indexOf(q) < 0 && normalize(d.description).indexOf(q) < 0 &&
          normalize(d.tags.join(' ')).indexOf(q) < 0) return false;
      return true;
    });
    function vs(d) { return (mk[d.id].price - d.price) / d.price; }
    if (s.sort === 'nombre') list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (s.sort === 'precio-asc') list.sort(function (a, b) { return mk[a.id].price - mk[b.id].price; });
    if (s.sort === 'precio-desc') list.sort(function (a, b) { return mk[b.id].price - mk[a.id].price; });
    if (s.sort === 'consumo') list.sort(function (a, b) { return (counts[b.id] || 0) - (counts[a.id] || 0); });
    if (s.sort === 'oportunidad') list.sort(function (a, b) { return vs(a) - vs(b); });
    if (s.sort === 'subas') list.sort(function (a, b) { return vs(b) - vs(a); });
    return list;
  }

  function renderMenu() {
    var s = state();
    renderTabs();
    renderChips();
    els['sort-select'].value = s.sort;
    if (els.search.value !== s.search) els.search.value = s.search;
    var density = s.density || 'comfort';
    els['drink-grid'].className = 'drink-grid ' + density;
    document.querySelectorAll('#density-switch button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.density === density);
    });

    var counts = S.stats().counts;
    var list = filteredDrinks();
    els['drink-grid'].innerHTML = list.map(function (d) {
      var m = s.market[d.id];
      var ch = S.lastChange(d.id);
      var units = counts[d.id] || 0;
      var vs = (m.price - d.price) / d.price * 100;
      var dem = S.demand(d.id).units;
      var badge = S.crashActive() ? '<span class="cost-badge">A COSTO</span>' : vs <= -8 ? '<span class="deal-badge">OPORTUNIDAD</span>' : dem >= 4 ? '<span class="hot-badge">EN ALZA</span>' : '';
      var prev = prevPrices[d.id];
      var changed = prev !== undefined && prev !== m.price ? (m.price > prev ? ' tick-up' : ' tick-down') : '';
      prevPrices[d.id] = m.price;
      var sernova = d.category !== 'Tragos';
      return '<article class="drink-card' + (s.selectedId === d.id ? ' selected' : '') + (sernova ? ' signature' : '') + changed + '" data-id="' + esc(d.id) + '">' +
        '<div class="card-top">' +
          '<span class="cat-badge' + (sernova ? '' : ' trago') + '">' + (sernova ? 'SERNOVA' : 'TRAGO') + '</span>' +
          badge +
          (units ? '<span class="qty-badge" title="Consumidos en esta mesa">×' + units + '</span>' : '') +
        '</div>' +
        '<h3>' + esc(d.name) + '</h3>' +
        '<p class="card-desc">' + esc(d.description) + '</p>' +
        '<div class="card-spark">' + C.sparkline(m.history) + '</div>' +
        '<div class="card-price-row">' +
          '<span class="card-price">' + D.money(m.price) + '</span>' +
          '<span class="delta ' + dirCls(ch.dir) + '">' + arrow(ch.dir) + ' ' + D.pct(ch.pct) + '</span>' +
        '</div>' +
        '<div class="card-actions">' +
          '<button type="button" data-action="select" data-id="' + esc(d.id) + '" title="Ver gráfico" aria-label="Ver gráfico de ' + esc(d.name) + '"><svg><use href="#i-chart"/></svg></button>' +
          '<button type="button" data-action="detail" data-id="' + esc(d.id) + '">Cantidad</button>' +
          '<button type="button" class="add" data-action="add" data-id="' + esc(d.id) + '" aria-label="Registrar 1 ' + esc(d.name) + '">+ Registrar</button>' +
        '</div>' +
      '</article>';
    }).join('');
    els['empty-menu'].hidden = list.length > 0;
  }

  /* ------------------------------------------------------------ resumen */
  function renderSummary() {
    var s = state();
    var st = S.stats();
    animateNumber(els['total-value'], shownTotal, st.total, D.money);
    if (st.total !== shownTotal) flash(els['total-value'], st.total > shownTotal ? 'up' : 'down');
    shownTotal = st.total;
    els['total-caption'].textContent = st.operations
      ? plural(st.operations, 'operación', 'operaciones') + ' · ' + plural(st.units, 'unidad', 'unidades')
      : 'Sin consumos registrados';
    els['total-split'].innerHTML = st.total
      ? '<span>Por persona <b>' + D.money(Math.ceil(st.total / Math.max(1, s.guests) / 10) * 10) + '</b></span>' +
        '<span class="' + (st.savings >= 0 ? 'up' : 'down') + '">' + (st.savings >= 0 ? 'Ahorro ' : 'Sobreprecio ') + '<b>' + D.money(Math.abs(st.savings)) + '</b> vs. carta</span>'
      : '';

    var star = null, starQty = 0;
    Object.keys(st.counts).forEach(function (id) {
      if (st.counts[id] > starQty) { starQty = st.counts[id]; star = drinkName(id); }
    });

    els['kpi-grid'].innerHTML =
      '<div class="kpi"><span>Unidades</span><strong>' + st.units + '</strong></div>' +
      '<div class="kpi"><span>Precio medio</span><strong>' + D.money(st.avg) + '</strong></div>' +
      '<div class="kpi"><span>Subidas</span><strong class="up">▲ ' + st.ups + '</strong></div>' +
      '<div class="kpi"><span>Bajadas</span><strong class="down">▼ ' + st.downs + '</strong></div>' +
      '<div class="kpi wide"><span>Trago estrella</span><strong class="star">' +
        (star ? esc(star) + ' <em>' + starQty + ' u.</em>' : '—') + '</strong></div>';

    var total = 0;
    Object.keys(st.byCategory).forEach(function (k) { total += st.byCategory[k]; });
    var p1 = total ? (st.byCategory['Cocktails Sernova'] || 0) / total * 100 : 0;
    var p2 = total ? 100 - p1 : 0;
    els['share-bar'].innerHTML = '<span class="sernova" style="width:' + p1 + '%"></span>' +
      '<span class="tragos" style="width:' + p2 + '%"></span>';
    els['share-legend'].innerHTML = total
      ? '<i class="sw sernova"></i>' + Math.round(p1) + '% Sernova <i class="sw tragos"></i>' + Math.round(p2) + '% Tragos'
      : 'Sin datos';

    els['mobile-total'].textContent = D.money(st.total);
    els['mobile-count'].textContent = st.operations;
    $('btn-bill').disabled = !st.operations;
  }

  /* ------------------------------------------------------------- ticket */
  function renderLedger() {
    var s = state();
    els['ledger-count'].textContent = s.entries.length;
    els['btn-undo'].disabled = !s.entries.length;
    els['btn-export'].disabled = !s.entries.length;
    els['btn-clear'].disabled = !s.entries.length;

    if (!s.entries.length) {
      els['ledger-list'].innerHTML = '<div class="ledger-empty"><svg><use href="#i-receipt"/></svg><span>Todavía no se registró ningún trago.</span><small>Tocá «+ Registrar» en la carta.</small></div>';
    } else {
      els['ledger-list'].innerHTML = s.entries.slice().reverse().map(function (e, i) {
        var cls = e.deltaPct > 0 ? 'up' : e.deltaPct < 0 ? 'down' : 'flat';
        return '<div class="ledger-row' + (i === 0 ? ' newest' : '') + '">' +
          '<span class="ledger-time">' + D.clock(e.ts) + '</span>' +
          '<div class="ledger-mid"><div class="ledger-name">' + esc(e.name) + '</div>' +
            '<div class="ledger-sub">' + e.qty + ' × ' + D.money(e.unitPrice) + ' <span class="delta ' + cls + '">' + arrow(cls) + ' ' + D.pct(e.deltaPct) + '</span></div></div>' +
          '<div class="ledger-right">' +
            '<span class="ledger-amount">' + D.money(e.subtotal) + '</span>' +
            '<button type="button" class="ledger-del" data-action="remove" data-id="' + esc(e.id) + '" title="Quitar" aria-label="Quitar ' + esc(e.name) + '">×</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    var counts = S.stats().counts;
    var ranked = Object.keys(counts).map(function (id) { return { id: id, qty: counts[id] }; })
      .sort(function (a, b) { return b.qty - a.qty; }).slice(0, 5);
    var max = ranked.length ? ranked[0].qty : 1;
    els['ranking-list'].innerHTML = ranked.length
      ? ranked.map(function (r, i) {
          return '<div class="rank-row' + (i === 0 ? ' first' : '') + '">' +
            '<span class="rank-pos">' + (i + 1) + '</span>' +
            '<span class="rank-name">' + esc(drinkName(r.id)) + '</span>' +
            '<span class="rank-qty">' + r.qty + ' u.</span>' +
            '<div class="rank-track"><i style="width:' + (r.qty / max * 100) + '%"></i></div>' +
          '</div>';
        }).join('')
      : '<div class="ledger-empty small"><span>El ranking aparece después del primer consumo.</span></div>';
  }

  function renderMovers() {
    var mv = S.movers();
    if (!mv.length) { els['movers-list'].innerHTML = ''; return; }
    var up = mv.slice(0, 3).filter(function (x) { return x.pct > 0; });
    var down = mv.slice(-3).reverse().filter(function (x) { return x.pct < 0; });
    function row(x) {
      var cls = x.pct > 0 ? 'up' : 'down';
      return '<button type="button" class="mover-row" data-action="select" data-id="' + esc(x.id) + '">' +
        '<span>' + esc(x.name) + '</span><b>' + D.money(x.price) + '</b><em class="' + cls + '">' + arrow(cls) + ' ' + D.pct(x.pct) + '</em></button>';
    }
    els['movers-list'].innerHTML =
      '<div class="movers-col"><p class="movers-h up">Más caros hoy</p>' + (up.map(row).join('') || '<p class="movers-none">Ninguno sobre carta</p>') + '</div>' +
      '<div class="movers-col"><p class="movers-h down">Oportunidades</p>' + (down.map(row).join('') || '<p class="movers-none">Ninguno bajo carta</p>') + '</div>';
  }

  function renderAll() {
    renderHeader();
    renderTicker();
    renderSelect();
    renderMarket();
    renderMenu();
    renderSummary();
    renderLedger();
    renderMovers();
    updateCountdowns();
  }

  function renderMarketSide() {
    renderTicker(); renderSelect(); renderMarket(); renderMenu(); renderSummary(); renderMovers(); updateCountdowns();
  }

  /* -------------------------------------------------------------- toast */
  function toast(title, detail, kind, action) {
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.setAttribute('role', kind === 'down' ? 'alert' : 'status');
    el.innerHTML = '<i class="toast-bar"></i><div><strong>' + esc(title) + '</strong>' + (detail ? '<small>' + esc(detail) + '</small>' : '') + '</div>' +
      (action ? '<button type="button" class="toast-action">' + esc(action.label) + '</button>' : '') +
      '<button type="button" class="toast-close" aria-label="Cerrar">×</button>';
    var timer;
    function dismiss() {
      clearTimeout(timer);
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 260);
    }
    el.querySelector('.toast-close').addEventListener('click', dismiss);
    if (action) el.querySelector('.toast-action').addEventListener('click', function () { action.run(); dismiss(); });
    els.toasts.appendChild(el);
    while (els.toasts.children.length > 4) els.toasts.firstChild.remove();
    timer = setTimeout(dismiss, action ? 6000 : 3600);
  }

  function showBanner(kind, text) {
    clearTimeout(bannerTimer);
    var b = els['market-banner'];
    b.hidden = false;
    b.className = 'market-banner ' + (kind === 'rally' ? 'rally' : 'crash');
    b.innerHTML = '<strong>' + (kind === 'rally' ? '▲ SUBIDA GENERAL' : '▼ CAÍDA GENERAL') + '</strong><span>' + esc(text) + '</span>';
    var fl = els['crash-flash'];
    fl.className = 'crash-flash';
    void fl.offsetWidth;
    fl.className = 'crash-flash on ' + (kind === 'rally' ? 'rally' : 'crash');
    vibrate(kind === 'rally' ? 60 : [80, 60, 80]);
    bannerTimer = setTimeout(function () { if (!b.classList.contains('atcost')) b.hidden = true; }, 6500);
  }

  /* ------------------------------------------------------------ diálogos */
  function focusables(root) {
    return Array.prototype.filter.call(root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'), function (el) {
      return !el.disabled && el.offsetParent !== null;
    });
  }

  function trapFocus(ev, root) {
    if (ev.key !== 'Tab' || !root) return;
    var list = focusables(root);
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }

  function openDialog(html, opts) {
    opts = opts || {};
    if (!els['modal-root'].innerHTML) lastFocus = document.activeElement;
    els['modal-root'].innerHTML =
      '<div class="modal-backdrop" data-action="modal-close">' +
        '<div class="modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(opts.label || 'Diálogo') + '">' +
          '<button class="icon-btn xs modal-x" type="button" data-action="modal-close" aria-label="Cerrar">×</button>' +
          html +
        '</div>' +
      '</div>';
    dialogClose = opts.onClose || null;
    var root = els['modal-root'].querySelector('.modal');
    var target = root.querySelector('[autofocus]') || root.querySelector('.btn.primary') || focusables(root)[0];
    if (target) setTimeout(function () { target.focus(); }, 30);
  }

  function closeDialog() {
    if (!els['modal-root'] || !els['modal-root'].innerHTML) return;
    els['modal-root'].innerHTML = '';
    modalDrinkId = null;
    askCallback = null;
    if (dialogClose) { var cb = dialogClose; dialogClose = null; cb(); }
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }

  /* Reemplazo de window.confirm con diseño propio. */
  function ask(opts, cb) {
    openDialog(
      '<div class="ask ' + (opts.danger ? 'danger' : '') + '">' +
        '<div class="ask-icon">' + (opts.danger ? '!' : '?') + '</div>' +
        '<h2>' + esc(opts.title) + '</h2>' +
        '<p>' + esc(opts.text || '') + '</p>' +
        '<div class="modal-actions">' +
          '<button type="button" class="btn ghost" data-action="modal-close">' + esc(opts.cancel || 'Cancelar') + '</button>' +
          '<button type="button" class="btn ' + (opts.danger ? 'danger solid' : 'primary') + '" data-action="ask-ok" autofocus>' + esc(opts.confirm || 'Confirmar') + '</button>' +
        '</div>' +
      '</div>', { label: opts.title });
    askCallback = cb;
  }

  /* ------------------------------------------------------- detalle trago */
  function openModal(id) {
    var s = state();
    var d = D.byId(id);
    if (!d) return;
    var m = s.market[id];
    var ch = S.lastChange(id);
    var vs = (m.price - d.price) / d.price * 100;
    openDialog(
      '<p class="eyebrow">Registrar consumo</p>' +
      '<h2>' + esc(d.name) + '</h2>' +
      '<p class="muted">' + esc(d.description) + '</p>' +
      '<div class="modal-quote"><div class="modal-price ' + dirCls(ch.dir) + '">' + D.money(m.price) + '</div>' +
        '<span class="change-pill ' + dirCls(ch.dir) + '">' + arrow(ch.dir) + ' ' + D.pct(ch.pct) + '</span>' +
        '<span class="muted small">' + D.pct(vs) + ' vs. carta</span></div>' +
      '<div class="modal-spark">' + C.sparkline(m.history, 24) + '</div>' +
      '<div class="modal-stats">' +
        '<div><span>Máx.</span><b>' + D.money(m.high) + '</b></div>' +
        '<div><span>Mín.</span><b>' + D.money(m.low) + '</b></div>' +
        '<div><span>Demanda</span><b>' + S.demand(id).units + ' u.</b></div>' +
        '<div><span>Carta</span><b>' + D.money(d.price) + '</b></div>' +
      '</div>' +
      '<div class="qty-picker">' +
        '<button type="button" class="step-btn" data-action="modal-step" data-step="-1" aria-label="Menos">−</button>' +
        '<output id="modal-qty" aria-live="polite">1</output>' +
        '<button type="button" class="step-btn" data-action="modal-step" data-step="1" aria-label="Más">+</button>' +
      '</div>' +
      '<div class="qty-quick">' + [2, 3, 4, 6, 10].map(function (q) {
        return '<button type="button" class="chip" data-action="modal-set" data-qty="' + q + '">×' + q + '</button>';
      }).join('') + '</div>' +
      (S.crashActive()
        ? '<p class="modal-note cost">Precio de costo: se cobra <b>' + D.money(m.price) + '</b> por unidad durante ' + S.crashLeft() + ' s más.</p>'
        : '<p class="modal-note">Se cobra a <b>' + D.money(m.price) + '</b> por unidad; el precio sube después de registrar.</p>') +
      '<div class="modal-actions">' +
        '<button type="button" class="btn ghost" data-action="modal-close">Cancelar</button>' +
        '<button type="button" class="btn primary" data-action="modal-add">Registrar <span id="modal-total">' + D.money(m.price) + '</span></button>' +
      '</div>', { label: 'Registrar ' + d.name });
    modalDrinkId = id;
    modalQty = 1;
  }

  function setModalQty(q) {
    modalQty = Math.max(1, Math.min(30, q));
    var out = $('modal-qty');
    if (out) out.textContent = modalQty;
    var total = $('modal-total');
    if (total && modalDrinkId) total.textContent = D.money(state().market[modalDrinkId].price * modalQty);
  }

  /* ---------------------------------------------------------------- cuenta */
  function billHtml() {
    var s = state();
    var b = S.billSummary();
    var lines = S.groupedEntries();
    return '<p class="eyebrow">Mesa ' + esc(s.table) + ' · ' + D.clock(s.startedAt) + ' a ' + D.clock(Date.now()) + '</p>' +
      '<h2>Cuenta de la mesa</h2>' +
      '<div class="bill-lines">' + (lines.length ? lines.map(function (l) {
        return '<div class="bill-line"><span><b>' + l.qty + '×</b> ' + esc(l.name) + '</span><i>' + D.money(l.unitPrice) + '</i><strong>' + D.money(l.subtotal) + '</strong></div>';
      }).join('') : '<div class="ledger-empty small"><span>Sin consumos.</span></div>') + '</div>' +
      '<div class="bill-controls">' +
        '<div class="field"><span class="field-label">Propina</span><div class="segmented" id="tip-switch">' +
          [0, 10, 15, 20].map(function (p) {
            return '<button type="button" data-action="tip" data-tip="' + p + '" class="' + (b.tipPct === p ? 'active' : '') + '">' + (p ? p + '%' : 'Sin') + '</button>';
          }).join('') + '</div></div>' +
        '<div class="field"><span class="field-label">Dividir entre</span><div class="stepper sm">' +
          '<button type="button" class="step-btn" data-action="bill-guests" data-step="-1" aria-label="Menos personas">−</button>' +
          '<output>' + b.guests + '</output>' +
          '<button type="button" class="step-btn" data-action="bill-guests" data-step="1" aria-label="Más personas">+</button></div></div>' +
      '</div>' +
      '<div class="bill-totals">' +
        '<div><span>Subtotal</span><b>' + D.money(b.subtotal) + '</b></div>' +
        '<div><span>Propina ' + b.tipPct + '%</span><b>' + D.money(b.tip) + '</b></div>' +
        (b.savings ? '<div class="' + (b.savings > 0 ? 'up' : 'down') + '"><span>' + (b.savings > 0 ? 'Ahorro vs. carta' : 'Sobreprecio vs. carta') + '</span><b>' + D.money(Math.abs(b.savings)) + '</b></div>' : '') +
        '<div class="grand"><span>Total</span><b>' + D.money(b.total) + '</b></div>' +
        '<div class="per"><span>Por persona (' + b.guests + ')</span><b>' + D.money(b.perPerson) + '</b></div>' +
      '</div>' +
      '<div class="modal-actions three">' +
        '<button type="button" class="btn ghost" data-action="print-bill"' + (lines.length ? '' : ' disabled') + '><svg><use href="#i-receipt"/></svg> Imprimir</button>' +
        '<button type="button" class="btn ghost" data-action="export"' + (lines.length ? '' : ' disabled') + '><svg><use href="#i-download"/></svg> CSV</button>' +
        '<button type="button" class="btn primary" data-action="close-table"' + (lines.length ? '' : ' disabled') + '>Cobrar y cerrar mesa</button>' +
      '</div>';
  }

  function openBill() {
    if (!state().entries.length) { toast('Sin consumos', 'Registrá al menos un trago para ver la cuenta.', 'info'); return; }
    openDialog(billHtml(), { wide: true, label: 'Cuenta de la mesa' });
  }

  function refreshBill() {
    var m = els['modal-root'].querySelector('.modal');
    if (!m) return;
    var x = m.querySelector('.modal-x').outerHTML;
    m.innerHTML = x + billHtml();
  }

  function printBill() {
    var s = state();
    var b = S.billSummary();
    var lines = S.groupedEntries();
    els['print-root'].innerHTML =
      '<div class="receipt">' +
        '<h1>SERNOVA EXCHANGE</h1>' +
        '<p>Mesa ' + esc(s.table) + (s.waiter ? ' · ' + esc(s.waiter) : '') + '</p>' +
        '<p>' + new Date().toLocaleString('es-AR') + '</p>' +
        '<hr>' +
        lines.map(function (l) {
          return '<div class="r-line"><span>' + l.qty + ' × ' + esc(l.name) + '</span><span>' + D.money(l.subtotal) + '</span></div>' +
            '<div class="r-sub">' + D.money(l.unitPrice) + ' c/u</div>';
        }).join('') +
        '<hr>' +
        '<div class="r-line"><span>Subtotal</span><span>' + D.money(b.subtotal) + '</span></div>' +
        (b.tip ? '<div class="r-line"><span>Propina ' + b.tipPct + '%</span><span>' + D.money(b.tip) + '</span></div>' : '') +
        '<div class="r-line r-total"><span>TOTAL</span><span>' + D.money(b.total) + '</span></div>' +
        (b.guests > 1 ? '<div class="r-line"><span>Por persona (' + b.guests + ')</span><span>' + D.money(b.perPerson) + '</span></div>' : '') +
        (b.savings > 0 ? '<p class="r-note">Ahorraste ' + D.money(b.savings) + ' frente al precio de carta.</p>' : '') +
        '<hr><p class="r-note">¡Gracias por jugar al mercado!</p>' +
      '</div>';
    window.print();
  }

  function closeTable() {
    var t = state().table;
    var total = S.billSummary().total;
    S.endSession();
    closeDialog();
    closeAdmin();
    openSetup('');
    toast('Mesa ' + t + ' cerrada', 'Cobro de ' + D.money(total) + ' archivado.', 'info');
  }

  /* --------------------------------------------------------------- ayuda */
  function openHelp() {
    var rows = [
      ['/', 'Buscar trago'], ['Ctrl + Z', 'Deshacer último consumo'], ['C', 'Ver cuenta'],
      ['G', 'Ir al gráfico'], ['T', 'Tema oscuro / claro'], ['A', 'Panel de administrador'],
      ['?', 'Esta ayuda'], ['Esc', 'Cerrar diálogos']
    ];
    openDialog('<p class="eyebrow">Atajos</p><h2>Teclado</h2><div class="kbd-list">' + rows.map(function (r) {
      return '<div><kbd>' + r[0] + '</kbd><span>' + r[1] + '</span></div>';
    }).join('') + '</div>', { label: 'Atajos de teclado' });
  }

  /* -------------------------------------------------------------- admin */
  var ADMIN_TABS = [['mercado', 'Mercado'], ['carta', 'Carta y precios'], ['mesas', 'Mesas'], ['reportes', 'Reportes'], ['sistema', 'Sistema'], ['acceso', 'Acceso']];

  function adminShell(content) {
    var scroll = els['admin-root'].querySelector('.admin-body');
    var top = scroll ? scroll.scrollTop : 0;
    var tabs = S.isAdmin()
      ? '<nav class="admin-tabs" role="tablist">' + ADMIN_TABS.map(function (t) {
          return '<button type="button" role="tab" aria-selected="' + (adminTab === t[0]) + '" data-admin-action="tab" data-tab="' + t[0] + '" class="' + (adminTab === t[0] ? 'active' : '') + '">' + t[1] + '</button>';
        }).join('') + '</nav>'
      : '';
    els['admin-root'].innerHTML =
      '<div class="admin-backdrop" data-admin-action="close">' +
        '<div class="admin-panel" role="dialog" aria-modal="true" aria-label="Panel de administrador">' +
          '<div class="admin-top"><div class="admin-top-l"><div class="brand-mark sm gold"><svg><use href="#i-shield"/></svg></div><div><p class="eyebrow gold">Acceso restringido</p><h2>Panel de administrador</h2></div></div>' +

          '<button class="icon-btn" type="button" data-admin-action="close" aria-label="Cerrar panel">×</button></div>' +
          tabs +
          '<div class="admin-body">' + content + '</div>' +
        '</div>' +
      '</div>';
    var nb = els['admin-root'].querySelector('.admin-body');
    if (nb && scroll) nb.scrollTop = top;
  }

  function card(title, body, cls) {
    return '<div class="admin-card' + (cls ? ' ' + cls : '') + '"><h3>' + title + '</h3>' + body + '</div>';
  }

  function adminLogin() {
    var s = state();
    var locked = S.lockRemaining();
    var hint = '';
    return '<form class="admin-login" data-admin-form="login" autocomplete="on">' +
      '<div class="login-icon"><svg><use href="#i-lock"/></svg></div>' +
      '<h3>Ingresar como administrador</h3>' +
      '<p>Mercado, carta, precios, mesas, reportes y seguridad.</p>' +
      '<label class="field"><span class="field-label">Usuario</span><input id="admin-user" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" ' + (locked ? '' : 'autofocus') + ' /></label>' +
      '<label class="field"><span class="field-label">Contraseña</span><input id="admin-pass" type="password" autocomplete="current-password" ' + (locked ? 'disabled' : '') + ' /></label>' +
      (locked ? '<p class="admin-error">Demasiados intentos. Probá de nuevo en <b id="lock-left">' + locked + '</b> s.</p>' : '') +
      '<button class="btn primary block" type="submit" data-admin-action="login"' + (locked ? ' disabled' : '') + '>Entrar al panel</button>' + hint +
      '</form>';
  }

  function adminMercado() {
    var s = state();
    var a = s.admin;
    var paused = a.paused;
    var count = D.available().length;
    var mv = S.movers();
    var avg = mv.length ? mv.reduce(function (acc, x) { return acc + x.pct; }, 0) / mv.length : 0;
    return '<div class="admin-stats">' +
        '<div><span>Estado</span><b class="' + (paused ? 'down' : 'up') + '">' + (paused ? 'PAUSADO' : 'ACTIVO') + '</b></div>' +
        '<div><span>' + (S.crashActive() ? 'Precio de costo' : 'Próxima caída') + '</span><b id="admin-countdown" class="' + (S.crashActive() ? 'down' : '') + '">--:--</b></div>' +
        '<div><span>Índice vs. carta</span><b class="' + (avg >= 0 ? 'up' : 'down') + '">' + D.pct(avg) + '</b></div>' +
        '<div><span>Tragos activos</span><b>' + count + '</b></div>' +
      '</div>' +
      '<div class="admin-grid">' +
      card('Ajustes automáticos', '<p>Cada ' + Math.round(a.tickMs / 1000) + ' s los precios se ajustan según la demanda. En pausa también se congela la cuenta regresiva.</p>' +
        '<button class="btn ' + (paused ? 'primary' : '') + '" data-admin-action="pause">' + (paused ? 'Reanudar mercado' : 'Pausar mercado') + '</button>') +
      card('Caída a precio de costo', '<p>Los ' + count + ' tragos activos pasan a su <b>precio de costo</b> durante ' + Math.round(a.crashDurationMs / 1000) + ' s y luego vuelven al precio que tenían. Sucede sola cada ' + Math.round(a.crashMs / 1000) + ' s.</p>' +
        (S.crashActive()
          ? '<button class="btn" data-admin-action="stop-crash">Terminar precio de costo ahora</button>'
          : '<button class="btn danger" data-admin-action="crash">Forzar caída a costo</button>')) +
      card('Subida general', '<p>Todos los precios activos suben un ' + a.rallyPct + '% de una vez.</p>' +
        '<button class="btn gold" data-admin-action="rally">Forzar subida +' + a.rallyPct + '%</button>') +
      card('Restablecer precios', '<p>Devuelve la carta a sus precios base sin borrar consumos.</p>' +
        '<button class="btn" data-admin-action="reset">Volver a precio de carta</button>') +
      card('Cerrar mesa ' + esc(s.table || '—'), '<p>Archiva el ticket (' + plural(s.entries.length, 'consumo', 'consumos') + ') y vuelve a la pantalla de mesa.</p>' +
        '<button class="btn danger" data-admin-action="close-table"' + (s.entries.length ? '' : ' disabled') + '>Cerrar y archivar</button>') +
      card('Reglas del mercado',
        '<div class="form-grid">' +
          '<label><span>Caída cada (s)</span><input id="admin-crash-sec" type="number" min="30" max="3600" value="' + Math.round(a.crashMs / 1000) + '" /></label>' +
          '<label><span>Duración a costo (s)</span><input id="admin-duration-sec" type="number" min="10" max="600" value="' + Math.round(a.crashDurationMs / 1000) + '" /></label>' +
          '<label><span>Costo por defecto (% de carta)</span><input id="admin-cost-pct" type="number" min="5" max="100" value="' + a.costPct + '" /></label>' +
          '<label><span>Ajuste cada (s)</span><input id="admin-tick-sec" type="number" min="5" max="300" value="' + Math.round(a.tickMs / 1000) + '" /></label>' +
          '<label><span>Subida (%)</span><input id="admin-rally-pct" type="number" min="1" max="50" step="0.5" value="' + a.rallyPct + '" /></label>' +
        '</div><button class="btn primary" data-admin-action="set-rules">Aplicar reglas</button>') +
      '</div>';
  }

  function adminPrecios() {
    var s = state();
    var options = D.CATEGORIES.filter(function (c) { return c !== 'Todos'; }).map(function (cat) {
      return '<optgroup label="' + esc(cat) + '">' + D.DRINKS.filter(function (d) { return d.category === cat; })
        .map(function (d) { return '<option value="' + esc(d.id) + '">' + esc(d.name) + (d.enabled === false ? ' (inactivo)' : '') + '</option>'; }).join('') + '</optgroup>';
    }).join('');
    var rows = D.DRINKS.map(function (d) {
      var price = s.market[d.id] ? s.market[d.id].price : d.price;
      var diff = d.price ? (price - d.price) / d.price * 100 : 0;
      var off = d.enabled === false;
      return '<tr class="' + (off ? 'off' : '') + '"><td>' + esc(d.name) + (d.custom ? ' <span class="tag-custom">propio</span>' : '') + '</td>' +
        '<td><input type="number" class="table-input" value="' + d.price + '" data-base-id="' + esc(d.id) + '" aria-label="Precio base de ' + esc(d.name) + '" /></td>' +
        '<td><input type="number" class="table-input' + (d.cost ? '' : ' default-cost') + '" value="' + (d.cost || '') + '" placeholder="' + S.costOf(d) + '" data-cost-id="' + esc(d.id) + '" aria-label="Costo de ' + esc(d.name) + '" title="' + (d.cost ? 'Costo cargado' : 'Vacío = ' + s.admin.costPct + '% del precio de carta') + '" /></td>' +
        '<td>' + D.money(price) + '</td>' +
        '<td class="' + (diff > 0 ? 'up' : diff < 0 ? 'down' : '') + '">' + D.pct(diff) + '</td>' +
        '<td class="actions"><button class="btn xs" data-admin-action="set-base" data-id="' + esc(d.id) + '">Guardar</button>' +
        '<button class="btn xs" data-admin-action="price-step" data-id="' + esc(d.id) + '" data-step="-5">−5%</button>' +
        '<button class="btn xs" data-admin-action="price-step" data-id="' + esc(d.id) + '" data-step="5">+5%</button>' +
        '<label class="switch" title="' + (off ? 'Inactivo' : 'Activo') + '"><input type="checkbox" data-admin-toggle="' + esc(d.id) + '"' + (off ? '' : ' checked') + ' /><i></i></label>' +
        (d.custom ? '<button class="btn xs danger" data-admin-action="delete-drink" data-id="' + esc(d.id) + '" aria-label="Eliminar">×</button>' : '') +
        '</td></tr>';
    }).join('');
    return '<div class="admin-grid">' +
      card('Fijar precio actual', '<p>Queda registrado en el gráfico como «Ajuste admin».</p>' +
        '<select id="admin-price-select">' + options + '</select>' +
        '<input id="admin-price-value" type="number" min="0" step="10" placeholder="Nuevo precio ($)" />' +
        '<button class="btn primary" data-admin-action="apply-price">Aplicar precio</button>') +
      card('Agregar trago', '<p>Se suma a la carta, al ticker, al gráfico y a la TV.</p>' +
        '<input id="new-drink-name" type="text" maxlength="40" placeholder="Nombre del trago" />' +
        '<div class="form-grid"><input id="new-drink-price" type="number" min="1000" step="100" placeholder="Precio ($)" />' +
        '<select id="new-drink-category"><option>Tragos</option><option>Cocktails Sernova</option></select></div>' +
        '<select id="new-drink-tag">' + D.TAGS.filter(function (t) { return t !== 'Todos'; }).map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('') + '</select>' +
        '<input id="new-drink-cost" type="number" min="10" step="100" placeholder="Costo ($, opcional)" />' +
        '<input id="new-drink-desc" type="text" maxlength="140" placeholder="Descripción (opcional)" />' +
        '<button class="btn primary" data-admin-action="add-drink">Crear trago</button>') +
      '</div>' +
      card('Carta completa <small>' + D.DRINKS.length + ' tragos · ' + D.available().length + ' activos</small>',
        '<p>Editá el precio base y el <b>costo</b> (el precio al que cae cada trago en la caída; vacío = ' + s.admin.costPct + '% del precio de carta), ajustá el actual o desactivá tragos.</p>' +
        '<input type="search" id="admin-filter" class="admin-filter" placeholder="Filtrar tragos…" />' +
        '<div class="admin-table-scroll"><table class="admin-table"><thead><tr><th>Trago</th><th>Base</th><th>Costo</th><th>Actual</th><th>Dif.</th><th>Acciones</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<button class="btn danger" data-admin-action="reset-catalog">Restablecer carta original</button>');
  }

  function adminMesas() {
    var s = state();
    var archive = S.getArchive();
    if (adminArchiveView) {
      var rec = archive.filter(function (r) { return r.id === adminArchiveView; })[0];
      if (rec) {
        var rows = rec.entries.slice().reverse().map(function (e) {
          return '<tr><td>' + D.clock(e.ts) + '</td><td>' + esc(e.name) + '</td><td>' + e.qty + '</td><td>' + D.money(e.unitPrice) + '</td><td>' + D.money(e.subtotal) + '</td></tr>';
        }).join('');
        return '<button class="btn sm" data-admin-action="archive-back">← Volver a mesas</button>' +
          card('Mesa ' + esc(rec.table) + ' · ' + D.money(rec.total),
            '<p>' + plural(rec.operations, 'operación', 'operaciones') + ' · ' + plural(rec.units, 'unidad', 'unidades') + ' · ' +
            new Date(rec.startedAt).toLocaleDateString('es-AR') + ' ' + D.clock(rec.startedAt) + ' a ' + D.clock(rec.closedAt) +
            (rec.waiter ? ' · ' + esc(rec.waiter) : '') + (rec.tip ? ' · propina ' + D.money(rec.tip) : '') + '</p>' +
            '<div class="admin-table-scroll"><table class="admin-table"><thead><tr><th>Hora</th><th>Trago</th><th>Cant.</th><th>Unit.</th><th>Subtotal</th></tr></thead><tbody>' + rows + '</tbody></table></div>');
      }
      adminArchiveView = null;
    }
    var list = archive.length ? archive.map(function (r) {
      return '<div class="admin-row"><div class="admin-row-main"><strong>Mesa ' + esc(r.table) + ' <b>' + D.money(r.total) + '</b></strong>' +
        '<small>' + new Date(r.closedAt || r.startedAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' · ' + plural(r.operations, 'consumo', 'consumos') + (r.waiter ? ' · ' + esc(r.waiter) : '') + '</small></div>' +
        '<div class="admin-row-actions"><button class="btn xs" data-admin-action="archive-view" data-id="' + esc(r.id) + '">Ver</button>' +
        '<button class="btn xs" data-admin-action="restore" data-id="' + esc(r.id) + '">Restaurar</button>' +
        '<button class="btn xs danger" data-admin-action="archive-delete" data-id="' + esc(r.id) + '">Borrar</button></div></div>';
    }).join('') : '<div class="ledger-empty small"><span>No hay mesas archivadas todavía.</span></div>';
    return card('Mesa activa', '<p>' + (s.table ? 'Mesa ' + esc(s.table) + ' · ' + plural(s.entries.length, 'consumo', 'consumos') + ' · ' + D.money(S.stats().total) : 'Sin mesa abierta') + '</p>') +
      '<div class="admin-list-head"><h3>Archivo <small>' + archive.length + ' mesas</small></h3>' +
      (archive.length ? '<div><button class="btn xs" data-admin-action="archive-csv">Exportar CSV</button> <button class="btn xs danger" data-admin-action="archive-clear">Vaciar</button></div>' : '') + '</div>' +
      '<div class="admin-list">' + list + '</div>';
  }

  function adminReportes() {
    var start = new Date(); start.setHours(start.getHours() < 6 ? -18 : 6, 0, 0, 0);
    var r = S.report(start.getTime());
    var hours = Object.keys(r.byHour).map(Number).sort(function (a, b) { return ((a + 18) % 24) - ((b + 18) % 24); });
    var maxH = Math.max.apply(null, hours.map(function (h) { return r.byHour[h]; }).concat([1]));
    var maxTop = r.top.length ? r.top[0].amount : 1;
    var waiters = Object.keys(r.byWaiter).sort(function (a, b) { return r.byWaiter[b] - r.byWaiter[a]; });
    return '<p class="muted small">Jornada desde ' + start.toLocaleString('es-AR', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) + ' · incluye la mesa activa y las archivadas.</p>' +
      '<div class="admin-stats">' +
        '<div><span>Facturación</span><b>' + D.money(r.revenue) + '</b></div>' +
        '<div><span>Mesas</span><b>' + r.tables + '</b></div>' +
        '<div><span>Ticket medio</span><b>' + D.money(r.avgTicket) + '</b></div>' +
        '<div><span>Margen estimado</span><b class="' + (r.margin >= 0 ? 'up' : 'down') + '">' + D.money(r.margin) + '</b></div>' +
        '<div><span>Vendidos a costo</span><b>' + r.atCostUnits + ' u.</b></div>' +
        '<div><span>Unidades</span><b>' + r.units + '</b></div>' +
        '<div><span>Propinas</span><b>' + D.money(r.tips) + '</b></div>' +
      '</div>' +
      '<div class="admin-grid two">' +
        card('Ventas por hora', hours.length ? '<div class="hbars">' + hours.map(function (h) {
          return '<div class="hbar"><i style="height:' + Math.max(4, r.byHour[h] / maxH * 100) + '%" title="' + D.money(r.byHour[h]) + '"></i><span>' + String(h).padStart(2, '0') + '</span></div>';
        }).join('') + '</div>' : '<p>Sin ventas en la jornada.</p>') +
        card('Tragos más vendidos', r.top.length ? '<div class="toplist">' + r.top.slice(0, 8).map(function (t, i) {
          return '<div class="toprow"><span>' + (i + 1) + '. ' + esc(t.name) + '</span><b>' + D.money(t.amount) + '</b><small>' + t.qty + ' u.</small><i style="width:' + (t.amount / maxTop * 100) + '%"></i></div>';
        }).join('') + '</div>' : '<p>Sin ventas en la jornada.</p>') +
      '</div>' +
      (waiters.length ? card('Por responsable', '<div class="toplist">' + waiters.map(function (w) {
        return '<div class="toprow"><span>' + esc(w) + '</span><b>' + D.money(r.byWaiter[w]) + '</b></div>';
      }).join('') + '</div>') : '');
  }

  function adminSistema() {
    var s = state();
    var st = Sync.getStatus();
    var log = s.admin.log.slice(0, 20).map(function (e) {
      return '<div class="log-row"><time>' + D.clock(e.ts) + '</time><strong>' + esc(e.action) + '</strong><small>' + esc(e.detail || '—') + '</small></div>';
    }).join('') || '<div class="ledger-empty small"><span>Sin acciones administrativas registradas.</span></div>';
    return '<div class="admin-grid">' +
      card('Mesa activa', '<p>Modificá la mesa, comensales y responsable sin perder el ticket.</p>' +
        '<input id="admin-table-input" type="text" maxlength="20" value="' + esc(s.table) + '" placeholder="Mesa" />' +
        '<input id="admin-guests-input" type="number" min="1" max="40" value="' + s.guests + '" placeholder="Comensales" />' +
        '<input id="admin-waiter-input" type="text" maxlength="30" value="' + esc(s.waiter) + '" placeholder="Responsable" />' +
        '<button class="btn primary" data-admin-action="set-session">Guardar datos</button>') +
      card('Pantalla de televisores', '<p>Elegí qué trago se muestra en grande. Con «Auto» la TV rota cada 12 s.</p>' +
        '<select id="tv-focus-select"><option value="">Auto · rotación</option>' +
          D.available().map(function (d) {
            return '<option value="' + esc(d.id) + '"' + (s.tvFocusId === d.id ? ' selected' : '') + '>' + esc(d.name) + '</option>';
          }).join('') + '</select>' +
        '<button class="btn" data-admin-action="tv-focus">Fijar trago en TV</button>' +
        '<button class="btn" data-admin-action="tv-rotate">Rotación: ' + (s.tvRotate !== false ? 'ACTIVA' : 'DETENIDA') + '</button>' +
        '<button class="btn primary" data-admin-action="open-tv">Abrir pantalla TV</button>') +
      card('Sincronización', '<p>Estado: <b class="sync-' + esc(st.state) + '">' + esc({ local: 'solo local', idle: 'conectando', online: 'en línea', offline: 'sin servidor', auth: 'falta clave', error: 'error' }[st.state] || st.state) + '</b>' +
        (st.error ? ' · ' + esc(st.error) : '') + '</p>' +
        '<p>' + (Sync.isLocalHost ? 'Esta terminal corre en la computadora del servidor: la clave se carga sola.' : 'Para publicar desde este equipo, ingresá la clave que muestra el servidor al iniciar.') + '</p>' +
        '<input id="sync-key" type="text" maxlength="16" autocomplete="off" spellcheck="false" placeholder="Clave de publicación" value="' + esc(Sync.getKey()) + '" />' +
        '<button class="btn" data-admin-action="save-key">Guardar clave y reintentar</button>') +
      card('Respaldo', '<p>Descargá o restaurá todos los datos: sesión, archivo de mesas y carta.</p>' +
        '<button class="btn" data-admin-action="backup">Descargar respaldo (.json)</button>' +
        '<label class="btn file-btn">Importar respaldo<input type="file" id="backup-file" accept="application/json,.json" /></label>') +
      card('Apariencia', '<p>Tema de esta terminal.</p>' +
        '<div class="btn-row"><button class="btn" data-admin-action="theme" data-theme="dark">Oscuro</button>' +
        '<button class="btn" data-admin-action="theme" data-theme="light">Claro</button></div>') +
      '</div>' +
      card('Registro de acciones <small>' + s.admin.log.length + ' guardadas</small>', '<div class="log-list">' + log + '</div>') +
      card('Zona crítica', '<p>Borra mesas, archivo, carta personalizada, contraseña y sesión actual de este dispositivo.</p>' +
        '<button class="btn danger" data-admin-action="wipe">Borrar todos los datos</button>', 'critical');
  }

  function adminAcceso() {
    var s = state();
    return '<div class="admin-grid">' +
      card('Cambiar contraseña', '<p>Se guarda como SHA-256 con sal en este dispositivo. Mínimo 4 caracteres.</p>' +
        '<input id="admin-cur-pass" type="password" placeholder="Contraseña actual" autocomplete="current-password" />' +
        '<input id="admin-new-pass" type="password" placeholder="Nueva contraseña" autocomplete="new-password" />' +
        '<input id="admin-new-pass2" type="password" placeholder="Repetir nueva contraseña" autocomplete="new-password" />' +
        '<button class="btn primary" data-admin-action="change-password">Guardar contraseña</button>') +
      card('Usuario', '<p>Cambiá el nombre de acceso. Por seguridad no se muestra el actual.</p>' +
        '<input id="admin-new-user" type="text" maxlength="24" placeholder="Nuevo usuario" autocomplete="off" />' +
        '<button class="btn" data-admin-action="change-user">Cambiar usuario</button>') +
      card('Sesión administrativa', '<p>La sesión se cierra sola tras ' + Math.round(S.ADMIN_IDLE_MS / 60000) + ' min sin actividad o al cerrar el navegador.</p>' +
        '<button class="btn" data-admin-action="logout">Cerrar sesión admin</button>') +
      '</div>' +
      '<p class="muted small">El acceso admin es una protección local de demostración: no reemplaza un sistema de cobro ni protege datos reales.</p>';
  }

  function renderAdmin() {
    if (!els['admin-root'].innerHTML) return;
    var content = !S.isAdmin() ? adminLogin()
      : adminTab === 'carta' ? adminPrecios()
      : adminTab === 'mesas' ? adminMesas()
      : adminTab === 'reportes' ? adminReportes()
      : adminTab === 'sistema' ? adminSistema()
      : adminTab === 'acceso' ? adminAcceso()
      : adminMercado();
    adminShell(content);
    updateCountdowns();
    if (S.isAdmin() && adminTab === 'mercado') updateCountdowns();
    var auto = els['admin-root'].querySelector('[autofocus]');
    if (auto) setTimeout(function () { auto.focus(); }, 30);
  }

  function openAdmin(tab) {
    if (!els['admin-root'].innerHTML) lastFocus = document.activeElement;
    adminTab = tab || 'mercado';
    adminArchiveView = null;
    if (!state()) S.ensureSystemState();
    adminShell('');
    renderAdmin();
  }

  function closeAdmin() {
    if (!els['admin-root'].innerHTML) return;
    els['admin-root'].innerHTML = '';
    adminArchiveView = null;
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }

  /* Pantalla TV integrada: funciona siempre, con o sin servidor. */
  function openTv() {
    if (!state()) S.ensureSystemState();
    closeAdmin();
    closeDialog();
    var ov = $('tv-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'tv-overlay';
      ov.className = 'tv-overlay';
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-modal', 'true');
      ov.setAttribute('aria-label', 'Pantalla de televisores');
      ov.innerHTML =
        '<div class="tv-overlay-bar">' +
          '<span class="tv-overlay-title"><svg><use href="#i-tv"/></svg> Pantalla TV <small>en vivo</small></span>' +
          '<div class="tv-overlay-actions">' +
            '<button type="button" class="btn ghost sm" data-tv="window">Abrir en otra ventana</button>' +
            '<button type="button" class="btn ghost sm" data-tv="full">Pantalla completa</button>' +
            '<button type="button" class="icon-btn" data-tv="close" aria-label="Cerrar pantalla TV">×</button>' +
          '</div>' +
        '</div>' +
        '<iframe data-sernova-tv title="Pantalla de televisores" src="tv.html" allow="fullscreen; screen-wake-lock" allowfullscreen></iframe>';
      document.body.appendChild(ov);
      ov.querySelector('iframe').addEventListener('load', function () { if (state()) S.save(); });
      ov.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-tv]');
        if (!b) return;
        if (b.dataset.tv === 'close') closeTv();
        if (b.dataset.tv === 'full') {
          var el = ov.querySelector('iframe');
          var req = el.requestFullscreen || el.webkitRequestFullscreen;
          if (req) { try { var pr = req.call(el); if (pr && pr.catch) pr.catch(function () { toast('Pantalla completa no disponible', 'El navegador no lo permite en esta página.', 'down'); }); } catch (e) { /* noop */ } }
        }
        if (b.dataset.tv === 'window') {
          var win = null;
          try { win = window.open('tv.html', 'sernova-tv'); } catch (e) { win = null; }
          if (!win) toast('No se pudo abrir otra ventana', 'Usá la pantalla integrada o permití ventanas emergentes.', 'down');
        }
      });
      lastFocus = document.activeElement;
    }
    ov.hidden = false;
    document.body.classList.add('tv-open');
    if (state()) S.save();
    setTimeout(function () { var c = ov.querySelector('[data-tv="close"]'); if (c) c.focus(); }, 50);
  }

  function closeTv() {
    var ov = $('tv-overlay');
    if (!ov || ov.hidden) return false;
    ov.hidden = true;
    document.body.classList.remove('tv-open');
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    return true;
  }

  function download(name, content, type) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function stamp() {
    var d = new Date();
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' +
      String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
  }

  function afterAdminChange() {
    if (S.hasSession() && !els.app.hidden) renderAll();
    renderAdmin();
  }

  function doLogin() {
    var user = $('admin-user') ? $('admin-user').value : '';
    var pass = $('admin-pass') ? $('admin-pass').value : '';
    var res = S.login(user, pass);
    if (res.ok) {
      toast('Acceso concedido', 'Panel de administrador habilitado.', 'info');
      if (S.hasSession() && !els.app.hidden) renderHeader();
      renderAdmin();
    } else if (res.locked) {
      toast('Acceso bloqueado', 'Esperá ' + res.remaining + ' s antes de reintentar.', 'down');
      renderAdmin();
    } else {
      toast('Acceso denegado', 'Usuario o contraseña incorrectos · ' + plural(res.attemptsLeft, 'intento restante', 'intentos restantes') + '.', 'down');
      var p = $('admin-pass');
      if (p) { p.value = ''; p.focus(); p.closest('.field').classList.add('shake'); setTimeout(function () { p.closest('.field').classList.remove('shake'); }, 450); }
    }
  }

  function onAdminAction(ev) {
    var target = ev.target.closest('[data-admin-action]');
    if (!target || !els['admin-root'].contains(target)) return;
    var action = target.dataset.adminAction;

    if (action === 'close') {
      if (ev.target !== target && !target.classList.contains('icon-btn')) return;
      closeAdmin();
      return;
    }
    if (action === 'login') { ev.preventDefault(); doLogin(); return; }
    if (!S.isAdmin()) { renderAdmin(); return; }
    S.touchAdmin();
    var s = state();

    switch (action) {
      case 'tab':
        adminTab = target.dataset.tab;
        adminArchiveView = null;
        renderAdmin();
        break;
      case 'pause':
        S.setPaused(!s.admin.paused);
        afterAdminChange();
        toast('Mercado ' + (state().admin.paused ? 'pausado' : 'reanudado'), state().admin.paused ? 'Ajustes y cuenta regresiva congelados.' : 'Los ajustes automáticos volvieron.', 'info');
        break;
      case 'crash':
        if (S.forceCrash()) {
          showBanner('crash', 'Toda la carta a precio de costo por ' + Math.round(s.admin.crashDurationMs / 1000) + ' s');
          toast('Caída a precio de costo', D.available().length + ' tragos al costo durante ' + Math.round(s.admin.crashDurationMs / 1000) + ' s.', 'down');
        }
        afterAdminChange();
        break;
      case 'stop-crash':
        if (S.stopCrash()) toast('Precio de costo terminado', 'Los tragos volvieron a su precio anterior.', 'info');
        afterAdminChange();
        break;
      case 'rally':
        if (S.forceRally()) {
          showBanner('rally', 'Todos los precios subieron ' + s.admin.rallyPct + '%');
          toast('Subida general ejecutada', D.available().length + ' tragos subieron de precio.', 'info');
        }
        afterAdminChange();
        break;
      case 'reset':
        S.resetMarket();
        afterAdminChange();
        toast('Precios restablecidos', 'Toda la carta volvió al precio original.', 'info');
        break;
      case 'close-table':
        ask({ title: 'Cerrar mesa ' + s.table, text: 'El ticket se archiva y la terminal vuelve a la pantalla de mesa.', confirm: 'Cerrar y archivar', danger: true }, closeTable);
        break;
      case 'set-rules':
        S.setMarketRules({
          crashSec: $('admin-crash-sec').value, tickSec: $('admin-tick-sec').value,
          durationSec: $('admin-duration-sec').value, costPct: $('admin-cost-pct').value,
          rallyPct: $('admin-rally-pct').value
        });
        afterAdminChange();
        toast('Reglas aplicadas', 'Precio de costo ' + Math.round(state().admin.crashDurationMs / 1000) + ' s cada ' + Math.round(state().admin.crashMs / 1000) + ' s · ajuste cada ' + Math.round(state().admin.tickMs / 1000) + ' s.', 'info');
        break;
      case 'apply-price': {
        var sel = $('admin-price-select'), val = $('admin-price-value');
        if (S.adminSetPrice(sel.value, val.value)) {
          afterAdminChange();
          toast('Precio actualizado', D.byId(sel.value).name + ' → ' + D.money(state().market[sel.value].price), 'info');
        } else toast('Precio sin cambios', 'Ingresá un valor distinto (entre 35% y 230% del precio de carta).', 'down');
        break;
      }
      case 'price-step': {
        var id = target.dataset.id, step = parseInt(target.dataset.step, 10);
        S.adminSetPrice(id, s.market[id].price * (1 + step / 100));
        afterAdminChange();
        break;
      }
      case 'set-base': {
        var bid = target.dataset.id;
        var input = els['admin-root'].querySelector('[data-base-id="' + bid + '"]');
        var costIn = els['admin-root'].querySelector('[data-cost-id="' + bid + '"]');
        var costVal = costIn ? costIn.value : '';
        if (S.setBasePrice(bid, input ? input.value : 0)) {
          S.setCost(bid, costVal);
          afterAdminChange();
          toast('Trago guardado', D.byId(bid).name + ' · carta ' + D.money(D.byId(bid).price) + ' · costo ' + D.money(S.costOf(D.byId(bid))), 'info');
        } else toast('Precio base inválido', 'Usá un número entre 1.000 y 500.000.', 'down');
        break;
      }
      case 'delete-drink': {
        var did = target.dataset.id, dname = D.byId(did).name;
        ask({ title: 'Eliminar ' + dname, text: 'Se quita de la carta. Los consumos ya registrados se conservan.', confirm: 'Eliminar', danger: true }, function () {
          S.deleteCustomDrink(did); afterAdminChange(); toast('Trago eliminado', dname, 'info');
        });
        break;
      }
      case 'add-drink': {
        var created = S.addCustomDrink({
          name: $('new-drink-name').value, price: $('new-drink-price').value,
          category: $('new-drink-category').value,
          tags: [$('new-drink-tag').value],
          description: $('new-drink-desc').value,
          cost: $('new-drink-cost').value
        });
        if (created) {
          afterAdminChange();
          toast('Trago creado', created.name + ' · ' + D.money(created.price), 'info');
        } else toast('No se pudo crear', 'Ingresá un nombre y un precio de al menos $ 1.000.', 'down');
        break;
      }
      case 'reset-catalog':
        ask({ title: 'Restablecer carta original', text: 'Se quitan los tragos creados y los cambios de precio base y disponibilidad.', confirm: 'Restablecer', danger: true }, function () {
          S.resetCatalog(); afterAdminChange();
          toast('Carta original restaurada', D.DRINKS.length + ' tragos iniciales.', 'info');
        });
        break;
      case 'restore':
        ask({ title: 'Restaurar mesa', text: 'Esa mesa pasa a ser la sesión activa. Si hay un ticket abierto, se archiva primero.', confirm: 'Restaurar' }, function () {
          if (S.restoreArchive(target.dataset.id)) {
            closeAdmin(); startApp();
            toast('Mesa restaurada', 'Mesa ' + state().table + ' · ' + plural(state().entries.length, 'consumo', 'consumos') + '.', 'info');
          }
        });
        break;
      case 'set-session':
        S.setSessionInfo($('admin-table-input').value, $('admin-guests-input').value, $('admin-waiter-input').value);
        afterAdminChange();
        toast('Datos de mesa actualizados', 'Mesa ' + state().table + ' · ' + plural(state().guests, 'comensal', 'comensales') + '.', 'info');
        break;
      case 'theme':
        applyTheme(target.dataset.theme);
        S.setTheme(target.dataset.theme);
        afterAdminChange();
        break;
      case 'wipe':
        ask({ title: '¿Borrar todos los datos?', text: 'Se eliminan sesión, archivo de mesas, carta personalizada y contraseña configurada. No se puede deshacer.', confirm: 'Borrar todo', danger: true }, function () {
          S.wipeAll(); window.location.reload();
        });
        break;
      case 'tv-focus':
        S.setPref('tvFocusId', $('tv-focus-select').value);
        renderAdmin();
        toast('TV actualizada', $('tv-focus-select').value ? 'Trago fijado en pantalla grande.' : 'Rotación automática.', 'info');
        break;
      case 'tv-rotate':
        S.setPref('tvRotate', s.tvRotate === false);
        renderAdmin();
        toast('Rotación de TV', state().tvRotate !== false ? 'Activada cada 12 segundos.' : 'Detenida.', 'info');
        break;
      case 'open-tv':
        openTv();
        break;
      case 'save-key':
        Sync.setKey($('sync-key').value);
        S.save();
        toast('Clave guardada', 'Reintentando la publicación…', 'info');
        setTimeout(renderAdmin, 900);
        break;
      case 'backup':
        download('sernova-respaldo-' + stamp() + '.json', S.exportBackup(), 'application/json');
        toast('Respaldo descargado', 'Guardalo en un lugar seguro.', 'info');
        break;
      case 'archive-csv':
        download('sernova-archivo-' + stamp() + '.csv', S.exportArchiveCsv(), 'text/csv;charset=utf-8');
        break;
      case 'archive-view':
        adminArchiveView = target.dataset.id;
        renderAdmin();
        break;
      case 'archive-back':
        adminArchiveView = null;
        renderAdmin();
        break;
      case 'archive-delete':
        ask({ title: 'Borrar mesa del archivo', text: 'El registro se quita definitivamente.', confirm: 'Borrar', danger: true }, function () {
          S.deleteArchive(target.dataset.id); openAdmin('mesas');
          toast('Mesa eliminada del archivo', '', 'info');
        });
        break;
      case 'archive-clear':
        ask({ title: 'Vaciar archivo', text: 'Se borran todas las mesas archivadas.', confirm: 'Vaciar', danger: true }, function () {
          S.clearArchive(); openAdmin('mesas');
        });
        break;
      case 'change-password': {
        var np = $('admin-new-pass').value, np2 = $('admin-new-pass2').value;
        if (np !== np2) { toast('Las contraseñas no coinciden', 'Repetí la nueva contraseña.', 'down'); break; }
        var res = S.changePassword($('admin-cur-pass').value, np);
        if (res.ok) { renderAdmin(); toast('Contraseña actualizada', 'Se guardó el nuevo acceso admin.', 'info'); }
        else toast('No se pudo cambiar', res.error, 'down');
        break;
      }
      case 'change-user':
        if (S.changeUser($('admin-new-user').value)) { renderAdmin(); toast('Usuario actualizado', 'Usá el nuevo usuario la próxima vez que ingreses.', 'info'); }
        else toast('Usuario inválido', 'Usá al menos 3 caracteres (letras, números, . _ -).', 'down');
        break;
      case 'logout':
        S.logout();
        if (S.hasSession() && !els.app.hidden) renderHeader();
        renderAdmin();
        toast('Sesión admin cerrada', 'Volviste al modo usuario.', 'info');
        break;
    }
  }

  function onAdminChange(ev) {
    var t = ev.target;
    if (t.dataset && t.dataset.adminToggle && S.isAdmin()) {
      var id = t.dataset.adminToggle;
      S.setEnabled(id, t.checked);
      afterAdminChange();
      toast(t.checked ? 'Trago activado' : 'Trago desactivado', D.byId(id).name, 'info');
    }
    if (t.id === 'backup-file' && t.files && t.files[0] && S.isAdmin()) {
      var reader = new FileReader();
      reader.onload = function () {
        var text = reader.result;
        ask({ title: 'Importar respaldo', text: 'Se reemplazan la sesión actual, el archivo de mesas y la carta por los del archivo.', confirm: 'Importar', danger: true }, function () {
          var res = S.importBackup(text);
          if (res.ok) { closeAdmin(); if (S.hasSession()) startApp(); else openSetup(); toast('Respaldo importado', 'Datos restaurados.', 'info'); }
          else toast('No se pudo importar', res.error, 'down');
        });
      };
      reader.readAsText(t.files[0]);
    }
  }

  function onAdminInput(ev) {
    if (ev.target.id !== 'admin-filter') return;
    var q = normalize(ev.target.value);
    els['admin-root'].querySelectorAll('.admin-table tbody tr').forEach(function (tr) {
      tr.hidden = q && normalize(tr.firstChild.textContent).indexOf(q) < 0;
    });
  }

  /* ------------------------------------------------------------- acciones */
  function addDrink(id, qty, sourceEl) {
    var result = S.purchase(id, qty);
    if (!result) return;
    var sign = result.tick.dir === 'up' ? '▲' : result.tick.dir === 'down' ? '▼' : '■';
    var entryId = result.entry.id;
    toast('+' + result.entry.qty + ' ' + result.drink.name,
      result.entry.qty + ' × ' + D.money(result.entry.unitPrice) + ' · precio ' + sign + ' ' + D.pct(result.entry.deltaPct) + ' → ' + D.money(result.tick.price),
      'up', { label: 'Deshacer', run: function () { if (S.removeEntry(entryId)) { renderAll(); toast('Consumo deshecho', result.drink.name, 'info'); } } });
    vibrate(18);
    S.setPref('selectedId', id);
    renderAll();
    if (sourceEl) {
      var card2 = els['drink-grid'].querySelector('.drink-card[data-id="' + id + '"]');
      if (card2) { card2.classList.add('added'); setTimeout(function () { card2.classList.remove('added'); }, 700); }
    }
  }

  function exportCsv() {
    download('sernova-mesa-' + state().table.replace(/[^\w-]+/g, '-') + '-' + stamp() + '.csv', S.exportCsv(), 'text/csv;charset=utf-8');
    toast('CSV exportado', plural(state().entries.length, 'consumo descargado', 'consumos descargados') + '.', 'info');
  }

  function onAction(ev) {
    var target = ev.target.closest('[data-action]');
    if (!target) return;
    var action = target.dataset.action;
    var id = target.dataset.id;

    switch (action) {
      case 'table': selectTable(target.dataset.table); break;
      case 'select':
        S.setPref('selectedId', id);
        renderMarket(); renderMenu();
        $('market-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      case 'add': addDrink(id, 1, target); break;
      case 'detail': openModal(id); break;
      case 'remove': {
        var removed = S.removeEntry(id);
        renderAll();
        if (removed) toast('Consumo quitado', removed.name + ' · ' + D.money(removed.subtotal) + '. El precio se recalculó.', 'info');
        break;
      }
      case 'undo': {
        var undone = S.undo();
        if (undone) {
          renderAll();
          toast('Último consumo deshecho', undone.name + ' · ' + D.money(undone.subtotal), 'info');
        }
        break;
      }
      case 'clear':
        if (state().entries.length) {
          ask({ title: 'Vaciar ticket de la mesa ' + state().table, text: 'Se quitan todos los consumos y sus movimientos de precio.', confirm: 'Vaciar ticket', danger: true }, function () {
            var n = S.clearLedger();
            renderAll();
            toast('Ticket vaciado', plural(n, 'consumo eliminado', 'consumos eliminados') + '.', 'info');
          });
        }
        break;
      case 'export': exportCsv(); break;
      case 'bill': openBill(); break;
      case 'tip': S.setPref('tipPct', parseInt(target.dataset.tip, 10)); refreshBill(); break;
      case 'bill-guests':
        S.setGuests(state().guests + parseInt(target.dataset.step, 10));
        refreshBill(); renderHeader(); renderSummary();
        break;
      case 'print-bill': printBill(); break;
      case 'close-table':
        ask({ title: 'Cobrar y cerrar mesa ' + state().table, text: 'Total ' + D.money(S.billSummary().total) + '. El ticket se archiva y la terminal vuelve a la selección de mesa.', confirm: 'Cerrar mesa' }, closeTable);
        break;
      case 'go-ticket': els['ledger-panel'].scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
      case 'category': S.setPref('category', target.dataset.value); renderMenu(); break;
      case 'tag': S.setPref('tag', target.dataset.value); renderMenu(); break;
      case 'reset-filters':
        S.setPref('category', 'Todos'); S.setPref('tag', 'Todos'); S.setPref('search', '');
        renderMenu();
        break;
      case 'modal-step': setModalQty(modalQty + parseInt(target.dataset.step, 10)); break;
      case 'modal-set': setModalQty(parseInt(target.dataset.qty, 10)); break;
      case 'modal-add':
        if (modalDrinkId) {
          var drinkId = modalDrinkId, q = modalQty;
          closeDialog();
          addDrink(drinkId, q);
        }
        break;
      case 'ask-ok': {
        var cb = askCallback;
        askCallback = null;
        closeDialog();
        if (cb) cb();
        break;
      }
      case 'modal-close':
        if (target.classList.contains('modal-backdrop') && ev.target !== target) return;
        closeDialog();
        break;
    }
  }

  /* ------------------------------------------------------ loop de mercado */
  function startMarketLoop() {
    clearInterval(marketTimer);
    marketTimer = setInterval(function () {
      if (!S.hasSession()) return;
      if (!els.app.hidden) updateCountdowns();
      // El panel admin abierto se cierra si expira la sesión.
      if (els['admin-root'].innerHTML && !S.isAdmin() && !els['admin-root'].querySelector('.admin-login')) {
        renderAdmin();
        if (!els.app.hidden) renderHeader();
        toast('Sesión admin expirada', 'Volvé a ingresar para continuar.', 'down');
      }
      var lock = $('lock-left');
      if (lock) { var r = S.lockRemaining(); if (r) lock.textContent = r; else renderAdmin(); }
      if (els.app.hidden) return;
      var result = S.marketTick();
      if (result.paused || result.idle) return;
      if (result.crashed) {
        showBanner('crash', 'Toda la carta a precio de costo por ' + Math.round(result.durationMs / 1000) + ' s');
        toast('¡Caída a precio de costo!', 'Todos los tragos al costo durante ' + Math.round(result.durationMs / 1000) + ' s.', 'down');
      }
      if (result.recovered) toast('Terminó el precio de costo', 'Los tragos volvieron a su precio anterior.', 'info');
      renderMarketSide();
      if (els['admin-root'].innerHTML && (adminTab === 'carta' || adminTab === 'mercado') &&
          !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) renderAdmin();
      if (els['modal-root'].querySelector('.bill-lines')) refreshBill();
    }, 1000);
  }

  /* ------------------------------------------------- pedidos del club */
  // Los pedidos que hacen los clientes desde el celular mueven el mercado.
  function startClubWatch() {
    var Club = window.SernovaClub;
    if (!Club) return;
    var busyClub = false;
    function check() {
      if (busyClub || !S.hasSession() || els.app.hidden) return;
      busyClub = true;
      Club.call('public').then(function (r) {
        busyClub = false;
        if (!r || !r.ok) return;
        var s = state();
        var applied = S.clubApplied();
        var from = Math.max(s.startedAt, Date.now() - 10 * 60 * 1000);
        var fresh = (r.data.recentOrders || []).filter(function (o) {
          return o.status !== 'cancelado' && o.ts >= from && applied.indexOf(o.id) < 0;
        }).reverse();
        if (!fresh.length) return;
        fresh.forEach(function (o) {
          if (S.externalPurchase(o)) toast('Pedido del club · Mesa ' + o.table, o.qty + '× ' + o.drinkName + ' (pagado con saldo)', 'up');
        });
        renderMarketSide();
      }, function () { busyClub = false; });
    }
    Club.onChange(function (src) { if (src !== 'market') setTimeout(check, 100); });
    setInterval(check, 4000);
    setTimeout(check, 800);
  }

  /* --------------------------------------------------------------- wire */
  function wire() {
    document.addEventListener('click', onAction);
    document.addEventListener('click', onAdminAction);
    document.addEventListener('change', onAdminChange);
    document.addEventListener('input', onAdminInput);
    document.addEventListener('submit', function (ev) {
      if (ev.target.dataset.adminForm === 'login') { ev.preventDefault(); doLogin(); }
    });

    els['btn-admin'].addEventListener('click', function () { openAdmin(); });
    els['btn-admin-setup'].addEventListener('click', function () { openAdmin(); });
    els['btn-tv'].addEventListener('click', openTv);
    els['btn-tv-setup'].addEventListener('click', openTv);
    els['btn-help'].addEventListener('click', openHelp);
    els['table-pill'].addEventListener('click', function () { openSetup(); });
    els['btn-quick-add'].addEventListener('click', function () { addDrink(els['btn-quick-add'].dataset.id, 1); });

    els['btn-open'].addEventListener('click', function () {
      if (!setupTable) {
        toast('Falta la mesa', 'Elegí un número de mesa o escribí uno personalizado.', 'down');
        els['table-grid'].classList.add('shake');
        setTimeout(function () { els['table-grid'].classList.remove('shake'); }, 450);
        return;
      }
      var go = function () {
        S.createSession(setupTable, setupGuests, els.waiter.value);
        startApp();
        toast('Mesa ' + setupTable + ' abierta', 'Ya podés registrar los tragos que se consuman.', 'info');
      };
      if (S.hasSession() && state().entries.length) {
        ask({ title: 'Abrir mesa ' + setupTable, text: 'La sesión actual (mesa ' + state().table + ', ' + plural(state().entries.length, 'consumo', 'consumos') + ') se archiva y el mercado se reinicia.', confirm: 'Archivar y abrir' }, go);
      } else go();
    });

    els['btn-continue'].addEventListener('click', function () {
      if (!S.hasSession()) return;
      startApp();
      toast('Sesión recuperada', 'Mesa ' + state().table + ' · ' + plural(state().entries.length, 'consumo', 'consumos') + '.', 'info');
    });

    document.querySelectorAll('[data-setup-step]').forEach(function (b) {
      b.addEventListener('click', function () {
        setupGuests = Math.max(1, Math.min(40, setupGuests + parseInt(b.dataset.setupStep, 10)));
        els['guests-value'].textContent = setupGuests;
      });
    });

    els['custom-table'].addEventListener('input', function () {
      if (els['custom-table'].value.trim()) selectTable(els['custom-table'].value, true);
      else selectTable('');
    });
    els['custom-table'].addEventListener('keydown', function (ev) { if (ev.key === 'Enter') els['btn-open'].click(); });

    els['btn-theme'].addEventListener('click', toggleTheme);
    els['btn-lock'].addEventListener('click', function () { openSetup(); });
    els['btn-new'].addEventListener('click', function () {
      var s = state();
      ask({ title: 'Nueva sesión en la mesa ' + s.table, text: 'El ticket actual se archiva y el mercado se reinicia.', confirm: 'Empezar de nuevo' }, function () {
        S.createSession(s.table, s.guests, s.waiter);
        prevPrices = {};
        shownTotal = 0;
        renderAll();
        toast('Nueva sesión iniciada', 'La sesión anterior quedó archivada.', 'info');
      });
    });

    els['market-select'].addEventListener('change', function () {
      S.setPref('selectedId', els['market-select'].value);
      renderMarket(); renderMenu();
    });
    els['sort-select'].addEventListener('change', function () {
      S.setPref('sort', els['sort-select'].value);
      renderMenu();
    });
    els.search.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { S.setPref('search', els.search.value); renderMenu(); }, 120);
    });
    els.search.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        var list = filteredDrinks();
        if (list.length === 1) { addDrink(list[0].id, 1); els.search.select(); }
      }
      if (ev.key === 'Escape') { els.search.value = ''; S.setPref('search', ''); renderMenu(); els.search.blur(); }
    });

    els['mode-switch'].addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      S.setPref('mode', b.dataset.mode); renderMarket();
    });
    els['range-switch'].addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      S.setPref('range', b.dataset.range); renderMarket();
    });
    els['density-switch'].addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      S.setPref('density', b.dataset.density); renderMenu();
    });

    document.addEventListener('keydown', function (ev) {
      var modal = els['modal-root'].querySelector('.modal');
      var admin = els['admin-root'].querySelector('.admin-panel');
      if (ev.key === 'Escape') {
        if (closeTv()) return;
        if (modal) closeDialog();
        else if (admin) closeAdmin();
        return;
      }
      if (document.body.classList.contains('tv-open')) return;
      if (ev.key === 'Tab') { trapFocus(ev, modal || admin); return; }
      if (modal && modalDrinkId) {
        if (ev.key === '+' || ev.key === 'ArrowUp' || ev.key === 'ArrowRight') { ev.preventDefault(); setModalQty(modalQty + 1); }
        if (ev.key === '-' || ev.key === 'ArrowDown' || ev.key === 'ArrowLeft') { ev.preventDefault(); setModalQty(modalQty - 1); }
        if (ev.key === 'Enter' && document.activeElement.tagName !== 'BUTTON') { ev.preventDefault(); $('modal-root').querySelector('[data-action="modal-add"]').click(); }
        return;
      }
      if (modal || admin) return;
      var typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if (typing || ev.altKey) return;
      var inApp = S.hasSession() && !els.app.hidden;
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'z' || ev.key === 'Z') && inApp) {
        ev.preventDefault();
        var u = S.undo();
        if (u) { renderAll(); toast('Último consumo deshecho', u.name + ' · ' + D.money(u.subtotal), 'info'); }
        return;
      }
      if (ev.ctrlKey || ev.metaKey) return;
      if (ev.key === '/' && inApp) { ev.preventDefault(); els.search.focus(); els.search.select(); }
      else if (ev.key === 't' || ev.key === 'T') toggleTheme();
      else if (ev.key === '?') openHelp();
      else if ((ev.key === 'c' || ev.key === 'C') && inApp) openBill();
      else if ((ev.key === 'g' || ev.key === 'G') && inApp) $('market-panel').scrollIntoView({ behavior: 'smooth' });
      else if (ev.key === 'a' || ev.key === 'A') openAdmin();
    });

    if (window.ResizeObserver) {
      var lastW = 0, ro = new ResizeObserver(function (entries) {
        var w = Math.round(entries[0].contentRect.width);
        if (w && Math.abs(w - lastW) > 4 && S.hasSession() && !els.app.hidden) { lastW = w; renderMarket(); }
      });
      ro.observe(els.chart);
    }

    ['pointerdown', 'keydown'].forEach(function (t) {
      document.addEventListener(t, function () { if (els['admin-root'].innerHTML) S.touchAdmin(); }, { passive: true });
    });

    window.addEventListener('beforeprint', function () { document.body.classList.toggle('printing', !!els['print-root'].innerHTML); });
    window.addEventListener('afterprint', function () { document.body.classList.remove('printing'); els['print-root'].innerHTML = ''; });

    Sync.onStatus(renderSync);
    window.addEventListener('message', function (ev) {
      if (ev.data && ev.data.sernova === 'close-tv') closeTv();
    });
  }

  function init() {
    cacheEls();
    S.load();
    if (state()) S.save();
    applyTheme(state() && state().theme ? state().theme : 'dark');
    wire();
    renderClock();
    setInterval(renderClock, 15000);
    startMarketLoop();
    startClubWatch();
    openSetup();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
