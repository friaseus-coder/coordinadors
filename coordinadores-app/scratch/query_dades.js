const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'coordinadores-app', 'db_cache', 'dades.db');
const db = new sqlite3.Database(dbPath);
db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
    console.log(rows);
    db.close();
});
