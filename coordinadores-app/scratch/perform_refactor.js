const fs = require('fs');
const path = require('path');

const mainJsPath = path.join(__dirname, '..', 'main.js');
let code = fs.readFileSync(mainJsPath, 'utf8');

// 1. Inyectar requerimientos globales al inicio
code = code.replace(
  "const { app, BrowserWindow, ipcMain, dialog } = require('electron');",
  `const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const crypto = require('crypto');

const CLIENT_ID = crypto.randomUUID();
let currentSession = { user: 'Desconocido', role: 'Invitado' };

function verifyRole(allowedRoles = []) {
  const role = (currentSession.role || '').toLowerCase();
  if (role === 'admin' || role === 'jefe operaciones') return true;
  const normalized = allowedRoles.map(r => r.toLowerCase());
  if (!normalized.includes(role)) {
    throw new Error("Acceso denegado: El rol '" + currentSession.role + "' no tiene permisos suficientes para esta operación.");
  }
  return true;
}`
);

// 2. Reemplazar la definición de syncAllToLocal, syncToLocal, safeWriteCombined y safeWriteBatch
const oldSyncStart = code.indexOf("async function syncAllToLocal()");
const oldSyncEnd = code.indexOf("// ============================================\n// CONTROLADORES IPC");

if (oldSyncStart !== -1 && oldSyncEnd !== -1) {
  const newDeltaEngineCode = `
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
`;

  code = code.substring(0, oldSyncStart) + newDeltaEngineCode + code.substring(oldSyncEnd);
  console.log("Sección syncAllToLocal / safeWriteCombined reemplazada con éxito.");
} else {
  console.error("No se encontró la sección syncAllToLocal.");
}

// 3. Actualizar conectarBaseDatosUnica
code = code.replace(
  "async function conectarBaseDatosUnica(rutaCompartida) {\n  NETWORK_DIR = rutaCompartida;\n  currentDbPath = path.join(NETWORK_DIR, 'dades.db');\n\n  console.log(`[DB INIT] Inicializando Triple Estrategia en red: ${NETWORK_DIR}`);\n  await syncAllToLocal();\n\n  return db;\n}",
  `async function conectarBaseDatosUnica(rutaCompartida) {
  NETWORK_DIR = rutaCompartida;
  currentDbPath = path.join(NETWORK_DIR, 'dades.db');

  console.log("[DB INIT] Inicializando persistencia local + Motor de deltas en: " + NETWORK_DIR);

  for (const key of Object.keys(DBS)) {
    obtenerConexionLocal(key);
  }

  startDeltaWatcher();
  realizarBackupDiarioYRotacion();

  return db;
}`
);

// 4. Actualizar createWindow para bloqueo de DevTools y hybrid loader en prod
const oldCreateWindow = `function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: true
    }
  });

  // Intentar cargar la interfaz desde una carpeta externa 'src' al lado del ejecutable si existe.
  // Esto permite realizar modificaciones en caliente de HTML/CSS/JS sin volver a compilar.
  const externalIndexPath = path.join(rootDir, 'src', 'index.html');
  const internalIndexPath = path.join(__dirname, 'src', 'index.html');

  if (fs.existsSync(externalIndexPath)) {
    console.log(\`[LOAD] Cargando interfaz externa activa desde: \${externalIndexPath}\`);
    mainWindow.loadFile(externalIndexPath);
  } else {
    console.log(\`[LOAD] Cargando interfaz interna empaquetada desde: \${internalIndexPath}\`);
    mainWindow.loadFile(internalIndexPath);
  }

  // Abre las herramientas de desarrollo en modo desarrollo (descomenta si es necesario)
  // mainWindow.webContents.openDevTools();

  // Capturar e imprimir los logs de consola del renderizador en la terminal
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(\`[CONSOLE L\${level}] \${message} (en \${path.basename(sourceId)}:\${line})\`);
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}`;

