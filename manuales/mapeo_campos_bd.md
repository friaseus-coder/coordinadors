# Manual de Mapeo de Campos a Bases de Datos

Este manual detalla de manera unitaria a qué archivo de base de datos SQLite, tabla física, columna y tipo de datos va asignado cada campo de la interfaz gráfica de la aplicación.

Físicamente, la aplicación implementa **sharding** dividiendo la información en 4 bases de datos principales:
1. 📂 **`catalogos_maestros.db`** (Catálogos y Datos Maestros compartidos).
2. 📂 **`operativa_rrhh.db`** (Cuadrantes, incidencias horarias, vacaciones y deudas de horas).
3. 📂 **`finanzas_inventario.db`** (Desplazamientos/gastos, rutas comerciales e inventarios).
4. 📂 **`comercial.db`** (Tarifas y estadísticas mensuales de comerciales).

---

## 1. Módulo: Gestión de Personal (Trabajadores y Sociedades)
Gestionado desde el modal de administración de trabajadores en `portal.html` y el modal de sociedades.

### A. Catálogo Unificado de Empleados y Preferencias

| Campo en Interfaz (UI) | Base de Datos SQLite | Tabla Física | Columna Física | Tipo de Dato | Observaciones / Valores |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Nombre del Trabajador** | `catalogos_maestros.db` | `empleados` | `nombre` | `TEXT` | Nombre completo del empleado. |
| **Email** | `catalogos_maestros.db` | `empleados` | `email` | `TEXT` | Correo electrónico de contacto. |
| **Rol** | `catalogos_maestros.db` | `empleados` | `rol` | `TEXT` | Roles válidos: `Trabajador`, `Coordinador`, `Comercial`, `Admin`. |
| **Activo / Estado** | `catalogos_maestros.db` | `empleados` | `activo` | `INTEGER` | `1` = Activo, `0` = Inactivo / Baja. |
| **Preferencia Centro/Turno/Zona** | `catalogos_maestros.db` | `empleados` | `json_preferencias` | `TEXT` | Objeto JSON: `{"centre": "...", "torn": "...", "zona": "..."}`. |

### B. Gestión de Sociedades (Empresas del Grupo)

| Campo en Interfaz (UI) | Base de Datos SQLite | Tabla Física | Columna Física | Tipo de Dato | Observaciones / Valores |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Nombre Fiscal** | `catalogos_maestros.db` | `sociedades` | `nombre_fiscal` | `TEXT` | Razón social de la sociedad (ej: `Aparcamientos BCN S.L.`). |
| **Código Corto** | `catalogos_maestros.db` | `sociedades` | `codigo_corto` | `TEXT` | Código abreviado único (ej: `ABCN`). |
| **Activo / Estado** | `catalogos_maestros.db` | `sociedades` | `activo` | `INTEGER` | `1` = Activa, `0` = Inactiva (Desactivada). |

### C. Histórico de Contratos y Vinculaciones Temporales (Solo Rol: 'Trabajador')
La asignación de contratos se restringe a empleados con rol operativo (`Trabajador`). Al cambiar un empleado a este rol, se le crea un homólogo en `agentes` para posibilitar su asignación y contratos. Si se le quita dicho rol, se borra de `agentes`.

| Campo en Interfaz (UI) | Base de Datos SQLite | Tabla Física | Columna Física | Tipo de Dato | Observaciones / Valores |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ID del Trabajador** | `catalogos_maestros.db` | `contratos_agentes`| `agente_id` | `INTEGER` | ID relacional que apunta a `agentes.id`. |
| **Sociedad Asignada** | `catalogos_maestros.db` | `contratos_agentes`| `sociedad_id` | `INTEGER` | ID relacional que apunta a `sociedades.id`. |
| **Fecha de Inicio** | `catalogos_maestros.db` | `contratos_agentes`| `fecha_inicio` | `TEXT` | Fecha de entrada en vigor (`YYYY-MM-DD`). |
| **Fecha de Fin** | `catalogos_maestros.db` | `contratos_agentes`| `fecha_fin` | `TEXT` | Cierre de vinculación (`YYYY-MM-DD`). `NULL` indica contrato activo. |

---

## 2. Módulo: Gestión de Aparcamientos
Gestionado desde el modal de administración de aparcamientos en `portal.html`.

