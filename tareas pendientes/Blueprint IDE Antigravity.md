# **🤖 BLUEPRINT DE DESARROLLO: MIGRACIÓN A SQLITE Y MOTOR DE REGLAS**

**CONTEXTO PARA EL AGENTE DE IA (IDE):**

Eres un agente desarrollador experto en Electron.js y SQLite. Tu objetivo es refactorizar la aplicación Coordinadores App migrando su persistencia de datos (actualmente en archivos JSON fragmentados) a una arquitectura de base de datos única en SQLite con concurrencia jerárquica y un motor de reglas dinámicas de negocio.

**INSTRUCCIONES DE EJECUCIÓN:**

Debes ejecutar las siguientes fases de forma secuencial. No elimines código antiguo que no esté explícitamente mencionado; tu tarea principal es **añadir** la nueva infraestructura en el backend (main.js y preload.js) e inicializar el esquema de datos.

## **FASE 0: Dependencias**

**Objetivo:** Instalar el motor de base de datos.

**Acción:** Ejecuta en la terminal de la raíz del proyecto (coordinadores-app):

npm install sqlite3

## **FASE 1: Esquema de la Base de Datos**

**Archivo Destino:** Crea un nuevo archivo llamado coordinadores-app/schema.sql

**Acción:** Escribe exactamente el siguiente contenido. Este archivo se usará para inicializar la base de datos vacía.

PRAGMA foreign\_keys \= ON;

CREATE TABLE IF NOT EXISTS sociedades (  
    id INTEGER PRIMARY KEY AUTOINCREMENT,  
    nombre\_fiscal TEXT NOT NULL,  
    codigo\_corto TEXT NOT NULL UNIQUE,  
    activo INTEGER DEFAULT 1  
);

CREATE TABLE IF NOT EXISTS aparcamientos (  
    id INTEGER PRIMARY KEY AUTOINCREMENT,  
    numero\_obra TEXT UNIQUE,  
    nombre TEXT NOT NULL,  
    zona TEXT,  
    es\_remotizado INTEGER DEFAULT 0,  
    tipo\_gestion TEXT CHECK(tipo\_gestion IN ('propio', 'socios')),  
    permitir\_vacio\_laborables INTEGER DEFAULT 0,  
    sociedad\_id INTEGER,  
    coordinador\_responsable TEXT CHECK(coordinador\_responsable IN ('Albert', 'Laura', 'Ambos')),  
    activo INTEGER DEFAULT 1,  
    FOREIGN KEY(sociedad\_id) REFERENCES sociedades(id)  
);

CREATE TABLE IF NOT EXISTS coberturas\_requeridas (  
    id INTEGER PRIMARY KEY AUTOINCREMENT,  
    aparcamiento\_id INTEGER NOT NULL,  
    dia\_semana INTEGER,  
    fecha TEXT,  
    turno TEXT NOT NULL,  
    hora\_inicio TEXT NOT NULL,  
    hora\_fin TEXT NOT NULL,  
    activo INTEGER DEFAULT 1,  
    FOREIGN KEY(aparcamiento\_id) REFERENCES aparcamientos(id) ON DELETE CASCADE,  
    CHECK (dia\_semana IS NOT NULL OR fecha IS NOT NULL)  
);

CREATE TABLE IF NOT EXISTS agentes (  
    id INTEGER PRIMARY KEY AUTOINCREMENT,  
    nombre TEXT NOT NULL,  
    zona\_habitual TEXT,  
    ranking\_score INTEGER DEFAULT 50,  
    es\_empresa\_externa INTEGER DEFAULT 0,  
    activo INTEGER DEFAULT 1  
);

CREATE TABLE IF NOT EXISTS contratos\_agentes (  
    id INTEGER PRIMARY KEY AUTOINCREMENT,  
    agente\_id INTEGER NOT NULL,  
    sociedad\_id INTEGER NOT NULL,  
    fecha\_inicio TEXT NOT NULL,  
    fecha\_fin TEXT,  
    FOREIGN KEY(agente\_id) REFERENCES agentes(id) ON DELETE CASCADE,  
    FOREIGN KEY(sociedad\_id) REFERENCES sociedades(id)  
);

CREATE TABLE IF NOT EXISTS quadrant (  
    id INTEGER PRIMARY KEY AUTOINCREMENT,  
    fecha TEXT NOT NULL,  
    aparcamiento\_id INTEGER NOT NULL,  
    agente\_id INTEGER NOT NULL,  
    sociedad\_contrato\_snapshot\_id INTEGER,  
    turno TEXT NOT NULL DEFAULT 'Mañana',  
    hora\_inicio TEXT NOT NULL DEFAULT '06:00',  
    hora\_fin TEXT NOT NULL DEFAULT '14:00',  
    horas\_trabajadas INTEGER DEFAULT 8,  
    FOREIGN KEY(aparcamiento\_id) REFERENCES aparcamientos(id),  
    FOREIGN KEY(agente\_id) REFERENCES agentes(id),  
    FOREIGN KEY(sociedad\_contrato\_snapshot\_id) REFERENCES sociedades(id)  
);

