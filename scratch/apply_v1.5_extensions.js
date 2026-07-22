const fs = require('fs');
const path = require('path');

const mainPath = path.join(__dirname, '..', 'coordinadores-app', 'main.js');
let code = fs.readFileSync(mainPath, 'utf8');

console.log("Aplicando extensiones de la versión 1.5 en main.js...");

// 1. Modificar applyLocalAndWriteDelta para usar formato ISO UTC y hostname
code = code.replace(
  `const deltaFileName = \`\${timestamp}_\${deltaId}_\${dbKey}.json\`;`,
  `const isoUtcStr = new Date().toISOString().replace(/:/g, '-');
    const hostnameStr = require('os').hostname().replace(/[^a-zA-Z0-9_-]/g, '_');
    const deltaFileName = \`\${isoUtcStr}_\${hostnameStr}_\${deltaId}_\${dbKey}.json\`;`
);

// 2. Insertar comprobarDesvioRelojSMB y compactarDeltasEnRedSiEsNecesario
const compactingCode = `
// ==========================================
// DESVÍO DE RELOJ Y COMPACTACIÓN DE DELTAS (SMB)
// ==========================================

const MAX_DELTAS_THRESHOLD = 100;
let isCompacting = false;

function comprobarDesvioRelojSMB() {
  if (!NETWORK_DIR || !fs.existsSync(NETWORK_DIR)) return;
  try {
    const clockCheckPath = path.join(NETWORK_DIR, \`.clock_check_\${CLIENT_ID}\`);
    const nowLocal = Date.now();
    fs.writeFileSync(clockCheckPath, String(nowLocal), 'utf8');
    const stats = fs.statSync(clockCheckPath);
    const smbMtime = stats.mtimeMs;
    try { fs.unlinkSync(clockCheckPath); } catch (e) {}

    const diffSeconds = Math.abs(Math.round((nowLocal - smbMtime) / 1000));
    console.log(\`[CLOCK CHECK] Hora local vs mtime SMB: diferencia de \${diffSeconds}s.\`);

    if (diffSeconds > 60) {
      console.warn(\`[CLOCK DRIFT ALERTA] El reloj de esta estación de trabajo está desajustado \${diffSeconds}s respecto al servidor SMB.\`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('app:clock-drift-warning', { diffSeconds });
      }
    }
  } catch (err) {
    console.error("[CLOCK CHECK ERROR] Error al verificar reloj en SMB:", err.message);
  }
}

async function compactarDeltasEnRedSiEsNecesario(force = false) {
  if (!NETWORK_DIR || isCompacting) return;
  const deltasDir = path.join(NETWORK_DIR, 'deltas');
  if (!fs.existsSync(deltasDir)) return;

  const lockPath = path.join(NETWORK_DIR, '_compaction.lock');

  if (fs.existsSync(lockPath)) {
    try {
      const lockStat = fs.statSync(lockPath);
      if (Date.now() - lockStat.mtimeMs > 600000) {
        console.warn("[COMPACTION] Candado _compaction.lock caducado (>10m), eliminando...");
        fs.rmSync(lockPath, { recursive: true, force: true });
      } else {
        console.log("[COMPACTION] Candado _compaction.lock activo en red. Pausando 2 segundos...");
        await new Promise(r => setTimeout(r, 2000));
        return;
      }
    } catch (e) {}
  }

  let files = [];
  try {
    files = fs.readdirSync(deltasDir).filter(f => f.endsWith('.json')).sort();
  } catch (e) { return; }

  if (!force && files.length < MAX_DELTAS_THRESHOLD) {
    return;
  }

  console.log(\`[COMPACTION] Iniciando compactación de deltas (\${files.length} archivos detectados, cota: \${MAX_DELTAS_THRESHOLD})...\`);
  isCompacting = true;

  try {
    fs.mkdirSync(lockPath);
  } catch (e) {
    console.log("[COMPACTION] No se pudo adquirir _compaction.lock (otra terminal lo adquirió).");
    isCompacting = false;
    return;
  }

  try {
    const archiveDir = path.join(deltasDir, 'archive');
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }

    const now = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    const netDbConns = {};
    for (const [key, dbFile] of Object.entries(DBS)) {
      const netDbPath = path.join(NETWORK_DIR, dbFile);
      if (fs.existsSync(netDbPath)) {
        netDbConns[key] = new sqlite3.Database(netDbPath);
      }
    }

    for (const file of files) {
      const filePath = path.join(deltasDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const delta = JSON.parse(content);

        const netDb = netDbConns[delta.dbKey];
        if (netDb && delta.sql) {
          await new Promise((res) => {
            netDb.run(delta.sql, delta.params || [], (err) => {
              if (err) console.error(\`[COMPACTION ERROR] Error aplicando delta \${file} en máster \${delta.dbKey}:\`, err.message);
              res();
            });
          });
        }

        const stat = fs.statSync(filePath);
        if ((now - stat.mtimeMs) > SEVEN_DAYS_MS) {
          const destPath = path.join(archiveDir, file);
          try {
            fs.renameSync(filePath, destPath);
          } catch (e) {
            try { fs.unlinkSync(filePath); } catch (e2) {}
          }
        }
      } catch (e) {
        console.error(\`[COMPACTION] Error procesando archivo delta \${file}:\`, e.message);
      }
    }

    for (const conn of Object.values(netDbConns)) {
      try { conn.close(); } catch(e){}
    }

    console.log("[COMPACTION] Compactación finalizada con éxito.");

  } catch (err) {
    console.error("[COMPACTION ERROR] Error en proceso de compactación:", err.message);
  } finally {
    try { fs.rmSync(lockPath, { recursive: true, force: true }); } catch (e) {}
    isCompacting = false;
  }
}
`;

