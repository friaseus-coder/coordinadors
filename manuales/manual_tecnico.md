# Manual Técnico y de Arquitectura Interna
## Intranet de Coordinadores - Aplicación Portable de Escritorio

Este documento detalla el funcionamiento interno, la arquitectura de archivos, la persistencia y la lógica del sistema de concurrencia al 100%. Está destinado a desarrolladores, administradores de sistemas o personal de soporte técnico.

-## 1. Stack Tecnológico e Infraestructura
La aplicación se ha diseñado para funcionar sin servidores de backend ni bases de datos en la nube (como PostgreSQL o MySQL remotos). Esto reduce a cero los costes de mantenimiento y simplifica el despliegue en la red de la oficina.

*   **Runtime:** [Electron.js (v31)](https://www.electronjs.org/), que unifica el motor de renderizado Chromium de Google con el entorno de ejecución Node.js de escritorio.
*   **Frontend (Capa de Presentación):** HTML5, Vanilla CSS3 (diseño responsivo con flexbox y variables CSS) y JavaScript nativo ES6.
*   **Fuentes de Texto:** Carga de la tipografía premium **Outfit** desde Google Fonts.
*   **Persistencia y Triple Estrategia (Sharding Lógico + Caché Local):** La persistencia se divide en 4 bases de datos SQLite independientes según áreas de negocio: `operativa_rrhh.db`, `finanzas_inventario.db`, `comercial.db` y `catalogos_maestros.db`. En el arranque, Electron realiza una copia de caché en el almacenamiento local del usuario (`app.getPath('userData')/db_cache`). Todas las lecturas se resuelven exclusivamente sobre esta caché local, eliminando latencias de red y cuelgues por conectividad lenta.
*   **Concurrencia (Mutex Atómico de Escritura):** Para evitar la corrupción de datos por concurrencia multi-usuario, las escrituras en red están controladas por un Candado Mutex de directorio físico (`_<dbKey>.lock`). Antes de modificar una base de datos en red, el proceso realiza un intento de creación de carpeta (`fs.mkdirSync`) con reintento automático (15 reintentos con 1 segundo de retraso). Una vez obtenido el candado, aplica la query (usando `PRAGMA journal_mode = DELETE;`), cierra la base de datos de red, libera el candado y actualiza la caché local del usuario que escribe.

---

## 2. Estructura de Directorios del Proyecto
La aplicación consta de los siguientes archivos y carpetas clave en su estructura raíz (habiéndose purgado por completo todos los historiales y directorios temporales obsoletos):

```
coordinadores-app/
├── main.js                 # Proceso principal de Electron (Inicialización, Mutex e IPC)
├── preload.js              # Script puente (window.dbAPI expuesta en Context Isolation)
├── package.json            # Metadatos del proyecto y dependencias (sqlite3, electron)
├── config.json             # Configuración dinámica (coordinador, rol, ruta_compartida)
├── schema_operativa.sql    # Esquema relacional de operativa, turnos y vacaciones
├── schema_finanzas.sql     # Esquema relacional de gastos e inventarios
├── schema_comercial.sql    # Esquema relacional de kv_store comercial
├── schema_catalogos.sql    # Esquema relacional de aparcamientos, sociedades y agentes
├── dades/                  # Carpeta de datos local (Fallback de configuración)
│   ├── coordinadores.json  # Registro de coordinadores creados dinámicamente
│   └── aparcamientos.json  # Catálogo maestro de aparcamientos (Resiliencia)
├── dist/                   # Salida del empaquetado del ejecutable portable
│   └── coordinadores-win32-x64/
│       ├── coordinadores.exe # Ejecutable final de producción
│       └── resources/
│           └── app.asar    # Código fuente empaquetado
└── src/                    # Carpeta de interfaz de usuario de desarrollo
    ├── index.html          # Pantalla de acceso y login
    ├── portal.html         # Panel general de navegación y control
    ├── css/                # Hoja de estilos compartida
    ├── js/
    │   ├── calendari.js    # Base de datos del santoral y festivos
    │   ├── i18n.js         # Soporte multi-idioma
    │   └── persistence.js  # Lógica de persistencia relacional con window.dbAPI
    └── comercials/         # Submódulo dinámico de comerciales
        └── comercials.html
```
```

---

## 3. Funcionamiento de Electron y el Cargador Híbrido
La aplicación aprovecha la separación de procesos de Electron para ofrecer seguridad y flexibilidad de actualización:

### A. Proceso Principal (Main Process - `main.js`)
*   Se ejecuta en un entorno completo de Node.js con acceso a las APIs del sistema operativo de Windows y librerías nativas como `sqlite3`.
*   Crea y gestiona la ventana de visualización (`BrowserWindow`).
*   Configura las rutas dinámicas y de red compartida leyendo el archivo `config.json` al iniciar, extrayendo la propiedad `ruta_compartida` (`NETWORK_DIR`) e inicializando los 4 archivos SQLite en red si no existieran.
*   **Inicialización y Sincronización Inicial (Sharding):** Al arrancar, el programa ejecuta `syncAllToLocal()`. Si alguna de las 4 bases de datos no existe en red, la crea aplicando su respectivo esquema SQL (`schema_operativa.sql`, `schema_finanzas.sql`, `schema_comercial.sql` o `schema_catalogos.sql`). Luego, copia los 4 archivos SQLite a la caché local (`app.getPath('userData')/db_cache`).
*   **Mapeo y Enrutamiento de Consultas (Compatibilidad):** El Proceso Principal redirige dinámicamente las peticiones legadas de `db-query` y `db-execute` al shard correspondiente analizando el texto de la consulta SQL (mediante `resolverDbKeyDesdeSql`), permitiendo que el software heredado funcione sin modificaciones.
*   **Mapeo de Claves Foráneas (Joins Cruzados):** Al establecer la conexión local con `operativa`, `finanzas` o `comercial`, Electron ejecuta automáticamente la sentencia `ATTACH DATABASE '<ruta_de_catalogos>' AS catalogos;`. Esto hace que las tablas maestras de catálogos estén disponibles en los otros shards para consultas de unión (`JOIN`) transparentemente.
*   **Canales IPC de Base de Datos y Exclusión Mutua:**
    *   `read-db` (Consulta de Caché Local): Devuelve de forma instantánea el resultado de leer de la conexión SQLite local de la clave indicada (`dbKey`).
    *   `write-db` (Escritura con Mutex): Recibe la query, adquiere un bloqueo exclusivo de carpeta en red (`acquireLock(dbKey)`), abre el archivo SQLite físico de red, ejecuta la query con `journal_mode = DELETE`, cierra el archivo de red, libera el bloqueo (`releaseLock`) y sincroniza la modificación a local para mantener la caché al día.
    *   Los handlers de base de datos específicos (`get-turnos-cuadrante`, `save-turno-cuadrante`, `delete-turno-cuadrante`, `save-vacacion-relacional`, etc.) fueron adaptados para operar sobre sus respectivos shards y aplicar el mutex de red de manera segura.

### B. Proceso de Renderizado (Renderer Process - Carpeta `src/`)
*   Muestra la interfaz gráfica dentro del contenedor Chromium de forma aislada.
*   No tiene acceso directo al sistema operativo ni a Node.js por motivos de seguridad informática (prevención de ataques XSS).
*   Se comunica con el proceso principal mediante las funciones expuestas en el puente `preload.js` (`window.api` y `window.dbAPI`).
*   **Puente del Motor de Persistencia Relacional (`window.dbAPI`):** En `preload.js` se definen y exponen los métodos `read(dbKey, query, params)` y `write(dbKey, query, params)` que permiten al frontend realizar consultas de selección (SELECT) en la caché local o sentencias de modificación (INSERT/UPDATE/DELETE) atómicas con Mutex en red de forma directa. Toda la persistencia de `persistence.js` fue migrada a esta API, conservando `window.databaseAPI` únicamente para servicios lógicos (como el Asistente de Asignación) y obtener configuración de sesión (`getUserConfig`).

### C. Cargador Híbrido Dinámico (Modificaciones en Caliente)
Para evitar tener que generar y distribuir un nuevo ejecutable `.exe` de 180MB cada vez que se hace un cambio estético de HTML o CSS, el método `createWindow()` en `main.js` realiza la siguiente validación:

```javascript
const externalIndexPath = path.join(rootDir, 'src', 'index.html');
const internalIndexPath = path.join(__dirname, 'src', 'index.html');

if (fs.existsSync(externalIndexPath)) {
  // Carga el código fuente directamente de la carpeta física externa
  mainWindow.loadFile(externalIndexPath);
} else {
  // Carga el código fuente empaquetado dentro del .exe (app.asar)
  mainWindow.loadFile(internalIndexPath);
}
```
*   **Efecto:** Si copias tu carpeta de desarrollo `src/` al lado de `coordinadores.exe`, la aplicación la prioriza, permitiéndote actualizar pantallas modificando archivos de texto en caliente.

---

## 4. Persistencia, Sincronización y Control de Concurrencia (Red)
La arquitectura de persistencia se basa en la **Triple Estrategia (Sharding Lógico + Caché Local de Lectura + Mutex de Carpeta en Red)** para maximizar la estabilidad y el rendimiento en entornos sin servidor que acceden a una unidad de red compartida (SMB).

```
                  +---------------------------+
                  |  persistence.js (Frontend)|
                  +---------------------------+
                     /                     \
       (Consultas Locales / SELECT)     (Escrituras / IPC Bridge)
                   /                         \
      +-------------------------+      +---------------------------+
      |  Conexiones Caché Local |      |   main.js (Electron Main) |
      |  %LocalAppData%/db_cache|      +---------------------------+
      +-------------------------+                    |
                   |                    (Adquisición de Mutex en Red)
             [ATTACH DATABASE]                       |
                   |                   +----------------------------+
                   v                   | Carpeta _<dbKey>.lock/     |
      +-------------------------+      +----------------------------+
      | catalogos_maestros.db  |                     |
      |   (Maestros Adjuntos)   |         (Escritura Física en Red)
      +-------------------------+                    |
                                                     v
                                       +----------------------------+
                                       | Archivos Shards en Red     |
                                       | - operativa_rrhh.db        |
                                       | - finanzas_inventario.db   |
                                       | - comercial.db             |
                                       | - catalogos_maestros.db    |
                                       +----------------------------+
                                                     |
                                            (Libera Mutex y Sync)
                                                     v
                                       +----------------------------+
                                       | Sobrescribe Caché Local    |
                                       +----------------------------+
```

### A. Inicialización, Caché Local y Sincronización
Para mitigar la latencia de red de Windows (SMB) y evitar bloqueos en lecturas concurrentes, la aplicación opera bajo un modelo de lectura local:
1.  **Cargador Inicial**: Al arrancar la aplicación, el proceso principal (`main.js`) detecta la ruta del servidor compartida leyendo la clave `ruta_compartida` (o `NETWORK_DIR`) desde el archivo `config.json`.
2.  **Inicialización de Archivos**: Si alguno de los 4 archivos SQLite shards no existe en la ruta de red, la aplicación lo crea de forma limpia en el servidor y ejecuta su correspondiente esquema SQL canónico (`schema_operativa.sql`, `schema_finanzas.sql`, `schema_comercial.sql` o `schema_catalogos.sql`).
3.  **Copia en Caché Local (`syncAllToLocal()`)**: Tras verificar los archivos en red, la aplicación cierra cualquier conexión local abierta y copia los 4 archivos SQLite físicos a la caché local del usuario en `%LocalAppData%/IntranetCoordinadores/db_cache/` (obtenido vía `app.getPath('userData')/db_cache`).
4.  **Lecturas Locales Integradas (`read-db`)**: El frontend realiza todas las consultas de lectura (`SELECT`) a través del canal `window.dbAPI.read(dbKey, query, params)`. Estas consultas se resuelven exclusivamente sobre las bases de datos de la caché local de forma instantánea, eliminando retrasos por fluctuaciones de red.

### B. Joins Cruzados mediante ATTACH DATABASE
Para mantener la compatibilidad con consultas complejas del frontend legado que realizan uniones (`JOIN`) entre tablas de operativa/finanzas y tablas maestras (como `agentes` o `aparcamientos`), el cargador de conexiones locales ejecuta la sentencia SQLite `ATTACH DATABASE` al abrir las conexiones locales:
*   Al inicializar la base de datos `operativa`, `finanzas` o `comercial` en caché local, se ejecuta dinámicamente:
    `ATTACH DATABASE '<ruta_local>/catalogos_maestros.db' AS catalogos;`
*   Esto mapea de forma transparente las tablas de catálogos dentro del mismo contexto de conexión, permitiendo resolver consultas con sintaxis del tipo `JOIN catalogos.agentes a ON q.agente_id = a.id` sin necesidad de reescribir la lógica de consultas de la interfaz de usuario.

### C. Exclusión Mutua Atómica (Mutex de Red en Escritura)
Para evitar la corrupción de datos que ocurre cuando múltiples instancias de SQLite escriben de forma concurrente en un archivo compartido en red, el proceso principal canaliza todas las consultas de modificación (`INSERT`, `UPDATE`, `DELETE`) a través del canal `write-db` bajo un estricto patrón de exclusión mutua:
1.  **Solicitud de Escritura**: El cliente solicita una escritura llamando a `window.dbAPI.write(dbKey, query, params)`.
2.  **Adquisición de Candado Físico (`acquireLock`)**: El backend de Electron intenta crear un directorio físico llamado `_<dbKey>.lock` (por ejemplo, `_operativa.lock`) en la carpeta de red compartida (`NETWORK_DIR`) mediante `fs.mkdirSync(lockDir)`.
    *   **Si la carpeta ya existe (`EEXIST`)**: Significa que otro coordinador está escribiendo en esa base de datos. El proceso entra en un bucle de reintento automático (hasta 15 intentos espacedos por 1 segundo de retraso).
    *   **Si expira el reintento**: La petición falla, rechazando la escritura para proteger la integridad del archivo.
3.  **Escritura Directa en Red**: Una vez adquirido el candado, Electron:
    *   Abre una conexión directa exclusiva a la base de datos correspondiente en red.
    *   Ejecuta `PRAGMA journal_mode = DELETE;` para desactivar el diario de transacciones persistente (WAL/journal en red), escribiendo directamente sobre el archivo principal y reduciendo riesgos de archivos temporales huérfanos.
    *   Ejecuta la consulta SQL con los parámetros proporcionados.
    *   Cierra la conexión física a la base de datos de red de forma limpia.
4.  **Liberación del Mutex (`releaseLock`)**: Elimina el directorio físico de bloqueo `_<dbKey>.lock` utilizando `fs.rmdirSync(lockDir)`.
5.  **Refresco de Caché Local**: Inmediatamente después de liberar el candado en red, Electron ejecuta `syncToLocal(dbKey)` para cerrar la conexión local, copiar el archivo modificado de red a la caché local de `%LocalAppData%` y reabrir la conexión de lectura. Esto asegura que el coordinador que acaba de escribir tenga su caché actualizada al 100%.

> [!IMPORTANT]
> **Diferencia entre Lock Cooperativo y Mutex de Red**:
> *   **Mutex de Red (`_<dbKey>.lock`)**: Control físico de bajo nivel a nivel de archivo SQLite para evitar corrupción de base de datos durante operaciones de escritura rápidas (`INSERT/UPDATE/DELETE`). Es de corta duración (milisegundos) y se gestiona automáticamente en `main.js`.
> *   **Lock Cooperativo (`~quadrant_[coord].lock`)**: Lógica de negocio a nivel de interfaz de usuario. Al entrar a editar el cuadrante de un coordinador, se crea este archivo `.lock` en red con un TTL de 3 horas. Su objetivo es impedir que dos personas editen concurrentemente la cuadrícula visual de turnos de un mismo coordinador. Si está ocupado, la interfaz del segundo usuario se carga en modo "Solo lectura".

---

## 5. Auditoría y Tareas de Mantenimiento
La aplicación se autogestiona para mantener la integridad de los históricos y evitar la saturación de los sistemas:

*   **Sistema de Doble Backup Local Multishard**:
    Para evitar la pérdida de información por fallos en red, cortes eléctricos o corrupción accidental, se ha implementado un sistema automático de backups locales en la carpeta `Documents/Coordinadores_Backups/dades_[coordinador]/` de cada estación de trabajo:
    1.  **Backup Diario (`realizarBackupDiario`)**: En el evento `will-quit` de Electron (al cerrar el programa), la aplicación itera sobre las 4 bases de datos activas en red y las respalda en la subcarpeta `Diario/` con la nomenclatura `[dbKey]_[coordinador]_diario.db`. Esta copia se sobrescribe de manera diaria garantizando el respaldo de la última jornada de trabajo.
    2.  **Cierre Mensual Congelado (`verificarCierreMensual`)**: Al iniciar la conexión con las bases de datos, el sistema evalúa si el mes del calendario ha cambiado respecto al último registro. De ser así, copia las bases de datos de red activas a la subcarpeta `Historico/` con el formato `[dbKey]_[coordinador]_[año]_[mes].db`. Si el archivo del mes ya existe, la operación se omite para evitar sobrescribir cierres contables cerrados.

---

## 6. Modelo de Datos Relacional Multisociedad (v2)
Con la implementación de la refactorización de base de datos, el esquema único original se ha segmentado lógicamente en 4 shards SQLite independientes para evitar cuellos de botella y maximizar la concurrencia:

### A. Distribución de Tablas por Base de Datos

#### 1. `operativa_rrhh.db`
Contiene la información diaria de turnos, vacaciones y control de ausencias o deudas del personal del coordinador.
*   **`quadrant`**: Celdas individuales de turnos diarios.
    *   `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
    *   `fecha` (TEXT - YYYY-MM-DD)
    *   `aparcamiento_id` (INTEGER)
    *   `agente_id` (INTEGER)
    *   `sociedad_contrato_snapshot_id` (INTEGER - Snapshot para auditoría contractual)
    *   `turno` (TEXT - 'MATÍ', 'TARDA', 'NIT', etc.)
    *   `hora_inicio` (TEXT - HH:MM)
    *   `hora_fin` (TEXT - HH:MM)
    *   `horas_trabajadas` (INTEGER - por defecto 8)
    *   `es_substitucio` (INTEGER - 0 o 1)
    *   `nota` (TEXT - observaciones libres)
*   **`vacances`**: Registro de vacaciones anuales y bajas de agentes.
    *   `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
    *   `agente_id` (INTEGER)
    *   `fecha_inicio` (TEXT - YYYY-MM-DD)
    *   `fecha_fin` (TEXT - YYYY-MM-DD)
*   **`deutes`**: Deudas o excesos de jornada por coordinador.
    *   `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
    *   `comercial` (TEXT)
    *   `cliente` (TEXT)
    *   `import` (REAL)
    *   `fecha` (TEXT - YYYY-MM-DD)
    *   `activo` (INTEGER - 0 o 1)
*   **`kv_store`**: Almacén clave-valor heredado operativo.
*   **`schema_version`**: Control de versión de estructura del shard operativo.

#### 2. `finanzas_inventario.db`
Centraliza el registro contable de caja chica (gastos) y el control de materiales entregados (uniformes).
*   **`despeses`**: Registro de gastos y tickets mensuales.
    *   `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
    *   `fecha` (TEXT - YYYY-MM-DD)
    *   `comercial` (TEXT)
    *   `concepto` (TEXT)
    *   `importe` (TEXT)
    *   `estado` (TEXT)
    *   `coordinador` (TEXT)
    *   `activo` (INTEGER - 0 o 1)
*   **`inventari`**: Control de uniformes y materiales entregados a trabajadores.
    *   `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
    *   `comercial` (TEXT)
    *   `articulo` (TEXT)
    *   `fecha_entrega` (TEXT - YYYY-MM-DD)
    *   `estado` (TEXT)
    *   `observaciones` (TEXT)
    *   `activo` (INTEGER - 0 o 1)
*   **`kv_store`**: Almacén clave-valor de finanzas.
*   **`schema_version`**: Versión del shard de finanzas.

#### 3. `comercial.db`
Almacena la parametrización de precios, tarifas y datos específicos del módulo comercial.
*   **`kv_store`**: Almacén clave-valor para tarifas y rankings comerciales.
*   **`schema_version`**: Versión del shard comercial.

#### 4. `catalogos_maestros.db`
Contiene la parametrización global del grupo (sociedades, parkings, contratos y agentes). Es de vital importancia ya que actúa como base de datos de solo lectura unida (`ATTACH`) en el resto de shards.
*   **`sociedades`**: Razón social de empresas (id, nombre_fiscal, codigo_corto, activo).
*   **`aparcamientos`**: Catálogo de centros de trabajo.
    *   `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
    *   `numero_obra` (TEXT UNIQUE)
    *   `nombre` (TEXT NOT NULL)
    *   `zona` (TEXT)
    *   `es_remotizado` (INTEGER - 0 o 1)
    *   `tipo_gestion` (TEXT - 'propio' o 'socios')
    *   `permitir_vacio_laborables` (INTEGER - 0 o 1)
    *   `sociedad_id` (INTEGER - FK sociedades)
    *   `coordinador_responsable` (TEXT - 'Albert', 'Laura' o 'Ambos')
    *   `activo` (INTEGER - 0 o 1)
*   **`coberturas_requeridas`**: Turnos obligatorios por aparcamiento (recurrente o extraordinario).
*   **`agentes`**: Catálogo de personal de plantilla y empresas externas.
*   **`contratos_agentes`**: Vinculación temporal de trabajadores con sociedades para control de cruces.
*   **`reglas_config`**: Reglas de negocio globales (horas_maximas_semanales, descanso_minimo_horas, etc.).
*   **`historico_aparcamientos`**: Tabla de auditoría interna de cambios en los centros.
*   **`schema_version`**: Versión del shard de catálogos.

### B. Trigger de Auditoría en Aparcamientos
Para garantizar un rastreo histórico completo de cambios en los centros, SQLite ejecuta un trigger automático dentro de `catalogos_maestros.db`:
```sql
CREATE TRIGGER IF NOT EXISTS log_cambios_aparcamientos
AFTER UPDATE ON aparcamientos
FOR EACH ROW
BEGIN
    INSERT INTO historico_aparcamientos (aparcamiento_id, campo_modificado, valor_anterior, valor_nuevo)
    SELECT OLD.id, 'nombre', OLD.nombre, NEW.nombre
    WHERE OLD.nombre <> NEW.nombre;

    INSERT INTO historico_aparcamientos (aparcamiento_id, campo_modificado, valor_anterior, valor_nuevo)
    SELECT OLD.id, 'numero_obra', OLD.numero_obra, NEW.numero_obra
    WHERE COALESCE(OLD.numero_obra, '') <> COALESCE(NEW.numero_obra, '');

    INSERT INTO historico_aparcamientos (aparcamiento_id, campo_modificado, valor_anterior, valor_nuevo)
    SELECT OLD.id, 'es_remotizado',
           CASE OLD.es_remotizado WHEN 1 THEN 'Sí' ELSE 'No' END,
           CASE NEW.es_remotizado WHEN 1 THEN 'Sí' ELSE 'No' END
    WHERE OLD.es_remotizado <> NEW.es_remotizado;

    INSERT INTO historico_aparcamientos (aparcamiento_id, campo_modificado, valor_anterior, valor_nuevo)
    SELECT OLD.id, 'permitir_vacio_laborables',
           CASE OLD.permitir_vacio_laborables WHEN 1 THEN 'Permitido' ELSE 'Prohibido' END,
           CASE NEW.permitir_vacio_laborables WHEN 1 THEN 'Permitido' ELSE 'Prohibido' END
    WHERE OLD.permitir_vacio_laborables <> NEW.permitir_vacio_laborables;

    INSERT INTO historico_aparcamientos (aparcamiento_id, campo_modificado, valor_anterior, valor_nuevo)
    SELECT OLD.id, 'coordinador_responsable', OLD.coordinador_responsable, NEW.coordinador_responsable
    WHERE OLD.coordinador_responsable <> NEW.coordinador_responsable;

    INSERT INTO historico_aparcamientos (aparcamiento_id, campo_modificado, valor_anterior, valor_nuevo)
    SELECT OLD.id, 'sociedad_id', CAST(OLD.sociedad_id AS TEXT), CAST(NEW.sociedad_id AS TEXT)
    WHERE COALESCE(OLD.sociedad_id, 0) <> COALESCE(NEW.sociedad_id, 0);
END;
```

---

## 7. Asistente de Asignación Inteligente y Delegación de Eventos

### A. Algoritmo de Candidatos de Asignación
El asistente lateral de asignación inteligente realiza un procesamiento multicapa en el Proceso Principal (`main.js`) a través del handler `obtener-recomendaciones-cuadrante`:
1.  **Filtro de Contratos Activos**: Evalúa los contratos vigentes de los agentes para la sociedad propietaria del aparcamiento en la fecha solicitada.
2.  **Evaluación de Restricciones y Reglas**:
    *   **Vacaciones**: Compara el cuadrante y las vacaciones aprobadas del agente para descartar candidatos que se encuentren en período de descanso o de baja.
    *   **Duplicidad de Asignación**: Compara los turnos asignados del día actual para impedir que un agente trabaje en dos aparcamientos distintos el mismo día.
    *   **Tope Mensual**: Compara el número de jornadas del agente en el mes con la regla `max_dias_mensuales` (22 por defecto) para derivarlo a descartado en caso de exceso.
3.  **Clasificación en UI**:
    *   **Sugeridos**: Candidatos libres. Si se trata de un proveedor de seguridad externo, se marca como `EMPRESA SEGURIDAD` y se posiciona de forma prioritaria al principio del listado al no estar sujeto a límites de horas o convenios de sociedades.
    *   **Descartados**: Candidatos excluidos indicando la causa específica (ej: "De vacaciones / Baja", "Ya asignado a otro parking hoy", o exceso del tope de días).

### B. Arquitectura de Delegación de Eventos de Interfaz
Debido a que el cuadrante del calendario se genera dinámicamente en el DOM (reconstruyendo todos los elementos `<td>` al filtrar o cambiar de período), los listeners individuales de eventos se gestionarían de forma ineficiente. Para solucionarlo:
1.  Se inyectan en el renderizado de la tabla atributos de datos específicos en cada celda: `data-fecha`, `data-parking` y `data-sid`.
2.  Se implementó un escuchador único global en la vista: `document.addEventListener('click', (e) => { ... })`.
3.  Al hacer clic, se utiliza `e.target.closest('td')` para identificar la celda correspondiente de forma rápida y centralizada.
4.  **Control de Edición Manual**: El listener delegado analiza el estado en memoria. Si el clic ocurre sobre los selectores de trabajador (`select.select-worker`) o de horas (`select.select-hour`) para edición manual directa, la apertura automática del panel lateral del asistente inteligente es bloqueada. Esto previene superposiciones no deseadas en el flujo de trabajo del coordinador.

### C. Resolución de Mismatch de Tipos en Personal (Coordinadores)
Durante la sincronización de archivos de configuración (`coordinadores.json`), se detectó un error `SQLITE_MISMATCH: datatype mismatch` debido a que el campo `id` de los coordinadores en el archivo JSON es una cadena de texto (ej. `"albert"`, `"laura"`), mientras que el esquema de base de datos define `id` en la tabla `agentes` como un `INTEGER PRIMARY KEY AUTOINCREMENT`.
1.  **Solución Implementada**: Se ha incorporado en `main.js` una función hashing hash-a-entero estable de 32 bits denominada `stringToId(str)`.
2.  *   **Estabilidad**: Esta función genera siempre el mismo identificador entero positivo para un string determinado de forma síncrona y predecible.
    *   **Persistencia**: Se aplica a todas las consultas de inicialización y sincronización de agentes y contratos, eliminando la colisión por tipos en SQLite y garantizando la integridad referencial.

---

## 8. Panel de Administración y Depuración del Legacy JSON
Con la implantación de la **Fase 10**, SQLite es la fuente de verdad única absoluta en la aplicación, habiéndose eliminado los antiguos fallbacks locales y archivos JSON en la edición diaria.

### A. Panel de Administración Centralizado (`admin.html`)
*   Se ha diseñado un panel reservado para operaciones administrativas.
*   Permite ejecutar las migraciones heredadas en un entorno seguro e inyectar registros en la base de datos sin contaminar las pantallas operativas ordinarias.
*   **Vías de Importación Integradas**:
    1.  **Cuadrante**: Importación y mapeo de turnos desde el JSON de cuadrante legado.
    2.  **Vacaciones**: Importación y normalización relacional de períodos de descanso.
    3.  **Deudas**: Importación directa de la lista de deudas legadas.
    4.  **Gastos**: Importación directa de los archivos de gastos legados.

### B. Salvaguarda Antiduplicidad (`.MIGRADO`)
Para evitar que se procese un mismo archivo legacy JSON varias veces y se dupliquen registros en SQLite, el proceso principal de Electron renombra los archivos en disco añadiéndoles el sufijo `.MIGRADO` una vez completada la importación transaccional con éxito en la base de datos centralizada. Si el usuario intenta seleccionar el archivo de nuevo, es rechazado inmediatamente.

---

## 9. Sistema de Roles (RBAC) con Selección en Caliente
La aplicación implementa una arquitectura basada en roles (Role-Based Access Control) que filtra el acceso a los módulos operativos desde una única pantalla interactiva unificada:
1.  **Comercial**: Acceso exclusivo a visualización y consulta de comerciales, rutas y rankings.
2.  **Coordinador**: Acceso operativo diario (cuadrante, vacaciones, deudas, gastos e inventario) para su gestión personal.
3.  **Jefe de Operaciones (Administrador)**: Acceso global absoluto y herramientas de administración, base de datos relacional y configuración.

### A. Almacenamiento de Sesión y Redirección
*   Al arrancar la aplicación, se despliega la pantalla de acceso (`index.html`) e inicia un proceso de consulta asíncrona a `window.databaseAPI.getUserConfig()`.
*   Si detecta en el archivo `config.json` un rol y coordinador válidos configurados, la pantalla de login los persiste en `sessionStorage` e inicia de forma inmediata una redirección al portal principal (`portal.html`) sin requerir selección ni confirmación interactiva.
*   En caso contrario, se le permite al usuario elegir su rol interactivamente mediante tarjetas y, al pulsar "Entrar al Portal", se registran en `sessionStorage` y se realiza la redirección tradicional.

### B. Ocultación Reactiva y Filtrado Visual
*   En `portal.html`, al cargarse el DOM, el proceso consulta prioritariamente la configuración de `config.json` para sobrescribir autoritativamente `userRole` y `userName` en `sessionStorage`.
*   A continuación, se invoca de manera inmediata el filtrado mediante la función `applyRoleFiltering(role)`. Esta función recorre todos los elementos del menú (etiquetados con `.menu-item` o el atributo `data-roles`) y aplica un estilo imperativo de ocultación (`display: none !important`) a toda sección no permitida para el rol activo.
*   Si el rol activo es `comercial`, se ocultan el resto de opciones de navegación del portal y se realiza una redirección asíncrona e instantánea abriendo directamente el módulo de Comerciales (`comercials.html`).
