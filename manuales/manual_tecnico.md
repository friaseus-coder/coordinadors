# Manual Técnico y de Arquitectura Interna
## Intranet de Coordinadores - Aplicación Portable de Escritorio

Este documento detalla el funcionamiento interno, la arquitectura de archivos, la persistencia y la lógica del sistema de concurrencia al 100%. Está destinado a desarrolladores, administradores de sistemas o personal de soporte técnico.

---

## 1. Stack Tecnológico e Infraestructura
La aplicación se ha diseñado para funcionar sin base de datos SQL relacional ni servidores de backend adicionales (como Node.js locales u hosting web). Esto reduce a cero los costes de mantenimiento y simplifica el despliegue en la red de la oficina.

*   **Runtime:** [Electron.js (v31)](https://www.electronjs.org/), que unifica el motor de renderizado Chromium de Google con el entorno de ejecución Node.js de escritorio.
*   **Frontend (Capa de Presentación):** HTML5, Vanilla CSS3 (diseño responsivo con flexbox y variables CSS) y JavaScript nativo ES6.
*   **Fuentes de Texto:** Carga de la tipografía premium **Outfit** desde Google Fonts.
*   **Persistencia:** Almacenamiento local mediante el `localStorage` de Chromium, sincronizado de forma totalmente asíncrona y no bloqueante con archivos planos estructurados en formato **JSON** a nivel de disco de red compartido.
*   **Concurrencia (Multi-usuario):** Sistema de exclusión mutua mediante archivos físicos de bloqueo de Windows (`.lock`) estructurados en formato JSON con expiración temporal activa (TTL de 3 horas) y detección periódica de pérdida en caliente.

---

## 2. Estructura de Directorios del Proyecto
La aplicación consta de los siguientes archivos y carpetas clave en su estructura raíz:

```
coordinadores-app/
├── main.js                 # Proceso principal de Electron (Main Process)
├── preload.js              # Script puente de seguridad (Context Isolation)
├── package.json            # Metadatos del proyecto y scripts de compilación
├── config.json             # Configuración dinámica de rutas de red (Z:\ o UNC)
├── dades/                  # Carpeta de datos local (Fallback si no hay red)
│   ├── coordinadores.json  # Registro de coordinadores creados dinámicamente
│   ├── aparcamientos.json  # Catálogo maestro de aparcamientos y coordinadores
│   ├── temp/               # Logs temporales de auditoría activa
│   │   └── cambios.jsonl
│   └── dades [Nombre]/     # Subcarpetas creadas dinámicamente por coordinador
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
*   Se ejecuta en un entorno completo de Node.js con acceso a las APIs del sistema operativo de Windows.
*   Crea y gestiona la ventana de visualización (`BrowserWindow`).
*   Configura las rutas dinámicas leyendo `config.json` al iniciar, creando las carpetas `dades/` y `Backups/` automáticamente si no existieran.
*   Expone servicios a través de la comunicación entre procesos (IPC) de forma 100% asíncrona (liberando el hilo principal de Electron) para la lectura y escritura de archivos locales/red, gestión de bloqueos con TTL, y administración de aparcamientos:
    *   `get-aparcamientos`: Lee asíncronamente el catálogo de `aparcamientos.json` o inicializa la base de datos por defecto si no existe.
    *   `save-aparcamientos`: Recibe la lista modificada y la guarda asíncronamente en el disco físico.

### B. Proceso de Renderizado (Renderer Process - Carpeta `src/`)
*   Muestra la interfaz gráfica dentro del contenedor Chromium de forma aislada.
*   No tiene acceso directo al sistema operativo ni a Node.js por motivos de seguridad informática (prevención de ataques XSS).
*   Se comunica con el proceso principal mediante las funciones expuestas en el puente `preload.js` (`window.api`).

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
*   `__dirname` apunta al interior del paquete compilado inmutable `app.asar`.
*   `rootDir` apunta a la carpeta donde reside físicamente el ejecutable `coordinadores.exe`. 
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
                                      |    - datos.json           |
                                      |    - ~datos.json.lock     |
                                      +---------------------------+
```

### A. Ciclo de Vida de Lectura/Escritura y Control de Concurrencia
Cuando un coordinador abre un módulo (por ejemplo, el Cuadrante de Albert):
1.  **Bloqueo de Red y Registro de Tiempo (TTL de 3 horas):** `persistence.js` llama a `acquire-lock` sobre la ruta de red `dades Albert/quadrant.json`.
    *   El proceso principal de Electron (`main.js`) comprueba si el archivo `dades Albert/~quadrant.json.lock` ya existe y lee su contenido (JSON stringificado).
    *   **Si el bloqueo ha expirado (más de 3 horas transcurridas desde su marca de tiempo):** `main.js` lo elimina de forma automática y asíncrona, otorgando el nuevo bloqueo al usuario solicitante.
    *   **Si el bloqueo pertenece al usuario activo:** Se renueva la marca de tiempo (timestamp) del archivo de bloqueo concediéndole 3 horas más.
    *   **Si está activo por otro usuario:** Devuelve el estado de ocupado. La interfaz gráfica deshabilita todos los controles de edición de forma inmediata y muestra un banner rojo informativo.
2.  **Verificación en Caliente (Heartbeat de 30 segundos):** Durante la sesión de edición, el frontend (`persistence.js`) realiza una comprobación en segundo plano cada 30 segundos (`check-lock`) para validar si el bloqueo sigue perteneciendo al usuario activo. Si un Jefe de Operaciones forzó la liberación o el tiempo del bloqueo expira, la interfaz gráfica lanza un aviso emergente en pantalla y deshabilita de forma irreversible los controles de edición para evitar la pérdida de cambios.
3.  **Carga de Datos:** Si se adquirió el bloqueo, `persistence.js` realiza de forma asíncrona la lectura física (`read-file`), carga los datos en el `localStorage` local y renderiza la interfaz.
4.  **Guardado Optimizado (Debounce a 400 ms y Validación):** Cada edición del usuario escribe en `localStorage` y desencadena un guardado diferido (`debouncedSave` configurado a 400 ms) para reducir la sobrecarga de I/O en la red.
    *   Al ejecutar la escritura en el backend (`write-file`), Electron valida primero que el usuario activo siga siendo el poseedor legítimo del bloqueo. Si el bloqueo se perdió o expiró, la escritura física es rechazada devolviendo el error `LOCK_LOST`, bloqueando la UI del usuario y notificándole inmediatamente.
5.  **Liberación de Bloqueo:** Al volver al menú principal o al cerrar la ventana, el proceso de renderizado llama a `release-lock` para eliminar el archivo `.lock` en red de forma asíncrona.

### B. Gestión Dinámica de Coordinadores
Cuando el Administrador crea un nuevo coordinador (por ejemplo, "Marc López"):
1.  **Registro Central:** Se añade al archivo `coordinadores.json` en la raíz de la carpeta de datos compartida.
2.  **Creación de Estructura:** Electron invoca a `fs.mkdirSync` y crea la subcarpeta `dades Marc/` en el servidor de red.
3.  **Vinculación de Comerciales:** El módulo de Comerciales (`comercials.html`) carga en cada arranque el listado de `coordinadores.json`. Para cada uno genera dinámicamente una sección y apunta a su base de datos individualizada: `dades Marc/comercials_marc_[mes]_[año].json`.

### C. Gestión Dinámica y Centralizada de Aparcamientos (`aparcamientos.json`)
Para evitar discrepancias y permitir una asignación flexible de centros, se ha implementado un catálogo relacional maestro:
1.  **Estructura del Archivo:** En `aparcamientos.json` se almacena un array de objetos con las propiedades `id`, `nombre` y `coordinador` (por ejemplo, `{ "id": 1, "nombre": "ARAGÓ 182", "coordinador": "Albert" }`).
2.  **Carga Dinámica en Módulos:**
    *   **Comerciales (`comercials.html`):** Agrupa dinámicamente las vacantes cargando el catálogo de aparcamientos y cruzándolo con el `localStorage` de cada coordinador. Ya no existen opciones para añadir o eliminar centros locales individuales dentro de la pestaña de Comerciales, unificando la lógica.
    *   **Gastos (`despeses.html`):** La función `loadCentres()` invoca a `window.api.getAparcamientos()` y combina los nombres de los aparcamientos activos de la base de datos con los conceptos fijos auxiliares (ej. `VACANCES`, `FESTIU`), ordenando el selector de forma alfabética.
    *   **Rutas (`ruta.html`):** La función `loadAddresses()` inyecta los aparcamientos activos y conceptos auxiliares directamente en el array global `addresses`, el cual nutre las celdas del calendario. Se oculta el botón de edición local de centros para perfiles de `coordinador` y `comercial` para asegurar que el catálogo dependa enteramente de la base de datos central.
3.  **Gestión Reactiva en el Portal:** El modal de gestión de aparcamientos de `portal.html` se comunica directamente con los canales IPC, de forma que cualquier cambio (añadir, reasignar o eliminar) se guarda de inmediato en la red, reflejándose reactivamente en el resto de pantallas al recargar o al navegar entre ellas.

---

## 5. Auditoría y Tareas de Mantenimiento
La aplicación está programada para autogestionarse sin requerir un administrador de base de datos:

*   **Limpieza de localstorage:** Al iniciar, se ejecuta un proceso automático que elimina del almacenamiento interno de Chromium los logs o registros que tengan una antigüedad superior a dos días para evitar saturar el navegador.
*   **Copia de Seguridad Mensual Dinámica:** Al arrancar, el Proceso Principal comprueba si existe una subcarpeta para el mes actual en el directorio `Backups/` (ej: `Backups/2026-06/`). Si no existe, realiza de forma silenciosa y recursiva una copia de seguridad de toda la carpeta `dades/` hacia ese directorio mensual.
*   **Rotación del Log de Auditoría (`temp/cambios.jsonl`):** El historial de cambios se almacena en formato JSON Lines (JSONL) con escritura asíncrona de tipo "append-only". Al ejecutarse la copia de seguridad del mes nuevo, el log de cambios activo del mes anterior queda archivado de manera definitiva dentro del backup y el archivo `temp/cambios.jsonl` activo se vacía por completo para comenzar un registro limpio sin acumular gigabytes de información en el servidor y garantizando operaciones de log ultrarrápidas de coste constante.
