// Catálogo de demostración ÚNICO: lo usa el modo demo (navegador) y el
// generador de supabase/seed.sql (scripts/gen-seed.mts). IDs deterministas.
// Sin imports con alias: este archivo también se ejecuta con Node directamente.
import type { Categoria, Insumo, Modificador, Producto, RecetaItem, Sector, Usuario } from "../types";

export const BAR_ID = "00000000-0000-4000-8000-00000000b001";
export const BAR_SLUG = "bar-central";

const id = (prefix: string, n: number) => `00000000-0000-4000-8000-${prefix}${String(n).padStart(12 - prefix.length, "0")}`;

export const CATEGORIAS: Categoria[] = [
  { id: id("ca", 1), nombre: "Tragos", orden: 1, estacion: "barra" },
  { id: id("ca", 2), nombre: "Cervezas", orden: 2, estacion: "barra" },
  { id: id("ca", 3), nombre: "Platos", orden: 3, estacion: "cocina" },
  { id: id("ca", 4), nombre: "Para compartir", orden: 4, estacion: "cocina" },
  { id: id("ca", 5), nombre: "Postres", orden: 5, estacion: "cocina" },
  { id: id("ca", 6), nombre: "Sin alcohol", orden: 6, estacion: "barra" },
];
const [TRAGOS, CERVEZAS, PLATOS, COMPARTIR, POSTRES, SIN_ALCOHOL] = CATEGORIAS.map((c) => c.id);

const r50 = (n: number) => Math.round(n / 50) * 50;

type P = [n: number, cat: string, nombre: string, desc: string, icono: string, base: number, objetivo: number, tObj: number, destacado?: boolean, cotiza?: boolean];
const P_RAW: P[] = [
  [1, TRAGOS, "Mojito", "Ron blanco, lima, menta fresca, azúcar y soda", "mojito", 3800, 2, 4, true],
  [2, TRAGOS, "Gin Tonic", "Gin London Dry, tónica, pepino y hielo", "gintonic", 4400, 2, 3, true],
  [3, TRAGOS, "Negroni", "Gin, Campari, vermut rojo y naranja", "negroni", 5200, 1, 3, true],
  [4, TRAGOS, "Aperol Spritz", "Aperol, prosecco, soda y naranja", "aperol", 4900, 1, 3],
  [5, TRAGOS, "Fernet con Coca", "Fernet 60 ml, Coca-Cola y hielo", "fernet", 3300, 2, 2],
  [6, TRAGOS, "Cuba Libre", "Ron, Coca-Cola y lima", "cuba", 3500, 1, 2],
  [7, CERVEZAS, "Cerveza IPA", "Pinta 500 ml, tirada a 4 °C", "beer", 3400, 2, 2],
  [8, CERVEZAS, "Cerveza Rubia", "Pinta 500 ml", "beerlight", 2900, 2, 2],
  [9, PLATOS, "Hamburguesa clásica", "Carne 180 g, cheddar, lechuga y tomate", "burger", 7900, 2, 14, true],
  [10, PLATOS, "Pizza Napolitana", "Mozzarella, tomate, ajo y albahaca", "pizza", 6500, 1, 16],
  [11, PLATOS, "Milanesa napolitana", "Ternera, jamón, mozzarella y salsa", "milanesa", 8200, 1, 18],
  [12, COMPARTIR, "Papas cheddar", "Papas fritas, cheddar y verdeo", "fries", 5200, 2, 9],
  [13, COMPARTIR, "Ensalada César", "Pollo grillado, parmesano y croutones", "salad", 5400, 1, 8],
  [14, COMPARTIR, "Provoleta", "Provolone a la parrilla con orégano", "provoleta", 4600, 1, 10],
  [15, POSTRES, "Volcán de chocolate", "Con helado de vainilla", "dessert", 3900, 1, 8],
  [16, SIN_ALCOHOL, "Limonada", "Limón, menta y jengibre", "lemonade", 2200, 1, 3],
  [17, SIN_ALCOHOL, "Agua mineral", "500 ml", "water", 1500, 1, 1, false, false],
];

