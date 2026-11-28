// Horario semanal base (lunes a viernes). Semana de referencia: 23-11-2026.
// fijo: true  => persona en negrita: mantiene su horario y no entra en la rotación.
// Cada semana, quienes rotan "bajan un puesto": toman el horario de la persona
// que está debajo en la lista. El último toma el horario del primero.
window.BASE_LUNES = "2026-11-30";   // planilla "HORARIO SEMANAL 30-11-26 al 04-12-26" (horarios sujetos a modificaciones)

window.SECTORES = [
  { nombre: "Caja", personas: [
    { n: "Alderete Clarisa",  h: "7 a 15" },
    { n: "Figueroa Sergio",   h: "8 a 12 · 18 a 22" },
    { n: "Maldonado Rita",    h: "9 a 17" },
    { n: "Husaczuck Enzo",    h: "16 a 00" },
    { n: "Coronel Aldana",    h: "10 a 14 · 20:30 a 00:30" },
    { n: "Torres Camila",     h: "17 a 01" },
  ]},
  { nombre: "Control / Ventas", personas: [
    { n: "Gambarte Walter",   h: "7 a 15" },
    { n: "Martinez Antonela", h: "10 a 18" },
    { n: "Agüero Ana",        h: "17 a 01" },
  ]},
  { nombre: "Ventas", personas: [
    { n: "Ferreyra Sebastian",   h: "7 a 15",  fijo: true },
    { n: "Carabajal Jimena",     h: "7 a 15" },
    { n: "Banegas Fabian",       h: "8 a 16",  fijo: true },
    { n: "Vallejos Luis",        h: "8 a 12 · 18:30 a 22:30" },
    { n: "Juan Renzo",           h: "9 a 12:30 · 19 a 23:30" },
    { n: "Mitre Florencia",      h: "14 a 22" },
    { n: "Rojas Yohana",         h: "10 a 14 · 19:30 a 23:30" },
    { n: "Silva Virginia",       h: "16 a 23" },
    { n: "Pacheco Julian",       h: "16:30 a 00:30" },
    { n: "Suarez Nahiara",       h: "10 a 13:30 · 20 a 00:30" },
    { n: "Daverio Daniela",      h: "17 a 01" },
    // No figura en la planilla del 30-11, pero sigue fijo con su horario de siempre.
    { n: "Peralta Alejandro",    h: "17 a 01", fijo: true },
    { n: "Lugones Maximiliano",  h: "23 a 07", fijo: true },
  ]},
  { nombre: "Auditoría", personas: [
    { n: "Coronel Carla",     h: "8 a 16" },
    { n: "Nediani Micaela",   h: "8 a 15" },
  ]},
  { nombre: "Recepción Medicamentos", personas: [
    { n: "Orieta Fabian",     h: "7 a 15" },
    { n: "Carrillo Jose",     h: "15 a 23" },
  ]},
  { nombre: "Recepción Perfumería", personas: [
    { n: "Camusso Carolina",  h: "8 a 16" },
    { n: "Zerda Jonathan",    h: "12 a 20" },
  ]},
  { nombre: "Repositores", personas: [
    { n: "Benol Santiago",    h: "7 a 15" },
    { n: "Charra Lisandro",   h: "8 a 12 · 18:30 a 22:30" },
    { n: "Araujo Juan Pablo", h: "14 a 22" },
  ]},
  { nombre: "Asesoras", personas: [
    { n: "Paez Karina",       h: "7 a 15" },
    { n: "Garcia Maira",      h: "9 a 12 · 17:30 a 21:30" },
    { n: "Montes Sabrina",    h: "10 a 14 · 18:30 a 22:30" },
    { n: "Gerez Gisela",      h: "15 a 23" },
  ]},
  { nombre: "Mantenimiento", personas: [
    { n: "Coronel Tamara",    h: "6 a 10 · 15 a 19" },
  ]},
  { nombre: "Solo fines de semana", personas: [
    { n: "Maguna Noelia",  h: "Sin horario semanal", fijo: true },
    { n: "Peccia Daiana",  h: "Sin horario semanal", fijo: true },
    { n: "Zerda Andrea",   h: "Sin horario semanal", fijo: true },
    { n: "Ferrero Rosa",   h: "Sin horario semanal", fijo: true },
  ]},
];

// ---------------- FINES DE SEMANA ----------------
// Los grupos A y B se alternan cada fin de semana.
// Referencia: el sábado 14-11-2026 trabajó el GRUPO B.
window.FINDE_BASE_SABADO = "2026-11-14";
window.FINDE_BASE_GRUPO = "B";

