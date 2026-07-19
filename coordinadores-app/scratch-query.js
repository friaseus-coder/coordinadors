const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'coordinadores-app', 'db_cache', 'operativa_rrhh.db');
const catPath = path.join(process.env.APPDATA, 'coordinadores-app', 'db_cache', 'catalogos_maestros.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`ATTACH DATABASE '${catPath.replace(/\\/g, '\\\\')}' AS catalogos`, (err) => {
        if (err) console.error("Attach error:", err);
    });
    
    const query = `
        SELECT q.*, a.nombre as agente_nombre, ap.nombre as aparcamiento_nombre 
        FROM quadrant q
        LEFT JOIN empleados a ON q.agente_id = a.id
        JOIN aparcamientos ap ON q.aparcamiento_id = ap.id
        WHERE q.fecha LIKE '2026-07-%'
    `;
    
    db.all(query, (err, rows) => {
        if (err) console.error("Query error:", err.message);
        else console.log("Returned rows count:", rows.length);
    });
});