export const PRODUCTOS: Producto[] = P_RAW.map(([n, cat, nombre, descripcion, icono, base, objetivo, tObj, destacado, cotiza]) => {
  const estacion = CATEGORIAS.find((c) => c.id === cat)!.estacion;
  return {
    id: id("ab", n),
    categoria_id: cat,
    nombre,
    descripcion,
    icono,
    estacion,
    precio_base: base,
    precio_minimo: cotiza === false ? base : r50(base * 0.75),
    precio_maximo: cotiza === false ? base : r50(base * 1.4),
    precio_actual: base,
    precio_anterior: null,
    variacion_porcentaje: 0,
    es_cotizable_bolsa: cotiza !== false,
    objetivo_ventana: objetivo,
    tiempo_objetivo_min: tObj,
    destacado: !!destacado,
    activo: true,
  };
});
export const prodId = (n: number) => id("ab", n);

type I = [n: number, nombre: string, rubro: string, unidad: string, stock: number, minimo: number, costo: number, proveedor: string];
const I_RAW: I[] = [
  [1, "Ron blanco", "Bebidas", "ml", 5200, 2000, 12, "Distribuidora Norte"],
  [2, "Lima", "Verdulería", "u", 60, 30, 180, "Verdulería Sol"],
  [3, "Menta fresca", "Verdulería", "g", 120, 500, 5, "Verdulería Sol"],
  [4, "Azúcar", "Almacén", "g", 6000, 1000, 0.8, "Mayorista Centro"],
  [5, "Soda", "Bebidas", "ml", 24000, 6000, 0.35, "Distribuidora Norte"],
  [6, "Gin London Dry", "Bebidas", "ml", 750, 2250, 14, "Distribuidora Norte"],
  [7, "Agua tónica", "Bebidas", "ml", 30000, 9000, 1.6, "Distribuidora Norte"],
  [8, "Pepino", "Verdulería", "g", 2000, 500, 3, "Verdulería Sol"],
  [9, "Campari", "Bebidas", "ml", 2100, 1000, 13, "Distribuidora Norte"],
  [10, "Vermut rojo", "Bebidas", "ml", 2800, 1000, 9, "Distribuidora Norte"],
  [11, "Naranja", "Verdulería", "u", 40, 20, 250, "Verdulería Sol"],
  [12, "Aperol", "Bebidas", "ml", 3000, 1500, 12, "Distribuidora Norte"],
  [13, "Prosecco", "Bebidas", "ml", 6000, 2250, 8, "Distribuidora Norte"],
  [14, "Fernet", "Bebidas", "ml", 3000, 2250, 10, "Distribuidora Norte"],
  [15, "Coca-Cola", "Bebidas", "ml", 36000, 9000, 1.5, "Distribuidora Norte"],
  [16, "Cerveza IPA (barril)", "Bebidas", "ml", 60000, 20000, 3.2, "Cervecería Andina"],
  [17, "Cerveza rubia (barril)", "Bebidas", "ml", 80000, 20000, 2.4, "Cervecería Andina"],
  [18, "Pan de hamburguesa", "Panadería", "u", 70, 30, 350, "Panadería Don Luis"],
  [19, "Carne picada", "Carnes", "g", 8500, 6000, 9, "Frigorífico Sur"],
  [20, "Cheddar", "Lácteos", "g", 3500, 1500, 12, "Lácteos del Valle"],
  [21, "Lechuga", "Verdulería", "g", 3000, 1000, 4, "Verdulería Sol"],
  [22, "Tomate", "Verdulería", "g", 5000, 1500, 3, "Verdulería Sol"],
  [23, "Masa de pizza", "Panadería", "u", 30, 12, 600, "Panadería Don Luis"],
  [24, "Mozzarella", "Lácteos", "g", 5200, 4000, 10, "Lácteos del Valle"],
  [25, "Papa", "Verdulería", "g", 22000, 15000, 1.6, "Verdulería Sol"],
  [26, "Pollo", "Carnes", "g", 6000, 3000, 8, "Frigorífico Sur"],
  [27, "Parmesano", "Lácteos", "g", 1500, 500, 20, "Lácteos del Valle"],
  [28, "Carne para milanesa", "Carnes", "g", 7000, 4000, 10, "Frigorífico Sur"],
  [29, "Provolone", "Lácteos", "g", 3000, 1500, 12, "Lácteos del Valle"],
  [30, "Chocolate", "Almacén", "g", 2500, 1000, 9, "Mayorista Centro"],
  [31, "Limón", "Verdulería", "u", 12, 40, 200, "Verdulería Sol"],
  [32, "Agua mineral 500", "Bebidas", "u", 96, 48, 600, "Distribuidora Norte"],
  [33, "Hielo", "Bebidas", "g", 60000, 20000, 0.1, "Hielo Polar"],
];
export const INSUMOS: Insumo[] = I_RAW.map(([n, nombre, rubro, unidad, stock, minimo, costo, proveedor]) => ({
  id: id("1e", n), nombre, rubro, unidad, stock_actual: stock, stock_minimo: minimo, costo_unitario: costo, proveedor,
}));
const ins = (n: number) => id("1e", n);

