/* ==========================================================================
   SERNOVA CLUB — utilidades de interfaz compartidas (clientes y staff).
   ========================================================================== */
(function (global) {
  'use strict';
  var D = global.SernovaData;
  var lastFocus = null;

  function $(id) { return document.getElementById(id); }
  function esc(t) { return D.esc(t); }

  function toast(title, detail, kind) {
    var root = $('toasts');
    if (!root) return;
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.setAttribute('role', kind === 'down' ? 'alert' : 'status');
    el.innerHTML = '<i class="toast-bar"></i><div><strong>' + esc(title) + '</strong>' + (detail ? '<small>' + esc(detail) + '</small>' : '') + '</div>' +
      '<button type="button" class="toast-close" aria-label="Cerrar">×</button>';
    function dismiss() { el.classList.add('out'); setTimeout(function () { el.remove(); }, 260); }
    el.querySelector('.toast-close').addEventListener('click', dismiss);
    root.appendChild(el);
    while (root.children.length > 3) root.firstChild.remove();
    setTimeout(dismiss, 3800);
  }

  function openSheet(html, label, wide) {
    var root = $('modal-root');
    if (!root.innerHTML) lastFocus = document.activeElement;
    root.innerHTML = '<div class="modal-backdrop" data-sheet-close>' +
      '<div class="modal' + (wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(label || 'Diálogo') + '">' +
      '<button class="icon-btn xs modal-x" type="button" data-sheet-close aria-label="Cerrar">×</button>' + html + '</div></div>';
    var first = root.querySelector('[autofocus]') || root.querySelector('.btn.primary');
    if (first) setTimeout(function () { first.focus(); }, 40);
    return root.querySelector('.modal');
  }

  function closeSheet() {
    var root = $('modal-root');
    if (!root || !root.innerHTML) return;
    root.innerHTML = '';
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-sheet-close]');
    if (!t) return;
    if (t.classList.contains('modal-backdrop') && ev.target !== t) return;
    closeSheet();
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeSheet(); });

  function ago(ts) {
    var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return 'recién';
    if (s < 3600) return 'hace ' + Math.floor(s / 60) + ' min';
    return D.clock(ts);
  }

  function mmss(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase() || '?';
  }

  function applyTheme() {
    try {
      var s = JSON.parse(localStorage.getItem('sernova-exchange.v2') || 'null');
      if (s && s.theme && s.designVersion === 2) document.documentElement.dataset.theme = s.theme;
    } catch (e) { /* noop */ }
  }

  var ICONS = {
    mail: '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" stroke="currentColor" stroke-width="1.6"/><path d="m4.5 7 7.5 6 7.5-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="13" rx="3" stroke="currentColor" stroke-width="1.6"/><path d="M3 10h18M16 14.5h2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M6 6l9-3 1.5 3" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none"><rect x="5" y="10.5" width="14" height="9.5" rx="2.5" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    glass: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 4h12l-6 8-6-8Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 12v7m-4 1h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
  };

  /* Ventana "Glassy" con código de N dígitos y animación X → check → verificado.
     opts: { title, sub, icon, length, button, foot, onSubmit(code) → Promise<{ok, error}>,
             verifiedTitle, verifiedSub(res), onDone(res) } */
  function otp(opts) {
    var n = opts.length || 4;
    var root = $('modal-root');
    lastFocus = document.activeElement;
    var boxes = '';
    for (var i = 0; i < n; i++) boxes += '<input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="one-time-code" aria-label="Dígito ' + (i + 1) + '" />';
    root.innerHTML = '<div class="glass-scene" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '">' +
      '<div class="glass-card">' +
        '<button type="button" class="glass-close" data-sheet-close aria-label="Cerrar">×</button>' +
        '<div class="glass-icon">' + (ICONS[opts.icon] || ICONS.mail) + '</div>' +
        '<h2 class="glass-title">' + esc(opts.title) + '</h2>' +
        '<p class="glass-sub">' + (opts.sub || '') + '</p>' +
        '<div class="otp">' + boxes + '<svg class="otp-x" viewBox="0 0 130 130" aria-hidden="true"><line x1="22" y1="22" x2="108" y2="108"/><line x1="108" y1="22" x2="22" y2="108"/><circle cx="65" cy="65" r="5"/></svg><div class="otp-tile" aria-hidden="true">✓</div></div>' +
        '<p class="glass-error" aria-live="polite"></p>' +
        '<button type="button" class="glass-btn" disabled>' + esc(opts.button || 'Verificar código') + '</button>' +
        (opts.foot ? '<p class="glass-foot">' + opts.foot + '</p>' : '') +
      '</div>' +
      (opts.dock ? '<div class="glass-dock">' + opts.dock + '</div>' : '') +
    '</div>';
    var scene = root.querySelector('.glass-scene');
    var card = scene.querySelector('.glass-card');
    var otpEl = scene.querySelector('.otp');
    var inputs = Array.prototype.slice.call(otpEl.querySelectorAll('input'));
    var btn = scene.querySelector('.glass-btn');
    var err = scene.querySelector('.glass-error');
    var busy = false;

    function code() { return inputs.map(function (x) { return x.value; }).join(''); }
    function sync() {
      inputs.forEach(function (x) { x.classList.toggle('filled', !!x.value); });
      var full = code().length === n;
      btn.disabled = !full || busy;
      btn.classList.toggle('ready', full && !busy);
      return full;
    }
    function fill(str, from) {
      var digits = String(str).replace(/\D/g, '').split('');
      for (var i = from; i < n && digits.length; i++) inputs[i].value = digits.shift();
      var next = inputs.filter(function (x) { return !x.value; })[0];
      (next || inputs[n - 1]).focus();
      if (sync()) setTimeout(submit, 220);
    }
    inputs.forEach(function (inp, i) {
      inp.addEventListener('input', function () {
        var v = inp.value.replace(/\D/g, '');
        inp.value = '';
        if (v) fill(v, i); else sync();
        err.textContent = '';
        otpEl.classList.remove('bad');
      });
      inp.addEventListener('keydown', function (ev) {
        if (ev.key === 'Backspace' && !inp.value && i > 0) { inputs[i - 1].value = ''; inputs[i - 1].focus(); sync(); ev.preventDefault(); }
        if (ev.key === 'ArrowLeft' && i > 0) inputs[i - 1].focus();
        if (ev.key === 'ArrowRight' && i < n - 1) inputs[i + 1].focus();
        if (ev.key === 'Enter' && sync()) submit();
      });
      inp.addEventListener('paste', function (ev) {
        ev.preventDefault();
        fill((ev.clipboardData || window.clipboardData).getData('text'), i);
      });
    });
    btn.addEventListener('click', submit);

    function submit() {
      if (busy || code().length !== n) return;
      busy = true;
      btn.disabled = true;
      btn.className = 'glass-btn loading';
      btn.textContent = 'Verificando…';
      var started = Date.now();
      Promise.resolve(opts.onSubmit(code())).then(function (res) {
        var wait = Math.max(0, 650 - (Date.now() - started));
        setTimeout(function () { res && res.ok ? success(res) : failure(res); }, wait);
      }, function () { failure({ error: 'No se pudo verificar.' }); });
    }
    function failure(res) {
      busy = false;
      otpEl.classList.add('bad');
      err.textContent = (res && res.error) || 'Código incorrecto.';
      btn.className = 'glass-btn';
      btn.textContent = opts.button || 'Verificar código';
      try { if (navigator.vibrate) navigator.vibrate([60, 40, 60]); } catch (e) { /* noop */ }
      setTimeout(function () {
        inputs.forEach(function (x) { x.value = ''; });
        sync();
        inputs[0].focus();
      }, 450);
    }
    function success(res) {
      otpEl.classList.add('ok');
      btn.className = 'glass-btn success';
      btn.textContent = 'Verificado';
      inputs.forEach(function (x) { x.disabled = true; });
      try { if (navigator.vibrate) navigator.vibrate(40); } catch (e) { /* noop */ }
      setTimeout(function () { if (n === 4) otpEl.classList.add('cross'); }, 380);
      setTimeout(function () { otpEl.classList.add('done'); }, n === 4 ? 1250 : 500);
      setTimeout(function () {
        if (!document.contains(card)) return;
        card.innerHTML = '<div class="glass-verified"><div class="vcheck">✓</div><h3>' + esc(opts.verifiedTitle || 'Verificado') + '</h3>' +
          '<p>' + esc(typeof opts.verifiedSub === 'function' ? opts.verifiedSub(res) : (opts.verifiedSub || '')) + '</p></div>';
      }, n === 4 ? 2150 : 1300);
      setTimeout(function () {
        if (root.contains(scene)) closeSheet();
        if (opts.onDone) opts.onDone(res);
      }, n === 4 ? 3600 : 2700);
    }
    setTimeout(function () { inputs[0].focus(); }, 60);
  }

  global.ClubUI = { otp: otp, ICONS: ICONS, $: $, esc: esc, toast: toast, openSheet: openSheet, closeSheet: closeSheet, ago: ago, mmss: mmss, initials: initials, applyTheme: applyTheme };
})(window);
