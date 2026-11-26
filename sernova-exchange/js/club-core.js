/* ==========================================================================
   SERNOVA CLUB — núcleo compartido (servidor Node y modo local del navegador)

   Clientes con nombre y mesa, saldo digital para tragos, cargas de saldo
   aprobadas por el staff, pedidos, fotos, votación con descuento, anuncios
   y acceso de staff (administrador y community manager).

   Todo pasa por handle(db, op, payload, ctx), así la misma lógica corre en
   server.js y en el navegador cuando no hay servidor.
   Las credenciales del staff solo existen como hash.
   ========================================================================== */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.SernovaClubCore = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STAFF_ROUNDS = 800;
  // hash(usuario + clave) por rol: administrador y community manager.
  var STAFF_DEFAULT = {
    admin: '6105689f506ec7646b5add44bfab6b1e0653b03fa27d61a45ad368be34f86ddf',
    cm: 'c1ec238d012790a476d328e615248f4616370e27150bf87f103bf9dba9d60f88'
  };
  var SESSION_MS = 12 * 60 * 60 * 1000;
  var MAX_FAILS = 5;
  var LOCK_MS = 60 * 1000;

  var ROLE_OPS = {
    admin: ['staff.data', 'staff.logout', 'staff.password', 'load.approve', 'load.reject', 'credit.add',
      'order.deliver', 'order.cancel', 'customer.discount', 'settings', 'club.reset',
      'photo.hide', 'photo.show', 'photo.delete', 'photo.feature', 'contest.open', 'contest.close', 'announce'],
    cm: ['staff.data', 'staff.logout', 'staff.password', 'photo.hide', 'photo.show', 'photo.delete',
      'photo.feature', 'contest.open', 'contest.close', 'announce']
  };

  function emptyDb() {
    return {
      version: 1, seq: 0, updatedAt: 0,
      customers: {}, loads: [], orders: [], photos: [], votes: {},
      contest: null, lastContest: null, announcement: null,
      staff: {}, sessions: {}, lock: { count: 0, until: 0 },
      settings: { transferAlias: '', discountPct: 20, discountUses: 1, contestMinutes: 15 }
    };
  }

  function normalize(db) {
    var base = emptyDb();
    db = db && typeof db === 'object' ? db : base;
    Object.keys(base).forEach(function (k) { if (db[k] === undefined || db[k] === null && k !== 'contest' && k !== 'lastContest' && k !== 'announcement') db[k] = base[k]; });
    db.settings = Object.assign({}, base.settings, db.settings || {});
    return db;
  }

  var K256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function utf8(str) {
    var out = [];
    var s = unescape(encodeURIComponent(str));
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function sha256(str) {
    var bytes = utf8(str);
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (var s = 7; s >= 0; s--) bytes.push(s >= 4 ? 0 : (bitLen >>> (s * 8)) & 0xff);
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var W = new Array(64);
    for (var off = 0; off < bytes.length; off += 64) {
      for (var t = 0; t < 16; t++) {
        W[t] = (bytes[off + t * 4] << 24) | (bytes[off + t * 4 + 1] << 16) | (bytes[off + t * 4 + 2] << 8) | bytes[off + t * 4 + 3];
      }
      for (t = 16; t < 64; t++) {
        var x = W[t - 15], y = W[t - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K256[t] + W[t]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (v) { return ('00000000' + (v >>> 0).toString(16)).slice(-8); }).join('');
  }


  function staffHash(sha, user, pass) {
    sha = sha || sha256;
    var h = 'sernova-staff|' + String(user || '').trim().toLowerCase() + '|' + String(pass || '');
    for (var i = 0; i < STAFF_ROUNDS; i++) h = sha(h + '|sernova-club');
    return h;
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function round10(v) { return Math.round(v / 10) * 10; }
  function str(v, max) { return String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }
  function nextId(db, p) { db.seq = (db.seq || 0) + 1; return p + db.seq.toString(36); }
  function fail(error, code) { return { ok: false, error: error, code: code || 400 }; }
  function ok(data) { return { ok: true, data: data }; }

  function pubCustomer(c) {
    if (!c) return null;
    return {
      id: c.id, name: c.name, table: c.table, balance: c.balance, loaded: c.loaded, spent: c.spent,
      discount: c.discount && c.discount.uses > 0 ? c.discount : null, createdAt: c.createdAt
    };
  }

  /* ----------------------------------------------------------- votación */
  function tally(db) {
    var counts = {};
    var c = db.contest;
    if (!c) return counts;
    var v = db.votes[c.id] || {};
    Object.keys(v).forEach(function (cid) { counts[v[cid]] = (counts[v[cid]] || 0) + 1; });
    return counts;
  }

  function closeContest(db, now) {
    var c = db.contest;
    if (!c) return null;
    var counts = tally(db);
    var best = null;
    db.photos.forEach(function (p) {
      if (p.hidden) return;
      var n = counts[p.id] || 0;
      if (!n) return;
      if (!best || n > best.n || (n === best.n && p.ts < best.p.ts)) best = { p: p, n: n };
    });
    var result = { id: c.id, closedAt: now, discountPct: c.discountPct, uses: c.uses, votes: 0, winner: null };
    Object.keys(counts).forEach(function (k) { result.votes += counts[k]; });
    if (best) {
      var owner = db.customers[best.p.customerId];
      result.winner = { photoId: best.p.id, src: best.p.src, name: best.p.name, table: best.p.table, votes: best.n };
      if (owner) owner.discount = { pct: c.discountPct, uses: c.uses, reason: 'Ganaste la votación de fotos', at: now };
    }
    db.lastContest = result;
    db.contest = null;
    return result;
  }

  function maybeClose(db, now) {
    if (db.contest && db.contest.endsAt && now >= db.contest.endsAt) closeContest(db, now);
  }

  /* ------------------------------------------------------------- vistas */
  function publicView(db, now) {
    var counts = tally(db);
    var photos = db.photos.filter(function (p) { return !p.hidden; }).slice(0, 60).map(function (p) {
      return { id: p.id, src: p.src, name: p.name, table: p.table, caption: p.caption, ts: p.ts, featured: !!p.featured, votes: counts[p.id] || 0 };
    });
    var board = photos.filter(function (p) { return p.votes; }).sort(function (a, b) { return b.votes - a.votes || a.ts - b.ts; }).slice(0, 5);
    var tables = {};
    Object.keys(db.customers).forEach(function (id) { tables[db.customers[id].table] = 1; });
    return {
      now: now,
      photos: photos,
      leaderboard: board,
      contest: db.contest ? { id: db.contest.id, open: true, startedAt: db.contest.startedAt, endsAt: db.contest.endsAt, discountPct: db.contest.discountPct, uses: db.contest.uses } : null,
      lastContest: db.lastContest,
      announcement: db.announcement,
      recentOrders: db.orders.slice(0, 30).map(function (o) {
        return { id: o.id, table: o.table, drinkId: o.drinkId, drinkName: o.drinkName, qty: o.qty, ts: o.ts, status: o.status };
      }),
      stats: { customers: Object.keys(db.customers).length, tables: Object.keys(tables).length },
      settings: { transferAlias: db.settings.transferAlias, discountPct: db.settings.discountPct }
    };
  }

  function tablesView(db) {
    var t = {};
    function row(name) { return t[name] || (t[name] = { table: name, customers: [], spent: 0, orders: 0, units: 0, balance: 0, loaded: 0, lastTs: 0 }); }
    Object.keys(db.customers).forEach(function (id) {
      var c = db.customers[id];
      var r = row(c.table);
      r.customers.push({ id: c.id, name: c.name, balance: c.balance, spent: c.spent });
      r.balance += c.balance; r.loaded += c.loaded;
      r.lastTs = Math.max(r.lastTs, c.lastTs || c.createdAt);
    });
    db.orders.forEach(function (o) {
      if (o.status === 'cancelado') return;
      var r = row(o.table);
      r.spent += o.total; r.orders++; r.units += o.qty;
      r.lastTs = Math.max(r.lastTs, o.ts);
    });
    return Object.keys(t).map(function (k) { return t[k]; }).sort(function (a, b) { return b.spent - a.spent; });
  }

  function staffView(db, role, now) {
    var pv = publicView(db, now);
    var allPhotos = db.photos.map(function (p) {
      return { id: p.id, src: p.src, name: p.name, table: p.table, caption: p.caption, ts: p.ts, hidden: !!p.hidden, featured: !!p.featured, customerId: p.customerId };
    });
    var counts = tally(db);
    allPhotos.forEach(function (p) { p.votes = counts[p.id] || 0; });
    var base = { role: role, public: pv, photos: allPhotos, contest: pv.contest, lastContest: db.lastContest, announcement: db.announcement, settings: db.settings, customersCount: Object.keys(db.customers).length };
    if (role !== 'admin') return base;
    var customers = Object.keys(db.customers).map(function (id) { return pubCustomer(db.customers[id]); })
      .sort(function (a, b) { return b.spent - a.spent; });
    var totals = { loaded: 0, spent: 0, balance: 0, pendingLoads: 0, pendingOrders: 0, discounts: 0 };
    customers.forEach(function (c) { totals.loaded += c.loaded; totals.spent += c.spent; totals.balance += c.balance; });
    db.loads.forEach(function (l) { if (l.status === 'pendiente') totals.pendingLoads++; });
    db.orders.forEach(function (o) { if (o.status === 'pendiente') totals.pendingOrders++; if (o.status !== 'cancelado') totals.discounts += o.discount; });
    base.customers = customers;
    base.tables = tablesView(db);
    base.loads = db.loads.slice(0, 200);
    base.orders = db.orders.slice(0, 300);
    base.totals = totals;
    return base;
  }

  /* ------------------------------------------------------------- staff */
  function staffAuth(db, ctx) {
    var tok = ctx.auth && ctx.auth.staff;
    var s = tok && db.sessions[tok];
    if (!s || s.exp < ctx.now) { if (s) delete db.sessions[tok]; return null; }
    s.exp = ctx.now + SESSION_MS;
    return s.role;
  }

  function staffHashFor(db, role) { return (db.staff[role] && db.staff[role].hash) || STAFF_DEFAULT[role]; }

  /* ---------------------------------------------------------------- ops */
  function handle(db, op, payload, ctx) {
    payload = payload || {};
    var now = ctx.now;
    maybeClose(db, now);

    // ---------------- públicas
    if (op === 'public') return ok(publicView(db, now));

    if (op === 'join') {
      var name = str(payload.name, 28), table = str(payload.table, 14);
      if (name.length < 2) return fail('Escribí tu nombre (al menos 2 letras).');
      if (!table) return fail('Indicá tu mesa.');
      if (Object.keys(db.customers).length >= 3000) return fail('Se alcanzó el máximo de clientes de la noche.');
      var id = nextId(db, 'c');
      var token = ctx.rand(24);
      db.customers[id] = { id: id, token: token, name: name, table: table, balance: 0, loaded: 0, spent: 0, discount: null, createdAt: now, lastTs: now };
      db.updatedAt = now;
      return ok({ id: id, token: token, customer: pubCustomer(db.customers[id]) });
    }

    if (op === 'staff.login') {
      if (db.lock.until > now) return fail('Demasiados intentos. Esperá ' + Math.ceil((db.lock.until - now) / 1000) + ' s.', 429);
      var h = staffHash(ctx.sha256, payload.user, payload.pass);
      var role = h === staffHashFor(db, 'admin') ? 'admin' : h === staffHashFor(db, 'cm') ? 'cm' : null;
      if (!role) {
        db.lock.count = (db.lock.count || 0) + 1;
        if (db.lock.count >= MAX_FAILS) { db.lock = { count: 0, until: now + LOCK_MS }; }
        return fail('Usuario o contraseña incorrectos.', 401);
      }
      db.lock = { count: 0, until: 0 };
      var st = ctx.rand(32);
      Object.keys(db.sessions).forEach(function (k) { if (db.sessions[k].exp < now) delete db.sessions[k]; });
      db.sessions[st] = { role: role, exp: now + SESSION_MS };
      return ok({ token: st, role: role });
    }

    // ---------------- clientes
    if (op === 'me' || op === 'load.request' || op === 'order' || op === 'photo.upload' || op === 'vote' || op === 'profile') {
      var a = ctx.auth || {};
      var c = a.id && db.customers[a.id];
      if (!c || c.token !== a.token) return fail('Sesión de cliente no válida. Volvé a ingresar.', 401);
      c.lastTs = now;

      if (op === 'me') {
        var myVote = db.contest ? (db.votes[db.contest.id] || {})[c.id] || null : null;
        return ok({
          customer: pubCustomer(c),
          orders: db.orders.filter(function (o) { return o.customerId === c.id; }).slice(0, 40),
          loads: db.loads.filter(function (l) { return l.customerId === c.id; }).slice(0, 20),
          myPhotos: db.photos.filter(function (p) { return p.customerId === c.id; }).map(function (p) { return p.id; }),
          myVote: myVote,
          public: publicView(db, now)
        });
      }

      if (op === 'profile') {
        var nn = str(payload.name, 28), nt = str(payload.table, 14);
        if (nn.length >= 2) c.name = nn;
        if (nt) c.table = nt;
        db.updatedAt = now;
        return ok({ customer: pubCustomer(c) });
      }

      if (op === 'load.request') {
        var amount = round10(parseInt(payload.amount, 10) || 0);
        if (amount < 1000 || amount > 500000) return fail('El monto debe estar entre $ 1.000 y $ 500.000.');
        var method = ['efectivo', 'transferencia', 'tarjeta'].indexOf(payload.method) >= 0 ? payload.method : 'efectivo';
        var pend = db.loads.filter(function (l) { return l.customerId === c.id && l.status === 'pendiente'; }).length;
        if (pend >= 3) return fail('Ya tenés 3 cargas pendientes. Esperá que el staff las confirme.');
        var code = String(Math.floor(1000 + Math.random() * 9000));
        var load = { id: nextId(db, 'l'), customerId: c.id, name: c.name, table: c.table, amount: amount, method: method, code: code, status: 'pendiente', ts: now };
        db.loads.unshift(load);
        db.loads = db.loads.slice(0, 2000);
        db.updatedAt = now;
        return ok({ load: load });
      }

      if (op === 'order') {
        var drink = ctx.drinkInfo && ctx.drinkInfo(payload.drinkId);
        var m = ctx.market && ctx.market[payload.drinkId];
        if (!drink || drink.enabled === false || !m) return fail('Ese trago no está disponible ahora.');
        var qty = clamp(parseInt(payload.qty, 10) || 1, 1, 10);
        var unit = m.price;
        var subtotal = unit * qty;
        var disc = c.discount && c.discount.uses > 0 ? round10(subtotal * c.discount.pct / 100) : 0;
        var total = subtotal - disc;
        if (c.balance < total) return fail('Saldo insuficiente: necesitás ' + total + ' y tenés ' + c.balance + '.', 402);
        c.balance -= total;
        c.spent += total;
        if (disc) { c.discount.uses--; if (c.discount.uses <= 0) c.discount = null; }
        var order = {
          id: nextId(db, 'o'), customerId: c.id, name: c.name, table: c.table,
          drinkId: payload.drinkId, drinkName: drink.name, qty: qty, unitPrice: unit,
          subtotal: subtotal, discount: disc, total: total, atCost: !!ctx.atCost, ts: now, status: 'pendiente'
        };
        db.orders.unshift(order);
        db.orders = db.orders.slice(0, 5000);
        db.updatedAt = now;
        return ok({ order: order, customer: pubCustomer(c) });
      }

      if (op === 'photo.upload') {
        var data = String(payload.dataUrl || '');
        if (!/^data:image\/(jpeg|png|webp);base64,/.test(data)) return fail('Formato de foto no válido.');
        if (data.length > (ctx.maxPhotoChars || 900000)) return fail('La foto es demasiado grande.');
        var mine = db.photos.filter(function (p) { return p.customerId === c.id; }).length;
        if (mine >= 12) return fail('Llegaste al máximo de 12 fotos.');
        var pid = nextId(db, 'p');
        var src = ctx.savePhoto ? ctx.savePhoto(pid, data) : data;
        if (!src) return fail('No se pudo guardar la foto.');
        db.photos.unshift({ id: pid, customerId: c.id, name: c.name, table: c.table, caption: str(payload.caption, 80), src: src, ts: now, hidden: false, featured: false });
        var max = ctx.maxPhotos || 200;
        while (db.photos.length > max) {
          var old = db.photos.pop();
          if (ctx.deletePhoto) ctx.deletePhoto(old.id);
        }
        db.updatedAt = now;
        return ok({ photoId: pid });
      }

      if (op === 'vote') {
        if (!db.contest) return fail('La votación no está abierta.');
        var ph = db.photos.filter(function (p) { return p.id === payload.photoId && !p.hidden; })[0];
        if (!ph) return fail('Esa foto ya no está disponible.');
        if (ph.customerId === c.id) return fail('No podés votar tu propia foto.');
        var box = db.votes[db.contest.id] || (db.votes[db.contest.id] = {});
        box[c.id] = ph.id;
        db.updatedAt = now;
        return ok({ myVote: ph.id });
      }
    }

    // ---------------- staff
    var srole = staffAuth(db, ctx);
    if (!srole) return fail('Sesión de staff vencida. Volvé a ingresar.', 401);
    if (ROLE_OPS[srole].indexOf(op) < 0) return fail('Tu usuario no tiene permiso para esta acción.', 403);
    db.updatedAt = now;

    function findBy(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }

    switch (op) {
      case 'staff.data': return ok(staffView(db, srole, now));
      case 'staff.logout': delete db.sessions[ctx.auth.staff]; return ok({});
      case 'staff.password': {
        if (staffHash(ctx.sha256, payload.user, payload.current) !== staffHashFor(db, srole)) return fail('Usuario o contraseña actual incorrectos.');
        if (String(payload.next || '').length < 4) return fail('La nueva contraseña debe tener al menos 4 caracteres.');
        db.staff[srole] = { hash: staffHash(ctx.sha256, payload.newUser || payload.user, payload.next), changedAt: now };
        return ok({});
      }
      case 'load.approve': case 'load.reject': {
        var l = findBy(db.loads, payload.id);
        if (!l || l.status !== 'pendiente') return fail('La carga ya fue procesada.');
        l.status = op === 'load.approve' ? 'aprobada' : 'rechazada';
        l.by = srole; l.doneAt = now;
        if (op === 'load.approve') {
          var lc = db.customers[l.customerId];
          if (!lc) return fail('El cliente ya no existe.');
          lc.balance += l.amount; lc.loaded += l.amount;
        }
        return ok({ load: l });
      }
      case 'credit.add': {
        var cc = db.customers[payload.customerId];
        var amt = round10(parseInt(payload.amount, 10) || 0);
        if (!cc || !amt) return fail('Indicá un cliente y un monto.');
        if (cc.balance + amt < 0) return fail('El saldo no puede quedar negativo.');
        cc.balance += amt;
        if (amt > 0) cc.loaded += amt;
        db.loads.unshift({ id: nextId(db, 'l'), customerId: cc.id, name: cc.name, table: cc.table, amount: amt, method: amt > 0 ? 'staff' : 'ajuste', code: '', note: str(payload.note, 60), status: 'aprobada', by: srole, ts: now, doneAt: now });
        return ok({ customer: pubCustomer(cc) });
      }
      case 'order.deliver': {
        var od = findBy(db.orders, payload.id);
        if (!od || od.status !== 'pendiente') return fail('El pedido ya fue procesado.');
        od.status = 'entregado'; od.doneAt = now;
        return ok({ order: od });
      }
      case 'order.cancel': {
        var oc = findBy(db.orders, payload.id);
        if (!oc || oc.status === 'cancelado') return fail('El pedido ya fue cancelado.');
        oc.status = 'cancelado'; oc.doneAt = now;
        var oc2 = db.customers[oc.customerId];
        if (oc2) {
          oc2.balance += oc.total; oc2.spent -= oc.total;
          if (oc.discount) oc2.discount = { pct: Math.round(oc.discount / oc.subtotal * 100), uses: ((oc2.discount && oc2.discount.uses) || 0) + 1, reason: 'Descuento devuelto', at: now };
        }
        return ok({ order: oc });
      }
      case 'customer.discount': {
        var dc = db.customers[payload.customerId];
        if (!dc) return fail('Cliente no encontrado.');
        var pct = clamp(parseInt(payload.pct, 10) || 0, 0, 100);
        dc.discount = pct ? { pct: pct, uses: clamp(parseInt(payload.uses, 10) || 1, 1, 50), reason: str(payload.reason, 60) || 'Descuento del bar', at: now } : null;
        return ok({ customer: pubCustomer(dc) });
      }
      case 'settings': {
        var s = db.settings;
        if (payload.transferAlias !== undefined) s.transferAlias = str(payload.transferAlias, 60);
        if (payload.discountPct !== undefined) s.discountPct = clamp(parseInt(payload.discountPct, 10) || 20, 1, 100);
        if (payload.discountUses !== undefined) s.discountUses = clamp(parseInt(payload.discountUses, 10) || 1, 1, 20);
        if (payload.contestMinutes !== undefined) s.contestMinutes = clamp(parseInt(payload.contestMinutes, 10) || 15, 1, 240);
        return ok({ settings: s });
      }
      case 'club.reset': {
        var keep = { staff: db.staff, sessions: db.sessions, settings: db.settings, seq: db.seq };
        var fresh = emptyDb();
        Object.keys(db).forEach(function (k) { delete db[k]; });
        Object.assign(db, fresh, keep);
        if (ctx.deletePhoto) ctx.deletePhoto('*');
        return ok({});
      }
      case 'photo.hide': case 'photo.show': case 'photo.feature': case 'photo.delete': {
        var p = findBy(db.photos, payload.id);
        if (!p) return fail('Foto no encontrada.');
        if (op === 'photo.hide') { p.hidden = true; p.featured = false; }
        if (op === 'photo.show') p.hidden = false;
        if (op === 'photo.feature') { var f = !p.featured; db.photos.forEach(function (x) { x.featured = false; }); p.featured = f; p.hidden = false; }
        if (op === 'photo.delete') {
          db.photos = db.photos.filter(function (x) { return x.id !== p.id; });
          if (ctx.deletePhoto) ctx.deletePhoto(p.id);
        }
        return ok({});
      }
      case 'contest.open': {
        if (db.contest) closeContest(db, now);
        var mins = clamp(parseInt(payload.minutes, 10) || db.settings.contestMinutes || 15, 1, 240);
        db.contest = {
          id: nextId(db, 'v'), startedAt: now, endsAt: now + mins * 60000,
          discountPct: clamp(parseInt(payload.discountPct, 10) || db.settings.discountPct, 1, 100),
          uses: clamp(parseInt(payload.uses, 10) || db.settings.discountUses, 1, 20)
        };
        return ok({ contest: db.contest });
      }
      case 'contest.close': {
        if (!db.contest) return fail('No hay una votación abierta.');
        return ok({ result: closeContest(db, now) });
      }
      case 'announce': {
        var text = str(payload.text, 140);
        db.announcement = text ? { text: text, ts: now, by: srole } : null;
        return ok({ announcement: db.announcement });
      }
    }
    return fail('Operación desconocida.');
  }

  return {
    emptyDb: emptyDb, normalize: normalize, handle: handle, staffHash: staffHash,
    publicView: publicView, STAFF_DEFAULT: STAFF_DEFAULT, sha256: sha256
  };
});