const R: [prod: number, insumo: number, cant: number][] = [
  [1, 1, 50], [1, 2, 0.5], [1, 3, 8], [1, 4, 10], [1, 5, 100], [1, 33, 150],
  [2, 6, 50], [2, 7, 150], [2, 8, 10], [2, 33, 150],
  [3, 6, 30], [3, 9, 30], [3, 10, 30], [3, 11, 0.25], [3, 33, 100],
  [4, 12, 60], [4, 13, 90], [4, 5, 30], [4, 11, 0.25], [4, 33, 100],
  [5, 14, 60], [5, 15, 140], [5, 33, 120],
  [6, 1, 50], [6, 15, 150], [6, 2, 0.25], [6, 33, 120],
  [7, 16, 500], [8, 17, 500],
  [9, 18, 1], [9, 19, 180], [9, 20, 30], [9, 21, 15], [9, 22, 30],
  [10, 23, 1], [10, 24, 180], [10, 22, 60],
  [11, 28, 220], [11, 24, 80], [11, 22, 40], [11, 25, 200],
  [12, 25, 300], [12, 20, 60],
  [13, 21, 120], [13, 26, 120], [13, 27, 20],
  [14, 29, 180],
  [15, 30, 80],
  [16, 31, 1], [16, 3, 4], [16, 4, 15], [16, 33, 100],
  [17, 32, 1],
];
export const RECETAS: RecetaItem[] = R.map(([p, i, cantidad]) => ({ producto_id: prodId(p), insumo_id: ins(i), cantidad }));

