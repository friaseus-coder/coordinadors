# Manual Técnico y de Arquitectura Interna
## Intranet de Coordinadores - Aplicación Portable de Escritorio

Este documento detalla el funcionamiento interno, la arquitectura de archivos, la persistencia y la lógica del sistema de concurrencia al 100%. Está destinado a desarrolladores, administradores de sistemas o personal de soporte técnico.

-## 1. Stack Tecnológico e Infraestructura
La aplicación se ha diseñado para funcionar sin servidores de backend ni bases de datos en la nube (como PostgreSQL o MySQL remotos). Esto reduce a cero los costes de mantenimiento y simplifica el despliegue en la red de la oficina.

*   **Runtime:** [Electron.js (v31)](https://www.electronjs.org/), que unifica el motor de renderizado Chromium de Google con el entorno de ejecución Node.js de escritorio.
*   **Frontend (Capa de Presentación):** HTML5, Vanilla CSS3 (diseño responsivo con flexbox y variables CSS), **Alpine.js (v3.x.x)** como micro-framework reactivo para módulos como el de comerciales, y JavaScript nativo ES6.
*   **Internacionalización (i18n):** Módulo propio (`i18n.js`) para traducción dinámica de la interfaz y elementos estáticos.
*   **Fuentes de Texto:** Carga de la tipografía premium **Outfit** desde Google Fonts.
*   **Persistencia y Motor de Deltas en SMB (100% Serverless / Zero-Backend):** La persistencia se divide en 4 bases de datos SQLite independientes según áreas de negocio: `operativa_rrhh.db`, `finanzas_inventario.db`, `comercial.db` y `catalogos_maestros.db`. Todas las operaciones de lectura (`SELECT`) se resuelven exclusivamente sobre la caché local en `%LocalAppData%/IntranetCoordinadores/db_cache/`. Todas las escrituras (`INSERT`, `UPDATE`, `DELETE`) aplican el cambio localmente y generan un archivo de delta JSON atómico en `NETWORK_DIR/deltas/[timestamp]_[uuid]_[dbKey].json`. Esto erradica los errores `SQLITE_CORRUPT` y elimina el copiado ineficiente de archivos `.db` completos por red.
*   **Replicación y Refresco en Tiempo Real:** Un proceso en segundo plano en `main.js` vigila la carpeta de deltas mediante `fs.watch` y polling continuo a 1.5s. Al recibir un delta externo, aplica el cambio en SQLite local y emite un evento IPC `app:data-changed` notificando a Alpine.js para refrescar la interfaz en menos de 3 segundos sin reiniciar la app.
*   **Copias de Seguridad Diarias y Política de Rotación:** Al iniciar la aplicación y cada 24 horas, se ejecuta `realizarBackupDiarioYRotacion()`, que copia las bases de datos locales a `NETWORK_DIR/Backups/daily_YYYY-MM-DD_*.db`. Aplica una rotación automática manteniendo únicamente los últimos 7 días de backups y purgando los archivos de deltas en red con antigüedad superior a 14 días.
*   **Blindaje de Seguridad e IPC Handlers de Dominio (RBAC Real):** Se han eliminado los canales genéricos `write-db` y `read-db`. Todas las operaciones se canalizan a través de IPC Handlers de Dominio parametrizados (`app:cuadrante:guardarTurno`, `app:comerciales:actualizar`, etc.) con validación de roles en Node.js en `main.js` (`verifyRole()`). DevTools está deshabilitado en producción (`app.isPackaged`) y el cargador híbrido de código externo se limita a desarrollo.

---

## 2. Estructura de Directorios del Proyecto
La aplicación consta de los siguientes archivos y carpetas clave en su estructura raíz (habiéndose purgado por completo todos los historiales y directorios temporales obsoletos):

```
coordinadores-app/
├── main.js                 # Proceso principal de Electron (Inicialización, Mutex e IPC)
├── preload.js              # Script puente (window.dbAPI expuesta en Context Isolation)
├── package.json            # Metadatos del proyecto y dependencias (sqlite3, electron)
├── config.json             # Configuración dinámica (coordinador, rol, ruta_compartida)
├── schema_operativa.sql    # Esquema: quadrant, incidencias_horarias, ranking + índices
├── schema_finanzas.sql     # Esquema: movimientos_economicos, inventari + índices
├── schema_comercial.sql    # Esquema: kv_store comercial
├── schema_catalogos.sql    # Esquema: empleados, aparcamientos, sociedades, agentes, reglas
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
    ├── migrador/           # Asistente de migración de datos históricos
    │   └── migrador.html
    └── comercials/         # Submódulo de comerciales gestionado con Alpine.js
        ├── comercials.html
        └── js/
            └── comercials.js # Lógica CRUD y estado reactivo
```
```

---

## 3. Funcionamiento de Electron y el Cargador Híbrido
La aplicación aprovecha la separación de procesos de Electron para ofrecer seguridad y flexibilidad de actualización:

### A. Proceso Principal (Main Process - `main.js`)
*   Se ejecuta en un entorno completo de Node.js con acceso a las APIs del sistema operativo de Windows y librerías nativas como `sqlite3`.
*   Crea y gestiona la ventana de visualización (`BrowserWindow`).
*   Configura las rutas dinámicas y de red compartida leyendo el archivo `config.json` al iniciar, extrayendo la propiedad `ruta_compartida` (`NETWORK_DIR`) e inicializando la caché local en `%LocalAppData%/IntranetCoordinadores/db_cache`.
*   **Mapeo de Claves Foráneas (Joins Cruzados):** Al establecer la conexión local con `operativa`, `finanzas` o `comercial`, Electron ejecuta automáticamente la sentencia `ATTACH DATABASE '<ruta_de_catalogos>' AS catalogos;`. Esto hace que las tablas maestras de catálogos estén disponibles en los otros shards para consultas de unión (`JOIN`) transparentemente.
*   **Canales IPC de Dominio e Inyección de Seguridad (RBAC Real):**
    *   Eliminados totalmente los canales IPC genéricos vulnerables (`read-db`, `write-db`, `db-query`, `db-execute`).
    *   Todas las acciones se procesan mediante IPC Handlers de Dominio parametrizados (`app:cuadrante:guardarTurno`, `app:comerciales:actualizar`, etc.) respaldados por validación de roles en Node.js mediante `verifyRole()`.

### B. Proceso de Renderizado (Renderer Process - Carpeta `src/`)
*   Muestra la interfaz gráfica dentro del contenedor Chromium de forma aislada.
*   No tiene acceso directo al sistema operativo ni a Node.js por motivos de seguridad informática (prevención de ataques XSS).
*   Se comunica con el proceso principal mediante las funciones de dominio expuestas en el puente `preload.js` (`window.api`).
*   **Refresco Reactivo en Tiempo Real:** Las vistas Alpine.js se suscriben a `window.api.onDataChanged(callback)`, recargando automáticamente las tablas cuando otra terminal escribe un delta en SMB en menos de 3 segundos.

### C. Cargador Híbrido Dinámico (Modificaciones en Caliente)
El método `createWindow()` en `main.js` realiza la siguiente validación de seguridad:

```javascript
const externalIndexPath = path.join(rootDir, 'src', 'index.html');
const internalIndexPath = path.join(__dirname, 'src', 'index.html');

if (!app.isPackaged && fs.existsSync(externalIndexPath)) {
  // Carga interfaz externa solo en desarrollo
  mainWindow.loadFile(externalIndexPath);
} else {
  // En producción carga exclusivamente la interfaz interna empaquetada
  mainWindow.loadFile(internalIndexPath);
}
```

---

## 4. Persistencia, Sincronización y Control de Concurrencia (Red)
La arquitectura de persistencia se basa en la **Estrategia Serverless por Motor de Deltas (Lectura Local Única + Cola de Cambios Atómicos JSON en SMB)** para erradicar los errores `SQLITE_CORRUPT`, eliminar la transferencia ineficiente de bases de datos enteras y ofrecer un refresco reactivo en tiempo real en entornos sin servidor.

```
                  +-----------------------------------+
                  |   Frontend (Alpine.js / JS UI)    |
                  +-----------------------------------+
                     /                             \
     (Lecturas Locales / SELECT)         (IPC Domain Calls / Dominio)
                   /                                 \
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
```

### A. Lectura Local Única y Persistencia Local
1. **Bases de Datos Locales**: Cada terminal mantiene sus 4 bases de datos SQLite (`operativa_rrhh.db`, `finanzas_inventario.db`, `comercial.db` y `catalogos_maestros.db`) en la caché local del usuario en `%LocalAppData%/IntranetCoordinadores/db_cache/`.
2. **Lecturas Locales**: Todas las consultas `SELECT` se resuelven directamente sobre SQLite local, eliminando bloqueos de red y cuelgues por conectividad lenta.
3. **Joins Cruzados (ATTACH DATABASE)**: Electron ejecuta `ATTACH DATABASE '<ruta_local>/catalogos_maestros.db' AS catalogos;`, permitiendo `JOIN` cruzados con tablas maestras de forma transparente.

### B. Motor de Deltas Atómicos en SMB (`/deltas/`)
1. **Escritura por Deltas**: Al realizar un `INSERT`, `UPDATE` o `DELETE`, el proceso principal `main.js`:
   * Aplica el cambio directamente en la base de datos SQLite local del cliente.
   * Genera un archivo JSON de delta único en `NETWORK_DIR/deltas/[timestamp]_[uuid]_[dbKey].json`.
   * El archivo JSON contiene la acción, tabla, sentencia SQL, parámetros, versión, usuario y `clientId`.
   * **Atomicidad en SMB**: Escribir un archivo JSON individual con GUID único en SMB es una operación 100% atómica y segura en Windows, eliminando colisiones de archivos.

2. **Consumo y Replicación en Tiempo Real**:
   * Un watcher en segundo plano en `main.js` vigila la carpeta `NETWORK_DIR/deltas/` mediante `fs.watch` y polling continuo a 1.5s.
   * Al detectar un delta producido por otra terminal (`clientId` distinto), ejecuta la sentencia SQL en el SQLite local del usuario y registra la transacción en `_applied_deltas` para asegurar idempotencia.
   * Emite el evento IPC `app:data-changed` a `preload.js`, notificando a las vistas reactivas de Alpine.js para refrescar la pantalla en menos de 3 segundos sin reiniciar la aplicación.

### C. Copias de Seguridad Diarias, Rotación y Compactación Automática
1. **Respaldo Diario**: La función `realizarBackupDiarioYRotacion()` en `main.js` respalda las bases de datos locales en `NETWORK_DIR/Backups/daily_YYYY-MM-DD_*.db`.
2. **Rotación de Backups (7 días)**: Eliminación automática de copias de seguridad en `NETWORK_DIR/Backups/` con antigüedad superior a 7 días.
3. **Compactación y Purga de Deltas (Cota 100)**: La función `compactarDeltasEnRedSiEsNecesario()` detecta si existen más de 100 deltas en `NETWORK_DIR/deltas/`. Si se supera la cota, adquiere `_compaction.lock`, consolida los cambios en las bases máster de red, traslada los deltas mayores a 7 días a `NETWORK_DIR/deltas/archive/` y libera el candado. Si otra terminal detecta `_compaction.lock`, pausa 2 segundos automáticamente.
4. **Comprobación de Clock Drift**: Al iniciar, `comprobarDesvioRelojSMB()` verifica la diferencia de tiempo entre el equipo local y el servidor SMB (`.clock_check_[uuid]`). Si difieren más de 60 segundos, emite `app:clock-drift-warning` a la interfaz.

### D. Control de Concurrencia Optimista (OCC)
1. **Validación de Versión**: Las consultas de modificación `UPDATE` incluyen la validación del campo `version` en la cláusula `WHERE` (`WHERE id = ? AND version = ?`) e incrementan automáticamente la versión.
2. **Gestión de Conflictos**: Si la consulta afecta a 0 filas (porque otro usuario modificó el registro previamente), la API devuelve `{ success: false, code: 'OCC_CONFLICT' }`, solicitando al usuario refrescar la información antes de guardar para impedir sobreescrituras ciegas (*Last-Write-Wins*).

---

## 5. Auditoría y Tareas de Mantenimiento
La aplicación se autogestiona para mantener la integridad de los históricos y evitar la saturación de los sistemas mediante `realizarBackupDiarioYRotacion()`.

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
*   **`incidencias_horarias`**: Registro unificado de excepciones al horario normal (vacaciones, bajas y deudas de horas).
    *   `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
    *   `id_trabajador` (TEXT - identificador o nombre del empleado)
    *   `fecha_inicio` (DATE - fecha de inicio de la incidencia)
    *   `fecha_fin` (DATE - fecha de fin de la incidencia)
    *   `tipo_incidencia` (TEXT - 'Vacaciones', 'Baja Médica', 'Deuda Horas (-)', 'Bolsa Horas (+)')
    *   `impacto_horas` (REAL - cantidad de horas que suma o resta)
    *   `coordinador` (TEXT - coordinador responsable)
    *   `estado` (TEXT - estado de la incidencia, por defecto 'Aprobado')
    *   `comentarios` (TEXT - observaciones y detalles libres)
*   **`ranking`**: Tabla de rendimiento y valoración del personal.
    *   `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
    *   `id_trabajador` (TEXT - nombre del empleado evaluado)
    *   `coneixements` (REAL - calificación conocimientos 0.0-10.0)
    *   `atencio` (REAL - calificación atención 0.0-10.0)
    *   `disponibilitat` (REAL - calificación disponibilidad 0.0-10.0)
    *   `actitud` (REAL - calificación actitud 0.0-10.0)
    *   `valoracio` (REAL - media matemática de las notas)
    *   `observacions` (TEXT - comentario sobre el desempeño)
*   **Índices de rendimiento:**
    *   `idx_cuadrantes_filtro` ON `quadrant(fecha, aparcamiento_id)` — Optimiza filtrados por fecha y parking.
    *   `idx_cuadrantes_trabajador` ON `quadrant(agente_id)` — Optimiza búsquedas por trabajador.
    *   `idx_incidencias_fechas` ON `incidencias_horarias(fecha_inicio, fecha_fin)` — Optimiza consultas de rango de fechas.

#### 2. `finanzas_inventario.db`
Centraliza el registro contable de caja chica (gastos) y el control de materiales entregados (uniformes).
*   **`movimientos_economicos`**: Registro unificado de todo el flujo económico (rutas, tickets y compras).
    *   `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
    *   `id_usuario` (TEXT - identificador del usuario que origina el movimiento)
    *   `fecha` (DATE - fecha del movimiento)
    *   `tipo_movimiento` (TEXT - 'Gasto Material', 'Ruta Comercial', 'Ticket Parking')
    *   `concepto` (TEXT - concepto o descripción del gasto)
    *   `importe` (REAL - importe económico del movimiento)
    *   `json_detalles` (TEXT - metadatos estructurados en formato JSON: origen, destino, kms, estado, etc.)
*   **`inventari`**: Control legacy de uniformes y materiales entregados a trabajadores.
*   **Inventario Relacional Consolidado**: Tablas agregadas a `schema_finanzas.sql` para soportar control avanzado y control de concurrencia optimista (OCC).
    *   **`inventario_articulos`**: Catálogo base (`referencia`, `nombre`, `categoria`).
    *   **`inventario_almacenes`**: Lugares físicos de almacenaje.
    *   **`inventario_existencias`**: Stock cruzado entre artículo y almacén. Incluye la columna `version INTEGER DEFAULT 1` para el control de concurrencia optimista y control de dobles descuentos accidentales.
    *   **`inventario_comandas`**: Historial de pedidos y entregas (`data`, `centre`, `uds`, `estat`).
*   **Índices de rendimiento:**
    *   `idx_mov_economicos_filtro` ON `movimientos_economicos(tipo_movimiento, fecha)` — Optimiza filtrados por tipo y fecha.
    *   `idx_mov_economicos_usuario` ON `movimientos_economicos(id_usuario)` — Optimiza búsquedas por usuario.

#### 3. `comercial.db`
Almacena la parametrización de precios, tarifas y datos específicos del módulo comercial.
*   **`kv_store`**: Almacén clave-valor para tarifas y rankings comerciales.
*   **`schema_version`**: Versión del shard comercial.

#### 4. `catalogos_maestros.db`
Contiene la parametrización global del grupo (sociedades, parkings, contratos, personal y reglas de negocio). Es el shard de catálogos compartidos que el cargador adjunta mediante `ATTACH DATABASE` al resto de shards.
*   **`sociedades`**: Define las razones sociales del grupo que gestionan los parkings.
    *   `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
    *   `nombre_fiscal` (TEXT NOT NULL) — Nombre oficial (ej: "Aparcamientos BCN, S.L.")
    *   `codigo_corto` (TEXT NOT NULL UNIQUE) — Iniciales de referencia en la UI (ej: "ABCN")
    *   `activo` (INTEGER DEFAULT 1) — Borrado lógico (0 = inactiva, 1 = activa)
*   **`aparcamientos`**: Catálogo maestro de centros de trabajo.
    *   `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
    *   `numero_obra` (TEXT UNIQUE) — Código de facturación contable (ej: "OB-2301")
    *   `nombre` (TEXT NOT NULL) — Nombre comercial
    *   `zona` (TEXT) — Zona asignada
    *   `es_remotizado` (INTEGER - 0 o 1) — 1 si no requiere presencia física
    *   `tipo_gestion` (TEXT) — 'propio' (gestión directa) o 'socios' (concesión)
    *   `permitir_vacio_laborables` (INTEGER - 0 o 1) — Override de controles de cobertura
    *   `sociedad_id` (INTEGER - FK sociedades.id)
    *   `coordinador_responsable` (TEXT) — 'Albert', 'Laura' o 'Ambos'
    *   `activo` (INTEGER - 0 o 1)
*   **`coberturas_requeridas`**: Turnos obligatorios por aparcamiento (recurrente o extraordinario).
*   **`agentes`**: Catálogo relacional de personal para el algoritmo inteligente de cuadrantes.
    *   `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
    *   `nombre` (TEXT NOT NULL) — Nombre identificativo del agente
    *   `zona_habitual` (TEXT) — Zona preferente
    *   `ranking_score` (INTEGER DEFAULT 50) — Prioridad de asignación (0-100)
    *   `es_empresa_externa` (INTEGER DEFAULT 0) — 1 para proveedores subcontratados sin límites de jornada
    *   `activo` (INTEGER DEFAULT 1)
*   **`empleados`**: Tabla unificada de todo el personal de la empresa (administradores, coordinadores, comerciales y trabajadores), incluyendo credenciales, emails y preferencias operativas.
    *   `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
    *   `nombre` (TEXT NOT NULL) — Nombre completo
    *   `email` (TEXT) — Dirección de correo
    *   `rol` (TEXT NOT NULL) — Rol de acceso ('Trabajador', 'Coordinador', 'Comercial', 'Admin')
    *   `activo` (INTEGER DEFAULT 1)
    *   `version` (INTEGER DEFAULT 1) — Para el Control de Concurrencia Optimista (OCC)
    *   `json_preferencias` (TEXT) — Preferencias operativas: `{"centre": "...", "torn": "...", "zona": "..."}`
*   **`contratos_agentes`**: Historial de vinculaciones de sociedades con agentes (para control de incompatibilidades en cuadrante).
    *   `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
    *   `agente_id` (INTEGER NOT NULL - FK agentes.id)
    *   `sociedad_id` (INTEGER NOT NULL - FK sociedades.id)
    *   `fecha_inicio` (TEXT NOT NULL) — Inicio de contrato (YYYY-MM-DD)
    *   `fecha_fin` (TEXT) — Fin de vigencia (YYYY-MM-DD). `NULL` indica activo/vigente actualmente.
*   **`reglas_config`**: Parámetros globales del motor de cuadrantes.
*   **`historico_aparcamientos`**: Auditoría automática de cambios.
*   **`schema_version`**: Versión actual de catálogos.

### B. Lógica de Sincronización de Personal y Filtro de Roles Operativos
Dado que la base de datos mantiene a los usuarios administrativos (`empleados`) separados de los recursos de cuadrante (`agentes`), la aplicación implementa una sincronización por rol en caliente para garantizar la coherencia:
1.  **Condición de Rol Operativo (`Trabajador`)**: Únicamente los empleados cuyo campo `rol` es igual a `'Trabajador'` se consideran "agentes" aptos para cubrir turnos y por lo tanto aptos para poseer historial de sociedades.
2.  **Sincronización en Alta y Modificación**:
    *   Si se añade o edita un empleado con rol `'Trabajador'`, la aplicación comprueba si existe en la tabla `agentes`. Si no existe, realiza un `INSERT` automático asignándole su zona habitual y activándolo. Si ya existía, realiza un `UPDATE` de su nombre y estado.
    *   Si a un empleado se le modifica el rol a uno no-operativo (ej: se le asciende de `Trabajador` a `Coordinador` o `Admin`), la aplicación ejecuta de forma transparente un `DELETE` sobre la tabla `agentes` para retirarlo de los algoritmos de asignación automática de turnos.
3.  **Gestión de Vinculación de Sociedades (Contratos)**:
    *   La sección de contratos y asignación de sociedades en la interfaz está condicionada a empleados de rol `'Trabajador'`.
    *   Al asociar un empleado a una sociedad con una `fecha_inicio`, se registra en `contratos_agentes` vinculándolo a su ID en `agentes`. El backend cierra automáticamente el contrato previo vigente del agente asignándole como `fecha_fin` el día de inicio del nuevo contrato, garantizando la consistencia temporal de la base de datos relacional.

### C. Trigger de Auditoría en Aparcamientos
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

### B. Arquitectura Reactiva en Cuadrantes y Módulos (Alpine.js)
Con la migración a **Alpine.js (v3.x.x)**, se ha eliminado la manipulación manual del DOM y la delegación imperativa de eventos.
1.  **Renderizado Declarativo**: El calendario de cuadrantes, la lista de paradas de rutas, el stock del inventario, y las tablas de deudas y coberturas se renderizan utilizando directivas `x-for` y `x-show` sobre estructuras de datos locales reactivas.
2.  **Enlace Bidireccional (`x-model`)**: Los filtros (Mes, Año, Parking) y los campos de los formularios (registro de incidencias, nueva ruta, ajuste de inventario, etc.) se enlazan directamente a las variables reactivas de Alpine.js, eliminando la necesidad de buscar elementos por ID.
3.  **Gestión de Eventos Reactivos**: Los clics y cambios en los desplegables se gestionan con directivas `@click` y `@change` integradas directamente en el HTML, lo que mejora la legibilidad y previene fugas de memoria al reconstruir el calendario.
4.  **Carga Síncrona**: Al interactuar con la base de datos a través de `window.dbAPI`, el estado se actualiza en memoria y Alpine.js propaga los cambios instantáneamente a la UI, simplificando el flujo de datos.

---

### C. Resolución de Mismatch de Tipos en Personal (Coordinadores)
Durante la sincronización de archivos de configuración (`coordinadores.json`), se detectó un error `SQLITE_MISMATCH: datatype mismatch` debido a que el campo `id` de los coordinadores en el archivo JSON es una cadena de texto (ej. `"albert"`, `"laura"`), mientras que el esquema de base de datos define `id` en la tabla `agentes` como un `INTEGER PRIMARY KEY AUTOINCREMENT`.
1.  **Solución Implementada**: Se ha incorporado en `main.js` una función hashing hash-a-entero estable de 32 bits denominada `stringToId(str)`.
2.  *   **Estabilidad**: Esta función genera siempre el mismo identificador entero positivo para un string determinado de forma síncrona y predecible.
    *   **Persistencia**: Se aplica a todas las consultas de inicialización y sincronización de agentes y contratos, eliminando la colisión por tipos en SQLite y garantizando la integridad referencial.

---

## 8. Asistente Guiado de Carga de Históricos y Datos Maestros

Con la implantación de la **Fase 10**, SQLite es la fuente de verdad única absoluta en la aplicación, habiéndose eliminado los antiguos fallbacks locales y archivos JSON en la edición diaria. Las migraciones de datos legados se canalizan a través de un asistente premium interactivo y seguro, habiéndose eliminado por completo el Panel de Administración heredado (`admin.html`) por redundancia.

El módulo de **Gestión de Datos Maestros** se ha extraído a una vista dedicada y limpia (`src/maestros/maestros.html`), eliminando la colisión de responsabilidades con el migrador.

```
┌─────────────────────────────────────────────────────────┐
│  🚗 APARCAMIENTOS  [catalogos.db]    Dades Mestres  ▼   │
│  ├─ ⬇ Descargar Datos Actuales / Plantilla              │
│  ├─ ⚙️ Modo: [Añadir] | [Sobrescribir]                  │
│  └─ 📂 Seleccionar JSON → 🚀 Importar → Log inline      │
├─────────────────────────────────────────────────────────┤
│  👥 EMPLEADOS  [catalogos.db]        Dades Mestres  ▼   │
│  └─ (misma estructura, con escritura doble BD)          │
└─────────────────────────────────────────────────────────┘
```

---

### A. Módulo de Gestión de Datos Maestros (`maestros.html`)

Incorporado en el menú principal bajo "Gestió de Dades Mestres", este entorno dedicado permite gestionar los catálogos base del sistema. Cada panel es independiente y llama a operaciones atómicas.

#### A.1 Panel de Aparcamientos

Gestiona la tabla `aparcamientos` de la base de datos `catalogos`.

**Exportar / Plantilla (formato compatible con reimportación):**
Al pulsar *Descargar Datos Actuales*, se ejecuta una consulta sobre `catalogos.aparcamientos` excluyendo la columna `id` interna (autoincremental, no necesaria para reimportación). Si la tabla tiene datos, se descarga el JSON con la fecha en un formato directamente compatible con la importación y con Excel. Si está vacía, se descarga una plantilla de ejemplo con la estructura exacta:

```json
[
  {
    "numero_obra": "OB-0001", "nombre": "Parking Ejemplo",
    "zona": "Zona 1", "es_remotizado": 0, "tipo_gestion": "propio",
    "permitir_vacio_laborables": 0, "sociedad_id": 1,
    "coordinador_responsable": "Albert", "activo": 1
  }
]
```

**Importar (Modo Añadir):**
Ejecuta `INSERT OR IGNORE INTO aparcamientos` para cada fila, preservando los registros existentes.

**Importar (Modo Sobrescribir):**
```sql
DELETE FROM catalogos.aparcamientos;
-- Luego por cada fila del JSON:
INSERT OR IGNORE INTO aparcamientos (numero_obra, nombre, zona, es_remotizado,
  tipo_gestion, permitir_vacio_laborables, sociedad_id, coordinador_responsable, activo)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
```

#### A.2 Panel de Empleados — Doble Inserción y Edición OCC

Este panel se divide en dos modos de gestión:
1. **Edición Individual Interactiva (Alpine.js + OCC):** Una tabla reactiva que permite buscar, editar y crear empleados uno a uno. Incorpora **Control de Concurrencia Optimista (OCC)** verificando que la `version` del empleado no haya sido alterada por otro usuario durante la edición. Si detecta un desajuste, rechaza el guardado y muestra un *Toast* de advertencia (`CONFLICTO`).
2. **Importación Masiva (CRÍTICA):** Implementa una **doble escritura sincrónica** por cada fila de un JSON subido: una inserción en `catalogos.empleados` y otra en `operativa.ranking`.

**Exportar / Plantilla (formato bidireccional):**
Al pulsar *Descargar Datos Actuales*, se fusionan automáticamente los datos de `catalogos.empleados` con los de `operativa.ranking`, se deserializa `json_preferencias` en campos planos (`centre`, `societat`, `torn`, `zona`) y se produce un JSON en el formato exacto de la plantilla. Esto permite el ciclo completo: **Descargar → Editar en Excel → Reimportar**.

**Formato del JSON (exportación e importación usan el mismo formato):**
```json
[
  {
    "agent": "Nom Cognom",
    "email": null,
    "rol": "Coordinador",
    "activo": 1,
    "centre": "NN CONCEPT", "societat": "ABCN",
    "torn": "MATÍ", "zona": "Zona 1",
    "coneixements": 7.5, "atencio": 8.0,
    "disponibilitat": 9.0, "actitud": 8.5,
    "valoracio": 8.25, "observacions": "Sense observacions"
  }
]
```

**Distribución de datos por BD:**

| Campo JSON | Base de datos | Tabla | Campo destino |
|---|---|---|---|
| `agent` | `catalogos` | `empleados` | `nombre` |
| *(constante)* | `catalogos` | `empleados` | `rol = 'Coordinador'` |
| *(constante)* | `catalogos` | `empleados` | `activo = 1` |
| `centre`, `societat`, `torn`, `zona` | `catalogos` | `empleados` | `json_preferencias` (JSON stringify) |
| `agent` | `operativa` | `ranking` | `id_trabajador` |
| `coneixements` | `operativa` | `ranking` | `coneixements` |
| `atencio` | `operativa` | `ranking` | `atencio` |
| `disponibilitat` | `operativa` | `ranking` | `disponibilitat` |
| `actitud` | `operativa` | `ranking` | `actitud` |
| `valoracio` | `operativa` | `ranking` | `valoracio` |
| `observacions` | `operativa` | `ranking` | `observacions` |

**Inicialización automática de la tabla `ranking`:**
Antes de insertar, el sistema garantiza la existencia de la tabla en `operativa`:
```sql
CREATE TABLE IF NOT EXISTS ranking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_trabajador TEXT,
    coneixements   REAL,
    atencio        REAL,
    disponibilitat REAL,
    actitud        REAL,
    valoracio      REAL,
    observacions   TEXT
);
```

**Flujo completo en modo Sobrescribir (Transaccional en backend):**
```javascript
// La vista llama al puente expuesto en preload.js
const res = await window.dbAPI.importarEmpleadosTransaccional(data, modo);

