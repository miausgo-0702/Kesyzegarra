// Copia el cálculo de horarios de la app (web/logic.js y web/data.js) para que el servidor
// use exactamente las mismas reglas. Se ejecuta antes de cada despliegue.
const fs = require("fs"), path = require("path");
fs.mkdirSync(path.join(__dirname, "compartido"), { recursive: true });
for (const f of ["logic.js", "data.js"])
  fs.copyFileSync(path.join(__dirname, "../../web", f), path.join(__dirname, "compartido", f));
console.log("logic.js y data.js copiados");
