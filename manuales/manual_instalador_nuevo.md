# Manual de Creación y Uso del Nuevo Instalador Automático
## Intranet de Coordinadores - Aplicación Portable de Escritorio

Este manual detalla los pasos para crear, configurar y utilizar un instalador automático ejecutable (`.exe`) para la aplicación de Coordinadores. En lugar de copiar y pegar manualmente la carpeta compilada de 180MB en los PCs de los usuarios, este sistema genera un asistente de instalación estándar de Windows (Setup Wizard) utilizando la herramienta gratuita y profesional **Inno Setup**.

---

## 1. Ventajas del Nuevo Instalador Automático

*   **Distribución simplificada:** Un único archivo ejecutable (ej. `Coordinadores_Setup_v1.0.0.exe`) que el usuario descarga y ejecuta.
*   **Sin privilegios de Administrador (Opcional):** Configurado para instalarse en el directorio de usuario (`LocalAppData`), evitando bloqueos de políticas de IT corporativas.
*   **Accesos directos automáticos:** Crea automáticamente el acceso directo en el Escritorio del usuario con el nombre e icono correctos.
*   **Desinstalación limpia:** Registra la aplicación en la lista de programas de Windows para que pueda desinstalarse completamente si es necesario.
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
4.  Guarde y cierre el archivo. Al abrir la aplicación, el sistema cargará los cuadrantes y catálogos de SQLite directamente del servidor de red.

---

## 7. Desinstalación

Si se requiere desinstalar o limpiar la instalación:
1.  Vaya al **Menú Inicio de Windows > Configuración > Aplicaciones**.
2.  Busque **Intranet de Coordinadores** en la lista.
3.  Haga clic en **Desinstalar** y siga las instrucciones del asistente automático. El desinstalador eliminará de forma segura todos los archivos del programa de la estación de trabajo local, dejando intacta la base de datos y copias de seguridad de la red.