// En main.js (Backend), la inserción es atómica:
db.serialize(() => {
  db.run("BEGIN TRANSACTION");
  db.run("ATTACH DATABASE ? AS operativa", [rutaOperativa]);
  db.run("DELETE FROM empleados");
  db.run("DELETE FROM operativa.ranking");

  // Inserciones preparadas en ambas bases simultáneamente
  
  db.run("COMMIT");
});
`````

**Compatibilidad con JSON legacy:**

| Situación | Comportamiento |
|---|---|
| Array directo `[{...}]` | Se usa directamente |
| Objeto con array anidado | Se extrae el primer array encontrado |
| Campo `agent` presente | Se mapea a `nombre` |
| Sin campo `rol` | Se asigna `'Coordinador'` |
| Sin campo `activo` | Se asigna `1` |
| Métricas ausentes | Se asigna `0` por defecto |

**Log de resultado:** Aparece un `alert()` con el desglose de inserciones correctas en cada BD, más un log inline de color bajo el panel (verde = éxito total, rojo = errores parciales).

---

### B. Asistente Guiado de Carga de Históricos — Flujo de 5 Pasos

Permite importar históricos de manera segura para los módulos de **Cuadrantes**, **Vacaciones**, **Deudas**, **Precios Comerciales**, **Rutas Comerciales** y **Gastos y Kilometraje**:

1.  **Configuración de la Carga (Paso 1):** El usuario selecciona la base de datos a modificar y la estrategia de carga:
    *   *Afegir i Combinar Dades:* Conserva los datos existentes e inyecta los nuevos registros.
    *   *Sobrescriure / Netejar anterior:* Elimina los registros anteriores del rango de fechas del JSON (en el caso de cuadrantes) o limpia la tabla o claves por completo antes de realizar la inserción.
2.  **Copia de Seguridad Obligatoria y Preventiva (Paso 2):** Para mitigar riesgos de corrupción o error humano, el sistema obliga al usuario a realizar un backup físico del archivo SQLite afectado (ej: `operativa_rrhh.db` o `comercial.db`). Electron abre un diálogo interactivo de guardado (`dialog.showSaveDialog`) para que el usuario elija dónde guardar la copia. El asistente bloquea el avance al siguiente paso hasta que el backup se haya creado con éxito en el sistema.
3.  **Chequeo de Catálogos y Matching Manual (Paso 3):** El asistente analiza los nombres de aparcamientos y personas (agentes) contenidos en el archivo JSON legado (incluyendo Comerciales y Cuadrantes) y los contrasta contra los registrados en `catalogos_maestros.db`. Si detecta nombres que no coinciden exactamente, despliega una interfaz para que el usuario resuelva cada discrepancia:
    *   Vincular el nombre legado a un elemento existente de la base de datos (mediante menús desplegables ordenados por similitud).
    *   Crear de forma automática el elemento como un registro nuevo en el catálogo.
    *   Omitir selectivamente los registros que contengan dicha referencia.
4.  **Previsualización y Escritura Atómica (Paso 4):** Muestra una cuadrícula de control con los primeros 100 registros formateados tras aplicar los mapeos de catálogos y resolver los IDs de las entidades. En el caso de comerciales, se limita a una previsualización de los primeros 15 registros. Si el usuario confirma, Electron ejecuta una transacción relacional en bloque o una escritura atómica segura.
5.  **Descarga de Datos Excluidos (Paso 5):** Notifica del resultado numérico de la migración. Si el usuario decidió omitir registros en el Paso 3 o había filas erróneas, habilita un botón para descargar dichos datos en un archivo JSON independiente para su corrección y posterior reintento.

### C. Mapeo y Persistencia Clave-Valor en Comerciales Legacy
*   **Comerciales:** La migración toma los datos legacy del tipo `nn_A_...` o `nn_L_...` y los transforma automáticamente a las claves modernas tipo `dades Albert/comercials_albert_...json` estructurando la matriz de tarifas e inyectándola en la base de datos `comercial.db` -> tabla `kv_store`.
*   **Doble Encapsulado**: Para respetar el esquema original de lectura del frontend (`comercials.html`), el valor se almacena como un objeto JSON que contiene la firma dinámica del mes, y cuyo valor a su vez es el string JSON de la matriz de datos (`double-stringification`), garantizando que la aplicación lea e interprete los datos migrados de forma directa.
*   **Importaciones Manuales KV**: Se mantiene un botón alternativo en la pantalla de inicio para la carga directa de JSONs a la base de datos clave-valor simple sin validación de catálogos relacionales, reservado para soporte técnico.

### D. Carga Histórica de Rutas y Gastos/Kilometraje en Base de Datos de Finanzas
*   **Rutas Comerciales:** Este importador analiza un JSON con paradas fragmentadas y atributos de festivos por trabajador. Agrupa secuencialmente las paradas por cada día y trabajador, generando un recorrido formateado (ej. "PROVENÇA 111 ➤ VALENCIA 243") e inserta el resultado de manera transaccional y atómica en la tabla `movimientos_economicos` de `finanzas_inventario.db` (tipo_movimiento = 'Ruta Comercial').
*   **Gastos y Kilometraje:** Extrae de manera global el trabajador del campo `"nyn_nom_empleat"`, analiza las llaves de meses válidos con prefijo `"nyn_despeses_"`, ignora filas con fecha vacía, y mapea el trayecto, kilómetros, tarifa y peajes a la tabla `movimientos_economicos` (tipo_movimiento = 'Kilometraje') en `finanzas_inventario.db`, guardando los detalles estructurados en el campo flexible `json_detalles`.
*   **Idempotencia e Integridad:** Ambos importadores requieren de confirmación explícita mediante un cuadro de confirmación interactiva. En el modo de sobrescribir, limpian los registros existentes en la tabla unificada del usuario antes de importar; en el modo de añadir, eliminan registros individuales con las mismas coincidencias para evitar la generación accidental de filas duplicadas en caso de reintentos.

---

## 9. Sistema de Roles (RBAC) con Selección en Caliente
La aplicación implementa una arquitectura basada en roles (Role-Based Access Control) que filtra el acceso a los módulos operativos desde una única pantalla interactiva unificada:
1.  **Comercial**: Acceso a todas las pestañas operativas ordinarias (Inici, Quadrant, Rutes, Vacances, Comercials, Ranking, Deutes, Checklist, Despeses, Inventari, SAC, Notificador, Log y Normes) de igual forma que el rol Coordinador, pero sin acceso a las herramientas y menús de administración.
2.  **Coordinador**: Acceso operativo diario (cuadrante, vacaciones, deudas, gastos e inventario) para su gestión personal, y acceso completo a los módulos de administración de coordinadores, aparcamientos y panel administrativo sin la opción de desbloqueo global de archivos.
3.  **Jefe de Operaciones (Administrador)**: Acceso global absoluto, incluyendo todas las herramientas de administración y la opción de desbloqueo global de archivos.

### A. Almacenamiento de Sesión y Selección Interactiva Obligatoria
*   Al arrancar la aplicación, se despliega la pantalla de acceso (`index.html`).
*   **Selección Obligatoria**: Se ha inhabilitado cualquier redirección automática basada en `config.json` para garantizar que el usuario **siempre** deba seleccionar interactivamente su rol (Jefe de Operaciones, Coordinador o Comercial) y su nombre (en el caso de coordinadores) antes de ingresar.
*   Al pulsar "Entrar al Portal", los datos elegidos por el usuario se registran en el almacenamiento de sesión (`sessionStorage`) y se realiza la redirección a `portal.html`.

### B. Ocultación Reactiva y Filtrado Visual
*   En `portal.html`, al cargarse el DOM, el proceso consulta `config.json` únicamente si no existe una sesión previa en `sessionStorage` (respetando la selección manual interactiva del login). Además, se ha incorporado una regla de protección en el motor de persistencia (`persistence.js`) que excluye a los coordinadores físicos (Albert y Laura) del Modo Solo Lectura por rol de visualizador, manteniendo intacto el control de concurrencia (de forma que si el otro coordinador tiene el archivo bloqueado, se respetará el estado de solo lectura por bloqueo concurrente).
*   A continuación, se invoca de manera inmediata el filtrado mediante la función `applyRoleFiltering(role)`. Esta función recorre todos los elementos del menú (etiquetados con `.menu-item` o el atributo `data-roles`) y aplica un estilo imperativo de ocultación (`display: none !important`) a toda sección no permitida para el rol activo. Esto oculta de forma dinámica la administración para comerciales y coordinadores (con sus respectivas exclusiones), mientras mantiene visibles el resto de pestañas operativas ordinarias.

---

## 10. Módulo de Planificación de Rutas y Validación de Propietario

En la pantalla de visitas (`src/ruta/ruta.html`), se ha implementado un sistema inteligente para facilitar la planificación mensual de rutas de los coordinadores Albert y Laura.

### A. Validación de Propietario de Aparcamientos (Resaltado Visual)
*   **Origen de Datos**: Al iniciar el módulo, se invoca `loadAddresses()`, la cual realiza una consulta SQL al shard de catálogos (`catalogos_maestros.db`) mediante `window.dbAPI.read` para obtener la relación completa de aparcamientos y sus coordinadores responsables (`coordinador_responsable` = 'Albert', 'Laura' o 'Ambos').
*   **Control de Coincidencia**: Durante el renderizado de los selectores en `generateCalendar()` y en su evento `onchange`, se valida si el centro seleccionado pertenece al coordinador responsable del calendario.
*   **Estilo Visual de Advertencia**: Si se selecciona manualmente un aparcamiento que pertenece al otro coordinador, se aplica de forma dinámica la clase CSS `.foreign-select` (que tiñe el fondo del desplegable de color naranja/amarillo suave y le añade un borde naranja de advertencia). Esto permite realizar la asignación pero emite una alerta visual clara al usuario.

### B. Algoritmo de Generación Automática de Rutas (`ejecutarGeneracionAuto()`)
Permite generar de manera automática y optimizada la propuesta de visitas para todo el mes en base a parámetros introducidos en un modal flotante.

1.  **Parámetros de Entrada**:
    *   **Visitas Diarias Laborables**: Cantidad de aparcamientos a visitar de lunes a viernes (Dl, Dm, Dc, Dj, Dv), con un rango de 0 a 6.
    *   **Fines de Semana**: Número de fines de semana (de 0 a 4) a planificar de manera aleatoria en el mes.
    *   **Turno de Fin de Semana**: Opción de seleccionar el turno de visitas de sábado y domingo (Mañana, Tarde o Noche). Si se selecciona "Noche" (`nit`), se marca la visita como nocturna activando el flag `-night` en `localStorage` y el estilo visual correspondiente.
    *   **Visitas Máximas por Centro**: Límite mensual del número de veces que se puede planificar un mismo aparcamiento para evitar repeticiones excesivas.
2.  **Filtrado de Centros**: El algoritmo únicamente selecciona aquellos aparcamientos cuyo responsable sea el propio coordinador (Albert o Laura) o figuren asignados a "Ambos".
3.  **Selección Inteligente y Balanceo (`getSiguienteAparcamientoInteligente()`)**:
    *   Filtra los aparcamientos propios que se encuentren por debajo del límite mensual de visitas máximas configuradas.
    *   Si todos los aparcamientos han alcanzado el límite (debido a una configuración muy restrictiva o alta densidad de visitas), el algoritmo selecciona dinámicamente aquellos con el menor número de visitas registradas en el mes para mantener el equilibrio.
    *   Para evitar la repetición del mismo centro en días contiguos, utiliza un sistema de selección secuencial rotativo.
4.  **Limpieza y Persistencia en Red**:
    *   Antes de escribir los nuevos datos, se limpia de forma segura el mes seleccionado del coordinador en el `localStorage` (sin alterar el resto de meses).
    *   Se distribuyen los aparcamientos en los días laborales (excluyendo festivos nacionales, locales, convenios o días de empresa) y en los fines de semana seleccionados.
    *   Por último, se invoca `persistence.syncSave()`, lo que asegura la escritura atómica y segura de todos los turnos generados en la base de datos centralizada en red a través de la API `write-db` con Mutex de Electron.

---

## 11. Compilación y Empaquetado del Ejecutable Portable (.exe)

Para generar el ejecutable portable de la aplicación de Windows, se utiliza la herramienta `electron-packager`. El proceso empaqueta todo el código de la aplicación y sus dependencias de Node.js en un archivo ejecutable optimizado.

### Requisitos Previos
- Tener instalado [Node.js](https://nodejs.org/) y `npm` en el sistema.
- Haber instalado las dependencias de desarrollo y producción ejecutando:
  ```bash
  npm install
  ```

### Comando de Compilación
El comando para iniciar la compilación y empaquetado está definido en el script `package-win` de [package.json](file:///c:/Users/Usuario/Documents/Javier%20Frias/Antigravity/coordinadors/coordinadores-app/package.json):
```bash
npm run package-win
```

### Flujo de Compilación
Al ejecutar el comando, se realizan las siguientes acciones de forma automática:
1. **Empaquetado de Electron**: `electron-packager` compila los recursos en la plataforma de destino de 64 bits para Windows (`--platform=win32 --arch=x64`) y genera la salida en el directorio compartimentado `dist/coordinadores-win32-x64/`.
2. **Copia de Directorios de Datos**: Copia de manera recursiva la carpeta de datos estructurados de configuración (`dades/`) mediante `xcopy`.
3. **Copia del Archivo de Configuración**: Copia del archivo `config.json` de sesión y red compartida en el directorio raíz del ejecutable.

### Estructura de Salida
Una vez completado el proceso con éxito, la carpeta resultante [dist/coordinadores-win32-x64/](file:///c:/Users/Usuario/Documents/Javier%20Frias/Antigravity/coordinadors/coordinadores-app/dist/coordinadores-win32-x64) contiene:
*   `coordinadores.exe`: El archivo ejecutable portable principal que inicia la intranet.
*   `config.json`: Archivo de configuración en caliente (que contiene la ruta a las bases de datos SQLite en red y el rol por defecto).
*   `dades/`: Carpeta que almacena las copias locales de contingencia para coordinadores y aparcamientos.
*   `resources/app.asar`: Archivo comprimido ASAR que contiene todo el código fuente empaquetado y protegido de la aplicación (`src/`, `main.js`, `preload.js`, etc.).

---

## 12. Carga Dinámica de Centros y Robustez en Reglas de Negocio

Con el fin de centralizar la base de datos como fuente única de verdad y evitar redundancias y errores humanos de entrada de datos, se han implementado las siguientes mejoras:

### A. Selectores Dinámicos de Aparcamientos (SAC y Notificador)
Anteriormente, el **Gestor de Incidencias (SAC)** y el **Gestor de Comunicaciones de Clientes (Notificador)** disponían de un selector estático hardcoded con la lista de aparcamientos en sus respectivos archivos HTML. Esto se ha modificado para:
1.  **Cargar desde DB**: Realizar una consulta SQL asíncrona a la base de datos de catálogos cruzándola con la de sociedades para extraer la razón social fiscal de la empresa propietaria:
    ```sql
    SELECT a.numero_obra, a.nombre, a.zona, s.nombre_fiscal
    FROM aparcamientos a
    LEFT JOIN sociedades s ON a.sociedad_id = s.id
    WHERE a.activo = 1
    ORDER BY a.nombre ASC
    ```
2.  **Formateo Dinámico**: Concatenar los valores en el formato: `{numero_obra} - {nombre} - {zona} ({nombre_fiscal})`.
3.  **Mantenimiento de la Compatibilidad**: Asegurar que las lógicas de procesamiento de correos electrónicos y guardado de logs continúen funcionando de forma transparente al recuperar la cadena en el mismo formato estructurado con guiones.

### B. Formulario de Reglas con Restricción y Autocompletado
En la pantalla de administración de reglas de negocio (`regles.html`), se permitía la introducción libre de la clave de la regla. Esto se ha restringido de la siguiente forma:
1.  **Selector Desplegable**: El input de texto se ha sustituido por un desplegable (`<select>`) con las 5 claves reales que el motor lógico de validación de `main.js` entiende (`max_horas_semanales`, `max_dias_mensuales`, `permitir_vacio_laborables`, `bloquear_cruce_sociedades` y `min_horas_descanso_entre_turnos`).
2.  **Autocompletado de Campos**: Al elegir una clave, un listener de cambio (`@change="onClaveChange()"`) de Alpine.js pre-rellena automáticamente los campos asociados:
    *   **Categoría**: Marcada como `VALIDACIÓN`.
    *   **Tipo**: Se ajusta a `numero` o `booleano` de acuerdo a la naturaleza de la regla.
    *   **Valor inicial**: Propone el valor sugerido por defecto del sistema (ej. `40` para horas semanales, `12` para descanso).
    *   **Descripción**: Añade la descripción aclaratoria por defecto de la base de datos para guiar al administrador.
3.  **Adaptabilidad**: La interfaz de Alpine.js expone de forma reactiva el control de introducción de valor de acuerdo con el tipo pre-rellenado (un select Sí/No para booleanos o un campo de tipo numérico para números).

### C. Resiliencia de Red y Aviso de Desconexión (Modo Solo Lectura)
Para evitar que una desconexión o caída de la ruta de red (`NETWORK_DIR`) cause bloqueos o detenciones bruscas del sistema, se ha implementado la resiliencia de red en las escrituras:
1.  **Captura en Escrituras de Mutex**: Toda la lógica física en `safeWriteCombined` (main.js) está envuelta en un bloque de control de excepciones `try/catch`.
2.  **Detección de Errores de Red**: Si se produce un error derivado de falta de conexión a red (como códigos `ENOENT` por ruta inaccesible o `EBUSY` por recurso ocupado), el proceso principal captura la excepción.
4.  **Toast Flotante en la UI**: En `portal.html`, el script puente `preload.js` expone el método `onNetworkStatus` en el objeto global `window.dbAPI`. Al recibir la desconexión, la interfaz muestra un Toast no bloqueante rojo vibrante en la esquina inferior derecha notificando al usuario: *"Red inaccesible. Modo de solo lectura activado."* y ocultándose automáticamente a los 5 segundos.

### D. Capa de Servicios en el Frontend (Repository Pattern)
Con el objetivo de desacoplar la interfaz de usuario de las consultas SQL directas, se ha implementado una capa de servicios en el frontend (`services.js`):
1.  **Objeto Global de Servicios**: Se ha creado `window.AppServices`, que agrupa la lógica de persistencia por dominios de negocio:
    *   `Operativa`: Maneja cuadrantes, turnos, reglas e incidencias de vacaciones.
    *   `Finanzas`: Encapsula los gastos y movimientos de caja y rutas.
    *   `Maestros`: Gestiona los catálogos relacionales de empleados, trabajadores y aparcamientos.
2.  **Integración en Arquitectura Híbrida**: El script se importa en la cabecera del portal (`portal.html`) y de las vistas que operan en iframes (como `vacances.html`), exponiéndose localmente de forma uniforme.
3.  **Prueba de Concepto y Desacoplamiento**: El módulo de vacaciones (`vacances.js`) ha sido refactorizado para sustituir el uso directo del puente IPC `window.dbAPI` por llamadas directas parametrizadas a `window.AppServices.Operativa` y `window.AppServices.Maestros`. Esto centraliza las consultas en un solo punto, facilitando futuras modificaciones en el esquema SQL o la base de datos sin alterar los archivos de la interfaz gráfica.

### E. Módulo de Reportes Operativos y Estadísticas (Rotación y Carga de Trabajo)
Dirigido a directivos y al Jefe de Operaciones para la consulta de información agregada "a mes vencido":
1.  **Rotación por Aparcamiento**: Muestra los turnos y horas acumulados de todos los trabajadores asignados en el mes seleccionado. Realiza un cruce de `quadrant` con `aparcamientos` y `empleados` para resolver los nombres de las entidades en lugar de utilizar datos obsoletos.
2.  **Carga Laboral por Trabajador con Desglose por Aparcamiento**:
    *   Calcula retroactivamente el mes seleccionado y los 3 meses anteriores (cómputo de 4 meses en total) con soporte de cambio de año.
    *   Desglosa de manera pormenorizada por cada trabajador todos los aparcamientos donde ha ejercido funciones, detallando las horas correspondientes y la suma total de carga de trabajo por cada columna mensual.
    *   Sincroniza y muestra la valoración del personal asociada a la tabla `ranking` en `operativa_rrhh.db`, formateada visualmente en semáforo de calidad de servicio (estrellas y alertas verde/amarillo/rojo).
3.  **Acceso Restringido**: El menú está integrado de forma restrictiva al rol `jefe_operaciones` bajo el dropdown "⚙️ Administració".





