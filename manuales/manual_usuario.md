# Manual del Usuario
## Intranet de Coordinadores - Aplicación de Escritorio

Este manual describe el funcionamiento diario de la aplicación de Coordinadores, el uso de sus nuevos módulos dinámicos y cómo funciona el sistema de seguridad para trabajar en equipo sin perder información.

---

## 1. ¿Cómo entrar al programa?
1.  Busca el acceso directo **"Intranet de Coordinadores"** en el Escritorio de tu ordenador y haz doble clic.
2.  La aplicación se abrirá mostrando el nuevo diseño premium corporativo.

---

## 2. Pantalla de Acceso: Selección de Perfil
Al iniciar, verás una pantalla donde debes seleccionar tu rol. Dependiendo del perfil elegido, se te otorgarán diferentes permisos:

*   **Jefe de Operaciones (Administrador):** Permite lectura y escritura completas. Además de modificar datos, habilita la opción de **forzar el desbloqueo** de archivos si un compañero dejó un módulo abierto en otro equipo y la pestaña de **Gestión de Coordinadores**.
*   **Coordinador (Edición Segura):** Permite modificar cuadrantes, vacaciones, inventarios, etc., protegiendo el trabajo mediante bloqueos en tiempo real. Al seleccionarlo, debes elegir tu nombre de la lista desplegable.
*   **Otro Perfil (Solo Lectura):** Diseñado para usuarios de consulta rápida (ej. facturación, comerciales, etc.). No bloquea los archivos ni permite guardar cambios.

---

## 3. La Interfaz del Portal Principal
El portal ha sido completamente rediseñado siguiendo la línea estética oficial de Núñez i Navarro Pàrkings:
*   **Logotipo Oficial:** Ubicado a la izquierda, identifica el sistema con el sello oficial de la marca (*Grup Núñez i Navarro _parkings*).
*   **Selector de Pestañas tipo "Pills"**: Las secciones de la barra superior están estilizadas como cápsulas redondeadas sobre un fondo gris suave. La sección activa destaca en color blanco con sombra, indicando claramente dónde estás situado.
*   **Barra Adaptativa**: Si la pantalla es estrecha, las pestañas no se solapan ni colisionan. La barra permite un desplazamiento (scroll) lateral suave y oculto para garantizar el acceso a todos los módulos.
*   **Bienvenida y Reloj**: El panel principal de bienvenida cuenta con un diseño de tarjeta flotante minimalista, un reloj digital con segundero parpadeante y un aviso automático si algún coordinador cumple años ese día.

---

## 4. Gestión Dinámica de Coordinadores (Solo Jefe de Operaciones)
El administrador ahora puede gestionar quién tiene acceso al sistema directamente desde la barra superior de la aplicación:
1.  En la esquina superior derecha, haz clic en el botón **⚙️ Coordinadors**.
2.  Se abrirá un cuadro de diálogo donde podrás ver la lista completa de los coordinadores registrados.
3.  **Registrar Coordinador:** Escribe el nombre y apellido en el formulario superior y pulsa **➕ Afegir**.
    *   *Efecto automático:* Se creará una nueva carpeta en la red compartida para sus datos (ej. `dades Marc/`) y se le añadirá a la lista de login.
    *   *Comerciales:* En la pestaña de comerciales, se creará automáticamente una sección dedicada a él con sus tablas y botones individuales de control.
4.  **Eliminar Coordinador:** Pulsa el botón **✕ Eliminar** al lado de su nombre. El coordinador se borrará de la lista de acceso de inmediato, pero sus archivos de datos de la carpeta de red se conservarán intactos por seguridad.

---