| Campo en Interfaz (UI) | Base de Datos SQLite | Tabla Física | Columna Física | Tipo de Dato | Observaciones / Valores |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Número de Obra** | `catalogos_maestros.db` | `aparcamientos` | `numero_obra` | `TEXT` | Código de facturación contable único (ej: `OB-2301`). |
| **Nombre del Parking** | `catalogos_maestros.db` | `aparcamientos` | `nombre` | `TEXT` | Nombre operativo (ej: `NN CONCEPT`). |
| **Zona** | `catalogos_maestros.db` | `aparcamientos` | `zona` | `TEXT` | Zona geográfica asignada. |
| **Es Remotizado (Checkbox)** | `catalogos_maestros.db` | `aparcamientos` | `es_remotizado` | `INTEGER` | `1` = Sí, `0` = No (Requiere presencia física). |
| **Tipo de Gestión** | `catalogos_maestros.db` | `aparcamientos` | `tipo_gestion` | `TEXT` | `propio` (gestión directa) o `socios`. |
| **Permitir Vacío en Laborables** | `catalogos_maestros.db` | `aparcamientos` | `permitir_vacio_laborables` | `INTEGER` | `1` = Sí (puede no tener agente), `0` = No. |
| **Sociedad del Grupo** | `catalogos_maestros.db` | `aparcamientos` | `sociedad_id` | `INTEGER` | ID relacional de la tabla `sociedades`. |
| **Coordinador Responsable** | `catalogos_maestros.db` | `aparcamientos` | `coordinador_responsable` | `TEXT` | `Albert`, `Laura` o `Ambos`. |
| **Activo / Estado** | `catalogos_maestros.db` | `aparcamientos` | `activo` | `INTEGER` | `1` = Activo, `0` = Inactivo / Baja. |

---

## 3. Módulo: Cuadrante Mensual de Turnos
Gestionado en la pantalla de planificación mensual de cuadrantes (`quadrant.html`).

| Campo en Interfaz (UI) | Base de Datos SQLite | Tabla Física | Columna Física | Tipo de Dato | Observaciones / Valores |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Día / Fecha** | `operativa_rrhh.db` | `quadrant` | `fecha` | `TEXT` | Formato fecha `YYYY-MM-DD`. |
| **Aparcamiento (Fila)** | `operativa_rrhh.db` | `quadrant` | `aparcamiento_id` | `INTEGER` | ID del parking (relacionado con `aparcamientos.id`). |
| **Trabajador (Celda)** | `operativa_rrhh.db` | `quadrant` | `agente_id` | `INTEGER` | ID del trabajador (relacionado con `empleados.id`). |
| **Turno** | `operativa_rrhh.db` | `quadrant` | `turno` | `TEXT` | `MATÍ`, `TARDA`, `NIT`, `CAP DE SET.`. |
| **Hora Inicio** | `operativa_rrhh.db` | `quadrant` | `hora_inicio` | `TEXT` | Hora de entrada (ej: `06:00`). |
| **Hora Fin** | `operativa_rrhh.db` | `quadrant` | `hora_fin` | `TEXT` | Hora de salida (ej: `14:00`). |
| **Horas Asignadas** | `operativa_rrhh.db` | `quadrant` | `horas_trabajadas` | `INTEGER` | Total horas del turno (habitualmente `8`). |
| **Es Sustitución (Checkbox)** | `operativa_rrhh.db` | `quadrant` | `es_substitucio` | `INTEGER` | `1` = Sí (es cobertura extra), `0` = Turno ordinario. |
| **Observación / Nota** | `operativa_rrhh.db` | `quadrant` | `nota` | `TEXT` | Texto libre aclaratorio. |
| **Bloqueo del Mes** | `operativa_rrhh.db` | `kv_store` | `value` | `TEXT` | Guardado con la clave (`key`) `nyn_locked_[año]_[mes]`. |
| **Centro Pendiente** | `operativa_rrhh.db` | `kv_store` | `value` | `TEXT` | Guardado con la clave (`key`) `nyn_pendent_[año]_[mes]_[parking]`. |

---

## 4. Módulo: Vacaciones del Personal
Gestionado en el panel de RRHH de vacaciones (`vacances.html`).

