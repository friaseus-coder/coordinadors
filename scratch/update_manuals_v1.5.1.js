const fs = require('fs');
const path = require('path');

const manualInstaladorPath = path.join(__dirname, '..', 'manuales', 'manual_instalador_nuevo.md');
let contentInstalador = fs.readFileSync(manualInstaladorPath, 'utf8');

const v151Changelog = `### v1.5.1 — 2026-07-22
*   **SISTEMA DE COMPACTACIÓN Y PURGA AUTOMÁTICA DE DELTAS (\`/deltas/\`):**
    *   **Proceso Consolidador**: Si la carpeta \`NETWORK_DIR/deltas/\` acumula más de 100 archivos delta (\`MAX_DELTAS_THRESHOLD = 100\`), la aplicación adquiere el candado de red \`_compaction.lock\` y consolida todas las transacciones sobre las bases de datos máster SQLite en red (\`NETWORK_DIR/*.db\`).
    *   **Subcarpeta de Archivo**: Los deltas consolidados con antigüedad > 7 días se trasladan automáticamente a \`NETWORK_DIR/deltas/archive/\` para mantener la carpeta de deltas limpia y evitar degradación de lecturas SMB.
    *   **Tolerancia a Fallos**: Las terminales concurrentes detectan \`_compaction.lock\` y pausan automáticamente 2 segundos la lectura para evitar colisiones durante la consolidación.
*   **NORMALIZACIÓN DE TIEMPOS Y TOLERANCIA A CLOCK DRIFT:**
    *   **Nomenclatura ISO UTC**: Cambio de formato de archivo delta a \`[timestamp_ISO_UTC]_[hostname]_[uuid]_[dbKey].json\` para independencia de husos horarios y cambios de hora de verano/invierno.
    *   **Detección de Desvío de Reloj**: Al iniciar, escribe el archivo de comprobación \`.clock_check_[uuid]\` en SMB y compara la fecha local con \`mtimeMs\`. Si la diferencia supera los 60 segundos, emite una alerta no bloqueante notificando el desajuste de reloj de Windows al usuario.
*   **EXTENSIÓN DE OCC A MÓDULOS SECUNDARIOS:**
    *   **Columna Versión**: Incorporación del campo \`version INTEGER DEFAULT 1\` en las tablas \`incidencias_horarias\`, \`movimientos_economicos\`, \`despeses\`, \`deutes\`, \`inventario_existencias\` y \`comerciales\`.
    *   **Validación de UPDATE**: Consultas de actualización utilizan \`WHERE id = ? AND version = ?\`. Si las filas afectadas son 0, la API responde \`OCC_CONFLICT\` y el cliente Alpine.js notifica y recarga los datos sin sobrescribir información ajena.

`;

contentInstalador = contentInstalador.replace('### v1.5.0 — 2026-07-22', v151Changelog + '### v1.5.0 — 2026-07-22');
fs.writeFileSync(manualInstaladorPath, contentInstalador);
console.log("manual_instalador_nuevo.md actualizado con v1.5.1!");

// Actualizar manual_tecnico.md
const manualTecnicoPath = path.join(__dirname, '..', 'manuales', 'manual_tecnico.md');
let contentTecnico = fs.readFileSync(manualTecnicoPath, 'utf8');

const compactionSecTecnico = `### C. Copias de Seguridad Diarias, Rotación y Compactación Automática
1. **Respaldo Diario**: La función \`realizarBackupDiarioYRotacion()\` en \`main.js\` respalda las bases de datos locales en \`NETWORK_DIR/Backups/daily_YYYY-MM-DD_*.db\`.
2. **Rotación de Backups (7 días)**: Eliminación automática de copias de seguridad en \`NETWORK_DIR/Backups/\` con antigüedad superior a 7 días.
3. **Compactación y Purga de Deltas (Cota 100)**: La función \`compactarDeltasEnRedSiEsNecesario()\` detecta si existen más de 100 deltas en \`NETWORK_DIR/deltas/\`. Si se supera la cota, adquiere \`_compaction.lock\`, consolida los cambios en las bases máster de red, traslada los deltas mayores a 7 días a \`NETWORK_DIR/deltas/archive/\` y libera el candado. Si otra terminal detecta \`_compaction.lock\`, pausa 2 segundos automáticamente.
4. **Comprobación de Clock Drift**: Al iniciar, \`comprobarDesvioRelojSMB()\` verifica la diferencia de tiempo entre el equipo local y el servidor SMB (\`.clock_check_[uuid]\`). Si difieren más de 60 segundos, emite \`app:clock-drift-warning\` a la interfaz.`;

contentTecnico = contentTecnico.replace(
  `### C. Copias de Seguridad Diarias y Política de Rotación
1. **Respaldo Diario**: La función \`realizarBackupDiarioYRotacion()\` en \`main.js\` se ejecuta al iniciar el programa y cada 24 horas, respaldando las bases de datos locales en \`NETWORK_DIR/Backups/daily_YYYY-MM-DD_*.db\`.
2. **Rotación de Backups (7 días)**: La aplicación elimina automáticamente los archivos de copia de seguridad en \`NETWORK_DIR/Backups/\` cuya antigüedad supere los 7 días.
3. **Purga de Deltas (14 días)**: La aplicación purga de forma automática los archivos de deltas en \`NETWORK_DIR/deltas/\` con más de 14 días de antigüedad.`,
  compactionSecTecnico
);

fs.writeFileSync(manualTecnicoPath, contentTecnico);
console.log("manual_tecnico.md actualizado con compactación y clock drift!");
