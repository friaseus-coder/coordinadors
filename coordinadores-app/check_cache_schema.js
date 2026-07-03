const sqlite3 = require('sqlite3');
const path = require('path');

const localDir = path.join(process.env.APPDATA, 'coordinadores-app', 'db_cache');
const dbPath = path.join(localDir, 'catalogos_maestros.db');

console.log('Ruta BD:', dbPath);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error('ERROR abriendo BD:', err.message);
        return;
    }
    db.all('SELECT type, name, sql FROM sqlite_master ORDER BY type, name', [], (e, r) => {
        if (e) { console.error('Query error:', e.message); }
        else { console.log(JSON.stringify(r, null, 2)); }
        db.close();
    });
});