| Campo en Interfaz (UI) | Base de Datos SQLite | Tabla Física | Columna Física | Tipo de Dato | Observaciones / Valores |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Trabajador** | `operativa_rrhh.db` | `incidencias_horarias` | `id_trabajador` | `TEXT` | Nombre del empleado solicitante. |
| **Fecha de Inicio** | `operativa_rrhh.db` | `incidencias_horarias` | `fecha_inicio` | `DATE` | Primer día de vacaciones (`YYYY-MM-DD`). |
| **Fecha de Fin** | `operativa_rrhh.db` | `incidencias_horarias` | `fecha_fin` | `DATE` | Último día de vacaciones (`YYYY-MM-DD`). |
| **Tipo de Incidencia** | `operativa_rrhh.db` | `incidencias_horarias` | `tipo_incidencia` | `TEXT` | Valor fijo: `'Vacaciones'`. |
| **Horas de Impacto** | `operativa_rrhh.db` | `incidencias_horarias` | `impacto_horas` | `REAL` | Valor fijo: `0` (no altera el cómputo de horas). |
| **Coordinador** | `operativa_rrhh.db` | `incidencias_horarias` | `coordinador` | `TEXT` | Nombre del usuario que valida la solicitud. |
| **Estado** | `operativa_rrhh.db` | `incidencias_horarias` | `estado` | `TEXT` | `Aprobado`, `Pendiente` o `Rechazado`. |
| **Comentarios** | `operativa_rrhh.db` | `incidencias_horarias` | `comentarios` | `TEXT` | Notas aclaratorias del periodo. |

---

## 5. Módulo: Ajustes y Deuda de Horas
Gestionado en el panel de saldo de horas y bolsa (`deutes.html`).

| Campo en Interfaz (UI) | Base de Datos SQLite | Tabla Física | Columna Física | Tipo de Dato | Observaciones / Valores |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Trabajador** | `operativa_rrhh.db` | `incidencias_horarias` | `id_trabajador` | `TEXT` | Nombre del empleado. |
| **Fecha del Ajuste** | `operativa_rrhh.db` | `incidencias_horarias` | `fecha_inicio` | `DATE` | Fecha del día del desajuste (`YYYY-MM-DD`). |
| **Tipo de Ajuste** | `operativa_rrhh.db` | `incidencias_horarias` | `tipo_incidencia` | `TEXT` | `'Deuda Horas (-)'` o `'Bolsa Horas (+)'`. |
| **Horas de Impacto** | `operativa_rrhh.db` | `incidencias_horarias` | `impacto_horas` | `REAL` | Cantidad de horas acumuladas/deberes. |
| **Coordinador** | `operativa_rrhh.db` | `incidencias_horarias` | `coordinador` | `TEXT` | Nombre del coordinador que firma el ajuste. |
| **Estado** | `operativa_rrhh.db` | `incidencias_horarias` | `estado` | `TEXT` | Valor fijo: `'Aprobado'`. |
| **Comentarios** | `operativa_rrhh.db` | `incidencias_horarias` | `comentarios` | `TEXT` | Explicación del ajuste (ej: "Doblaje por enfermedad"). |

---

## 6. Módulo: Gastos de Kilometraje
Gestionado en la hoja de gastos individuales de desplazamientos (`despeses.html`).

| Campo en Interfaz (UI) | Base de Datos SQLite | Tabla Física | Columna Física | Tipo de Dato | Observaciones / Valores |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Fecha del Gasto** | `finanzas_inventario.db` | `movimientos_economicos` | `fecha` | `DATE` | Fecha de realización del gasto (`YYYY-MM-DD`). |
| **Concepto / Destino** | `finanzas_inventario.db` | `movimientos_economicos` | `concepto` | `TEXT` | Destino o descripción (ej: `NN CONCEPT a NN BRUC`). |
| **Importe Total (€)** | `finanzas_inventario.db` | `movimientos_economicos` | `importe` | `REAL` | Importe total calculado (`0` para desgloses calculados por km). |
| **Tipo de Movimiento** | `finanzas_inventario.db` | `movimientos_economicos` | `tipo_movimiento`| `TEXT` | Valor fijo: `'Kilometraje'`. |
| **Usuario / Creador** | `finanzas_inventario.db` | `movimientos_economicos` | `id_usuario` | `TEXT` | Nombre de usuario de la sesión (ej: `Albert` o `Laura`). |
| **Desglose de Detalles** *(Km, Tarifa, Extras)* | `finanzas_inventario.db` | `movimientos_economicos` | `json_detalles` | `TEXT` | Contenido serializado: `{"km": 15, "tarifa": 0.26, "extras": 2.50}`. |