// Insertar compactingCode antes de processNetworkDeltas
const processDeltasPos = code.indexOf('async function processNetworkDeltas()');
if (processDeltasPos !== -1) {
  code = code.substring(0, processDeltasPos) + compactingCode + '\n\n' + code.substring(processDeltasPos);
}

// 3. Modificar processNetworkDeltas para pausar ante _compaction.lock
const processNetworkDeltasOld = `async function processNetworkDeltas() {
  if (!NETWORK_DIR) return;
  const deltasDir = path.join(NETWORK_DIR, 'deltas');
  if (!fs.existsSync(deltasDir)) return;`;

const processNetworkDeltasNew = `async function processNetworkDeltas() {
  if (!NETWORK_DIR) return;
  const deltasDir = path.join(NETWORK_DIR, 'deltas');
  if (!fs.existsSync(deltasDir)) return;

  const compactionLockPath = path.join(NETWORK_DIR, '_compaction.lock');
  if (fs.existsSync(compactionLockPath)) {
    console.log("[DELTA ENGINE] Compactación detectada en red (_compaction.lock). Pausando procesador 2s...");
    await new Promise(r => setTimeout(r, 2000));
    return;
  }`;

code = code.replace(processNetworkDeltasOld, processNetworkDeltasNew);

// 4. Invocar comprobarDesvioRelojSMB y compactarDeltasEnRedSiEsNecesario en conectarBaseDatosUnica
const conectarOld = `  startDeltaWatcher();
  realizarBackupDiarioYRotacion();`;

const conectarNew = `  comprobarDesvioRelojSMB();
  compactarDeltasEnRedSiEsNecesario();
  startDeltaWatcher();
  realizarBackupDiarioYRotacion();`;

code = code.replace(conectarOld, conectarNew);

// 5. Inyectar asegurarColumnaVersion para todas las tablas secundarias
const asegurarVersionOld = `  if (dbKey === 'operativa') {
    asegurarColumnaVersion(dbConn, 'quadrant');
  }

  if (dbKey === 'finanzas') {
    asegurarColumnaVersion(dbConn, 'inventario_existencias');
  }

  if (dbKey === 'catalogos') {
    asegurarColumnaVersion(dbConn, 'empleados');
  }`;

const asegurarVersionNew = `  if (dbKey === 'operativa') {
    asegurarColumnaVersion(dbConn, 'quadrant');
    asegurarColumnaVersion(dbConn, 'incidencias_horarias');
  }

  if (dbKey === 'finanzas') {
    asegurarColumnaVersion(dbConn, 'inventario_existencias');
    asegurarColumnaVersion(dbConn, 'movimientos_economicos');
    asegurarColumnaVersion(dbConn, 'despeses');
    asegurarColumnaVersion(dbConn, 'deutes');
  }

  if (dbKey === 'comercial') {
    asegurarColumnaVersion(dbConn, 'comerciales');
  }

  if (dbKey === 'catalogos') {
    asegurarColumnaVersion(dbConn, 'empleados');
  }`;

