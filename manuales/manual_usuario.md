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
El Jefe de Operaciones tiene control total sobre el catálogo de aparcamientos de la empresa y su vinculación formal con las distintas empresas del grupo (Sociedades) y los coordinadores responsables:
1.  Haz clic en el botón **🚗 Aparcaments** en la barra superior del Portal.
2.  Aparecerá el panel de gestión donde se muestra el catálogo completo en una tabla interactiva:
    *   **Crear Aparcamiento:** En la parte superior, rellena el formulario con el nombre del nuevo aparcamiento, su dirección física, el **Número de Obra** (código contable de control), la **Sociedad** (empresa del grupo Núñez i Navarro a la que pertenece) y el **Coordinador** responsable del mismo. Haz clic en **Afegir Aparcament**.
    *   **Modificar y Reasignar:** Al lado de cada aparcamiento de la lista, puedes actualizar su número de obra, dirección y reasignar tanto su sociedad como su coordinador asignado de forma directa. Los cambios se guardan y aplican instantáneamente en la base de datos relacional.
    *   **Eliminar Aparcamiento:** Haz clic en el botón rojo **✕** al lado de la fila del aparcamiento. Esto lo desactivará mediante borrado lógico, previniendo su asignación futura sin afectar a los registros del pasado.
    *   **Exportar a Excel (CSV):** En la esquina inferior izquierda del modal, haz clic en el botón verde **Exportar Excel**. Se descargará un archivo CSV compatible con Microsoft Excel conteniendo todos los datos relacionales de la base de datos (ID, Número de Obra, Nombre, Coordinador, etc.).
    *   **Importar desde Excel (CSV):** Haz clic en el botón amarillo **Importar Excel** en la parte inferior izquierda del modal, selecciona tu archivo CSV modificado o con nuevos registros y el sistema lo procesará de inmediato.
        -   Si una línea tiene un **ID** numérico que ya existe, actualizará sus datos en SQLite.
        -   Si una línea no tiene **ID** (registro nuevo), la insertará como un nuevo aparcamiento en SQLite.
        -   Al finalizar, sincronizará de forma automática el archivo de red `aparcamientos.json` para reflejar todos los cambios de forma consistente.
3.  **Historial de Cambios (Auditoría):** El sistema registra automáticamente cada modificación (cambio de dirección, responsable, número de obra, etc.) en un histórico. Se puede consultar el botón de auditoría del aparcamiento para ver qué datos tenía antes, qué datos tiene ahora, y cuándo se produjo la modificación.
4.  **Impacto Global:** Cualquier cambio en la asignación de coordinadores y sociedades se reflejará dinámicamente en:
    *   **Comerciales:** Los aparcamientos se agruparán automáticamente bajo el coordinador asignado y se segmentarán por la sociedad correspondiente.
    *   **Gastos y Rutas:** Los desplegables y calendarios cargarán exclusivamente la lista actualizada de aparcamientos activos.
    *   **Seguridad:** En la pestaña de **Rutas**, se ha inhabilitado el botón de edición local de centros para los coordinadores, evitando la creación de duplicados e inconsistencias.

---

## 5b. Gestión de Sociedades (Solo Jefe de Operaciones)
El administrador ahora cuenta con un módulo específico para gestionar las sociedades (razones sociales) que componen el grupo de aparcamientos:
1.  En la barra superior, haz clic en el botón **🏢 Societats**.
2.  Se abrirá el panel de gestión de empresas, donde podrás ver el catálogo completo de las sociedades activas del grupo (ej. *Aparcamientos Núñez i Navarro SL*, *Pàrkings Urgell SA*, etc.).
3.  **Registrar Nueva Sociedad:** En el formulario superior, introduce la Razón Social, el CIF/NIF, la Dirección Fiscal, el Correo Electrónico y el Teléfono de contacto. Pulsa el botón **Afegir Societat** para registrarla.
4.  **Actualizar Datos:** Puedes editar los campos de las sociedades directamente desde la lista interactiva y guardar los cambios.
5.  **Desactivar Sociedad:** Si una sociedad deja de operar, puedes desactivarla mediante el botón de desactivación. Esto impedirá asociarla a nuevos aparcamientos o contratos, pero mantendrá los registros históricos y cuadrantes pasados consistentes por motivos contables.