// Los horarios de finde ROTAN igual que los de la semana: cada vez que el grupo
// trabaja, dentro de cada sector cada uno toma el horario del de abajo (el último
// toma el del primero). Las filas con 1 al final (negrita) quedan fijas.
// La planilla cargada corresponde al finde de referencia ("ref") de cada grupo.

// Personas que trabajan los findes de un grupo pero no figuran en la planilla.
window.GRUPO_FIJO = { "Pacheco Julian": "B" };

window.FINDE = {
  B: {
    base: "2026-11-14", // sábado de esta planilla
    ref: "14 y 15 de noviembre",
    obs: "Juan Renzo debe estar atenta por si se necesita refuerzo en caja.",
    sab: [
      ["Cajas","Husaczuck Enzo","7 a 16"],
      ["Cajas","Alderete Clarisa","9:30 a 14 · 19:30 a 00"],
      ["Cajas","Torres Camila","13:30 a 22:30"],
      ["Cajas","Coronel Aldana","16 a 01"],
      ["Ventas / Control","Agüero Ana","7 a 16"],
      ["Ventas / Control","Gambarte Walter","16 a 01"],
      ["Ventas","Zerda Jonathan","7 a 16"],
      ["Ventas","Vallejos Luis","10 a 19"],
      ["Ventas","Maguna Noelia","9 a 13 · 18:30 a 23:30"],
      ["Ventas","Juan Renzo","10 a 14 · 19:30 a 00:30"],
      ["Ventas","Daverio Daniela","14 a 22"],
      ["Ventas","Mitre Florencia","16 a 01"],
      ["Ventas","Lugones Maximiliano","23 a 07",1],
      ["Carga Medicamentos","Carrillo Jose","8 a 13 · 18 a 22"],
      ["Perfumería","Paez Karina","8:30 a 13 · 18:30 a 23"],
      ["Perfumería","Garcia Maira","9 a 13"],
      ["Perfumería","Camusso Carolina","13 a 22"],
      ["Reposición","Benol Santiago","9 a 14"],
      ["Reposición","Charra Lisandro","16 a 21"],
      ["Mantenimiento","Coronel Tamara","6 a 11 · 15 a 19"],
    ],
    dom: [
      ["Cajas","Husaczuck Enzo","7 a 16"],
      ["Cajas","Alderete Clarisa","9:30 a 14 · 19:30 a 00"],
      ["Cajas","Torres Camila","13:30 a 22:30"],
      ["Cajas","Coronel Aldana","16 a 01"], // en la planilla dice "Coronel Clarisa"
      ["Ventas / Control","Agüero Ana","7 a 16"],
      ["Ventas / Control","Gambarte Walter","16 a 01"],
      ["Ventas","Zerda Jonathan","7 a 16"],
      ["Ventas","Vallejos Luis","10 a 19"],
      ["Ventas","Maguna Noelia","9 a 13 · 18:30 a 23:30"],
      ["Ventas","Juan Renzo","10 a 14 · 19:30 a 00:30"],
      // En la planilla del 15-11 figura Silva Virginia (Grupo A) cubriendo este puesto;
      // el titular del Grupo B es Daverio Daniela.
      ["Ventas","Daverio Daniela","14 a 22"],
      ["Ventas","Mitre Florencia","16 a 01"],
      ["Ventas","Lugones Maximiliano","23 a 07",1],
      ["Carga Medicamentos","Carrillo Jose","8:30 a 13 · 17:30 a 22"],
      ["Perfumería","Camusso Carolina","7 a 16"],
      ["Perfumería","Paez Karina","14 a 23"],
    ],
  },
  A: {
    base: "2026-11-21",
    ref: "21 y 22 de noviembre",
    obs: "Montes Sabrina y Silva Virginia estar atentas por si se necesita refuerzo en caja.",
    sab: [
      ["Cajas","Figueroa Sergio","7 a 16"],
      ["Cajas","Zerda Andrea","9:30 a 14 · 19:30 a 00"],
      ["Cajas","Maldonado Rita","13:30 a 22:30"],
      ["Cajas","Husaczuck Enzo","16 a 01"],
      ["Ventas / Control","Martinez Antonela","7 a 16"],
      ["Ventas / Control","Ferreyra Sebastian","9 a 13 · 20 a 01"],
      ["Ventas","Peccia Daiana","7 a 16"],
      ["Ventas","Carabajal Jimena","10:30 a 19:30"],
      ["Ventas","Nediani Micaela","9:30 a 12:30 · 18:30 a 23:30"],
      ["Ventas","Silva Virginia","11 a 14 · 19:30 a 00:30"],
      ["Ventas","Suarez Nahiara","14 a 23"],
      ["Ventas","Peralta Alejandro","16 a 01"],
      ["Ventas","Banegas Fabian","23 a 07",1],
      ["Carga Medicamentos","Orieta Fabian","8 a 13 · 17:30 a 21:30"],
      ["Perfumería","Montes Sabrina","8:30 a 13 · 18:30 a 23"],
      ["Perfumería","Garcia Maira","9 a 13"],
      ["Perfumería","Gerez Gisela","13 a 22"],
      ["Reposición","Charra Lisandro","8:30 a 13:30"],
      ["Reposición","Araujo Juan Pablo","11 a 20"],
      ["Reposición","Benol Santiago","16 a 21"],
      ["Mantenimiento","Coronel Tamara","6 a 11 · 16 a 20"],
      ["Mantenimiento","Ferrero Rosa","6 a 11 · 16 a 20"],
    ],
    dom: [
      ["Cajas","Figueroa Sergio","7 a 16"],
      ["Cajas","Zerda Andrea","9:30 a 14 · 19:30 a 00"],
      ["Cajas","Maldonado Rita","13:30 a 22:30"],
      ["Cajas","Husaczuck Enzo","16 a 01"],
      ["Ventas / Control","Martinez Antonela","7 a 16"],
      ["Ventas / Control","Ferreyra Sebastian","16 a 01"],
      ["Ventas","Peccia Daiana","7 a 16"],
      ["Ventas","Carabajal Jimena","10 a 19"],
      ["Ventas","Nediani Micaela","9:30 a 12:30 · 18:30 a 23:30"],
      ["Ventas","Silva Virginia","11 a 14 · 19:30 a 00:30"],
      ["Ventas","Suarez Nahiara","14 a 23"],
      ["Ventas","Peralta Alejandro","17 a 01"],
      ["Ventas","Banegas Fabian","23 a 07",1],
      ["Perfumería","Montes Sabrina","7 a 16"],
      ["Perfumería","Gerez Gisela","14 a 23"],
      ["Perfumería","Araujo Juan Pablo","9 a 13:30 · 17:30 a 22"],
      ["Carga Medicamentos","Orieta Fabian","8 a 13 · 18 a 22"],
    ],
  },
};