code = code.replace(asegurarVersionOld, asegurarVersionNew);

// 6. Actualizar handlers IPC de despeses, deutes e incidencias con OCC expectedVersion
const despesesGuardarOld = `ipcMain.handle('app:despeses:guardar', async (event, d) => {
  return await applyLocalAndWriteDelta('finanzas', 'INSERT', 'despeses', "INSERT INTO despeses (fecha, comercial, concepto, importe, estado, coordinador) VALUES (?, ?, ?, ?, ?, ?)", [d.fecha, d.comercial, d.concepto, d.importe, d.estado, d.coordinador]);
});`;

const despesesGuardarNew = `ipcMain.handle('app:despeses:guardar', async (event, d) => {
  return await applyLocalAndWriteDelta('finanzas', 'INSERT', 'despeses', "INSERT INTO despeses (fecha, comercial, concepto, importe, estado, coordinador, version) VALUES (?, ?, ?, ?, ?, ?, 1)", [d.fecha, d.comercial, d.concepto, d.importe, d.estado, d.coordinador]);
});

ipcMain.handle('app:despeses:actualizar', async (event, { datos, expectedVersion }) => {
  const sql = "UPDATE despeses SET fecha = ?, comercial = ?, concepto = ?, importe = ?, estado = ?, coordinador = ?, version = version + 1 WHERE id = ? AND version = ?";
  const params = [datos.fecha, datos.comercial, datos.concepto, datos.importe, datos.estado, datos.coordinador, datos.id, expectedVersion];
  return await applyLocalAndWriteDelta('finanzas', 'UPDATE', 'despeses', sql, params, expectedVersion);
});`;

code = code.replace(despesesGuardarOld, despesesGuardarNew);

const deutesGuardarOld = `ipcMain.handle('app:deutes:guardar', async (event, d) => {
  return await applyLocalAndWriteDelta('finanzas', 'INSERT', 'deutes', "INSERT INTO deutes (comercial, cliente, import, fecha) VALUES (?, ?, ?, ?)", [d.comercial, d.cliente, d.import, d.fecha]);
});`;

const deutesGuardarNew = `ipcMain.handle('app:deutes:guardar', async (event, d) => {
  return await applyLocalAndWriteDelta('finanzas', 'INSERT', 'deutes', "INSERT INTO deutes (comercial, cliente, import, fecha, version) VALUES (?, ?, ?, ?, 1)", [d.comercial, d.cliente, d.import, d.fecha]);
});

ipcMain.handle('app:deutes:actualizar', async (event, { datos, expectedVersion }) => {
  const sql = "UPDATE deutes SET comercial = ?, cliente = ?, import = ?, fecha = ?, version = version + 1 WHERE id = ? AND version = ?";
  const params = [datos.comercial, datos.cliente, datos.import, datos.fecha, datos.id, expectedVersion];
  return await applyLocalAndWriteDelta('finanzas', 'UPDATE', 'deutes', sql, params, expectedVersion);
});`;

code = code.replace(deutesGuardarOld, deutesGuardarNew);

const incidenciasGuardarOld = `ipcMain.handle('app:incidencias:guardar', async (event, datos) => {
  verifyRole(['admin', 'coordinador', 'jefe operaciones']);
  const sql = \`
    INSERT INTO incidencias_horarias (id_trabajador, fecha_inicio, fecha_fin, tipo_incidencia, impacto_horas, coordinador, estado, comentarios)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  \`;
  const params = [datos.id_trabajador, datos.fecha_inicio, datos.fecha_fin || null, datos.tipo_incidencia, datos.impacto_horas || 0, datos.coordinador, datos.estado, datos.comentarios];
  return await applyLocalAndWriteDelta('operativa', 'INSERT', 'incidencias_horarias', sql, params);
});`;

