/* ==========================================================================
   Interfaz: mesa, carta, ticket, mercado y panel de administrador.
   ========================================================================== */
(function () {
  'use strict';

  var D = window.SernovaData;
  var S = window.SernovaStore;
  var C = window.SernovaChart;

  var els = {};
  var setupTable = '';
  var setupGuests = 2;
  var modalQty = 1;
  var modalDrinkId = null;
  var adminTab = 'mercado';
  var adminArchiveView = null;
  var bannerTimer = null;
  var marketTimer = null;

  function $(id) { return document.getElementById(id); }

  function cacheEls() {
    [
      'setup', 'app', 'table-grid', 'table-selected-hint', 'custom-table', 'guests-value',
      'waiter', 'saved-hint', 'btn-continue', 'btn-open', 'table-label', 'session-meta',
      'admin-badge', 'btn-admin', 'btn-admin-setup', 'btn-tv', 'btn-tv-setup',
      'btn-theme', 'btn-new', 'btn-lock', 'ticker-track',
      'ticker-clock', 'crash-countdown', 'market-banner', 'market-name', 'market-desc',
      'market-select', 'quote-price', 'quote-change', 'quote-stats', 'chart', 'chart-legend',
      'mode-switch', 'range-switch', 'category-tabs', 'tag-chips', 'sort-select', 'search',
      'drink-grid', 'empty-menu', 'total-value', 'total-caption', 'kpi-grid', 'share-bar',
      'share-legend', 'ledger-count', 'ledger-list', 'btn-undo', 'btn-export', 'btn-clear',
      'ranking-list', 'toasts', 'modal-root', 'admin-root'
    ].forEach(function (id) { els[id] = $(id); });
  }

  function state() { return S.getState(); }

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

  /* ------------------------------------------------------------- tema */
  function applyTheme(theme) { document.documentElement.dataset.theme = theme; }

  function toggleTheme() {
    var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    if (S.hasSession()) S.setTheme(next);
    toast('Tema actualizado', 'Modo ' + (next === 'dark' ? 'oscuro' : 'claro') + ' activado.', 'info');
  }

  /* ----------------------------------------------------------- setup */
  function renderTableGrid() {
    var html = '';
    for (var i = 1; i <= 24; i++) {
      html += '<button type="button" class="table-num' + (setupTable === String(i) ? ' active' : '') +
        '" data-action="table" data-table="' + i + '" aria-pressed="' + (setupTable === String(i)) + '">' +
        String(i).padStart(2, '0') + '</button>';
    }
    els['table-grid'].innerHTML = html;
  }

  function selectTable(value, fromCustom) {
    setupTable = String(value || '').trim();
    if (!fromCustom) els['custom-table'].value = '';
    renderTableGrid();
    els['table-selected-hint'].textContent = setupTable ? 'Mesa seleccionada: ' + setupTable : 'Sin seleccionar';
    updateSavedHint();
  }

  function updateSavedHint() {
    var saved = state();
    var match = S.hasSession() && saved.table === setupTable;
    if (match) {
      els['saved-hint'].hidden = false;
      els['saved-hint'].innerHTML = 'Hay una <strong>sesión guardada</strong> para esta mesa: ' +
        saved.entries.length + ' consumos por ' + D.money(S.stats().total) +
        '. Elegí “Continuar” para recuperarla o “Abrir mesa” para empezar de cero.';
      els['btn-continue'].hidden = false;
    } else {
      els['saved-hint'].hidden = true;
      els['btn-continue'].hidden = true;
    }
  }

  function openSetup(prefill) {
    closeAdmin();
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
    els['table-selected-hint'].textContent = t ? 'Mesa seleccionada: ' + t : 'Sin seleccionar';
    updateSavedHint();
    window.scrollTo(0, 0);
  }

  function startApp() {
    els.setup.hidden = true;
    els.app.hidden = false;
    applyTheme(state().theme || 'dark');
    renderAll();
    window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------ header */
  function renderHeader() {
    var s = state();
    els['table-label'].textContent = s.table;
    var meta = 'Abierta ' + D.clock(s.startedAt) + ' · ' + s.guests + (s.guests === 1 ? ' comensal' : ' comensales');
    if (s.waiter) meta += ' · ' + s.waiter;
    els['session-meta'].textContent = meta;
    els['admin-badge'].hidden = !S.isAdmin();
  }

  function renderClock() {
    els['ticker-clock'].textContent = new Date().toLocaleString('es-AR', {
      weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false
    }).toUpperCase();
  }

  function updateCountdowns() {
    if (!S.hasSession()) return;
    var s = state();
    if (s.admin.paused) {
      els['crash-countdown'].textContent = 'MERCADO EN PAUSA';
    } else {
      var secs = Math.max(0, Math.ceil((s.nextCrashAt - Date.now()) / 1000));
      els['crash-countdown'].textContent = 'CAÍDA GENERAL EN ' + fmtCountdown(secs);
    }
    var ac = $('admin-countdown');
    if (ac) ac.textContent = fmtCountdown(Math.max(0, Math.ceil((s.nextCrashAt - Date.now()) / 1000)));
  }

  /* ------------------------------------------------------------ ticker */
  function renderTicker() {
    var s = state();
    var items = D.available().map(function (d) {
      var ch = S.lastChange(d.id);
      var arrow = ch.dir === 'up' ? '▲' : ch.dir === 'down' ? '▼' : '■';
      var kindTag = ch.kind === 'crash' ? ' · CAÍDA' : ch.kind === 'rally' ? ' · SUBIDA' : '';
      return '<span class="ticker-item"><b>' + d.name + '</b>' +
        '<span class="tp">' + D.money(s.market[d.id].price) + '</span>' +
        '<span class="' + (ch.dir === 'up' ? 'up' : ch.dir === 'down' ? 'down' : '') + '">' +
        arrow + ' ' + D.pct(ch.pct) + kindTag + '</span></span>';
    }).join('');
    els['ticker-track'].innerHTML = items + items;
  }

  /* ------------------------------------------------------------ mercado */
  function renderSelect() {
    var s = state();
    var chosen = D.byId(s.selectedId);
    var first = D.available()[0];
    if ((!chosen || chosen.enabled === false) && first) s.selectedId = first.id;
    var groups = { 'Cocktails Sernova': [], 'Tragos': [] };
    D.available().forEach(function (d) {
      groups[d.category].push('<option value="' + d.id + '">' + d.name + ' · ' + D.money(s.market[d.id].price) + '</option>');
    });
    els['market-select'].innerHTML =
      '<optgroup label="Cocktails Sernova">' + groups['Cocktails Sernova'].join('') + '</optgroup>' +
      '<optgroup label="Tragos">' + groups['Tragos'].join('') + '</optgroup>';
    els['market-select'].value = s.selectedId;
  }

  function statCell(label, value) {
    return '<div class="stat-cell"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function renderLegend(mode) {
    var base = '<span><i class="dot up"></i> Consumo / subida</span>' +
      '<span><i class="dot down"></i> Bajada</span>' +
      '<span><i class="line-key"></i> ' + (mode === 'demanda' ? 'Demanda' : 'Precio') + '</span>' +
      '<span><i class="line-key" style="background:var(--gold)"></i> ' + (mode === 'demanda' ? 'Unidades' : 'Media móvil 5') + '</span>';
    if (mode !== 'demanda') {
      base += '<span><i class="dot" style="background:var(--red)"></i> Caída general</span>' +
        '<span><i class="bar-key"></i> Consumo</span>';
    }
    els['chart-legend'].innerHTML = base;
  }

  function renderMarket() {
    var s = state();
    var drink = D.byId(s.selectedId) || D.DRINKS[0];
    var m = s.market[drink.id];
    var ch = S.lastChange(drink.id);
    var fromOpen = m.open ? (m.price - m.open) / m.open * 100 : 0;
    var ops = m.history.filter(function (h) { return !h.synthetic; });
    var units = ops.filter(function (h) { return h.kind === 'consumo'; }).reduce(function (a, h) { return a + h.qty; }, 0);
    var ups = ops.filter(function (h) { return h.dir === 'up'; }).length;
    var downs = ops.filter(function (h) { return h.dir === 'down'; }).length;
    var dem = S.demand(drink.id);

    els['market-name'].textContent = drink.name;
    els['market-desc'].textContent = drink.description + ' · ' + drink.category;
    els['quote-price'].textContent = D.money(m.price);
    els['quote-price'].style.color = ch.dir === 'up' ? 'var(--green)' : ch.dir === 'down' ? 'var(--red)' : 'var(--text)';

    var arrow = ch.dir === 'up' ? '▲' : ch.dir === 'down' ? '▼' : '■';
    var kindNote = ch.kind === 'crash' ? ' · caída general' : ch.kind === 'rally' ? ' · subida general' : ch.kind === 'admin' ? ' · admin' : '';
    els['quote-change'].innerHTML =
      '<span class="change-pill ' + ch.dir + '">' + arrow + ' ' + D.pct(ch.pct) + '</span>' +
      '<small>Desde apertura: ' + D.pct(fromOpen) + kindNote + '</small>';

    els['quote-stats'].innerHTML =
      statCell('Apertura', D.money(m.open)) +
      statCell('Máximo', D.money(m.high)) +
      statCell('Mínimo', D.money(m.low)) +
      statCell('Consumo', units + ' u.') +
      statCell('Demanda 4 min', dem.units + ' u.') +
      statCell('Subidas / Bajadas', ups + ' / ' + downs);

    C.render(els.chart, drink, m, { mode: s.mode, range: s.range, base: drink.price });
    renderLegend(s.mode);

    document.querySelectorAll('#mode-switch button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.mode === s.mode);
    });
    document.querySelectorAll('#range-switch button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.range === s.range);
    });
  }

  /* -------------------------------------------------------------- carta */
  function renderTabs() {
    var s = state();
    els['category-tabs'].innerHTML = D.CATEGORIES.map(function (cat) {
      var count = cat === 'Todos' ? D.available().length : D.available().filter(function (d) { return d.category === cat; }).length;
      return '<button type="button" role="tab" data-action="category" data-value="' + cat +
        '" class="' + (s.category === cat ? 'active' : '') + '">' + cat + '<span class="tab-count">' + count + '</span></button>';
    }).join('');
  }

  function renderChips() {
    var s = state();
    els['tag-chips'].innerHTML = D.TAGS.map(function (tag) {
      return '<button type="button" class="chip' + (s.tag === tag ? ' active' : '') +
        '" data-action="tag" data-value="' + tag + '">' + tag + '</button>';
    }).join('');
  }

  function filteredDrinks() {
    var s = state();
    var q = (s.search || '').toLowerCase().trim();
    var counts = S.stats().counts;
    var list = D.available().filter(function (d) {
      if (s.category !== 'Todos' && d.category !== s.category) return false;
      if (s.tag !== 'Todos' && d.tags.indexOf(s.tag) < 0) return false;
      if (q && d.name.toLowerCase().indexOf(q) < 0 && d.description.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    if (s.sort === 'nombre') list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (s.sort === 'precio-asc') list.sort(function (a, b) { return state().market[a.id].price - state().market[b.id].price; });
    if (s.sort === 'precio-desc') list.sort(function (a, b) { return state().market[b.id].price - state().market[a.id].price; });
    if (s.sort === 'consumo') list.sort(function (a, b) { return (counts[b.id] || 0) - (counts[a.id] || 0); });
    return list;
  }

  function renderMenu() {
    var s = state();
    renderTabs();
    renderChips();
    els['sort-select'].value = s.sort;
    if (els.search.value !== s.search) els.search.value = s.search;

    var counts = S.stats().counts;
    els['drink-grid'].innerHTML = filteredDrinks().map(function (d) {
      var m = s.market[d.id];
      var ch = S.lastChange(d.id);
      var units = counts[d.id] || 0;
      var arrow = ch.dir === 'up' ? '▲' : ch.dir === 'down' ? '▼' : '■';
      return '<article class="drink-card' + (s.selectedId === d.id ? ' selected' : '') + '">' +
        '<div class="card-top">' +
          '<span class="cat-badge' + (d.category === 'Tragos' ? ' trago' : '') + '">' +
            (d.category === 'Tragos' ? 'TRAGO' : 'SERNOVA') + '</span>' +
          (units ? '<span class="qty-badge">×' + units + ' consumido' + (units > 1 ? 's' : '') + '</span>' : '') +
        '</div>' +
        '<h3>' + d.name + '</h3>' +
        '<p class="card-desc">' + d.description + '</p>' +
        '<div class="card-spark">' + C.sparkline(m.history) + '</div>' +
        '<div class="card-price-row">' +
          '<span class="card-price">' + D.money(m.price) + '</span>' +
          '<span class="delta ' + ch.dir + '">' + arrow + ' ' + D.pct(ch.pct) + '</span>' +
        '</div>' +
        '<div class="card-actions">' +
          '<button type="button" data-action="select" data-id="' + d.id + '">Gráfico</button>' +
          '<button type="button" data-action="detail" data-id="' + d.id + '">Detalle</button>' +
          '<button type="button" class="add" data-action="add" data-id="' + d.id + '">+ Registrar</button>' +
        '</div>' +
      '</article>';
    }).join('');
    els['empty-menu'].hidden = filteredDrinks().length > 0;
  }

  /* ------------------------------------------------------------ resumen */
  function renderSummary() {
    var st = S.stats();
    els['total-value'].textContent = D.money(st.total);
    els['total-caption'].textContent = st.operations
      ? st.operations + (st.operations === 1 ? ' operación · ' : ' operaciones · ') + st.units + ' unidades'
      : 'Sin consumos registrados';

    var star = null, starQty = 0;
    Object.keys(st.counts).forEach(function (id) {
      if (st.counts[id] > starQty) { starQty = st.counts[id]; star = drinkName(id); }
    });

    els['kpi-grid'].innerHTML =
      '<div class="kpi"><span>Unidades</span><strong>' + st.units + '</strong></div>' +
      '<div class="kpi"><span>Precio medio</span><strong>' + D.money(st.avg) + '</strong></div>' +
      '<div class="kpi"><span>Subidas</span><strong class="up">▲ ' + st.ups + '</strong></div>' +
      '<div class="kpi"><span>Bajadas</span><strong class="down">▼ ' + st.downs + '</strong></div>' +
      '<div class="kpi" style="grid-column:1/-1"><span>Trago estrella</span><strong class="star">' +
        (star ? star + ' · ' + starQty + ' u.' : '—') + '</strong></div>';

    var total = st.byCategory['Cocktails Sernova'] + st.byCategory['Tragos'];
    var p1 = total ? st.byCategory['Cocktails Sernova'] / total * 100 : 0;
    var p2 = total ? st.byCategory['Tragos'] / total * 100 : 0;
    els['share-bar'].innerHTML = '<span class="sernova" style="width:' + p1 + '%"></span>' +
      '<span class="tragos" style="width:' + p2 + '%"></span>';
    els['share-legend'].textContent = Math.round(p1) + '% Sernova / ' + Math.round(p2) + '% Tragos';
  }

  /* ------------------------------------------------------------- ticket */
  function renderLedger() {
    var s = state();
    els['ledger-count'].textContent = s.entries.length;
    els['btn-undo'].disabled = !s.entries.length;
    els['btn-export'].disabled = !s.entries.length;
    els['btn-clear'].disabled = !s.entries.length;

    if (!s.entries.length) {
      els['ledger-list'].innerHTML = '<div class="ledger-empty">Todavía no se registró ningún trago.<br>Usá «+ Registrar» en la carta.</div>';
    } else {
      els['ledger-list'].innerHTML = s.entries.slice().reverse().map(function (e) {
        var arrow = e.deltaPct > 0 ? '▲' : e.deltaPct < 0 ? '▼' : '■';
        var cls = e.deltaPct > 0 ? 'up' : e.deltaPct < 0 ? 'down' : 'flat';
        return '<div class="ledger-row">' +
          '<span class="ledger-time">' + D.clock(e.ts) + '</span>' +
          '<div><div class="ledger-name">' + e.name + '</div>' +
            '<div class="ledger-sub">' + e.qty + ' × ' + D.money(e.unitPrice) + '</div></div>' +
          '<div class="ledger-right">' +
            '<div style="display:flex;align-items:center;gap:7px">' +
              '<button type="button" data-action="remove" data-id="' + e.id + '" title="Quitar" aria-label="Quitar ' + e.name + '">×</button>' +
              '<span class="ledger-amount">' + D.money(e.subtotal) + '</span>' +
            '</div>' +
            '<span class="delta ' + cls + '">' + arrow + ' ' + D.pct(e.deltaPct) + '</span>' +
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
          return '<div class="rank-row">' +
            '<span class="rank-pos">' + String(i + 1).padStart(2, '0') + '</span>' +
            '<span class="rank-name">' + drinkName(r.id) + '</span>' +
            '<span class="rank-qty">' + r.qty + ' u.</span>' +
            '<div class="rank-track"><i style="width:' + (r.qty / max * 100) + '%"></i></div>' +
          '</div>';
        }).join('')
      : '<div class="ledger-empty">El ranking aparece después del primer consumo.</div>';
  }

  function renderAll() {
    renderHeader();
    renderTicker();
    renderSelect();
    renderMarket();
    renderMenu();
    renderSummary();
    renderLedger();
    updateCountdowns();
  }

  /* -------------------------------------------------------------- toast */
  function toast(title, detail, kind) {
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.innerHTML = '<strong>' + title + '</strong>' + (detail ? '<small>' + detail + '</small>' : '');
    els.toasts.appendChild(el);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 260);
    }, 3600);
  }

  function showBanner(kind, text) {
    clearTimeout(bannerTimer);
    els['market-banner'].hidden = false;
    els['market-banner'].className = 'market-banner' + (kind === 'rally' ? ' rally' : '');
    els['market-banner'].textContent = text;
    bannerTimer = setTimeout(function () { els['market-banner'].hidden = true; }, 6000);
  }

  /* -------------------------------------------------------------- modal */
  function openModal(id) {
    var s = state();
    var d = D.byId(id);
    if (!d) return;
    modalDrinkId = id;
    modalQty = 1;
    var m = s.market[id];
    var ch = S.lastChange(id);
    els['modal-root'].innerHTML =
      '<div class="modal-backdrop" data-action="modal-close">' +
        '<div class="modal" role="dialog" aria-modal="true" aria-label="Registrar ' + d.name + '">' +
          '<p class="eyebrow">Registrar consumo</p>' +
          '<h2>' + d.name + '</h2>' +
          '<p>' + d.description + '</p>' +
          '<div class="modal-price" id="modal-price">' + D.money(m.price) + ' <span class="delta ' + ch.dir + '" style="font-size:11px">' + D.pct(ch.pct) + '</span></div>' +
          '<div class="modal-stats">' +
            '<div>Máx. <b>' + D.money(m.high) + '</b></div>' +
            '<div>Mín. <b>' + D.money(m.low) + '</b></div>' +
            '<div>Demanda <b>' + S.demand(id).units + ' u.</b></div>' +
          '</div>' +
          '<div class="qty-picker">' +
            '<button type="button" class="step-btn" data-action="modal-step" data-step="-1" aria-label="Menos">−</button>' +
            '<output id="modal-qty">1</output>' +
            '<button type="button" class="step-btn" data-action="modal-step" data-step="1" aria-label="Más">+</button>' +
          '</div>' +
          '<div class="modal-actions">' +
            '<button type="button" class="btn ghost" data-action="modal-close">Cancelar</button>' +
            '<button type="button" class="btn primary" data-action="modal-add">Registrar <span id="modal-total">' + D.money(m.price) + '</span></button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function closeModal() { els['modal-root'].innerHTML = ''; modalDrinkId = null; }

  function updateModalQty(delta) {
    modalQty = Math.max(1, Math.min(30, modalQty + delta));
    var out = $('modal-qty');
    if (out) out.textContent = modalQty;
    var total = $('modal-total');
    if (total && modalDrinkId) total.textContent = D.money(state().market[modalDrinkId].price * modalQty);
  }

  /* -------------------------------------------------------------- admin */
  function adminShell(content) {
    var tabs = S.isAdmin()
      ? '<div class="admin-tabs">' +
          [['mercado', 'Mercado'], ['carta', 'Carta y precios'], ['mesas', 'Mesas / archivo'], ['sistema', 'Sistema'], ['acceso', 'Acceso']]
            .map(function (t) {
              return '<button type="button" data-admin-action="tab" data-tab="' + t[0] + '" class="' + (adminTab === t[0] ? 'active' : '') + '">' + t[1] + '</button>';
            }).join('') + '</div>'
      : '';
    els['admin-root'].innerHTML =
      '<div class="admin-backdrop" data-admin-action="close">' +
        '<div class="admin-panel" role="dialog" aria-modal="true" aria-label="Panel de administrador">' +
          '<div class="admin-top"><div><p class="eyebrow">Acceso restringido</p><h2>Panel de administrador</h2></div>' +
          '<button class="icon-btn" type="button" data-admin-action="close" aria-label="Cerrar panel">×</button></div>' +
          tabs +
          '<div class="admin-body">' + content + '</div>' +
        '</div>' +
      '</div>';
  }

  function adminLogin() {
    var hint = state().admin.passwordChanged ? '' : '<span class="admin-hint">Acceso inicial: <b>julianp</b> / <b>070226</b> (cambiá la clave en Acceso)</span>';
    return '<div class="admin-login">' +
      '<h3>Ingresar como administrador</h3>' +
      '<p>Control total: mercado, carta, precios, mesas, sistema y seguridad.</p>' +
      '<input id="admin-user" type="text" placeholder="Usuario" autocomplete="username" value="' + (state() && state().admin ? state().admin.user : 'julianp') + '" />' +
      '<input id="admin-pass" type="password" placeholder="Contraseña" autocomplete="current-password" />' +
      '<button class="btn primary" type="button" data-admin-action="login">Entrar al panel</button>' + hint +
      '</div>';
  }

  function adminMercado() {
    var s = state();
    var paused = s.admin.paused;
    var count = D.available().length;
    return '<div class="admin-grid">' +
      '<div class="admin-card"><h3>Estado del mercado</h3>' +
        '<p>Ajustes automáticos cada ' + Math.round(s.admin.tickMs / 1000) + ' s según la demanda.</p>' +
        '<span class="status-pill ' + (paused ? 'pause' : 'run') + '">' + (paused ? 'PAUSADO' : 'ACTIVO') + '</span>' +
        '<button class="btn" data-admin-action="pause">' + (paused ? 'Reanudar ajustes' : 'Pausar ajustes') + '</button></div>' +
      '<div class="admin-card"><h3>Caída general</h3>' +
        '<p>Los ' + count + ' precios activos bajan un 10%. Próxima en <b id="admin-countdown">--:--</b>.</p>' +
        '<button class="btn danger" data-admin-action="crash">Forzar caída general</button></div>' +
      '<div class="admin-card"><h3>Subida general</h3>' +
        '<p>Todos los precios activos suben un 7% de una vez.</p>' +
        '<button class="btn" data-admin-action="rally">Forzar subida general</button></div>' +
      '<div class="admin-card"><h3>Restablecer precios</h3>' +
        '<p>Devuelve la carta a sus precios base sin borrar consumos.</p>' +
        '<button class="btn" data-admin-action="reset">Volver a precio de carta</button></div>' +
      '<div class="admin-card"><h3>Cerrar mesa ' + s.table + '</h3>' +
        '<p>Archiva el ticket y vuelve a la pantalla de mesa.</p>' +
        '<button class="btn danger" data-admin-action="close-table">Cerrar y archivar</button></div>' +
      '</div>';
  }

  function adminPrecios() {
    var s = state();
    var options = ['Cocktails Sernova', 'Tragos'].map(function (cat) {
      return '<optgroup label="' + cat + '">' + D.DRINKS.filter(function (d) { return d.category === cat; })
        .map(function (d) { return '<option value="' + d.id + '">' + d.name + (d.enabled === false ? ' (inactivo)' : '') + '</option>'; }).join('') + '</optgroup>';
    }).join('');
    var rows = D.DRINKS.map(function (d) {
      var price = s.market[d.id] ? s.market[d.id].price : d.price;
      var diff = d.price ? (price - d.price) / d.price * 100 : 0;
      var off = d.enabled === false;
      return '<tr' + (off ? ' style="opacity:.48"' : '') + '><td>' + d.name + (d.custom ? ' ★' : '') + '</td>' +
        '<td><input type="number" value="' + d.price + '" data-base-id="' + d.id + '" style="width:88px;padding:3px 5px;font-size:10px" /></td>' +
        '<td>' + D.money(price) + '</td>' +
        '<td class="' + (diff > 0 ? 'up' : diff < 0 ? 'down' : '') + '">' + D.pct(diff) + '</td>' +
        '<td><button class="btn sm" data-admin-action="set-base" data-id="' + d.id + '">Guardar</button> ' +
        '<button class="btn sm" data-admin-action="toggle" data-id="' + d.id + '">' + (off ? 'Activar' : 'Desactivar') + '</button> ' +
        '<button class="btn sm" data-admin-action="price-step" data-id="' + d.id + '" data-step="-5">−5%</button> ' +
        '<button class="btn sm" data-admin-action="price-step" data-id="' + d.id + '" data-step="5">+5%</button></td></tr>';
    }).join('');
    return '<div class="admin-grid">' +
      '<div class="admin-card"><h3>Fijar precio actual</h3>' +
        '<p>Queda registrado en el gráfico como «Ajuste admin».</p>' +
        '<select id="admin-price-select">' + options + '</select>' +
        '<input id="admin-price-value" type="number" min="0" step="10" placeholder="Nuevo precio ($)" />' +
        '<button class="btn primary" data-admin-action="apply-price">Aplicar precio</button></div>' +
      '<div class="admin-card"><h3>Agregar trago</h3>' +
        '<p>Se suma a la carta, al ticker y al gráfico.</p>' +
        '<input id="new-drink-name" type="text" placeholder="Nombre del trago" />' +
        '<input id="new-drink-price" type="number" placeholder="Precio ($)" />' +
        '<select id="new-drink-category"><option>Tragos</option><option>Cocktails Sernova</option></select>' +
        '<select id="new-drink-tag"><option value="Autor">Autor</option><option value="Clásico">Clásico</option><option value="Tropical">Tropical</option><option value="Julep">Julep</option><option value="Vermouth">Vermouth</option></select>' +
        '<input id="new-drink-desc" type="text" placeholder="Descripción (opcional)" />' +
        '<button class="btn primary" data-admin-action="add-drink">Crear trago</button></div>' +
      '</div>' +
      '<div class="admin-card"><h3>Carta completa (' + D.DRINKS.length + ' tragos, ' + D.available().length + ' activos)</h3>' +
        '<p>Editá el precio base, desactivá tragos o ajustá el precio actual. Los tragos inactivos no aparecen en la carta ni se pueden registrar.</p>' +
        '<div class="admin-table-scroll"><table class="admin-table"><thead><tr><th>Trago</th><th>Precio base</th><th>Actual</th><th>Dif.</th><th>Acciones</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<button class="btn danger" data-admin-action="reset-catalog">Restablecer carta original</button></div>';
  }

  function adminMesas() {
    var s = state();
    var archive = S.getArchive();
    if (adminArchiveView) {
      var rec = archive.filter(function (r) { return r.id === adminArchiveView; })[0];
      if (rec) {
        var rows = rec.entries.slice().reverse().map(function (e) {
          return '<tr><td>' + D.clock(e.ts) + '</td><td>' + e.name + '</td><td>' + e.qty + '</td><td>' + D.money(e.subtotal) + '</td></tr>';
        }).join('');
        return '<button class="btn sm" data-admin-action="archive-back">← Volver a mesas</button>' +
          '<div class="admin-card"><h3>Mesa ' + rec.table + ' · ' + D.money(rec.total) + '</h3>' +
          '<p>' + rec.operations + ' operaciones · ' + rec.units + ' unidades · ' + D.clock(rec.startedAt) + ' a ' + D.clock(rec.closedAt) + '</p>' +
          '<div class="admin-table-scroll"><table class="admin-table"><thead><tr><th>Hora</th><th>Trago</th><th>Cant.</th><th>Subtotal</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
      }
      adminArchiveView = null;
    }
    var list = archive.length ? archive.map(function (r) {
      return '<div class="admin-row"><div><strong>Mesa ' + r.table + ' · ' + D.money(r.total) + '</strong>' +
        '<small>' + new Date(r.startedAt).toLocaleString('es-AR') + ' · ' + r.operations + ' consumos' + (r.waiter ? ' · ' + r.waiter : '') + '</small></div>' +
        '<div class="admin-row-actions"><button class="btn sm" data-admin-action="archive-view" data-id="' + r.id + '">Ver</button>' +
        '<button class="btn sm" data-admin-action="restore" data-id="' + r.id + '">Restaurar</button>' +
        '<button class="btn sm danger" data-admin-action="archive-delete" data-id="' + r.id + '">Borrar</button></div></div>';
    }).join('') : '<div class="ledger-empty">No hay mesas archivadas todavía.</div>';
    return '<div class="admin-card"><h3>Mesa activa</h3><p>Mesa ' + s.table + ' · ' + s.entries.length + ' consumos · ' + D.money(S.stats().total) + '</p></div>' +
      '<div>' + list + '</div>' +
      (archive.length ? '<button class="btn danger" data-admin-action="archive-clear">Vaciar archivo completo</button>' : '');
  }

  function adminSistema() {
    var s = state();
    var log = s.admin.log.slice(0, 14).map(function (e) {
      return '<div class="admin-row"><div><strong>' + D.clock(e.ts) + ' · ' + e.action + '</strong>' +
        '<small>' + (e.detail || '—') + '</small></div></div>';
    }).join('') || '<div class="ledger-empty">Sin acciones administrativas registradas.</div>';
    return '<div class="admin-grid">' +
      '<div class="admin-card"><h3>Apariencia</h3><p>Fuerza el tema para toda la aplicación.</p>' +
        '<button class="btn" data-admin-action="theme" data-theme="dark">Tema oscuro</button>' +
        '<button class="btn" data-admin-action="theme" data-theme="light">Tema claro</button></div>' +
      '<div class="admin-card"><h3>Mesa activa</h3><p>Modificá la mesa, comensales y responsable sin perder el ticket.</p>' +
        '<input id="admin-table-input" type="text" value="' + s.table + '" placeholder="Mesa" />' +
        '<input id="admin-guests-input" type="number" min="1" max="40" value="' + s.guests + '" placeholder="Comensales" />' +
        '<input id="admin-waiter-input" type="text" value="' + s.waiter + '" placeholder="Responsable" />' +
        '<button class="btn primary" data-admin-action="set-session">Guardar datos</button></div>' +
      '<div class="admin-card"><h3>Intervalos del mercado</h3><p>Controlá cada cuánto ajustan los precios y cuándo cae todo.</p>' +
        '<input id="admin-crash-sec" type="number" min="30" max="900" value="' + Math.round(s.admin.crashMs / 1000) + '" placeholder="Caída (s)" />' +
        '<input id="admin-tick-sec" type="number" min="5" max="300" value="' + Math.round(s.admin.tickMs / 1000) + '" placeholder="Ajuste (s)" />' +
        '<button class="btn primary" data-admin-action="set-intervals">Aplicar intervalos</button></div>' +
      '<div class="admin-card"><h3>Pantalla de televisores</h3>' +
        '<p>Elegí qué trago se muestra en grande. Con «Auto» la TV rota sola cada 12 segundos.</p>' +
        '<select id="tv-focus-select"><option value="">Auto · rotación</option>' +
          D.DRINKS.map(function (d) {
            return '<option value="' + d.id + '"' + (s.tvFocusId === d.id ? ' selected' : '') + '>' + d.name + '</option>';
          }).join('') + '</select>' +
        '<button class="btn" data-admin-action="tv-focus">Fijar trago en TV</button>' +
        '<button class="btn" data-admin-action="tv-rotate">' + (s.tvRotate !== false ? 'Rotación: ACTIVA' : 'Rotación: OFF') + '</button>' +
        '<button class="btn primary" data-admin-action="open-tv">Abrir pantalla TV</button></div>' +
      '</div>' +
      '<div class="admin-card"><h3>Registro de acciones</h3><p>Últimas operaciones del administrador (' + s.admin.log.length + ' guardadas).</p>' +
        '<div class="admin-table-scroll">' + log + '</div></div>' +
      '<div class="admin-card"><h3>Zona crítica</h3><p>Borra mesas, archivo, carta personalizada y sesión actual de este dispositivo.</p>' +
        '<button class="btn danger" data-admin-action="wipe">Borrar todos los datos</button></div>';
  }

  function adminAcceso() {
    return '<div class="admin-card"><h3>Cambiar contraseña</h3>' +
      '<p>La contraseña se guarda como hash en este dispositivo (demo local, no apta para producción).</p>' +
      '<input id="admin-new-pass" type="password" placeholder="Nueva contraseña" autocomplete="new-password" />' +
      '<button class="btn primary" data-admin-action="change-password">Guardar contraseña</button></div>' +
      '<div class="admin-card"><h3>Sesión administrativa</h3><p>Cerrá el acceso cuando termines de administrar.</p>' +
      '<button class="btn" data-admin-action="logout">Cerrar sesión admin</button></div>';
  }

  function renderAdmin() {
    if (!els['admin-root'].innerHTML) return;
    var content = !S.isAdmin() ? adminLogin()
      : adminTab === 'carta' ? adminPrecios()
      : adminTab === 'mesas' ? adminMesas()
      : adminTab === 'sistema' ? adminSistema()
      : adminTab === 'acceso' ? adminAcceso()
      : adminMercado();
    adminShell(content);
    updateCountdowns();
  }

  function openAdmin(tab) {
    adminTab = tab || 'mercado';
    adminArchiveView = null;
    if (!S.hasSession()) S.ensureSystemState();
    renderAdmin();
    if (!els['admin-root'].innerHTML) adminShell(adminLogin());
  }

  function closeAdmin() { els['admin-root'].innerHTML = ''; adminArchiveView = null; }

  function openTv() {
    if (window.SernovaSync && S.getState()) window.SernovaSync.push(S.getState());
    var win = window.open('tv.html', 'sernova-tv');
    if (!win) toast('No se pudo abrir la TV', 'Permití ventanas emergentes para este sitio.', 'down');
    else toast('Pantalla TV abierta', 'Abrí tv.html en cada televisor para ver el mercado en vivo.', 'info');
  }

  function onAdminAction(ev) {
    var target = ev.target.closest('[data-admin-action]');
    if (!target) return;
    var action = target.dataset.adminAction;

    if (action === 'close') {
      if (ev.target !== target) return;
      closeAdmin();
      return;
    }
    if (action === 'login') {
      var user = $('admin-user') ? $('admin-user').value : '';
      var pass = $('admin-pass') ? $('admin-pass').value : '';
      if (S.login(user, pass)) { toast('Acceso concedido', 'Bienvenido, ' + state().admin.user + '.', 'info'); renderAll(); renderAdmin(); }
      else toast('Acceso denegado', 'Verificá usuario y contraseña.', 'down');
      return;
    }
    if (!S.isAdmin()) return;

    switch (action) {
      case 'tab':
        adminTab = target.dataset.tab;
        adminArchiveView = null;
        renderAdmin();
        break;
      case 'pause':
        S.setPaused(!state().admin.paused);
        renderAdmin(); updateCountdowns();
        toast('Mercado ' + (state().admin.paused ? 'pausado' : 'reanudado'), 'Los ajustes automáticos están ' + (state().admin.paused ? 'detenidos' : 'activos') + '.', 'info');
        break;
      case 'crash':
        if (S.forceCrash()) {
          showBanner('caída', 'CAÍDA GENERAL · Todos los precios bajaron 10%');
          toast('Caída general ejecutada', 'Los 32 tragos bajaron de precio.', 'down');
        }
        renderAll(); renderAdmin();
        break;
      case 'rally':
        if (S.forceRally()) {
          showBanner('rally', 'SUBIDA GENERAL · Todos los precios subieron 7%');
          toast('Subida general ejecutada', 'Los ' + D.available().length + ' tragos activos subieron de precio.', 'info');
        }
        renderAll(); renderAdmin();
        break;
      case 'reset':
        S.resetMarket();
        renderAll(); renderAdmin();
        toast('Precios restablecidos', 'Toda la carta volvió al precio original.', 'info');
        break;
      case 'close-table':
        var t = state().table;
        S.archiveSession();
        closeAdmin();
        openSetup();
        toast('Mesa ' + t + ' cerrada', 'El ticket quedó archivado y accesible para el admin.', 'info');
        break;
      case 'apply-price': {
        var sel = $('admin-price-select'), val = $('admin-price-value');
        if (S.adminSetPrice(sel.value, val.value)) {
          renderAll(); renderAdmin();
          toast('Precio actualizado', D.byId(sel.value).name + ' → ' + D.money(state().market[sel.value].price), 'info');
        } else toast('Precio sin cambios', 'Ingresá un valor distinto y válido.', 'down');
        break;
      }
      case 'price-step':
        var id = target.dataset.id, step = parseInt(target.dataset.step, 10);
        var current = state().market[id].price;
        S.adminSetPrice(id, current * (1 + step / 100));
        renderAll(); renderAdmin();
        break;
      case 'set-base': {
        var bid = target.dataset.id;
        var input = document.querySelector('[data-base-id="' + bid + '"]');
        if (S.setBasePrice(bid, input ? input.value : 0)) {
          renderAll(); renderAdmin();
          toast('Precio base guardado', D.byId(bid).name + ' → ' + D.money(D.byId(bid).price), 'info');
        } else toast('Precio base inválido', 'Usá un número entre 1.000 y 500.000.', 'down');
        break;
      }
      case 'toggle': {
        var tid = target.dataset.id;
        var enabled = D.byId(tid).enabled === false;
        S.setEnabled(tid, enabled);
        renderAll(); renderAdmin();
        toast(enabled ? 'Trago activado' : 'Trago desactivado', D.byId(tid).name, 'info');
        break;
      }
      case 'add-drink': {
        var name = $('new-drink-name').value, price = $('new-drink-price').value;
        var created = S.addCustomDrink({
          name: name, price: price,
          category: $('new-drink-category').value,
          tags: [$('new-drink-tag').value],
          description: $('new-drink-desc').value
        });
        if (created) {
          renderAll(); renderAdmin();
          toast('Trago creado', created.name + ' · ' + D.money(created.price), 'info');
        } else toast('No se pudo crear', 'Ingresá un nombre y un precio válidos.', 'down');
        break;
      }
      case 'reset-catalog':
        if (window.confirm('¿Restablecer la carta original? Se quitarán los tragos creados y los cambios de precio base/disponibilidad.')) {
          S.resetCatalog(); renderAll(); renderAdmin();
          toast('Carta original restaurada', 'Volvieron los 32 tragos iniciales.', 'info');
        }
        break;
      case 'restore':
        if (window.confirm('¿Restaurar esa mesa como sesión activa? El ticket actual se archivará primero.')) {
          if (S.restoreArchive(target.dataset.id)) {
            closeAdmin(); startApp();
            toast('Mesa restaurada', 'Mesa ' + state().table + ' · ' + state().entries.length + ' consumos.', 'info');
          }
        }
        break;
      case 'set-session':
        S.setSessionInfo($('admin-table-input').value, $('admin-guests-input').value, $('admin-waiter-input').value);
        renderAll(); renderAdmin();
        toast('Datos de mesa actualizados', 'Mesa ' + state().table + ' · ' + state().guests + ' comensales.', 'info');
        break;
      case 'set-intervals':
        S.setIntervals($('admin-crash-sec').value, $('admin-tick-sec').value);
        renderAdmin(); updateCountdowns();
        toast('Intervalos aplicados', 'Caída cada ' + Math.round(state().admin.crashMs / 1000) + ' s · ajuste cada ' + Math.round(state().admin.tickMs / 1000) + ' s.', 'info');
        break;
      case 'theme':
        applyTheme(target.dataset.theme);
        S.setTheme(target.dataset.theme);
        renderAdmin();
        toast('Tema actualizado', 'Modo ' + target.dataset.theme + ' aplicado.', 'info');
        break;
      case 'wipe':
        if (window.confirm('¿BORRAR TODOS LOS DATOS? Se eliminan sesión, archivo, carta personalizada y contraseña configurada.')) {
          S.wipeAll(); window.location.reload();
        }
        break;
      case 'tv-focus':
        S.setPref('tvFocusId', $('tv-focus-select').value);
        renderAdmin();
        toast('TV actualizada', $('tv-focus-select').value ? 'Trago fijado en pantalla grande.' : 'Rotación automática activada.', 'info');
        break;
      case 'tv-rotate':
        S.setPref('tvRotate', state().tvRotate === false);
        renderAdmin();
        toast('Rotación de TV', state().tvRotate !== false ? 'Activada cada 12 segundos.' : 'Desactivada.', 'info');
        break;
      case 'open-tv':
        openTv();
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
        S.deleteArchive(target.dataset.id);
        renderAdmin();
        toast('Mesa eliminada del archivo', 'El registro se quitó definitivamente.', 'info');
        break;
      case 'archive-clear':
        if (window.confirm('¿Vaciar todas las mesas archivadas?')) { S.clearArchive(); renderAdmin(); }
        break;
      case 'change-password':
        var np = $('admin-new-pass') ? $('admin-new-pass').value : '';
        if (S.changePassword(np)) {
          $('admin-new-pass').value = '';
          toast('Contraseña actualizada', 'Se guardó el nuevo acceso admin.', 'info');
        } else toast('No se pudo cambiar', 'Ingresá una contraseña válida.', 'down');
        break;
      case 'logout':
        S.logout();
        renderAll(); renderAdmin();
        toast('Sesión admin cerrada', 'Volviste al modo usuario.', 'info');
        break;
    }
  }

  /* ------------------------------------------------------------- acciones */
  function addDrink(id, qty) {
    var result = S.purchase(id, qty);
    if (!result) return;
    var sign = result.tick.dir === 'up' ? '▲ sube' : result.tick.dir === 'down' ? '▼ baja' : '■ sin cambio';
    var dem = S.demand(id);
    toast('+ ' + result.drink.name + ' registrado',
      result.entry.qty + ' × ' + D.money(result.entry.unitPrice) + ' · precio ' + sign + ' ' + D.pct(result.entry.deltaPct) +
      ' · demanda ' + dem.units + ' u.',
      result.tick.dir === 'down' ? 'down' : 'info');
    S.setPref('selectedId', id);
    renderAll();
  }

  function exportCsv() {
    var blob = new Blob([S.exportCsv()], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'sernova-mesa-' + state().table.replace(/\s+/g, '-') + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('CSV exportado', state().entries.length + ' consumos descargados.', 'info');
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
        els.chart.scrollIntoView({ behavior: 'smooth', block: 'center' });
        break;
      case 'add': addDrink(id, 1); break;
      case 'detail': openModal(id); break;
      case 'remove':
        S.removeEntry(id);
        renderAll();
        toast('Consumo quitado', 'El precio y el gráfico se recalcularon.', 'info');
        break;
      case 'undo': {
        var undone = S.undo();
        if (undone) {
          renderAll();
          toast('Último consumo deshecho', undone.name + ' · ' + D.money(undone.subtotal), 'info');
        }
        break;
      }
      case 'clear':
        if (state().entries.length && window.confirm('¿Vaciar el ticket de la mesa ' + state().table + '? Se quitarán todos los consumos y sus movimientos de precio.')) {
          var removed = S.clearLedger();
          renderAll();
          toast('Ticket vaciado', removed + ' consumos eliminados.', 'info');
        }
        break;
      case 'export': exportCsv(); break;
      case 'category': S.setPref('category', target.dataset.value); renderMenu(); break;
      case 'tag': S.setPref('tag', target.dataset.value); renderMenu(); break;
      case 'modal-step': updateModalQty(parseInt(target.dataset.step, 10)); break;
      case 'modal-add':
        if (modalDrinkId) {
          var drinkId = modalDrinkId;
          closeModal();
          addDrink(drinkId, modalQty);
        }
        break;
      case 'modal-close':
        if (target.classList.contains('modal-backdrop') && ev.target !== target) return;
        closeModal();
        break;
    }
  }

  /* ------------------------------------------------------ loop de mercado */
  function startMarketLoop() {
    clearInterval(marketTimer);
    marketTimer = setInterval(function () {
      if (!S.hasSession() || els.app.hidden) return;
      updateCountdowns();
      var s = state();
      if (s.admin.paused) { s.nextMarketAt = Date.now() + S.TICK_MS; S.save(); return; }
      if (Date.now() >= s.nextMarketAt) {
        var result = S.marketTick();
        if (result.crashed) {
          showBanner('caída', 'CAÍDA GENERAL · Todos los precios bajaron 10%');
          toast('Caída general del mercado', 'Todos los tragos bajaron de precio.', 'down');
        }
        renderTicker(); renderMarket(); renderMenu(); renderSummary(); updateCountdowns();
        if (els['admin-root'].innerHTML && adminTab === 'carta' &&
            !/INPUT|SELECT/.test(document.activeElement.tagName)) renderAdmin();
      }
    }, 1000);
  }

  /* --------------------------------------------------------------- wire */
  function wire() {
    document.addEventListener('click', onAction);
    document.addEventListener('click', onAdminAction);

    els['btn-admin'].addEventListener('click', function () { openAdmin(); });
    els['btn-admin-setup'].addEventListener('click', function () { openAdmin(); });
    els['btn-tv'].addEventListener('click', openTv);
    els['btn-tv-setup'].addEventListener('click', openTv);

    els['btn-open'].addEventListener('click', function () {
      if (!setupTable) { toast('Falta la mesa', 'Elegí un número de mesa o escribí uno personalizado.', 'down'); return; }
      if (S.hasSession() && state().table === setupTable && state().entries.length &&
          !window.confirm('Ya hay una sesión para la mesa ' + setupTable + '. ¿Querés reemplazarla por una nueva?')) return;
      S.createSession(setupTable, setupGuests, els.waiter.value);
      startApp();
      toast('Mesa ' + setupTable + ' abierta', 'Ya podés registrar los tragos que se consuman.', 'info');
    });

    els['btn-continue'].addEventListener('click', function () {
      if (!S.hasSession()) return;
      startApp();
      toast('Sesión recuperada', 'Mesa ' + state().table + ' · ' + state().entries.length + ' consumos.', 'info');
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

    els['btn-theme'].addEventListener('click', toggleTheme);
    els['btn-lock'].addEventListener('click', function () { openSetup(); });
    els['btn-new'].addEventListener('click', function () {
      var s = state();
      if (!window.confirm('¿Iniciar una sesión nueva en la mesa ' + s.table + '? El ticket y el mercado actuales se reemplazarán.')) return;
      S.createSession(s.table, s.guests, s.waiter);
      renderAll();
      toast('Nueva sesión iniciada', 'Mercado y ticket reiniciados; la sesión anterior quedó archivada.', 'info');
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
      S.setPref('search', els.search.value);
      renderMenu();
      els.search.focus();
    });

    document.querySelectorAll('#mode-switch button').forEach(function (b) {
      b.addEventListener('click', function () { S.setPref('mode', b.dataset.mode); renderMarket(); });
    });
    document.querySelectorAll('#range-switch button').forEach(function (b) {
      b.addEventListener('click', function () { S.setPref('range', b.dataset.range); renderMarket(); });
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        if (els['modal-root'].innerHTML) closeModal();
        else if (els['admin-root'].innerHTML) closeAdmin();
        return;
      }
      if (ev.key === 'Enter' && (ev.target.id === 'admin-pass' || ev.target.id === 'admin-user')) {
        var loginBtn = document.querySelector('[data-admin-action="login"]');
        if (loginBtn) loginBtn.click();
        return;
      }
      var typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if (!typing && ev.key === '/') { ev.preventDefault(); els.search.focus(); }
      if (!typing && (ev.key === 't' || ev.key === 'T')) toggleTheme();
    });

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (!els.app.hidden && S.hasSession()) renderMarket();
      }, 200);
    });
  }

  function init() {
    cacheEls();
    S.load();
    if (window.SernovaSync && state()) window.SernovaSync.push(state());
    applyTheme(S.hasSession() ? state().theme : 'dark');
    renderTableGrid();
    wire();
    renderClock();
    setInterval(renderClock, 15000);
    startMarketLoop();
    openSetup();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