CREATE TABLE IF NOT EXISTS vacances (  
    id INTEGER PRIMARY KEY AUTOINCREMENT,  
    agente\_id INTEGER NOT NULL,  
    fecha\_inicio TEXT NOT NULL,  
    fecha\_fin TEXT NOT NULL,  
    FOREIGN KEY(agente\_id) REFERENCES agentes(id) ON DELETE CASCADE  
);

CREATE TABLE IF NOT EXISTS reglas\_config (  
    clave TEXT PRIMARY KEY,  
    valor TEXT NOT NULL,  
    tipo TEXT NOT NULL DEFAULT 'numero',  
    categoria TEXT NOT NULL DEFAULT 'general',  
    descripcion TEXT NOT NULL  
);

CREATE TABLE IF NOT EXISTS historico\_aparcamientos (  
    id INTEGER PRIMARY KEY AUTOINCREMENT,  
    aparcamiento\_id INTEGER NOT NULL,  
    campo\_modificado TEXT NOT NULL,  
    valor\_anterior TEXT,  
    valor\_nuevo TEXT,  
    fecha\_cambio TEXT DEFAULT (datetime('now', 'localtime')),  
    FOREIGN KEY(aparcamiento\_id) REFERENCES aparcamientos(id) ON DELETE CASCADE  
);

CREATE TRIGGER IF NOT EXISTS log\_cambios\_aparcamientos  
AFTER UPDATE ON aparcamientos  
FOR EACH ROW  
BEGIN  
  INSERT INTO historico\_aparcamientos (aparcamiento\_id, campo\_modificado, valor\_anterior, valor\_nuevo)  
  SELECT OLD.id, 'nombre', OLD.nombre, NEW.nombre WHERE OLD.nombre \<\> NEW.nombre;

  INSERT INTO historico\_aparcamientos (aparcamiento\_id, campo\_modificado, valor\_anterior, valor\_nuevo)  
  SELECT OLD.id, 'numero\_obra', OLD.numero\_obra, NEW.numero\_obra WHERE COALESCE(OLD.numero\_obra, '') \<\> COALESCE(NEW.numero\_obra, '');

  INSERT INTO historico\_aparcamientos (aparcamiento\_id, campo\_modificado, valor\_anterior, valor\_nuevo)  
  SELECT OLD.id, 'es\_remotizado', CASE OLD.es\_remotizado WHEN 1 THEN 'Sí' ELSE 'No' END, CASE NEW.es\_remotizado WHEN 1 THEN 'Sí' ELSE 'No' END WHERE OLD.es\_remotizado \<\> NEW.es\_remotizado;

  INSERT INTO historico\_aparcamientos (aparcamiento\_id, campo\_modificado, valor\_anterior, valor\_nuevo)  
  SELECT OLD.id, 'permitir\_vacio\_laborables', CASE OLD.permitir\_vacio\_laborables WHEN 1 THEN 'Permitido' ELSE 'Prohibido' END, CASE NEW.permitir\_vacio\_laborables WHEN 1 THEN 'Permitido' ELSE 'Prohibido' END WHERE OLD.permitir\_vacio\_laborables \<\> NEW.permitir\_vacio\_laborables;

  INSERT INTO historico\_aparcamientos (aparcamiento\_id, campo\_modificado, valor\_anterior, valor\_nuevo)  
  SELECT OLD.id, 'coordinador\_responsable', OLD.coordinador\_responsable, NEW.coordinador\_responsable WHERE OLD.coordinador\_responsable \<\> NEW.coordinador\_responsable;

  INSERT INTO historico\_aparcamientos (aparcamiento\_id, campo\_modificado, valor\_anterior, valor\_nuevo)  
  SELECT OLD.id, 'sociedad\_id', CAST(OLD.sociedad\_id AS TEXT), CAST(NEW.sociedad\_id AS TEXT) WHERE COALESCE(OLD.sociedad\_id, 0\) \<\> COALESCE(NEW.sociedad\_id, 0);  
END;

## **FASE 2: Puente de Seguridad (Preload)**

**Archivo Destino:** coordinadores-app/preload.js

**Acción:** Añade o modifica la exposición del API de la siguiente manera usando contextBridge:

const { contextBridge, ipcRenderer } \= require('electron');

