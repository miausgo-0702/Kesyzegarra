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
      if (s && s.theme) document.documentElement.dataset.theme = s.theme;
    } catch (e) { /* noop */ }
  }

  global.ClubUI = { $: $, esc: esc, toast: toast, openSheet: openSheet, closeSheet: closeSheet, ago: ago, mmss: mmss, initials: initials, applyTheme: applyTheme };
})(window);
