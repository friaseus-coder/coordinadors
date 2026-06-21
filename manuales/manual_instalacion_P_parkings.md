# Manual de Instalación y Despliegue en Unidad P:/parkings
## Intranet de Coordinadores - Aplicación Portable de Escritorio

Este manual describe detalladamente los pasos necesarios para instalar, configurar y desplegar la aplicación compartida de la Intranet de Coordinadores utilizando la unidad de red común **`P:/parkings`** de la empresa Núñez i Navarro.

---

## 1. Requisitos Previos

Antes de comenzar el despliegue, asegúrese de cumplir con los siguientes requisitos en todos los ordenadores de los coordinadores y del Jefe de Operaciones:

1.  **Unidad de Red Mapeada (`P:`)**:
    *   La unidad física de red compartida debe estar mapeada en Windows bajo la letra **`P:`** en todos los ordenadores que utilicen la aplicación.
    *   La ruta de red del servidor debe resolverse directamente como `P:\parkings`.
2.  **Permisos de Carpeta en Red**:
    *   Todos los usuarios del grupo de coordinadores deben tener permisos de Windows de **Lectura**, **Escritura** y **Eliminación (Modificación completa)** sobre la carpeta `P:\parkings`.
    *   > [!IMPORTANT]
        > Los permisos de eliminación son obligatorios. El sistema utiliza archivos de bloqueo físico (`~nombre_modulo.lock`) para controlar la concurrencia entre coordinadores. Estos archivos se eliminan del disco de red automáticamente al salir del módulo o cerrar la app para liberar el acceso.

---

## 2. Preparación de la Estructura en la Unidad Compartida (`P:`)

La base de datos única de SQLite y los ficheros JSON maestros deben estar centralizados en la unidad virtual de red para que todos los puestos lean y guarden sobre la misma fuente de verdad.

1.  Acceda a la unidad **`P:\`** y cree una carpeta llamada **`parkings`** (si no existe).
2.  Dentro de `P:\parkings`, cree la siguiente estructura de carpetas:
    *   `P:\parkings\dades` (Donde residirán los backups, logs e históricos).
    *   `P:\parkings\db` (Donde se alojará la base de datos centralizada de SQLite).
    *   `P:\parkings\Backups` (Carpeta para copias de seguridad mensuales automatizadas).
3.  Copie el contenido inicial desde el directorio del proyecto de desarrollo:
    *   Tome el archivo `coordinadores-app\dades\coordinadores.json` y el fichero `aparcamientos.json` y cópielos dentro de `P:\parkings\dades\`.
    *   Tome la plantilla de base de datos `coordinadores-app\plantilla.db` y cópiela dentro de `P:\parkings\db\`, renombrándola a **`dades.db`**.
    *   > [!NOTE]
        > Si no copia la plantilla, la aplicación la creará de manera automática en el primer arranque aplicando el esquema relacional canónico desde `schema.sql` (que incluye la estructura multisociedad, contratos y reglas parametrizadas).

La estructura final en la red debe verse así:
```text
P:\parkings\
├── Backups\
├── dades\
│   ├── aparcamientos.json
│   ├── coordinadores.json
│   └── temp\
│       └── cambios.jsonl
└── db\
    └── dades.db
