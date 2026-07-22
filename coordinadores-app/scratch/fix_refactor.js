const fs = require('fs');
const path = require('path');

const mainJsPath = path.join(__dirname, '..', 'main.js');
let lines = fs.readFileSync(mainJsPath, 'utf8').split('\n');

const startIdx = lines.findIndex(l => l.includes('async function syncAllToLocal()'));
const endIdx = lines.findIndex(l => l.includes("ipcMain.handle('validate-network-path'"));

console.log("Encontrado syncAllToLocal en línea:", startIdx + 1);
console.log("Encontrado validate-network-path en línea:", endIdx + 1);

if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
  const replacementLines = `
// ==========================================
// MOTOR DE DELTAS EN SMB & PERSISTENCIA LOCAL
// ==========================================

function asegurarColumnaVersion(dbConn, tableName) {
  dbConn.all("PRAGMA table_info(" + tableName + ")", [], (err, columns) => {
    if (err || !columns) return;
    const hasVersion = columns.some(c => c.name === 'version');
    if (!hasVersion) {
      dbConn.run("ALTER TABLE " + tableName + " ADD COLUMN version INTEGER DEFAULT 1", (alterErr) => {
        if (!alterErr) console.log("[DB SCHEMA] Columna 'version' añadida a " + tableName + ".");
      });
    }
  });
}

function obtenerConexionLocal(dbKey) {
  if (localConnections[dbKey]) {
    return localConnections[dbKey];
  }

  const dbFile = DBS[dbKey];
  if (!dbFile) {
    throw new Error("Clave de base de datos no válida: " + dbKey);
  }

  const localDbPath = path.join(localDir, dbFile);
  const dbConn = new sqlite3.Database(localDbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);

  dbConn.run("PRAGMA foreign_keys = ON;");
  dbConn.run("CREATE TABLE IF NOT EXISTS _applied_deltas (id TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");

  if (dbKey !== 'catalogos') {
    const catalogosPath = path.join(localDir, DBS.catalogos).replace(/\\\\/g, '/');
    dbConn.run("ATTACH DATABASE '" + catalogosPath + "' AS catalogos;", (err) => {
      if (err) console.error("[DB LOCAL] Error al adjuntar catalogos en " + dbKey + ":", err.message);
    });
  }

  if (dbKey === 'comercial') {
    dbConn.run(\`
      CREATE TABLE IF NOT EXISTS comerciales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        direccion TEXT,
        plantas TEXT,
        capacidad TEXT,
        plazas_libres TEXT,
        tarifa TEXT,
        notas TEXT,
        version INTEGER DEFAULT 1
      )
    \`);
    asegurarColumnaVersion(dbConn, 'comerciales');
  }

  if (dbKey === 'operativa') {
    asegurarColumnaVersion(dbConn, 'quadrant');
  }

  if (dbKey === 'finanzas') {
    asegurarColumnaVersion(dbConn, 'inventario_existencias');
  }

  if (dbKey === 'catalogos') {
    asegurarColumnaVersion(dbConn, 'empleados');
  }

  localConnections[dbKey] = dbConn;
  return dbConn;
}

// MOTOR DE DELTAS EN SMB (/deltas/)
async function applyLocalAndWriteDelta(dbKey, action, table, sql, params, expectedVersion = null) {
  const localDb = obtenerConexionLocal(dbKey);

  // 1. Control de concurrencia optimista (OCC) para UPDATEs
  if (action === 'UPDATE' && expectedVersion !== null && expectedVersion !== undefined) {
    const occMatch = sql.match(/WHERE\\s+id\\s*=\\s*\\?/i);
    if (occMatch) {
      const idVal = params[params.length - (sql.includes('version =') ? 2 : 1)];
      const current = await new Promise((res, rej) => {
        localDb.get("SELECT version FROM " + table + " WHERE id = ?", [idVal], (err, r) => err ? rej(err) : res(r));
      });
      if (!current) {
        return { success: false, code: 'OCC_CONFLICT', message: 'Registro no encontrado.' };
      }
      if (current.version !== undefined && current.version !== expectedVersion) {
        return { success: false, code: 'OCC_CONFLICT', message: 'El registro fue modificado por otro usuario.' };
      }
    }
  }

  // Ejecutar cambio en SQLite local
  const result = await new Promise((resolve, reject) => {
    localDb.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

  if (action === 'UPDATE' && expectedVersion !== null && result.changes === 0) {
    return { success: false, code: 'OCC_CONFLICT', message: 'El registro no fue modificado (versión desactualizada).' };
  }

  // 2. Generar archivo JSON de delta único en SMB
  const deltaId = crypto.randomUUID();
  const timestamp = Date.now();
  const deltaObj = {
    id: deltaId,
    timestamp,
    dbKey,
    action,
    table,
    sql,
    params,
    clientId: CLIENT_ID,
    userName: currentSession.user,
    userRole: currentSession.role
  };

  // Registrar localmente en _applied_deltas
  await new Promise((res) => {
    localDb.run("INSERT OR IGNORE INTO _applied_deltas (id) VALUES (?)", [deltaId], () => res());
  });

  // Escribir JSON en NETWORK_DIR/deltas/
  if (NETWORK_DIR) {
    const deltasDir = path.join(NETWORK_DIR, 'deltas');
    if (!fs.existsSync(deltasDir)) {
      try { fs.mkdirSync(deltasDir, { recursive: true }); } catch (e) {}
    }
    const deltaFileName = \`\${timestamp}_\${deltaId}_\${dbKey}.json\`;
    const deltaFilePath = path.join(deltasDir, deltaFileName);
    try {
      fs.writeFileSync(deltaFilePath, JSON.stringify(deltaObj, null, 2), 'utf8');
    } catch (err) {
      console.error("[DELTA ENGINE ERROR] Fallo al escribir delta JSON en SMB:", err.message);
    }
  }

  // Broadcast IPC local
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:delta-applied', deltaObj);
    mainWindow.webContents.send('app:data-changed', { dbKey, table, action });
  }

  return { success: true, lastID: result.lastID, changes: result.changes };
}

// Vigilancia y replicación de deltas en red
const processedDeltas = new Set();

async function processNetworkDeltas() {
  if (!NETWORK_DIR) return;
  const deltasDir = path.join(NETWORK_DIR, 'deltas');
  if (!fs.existsSync(deltasDir)) return;

  try {
    const files = fs.readdirSync(deltasDir).filter(f => f.endsWith('.json')).sort();
    for (const file of files) {
      if (processedDeltas.has(file)) continue;

      const filePath = path.join(deltasDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const delta = JSON.parse(content);

        processedDeltas.add(file);

        if (delta.clientId === CLIENT_ID) continue; // Delta generado por esta terminal

        const localDb = obtenerConexionLocal(delta.dbKey);

        const alreadyApplied = await new Promise((res) => {
          localDb.get("SELECT id FROM _applied_deltas WHERE id = ?", [delta.id], (err, r) => res(!!r));
        });

        if (alreadyApplied) continue;

        // Aplicar sentencia SQL en SQLite local
        await new Promise((res) => {
          localDb.run(delta.sql, delta.params, (err) => {
            if (err) console.error("[DELTA APPLY ERROR] Error aplicando delta " + file + ":", err.message);
            res();
          });
        });

        await new Promise((res) => {
          localDb.run("INSERT OR IGNORE INTO _applied_deltas (id) VALUES (?)", [delta.id], () => res());
        });

        console.log("[DELTA ENGINE] Delta replicado desde red: " + file + " (" + delta.action + " en " + delta.table + ")");

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('app:delta-applied', delta);
          mainWindow.webContents.send('app:data-changed', { dbKey: delta.dbKey, table: delta.table, action: delta.action });
        }
      } catch (e) {
        console.error("[DELTA ENGINE] Error leyendo delta " + file + ":", e.message);
      }
    }
  } catch (err) {
    console.error("[DELTA ENGINE] Error procesando carpeta deltas:", err.message);
  }
}

function startDeltaWatcher() {
  if (!NETWORK_DIR) return;
  const deltasDir = path.join(NETWORK_DIR, 'deltas');
  if (!fs.existsSync(deltasDir)) {
    try { fs.mkdirSync(deltasDir, { recursive: true }); } catch (e) {}
  }

  processNetworkDeltas();

  try {
    fs.watch(deltasDir, (eventType, filename) => {
      if (filename && filename.endsWith('.json')) {
        processNetworkDeltas();
      }
    });
  } catch (e) {}

  setInterval(processNetworkDeltas, 1500);
}

// BACKUP DIARIO CON ROTACIÓN DE 7 DÍAS Y PURGA DE DELTAS (>14 DÍAS)
function realizarBackupDiarioYRotacion() {
  if (!NETWORK_DIR) return;
  const backupsDir = path.join(NETWORK_DIR, 'Backups');
  if (!fs.existsSync(backupsDir)) {
    try { fs.mkdirSync(backupsDir, { recursive: true }); } catch(e){}
  }

  const todayStr = new Date().toISOString().split('T')[0];

  for (const [key, dbFile] of Object.entries(DBS)) {
    const localDbPath = path.join(localDir, dbFile);
    const backupDest = path.join(backupsDir, "daily_" + todayStr + "_" + dbFile);
    try {
      if (fs.existsSync(localDbPath)) {
        fs.copyFileSync(localDbPath, backupDest);
        console.log("[BACKUP DIARIO] Copia local respaldada en red: " + backupDest);
      }
    } catch (e) {
      console.error("[BACKUP ERROR] Error creando copia diaria de " + dbFile + ":", e.message);
    }
  }

  // Rotación: eliminar backups mayores a 7 días
  try {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const files = fs.readdirSync(backupsDir);
    for (const file of files) {
      const filePath = path.join(backupsDir, file);
      const stat = fs.statSync(filePath);
      if (stat.isFile() && stat.mtimeMs < sevenDaysAgo) {
        fs.unlinkSync(filePath);
        console.log("[BACKUP ROTATION] Backup antiguo eliminado: " + file);
      }
    }
  } catch (e) {
    console.error("[BACKUP ROTATION ERROR]", e.message);
  }

  // Purga: eliminar deltas mayores a 14 días
  try {
    const deltasDir = path.join(NETWORK_DIR, 'deltas');
    if (fs.existsSync(deltasDir)) {
      const fourteenDaysAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
      const deltaFiles = fs.readdirSync(deltasDir);
      for (const file of deltaFiles) {
        const filePath = path.join(deltasDir, file);
        const stat = fs.statSync(filePath);
        if (stat.isFile() && stat.mtimeMs < fourteenDaysAgo) {
          fs.unlinkSync(filePath);
          console.log("[DELTA PURGE] Delta antiguo purgado: " + file);
        }
      }
    }
  } catch (e) {
    console.error("[DELTA PURGE ERROR]", e.message);
  }
}

`.split('\n');

  lines.splice(startIdx, endIdx - startIdx, ...replacementLines);
  fs.writeFileSync(mainJsPath, lines.join('\n'));
  console.log("Sección syncAllToLocal y safeWriteCombined reemplazada correctamente!");
} else {
  console.error("No se pudieron encontrar las líneas de corte.");
}
