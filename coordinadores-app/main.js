const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');

let mainWindow;

const DBS = {
  operativa: 'operativa_rrhh.db',
  finanzas: 'finanzas_inventario.db',
  comercial: 'comercial.db',
  catalogos: 'catalogos_maestros.db'
};

let NETWORK_DIR = "";
const localDir = path.join(app.getPath('userData'), 'db_cache');
if (!fs.existsSync(localDir)) {
  fs.mkdirSync(localDir, { recursive: true });
}

const localConnections = {};
let currentDbPath = "";
let coordinadorActivo = "General";

function resolverDbKeyDesdeSql(sql) {
  const sqlUpper = sql.toUpperCase();
  if (sqlUpper.includes("QUADRANT") || sqlUpper.includes("VACANCES") || sqlUpper.includes("DEUTES") || sqlUpper.includes("DEUTES_RELACIONAL")) {
    return "operativa";
  }
  if (sqlUpper.includes("DESPESES") || sqlUpper.includes("INVENTARI") || sqlUpper.includes("INVENTARI_RELACIONAL")) {
    return "finanzas";
  }
  if (sqlUpper.includes("COMERCIALS")) {
    return "comercial";
  }
  return "catalogos";
}

function obtenerConexionLocal(dbKey) {
  if (localConnections[dbKey]) {
    return localConnections[dbKey];
  }

  const dbFile = DBS[dbKey];
  if (!dbFile) {
    throw new Error(`Clave de base de datos no válida: ${dbKey}`);
  }

  const localDbPath = path.join(localDir, dbFile);
  const dbConn = new sqlite3.Database(localDbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
  
  dbConn.run("PRAGMA foreign_keys = ON;");

  // Si no es la de catálogos, adjuntar la base de datos de catálogos maestros para joins
  if (dbKey !== 'catalogos') {
    const catalogosPath = path.join(localDir, DBS.catalogos).replace(/\\/g, '/');
    dbConn.run(`ATTACH DATABASE '${catalogosPath}' AS catalogos;`, (err) => {
      if (err) {
        console.error(`[DB LOCAL] Error al adjuntar catalogos en ${dbKey}:`, err.message);
      } else {
        console.log(`[DB LOCAL] Catalogos adjuntados con éxito a ${dbKey}.`);
      }
    });
  }

  localConnections[dbKey] = dbConn;
  return dbConn;
}

// Objeto db legacy que actúa como Proxy a los shards para mantener compatibilidad
const db = {
  all: (sql, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    try {
      const dbKey = resolverDbKeyDesdeSql(sql);
      const localDb = obtenerConexionLocal(dbKey);
      localDb.all(sql, params, callback);
    } catch (e) {
      if (callback) callback(e);
    }
  },
  get: (sql, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    try {
      const dbKey = resolverDbKeyDesdeSql(sql);
      const localDb = obtenerConexionLocal(dbKey);
      localDb.get(sql, params, callback);
    } catch (e) {
      if (callback) callback(e);
    }
  },
  run: (sql, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    try {
      const dbKey = resolverDbKeyDesdeSql(sql);
      safeWriteCombined(dbKey, sql, params)
        .then(res => {
          if (callback) callback.call({ lastID: res.lastID, changes: res.changes }, null);
        })
        .catch(err => {
          if (callback) callback(err);
        });
    } catch (e) {
      if (callback) callback(e);
    }
  },
  exec: (sql, callback) => {
    try {
      const dbKey = resolverDbKeyDesdeSql(sql);
      const localDb = obtenerConexionLocal(dbKey);
      localDb.exec(sql, callback);
    } catch (e) {
      if (callback) callback(e);
    }
  },
  serialize: (callback) => {
    callback();
  },
  close: (callback) => {
    for (const [key, conn] of Object.entries(localConnections)) {
      if (conn) {
        try { conn.close(); } catch(e) {}
      }
    }
    if (callback) callback(null);
  }
};

// Funciones helpers para promisificar consultas de sqlite3 (redirigidas al proxy db)
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function conectarBaseDatosUnica(rutaCompartida) {
  NETWORK_DIR = rutaCompartida;
  currentDbPath = path.join(NETWORK_DIR, 'dades.db');

  console.log(`[DB INIT] Inicializando Triple Estrategia en red: ${NETWORK_DIR}`);
  syncAllToLocal();

  return db;
}

function inicializarBasesDeDatosEnRed() {
  if (!fs.existsSync(NETWORK_DIR)) {
    fs.mkdirSync(NETWORK_DIR, { recursive: true });
  }

  for (const [key, dbFile] of Object.entries(DBS)) {
    const netDbPath = path.join(NETWORK_DIR, dbFile);
    if (!fs.existsSync(netDbPath)) {
      console.log(`[DB INIT] Creando base de datos vacía en red: ${dbFile}`);
      const dbTemp = new sqlite3.Database(netDbPath);
      const schemaFileName = `schema_${key}.sql`;
      const schemaPath = path.join(__dirname, schemaFileName);
      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        dbTemp.exec(schemaSql, (err) => {
          if (err) {
            console.error(`[DB INIT] Error aplicando esquema en red para ${dbFile}:`, err.message);
          } else {
            console.log(`[DB INIT] Esquema aplicado con éxito para ${dbFile}`);
          }
          dbTemp.close();
        });
      } else {
        console.warn(`[DB INIT] Esquema no encontrado: ${schemaPath}`);
        dbTemp.close();
      }
    }
  }
}

function syncAllToLocal() {
  console.log("[DB SYNC] Sincronizando bases de datos desde red a caché local...");
  inicializarBasesDeDatosEnRed();

  for (const [key, dbFile] of Object.entries(DBS)) {
    const netDbPath = path.join(NETWORK_DIR, dbFile);
    const localDbPath = path.join(localDir, dbFile);

    if (localConnections[key]) {
      try {
        localConnections[key].close();
        localConnections[key] = null;
      } catch (e) {}
    }

    try {
      if (fs.existsSync(netDbPath)) {
        fs.copyFileSync(netDbPath, localDbPath);
        console.log(`[DB SYNC] Copiado ${dbFile} a caché local.`);
      }
    } catch (err) {
      console.error(`[DB SYNC] Error copiando ${dbFile} a local:`, err.message);
    }

    try {
      obtenerConexionLocal(key);
    } catch (e) {
      console.error(`[DB SYNC] Error abriendo conexión local para ${key}:`, e.message);
    }
  }
}

function syncToLocal(dbKey) {
  const dbFile = DBS[dbKey];
  const netDbPath = path.join(NETWORK_DIR, dbFile);
  const localDbPath = path.join(localDir, dbFile);

  if (localConnections[dbKey]) {
    try {
      localConnections[dbKey].close();
      localConnections[dbKey] = null;
      console.log(`[DB SYNC] Cerrada conexión local de ${dbKey} para sincronización.`);
    } catch (e) {
      console.error(`[DB SYNC] Error cerrando conexión local para copiar:`, e.message);
    }
  }

  try {
    if (fs.existsSync(netDbPath)) {
      fs.copyFileSync(netDbPath, localDbPath);
      console.log(`[DB SYNC] Sincronizado ${dbFile} desde red a caché local.`);
    }
  } catch (err) {
    console.error(`[DB SYNC] Error copiando ${dbFile} de red a local:`, err.message);
  }

  try {
    obtenerConexionLocal(dbKey);
  } catch (e) {
    console.error(`[DB SYNC] Error reabriendo conexión local de ${dbKey}:`, e.message);
  }
}

function acquireLock(dbKey, retries = 15, delay = 1000) {
  const lockDir = path.join(NETWORK_DIR, `_${dbKey}.lock`);
  const maxRetries = retries;
  const delayMs = delay;

  return new Promise((resolve, reject) => {
    let attempt = 0;

    const tryAcquire = () => {
      try {
        fs.mkdirSync(lockDir);
        console.log(`[MUTEX] Candado adquirido con éxito: ${lockDir}`);
        resolve(lockDir);
      } catch (err) {
        if (err.code === 'EEXIST') {
          try {
            const stats = fs.statSync(lockDir);
            const time = Math.min(stats.birthtimeMs || stats.mtimeMs, stats.mtimeMs);
            if (Date.now() - time > 180000) {
              console.warn(`[MUTEX] Candado obsoleto detectado para ${dbKey} (antigüedad: ${Date.now() - time}ms). Eliminando forzosamente...`);
              fs.rmSync(lockDir, { recursive: true, force: true });
              tryAcquire();
              return;
            }
          } catch (statErr) {
            console.error(`[MUTEX Error] Error al comprobar/eliminar candado fantasma:`, statErr.message);
          }

          attempt++;
          if (attempt >= maxRetries) {
            reject(new Error(`[MUTEX Timeout] No se pudo adquirir el candado en red para ${dbKey} tras ${maxRetries} reintentos.`));
          } else {
            console.warn(`[MUTEX] Candado ocupado para ${dbKey}, reintentando en ${delayMs}ms (Intento ${attempt}/${maxRetries})...`);
            setTimeout(tryAcquire, delayMs);
          }
        } else {
          reject(err);
        }
      }
    };

    tryAcquire();
  });
}

function releaseLock(lockDir) {
  return new Promise((resolve) => {
    try {
      if (fs.existsSync(lockDir)) {
        fs.rmdirSync(lockDir);
        console.log(`[MUTEX] Candado liberado: ${lockDir}`);
      }
      resolve();
    } catch (err) {
      console.error(`[MUTEX Error] Error al liberar el candado: ${lockDir}`, err.message);
      resolve();
    }
  });
}

