const sqlite3 = require('sqlite3');
const path = require('path');

// Rutas a corregir (BD de red + BD de caché local)
const networkDbPath = path.join(
    'C:\\Users\\Usuario\\Documents\\Javier Frias\\Antigravity\\coordinadors\\coordinadores-app\\db',
    'catalogos_maestros.db'
);
const localDbPath = path.join(process.env.APPDATA, 'coordinadores-app', 'db_cache', 'catalogos_maestros.db');

function fixDb(dbPath, label) {
    return new Promise((resolve) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
            if (err) {
                console.log(`[${label}] No encontrada o error: ${err.message}`);
                resolve();
                return;
            }

            console.log(`[${label}] Abriendo: ${dbPath}`);

            db.serialize(() => {
                // Verificar si es una vista
                db.get("SELECT type FROM sqlite_master WHERE name='empleados'", [], (err, row) => {
                    if (err) {
                        console.error(`[${label}] Error consultando tipo:`, err.message);
                        db.close(); resolve(); return;
                    }

                    if (!row) {
                        console.log(`[${label}] No existe 'empleados'. Creando tabla...`);
                    } else if (row.type === 'view') {
                        console.log(`[${label}] 'empleados' es una VISTA. Migrando...`);
                        db.run('DROP VIEW IF EXISTS empleados', (e) => {
                            if (e) console.error(`[${label}] Error DROP VIEW:`, e.message);
                            else console.log(`[${label}] ✅ Vista eliminada.`);
                        });
                    } else if (row.type === 'table') {
                        console.log(`[${label}] 'empleados' ya es una tabla correcta. Sin cambios.`);
                        db.close(); resolve(); return;
                    }

                    // Crear tabla si no existe (también tras DROP VIEW)
                    db.run(`CREATE TABLE IF NOT EXISTS empleados (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        nombre TEXT NOT NULL,
                        email TEXT,
                        rol TEXT NOT NULL DEFAULT 'Trabajador',
                        activo INTEGER DEFAULT 1,
                        json_preferencias TEXT
                    )`, (e) => {
                        if (e) console.error(`[${label}] Error CREATE TABLE:`, e.message);
                        else console.log(`[${label}] ✅ Tabla empleados creada/verificada.`);

                        db.close(() => {
                            console.log(`[${label}] BD cerrada.`);
                            resolve();
                        });
                    });
                });
            });
        });
    });
}

async function main() {
    await fixDb(networkDbPath, 'BD RED');
    await fixDb(localDbPath, 'BD CACHÉ');
    console.log('\n✅ Migración completada en ambas BDs.');
}

main().catch(console.error);
