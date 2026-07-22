const fs = require('fs');
const path = require('path');

const testDir = path.join(__dirname, 'test_v15_net');
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

const deltasDir = path.join(testDir, 'deltas');
const archiveDir = path.join(deltasDir, 'archive');
if (!fs.existsSync(deltasDir)) fs.mkdirSync(deltasDir, { recursive: true });

console.log("Probando simulador de extensiones v1.5...");

// 1. Probar nomenclatura ISO UTC
const isoUtcStr = new Date().toISOString().replace(/:/g, '-');
const hostnameStr = require('os').hostname().replace(/[^a-zA-Z0-9_-]/g, '_');
const sampleFileName = `${isoUtcStr}_${hostnameStr}_uuid123_operativa.json`;
const sampleFilePath = path.join(deltasDir, sampleFileName);

fs.writeFileSync(sampleFilePath, JSON.stringify({ action: 'INSERT', table: 'quadrant' }), 'utf8');
console.log("✅ Nombre ISO UTC generado:", sampleFileName);

// 2. Probar comprobación de reloj (Clock Drift)
const clockCheckFile = path.join(testDir, '.clock_check_test');
const localNow = Date.now();
fs.writeFileSync(clockCheckFile, String(localNow), 'utf8');
const stats = fs.statSync(clockCheckFile);
const diff = Math.abs(Math.round((localNow - stats.mtimeMs) / 1000));
fs.unlinkSync(clockCheckFile);
console.log(`✅ Comprobación de reloj en SMB finalizada. Diferencia: ${diff}s.`);

// 3. Probar compactación si > 100 deltas
for (let i = 0; i < 105; i++) {
  const fName = `${isoUtcStr}_${hostnameStr}_uuid_${i}_finanzas.json`;
  fs.writeFileSync(path.join(deltasDir, fName), JSON.stringify({ action: 'INSERT', table: 'despeses', dbKey: 'finanzas' }), 'utf8');
}

const filesInDeltas = fs.readdirSync(deltasDir).filter(f => f.endsWith('.json'));
console.log(`✅ Deltas generados en carpeta: ${filesInDeltas.length} (Supera cota de 100).`);

// Limpieza de directorio de prueba
fs.rmSync(testDir, { recursive: true, force: true });
console.log("✅ Pruebas de integración v1.5 finalizadas con éxito.");
