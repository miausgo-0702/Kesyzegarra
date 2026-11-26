/* ==========================================================================
   SERNOVA CLUB — portal de clientes (celular).
   Ingreso con nombre y mesa, carta en vivo, pedidos con saldo, cargas de
   saldo, fotos para la pantalla y votación con descuento.
   ========================================================================== */
(function () {
  'use strict';

  var D = window.SernovaData;
  var C = window.SernovaChart;
  var API = window.SernovaClub;
  var U = window.ClubUI;
  var $ = U.$, esc = U.esc;

  var me = null;          // respuesta de 'me'
  var pub = null;         // vista pública
  var market = null;      // estado público del mercado
  var view = 'carta';
  var method = 'efectivo';
  var pendingPhoto = null;
  var busy = false;
  var refreshTimer = null;
  var marketTimer = null;

  var AMOUNTS = [5000, 10000, 20000, 30000, 50000];

  function money(v) { return D.money(v); }

  /* ------------------------------------------------------------- datos */
  function refresh() {
    if (!API.getMe()) { showJoin(); return Promise.resolve(); }
    return API.call('me').then(function (r) {
      if (!r.ok) {
        if (r.code === 401) { API.setMe(null); showJoin(); U.toast('Sesión vencida', 'Ingresá de nuevo con tu nombre y mesa.', 'down'); }
        return;
      }
      me = r.data;
      pub = r.data.public;
      showApp();
      render();
    });
  }

  function refreshSoon() { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 120); }

  function loadMarket() {
    return API.fetchMarket().then(function (m) {
      if (m && m.market) { market = m; D.applyCatalog(m.catalog || null); }
      if (me) { renderCarta(); renderStrip(); }
    });
  }
  function loadMarketSoon() { clearTimeout(marketTimer); marketTimer = setTimeout(loadMarket, 400); }

  /* ------------------------------------------------------------ ingreso */
  function showJoin() {
    $('join').hidden = false;
    $('club').hidden = true;
    setTimeout(function () { $('join-name').focus(); }, 50);
  }
  function showApp() {
    $('join').hidden = true;
    $('club').hidden = false;
  }

  function onJoin(ev) {
    ev.preventDefault();
    if (busy) return;
    busy = true;
    API.call('join', { name: $('join-name').value, table: $('join-table').value }).then(function (r) {
      busy = false;
      if (!r.ok) { U.toast('No se pudo ingresar', r.error, 'down'); return; }
      U.toast('¡Hola, ' + r.data.customer.name + '!', 'Ya estás en la mesa ' + r.data.customer.table + '.', 'up');
      refresh().then(loadMarket);
    });
  }

  /* ------------------------------------------------------------- render */
  function render() {
    var c = me.customer;
    $('me-name').textContent = c.name;
    $('me-table').textContent = c.table;
    $('me-avatar').textContent = U.initials(c.name);
    $('me-balance').textContent = money(c.balance);
    renderAnnounce();
    renderStrip();
    renderCarta();
    renderSaldo();
    renderFotos();
  }

  function renderAnnounce() {
    var a = pub && pub.announcement;
    var el = $('announce');
    el.hidden = !a;
    if (a) el.innerHTML = '<b>📣</b><span>' + esc(a.text) + '</span>';
  }

  function renderStrip() {
    var el = $('cost-strip');
    var on = market && market.crash && market.crash.active;
    el.hidden = !on;
    if (on) el.innerHTML = '<strong>▼ PRECIO DE COSTO</strong><span>Toda la carta al costo · termina en <b>' + U.mmss(market.crash.until - Date.now()) + '</b></span>';
    var sub = $('carta-sub');
    if (sub) sub.textContent = market && market.table !== undefined ? 'Los precios se mueven con la demanda. ¡Aprovechá las caídas!' : 'Esperando la carta del bar…';
  }

  function avgPrice() {
    if (!market || !market.market) return 10000;
    var list = D.available(), sum = 0, n = 0;
    list.forEach(function (d) { var m = market.market[d.id]; if (m) { sum += m.price; n++; } });
    return n ? sum / n : 10000;
  }

  function discountInfo() {
    var d = me && me.customer.discount;
    return d && d.uses > 0 ? d : null;
  }

  function renderCarta() {
    var dc = $('discount-card');
    var disc = discountInfo();
    dc.hidden = !disc;
    if (disc) dc.innerHTML = '<b>' + disc.pct + '% OFF</b><span>' + esc(disc.reason || 'Descuento') + ' · se aplica en tu' + (disc.uses > 1 ? 's próximos ' + disc.uses + ' pedidos' : ' próximo pedido') + '</span>';

    var box = $('c-drinks');
    if (!market || !market.market) {
      box.innerHTML = '<div class="ledger-empty"><span>La carta aparece cuando el bar abre la terminal.</span><small>Si estás en el bar, esperá unos segundos.</small></div>';
      return;
    }
    var q = ($('c-search').value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    var atCost = market.crash && market.crash.active;
    var list = D.available().filter(function (d) {
      return market.market[d.id] && (!q || d.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').indexOf(q) >= 0);
    });
    box.innerHTML = list.map(function (d) {
      var m = market.market[d.id];
      var h = m.history || [];
      var last = h[h.length - 1], prev = h[h.length - 2];
      var dir = last ? last.dir : 'flat';
      var pct = last && prev && prev.price ? (last.price - prev.price) / prev.price * 100 : 0;
      var vs = (m.price - d.price) / d.price * 100;
      var cls = dir === 'up' ? 'up' : dir === 'down' ? 'down' : 'flat';
      var final = disc ? m.price - Math.round(m.price * disc.pct / 1000) * 10 : m.price;
      return '<article class="c-drink' + (atCost ? ' at-cost' : '') + '">' +
        '<div class="c-drink-main"><h3>' + esc(d.name) + '</h3>' +
          '<p>' + (atCost ? '<span class="cost-badge">A COSTO</span> ' : vs <= -8 ? '<span class="deal-badge">OPORTUNIDAD</span> ' : '') + '<span class="muted">Carta ' + money(d.price) + '</span></p></div>' +
        '<div class="c-spark">' + C.sparkline(h, 12) + '</div>' +
        '<div class="c-drink-price"><b class="' + cls + '">' + money(m.price) + '</b>' +
          (disc ? '<em class="up">' + money(final) + ' con desc.</em>' : '<em class="' + cls + '">' + (dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■') + ' ' + D.pct(pct) + '</em>') + '</div>' +
        '<button type="button" class="btn primary sm" data-order="' + esc(d.id) + '">Pedir</button>' +
      '</article>';
    }).join('') || '<div class="ledger-empty"><span>No hay tragos con ese nombre.</span></div>';
  }

  function renderSaldo() {
    var c = me.customer;
    $('w-balance').textContent = money(c.balance);
    var n = Math.floor(c.balance / avgPrice());
    $('w-drinks').textContent = '≈ ' + n + (n === 1 ? ' trago' : ' tragos') + ' al precio actual';
    $('w-loaded').textContent = money(c.loaded);
    $('w-spent').textContent = money(c.spent);
    $('amount-chips').innerHTML = AMOUNTS.map(function (a) {
      return '<button type="button" class="chip" data-amount="' + a + '">' + money(a) + '</button>';
    }).join('');
    var alias = pub && pub.settings && pub.settings.transferAlias;
    var note = $('alias-note');
    note.hidden = method !== 'transferencia';
    note.innerHTML = alias ? 'Transferí al alias <b>' + esc(alias) + '</b> y mostrale el comprobante al staff.' : 'Pedile al staff el alias para transferir.';

    var pend = me.loads.filter(function (l) { return l.status === 'pendiente'; });
    $('pending-loads').innerHTML = pend.map(function (l) {
      return '<div class="pending-load"><div><span>Carga pendiente · ' + esc(l.method) + '</span><strong>' + money(l.amount) + '</strong></div>' +
        '<div class="load-code"><span>Código</span><b>' + esc(l.code) + '</b></div>' +
        '<p>Mostrale este código al staff para que confirme la carga.</p></div>';
    }).join('');

    var moves = [];
    me.loads.forEach(function (l) { moves.push({ ts: l.ts, html: '<span class="mv-ico ' + (l.status === 'aprobada' ? 'in' : l.status === 'rechazada' ? 'x' : 'wait') + '">' + (l.status === 'aprobada' ? '+' : l.status === 'rechazada' ? '×' : '…') + '</span><div><b>' + (l.amount < 0 ? 'Ajuste' : 'Carga') + ' ' + esc(l.status) + '</b><small>' + esc(l.method) + ' · ' + U.ago(l.ts) + '</small></div><strong class="' + (l.status === 'aprobada' ? (l.amount < 0 ? 'down' : 'up') : 'muted') + '">' + (l.amount > 0 ? '+' : '') + money(l.amount) + '</strong>' }); });
    me.orders.forEach(function (o) { moves.push({ ts: o.ts, html: '<span class="mv-ico out">🍸</span><div><b>' + o.qty + '× ' + esc(o.drinkName) + '</b><small>' + esc(o.status) + (o.discount ? ' · desc. ' + money(o.discount) : '') + (o.atCost ? ' · a costo' : '') + ' · ' + U.ago(o.ts) + '</small></div><strong class="' + (o.status === 'cancelado' ? 'muted' : 'down') + '">' + (o.status === 'cancelado' ? 'devuelto' : '−' + money(o.total)) + '</strong>' }); });
    moves.sort(function (a, b) { return b.ts - a.ts; });
    $('moves').innerHTML = moves.slice(0, 40).map(function (m) { return '<div class="mv-row">' + m.html + '</div>'; }).join('') ||
      '<div class="ledger-empty small"><span>Todavía no hay movimientos.</span></div>';
  }

  function renderFotos() {
    var contest = pub.contest;
    var last = pub.lastContest;
    var cc = $('contest-card');
    if (contest) {
      cc.className = 'contest-card open';
      cc.innerHTML = '<span class="live-badge"><i></i> VOTACIÓN ABIERTA</span><h3>Votá la mejor foto de la noche</h3>' +
        '<p>La foto con más votos gana <b>' + contest.discountPct + '% OFF</b> en ' + (contest.uses > 1 ? contest.uses + ' pedidos' : 'su próximo pedido') + '. Tenés 1 voto (podés cambiarlo).</p>' +
        '<div class="contest-timer">Termina en <b id="contest-left">' + U.mmss(contest.endsAt - Date.now()) + '</b></div>';
    } else if (last && last.winner) {
      cc.className = 'contest-card winner';
      cc.innerHTML = '<img src="' + esc(last.winner.src) + '" alt="Foto ganadora" /><div><span class="eyebrow gold">Última ganadora</span><h3>' + esc(last.winner.name) + ' · Mesa ' + esc(last.winner.table) + '</h3><p>' + last.winner.votes + (last.winner.votes === 1 ? ' voto' : ' votos') + ' · ganó ' + last.discountPct + '% OFF</p></div>';
    } else {
      cc.className = 'contest-card';
      cc.innerHTML = '<h3>Votación de fotos</h3><p class="muted">Cuando el equipo abra la votación vas a poder votar la mejor foto. ¡La ganadora se lleva un descuento!</p>';
    }
    var mine = me.myPhotos || [];
    var photos = pub.photos || [];
    $('gallery-sub').textContent = photos.length ? photos.length + (photos.length === 1 ? ' foto' : ' fotos') : '';
    $('gallery').innerHTML = photos.map(function (p) {
      var own = mine.indexOf(p.id) >= 0;
      var voted = me.myVote === p.id;
      return '<figure class="g-item' + (voted ? ' voted' : '') + '">' +
        '<img src="' + esc(p.src) + '" alt="Foto de ' + esc(p.name) + '" loading="lazy" />' +
        '<figcaption><b>' + esc(p.name) + '</b> · Mesa ' + esc(p.table) + (p.caption ? '<span>' + esc(p.caption) + '</span>' : '') + '</figcaption>' +
        (contest ? '<div class="g-vote">' + (own ? '<span class="own">Tu foto · ' + p.votes + (p.votes === 1 ? ' voto' : ' votos') + '</span>' :
          '<button type="button" class="btn sm ' + (voted ? 'primary' : '') + '" data-vote="' + esc(p.id) + '">' + (voted ? '✓ Tu voto' : 'Votar') + '</button><span>' + p.votes + '</span>') + '</div>' : (own ? '<div class="g-vote"><span class="own">Tu foto</span></div>' : '')) +
      '</figure>';
    }).join('') || '<div class="ledger-empty"><span>Todavía no hay fotos.</span><small>¡Sacá la primera!</small></div>';
  }

  function go(v) {
    view = v;
    ['carta', 'saldo', 'fotos'].forEach(function (k) { $('view-' + k).hidden = k !== v; });
    document.querySelectorAll('.club-nav button').forEach(function (b) { b.classList.toggle('active', b.dataset.go === v); });
    window.scrollTo(0, 0);
  }

  /* -------------------------------------------------------------- pedir */
  function openOrder(id) {
    var d = D.byId(id);
    var m = market && market.market[id];
    if (!d || !m) return;
    var qty = 1;
    var disc = discountInfo();
    function body() {
      var sub = m.price * qty;
      var off = disc ? Math.round(sub * disc.pct / 1000) * 10 : 0;
      var total = sub - off;
      var bal = me.customer.balance;
      return '<p class="eyebrow">Pedir con tu saldo</p><h2>' + esc(d.name) + '</h2><p class="muted">' + esc(d.description) + '</p>' +
        '<div class="qty-picker"><button type="button" class="step-btn" data-q="-1" aria-label="Menos">−</button><output>' + qty + '</output><button type="button" class="step-btn" data-q="1" aria-label="Más">+</button></div>' +
        '<div class="bill-totals"><div><span>' + qty + ' × ' + money(m.price) + '</span><b>' + money(sub) + '</b></div>' +
        (off ? '<div class="up"><span>Descuento ' + disc.pct + '%</span><b>−' + money(off) + '</b></div>' : '') +
        '<div class="grand"><span>Total</span><b>' + money(total) + '</b></div>' +
        '<div><span>Saldo después</span><b class="' + (bal - total < 0 ? 'down' : '') + '">' + money(bal - total) + '</b></div></div>' +
        (bal < total ? '<p class="modal-note cost">Saldo insuficiente. Cargá saldo en la pestaña «Saldo».</p>' : '<p class="modal-note">El precio puede cambiar: se cobra el precio del momento en que confirmás.</p>') +
        '<div class="modal-actions">' + (bal < total ? '<button type="button" class="btn primary" data-go-load>Cargar saldo</button>' :
          '<button type="button" class="btn primary" data-confirm-order>Confirmar pedido · ' + money(total) + '</button>') + '</div>';
    }
    var modal = U.openSheet(body(), 'Pedir ' + d.name);
    modal.addEventListener('click', function (ev) {
      var q = ev.target.closest('[data-q]');
      if (q) { qty = Math.max(1, Math.min(10, qty + parseInt(q.dataset.q, 10))); modal.innerHTML = modal.querySelector('.modal-x').outerHTML + body(); return; }
      if (ev.target.closest('[data-go-load]')) { U.closeSheet(); go('saldo'); return; }
      var cf = ev.target.closest('[data-confirm-order]');
      if (cf && !busy) {
        busy = true; cf.disabled = true;
        API.call('order', { drinkId: id, qty: qty }).then(function (r) {
          busy = false;
          if (!r.ok) { cf.disabled = false; U.toast('No se pudo pedir', r.error.replace(/(\d{4,})/g, function (n) { return money(+n); }), 'down'); return; }
          U.closeSheet();
          U.toast('¡Pedido enviado!', r.data.order.qty + '× ' + r.data.order.drinkName + ' · ' + money(r.data.order.total) + '. Te lo llevan a la mesa.', 'up');
          try { if (navigator.vibrate) navigator.vibrate(30); } catch (e) { /* noop */ }
          refresh();
        });
      }
    });
  }

  /* -------------------------------------------------------------- saldo */
  function requestLoad() {
    var amount = parseInt($('load-amount').value, 10);
    if (!amount) { U.toast('Elegí un monto', 'Tocá un monto o escribí otro.', 'down'); return; }
    if (busy) return;
    busy = true;
    API.call('load.request', { amount: amount, method: method }).then(function (r) {
      busy = false;
      if (!r.ok) { U.toast('No se pudo pedir la carga', r.error, 'down'); return; }
      $('load-amount').value = '';
      document.querySelectorAll('#amount-chips .chip').forEach(function (c) { c.classList.remove('active'); });
      U.toast('Carga pedida', 'Mostrale el código ' + r.data.load.code + ' al staff.', 'info');
      refresh();
    });
  }

  function editProfile() {
    var c = me.customer;
    var modal = U.openSheet('<p class="eyebrow">Tus datos</p><h2>Nombre y mesa</h2>' +
      '<label class="field"><span class="field-label">Nombre</span><input id="pf-name" type="text" maxlength="28" value="' + esc(c.name) + '" /></label>' +
      '<label class="field" style="margin-top:10px"><span class="field-label">Mesa</span><input id="pf-table" type="text" maxlength="14" value="' + esc(c.table) + '" /></label>' +
      '<div class="modal-actions"><button type="button" class="btn primary" data-save-profile>Guardar</button></div>', 'Tus datos');
    modal.querySelector('[data-save-profile]').addEventListener('click', function () {
      API.call('profile', { name: $('pf-name').value, table: $('pf-table').value }).then(function (r) {
        if (!r.ok) { U.toast('No se pudo guardar', r.error, 'down'); return; }
        U.closeSheet(); U.toast('Datos actualizados', '', 'info'); refresh();
      });
    });
  }

  /* -------------------------------------------------------------- fotos */
  function onPhoto(ev) {
    var file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    API.compressImage(file).then(function (data) {
      pendingPhoto = data;
      $('photo-img').src = data;
      $('photo-preview').hidden = false;
      $('photo-caption').focus();
    }).catch(function (e) { U.toast('No se pudo usar la foto', e.message, 'down'); });
  }

  function sendPhoto() {
    if (!pendingPhoto || busy) return;
    busy = true;
    $('photo-send').disabled = true;
    API.call('photo.upload', { dataUrl: pendingPhoto, caption: $('photo-caption').value }).then(function (r) {
      busy = false;
      $('photo-send').disabled = false;
      if (!r.ok) { U.toast('No se pudo publicar', r.error, 'down'); return; }
      pendingPhoto = null;
      $('photo-preview').hidden = true;
      $('photo-caption').value = '';
      U.toast('¡Foto publicada!', 'Ya aparece en la pantalla del bar.', 'up');
      refresh();
    });
  }

  function vote(id) {
    if (busy) return;
    busy = true;
    API.call('vote', { photoId: id }).then(function (r) {
      busy = false;
      if (!r.ok) { U.toast('No se pudo votar', r.error, 'down'); return; }
      U.toast('¡Voto registrado!', 'Podés cambiarlo mientras la votación esté abierta.', 'up');
      refresh();
    });
  }

  /* --------------------------------------------------------------- wire */
  function init() {
    U.applyTheme();
    $('join-form').addEventListener('submit', onJoin);
    document.addEventListener('click', function (ev) {
      var g = ev.target.closest('[data-go]');
      if (g) { go(g.dataset.go); return; }
      var o = ev.target.closest('[data-order]');
      if (o) { openOrder(o.dataset.order); return; }
      var a = ev.target.closest('[data-amount]');
      if (a) {
        $('load-amount').value = a.dataset.amount;
        document.querySelectorAll('#amount-chips .chip').forEach(function (c) { c.classList.toggle('active', c === a); });
        return;
      }
      var mt = ev.target.closest('[data-method]');
      if (mt) {
        method = mt.dataset.method;
        document.querySelectorAll('#load-method button').forEach(function (b) { b.classList.toggle('active', b === mt); });
        renderSaldo();
        return;
      }
      var v = ev.target.closest('[data-vote]');
      if (v) { vote(v.dataset.vote); return; }
    });
    $('btn-load').addEventListener('click', requestLoad);
    $('btn-profile').addEventListener('click', editProfile);
    $('photo-input').addEventListener('change', onPhoto);
    $('photo-send').addEventListener('click', sendPhoto);
    $('photo-cancel').addEventListener('click', function () { pendingPhoto = null; $('photo-preview').hidden = true; });
    $('c-search').addEventListener('input', renderCarta);

    API.onChange(function (src) {
      if (src === 'market') loadMarketSoon();
      else refreshSoon();
      if (src === 'poll') loadMarketSoon();
    });
    setInterval(function () {
      if (!me) return;
      renderStrip();
      var cl = $('contest-left');
      if (cl && pub.contest) {
        var left = pub.contest.endsAt - Date.now();
        cl.textContent = U.mmss(left);
        if (left <= 0) refreshSoon();
      }
    }, 1000);
    setInterval(function () { if (me && API.mode() === 'server') loadMarket(); }, 10000);

    API.ready().then(function () { return refresh(); }).then(loadMarket);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
