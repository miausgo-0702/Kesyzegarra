/* ==========================================================================
   SERNOVA CLUB — panel de staff.
   · Administrador: resumen, mesas, clientes, cargas, pedidos, fotos,
     votación, anuncios y ajustes.
   · Community manager: fotos, votación, anuncios y cuenta.
   ========================================================================== */
(function () {
  'use strict';

  var D = window.SernovaData;
  var API = window.SernovaClub;
  var U = window.ClubUI;
  var $ = U.$, esc = U.esc;
  var data = null;
  var tab = null;
  var filter = '';
  var refreshTimer = null;

  var TABS = {
    admin: [['resumen', 'Resumen'], ['mesas', 'Mesas'], ['clientes', 'Clientes'], ['cargas', 'Cargas'], ['pedidos', 'Pedidos'], ['fotos', 'Fotos'], ['votacion', 'Votación'], ['anuncios', 'Anuncios'], ['ajustes', 'Ajustes']],
    cm: [['fotos', 'Fotos'], ['votacion', 'Votación'], ['anuncios', 'Anuncios'], ['cuenta', 'Cuenta']]
  };

  function money(v) { return D.money(v); }
  function when(ts) { return new Date(ts).toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }); }

  /* -------------------------------------------------------------- datos */
  function refresh() {
    if (!API.getStaff()) { showLogin(); return Promise.resolve(); }
    return API.call('staff.data').then(function (r) {
      if (!r.ok) { if (r.code === 401) { showLogin(); U.toast('Sesión vencida', 'Ingresá de nuevo.', 'down'); } return; }
      data = r.data;
      if (!tab || !TABS[data.role].some(function (t) { return t[0] === tab; })) tab = TABS[data.role][0][0];
      showStaff();
      render();
    });
  }
  function refreshSoon() { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 150); }

  function act(op, payload, okMsg) {
    return API.call(op, payload).then(function (r) {
      if (!r.ok) { U.toast('No se pudo completar', r.error, 'down'); if (r.code === 401) showLogin(); return r; }
      if (okMsg) U.toast(okMsg[0], okMsg[1] || '', okMsg[2] || 'info');
      refresh();
      return r;
    });
  }

  /* ------------------------------------------------------------ pantallas */
  function showLogin() {
    API.setStaff('');
    data = null;
    $('login').hidden = false;
    $('staff').hidden = true;
    setTimeout(function () { $('st-user').focus(); }, 50);
  }
  function showStaff() {
    $('login').hidden = true;
    $('staff').hidden = false;
    $('role-badge').textContent = data.role === 'admin' ? 'ADMINISTRACIÓN' : 'COMMUNITY MANAGER';
    $('role-badge').className = 'role-badge ' + data.role;
    $('mode-note').textContent = API.mode() === 'local' ? 'Modo este equipo (sin servidor)' : 'En vivo · servidor del bar';
  }

  function render() {
    var badges = { cargas: data.totals ? data.totals.pendingLoads : 0, pedidos: data.totals ? data.totals.pendingOrders : 0, votacion: data.contest ? '●' : 0 };
    $('staff-tabs').innerHTML = TABS[data.role].map(function (t) {
      var b = badges[t[0]];
      return '<button type="button" role="tab" aria-selected="' + (tab === t[0]) + '" data-tab="' + t[0] + '" class="' + (tab === t[0] ? 'active' : '') + '">' + t[1] +
        (b ? '<i class="tab-badge">' + b + '</i>' : '') + '</button>';
    }).join('');
    var body = $('staff-body');
    var active = document.activeElement;
    var keepFocus = active && body.contains(active) && /INPUT|TEXTAREA|SELECT/.test(active.tagName) ? active.id : null;
    var html = ({ resumen: vResumen, mesas: vMesas, clientes: vClientes, cargas: vCargas, pedidos: vPedidos, fotos: vFotos, votacion: vVotacion, anuncios: vAnuncios, ajustes: vAjustes, cuenta: vCuenta }[tab] || vFotos)();
    if (keepFocus) return;   // no interrumpir mientras se escribe
    body.innerHTML = html;
  }

  function stat(label, value, cls) { return '<div><span>' + label + '</span><b class="' + (cls || '') + '">' + value + '</b></div>'; }
  function empty(t) { return '<div class="ledger-empty small"><span>' + t + '</span></div>'; }

  function orderRow(o, actions) {
    return '<div class="admin-row"><div class="admin-row-main"><strong>' + o.qty + '× ' + esc(o.drinkName) + ' <b>' + money(o.total) + '</b></strong>' +
      '<small>Mesa ' + esc(o.table) + ' · ' + esc(o.name) + ' · ' + when(o.ts) + (o.discount ? ' · desc. ' + money(o.discount) : '') + (o.atCost ? ' · a costo' : '') + ' · <span class="st-' + o.status + '">' + o.status + '</span></small></div>' +
      (actions && o.status === 'pendiente' ? '<div class="admin-row-actions"><button class="btn xs primary" data-op="order.deliver" data-id="' + esc(o.id) + '">Entregado</button><button class="btn xs danger" data-ask="order.cancel" data-id="' + esc(o.id) + '">Cancelar</button></div>' : '') +
      (actions && o.status === 'entregado' ? '<div class="admin-row-actions"><button class="btn xs danger" data-ask="order.cancel" data-id="' + esc(o.id) + '">Devolver</button></div>' : '') +
    '</div>';
  }

  function loadRow(l, actions) {
    return '<div class="admin-row' + (l.status === 'pendiente' ? ' pending' : '') + '"><div class="admin-row-main"><strong>' + esc(l.name) + ' · Mesa ' + esc(l.table) + ' <b class="' + (l.amount < 0 ? 'down' : '') + '">' + (l.amount > 0 ? '+' : '') + money(l.amount) + '</b></strong>' +
      '<small>' + esc(l.method) + (l.code ? ' · código <b class="code">' + esc(l.code) + '</b>' : '') + (l.note ? ' · ' + esc(l.note) : '') + ' · ' + when(l.ts) + ' · <span class="st-' + l.status + '">' + l.status + '</span></small></div>' +
      (actions && l.status === 'pendiente' ? '<div class="admin-row-actions"><button class="btn xs primary" data-op="load.approve" data-id="' + esc(l.id) + '">Confirmar pago</button><button class="btn xs danger" data-op="load.reject" data-id="' + esc(l.id) + '">Rechazar</button></div>' : '') +
    '</div>';
  }

  /* ----------------------------------------------------------- vistas admin */
  function vResumen() {
    var t = data.totals;
    var pend = data.loads.filter(function (l) { return l.status === 'pendiente'; });
    var po = data.orders.filter(function (o) { return o.status === 'pendiente'; });
    return '<div class="admin-stats">' +
        stat('Clientes', data.customers.length) + stat('Mesas', data.tables.length) +
        stat('Saldo cargado', money(t.loaded)) + stat('Gastado en tragos', money(t.spent), 'up') +
        stat('Saldo sin usar', money(t.balance), 'gold') + stat('Descuentos dados', money(t.discounts)) +
      '</div>' +
      '<div class="admin-grid two">' +
        '<div class="admin-card"><h3>Cargas por confirmar <small>' + pend.length + '</small></h3>' + (pend.slice(0, 6).map(function (l) { return loadRow(l, true); }).join('') || empty('Sin cargas pendientes.')) + '</div>' +
        '<div class="admin-card"><h3>Pedidos por entregar <small>' + po.length + '</small></h3>' + (po.slice(0, 6).map(function (o) { return orderRow(o, true); }).join('') || empty('Sin pedidos pendientes.')) + '</div>' +
      '</div>' +
      '<div class="admin-card"><h3>Mesas que más gastan</h3>' + tablesList(data.tables.slice(0, 5)) + '</div>';
  }

  function tablesList(list) {
    var max = list.length ? Math.max(1, list[0].spent) : 1;
    return list.map(function (r) {
      return '<div class="table-row"><div class="table-row-top"><strong>Mesa ' + esc(r.table) + '</strong><b>' + money(r.spent) + '</b></div>' +
        '<i class="table-bar"><b style="width:' + (r.spent / max * 100) + '%"></b></i>' +
        '<small>' + r.customers.length + (r.customers.length === 1 ? ' cliente' : ' clientes') + ' · ' + r.orders + ' pedidos · ' + r.units + ' tragos · saldo ' + money(r.balance) + ' · cargado ' + money(r.loaded) + '</small></div>';
    }).join('') || empty('Todavía no hay mesas con clientes.');
  }

  function vMesas() {
    return '<p class="muted small">Gasto de cada mesa con el saldo digital del club (se actualiza en vivo).</p>' +
      '<div class="tables-grid">' + (data.tables.map(function (r) {
        return '<div class="admin-card table-card"><div class="table-card-head"><h3>Mesa ' + esc(r.table) + '</h3><b>' + money(r.spent) + '</b></div>' +
          '<div class="mini-stats"><span>Pedidos <b>' + r.orders + '</b></span><span>Tragos <b>' + r.units + '</b></span><span>Saldo <b>' + money(r.balance) + '</b></span><span>Cargado <b>' + money(r.loaded) + '</b></span></div>' +
          '<div class="table-people">' + r.customers.map(function (c) {
            return '<div><span class="avatar sm">' + esc(U.initials(c.name)) + '</span><span>' + esc(c.name) + '</span><em>gastó ' + money(c.spent) + ' · saldo ' + money(c.balance) + '</em></div>';
          }).join('') + '</div></div>';
      }).join('') || empty('Todavía no hay mesas con clientes.')) + '</div>';
  }

  function vClientes() {
    var q = filter.toLowerCase();
    var list = data.customers.filter(function (c) { return !q || (c.name + ' ' + c.table).toLowerCase().indexOf(q) >= 0; });
    return '<input type="search" id="cust-filter" class="admin-filter" placeholder="Buscar por nombre o mesa…" value="' + esc(filter) + '" />' +
      '<div class="admin-table-scroll tall"><table class="admin-table"><thead><tr><th>Cliente</th><th>Mesa</th><th>Saldo</th><th>Cargado</th><th>Gastado</th><th>Descuento</th><th>Acciones</th></tr></thead><tbody>' +
      list.map(function (c) {
        return '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.table) + '</td><td>' + money(c.balance) + '</td><td>' + money(c.loaded) + '</td><td>' + money(c.spent) + '</td>' +
          '<td>' + (c.discount ? c.discount.pct + '% ×' + c.discount.uses : '—') + '</td>' +
          '<td class="actions"><button class="btn xs primary" data-credit="' + esc(c.id) + '">± Saldo</button><button class="btn xs" data-discount="' + esc(c.id) + '">Descuento</button></td></tr>';
      }).join('') + '</tbody></table></div>' + (list.length ? '' : empty('Sin clientes.'));
  }

  function vCargas() {
    var pend = data.loads.filter(function (l) { return l.status === 'pendiente'; });
    var done = data.loads.filter(function (l) { return l.status !== 'pendiente'; });
    return '<div class="admin-card"><h3>Por confirmar <small>' + pend.length + '</small></h3><p>Confirmá cuando recibas el pago (efectivo, transferencia o tarjeta). Pedile al cliente el código que ve en su celular.</p>' +
      (pend.map(function (l) { return loadRow(l, true); }).join('') || empty('Sin cargas pendientes.')) + '</div>' +
      '<div class="admin-card"><h3>Historial</h3><div class="admin-list">' + (done.slice(0, 80).map(function (l) { return loadRow(l, false); }).join('') || empty('Sin movimientos.')) + '</div></div>';
  }

  function vPedidos() {
    var pend = data.orders.filter(function (o) { return o.status === 'pendiente'; });
    var done = data.orders.filter(function (o) { return o.status !== 'pendiente'; });
    return '<div class="admin-card"><h3>Por entregar <small>' + pend.length + '</small></h3>' + (pend.map(function (o) { return orderRow(o, true); }).join('') || empty('Sin pedidos pendientes.')) + '</div>' +
      '<div class="admin-card"><h3>Historial</h3><div class="admin-list">' + (done.slice(0, 100).map(function (o) { return orderRow(o, true); }).join('') || empty('Sin pedidos.')) + '</div></div>';
  }

  /* ------------------------------------------------------------- vistas CM */
  function vFotos() {
    return '<p class="muted small">Las fotos visibles aparecen en los televisores. «Destacar» la muestra grande en la TV.</p>' +
      '<div class="st-gallery">' + (data.photos.map(function (p) {
        return '<figure class="st-photo' + (p.hidden ? ' is-hidden' : '') + (p.featured ? ' is-featured' : '') + '">' +
          '<img src="' + esc(p.src) + '" alt="Foto de ' + esc(p.name) + '" loading="lazy" />' +
          '<figcaption><b>' + esc(p.name) + '</b> · Mesa ' + esc(p.table) + ' · ' + p.votes + (p.votes === 1 ? ' voto' : ' votos') + (p.caption ? '<span>' + esc(p.caption) + '</span>' : '') + '</figcaption>' +
          '<div class="st-photo-actions">' +
            (p.hidden ? '<button class="btn xs" data-op="photo.show" data-id="' + esc(p.id) + '">Mostrar</button>' : '<button class="btn xs" data-op="photo.hide" data-id="' + esc(p.id) + '">Ocultar</button>') +
            '<button class="btn xs ' + (p.featured ? 'gold' : '') + '" data-op="photo.feature" data-id="' + esc(p.id) + '">' + (p.featured ? '★ Destacada' : 'Destacar') + '</button>' +
            '<button class="btn xs danger" data-ask="photo.delete" data-id="' + esc(p.id) + '">Borrar</button>' +
          '</div></figure>';
      }).join('') || empty('Todavía no hay fotos.')) + '</div>';
  }

  function vVotacion() {
    var c = data.contest, s = data.settings, last = data.lastContest;
    var board = data.photos.filter(function (p) { return !p.hidden && p.votes; }).sort(function (a, b) { return b.votes - a.votes; }).slice(0, 8);
    return '<div class="admin-grid two">' +
      (c ? '<div class="admin-card open-contest"><h3>Votación abierta</h3><p>Termina en <b id="st-contest-left">' + U.mmss(c.endsAt - Date.now()) + '</b> · premio <b>' + c.discountPct + '% OFF</b> en ' + c.uses + (c.uses === 1 ? ' pedido' : ' pedidos') + '.</p>' +
          '<button class="btn danger" data-ask="contest.close">Cerrar ahora y elegir ganadora</button></div>'
        : '<div class="admin-card"><h3>Abrir votación</h3><p>Los clientes votan la mejor foto (1 voto cada uno). Al cerrar, el dueño de la foto con más votos recibe el descuento.</p>' +
          '<div class="form-grid"><label><span>Duración (min)</span><input id="ct-min" type="number" min="1" max="240" value="' + s.contestMinutes + '" /></label>' +
          '<label><span>Descuento (%)</span><input id="ct-pct" type="number" min="1" max="100" value="' + s.discountPct + '" /></label>' +
          '<label><span>Pedidos con descuento</span><input id="ct-uses" type="number" min="1" max="20" value="' + s.discountUses + '" /></label></div>' +
          '<button class="btn primary" data-open-contest>Abrir votación</button></div>') +
      '<div class="admin-card"><h3>Ranking en vivo</h3>' + (board.map(function (p, i) {
        return '<div class="rank-photo"><span class="rank-pos">' + (i + 1) + '</span><img src="' + esc(p.src) + '" alt="" /><div><b>' + esc(p.name) + '</b><small>Mesa ' + esc(p.table) + '</small></div><strong>' + p.votes + '</strong></div>';
      }).join('') || empty(c ? 'Todavía no hay votos.' : 'Abrí una votación para ver el ranking.')) + '</div>' +
      '</div>' +
      (last ? '<div class="admin-card"><h3>Última votación</h3>' + (last.winner
        ? '<div class="rank-photo big"><img src="' + esc(last.winner.src) + '" alt="" /><div><b>' + esc(last.winner.name) + ' · Mesa ' + esc(last.winner.table) + '</b><small>' + last.winner.votes + (last.winner.votes === 1 ? ' voto' : ' votos') + ' de ' + last.votes + ' · ganó ' + last.discountPct + '% OFF</small></div></div>'
        : '<p>Se cerró sin votos.</p>') + '</div>' : '');
  }

  function vAnuncios() {
    var a = data.announcement;
    return '<div class="admin-card"><h3>Anuncio en pantalla</h3><p>Se muestra en los televisores y en el celular de los clientes.</p>' +
      '<textarea id="ann-text" maxlength="140" rows="3" placeholder="Ej: ¡Happy hour de fernet hasta las 2!">' + esc(a ? a.text : '') + '</textarea>' +
      '<div class="btn-row"><button class="btn primary" data-announce>Publicar anuncio</button>' + (a ? '<button class="btn danger" data-op="announce" data-text="">Quitar anuncio</button>' : '') + '</div>' +
      (a ? '<p class="muted small">Publicado ' + when(a.ts) + '.</p>' : '') + '</div>';
  }

  function passwordCard() {
    return '<div class="admin-card"><h3>Cambiar mi contraseña</h3><p>Por seguridad, ingresá tu usuario y tu contraseña actual.</p>' +
      '<input id="pw-user" type="text" autocomplete="username" placeholder="Usuario actual" />' +
      '<input id="pw-cur" type="password" autocomplete="current-password" placeholder="Contraseña actual" />' +
      '<input id="pw-new-user" type="text" autocomplete="off" placeholder="Nuevo usuario (opcional)" />' +
      '<input id="pw-new" type="password" autocomplete="new-password" placeholder="Nueva contraseña" />' +
      '<button class="btn primary" data-change-pass>Guardar</button></div>';
  }

  function vCuenta() { return '<div class="admin-grid">' + passwordCard() + '</div>'; }

  function vAjustes() {
    var s = data.settings;
    return '<div class="admin-grid">' +
      '<div class="admin-card"><h3>Cargas de saldo</h3><p>Alias o CBU que ven los clientes al elegir transferencia.</p>' +
        '<input id="set-alias" type="text" maxlength="60" placeholder="Ej: sernova.bar.mp" value="' + esc(s.transferAlias) + '" />' +
        '<button class="btn primary" data-save-settings>Guardar</button></div>' +
      '<div class="admin-card"><h3>Premio de votación por defecto</h3>' +
        '<div class="form-grid"><label><span>Descuento (%)</span><input id="set-pct" type="number" min="1" max="100" value="' + s.discountPct + '" /></label>' +
        '<label><span>Pedidos</span><input id="set-uses" type="number" min="1" max="20" value="' + s.discountUses + '" /></label>' +
        '<label><span>Duración (min)</span><input id="set-min" type="number" min="1" max="240" value="' + s.contestMinutes + '" /></label></div>' +
        '<button class="btn primary" data-save-settings>Guardar</button></div>' +
      passwordCard() +
      '<div class="admin-card critical"><h3>Cerrar la noche</h3><p>Borra clientes, saldos, cargas, pedidos, fotos y votos del club. Descargá antes lo que necesites.</p>' +
        '<button class="btn" data-export>Descargar resumen (CSV)</button>' +
        '<button class="btn danger" data-ask="club.reset">Borrar datos del club</button></div>' +
      '</div>';
  }

  /* ---------------------------------------------------------- diálogos */
  function openCredit(id) {
    var c = data.customers.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    var m = U.openSheet('<p class="eyebrow">Saldo de ' + esc(c.name) + ' · Mesa ' + esc(c.table) + '</p><h2>' + money(c.balance) + '</h2>' +
      '<p class="muted">Usá un monto positivo para cargar (pago en caja) o negativo para descontar.</p>' +
      '<div class="amount-chips">' + [5000, 10000, 20000, 50000].map(function (a) { return '<button type="button" class="chip" data-set="' + a + '">+' + money(a) + '</button>'; }).join('') + '</div>' +
      '<input id="cr-amount" type="number" step="500" placeholder="Monto ($)" autofocus />' +
      '<input id="cr-note" type="text" maxlength="60" placeholder="Nota (opcional)" style="margin-top:8px" />' +
      '<div class="modal-actions"><button type="button" class="btn primary" data-do-credit>Aplicar</button></div>', 'Saldo');
    m.addEventListener('click', function (ev) {
      var s = ev.target.closest('[data-set]');
      if (s) $('cr-amount').value = s.dataset.set;
      if (ev.target.closest('[data-do-credit]')) {
        act('credit.add', { customerId: id, amount: $('cr-amount').value, note: $('cr-note').value }, ['Saldo actualizado', c.name]).then(function (r) { if (r.ok) U.closeSheet(); });
      }
    });
  }

  function openDiscount(id) {
    var c = data.customers.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    var m = U.openSheet('<p class="eyebrow">Descuento para ' + esc(c.name) + '</p><h2>Dar descuento</h2>' +
      '<div class="form-grid"><label><span>Porcentaje (0 = quitar)</span><input id="ds-pct" type="number" min="0" max="100" value="' + (c.discount ? c.discount.pct : 10) + '" /></label>' +
      '<label><span>Pedidos</span><input id="ds-uses" type="number" min="1" max="50" value="' + (c.discount ? c.discount.uses : 1) + '" /></label></div>' +
      '<input id="ds-reason" type="text" maxlength="60" placeholder="Motivo (lo ve el cliente)" style="margin-top:8px" />' +
      '<div class="modal-actions"><button type="button" class="btn primary" data-do-disc>Guardar</button></div>', 'Descuento');
    m.querySelector('[data-do-disc]').addEventListener('click', function () {
      act('customer.discount', { customerId: id, pct: $('ds-pct').value, uses: $('ds-uses').value, reason: $('ds-reason').value }, ['Descuento guardado', c.name]).then(function (r) { if (r.ok) U.closeSheet(); });
    });
  }

  var ASK = {
    'order.cancel': ['Cancelar pedido', 'Se devuelve el total al saldo del cliente.', 'Cancelar pedido'],
    'photo.delete': ['Borrar foto', 'La foto se elimina definitivamente.', 'Borrar'],
    'contest.close': ['Cerrar votación', 'Se elige la foto con más votos y su dueño recibe el descuento.', 'Cerrar y premiar'],
    'club.reset': ['Borrar datos del club', 'Se eliminan clientes, saldos, pedidos, fotos y votos. No se puede deshacer.', 'Borrar todo']
  };
  function ask(op, id) {
    var a = ASK[op];
    var m = U.openSheet('<div class="ask danger"><div class="ask-icon">!</div><h2>' + a[0] + '</h2><p>' + a[1] + '</p>' +
      '<div class="modal-actions"><button type="button" class="btn ghost" data-sheet-close>Volver</button><button type="button" class="btn danger solid" data-yes autofocus>' + a[2] + '</button></div></div>', a[0]);
    m.querySelector('[data-yes]').addEventListener('click', function () {
      U.closeSheet();
      act(op, { id: id }, op === 'contest.close' ? null : [a[0], 'Listo.']).then(function (r) {
        if (op === 'contest.close' && r.ok) {
          var w = r.data.result && r.data.result.winner;
          U.toast('Votación cerrada', w ? 'Ganó ' + w.name + ' (mesa ' + w.table + ') con ' + w.votes + ' votos.' : 'No hubo votos.', 'up');
        }
      });
    });
  }

  function exportCsv() {
    var lines = ['tipo;fecha;mesa;cliente;detalle;monto;estado'];
    data.loads.forEach(function (l) { lines.push(['carga', new Date(l.ts).toLocaleString('es-AR'), l.table, '"' + l.name + '"', l.method, l.amount, l.status].join(';')); });
    data.orders.forEach(function (o) { lines.push(['pedido', new Date(o.ts).toLocaleString('es-AR'), o.table, '"' + o.name + '"', '"' + o.qty + 'x ' + o.drinkName + '"', o.total, o.status].join(';')); });
    var blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sernova-club-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* --------------------------------------------------------------- wire */
  function init() {
    U.applyTheme();
    $('login-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      API.call('staff.login', { user: $('st-user').value, pass: $('st-pass').value }).then(function (r) {
        $('st-pass').value = '';
        if (!r.ok) { U.toast('Acceso denegado', r.error, 'down'); return; }
        $('st-user').value = '';
        U.toast('Acceso concedido', r.data.role === 'admin' ? 'Panel de administración.' : 'Panel de community manager.', 'up');
        tab = null;
        refresh();
      });
    });
    $('btn-logout').addEventListener('click', function () { API.call('staff.logout').then(showLogin); });

    document.addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-tab]');
      if (t) { tab = t.dataset.tab; render(); window.scrollTo(0, 0); return; }
      var o = ev.target.closest('[data-op]');
      if (o) {
        var payload = { id: o.dataset.id };
        if (o.dataset.text !== undefined) payload = { text: o.dataset.text };
        var msgs = { 'load.approve': ['Carga confirmada', 'El saldo ya está disponible.', 'up'], 'load.reject': ['Carga rechazada'], 'order.deliver': ['Pedido entregado', '', 'up'], 'announce': ['Anuncio quitado'] };
        act(o.dataset.op, payload, msgs[o.dataset.op]);
        return;
      }
      var k = ev.target.closest('[data-ask]');
      if (k) { ask(k.dataset.ask, k.dataset.id); return; }
      if (ev.target.closest('[data-credit]')) { openCredit(ev.target.closest('[data-credit]').dataset.credit); return; }
      if (ev.target.closest('[data-discount]')) { openDiscount(ev.target.closest('[data-discount]').dataset.discount); return; }
      if (ev.target.closest('[data-open-contest]')) {
        act('contest.open', { minutes: $('ct-min').value, discountPct: $('ct-pct').value, uses: $('ct-uses').value }, ['Votación abierta', 'Los clientes ya pueden votar desde su celular.', 'up']);
        return;
      }
      if (ev.target.closest('[data-announce]')) { act('announce', { text: $('ann-text').value }, ['Anuncio publicado', 'Ya se ve en la pantalla.', 'up']); return; }
      if (ev.target.closest('[data-save-settings]')) {
        var p = {};
        if ($('set-alias')) p.transferAlias = $('set-alias').value;
        if ($('set-pct')) { p.discountPct = $('set-pct').value; p.discountUses = $('set-uses').value; p.contestMinutes = $('set-min').value; }
        act('settings', p, ['Ajustes guardados']);
        return;
      }
      if (ev.target.closest('[data-change-pass]')) {
        act('staff.password', { user: $('pw-user').value, current: $('pw-cur').value, newUser: $('pw-new-user').value.trim() || $('pw-user').value, next: $('pw-new').value }, ['Contraseña actualizada', 'Usala la próxima vez que ingreses.', 'up']);
        return;
      }
      if (ev.target.closest('[data-export]')) { exportCsv(); return; }
    });
    document.addEventListener('input', function (ev) {
      if (ev.target.id === 'cust-filter') {
        filter = ev.target.value;
        var pos = ev.target.selectionStart;
        $('staff-body').innerHTML = vClientes();
        var f = $('cust-filter'); f.focus(); try { f.setSelectionRange(pos, pos); } catch (e) { /* noop */ }
      }
    });

    API.onChange(function (src) { if (src !== 'market') refreshSoon(); });
    setInterval(function () {
      var el = $('st-contest-left');
      if (el && data && data.contest) {
        var left = data.contest.endsAt - Date.now();
        el.textContent = U.mmss(left);
        if (left <= 0) refreshSoon();
      }
    }, 1000);
    setInterval(function () { if (data) refresh(); }, 8000);
    API.ready().then(refresh);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
