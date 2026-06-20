/**
 * verify_migration.js
 * 
 * Script de verificación post-migración del Modelo Multisociedad.
 * Ejecuta 10 comprobaciones contra dades.db y plantilla.db.
 * 
 * Uso: node scripts/verify_migration.js
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const ROOT = path.join(__dirname, '..');
const DADES_DB = path.join(ROOT, 'dades', 'dades.db');
const PLANTILLA_DB = path.join(ROOT, 'plantilla.db');

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

function dbAllP(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function dbGetP(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function verificarPlantilla() {
  console.log('\n=== VERIFICACIÓN DE plantilla.db ===\n');

  const db = new sqlite3.Database(PLANTILLA_DB);

  // 1. Tablas esperadas
  const tables = await dbAllP(db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const tableNames = tables.map(t => t.name);
  const tablasRequeridas = [
    'sociedades', 'aparcamientos', 'coberturas_requeridas', 'agentes',
    'contratos_agentes', 'quadrant', 'vacances', 'reglas_config',
    'historico_aparcamientos', 'deutes', 'kv_store', 'schema_version'
  ];
  const todasPresentes = tablasRequeridas.every(t => tableNames.includes(t));
  check(`1. Contiene las 12 tablas requeridas (tiene ${tableNames.length - 1} sin sqlite_sequence)`, todasPresentes);

  // 2. Trigger
  const triggers = await dbAllP(db, "SELECT name FROM sqlite_master WHERE type='trigger'");
  check(`2. Tiene el trigger log_cambios_aparcamientos`, triggers.some(t => t.name === 'log_cambios_aparcamientos'));

  // 3. Sociedad por defecto
  const sociedades = await dbAllP(db, "SELECT * FROM sociedades");
  check(`3. Tiene 1 sociedad por defecto (encontradas: ${sociedades.length})`, sociedades.length >= 1);

  // 4. Reglas semilla
  const reglas = await dbAllP(db, "SELECT * FROM reglas_config");
  check(`4. Tiene 5 reglas semilla (encontradas: ${reglas.length})`, reglas.length === 5);

  // 5. Schema version
  const version = await dbGetP(db, "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1");
  check(`5. Schema version = 2 (actual: ${version ? version.version : 'N/A'})`, version && version.version === 2);

  db.close();
}

async function verificarDadesDB() {
  console.log('\n=== VERIFICACIÓN DE dades/dades.db ===\n');

  if (!fs.existsSync(DADES_DB)) {
    console.log('  ⚠️  dades.db no encontrada. Se verificará en el próximo arranque de la app.');
    return;
  }

  const db = new sqlite3.Database(DADES_DB);

  // 6. Tabla historico_aparcamientos
  const hist = await dbAllP(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='historico_aparcamientos'");
  check(`6. Tabla historico_aparcamientos existe`, hist.length > 0);

  // 7. Trigger
  const triggers = await dbAllP(db, "SELECT name FROM sqlite_master WHERE type='trigger' AND name='log_cambios_aparcamientos'");
  check(`7. Trigger log_cambios_aparcamientos existe`, triggers.length > 0);

  // 8. Reglas completas
  const reglas = await dbAllP(db, "SELECT clave FROM reglas_config");
  const claves = reglas.map(r => r.clave);
  const tieneVacio = claves.includes('permitir_vacio_laborables');
  const tieneCruce = claves.includes('bloquear_cruce_sociedades');
  check(`8. Regla 'permitir_vacio_laborables' presente`, tieneVacio);
  check(`9. Regla 'bloquear_cruce_sociedades' presente`, tieneCruce);

  // 10. Aparcamientos
  const parkings = await dbAllP(db, "SELECT * FROM aparcamientos WHERE activo = 1");
  check(`10. Aparcamientos migrados: ${parkings.length} (esperados: ≥31)`, parkings.length >= 31);

  // Info extra
  const sinSociedad = parkings.filter(p => !p.sociedad_id);
  const sinObra = parkings.filter(p => !p.numero_obra);
  console.log(`\n  ℹ️  Parkings sin sociedad_id: ${sinSociedad.length}`);
  console.log(`  ℹ️  Parkings sin numero_obra: ${sinObra.length}`);

  // Schema version
  const version = await dbGetP(db, "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1");
  console.log(`  ℹ️  Schema version en dades.db: ${version ? version.version : 'N/A'}`);

  db.close();
}

async function main() {
  console.log('========================================');
  console.log('  VERIFICACIÓN POST-MIGRACIÓN v2');
  console.log('  Modelo Multisociedad');
  console.log('========================================');

  await verificarPlantilla();
  await verificarDadesDB();

  console.log('\n========================================');
  console.log(`  RESULTADO: ${passed} pasados, ${failed} fallidos`);
  console.log('========================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Error fatal en verificación:', err);
  process.exit(1);
});