const newCreateWindow = `function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: true
    }
  });

  // Hybrid loader: solo permitir interfaz externa en desarrollo (!app.isPackaged)
  const externalIndexPath = path.join(rootDir, 'src', 'index.html');
  const internalIndexPath = path.join(__dirname, 'src', 'index.html');

  if (!app.isPackaged && fs.existsSync(externalIndexPath)) {
    console.log("[LOAD DEV] Cargando interfaz externa desde: " + externalIndexPath);
    mainWindow.loadFile(externalIndexPath);
  } else {
    console.log("[LOAD PROD] Cargando interfaz interna segura desde: " + internalIndexPath);
    mainWindow.loadFile(internalIndexPath);
  }

  // Desactivación de DevTools y atajos en Producción
  if (app.isPackaged) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools();
    });
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if ((input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
        event.preventDefault();
      }
    });
  }

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log("[CONSOLE L" + level + "] " + message + " (en " + path.basename(sourceId) + ":" + line + ")");
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}`;

code = code.replace(oldCreateWindow, newCreateWindow);

// 5. Inyección de Handlers de Dominio e IPC seguros (removiendo los genéricos)
const ipcSectionStart = code.indexOf("// ==========================================\n// CONTROLADORES IPC");
const ipcSectionEnd = code.indexOf("ipcMain.handle('validate-network-path'");

