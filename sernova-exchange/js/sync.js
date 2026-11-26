/* ==========================================================================
   Sincronización entre la terminal y la pantalla de TV.

   1. Con servidor (INICIAR.bat / node server.js): la terminal publica su estado
      PÚBLICO con POST /api/state y las TVs escuchan /api/stream (SSE).
      Desde otros equipos se necesita la clave de publicación del servidor.
   2. Sin servidor (archivo local o página publicada): la TV integrada recibe
      el estado directamente de la terminal (postMessage) y las pestañas del
      mismo navegador se sincronizan por localStorage.
   Antes de usar la red se comprueba /api/health, así no hay errores si no
   existe un servidor SERNOVA.
   ========================================================================== */
(function (global) {
  'use strict';

  var LOCAL_KEY = 'sernova-exchange.v2';
  var PUBLIC_KEY = 'sernova-exchange.public.v1';
  var KEY_STORE = 'sernova-exchange.publish-key';
  var httpPage = /^https?:$/.test(location.protocol);
  var isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var inFrame = false;
  try { inFrame = global.parent && global.parent !== global; } catch (e) { inFrame = true; }

  var server = null;            // null = comprobando, true / false
  var serverWaiters = [];
  var pending = null;
  var timer = null;
  var inFlight = false;
  var lastStamp = '';
  var lastJson = '';
  var listeners = [];
  var status = { state: 'idle', at: 0, error: '', clients: 0 };

  function storageGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function storageSet(k, v) { try { global.localStorage.setItem(k, v); } catch (e) { /* noop */ } }

  function getKey() { return storageGet(KEY_STORE) || ''; }
  function setKey(k) { storageSet(KEY_STORE, String(k || '').trim()); lastStamp = ''; }

  function setStatus(next) {
    var changed = next.state !== status.state || next.error !== status.error || next.clients !== status.clients;
    status = Object.assign({}, status, next);
    if (changed) listeners.forEach(function (cb) { try { cb(status); } catch (e) { /* noop */ } });
  }
  function onStatus(cb) { if (typeof cb === 'function') { listeners.push(cb); cb(status); } }

  /* ----------------------------------------------- detección del servidor */
  function whenServer(cb) {
    if (server !== null) cb(server);
    else serverWaiters.push(cb);
  }

  function probe() {
    if (!httpPage || !global.fetch) { finishProbe(false); return; }
    var done = false;
    var t = global.setTimeout(function () { if (!done) { done = true; finishProbe(false); } }, 2500);
    global.fetch('/api/health', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (!done) { done = true; global.clearTimeout(t); finishProbe(!!(j && j.ok === true && 'clients' in j)); } })
      .catch(function () { if (!done) { done = true; global.clearTimeout(t); finishProbe(false); } });
  }

  function finishProbe(ok) {
    server = ok;
    if (!ok) setStatus({ state: 'local', error: '' });
    if (ok && isLocalHost) fetchLocalKey();
    var w = serverWaiters; serverWaiters = [];
    w.forEach(function (cb) { cb(ok); });
    if (ok && pending) flush();
  }

  function fetchLocalKey() {
    global.fetch('/api/key', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.key && j.key !== getKey()) { setKey(j.key); if (lastJson) { pending = lastJson; flush(); } } })
      .catch(function () { /* noop */ });
  }

  function readLocal() {
    try {
      var raw = storageGet(PUBLIC_KEY) || storageGet(LOCAL_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  /* ----------------------------------------------------------- publicar */
  function postToFrames(json) {
    var frames = global.document ? global.document.querySelectorAll('iframe[data-sernova-tv]') : [];
    Array.prototype.forEach.call(frames, function (f) {
      try { f.contentWindow.postMessage({ sernova: 'state', json: json }, '*'); } catch (e) { /* noop */ }
    });
  }

  function flush() {
    timer = null;
    if (!pending || inFlight || server !== true) return;
    var json = pending;
    pending = null;
    inFlight = true;
    var headers = { 'Content-Type': 'application/json' };
    var key = getKey();
    if (key) headers['X-Sernova-Key'] = key;
    global.fetch('/api/state', { method: 'POST', headers: headers, body: json, cache: 'no-store' })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          if (r.ok) setStatus({ state: 'online', at: Date.now(), error: '', clients: body.clients || 0 });
          else if (r.status === 401) { lastStamp = ''; setStatus({ state: 'auth', error: 'Falta la clave de publicación' }); }
          else setStatus({ state: 'error', error: body.error || ('Error ' + r.status) });
        });
      })
      .catch(function () { lastStamp = ''; setStatus({ state: 'offline', error: 'Servidor no disponible' }); })
      .then(function () {
        inFlight = false;
        if (pending) timer = global.setTimeout(flush, 150);
      });
  }

  function push(publicState, immediate) {
    if (!publicState) return;
    var json;
    try { json = JSON.stringify(publicState); } catch (e) { return; }
    lastJson = json;
    storageSet(PUBLIC_KEY, json);
    postToFrames(json);
    if (server === false) return;
    if (json.length > 5500000) { setStatus({ state: 'error', error: 'Estado demasiado grande' }); return; }
    var stamp = json.length + ':' + (publicState.updatedAt || 0);
    if (stamp === lastStamp && !immediate) return;
    lastStamp = stamp;
    pending = json;
    if (server === null) return;            // se envía al terminar la detección
    if (timer) global.clearTimeout(timer);
    timer = global.setTimeout(flush, immediate ? 0 : 250);
  }

  // Una TV integrada pide el último estado al cargarse.
  global.addEventListener('message', function (ev) {
    var d = ev.data;
    if (d && d.sernova === 'hello' && lastJson && ev.source) {
      try { ev.source.postMessage({ sernova: 'state', json: lastJson }, '*'); } catch (e) { /* noop */ }
    }
  });

  /* ------------------------------------------------------------ suscribir */
  function subscribe(cb) {
    if (typeof cb !== 'function') return;
    var lastRaw = '';

    function fromRaw(raw, src) {
      if (!raw || raw === lastRaw) return;
      lastRaw = raw;
      try { cb(JSON.parse(raw), src); } catch (e) { /* noop */ }
    }

    // a) TV integrada dentro de la terminal
    global.addEventListener('message', function (ev) {
      var d = ev.data;
      if (d && d.sernova === 'state' && typeof d.json === 'string') fromRaw(d.json, 'frame');
    });
    if (inFrame) { try { global.parent.postMessage({ sernova: 'hello' }, '*'); } catch (e) { /* noop */ } }

    // b) otra pestaña del mismo navegador
    global.addEventListener('storage', function (ev) {
      if (ev.key === PUBLIC_KEY && ev.newValue) fromRaw(ev.newValue, 'local');
    });

    whenServer(function (ok) {
      if (!ok) {
        var initial = storageGet(PUBLIC_KEY);
        if (initial) fromRaw(initial, 'local');
        else if (!inFrame) cb(readLocal(), 'local');
        // respaldo por si el navegador no emite eventos de storage
        global.setInterval(function () { fromRaw(storageGet(PUBLIC_KEY), 'local'); }, 1500);
        return;
      }

      // c) servidor SERNOVA
      var poll = null;
      function fetchOnce() {
        global.fetch('/api/state', { cache: 'no-store' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (s) { if (s) cb(s, 'poll'); })
          .catch(function () { cb(null, 'down'); });
      }
      global.fetch('/api/state', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (s) { cb(s || readLocal(), s ? 'initial' : 'local'); })
        .catch(function () { cb(readLocal(), 'local'); });

      if (global.EventSource) {
        try {
          var es = new global.EventSource('/api/stream');
          es.onmessage = function (ev) { try { cb(JSON.parse(ev.data), 'sse'); } catch (e) { /* noop */ } };
          es.onerror = function () { cb(null, 'down'); if (!poll) poll = global.setInterval(fetchOnce, 3000); };
          es.onopen = function () { if (poll) { global.clearInterval(poll); poll = null; } cb(null, 'up'); };
        } catch (e) { poll = global.setInterval(fetchOnce, 3000); }
      } else {
        poll = global.setInterval(fetchOnce, 3000);
      }
    });
  }

  probe();

  global.SernovaSync = {
    push: push,
    subscribe: subscribe,
    readLocal: readLocal,
    onStatus: onStatus,
    getStatus: function () { return status; },
    hasServer: function () { return server === true; },
    whenServer: whenServer,
    getKey: getKey,
    setKey: setKey,
    enabled: httpPage,
    isLocalHost: isLocalHost,
    inFrame: inFrame
  };
})(window);
