const fs = require('fs');
const path = require('path');

const manualPath = path.join(__dirname, '..', 'manuales', 'manual_tecnico.md');
let content = fs.readFileSync(manualPath, 'utf8');

const oldSec3Start = content.indexOf("## 3. Funcionamiento de Electron y el Cargador Híbrido");
const oldSec6Start = content.indexOf("## 6. Modelo de Datos Relacional Multisociedad (v2)");

if (oldSec3Start !== -1 && oldSec6Start !== -1) {
  const newSections = `## 3. Funcionamiento de Electron y el Cargador Híbrido
La aplicación aprovecha la separación de procesos de Electron para ofrecer seguridad y flexibilidad de actualización:

### A. Proceso Principal (Main Process - \`main.js\`)
*   Se ejecuta en un entorno completo de Node.js con acceso a las APIs del sistema operativo de Windows y librerías nativas como \`sqlite3\`.
*   Crea y gestiona la ventana de visualización (\`BrowserWindow\`).
*   Configura las rutas dinámicas y de red compartida leyendo el archivo \`config.json\` al iniciar, extrayendo la propiedad \`ruta_compartida\` (\`NETWORK_DIR\`) e inicializando la caché local en \`%LocalAppData%/IntranetCoordinadores/db_cache\`.
*   **Mapeo de Claves Foráneas (Joins Cruzados):** Al establecer la conexión local con \`operativa\`, \`finanzas\` o \`comercial\`, Electron ejecuta automáticamente la sentencia \`ATTACH DATABASE '<ruta_de_catalogos>' AS catalogos;\`. Esto hace que las tablas maestras de catálogos estén disponibles en los otros shards para consultas de unión (\`JOIN\`) transparentemente.
*   **Canales IPC de Dominio e Inyección de Seguridad (RBAC Real):**
    *   Eliminados totalmente los canales IPC genéricos vulnerables (\`read-db\`, \`write-db\`, \`db-query\`, \`db-execute\`).
    *   Todas las acciones se procesan mediante IPC Handlers de Dominio parametrizados (\`app:cuadrante:guardarTurno\`, \`app:comerciales:actualizar\`, etc.) respaldados por validación de roles en Node.js mediante \`verifyRole()\`.

### B. Proceso de Renderizado (Renderer Process - Carpeta \`src/\`)
*   Muestra la interfaz gráfica dentro del contenedor Chromium de forma aislada.
*   No tiene acceso directo al sistema operativo ni a Node.js por motivos de seguridad informática (prevención de ataques XSS).
*   Se comunica con el proceso principal mediante las funciones de dominio expuestas en el puente \`preload.js\` (\`window.api\`).
*   **Refresco Reactivo en Tiempo Real:** Las vistas Alpine.js se suscriben a \`window.api.onDataChanged(callback)\`, recargando automáticamente las tablas cuando otra terminal escribe un delta en SMB en menos de 3 segundos.

### C. Cargador Híbrido Dinámico (Modificaciones en Caliente)
El método \`createWindow()\` en \`main.js\` realiza la siguiente validación de seguridad:

\`\`\`javascript
const externalIndexPath = path.join(rootDir, 'src', 'index.html');
const internalIndexPath = path.join(__dirname, 'src', 'index.html');

if (!app.isPackaged && fs.existsSync(externalIndexPath)) {
  // Carga interfaz externa solo en desarrollo
  mainWindow.loadFile(externalIndexPath);
} else {
  // En producción carga exclusivamente la interfaz interna empaquetada
  mainWindow.loadFile(internalIndexPath);
}
\`\`\`

---

## 4. Persistencia, Sincronización y Control de Concurrencia (Red)
La arquitectura de persistencia se basa en la **Estrategia Serverless por Motor de Deltas (Lectura Local Única + Cola de Cambios Atómicos JSON en SMB)** para erradicar los errores \`SQLITE_CORRUPT\`, eliminar la transferencia ineficiente de bases de datos enteras y ofrecer un refresco reactivo en tiempo real en entornos sin servidor.

\`\`\`
                  +-----------------------------------+
                  |   Frontend (Alpine.js / JS UI)    |
                  +-----------------------------------+
                     /                             \\
     (Lecturas Locales / SELECT)         (IPC Domain Calls / Dominio)
                   /                                 \\
      +-------------------------+        +---------------------------+
      |  Conexiones SQLite      |        |   main.js (Electron Main) |
      |  %LocalAppData%/db_cache|        +---------------------------+
      +-------------------------+                      |
                   |                    (1. Aplica cambio localmente)
             [ATTACH DATABASE]                         |
                   |                    (2. Genera Delta JSON GUID)
                   v                                   v
      +-------------------------+        +---------------------------+
      | catalogos_maestros.db   |        | NETWORK_DIR/deltas/       |
      |   (Maestros Adjuntos)   |        | [timestamp]_[guid].json   |
      +-------------------------+        +---------------------------+
                                                       |
                                           (Vigilancia / fs.watch 1.5s)
                                                       v
                                         +---------------------------+
                                         | Replicación a terminales  |
                                         | Evento app:data-changed   |
                                         +---------------------------+
\`\`\`

### A. Lectura Local Única y Persistencia Local
1. **Bases de Datos Locales**: Cada terminal mantiene sus 4 bases de datos SQLite (\`operativa_rrhh.db\`, \`finanzas_inventario.db\`, \`comercial.db\` y \`catalogos_maestros.db\`) en la caché local del usuario en \`%LocalAppData%/IntranetCoordinadores/db_cache/\`.
2. **Lecturas Locales**: Todas las consultas \`SELECT\` se resuelven directamente sobre SQLite local, eliminando bloqueos de red y cuelgues por conectividad lenta.
3. **Joins Cruzados (ATTACH DATABASE)**: Electron ejecuta \`ATTACH DATABASE '<ruta_local>/catalogos_maestros.db' AS catalogos;\`, permitiendo \`JOIN\` cruzados con tablas maestras de forma transparente.

### B. Motor de Deltas Atómicos en SMB (\`/deltas/\`)
1. **Escritura por Deltas**: Al realizar un \`INSERT\`, \`UPDATE\` o \`DELETE\`, el proceso principal \`main.js\`:
   * Aplica el cambio directamente en la base de datos SQLite local del cliente.
   * Genera un archivo JSON de delta único en \`NETWORK_DIR/deltas/[timestamp]_[uuid]_[dbKey].json\`.
   * El archivo JSON contiene la acción, tabla, sentencia SQL, parámetros, versión, usuario y \`clientId\`.
   * **Atomicidad en SMB**: Escribir un archivo JSON individual con GUID único en SMB es una operación 100% atómica y segura en Windows, eliminando colisiones de archivos.

2. **Consumo y Replicación en Tiempo Real**:
   * Un watcher en segundo plano en \`main.js\` vigila la carpeta \`NETWORK_DIR/deltas/\` mediante \`fs.watch\` y polling continuo a 1.5s.
   * Al detectar un delta producido por otra terminal (\`clientId\` distinto), ejecuta la sentencia SQL en el SQLite local del usuario y registra la transacción en \`_applied_deltas\` para asegurar idempotencia.
   * Emite el evento IPC \`app:data-changed\` a \`preload.js\`, notificando a las vistas reactivas de Alpine.js para refrescar la pantalla en menos de 3 segundos sin reiniciar la aplicación.

### C. Copias de Seguridad Diarias y Política de Rotación
1. **Respaldo Diario**: La función \`realizarBackupDiarioYRotacion()\` en \`main.js\` se ejecuta al iniciar el programa y cada 24 horas, respaldando las bases de datos locales en \`NETWORK_DIR/Backups/daily_YYYY-MM-DD_*.db\`.
2. **Rotación de Backups (7 días)**: La aplicación elimina automáticamente los archivos de copia de seguridad en \`NETWORK_DIR/Backups/\` cuya antigüedad supere los 7 días.
3. **Purga de Deltas (14 días)**: La aplicación purga de forma automática los archivos de deltas en \`NETWORK_DIR/deltas/\` con más de 14 días de antigüedad.

### D. Control de Concurrencia Optimista (OCC)
1. **Validación de Versión**: Las consultas de modificación \`UPDATE\` incluyen la validación del campo \`version\` en la cláusula \`WHERE\` (\`WHERE id = ? AND version = ?\`) e incrementan automáticamente la versión.
2. **Gestión de Conflictos**: Si la consulta afecta a 0 filas (porque otro usuario modificó el registro previamente), la API devuelve \`{ success: false, code: 'OCC_CONFLICT' }\`, solicitando al usuario refrescar la información antes de guardar para impedir sobreescrituras ciegas (*Last-Write-Wins*).

---

## 5. Auditoría y Tareas de Mantenimiento
La aplicación se autogestiona para mantener la integridad de los históricos y evitar la saturación de los sistemas mediante \`realizarBackupDiarioYRotacion()\`.

---

`;

  content = content.substring(0, oldSec3Start) + newSections + content.substring(oldSec6Start);
  fs.writeFileSync(manualPath, content);
  console.log("manual_tecnico.md actualizado correctamente!");
} else {
  console.error("No se encontraron los puntos de corte en manual_tecnico.md");
}