## 5. Gestión de Aparcamientos (Solo Jefe de Operaciones)
El Jefe de Operaciones tiene control total sobre el catálogo de aparcamientos de la empresa y la asignación a su respectivo coordinador responsable:
1.  Haz clic en el botón **🚗 Aparcaments** en la barra superior del Portal.
2.  Aparecerá el panel de gestión donde se muestra el catálogo completo en una tabla interactiva:
    *   **Crear Aparcamiento:** En la parte superior, escribe el nombre del nuevo aparcamiento, selecciona el coordinador que será responsable de él y pulsa **Afegir Aparcament**.
    *   **Reasignar Coordinador:** Al lado de cada aparcamiento de la lista, un desplegable muestra el coordinador asignado actualmente. Si deseas cambiar el responsable en tiempo real, simplemente despliega el menú y selecciona el nuevo coordinador. El cambio se guarda automáticamente y de forma inmediata en la red.
    *   **Eliminar Aparcamiento:** Haz clic en el botón rojo **Eliminar** en la fila correspondiente al aparcamiento.
3.  **Impacto Global:** Cualquier cambio en la asignación de coordinadores se reflejará dinámicamente en:
    *   **Comerciales:** Los aparcamientos se agruparán automáticamente bajo el coordinador asignado.
    *   **Gastos y Rutas:** Los desplegables y calendarios cargarán exclusivamente la lista actualizada de aparcamientos activos.
    *   **Seguridad:** En la pestaña de **Rutas**, se ha inhabilitado el botón de edición local de centros para los coordinadores, evitando la creación de duplicados e inconsistencias.

---

## 6. Módulo de Comerciales y Legibilidad
El apartado de **Comercials** (Disponibilidad y Tarifas) ha sido mejorado para ofrecer una lectura muy espaciosa y descansada:
*   **Mayor Amplitud**: El padding de las tablas se ha ampliado y el interlineado se ha fijado en **1.5** para que la información respire.
*   **Columna de Observaciones Ampliada**: Se le ha dado una anchura del **28% del total de la tabla** (más de 300px) para que los textos largos de los coordinadores no se amontonen verticalmente.
*   **Diseño de Acciones Rápidas**: El botón para copiar los datos al portapapeles está integrado de forma sutil, habiéndose eliminado los botones de creación o borrado local de centros en favor del catálogo maestro central.
*   **Scroll Horizontal de Tabla**: La tabla tiene un ancho mínimo protegido de **1100px**. Si reduces el tamaño de la ventana, las columnas no se aplastarán entre sí, sino que se habilitará una barra de desplazamiento horizontal en la parte inferior para deslizar la tabla con total claridad.
*   **Alertas por Color**: Las vacantes se colorean automáticamente según el riesgo (Verde oscuro para óptimo, Azul para riesgo medio, y Rojo para urgente).

---

## 7. Control de Turnos y Cuadrante Modernizado
La pantalla del **Quadrant** (Control de Turnos) se ha unificado bajo una estética de diseño premium con la tipografía **Outfit** y colores pastel refinados:
*   **Barra de Herramientas Organizada**: Las utilidades del cuadrante están distribuidas en 4 grupos claros para evitar confusiones:
    1.  **Periodo y Filtros:** Para seleccionar el mes/año y filtrar las filas visibles por Centro, Trabajador o Turno, con el botón `Reset Filtres` integrado.
    2.  **Acciones del Cuadrante:** Incluye `Recompte Hores` (calcula horas diurnas/nocturnas/festivas contra el convenio y dibuja barras comparativas en un modal), `Gestionar Dades` (abre el editor de catálogos solicitando la contraseña `"1234"` para evitar modificaciones accidentales), `Exportar a [Mes]` (rotación inteligente al mes siguiente) y `Tancar Mes` (bloquea la edición del mes mediante contraseña).
    3.  **Archivos e Importación:** Botones para descargar el cuadrante en **Excel**, enviar a **Imprimir/PDF**, exportar backups en JSON o restaurar copias de seguridad de cuadrantes y vacaciones.
    4.  **Zona de Peligro:** Situado en el extremo derecho, el botón rojo coral `Esborrar dades del mes` realiza un borrado total. Requiere escribir tu nombre y confirmar dos veces por escrito para evitar ejecuciones accidentales.
