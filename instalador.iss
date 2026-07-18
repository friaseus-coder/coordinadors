; Script de Inno Setup para la Intranet de Coordinadores
#define MyAppName "Intranet de Coordinadores"
#define MyAppVersion "1.2.0"
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
OutputBaseFilename=Coordinadores_Setup_v1.2.0
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