contextBridge.exposeInMainWorld('databaseAPI', {  
  // Consultas Generales  
  consultar: (sql, params \= \[\]) \=\> ipcRenderer.invoke('db-query', { sql, params }),  
  ejecutar: (sql, params \= \[\]) \=\> ipcRenderer.invoke('db-execute', { sql, params }),  
    
  // Control de Concurrencia  
  controlConcurrencia: {  
    adquirirLock: (userName, userRole) \=\> ipcRenderer.invoke('lock-acquire', { userName, userRole }),  
    liberarLock: (userName) \=\> ipcRenderer.invoke('lock-release', { userName }),  
    forzarLiberacion: (userRole, adminName) \=\> ipcRenderer.invoke('lock-force-release', { userRole, adminName })  
  },

  // Integraciones Excel y Legacy  
  exportarExcel: () \=\> ipcRenderer.invoke('exportar-aparcamientos-csv'),  
  importarExcel: () \=\> ipcRenderer.invoke('importar-aparcamientos-csv'),  
  migrarLegacy: (filePath) \=\> ipcRenderer.invoke('migrar-json-deutes', { filePath }),

  // Motor de Cuadrante  
  obtenerPropuestas: (fecha, aparcamientoId) \=\> ipcRenderer.invoke('obtener-propuestas-asistente', { fecha, aparcamientoId })  
});

## **FASE 3: Lógica Backend en main.js (Infraestructura Principal)**

**Archivo Destino:** coordinadores-app/main.js

**Acción:** Revisa el archivo e inyecta la siguiente infraestructura.

*(**Atención IDE:** Combina estos módulos con el código de inicialización de ventanas existente en main.js. No borres la creación de BrowserWindow)*.

### **3.1: Importaciones y variables globales**

const fs \= require('fs');  
const path \= require('path');  
const sqlite3 \= require('sqlite3').verbose();  
const { ipcMain, dialog } \= require('electron');

let db \= null;  
let currentDbPath \= "";

### **3.2: Conexión e Inicialización DB**