// Planilla de feriado conocida (Grupo B, lunes 23-11-2026).
window.FERIADO_PLANILLA = {
  B: { ref: "lunes 23-11-26", lista: [
    ["Cajas","Husaczuck Enzo","7 a 16"],
    ["Cajas","Coronel Aldana","9:30 a 14 · 19:30 a 00"],
    ["Cajas","Alderete Clarisa","13:30 a 22:30"],
    ["Cajas","Torres Camila","16 a 01"],
    ["Ventas / Control","Gambarte Walter","7 a 16"],
    ["Ventas / Control","Agüero Ana","16 a 01"],
    ["Ventas","Mitre Florencia","7 a 16"],
    ["Ventas","Daverio Daniela","10 a 19"],
    ["Ventas","Juan Renzo","9:30 a 12:30 · 18:30 a 23:30"],
    ["Ventas","Maguna Noelia","10 a 14 · 19:30 a 00:30"],
    ["Ventas","Vallejos Luis","13 a 22"],
    ["Ventas","Zerda Jonathan","17 a 01"],
    ["Ventas","Lugones Maximiliano","23 a 07",1],
    ["Carga Medicamentos","Carrillo Jose","8 a 13 · 18 a 22"],
    ["Perfumería","Camusso Carolina","7 a 16"],
    ["Perfumería","Paez Karina","14 a 23"],
  ]},
};

// ---------------- FERIADOS DE ARGENTINA ----------------
// Los feriados nacionales se calculan solos para cualquier año (Ley 27.399:
// fijos, Carnaval y Viernes Santo según Pascua, y trasladables al lunes).
// Los días no laborables con fines turísticos ("puentes") se fijan cada año por
// resolución: cargarlos acá cuando salgan. Se toman como día normal de trabajo.
window.PUENTES = {
  2026: ["2026-03-23", "2026-07-10", "2026-12-07"], // Resolución JGM 164/2025
};
// Correcciones manuales por si el Gobierno mueve algo distinto a la regla:
// FERIADOS_EXTRA: { "AAAA-MM-DD": "Nombre" }   FERIADOS_QUITAR: ["AAAA-MM-DD"]
window.FERIADOS_EXTRA = {};
window.FERIADOS_QUITAR = [];

// Regla de feriados: uno se trabaja y el siguiente se descansa (solo los de lunes a viernes).
// Referencia: el 23-11-26 trabajaron los de FERIADO_PLANILLA; el resto descansó.
// Los feriados en sábado o domingo siguen la regla del fin de semana.
window.FERIADO_BASE = "2026-11-23";
// Personas que no están en la planilla del 23-11 pero sí trabajaron ese feriado:
window.TRABAJO_FERIADO_BASE = {};
