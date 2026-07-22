# Manual de Creación y Uso del Instalador Automático
## Intranet de Coordinadores - Aplicación Portable de Escritorio

Este manual detalla los pasos para crear, configurar y distribuir el ejecutable portable (`.exe`) de la aplicación de Coordinadores, usando `electron-packager` para el empaquetado portable y **Inno Setup** para la creación de un instalador de Windows con asistente visual.

---

## 1. Ventajas del Instalador Automático

*   **Distribución simplificada:** Un único archivo ejecutable (`Coordinadores_Setup_vX.X.X.exe`) que el usuario descarga y ejecuta.
*   **Sin privilegios de Administrador (Opcional):** Configurado para instalarse en el directorio de usuario (`LocalAppData`), evitando bloqueos de políticas de IT corporativas.
*   **Accesos directos automáticos:** Crea automáticamente el acceso directo en el Escritorio del usuario con el nombre e icono correctos.
*   **Rendimiento en Red (Caché Local Híbrida):** La aplicación trabaja con una copia caché local de alto rendimiento y escribe en red de forma atómica y segura mediante Mutex. Esto previene bloqueos de red y pérdidas de datos.
*   **Inyección del archivo de configuración:** Se puede preconfigurar la ruta del servidor de red compartida para que el usuario no deba editar manualmente el archivo [config.json](file:///c:/Users/Usuario/Documents/Javier%20Frias/Antigravity/coordinadors/coordinadores-app/config.json).
*   **Cargador Híbrido (Actualizaciones en Caliente):** Si se copia la carpeta `src/` al lado del `.exe`, la aplicación la prioriza sobre el código interno del `.asar`, permitiendo actualizar pantallas sin recompilar.

---

## 2. Changelog de Versiones

### v1.5.1 — 2026-07-22
*   **SISTEMA DE COMPACTACIÓN Y PURGA AUTOMÁTICA DE DELTAS (`/deltas/`):**
    *   **Proceso Consolidador**: Si la carpeta `NETWORK_DIR/deltas/` acumula más de 100 archivos delta (`MAX_DELTAS_THRESHOLD = 100`), la aplicación adquiere el candado de red `_compaction.lock` y consolida todas las transacciones sobre las bases de datos máster SQLite en red (`NETWORK_DIR/*.db`).
    *   **Subcarpeta de Archivo**: Los deltas consolidados con antigüedad > 7 días se trasladan automáticamente a `NETWORK_DIR/deltas/archive/` para mantener la carpeta de deltas limpia y evitar degradación de lecturas SMB.
    *   **Tolerancia a Fallos**: Las terminales concurrentes detectan `_compaction.lock` y pausan automáticamente 2 segundos la lectura para evitar colisiones durante la consolidación.
*   **NORMALIZACIÓN DE TIEMPOS Y TOLERANCIA A CLOCK DRIFT:**
    *   **Nomenclatura ISO UTC**: Cambio de formato de archivo delta a `[timestamp_ISO_UTC]_[hostname]_[uuid]_[dbKey].json` para independencia de husos horarios y cambios de hora de verano/invierno.
    *   **Detección de Desvío de Reloj**: Al iniciar, escribe el archivo de comprobación `.clock_check_[uuid]` en SMB y compara la fecha local con `mtimeMs`. Si la diferencia supera los 60 segundos, emite una alerta no bloqueante notificando el desajuste de reloj de Windows al usuario.
*   **EXTENSIÓN DE OCC A MÓDULOS SECUNDARIOS:**
    *   **Columna Versión**: Incorporación del campo `version INTEGER DEFAULT 1` en las tablas `incidencias_horarias`, `movimientos_economicos`, `despeses`, `deutes`, `inventario_existencias` y `comerciales`.
    *   **Validación de UPDATE**: Consultas de actualización utilizan `WHERE id = ? AND version = ?`. Si las filas afectadas son 0, la API responde `OCC_CONFLICT` y el cliente Alpine.js notifica y recarga los datos sin sobrescribir información ajena.

### v1.5.0 — 2026-07-22
*   **REFACTORIZACIÓN ARQUITECTÓNICA — Motor de Deltas en SMB (100% Serverless / Zero-Backend):**
    *   **Eliminación de Copia de `.db` Completa**: Erradicados los errores `SQLITE_CORRUPT` y las transferencias de bases de datos enteras (`syncToLocal`) y candados `.lock`.
    *   **Persistencia Local y Motor de Deltas**: Lecturas en SQLite local (`%LocalAppData%/IntranetCoordinadores/db_cache/`). Escrituras atómicas produciendo archivos JSON de delta en `NETWORK_DIR/deltas/[timestamp]_[uuid]_[dbKey].json`.
    *   **Replicación y Refresco UI en Tiempo Real**: Proceso de vigilancia en `main.js` (`fs.watch` + polling a 1.5s) que aplica sentencias SQL locales y emite `app:data-changed` a Alpine.js para refrescar la UI en < 3 segundos sin reiniciar la app.
    *   **Copia de Seguridad Diaria y Política de Rotación**: Copia diaria automática en `NETWORK_DIR/Backups/daily_YYYY-MM-DD_*.db` con eliminación automática de backups mayores a 7 días y purga de deltas antiguos de más de 14 días.
*   **BLINDAJE DE SEGURIDAD E IPC HANDLERS DE DOMINIO:**
    *   **Eliminación de API IPC Genérica**: Retirados totalmente los canales `write-db` y `read-db` que aceptaban SQL en texto plano desde el Proceso de Renderizado.
    *   **IPC Handlers de Dominio**: Endpoints explícitos parametrizados (`app:cuadrante:guardarTurno`, `app:comerciales:actualizar`, `app:inventario:actualizarStock`, `app:despeses:guardar`, etc.).
    *   **RBAC Real en Node.js**: Verificación de permisos y rol en `main.js`. Rechazo inmediato en Node.js si un rol no autorizado intenta ejecutar operaciones restringidas.
    *   **Protección de Producción**: Desactivación total de DevTools en ejecutables compilados (`app.isPackaged`). El cargador híbrido de carpetas externas solo se permite en entorno de desarrollo.
*   **CONTROL DE CONCURRENCIA OPTIMISTA (OCC):**
    *   Validación del campo `version` en `UPDATE` (`WHERE id = ? AND version = ?`). Retorno de `OCC_CONFLICT` si otro usuario modificó el registro.

### v1.4.0 — 2026-07-19
*   **ACTUALIZACIÓN — Separación de Datos Maestros y Transaccionalidad:**
    *   El módulo de **Datos Maestros** (Aparcamientos y Empleados) se ha extraído de `migrador.html` a su propia vista dedicada `src/maestros/maestros.html`.
    *   **Transaccionalidad Atómica Multishard (`main.js`):** La importación de Empleados y Aparcamientos ahora usa `ATTACH DATABASE` y bloqueos instantáneos con `BEGIN IMMEDIATE TRANSACTION` nativo de SQLite para prevenir _deadlocks_ y corrupción.
*   **ACTUALIZACIÓN — Control de Concurrencia Optimista (OCC):**
    *   Implementado en la tabla interactiva de `empleados` en el panel de maestros (vía Alpine.js). Utiliza una columna de `version` para evitar colisiones _Last-Write-Wins_ (el sistema bloquea sobreescrituras si la versión cambió).
*   **ACTUALIZACIÓN — Consolidación de Esquemas Financieros:**
    *   Fusión del esquema experimental de `inventario_relacional` directamente dentro de `schema_finanzas.sql`. Eliminación de `schema_finanzas_v2.sql` por redundancia.

### v1.3.0 — 2026-07-18
*   **NUEVO — Asistente de Migración de Datos Históricos (`migrador.html`):**
    *   Implementación de un flujo paso a paso para importar datos (incluyendo el módulo de Comerciales).
    *   Soporte para carga y procesamiento de múltiples archivos simultáneamente.
*   **NUEVO — Módulo de Gestión Comercial (`comercials.html`):**
    *   Gestión de tarifas comerciales con operaciones CRUD completas.
    *   Integración del micro-framework **Alpine.js** para el manejo reactivo del estado en la interfaz.
*   **NUEVO — Soporte de Internacionalización (i18n):**
    *   Implementación de soporte de traducciones (`js/i18n.js`) para múltiples idiomas en la interfaz.

### v1.2.0 — 2026-07-07
*   **NUEVO — Módulo de Reportes Operativos y Estadísticas (`reportes.html`):**
    *   **Pestaña 1 (Rotación por Aparcamiento)**: Conteo total de turnos y personal distinto en el mes seleccionado mediante un `JOIN` dinámico de SQLite entre `quadrant` y catálogos.
    *   **Pestaña 2 (Carga y Desempeño del Personal)**:
        *   Cálculo retroactivo en JS del mes y los 3 meses anteriores con control de cambios de año.
        *   Desglose pormenorizado de las horas mensuales trabajadas por cada empleado en cada uno de los aparcamientos donde ha estado asignado.
        *   Fila de totalización de la carga de trabajo general para el cuatrimestre por empleado.
        *   Recuperación de la nota media de la tabla `ranking` (operativa) con renderizado semáforo (estrellas y colores verde/amarillo/rojo).
    *   **Navegación e Integración**: Botón de reportes integrado de forma restrictiva al rol `jefe_operaciones` bajo el menú colapsable "⚙️ Administració" de `portal.html`.
*   **NUEVO — Capa de Servicios en el Cliente (`services.js`)**: Patrón de Repositorio global (`window.AppServices`) que encapsula y centraliza todas las consultas SQL. Refactorización completa del módulo de vacaciones como prueba de concepto.
*   **NUEVO — Resiliencia ante Pérdidas de Red**: Captura segura de errores `ENOENT` y `EBUSY` durante escrituras de Mutex y SQLite, avisando en la UI con un Toast flotante temporal de solo lectura.

### v1.1.0 — 2026-07-03
*   **NUEVO — Módulo de Datos Maestros en el Migrador (`migrador.html`):**
    *   Panel colapsable **🚗 Aparcamientos**: descarga de datos actuales o plantilla, importación con modo Añadir / Sobrescribir sobre `catalogos.aparcamientos`.
    *   Panel colapsable **👥 Empleados**: descarga de datos actuales o plantilla, importación con **doble inserción simultánea**:
        *   `catalogos.empleados` — nombre, rol, activo, json_preferencias `{centre, societat, torn, zona}`
        *   `operativa.ranking` — id_trabajador, coneixements, atencio, disponibilitat, actitud, valoracio, observacions
    *   Creación automática de la tabla `ranking` en `operativa` (`CREATE TABLE IF NOT EXISTS`) si no existe.
    *   Compatibilidad con JSON legacy: acepta campo `agent` como fuente del nombre, normaliza métricas ausentes a `0`.
    *   Confirmación de Sobrescribir avisa explícitamente de las dos BDs afectadas.
    *   Log de resultado inline bajo cada panel + `alert()` final con desglose de inserciones por BD.

### v1.0.0 — Versión base
*   Arquitectura Electron v31 con SQLite y sharding en 4 BDs.
*   Migrador guiado de 5 pasos (Cuadrante, Vacaciones, Deudas, Comerciales, Rutas, Gastos).
*   Sistema de Mutex físico en red con auto-caducidad de 3 minutos.
*   RBAC con tres roles: Comercial, Coordinador, Jefe de Operaciones.
*   Cargador Híbrido para actualizaciones en caliente sin recompilar el `.exe`.

---

## 3. Requisitos Previos para el Desarrollador

Para generar el archivo de distribución, el desarrollador o administrador de sistemas debe contar con:

1.  **Node.js y npm:** Instalados en el entorno del proyecto.
2.  **Dependencias del proyecto:** Ejecutar una vez en la raíz de `coordinadores-app`:
    ```powershell
    npm install
    ```
3.  **Inno Setup Compiler** *(solo si se quiere generar instalador con Setup Wizard)*: Herramienta gratuita para generar instaladores en Windows.
    *   *Descarga:* [Inno Setup Downloads](https://jrsoftware.org/isdl.php) (se recomienda instalar la versión estable más reciente).

---

## 4. Generar el Ejecutable Portable (`npm run package-win`)

Este es el **paso obligatorio** para actualizar el `.exe` después de cualquier cambio en el código fuente.

```powershell
cd "c:\Users\Usuario\Documents\Javier Frias\Antigravity\coordinadors\coordinadores-app"
npm run package-win
```

El script definido en [package.json](file:///c:/Users/Usuario/Documents/Javier%20Frias/Antigravity/coordinadors/coordinadores-app/package.json) ejecuta los siguientes pasos en cadena:

| Paso | Herramienta | Acción |
|---|---|---|
| 1 | `electron-packager` | Empaqueta la app para Windows x64 en `dist/coordinadores-win32-x64/` |
| 2 | `xcopy` | Copia la carpeta `dades/` (JSONs y DB locales) al directorio de salida |
| 3 | `copy` | Copia `config.json` al directorio de salida |

### Estructura de salida generada

```
dist/coordinadores-win32-x64/
├── coordinadores.exe        ← Ejecutable portable principal
├── config.json              ← Configuración de red (editar ruta_compartida)
├── dades/
│   ├── aparcamientos.json   ← Catálogo de contingencia
│   ├── coordinadores.json   ← Registro de coordinadores
│   └── dades.db             ← BD local de fallback
└── resources/
    └── app.asar             ← Código fuente empaquetado y protegido
```

> [!TIP]
> Para distribuir actualizaciones menores de HTML/CSS/JS **sin recompilar**, copia solo la carpeta `src/` al lado de `coordinadores.exe`. El Cargador Híbrido la detecta y la prioriza automáticamente sobre el código interno del `.asar`.

---

## 5. Script de Inno Setup — Instalador con Setup Wizard (`instalador.iss`)

Para generar un instalador estándar de Windows, cree un archivo `instalador.iss` en la raíz del proyecto:

```ini
; Script de Inno Setup para la Intranet de Coordinadores
#define MyAppName "Intranet de Coordinadores"
#define MyAppVersion "1.1.0"
#define MyAppPublisher "Núñez i Navarro"
#define MyAppExeName "coordinadores.exe"
#define MyAppSrcDir "c:\Users\Usuario\Documents\Javier Frias\Antigravity\coordinadors\coordinadores-app\dist\coordinadores-win32-x64"

[Setup]
AppId={{5A8E19B2-C1A4-4DCE-9FA3-94EE2D2BE1C2}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\IntranetCoordinadores
DisableProgramGroupPage=yes
OutputBaseFilename=Coordinadores_Setup_v1.1.0
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest

[Languages]
Name: "spanish"; MessagesFile: "compiler:Default.isl"
Name: "catalan"; MessagesFile: "compiler:Languages\Catalan.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#MyAppSrcDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#MyAppSrcDir}\config.json"; DestDir: "{app}"; Flags: ignoreversion onlyifdoesntexist

[Icons]
Name: "{userprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{userdesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
```

Para compilar el instalador: abrir el archivo `.iss` en **Inno Setup Compiler** y pulsar `F9` (Build > Compile). El instalador resultante se genera en la subcarpeta `Output/` con el nombre `Coordinadores_Setup_v1.1.0.exe`.

---

## 6. Instrucciones de Instalación para el Usuario Final

1.  **Ejecutar el archivo:** Doble clic sobre `Coordinadores_Setup_v1.1.0.exe`.
2.  **Seleccionar Idioma:** El asistente ofrecerá elegir entre **Español** y **Catalán**.
3.  **Destino:** Se instala automáticamente en `C:\Users\[Usuario]\AppData\Local\IntranetCoordinadores\` *(sin permisos de administrador)*.
4.  **Acceso directo:** Marcar la casilla si se desea acceso directo en el Escritorio.
5.  **Finalizar:** Pulsar *Instalar* y, opcionalmente, marcar *"Ejecutar Intranet de Coordinadores"* al finalizar.

---

## 7. Configuración del Entorno de Red Post-Instalación

Editar el archivo `config.json` en la carpeta de instalación con el Bloc de notas:

```json
{
  "coordinador": "ALBERT",
  "role": "coordinador",
  "theme": "light",
  "language": "es",
  "dadesPath": "P:\\parkings\\dades",
  "backupsPath": "P:\\parkings\\Backups",
  "ruta_compartida": "P:\\parkings\\db"
}
```

Al abrir la aplicación, el sistema inicializará automáticamente en `ruta_compartida` los 4 shards de base de datos si no existieran:

| Archivo | Contenido |
|---|---|
| `operativa_rrhh.db` | Turnos diarios, vacaciones, deudas de horas, tabla `ranking` |
| `finanzas_inventario.db` | Gastos mensuales, inventario de material |
| `comercial.db` | Tarifas y precios de comerciales |
| `catalogos_maestros.db` | Catálogos maestros (aparcamientos, empleados, sociedades, contratos) |

> [!IMPORTANT]
> La tabla `ranking` en `operativa_rrhh.db` se crea automáticamente en la primera importación de empleados desde el Migrador. No es necesaria ninguna acción manual.

---

## 8. Desinstalación

1.  Ir al **Menú Inicio → Configuración → Aplicaciones**.
2.  Buscar **Intranet de Coordinadores** en la lista.
3.  Hacer clic en **Desinstalar** y seguir las instrucciones. El desinstalador elimina todos los archivos del programa de la estación de trabajo local, dejando intactas la base de datos y copias de seguridad de la red.


---

## 1. Ventajas del Nuevo Instalador Automático

*   **Distribución simplificada:** Un único archivo ejecutable (ej. `Coordinadores_Setup_v1.0.0.exe`) que el usuario descarga y ejecuta.
*   **Sin privilegios de Administrador (Opcional):** Configurado para instalarse en el directorio de usuario (`LocalAppData`), evitando bloqueos de políticas de IT corporativas.
*   **Accesos directos automáticos:** Crea automáticamente el acceso directo en el Escritorio del usuario con el nombre e icono correctos.
*   **Rendimiento en Red (Caché Local Híbrida):** La aplicación trabaja con una copia caché local de alto rendimiento y escribe en red de forma atómica y segura mediante Mutex. Esto previene bloqueos de red y pérdidas de datos.
*   **Inyección del archivo de configuración:** Se puede preconfigurar la ruta del servidor de red compartida para que el usuario no deba editar manualmente el archivo [config.json](file:///c:/Users/Usuario/Documents/Javier%20Frias/Antigravity/coordinadors/coordinadores-app/config.json).

---

## 2. Requisitos Previos para el Desarrollador

Para generar el archivo de instalación, el desarrollador o administrador de sistemas debe contar con los siguientes elementos en su ordenador de trabajo:

1.  **Node.js y Electron Packager:** Instalados en el entorno del proyecto.
2.  **Inno Setup Compiler:** Herramienta gratuita para generar instaladores en Windows.
    *   *Descarga:* [Inno Setup Downloads](https://jrsoftware.org/isdl.php) (se recomienda instalar la versión estable más reciente).
3.  **El proyecto compilado:** Tener generada la carpeta de distribución portátil ejecutando en la raíz de `coordinadores-app`:
    ```powershell
    npm run package-win
    ```
    Esto creará el directorio ejecutable portable en: `coordinadores-app\dist\coordinadores-win32-x64\`.

---

## 3. Script de Configuración de Inno Setup (`coordinadores.iss`)

Para automatizar la creación del instalador, cree un archivo de definición en la raíz del proyecto llamado `instalador.iss` con el siguiente contenido:

```ini
; Script de Inno Setup para la Intranet de Coordinadores
#define MyAppName "Intranet de Coordinadores"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Núñez i Navarro"
#define MyAppExeName "coordinadores.exe"
#define MyAppSrcDir "c:\Users\Usuario\Documents\Javier Frias\Antigravity\coordinadors\coordinadores-app\dist\coordinadores-win32-x64"

[Setup]
; Identificador único de la aplicación (generado de manera aleatoria para el instalador)
AppId={{5A8E19B2-C1A4-4DCE-9FA3-94EE2D2BE1C2}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\IntranetCoordinadores
DisableProgramGroupPage=yes
; Nombre del archivo instalador de salida
OutputBaseFilename=Coordinadores_Setup_v1.0.0
Compression=lzma
SolidCompression=yes
WizardStyle=modern
; No requiere privilegios de administrador al instalar en LocalAppData
PrivilegesRequired=lowest

[Languages]
Name: "spanish"; MessagesFile: "compiler:Default.isl"
Name: "catalan"; MessagesFile: "compiler:Languages\Catalan.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Copiar todos los archivos de la distribución de Electron
Source: "{#MyAppSrcDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Excluir archivos innecesarios de desarrollo si existieran
Source: "{#MyAppSrcDir}\config.json"; DestDir: "{app}"; Flags: ignoreversion onlyifdoesntexist

[Icons]
Name: "{userprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{userdesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
```

---

## 4. Pasos para Compilar y Generar el `.exe` del Instalador

1.  **Compilar el Frontend y Empaquetar con Electron:**
    Abra su terminal y asegúrese de que el código fuente está correctamente empaquetado en el directorio portable:
    ```powershell
    cd "c:\Users\Usuario\Documents\Javier Frias\Antigravity\coordinadors\coordinadores-app"
    npm run package-win
    ```
2.  **Abrir el Script en Inno Setup:**
    *   Ejecute **Inno Setup** en su PC de desarrollo.
    *   Abra el archivo `instalador.iss` creado en el paso anterior.
3.  **Compilar el instalador (`Build > Compile` o pulsar F9):**
    *   Inno Setup procesará la carpeta portable, comprimirá todos los archivos y recursos y generará el instalador único.
    *   Por defecto, el instalador generado se guardará en una subcarpeta llamada `Output` en la misma ruta del archivo `.iss`, con el nombre: **`Coordinadores_Setup_v1.0.0.exe`**.

---

## 5. Instrucciones de Instalación para el Usuario Final

Cuando el coordinador reciba el instalador, los pasos para ejecutarlo son sumamente sencillos:

1.  **Ejecutar el archivo:** Hacer doble clic sobre `Coordinadores_Setup_v1.0.0.exe`.
2.  **Seleccionar Idioma:** El asistente detectará la configuración del sistema de Windows y ofrecerá elegir entre **Español** y **Catalán**.
3.  **Destino de la instalación:** El programa se instalará automáticamente en la ruta del usuario:
    `C:\Users\[NombreUsuario]\AppData\Local\IntranetCoordinadores\`
    *(No se requieren permisos de administrador de Windows).*
4.  **Acceso directo:** Marcar la casilla *"Crear un acceso directo en el escritorio"* si se desea tener un acceso directo en el Escritorio.
5.  **Finalizar:** Pulsar en *Instalar*. Al finalizar la barra de carga, se puede marcar la casilla *"Ejecutar Intranet de Coordinadores"* para iniciar la aplicación inmediatamente.

---

## 6. Configuración del Entorno de Red Post-Instalación

El instalador genera por defecto una plantilla del archivo [config.json](file:///c:/Users/Usuario/Documents/Javier%20Frias/Antigravity/coordinadors/coordinadores-app/config.json) en la ruta de instalación del usuario. 

Para conectar la base de datos centralizada de la red compartida (por ejemplo, en la unidad virtual mapeada `P:`):

1.  Vaya a la ruta donde se instaló el programa (puede acceder haciendo clic derecho sobre el acceso directo del escritorio y pulsando en *"Abrir ubicación del archivo"*).
2.  Abra el archivo `config.json` con el Bloc de notas.
3.  Establezca la ruta de red compartida para la base de datos única y el archivo de bloqueos:
    ```json
    {
      "coordinador": "ALBERT",
      "role": "coordinador",
      "theme": "light",
      "language": "es",
      "dadesPath": "P:\\parkings\\dades",
      "backupsPath": "P:\\parkings\\Backups",
      "ruta_compartida": "P:\\parkings\\db"
    }
    ```
4.  Guarde y cierre el archivo. Al abrir la aplicación, el sistema inicializará en la ruta compartida los 4 shards de base de datos si no existieran previamente:
    *   `operativa_rrhh.db`: Turnos diarios, vacaciones y deudas de horas.
    *   `finanzas_inventario.db`: Gastos mensuales e inventario de material.
    *   `comercial.db`: Tarifas y precios de comerciales.
    *   `catalogos_maestros.db`: Catálogos maestros (aparcamientos, sociedades, agentes y contratos).
    La aplicación copiará estos archivos desde la red a la caché local temporal del usuario en su primer inicio, ejecutando todas las lecturas al instante y canalizando las escrituras a la red mediante un sistema de Mutex físico para evitar concurrencias. Cabe destacar que el bloqueo cooperativo visual relacional y el cálculo de alertas de cuadrante han sido desactivados para una mayor libertad de edición concurrente.

---

## 7. Desinstalación

Si se requiere desinstalar o limpiar la instalación:
1.  Vaya al **Menú Inicio de Windows > Configuración > Aplicaciones**.
2.  Busque **Intranet de Coordinadores** en la lista.
3.  Haga clic en **Desinstalar** y siga las instrucciones del asistente automático. El desinstalador eliminará de forma segura todos los archivos del programa de la estación de trabajo local, dejando intacta la base de datos y copias de seguridad de la red.
