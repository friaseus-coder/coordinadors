const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'maestros', 'maestros.js');
let code = fs.readFileSync(filePath, 'utf8');

code = code.replace(/window\.dbAPI\.read\('catalogos',\s*`?SELECT \* FROM empleados`?,?\s*\[\]\)/g, "window.api.maestros.obtenerEmpleados()");
code = code.replace(/window\.dbAPI\.read\('catalogos',\s*SELECT \* FROM empleados ORDER BY nombre ASC,\s*\[\]\)/gi, "window.api.maestros.obtenerEmpleados()");
code = code.replace(/window\.dbAPI\.read\('catalogos',/g, "window.api.read('catalogos',");
code = code.replace(/window\.dbAPI\.read\('operativa',/g, "window.api.read('operativa',");
code = code.replace(/window\.dbAPI\.read/g, "window.api.read");
code = code.replace(/window\.dbAPI\.write/g, "window.api.write");
code = code.replace(/window\.dbAPI/g, "window.api");

fs.writeFileSync(filePath, code);
console.log("maestros.js refactorizado exitosamente.");
