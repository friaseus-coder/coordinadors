const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const basePath = path.join(__dirname, '..');

const shards = [
  { sql: 'schema_operativa.sql', db: 'operativa_rrhh.db' },
  { sql: 'schema_finanzas.sql', db: 'finanzas_inventario.db' },
  { sql: 'schema_comercial.sql', db: 'comercial.db' },
  { sql: 'schema_catalogos.sql', db: 'catalogos_maestros.db' }
];

async function initDb(shard) {
  const sqlPath = path.join(basePath, shard.sql);
  const dbPath = path.join(basePath, shard.db);

  console.log(`Inicializando ${shard.db} usando ${shard.sql}...`);

  if (!fs.existsSync(sqlPath)) {
    throw new Error(`Esquema no encontrado: ${sqlPath}`);
  }

  // Eliminar el archivo db si ya existe para crearlo limpio
  if (fs.existsSync(dbPath)) {
    console.log(`Eliminando base de datos antigua existente en ${dbPath}`);
    fs.unlinkSync(dbPath);
  }

  const sqlContent = fs.readFileSync(sqlPath, 'utf8');

  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        return reject(err);
      }
    });

    db.serialize(() => {
      // Activar foreign keys
      db.run("PRAGMA foreign_keys = ON;");

      // sqlite3 exec ejecuta múltiples sentencias SQL
      db.exec(sqlContent, (err) => {
        db.close();
        if (err) {
          console.error(`Error al ejecutar el esquema en ${shard.db}:`, err);
          return reject(err);
        }
        console.log(`¡Base de datos ${shard.db} creada e inicializada con éxito!`);
        resolve();
      });
    });
  });
}

async function main() {
  try {
    for (const shard of shards) {
      await initDb(shard);
    }
    console.log("Inicialización de todas las bases de datos completada.");
  } catch (error) {
    console.error("Error en la inicialización:", error);
    process.exit(1);
  }
}

main();
