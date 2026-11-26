/* ==========================================================================
   Gráfico SVG del exchange.

   - curva de precio suavizada (monótona) + media móvil de 5 períodos;
   - color de la serie según la tendencia de la sesión (verde / rojo);
   - barras por tipo de evento (consumo, ajuste, caída general, administrador);
   - modo "Demanda" con las unidades consumidas por ventana;
   - línea de último precio, referencia de carta, bandas de caída/subida;
   - tooltip con crosshair que funciona con mouse, lápiz y dedo.
   Se dibuja al tamaño real del contenedor para que el texto quede nítido.
   ========================================================================== */
(function (global) {
  'use strict';

  var D = global.SernovaData;
  var seq = 0;

  var KIND_LABEL = {
    apertura: 'Apertura', consumo: 'Consumo', ajuste: 'Ajuste automático',
    crash: 'Caída a precio de costo', recover: 'Fin del precio de costo', rally: 'Subida general', admin: 'Ajuste admin'
  };

  function esc(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function slice(history, range) {
    if (range === 'sesion') return history.filter(function (h) { return !h.synthetic; });
    if (range === '10') return history.slice(-10);
    if (range === '30') return history.slice(-30);
    return history.slice();
  }

  function f(n) { return n.toFixed(1); }

  function linePath(points) {
    return points.map(function (p, i) { return (i ? 'L' : 'M') + f(p.x) + ' ' + f(p.y); }).join(' ');
  }

  /* Interpolación cúbica monótona (Fritsch–Carlson): suave sin "pasarse". */
  function smoothPath(pts) {
    var n = pts.length;
    if (n < 3) return linePath(pts);
    var dx = [], dy = [], m = [], t = [];
    for (var i = 0; i < n - 1; i++) {
      dx[i] = pts[i + 1].x - pts[i].x;
      dy[i] = pts[i + 1].y - pts[i].y;
      m[i] = dx[i] ? dy[i] / dx[i] : 0;
    }
    t[0] = m[0];
    t[n - 1] = m[n - 2];
    for (i = 1; i < n - 1; i++) {
      if (m[i - 1] * m[i] <= 0) t[i] = 0;
      else {
        var w1 = 2 * dx[i] + dx[i - 1], w2 = dx[i] + 2 * dx[i - 1];
        t[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
      }
    }
    var d = 'M' + f(pts[0].x) + ' ' + f(pts[0].y);
    for (i = 0; i < n - 1; i++) {
      var h = dx[i] / 3;
      d += ' C' + f(pts[i].x + h) + ' ' + f(pts[i].y + t[i] * h) + ' ' +
        f(pts[i + 1].x - h) + ' ' + f(pts[i + 1].y - t[i + 1] * h) + ' ' +
        f(pts[i + 1].x) + ' ' + f(pts[i + 1].y);
    }
    return d;
  }

  function render(container, drink, market, opts) {
    if (!container || !market) return;
    opts = opts || {};
    var big = !!opts.big;
    var cw = container.clientWidth || 900;
    var ch = container.clientHeight || 0;
    var W = Math.max(280, Math.round(cw));
    var narrow = W < 560;
    var H = opts.fill && ch > 80 ? Math.round(ch) : (narrow ? 260 : 330);
    var fs = big ? Math.max(12, Math.round(W / 90)) : (narrow ? 10 : 11);
    var PL = big ? fs * 5 : (narrow ? 44 : 58);
    var PR = big ? fs * 1.4 : (narrow ? 12 : 18);
    var PT = big ? fs * 1.6 : 22, PB = big ? fs * 2.6 : 32;
    var PW = W - PL - PR;
    var PH = H - PT - PB;
    var id = 'c' + (++seq);

    var mode = opts.mode || 'ambos';
    var range = opts.range || 'todo';
    var data = slice(market.history, range);

    if (!data.length) {
      container.innerHTML = '<div class="chart-empty"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 17l5-5 4 3 8-8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '<span>Todavía no hay datos en este rango.</span><small>Registrá un consumo para ver cómo se mueve el precio.</small></div>';
      return;
    }

    var isDemand = mode === 'demanda';
    var showBars = mode === 'ambos' || mode === 'consumo' || isDemand;
    var showLine = mode === 'ambos' || mode === 'precio' || isDemand;
    var values = data.map(function (h) { return isDemand ? (h.demand || 0) : h.price; });
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    if (!isDemand && drink.price) { min = Math.min(min, drink.price); max = Math.max(max, drink.price); }
    var pad = Math.max((max - min) * 0.14, max * 0.012, isDemand ? 1 : 10);
    min = isDemand ? 0 : Math.max(0, min - pad);
    max = max + pad;
    if (max === min) max = min + (isDemand ? 1 : 100);

    var barValues = data.map(function (h) { return isDemand ? (h.qty || h.demand || 0) : (h.qty || 0); });
    var maxQty = Math.max.apply(null, barValues) || 1;
    var xAt = function (i) { return data.length === 1 ? PL + PW / 2 : PL + i * PW / (data.length - 1); };
    var yAt = function (v) { return PT + (max - v) / (max - min) * PH; };

    var firstSession = data.filter(function (h) { return !h.synthetic; })[0];
    var refPrice = firstSession ? (firstSession.paid || firstSession.price) : data[0].price;
    var trendUp = isDemand ? true : data[data.length - 1].price >= refPrice;
    var lineColor = isDemand ? 'var(--gold)' : (trendUp ? 'var(--green)' : 'var(--red)');

    var svg = [];
    svg.push('<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Gráfico de ' + (isDemand ? 'demanda' : 'precio') + ' de ' + esc(drink.name) + '">');
    svg.push('<defs>' +
      '<linearGradient id="' + id + 'a" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + lineColor + '" stop-opacity="0.32"/>' +
        '<stop offset="70%" stop-color="' + lineColor + '" stop-opacity="0.05"/>' +
        '<stop offset="100%" stop-color="' + lineColor + '" stop-opacity="0"/>' +
      '</linearGradient>' +
      '<pattern id="' + id + 'h" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">' +
        '<rect width="6" height="6" fill="var(--red)" fill-opacity="0.06"/>' +
        '<line x1="0" y1="0" x2="0" y2="6" stroke="var(--red)" stroke-opacity="0.28" stroke-width="2"/>' +
      '</pattern>' +
      '<filter id="' + id + 'g" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="' + (big ? 6 : 4) + '"/></filter>' +
      '<clipPath id="' + id + 'c"><rect x="' + PL + '" y="' + (PT - 6) + '" width="' + PW + '" height="' + (PH + 6) + '"/></clipPath>' +
      '</defs>');

    // Rejilla y escala
    for (var g = 0; g <= 4; g++) {
      var gy = PT + g * PH / 4;
      var gv = max - g * (max - min) / 4;
      svg.push('<line x1="' + PL + '" y1="' + f(gy) + '" x2="' + (W - PR) + '" y2="' + f(gy) + '" stroke="var(--grid-line)"' + (g === 4 ? '' : ' stroke-dasharray="2 6"') + '/>');
      var label = isDemand ? Math.round(gv) + ' u.' : D.moneyShort(gv);
      svg.push('<text x="' + (PL - 10) + '" y="' + f(gy + fs * 0.35) + '" text-anchor="end" fill="var(--muted)" font-size="' + fs + '" font-family="var(--mono)">' + label + '</text>');
    }

    // Bandas de caída general / subida general
    var bandW = Math.max(10, Math.min(22, PW / data.length * 0.8));
    data.forEach(function (h, i) {
      if (h.kind !== 'crash' && h.kind !== 'rally') return;
      var crash = h.kind === 'crash';
      svg.push('<rect x="' + f(xAt(i) - bandW / 2) + '" y="' + PT + '" width="' + f(bandW) + '" height="' + PH + '" fill="' + (crash ? 'url(#' + id + 'h)' : 'var(--gold)') + '" opacity="' + (crash ? 1 : 0.09) + '"/>');
      svg.push('<line x1="' + f(xAt(i)) + '" y1="' + PT + '" x2="' + f(xAt(i)) + '" y2="' + (PT + PH) + '" stroke="var(--' + (crash ? 'red' : 'gold') + ')" stroke-opacity="0.6" stroke-dasharray="3 3"/>');
      if (!narrow || i === data.length - 1) {
        var nearEnd = xAt(i) > W - PR - fs * 5;
        svg.push('<text x="' + f(nearEnd ? xAt(i) - 5 : xAt(i) + 5) + '" text-anchor="' + (nearEnd ? 'end' : 'start') + '" y="' + (PT + fs) + '" fill="var(--' + (crash ? 'red' : 'gold') + ')" font-size="' + (fs - 1) + '" font-weight="800" letter-spacing=".06em">' + (crash ? 'COSTO' : 'SUBIDA') + '</text>');
      }
    });

    // Separador de sesión
    if (range === 'todo') {
      for (var s = 0; s < data.length; s++) {
        if (!data[s].synthetic) {
          if (s === 0) break;
          var sx = xAt(s);
          svg.push('<rect x="' + PL + '" y="' + PT + '" width="' + f(sx - PL) + '" height="' + PH + '" fill="var(--text)" opacity="0.018"/>');
          svg.push('<line x1="' + f(sx) + '" y1="' + PT + '" x2="' + f(sx) + '" y2="' + (PT + PH) + '" stroke="var(--accent)" stroke-opacity="0.5" stroke-dasharray="4 4"/>');
          var sEnd = sx > W - PR - fs * 5;
          svg.push('<text x="' + f(sEnd ? sx - 6 : sx + 6) + '" text-anchor="' + (sEnd ? 'end' : 'start') + '" y="' + (PT + fs * 2.3) + '" fill="var(--accent)" font-size="' + (fs - 1) + '" font-weight="800" letter-spacing=".08em">SESIÓN</text>');
          break;
        }
      }
    }

    // Precio de carta como referencia
    if (!isDemand && drink.price >= min && drink.price <= max) {
      var baseY = yAt(drink.price);
      svg.push('<line x1="' + PL + '" y1="' + f(baseY) + '" x2="' + (W - PR) + '" y2="' + f(baseY) + '" stroke="var(--gold)" stroke-opacity="0.6" stroke-dasharray="1 5" stroke-linecap="round" stroke-width="1.5"/>');
      svg.push('<text x="' + (PL + 6) + '" y="' + f(baseY - 6) + '" fill="var(--gold)" font-size="' + (fs - 1) + '" font-weight="800" letter-spacing=".08em">CARTA ' + D.moneyShort(drink.price) + '</text>');
    }

    // Barras según tipo de evento
    if (showBars) {
      var barW = Math.max(3, Math.min(big ? 30 : 20, PW / data.length * 0.55));
      data.forEach(function (h, i) {
        if (!barValues[i]) return;
        var bh = Math.max(2, (barValues[i] / maxQty) * PH * (isDemand ? 0.7 : 0.32));
        var bx = xAt(i) - barW / 2;
        var by = PT + PH - bh;
        var color, opacity;
        if (isDemand) { color = 'var(--gold)'; opacity = 0.5; }
        else if (h.kind === 'crash') { color = 'var(--red)'; opacity = 0.9; }
        else if (h.kind === 'rally' || h.kind === 'recover') { color = 'var(--gold)'; opacity = 0.85; }
        else if (h.kind === 'admin') { color = 'var(--gold)'; opacity = 0.6; }
        else if (h.kind === 'ajuste') { color = 'var(--blue)'; opacity = 0.4; }
        else { color = h.dir === 'down' ? 'var(--red)' : 'var(--green)'; opacity = h.synthetic ? 0.22 : 0.75; }
        svg.push('<rect x="' + f(bx) + '" y="' + f(by) + '" width="' + f(barW) + '" height="' + f(bh) + '" rx="' + Math.min(3, barW / 2) + '" fill="' + color + '" opacity="' + opacity + '"/>');
      });
    }

    var pts = values.map(function (v, i) { return { x: xAt(i), y: yAt(v) }; });
    var last = pts[pts.length - 1];
    if (showLine) {
      var path = smoothPath(pts);
      svg.push('<g clip-path="url(#' + id + 'c)">');
      svg.push('<path d="' + path + ' L' + f(last.x) + ' ' + (PT + PH) + ' L' + f(pts[0].x) + ' ' + (PT + PH) + ' Z" fill="url(#' + id + 'a)"/>');
      svg.push('<path d="' + path + '" fill="none" stroke="' + lineColor + '" stroke-width="' + (big ? 6 : 4) + '" opacity="0.35" filter="url(#' + id + 'g)"/>');
      svg.push('<path class="chart-line' + (opts.animate ? ' draw' : '') + '" d="' + path + '" fill="none" stroke="' + lineColor + '" stroke-width="' + (big ? 3 : 2.2) + '" stroke-linejoin="round" stroke-linecap="round"/>');

      if (!isDemand && pts.length >= 5) {
        var sma = pts.map(function (p, i) {
          if (i < 4) return null;
          var sum = 0;
          for (var k = i - 4; k <= i; k++) sum += values[k];
          return { x: p.x, y: yAt(sum / 5) };
        }).filter(Boolean);
        svg.push('<path d="' + smoothPath(sma) + '" fill="none" stroke="var(--gold)" stroke-width="1.3" stroke-dasharray="4 4" opacity="0.7"/>');
      }
      svg.push('</g>');

      // Línea del último precio
      svg.push('<line x1="' + PL + '" y1="' + f(last.y) + '" x2="' + (W - PR) + '" y2="' + f(last.y) + '" stroke="' + lineColor + '" stroke-opacity="0.45" stroke-dasharray="2 3"/>');
    }

    // Crosshair + punto activo
    svg.push('<line class="cx-v" x1="0" y1="' + PT + '" x2="0" y2="' + (PT + PH) + '" stroke="var(--text-2)" stroke-opacity="0.55" stroke-dasharray="3 3" opacity="0"/>');
    svg.push('<line class="cx-h" x1="' + PL + '" y1="0" x2="' + (W - PR) + '" y2="0" stroke="var(--text-2)" stroke-opacity="0.35" stroke-dasharray="3 3" opacity="0"/>');
    svg.push('<circle class="cx-dot" r="' + (big ? 7 : 5) + '" cx="0" cy="0" fill="var(--panel)" stroke="' + lineColor + '" stroke-width="2.5" opacity="0"/>');

    // Último punto con pulso
    if (showLine) {
      svg.push('<circle class="pulse-ring" cx="' + f(last.x) + '" cy="' + f(last.y) + '" r="' + (big ? 8 : 6) + '" fill="' + lineColor + '" opacity="0.35"/>');
      svg.push('<circle cx="' + f(last.x) + '" cy="' + f(last.y) + '" r="' + (big ? 5.5 : 4) + '" fill="' + lineColor + '" stroke="var(--panel)" stroke-width="2"/>');
    }

    // Etiqueta del último valor (sobre el eje derecho)
    var tagText = isDemand ? (data[data.length - 1].demand || 0) + ' u.' : D.moneyShort(data[data.length - 1].price);
    var tagH = fs + 11, tagW = Math.max(fs * 5.6, tagText.length * fs * 0.68 + 16);
    var tx = Math.max(PL, Math.min(W - PR - tagW, last.x - tagW - 10));
    var ty = Math.max(PT, Math.min(PT + PH - tagH, last.y - tagH / 2));
    svg.push('<g><rect x="' + f(tx) + '" y="' + f(ty) + '" width="' + f(tagW) + '" height="' + tagH + '" rx="' + (tagH / 2) + '" fill="' + lineColor + '"/>' +
      '<text x="' + f(tx + tagW / 2) + '" y="' + f(ty + tagH / 2 + fs * 0.36) + '" text-anchor="middle" fill="var(--on-accent)" font-size="' + fs + '" font-weight="800" font-family="var(--mono)">' + tagText + '</text></g>');

    // Eje de tiempo
    var ticks = narrow ? 3 : big ? 6 : 5;
    var idxs = [];
    for (var q = 0; q < ticks; q++) idxs.push(Math.round(q * (data.length - 1) / (ticks - 1)));
    idxs = idxs.filter(function (v, i, a) { return a.indexOf(v) === i; });
    idxs.forEach(function (i, n) {
      svg.push('<text x="' + f(xAt(i)) + '" y="' + (H - PB / 2 + fs * 0.4) + '" text-anchor="' + (n === 0 ? 'start' : n === idxs.length - 1 ? 'end' : 'middle') + '" fill="var(--muted)" font-size="' + fs + '" font-family="var(--mono)">' + D.clock(data[i].ts) + '</text>');
    });

    svg.push('<rect class="hit" x="' + PL + '" y="0" width="' + PW + '" height="' + H + '" fill="transparent"/>');
    svg.push('</svg>');
    container.innerHTML = svg.join('') + (opts.tooltip === false ? '' : '<div class="chart-tip" hidden></div>');

    if (opts.tooltip === false) return;

    // Tooltip con crosshair (mouse, lápiz o dedo)
    var svgEl = container.querySelector('svg');
    var tip = container.querySelector('.chart-tip');
    var cv = svgEl.querySelector('.cx-v'), chz = svgEl.querySelector('.cx-h'), dot = svgEl.querySelector('.cx-dot');

    function show(ev) {
      var rect = svgEl.getBoundingClientRect();
      var scale = rect.width / W;
      var vx = (ev.clientX - rect.left) / scale;
      var step = data.length > 1 ? PW / (data.length - 1) : 1;
      var i = Math.max(0, Math.min(data.length - 1, Math.round((vx - PL) / step)));
      var h = data[i];
      var p = pts[i];
      var arrow = h.dir === 'up' ? '▲' : h.dir === 'down' ? '▼' : '■';
      var cls = h.dir === 'up' ? 'up' : h.dir === 'down' ? 'down' : 'flat';
      var delta = h.paid ? (h.price - h.paid) / h.paid * 100 : 0;
      tip.hidden = false;
      tip.innerHTML = '<strong>' + esc(KIND_LABEL[h.kind] || 'Evento') + '</strong>' +
        '<time>' + new Date(h.ts).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + '</time>' +
        '<span>Precio <b>' + D.money(h.price) + '</b> <em class="' + cls + '">' + arrow + (delta ? ' ' + D.pct(delta) : '') + '</em></span>' +
        (h.qty ? '<span>Unidades <b>' + h.qty + '</b></span>' : '') +
        '<span>Demanda <b>' + (h.demand || 0) + ' u.</b></span>';
      var tipW = tip.offsetWidth || 150;
      var px = p.x * scale;
      var left = px + 16 + tipW > rect.width ? px - tipW - 16 : px + 16;
      tip.style.left = Math.max(4, left) + 'px';
      tip.style.top = Math.max(4, Math.min(rect.height - tip.offsetHeight - 4, p.y * scale - 20)) + 'px';
      cv.setAttribute('x1', p.x); cv.setAttribute('x2', p.x); cv.setAttribute('opacity', '1');
      chz.setAttribute('y1', p.y); chz.setAttribute('y2', p.y); chz.setAttribute('opacity', '1');
      dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y); dot.setAttribute('opacity', '1');
    }
    function hide() {
      tip.hidden = true;
      cv.setAttribute('opacity', '0'); chz.setAttribute('opacity', '0'); dot.setAttribute('opacity', '0');
    }
    svgEl.addEventListener('pointermove', show);
    svgEl.addEventListener('pointerdown', show);
    svgEl.addEventListener('pointerleave', hide);
    svgEl.addEventListener('pointercancel', hide);
  }

  function sparkline(history, n) {
    var data = history.slice(-(n || 16));
    if (data.length < 2) return '';
    var lo = Math.min.apply(null, data.map(function (h) { return h.price; }));
    var hi = Math.max.apply(null, data.map(function (h) { return h.price; }));
    if (hi === lo) { hi = lo + 1; lo = lo - 1; }
    var pts = data.map(function (h, i) {
      return { x: i / (data.length - 1) * 96 + 2, y: 25 - (h.price - lo) / (hi - lo) * 20 };
    });
    var up = data[data.length - 1].price >= data[0].price;
    var color = up ? 'var(--green)' : 'var(--red)';
    var d = smoothPath(pts);
    var gid = 's' + (++seq);
    var lastP = pts[pts.length - 1];
    return '<svg viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".25"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + d + ' L98 28 L2 28 Z" fill="url(#' + gid + ')"/>' +
      '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
      '<circle cx="' + f(lastP.x) + '" cy="' + f(lastP.y) + '" r="1.8" fill="' + color + '"/></svg>';
  }

  global.SernovaChart = { render: render, sparkline: sparkline, smoothPath: smoothPath };
})(window);
