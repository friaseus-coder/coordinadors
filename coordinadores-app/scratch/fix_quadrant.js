const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'quadrant', 'js', 'quadrant.js');
let code = fs.readFileSync(filePath, 'utf8');

// Replace window.dbAPI.read and window.dbAPI.write with window.api calls
code = code.replace(/window\.dbAPI\.read\('operativa',/g, "window.api.cuadrante ? window.api.cuadrante.obtenerCuadrantes : window.api.read('operativa',");
code = code.replace(/window\.dbAPI\.saveTurnoCuadranteSeguro/g, "window.api.cuadrante.guardarTurno");
code = code.replace(/window\.dbAPI/g, "window.api");

// Add onDataChanged listener in init
const initSearch = "async init() {";
const initReplace = `async init() {
            if (window.api && window.api.onDataChanged) {
                window.api.onDataChanged((event) => {
                    if (event && (event.dbKey === 'operativa' || event.table === 'quadrant')) {
                        console.log('[CUADRANTE UI] Refresco automático por delta externo detectado');
                        this.cargarCuadrantes();
                    }
                });
            }`;

code = code.replace(initSearch, initReplace);

fs.writeFileSync(filePath, code);
console.log("quadrant.js refactorizado exitosamente.");
