const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');

let mainWindow;

const dbConnections = {};

// Funciones helpers para promisificar consultas de sqlite3
function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getDatabaseForCoordinator(coordFolder) {
  if (dbConnections[coordFolder]) {
    return dbConnections[coordFolder];
  }
  const dbPath = path.join(dadesDir, coordFolder, 'dades.db');
  console.log(`[SQLITE] Abriendo base de datos para coordinador en: ${dbPath}`);
  
  // Asegurar que el directorio del coordinador existe
  const parentDir = path.dirname(dbPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  const db = new sqlite3.Database(dbPath);
  
  // Crear la tabla kv_store de inmediato
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error(`[SQLITE] Error al crear tabla kv_store en ${dbPath}:`, err);
      } else {
        console.log(`[SQLITE] Tabla kv_store verificada/creada en ${dbPath}`);
      }
    });
  });

  dbConnections[coordFolder] = db;
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

// Inicialización de la aplicación
app.on('ready', () => {
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
      const db = getDatabaseForCoordinator(firstSegment);
      try {
        const row = await dbGet(db, 'SELECT value FROM kv_store WHERE key = ?', [relativePath]);
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
          await dbRun(db, 'INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', [relativePath, content]);
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
      const db = getDatabaseForCoordinator(firstSegment);
      await dbRun(db, 'INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', [
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
    { id: 'albert', nombre: 'Albert', apellido: 'Campins' },
    { id: 'laura', nombre: 'Laura', apellido: 'Navarro' }
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
ipcMain.handle('add-coordinador', async (event, nombre, apellido) => {
  try {
    const id = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
    const coordinadores = await readCoordinadoresAsync();

    // Comprobar si ya existe
    if (coordinadores.some(c => c.id === id)) {
      return { success: false, error: `El coordinador "${nombre}" ja existeix.` };
    }

    // Añadir el nuevo coordinador
    coordinadores.push({ id, nombre, apellido });
    await saveCoordinadoresAsync(coordinadores);

    // Crear la carpeta de datos del coordinador
    const userFolder = path.join(dadesDir, `dades ${nombre}`);
    if (!await fileExists(userFolder)) {
      await fs.promises.mkdir(userFolder, { recursive: true });
      console.log(`[COORDINADORES] Creada carpeta de datos: ${userFolder}`);
    }

    console.log(`[COORDINADORES] Nuevo coordinador añadido: ${nombre} ${apellido} (id: ${id})`);
    return { success: true, coordinador: { id, nombre, apellido } };
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

// 10. Obtener la lista de aparcamientos registrados
ipcMain.handle('get-aparcamientos', async () => {
  try {
    if (await fileExists(aparcamientosFile)) {
      const content = await fs.promises.readFile(aparcamientosFile, 'utf8');
      return JSON.parse(content).aparcamientos || [];
    }
  } catch (error) {
    console.error('[APARCAMIENTOS] Error al leer aparcamientos.json:', error);
  }
  return [];
});

// 11. Guardar la lista de aparcamientos registrados
ipcMain.handle('save-aparcamientos', async (event, aparcamientos) => {
  try {
    const data = { aparcamientos };
    await fs.promises.writeFile(aparcamientosFile, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[APARCAMIENTOS] Catálogo de aparcamientos actualizado. ${aparcamientos.length} registros guardados.`);
    return { success: true };
  } catch (error) {
    console.error('[APARCAMIENTOS] Error al guardar aparcamientos.json:', error);
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
        const db = getDatabaseForCoordinator(coordFolder);
        
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
    const db = getDatabaseForCoordinator(coordFolder);
    
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

// Cerrar de forma limpia todas las conexiones SQLite al salir
app.on('will-quit', () => {
  for (const coordFolder in dbConnections) {
    try {
      dbConnections[coordFolder].close();
      console.log(`[SQLITE] Conexión cerrada para coordinador: ${coordFolder}`);
    } catch (e) {
      console.error(`[SQLITE] Error al cerrar conexión para ${coordFolder}:`, e);
    }
  }
});
