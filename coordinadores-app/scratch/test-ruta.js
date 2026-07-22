const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ruta local del perfil de usuario de Electron
const dbPath = path.join(process.env.APPDATA, 'coordinadores-app', 'db_cache', 'finanzas_inventario.db');

console.log("Conectando a base de datos de pruebas:", dbPath);
if (!fs.existsSync(dbPath)) {
    console.error("Base de datos no encontrada en esta ruta.");
    process.exit(1);
}

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Insertar una ruta comercial de prueba para hoy
    const fechaTest = new Date().toISOString().split('T')[0];
    const conceptoTest = "Ruta de Prueba Inspección " + Math.floor(Math.random() * 1000);
    const paradasTest = JSON.stringify({ paradas: ["OFICINA", "ARAGÓ 182", "ARIBAU 225"] });
    
    console.log(`Insertando ruta comercial de prueba: "${conceptoTest}" con fecha ${fechaTest}`);
    
    db.run(
        "INSERT INTO movimientos_economicos (id_usuario, fecha, tipo_movimiento, concepto, importe, json_detalles) VALUES (?, ?, 'Ruta Comercial', ?, 0, ?)",
        ['Albert', fechaTest, conceptoTest, paradasTest],
        function(err) {
            if (err) {
                console.error("Error al insertar ruta:", err.message);
                process.exit(1);
            }
            console.log(`Ruta insertada con éxito. ID: ${this.lastID}`);
            
            // Listar las últimas 5 rutas comerciales para verificar
            db.all(
                "SELECT * FROM movimientos_economicos WHERE tipo_movimiento = 'Ruta Comercial' ORDER BY id DESC LIMIT 5",
                [],
                (err, rows) => {
                    if (err) {
                        console.error("Error al listar rutas:", err.message);
                        process.exit(1);
                    }
                    console.log("\n--- ÚLTIMAS RUTAS REGISTRADAS ---");
                    rows.forEach(r => {
                        console.log(`ID: ${r.id} | Fecha: ${r.fecha} | Concepto: ${r.concepto} | Detalles: ${r.json_detalles}`);
                    });
                    db.close();
                }
            );
        }
    );
});