---

## 7. Módulo: Planificación de Rutas
Gestionado en el mapa y calendario interactivo de rutas de comerciales (`ruta.html`).

| Campo en Interfaz (UI) | Base de Datos SQLite | Tabla Física | Columna Física | Tipo de Dato | Observaciones / Valores |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Fecha de la Ruta** | `finanzas_inventario.db` | `movimientos_economicos` | `fecha` | `DATE` | Fecha de realización (`YYYY-MM-DD`). |
| **Nombre de la Ruta** | `finanzas_inventario.db` | `movimientos_economicos` | `concepto` | `TEXT` | Nombre identificador (ej: `Ruta Albert`). |
| **Tipo de Movimiento** | `finanzas_inventario.db` | `movimientos_economicos` | `tipo_movimiento`| `TEXT` | Valor fijo: `'Ruta Comercial'`. |
| **Asignatario (Usuario)** | `finanzas_inventario.db` | `movimientos_economicos` | `id_usuario` | `TEXT` | Coordinador que realiza la ruta (`Albert` o `Laura`). |
| **Detalle de la Ruta** *(Paradas, Festivo)* | `finanzas_inventario.db` | `movimientos_economicos` | `json_detalles` | `TEXT` | Contenido serializado: `{"paradas": ["NN BONANOVA", "NN ARAGÓ"], "festivo": 0}`. |

---

## 8. Módulo: Inventarios, Stock y Pedidos
Gestionado en la herramienta de inventariado de oficinas y parkings (`inventari.html`).

*Debido a la flexibilidad del módulo, todos sus datos se guardan en un único documento JSON serializado en la columna `value` con la clave (`key`) `dades [Usuario_Sesión]/inventari`.*

| Bloque JSON / Interfaz | Base de Datos SQLite | Tabla Física | Columna Física (JSON) | Tipo de Dato | Estructura interna |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Catálogo de Material** | `finanzas_inventario.db` | `kv_store` | `value` | `TEXT` | Lista de referencias: `[{"ref": "M-01", "nom": "Papel A4", "cat": "MATERIAL OFIMÀTIC"}]`. |
| **Stock en Almacén** | `finanzas_inventario.db` | `kv_store` | `value` | `TEXT` | Ubicación y unidades: `[{"id": 1, "ref": "M-01", "magatzem": "CÒRSEGA", "stock": 10}]`. |
| **Pedidos Realizados** | `finanzas_inventario.db` | `kv_store` | `value` | `TEXT` | Pedidos de centros: `[{"id": 1, "ref": "M-01", "centre": "NN ARAGÓ", "qty": 1, "data": "2026-07-03", "estat": "Enviat"}]`. |
| **Almacenes** | `finanzas_inventario.db` | `kv_store` | `value` | `TEXT` | Array de texto: `["OFICINES", "PROVENÇA", "CÒRSEGA"]`. |

---

## 9. Módulo: Gestión Comercial (Tarifas y Estadísticas)
Gestionado en la nueva interfaz de comerciales (`comercials.html`) utilizando Alpine.js.

*Se ha migrado del modelo legacy `kv_store` a tablas estructuradas dentro de `comercial.db`.*

### A. Tarifas Comerciales Mensuales
| Campo en Interfaz (UI) | Base de Datos SQLite | Tabla Física | Columna Física | Tipo de Dato | Observaciones |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Coordinador** | `comercial.db` | `tarifas_comerciales` | `coordinador` | `TEXT` | Usuario responsable de la tarifa. |
| **Mes / Año** | `comercial.db` | `tarifas_comerciales` | `mes`, `anio` | `INTEGER` | Periodo de la estadística. |
| **Aparcamiento** | `comercial.db` | `tarifas_comerciales` | `aparcamiento` | `TEXT` | Nombre del centro comercializado. |
| **Dirección** | `comercial.db` | `tarifas_comerciales` | `direccion` | `TEXT` | Dirección física. |
| **Fijos (Abonos)** | `comercial.db` | `tarifas_comerciales` | `fijos` | `INTEGER` | Plazas fijas asignadas. |
| **Variables** | `comercial.db` | `tarifas_comerciales` | `variables` | `INTEGER` | Plazas variables. |
| **Vacantes** | `comercial.db` | `tarifas_comerciales` | `vacantes` | `INTEGER` | Plazas vacías. |
| **Tarifa Mensual** | `comercial.db` | `tarifas_comerciales` | `tarifa` | `REAL` | Importe por abono. |
| **Observaciones** | `comercial.db` | `tarifas_comerciales` | `observaciones` | `TEXT` | Notas adicionales. |

