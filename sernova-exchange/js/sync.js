/* ==========================================================================
   Sincronización entre la terminal y la pantalla de TV.

   - La terminal publica su estado PÚBLICO (sin datos de admin) con
     POST /api/state, agrupando cambios seguidos (debounce).
   - Desde otros equipos de la red se necesita la clave de publicación que
     muestra el servidor al iniciar (se guarda en este dispositivo).
   - La TV se suscribe a GET /api/stream (SSE) y cae a polling / localStorage
     si el servidor no está disponible.
   Sin dependencias externas.
   ========================================================================== */
(function (global) {
  'use strict';

  var LOCAL_KEY = 'sernova-exchange.v2';
  var PUBLIC_KEY = 'sernova-exchange.public.v1';
  var KEY_STORE = 'sernova-exchange.publish-key';
  var enabled = /^https?:$/.test(location.protocol);
  var isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

  var pending = null;
  var timer = null;
  var inFlight = false;
  var lastStamp = '';
  var listeners = [];
  var status = { state: enabled ? 'idle' : 'local', at: 0, error: '', clients: 0 };

  function storageGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function storageSet(k, v) { try { global.localStorage.setItem(k, v); } catch (e) { /* noop */ } }

  function getKey() { return storageGet(KEY_STORE) || ''; }
  function setKey(k) { storageSet(KEY_STORE, String(k || '').trim().toUpperCase()); lastStamp = ''; }

  function setStatus(next) {
    var changed = next.state !== status.state || next.error !== status.error;
    status = Object.assign({}, status, next);
    if (changed) listeners.forEach(function (cb) { try { cb(status); } catch (e) { /* noop */ } });
  }
  function onStatus(cb) { if (typeof cb === 'function') { listeners.push(cb); cb(status); } }

  function readLocal() {
    try {
      var raw = storageGet(PUBLIC_KEY) || storageGet(LOCAL_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  /* La copia pública también se deja en localStorage para TVs del mismo navegador. */
  function writeLocalPublic(json) { storageSet(PUBLIC_KEY, json); }

  function fetchLocalKey() {
    if (!enabled || !isLocalHost || !global.fetch) return;
    global.fetch('/api/key', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.key && j.key !== getKey()) setKey(j.key); })
      .catch(function () { /* sin servidor */ });
  }

  function flush() {
    timer = null;
    if (!pending || inFlight) return;
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
    writeLocalPublic(json);
    if (!enabled || !global.fetch) return;
    if (json.length > 5500000) { setStatus({ state: 'error', error: 'Estado demasiado grande' }); return; }
    var stamp = json.length + ':' + (publicState.updatedAt || 0) + ':' + (publicState.prefsAt || 0);
    if (stamp === lastStamp && !immediate) return;
    lastStamp = stamp;
    pending = json;
    if (timer) global.clearTimeout(timer);
    timer = global.setTimeout(flush, immediate ? 0 : 250);
  }

  function subscribe(cb) {
    if (typeof cb !== 'function') return;

    global.addEventListener('storage', function (ev) {
      if (ev.key !== PUBLIC_KEY || !ev.newValue) return;
      try { cb(JSON.parse(ev.newValue), 'local'); } catch (e) { /* noop */ }
    });

    if (!enabled || !global.fetch) {
      cb(readLocal(), 'local');
      return;
    }

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
        es.onmessage = function (ev) {
          try { cb(JSON.parse(ev.data), 'sse'); } catch (e) { /* noop */ }
        };
        es.onerror = function () {
          cb(null, 'down');
          if (!poll) poll = global.setInterval(fetchOnce, 3000);
        };
        es.onopen = function () {
          if (poll) { global.clearInterval(poll); poll = null; }
          cb(null, 'up');
        };
      } catch (e) {
        poll = global.setInterval(fetchOnce, 3000);
      }
    } else {
      poll = global.setInterval(fetchOnce, 3000);
    }
  }

  fetchLocalKey();

  global.SernovaSync = {
    push: push,
    subscribe: subscribe,
    readLocal: readLocal,
    onStatus: onStatus,
    getStatus: function () { return status; },
    getKey: getKey,
    setKey: setKey,
    enabled: enabled,
    isLocalHost: isLocalHost
  };
})(window);
