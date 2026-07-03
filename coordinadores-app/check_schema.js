const sqlite3 = require('sqlite3');
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'catalogos_maestros.db'));

db.all("SELECT type, name, sql FROM sqlite_master WHERE name='empleados'", [], (err, rows) => {
    if (err) {
        console.error('Error:', err.message);
    } else {
        console.log('Resultado:');
        console.log(JSON.stringify(rows, null, 2));
    }
    db.close();
});