const incidenciasGuardarNew = `ipcMain.handle('app:incidencias:guardar', async (event, datos) => {
  verifyRole(['admin', 'coordinador', 'jefe operaciones']);
  const sql = \`
    INSERT INTO incidencias_horarias (id_trabajador, fecha_inicio, fecha_fin, tipo_incidencia, impacto_horas, coordinador, estado, comentarios, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  \`;
  const params = [datos.id_trabajador, datos.fecha_inicio, datos.fecha_fin || null, datos.tipo_incidencia, datos.impacto_horas || 0, datos.coordinador, datos.estado, datos.comentarios];
  return await applyLocalAndWriteDelta('operativa', 'INSERT', 'incidencias_horarias', sql, params);
});

ipcMain.handle('app:incidencias:actualizar', async (event, { datos, expectedVersion }) => {
  verifyRole(['admin', 'coordinador', 'jefe operaciones']);
  const sql = \`
    UPDATE incidencias_horarias
    SET id_trabajador = ?, fecha_inicio = ?, fecha_fin = ?, tipo_incidencia = ?, impacto_horas = ?, coordinador = ?, estado = ?, comentarios = ?, version = version + 1
    WHERE id = ? AND version = ?
  \`;
  const params = [datos.id_trabajador, datos.fecha_inicio, datos.fecha_fin || null, datos.tipo_incidencia, datos.impacto_horas || 0, datos.coordinador, datos.estado, datos.comentarios, datos.id, expectedVersion];
  return await applyLocalAndWriteDelta('operativa', 'UPDATE', 'incidencias_horarias', sql, params, expectedVersion);
});`;

code = code.replace(incidenciasGuardarOld, incidenciasGuardarNew);

fs.writeFileSync(mainPath, code);
console.log("main.js actualizado con las extensiones v1.5 con éxito!");

// 7. Actualizar preload.js para exponer onClockDriftWarning y endpoints de actualización
const preloadPath = path.join(__dirname, '..', 'coordinadores-app', 'preload.js');
let preloadCode = fs.readFileSync(preloadPath, 'utf8');

if (!preloadCode.includes('onClockDriftWarning')) {
  preloadCode = preloadCode.replace(
    `onDeltaApplied: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('app:delta-applied', handler);
    return () => ipcRenderer.removeListener('app:delta-applied', handler);
  },`,
    `onDeltaApplied: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('app:delta-applied', handler);
    return () => ipcRenderer.removeListener('app:delta-applied', handler);
  },
  onClockDriftWarning: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('app:clock-drift-warning', handler);
    return () => ipcRenderer.removeListener('app:clock-drift-warning', handler);
  },`
  );
}

if (!preloadCode.includes('actualizar: (datos, expectedVersion) => ipcRenderer.invoke(\'app:despeses:actualizar\'')) {
  preloadCode = preloadCode.replace(
    `despeses: {
    obtener: () => ipcRenderer.invoke('app:despeses:obtener'),
    guardar: (datos) => ipcRenderer.invoke('app:despeses:guardar', datos),
    eliminar: (id) => ipcRenderer.invoke('app:despeses:eliminar', { id })
  },`,
    `despeses: {
    obtener: () => ipcRenderer.invoke('app:despeses:obtener'),
    guardar: (datos) => ipcRenderer.invoke('app:despeses:guardar', datos),
    actualizar: (datos, expectedVersion) => ipcRenderer.invoke('app:despeses:actualizar', { datos, expectedVersion }),
    eliminar: (id) => ipcRenderer.invoke('app:despeses:eliminar', { id })
  },`
  );
}

if (!preloadCode.includes('actualizar: (datos, expectedVersion) => ipcRenderer.invoke(\'app:deutes:actualizar\'')) {
  preloadCode = preloadCode.replace(
    `deutes: {
    obtener: () => ipcRenderer.invoke('app:deutes:obtener'),
    guardar: (datos) => ipcRenderer.invoke('app:deutes:guardar', datos),
    eliminar: (id) => ipcRenderer.invoke('app:deutes:eliminar', { id })
  },`,
    `deutes: {
    obtener: () => ipcRenderer.invoke('app:deutes:obtener'),
    guardar: (datos) => ipcRenderer.invoke('app:deutes:guardar', datos),
    actualizar: (datos, expectedVersion) => ipcRenderer.invoke('app:deutes:actualizar', { datos, expectedVersion }),
    eliminar: (id) => ipcRenderer.invoke('app:deutes:eliminar', { id })
  },`
  );
}

fs.writeFileSync(preloadPath, preloadCode);
console.log("preload.js actualizado con éxito!");