if (ipcSectionStart !== -1 && ipcSectionEnd !== -1) {
  const newDomainHandlers = `// ==========================================
// CONTROLADORES IPC DE DOMINIO (RBAC + DELTAS)
// ==========================================

// SESIÓN Y RBAC
ipcMain.handle('app:session:set', (event, { user, role }) => {
  currentSession = { user: user || 'Desconocido', role: role || 'Invitado' };
  coordinadorActivo = currentSession.user;
  console.log("[RBAC] Sesión registrada en main.js: " + currentSession.user + " (" + currentSession.role + ")");
  return { success: true, session: currentSession };
});

ipcMain.handle('app:session:get', () => currentSession);

// DOMINIO: CUADRANTE Y OPERATIVA
ipcMain.handle('app:cuadrante:obtener', async (event, { mes, anio, parkingId }) => {
  const fechaPattern = \`\${anio}-\${String(mes).padStart(2, '0')}-%\`;
  let sql = "SELECT * FROM quadrant WHERE fecha LIKE ?";
  const params = [fechaPattern];
  if (parkingId) {
    sql += " AND aparcamiento_id = ?";
    params.push(parkingId);
  }
  return await dbAll(sql, params);
});

ipcMain.handle('app:cuadrante:guardarTurno', async (event, turnoData) => {
  verifyRole(['admin', 'coordinador', 'jefe operaciones']);
  const clientVersion = turnoData.version || 1;

  const existing = await dbGet("SELECT id, version, agente_id FROM quadrant WHERE fecha = ? AND aparcamiento_id = ? AND turno = ?", [turnoData.fecha, turnoData.aparcamiento_id, turnoData.turno]);

  if (existing) {
    const newVersion = (existing.version || 1) + 1;
    const sqlUpdate = \`
      UPDATE quadrant 
      SET agente_id = ?, hora_inicio = ?, hora_fin = ?, horas_trabajadas = ?, es_substitucio = ?, nota = ?, version = ? 
      WHERE id = ? AND version = ?
    \`;
    const params = [turnoData.agente_id, turnoData.hora_inicio, turnoData.hora_fin, turnoData.horas_trabajadas || 8, turnoData.es_substitucio || 0, turnoData.nota || '', newVersion, existing.id, clientVersion];
    
    return await applyLocalAndWriteDelta('operativa', 'UPDATE', 'quadrant', sqlUpdate, params, clientVersion);
  } else {
    const sqlInsert = \`
      INSERT INTO quadrant (fecha, aparcamiento_id, agente_id, turno, hora_inicio, hora_fin, horas_trabajadas, es_substitucio, nota, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    \`;
    const params = [turnoData.fecha, turnoData.aparcamiento_id, turnoData.agente_id, turnoData.turno, turnoData.hora_inicio, turnoData.hora_fin, turnoData.horas_trabajadas || 8, turnoData.es_substitucio || 0, turnoData.nota || ''];
    
    return await applyLocalAndWriteDelta('operativa', 'INSERT', 'quadrant', sqlInsert, params);
  }
});

ipcMain.handle('app:cuadrante:eliminarTurno', async (event, { id }) => {
  verifyRole(['admin', 'coordinador', 'jefe operaciones']);
  return await applyLocalAndWriteDelta('operativa', 'DELETE', 'quadrant', "DELETE FROM quadrant WHERE id = ?", [id]);
});

// INCIDENCIAS Y VACACIONES
ipcMain.handle('app:incidencias:obtenerVacaciones', async () => {
  return await dbAll("SELECT * FROM incidencias_horarias WHERE tipo_incidencia = 'Vacaciones' ORDER BY fecha_inicio DESC");
});

ipcMain.handle('app:incidencias:guardar', async (event, datos) => {
  verifyRole(['admin', 'coordinador', 'jefe operaciones']);
  const sql = \`
    INSERT INTO incidencias_horarias (id_trabajador, fecha_inicio, fecha_fin, tipo_incidencia, impacto_horas, coordinador, estado, comentarios)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  \`;
  const params = [datos.id_trabajador, datos.fecha_inicio, datos.fecha_fin || null, datos.tipo_incidencia, datos.impacto_horas || 0, datos.coordinador, datos.estado, datos.comentarios];
  return await applyLocalAndWriteDelta('operativa', 'INSERT', 'incidencias_horarias', sql, params);
});

ipcMain.handle('app:incidencias:cambiarEstado', async (event, { id, nuevoEstado }) => {
  verifyRole(['admin', 'coordinador', 'jefe operaciones']);
  return await applyLocalAndWriteDelta('operativa', 'UPDATE', 'incidencias_horarias', "UPDATE incidencias_horarias SET estado = ? WHERE id = ?", [nuevoEstado, id]);
});

ipcMain.handle('app:incidencias:eliminar', async (event, { id }) => {
  verifyRole(['admin', 'coordinador', 'jefe operaciones']);
  return await applyLocalAndWriteDelta('operativa', 'DELETE', 'incidencias_horarias', "DELETE FROM incidencias_horarias WHERE id = ?", [id]);
});

// FINANZAS, DESPESES Y DEUTES
ipcMain.handle('app:finanzas:obtenerGastos', async (event, { usuario, mes, anio }) => {
  const fechaPattern = \`\${anio}-\${String(mes).padStart(2, '0')}-%\`;
  let sql = "SELECT * FROM movimientos_economicos WHERE tipo_movimiento = 'Kilometraje' AND fecha LIKE ?";
  const params = [fechaPattern];
  if (usuario) {
    sql += " AND id_usuario = ?";
    params.push(usuario);
  }
  return await dbAll(sql, params);
});

ipcMain.handle('app:finanzas:guardarMovimiento', async (event, datos) => {
  const sql = \`
    INSERT INTO movimientos_economicos (id_usuario, fecha, tipo_movimiento, concepto, importe, json_detalles)
    VALUES (?, ?, ?, ?, ?, ?)
  \`;
  const params = [datos.id_usuario, datos.fecha, datos.tipo_movimiento, datos.concepto, datos.importe, datos.json_detalles];
  return await applyLocalAndWriteDelta('finanzas', 'INSERT', 'movimientos_economicos', sql, params);
});

ipcMain.handle('app:despeses:obtener', async () => dbAll("SELECT * FROM despeses WHERE activo = 1 ORDER BY fecha DESC"));
ipcMain.handle('app:despeses:guardar', async (event, d) => {
  return await applyLocalAndWriteDelta('finanzas', 'INSERT', 'despeses', "INSERT INTO despeses (fecha, comercial, concepto, importe, estado, coordinador) VALUES (?, ?, ?, ?, ?, ?)", [d.fecha, d.comercial, d.concepto, d.importe, d.estado, d.coordinador]);
});
ipcMain.handle('app:despeses:eliminar', async (event, { id }) => {
  return await applyLocalAndWriteDelta('finanzas', 'UPDATE', 'despeses', "UPDATE despeses SET activo = 0 WHERE id = ?", [id]);
});

ipcMain.handle('app:deutes:obtener', async () => dbAll("SELECT * FROM deutes WHERE activo = 1 ORDER BY fecha DESC"));
ipcMain.handle('app:deutes:guardar', async (event, d) => {
  return await applyLocalAndWriteDelta('finanzas', 'INSERT', 'deutes', "INSERT INTO deutes (comercial, cliente, import, fecha) VALUES (?, ?, ?, ?)", [d.comercial, d.cliente, d.import, d.fecha]);
});
ipcMain.handle('app:deutes:eliminar', async (event, { id }) => {
  return await applyLocalAndWriteDelta('finanzas', 'UPDATE', 'deutes', "UPDATE deutes SET activo = 0 WHERE id = ?", [id]);
});

// INVENTARIO (CON OCC)
ipcMain.handle('app:inventario:obtenerArticulos', async () => dbAll("SELECT * FROM inventario_articulos ORDER BY nombre ASC"));
ipcMain.handle('app:inventario:crearArticulo', async (event, { referencia, nombre, categoria }) => {
  verifyRole(['admin', 'coordinador', 'jefe operaciones']);
  return await applyLocalAndWriteDelta('finanzas', 'INSERT', 'inventario_articulos', "INSERT INTO inventario_articulos (referencia, nombre, categoria) VALUES (?, ?, ?)", [referencia, nombre, categoria]);
});
ipcMain.handle('app:inventario:eliminarArticulo', async (event, { id }) => {
  verifyRole(['admin', 'coordinador', 'jefe operaciones']);
  return await applyLocalAndWriteDelta('finanzas', 'DELETE', 'inventario_articulos', "DELETE FROM inventario_articulos WHERE id = ?", [id]);
});
ipcMain.handle('app:inventario:obtenerAlmacenes', async () => dbAll("SELECT * FROM inventario_almacenes ORDER BY nombre ASC"));
ipcMain.handle('app:inventario:crearAlmacen', async (event, { nombre }) => {
  verifyRole(['admin', 'coordinador', 'jefe operaciones']);
  return await applyLocalAndWriteDelta('finanzas', 'INSERT', 'inventario_almacenes', "INSERT INTO inventario_almacenes (nombre) VALUES (?)", [nombre]);
});
ipcMain.handle('app:inventario:obtenerStockGlobal', async () => {
  const sql = \`
    SELECT e.id, a.id as articulo_id, a.referencia as ref, a.nombre as articulo, al.nombre as magatzem, e.stock, e.version, a.categoria as cat
    FROM inventario_existencias e
    JOIN inventario_articulos a ON e.articulo_id = a.id
    JOIN inventario_almacenes al ON e.almacen_id = al.id
  \`;
  return await dbAll(sql);
});
ipcMain.handle('app:inventario:crearStock', async (event, { articulo_id, almacen_id }) => {
  verifyRole(['admin', 'coordinador', 'jefe operaciones']);
  return await applyLocalAndWriteDelta('finanzas', 'INSERT', 'inventario_existencias', "INSERT INTO inventario_existencias (articulo_id, almacen_id, stock, version) VALUES (?, ?, 0, 1)", [articulo_id, almacen_id]);
});
ipcMain.handle('app:inventario:borrarStock', async (event, { id }) => {
  verifyRole(['admin', 'coordinador', 'jefe operaciones']);
  return await applyLocalAndWriteDelta('finanzas', 'DELETE', 'inventario_existencias', "DELETE FROM inventario_existencias WHERE id = ?", [id]);
});
ipcMain.handle('app:inventario:actualizarStock', async (event, { existenciaId, nuevoStock, expectedVersion }) => {
  verifyRole(['admin', 'coordinador', 'jefe operaciones']);
  const sql = "UPDATE inventario_existencias SET stock = ?, version = version + 1 WHERE id = ? AND version = ?";
  return await applyLocalAndWriteDelta('finanzas', 'UPDATE', 'inventario_existencias', sql, [nuevoStock, existenciaId, expectedVersion], expectedVersion);
});
ipcMain.handle('app:inventario:obtenerComandas', async () => {
  const sql = \`
    SELECT c.id, c.data, c.centre, c.articulo_id, a.referencia as ref, c.uds, c.estat, c.rec
    FROM inventario_comandas c
    JOIN inventario_articulos a ON c.articulo_id = a.id
    ORDER BY c.data DESC, c.id DESC
  \`;
  return await dbAll(sql);
});
ipcMain.handle('app:inventario:crearComanda', async (event, comanda) => {
  return await applyLocalAndWriteDelta('finanzas', 'INSERT', 'inventario_comandas', "INSERT INTO inventario_comandas (data, centre, articulo_id, uds, estat, rec) VALUES (?, ?, ?, ?, ?, ?)", [comanda.data, comanda.centre, comanda.articulo_id, comanda.uds, comanda.estat, comanda.rec]);
});
ipcMain.handle('app:inventario:actualizarComanda', async (event, { id, estat, rec }) => {
  return await applyLocalAndWriteDelta('finanzas', 'UPDATE', 'inventario_comandas', "UPDATE inventario_comandas SET estat = ?, rec = ? WHERE id = ?", [estat, rec, id]);
});
ipcMain.handle('app:inventario:borrarComanda', async (event, { id }) => {
  return await applyLocalAndWriteDelta('finanzas', 'DELETE', 'inventario_comandas', "DELETE FROM inventario_comandas WHERE id = ?", [id]);
});

// COMERCIALES (CON OCC Y RBAC)
ipcMain.handle('app:comerciales:obtener', async () => dbAll("SELECT * FROM comerciales ORDER BY nombre ASC"));
ipcMain.handle('app:comerciales:guardar', async (event, datos) => {
  const sql = \`
    INSERT INTO comerciales (nombre, direccion, plantas, capacidad, plazas_libres, tarifa, notas, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  \`;
  const params = [datos.nombre, datos.direccion || '', datos.plantas || '', datos.capacidad || '', datos.plazas_libres || '', datos.tarifa || '', datos.notas || ''];
  return await applyLocalAndWriteDelta('comercial', 'INSERT', 'comerciales', sql, params);
});
ipcMain.handle('app:comerciales:actualizar', async (event, { datos, expectedVersion }) => {
  const sql = \`
    UPDATE comerciales
    SET nombre = ?, direccion = ?, plantas = ?, capacidad = ?, plazas_libres = ?, tarifa = ?, notas = ?, version = version + 1
    WHERE id = ? AND version = ?
  \`;
  const params = [datos.nombre, datos.direccion, datos.plantas, datos.capacidad, datos.plazas_libres, datos.tarifa, datos.notas, datos.id, expectedVersion];
  return await applyLocalAndWriteDelta('comercial', 'UPDATE', 'comerciales', sql, params, expectedVersion);
});
ipcMain.handle('app:comerciales:eliminar', async (event, { id }) => {
  verifyRole(['admin', 'coordinador', 'jefe operaciones']);
  return await applyLocalAndWriteDelta('comercial', 'DELETE', 'comerciales', "DELETE FROM comerciales WHERE id = ?", [id]);
});

// MAESTROS, SOCIEDADES, REGLAS
ipcMain.handle('app:maestros:obtenerEmpleados', async () => dbAll("SELECT * FROM empleados WHERE activo = 1 ORDER BY nombre ASC"));
ipcMain.handle('app:maestros:obtenerTrabajadores', async () => dbAll("SELECT nombre FROM empleados WHERE activo = 1 AND rol = 'Trabajador' ORDER BY nombre ASC"));
ipcMain.handle('app:maestros:obtenerAparcamientos', async () => dbAll("SELECT id, nombre, numero_obra, zona, sociedad_id FROM aparcamientos WHERE activo = 1 ORDER BY nombre ASC"));
ipcMain.handle('app:maestros:obtenerReglas', async () => dbAll("SELECT clave, value, tipo, categoria, descripcion FROM reglas_config ORDER BY clave ASC"));
ipcMain.handle('app:regles:actualizar', async (event, { clave, value }) => {
  verifyRole(['admin', 'coordinador', 'jefe operaciones']);
  return await applyLocalAndWriteDelta('catalogos', 'UPDATE', 'reglas_config', "UPDATE reglas_config SET value = ? WHERE clave = ?", [value, clave]);
});

`;
  code = code.substring(0, ipcSectionStart) + newDomainHandlers + code.substring(ipcSectionEnd);
  console.log("Handlers de Dominio IPC e inyección de seguridad aplicados con éxito.");
} else {
  console.error("No se encontró la sección de Controladores IPC.");
}

fs.writeFileSync(mainJsPath, code);
console.log("main.js refactorizado y guardado exitosamente!");
