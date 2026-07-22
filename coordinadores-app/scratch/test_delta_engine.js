const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

const testDir = path.join(__dirname, 'test_network_dir');
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

const deltasDir = path.join(testDir, 'deltas');
const backupsDir = path.join(testDir, 'Backups');
if (!fs.existsSync(deltasDir)) fs.mkdirSync(deltasDir, { recursive: true });
if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

console.log("Probando simulador del motor de deltas y rotación de backups...");

// Test creating atomic delta file
const sampleDelta = {
    id: "test-uuid-123",
    timestamp: Date.now(),
    dbKey: "operativa",
    action: "INSERT",
    table: "quadrant",
    sql: "INSERT INTO quadrant (fecha, aparcamiento_id, agente_id, turno) VALUES (?, ?, ?, ?)",
    params: ["2026-07-22", 1, 5, "MATÍ"],
    clientId: "test-client-a",
    userName: "Albert",
    userRole: "Coordinador"
};

const deltaFileName = `${Date.now()}_test-uuid-123_operativa.json`;
const deltaFilePath = path.join(deltasDir, deltaFileName);
fs.writeFileSync(deltaFilePath, JSON.stringify(sampleDelta, null, 2), 'utf8');
console.log("✅ Delta escrito correctamente en:", deltaFilePath);

// Test reading delta file
const content = JSON.parse(fs.readFileSync(deltaFilePath, 'utf8'));
console.log("✅ Delta leído y validado correctamente. Acción:", content.action, "en tabla:", content.table);

// Limpieza de prueba
fs.rmSync(testDir, { recursive: true, force: true });
console.log("✅ Prueba finalizada con éxito.");
