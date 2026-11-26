/* ==========================================================================
   Sincronización ligera entre la terminal y la pantalla de TV.

   - La terminal publica su estado con POST /api/state en cada guardado.
   - La TV se suscribe a GET /api/stream (SSE) y cae a polling / localStorage
     si el servidor no está disponible.
   Sin dependencias externas.
   ========================================================================== */
(function (global) {
  'use strict';

  var LOCAL_KEY = 'sernova-exchange.v2';
  var enabled = /^https?:$/.test(location.protocol);
  var lastPayload = '';

  function readLocal() {
    try {
      var raw = global.localStorage.getItem(LOCAL_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function push(state) {
    if (!enabled || !state || !global.fetch) return;
    var payload;
    try { payload = JSON.stringify(state); } catch (e) { return; }
    if (payload.length > 7000000) return;
    var stamp = payload.length + ':' + (state.updatedAt || 0);
    if (stamp === lastPayload) return;
    lastPayload = stamp;
    global.fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      cache: 'no-store'
    }).catch(function () { /* sin servidor: funciona solo en local */ });
  }

  function subscribe(cb) {
    if (typeof cb !== 'function') return;

    global.addEventListener('storage', function (ev) {
      if (ev.key !== LOCAL_KEY || !ev.newValue) return;
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
        .catch(function () { /* servidor caído */ });
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
          if (!poll) poll = global.setInterval(fetchOnce, 3000);
        };
        es.onopen = function () {
          if (poll) { global.clearInterval(poll); poll = null; }
        };
      } catch (e) {
        poll = global.setInterval(fetchOnce, 3000);
      }
    } else {
      poll = global.setInterval(fetchOnce, 3000);
    }
  }

  global.SernovaSync = {
    push: push,
    subscribe: subscribe,
    readLocal: readLocal,
    enabled: enabled
  };
})(window);