### B. Catálogo Base de Comerciales
| Campo en Interfaz (UI) | Base de Datos SQLite | Tabla Física | Columna Física | Tipo de Dato | Observaciones |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Nombre** | `comercial.db` | `comerciales` | `nombre` | `TEXT` | Nombre del comercial o centro. |
| **Dirección** | `comercial.db` | `comerciales` | `direccion` | `TEXT` | Dirección física. |
| **Plantas** | `comercial.db` | `comerciales` | `plantas` | `TEXT` | Información sobre las plantas. |
| **Capacidad** | `comercial.db` | `comerciales` | `capacidad` | `TEXT` | Capacidad total de vehículos. |
| **Plazas Libres** | `comercial.db` | `comerciales` | `plazas_libres` | `TEXT` | Plazas actualmente libres. |
| **Tarifa** | `comercial.db` | `comerciales` | `tarifa` | `TEXT` | Descripción de la tarifa base. |
| **Notas** | `comercial.db` | `comerciales` | `notas` | `TEXT` | Detalles y notas. |

---

## 10. Módulo: Rendimiento del Personal (Ranking)
Gestionado en la tabla interactiva de aptitudes y valoraciones (`ranking.html` - sección personal).

| Campo en Interfaz (UI) | Base de Datos SQLite | Tabla Física | Columna Física | Tipo de Dato | Rango / Valores |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Trabajador** | `operativa_rrhh.db` | `ranking` | `id_trabajador` | `TEXT` | Nombre del empleado evaluado. |
| **Conocimientos** | `operativa_rrhh.db` | `ranking` | `coneixements` | `REAL` | Calificación del 0.0 al 10.0. |
| **Atención** | `operativa_rrhh.db` | `ranking` | `atencio` | `REAL` | Calificación del 0.0 al 10.0. |
| **Disponibilidad** | `operativa_rrhh.db` | `ranking` | `disponibilitat` | `REAL` | Calificación del 0.0 al 10.0. |
| **Actitud** | `operativa_rrhh.db` | `ranking` | `actitud` | `REAL` | Calificación del 0.0 al 10.0. |
| **Valoración Media** | `operativa_rrhh.db` | `ranking` | `valoracio` | `REAL` | Media matemática de las notas. |
| **Observaciones** | `operativa_rrhh.db` | `ranking` | `observacions` | `TEXT` | Comentario sobre el desempeño. |

---

## 11. Módulo: Reportes Operativos y Estadísticas (Rotación y Carga de Personal)
Gestionado en la pestaña de reportes de administración en `reportes.html`.

| Campo en Interfaz (UI) / Sección | Base de Datos SQLite | Tabla Física | Columna Física | Tipo de Dato | Observaciones / Consultas Cruzadas |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Aparcamiento (Rotación)** | `operativa_rrhh.db` | `quadrant` / `catalogos.aparcamientos` | `aparcamientos.nombre` | `TEXT` | Resuelve el nombre del parking uniendo por ID. |
| **Trabajador (Rotación)** | `operativa_rrhh.db` | `quadrant` / `catalogos.empleados` | `empleados.nombre` | `TEXT` | Resuelve el nombre del trabajador uniendo por ID. |
| **Turnos Realizados** | `operativa_rrhh.db` | `quadrant` | `COUNT(*)` | `INTEGER` | Conteo agregado del total de registros de turnos. |
| **Horas Estimadas** | `operativa_rrhh.db` | `quadrant` | `horas_trabajadas` | `INTEGER` | Turnos estándar multiplicados por 8 horas. |
| **Valoración del Empleado** | `operativa_rrhh.db` | `ranking` | `valoracio` | `REAL` | Nota media recuperada para calificar al personal. |
| **Horas Mensuales (Histórico 4 Meses)** | `operativa_rrhh.db` | `quadrant` | `horas_trabajadas` | `INTEGER` | Suma agrupada por mes, año, trabajador y parking en el cuatrimestre. |