---

## 5c. Gestión de Contratos de Agentes (Solo Jefe de Operaciones)
Para evitar que los coordinadores/agentes queden huérfanos sin vinculación formal y garantizar que las nóminas y cuadrantes coincidan con las empresas responsables del grupo, se ha integrado un gestor de contratos:
1.  En la barra superior, haz clic en el botón **📄 Contractes**.
2.  **Vincular Agente a una Sociedad:** En el panel de contratos, selecciona un coordinador/agente, asócialo con la sociedad del grupo para la que trabajará, indica la fecha de inicio del contrato y el tipo de contrato (indefinido o temporal, indicando la fecha de finalización si aplica). Haz clic en **Crear Contracte**.
3.  **Control de Vigencia:** El sistema mantiene un registro histórico de todos los contratos de cada trabajador.
4.  **Cierre de Contrato:** Si un agente finaliza su relación con una sociedad o va a cambiar a otra empresa del grupo, el administrador puede cerrar el contrato activo especificando la fecha de fin real. Esto permite registrar un nuevo contrato con la nueva sociedad de forma ordenada y sin solapamientos.

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

## 7b. Control y Validación por Reglas de Negocio
Para asegurar el cumplimiento de la normativa legal, el convenio colectivo y evitar conflictos contractuales al planificar los turnos, el cuadrante integra validaciones en tiempo real que se ejecutan automáticamente al guardar o asignar turnos:
*   **Límite de Horas Semanales:** El sistema avisa si algún coordinador supera las **48 horas de trabajo máximas semanales** (o el límite parametrizado en la regla `horas_maximas_semanales`).
*   **Descanso Mínimo entre Jornadas:** Se verifica que exista un descanso mínimo de **12 horas consecutivas** entre la salida de un turno y la entrada del siguiente (regla `descanso_minimo_horas`).
*   **Restricción de Cruce de Sociedades:** Para evitar que un empleado trabaje para diferentes empresas del grupo al mismo tiempo (lo cual provocaría incidencias contractuales y de facturación), la regla `bloquear_cruce_sociedades` impide asignar turnos de diferentes sociedades a un mismo agente dentro de la misma semana de planificación.
*   **Gestión de Días de Vacaciones:** Controla que el total de días de vacaciones planificados por coordinador no supere el saldo máximo configurado (regla `dias_vacaciones_anuales`).

> [!NOTE]
> Las reglas de negocio son dinámicas y son definidas y administradas exclusivamente por el Jefe de Operaciones para adaptarlas a convenios futuros. Si una planificación infringe una regla estricta (como el cruce de sociedades o la superación de horas), el sistema alertará inmediatamente e impedirá confirmar el guardado del cuadrante para proteger la integridad de los datos.

---

## 7c. Asistente de Asignación Inteligente (Panel Lateral)
Para facilitarte la planificación de turnos y evitar errores de convenios o asignaciones incorrectas, el cuadrante cuenta con un **Asistente de Asignación Inteligente** integrado en un panel lateral derecho.

*   **¿Cómo abrir el Asistente?**
    Haz un clic simple sobre cualquier celda vacía del cuadrante, o doble clic sobre cualquier celda (ya tenga o no un trabajador asignado). El panel lateral se deslizará automáticamente mostrando la información pertinente.
*   **Secciones del Asistente**:
    1.  **Información del Turno**: En la parte superior verás el nombre del aparcamiento, la fecha exacta y el turno (Matí, Tarda o Nit) seleccionado.
    2.  **Acción de Desasignar**: Un botón rápido para desasignar al agente actual y dejar la celda en blanco de forma directa.
    3.  **Trabajadores Recomendados**: Una lista ordenada de candidatos que cumplen con todos los requisitos legales y de descanso.
        -   **Badge TOP**: Indica que el trabajador tiene una alta puntuación de recomendación (por proximidad, experiencia o saldo de horas).
        -   **Badge EXTERNO**: Indica que es personal subcontratado de una empresa de seguridad externa.
        -   **Advertencias de Negocio**: Aunque el agente esté recomendado, el asistente te avisará si acumula horas cercanas al límite para que puedas tomar la mejor decisión.
    4.  **Trabajadores Descartados**: Aquellos empleados que legalmente **no pueden** cubrir este turno. El asistente te mostrará el motivo exacto de la exclusión (ej. *"Se encuentra de vacaciones"*, *"Infracción de descanso mínimo de 12h"* o *"Conflicto por cruce de sociedades"*).