*   **Persistencia SQLite (dades.db)**: El cuadrante ya no se guarda en JSON plano propenso a corrupciones de escritura. El sistema escribe y lee en caliente los turnos sobre una base de datos integrada y rápida (`dades.db`) en la carpeta del coordinador, de forma transaccional y totalmente segura.

---

## 8. Asistente de Importación con Mapeo de Discrepancias
Cuando importes un archivo de copia de seguridad JSON al cuadrante:
1.  **Análisis Automático:** El asistente escaneará el archivo y extraerá todos los centros y empleados que contiene.
2.  **Pantalla de Discrepancias (Modal):** Si detecta centros o trabajadores que no existen en tu base de datos o catálogo actual, abrirá un asistente interactivo en lugar de importar datos corruptos o celdas vacías.
3.  **Mapeo Fácil:** Por cada elemento discrepante, podrás seleccionar qué hacer:
    *   **Asociar:** Selecciona en un menú desplegable a qué centro o trabajador local actual corresponde. El asistente utiliza un algoritmo de coincidencia de texto para preseleccionar la opción correcta de forma inteligente (ej. asocia `"NN BONANOVA"` aunque en el archivo viniera como `"N.N. BONANOVA"`).
    *   **Crear Nuevo:** Da de alta el nuevo elemento de forma automática en tu catálogo maestro sobre la marcha.
    *   **Ignorar:** Importa el resto del archivo omitiendo los turnos asociados a esa discrepancia.
4.  **Procesamiento:** Al confirmar, el sistema adapta el JSON original a tus catálogos, migra las claves a la versión de cuadrante actual y guarda la actualización de forma segura.

---

## 9. Sistema de Bloqueo de Archivos en Red
Para evitar que dos coordinadores editen y pisen el trabajo del otro en el disco compartido de la oficina:
*   Al entrar a editar un apartado (ej. el cuadrante de Albert), el sistema crea un bloqueo temporal con tu nombre.
*   Si otro coordinador intenta entrar al mismo apartado a la vez, el programa abrirá su pantalla en **Modo Solo Lectura** y le mostrará un banner rojo que indica quién está editando el archivo actualmente. Los botones de edición y guardado quedarán desactivados para ese segundo usuario.
*   **Expiración Automática (3 horas)**: Con el fin de evitar que un archivo quede bloqueado de forma indefinida si alguien olvida cerrar la aplicación o si su ordenador se apaga inesperadamente, los bloqueos físicos se desactivan automáticamente tras **3 horas**. Al transcurrir este periodo, el archivo quedará libre para que otro coordinador pueda editarlo.
*   **Detección de Pérdida de Bloqueo en Vivo**: Si el bloqueo expira mientras estás trabajando o si el Jefe de Operaciones realiza un desbloqueo manual desde su panel:
    *   El sistema te avisará al instante con un mensaje emergente en pantalla.
    *   Toda la interfaz del módulo se desactivará (los campos y botones quedarán inhabilitados) y no te permitirá guardar datos para proteger los cambios que otra persona haya podido empezar a realizar.
    *   Si esto ocurre, copia manualmente los cambios realizados que no se hayan guardado, recarga el módulo para comprobar el estado y, si es necesario, vuelve a adquirir el bloqueo de edición.
*   **Liberación de Bloqueo**: Para permitir que los demás editen de forma normal, simplemente pulsa el botón de volver al menú principal o cierra la aplicación. El bloqueo temporal se eliminará físicamente al instante.
*   **Desbloqueo de Emergencia**: Si alguien se fue de la oficina y dejó un archivo bloqueado en su equipo sin que hayan pasado las 3 horas de expiración, un **Jefe de Operaciones** puede entrar al módulo y pulsar en el botón **"Forçar Desbloqueig"** del banner superior para liberar el acceso manualmente en el servidor.
