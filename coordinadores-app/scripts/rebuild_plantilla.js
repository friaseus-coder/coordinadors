/**
 * rebuild_plantilla.js
 * 
 * Script para regenerar plantilla.db desde schema.sql canónico.
 * Uso: node scripts/rebuild_plantilla.js
 * 
 * Crea una plantilla.db limpia con:
 *   - Esquema relacional completo (13 tablas + 1 trigger)
 *   - 1 sociedad por defecto ("Sociedad General")
 *   - 5 reglas de negocio semilla
 *   - schema_version = 2
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const ROOT = path.join(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT, 'schema.sql');
const PLANTILLA_PATH = path.join(ROOT, 'plantilla.db');

console.log('=== Rebuild plantilla.db ===\n');

// 1. Eliminar la plantilla vieja si existe
if (fs.existsSync(PLANTILLA_PATH)) {
  fs.unlinkSync(PLANTILLA_PATH);
  console.log('[1/4] plantilla.db anterior eliminada.');
} else {
  console.log('[1/4] No existía plantilla.db previa.');
}

// 2. Leer el schema canónico
const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
console.log('[2/4] schema.sql leído correctamente.');

// 3. Crear la nueva plantilla.db y aplicar el esquema
const db = new sqlite3.Database(PLANTILLA_PATH, (err) => {
  if (err) {
    console.error('ERROR FATAL: No se pudo crear plantilla.db:', err.message);
    process.exit(1);
  }

  db.serialize(() => {
    // Habilitar foreign keys
    db.run('PRAGMA foreign_keys = ON;');

    // Aplicar el esquema completo
    db.exec(schemaSql, (errSchema) => {
      if (errSchema) {
        console.error('ERROR al aplicar schema.sql:', errSchema.message);
        process.exit(1);
      }
      console.log('[3/4] Esquema relacional aplicado correctamente.');

      // 4. Insertar datos semilla
      db.serialize(() => {
        db.run('BEGIN TRANSACTION;');

        // Sociedad por defecto
        db.run(`
          INSERT INTO sociedades (id, nombre_fiscal, codigo_corto, activo)
          VALUES (1, 'Sociedad General', 'SG', 1)
        `);

        // Reglas de negocio semilla (5 reglas)
        const stmtRegla = db.prepare(`
          INSERT OR IGNORE INTO reglas_config (clave, value, tipo, categoria, descripcion)
          VALUES (?, ?, ?, ?, ?)
        `);

        stmtRegla.run('max_horas_semanales', '40', 'numero', 'agentes',
          'Límite máximo de horas que un agente propio puede trabajar a la semana.');
        stmtRegla.run('max_dias_mensuales', '22', 'numero', 'agentes',
          'Tope de días de trabajo que un agente estándar puede tener asignados en el mes.');
        stmtRegla.run('permitir_vacio_laborables', '0', 'booleano', 'aparcamientos',
          'Permitir dejar un aparcamiento presencial obligatorio vacío durante 24h de lunes a viernes (0 = Alerta, 1 = Permitido).');
        stmtRegla.run('bloquear_cruce_sociedades', '0', 'booleano', 'aparcamientos',
          'Controlar traslados de agentes a parkings que pertenezcan a sociedades ajenas a su contrato (0 = Aviso, 1 = Bloquear).');
        stmtRegla.run('min_horas_descanso_entre_turnos', '12', 'numero', 'agentes',
          'Horas de descanso mínimo obligatorio requeridas entre la hora de fin de un turno y la hora de inicio del siguiente.');

        stmtRegla.finalize();

        // Schema version = 2
        db.run(`INSERT OR REPLACE INTO schema_version (version, updated_at) VALUES (2, datetime('now', 'localtime'))`);

        db.run('COMMIT;', (errCommit) => {
          if (errCommit) {
            console.error('ERROR al hacer commit de datos semilla:', errCommit.message);
            process.exit(1);
          }
          console.log('[4/4] Datos semilla insertados (1 sociedad, 5 reglas, version=2).');

          // Verificación final
          db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", [], (e, tables) => {
            console.log(`\n✅ plantilla.db regenerada con ${tables.length} tablas:`);
            tables.forEach(t => console.log(`   - ${t.name}`));

            db.all("SELECT name FROM sqlite_master WHERE type='trigger'", [], (e2, triggers) => {
              console.log(`\n✅ ${triggers.length} trigger(s):`);
              triggers.forEach(t => console.log(`   - ${t.name}`));

              db.close(() => {
                console.log('\n=== Rebuild completado exitosamente ===');
              });
            });
          });
        });
      });
    });
  });
});
