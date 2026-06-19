# Manual de Instalación y Despliegue en Red
## Intranet de Coordinadores - Aplicación Portable de Escritorio

Este manual describe el proceso para instalar, configurar y desplegar la aplicación en la red de la oficina, partiendo de los archivos del proyecto.

---

## 1. Arquitectura de Despliegue
La aplicación funciona sin servidores de base de datos dedicados en red (como PostgreSQL o MySQL). La arquitectura se basa en bases de datos integradas SQLite local-first y archivos de configuración compartidos en red:
*   **El Ejecutable (Cliente):** Se instala/copia localmente en el ordenador de cada coordinador.
*   **La Persistencia de Datos (Servidor de Archivos de Red):** 
    *   La base de datos SQLite integrada **`dades.db`** en la carpeta de cada coordinador (ej. `dades Albert/dades.db`) que gestiona el cuadrante de forma transaccional de clave-valor.
    *   Los archivos de datos y configuraciones globales `.json` (como `coordinadores.json`, `aparcamientos.json` maestros).
    *   Los archivos temporales de bloqueo `.lock` en la red.

```
+--------------------+            +------------------------------------+
|  PC Coordinador 1  | ---------> |                                    |
| (coordinadores.exe)|            |      Disco de Red Compartido       |
+--------------------+            |       (Z:\Coordinadores\dades)     |
                                  |                                    |
+--------------------+            |  - coordinadores.json (registro)   |
|  PC Coordinador 2  | ---------> |  - aparcamientos.json (catálogo)   |
| (coordinadores.exe)|            |  - dades Albert/dades.db (SQLite)  |
+--------------------+            |  - ~comercials_albert.lock         |
                                  +------------------------------------+
```

---

## 2. Archivos del Entorno y su Distribución

### PASO 1: Configurar la Carpeta de Datos Común (Servidor de Red)
1.  Identifica o crea una carpeta compartida en la red local de la oficina (por ejemplo, en la unidad virtual de red `Z:\` o mediante una ruta de red UNC).
    *   *Ejemplo de ruta:* `Z:\Coordinadores\dades`
2.  Copia la carpeta de datos de muestra **`coordinadores-app\dades`** del proyecto y pégala en esa ubicación compartida. Este directorio incluye el fichero maestro **`aparcamientos.json`** y las subcarpetas del coordinador con su correspondiente base de datos SQLite **`dades.db`** (que contiene los cuadrantes históricos y actuales).
3.  **[CRÍTICO] Permisos de Red:** Asegúrate de que todos los usuarios que vayan a usar la aplicación tengan permisos de Windows de **Lectura, Escritura y Eliminación** sobre esta carpeta compartida.
    > [!IMPORTANT]
    > Los permisos de eliminación son imprescindibles, ya que el sistema crea archivos de bloqueo temporales (`~archivo.lock`) durante la edición y los elimina físicamente al salir para liberar el acceso.


### PASO 2: Compilación y Despliegue del Ejecutable en los PCs de los Usuarios
La aplicación cuenta con un **cargador híbrido dinámico**. El ejecutable `.exe` lleva la interfaz integrada internamente en un paquete comprimido (`app.asar`), pero prioriza la carga desde una carpeta externa llamada `src/` colocada a su lado si existe. Esto te permite realizar cambios rápidos de formato o corregir pantallas modificando los archivos locales del usuario sin tener que volver a distribuir un instalador de 180MB.

Para empaquetar e instalar la aplicación en cada puesto:
1.  Abre una consola en la carpeta raíz del proyecto y ejecuta el comando de compilación:
    ```bash
    npm run package-win
    ```
2.  Esto generará la carpeta de distribución en: `coordinadores-app\dist\coordinadores-win32-x64\`.
3.  Copia la carpeta completa llamada **`coordinadores-win32-x64`** y pégala en cada PC del usuario (por ejemplo, en `C:\Programas-Locales\coordinadores-app\` o en su carpeta de `Documentos`).
    > [!TIP]
    > La aplicación es **100% portable**. No requiere privilegios de Administrador para ser ejecutada ni "instalada".

### PASO 3: Vincular el PC del Usuario con el Servidor de Red
En la carpeta instalada de cada usuario (`coordinadores-win32-x64`):
1.  Busca el archivo **`config.json`** y ábrelo con el Bloc de notas.
2.  Modifica el parámetro `"dadesPath"` con la ruta de tu carpeta compartida creada en el Paso 1.
    *   *Ejemplo usando unidad de red:*
        ```json
        {
          "dadesPath": "Z:/Coordinadores/dades",
          "backupsPath": "Z:/Coordinadores/Backups"
        }
        ```
    *   *Ejemplo usando ruta directa del servidor (UNC):*
        ```json
        {
          "dadesPath": "\\\\ServidorOficina\\Coordinadores\\dades",
          "backupsPath": "\\\\ServidorOficina\\Coordinadores\\Backups"
        }
        ```
    > [!WARNING]
    > Utiliza barras inclinadas `/` o dobles barras invertidas `\\` para separar las carpetas en el JSON para evitar errores de sintaxis.
3.  Guarda y cierra el archivo.

### PASO 4: Habilitar Modificaciones en Caliente (Opcional - Recomendado)
Si deseas poder aplicar cambios estéticos o de interfaz de manera instantánea en el ordenador de los usuarios sin volver a compilar:
1.  Copia la carpeta **`src/`** de tu proyecto de desarrollo.
2.  Pégala directamente al lado del archivo `coordinadores.exe` en el PC del usuario.
El ejecutable detectará la carpeta y cargará la interfaz de usuario en caliente desde allí en lugar de usar la versión interna. Cualquier modificación posterior en esos archivos HTML, CSS o JS se aplicará de inmediato al reabrir el programa.

---

## 3. Comprobación y Testeo
1.  Haz doble clic en `coordinadores.exe`.
2.  El sistema debe iniciar mostrando la pantalla de selección de perfiles en base a la tipografía corporativa **Outfit**.
3.  Entra como **Coordinador**, selecciona tu nombre y accede a cualquier módulo.
4.  Comprueba que la carga y guardado de datos sean instantáneos. Revisa la carpeta compartida en el servidor para verificar que aparezcan los correspondientes archivos de bloqueo `~[nombre_modulo].lock` mientras los estás editando y que desaparezcan automáticamente al salir del módulo o cerrar la aplicación.

---

## 4. Auditoría y Copias de Seguridad Automáticas
*   **Log de Auditoría (`temp/cambios.jsonl`):** Creado automáticamente en la carpeta de red compartida en formato JSON Lines (JSONL). Registra cada guardado en una nueva línea detallando timestamp, usuario, módulo y acción de forma eficiente y append-only.
*   **Traspaso y Limpieza Mensual:** No requiere intervención humana. El primer usuario que inicie la aplicación en un mes nuevo provocará que Electron guarde una copia de seguridad recursiva en la carpeta `Backups/` del servidor, archive el log del mes anterior en dicha copia y vacíe el archivo temporal `temp/cambios.jsonl` activo para comenzar el registro limpio del nuevo mes.
