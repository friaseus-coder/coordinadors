/**
 * run_migration_v2.js
 * 
 * Ejecuta la migración v1→v2 directamente sobre dades/dades.db
 * sin necesidad de lanzar la app Electron completa.
 * 
 * Uso: node scripts/run_migration_v2.js
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const ROOT = path.join(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT, 'schema.sql');
const DADES_DB = path.join(ROOT, 'dades', 'dades.db');
const JSON_PATH = path.join(ROOT, 'dades', 'aparcamientos.json');

console.log('=== Migración v1 → v2 sobre dades.db ===\n');

if (!fs.existsSync(DADES_DB)) {
  console.error('ERROR: dades/dades.db no encontrada.');
  process.exit(1);
}

const db = new sqlite3.Database(DADES_DB);
const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');

db.serialize(() => {
  // 1. Habilitar FK
  db.run('PRAGMA foreign_keys = ON;');

  // 2. Aplicar schema canónico (CREATE IF NOT EXISTS = idempotente)
  db.exec(schemaSql, (err) => {
    if (err) {
      console.error('ERROR al aplicar schema.sql:', err.message);
      process.exit(1);
    }
    console.log('[1/5] Schema canónico aplicado (tablas + trigger).');

    db.get('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1', [], (err2, row) => {
      const currentVersion = (row && row.version) || 0;
      console.log(`[INFO] Versión actual del esquema: ${currentVersion}`);

      if (currentVersion >= 2) {
        console.log('[INFO] Ya está en v2 o superior. Verificando reglas faltantes...');
        insertarReglasFaltantes(() => {
          migrarParkingsDesdeJSON(() => {
            db.run(`INSERT OR REPLACE INTO schema_version (version, updated_at) VALUES (2, datetime('now', 'localtime'))`, () => {
              console.log('\n=== Migración/verificación completada ===');
              db.close();
            });
          });
        });
        return;
      }

      // Migración completa v1 → v2
      db.run('BEGIN TRANSACTION;');

      // A. Sociedad por defecto
      db.run(`INSERT OR IGNORE INTO sociedades (id, nombre_fiscal, codigo_corto, activo) VALUES (1, 'Sociedad General', 'SG', 1)`, () => {
        console.log('[2/5] Sociedad por defecto asegurada.');
      });

      // B. Migrar parkings
      migrarParkingsDesdeJSON(() => {
        // C. Insertar reglas
        insertarReglasFaltantes(() => {
          // D. Actualizar versión
          db.run(`INSERT OR REPLACE INTO schema_version (version, updated_at) VALUES (2, datetime('now', 'localtime'))`);

          db.run('COMMIT;', (err3) => {
            if (err3) {
              console.error('ERROR en COMMIT:', err3.message);
              db.run('ROLLBACK;');
              process.exit(1);
            }
            console.log('[5/5] ✅ Migración v1 → v2 completada exitosamente.');
            db.close();
          });
        });
      });
    });
  });
});

function migrarParkingsDesdeJSON(callback) {
  if (!fs.existsSync(JSON_PATH)) {
    console.log('[3/5] aparcamientos.json no encontrado. Saltando migración de parkings.');
    callback();
    return;
  }

  try {
    const raw = fs.readFileSync(JSON_PATH, 'utf8');
    const data = JSON.parse(raw);
    const parkings = data.aparcamientos || [];

    const stmt = db.prepare(`
      INSERT INTO aparcamientos (numero_obra, nombre, zona, es_remotizado, tipo_gestion, permitir_vacio_laborables, sociedad_id, coordinador_responsable, activo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(numero_obra) DO UPDATE SET
        nombre = excluded.nombre,
        coordinador_responsable = excluded.coordinador_responsable
    `);

    parkings.forEach((p, idx) => {
      const numObra = p.numero_obra || `OB-${1000 + idx}`;
      const nombreUpper = p.nombre.toUpperCase();
      const esRemoto = p.es_remotizado ? 1 : 0;
      const gestion = p.tipo_gestion || 'propio';
      const vacioLab = p.permitir_vacio_laborables ? 1 : 0;
      const sociedad = p.sociedad_id || 1;

      let responsable = 'Ambos';
      if (p.coordinadorId === 'albert') responsable = 'Albert';
      else if (p.coordinadorId === 'laura') responsable = 'Laura';

      stmt.run(numObra, nombreUpper, p.zona || '', esRemoto, gestion, vacioLab, sociedad, responsable);
    });

    stmt.finalize(() => {
      console.log(`[3/5] ${parkings.length} aparcamientos migrados/sincronizados desde JSON.`);
      callback();
    });
  } catch (e) {
    console.error('[3/5] Error leyendo aparcamientos.json:', e.message);
    callback();
  }
}

function insertarReglasFaltantes(callback) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO reglas_config (clave, value, tipo, categoria, descripcion)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run('max_horas_semanales', '40', 'numero', 'agentes',
    'Límite máximo de horas que un agente propio puede trabajar a la semana.');
  stmt.run('max_dias_mensuales', '22', 'numero', 'agentes',
    'Tope de días de trabajo que un agente estándar puede tener asignados en el mes.');
  stmt.run('permitir_vacio_laborables', '0', 'booleano', 'aparcamientos',
    'Permitir dejar un aparcamiento presencial obligatorio vacío durante 24h de lunes a viernes (0 = Alerta, 1 = Permitido).');
  stmt.run('bloquear_cruce_sociedades', '0', 'booleano', 'aparcamientos',
    'Controlar traslados de agentes a parkings que pertenezcan a sociedades ajenas a su contrato (0 = Aviso, 1 = Bloquear).');
  stmt.run('min_horas_descanso_entre_turnos', '12', 'numero', 'agentes',
    'Horas de descanso mínimo obligatorio requeridas entre la hora de fin de un turno y la hora de inicio del siguiente.');

  stmt.finalize(() => {
    console.log('[4/5] 5 reglas de negocio verificadas/insertadas.');
    callback();
  });
}
