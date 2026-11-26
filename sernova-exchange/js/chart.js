/* ==========================================================================
   Gráfico SVG del exchange.

   - línea de precio + media móvil de 5 períodos;
   - barras por tipo de evento (consumo, ajuste, caída general, administrador);
   - modo "Demanda" con la unidades consumidas por ventana;
   - marcadores de caídas generales y tooltip con crosshair.
   ========================================================================== */
(function (global) {
  'use strict';

  var D = global.SernovaData;

  var KIND_LABEL = {
    apertura: 'Apertura', consumo: 'Consumo', ajuste: 'Ajuste automático',
    crash: 'CAÍDA GENERAL', rally: 'Subida general', admin: 'Ajuste admin'
  };

  function esc(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function slice(history, range) {
    if (range === 'sesion') return history.filter(function (h) { return !h.synthetic; });
    if (range === '10') return history.slice(-10);
    return history.slice();
  }

  function linePath(points) {
    return points.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
  }

  function render(container, drink, market, opts) {
    if (!container || !market) return;
    opts = opts || {};
    var narrow = container.clientWidth > 0 && container.clientWidth < 560;
    var W = narrow ? 460 : 900;
    var H = narrow ? 330 : 320;
    var PL = narrow ? 46 : 58;
    var PR = narrow ? 14 : 22;
    var PT = 24, PB = 38;
    var PW = W - PL - PR;
    var PH = H - PT - PB;

    var mode = opts.mode || 'ambos';
    var range = opts.range || 'todo';
    var data = slice(market.history, range);

    if (!data.length) {
      container.innerHTML = '<div class="chart-empty">Todavía no hay datos en este rango.<br>Registrá un consumo para ver cómo se mueve el precio.</div>';
      return;
    }

    var isDemand = mode === 'demanda';
    var showBars = mode === 'ambos' || mode === 'consumo' || isDemand;
    var showLine = mode === 'ambos' || mode === 'precio' || isDemand;
    var values = data.map(function (h) { return isDemand ? (h.demand || 0) : h.price; });
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var pad = Math.max((max - min) * 0.12, max * 0.012, isDemand ? 1 : 10);
    min = isDemand ? 0 : Math.max(0, min - pad);
    max = max + pad;
    if (max === min) max = min + (isDemand ? 1 : 100);

    var barValues = data.map(function (h) { return isDemand ? (h.qty || h.demand || 0) : (h.qty || 1); });
    var maxQty = Math.max.apply(null, barValues) || 1;
    var xAt = function (i) { return data.length === 1 ? PL + PW / 2 : PL + i * PW / (data.length - 1); };
    var yAt = function (v) { return PT + (max - v) / (max - min) * PH; };

    var svg = [];
    svg.push('<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gráfico de ' + (isDemand ? 'demanda' : 'precio') + ' de ' + esc(drink.name) + '">');
    svg.push('<defs>' +
      '<linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + (isDemand ? 'var(--gold)' : 'var(--blue)') + '" stop-opacity="0.3"/>' +
        '<stop offset="100%" stop-color="' + (isDemand ? 'var(--gold)' : 'var(--blue)') + '" stop-opacity="0"/>' +
      '</linearGradient>' +
      '<pattern id="crashHatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">' +
        '<rect width="6" height="6" fill="var(--red)" fill-opacity="0.08"/>' +
        '<line x1="0" y1="0" x2="0" y2="6" stroke="var(--red)" stroke-opacity="0.35" stroke-width="2"/>' +
      '</pattern>' +
      '</defs>');

    // Rejilla y precios / demanda
    for (var g = 0; g <= 4; g++) {
      var gy = PT + g * PH / 4;
      var gv = max - g * (max - min) / 4;
      svg.push('<line x1="' + PL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - PR) + '" y2="' + gy.toFixed(1) + '" stroke="var(--grid-line)" stroke-dasharray="3 5"/>');
      var label = isDemand ? Math.round(gv) + ' u.' : D.moneyShort(gv);
      svg.push('<text x="' + (PL - 8) + '" y="' + (gy + 3.5).toFixed(1) + '" text-anchor="end" fill="var(--muted)" font-size="10" font-family="var(--mono)">' + label + '</text>');
    }

    // Precio de carta como referencia
    if (!isDemand && drink.price >= min && drink.price <= max) {
      var baseY = yAt(drink.price);
      svg.push('<line x1="' + PL + '" y1="' + baseY.toFixed(1) + '" x2="' + (W - PR) + '" y2="' + baseY.toFixed(1) + '" stroke="var(--gold)" stroke-opacity="0.55" stroke-dasharray="2 6"/>');
      svg.push('<text x="' + (W - PR - 2) + '" y="' + (baseY - 5).toFixed(1) + '" text-anchor="end" fill="var(--gold)" font-size="9" font-weight="700">CARTA</text>');
    }

    // Bandas de caída general / subida general
    data.forEach(function (h, i) {
      if (h.kind === 'crash' || h.kind === 'rally') {
        var bx = xAt(i) - 9;
        svg.push('<rect x="' + bx.toFixed(1) + '" y="' + PT + '" width="18" height="' + PH + '" fill="' + (h.kind === 'crash' ? 'url(#crashHatch)' : 'var(--gold)') + '" opacity="' + (h.kind === 'crash' ? 1 : 0.10) + '"/>');
        svg.push('<line x1="' + xAt(i).toFixed(1) + '" y1="' + PT + '" x2="' + xAt(i).toFixed(1) + '" y2="' + (PT + PH) + '" stroke="var(--' + (h.kind === 'crash' ? 'red' : 'gold') + ')" stroke-opacity="0.75" stroke-dasharray="3 3"/>');
        if (!narrow || i === data.length - 1) {
          svg.push('<text x="' + Math.min(W - PR - 4, xAt(i) + 4).toFixed(1) + '" y="' + (PT + 10) + '" fill="var(--' + (h.kind === 'crash' ? 'red' : 'gold') + ')" font-size="9" font-weight="800">' + (h.kind === 'crash' ? 'CAÍDA' : 'SUBIDA') + '</text>');
        }
      }
    });

    // Separador de sesión
    if (range === 'todo') {
      for (var s = 0; s < data.length; s++) {
        if (!data[s].synthetic) {
          var sx = xAt(s);
          svg.push('<line x1="' + sx.toFixed(1) + '" y1="' + PT + '" x2="' + sx.toFixed(1) + '" y2="' + (PT + PH) + '" stroke="var(--blue)" stroke-opacity="0.35" stroke-dasharray="4 4"/>');
          svg.push('<text x="' + (sx + 5).toFixed(1) + '" y="' + (PT + 22) + '" fill="var(--blue)" font-size="9" font-weight="700">SESIÓN</text>');
          break;
        }
      }
    }

    // Barras según tipo de evento
    if (showBars) {
      var barW = Math.max(3, Math.min(24, PW / data.length * 0.5));
      data.forEach(function (h, i) {
        if (!barValues[i]) return;
        var bh = (barValues[i] / maxQty) * PH * (isDemand ? 0.72 : 0.56);
        var bx = xAt(i) - barW / 2;
        var by = PT + PH - bh;
        var color, opacity;
        if (isDemand) { color = 'var(--gold)'; opacity = 0.55; }
        else if (h.kind === 'crash') { color = 'var(--red)'; opacity = 0.95; }
        else if (h.kind === 'rally') { color = 'var(--gold)'; opacity = 0.85; }
        else if (h.kind === 'admin') { color = 'var(--gold)'; opacity = 0.6; }
        else if (h.kind === 'ajuste') { color = 'var(--blue)'; opacity = 0.4; }
        else { color = h.dir === 'up' ? 'var(--green)' : h.dir === 'down' ? 'var(--red)' : 'var(--muted)'; opacity = h.synthetic ? 0.3 : 0.8; }
        svg.push('<rect x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="2" fill="' + color + '" opacity="' + opacity + '"/>');
      });
    }

    var pts = values.map(function (v, i) { return { x: xAt(i), y: yAt(v) }; });
    if (showLine) {
      var path = linePath(pts);
      svg.push('<path d="' + path + ' L' + pts[pts.length - 1].x.toFixed(1) + ' ' + (PT + PH) + ' L' + pts[0].x.toFixed(1) + ' ' + (PT + PH) + ' Z" fill="url(#areaGrad)"/>');
      svg.push('<path d="' + path + '" fill="none" stroke="' + (isDemand ? 'var(--gold)' : 'var(--blue)') + '" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round"/>');

      if (!isDemand && pts.length >= 5) {
        var sma = pts.map(function (p, i) {
          if (i < 4) return null;
          var sum = 0;
          for (var k = i - 4; k <= i; k++) sum += values[k];
          return { x: p.x, y: yAt(sum / 5) };
        }).filter(Boolean);
        svg.push('<path d="' + linePath(sma) + '" fill="none" stroke="var(--gold)" stroke-width="1.4" stroke-dasharray="5 4" opacity="0.8"/>');
      }
    }

    // Crosshair
    svg.push('<line id="chart-cross" x1="0" y1="' + PT + '" x2="0" y2="' + (PT + PH) + '" stroke="var(--text-2)" stroke-opacity="0.5" stroke-dasharray="3 3" opacity="0"/>');

    svg.push('<g class="chart-points">');
    pts.forEach(function (p, i) {
      svg.push('<g class="chart-hover">');
      svg.push('<circle class="visible-dot" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (i === pts.length - 1 ? 4.5 : 2.6) + '" fill="' + (isDemand ? 'var(--gold)' : 'var(--blue)') + '" stroke="var(--panel)" stroke-width="1.4"/>');
      svg.push('<circle class="hit-dot" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="11" fill="transparent"/>');
      svg.push('</g>');
    });
    svg.push('</g>');

    // Etiqueta del último valor
    var last = pts[pts.length - 1];
    var tagW = 92, tagH = 21;
    var tx = Math.max(PL, Math.min(W - PR - tagW, last.x - tagW / 2));
    var ty = Math.max(PT, Math.min(PT + PH - tagH, last.y - 28));
    var tagColor = isDemand ? 'var(--gold)' : (data[data.length - 1].dir === 'down' ? 'var(--red)' : 'var(--green)');
    svg.push('<g><rect x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) + '" width="' + tagW + '" height="' + tagH + '" rx="5" fill="' + tagColor + '"/>' +
      '<text x="' + (tx + tagW / 2).toFixed(1) + '" y="' + (ty + 14).toFixed(1) + '" text-anchor="middle" fill="#06231a" font-size="11" font-weight="700" font-family="var(--mono)">' +
      (isDemand ? (data[data.length - 1].demand || 0) + ' u.' : D.moneyShort(data[data.length - 1].price)) + '</text></g>');

    // Eje de tiempo
    var idxs = [0];
    var mid = Math.floor((data.length - 1) / 2);
    if (mid > 0 && mid < data.length - 1) idxs.push(mid);
    if (data.length > 1) idxs.push(data.length - 1);
    idxs.forEach(function (i) {
      svg.push('<text x="' + xAt(i).toFixed(1) + '" y="' + (H - 11) + '" text-anchor="' + (i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle') + '" fill="var(--muted)" font-size="10" font-family="var(--mono)">' + D.clock(data[i].ts) + '</text>');
    });

    svg.push('</svg>');
    container.innerHTML = svg.join('') + '<div class="chart-tip" hidden></div>';

    // Tooltip con crosshair
    var svgEl = container.querySelector('svg');
    var tip = container.querySelector('.chart-tip');
    var cross = container.querySelector('#chart-cross');
    svgEl.addEventListener('mousemove', function (ev) {
      var rect = svgEl.getBoundingClientRect();
      var vx = (ev.clientX - rect.left) / rect.width * W;
      var step = data.length > 1 ? PW / (data.length - 1) : 1;
      var i = Math.max(0, Math.min(data.length - 1, Math.round((vx - PL) / step)));
      var h = data[i];
      var arrow = h.dir === 'up' ? '▲' : h.dir === 'down' ? '▼' : '■';
      tip.hidden = false;
      tip.innerHTML = '<strong>' + esc(KIND_LABEL[h.kind] || 'Evento') + '</strong>' +
        '<span>' + new Date(h.ts).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + '</span>' +
        '<span>Precio <b>' + D.money(h.price) + '</b> ' + arrow + '</span>' +
        (h.qty ? '<span>Unidades <b>' + h.qty + '</b></span>' : '') +
        '<span>Demanda <b>' + (h.demand || 0) + ' u.</b></span>';
      var left = Math.max(4, Math.min(rect.width - 150, ev.clientX - rect.left + 14));
      tip.style.left = left + 'px';
      tip.style.top = Math.max(4, ev.clientY - rect.top - 12) + 'px';
      cross.setAttribute('x1', pts[i].x);
      cross.setAttribute('x2', pts[i].x);
      cross.setAttribute('opacity', '1');
    });
    svgEl.addEventListener('mouseleave', function () {
      tip.hidden = true;
      cross.setAttribute('opacity', '0');
    });
  }

  function sparkline(history) {
    var data = history.slice(-14);
    if (data.length < 2) return '';
    var lo = Math.min.apply(null, data.map(function (h) { return h.price; }));
    var hi = Math.max.apply(null, data.map(function (h) { return h.price; }));
    if (hi === lo) { hi = lo + 1; lo = lo - 1; }
    var pts = data.map(function (h, i) {
      return (i / (data.length - 1) * 98 + 1).toFixed(1) + ',' + (24 - (h.price - lo) / (hi - lo) * 20).toFixed(1);
    });
    var color = data[data.length - 1].price >= data[data.length - 2].price ? 'var(--green)' : 'var(--red)';
    return '<svg viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden="true">' +
      '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>' +
      '<circle cx="' + pts[pts.length - 1].split(',')[0] + '" cy="' + pts[pts.length - 1].split(',')[1] + '" r="2" fill="' + color + '"/></svg>';
  }

  global.SernovaChart = { render: render, sparkline: sparkline };
})(window);