async function safeWriteCombined(dbKey, query, params) {
  const dbFile = DBS[dbKey];
  if (!dbFile) {
    throw new Error(`Base de datos no válida: ${dbKey}`);
  }

  const netDbPath = path.join(NETWORK_DIR, dbFile);
  let lockDir = null;
  let netDb = null;

  try {
    lockDir = await acquireLock(dbKey);

    netDb = await new Promise((resolve, reject) => {
      const conn = new sqlite3.Database(netDbPath, sqlite3.OPEN_READWRITE, (err) => {
        if (err) reject(err);
        else resolve(conn);
      });
    });

    await new Promise((resolve, reject) => {
      netDb.run("PRAGMA foreign_keys = ON;", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise((resolve, reject) => {
      netDb.run("PRAGMA journal_mode = DELETE;", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const result = await new Promise((resolve, reject) => {
      netDb.run(query, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });

    await new Promise((resolve, reject) => {
      netDb.close((err) => {
        if (err) reject(err);
        else {
          netDb = null;
          resolve();
        }
      });
    });

    await releaseLock(lockDir);
    lockDir = null;

    syncToLocal(dbKey);

    return result;

  } catch (error) {
    console.error(`[MUTEX safeWrite] Error en escritura atómica para ${dbKey}:`, error.message);
    if (netDb) {
      try { netDb.close(); } catch (e) {}
    }
    if (lockDir) {
      await releaseLock(lockDir);
    }
    
    // Capturar caída de red y notificar al frontend
    if (error.code === 'ENOENT' || error.message.includes('EBUSY') || error.message.includes('ENOENT')) {
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('network-status', { error: true, message: 'Red inaccesible. Modo de solo lectura activado.' });
      });
    }
    
    throw error;
  }
}


// ============================================================

// SISTEMA DE MIGRACIONES VERSIONADO
// ============================================================

function aplicarSchemaCanonicoYMigrar(dbConnection) {
  // schema.sql eliminado (arquitectura de Sharding completada).
  // Las tablas se crean con CREATE TABLE IF NOT EXISTS en las propias migraciones versionadas.
  comprobarVersionYMigrar(dbConnection);
}

function comprobarVersionYMigrar(dbConnection) {
  // Asegurar que la tabla schema_version existe
  dbConnection.run(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, () => {
    dbConnection.get('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1', [], (err, row) => {
      const versionActual = (row && row.version) || 0;
      console.log(`[DB] Versión del esquema actual: ${versionActual}`);

      if (versionActual < 2) {
        console.log('[DB] Iniciando migración v1 → v2 (Modelo Multisociedad)...');
        migrarV1aV2(dbConnection);
      } else {
        console.log('[DB] Esquema actualizado. No se necesitan migraciones.');
        // Asegurar reglas de negocio completas
        inicializarReglasDeNegocio(dbConnection);
        sincronizarCatalogosIniciales(dbConnection);
        sincronizarAgentesIniciales(dbConnection);
      }
    });
  });
}

function migrarV1aV2(dbConnection) {
  dbConnection.serialize(() => {
    dbConnection.run('BEGIN TRANSACTION;');

    // A. Asegurar sociedad por defecto
    dbConnection.run(`
      INSERT OR IGNORE INTO sociedades (id, nombre_fiscal, codigo_corto, activo)
      VALUES (1, 'Sociedad General', 'SG', 1)
    `);

    // B. Migrar los 31 parkings del aparcamientos.json a la tabla relacional
    const jsonPath = path.join(dadesDir, 'aparcamientos.json');
    if (fs.existsSync(jsonPath)) {
      try {
        const raw = fs.readFileSync(jsonPath, 'utf8');
        const data = JSON.parse(raw);
        const parkings = data.aparcamientos || [];

        const stmt = dbConnection.prepare(`
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

        stmt.finalize();
        console.log(`[Migración v2] ${parkings.length} aparcamientos migrados desde JSON a SQLite.`);
      } catch (jsonErr) {
        console.error('[Migración v2] Error al leer/parsear aparcamientos.json:', jsonErr.message);
      }
    }

    // C. Insertar las 5 reglas de negocio completas
    const stmtRegla = dbConnection.prepare(`
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

    // D. Actualizar la versión del esquema a 2
    dbConnection.run(`INSERT OR REPLACE INTO schema_version (version, updated_at) VALUES (2, datetime('now', 'localtime'))`);

    dbConnection.run('COMMIT;', (err) => {
      if (err) {
        console.error('[Migración v2] ERROR en COMMIT:', err.message);
        dbConnection.run('ROLLBACK;');
      } else {
        console.log('[Migración v2] ✅ Migración v1 → v2 completada exitosamente.');
        console.log('[Migración v2] Esquema multisociedad activo. Trigger de auditoría instalado.');
        sincronizarCatalogosIniciales(dbConnection);
        sincronizarAgentesIniciales(dbConnection);
      }
    });
  });
}

async function getDatabaseForCoordinator(coordFolder) {
  if (!db) {
    throw new Error("Base de datos única no inicializada.");
  }
  return db;
}


// Ruta base para los datos y copias de seguridad (dinámica mediante archivo config.json)
const rootDir = app.isPackaged 
  ? path.dirname(process.execPath) 
  : __dirname;

const configFile = path.join(rootDir, 'config.json');
let dadesDir = path.join(rootDir, 'dades');
let backupsDir = path.join(rootDir, 'Backups');

// Intentar leer el archivo de configuración config.json
if (fs.existsSync(configFile)) {
  try {
    const configContent = fs.readFileSync(configFile, 'utf8');
    const config = JSON.parse(configContent);
    if (config.dadesPath) {
      dadesDir = path.isAbsolute(config.dadesPath)
        ? config.dadesPath
        : path.resolve(rootDir, config.dadesPath);
      console.log(`[CONFIG] Usando ruta de datos personalizada: ${dadesDir}`);
    }
    if (config.backupsPath) {
      backupsDir = path.isAbsolute(config.backupsPath)
        ? config.backupsPath
        : path.resolve(rootDir, config.backupsPath);
      console.log(`[CONFIG] Usando ruta de backups personalizada: ${backupsDir}`);
    }
  } catch (error) {
    console.error('[CONFIG] Error al leer config.json, usando valores por defecto:', error);
  }
} else {
  // Crear un config.json por defecto al lado del ejecutable para que sea fácilmente editable
  try {
    const defaultConfig = {
      dadesPath: "./dades",
      backupsPath: "./Backups",
      _comentario: "Puedes cambiar dadesPath a una ruta de red compartida, por ejemplo: Z:/Coordinadores/dades o \\\\Servidor\\Coordinadores\\dades"
    };
    fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, 2), 'utf8');
    console.log(`[CONFIG] Creado config.json por defecto en: ${configFile}`);
  } catch (error) {
    console.error('[CONFIG] No se pudo crear el config.json por defecto:', error);
  }
}

const tempDir = path.join(dadesDir, 'temp');
const tempLogFile = path.join(tempDir, 'cambios.jsonl');

// Crear la carpeta de datos si no existiera por alguna razón
if (!fs.existsSync(dadesDir)) {
  fs.mkdirSync(dadesDir, { recursive: true });
}

// Inicializar aparcamientos.json si no existe
const aparcamientosFile = path.join(dadesDir, 'aparcamientos.json');
if (!fs.existsSync(aparcamientosFile)) {
  const defaultAparcamientos = {
    aparcamientos: [
      { "nombre": "NN CONCEPT", "coordinadorId": "albert" },
      { "nombre": "NN LA TAMARITA", "coordinadorId": "albert" },
      { "nombre": "NN BONANOVA", "coordinadorId": "albert" },
      { "nombre": "NN ARAGÓ", "coordinadorId": "albert" },
      { "nombre": "NN URGELL 2", "coordinadorId": "albert" },
      { "nombre": "NN VALENCIA", "coordinadorId": "albert" },
      { "nombre": "NN VALENCIA 2", "coordinadorId": "albert" },
      { "nombre": "NN VALENCIA 3", "coordinadorId": "albert" },
      { "nombre": "NN BRUC", "coordinadorId": "albert" },
      { "nombre": "NN SANT GERVASI", "coordinadorId": "albert" },
      { "nombre": "NN LA ROTONDA", "coordinadorId": "albert" },
      { "nombre": "NN MASTER CATALONIA", "coordinadorId": "albert" },
      { "nombre": "NN TORRE NIN", "coordinadorId": "albert" },
      { "nombre": "NN ESPRONCEDA", "coordinadorId": "albert" },
      { "nombre": "NN URGELL", "coordinadorId": "albert" },
      { "nombre": "NN EL PALLOL", "coordinadorId": "albert" },
      { "nombre": "NN ILLA AUGUSTA", "coordinadorId": "albert" },
      { "nombre": "NN DIAGONAL", "coordinadorId": "laura" },
      { "nombre": "NN HERCEGOVINA", "coordinadorId": "laura" },
      { "nombre": "NN GRAN VIA", "coordinadorId": "laura" },
      { "nombre": "NN GEIGLE", "coordinadorId": "laura" },
      { "nombre": "NN SENTMENAT 2", "coordinadorId": "laura" },
      { "nombre": "NN ROCAFORT", "coordinadorId": "laura" },
      { "nombre": "NN SANTALÓ", "coordinadorId": "laura" },
      { "nombre": "NN BORRELL", "coordinadorId": "laura" },
      { "nombre": "NN ZONA FRANCA", "coordinadorId": "laura" },
      { "nombre": "NN ESTEVE TARRADAS", "coordinadorId": "laura" },
      { "nombre": "NN VÍA AUGUSTA", "coordinadorId": "laura" },
      { "nombre": "NN TRAVESSERA", "coordinadorId": "laura" },
      { "nombre": "NN PEDRALBES", "coordinadorId": "laura" },
      { "nombre": "NN CÓRSEGA", "coordinadorId": "laura" }
    ]
  };
  try {
    fs.writeFileSync(aparcamientosFile, JSON.stringify(defaultAparcamientos, null, 2), 'utf8');
    console.log(`[CONFIG] Inicializado aparcamientos.json con ${defaultAparcamientos.aparcamientos.length} registros en: ${aparcamientosFile}`);
  } catch (err) {
    console.error('[CONFIG] Error al crear aparcamientos.json inicial:', err);
  }
}

// Crear la carpeta temporal si no existiera
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Resolución segura de rutas para evitar saltos de directorio (Directory Traversal)
function getSafePath(relativePath) {
  const safePath = path.normalize(path.join(dadesDir, relativePath));
  if (!safePath.startsWith(dadesDir)) {
    throw new Error('Acceso no autorizado fuera de la carpeta de datos');
  }
  return safePath;
}

// Obtener ruta del archivo de bloqueo .lock correspondiente a un archivo de datos
function getLockPath(safeFilePath) {
  const dir = path.dirname(safeFilePath);
  const base = path.basename(safeFilePath);
  return path.join(dir, `~${base}.lock`);
}

// Función silenciosa para realizar el backup mensual al iniciar la aplicación
function checkAndRunBackup() {
  try {
    const now = new Date();
    // Formato AAAA-MM (ej: 2026-06)
    const monthFolder = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const destinationFolder = path.join(backupsDir, monthFolder);

    if (!fs.existsSync(destinationFolder)) {
      console.log(`[BACKUP] Iniciando copia de seguridad mensual en: ${destinationFolder}`);
      fs.mkdirSync(destinationFolder, { recursive: true });
      copyFolderSync(dadesDir, destinationFolder);
      console.log(`[BACKUP] Copia de seguridad mensual finalizada correctamente.`);
      
      // Borrar la carpeta temporal (tempDir) una vez hecho el traspaso mensual
      if (fs.existsSync(tempDir)) {
        console.log(`[BACKUP] Limpiando la carpeta de logs temporales (traspaso mensual)...`);
        fs.rmSync(tempDir, { recursive: true, force: true });
        fs.mkdirSync(tempDir, { recursive: true });
        console.log(`[BACKUP] Logs temporales vaciados correctamente para el nuevo mes.`);
      }
    } else {
      console.log(`[BACKUP] Ya existe la copia de seguridad para el mes actual (${monthFolder}).`);
    }
  } catch (error) {
    console.error('[BACKUP] Error al realizar la copia de seguridad:', error);
  }
}

// Copiar carpetas de forma recursiva (función auxiliar)
function copyFolderSync(from, to) {
  if (!fs.existsSync(to)) {
    fs.mkdirSync(to, { recursive: true });
  }
  
  const elements = fs.readdirSync(from);
  for (const element of elements) {
    // Evitar copiar archivos temporales .lock a las copias de seguridad
    if (element.startsWith('~') && element.endsWith('.lock')) {
      continue;
    }

    const fromPath = path.join(from, element);
    const toPath = path.join(to, element);
    const stat = fs.lstatSync(fromPath);

    if (stat.isDirectory()) {
      copyFolderSync(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  }
}

function createWindow() {
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
    console.log(`[LOAD] Cargando interfaz externa activa desde: ${externalIndexPath}`);
    mainWindow.loadFile(externalIndexPath);
  } else {
    console.log(`[LOAD] Cargando interfaz interna empaquetada desde: ${internalIndexPath}`);
    mainWindow.loadFile(internalIndexPath);
  }

  // Abre las herramientas de desarrollo en modo desarrollo (descomenta si es necesario)
  // mainWindow.webContents.openDevTools();

  // Capturar e imprimir los logs de consola del renderizador en la terminal
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[CONSOLE L${level}] ${message} (en ${path.basename(sourceId)}:${line})`);
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// [ELIMINADO] sincronizarCatalogosIniciales() — Su lógica se ha integrado en migrarV1aV2()
// La migración de JSON a SQLite ahora ocurre una sola vez al detectar schema_version < 2

// Handler de exportación de aparcamientos a CSV (compatible con Excel España)
ipcMain.handle('exportar-aparcamientos-csv', async () => {
  const { filePath } = await dialog.showSaveDialog({
    title: 'Guardar aparcamientos para Excel',
    defaultPath: path.join(app.getPath('documents'), 'aparcamientos_operaciones.csv'),
    filters: [{ name: 'CSV (delimitado por punto y coma)', extensions: ['csv'] }]
  });

  if (!filePath) return { success: false, reason: 'Cancelado' };

  return new Promise((resolve) => {
    db.all("SELECT * FROM aparcamientos WHERE activo = 1", [], (err, rows) => {
      if (err) return resolve({ success: false, error: err.message });

      // Cabecera delimitada por punto y coma
      let csv = "id;numero_obra;nombre;zona;es_remotizado;tipo_gestion;permitir_vacio_laborables;sociedad_id;coordinador_responsable\n";

      rows.forEach(r => {
        const nombreEscapado = r.nombre.replace(/"/g, '""');
        const zonaEscapada = (r.zona || '').replace(/"/g, '""');
        csv += `${r.id};"${r.numero_obra || ''}";"${nombreEscapado}";"${zonaEscapada}";${r.es_remotizado};"${r.tipo_gestion}";${r.permitir_vacio_laborables};${r.sociedad_id || ''};"${r.coordinador_responsable}"\n`;
      });

      // Añadimos el BOM para asegurar la detección de acentos en Excel
      const BOM = "\uFEFF";
      try {
        fs.writeFileSync(filePath, BOM + csv, 'utf8');
        resolve({ success: true, path: filePath });
      } catch (writeErr) {
        resolve({ success: false, error: writeErr.message });
      }
    });
  });
});

// Handler de importación de aparcamientos desde CSV (actualización masiva)
ipcMain.handle('importar-aparcamientos-csv', async () => {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'Seleccionar archivo CSV modificado en Excel',
    properties: ['openFile'],
    filters: [{ name: 'Archivos CSV', extensions: ['csv'] }]
  });

  if (!filePaths || filePaths.length === 0) return { success: false, reason: 'Cancelado' };
  const filePath = filePaths[0];

  try {
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const lineas = raw.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lineas.length <= 1) return { success: false, error: 'El archivo está vacío o solo contiene la cabecera' };

    return new Promise((resolve) => {
      db.serialize(() => {
        db.run("BEGIN TRANSACTION;");

        // Primero nos aseguramos de que existan las sociedades necesarias
        db.run(`
          INSERT OR IGNORE INTO sociedades (id, nombre_fiscal, codigo_corto, activo)
          VALUES (1, 'Sociedad General', 'SG', 1)
        `);

        const stmt = db.prepare(`
          INSERT INTO aparcamientos (id, numero_obra, nombre, zona, es_remotizado, tipo_gestion, permitir_vacio_laborables, sociedad_id, coordinador_responsable, activo)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
          ON CONFLICT(id) DO UPDATE SET
            numero_obra = excluded.numero_obra,
            nombre = excluded.nombre,
            zona = excluded.zona,
            es_remotizado = excluded.es_remotizado,
            tipo_gestion = excluded.tipo_gestion,
            permitir_vacio_laborables = excluded.permitir_vacio_laborables,
            sociedad_id = excluded.sociedad_id,
            coordinador_responsable = excluded.coordinador_responsable
        `);

        for (let i = 1; i < lineas.length; i++) {
          const columnas = lineas[i].split(/;(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(col => {
            let limpia = col.trim();
            if (limpia.startsWith('"') && limpia.endsWith('"')) {
              limpia = limpia.substring(1, limpia.length - 1);
            }
            return limpia.replace(/""/g, '"');
          });

          if (columnas.length < 5) continue;

          const id = columnas[0] === '' ? null : Number(columnas[0]);
          const numero_obra = columnas[1] || null;
          const nombre = columnas[2].toUpperCase();
          const zona = columnas[3] || '';
          const es_remotizado = Number(columnas[4]) || 0;
          const tipo_gestion = columnas[5] || 'propio';
          const permitir_vacio_laborables = Number(columnas[6]) || 0;
          const sociedad_id = columnas[7] === '' ? null : Number(columnas[7]);
          const coordinador_responsable = columnas[8] || 'Ambos';

          stmt.run(id, numero_obra, nombre, zona, es_remotizado, tipo_gestion, permitir_vacio_laborables, sociedad_id, coordinador_responsable);
        }

        stmt.finalize();
        db.run("COMMIT;", (err) => {
          if (err) {
            db.run("ROLLBACK;");
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true, total: lineas.length - 1 });
          }
        });
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

function inicializarReglasDeNegocio(dbConnection) {
  // Insertar reglas faltantes de forma idempotente (INSERT OR IGNORE)
  const stmtRegla = dbConnection.prepare(`
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
  stmtRegla.finalize(() => {
    console.log('[Reglas] 5 reglas de negocio verificadas/inicializadas.');
  });
}

function stringToId(str) {
  if (!str) return 0;
  if (!isNaN(str)) return parseInt(str);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) || 1;
}

// --- SINCRONIZACIÓN DE CATÁLOGOS JSON A SQLITE ---
function sincronizarCatalogosIniciales(dbConnection) {
  const jsonPath = path.join(__dirname, 'dades', 'aparcamientos.json');
  if (!fs.existsSync(jsonPath)) return;
  
  try {
    const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const parkings = Array.isArray(rawData) ? rawData : (rawData.aparcamientos || []);
    dbConnection.serialize(() => {
      dbConnection.run("BEGIN TRANSACTION;");
      
      // Asegurar sociedad por defecto
      dbConnection.run("INSERT OR IGNORE INTO sociedades (id, nombre_fiscal, codigo_corto, activo) VALUES (1, 'Empresa Principal', 'EMP_01', 1)");
      
      const stmt = dbConnection.prepare(`
        INSERT INTO aparcamientos (id, numero_obra, nombre, zona, es_remotizado, tipo_gestion, permitir_vacio_laborables, sociedad_id, coordinador_responsable, activo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET nombre = excluded.nombre, zona = excluded.zona;
      `);
      
      parkings.forEach((p, idx) => {
        const idAparcamiento = p.id || (idx + 1);
        stmt.run(
          idAparcamiento, 
          p.numero_obra || `OB-${idAparcamiento}`, 
          p.nombre, 
          p.zona || 'General', 
          p.es_remotizado ? 1 : 0, 
          p.tipo_gestion || 'propio', 
          p.permitir_vacio_laborables ? 1 : 0, 
          p.sociedad_id || 1, 
          p.coordinador_responsable || 'Ambos'
        );
      });
      
      stmt.finalize();
      dbConnection.run("COMMIT;");
      console.log("[DB] Aparcamientos sincronizados desde JSON.");
    });
  } catch (error) { 
    console.error("[DB Error] Error sincronizando aparcamientos:", error); 
  }
}

function sincronizarAgentesIniciales(dbConnection) {
  const jsonPath = path.join(__dirname, 'dades', 'coordinadores.json');
  if (!fs.existsSync(jsonPath)) return;
  
  try {
    const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const coordinadores = Array.isArray(rawData) ? rawData : (rawData.coordinadores || []);
    dbConnection.serialize(() => {
      dbConnection.run("BEGIN TRANSACTION;");
      
      const stmtAgente = dbConnection.prepare(`
        INSERT INTO agentes (id, nombre, zona_habitual, ranking_score, es_empresa_externa, activo)
        VALUES (?, ?, ?, 50, 0, 1) 
        ON CONFLICT(id) DO UPDATE SET nombre = excluded.nombre;
      `);
      
      const stmtContrato = dbConnection.prepare("INSERT OR IGNORE INTO contratos_agentes (agente_id, sociedad_id, fecha_inicio) VALUES (?, 1, date('now', 'start of month'));");
      
      coordinadores.forEach(c => {
        const nombreCompleto = c.nombre ? c.nombre : `${c.nom || ''} ${c.cognoms || ''}`.trim() || 'Agente';
        const agenteIntId = stringToId(c.id);
        stmtAgente.run(agenteIntId, nombreCompleto, c.zona || 'General');
        stmtContrato.run(agenteIntId);
      });
      
      stmtAgente.finalize();
      stmtContrato.finalize();
      dbConnection.run("COMMIT;");
      console.log("[DB] Agentes sincronizados desde JSON.");
    });
  } catch (error) { 
    console.error("[DB Error] Error sincronizando agentes:", error); 
  }
}

function obtenerReglasConfiguradas(dbConnection) {
  return new Promise((resolve, reject) => {
    const sql = "SELECT clave, value, tipo FROM reglas_config";
    dbConnection.all(sql, [], (err, rows) => {
      if (err) return reject(err);

      const reglas = {};
      rows.forEach(row => {
        if (row.tipo === 'numero') {
          reglas[row.clave] = Number(row.value);
        } else if (row.tipo === 'booleano') {
          reglas[row.clave] = (row.value === '1' || row.value === 'true');
        } else {
          reglas[row.clave] = row.value;
        }
      });
      resolve(reglas);
    });
  });
}

// Inicialización de la aplicación
app.on('ready', () => {
  const configPath = configFile;
  let rutaCompartida = path.join(app.getPath('documents'), 'Coordinadores_Local'); // Fallback
  
  try {
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (configData.ruta_compartida) {
      rutaCompartida = configData.ruta_compartida;
    }
  } catch (error) {
    console.warn("No se pudo leer la ruta_compartida de config.json, usando local por defecto.");
  }

  // Nos aseguramos de que la ruta de red existe
  if (!fs.existsSync(rutaCompartida)) {
    try { fs.mkdirSync(rutaCompartida, { recursive: true }); } 
    catch(e) { console.error("No se pudo crear la carpeta en la unidad compartida.", e); }
  }
  
  try {
    conectarBaseDatosUnica(rutaCompartida);
  } catch (err) {
    console.error("Error crítico al inicializar base de datos única:", err);
  }
  // Ejecutar el backup silencioso mensual
  checkAndRunBackup();
  createWindow();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});

// ==========================================
// CONTROLADORES IPC (LECTURA/ESCRITURA E HILOS)
// ==========================================

const LOCK_TTL = 3 * 60 * 60 * 1000; // 3 horas en milisegundos

function obtenerRutaLock() {
  return currentDbPath ? currentDbPath + '.lock' : null;
}

// 1. Ejecutar consultas directas parametrizadas (Relacional) - Enrutamiento inteligente a Shards
ipcMain.handle('db-query', async (event, { sql, params }) => {
  return new Promise((resolve, reject) => {
    try {
      const dbKey = resolverDbKeyDesdeSql(sql);
      const localDb = obtenerConexionLocal(dbKey);
      localDb.all(sql, params, (err, rows) => {
        if (err) {
          console.error(`[SQL Error] Consulta fallida: ${sql} | Error: ${err.message}`);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
});

// 2. Ejecutar sentencias de escritura parametrizadas (Relacional) - Escritura atómica con Mutex en red
ipcMain.handle('db-execute', async (event, { sql, params }) => {
  try {
    const dbKey = resolverDbKeyDesdeSql(sql);
    const result = await safeWriteCombined(dbKey, sql, params);
    return result;
  } catch (err) {
    console.error(`[SQL Error] Escritura fallida: ${sql} | Error: ${err.message}`);
    throw err;
  }
});

// ==========================================
// MIDDLEWARE DE SEGURIDAD ANTI-INYECCIÓN SQL
// ==========================================

/**
 * Valida la consulta SQL y los permisos del usuario antes de ejecutar cualquier escritura.
 * Lanza un Error con un mensaje descriptivo si la operación no está permitida.
 * @param {string} dbKey   - Identificador del shard de base de datos
 * @param {string} query   - Consulta SQL que se pretende ejecutar
 * @param {string} userRole - Rol del usuario obtenido del sessionStorage
 * @param {string} userName - Nombre del usuario obtenido del sessionStorage
 */
function validateSecurity(dbKey, query, userRole, userName) {
  const queryUpper = query.toUpperCase();
  const role = (userRole || '').toLowerCase();

  // --- REGLA 1: Bloqueo Absoluto (Nivel Dios) ---
  // Ningún usuario, ni admins, puede ejecutar comandos destructivos de esquema desde la UI.
  const COMANDOS_DESTRUCTIVOS = ['DROP TABLE', 'TRUNCATE', 'ALTER TABLE', 'GRANT'];
  for (const cmd of COMANDOS_DESTRUCTIVOS) {
    if (queryUpper.includes(cmd)) {
      throw new Error(
        `ALERTA DE SEGURIDAD: Comando SQL destructivo bloqueado. (Detectado: ${cmd})`
      );
    }
  }

  // --- REGLA 2: Protección de Borrado ---
  // Solo los administradores y el Jefe de Operaciones pueden ejecutar DELETE FROM.
  if (queryUpper.includes('DELETE FROM')) {
    if (role !== 'admin' && role !== 'jefe operaciones') {
      throw new Error(
        'Permisos insuficientes: Solo los administradores pueden borrar registros.'
      );
    }
  }

  // --- REGLA 3: Protección Financiera ---
  // En el shard 'finanzas', los UPDATE y DELETE solo están permitidos para roles admin o finanzas.
  // Los coordinadores estándar únicamente pueden hacer INSERT de nuevos gastos.
  if (dbKey === 'finanzas') {
    const esModificacion = queryUpper.includes('UPDATE') || queryUpper.includes('DELETE');
    if (esModificacion && role !== 'admin' && role !== 'finanzas') {
      throw new Error(
        'Permisos insuficientes: Solo los roles admin o finanzas pueden modificar o borrar registros financieros.'
      );
    }
  }
}

// NUEVO: Canalización explícita para la API window.dbAPI (Tarea 4)
ipcMain.handle('read-db', async (event, { dbKey, query, params }) => {
  return new Promise((resolve, reject) => {
    try {
      const localDb = obtenerConexionLocal(dbKey);
      localDb.all(query, params, (err, rows) => {
        if (err) {
          console.error(`[dbAPI Read Error] dbKey: ${dbKey} | Query: ${query} | Error: ${err.message}`);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
});

ipcMain.handle('write-db', async (event, { dbKey, query, params, userRole, userName }) => {
  try {
    // 1. Pasar por el control de seguridad antes de adquirir el Mutex
    validateSecurity(dbKey, query, userRole, userName);

    // 2. Ejecutar la escritura segura con Mutex (safeWriteCombined)
    return await safeWriteCombined(dbKey, query, params);
  } catch (error) {
    console.warn(
      `[Seguridad/DB] Intento fallido de ${userName || 'Desconocido'} (${userRole || 'sin-rol'}) en ${dbKey}: ${query}`
    );
    throw new Error(error.message);
  }
});

ipcMain.handle('force-unlock-db', async (event, dbKey) => {
  const lockDir = path.join(NETWORK_DIR, `_${dbKey}.lock`);
  try {
    if (fs.existsSync(lockDir)) {
      fs.rmSync(lockDir, { recursive: true, force: true });
      console.log(`[MUTEX Override] Candado liberado forzosamente para ${dbKey}: ${lockDir}`);
    }
    return { success: true, message: 'Candado liberado forzosamente' };
  } catch (err) {
    console.error(`[MUTEX Override Error] Error al liberar forzosamente ${lockDir}:`, err.message);
    throw err;
  }
});


// 3. Adquirir candado relacional cooperativo con TTL
ipcMain.handle('lock-acquire', async (event, { userName, userRole }) => {
  const lockPath = obtenerRutaLock();
  if (!lockPath) return { adquirido: false, error: 'Base de datos no configurada' };

  if (fs.existsSync(lockPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      
      // Control de inactividad absoluta (más de 30 minutos sin latidos)
      const limiteInactividad = 30 * 60 * 1000; 
      if (Date.now() - data.timestamp > limiteInactividad) {
        fs.unlinkSync(lockPath);
        console.log("[Lock] Liberado candado huérfano por inactividad.");
      } else {
        // Si el candado lo tiene otro usuario activo
        if (data.usuario !== userName) {
          return { 
            adquirido: false, 
            usuarioActivo: data.usuario, 
            rolActivo: data.role,
            desde: new Date(data.timestamp).toLocaleTimeString()
          };
        }
      }
    } catch (e) {
      // Archivo corrupto o mal escrito, lo eliminamos de forma preventiva
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
      }
    }
  }

// Crear el nuevo candado
  const nuevoLock = {
    usuario: userName,
    role: userRole,
    timestamp: Date.now()
  };
  fs.writeFileSync(lockPath, JSON.stringify(nuevoLock), 'utf8');
  coordinadorActivo = userName; // Registrar el coordinador activo para los backups
  return { adquirido: true };
});

// 4. Liberación voluntaria (al cerrar o cambiar cuadrante)
ipcMain.handle('lock-release', async (event, { userName }) => {
  const lockPath = obtenerRutaLock();
  if (lockPath && fs.existsSync(lockPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (data.usuario === userName) {
        fs.unlinkSync(lockPath);
        return { liberado: true };
      }
    } catch (e) {
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
      }
    }
  }
  return { liberado: false };
});

// 5. Liberación forzada exclusiva para el Jefe de Operaciones
ipcMain.handle('lock-force-release', async (event, { userRole, adminName }) => {
  const lockPath = obtenerRutaLock();
  if (!lockPath) return { liberado: false, error: 'Ruta no válida' };

  if (userRole !== 'jefe_operaciones') {
    return { liberado: false, error: 'Acceso denegado: Rol insuficiente.' };
  }

  if (fs.existsSync(lockPath)) {
    fs.unlinkSync(lockPath);
    console.log(`[Lock] Desbloqueo forzado administrativamente por: ${adminName}`);
    return { liberado: true };
  }
  return { liberado: true, mensaje: 'No había ningún candado activo' };
});

// Función auxiliar para comprobar si existe un fichero
async function fileExists(filePath) {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Función auxiliar asíncrona para leer y analizar el lock de forma segura y comprobar su expiración
async function readAndValidateLock(lockPath) {
  try {
    if (!await fileExists(lockPath)) {
      return null;
    }
    const content = (await fs.promises.readFile(lockPath, 'utf8')).trim();
    if (!content) {
      return null;
    }
    
    let lockData;
    if (content.startsWith('{')) {
      try {
        lockData = JSON.parse(content);
      } catch (e) {
        // Formato corrupto o antiguo sin estructurar, se asume expirado de inmediato
        lockData = { user: content, timestamp: 0 };
      }
    } else {
      // Soporte para archivos lock heredados (solo texto plano con el nombre de usuario)
      // Se asume timestamp 0 para que expire de inmediato y se reemplace por el nuevo formato JSON
      lockData = { user: content, timestamp: 0 };
    }

    const now = Date.now();
    if (lockData.timestamp && (now - lockData.timestamp > LOCK_TTL)) {
      console.log(`[LOCK] Bloqueo expirado para el usuario ${lockData.user} en ${lockPath}. Liberando automáticamente.`);
      try {
        await fs.promises.unlink(lockPath);
      } catch (err) {
        console.error(`[LOCK] Error al eliminar bloqueo expirado:`, err);
      }
      return null;
    }
    return lockData;
  } catch (error) {
    console.error(`[LOCK] Error al leer/validar bloqueo en ${lockPath}:`, error);
    return null;
  }
}

// 1. Leer un archivo JSON (con soporte e importación en caliente de SQLite)
ipcMain.handle('read-file', async (event, relativePath) => {
  try {
    const parts = relativePath.split('/');
    const firstSegment = parts[0];
    
    if (firstSegment.toLowerCase().startsWith('dades ')) {
      // Es una ruta de coordinador -> Usar SQLite
      const db = await getDatabaseForCoordinator(firstSegment);
      try {
        const row = await dbGet('SELECT value FROM kv_store WHERE key = ?', [relativePath]);
        if (row && row.value) {
          return { success: true, data: JSON.parse(row.value) };
        }
      } catch (dbErr) {
        console.error(`[SQLITE] Error al leer clave ${relativePath} de SQLite:`, dbErr);
      }
      
      // Fallback: Si no está en SQLite, intentar leer del archivo JSON físico heredado
      const safePath = getSafePath(relativePath);
      if (await fileExists(safePath)) {
        console.log(`[SQLITE-FALLBACK] Clave ${relativePath} no encontrada en DB. Cargando desde JSON legado.`);
        const content = await fs.promises.readFile(safePath, 'utf8');
        const data = JSON.parse(content);
        
        // Opcional: Insertarlo en SQLite para las próximas lecturas
        try {
          await dbRun('INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', [relativePath, content]);
          console.log(`[SQLITE-FALLBACK] Importado archivo JSON a SQLite automáticamente para futuras lecturas: ${relativePath}`);
        } catch (saveErr) {
          console.error(`[SQLITE-FALLBACK] No se pudo guardar fallback JSON en SQLite:`, saveErr);
        }
        
        return { success: true, data };
      }
      
      return { success: false, error: 'El archivo no existe' };
    } else {
      // Rutas globales (ej. coordinadores.json, aparcamientos.json) -> Archivo JSON plano tradicional
      const safePath = getSafePath(relativePath);
      if (!await fileExists(safePath)) {
        return { success: false, error: 'El archivo no existe' };
      }
      const content = await fs.promises.readFile(safePath, 'utf8');
      return { success: true, data: JSON.parse(content) };
    }
  } catch (error) {
    console.error(`Error al leer archivo ${relativePath}:`, error);
    return { success: false, error: error.message };
  }
});

// 2. Guardar/Escribir un archivo JSON con validación de bloqueo activa y persistencia en SQLite
ipcMain.handle('write-file', async (event, relativePath, data, userName) => {
  try {
    const safePath = getSafePath(relativePath);
    const lockPath = getLockPath(safePath);

    // Validar que el usuario sigue poseyendo el bloqueo activo
    if (safePath !== tempLogFile) {
      const activeLock = await readAndValidateLock(lockPath);
      if (activeLock && activeLock.user !== userName) {
        return { 
          success: false, 
          error: 'LOCK_LOST',
          message: `El archivo ha sido bloqueado por otro usuario (${activeLock.user}).`
        };
      }
      if (!activeLock) {
        return {
          success: false,
          error: 'LOCK_LOST',
          message: 'Se ha perdido el bloqueo de edición (ha expirado o ha sido liberado por el administrador).'
        };
      }
    }
    
    const parts = relativePath.split('/');
    const firstSegment = parts[0];
    
    if (firstSegment.toLowerCase().startsWith('dades ')) {
      // Guardar en la base de datos SQLite del coordinador
      const db = await getDatabaseForCoordinator(firstSegment);
      await dbRun('INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', [
        relativePath, 
        JSON.stringify(data)
      ]);
    } else {
      // Guardar en archivo JSON plano tradicional (rutas globales)
      const parentDir = path.dirname(safePath);
      if (!await fileExists(parentDir)) {
        await fs.promises.mkdir(parentDir, { recursive: true });
      }
      await fs.promises.writeFile(safePath, JSON.stringify(data, null, 2), 'utf8');
    }

    // Registrar el cambio en el log temporal (.jsonl) asíncronamente (append-only)
    if (safePath !== tempLogFile) {
      try {
        const logDir = path.dirname(tempLogFile);
        if (!await fileExists(logDir)) {
          await fs.promises.mkdir(logDir, { recursive: true });
        }

        const modulo = relativePath.split('/')[0] || 'general';
        const logEntry = {
          timestamp: new Date().toISOString(),
          usuario: userName || 'Desconocido',
          fichero: relativePath,
          modulo: modulo,
          accion: `Guardado de datos`
        };

        // Escribir como línea JSON (JSONL) append-only
        await fs.promises.appendFile(tempLogFile, JSON.stringify(logEntry) + '\n', 'utf8');
      } catch (logError) {
        console.error('[TEMP-LOG] Error al escribir en el log temporal:', logError);
      }
    }

    return { success: true };
  } catch (error) {
    console.error(`Error al escribir archivo ${relativePath}:`, error);
    return { success: false, error: error.message };
  }
});

// 3. Comprobar bloqueo
ipcMain.handle('check-lock', async (event, relativePath) => {
  try {
    const safePath = getSafePath(relativePath);
    const lockPath = getLockPath(safePath);

    const activeLock = await readAndValidateLock(lockPath);
    if (activeLock) {
      return { locked: true, lockedBy: activeLock.user };
    }
    return { locked: false };
  } catch (error) {
    console.error(`Error al comprobar bloqueo de ${relativePath}:`, error);
    return { locked: false, error: error.message };
  }
});

// 4. Adquirir bloqueo (File Locking con TTL)
ipcMain.handle('acquire-lock', async (event, relativePath, userName) => {
  try {
    const safePath = getSafePath(relativePath);
    const lockPath = getLockPath(safePath);

    const activeLock = await readAndValidateLock(lockPath);
    if (activeLock) {
      if (activeLock.user === userName) {
        // Renovar el timestamp del bloqueo actual para conceder otras 3 horas de edición
        const lockData = { user: userName, timestamp: Date.now() };
        await fs.promises.writeFile(lockPath, JSON.stringify(lockData), 'utf8');
        return { success: true, locked: false, lockedBy: userName };
      }
      return { success: false, locked: true, lockedBy: activeLock.user };
    }

    // Crear el directorio padre si no existe (para nuevos coordinadores)
    const lockDir = path.dirname(lockPath);
    if (!await fileExists(lockDir)) {
      await fs.promises.mkdir(lockDir, { recursive: true });
    }

    // Crear el archivo lock con el objeto JSON stringificado
    const lockData = { user: userName, timestamp: Date.now() };
    await fs.promises.writeFile(lockPath, JSON.stringify(lockData), 'utf8');
    return { success: true, locked: false, lockedBy: userName };
  } catch (error) {
    console.error(`Error al adquirir bloqueo para ${relativePath}:`, error);
    return { success: false, error: error.message };
  }
});

// 5. Liberar bloqueo
ipcMain.handle('release-lock', async (event, relativePath, userName, isJefeOps) => {
  try {
    const safePath = getSafePath(relativePath);
    const lockPath = getLockPath(safePath);

    const activeLock = await readAndValidateLock(lockPath);
    if (!activeLock) {
      return { success: true }; // No estaba bloqueado o ya expiró
    }
    
    // El lock se puede liberar si pertenece al mismo usuario o si es un Jefe de Operaciones (administrador)
    if (activeLock.user === userName || isJefeOps) {
      try {
        await fs.promises.unlink(lockPath);
      } catch (e) {
        // Ignorar si el archivo ya no existe por alguna condición de carrera
      }
      return { success: true };
    }

    return { success: false, error: `No tienes permisos para liberar el bloqueo de ${activeLock.user}` };
  } catch (error) {
    console.error(`Error al liberar bloqueo para ${relativePath}:`, error);
    return { success: false, error: error.message };
  }
});

// 6. Forzar desbloqueo de emergencia (Jefe de operaciones)
ipcMain.handle('force-release-lock', async (event, relativePath) => {
  try {
    const safePath = getSafePath(relativePath);
    const lockPath = getLockPath(safePath);

    if (await fileExists(lockPath)) {
      await fs.promises.unlink(lockPath);
    }
    return { success: true };
  } catch (error) {
    console.error(`Error al forzar liberación de bloqueo para ${relativePath}:`, error);
    return { success: false, error: error.message };
  }
});

// ==========================================
// GESTIÓN DINÁMICA DE COORDINADORES
// ==========================================

const coordinadoresFile = path.join(dadesDir, 'coordinadores.json');

// Función auxiliar para leer la lista de coordinadores de forma asíncrona
async function readCoordinadoresAsync() {
  try {
    if (await fileExists(coordinadoresFile)) {
      const content = await fs.promises.readFile(coordinadoresFile, 'utf8');
      const parsed = JSON.parse(content);
      return parsed.coordinadores || [];
    }
  } catch (error) {
    console.error('[COORDINADORES] Error al leer coordinadores.json:', error);
  }
  // Devolver datos por defecto si no existe el archivo
  return [
    { id: 'albert', nombre: 'Albert', apellido: 'Campins', zona: 'Zona 1' },
    { id: 'laura', nombre: 'Laura', apellido: 'Navarro', zona: 'Zona 2' }
  ];
}

// Función auxiliar para guardar la lista de coordinadores de forma asíncrona
async function saveCoordinadoresAsync(coordinadores) {
  const data = { coordinadores };
  await fs.promises.writeFile(coordinadoresFile, JSON.stringify(data, null, 2), 'utf8');
}

// 7. Obtener la lista de coordinadores registrados
ipcMain.handle('get-coordinadores', async () => {
  return await readCoordinadoresAsync();
});

// 8. Añadir un nuevo coordinador
ipcMain.handle('add-coordinador', async (event, nombre, apellido, zona) => {
  try {
    const id = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
    const coordinadores = await readCoordinadoresAsync();

    // Comprobar si ya existe
    if (coordinadores.some(c => c.id === id)) {
      return { success: false, error: `El coordinador "${nombre}" ja existeix.` };
    }

    // Añadir el nuevo coordinador
    coordinadores.push({ id, nombre, apellido, zona });
    await saveCoordinadoresAsync(coordinadores);

    // Crear la carpeta de datos del coordinador
    const userFolder = path.join(dadesDir, `dades ${nombre}`);
    if (!await fileExists(userFolder)) {
      await fs.promises.mkdir(userFolder, { recursive: true });
      console.log(`[COORDINADORES] Creada carpeta de datos: ${userFolder}`);
    }

    console.log(`[COORDINADORES] Nuevo coordinador añadido: ${nombre} ${apellido} (id: ${id}, zona: ${zona})`);
    return { success: true, coordinador: { id, nombre, apellido, zona } };
  } catch (error) {
    console.error('[COORDINADORES] Error al añadir coordinador:', error);
    return { success: false, error: error.message };
  }
});

// 9. Eliminar un coordinador (sin borrar su carpeta de datos)
ipcMain.handle('remove-coordinador', async (event, id) => {
  try {
    let coordinadores = await readCoordinadoresAsync();
    const original = coordinadores.length;
    coordinadores = coordinadores.filter(c => c.id !== id);

    if (coordinadores.length === original) {
      return { success: false, error: `No s'ha trobat el coordinador amb id "${id}".` };
    }

    await saveCoordinadoresAsync(coordinadores);
    console.log(`[COORDINADORES] Coordinador eliminado del registro: ${id} (datos conservados)`);
    return { success: true };
  } catch (error) {
    console.error('[COORDINADORES] Error al eliminar coordinador:', error);
    return { success: false, error: error.message };
  }
});

// ==========================================
// GESTIÓN DINÁMICA DE APARCAMIENTOS
// ==========================================

// 10. Obtener la lista de aparcamientos (fuente: SQLite relacional con JOIN a sociedades)
ipcMain.handle('get-aparcamientos', async () => {
  try {
    const rows = await dbAll(`
      SELECT a.*, s.nombre_fiscal as sociedad_nombre, s.codigo_corto as sociedad_codigo
      FROM aparcamientos a
      LEFT JOIN sociedades s ON a.sociedad_id = s.id
      WHERE a.activo = 1
      ORDER BY a.coordinador_responsable, a.nombre
    `);
    // Transformar al formato que espera el frontend existente (compatibilidad)
    return rows.map(r => ({
      nombre: r.nombre,
      coordinadorId: r.coordinador_responsable === 'Albert' ? 'albert' :
                     r.coordinador_responsable === 'Laura' ? 'laura' : '',
      // Campos extendidos del modelo relacional
      id: r.id,
      numero_obra: r.numero_obra,
      zona: r.zona,
      es_remotizado: r.es_remotizado,
      tipo_gestion: r.tipo_gestion,
      permitir_vacio_laborables: r.permitir_vacio_laborables,
      sociedad_id: r.sociedad_id,
      sociedad_nombre: r.sociedad_nombre,
      sociedad_codigo: r.sociedad_codigo,
      coordinador_responsable: r.coordinador_responsable
    }));
  } catch (error) {
    console.error('[APARCAMIENTOS] Error al leer aparcamientos de SQLite:', error);
    return [];
  }
});

// 11. Guardar la lista de aparcamientos (fuente: SQLite relacional)
ipcMain.handle('save-aparcamientos', async (event, aparcamientos) => {
  try {
    // Sincronizar el array recibido con la tabla relacional
    const activeIds = [];
    
    for (const ap of aparcamientos) {
      let responsable = 'Ambos';
      if (ap.coordinadorId === 'albert') responsable = 'Albert';
      else if (ap.coordinadorId === 'laura') responsable = 'Laura';
      else if (ap.coordinador_responsable) responsable = ap.coordinador_responsable;

      if (ap.id) {
        // Actualizar existente
        await dbRun(`
          UPDATE aparcamientos SET
            nombre = ?, zona = ?, coordinador_responsable = ?,
            numero_obra = ?, sociedad_id = ?, es_remotizado = ?,
            tipo_gestion = ?, permitir_vacio_laborables = ?, activo = 1
          WHERE id = ?
        `, [
          ap.nombre.toUpperCase(), ap.zona || '', responsable,
          ap.numero_obra || null, ap.sociedad_id || 1, ap.es_remotizado || 0,
          ap.tipo_gestion || 'propio', ap.permitir_vacio_laborables || 0,
          ap.id
        ]);
        activeIds.push(ap.id);
      } else {
        // Insertar nuevo
        const numObra = ap.numero_obra || `OB-${Date.now()}`;
        const result = await dbRun(`
          INSERT INTO aparcamientos (numero_obra, nombre, zona, coordinador_responsable, sociedad_id, es_remotizado, tipo_gestion, permitir_vacio_laborables, activo)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        `, [
          numObra, ap.nombre.toUpperCase(), ap.zona || '', responsable,
          ap.sociedad_id || 1, ap.es_remotizado || 0,
          ap.tipo_gestion || 'propio', ap.permitir_vacio_laborables || 0
        ]);
        if (result && result.lastID) {
          activeIds.push(result.lastID);
        }
      }
    }

    // Desactivar todos los aparcamientos activos que no estén en la lista de IDs actualizada
    if (activeIds.length > 0) {
      const placeholders = activeIds.map(() => '?').join(',');
      await dbRun(`UPDATE aparcamientos SET activo = 0 WHERE id NOT IN (${placeholders})`, activeIds);
    } else {
      await dbRun(`UPDATE aparcamientos SET activo = 0`);
    }

    // Mantener el JSON sincronizado como respaldo
    try {
      const data = { aparcamientos };
      await fs.promises.writeFile(aparcamientosFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (jsonErr) {
      console.warn('[APARCAMIENTOS] No se pudo sincronizar el JSON de respaldo:', jsonErr.message);
    }

    console.log(`[APARCAMIENTOS] Catálogo actualizado en SQLite. ${aparcamientos.length} registros procesados.`);
    return { success: true };
  } catch (error) {
    console.error('[APARCAMIENTOS] Error al guardar aparcamientos en SQLite:', error);
    return { success: false, error: error.message };
  }
});

// ==========================================
// GESTIÓN CRUD MULTISOCIEDAD
// ==========================================

// --- SOCIEDADES ---

ipcMain.handle('get-sociedades', async () => {
  try {
    return await dbAll('SELECT * FROM sociedades WHERE activo = 1 ORDER BY nombre_fiscal');
  } catch (error) {
    console.error('[SOCIEDADES] Error al listar:', error);
    return [];
  }
});

ipcMain.handle('add-sociedad', async (event, datos) => {
  try {
    const result = await dbRun(`
      INSERT INTO sociedades (nombre_fiscal, codigo_corto, activo)
      VALUES (?, ?, 1)
    `, [datos.nombre_fiscal, datos.codigo_corto.toUpperCase()]);
    console.log(`[SOCIEDADES] Nueva sociedad creada: ${datos.nombre_fiscal} (${datos.codigo_corto})`);
    return { success: true, id: result.lastID };
  } catch (error) {
    console.error('[SOCIEDADES] Error al crear:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-sociedad', async (event, id, datos) => {
  try {
    await dbRun(`
      UPDATE sociedades SET nombre_fiscal = ?, codigo_corto = ?
      WHERE id = ?
    `, [datos.nombre_fiscal, datos.codigo_corto.toUpperCase(), id]);
    console.log(`[SOCIEDADES] Sociedad id=${id} actualizada.`);
    return { success: true };
  } catch (error) {
    console.error('[SOCIEDADES] Error al actualizar:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('deactivate-sociedad', async (event, id) => {
  try {
    // Verificar que no hay aparcamientos activos vinculados
    const vinculados = await dbGet('SELECT COUNT(*) as cnt FROM aparcamientos WHERE sociedad_id = ? AND activo = 1', [id]);
    if (vinculados && vinculados.cnt > 0) {
      return { success: false, error: `No se puede desactivar: tiene ${vinculados.cnt} aparcamiento(s) activo(s) vinculado(s).` };
    }
    await dbRun('UPDATE sociedades SET activo = 0 WHERE id = ?', [id]);
    console.log(`[SOCIEDADES] Sociedad id=${id} desactivada.`);
    return { success: true };
  } catch (error) {
    console.error('[SOCIEDADES] Error al desactivar:', error);
    return { success: false, error: error.message };
  }
});


// --- GESTIÓN DE APARCAMIENTOS EN SQLITE ---

// Leer todos los aparcamientos activos
ipcMain.handle('get-aparcamientos-relacional', async () => {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("Base de datos no inicializada."));
    const sql = "SELECT * FROM aparcamientos WHERE activo = 1 ORDER BY nombre ASC";
    db.all(sql, [], (err, rows) => {
      if (err) {
        console.error("Error leyendo aparcamientos de SQLite:", err);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
});

// Guardar o actualizar un aparcamiento
ipcMain.handle('update-aparcamiento-relacional', async (event, id, datos) => {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("Base de datos no inicializada."));
    
    if (id) {
      // Es una actualización
      const sql = `
        UPDATE aparcamientos 
        SET nombre = ?, zona = ?, es_remotizado = ?, tipo_gestion = ?, permitir_vacio_laborables = ?, sociedad_id = ?, coordinador_responsable = ?
        WHERE id = ?
      `;
      const params = [datos.nombre, datos.zona, datos.es_remotizado, datos.tipo_gestion, datos.permitir_vacio_laborables, datos.sociedad_id, datos.coordinador_responsable, id];
      
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ success: true, id: id, changes: this.changes });
      });
    } else {
      // Es uno nuevo
      const sql = `
        INSERT INTO aparcamientos (numero_obra, nombre, zona, es_remotizado, tipo_gestion, permitir_vacio_laborables, sociedad_id, coordinador_responsable)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const numObra = datos.numero_obra || `OB-${Date.now()}`; // Generar un número de obra temporal si no viene
      const params = [numObra, datos.nombre, datos.zona, datos.es_remotizado, datos.tipo_gestion, datos.permitir_vacio_laborables, datos.sociedad_id, datos.coordinador_responsable];

      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ success: true, id: this.lastID });
      });
    }
  });
});

// Leer el historial de cambios de un aparcamiento
ipcMain.handle('get-historico-aparcamiento', async (event, aparcamientoId) => {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("Base de datos no inicializada."));
    const sql = "SELECT * FROM historico_aparcamientos WHERE aparcamiento_id = ? ORDER BY fecha_cambio DESC";
    db.all(sql, [aparcamientoId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
});

// --- GESTIÓN DE PERSONAL (AGENTES) EN SQLITE ---
ipcMain.handle('get-agentes-relacional', async () => {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("Base de datos no inicializada."));
    // Los traemos ordenados por ranking para que el cuadrante los muestre correctamente
    const sql = "SELECT * FROM agentes WHERE activo = 1 ORDER BY ranking_score DESC";
    db.all(sql, [], (err, rows) => {
      if (err) {
        console.error("Error leyendo agentes de SQLite:", err);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
});

// --- CONTRATOS DE AGENTES ---

ipcMain.handle('get-contratos-agente', async (event, agenteId) => {
  try {
    return await dbAll(`
      SELECT ca.*, s.nombre_fiscal as sociedad_nombre, s.codigo_corto as sociedad_codigo
      FROM contratos_agentes ca
      JOIN sociedades s ON ca.sociedad_id = s.id
      WHERE ca.agente_id = ?
      ORDER BY ca.fecha_inicio DESC
    `, [agenteId]);
  } catch (error) {
    console.error('[CONTRATOS] Error al listar:', error);
    return [];
  }
});

ipcMain.handle('add-contrato-agente', async (event, datos) => {
  try {
    // Cerrar contrato vigente previo del mismo agente (si existe)
    await dbRun(`
      UPDATE contratos_agentes SET fecha_fin = ?
      WHERE agente_id = ? AND fecha_fin IS NULL
    `, [datos.fecha_inicio, datos.agente_id]);

    const result = await dbRun(`
      INSERT INTO contratos_agentes (agente_id, sociedad_id, fecha_inicio, fecha_fin)
      VALUES (?, ?, ?, ?)
    `, [datos.agente_id, datos.sociedad_id, datos.fecha_inicio, datos.fecha_fin || null]);
    console.log(`[CONTRATOS] Nuevo contrato para agente id=${datos.agente_id} con sociedad id=${datos.sociedad_id}`);
    return { success: true, id: result.lastID };
  } catch (error) {
    console.error('[CONTRATOS] Error al crear:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('cerrar-contrato-agente', async (event, contratoId) => {
  try {
    const hoy = new Date().toISOString().split('T')[0];
    await dbRun('UPDATE contratos_agentes SET fecha_fin = ? WHERE id = ?', [hoy, contratoId]);
    console.log(`[CONTRATOS] Contrato id=${contratoId} cerrado con fecha ${hoy}.`);
    return { success: true };
  } catch (error) {
    console.error('[CONTRATOS] Error al cerrar:', error);
    return { success: false, error: error.message };
  }
});

// Función auxiliar asíncrona para buscar de forma recursiva todos los ficheros .json en la base de datos dadesDir
async function getAllJsonFilesAsync(dir, fileList = []) {
  try {
    if (!await fileExists(dir)) return fileList;
    const files = await fs.promises.readdir(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = await fs.promises.stat(filePath);
      if (stat.isDirectory()) {
        await getAllJsonFilesAsync(filePath, fileList);
      } else if (file.endsWith('.json')) {
        fileList.push(filePath);
      }
    }
  } catch (err) {
    console.error(`[APARCAMIENTOS] Error al listar directorio recursivo ${dir}:`, err);
  }
  return fileList;
}

// Función auxiliar recursiva para buscar y reemplazar el nombre de un aparcamiento en las estructuras de datos JSON (en memoria, síncrona)
function replaceValueRecursively(val, oldVal, newVal) {
  if (typeof val === 'string') {
    // Coincidencia exacta (ignorando mayúsculas/minúsculas y espacios al comparar)
    if (val.trim().toUpperCase() === oldVal.toUpperCase()) {
      return newVal;
    }
    
    // Coincidencia con separador de concepto en Gastos (ej. "ARAGÓ 182  ➤  OFICINES")
    if (val.includes("  ➤  ")) {
      const parts = val.split("  ➤  ");
      let changed = false;
      const newParts = parts.map(part => {
        if (part.trim().toUpperCase() === oldVal.toUpperCase()) {
          changed = true;
          return newVal;
        }
        return part;
      });
      if (changed) {
        return newParts.join("  ➤  ");
      }
    }
    return val;
  }
  
  if (Array.isArray(val)) {
    return val.map(item => replaceValueRecursively(item, oldVal, newVal));
  }
  
  if (val !== null && typeof val === 'object') {
    const res = {};
    for (const key in val) {
      if (Object.prototype.hasOwnProperty.call(val, key)) {
        res[key] = replaceValueRecursively(val[key], oldVal, newVal);
      }
    }
    return res;
  }
  
  return val;
}

// 12. Renombrar un aparcamiento en el catálogo y propagar el cambio en toda la base de datos física de forma asíncrona
ipcMain.handle('rename-aparcamiento', async (event, oldName, newName) => {
  try {
    const oldNameUpper = oldName.trim().toUpperCase();
    const newNameUpper = newName.trim().toUpperCase();

    if (!oldNameUpper || !newNameUpper) {
      return { success: false, error: 'Els noms de l\'aparcament no poden ser buits.' };
    }
    if (oldNameUpper === newNameUpper) {
      return { success: true }; // Mismo nombre, nada que hacer
    }

    // A. Modificar en aparcamientos.json
    let aparcamientos = [];
    if (await fileExists(aparcamientosFile)) {
      const content = await fs.promises.readFile(aparcamientosFile, 'utf8');
      try {
        aparcamientos = JSON.parse(content).aparcamientos || [];
      } catch (e) {
        aparcamientos = [];
      }
    }
    
    let found = false;
    aparcamientos.forEach(ap => {
      if (ap.nombre.toUpperCase() === oldNameUpper) {
        ap.nombre = newNameUpper;
        found = true;
      }
    });

    if (!found) {
      // Si no existe, lo añadimos al catálogo por si acaso
      aparcamientos.push({ nombre: newNameUpper, coordinadorId: "" });
    }

    // Guardar catálogo maestro actualizado
    await fs.promises.writeFile(aparcamientosFile, JSON.stringify({ aparcamientos }, null, 2), 'utf8');

    // B. Escanear y actualizar todos los demás ficheros JSON en la carpeta de datos
    const allJsonFiles = await getAllJsonFilesAsync(dadesDir);
    let updatedFilesCount = 0;

    for (const filePath of allJsonFiles) {
      // Evitar sobreescribir de nuevo aparcamientos.json o el archivo de configuración config.json
      if (filePath === aparcamientosFile || filePath.endsWith('config.json')) continue;

      try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        const data = JSON.parse(content);
        const updatedData = replaceValueRecursively(data, oldNameUpper, newNameUpper);
        
        // Guardar solo si hubo un cambio real en su contenido
        if (JSON.stringify(data) !== JSON.stringify(updatedData)) {
          await fs.promises.writeFile(filePath, JSON.stringify(updatedData, null, 2), 'utf8');
          updatedFilesCount++;
        }
      } catch (err) {
        console.error(`[RENOMBRADO] Error en el archivo ${filePath}:`, err);
      }
    }

    // C. Escanear y actualizar las bases de datos SQLite de cada coordinador
    let updatedDbRowsCount = 0;
    try {
      const coordinadores = await readCoordinadoresAsync();
      for (const coord of coordinadores) {
        const coordFolder = `dades ${coord.nombre}`;
        const db = await getDatabaseForCoordinator(coordFolder);
        
        // Obtener todas las filas de kv_store
        const rows = await new Promise((resolve, reject) => {
          db.all('SELECT key, value FROM kv_store', [], (err, result) => {
            if (err) reject(err);
            else resolve(result || []);
          });
        });
        
        for (const row of rows) {
          try {
            const data = JSON.parse(row.value);
            const updatedData = replaceValueRecursively(data, oldNameUpper, newNameUpper);
            if (JSON.stringify(data) !== JSON.stringify(updatedData)) {
              await dbRun(db, 'UPDATE kv_store SET value = ? WHERE key = ?', [
                JSON.stringify(updatedData),
                row.key
              ]);
              updatedDbRowsCount++;
            }
          } catch (e) {
            console.error(`[RENOMBRADO-SQLITE] Error al procesar clave ${row.key}:`, e);
          }
        }
      }
    } catch (dbErr) {
      console.error('[RENOMBRADO-SQLITE] Error al actualizar bases de datos SQLite:', dbErr);
    }

    console.log(`[APARCAMIENTOS] Renombrado exitoso de "${oldNameUpper}" a "${newNameUpper}". Se actualizaron ${updatedFilesCount} archivos JSON y ${updatedDbRowsCount} registros SQLite.`);
    return { success: true, updatedFilesCount, updatedDbRowsCount };
  } catch (error) {
    console.error('[APARCAMIENTOS] Error en rename-aparcamiento handler:', error);
    return { success: false, error: error.message };
  }
});

// 13. Nuevo handler IPC para la importación manual de JSONs legados
ipcMain.handle('import-json-data', async (event, coordFolder, fileName, jsonContent) => {
  try {
    const relativePath = `${coordFolder}/${fileName}`;
    const db = await getDatabaseForCoordinator(coordFolder);
    
    // Validar que el jsonContent es válido parseándolo
    const data = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;
    
    await dbRun(db, 'INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', [
      relativePath,
      JSON.stringify(data)
    ]);
    
    console.log(`[SQLITE-IMPORT] Importación manual completada con éxito para: ${relativePath}`);
    return { success: true };
  } catch (error) {
    console.error(`[SQLITE-IMPORT] Error al importar JSON legado:`, error);
    return { success: false, error: error.message };
  }
});

// 13.1. Handler IPC para cerrar la aplicación de forma limpia
ipcMain.handle('app-close', async () => {
  app.quit();
  return { success: true };
});

// 14. Handler de Migración de Deudas legacy a SQLite relacional
ipcMain.handle('migrar-json-deutes', async (event, { dataJSON }) => {
  try {
    const deudasOld = typeof dataJSON === 'string' ? JSON.parse(dataJSON) : dataJSON;

    return new Promise((resolve) => {
      db.serialize(() => {
        db.run("BEGIN TRANSACTION;");
          
        const stmt = db.prepare(`
          INSERT INTO deutes (comercial, cliente, import, fecha, activo)
          VALUES (?, ?, ?, ?, 1)
        `);

        deudasOld.forEach(d => {
          let valorImport = typeof d.import === 'string' 
            ? Number(d.import.replace(',', '.')) 
            : Number(d.import);
          stmt.run(d.comercial, d.cliente, valorImport, d.fecha);
        });

        stmt.finalize();
        db.run("COMMIT;", (err) => {
          if (err) {
            db.run("ROLLBACK;");
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true, total: deudasOld.length });
          }
        });
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 14.1. Handler de Migración de Comerciales (Precios de Aparcamientos) legacy a SQLite
ipcMain.handle('migrar-json-comercials', async (event, { dataJSON }) => {
  return new Promise(async (resolve) => {
    try {
      const data = typeof dataJSON === 'string' ? JSON.parse(dataJSON) : dataJSON;
      const dbComercial = obtenerConexionLocal('comercial');
      
      dbComercial.serialize(() => {
        dbComercial.run("BEGIN TRANSACTION;");
        
        const stmt = dbComercial.prepare(`
          INSERT OR REPLACE INTO kv_store (key, value, updated_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
        `);
        
        let insertados = 0;
        
        for (const [key, value] of Object.entries(data)) {
          const isLegacyA = key.startsWith('nn_A_');
          const isLegacyL = key.startsWith('nn_L_');
          const isModernAlbert = key.startsWith('comercials_albert_');
          const isModernLaura = key.startsWith('comercials_laura_');
          
          if (!isLegacyA && !isLegacyL && !isModernAlbert && !isModernLaura) {
            continue;
          }
          
          let coordId = '';
          let coordNombre = '';
          let mes = '';
          let año = '2026';
          
          if (isLegacyA) {
            coordId = 'albert';
            coordNombre = 'Albert';
            const parts = key.split('_');
            mes = parts[2];
            if (parts.length > 3) año = parts[3];
          } else if (isLegacyL) {
            coordId = 'laura';
            coordNombre = 'Laura';
            const parts = key.split('_');
            mes = parts[2];
            if (parts.length > 3) año = parts[3];
          } else if (isModernAlbert) {
            coordId = 'albert';
            coordNombre = 'Albert';
            const parts = key.split('_');
            mes = parts[2];
            if (parts.length > 3) año = parts[3];
          } else if (isModernLaura) {
            coordId = 'laura';
            coordNombre = 'Laura';
            const parts = key.split('_');
            mes = parts[2];
            if (parts.length > 3) año = parts[3];
          }
          
          if (!mes) continue;
          
          const targetKey = `dades ${coordNombre}/comercials_${coordId}_${mes}_${año}`;
          stmt.run(targetKey, JSON.stringify(value));
          insertados++;
        }
        
        stmt.finalize();
        
        dbComercial.run("COMMIT;", (err) => {
          if (err) {
            dbComercial.run("ROLLBACK;");
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true, total: insertados });
          }
        });
      });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
});

// 15. Handler de Migración de Cuadrante legacy a SQLite relacional
ipcMain.handle('migrar-json-cuadrante', async (event, { dataJSON }) => {
  return new Promise(async (resolve) => {
    try {
      const data = typeof dataJSON === 'string' ? JSON.parse(dataJSON) : dataJSON;
      
      db.serialize(() => {
        db.run("BEGIN TRANSACTION;");

        db.all("SELECT id, nombre FROM agentes", [], (err, agentes) => {
          if (err) {
            db.run("ROLLBACK;");
            return resolve({ success: false, error: err.message });
          }

          db.all("SELECT id, nombre FROM aparcamientos", [], (err, parkings) => {
            if (err) {
              db.run("ROLLBACK;");
              return resolve({ success: false, error: err.message });
            }

            const agentesMap = new Map(agentes.map(a => [a.nombre.toUpperCase(), a.id]));
            const parkingsMap = new Map(parkings.map(p => [p.nombre.toUpperCase(), p.id]));

            const stmt = db.prepare(`
              INSERT OR REPLACE INTO quadrant (fecha, aparcamiento_id, agente_id, turno, hora_inicio, hora_fin, es_substitucio, nota)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);

            let insertados = 0;
            let agentesNuevos = new Set();
            let parkingsNuevos = new Set();

            for (const [key, value] of Object.entries(data)) {
              if (!key.startsWith('nyn_v12_')) continue;

              const parts = key.split('_');
              if (parts.length < 7) continue;

              const año = parts[2];
              const mes = parts[3];
              const dia = parts[parts.length - 1];
              const turno = parts[parts.length - 2];
              const nombreParking = parts.slice(4, parts.length - 2).join(' ').toUpperCase();

              let cellData = {};
              try {
                cellData = typeof value === 'string' ? JSON.parse(value) : value;
              } catch (e) {
                continue;
              }

              const wName = (cellData.w || "-").trim();
              const hRange = (cellData.h || "-").trim();
              const esSub = cellData.s ? 1 : 0;
              const notaText = cellData.n || "";

              if (wName === "-" || wName === "") continue;

              let parkingId = parkingsMap.get(nombreParking);
              if (!parkingId) {
                parkingsNuevos.add(nombreParking);
                continue;
              }

              let agenteId = agentesMap.get(wName.toUpperCase());
              if (!agenteId) {
                agentesNuevos.add(wName);
                continue;
              }

              const mesNum = (Number(mes) + 1).toString().padStart(2, '0');
              const diaNum = Number(dia).toString().padStart(2, '0');
              const fechaStr = `${año}-${mesNum}-${diaNum}`;

              const hoursParts = hRange.split('-');
              const horaInicio = hoursParts[0] || '06:00';
              const horaFin = hoursParts[1] || '14:00';

              stmt.run(fechaStr, parkingId, agenteId, turno, horaInicio, horaFin, esSub, notaText);
              insertados++;
            }

            stmt.finalize();

            if (agentesNuevos.size > 0 || parkingsNuevos.size > 0) {
              // Insertamos los agentes y parkings faltantes preventivamente
              agentesNuevos.forEach(agName => {
                db.run("INSERT OR IGNORE INTO agentes (nombre, activo) VALUES (?, 1)", [agName]);
              });
              parkingsNuevos.forEach(pkName => {
                db.run("INSERT OR IGNORE INTO aparcamientos (nombre, sociedad_id, activo) VALUES (?, 1, 1)", [pkName]);
              });
              
              db.run("ROLLBACK;");
              resolve({ 
                success: false, 
                error: `Catálogos no sincronizados. Hemos insertado preventivamente ${agentesNuevos.size} agentes y ${parkingsNuevos.size} aparcamientos nuevos. Por favor, vuelve a iniciar la importación para migrar los turnos relacionales.`
              });
            } else {
              db.run("COMMIT;", (err) => {
                if (err) {
                  db.run("ROLLBACK;");
                  resolve({ success: false, error: err.message });
                } else {
                  resolve({ success: true, total: insertados });
                }
              });
            }
          });
        });
      });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
});

// 15.1. Handler para seleccionar múltiples archivos JSON desde diálogos del sistema
ipcMain.handle('seleccionar-archivos-migracion', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Seleccionar archivos JSON legados',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile', 'multiSelections']
    });
    
    if (canceled || filePaths.length === 0) {
      return { success: false, reason: 'Cancelado por el usuario' };
    }
    
    const files = filePaths.map(filePath => {
      const name = path.basename(filePath);
      const raw = fs.readFileSync(filePath, 'utf8');
      return { name, content: JSON.parse(raw) };
    });
    
    return { success: true, files };
  } catch (error) {
    console.error('[SELECT-MIGRACION] Error al seleccionar archivos:', error);
    return { success: false, error: error.message };
  }
});

// 15.2. Handler para forzar la copia de seguridad interactiva pre-migración de la base de datos
ipcMain.handle('crear-backup-migracion', async (event, { tipo }) => {
  try {
    let dbKey = 'operativa';
    if (tipo === 'comerciales' || tipo === 'precios') {
      dbKey = 'comercial';
    } else if (tipo === 'deudas') {
      dbKey = 'operativa';
    } else if (tipo === 'gastos' || tipo === 'rutas') {
      dbKey = 'finanzas';
    }
    
    const dbFile = DBS[dbKey];
    if (!dbFile) {
      return { success: false, error: 'Tipo de datos no asociado a una base de datos válida.' };
    }
    
    const localDbPath = path.join(localDir, dbFile);
    if (!fs.existsSync(localDbPath)) {
      return { success: false, error: `El archivo local de base de datos no existe: ${dbFile}` };
    }
    
    const fecha = new Date().toISOString().split('T')[0];
    const defaultName = `Backup_PreMigracion_${tipo}_${fecha}.db`;
    
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Guardar copia de seguridad de base de datos',
      defaultPath: defaultName,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }]
    });
    
    if (canceled || !filePath) {
      return { success: false, reason: 'Cancelado por el usuario' };
    }
    
    fs.copyFileSync(localDbPath, filePath);
    console.log(`[BACKUP-MIGRACION] Copia de seguridad guardada con éxito en: ${filePath}`);
    return { success: true, filePath };
  } catch (error) {
    console.error('[BACKUP-MIGRACION] Error al crear la copia de seguridad:', error);
    return { success: false, error: error.message };
  }
});

// 16. Asistente para proponer agentes en el cuadrante inteligente
ipcMain.handle('obtener-propuestas-asistente', async (event, { fecha, aparcamientoId }) => {
  try {
    const reglas = await obtenerReglasConfiguradas(db);
    
    // Obtener datos del aparcamiento destino
    const parkingDestino = await dbGet(`SELECT * FROM aparcamientos WHERE id = ?`, [aparcamientoId]);
    if (!parkingDestino) return { sugeridos: [], restringidos: [], error: "Aparcamiento no encontrado" };
    
    // Obtener agentes de vacaciones ese día (Exclusión Absoluta)
    const agentesVacaciones = await dbAll(`SELECT agente_id FROM vacances WHERE ? BETWEEN fecha_inicio AND fecha_fin`, [fecha]);
    const vacacionesSet = new Set(agentesVacaciones.map(v => v.agente_id));

    // Obtener agentes ya ocupados ese día (Exclusión Absoluta)
    const agentesOcupados = await dbAll(`SELECT agente_id FROM quadrant WHERE fecha = ?`, [fecha]);
    const ocupadosSet = new Set(agentesOcupados.map(o => o.agente_id));

    // Obtener contratos vigentes de los agentes para la fecha seleccionada (Snapshot de Sociedades)
    const contratos = await dbAll(`
      SELECT agente_id, sociedad_id 
      FROM contratos_agentes 
      WHERE ? >= fecha_inicio AND (fecha_fin IS NULL OR ? <= fecha_fin)
    `, [fecha, fecha]);
    const contratosMap = new Map(contratos.map(c => [c.agente_id, c.sociedad_id]));

    // Obtener recuento de días trabajados por agente este mes (Tope mensual)
    const mesBusqueda = fecha.substring(0, 7) + '%';
    const recuentoMensual = await dbAll(`SELECT agente_id, COUNT(*) as dias FROM quadrant WHERE fecha LIKE ? GROUP BY agente_id`, [mesBusqueda]);
    const diasTrabajadosMap = new Map(recuentoMensual.map(r => [r.agente_id, r.dias]));

    // Traer todos los agentes activos
    const todosAgentes = await dbAll("SELECT * FROM agentes WHERE activo = 1 ORDER BY ranking_score DESC");

    const sugeridos = [];
    const restringidos = [];

    todosAgentes.forEach(agente => {
      // REGLA EMPRESA EXTERNA DE SEGURIDAD (CARTA BLANCA)
      if (agente.es_empresa_externa === 1) {
        agente.motivo_exclusivo = "Proveedor Externo: Sin restricciones de jornada o sociedades.";
        sugeridos.push(agente);
        return;
      }

      // EXCLUSIÓN 1: Vacaciones o Baja
      if (vacacionesSet.has(agente.id)) {
        agente.motivo_bloqueo = "Está disfrutando de su periodo de vacaciones o baja.";
        restringidos.push(agente);
        return;
      }

      // EXCLUSIÓN 2: Duplicidad de Turno (Ya trabaja hoy)
      if (ocupadosSet.has(agente.id)) {
        agente.motivo_bloqueo = "Ya tiene un turno asignado en otro aparcamiento este mismo día.";
        restringidos.push(agente);
        return;
      }

      // Análisis de Soft Constraints
      agente.advertencias = [];
      agente.sociedad_contrato_id = contratosMap.get(agente.id);
      agente.dias_mes_actual = diasTrabajadosMap.get(agente.id) || 0;

      // Regla de Sociedades Contractuales
      if (agente.sociedad_contrato_id !== parkingDestino.sociedad_id) {
        agente.advertencias.push(`Conflicto de sociedad: El agente pertenece a una sociedad distinta a la del parking.`);
      }

      // Regla de Tope de días mensuales
      if (agente.dias_mes_actual >= reglas.max_dias_mensuales) {
        agente.advertencias.push(`Exceso de jornada: Lleva ${agente.dias_mes_actual} días asignados este mes (Tope: ${reglas.max_dias_mensuales}).`);
      }

      sugeridos.push(agente);
    });

    return { sugeridos, restringidos };
  } catch (error) {
    console.error("[Asistente Error] Fallo al proponer agentes:", error);
    return { sugeridos: [], restringidos: [], error: error.message };
  }
});

// 17. Handler de Validación y Generación de Alertas Dinámicas en Caliente
ipcMain.handle('calcular-alertas-cuadrante', async (event, { fechaInicio, fechaFin }) => {
  try {
    const reglas = await obtenerReglasConfiguradas(db);
    
    // Obtener asignaciones de quadrant en el rango
    const turnosQuadrant = await dbAll(`
      SELECT * FROM quadrant 
      WHERE fecha >= ? AND fecha <= ?
    `, [fechaInicio, fechaFin]);

    // Obtener agentes activos con sus contratos vigentes
    const agentes = await dbAll(`SELECT * FROM agentes WHERE activo = 1`);
    const contratos = await dbAll(`
      SELECT agente_id, sociedad_id 
      FROM contratos_agentes 
      WHERE (fecha_inicio <= ? AND (fecha_fin IS NULL OR fecha_fin >= ?))
    `, [fechaFin, fechaInicio]);
    const contratosMap = new Map(contratos.map(c => [c.agente_id, c.sociedad_id]));
    
    agentes.forEach(a => {
      a.sociedad_contrato_id = contratosMap.get(a.id) || null;
    });

    // Obtener aparcamientos
    const aparcamientos = await dbAll(`SELECT * FROM aparcamientos WHERE activo = 1`);

    // Obtener coberturas obligatorias
    const coberturasRequeridas = await dbAll(`SELECT * FROM coberturas_requeridas WHERE activo = 1`);

    // Calcular las alertas
    const alertas = calcularSituacionesQueSolucionar(turnosQuadrant, agentes, aparcamientos, coberturasRequeridas, reglas);
    return { success: true, alertas };
  } catch (error) {
    console.error("[Validación Error] Fallo al calcular alertas relacionales:", error);
    return { success: false, error: error.message };
  }
});

// Motor de Validación de Reglas de Operaciones (Soft Constraints) en Caliente
function calcularSituacionesQueSolucionar(turnosQuadrant, agentes, aparcamientos, coberturasRequeridas, reglas) {
  const situaciones = [];
    
  // Agrupadores temporales para cálculos complejos
  const horasPorAgenteSemanal = {};    // { agenteId_semana: totalHoras }
  const coberturaPorParkingDiaria = {};  // { parkingId_fecha_turno: countAgentes }
  const turnosPorAgente = {};           // { agenteId: Array[turnos] }

  // Mapeamos catálogos para búsqueda rápida (O(1))
  const agentesMap = new Map(agentes.map(a => [a.id, a]));
  const parkingsMap = new Map(aparcamientos.map(p => [p.id, p]));

  // Primer barrido: Análisis de asignaciones individuales
  turnosQuadrant.forEach(turno => {
    const agente = agentesMap.get(turno.agente_id);
    const parking = parkingsMap.get(turno.aparcamiento_id);
    if (!agente || !parking) return;

    // --- REGLA D: Control de Sociedades (No Bloqueante) ---
    if (agente.es_empresa_externa === 0 && agente.sociedad_contrato_id !== parking.sociedad_id) {
      situaciones.push({
        id: `cruce_${turno.id}`,
        tipo: 'cruce_sociedad',
        gravedad: 'media',
        fecha: turno.fecha,
        agenteNombre: agente.nombre,
        parkingNombre: parking.nombre,
        turno: turno.turno,
        mensaje: `El agente propio ${agente.nombre} está asignado en ${parking.nombre} (Sociedades diferentes).`
      });
    }

    // --- Mapeo para Cobertura Obligatoria por Parking (Regla F) ---
    const keyCobertura = `${turno.aparcamiento_id}_${turno.fecha}_${turno.turno}`;
    coberturaPorParkingDiaria[keyCobertura] = (coberturaPorParkingDiaria[keyCobertura] || 0) + 1;

    // También guardamos una clave general diaria para el control de vaciado general laborable L-V
    const keyVacioLaboral = `${turno.aparcamiento_id}_${turno.fecha}`;
    coberturaPorParkingDiaria[keyVacioLaboral] = (coberturaPorParkingDiaria[keyVacioLaboral] || 0) + 1;

    // --- Mapeo de Horas Semanales ---
    if (agente.es_empresa_externa === 0) {
      const numSemana = obtenerNumeroSemana(turno.fecha);
      const keyHoras = `${turno.agente_id}_sem_${numSemana}`;
      horasPorAgenteSemanal[keyHoras] = (horasPorAgenteSemanal[keyHoras] || 0) + (turno.horas_trabajadas || 8);
    }

    // --- Mapeo para Validación del Descanso de 12 Horas ---
    if (agente.es_empresa_externa === 0) {
      if (!turnosPorAgente[turno.agente_id]) {
        turnosPorAgente[turno.agente_id] = [];
      }
      turnosPorAgente[turno.agente_id].push(turno);
    }
  });

  // --- REGLAS B & F: Análisis de Coberturas Obligatorias y Vaciados ---
  const fechasUnicas = [...new Set(turnosQuadrant.map(t => t.fecha))];

  fechasUnicas.forEach(fecha => {
    const diaSemana = obtenerDiaSemanaNum(fecha); // 1 = Lunes, ..., 7 = Domingo

    aparcamientos.forEach(parking => {
      // 1. Control de coberturas de turnos concretos
      const coberturasDelParking = coberturasRequeridas.filter(c => 
        c.aparcamiento_id === parking.id && 
        c.activo === 1 &&
        (c.fecha === fecha || (c.dia_semana === diaSemana && c.fecha === null))
      );
        
      coberturasDelParking.forEach(cob => {
        const keyCobCheck = `${parking.id}_${fecha}_${cob.turno}`;
        const asignadosEnTurno = coberturaPorParkingDiaria[keyCobCheck] || 0;

        if (asignadosEnTurno === 0) {
          const esExtraordinaria = cob.fecha !== null;
          const tipoServiceText = esExtraordinaria ? "SERVICIO EXTRAORDINARIO" : "cobertura recurrente";
            
          situaciones.push({
            id: `req_shift_${parking.id}_${fecha}_${cob.turno}`,
            tipo: 'turno_obligatorio_vacio',
            gravedad: 'alta',
            fecha: fecha,
            parkingNombre: parking.nombre,
            turno: cob.turno,
            mensaje: `¡Alerta! El aparcamiento "${parking.nombre}" requiere un ${tipoServiceText} el día ${formatearFecha(fecha)} en el turno de ${cob.turno} y no hay nadie asignado.`
          });
        }
      });

      // 2. Control de vaciado completo en días laborables L-V
      if (!reglas.permitir_vacio_laborables && parking.es_remotizado === 0 && parking.permitir_vacio_laborables === 0) {
        if (esDiaLaborable(fecha)) {
          const keyVacioCheck = `${parking.id}_${fecha}`;
          const agentesAsignadosTotales = coberturaPorParkingDiaria[keyVacioCheck] || 0;

          if (agentesAsignadosTotales === 0) {
            situaciones.push({
              id: `vacio_gral_${parking.id}_${fecha}`,
              tipo: 'vacio_laborable',
              gravedad: 'alta',
              fecha: fecha,
              parkingNombre: parking.nombre,
              mensaje: `El parking presencial obligatorio "${parking.nombre}" está completamente desatendido el ${formatearFecha(fecha)}.`
            });
          }
        }
      }
    });
  });

  // --- REGLA A: Análisis de Horas Máximas acumuladas semanales ---
  const limiteHoras = reglas.max_horas_semanales || 40;
  for (const [key, horas] of Object.entries(horasPorAgenteSemanal)) {
    if (horas > limiteHoras) {
      const [agenteId, , numSemana] = key.split('_');
      const agente = agentesMap.get(Number(agenteId));
      situaciones.push({
        id: `horas_${key}`,
        tipo: 'exceso_horas',
        gravedad: 'media',
        agenteNombre: agente ? agente.nombre : 'Agente',
        mensaje: `El agente ${agente ? agente.nombre : 'de plantilla'} supera el límite de ${limiteHoras}h en la semana ${numSemana} (Lleva ${horas}h asignadas).`
      });
    }
  }

  // --- REGLA E: Descanso mínimo de 12 horas entre turnos consecutivos ---
  const minDescanso = reglas.min_horas_descanso_entre_turnos || 12;

  for (const [agenteId, turnos] of Object.entries(turnosPorAgente)) {
    const agente = agentesMap.get(Number(agenteId));
    if (!agente) continue;

    const turnosIntervalos = turnos.map(t => {
      const { inicio, fin } = calcularTiemposExactosTurno(t.fecha, t.hora_inicio, t.hora_fin);
      const parking = parkingsMap.get(t.aparcamiento_id);
      return { turnoId: t.id, fecha: t.fecha, inicio, fin, turno: t.turno, parkingNombre: parking ? parking.nombre : '' };
    });

    // Ordenamos cronológicamente todos los turnos asignados al agente
    turnosIntervalos.sort((a, b) => a.inicio - b.inicio);

    // Comparamos el fin del turno anterior con el inicio del actual
    for (let i = 1; i < turnosIntervalos.length; i++) {
      const actual = turnosIntervalos[i];
      const anterior = turnosIntervalos[i - 1];

      // Diferencia en horas entre el inicio del turno actual y el fin del anterior
      const diferenciaMilisegundos = actual.inicio - anterior.fin;
      const horasDescanso = diferenciaMilisegundos / (1000 * 60 * 60);

      if (horasDescanso >= 0 && horasDescanso < minDescanso) {
        situaciones.push({
          id: `descanso_${actual.turnoId}`,
          tipo: 'descanso_insuficiente',
          gravedad: 'alta',
          fecha: actual.fecha,
          agenteNombre: agente.nombre,
          parkingNombre: actual.parkingNombre,
          turno: actual.turno,
          mensaje: `Descanso insuficiente para ${agente.nombre}: Solo transcurren ${horasDescanso.toFixed(1)}h de descanso entre el turno del ${formatearFecha(anterior.fecha)} y el del ${formatearFecha(actual.fecha)} (Mínimo: ${minDescanso}h).`
        });
      }
    }
  }

  return situaciones;
}

function calcularTiemposExactosTurno(fechaStr, horaInicioStr, horaFinStr) {
  const inicio = new Date(`${fechaStr}T${horaInicioStr}:00`);
  let fin = new Date(`${fechaStr}T${horaFinStr}:00`);

  // Si la hora de fin es menor que la de inicio, el turno finaliza al día siguiente (ej: 22:00 a 06:00)
  if (fin < inicio) {
    fin.setDate(fin.getDate() + 1);
  }

  return { inicio, fin };
}

function esDiaLaborable(fechaString) {
  const d = new Date(fechaString);
  const dia = d.getDay(); // 0 = Domingo, 6 = Sábado
  return dia >= 1 && dia <= 5;
}

function obtenerDiaSemanaNum(fechaString) {
  const d = new Date(fechaString);
  const dia = d.getDay(); 
  return dia === 0 ? 7 : dia; 
}

function obtenerNumeroSemana(fechaString) {
  const d = new Date(fechaString);
  const primeroDeAño = new Date(d.getFullYear(), 0, 1);
  const dias = Math.floor((d - primeroDeAño) / (24 * 60 * 60 * 1000));
  return Math.ceil((dias + primeroDeAño.getDay() + 1) / 7);
}

function formatearFecha(fechaString) {
  const [año, mes, dia] = fechaString.split('-');
  return `${dia}/${mes}/${año}`;
}

// --- SISTEMA DE DOBLE BACKUP LOCAL ---

/**
 * Realiza una copia diaria en la carpeta Documentos locales del usuario.
 * @param {string} dbPath - Ruta de la BD activa actual
 */
function realizarBackupDiario(dbPath) {
  try {
    if (!dbPath || !fs.existsSync(dbPath)) return;

    // Intentamos leer el nombre del coordinador del config
    let coordinadorName = 'General';
    try {
      const configData = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      if (configData.coordinador) coordinadorName = configData.coordinador;
    } catch(e) {}

    const baseDir = path.join(app.getPath('documents'), 'Coordinadores_Backups', `dades_${coordinadorName}`);
    const diarioDir = path.join(baseDir, 'Diario');
    
    if (!fs.existsSync(diarioDir)) fs.mkdirSync(diarioDir, { recursive: true });

    const destino = path.join(diarioDir, `dades_${coordinadorName}_diario.db`);
    fs.copyFileSync(dbPath, destino);
    console.log(`[Backup] Copia diaria local guardada en: ${destino}`);
  } catch (e) {
    console.error("[Backup Error] Fallo al realizar la copia diaria:", e);
  }
}

/**
 * Comprueba si el mes ha cambiado y realiza una foto histórica inmutable del mes anterior.
 * @param {string} dbPath - Ruta de la BD activa actual
 */
function verificarCierreMensual(dbPath) {
  try {
    if (!dbPath || !fs.existsSync(dbPath)) return;

    let coordinadorName = 'General';
    try {
      const configData = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      if (configData.coordinador) coordinadorName = configData.coordinador;
    } catch(e) {}

    const fecha = new Date();
    let mesCierre = fecha.getMonth(); // getMonth() devuelve 0-11, el mes pasado es directamente getMonth()
    let añoCierre = fecha.getFullYear();
    
    // Si estamos en Enero (0), el mes a cerrar es Diciembre (12) del año pasado
    if (mesCierre === 0) {
      mesCierre = 12;
      añoCierre -= 1;
    }

    const baseDir = path.join(app.getPath('documents'), 'Coordinadores_Backups', `dades_${coordinadorName}`);
    const historicoDir = path.join(baseDir, 'Historico');
    
    if (!fs.existsSync(historicoDir)) fs.mkdirSync(historicoDir, { recursive: true });

    const mesStr = mesCierre.toString().padStart(2, '0');
    const destino = path.join(historicoDir, `dades_${coordinadorName}_${añoCierre}_${mesStr}.db`);

    // Si la foto histórica de ese mes y año NO existe aún, la creamos
    if (!fs.existsSync(destino)) {
      fs.copyFileSync(dbPath, destino);
      console.log(`[Backup] Cierre mensual histórico congelado en: ${destino}`);
    } else {
      console.log(`[Backup] El cierre del mes ${mesStr}/${añoCierre} ya estaba realizado.`);
    }
  } catch (e) {
    console.error("[Backup Error] Fallo al realizar el cierre mensual:", e);
  }
}

// --- GESTIÓN DEL CUADRANTE EN SQLITE ---

// Leer turnos de un mes/periodo concreto
ipcMain.handle('get-turnos-cuadrante', async (event, { fechaInicio, fechaFin }) => {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("DB no inicializada"));
    
    const sql = `
      SELECT q.*, a.nombre as agente_nombre, ap.nombre as aparcamiento_nombre 
      FROM quadrant q
      JOIN agentes a ON q.agente_id = a.id
      JOIN aparcamientos ap ON q.aparcamiento_id = ap.id
      WHERE q.fecha >= ? AND q.fecha <= ?
    `;
    
    db.all(sql, [fechaInicio, fechaFin], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
});

// Guardar o actualizar un turno individual
ipcMain.handle('save-turno-cuadrante', async (event, turnoData) => {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("DB no inicializada"));
    
    // Primero buscamos si ya existe ese turno exacto (misma fecha, parking y turno) para hacer UPDATE
    const sqlCheck = "SELECT id FROM quadrant WHERE fecha = ? AND aparcamiento_id = ? AND turno = ?";
    db.get(sqlCheck, [turnoData.fecha, turnoData.aparcamiento_id, turnoData.turno], (err, row) => {
      if (err) return reject(err);

      if (row) {
        // Actualizamos el existente
        const sqlUpdate = `
          UPDATE quadrant 
          SET agente_id = ?, hora_inicio = ?, hora_fin = ?, horas_trabajadas = ? 
          WHERE id = ?
        `;
        db.run(sqlUpdate, [turnoData.agente_id, turnoData.hora_inicio, turnoData.hora_fin, turnoData.horas_trabajadas, row.id], function(errUpd) {
          if (errUpd) reject(errUpd); else resolve({ success: true, id: row.id, action: 'updated' });
        });
      } else {
        // Insertamos uno nuevo
        const sqlInsert = `
          INSERT INTO quadrant (fecha, aparcamiento_id, agente_id, turno, hora_inicio, hora_fin, horas_trabajadas)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        db.run(sqlInsert, [turnoData.fecha, turnoData.aparcamiento_id, turnoData.agente_id, turnoData.turno, turnoData.hora_inicio, turnoData.hora_fin, turnoData.horas_trabajadas], function(errIns) {
          if (errIns) reject(errIns); else resolve({ success: true, id: this.lastID, action: 'inserted' });
        });
      }
    });
  });
});

// Borrar un turno (cuando el coordinador vacía una celda)
ipcMain.handle('delete-turno-cuadrante', async (event, { fecha, aparcamiento_id, turno }) => {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("DB no inicializada"));
    const sql = "DELETE FROM quadrant WHERE fecha = ? AND aparcamiento_id = ? AND turno = ?";
    db.run(sql, [fecha, aparcamiento_id, turno], function(err) {
      if (err) reject(err);
      else resolve({ success: true, deleted: this.changes });
    });
  });
});

// --- MOTOR INTELIGENTE: ASISTENTE DE CUADRANTE ---
ipcMain.handle('obtener-recomendaciones-cuadrante', async (event, { fecha, aparcamientoId }) => {
  return new Promise(async (resolve, reject) => {
    if (!db) return reject(new Error("DB no inicializada"));

    try {
      // 1. Obtener la parametrización de topes desde la BD (por defecto 22 si no existe)
      let topeMensual = 22; 
      try {
        const rowTope = await new Promise((res, rej) => {
          db.get("SELECT valor FROM reglas_config WHERE clave = 'max_dias_mensuales'", [], (err, r) => err ? rej(err) : res(r));
        });
        if (rowTope) topeMensual = parseInt(rowTope.valor) || 22;
      } catch (e) { console.warn("Usando tope de días por defecto."); }

      // 2. Extraer el mes para la búsqueda (Ej: '2026-06%')
      const mesBusqueda = fecha.substring(0, 7) + '%';

      // 3. Consulta maestra de Inteligencia de Operaciones
      const sql = `
        SELECT 
            a.id, 
            a.nombre, 
            a.ranking_score,
            a.es_empresa_externa,
            -- Días trabajados este mes
            (SELECT COUNT(*) FROM quadrant q WHERE q.agente_id = a.id AND q.fecha LIKE ?) as dias_mes_actual,
            -- ¿Está de vacaciones hoy?
            (SELECT COUNT(*) FROM vacances v WHERE v.agente_id = a.id AND ? BETWEEN v.fecha_inicio AND v.fecha_fin) as en_vacaciones,
            -- ¿Ya trabaja hoy en otro sitio?
            (SELECT COUNT(*) FROM quadrant q2 WHERE q2.agente_id = a.id AND q2.fecha = ?) as trabajando_hoy
        FROM agentes a
        WHERE a.activo = 1
        ORDER BY a.ranking_score DESC;
      `;

      db.all(sql, [mesBusqueda, fecha, fecha], (err, rows) => {
        if (err) return reject(err);

        const sugeridos = [];
        const descartados = [];

        rows.forEach(agente => {
          // Las empresas de seguridad externas siempre se sugieren primero y no tienen límites
          if (agente.es_empresa_externa === 1) {
            agente.motivo_descarte = null;
            agente.tipo = "EMPRESA SEGURIDAD";
            sugeridos.unshift(agente); // Poner al principio
            return;
          }

          if (agente.en_vacaciones > 0) {
            agente.motivo_descarte = "De vacaciones / Baja";
            descartados.push(agente);
          } else if (agente.trabajando_hoy > 0) {
            agente.motivo_descarte = "Ya asignado a otro parking hoy";
            descartados.push(agente);
          } else if (agente.dias_mes_actual >= topeMensual) {
            agente.motivo_descarte = `Al tope mensual (Lleva ${agente.dias_mes_actual}/${topeMensual} días)`;
            descartados.push(agente);
          } else {
            // Está libre, no tiene vacaciones y no ha superado el tope
            agente.motivo_descarte = null;
            sugeridos.push(agente);
          }
        });

        resolve({ sugeridos, descartados });
      });
    } catch (error) {
      reject(error);
    }
  });
});

// --- GESTIÓN DE VACACIONES (SQLITE) ---

ipcMain.handle('get-vacaciones-relacional', async () => {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("DB no inicializada"));
    // Obtenemos las vacaciones cruzando con el nombre del agente
    const sql = `
      SELECT v.id, v.agente_id, a.nombre as agente_nombre, v.fecha_inicio, v.fecha_fin
      FROM vacances v
      JOIN agentes a ON v.agente_id = a.id
      ORDER BY v.fecha_inicio ASC
    `;
    db.all(sql, [], (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });
});

ipcMain.handle('save-vacacion-relacional', async (event, { agente_id, fecha_inicio, fecha_fin }) => {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("DB no inicializada"));
    const sql = "INSERT INTO vacances (agente_id, fecha_inicio, fecha_fin) VALUES (?, ?, ?)";
    db.run(sql, [agente_id, fecha_inicio, fecha_fin], function(err) {
      if (err) reject(err); else resolve({ success: true, id: this.lastID });
    });
  });
});

ipcMain.handle('delete-vacacion-relacional', async (event, { id }) => {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("DB no inicializada"));
    const sql = "DELETE FROM vacances WHERE id = ?";
    db.run(sql, [id], function(err) {
      if (err) reject(err); else resolve({ success: true });
    });
  });
});

// Importador masivo desde JSON de Vacaciones antiguo
ipcMain.handle('migrar-json-vacaciones', async (event, { dataJSON }) => {
  return new Promise(async (resolve, reject) => {
    if (!db) return reject(new Error("DB no inicializada"));
    
    // Traemos los agentes para mapear el nombre antiguo al ID de SQLite
    const agentes = await new Promise((res, rej) => db.all("SELECT id, nombre FROM agentes", [], (e, rows) => e ? rej(e) : res(rows)));
    
    db.serialize(() => {
      db.run("BEGIN TRANSACTION;");
      const stmt = db.prepare("INSERT INTO vacances (agente_id, fecha_inicio, fecha_fin) VALUES (?, ?, ?)");
      
      let insertadas = 0;
      
      // La estructura vieja suele ser arrays o un objeto con nombres
      // Adaptamos de forma genérica asumiendo que dataJSON es iterado por la UI
      for (const item of dataJSON) {
        // Buscar el agente
        const agente = agentes.find(a => a.nombre.toUpperCase().includes(item.nombre.toUpperCase()));
        if (agente && item.fecha_inicio && item.fecha_fin) {
          stmt.run(agente.id, item.fecha_inicio, item.fecha_fin);
          insertadas++;
        }
      }
      
      stmt.finalize();
      db.run("COMMIT;", (err) => {
        if (err) { db.run("ROLLBACK;"); reject(err); } 
        else resolve({ success: true, total: insertadas });
      });
    });
  });
});

// --- GESTIÓN DE DEUDAS, GASTOS E INVENTARIO (SQLITE) ---

// DEUDAS
ipcMain.handle('get-deutes-relacional', async () => dbAll("SELECT * FROM deutes WHERE activo = 1 ORDER BY fecha DESC"));
ipcMain.handle('save-deute-relacional', async (e, d) => dbRun("INSERT INTO deutes (comercial, cliente, import, fecha) VALUES (?, ?, ?, ?)", [d.comercial, d.cliente, d.import, d.fecha]));
ipcMain.handle('delete-deute-relacional', async (e, id) => dbRun("DELETE FROM deutes WHERE id = ?", [id]));

// GASTOS
ipcMain.handle('get-despeses-relacional', async () => dbAll("SELECT * FROM despeses WHERE activo = 1 ORDER BY fecha DESC"));
ipcMain.handle('save-despesa-relacional', async (e, d) => dbRun("INSERT INTO despeses (fecha, comercial, concepto, importe, estado, coordinador) VALUES (?, ?, ?, ?, ?, ?)", [d.fecha, d.comercial, d.concepto, d.importe, d.estado, d.coordinador]));
ipcMain.handle('delete-despesa-relacional', async (e, id) => dbRun("DELETE FROM despeses WHERE id = ?", [id]));

// INVENTARIO
ipcMain.handle('get-inventari-relacional', async () => dbAll("SELECT * FROM inventari WHERE activo = 1 ORDER BY fecha_entrega DESC"));
ipcMain.handle('save-inventari-relacional', async (e, d) => dbRun("INSERT INTO inventari (comercial, articulo, fecha_entrega, estado, observaciones) VALUES (?, ?, ?, ?, ?)", [d.comercial, d.articulo, d.fecha_entrega, d.estado, d.observaciones]));
ipcMain.handle('delete-inventari-relacional', async (e, id) => dbRun("DELETE FROM inventari WHERE id = ?", [id]));

// --- IMPORTACIÓN CENTRALIZADA Y MIGRACIÓN LEGACY ---
ipcMain.handle('importacion-centralizada', async (event, { tipo }) => {
  try {
    // 1. Mostrar diálogo de selección de archivo JSON
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: `Seleccionar archivo JSON de ${tipo}`,
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    });

    if (canceled || filePaths.length === 0) {
      return { success: false, reason: 'Cancelado' };
    }

    const filePath = filePaths[0];
    const rawData = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(rawData);

    if (tipo === 'cuadrante') {
      const resultado = await new Promise(async (resolve) => {
        db.serialize(() => {
          db.run("BEGIN TRANSACTION;");
          db.all("SELECT id, nombre FROM agentes", [], (err, agentes) => {
            if (err) { db.run("ROLLBACK;"); return resolve({ success: false, error: err.message }); }
            db.all("SELECT id, nombre FROM aparcamientos", [], (err, parkings) => {
              if (err) { db.run("ROLLBACK;"); return resolve({ success: false, error: err.message }); }

              const agentesMap = new Map(agentes.map(a => [a.nombre.toUpperCase(), a.id]));
              const parkingsMap = new Map(parkings.map(p => [p.nombre.toUpperCase(), p.id]));

              const stmt = db.prepare(`
                INSERT OR REPLACE INTO quadrant (fecha, aparcamiento_id, agente_id, turno, hora_inicio, hora_fin, es_substitucio, nota)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `);

              let insertados = 0;
              let agentesNuevos = new Set();
              let parkingsNuevos = new Set();

              for (const [key, value] of Object.entries(data)) {
                if (!key.startsWith('nyn_v12_')) continue;

                const parts = key.split('_');
                if (parts.length < 7) continue;

                const año = parts[2];
                const mes = parts[3];
                const dia = parts[parts.length - 1];
                const turno = parts[parts.length - 2];
                const nombreParking = parts.slice(4, parts.length - 2).join(' ').toUpperCase();

                let cellData = {};
                try {
                  cellData = typeof value === 'string' ? JSON.parse(value) : value;
                } catch (e) { continue; }

                const wName = (cellData.w || "-").trim();
                const hRange = (cellData.h || "-").trim();
                const esSub = cellData.s ? 1 : 0;
                const notaText = cellData.n || "";

                if (wName === "-" || wName === "") continue;

                let parkingId = parkingsMap.get(nombreParking);
                if (!parkingId) { parkingsNuevos.add(nombreParking); continue; }

                let agenteId = agentesMap.get(wName.toUpperCase());
                if (!agenteId) { agentesNuevos.add(wName); continue; }

                const mesNum = (Number(mes) + 1).toString().padStart(2, '0');
                const diaNum = Number(dia).toString().padStart(2, '0');
                const fechaStr = `${año}-${mesNum}-${diaNum}`;

                const hoursParts = hRange.split('-');
                const horaInicio = hoursParts[0] || '06:00';
                const horaFin = hoursParts[1] || '14:00';

                stmt.run(fechaStr, parkingId, agenteId, turno, horaInicio, horaFin, esSub, notaText);
                insertados++;
              }

              stmt.finalize();

              if (agentesNuevos.size > 0 || parkingsNuevos.size > 0) {
                agentesNuevos.forEach(agName => {
                  db.run("INSERT OR IGNORE INTO agentes (nombre, activo) VALUES (?, 1)", [agName]);
                });
                parkingsNuevos.forEach(pkName => {
                  db.run("INSERT OR IGNORE INTO aparcamientos (nombre, sociedad_id, activo) VALUES (?, 1, 1)", [pkName]);
                });
                db.run("ROLLBACK;");
                resolve({
                  success: false,
                  error: `Catálogos no sincronizados. Se insertaron preventivamente ${agentesNuevos.size} agentes y ${parkingsNuevos.size} aparcamientos nuevos. Vuelve a iniciar la importación para migrar los turnos.`
                });
              } else {
                db.run("COMMIT;", (err) => {
                  if (err) { db.run("ROLLBACK;"); resolve({ success: false, error: err.message }); }
                  else resolve({ success: true, total: insertados });
                });
              }
            });
          });
        });
      });
      if (resultado.success) {
        fs.renameSync(filePath, filePath + '.MIGRADO');
      }
      return resultado;
    }

    if (tipo === 'vacaciones') {
      const resultado = await new Promise(async (resolve) => {
        db.all("SELECT id, nombre FROM agentes", [], (err, agentes) => {
          if (err) return resolve({ success: false, error: err.message });

          db.serialize(() => {
            db.run("BEGIN TRANSACTION;");
            const stmt = db.prepare("INSERT INTO vacances (agente_id, fecha_inicio, fecha_fin) VALUES (?, ?, ?)");

            let insertadas = 0;
            for (const item of data) {
              const agente = agentes.find(a => a.nombre.toUpperCase().includes(item.nombre.toUpperCase()));
              if (agente && item.fecha_inicio && item.fecha_fin) {
                stmt.run(agente.id, item.fecha_inicio, item.fecha_fin);
                insertadas++;
              }
            }

            stmt.finalize();
            db.run("COMMIT;", (errCommit) => {
              if (errCommit) { db.run("ROLLBACK;"); resolve({ success: false, error: errCommit.message }); }
              else resolve({ success: true, total: insertadas });
            });
          });
        });
      });
      if (resultado.success) {
        fs.renameSync(filePath, filePath + '.MIGRADO');
      }
      return resultado;
    }

    if (tipo === 'deudas') {
      const resultado = await new Promise((resolve) => {
        db.serialize(() => {
          db.run("BEGIN TRANSACTION;");
          const stmt = db.prepare(`
            INSERT INTO deutes (comercial, cliente, import, fecha, activo)
            VALUES (?, ?, ?, ?, 1)
          `);

          data.forEach(d => {
            let valorImport = typeof d.import === 'string'
              ? Number(d.import.replace(',', '.'))
              : Number(d.import);
            stmt.run(d.comercial, d.cliente, valorImport, d.fecha);
          });

          stmt.finalize();
          db.run("COMMIT;", (err) => {
            if (err) { db.run("ROLLBACK;"); resolve({ success: false, error: err.message }); }
            else resolve({ success: true, total: data.length });
          });
        });
      });
      if (resultado.success) {
        fs.renameSync(filePath, filePath + '.MIGRADO');
      }
      return resultado;
    }

    if (tipo === 'gastos') {
      const resultado = await new Promise((resolve) => {
        db.serialize(() => {
          db.run("BEGIN TRANSACTION;");
          const stmt = db.prepare(`
            INSERT INTO despeses (fecha, comercial, concepto, importe, estado, coordinador, activo)
            VALUES (?, ?, ?, ?, ?, ?, 1)
          `);

          data.forEach(g => {
            stmt.run(g.fecha, g.comercial, g.concepto, g.importe, g.estado, g.coordinador);
          });

          stmt.finalize();
          db.run("COMMIT;", (err) => {
            if (err) { db.run("ROLLBACK;"); resolve({ success: false, error: err.message }); }
            else resolve({ success: true, total: data.length });
          });
        });
      });
      if (resultado.success) {
        fs.renameSync(filePath, filePath + '.MIGRADO');
      }
      return resultado;
    }

    return { success: false, error: 'Tipo de migración no soportado.' };
  } catch (err) {
    console.error('[IMPORT CENTRAL] Error en importacionCentralizada:', err);
    return { success: false, error: err.message };
  }
});

// --- SISTEMA DE ROLES ---
ipcMain.handle('get-user-role', () => {
  try {
    const configPath = configFile;
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return configData.role || 'comercial'; // Por seguridad, si falla, es comercial (menor privilegio)
  } catch (e) {
    return 'comercial'; 
  }
});

ipcMain.handle('get-config-coordinador', () => {
  try {
    const configPath = configFile;
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return configData.coordinador || '';
  } catch (e) {
    return '';
  }
});

ipcMain.handle('get-user-config', () => {
  try {
    const configPath = configFile;
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    return {};
  }
});

ipcMain.handle('focus-fix', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.blur();
    mainWindow.focus();
  }
  return true;
});



// Cerrar de forma limpia todas las conexiones SQLite al salir
app.on('will-quit', () => {
  console.log("Aplicación cerrándose, lanzando salvaguarda...");
  if (currentDbPath) {
    realizarBackupDiario(currentDbPath);
  }

  if (db) {
    try {
      db.close();
      console.log("[SQLITE] Conexión de base de datos única cerrada exitosamente al salir.");
    } catch (e) {
      console.error("[SQLITE] Error al cerrar conexión única:", e);
    }
  }
});
