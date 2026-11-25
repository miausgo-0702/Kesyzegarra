// Horario semanal base (lunes a viernes). Semana de referencia: 23-11-2026.
// fijo: true  => persona en negrita: mantiene su horario y no entra en la rotación.
// Cada semana, quienes rotan "bajan un puesto": toman el horario de la persona
// que está debajo en la lista. El último toma el horario del primero.
window.BASE_LUNES = "2026-11-23";

window.SECTORES = [
  { nombre: "Caja", personas: [
    { n: "Figueroa Sergio",   h: "7 a 15" },
    { n: "Maldonado Rita",    h: "7:30 a 12 · 17:30 a 21" },
    { n: "Husaczuck Enzo",    h: "9 a 17" },
    { n: "Coronel Aldana",    h: "15:30 a 23:30" },
    { n: "Torres Camila",     h: "10 a 14 · 20 a 00" },
    { n: "Alderete Clarisa",  h: "16:30 a 00:30" },
  ]},
  { nombre: "Control / Ventas", personas: [
    { n: "Martinez Antonela", h: "7 a 15" },
    { n: "Agüero Ana",        h: "10 a 18" },
    { n: "Gambarte Walter",   h: "17 a 01" },
  ]},
  { nombre: "Ventas", personas: [
    { n: "Ferreyra Sebastian",   h: "7 a 15",  fijo: true },
    { n: "Lugones Maximiliano",  h: "7 a 15",  fijo: true },
    { n: "Vallejos Luis",        h: "7:30 a 15:30" },
    { n: "Juan Renzo",           h: "8 a 12 · 17:30 a 21:30" },
    { n: "Mitre Florencia",      h: "9 a 12:30 · 18 a 22:30" },
    { n: "Rojas Yohana",         h: "12 a 20" },
    { n: "Silva Virginia",       h: "11 a 14 · 19:30 a 23:30" },
    { n: "Pacheco Julian",       h: "15:30 a 23:30" },
    { n: "Suarez Nahiara",       h: "16 a 00" },
    { n: "Daverio Daniela",      h: "10 a 13:30 · 19:30 a 00" },
    { n: "Carabajal Jimena",     h: "16:30 a 00:30" },
    { n: "Peralta Alejandro",    h: "17 a 01", fijo: true },
    { n: "Banegas Fabian",       h: "23 a 07", fijo: true },
  ]},
  { nombre: "Auditoría Obras Sociales", personas: [
    { n: "Coronel Carla",     h: "8 a 16" },
    { n: "Nediani Micaela",   h: "8 a 15" },
  ]},
  { nombre: "Recepción Medicamentos", personas: [
    { n: "Carrillo Jose",     h: "7 a 15" },
    { n: "Orieta Fabian",     h: "15 a 23" },
  ]},
  { nombre: "Recepción Perfumería", personas: [
    { n: "Zerda Jonathan",    h: "8 a 16" },
    { n: "Camusso Carolina",  h: "12 a 20" },
  ]},
  { nombre: "Repositores", personas: [
    { n: "Charra Lisandro",   h: "7 a 15" },
    { n: "Benol Santiago",    h: "8 a 12 · 18:30 a 22:30" },
    { n: "Araujo Juan Pablo", h: "14 a 22" },
  ]},
  { nombre: "Asesoras", personas: [
    { n: "Montes Sabrina",    h: "7 a 15" },
    { n: "Garcia Maira",      h: "9 a 13 · 18 a 21" },
    { n: "Gerez Gisela",      h: "9:30 a 13:30 · 18:30 a 22:30" },
    { n: "Paez Karina",       h: "15 a 23" },
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

// Personas que trabajan los findes de un grupo pero no figuran en la planilla.
window.GRUPO_FIJO = { "Pacheco Julian": "B" };

window.FINDE = {
  B: {
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
      ["Ventas","Lugones Maximiliano","23 a 07"],
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
      ["Ventas","Silva Virginia","14 a 22"],
      ["Ventas","Mitre Florencia","16 a 01"],
      ["Ventas","Lugones Maximiliano","23 a 07"],
      ["Carga Medicamentos","Carrillo Jose","8:30 a 13 · 17:30 a 22"],
      ["Perfumería","Camusso Carolina","7 a 16"],
      ["Perfumería","Paez Karina","14 a 23"],
    ],
  },
  A: {
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
      ["Ventas","Banegas Fabian","23 a 07"],
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
      ["Ventas","Banegas Fabian","23 a 07"],
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
    ["Ventas","Lugones Maximiliano","23 a 07"],
    ["Carga Medicamentos","Carrillo Jose","8 a 13 · 18 a 22"],
    ["Perfumería","Camusso Carolina","7 a 16"],
    ["Perfumería","Paez Karina","14 a 23"],
  ]},
};

// ---------------- FERIADOS DE ARGENTINA ----------------
// Regla: los feriados de lunes a viernes se alternan: uno se trabaja y el siguiente se descansa.
// Referencia: el 23-11-26 trabajaron los de FERIADO_PLANILLA; el resto descansó.
// tipo "puente" = día no laborable con fines turísticos: se toma como día normal
// y no cuenta en la alternancia. Los feriados en sábado o domingo siguen el finde.
window.FERIADO_BASE = "2026-11-23";
// Personas que no están en la planilla del 23-11 pero sí trabajaron ese feriado:
window.TRABAJO_FERIADO_BASE = {};
window.FERIADOS = {
  "2026-01-01": ["Año Nuevo"],
  "2026-02-16": ["Carnaval"],
  "2026-02-17": ["Carnaval"],
  "2026-03-23": ["Día no laborable (puente)", "puente"],
  "2026-03-24": ["Día de la Memoria"],
  "2026-04-02": ["Día de Malvinas"],
  "2026-04-03": ["Viernes Santo"],
  "2026-05-01": ["Día del Trabajador"],
  "2026-05-25": ["Revolución de Mayo"],
  "2026-06-15": ["Paso a la Inmortalidad de Güemes"],
  "2026-06-20": ["Día de la Bandera"],
  "2026-07-09": ["Día de la Independencia"],
  "2026-07-10": ["Día no laborable (puente)", "puente"],
  "2026-08-17": ["Paso a la Inmortalidad de San Martín"],
  "2026-10-12": ["Día de la Diversidad Cultural"],
  "2026-11-23": ["Día de la Soberanía Nacional"],
  "2026-12-07": ["Día no laborable (puente)", "puente"],
  "2026-12-08": ["Inmaculada Concepción de María"],
  "2026-12-25": ["Navidad"],
  "2027-01-01": ["Año Nuevo"],
  "2027-02-08": ["Carnaval"],
  "2027-02-09": ["Carnaval"],
  "2027-03-24": ["Día de la Memoria"],
  "2027-03-26": ["Viernes Santo"],
  "2027-04-02": ["Día de Malvinas"],
  "2027-05-01": ["Día del Trabajador"],
  "2027-05-25": ["Revolución de Mayo"],
  "2027-06-20": ["Día de la Bandera"],
  "2027-06-21": ["Paso a la Inmortalidad de Güemes"],
  "2027-07-09": ["Día de la Independencia"],
  "2027-08-16": ["Paso a la Inmortalidad de San Martín"],
  "2027-10-11": ["Día de la Diversidad Cultural"],
  "2027-11-22": ["Día de la Soberanía Nacional"],
  "2027-12-08": ["Inmaculada Concepción de María"],
  "2027-12-25": ["Navidad"],
};