export const MODIFICADORES: Modificador[] = [
  ...["Jugosa", "A punto", "Bien cocida"].map((nombre, i) => ({ id: id("ad", 1 + i), producto_id: prodId(9), categoria_id: null, grupo: "Punto de cocción", nombre, precio_extra: 0, exclusivo: true })),
  { id: id("ad", 4), producto_id: prodId(9), categoria_id: null, grupo: "Extras", nombre: "Extra cheddar", precio_extra: 600, exclusivo: false },
  { id: id("ad", 5), producto_id: prodId(9), categoria_id: null, grupo: "Extras", nombre: "Huevo frito", precio_extra: 500, exclusivo: false },
  { id: id("ad", 6), producto_id: prodId(9), categoria_id: null, grupo: "Sin", nombre: "Sin cebolla", precio_extra: 0, exclusivo: false },
  { id: id("ad", 7), producto_id: null, categoria_id: PLATOS, grupo: "Sin", nombre: "Sin sal", precio_extra: 0, exclusivo: false },
  { id: id("ad", 8), producto_id: prodId(10), categoria_id: null, grupo: "Extras", nombre: "Extra mozzarella", precio_extra: 700, exclusivo: false },
  { id: id("ad", 9), producto_id: prodId(10), categoria_id: null, grupo: "Sin", nombre: "Sin orégano", precio_extra: 0, exclusivo: false },
  { id: id("ad", 10), producto_id: null, categoria_id: TRAGOS, grupo: "Hielo", nombre: "Sin hielo", precio_extra: 0, exclusivo: false },
  { id: id("ad", 11), producto_id: null, categoria_id: TRAGOS, grupo: "Hielo", nombre: "Poco hielo", precio_extra: 0, exclusivo: false },
  { id: id("ad", 12), producto_id: null, categoria_id: TRAGOS, grupo: "Extras", nombre: "Doble medida", precio_extra: 1500, exclusivo: false },
  { id: id("ad", 13), producto_id: prodId(13), categoria_id: null, grupo: "Sin", nombre: "Sin croutones", precio_extra: 0, exclusivo: false },
  { id: id("ad", 14), producto_id: prodId(11), categoria_id: null, grupo: "Cocción", nombre: "A la plancha", precio_extra: 0, exclusivo: false },
];

export const SECTORES: Sector[] = [
  { id: id("5e", 1), nombre: "Salón", orden: 1 },
  { id: id("5e", 2), nombre: "Barra", orden: 2 },
  { id: id("5e", 3), nombre: "Terraza", orden: 3 },
];

// [numero, sector, capacidad]
export const MESAS_RAW: [number, number, number][] = [
  [1, 1, 2], [2, 1, 4], [3, 1, 2], [4, 1, 4], [5, 1, 2], [6, 1, 6], [7, 1, 4], [8, 1, 2], [9, 1, 2], [10, 1, 8],
  [11, 2, 2], [12, 2, 2], [13, 2, 2], [14, 2, 4],
  [15, 3, 4], [16, 3, 4], [17, 3, 6], [18, 3, 2],
];
export const mesaId = (n: number) => id("ae", n);

export const USUARIOS: Usuario[] = [
  { id: id("ee", 1), bar_id: BAR_ID, nombre: "Valeria Ruiz", rol: "jefe", pin: "1111", activo: true },
  { id: id("ee", 2), bar_id: BAR_ID, nombre: "Martín Gómez", rol: "caja", pin: "2222", activo: true },
  { id: id("ee", 3), bar_id: BAR_ID, nombre: "Lucía Romero", rol: "mozo", pin: "3333", activo: true },
  { id: id("ee", 4), bar_id: BAR_ID, nombre: "Diego Paz", rol: "mozo", pin: "3434", activo: true },
  { id: id("ee", 5), bar_id: BAR_ID, nombre: "Hernán Sosa", rol: "cocina", pin: "4444", activo: true },
  { id: id("ee", 6), bar_id: BAR_ID, nombre: "Carla Benítez", rol: "bartender", pin: "5555", activo: true },
  { id: id("ee", 7), bar_id: BAR_ID, nombre: "Sofía Medina", rol: "cm", pin: "6666", activo: true },
  { id: id("ee", 8), bar_id: BAR_ID, nombre: "Iván Pereyra", rol: "cadete", pin: "7777", activo: true },
  { id: id("ee", 9), bar_id: BAR_ID, nombre: "Sofía Martín", rol: "cadete", pin: "7878", activo: true },
  { id: id("ee", 10), bar_id: BAR_ID, nombre: "Pantalla salón", rol: "pantalla_tv", pin: "0000", activo: true },
  { id: id("ee", 11), bar_id: null, nombre: "Dev Nexoresto", rol: "super_admin", pin: "9999", activo: true },
];