```

---

## 3. Compilación y Distribución del Cliente Local

La aplicación es **100% portable**. No requiere ejecutarse como administrador de Windows ni realizar instalaciones mediante instaladores del sistema.

### Paso 1: Compilar la aplicación
1.  Abra una terminal de comandos en la raíz del proyecto (`coordinadores-app`).
2.  Ejecute el comando de empaquetado para Windows de Electron:
    ```powershell
    npm run package-win
    ```
3.  Este comando generará el ejecutable compilado en la ruta:
    `coordinadores-app\dist\coordinadores-win32-x64\`

### Paso 2: Distribuir a los ordenadores de los usuarios
1.  Copie la carpeta completa **`coordinadores-win32-x64`** (que pesa aproximadamente 180MB).
2.  Péguela en una ruta local del ordenador de cada usuario (por ejemplo, en `C:\IntranetCoordinadores\` o en la carpeta `Documentos` de su cuenta de usuario).
3.  Cree un acceso directo al archivo `coordinadores.exe` en el Escritorio del usuario con el nombre **"Intranet de Coordinadores"**.

---

## 4. Configuración del Archivo de Rutas (`config.json`)

En cada instalación local en el PC del usuario, se debe modificar el archivo de configuración para apuntar los accesos de datos a la unidad virtual de red **`P:`**.

1.  Vaya a la carpeta de la aplicación instalada en el ordenador del usuario (`coordinadores-win32-x64`).
2.  Abra el archivo **`config.json`** con el Bloc de notas.
3.  Configure los parámetros de red apuntando a `P:\parkings`. El archivo debe estructurarse del siguiente modo:

```json
{
  "coordinador": "ALBERT",
  "role": "jefe_operaciones",
  "theme": "light",
  "language": "es",
  "dadesPath": "P:\\parkings\\dades",
  "backupsPath": "P:\\parkings\\Backups",
  "ruta_compartida": "P:\\parkings\\db"
}
```

### Explicación de los campos clave:
*   **`coordinador`**: Nombre del coordinador en mayúsculas asignado a esa estación de trabajo (ej: `ALBERT`, `LAURA`).
*   **`role`**: Rol asignado al terminal. Los valores permitidos son:
    *   `jefe_operaciones` (Acceso total de administración y configuración).
    *   `coordinador` (Acceso de edición segura con sistema de bloqueos concurrentes).
    *   `comercial` (Acceso rápido de solo lectura limitado únicamente a la pestaña de Comerciales).
*   **`dadesPath`**: Ruta a la carpeta que contiene los archivos de registro (`coordinadores.json`, `aparcamientos.json`) y de bloqueos en caliente. **Debe apuntar a `P:\\parkings\\dades`**.
*   **`ruta_compartida`**: Ruta a la carpeta que contiene la base de datos única de producción (`dades.db`). **Debe apuntar a `P:\\parkings\\db`**.

> [!WARNING]
> En los archivos de formato JSON de Windows, el carácter de la barra invertida (`\`) se debe escapar utilizando doble barra invertida (`\\`). Si escribe una sola barra (ej. `P:\parkings`), la aplicación fallará al iniciar mostrando un error de parseo.

---

## 5. Actualizaciones y Modificaciones en Caliente (Opcional)

La aplicación implementa un sistema de carga híbrida. Prioriza los archivos ubicados en una carpeta física local externa llamada `src/` por encima del bloque compilado inmutable del ejecutable.

Si desea actualizar pantallas, colores CSS, textos del sistema o solucionar fallos sin tener que volver a compilar y redistribuir el archivo de 180MB:
1.  Tome la carpeta **`src/`** del proyecto de desarrollo.
2.  Péguela al lado de `coordinadores.exe` en el ordenador del usuario.
3.  Cualquier cambio que realice en los archivos HTML, CSS o JS de esa carpeta local se aplicará de inmediato al reiniciar la aplicación.

---

## 6. Verificación de Funcionamiento

Una vez configurada la ruta, realice la siguiente prueba de verificación de red:

1.  Inicie la aplicación pulsando el acceso directo de Escritorio en dos ordenadores de forma simultánea.
2.  Acceda al módulo de **Cuadrante** en el primer ordenador.
3.  Verifique en la unidad compartida de red (`P:\parkings\dades`) que se crea un archivo temporal llamado **`~quadrant.lock`**.
4.  Intente acceder al módulo de **Cuadrante** desde el segundo ordenador. El sistema debe denegar el acceso a la edición mostrando un aviso de que el archivo está bloqueado por el usuario del primer ordenador.
5.  Cierre el cuadrante en el primer ordenador. El archivo de bloqueo de red debe borrarse de forma automática de la unidad `P:`, permitiendo inmediatamente el acceso al segundo puesto.
6.  Abra el panel de **Comerciales** en el ordenador del usuario, realice cambios y valide que los mismos se guarden síncronamente en el archivo de base de datos centralizado `P:\parkings\db\dades.db` (sin crear archivos JSON físicos locales de Comerciales).
