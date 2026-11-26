/* ==========================================================================
   Carta de SERNOVA — datos base del exchange
   Los precios son los informados por el usuario, en pesos argentinos.
   ========================================================================== */
(function (global) {
  'use strict';

  var SIGNATURE = 'Cóctel de autor de la casa Sernova.';

  var DEFAULT_DRINKS = [
    // ───────────────────────── Cocktails Sernova
    { id: 'sernova-loly-fresh', name: 'SERNOVA LOLY FRESH', price: 11400, category: 'Cocktails Sernova', tags: ['Sernova', 'Autor'], description: SIGNATURE },
    { id: 'sernova-fest',        name: 'SERNOVA FEST',        price: 11400, category: 'Cocktails Sernova', tags: ['Sernova', 'Autor'], description: SIGNATURE },
    { id: 'sernova-gum',         name: 'SERNOVA GUM',         price: 11400, category: 'Cocktails Sernova', tags: ['Sernova', 'Autor'], description: SIGNATURE },
    { id: 'sernova-candy-glow',  name: 'SERNOVA CANDY GLOW',  price: 11400, category: 'Cocktails Sernova', tags: ['Sernova', 'Autor'], description: SIGNATURE },

    // ───────────────────────── Tragos
    { id: 'branca-cola',          name: 'BRANCA & COLA',            price: 10000, category: 'Tragos', tags: ['Fernet', 'Clásico'], description: 'Fernet Branca con cola.' },
    { id: 'menta-julep',          name: 'MENTA JULEP',              price: 10000, category: 'Tragos', tags: ['Julep', 'Fernet'], description: 'Branca Menta servida en julep.' },
    { id: 'punt-e-mes-julep',     name: 'PUNT E MES JULEP',         price: 10000, category: 'Tragos', tags: ['Julep', 'Vermouth'], description: 'Punt e Mes con hielo y rodaja de naranja.' },
    { id: 'carpano-rosso',        name: 'VERMOUTH CARPANO ROSSO',   price: 10000, category: 'Tragos', tags: ['Vermouth'], description: 'Vermouth Carpano Rosso, solo o con hielo.' },
    { id: 'carpano-bianco',       name: 'VERMOUTH CARPANO BIANCO',  price: 10000, category: 'Tragos', tags: ['Vermouth'], description: 'Vermouth Carpano Bianco, fresco y aromático.' },
    { id: 'gancia-batido',        name: 'GANCIA BATIDO',            price: 8000,  category: 'Tragos', tags: ['Espumante'], description: 'Gancia batido con hielo.' },
    { id: 'sex-on-the-beach',     name: 'SEX ON THE BEACH',         price: 9000,  category: 'Tragos', tags: ['Tropical', 'Clásico'], description: 'Vodka, licor de melón, zumo de naranja y granadina.' },
    { id: 'tequila-sunrise',      name: 'TEQUILA SUNRISE',          price: 9000,  category: 'Tragos', tags: ['Tropical', 'Clásico'], description: 'Tequila, zumo de naranja y granadina.' },
    { id: 'garibaldi',            name: 'GARIBALDI',                price: 9000,  category: 'Tragos', tags: ['Tropical'], description: 'Aperol y zumo de naranja.' },
    { id: 'destornillador',       name: 'DESTORNILLADOR',           price: 8000,  category: 'Tragos', tags: ['Clásico'], description: 'Vodka con zumo de naranja.' },
    { id: 'caipirinha',           name: 'CAIPIRIÑA',                price: 9000,  category: 'Tragos', tags: ['Caipira', 'Tropical'], description: 'Cachaça, lima, azúcar y hielo.' },
    { id: 'caipiroska',           name: 'CAIPIROSKA',               price: 9000,  category: 'Tragos', tags: ['Caipira', 'Tropical'], description: 'Vodka, lima, azúcar y hielo.' },
    { id: 'caipimalibu',          name: 'CAIPIMALIBU',              price: 9000,  category: 'Tragos', tags: ['Caipira', 'Tropical'], description: 'Malibú, lima, azúcar y hielo.' },
    { id: 'gin-tonic',            name: 'GIN & TONIC',              price: 10000, category: 'Tragos', tags: ['Gin', 'Clásico'], description: 'Gin, tónico, hielo y rodaja de limón.' },
    { id: 'tom-collins',          name: 'TOM COLLINS',              price: 10000, category: 'Tragos', tags: ['Gin', 'Clásico'], description: 'Gin, limón, azúcar y soda.' },
    { id: 'mojito',               name: 'MOJITO',                   price: 10000, category: 'Tragos', tags: ['Clásico', 'Tropical'], description: 'Ron, menta, lima, azúcar y soda.' },
    { id: 'cynar-julep',          name: 'CYNAR JULEP',              price: 10000, category: 'Tragos', tags: ['Julep', 'Amaro'], description: 'Cynar en julep con hielo y hierbabuena.' },
    { id: 'jager-julep',          name: 'JÄGER JULEP',              price: 10000, category: 'Tragos', tags: ['Julep'], description: 'Jägermeister en julep con hielo.' },
    { id: 'jager-boom',           name: 'JÄGER BOOM',               price: 10000, category: 'Tragos', tags: ['Energizante'], description: 'Jägermeister con bebida energizante.' },
    { id: 'negroni',              name: 'NEGRONI',                  price: 10000, category: 'Tragos', tags: ['Clásico', 'Amaro'], description: 'Gin, Campari y vermouth rojo a partes iguales.' },
    { id: 'old-fashioned',        name: 'OLD FASHIONED',            price: 10000, category: 'Tragos', tags: ['Clásico', 'Whisky'], description: 'Whisky, azúcar, Angostura y hielo.' },
    { id: 'martini-dry',          name: 'MARTINI DRY',              price: 10000, category: 'Tragos', tags: ['Clásico'], description: 'Gin y vermouth seco, con aceituna o limón.' },
    { id: 'manhattan',            name: 'MANHATTAN',                price: 10000, category: 'Tragos', tags: ['Clásico', 'Whisky'], description: 'Whisky de centeno, vermouth rojo y Angostura.' },
    { id: 'cosmopolitan',         name: 'COSMOPOLITAN',             price: 10000, category: 'Tragos', tags: ['Clásico'], description: 'Vodka, Cointreau, arándano y lima.' },
    { id: 'wisky-sour',           name: 'WISKY SOUR',               price: 10000, category: 'Tragos', tags: ['Clásico', 'Whisky'], description: 'Whisky, zumo de limón y azúcar.' },
    { id: 'ruso-blanco',          name: 'RUSO BLANCO',              price: 10000, category: 'Tragos', tags: ['Clásico', 'Café'], description: 'Vodka, licor de café y crema.' },
    { id: 'baileys-express',      name: 'BAILEYS EXPRESS',          price: 10000, category: 'Tragos', tags: ['Café'], description: 'Baileys con café expresso.' },
    { id: 'aperol-spritz',        name: 'APEROL SPRITZ',            price: 10000, category: 'Tragos', tags: ['Spritz'], description: 'Aperol, prosecco y soda.' }
  ];

  // Copia editable: el admin puede cambiar precios base, disponibilidad y agregar tragos.
  var DRINKS = [];

  function resetCatalog() {
    DRINKS.length = 0;
    DEFAULT_DRINKS.forEach(function (d) { DRINKS.push(Object.assign({}, d, { enabled: true })); });
  }

  function applyCatalog(overrides) {
    resetCatalog();
    if (!overrides) return;
    DRINKS.forEach(function (d) {
      if (overrides.basePrices && overrides.basePrices[d.id]) d.price = overrides.basePrices[d.id];
      if (overrides.disabled && overrides.disabled.indexOf(d.id) >= 0) d.enabled = false;
      if (overrides.costs && overrides.costs[d.id]) d.cost = overrides.costs[d.id];
    });
    (overrides.custom || []).forEach(function (c) {
      DRINKS.push(Object.assign({}, c, { enabled: c.enabled !== false, custom: true }));
    });
  }

  function available() {
    return DRINKS.filter(function (d) { return d.enabled !== false; });
  }

  resetCatalog();

  var CATEGORIES = ['Todos', 'Cocktails Sernova', 'Tragos'];
  var TAGS = ['Todos', 'Sernova', 'Autor', 'Julep', 'Clásico', 'Tropical', 'Vermouth', 'Caipira', 'Gin', 'Spritz', 'Fernet', 'Whisky', 'Café', 'Amaro'];

  function money(value) {
    var v = Math.round(value || 0);
    return (v < 0 ? '−$ ' : '$ ') + Math.abs(v).toLocaleString('es-AR', { maximumFractionDigits: 0 });
  }

  function moneyShort(value) {
    if (value >= 1000) return '$' + (value / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + 'k';
    return '$' + Math.round(value);
  }

  function pct(value) {
    var sign = value > 0 ? '+' : '';
    return sign + value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  }

  function clock(ts) {
    return new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function esc(text) {
    return String(text === undefined || text === null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function byId(id) {
    for (var i = 0; i < DRINKS.length; i++) if (DRINKS[i].id === id) return DRINKS[i];
    return null;
  }

  global.SernovaData = {
    DRINKS: DRINKS,
    DEFAULT_DRINKS: DEFAULT_DRINKS,
    resetCatalog: resetCatalog,
    applyCatalog: applyCatalog,
    available: available,
    CATEGORIES: CATEGORIES,
    TAGS: TAGS,
    money: money,
    moneyShort: moneyShort,
    pct: pct,
    clock: clock,
    esc: esc,
    byId: byId
  };
})(window);
