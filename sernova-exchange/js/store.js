/* ==========================================================================
   Estado, persistencia y motor de precios del exchange.

   Regla económica:
   - cuanto más se consume un trago (unidades en los últimos 4 min), más sube;
   - si nadie lo consume, el precio baja en cada ajuste automático;
   - periódicamente ocurre una CAÍDA GENERAL: todos los precios bajan a la vez.
   ========================================================================== */
(function (global) {
  'use strict';

  var KEY = 'sernova-exchange.v2';
  var ARCHIVE_KEY = 'sernova-exchange-archive.v1';
  var D = global.SernovaData;

  var WINDOW_MS = 4 * 60 * 1000;   // ventana de demanda
  var TICK_MS = 20 * 1000;         // ajuste automático de mercado
  var CRASH_MS = 120 * 1000;       // caída general cada 2 minutos
  var MAX_HISTORY = 320;

  var DEFAULT_USER = 'julianp';
  var DEFAULT_HASH = hash('070226');
  var state = null;

  function activeDrinks() { return D.DRINKS.filter(function (d) { return d.enabled !== false; }); }

  function hash(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

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
        if (!state.admin) state.admin = {};
        var a = state.admin;
        if (!a.user) a.user = DEFAULT_USER;
        if (!a.passwordHash || (!a.passwordChanged && a.passwordHash === hash('sernova2026'))) a.passwordHash = DEFAULT_HASH;
        if (a.loggedIn === undefined) a.loggedIn = false;
        if (a.passwordChanged === undefined) a.passwordChanged = false;
        if (a.paused === undefined) a.paused = false;
        if (!a.crashMs) a.crashMs = CRASH_MS;
        if (!a.tickMs) a.tickMs = TICK_MS;
        if (!Array.isArray(a.log)) a.log = [];
        if (!state.catalog) state.catalog = { basePrices: {}, disabled: [], custom: [] };
        if (state.tvFocusId === undefined) state.tvFocusId = '';
        if (state.tvRotate === undefined) state.tvRotate = true;
        D.applyCatalog(state.catalog);
        ensureMarket();
        if (!state.nextCrashAt) state.nextCrashAt = now() + a.crashMs;
        if (!state.nextMarketAt) state.nextMarketAt = now() + a.tickMs;
      }
    } catch (e) { state = null; }
    return state;
  }

  function save() {
    try { global.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* modo privado */ }
    if (state && global.SernovaSync && typeof global.SernovaSync.push === 'function') {
      global.SernovaSync.push(state);
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
    try { global.localStorage.setItem(ARCHIVE_KEY, JSON.stringify(list.slice(0, 40))); } catch (e) { /* noop */ }
  }

  function archiveSession() {
    if (!state || !state.entries.length) return null;
    var st = stats();
    var record = {
      id: uid(),
      table: state.table,
      guests: state.guests,
      waiter: state.waiter,
      startedAt: state.startedAt,
      closedAt: now(),
      entries: state.entries.slice(),
      total: st.total,
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

  function createSession(table, guests, waiter) {
    var ts = now();
    if (state && state.entries.length) archiveSession();
    var admin = state && state.admin ? state.admin : {
      user: DEFAULT_USER, passwordHash: DEFAULT_HASH, passwordChanged: false,
      loggedIn: false, paused: false, crashMs: CRASH_MS, tickMs: TICK_MS, log: []
    };
    admin.paused = false;
    if (!admin.user) admin.user = DEFAULT_USER;
    var catalog = state && state.catalog ? state.catalog : { basePrices: {}, disabled: [], custom: [] };
    state = {
      version: 3,
      catalog: catalog,
      table: String(table || '').trim() || '1',
      guests: clamp(parseInt(guests, 10) || 1, 1, 40),
      waiter: String(waiter || '').trim(),
      startedAt: ts,
      updatedAt: ts,
      theme: state && state.theme ? state.theme : 'dark',
      selectedId: state && state.selectedId ? state.selectedId : D.DRINKS[0].id,
      mode: 'ambos', range: 'todo', category: 'Todos', tag: 'Todos', sort: 'carta', search: '',
      tvFocusId: state && state.tvFocusId ? state.tvFocusId : '',
      tvRotate: state ? state.tvRotate !== false : true,
      admin: admin,
      paused: false,
      nextMarketAt: ts + admin.tickMs,
      nextCrashAt: ts + admin.crashMs,
      entries: [],
      market: seedMarket(ts)
    };
    ensureMarket();
    save();
    return state;
  }

  function hasSession() { return !!(state && state.table && state.market && state.entries); }
  function getState() { return state; }

  function setTheme(theme) {
    if (!state) return;
    state.theme = theme === 'light' ? 'light' : 'dark';
    save();
  }

  function setPref(key, value) {
    if (!state) return;
    state[key] = value;
    state.updatedAt = now();
    save();
  }

  /* Devuelve las unidades consumidas de un trago dentro de la ventana. */
  function demand(id, ts) {
    var hist = state.market[id].history;
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
    var next = round10(clamp(paid * factor, floor, drink.price * 2.3));
    if (next === paid && factor !== 1) next = round10(clamp(paid + (factor > 1 ? 10 : -10), floor, drink.price * 2.3));
    var ts = now();
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

    var paid = state.market[id].price;
    var dem = demand(id, now()).units;
    var rng = mulberry32((now() ^ (id.length * 2654435761) ^ (state.entries.length * 40503)) >>> 0);

    // Más consumo en la ventana ⇒ mayor presión compradora ⇒ más sube.
    var pressure = 0.003 + Math.min(dem, 14) * 0.0075;
    var reversion = (drink.price - paid) / drink.price * 0.10;
    var noise = (rng() - 0.5) * 0.006;

    var tick = movePrice(id, 1 + pressure + reversion + noise, 'consumo', { qty: qty, drinkId: id });
    var entry = {
      id: uid(), drinkId: id, name: drink.name, category: drink.category,
      qty: qty, unitPrice: paid, subtotal: paid * qty, ts: tick.ts,
      deltaPct: paid ? (tick.price - paid) / paid * 100 : 0
    };
    state.entries.push(entry);
    state.updatedAt = tick.ts;
    save();
    return { entry: entry, tick: tick, drink: drink };
  }

  function marketTick() {
    if (!state || state.admin.paused) return { changed: false, crashed: false, paused: true };
    var ts = now();
    var crashed = ts >= state.nextCrashAt;
    var changed = false;

    if (crashed) {
      activeDrinks().forEach(function (d) { if (movePrice(d.id, 0.90, 'crash')) changed = true; });
      state.nextCrashAt = ts + state.admin.crashMs;
    } else {
      activeDrinks().forEach(function (d) {
        var paid = state.market[d.id].price;
        var dem = demand(d.id, ts).units;
        var reversion = (d.price - paid) / d.price * 0.12;
        // Sin consumo ⇒ baja; con consumo ⇒ sube, proporcionalmente a las unidades.
        var delta = (Math.min(dem, 12) - 1.5) * 0.0045 + reversion * 0.12 + (Math.random() - 0.5) * 0.0015;
        if (!dem) delta -= 0.0025;
        if (Math.abs(delta) < 0.0008) return;
        if (movePrice(d.id, 1 + delta, 'ajuste')) changed = true;
      });
    }
    state.nextMarketAt = ts + state.admin.tickMs;
    state.updatedAt = ts;
    save();
    return { changed: changed, crashed: crashed };
  }

  function forceCrash() {
    var changed = false;
    activeDrinks().forEach(function (d) { if (movePrice(d.id, 0.90, 'crash')) changed = true; });
    state.nextCrashAt = now() + state.admin.crashMs;
    state.updatedAt = now();
    save();
    return changed;
  }

  function forceRally() {
    var changed = false;
    activeDrinks().forEach(function (d) { if (movePrice(d.id, 1.07, 'rally')) changed = true; });
    state.updatedAt = now();
    save();
    return changed;
  }

  function resetMarket() {
    activeDrinks().forEach(function (d) {
      var m = state.market[d.id];
      if (m.price === d.price) return;
      var paid = m.price;
      pushTick(d.id, {
        ts: now(), price: d.price, qty: 0,
        dir: d.price > paid ? 'up' : d.price < paid ? 'down' : 'flat',
        synthetic: false, kind: 'admin', drinkId: d.id, paid: paid, demand: 0
      });
    });
    state.nextCrashAt = now() + state.admin.crashMs;
    state.nextMarketAt = now() + state.admin.tickMs;
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
    var history = state.market[entry.drinkId].history;
    for (var j = history.length - 1; j >= 0; j--) {
      if (history[j].kind === 'consumo' && history[j].ts === entry.ts && history[j].drinkId === entry.drinkId) {
        history.splice(j, 1);
        break;
      }
    }
    recompute(entry.drinkId);
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
      state.market[id].history = state.market[id].history.filter(function (h) { return h.synthetic; });
      recompute(id);
    });
    state.entries = [];
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
    return {
      total: total, units: units, ups: ups, downs: downs, flats: flats,
      counts: counts, amounts: amounts, byCategory: byCategory,
      avg: units ? total / units : 0, operations: state.entries.length
    };
  }

  /* ---------------------------------------------------------------- admin */
  function adminLog(action, detail) {
    if (!state) return;
    state.admin.log.unshift({ ts: now(), action: action, detail: detail || '' });
    state.admin.log = state.admin.log.slice(0, 60);
  }

  function ensureSystemState() {
    if (state) return state;
    var ts = now();
    state = {
      version: 3,
      table: '', guests: 1, waiter: '', startedAt: ts, updatedAt: ts,
      theme: 'dark', selectedId: D.DRINKS[0].id,
      mode: 'ambos', range: 'todo', category: 'Todos', tag: 'Todos', sort: 'carta', search: '',
      tvFocusId: '', tvRotate: true,
      catalog: { basePrices: {}, disabled: [], custom: [] },
      admin: {
        user: DEFAULT_USER, passwordHash: DEFAULT_HASH, passwordChanged: false,
        loggedIn: false, paused: false, crashMs: CRASH_MS, tickMs: TICK_MS, log: []
      },
      paused: false, nextMarketAt: ts + TICK_MS, nextCrashAt: ts + CRASH_MS,
      entries: [], market: seedMarket(ts)
    };
    save();
    return state;
  }

  function login(user, password) {
    ensureSystemState();
    var ok = String(user || '').trim().toLowerCase() === String(state.admin.user).toLowerCase() &&
      hash(String(password || '')) === state.admin.passwordHash;
    if (ok) { state.admin.loggedIn = true; adminLog('Ingreso admin', state.admin.user); save(); }
    return ok;
  }
  function logout() { if (state) { state.admin.loggedIn = false; adminLog('Salida admin', state.admin.user); save(); } }
  function isAdmin() { return !!(state && state.admin && state.admin.loggedIn); }

  function changePassword(next) {
    if (!isAdmin() || !next) return false;
    state.admin.passwordHash = hash(String(next));
    state.admin.passwordChanged = true;
    adminLog('Cambio de contraseña', 'Usuario ' + state.admin.user);
    save();
    return true;
  }

  function setPaused(paused) {
    if (!state) return;
    state.admin.paused = !!paused;
    adminLog(paused ? 'Mercado pausado' : 'Mercado reanudado', '');
    save();
  }

  function setIntervals(crashSec, tickSec) {
    if (!state) return false;
    var crash = clamp(parseInt(crashSec, 10) || 120, 30, 900) * 1000;
    var tick = clamp(parseInt(tickSec, 10) || 20, 5, 300) * 1000;
    state.admin.crashMs = crash;
    state.admin.tickMs = tick;
    state.nextCrashAt = now() + crash;
    state.nextMarketAt = now() + tick;
    adminLog('Intervalos del mercado', 'Caída ' + crash / 1000 + ' s · ajuste ' + tick / 1000 + ' s');
    save();
    return true;
  }

  function setSessionInfo(table, guests, waiter) {
    if (!state) return false;
    if (String(table || '').trim()) state.table = String(table).trim().slice(0, 20);
    state.guests = clamp(parseInt(guests, 10) || state.guests, 1, 40);
    state.waiter = String(waiter || '').trim().slice(0, 30);
    adminLog('Datos de mesa', 'Mesa ' + state.table + ' · ' + state.guests + ' comensales');
    save();
    return true;
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
    adminLog('Precio de carta', d.name + ' → ' + D.money(p));
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
    adminLog(enabled ? 'Trago activado' : 'Trago desactivado', d.name);
    save();
    return true;
  }

  function addCustomDrink(data) {
    if (!state || !data) return null;
    var name = String(data.name || '').trim().toUpperCase().slice(0, 40);
    if (!name) return null;
    var drink = {
      id: 'custom-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name: name,
      price: round10(clamp(parseInt(data.price, 10) || 10000, 1000, 500000)),
      category: data.category === 'Cocktails Sernova' ? 'Cocktails Sernova' : 'Tragos',
      tags: Array.isArray(data.tags) && data.tags.length ? data.tags.slice(0, 3) : ['Autor'],
      description: String(data.description || 'Trago personalizado creado por el administrador.').slice(0, 140),
      enabled: true
    };
    state.catalog.custom.push(drink);
    D.applyCatalog(state.catalog);
    ensureMarket();
    adminLog('Trago creado', drink.name + ' · ' + D.money(drink.price));
    save();
    return drink;
  }

  function resetCatalog() {
    if (!state) return;
    state.catalog = { basePrices: {}, disabled: [], custom: [] };
    D.applyCatalog(state.catalog);
    ensureMarket();
    adminLog('Carta restablecida', '32 tragos originales');
    save();
  }

  function restoreArchive(id) {
    var rec = getArchive().filter(function (r) { return r.id === id; })[0];
    if (!rec || !state) return false;
    if (state.entries.length) archiveSession();
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
    } catch (e) { /* noop */ }
    D.resetCatalog();
    state = null;
  }

  function exportCsv() {
    var lines = ['fecha;hora;mesa;trago;categoria;cantidad;precio_unitario;subtotal;variacion_pct'];
    state.entries.forEach(function (e) {
      var d = new Date(e.ts);
      lines.push([
        d.toLocaleDateString('es-AR'), D.clock(e.ts), '"' + state.table + '"',
        '"' + e.name + '"', '"' + e.category + '"', e.qty, e.unitPrice, e.subtotal,
        e.deltaPct.toFixed(2).replace('.', ',')
      ].join(';'));
    });
    return '\ufeff' + lines.join('\n');
  }

  global.SernovaStore = {
    KEY: KEY, ARCHIVE_KEY: ARCHIVE_KEY, TICK_MS: TICK_MS, CRASH_MS: CRASH_MS, WINDOW_MS: WINDOW_MS,
    hash: hash, load: load, save: save, hasSession: hasSession, getState: getState,
    ensureSystemState: ensureSystemState,
    createSession: createSession, setTheme: setTheme, setPref: setPref,
    demand: demand, purchase: purchase, marketTick: marketTick, forceCrash: forceCrash,
    forceRally: forceRally, resetMarket: resetMarket, adminSetPrice: adminSetPrice,
    removeEntry: removeEntry, undo: undo, clearLedger: clearLedger, lastChange: lastChange,
    stats: stats, login: login, logout: logout, isAdmin: isAdmin,
    changePassword: changePassword, setPaused: setPaused, setIntervals: setIntervals,
    setSessionInfo: setSessionInfo, setBasePrice: setBasePrice, setEnabled: setEnabled,
    addCustomDrink: addCustomDrink, resetCatalog: resetCatalog,
    getArchive: getArchive, archiveSession: archiveSession, deleteArchive: deleteArchive,
    clearArchive: clearArchive, restoreArchive: restoreArchive, wipeAll: wipeAll,
    exportCsv: exportCsv
  };
})(window);
