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
];
