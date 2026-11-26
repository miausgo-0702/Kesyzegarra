/* ==========================================================================
   SERNOVA CLUB — cliente para el navegador.
   - Con servidor SERNOVA: POST /api/club y avisos en vivo por /api/stream.
   - Sin servidor: corre el mismo núcleo (club-core.js) sobre localStorage,
     así la página publicada funciona en un solo navegador.
   Requiere data.js, sync.js y club-core.js.
   ========================================================================== */
(function (global) {
  'use strict';

  var Core = global.SernovaClubCore;
  var Sync = global.SernovaSync;
  var D = global.SernovaData;
  var DB_KEY = 'sernova-club.v1';
  var ME_KEY = 'sernova-club.me';
  var STAFF_KEY = 'sernova-club.staff';
  var listeners = [];
  var mode = null;
  var lastLocalRaw = '';

  function lsGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { global.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { global.localStorage.removeItem(k); } catch (e) { /* noop */ } }
  function ssGet(k) { try { return global.sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { if (v) global.sessionStorage.setItem(k, v); else global.sessionStorage.removeItem(k); } catch (e) { /* noop */ } }

  function getMe() { try { return JSON.parse(lsGet(ME_KEY) || 'null'); } catch (e) { return null; } }
  function setMe(me) { if (me) lsSet(ME_KEY, JSON.stringify(me)); else lsDel(ME_KEY); }
  function getStaff() { return ssGet(STAFF_KEY) || ''; }
  function setStaff(t) { ssSet(STAFF_KEY, t || ''); }

  function rand(n) {
    var a = new Uint8Array(Math.ceil(n / 2));
    if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(a);
    else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('').slice(0, n);
  }

  function emit(src) { listeners.forEach(function (cb) { try { cb(src); } catch (e) { /* noop */ } }); }
  function onChange(cb) { if (typeof cb === 'function') listeners.push(cb); }

  /* -------------------------------------------------------- modo local */
  function loadDb() {
    var raw = lsGet(DB_KEY);
    try { return Core.normalize(raw ? JSON.parse(raw) : null); } catch (e) { return Core.emptyDb(); }
  }
  function saveDb(db) {
    var raw = JSON.stringify(db);
    if (lsSet(DB_KEY, raw)) { lastLocalRaw = raw; return true; }
    // sin espacio: se descartan las fotos más viejas
    while (db.photos.length > 3) {
      db.photos.splice(Math.ceil(db.photos.length * 0.7));
      raw = JSON.stringify(db);
      if (lsSet(DB_KEY, raw)) { lastLocalRaw = raw; return true; }
    }
    return false;
  }

  function marketCtx() {
    var pub = Sync && Sync.readLocal ? Sync.readLocal() : null;
    if (!pub || !pub.market) return { market: null, drinkInfo: function () { return null; }, atCost: false };
    if (D) D.applyCatalog(pub.catalog || null);
    return {
      market: pub.market,
      atCost: !!(pub.crash && pub.crash.active),
      drinkInfo: function (id) { var d = D && D.byId(id); return d ? { name: d.name, enabled: d.enabled !== false } : null; }
    };
  }

  function callLocal(op, payload) {
    var db = loadDb();
    var me = getMe() || {};
    var mc = marketCtx();
    var res = Core.handle(db, op, payload, {
      now: Date.now(), sha256: Core.sha256, rand: rand,
      auth: { id: me.id, token: me.token, staff: getStaff() },
      market: mc.market, drinkInfo: mc.drinkInfo, atCost: mc.atCost,
      maxPhotos: 30, maxPhotoChars: 420000
    });
    if (op !== 'public' && op !== 'me' && op !== 'staff.data' || res.ok) {
      if (!saveDb(db) && res.ok) return { ok: false, error: 'El navegador se quedó sin espacio. Borrá fotos viejas.' };
    }
    if (res.ok && op !== 'public' && op !== 'me' && op !== 'staff.data') setTimeout(function () { emit('local'); }, 0);
    return res;
  }

  /* ------------------------------------------------------- modo servidor */
  function callServer(op, payload) {
    var me = getMe() || {};
    var headers = { 'Content-Type': 'application/json' };
    if (me.id) { headers['X-Club-Id'] = me.id; headers['X-Club-Token'] = me.token; }
    var st = getStaff();
    if (st) headers['X-Staff-Token'] = st;
    return global.fetch('/api/club', { method: 'POST', headers: headers, body: JSON.stringify({ op: op, payload: payload || {} }), cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Respuesta inválida del servidor.' }; }); })
      .catch(function () { return { ok: false, error: 'Sin conexión con el bar. Revisá el wifi.', code: 0 }; });
  }

  function ready() {
    return new Promise(function (resolve) {
      if (mode) { resolve(mode); return; }
      if (!Sync || !Sync.whenServer) { mode = 'local'; resolve(mode); return; }
      Sync.whenServer(function (okServer) {
        if (!mode) {
          mode = okServer ? 'server' : 'local';
          startWatch();
        }
        resolve(mode);
      });
    });
  }

  function call(op, payload) {
    return ready().then(function (m) {
      var res = m === 'server' ? callServer(op, payload) : Promise.resolve(callLocal(op, payload));
      return Promise.resolve(res).then(function (r) {
        r = r || { ok: false, error: 'Error desconocido.' };
        if (r.ok && op === 'join') setMe({ id: r.data.id, token: r.data.token });
        if (r.ok && op === 'staff.login') setStaff(r.data.token);
        if (op === 'staff.logout' || (!r.ok && r.code === 401 && /staff/i.test(r.error || ''))) setStaff('');
        return r;
      });
    });
  }

  function startWatch() {
    if (mode === 'server' && global.EventSource) {
      try {
        var es = new global.EventSource('/api/stream');
        es.addEventListener('club', function () { emit('server'); });
        es.addEventListener('message', function () { emit('market'); });
      } catch (e) { /* noop */ }
      global.setInterval(function () { emit('poll'); }, 15000);
    } else {
      global.addEventListener('storage', function (ev) {
        if (ev.key === DB_KEY) emit('local');
        if (ev.key === 'sernova-exchange.public.v1') emit('market');
      });
      global.setInterval(function () {
        var raw = lsGet(DB_KEY) || '';
        if (raw !== lastLocalRaw) { lastLocalRaw = raw; emit('local'); }
      }, 2000);
    }
  }

  /* --------------------------------------------------------- utilidades */
  function compressImage(file) {
    var maxSide = mode === 'server' ? 1280 : 720;
    var quality = mode === 'server' ? 0.8 : 0.66;
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) { reject(new Error('Elegí una imagen.')); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var k = Math.min(1, maxSide / Math.max(w, h));
        var cv = document.createElement('canvas');
        cv.width = Math.round(w * k); cv.height = Math.round(h * k);
        var ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        var data = cv.toDataURL('image/jpeg', quality);
        if (data.length > (mode === 'server' ? 880000 : 400000)) data = cv.toDataURL('image/jpeg', 0.5);
        resolve(data);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la foto.')); };
      img.src = url;
    });
  }

  function market() {
    var pub = Sync && Sync.readLocal ? Sync.readLocal() : null;
    return pub;
  }

  function fetchMarket() {
    return ready().then(function (m) {
      if (m !== 'server') return market();
      return global.fetch('/api/state', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    });
  }

  global.SernovaClub = {
    call: call, ready: ready, onChange: onChange, getMe: getMe, setMe: setMe,
    getStaff: getStaff, setStaff: setStaff, compressImage: compressImage, fetchMarket: fetchMarket,
    mode: function () { return mode; }
  };
})(window);