function conectarBaseDatosUnica(rutaCompartida) {  
  const dbPath \= path.join(rutaCompartida, 'dades.db');  
  currentDbPath \= dbPath;

  const dbDir \= path.dirname(dbPath);  
  if (\!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  const necesitaInit \= \!fs.existsSync(dbPath);

  db \= new sqlite3.Database(dbPath, sqlite3.OPEN\_READWRITE | sqlite3.OPEN\_CREATE, (err) \=\> {  
    if (err) {  
      console.error(\`\[DB Error\] Error al abrir DB: ${err.message}\`);  
    } else {  
      console.log(\`\[DB\] Conectado en: ${dbPath}\`);  
      db.run("PRAGMA foreign\_keys \= ON;");  
      if (necesitaInit) {  
        const schema \= fs.readFileSync(path.join(\_\_dirname, 'schema.sql'), 'utf8');  
        db.exec(schema, (errSchema) \=\> {  
           if(errSchema) console.error("Error aplicando schema", errSchema);  
           else inicializarReglasDeNegocio(db);  
        });  
      } else {  
        inicializarReglasDeNegocio(db);  
      }  
    }  
  });  
  return db;  
}

### **3.3: Handlers Básicos IPC**

ipcMain.handle('db-query', async (event, { sql, params }) \=\> {  
  return new Promise((resolve, reject) \=\> {  
    if (\!db) return reject(new Error("DB no inicializada"));  
    db.all(sql, params, (err, rows) \=\> {  
      if (err) reject(err); else resolve(rows);  
    });  
  });  
});

ipcMain.handle('db-execute', async (event, { sql, params }) \=\> {  
  return new Promise((resolve, reject) \=\> {  
    if (\!db) return reject(new Error("DB no inicializada"));  
    db.run(sql, params, function(err) {  
      if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes });  
    });  
  });  
});

## **FASE 4: Módulos de Concurrencia (Locking) en main.js**

**Archivo Destino:** coordinadores-app/main.js

**Acción:** Inyectar los handlers de bloqueo jerárquico.

function obtenerRutaLock() {  
  return currentDbPath ? currentDbPath \+ '.lock' : null;  
}

ipcMain.handle('lock-acquire', async (event, { userName, userRole }) \=\> {  
  const lockPath \= obtenerRutaLock();  
  if (\!lockPath) return { adquirido: false, error: 'DB no configurada' };

  if (fs.existsSync(lockPath)) {  
    try {  
      const data \= JSON.parse(fs.readFileSync(lockPath, 'utf8'));  
      if (Date.now() \- data.timestamp \> 30 \* 60 \* 1000\) {  
        fs.unlinkSync(lockPath);  
      } else if (data.usuario \!== userName) {  
        return { adquirido: false, usuarioActivo: data.usuario, rolActivo: data.role, desde: new Date(data.timestamp).toLocaleTimeString() };  
      }  
    } catch (e) {  
      fs.unlinkSync(lockPath);  
    }  
  }

  fs.writeFileSync(lockPath, JSON.stringify({ usuario: userName, role: userRole, timestamp: Date.now() }), 'utf8');  
  return { adquirido: true };  
});

ipcMain.handle('lock-release', async (event, { userName }) \=\> {  
  const lockPath \= obtenerRutaLock();  
  if (lockPath && fs.existsSync(lockPath)) {  
    try {  
      const data \= JSON.parse(fs.readFileSync(lockPath, 'utf8'));  
      if (data.usuario \=== userName) fs.unlinkSync(lockPath);  
      return { liberado: true };  
    } catch (e) { fs.unlinkSync(lockPath); }  
  }  
  return { liberado: false };  
});

ipcMain.handle('lock-force-release', async (event, { userRole, adminName }) \=\> {  
  const lockPath \= obtenerRutaLock();  
  if (userRole \!== 'jefe\_operaciones') return { liberado: false, error: 'Acceso denegado.' };  
  if (lockPath && fs.existsSync(lockPath)) {  
    fs.unlinkSync(lockPath);  
    return { liberado: true };  
  }  
  return { liberado: true };  
});

## **FASE 5: Semilla de Reglas de Negocio en main.js**

**Archivo Destino:** coordinadores-app/main.js

**Acción:** Inyectar la función que carga las reglas base usando INSERT OR IGNORE.

function inicializarReglasDeNegocio(dbConnection) {  
  const querySembrarReglas \= \`  
    INSERT OR IGNORE INTO reglas\_config (clave, valor, tipo, categoria, descripcion)  
    VALUES (?, ?, ?, ?, ?)  
  \`;  
  const stmt \= dbConnection.prepare(querySembrarReglas);  
  stmt.run('max\_horas\_semanales', '40', 'numero', 'agentes', 'Límite horas semanales.');  
  stmt.run('max\_dias\_mensuales', '22', 'numero', 'agentes', 'Tope jornadas mensuales.');  
  stmt.run('permitir\_vacio\_laborables', '0', 'booleano', 'aparcamientos', 'Dejar vacío 24h L-V.');  
  stmt.run('bloquear\_cruce\_sociedades', '0', 'booleano', 'aparcamientos', 'Bloquear cruce sociedades.');  
  stmt.run('min\_horas\_descanso\_entre\_turnos', '12', 'numero', 'agentes', 'Descanso mínimo 12h.');  
  stmt.finalize();  
}

function obtenerReglasConfiguradas() {  
  return new Promise((resolve, reject) \=\> {  
    db.all("SELECT clave, valor, tipo FROM reglas\_config", \[\], (err, rows) \=\> {  
      if (err) return reject(err);  
      const reglas \= {};  
      rows.forEach(row \=\> {  
        if (row.tipo \=== 'numero') reglas\[row.clave\] \= Number(row.valor);  
        else if (row.tipo \=== 'booleano') reglas\[row.clave\] \= (row.valor \=== '1' || row.valor \=== 'true');  
        else reglas\[row.clave\] \= row.valor;  
      });  
      resolve(reglas);  
    });  
  });  
}

## **FASE 6: Integración Excel/CSV en main.js**

**Archivo Destino:** coordinadores-app/main.js

**Acción:** Inyectar los handlers de Excel.

ipcMain.handle('exportar-aparcamientos-csv', async () \=\> {  
  const { filePath } \= await dialog.showSaveDialog({ filters: \[{ name: 'CSV', extensions: \['csv'\] }\] });  
  if (\!filePath) return { success: false };

  return new Promise((resolve) \=\> {  
    db.all("SELECT \* FROM aparcamientos WHERE activo \= 1", \[\], (err, rows) \=\> {  
      if (err) return resolve({ success: false, error: err.message });  
      let csv \= "id;numero\_obra;nombre;zona;es\_remotizado;tipo\_gestion;permitir\_vacio\_laborables;sociedad\_id;coordinador\_responsable\\n";  
      rows.forEach(r \=\> {  
        csv \+= \`${r.id};"${r.numero\_obra || ''}";"${r.nombre}";"${r.zona || ''}";${r.es\_remotizado};"${r.tipo\_gestion}";${r.permitir\_vacio\_laborables};${r.sociedad\_id || ''};"${r.coordinador\_responsable || 'Ambos'}"\\n\`;  
      });  
      fs.writeFileSync(filePath, "\\uFEFF" \+ csv, 'utf8');  
      resolve({ success: true });  
    });  
  });  
});

*(El agente IDE deberá invocar conectarBaseDatosUnica(app.getPath('userData')) dentro de app.whenReady() para arrancar el sistema completo).*