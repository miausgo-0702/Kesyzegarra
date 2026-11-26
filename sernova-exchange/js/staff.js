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
  function ic(d) { return '<svg viewBox="0 0 24 24" fill="none">' + d + '</svg>'; }
  var S_ = 'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  var TAB_ICONS = {
    resumen: ic('<rect x="4" y="4" width="7" height="7" rx="2" ' + S_ + '/><rect x="13" y="4" width="7" height="7" rx="2" ' + S_ + '/><rect x="4" y="13" width="7" height="7" rx="2" ' + S_ + '/><rect x="13" y="13" width="7" height="7" rx="2" ' + S_ + '/>'),
    mesas: ic('<path d="M3 9h18M6 9V6h12v3M7 9v10m10-10v10M5 19h14" ' + S_ + '/>'),
    clientes: ic('<circle cx="9" cy="8" r="3.2" ' + S_ + '/><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6M16 5.5a3 3 0 0 1 0 5.5M18 14.6c1.5.6 2.4 2 2.7 4.4" ' + S_ + '/>'),
    cargas: ic('<rect x="3" y="6" width="18" height="13" rx="3" ' + S_ + '/><path d="M3 10h18M16 14.5h2" ' + S_ + '/>'),
    pedidos: ic('<path d="M6 4h12l-6 8-6-8ZM12 12v7m-4 1h8" ' + S_ + '/>'),
    fotos: ic('<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.3-2h6.4L16.5 7h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z" ' + S_ + '/><circle cx="12" cy="13" r="3.2" ' + S_ + '/>'),
    votacion: ic('<path d="M12 3.5l2.4 5 5.4.6-4 3.7 1.1 5.4L12 15.5l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6L12 3.5Z" ' + S_ + '/>'),
    anuncios: ic('<path d="M4 10v4h3l6 4V6L7 10H4ZM16.5 9a4 4 0 0 1 0 6" ' + S_ + '/>'),
    ajustes: ic('<circle cx="12" cy="12" r="3" ' + S_ + '/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" ' + S_ + '/>'),
    cuenta: ic('<circle cx="12" cy="8.5" r="3.5" ' + S_ + '/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" ' + S_ + '/>')
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
    var btn = $('login-btn');
    btn.className = 'glass-btn'; btn.textContent = 'Entrar'; btn.disabled = false;
    setTimeout(function () { $('st-user').focus(); }, 50);
  }
  function showStaff() {
    $('login').hidden = true;
    $('staff').hidden = false;
    $('role-badge').textContent = data.role === 'admin' ? 'Administración' : 'Community manager';
    $('role-badge').className = 'role-badge ' + data.role;
    $('mode-note').innerHTML = '<i></i>' + (API.mode() === 'local' ? 'Este equipo' : 'En vivo');
    var d = new Date();
    var wd = d.toLocaleDateString('es-AR', { weekday: 'long' });
    var mo = d.toLocaleDateString('es-AR', { month: 'long' });
    $('dash-date').textContent = wd.charAt(0).toUpperCase() + wd.slice(1) + ' ' + d.getDate() + ' de ' + mo + ', ' + d.getFullYear();
  }
  function loginBtnState() {
    var btn = $('login-btn');
    if (btn.classList.contains('loading') || btn.classList.contains('success')) return;
    btn.classList.toggle('ready', !!($('st-user').value.trim() && $('st-pass').value));
  }

  function render() {
    var badges = { cargas: data.totals ? data.totals.pendingLoads : 0, pedidos: data.totals ? data.totals.pendingOrders : 0, votacion: data.contest ? '●' : 0 };
    $('staff-tabs').innerHTML = TABS[data.role].map(function (t) {
      var b = badges[t[0]];
      return '<button type="button" role="tab" aria-selected="' + (tab === t[0]) + '" aria-label="' + t[1] + '" title="' + t[1] + '" data-tab="' + t[0] + '" class="dash-icon' + (tab === t[0] ? ' active' : '') + '">' + TAB_ICONS[t[0]] +
        '<span class="dash-tip">' + t[1] + '</span>' + (b ? '<i class="tab-badge">' + b + '</i>' : '') + '</button>';
    }).join('');
    var cur = TABS[data.role].filter(function (t) { return t[0] === tab; })[0];
    $('dash-title').textContent = cur ? cur[1] : '';
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
      '<small>' + esc(l.method) + (l.note ? ' · ' + esc(l.note) : '') + ' · ' + when(l.ts) + ' · <span class="st-' + l.status + '">' + l.status + '</span>' + (l.verified ? ' · ✓ código' : '') + '</small></div>' +
      (actions && l.status === 'pendiente' ? '<div class="admin-row-actions"><button class="btn xs primary" data-verify="' + esc(l.id) + '">Confirmar con código</button><button class="btn xs danger" data-op="load.reject" data-id="' + esc(l.id) + '">Rechazar</button></div>' : '') +
    '</div>';
  }

  /* ----------------------------------------------------------- vistas admin */
  function vResumen() {
    var t = data.totals;
    var pend = data.loads.filter(function (l) { return l.status === 'pendiente'; });
    var po = data.orders.filter(function (o) { return o.status === 'pendiente'; });
    var delivered = data.orders.filter(function (o) { return o.status === 'entregado'; }).length;
    var totalOrders = data.orders.filter(function (o) { return o.status !== 'cancelado'; }).length;
    var people = data.customers.slice(0, 5);
    var flow = Math.max(1, t.loaded);
    var top = data.tables.slice(0, 4);
    var maxT = top.length ? Math.max(1, top[0].spent) : 1;
    var photos = data.photos.filter(function (p) { return !p.hidden; }).slice(0, 6);
    var feed = [];
    pend.forEach(function (l) { feed.push({ ts: l.ts, html: '<span class="avatar sm">' + esc(U.initials(l.name)) + '</span><div><b>' + esc(l.name) + ' pidió cargar ' + money(l.amount) + '</b><small>Mesa ' + esc(l.table) + ' · ' + esc(l.method) + ' · ' + U.ago(l.ts) + '</small></div><button class="live-chip" data-verify="' + esc(l.id) + '">Confirmar</button>' }); });
    po.forEach(function (o) { feed.push({ ts: o.ts, html: '<span class="avatar sm">' + esc(U.initials(o.name)) + '</span><div><b>' + o.qty + '× ' + esc(o.drinkName) + ' · mesa ' + esc(o.table) + '</b><small>' + esc(o.name) + ' · ' + money(o.total) + ' · ' + U.ago(o.ts) + '</small></div><button class="live-chip live" data-op="order.deliver" data-id="' + esc(o.id) + '" title="Marcar entregado">Live</button>' }); });
    feed.sort(function (a, b) { return b.ts - a.ts; });

    return '<div class="bento">' +
      '<section class="b-hero">' +
        '<div><h2>La noche es <em>mejor</em> en el club</h2>' +
        '<p>Cargas, pedidos y fotos de tus clientes en tiempo real. Confirmá cada pago con el código del celular.</p>' +
        '<div class="b-hero-actions"><button class="pill-orange" data-tab="cargas">+ Confirmar cargas' + (pend.length ? ' (' + pend.length + ')' : '') + '</button></div></div>' +
        '<div class="b-hero-side"><div class="avatar-stack">' + (people.length ? people.map(function (c) { return '<span class="avatar">' + esc(U.initials(c.name)) + '</span>'; }).join('') : '<span class="avatar">—</span>') +
          (data.customers.length > 5 ? '<span class="avatar more">+' + (data.customers.length - 5) + '</span>' : '') + '</div>' +
          '<span class="online-chip"><i></i>' + data.customers.length + (data.customers.length === 1 ? ' cliente' : ' clientes') + '</span></div>' +
      '</section>' +

      '<section class="b-card b-members"><div class="b-head"><h3>Clientes <span class="b-count">' + data.customers.length + '</span></h3><button class="b-link" data-tab="clientes" aria-label="Ver clientes">↗</button></div>' +
        '<div class="members">' + (data.customers.slice(0, 6).map(function (c) {
          return '<div class="member"><span class="avatar lg">' + esc(U.initials(c.name)) + '</span><b>' + esc(c.name) + '</b><small>Mesa ' + esc(c.table) + '</small></div>';
        }).join('') || '<p class="b-empty">Todavía no entró nadie.</p>') + '</div></section>' +

      '<section class="b-card b-big"><div class="b-head"><h3>Gastado</h3><button class="b-link" data-tab="mesas" aria-label="Ver mesas">→</button></div>' +
        '<div class="big-num">' + money(t.spent) + '</div>' +
        '<div class="seg-bar"><i class="s1" style="flex:' + Math.max(0.001, t.spent) + '"></i><i class="s2" style="flex:' + Math.max(0.001, t.balance) + '"></i><i class="s3" style="flex:' + Math.max(0.001, t.discounts) + '"></i></div>' +
        '<div class="seg-legend"><span><i class="s1"></i>' + Math.round(t.spent / flow * 100) + '% usado</span><span><i class="s2"></i>' + money(t.balance) + ' sin usar</span><span><i class="s3"></i>' + money(t.discounts) + ' desc.</span></div></section>' +

      '<section class="b-card b-impact"><div class="b-head"><h3>Mesas</h3><span class="b-sub">Top gasto</span></div>' +
        '<div class="pillbars">' + (top.map(function (r, i) {
          return '<div class="pillbar"><div class="pill-track"><i class="' + (i === 0 ? 'hi' : i % 2 ? 'peach' : 'mint') + '" style="height:' + Math.max(14, r.spent / maxT * 100) + '%"><b>' + D.moneyShort(r.spent) + '</b></i></div><span>M' + esc(r.table) + '</span></div>';
        }).join('') || '<p class="b-empty">Sin consumos.</p>') + '</div></section>' +

      '<section class="b-card b-stats"><div class="b-head"><h3>Pedidos</h3><div class="mini-seg"><span class="on">Hoy</span></div></div>' +
        '<div class="stat-row"><div class="big-num sm">' + delivered + '<span>/' + totalOrders + '</span></div><small>entregados</small></div>' +
        '<div class="dash-bar"><i style="width:' + (totalOrders ? delivered / totalOrders * 100 : 0) + '%"></i></div>' +
        '<div class="stat-tiles"><div><b>' + po.length + '</b><small>Por entregar</small></div><div><b>' + pend.length + '</b><small>Cargas pendientes</small></div></div></section>' +

      '<section class="b-card b-promo"><div class="promo-badge">★</div><h3>Votá la <em>mejor</em> foto</h3>' +
        '<p>' + (data.contest ? 'Votación abierta · termina en <b id="st-contest-left">' + U.mmss(data.contest.endsAt - Date.now()) + '</b>' : 'Abrí una votación: la foto ganadora se lleva ' + data.settings.discountPct + '% OFF.') + '</p>' +
        '<button class="pill-mint" data-tab="votacion">' + (data.contest ? 'Ver ranking' : 'Abrir votación') + '</button></section>' +

      '<section class="b-card b-photos"><div class="b-head"><h3>Fotos de la noche</h3><button class="b-link" data-tab="fotos" aria-label="Ver fotos">+</button></div>' +
        '<div class="photo-row">' + (photos.map(function (p) {
          return '<figure><div class="ph"><img src="' + esc(p.src) + '" alt="" loading="lazy" /><span class="ph-tag">' + p.votes + ' ★</span></div><figcaption><b>' + esc(p.name) + '</b><small>Mesa ' + esc(p.table) + '</small></figcaption></figure>';
        }).join('') || '<p class="b-empty">Las fotos de los clientes aparecen acá.</p>') + '</div></section>' +

      '<section class="b-card b-notif"><div class="b-head"><h3>Notificaciones</h3><span class="b-sub">' + feed.length + ' pendientes</span></div>' +
        '<div class="notif-tabs"><span class="on">Todo</span><span>Cargas ' + pend.length + '</span><span>Pedidos ' + po.length + '</span></div>' +
        '<div class="notif-list">' + (feed.slice(0, 7).map(function (f) { return '<div class="notif">' + f.html + '</div>'; }).join('') || '<p class="b-empty">Todo al día ✓</p>') + '</div></section>' +
    '</div>';
  }

  /* Confirmar una carga tipeando el código del celular del cliente (estilo Glassy OTP). */
  function verifyLoad(id) {
    var l = data.loads.filter(function (x) { return x.id === id; })[0];
    if (!l) return;
    U.otp({
      icon: 'wallet',
      title: 'Confirmá el pago',
      sub: 'Ingresá el código de 4 dígitos que ' + esc(l.name) + ' ve en su celular<br><span class="glass-chip">' + money(l.amount) + ' · Mesa ' + esc(l.table) + '</span>',
      button: 'Verificar código',
      foot: data.role === 'admin' ? '¿Sin código? <button type="button" data-force-load="' + esc(l.id) + '">Confirmar igual</button>' : '',
      dock: '<span>✦ Pago en ' + esc(l.method) + '</span><span>' + money(l.amount) + '</span>',
      onSubmit: function (code) {
        return API.call('load.approve', { id: id, code: code }).then(function (r) {
          return r.ok ? { ok: true } : { ok: false, error: r.error };
        });
      },
      verifiedTitle: 'Pago verificado',
      verifiedSub: '+' + money(l.amount) + ' para ' + l.name + ' · el saldo ya está disponible',
      onDone: function () { refresh(); }
    });
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
    return '<div class="admin-card"><h3>Por confirmar <small>' + pend.length + '</small></h3><p>Cuando recibas el pago, tocá «Confirmar con código» y tipeá el código de 4 dígitos que el cliente ve en su celular.</p>' +
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
    document.documentElement.dataset.theme = 'light';   // el panel siempre usa el diseño claro
    $('st-user').addEventListener('input', loginBtnState);
    $('st-pass').addEventListener('input', loginBtnState);
    $('login-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var btn = $('login-btn'), card = $('login-form');
      if (btn.classList.contains('loading')) return;
      btn.className = 'glass-btn loading'; btn.textContent = 'Verificando…'; btn.disabled = true;
      $('login-error').textContent = '';
      var t0 = Date.now();
      API.call('staff.login', { user: $('st-user').value, pass: $('st-pass').value }).then(function (r) {
        setTimeout(function () {
          $('st-pass').value = '';
          if (!r.ok) {
            btn.className = 'glass-btn'; btn.textContent = 'Entrar'; btn.disabled = false;
            $('login-error').textContent = r.error;
            card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
            $('st-pass').focus();
            return;
          }
          $('st-user').value = '';
          btn.className = 'glass-btn success'; btn.textContent = 'Verificado';
          setTimeout(function () {
            tab = null;
            refresh().then(function () { U.toast('Acceso concedido', r.data.role === 'admin' ? 'Panel de administración.' : 'Panel de community manager.', 'up'); });
          }, 650);
        }, Math.max(0, 600 - (Date.now() - t0)));
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
      var vf = ev.target.closest('[data-verify]');
      if (vf) { verifyLoad(vf.dataset.verify); return; }
      var fz = ev.target.closest('[data-force-load]');
      if (fz) {
        var lid = fz.dataset.forceLoad;
        U.closeSheet();
        act('load.approve', { id: lid, force: true }, ['Carga confirmada sin código', 'Quedó registrada como confirmación manual.', 'info']);
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