*   **Asignar al Instante**:
    Pasa el ratón sobre cualquier candidato recomendado y haz clic en el botón verde **Asignar**. El asistente colocará al trabajador en la celda y guardará el cambio de forma automática en la base de datos única SQLite (`quickSave`).

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

---

## 10. Gestión de Vacaciones en Red (SQLite)
El módulo de **Vacances** ha sido modernizado y ahora interactúa directamente con la base de datos única relacional de SQLite, garantizando una planificación exacta y libre de inconsistencias:
1.  **Edición Interactiva y Guardado Automático:** Cada vez que modificas la fecha de inicio o fin de un período de vacaciones, o actualizas las observaciones de un trabajador en la tabla, el sistema guarda los cambios de forma asíncrona en la base de datos en segundo plano sin necesidad de pulsar un botón de guardado.
2.  **Eliminación de Vacaciones:** Si dejas una fecha vacía o eliminas una fila de vacaciones en la pantalla, el registro correspondiente se borra físicamente de SQLite al instante.
3.  **Botón de Migración Masiva:** Si tu base de datos relacional está vacía y deseas cargar las vacaciones históricas que guardabas en archivos JSON tradicionales, haz clic en el botón **"🔄 Migrar a SQLite"** situado en la cabecera de la sección de vacaciones. El asistente importará todo el historial de vacaciones JSON antiguo y lo sembrará en la tabla SQLite de forma automática en una transacción de red única.

---

## 11. Control de Finanzas e Inventario (Deudas, Gastos e Inventario)
Los módulos auxiliares de **Deudas (Exceso de jornada)**, **Gastos** e **Inventario de Uniformes** se han integrado completamente en la base de datos SQLite única en red:
1.  **Sincronización en Tiempo Real:** Todos los coordinadores comparten la misma base de datos, por lo que cualquier registro financiero o alta de inventario introducida es visible para el resto de la oficina de manera inmediata al abrir o recargar la pestaña.
2.  **Persistencia Transaccional Segura:** Al realizar cambios en estos listados, la aplicación guarda la información de forma transparente en SQLite. El sistema utiliza una estrategia de reescritura transaccional que asegura que el guardado sea robusto, eliminando el riesgo de corrupciones por apagados imprevistos o micro-cortes en la conexión de red de la oficina.
3.  **Operatividad Intacta:** La interfaz de usuario mantiene su misma apariencia intuitiva y flujo de trabajo anterior, pero con la robustez y velocidad de almacenamiento de una base de datos profesional.

---

## 12. Sistema de Doble Salvaguarda Local (Backups Automáticos)
Para proteger tus datos operativos de cualquier corte de red, problemas de sincronización de la nube o desconexión temporal, la aplicación gestiona de forma totalmente automática y transparente un sistema de doble copia de seguridad en tu equipo local:
1.  **Copia Diaria de Seguridad:** Cada vez que cierras la aplicación al terminar tu jornada, el sistema realiza de forma silenciosa una copia completa de la base de datos de trabajo y la guarda en la carpeta local **Documentos/Coordinadores_Backups/dades_[TuNombre]/Diario/**. Esta copia se actualiza automáticamente con tus últimos cambios de cada día.
2.  **Cierre Mensual Congelado (Foto Fija Histórica):** Al arrancar el programa, la aplicación detecta de forma inteligente si se ha iniciado un nuevo mes. De ser así, congela el estado del mes anterior de manera inmutable en la carpeta **Documentos/Coordinadores_Backups/dades_[TuNombre]/Historico/** con el año y mes correspondientes. Estas fotos históricas nunca se sobrescriben ni se eliminan, sirviendo de archivo contable local inalterable.
3.  **Ubicación de los Resguardos:** En caso de que necesites recuperar información histórica o ante una eventual caída de los sistemas de red, podrás encontrar todas estas copias de seguridad organizadas por carpetas directamente en la sección "Documentos" de tu ordenador Windows.
