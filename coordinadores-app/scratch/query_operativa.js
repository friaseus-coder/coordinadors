const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'coordinadores-app', 'db_cache', 'operativa_rrhh.db');
const db = new sqlite3.Database(dbPath);
db.all("SELECT sql FROM sqlite_master WHERE name='quadrant'", [], (err, rows) => {
    console.log(rows);
    db.close();
});
