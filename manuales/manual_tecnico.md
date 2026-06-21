# Manual Técnico y de Arquitectura Interna
## Intranet de Coordinadores - Aplicación Portable de Escritorio

Este documento detalla el funcionamiento interno, la arquitectura de archivos, la persistencia y la lógica del sistema de concurrencia al 100%. Está destinado a desarrolladores, administradores de sistemas o personal de soporte técnico.

-## 1. Stack Tecnológico e Infraestructura
La aplicación se ha diseñado para funcionar sin servidores de backend ni bases de datos en la nube (como PostgreSQL o MySQL remotos). Esto reduce a cero los costes de mantenimiento y simplifica el despliegue en la red de la oficina.

*   **Runtime:** [Electron.js (v31)](https://www.electronjs.org/), que unifica el motor de renderizado Chromium de Google con el entorno de ejecución Node.js de escritorio.
*   **Frontend (Capa de Presentación):** HTML5, Vanilla CSS3 (diseño responsivo con flexbox y variables CSS) y JavaScript nativo ES6.
*   **Fuentes de Texto:** Carga de la tipografía premium **Outfit** desde Google Fonts.
*   **Persistencia (Modelo Relacional):** Base de datos integrada **SQLite (v3)** que implementa un diseño relacional completo de 13 tablas (modelo multisociedad, contratos y reglas parametrizadas) y control de versiones del esquema (`dades.db` en la subcarpeta del coordinador), combinada con el `localStorage` de Chromium en la capa cliente.
*   **Resiliencia y Fallback:** Los catálogos maestros (como `aparcamientos.json`) se escriben y mantienen en JSON plano en el servidor de red como copias de resiliencia secundaria y lectura fallback durante inicializaciones. Sin embargo, la base de datos relacional SQLite es la fuente de verdad primaria.
*   **Concurrencia (Multi-usuario):** Sistema de exclusión mutua mediante archivos físicos de bloqueo de Windows (`.lock`) estructurados en formato JSON con expiración temporal activa (TTL de 3 horas) y detección periódica de pérdida en caliente.

---

## 2. Estructura de Directorios del Proyecto
La aplicación consta de los siguientes archivos y carpetas clave en su estructura raíz:

```
coordinadores-app/
├── main.js                 # Proceso principal de Electron (Main Process y Migraciones)
├── preload.js              # Script puente de seguridad (databaseAPI expuesta en Context Isolation)
├── package.json            # Metadatos del proyecto y scripts de compilación
├── config.json             # Configuración dinámica de rutas de red (Z:\ o UNC)
├── schema.sql              # Definición canónica del esquema relacional (13 tablas + trigger)
├── dades/                  # Carpeta de datos local (Fallback si no hay red)
│   ├── coordinadores.json  # Registro de coordinadores creados dinámicamente
│   ├── aparcamientos.json  # Catálogo maestro de aparcamientos (JSON de resiliencia)
│   ├── temp/               # Logs temporales de auditoría activa
│   │   └── cambios.jsonl
│   └── dades [Nombre]/     # Subcarpetas creadas dinámicamente por coordinador
│       └── dades.db        # Base de datos relacional SQLite individual
├── scripts/                # Scripts de administración, migraciones y utilidades de base de datos
│   ├── rebuild_plantilla.js # Regenera la plantilla de base de datos de inicio
│   ├── run_migration_v2.js # Ejecuta la migración del esquema v1 al esquema v2 en producción
│   └── verify_migration.js # Verifica la integridad y consistencia tras migrar
├── dist/                   # Salida del empaquetado del ejecutable portable
│   └── coordinadores-win32-x64/
│       ├── coordinadores.exe # Ejecutable final de producción
│       └── resources/
│           └── app.asar    # Código fuente empaquetado inmutable
└── src/                    # Carpeta de interfaz de usuario de desarrollo
    ├── index.html          # Pantalla de acceso y login
    ├── portal.html         # Panel general de navegación y control
    ├── css/                # Hoja de estilos compartida del login
    ├── js/
    │   ├── calendari.js    # Base de datos del santoral y festivos
    │   └── persistence.js  # Lógica de sincronización local/red y bloqueos
    └── comercials/         # Submódulo dinámico de comerciales
        └── comercials.html
```

---

## 3. Funcionamiento de Electron y el Cargador Híbrido
La aplicación aprovecha la separación de procesos de Electron para ofrecer seguridad y flexibilidad de actualización:

### A. Proceso Principal (Main Process - `main.js`)
*   Se ejecuta en un entorno completo de Node.js con acceso a las APIs del sistema operativo de Windows y librerías nativas como `sqlite3`.
*   Crea y gestiona la ventana de visualización (`BrowserWindow`).
*   Configura las rutas dinámicas y de red compartida leyendo el archivo `config.json` al iniciar, extrayendo la propiedad `ruta_compartida` para conectar la base de datos única SQLite e inicializar los directorios si no existieran en la unidad de red local.
*   **Inicialización y Migración del Esquema:** Al arrancar el programa, lee el archivo `schema.sql` y ejecuta `aplicarSchemaCanonicoYMigrar()` para asegurar que todas las tablas existan en el `dades.db` del coordinador. Compara la versión instalada en la tabla `versiones_esquema` con la versión esperada mediante `comprobarVersionYMigrar()`. Si detecta una versión inferior (por ejemplo, v1), ejecuta el flujo `migrarV1aV2()`, el cual importa los datos legados de `aparcamientos.json` a la tabla relacional de aparcamientos vinculándolos a la sociedad por defecto y actualizando el número de versión a la versión 2.
*   Expone servicios a través de la comunicación entre procesos (IPC) de forma 100% asíncrona para la lectura/escritura de archivos locales/red, gestión de bloqueos con TTL, y el nuevo modelo relacional:
    *   `read-file` y `write-file`: Control de persistencia clave-valor heredada para el cuadrante diario, validando bloqueos activos y garantizando transacciones seguras en SQLite (`INSERT OR REPLACE INTO kv_store`).
    *   **Canales IPC Relacionales de Sociedades:** CRUD de la tabla `sociedades` (`get-sociedades`, `add-sociedad`, `update-sociedad`, `deactivate-sociedad`).
    *   **Canales IPC Relacionales de Aparcamientos:** Consulta y modificación estructurada (`get-aparcamientos-relacional`, `update-aparcamiento-relacional`) que escribe en la tabla `aparcamientos` de SQLite y sincroniza el catálogo `aparcamientos.json` como backup secundario.
    *   **Canales IPC de Contratos de Agentes:** CRUD de contratos vinculando coordinadores/agentes con sociedades del grupo (`get-contratos-agente`, `add-contrato-agente`, `cerrar-contrato-agente`).
    *   **Auditoría de Cambios en Aparcamientos:** El canal `get-historico-aparcamiento` lee directamente la tabla `historico_aparcamientos` para auditar cualquier cambio realizado sobre los aparcamientos a través de un trigger.
    *   `import-json-data`: Importa volcados JSON de backups legados mapeándolos y guardándolos transaccionalmente en SQLite.
    *   **Canales IPC de Vacaciones:** Control y persistencia de vacaciones (`get-vacaciones-relacional`, `save-vacacion-relacional`, `delete-vacacion-relacional`) y herramienta de migración masiva (`migrar-json-vacaciones`).
    *   **Canales IPC de Finanzas (Deudas y Gastos):** CRUD transaccional para la gestión de deudas (`get-deutes-relacional`, `save-deute-relacional`, `delete-deute-relacional`) y gastos mensuales (`get-despeses-relacional`, `save-despesa-relacional`, `delete-despesa-relacional`).
    *   **Canales IPC de Inventarios:** CRUD para el seguimiento de artículos de uniforme y equipamiento de coordinadores (`get-inventari-relacional`, `save-inventari-relacional`, `delete-inventari-relacional`).

### B. Proceso de Renderizado (Renderer Process - Carpeta `src/`)
*   Muestra la interfaz gráfica dentro del contenedor Chromium de forma aislada.
*   No tiene acceso directo al sistema operativo ni a Node.js por motivos de seguridad informática (prevención de ataques XSS).
*   Se comunica con el proceso principal mediante las funciones expuestas en el puente `preload.js` (`window.api`).
*   **Puente de API Relacional (`window.api.databaseAPI`):** En `preload.js` se definen y exponen los métodos que permiten al frontend llamar a los handlers del proceso principal para consultar y modificar sociedades, contratos, aparcamientos relacionales, históricos de base de datos, vacaciones, deudas, gastos e inventarios de manera limpia y segura.

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
El archivo `src/js/persistence.js` es el núcleo lógico que coordina la carga, el guardado y el bloqueo multi-usuario en la red local.

```
                  +---------------------------+
                  |    persistence.js (Web)   |
                  +---------------------------+
                     /                     \
        (Lectura/Escritura Local)       (IPC Bridge en preload.js)
                   /                         \
      +------------------------+      +---------------------------+
      | localstorage (Chrome)  |      |   main.js (Node / Red)    |
      +------------------------+      +---------------------------+
                                                    |
                                       (Acceso Físico al Servidor)
                                                    |
                                      +---------------------------+
                                      |   Disco de Red Compartido  |
                                      |    - dades.db (SQLite)    |
                                      |    - ~quadrant.json.lock  |
                                      +---------------------------+
```

### A. Ciclo de Vida de Lectura/Escritura y Control de Concurrencia
Cuando un coordinador abre un módulo (por ejemplo, el Cuadrante de Albert):
1.  **Bloqueo de Red y Registro de Tiempo (TTL de 3 horas):** `persistence.js` llama a `acquire-lock` sobre la ruta de red `dades Albert/quadrant_ALBERT.json`.
    *   El proceso principal de Electron (`main.js`) comprueba si el archivo de bloqueo `dades Albert/~quadrant_ALBERT.json.lock` ya existe y lee su contenido (JSON stringificado).
    *   **Si el bloqueo ha expirado (más de 3 horas transcurridas desde su marca de tiempo):** `main.js` lo elimina de forma automática y asíncrona, otorgando el nuevo bloqueo al usuario solicitante.
    *   **Si el bloqueo pertenece al usuario activo:** Se renueva la marca de tiempo (timestamp) del archivo de bloqueo concediéndole 3 horas más.
    *   **Si está activo por otro usuario:** Devuelve el estado de ocupado. La interfaz gráfica deshabilita todos los controles de edición de forma inmediata y muestra un banner rojo informativo.
2.  **Verificación en Caliente (Heartbeat de 30 segundos):** Durante la sesión de edición, el frontend (`persistence.js`) realiza una comprobación en segundo plano cada 30 segundos (`check-lock`) para validar si el bloqueo sigue perteneciendo al usuario activo. Si un Jefe de Operaciones forzó la liberación o el tiempo del bloqueo expira, la interfaz gráfica lanza un aviso emergente en pantalla y deshabilita de forma irreversible los controles de edición para evitar la pérdida de cambios.
3.  **Carga de Datos:** Si se adquirió el bloqueo, `persistence.js` realiza de forma asíncrona la lectura física (`read-file`) que consulta directamente la base de datos SQLite integrada (`dades.db`) cargando el valor en el `localStorage` local y renderizando la interfaz.
4.  **Guardado Optimizado (Debounce a 400 ms y Validación):** Cada edición del usuario escribe en `localStorage` y desencadena un guardado diferido (`debouncedSave` configurado a 400 ms) para reducir la sobrecarga de I/O en la red.
    *   Al ejecutar la escritura en el backend (`write-file`), Electron valida primero que el usuario activo siga siendo el poseedor legítimo del bloqueo. Si el bloqueo se perdió o expiró, la escritura física en SQLite es rechazada devolviendo el error `LOCK_LOST`, bloqueando la UI del usuario y notificándole inmediatamente.
5.  **Liberación de Bloqueo:** Al volver al menú principal o al cerrar la ventana, el proceso de renderizado llama a `release-lock` para eliminar el archivo `.lock` en red de forma asíncrona.

### B. Gestión Dinámica de Coordinadores
Cuando el Administrador crea un nuevo coordinador (por ejemplo, "Marc López"):
1.  **Registro Central:** Se añade al archivo `coordinadores.json` en la raíz de la carpeta de datos compartida.
2.  **Creación de Estructura:** Electron invoca a `fs.mkdirSync` y crea la subcarpeta `dades Marc/` en el servidor de red.
3.  **Vinculación de Comerciales:** El módulo de Comerciales (`comercials.html`) carga en cada arranque el listado de `coordinadores.json`. Para cada uno genera dinámicamente una sección y apunta a su base de datos individualizada: `dades Marc/comercials_marc_[mes]_[año].json`.

### C. Gestión Dinámica y Centralizada de Aparcamientos en SQLite
Para evitar discrepancias, posibilitar la segmentación multisociedad y garantizar la consistencia relacional de la información, el catálogo de aparcamientos se ha trasladado enteramente a SQLite:
1.  **Estructura Relacional:** En la tabla `aparcamientos` se guarda un registro estructurado con `id`, `nombre`, `direccion`, `numero_obra` (identificador oficial de obra/centro), `sociedad_id` (clave foránea a la empresa del grupo), y `coordinador_id` (responsable del centro).
2.  **Carga Dinámica en Módulos:**
    *   **Comerciales (`comercials.html`):** Consulta de forma relacional cruzada los aparcamientos de SQLite mediante el canal IPC `get-aparcamientos-relacional` para agrupar dinámicamente las vacantes según la asignación de coordinadores y sociedades.
    *   **Gastos (`despeses.html`) y Rutas (`ruta.html`):** Invocan a la API relacional para obtener los centros activos y alimentan sus selectores y arrays internos automáticamente, vinculándolos a su respectivo responsable y número de obra sin dependencias locales sueltas.
3.  **Resiliencia mediante JSON secundario:** Al guardar un aparcamiento, el sistema escribe la modificación en SQLite y, de forma secundaria y en paralelo, regenera el archivo `aparcamientos.json` en red. Esto sirve como fallback de solo lectura en arranques problemáticos o para mantener la retrocompatibilidad con módulos legados en proceso de migración.
4.  **Gestión Reactiva y Borrado Lógico:** El modal de aparcamientos en `portal.html` invoca al canal IPC `save-aparcamientos` para guardar el estado completo del catálogo. Los cambios se guardan transaccionalmente en la base de datos única SQLite. Aquellos aparcamientos que han sido eliminados de la lista de la interfaz por el usuario (y por ende no viajan en el payload del cliente) son detectados por `save-aparcamientos` y marcados mediante borrado lógico (`activo = 0`), lo cual asegura la consistencia de los datos históricos y previene que sigan apareciendo en consultas activas.
5.  **Importación y Exportación Masiva en Excel (CSV)**: El frontend expone las funciones `exportarAparcamentsCSV()` e `importarAparcamentsCSV(input)`. 
    - La exportación lee el catálogo relacional completo y genera un documento CSV separado por punto y coma (`;`) forzando el carácter de codificación BOM (`\uFEFF`) para compatibilidad directa con MS Excel en entornos Windows en español/catalán.
    - La importación procesa el CSV del usuario en una transacción SQLite única mediante llamadas directas al canal `db-execute`. Si un aparcamiento cuenta con ID numérico en la fila, ejecuta un `UPDATE`, de lo contrario, realiza un `INSERT` con ID autogenerado, sincronizando posteriormente el archivo JSON de red en caliente con `save-aparcamientos` para mantener la resiliencia en red.


### D. Asistente de Importación y Algoritmo de Mapeo de Discrepancias
Cuando el usuario sube un backup JSON, la aplicación realiza un análisis previo en memoria (`importarBackupJSON`):
1.  **Detección de Discrepancias:** Extrae los aparcamientos de las claves y los trabajadores del campo `w`, y los compara contra los catálogos locales. Si hay discrepancias, despliega el modal `#importMappingModal`.
2.  **Algoritmo de Similitud de Cadenas:** Para cada discrepancia, el sistema busca la opción local más adecuada en `LLISTES` calculando una similitud en base a distancia de caracteres sobre cadenas normalizadas (sin acentos, mayúsculas ni caracteres especiales):
    ```javascript
    const cleanStr = (s) => s.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
    ```
    Si la similitud supera el umbral del `40%`, se preselecciona la opción local en el desplegable de mapeo.
3.  **Procesamiento y Guardado Adaptado:** Al confirmar, el sistema procesa las altas correspondientes (si se seleccionó `[Crear nou...]`), remapea las celdas y claves adaptándolas a la base de datos local y migra los turnos de cualquier versión obsoleta a la versión actual `v12` de cuadrante. Por último, se ejecuta `persistence.syncSave()` para escribir la actualización definitiva en SQLite y se recarga la interfaz.

### E. Módulo de Vacaciones y Gestión de Persistencia Relacional en SQLite
Para evitar discrepancias en la planificación y coordinar los turnos con los descansos del personal, el módulo de vacaciones se conecta directamente a la tabla `vacances` de la base de datos única SQLite:
1.  **Persistencia Interactiva en Tiempo Real:** El frontend de `vacances.html` utiliza identificadores `data-db-id` asociados a cada celda de entrada en el DOM para registrar de forma unívoca el ID asignado por SQLite.
2.  **Operaciones CRUD directas:** 
    - Las modificaciones individuales en la tabla (como fechas de inicio o fin de períodos) se registran de forma asíncrona mediante el método `saveVacacionSQLite` invocando al canal `save-vacacion-relacional`.
    - Las eliminaciones de celdas o filas completas invocan a `deleteVacacionSQLite` liberando las vacaciones correspondientes en SQLite al instante.
3.  **Asistente de Migración de Vacaciones:** Se incorpora un botón de migración masiva (`#btn-migrar-vacaciones-sqlite`) en la barra del módulo de vacaciones. Al ser pulsado, lee el archivo JSON legado, mapea de forma heurística el nombre del coordinador en texto plano contra su identificador numérico de base de datos relacional y realiza una transacción masiva en SQLite (`migrar-json-vacaciones`), sembrando la tabla `vacances` sin pérdidas de información histórica.

### F. Módulos Financieros y de Inventario (Deudas, Gastos, Inventario)
Los submódulos menores de gestión financiera y control operativo (Deudas `deutes`, Gastos `despeses` e Inventario `inventari`) se han migrado completamente al motor SQLite para garantizar la consistencia en el servidor de red local:
1.  **Creación Dinámica de Tablas:** Durante el arranque de la base de datos, el método `asegurarTablasSecundarias(db)` en `main.js` verifica y crea las tablas si no existieran en la base de datos del coordinador.
2.  **Estrategia de Guardado Masivo por Transacción:** Debido a que el frontend de estos módulos procesa y edita colecciones de datos completas en memoria enviando toda la matriz al guardar, se adaptó el backend en `persistence.js` para realizar una operación de vaciado y guardado masivo en una transacción única. Al guardar cambios:
    - Se elimina el contenido activo correspondiente al módulo (`DELETE FROM [tabla]`).
    - Se insertan secuencialmente las nuevas filas enviadas por la interfaz mediante sentencias preparadas en SQLite (`INSERT INTO [tabla]...`).
    - Este flujo mantiene una compatibilidad total con la lógica del frontend legado y asegura que las operaciones de inserción y eliminación sean seguras frente a cortes de red o caídas accidentales.

---

## 5. Auditoría y Tareas de Mantenimiento
La aplicación está programada para autogestionarse sin requerir un administrador de base de datos:

*   **Limpieza de localstorage:** Al iniciar, se ejecuta un proceso automático que elimina del almacenamiento interno de Chromium los logs o registros que tengan una antigüedad superior a dos días para evitar saturar el navegador.
*   **Sistema de Doble Backup Local (Fase 9):** Para proteger la base de datos `dades.db` contra pérdidas de red o fallos de sincronización con el servidor de la nube, el proceso principal implementa dos niveles de salvaguarda física en el directorio local "Documentos" del usuario (bajo la ruta `Documents/Coordinadores_Backups/dades_[coordinador]/`):
    - **Backup Diario (`realizarBackupDiario`):** Al cerrar la aplicación (evento `will-quit`), se copia el archivo de base de datos activa a la subcarpeta `Diario/` con el nombre `dades_[coordinador]_diario.db`. Esta copia se sobrescribe en cada cierre para garantizar el estado diario más reciente.
    - **Cierre Mensual Congelado (`verificarCierreMensual`):** Al iniciar la conexión con la base de datos (`conectarBaseDatosUnica`), el sistema comprueba el mes del calendario. Si detecta que ha cambiado el mes respecto al mes del último cierre, realiza una copia de seguridad histórica inmutable en la subcarpeta `Historico/` con la nomenclatura `dades_[coordinador]_[año]_[mes].db`. Si el archivo de ese mes ya existe, la operación se omite, asegurando una "foto fija" inalterable de cada mes contable.

---

## 6. Modelo de Datos Relacional Multisociedad (v2)

El esquema de la base de datos SQLite se define formalmente en `schema.sql` y se autogestiona mediante migraciones versionadas. Contiene las siguientes 13 tablas relacionales estructuradas:

1.  **`versiones_esquema`**: Controla el número de versión activa de la base de datos para ejecutar migraciones progresivas (v1 -> v2, etc.).
2.  **`sociedades`**: Define las empresas del grupo Núñez i Navarro (id, nombre, CIF, dirección, email, teléfono, estado activo/inactivo).
3.  **`aparcamientos`**: Almacena el catálogo de centros (id, nombre, dirección, número de obra, sociedad asignada mediante `sociedad_id`, y coordinador responsable mediante `coordinador_id`).
4.  **`historico_aparcamientos`**: Registro histórico de cambios del catálogo de aparcamientos para auditoría.
5.  **`agentes`**: Entidades de trabajadores o coordinadores (id, nombre, apellidos, rol, estado activo/inactivo).
6.  **`contratos_agentes`**: Vinculación contractual de los agentes con las sociedades (`agente_id`, `sociedad_id`, fecha de inicio, fecha de fin, si es indefinido).
7.  **`reglas_negocio`**: Parámetros globales aplicados en tiempo real para control de convenios y políticas del grupo.
8.  **`cuadrantes_cabecera`**: Cabeceras mensuales de turnos del coordinador (id, coordinador_id, año, mes, estado cerrado).
9.  **`cuadrantes_detalles`**: Celdas individuales de turnos de trabajadores (id, cabecera_id, trabajador_id, dia, turno, horas, aparcamiento_id, observaciones).
10. **`vacances`**: Registro de vacaciones anuales de los coordinadores (`agente_id`, `fecha_inicio`, `fecha_fin`).
11. **`inventari`**: Control de inventario de uniformes y materiales entregados (`id`, `comercial`, `articulo`, `fecha_entrega`, `estado`, `observaciones`, `activo`).
12. **`despeses`**: Control de gastos y tickets de caja chica mensuales (`id`, `fecha`, `comercial`, `concepto`, `importe`, `estado`, `coordinador`, `activo`).
13. **`deutes`**: Registro de deudas o excesos de jornada por coordinador (`id`, `comercial`, `cliente`, `import`, `fecha`, `activo`).

### Trigger de Auditoría en Aparcamientos
Para garantizar un rastreo histórico completo de cambios en los centros sin sobrecargar la lógica de la aplicación, SQLite ejecuta un trigger automático en la base de datos:
```sql
CREATE TRIGGER IF NOT EXISTS audit_aparcamientos
AFTER UPDATE ON aparcamientos
FOR EACH ROW
BEGIN
    INSERT INTO historico_aparcamientos (
        aparcamiento_id, nombre_anterior, nombre_nuevo, 
        direccion_anterior, direccion_nuevo, 
        numero_obra_anterior, numero_obra_nuevo, 
        sociedad_id_anterior, sociedad_id_nuevo, 
        coordinador_id_anterior, coordinador_id_nuevo, 
        usuario, fecha_modificacion, detalles_cambio
    ) VALUES (
        OLD.id, OLD.nombre, NEW.nombre,
        OLD.direccion, NEW.direccion,
        OLD.numero_obra, NEW.numero_obra,
        OLD.sociedad_id, NEW.sociedad_id,
        OLD.coordinador_id, NEW.coordinador_id,
        'sistema', CURRENT_TIMESTAMP,
        'Actualización automática vía trigger'
    );
END;
```

### Reglas de Negocio Sembradas (Seed)
En la inicialización relacional se cargan por defecto 5 reglas de negocio que restringen y controlan las planificaciones:
*   **`horas_maximas_semanales`**: Límite máximo de horas laborables a la semana por agente (Valor por defecto: `48`).
*   **`descanso_minimo_horas`**: Descanso obligatorio entre jornadas laborales consecutivas (Valor por defecto: `12`).
*   **`dias_vacaciones_anuales`**: Días de vacaciones asignados por año natural (Valor por defecto: `30`).
*   **`permitir_vacio_laborables`**: Determina si se pueden planificar jornadas laborables sin turnos asignados (Valor por defecto: `0` - Falso).
*   **`bloquear_cruce_sociedades`**: Restringe que un agente trabaje en turnos correspondientes a distintas sociedades dentro de una misma semana de cuadrante (Valor por defecto: `1` - Verdadero). El sistema verifica esta regla para evitar conflictos contables y contractuales.

---

## 7. Asistente de Asignación Inteligente y Delegación de Eventos

### A. Algoritmo de Candidatos de Asignación
El asistente lateral de asignación inteligente realiza un procesamiento multicapa en el Proceso Principal (`main.js`) a través de la función `obtenerAsistenteAsignacion(fecha, aparcamientoId)`:
1. **Filtro de Contratos Activos**: Consulta los contratos vigentes de los agentes para la sociedad propietaria del aparcamiento en la fecha solicitada.
2. **Evaluación de Restricciones y Reglas**:
   - **Vacaciones**: Compara el cuadrante y las vacaciones aprobadas del agente para descartar candidatos que se encuentren en período de descanso.
   - **Descanso Mínimo entre Jornadas (12h)**: Compara los turnos asignados del día anterior, día actual y día posterior para asegurar que no se produzca solapamiento o infracción del descanso de 12 horas.
   - **Cruce de Sociedades**: Verifica que el agente no esté asignado a otra sociedad en la misma semana del calendario.
3. **Cálculo de Puntuación (Ranking Score)**: Se puntúa a los trabajadores en base a criterios de conveniencia (cercanía de su domicilio al centro, experiencia previa en el centro, horas acumuladas en el mes para evitar horas extras excesivas y preferencias).
4. **Clasificación**:
   - **Recomendados**: Candidatos que cumplen todas las reglas estrictas. Si su score es mayor o igual a 80, reciben el badge visual `TOP`. Los trabajadores subcontratados reciben el badge `EXTERNO`.
   - **Descartados**: Candidatos excluidos con el motivo explícito del descarte (ej. "En vacaciones", "Infracción de descanso de 12h", "Cruce de sociedades").

### B. Arquitectura de Delegación de Eventos de Interfaz
Debido a que el cuadrante del calendario se genera dinámicamente en el DOM (reconstruyendo todos los elementos `<td>` al filtrar o cambiar de período), los listeners individuales de eventos solían quedar huérfanos o perderse. Para solucionarlo:
1. Se ha inyectado en el renderizado de la tabla atributos de datos específicos en cada celda: `data-fecha`, `data-parking` y `data-sid`.
2. Se implementó un escuchador único global: `document.addEventListener('click', (e) => { ... })`.
3. Al hacer clic, se utiliza `e.target.closest('td')` para identificar la celda correspondiente del cuadrante de forma ágil y centralizada.
4. **Control de Edición Manual**: El listener delegado analiza el estado de la celda en memoria (`cacheDades[sId]`). Si la celda ya tiene un trabajador asignado, el evento no se propaga al asistente lateral. Esto permite que los selectores nativos (`select.select-worker` y `select.select-hour`) funcionen con normalidad al hacer clics sencillos para cambios manuales directos, evitando la sobreposición o apertura no deseada del asistente.

### C. Resolución de Mismatch de Tipos en Personal (Coordinadores)
Durante la sincronización inicial de los archivos de configuración (`coordinadores.json`), se detectó un error `SQLITE_MISMATCH: datatype mismatch` debido a que el campo `id` de los coordinadores en el archivo JSON es una cadena de texto (ej. `"albert"`, `"laura"`), mientras que el esquema de base de datos define `id` en la tabla `agentes` como un `INTEGER PRIMARY KEY AUTOINCREMENT`.
1. **Solución Implementada**: Se ha incorporado en `main.js` una función hashing hash-a-entero estable de 32 bits denominada `stringToId(str)`.
2. **Estabilidad**: Esta función genera siempre el mismo identificador entero positivo para un string determinado de forma síncrona y predecible, independientemente de su posición o adición en el catálogo.
3. **Persistencia**: Se aplica a todas las consultas de inicialización y sincronización de agentes y contratos (`sincronizarAgentesIniciales`), eliminando la colisión por tipos en SQLite y garantizando la integridad referencial.


