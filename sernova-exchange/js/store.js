/* ==========================================================================
   Estado, persistencia y motor de precios del exchange.

   Regla económica:
   - cuanto más se consume un trago (unidades en los últimos 4 min), más sube;
   - si nadie lo consume, el precio baja en cada ajuste automático;
   - periódicamente ocurre una CAÍDA GENERAL: todos los precios bajan a la vez.

   Seguridad (demo local, no apta para datos reales):
   - la clave admin se guarda como SHA-256 con sal e iteraciones;
   - la sesión admin vive en sessionStorage y expira por inactividad;
   - tras 5 intentos fallidos el acceso se bloquea 60 s;
   - los datos de admin nunca se publican hacia la TV ni el servidor.
   ========================================================================== */
(function (global) {
  'use strict';

  var KEY = 'sernova-exchange.v2';
  var ARCHIVE_KEY = 'sernova-exchange-archive.v1';
  var SESSION_KEY = 'sernova-exchange.admin-session';
  var LOCK_KEY = 'sernova-exchange.admin-lock';
  var D = global.SernovaData;

  var WINDOW_MS = 4 * 60 * 1000;   // ventana de demanda
  var TICK_MS = 20 * 1000;         // ajuste automático de mercado
  var CRASH_MS = 120 * 1000;       // caída general cada 2 minutos
  var CRASH_PCT = 10;
  var CRASH_DURATION_MS = 60 * 1000;   // tiempo a precio de costo
  var COST_PCT = 40;                   // costo por defecto: % del precio de carta
  var RALLY_PCT = 7;
  var MAX_HISTORY = 320;
  var MAX_ARCHIVE = 120;
  var ADMIN_IDLE_MS = 30 * 60 * 1000;
  var MAX_ATTEMPTS = 5;
  var LOCK_MS = 60 * 1000;
  var HASH_ROUNDS = 1500;

  // Credenciales iniciales guardadas solo como hash (no figuran en texto plano).
  var DEFAULT_USER_HASH = '7f172b151dbca349ddfbd15b33dd4e7b7c8376f7c6c69e8699c758fa67e6811c';
  var DEFAULT_PASS_HASH = 's2$5e7a0c19d2b84f6a3c01e9d7$65dd97178514d996269f178e9e2deb773b3990a8a330bf56614209ad18d6e882';
  var LEGACY_DEFAULT_HASHES = ['84261309', '70101386'];
  var state = null;

  function activeDrinks() { return D.DRINKS.filter(function (d) { return d.enabled !== false; }); }

  /* ------------------------------------------------------------ hashing */
  function fnv(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
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

  function randomSalt() {
    var arr = new Uint8Array(12);
    if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(arr);
    else for (var i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(arr, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  function derive(password, salt) {
    var h = salt + ':' + password;
    for (var i = 0; i < HASH_ROUNDS; i++) h = sha256(h + ':' + salt);
    return h;
  }

  function userHash(u) { return sha256('u:' + String(u || '').trim().toLowerCase()); }

  function makeHash(password) {
    var salt = randomSalt();
    return 's2$' + salt + '$' + derive(String(password), salt);
  }

  function verifyHash(password, stored) {
    if (!stored) return false;
    if (stored.indexOf('s2$') === 0) {
      var parts = stored.split('$');
      return derive(String(password), parts[1]) === parts[2];
    }
    return fnv(String(password)) === stored;   // formato heredado
  }

  /* ------------------------------------------------------------ helpers */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function round10(v) { return Math.round(v / 10) * 10; }
  function uid() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
  function now() { return Date.now(); }

  function defaultAdmin() {
    return {
      userHash: DEFAULT_USER_HASH, passwordHash: DEFAULT_PASS_HASH, passwordChanged: false,
      paused: false, pausedAt: 0, crashMs: CRASH_MS, tickMs: TICK_MS,
      crashPct: CRASH_PCT, rallyPct: RALLY_PCT, crashDurationMs: CRASH_DURATION_MS, costPct: COST_PCT, log: []
    };
  }

  function normalizeAdmin(a) {
    a = a || {};
    if (a.user) { a.userHash = userHash(a.user); delete a.user; }
    if (!a.userHash) a.userHash = DEFAULT_USER_HASH;
    var legacyDefault = LEGACY_DEFAULT_HASHES.indexOf(a.passwordHash) >= 0;
    if (!a.passwordHash || (!a.passwordChanged && legacyDefault)) a.passwordHash = DEFAULT_PASS_HASH;
    delete a.loggedIn;
    if (a.passwordChanged === undefined) a.passwordChanged = false;
    if (a.paused === undefined) a.paused = false;
    if (!a.pausedAt) a.pausedAt = 0;
    if (!a.crashMs) a.crashMs = CRASH_MS;
    if (!a.tickMs) a.tickMs = TICK_MS;
    if (!a.crashPct) a.crashPct = CRASH_PCT;
    if (!a.crashDurationMs) a.crashDurationMs = CRASH_DURATION_MS;
    if (!a.costPct) a.costPct = COST_PCT;
    if (a.crashMs < a.crashDurationMs + 30000) a.crashMs = a.crashDurationMs + 30000;
    if (!a.rallyPct) a.rallyPct = RALLY_PCT;
    if (!Array.isArray(a.log)) a.log = [];
    return a;
  }

  function ensureMarket() {
    var ts = now();
    D.DRINKS.forEach(function (d) {
      if (state.market[d.id]) return;
      state.market[d.id] = {
        price: d.price, open: d.price, high: d.price, low: d.price,
        history: [{ ts: ts - 60000, price: d.price, qty: 0, dir: 'flat', synthetic: true, kind: 'apertura', demand: 0 }]
      };
    });
    Object.keys(state.market).forEach(function (id) { if (!D.byId(id)) delete state.market[id]; });
  }

  function load() {
    try {
      var raw = global.localStorage.getItem(KEY);
      state = raw ? JSON.parse(raw) : null;
      if (state && (!state.market || !state.entries)) state = null;
      if (state) {
        state.admin = normalizeAdmin(state.admin);
        if (!state.catalog) state.catalog = { basePrices: {}, disabled: [], custom: [], costs: {} };
        if (!state.catalog.costs) state.catalog.costs = {};
        if (state.tvFocusId === undefined) state.tvFocusId = '';
        if (state.tvRotate === undefined) state.tvRotate = true;
        if (state.tipPct === undefined) state.tipPct = 10;
        if (state.designVersion !== 2) { state.theme = 'light'; state.designVersion = 2; }   // nuevo diseño claro por defecto
        if (!state.sessionId) state.sessionId = uid();
        D.applyCatalog(state.catalog);
        ensureMarket();
        var ts = now();
        // Si la terminal estuvo cerrada, no disparar una caída "atrasada" al abrir.
        if (!state.admin.paused) {
          if (!state.nextCrashAt || state.nextCrashAt < ts) state.nextCrashAt = ts + state.admin.crashMs;
          if (!state.nextMarketAt || state.nextMarketAt < ts) state.nextMarketAt = ts + state.admin.tickMs;
        }
        persist();
      }
    } catch (e) { state = null; }
    return state;
  }

  /* Guarda localmente; si se llena el almacenamiento recorta historia y archivo. */
  function persist() {
    if (!state) return;
    try { global.localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) {
      try {
        Object.keys(state.market).forEach(function (id) {
          var h = state.market[id].history;
          if (h.length > 120) h.splice(0, h.length - 120);
        });
        saveArchive(getArchive().slice(0, 30));
        global.localStorage.setItem(KEY, JSON.stringify(state));
      } catch (e2) { /* modo privado o sin espacio */ }
    }
  }

  function publicState() {
    if (!state) return null;
    return {
      version: state.version, sessionId: state.sessionId,
      table: state.table, guests: state.guests, waiter: state.waiter,
      startedAt: state.startedAt, updatedAt: state.updatedAt,
      nextCrashAt: state.nextCrashAt, nextMarketAt: state.nextMarketAt,
      tvFocusId: state.tvFocusId, tvRotate: state.tvRotate,
      lastEvent: state.lastEvent || null,
      crash: state.crash && state.crash.active ? { active: true, startedAt: state.crash.startedAt, until: state.crash.until } : null,
      catalog: state.catalog,
      admin: {
        paused: !!state.admin.paused, pausedAt: state.admin.pausedAt || 0, crashMs: state.admin.crashMs, tickMs: state.admin.tickMs,
        crashPct: state.admin.crashPct, rallyPct: state.admin.rallyPct,
        crashDurationMs: state.admin.crashDurationMs
      },
      entries: state.entries,
      market: state.market
    };
  }

  function save() {
    persist();
    if (state && global.SernovaSync && typeof global.SernovaSync.push === 'function') {
      global.SernovaSync.push(publicState());
    }
  }

  /* ----------------------------------------------------------- archivo */
  function getArchive() {
    try {
      var raw = global.localStorage.getItem(ARCHIVE_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function saveArchive(list) {
    try { global.localStorage.setItem(ARCHIVE_KEY, JSON.stringify(list.slice(0, MAX_ARCHIVE))); }
    catch (e) {
      try { global.localStorage.setItem(ARCHIVE_KEY, JSON.stringify(list.slice(0, 30))); } catch (e2) { /* noop */ }
    }
  }

  function archiveSession() {
    if (!state || !state.entries.length) return null;
    var st = stats();
    var bill = billSummary();
    var record = {
      id: uid(),
      table: state.table,
      guests: state.guests,
      waiter: state.waiter,
      startedAt: state.startedAt,
      closedAt: now(),
      entries: state.entries.slice(),
      total: st.total,
      tipPct: bill.tipPct,
      tip: bill.tip,
      units: st.units,
      operations: st.operations,
      ups: st.ups,
      downs: st.downs
    };
    var list = getArchive();
    list.unshift(record);
    saveArchive(list);
    return record;
  }

  function deleteArchive(id) {
    saveArchive(getArchive().filter(function (r) { return r.id !== id; }));
  }

  function clearArchive() { saveArchive([]); }

  /* ------------------------------------------------------------ mercado */
  function seedMarket(ts) {
    var market = {};
    D.DRINKS.forEach(function (drink, index) {
      var rng = mulberry32(0x5E2A00 + index * 7919 + Math.floor(ts / 60000));
      var price = drink.price;
      var history = [];
      var start = ts - 20 * 4 * 60 * 1000;
      for (var i = 0; i < 20; i++) {
        var reversion = (drink.price - price) / drink.price * 0.22;
        var noise = (rng() - 0.49) * 0.034;
        var next = round10(clamp(price * (1 + reversion + noise), drink.price * 0.72, drink.price * 1.46));
        history.push({
          ts: start + i * 4 * 60 * 1000,
          price: next, qty: 1 + Math.floor(rng() * 3),
          dir: next > price ? 'up' : (next < price ? 'down' : 'flat'),
          synthetic: true, kind: 'apertura', demand: 1 + Math.floor(rng() * 3)
        });
        price = next;
      }
      market[drink.id] = {
        price: price,
        open: history[0].price,
        high: Math.max.apply(null, history.map(function (h) { return h.price; })),
        low: Math.min.apply(null, history.map(function (h) { return h.price; })),
        history: history
      };
    });
    return market;
  }

  function baseState(ts, prev) {
    var admin = prev && prev.admin ? normalizeAdmin(prev.admin) : defaultAdmin();
    admin.paused = false;
    admin.pausedAt = 0;
    return {
      version: 4,
      designVersion: 2,
      sessionId: uid(),
      catalog: prev && prev.catalog ? prev.catalog : { basePrices: {}, disabled: [], custom: [], costs: {} },
      table: '', guests: 1, waiter: '',
      startedAt: ts, updatedAt: ts,
      theme: prev && prev.theme ? prev.theme : 'light',
      selectedId: prev && prev.selectedId ? prev.selectedId : D.DRINKS[0].id,
      mode: 'ambos', range: 'todo', category: 'Todos', tag: 'Todos', sort: 'carta', search: '',
      density: prev && prev.density ? prev.density : 'comfort',
      tvFocusId: prev && prev.tvFocusId ? prev.tvFocusId : '',
      tvRotate: prev ? prev.tvRotate !== false : true,
      tipPct: prev && prev.tipPct !== undefined ? prev.tipPct : 10,
      admin: admin,
      lastEvent: null,
      nextMarketAt: ts + admin.tickMs,
      nextCrashAt: ts + admin.crashMs,
      entries: [],
      market: seedMarket(ts)
    };
  }

  function createSession(table, guests, waiter) {
    var ts = now();
    if (state && state.entries.length) archiveSession();
    var prev = state;
    state = baseState(ts, prev);
    state.table = String(table || '').trim().slice(0, 20) || '1';
    state.guests = clamp(parseInt(guests, 10) || 1, 1, 40);
    state.waiter = String(waiter || '').trim().slice(0, 30);
    ensureMarket();
    save();
    return state;
  }

  /* Archiva la mesa y deja la terminal lista para elegir otra. */
  function endSession() {
    if (!state) return null;
    var rec = state.entries.length ? archiveSession() : null;
    if (rec) adminLog('Mesa cerrada', 'Mesa ' + rec.table + ' · ' + D.money(rec.total + (rec.tip || 0)));
    state = baseState(now(), state);
    save();
    return rec;
  }

  function hasSession() { return !!(state && state.table && state.market && state.entries); }
  function getState() { return state; }

  function setTheme(theme) {
    if (!state) return;
    state.theme = theme === 'light' ? 'light' : 'dark';
    persist();
  }

  var SYNCED_PREFS = { tvFocusId: 1, tvRotate: 1, tipPct: 1 };
  function setPref(key, value) {
    if (!state) return;
    state[key] = value;
    if (SYNCED_PREFS[key]) { state.updatedAt = now(); save(); }
    else persist();
  }

  /* Devuelve las unidades consumidas de un trago dentro de la ventana. */
  function demand(id, ts) {
    var m = state.market[id];
    if (!m) return { units: 0, operations: 0 };
    var hist = m.history;
    var units = 0, ops = 0;
    var from = (ts || now()) - WINDOW_MS;
    for (var i = hist.length - 1; i >= 0; i--) {
      if (hist[i].ts < from) break;
      if (hist[i].kind === 'consumo') { units += hist[i].qty || 0; ops++; }
    }
    return { units: units, operations: ops };
  }

  function pushTick(id, tick) {
    var m = state.market[id];
    m.history.push(tick);
    if (m.history.length > MAX_HISTORY) m.history.splice(0, m.history.length - MAX_HISTORY);
    m.price = tick.price;
    m.high = Math.max(m.high, tick.price);
    m.low = Math.min(m.low, tick.price);
    return tick;
  }

  function movePrice(id, factor, kind, extra) {
    var drink = D.byId(id);
    var m = state.market[id];
    if (!drink || !m) return null;
    extra = extra || {};
    var paid = m.price;
    var floor = drink.price * (kind === 'crash' ? 0.35 : 0.45);
    var ceil = drink.price * 2.3;
    var next = round10(clamp(paid * factor, floor, ceil));
    if (next === paid && factor !== 1) next = round10(clamp(paid + (factor > 1 ? 10 : -10), floor, ceil));
    var ts = extra.ts || now();
    return pushTick(id, {
      ts: ts,
      price: next,
      qty: extra.qty || 0,
      dir: next > paid ? 'up' : (next < paid ? 'down' : 'flat'),
      synthetic: false,
      kind: kind,
      drinkId: extra.drinkId || id,
      paid: paid,
      demand: demand(id, ts).units
    });
  }

  function purchase(id, qty) {
    var drink = D.byId(id);
    if (!drink || drink.enabled === false || !state.market[id]) return null;
    qty = clamp(parseInt(qty, 10) || 1, 1, 30);

    var ts = now();
    var paid = state.market[id].price;
    var dem = demand(id, ts).units;
    var rng = mulberry32((ts ^ (id.length * 2654435761) ^ (state.entries.length * 40503)) >>> 0);

    // Más consumo en la ventana (incluyendo esta compra) ⇒ más presión ⇒ más sube.
    var pressure = 0.003 + Math.min(dem + qty - 1, 14) * 0.0075;
    var reversion = (drink.price - paid) / drink.price * 0.10;
    var noise = (rng() - 0.5) * 0.006;

    var tick;
    if (crashActive()) {
      // Durante la caída el precio queda fijo en costo; la demanda igual se registra.
      tick = pushTick(id, { ts: ts, price: paid, qty: qty, dir: 'flat', synthetic: false, kind: 'consumo', drinkId: id, paid: paid, demand: dem + qty, atCost: true });
    } else {
      tick = movePrice(id, 1 + pressure + reversion + noise, 'consumo', { qty: qty, drinkId: id, ts: ts });
    }
    var entry = {
      id: uid(), drinkId: id, name: drink.name, category: drink.category,
      qty: qty, unitPrice: paid, subtotal: paid * qty, ts: tick.ts,
      unitCost: costOf(drink), atCost: !!tick.atCost,
      deltaPct: paid ? (tick.price - paid) / paid * 100 : 0
    };
    state.entries.push(entry);
    state.updatedAt = tick.ts;
    save();
    return { entry: entry, tick: tick, drink: drink };
  }

  /* ------------------------------------------------ caída a precio de costo */
  function costOf(d) {
    if (!d) return 0;
    if (d.cost) return d.cost;
    var pct = state && state.admin ? state.admin.costPct : COST_PCT;
    return round10(d.price * pct / 100);
  }

  function crashActive() { return !!(state && state.crash && state.crash.active); }

  function crashLeft() {
    if (!crashActive()) return 0;
    var ref = state.admin.paused && state.admin.pausedAt ? state.admin.pausedAt : now();
    return Math.max(0, Math.ceil((state.crash.until - ref) / 1000));
  }

  /* Todos los tragos activos pasan a su precio de costo durante crashDurationMs. */
  function startCrash(ts) {
    ts = ts || now();
    if (crashActive()) endCrash(ts);
    var prev = {};
    activeDrinks().forEach(function (d) {
      var m = state.market[d.id];
      if (!m) return;
      prev[d.id] = m.price;
      var cost = Math.max(10, costOf(d));
      pushTick(d.id, {
        ts: ts, price: cost, qty: 0,
        dir: cost < m.price ? 'down' : cost > m.price ? 'up' : 'flat',
        synthetic: false, kind: 'crash', drinkId: d.id, paid: m.price, demand: demand(d.id, ts).units
      });
    });
    var dur = state.admin.crashDurationMs;
    state.crash = { active: true, startedAt: ts, until: ts + dur, prev: prev };
    state.lastEvent = { kind: 'crash', ts: ts, until: ts + dur, durationMs: dur };
    state.nextCrashAt = ts + state.admin.crashMs;
    state.nextMarketAt = ts + dur + state.admin.tickMs;
    state.updatedAt = ts;
  }

  /* Vuelven los precios que había antes de la caída. */
  function endCrash(ts) {
    if (!crashActive()) return false;
    ts = ts || now();
    var prev = state.crash.prev || {};
    Object.keys(prev).forEach(function (id) {
      var m = state.market[id];
      if (!m || !D.byId(id)) return;
      var back = prev[id];
      pushTick(id, {
        ts: ts, price: back, qty: 0,
        dir: back > m.price ? 'up' : back < m.price ? 'down' : 'flat',
        synthetic: false, kind: 'recover', drinkId: id, paid: m.price, demand: demand(id, ts).units
      });
    });
    state.crash = null;
    state.lastEvent = { kind: 'recover', ts: ts };
    state.nextMarketAt = ts + state.admin.tickMs;
    state.updatedAt = ts;
    return true;
  }

  function stopCrash() {
    if (!endCrash()) return false;
    adminLog('Precio de costo terminado', 'Manual');
    save();
    return true;
  }

  /* Pedido hecho por un cliente desde su celular: mueve el precio igual que
     un consumo pero no entra en el ticket de la mesa de esta terminal. */
  function externalPurchase(order) {
    if (!state || !order) return null;
    if (!Array.isArray(state.clubApplied)) state.clubApplied = [];
    if (state.clubApplied.indexOf(order.id) >= 0) return null;
    state.clubApplied.push(order.id);
    if (state.clubApplied.length > 400) state.clubApplied.splice(0, state.clubApplied.length - 400);
    var drink = D.byId(order.drinkId);
    var m = state.market[order.drinkId];
    if (!drink || !m) { persist(); return null; }
    var ts = now();
    var qty = clamp(parseInt(order.qty, 10) || 1, 1, 30);
    var dem = demand(order.drinkId, ts).units;
    var tick;
    if (crashActive()) {
      tick = pushTick(order.drinkId, { ts: ts, price: m.price, qty: qty, dir: 'flat', synthetic: false, kind: 'consumo', drinkId: order.drinkId, paid: m.price, demand: dem + qty, club: true, table: order.table });
    } else {
      var pressure = 0.003 + Math.min(dem + qty - 1, 14) * 0.0075;
      var reversion = (drink.price - m.price) / drink.price * 0.10;
      tick = movePrice(order.drinkId, 1 + pressure + reversion, 'consumo', { qty: qty, drinkId: order.drinkId, ts: ts });
      tick.club = true; tick.table = order.table;
    }
    state.updatedAt = ts;
    save();
    return tick;
  }

  /* Marca como aplicados los pedidos existentes al abrir una sesión. */
  function markClubApplied(ids) {
    if (!state) return;
    state.clubApplied = (state.clubApplied || []).concat(ids).slice(-400);
    persist();
  }
  function clubApplied() { return state && state.clubApplied ? state.clubApplied : []; }

  function generalMove(kind, pct) {
    var factor = kind === 'crash' ? 1 - pct / 100 : 1 + pct / 100;
    var changed = false;
    var ts = now();
    activeDrinks().forEach(function (d) { if (movePrice(d.id, factor, kind, { ts: ts })) changed = true; });
    state.lastEvent = { kind: kind, pct: pct, ts: ts };
    return changed;
  }

  function marketTick() {
    if (!state) return { changed: false, crashed: false };
    if (state.admin.paused) return { changed: false, crashed: false, paused: true };
    var ts = now();
    if (crashActive()) {
      if (ts < state.crash.until) return { changed: false, crashed: false, idle: true, atCost: true };
      endCrash(ts);
      save();
      return { changed: true, crashed: false, recovered: true };
    }
    if (ts < state.nextMarketAt && ts < state.nextCrashAt) return { changed: false, crashed: false, idle: true };
    var crashed = ts >= state.nextCrashAt;
    var changed = false;

    if (crashed) {
      startCrash(ts);
      save();
      return { changed: true, crashed: true, durationMs: state.admin.crashDurationMs };
    } else {
      activeDrinks().forEach(function (d) {
        var paid = state.market[d.id].price;
        var dem = demand(d.id, ts).units;
        var reversion = (d.price - paid) / d.price * 0.12;
        // Sin consumo ⇒ baja; con consumo ⇒ sube, proporcionalmente a las unidades.
        var delta = (Math.min(dem, 12) - 1.5) * 0.0045 + reversion * 0.12 + (Math.random() - 0.5) * 0.0015;
        if (!dem) delta -= 0.0025;
        if (Math.abs(delta) < 0.0008) return;
        if (movePrice(d.id, 1 + delta, 'ajuste', { ts: ts })) changed = true;
      });
    }
    state.nextMarketAt = ts + state.admin.tickMs;
    state.updatedAt = ts;
    save();
    return { changed: changed, crashed: crashed };
  }

  function forceCrash() {
    startCrash(now());
    adminLog('Caída a precio de costo forzada', Math.round(state.admin.crashDurationMs / 1000) + ' s');
    save();
    return true;
  }

  function forceRally() {
    endCrash();
    var changed = generalMove('rally', state.admin.rallyPct);
    state.updatedAt = now();
    adminLog('Subida general forzada', '+' + state.admin.rallyPct + '%');
    save();
    return changed;
  }

  function resetMarket() {
    var ts = now();
    if (crashActive()) state.crash = null;
    activeDrinks().forEach(function (d) {
      var m = state.market[d.id];
      if (m.price === d.price) return;
      var paid = m.price;
      pushTick(d.id, {
        ts: ts, price: d.price, qty: 0,
        dir: d.price > paid ? 'up' : d.price < paid ? 'down' : 'flat',
        synthetic: false, kind: 'admin', drinkId: d.id, paid: paid, demand: 0
      });
    });
    state.nextCrashAt = ts + state.admin.crashMs;
    state.nextMarketAt = ts + state.admin.tickMs;
    state.updatedAt = ts;
    adminLog('Precios restablecidos', 'Carta completa al precio base');
    save();
  }

  function adminSetPrice(id, value) {
    var drink = D.byId(id);
    if (!drink || !state.market[id]) return false;
    var price = round10(clamp(parseInt(value, 10) || 0, drink.price * 0.35, drink.price * 2.3));
    if (!price || price === state.market[id].price) return false;
    var paid = state.market[id].price;
    pushTick(id, {
      ts: now(), price: price, qty: 0,
      dir: price > paid ? 'up' : 'down',
      synthetic: false, kind: 'admin', drinkId: id, paid: paid, demand: demand(id).units
    });
    state.updatedAt = now();
    adminLog('Precio fijado', drink.name + ' → ' + D.money(price));
    save();
    return true;
  }

  /* ------------------------------------------------------------- tickets */
  function recompute(id) {
    var m = state.market[id];
    if (!m || !m.history.length) return;
    m.price = m.history[m.history.length - 1].price;
    m.high = Math.max.apply(null, m.history.map(function (h) { return h.price; }));
    m.low = Math.min.apply(null, m.history.map(function (h) { return h.price; }));
  }

  function removeEntry(entryId) {
    var index = -1;
    for (var i = 0; i < state.entries.length; i++) {
      if (state.entries[i].id === entryId) { index = i; break; }
    }
    if (index < 0) return null;
    var entry = state.entries.splice(index, 1)[0];
    var market = state.market[entry.drinkId];
    if (market) {
      var history = market.history;
      for (var j = history.length - 1; j >= 0; j--) {
        if (history[j].kind === 'consumo' && history[j].ts === entry.ts && history[j].drinkId === entry.drinkId) {
          history.splice(j, 1);
          break;
        }
      }
      recompute(entry.drinkId);
    }
    state.updatedAt = now();
    save();
    return entry;
  }

  function undo() {
    if (!state.entries.length) return null;
    return removeEntry(state.entries[state.entries.length - 1].id);
  }

  function clearLedger() {
    var removed = state.entries.length;
    Object.keys(state.market).forEach(function (id) {
      state.market[id].history = state.market[id].history.filter(function (h) { return h.kind !== 'consumo'; });
      recompute(id);
    });
    state.entries = [];
    state.updatedAt = now();
    save();
    return removed;
  }

  function lastChange(id) {
    var m = state.market[id];
    if (!m || m.history.length < 2) return { dir: 'flat', pct: 0, price: m ? m.price : 0 };
    var last = m.history[m.history.length - 1];
    var prev = m.history[m.history.length - 2].price;
    return { dir: last.dir, pct: prev ? (last.price - prev) / prev * 100 : 0, price: last.price, prev: prev, kind: last.kind };
  }

  function stats() {
    var total = 0, units = 0, ups = 0, downs = 0, flats = 0;
    var counts = {}, amounts = {};
    state.entries.forEach(function (e) {
      total += e.subtotal; units += e.qty;
      counts[e.drinkId] = (counts[e.drinkId] || 0) + e.qty;
      amounts[e.drinkId] = (amounts[e.drinkId] || 0) + e.subtotal;
    });
    Object.keys(state.market).forEach(function (id) {
      state.market[id].history.forEach(function (h) {
        if (h.synthetic) return;
        if (h.dir === 'up') ups++; else if (h.dir === 'down') downs++; else flats++;
      });
    });
    var byCategory = { 'Cocktails Sernova': 0, 'Tragos': 0 };
    state.entries.forEach(function (e) { byCategory[e.category] = (byCategory[e.category] || 0) + e.subtotal; });
    // Ahorro / sobreprecio frente al precio de carta
    var atList = 0;
    state.entries.forEach(function (e) {
      var d = D.byId(e.drinkId);
      atList += (d ? d.price : e.unitPrice) * e.qty;
    });
    return {
      total: total, units: units, ups: ups, downs: downs, flats: flats,
      counts: counts, amounts: amounts, byCategory: byCategory,
      avg: units ? total / units : 0, operations: state.entries.length,
      listTotal: atList, savings: atList - total
    };
  }

  /* Variación de cada trago frente a su precio de carta. */
  function movers() {
    return activeDrinks().map(function (d) {
      var m = state.market[d.id];
      return { id: d.id, name: d.name, price: m.price, base: d.price, pct: d.price ? (m.price - d.price) / d.price * 100 : 0 };
    }).sort(function (a, b) { return b.pct - a.pct; });
  }

  function billSummary(tipPct) {
    var st = stats();
    var pct = tipPct !== undefined ? tipPct : (state.tipPct || 0);
    var tip = Math.round(st.total * pct / 100 / 10) * 10;
    var grand = st.total + tip;
    var guests = Math.max(1, state.guests || 1);
    return {
      subtotal: st.total, tipPct: pct, tip: tip, total: grand,
      guests: guests, perPerson: Math.ceil(grand / guests / 10) * 10,
      units: st.units, operations: st.operations, savings: st.savings
    };
  }

  function groupedEntries() {
    var map = {};
    var order = [];
    state.entries.forEach(function (e) {
      var key = e.drinkId + '@' + e.unitPrice;
      if (!map[key]) { map[key] = { name: e.name, unitPrice: e.unitPrice, qty: 0, subtotal: 0 }; order.push(key); }
      map[key].qty += e.qty;
      map[key].subtotal += e.subtotal;
    });
    return order.map(function (k) { return map[k]; });
  }

  /* ---------------------------------------------------------------- admin */
  function adminLog(action, detail) {
    if (!state) return;
    state.admin.log.unshift({ ts: now(), action: action, detail: detail || '' });
    state.admin.log = state.admin.log.slice(0, 80);
  }

  function ensureSystemState() {
    if (state) return state;
    state = baseState(now(), null);
    save();
    return state;
  }

  function sessionGet() {
    try { return JSON.parse(global.sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
  }
  function sessionSet(v) {
    try {
      if (v) global.sessionStorage.setItem(SESSION_KEY, JSON.stringify(v));
      else global.sessionStorage.removeItem(SESSION_KEY);
    } catch (e) { /* noop */ }
  }

  function lockInfo() {
    try {
      var l = JSON.parse(global.localStorage.getItem(LOCK_KEY) || 'null') || { count: 0, until: 0 };
      if (l.until && l.until < now()) { l = { count: 0, until: 0 }; }
      return l;
    } catch (e) { return { count: 0, until: 0 }; }
  }
  function lockSet(l) { try { global.localStorage.setItem(LOCK_KEY, JSON.stringify(l)); } catch (e) { /* noop */ } }

  function lockRemaining() {
    var l = lockInfo();
    return l.until > now() ? Math.ceil((l.until - now()) / 1000) : 0;
  }

  /* Devuelve { ok, locked, remaining, attemptsLeft } */
  function login(user, password) {
    ensureSystemState();
    var remaining = lockRemaining();
    if (remaining) return { ok: false, locked: true, remaining: remaining };
    var ok = userHash(user) === state.admin.userHash &&
      verifyHash(String(password || ''), state.admin.passwordHash);
    if (ok) {
      if (state.admin.passwordHash.indexOf('s2$') !== 0) state.admin.passwordHash = makeHash(password);
      lockSet({ count: 0, until: 0 });
      sessionSet({ at: now(), last: now() });
      adminLog('Ingreso admin', '');
      persist();
      return { ok: true };
    }
    var l = lockInfo();
    l.count++;
    if (l.count >= MAX_ATTEMPTS) { l.until = now() + LOCK_MS; l.count = 0; }
    lockSet(l);
    return { ok: false, locked: !!l.until, remaining: l.until ? Math.ceil(LOCK_MS / 1000) : 0, attemptsLeft: l.until ? 0 : MAX_ATTEMPTS - l.count };
  }

  function logout() {
    if (state && isAdmin()) { adminLog('Salida admin', ''); persist(); }
    sessionSet(null);
  }

  function isAdmin() {
    var s = sessionGet();
    if (!s || !state) return false;
    if (now() - (s.last || 0) > ADMIN_IDLE_MS) { sessionSet(null); return false; }
    return true;
  }

  function touchAdmin() {
    var s = sessionGet();
    if (s && now() - (s.last || 0) <= ADMIN_IDLE_MS) { s.last = now(); sessionSet(s); }
  }

  function changePassword(current, next) {
    if (!isAdmin() || !next || String(next).length < 4) return { ok: false, error: 'La nueva clave debe tener al menos 4 caracteres.' };
    if (!verifyHash(String(current || ''), state.admin.passwordHash)) return { ok: false, error: 'La clave actual no es correcta.' };
    state.admin.passwordHash = makeHash(String(next));
    state.admin.passwordChanged = true;
    adminLog('Cambio de contraseña', '');
    persist();
    return { ok: true };
  }

  function changeUser(next) {
    var u = String(next || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 24);
    if (!isAdmin() || u.length < 3) return false;
    adminLog('Cambio de usuario', '');
    state.admin.userHash = userHash(u);
    persist();
    return true;
  }

  function setPaused(paused) {
    if (!state) return;
    var ts = now();
    if (paused && !state.admin.paused) {
      state.admin.pausedAt = ts;
    } else if (!paused && state.admin.paused) {
      // Congelamos la cuenta regresiva durante la pausa.
      var delta = state.admin.pausedAt ? ts - state.admin.pausedAt : 0;
      state.nextCrashAt += delta;
      if (crashActive()) state.crash.until += delta;
      state.nextMarketAt = ts + state.admin.tickMs;
      state.admin.pausedAt = 0;
    }
    state.admin.paused = !!paused;
    state.updatedAt = ts;
    adminLog(paused ? 'Mercado pausado' : 'Mercado reanudado', '');
    save();
  }

  function crashRemaining() {
    if (!state) return 0;
    var ref = state.admin.paused && state.admin.pausedAt ? state.admin.pausedAt : now();
    return Math.max(0, Math.ceil((state.nextCrashAt - ref) / 1000));
  }

  function setMarketRules(rules) {
    if (!state) return false;
    var a = state.admin;
    a.crashDurationMs = clamp(parseInt(rules.durationSec, 10) || 60, 10, 600) * 1000;
    a.costPct = clamp(parseFloat(rules.costPct) || COST_PCT, 5, 100);
    var crash = clamp(parseInt(rules.crashSec, 10) || 120, 30, 3600) * 1000;
    crash = Math.max(crash, a.crashDurationMs + 30000);
    var tick = clamp(parseInt(rules.tickSec, 10) || 20, 5, 300) * 1000;
    a.crashMs = crash;
    a.tickMs = tick;
    a.rallyPct = clamp(parseFloat(rules.rallyPct) || RALLY_PCT, 1, 50);
    var ts = now();
    if (crashActive()) state.crash.until = Math.min(state.crash.until, state.crash.startedAt + a.crashDurationMs);
    state.nextCrashAt = (crashActive() ? state.crash.startedAt : ts) + crash;
    state.nextMarketAt = ts + tick;
    if (a.paused) a.pausedAt = ts;
    state.updatedAt = ts;
    adminLog('Reglas del mercado', 'Precio de costo ' + a.crashDurationMs / 1000 + ' s cada ' + crash / 1000 + ' s (costo por defecto ' + a.costPct + '%) · subida +' + a.rallyPct + '% · ajuste ' + tick / 1000 + ' s');
    save();
    return true;
  }

  function setSessionInfo(table, guests, waiter) {
    if (!state) return false;
    if (String(table || '').trim()) state.table = String(table).trim().slice(0, 20);
    state.guests = clamp(parseInt(guests, 10) || state.guests, 1, 40);
    state.waiter = String(waiter || '').trim().slice(0, 30);
    state.updatedAt = now();
    adminLog('Datos de mesa', 'Mesa ' + state.table + ' · ' + state.guests + ' comensales');
    save();
    return true;
  }

  function setGuests(n) {
    if (!state) return;
    state.guests = clamp(parseInt(n, 10) || 1, 1, 40);
    state.updatedAt = now();
    save();
  }

  function setBasePrice(id, price) {
    var d = D.byId(id);
    if (!d) return false;
    var p = round10(clamp(parseInt(price, 10) || 0, 1000, 500000));
    if (!p) return false;
    if (d.custom) {
      var c = state.catalog.custom.filter(function (x) { return x.id === id; })[0];
      if (c) c.price = p;
    } else state.catalog.basePrices[id] = p;
    D.applyCatalog(state.catalog);
    state.updatedAt = now();
    adminLog('Precio de carta', d.name + ' → ' + D.money(p));
    save();
    return true;
  }

  function setCost(id, cost) {
    var d = D.byId(id);
    if (!d || !state) return false;
    var c = parseInt(cost, 10);
    if (!c || c < 10) {               // vacío = usar % por defecto
      if (d.custom) { var x = state.catalog.custom.filter(function (y) { return y.id === id; })[0]; if (x) delete x.cost; }
      else delete state.catalog.costs[id];
    } else {
      c = round10(clamp(c, 10, d.price));
      if (d.custom) { var z = state.catalog.custom.filter(function (y) { return y.id === id; })[0]; if (z) z.cost = c; }
      else state.catalog.costs[id] = c;
    }
    D.applyCatalog(state.catalog);
    state.updatedAt = now();
    adminLog('Costo', d.name + ' → ' + D.money(costOf(D.byId(id))));
    save();
    return true;
  }

  function setEnabled(id, enabled) {
    var d = D.byId(id);
    if (!d) return false;
    if (d.custom) {
      var c = state.catalog.custom.filter(function (x) { return x.id === id; })[0];
      if (c) c.enabled = !!enabled;
    } else {
      var idx = state.catalog.disabled.indexOf(id);
      if (enabled && idx >= 0) state.catalog.disabled.splice(idx, 1);
      if (!enabled && idx < 0) state.catalog.disabled.push(id);
    }
    D.applyCatalog(state.catalog);
    ensureMarket();
    state.updatedAt = now();
    adminLog(enabled ? 'Trago activado' : 'Trago desactivado', d.name);
    save();
    return true;
  }

  function addCustomDrink(data) {
    if (!state || !data) return null;
    var name = String(data.name || '').trim().toUpperCase().slice(0, 40);
    if (!name) return null;
    var price = parseInt(data.price, 10);
    if (!price || price < 1000) return null;
    var drink = {
      id: 'custom-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name: name,
      price: round10(clamp(price, 1000, 500000)),
      category: data.category === 'Cocktails Sernova' ? 'Cocktails Sernova' : 'Tragos',
      tags: Array.isArray(data.tags) && data.tags.length ? data.tags.slice(0, 3) : ['Autor'],
      description: String(data.description || 'Trago personalizado creado por el administrador.').slice(0, 140),
      enabled: true
    };
    var dc = parseInt(data.cost, 10);
    if (dc && dc >= 10) drink.cost = round10(Math.min(dc, drink.price));
    state.catalog.custom.push(drink);
    D.applyCatalog(state.catalog);
    ensureMarket();
    state.updatedAt = now();
    adminLog('Trago creado', drink.name + ' · ' + D.money(drink.price));
    save();
    return drink;
  }

  function deleteCustomDrink(id) {
    if (!state) return false;
    var before = state.catalog.custom.length;
    state.catalog.custom = state.catalog.custom.filter(function (c) { return c.id !== id; });
    if (state.catalog.custom.length === before) return false;
    D.applyCatalog(state.catalog);
    ensureMarket();
    state.updatedAt = now();
    adminLog('Trago eliminado', id);
    save();
    return true;
  }

  function resetCatalog() {
    if (!state) return;
    state.catalog = { basePrices: {}, disabled: [], custom: [], costs: {} };
    D.applyCatalog(state.catalog);
    ensureMarket();
    state.updatedAt = now();
    adminLog('Carta restablecida', D.DRINKS.length + ' tragos originales');
    save();
  }

  function restoreArchive(id) {
    var rec = getArchive().filter(function (r) { return r.id === id; })[0];
    if (!rec || !state) return false;
    if (state.entries.length) archiveSession();
    deleteArchive(id);
    state.sessionId = uid();
    state.table = rec.table;
    state.guests = rec.guests || 1;
    state.waiter = rec.waiter || '';
    state.startedAt = rec.startedAt;
    state.updatedAt = now();
    state.entries = (rec.entries || []).slice();
    state.nextCrashAt = now() + state.admin.crashMs;
    state.nextMarketAt = now() + state.admin.tickMs;
    adminLog('Mesa restaurada', 'Mesa ' + rec.table + ' · ' + (rec.entries || []).length + ' consumos');
    save();
    return true;
  }

  function wipeAll() {
    try {
      global.localStorage.removeItem(KEY);
      global.localStorage.removeItem(ARCHIVE_KEY);
      global.localStorage.removeItem(LOCK_KEY);
      global.localStorage.removeItem('sernova-exchange.public.v1');
    } catch (e) { /* noop */ }
    sessionSet(null);
    D.resetCatalog();
    state = null;
  }

  /* ------------------------------------------------------------ reportes */
  function report(sinceTs) {
    var since = sinceTs || 0;
    var tables = getArchive().filter(function (r) { return (r.closedAt || 0) >= since; });
    var rows = tables.map(function (r) { return { table: r.table, entries: r.entries || [], tip: r.tip || 0, total: r.total || 0, closedAt: r.closedAt, waiter: r.waiter }; });
    if (state && state.entries.length) rows.unshift({ table: state.table, entries: state.entries, tip: 0, total: stats().total, closedAt: 0, live: true, waiter: state.waiter });
    var revenue = 0, tips = 0, units = 0, ops = 0, cost = 0, atCostUnits = 0;
    var byDrink = {}, byHour = {}, byWaiter = {};
    rows.forEach(function (r) {
      revenue += r.total; tips += r.tip;
      if (r.waiter) byWaiter[r.waiter] = (byWaiter[r.waiter] || 0) + r.total;
      r.entries.forEach(function (e) {
        if (e.ts < since) return;
        units += e.qty; ops++;
        cost += (e.unitCost || costOf(D.byId(e.drinkId)) || 0) * e.qty;
        if (e.atCost) atCostUnits += e.qty;
        var k = byDrink[e.name] || (byDrink[e.name] = { name: e.name, qty: 0, amount: 0 });
        k.qty += e.qty; k.amount += e.subtotal;
        var hour = new Date(e.ts).getHours();
        byHour[hour] = (byHour[hour] || 0) + e.subtotal;
      });
    });
    var top = Object.keys(byDrink).map(function (k) { return byDrink[k]; }).sort(function (a, b) { return b.amount - a.amount; });
    return {
      tables: rows.length, revenue: revenue, tips: tips, units: units, operations: ops,
      avgTicket: rows.length ? revenue / rows.length : 0,
      cost: cost, margin: revenue - cost, atCostUnits: atCostUnits,
      top: top, byHour: byHour, byWaiter: byWaiter
    };
  }

  function csvCell(v) { return '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"'; }

  function exportCsv() {
    var lines = ['fecha;hora;mesa;trago;categoria;cantidad;precio_unitario;subtotal;variacion_pct'];
    state.entries.forEach(function (e) {
      var d = new Date(e.ts);
      lines.push([
        d.toLocaleDateString('es-AR'), D.clock(e.ts), csvCell(state.table),
        csvCell(e.name), csvCell(e.category), e.qty, e.unitPrice, e.subtotal,
        e.deltaPct.toFixed(2).replace('.', ',')
      ].join(';'));
    });
    return '﻿' + lines.join('\n');
  }

  function exportArchiveCsv() {
    var lines = ['cierre;mesa;responsable;comensales;fecha;hora;trago;cantidad;precio_unitario;subtotal'];
    getArchive().forEach(function (r) {
      (r.entries || []).forEach(function (e) {
        var d = new Date(e.ts);
        lines.push([
          csvCell(new Date(r.closedAt).toLocaleString('es-AR')), csvCell(r.table), csvCell(r.waiter), r.guests || 1,
          d.toLocaleDateString('es-AR'), D.clock(e.ts), csvCell(e.name), e.qty, e.unitPrice, e.subtotal
        ].join(';'));
      });
    });
    return '﻿' + lines.join('\n');
  }

  function exportBackup() {
    return JSON.stringify({ app: 'sernova-exchange', version: 4, exportedAt: now(), state: state, archive: getArchive() }, null, 1);
  }

  function importBackup(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return { ok: false, error: 'El archivo no es un JSON válido.' }; }
    if (!data || data.app !== 'sernova-exchange' || !data.state || !data.state.market) return { ok: false, error: 'El archivo no es un respaldo de SERNOVA.' };
    try {
      var prevAdmin = state ? state.admin : null;
      state = data.state;
      state.admin = normalizeAdmin(state.admin || prevAdmin);
      if (!state.catalog) state.catalog = { basePrices: {}, disabled: [], custom: [], costs: {} };
      D.applyCatalog(state.catalog);
      ensureMarket();
      state.nextCrashAt = now() + state.admin.crashMs;
      state.nextMarketAt = now() + state.admin.tickMs;
      state.updatedAt = now();
      saveArchive(Array.isArray(data.archive) ? data.archive : []);
      adminLog('Respaldo importado', new Date(data.exportedAt || now()).toLocaleString('es-AR'));
      save();
      return { ok: true };
    } catch (e) { return { ok: false, error: 'No se pudo importar el respaldo.' }; }
  }

  global.SernovaStore = {
    KEY: KEY, ARCHIVE_KEY: ARCHIVE_KEY, TICK_MS: TICK_MS, CRASH_MS: CRASH_MS, WINDOW_MS: WINDOW_MS,
    ADMIN_IDLE_MS: ADMIN_IDLE_MS,
    sha256: sha256, costOf: costOf, crashActive: crashActive, crashLeft: crashLeft, stopCrash: stopCrash, setCost: setCost,
    externalPurchase: externalPurchase, markClubApplied: markClubApplied, clubApplied: clubApplied,
    load: load, save: save, persist: persist, publicState: publicState,
    hasSession: hasSession, getState: getState,
    ensureSystemState: ensureSystemState,
    createSession: createSession, endSession: endSession, setTheme: setTheme, setPref: setPref, setGuests: setGuests,
    demand: demand, purchase: purchase, marketTick: marketTick, forceCrash: forceCrash,
    forceRally: forceRally, resetMarket: resetMarket, adminSetPrice: adminSetPrice,
    removeEntry: removeEntry, undo: undo, clearLedger: clearLedger, lastChange: lastChange,
    stats: stats, movers: movers, billSummary: billSummary, groupedEntries: groupedEntries,
    login: login, logout: logout, isAdmin: isAdmin, touchAdmin: touchAdmin, lockRemaining: lockRemaining,
    changePassword: changePassword, changeUser: changeUser, setPaused: setPaused, crashRemaining: crashRemaining,
    setMarketRules: setMarketRules,
    setSessionInfo: setSessionInfo, setBasePrice: setBasePrice, setEnabled: setEnabled,
    addCustomDrink: addCustomDrink, deleteCustomDrink: deleteCustomDrink, resetCatalog: resetCatalog,
    getArchive: getArchive, archiveSession: archiveSession, deleteArchive: deleteArchive,
    clearArchive: clearArchive, restoreArchive: restoreArchive, wipeAll: wipeAll,
    report: report, exportCsv: exportCsv, exportArchiveCsv: exportArchiveCsv,
    exportBackup: exportBackup, importBackup: importBackup
  };
})(window);
