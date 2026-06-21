/**
 * persistence.js - Gestión unificada de Persistencia y Bloqueo de Archivos (File Locking)
 * con sincronización transparente de localStorage en Electron.js.
 */

const persistence = (() => {
  let api = window.api;
  if (!api) {
    try {
      if (window.parent && window.parent.api) {
        api = window.parent.api;
      }
    } catch (e) {
      console.warn('[PERSISTENCE] No se puede acceder a window.parent.api:', e);
    }
  }

  let databaseAPI = window.databaseAPI;
  if (!databaseAPI) {
    try {
      if (window.parent && window.parent.databaseAPI) {
        databaseAPI = window.parent.databaseAPI;
      }
    } catch (e) {
      console.warn('[PERSISTENCE] No se puede acceder a window.parent.databaseAPI:', e);
    }
  }
  if (databaseAPI && !window.databaseAPI) {
    window.databaseAPI = databaseAPI;
  }
  
  // Obtener rol y nombre desde los parámetros de la URL, sesión del iframe o sesión del padre de forma segura
  let userRole = '';
  let userName = '';
  try {
    const params = new URLSearchParams(window.location.search);
    userRole = params.get('role') || sessionStorage.getItem('userRole');
    userName = params.get('username') || sessionStorage.getItem('userName');
    
    // Persistir en el sessionStorage del propio iframe
    if (userRole) sessionStorage.setItem('userRole', userRole);
    if (userName) sessionStorage.setItem('userName', userName);
  } catch (e) {
    console.warn('[PERSISTENCE] Error al analizar los parámetros de la URL:', e);
  }
  
  if (!userRole || !userName) {
    try {
      if (window.parent && window.parent.sessionStorage) {
        if (!userRole) userRole = window.parent.sessionStorage.getItem('userRole');
        if (!userName) userName = window.parent.sessionStorage.getItem('userName');
      }
    } catch (e) {
      console.warn('[PERSISTENCE] No se puede acceder a window.parent.sessionStorage:', e);
    }
  }
  
  let currentFilePath = '';
  let activeModuleName = '';
  let isReadOnlyMode = false;
  let isSyncing = false; // Evita bucles infinitos y escrituras durante la carga inicial
  let saveTimeout = null;
  let heartbeatInterval = null;

  // Filtros de claves específicas para cada módulo en localStorage
  const moduleFilters = {
    quadrant: (key) => key.startsWith('nyn_v12_') || key.startsWith('nyn_v10_') || key.startsWith('nyn_v9_') || key.startsWith('nyn_personal') || key.startsWith('nyn_horaris') || key.startsWith('nyn_parkings') || key.startsWith('nyn_pendent_') || key.startsWith('nyn_last_') || key.startsWith('nyn_logs'),
    inventari: (key) => key.startsWith('nyn_log_v13'),
    vacances: (key) => key.startsWith('nyn_vacances') || key.startsWith('Vacances_'),
    comercials: (key) => key.startsWith('nyn_comercials') || key.startsWith('comercials_') || key.startsWith('nn_') || key.startsWith('nn_last_export_'),
    despeses: (key) => key.startsWith('nyn_gastos') || key.startsWith('despeses'),
    deutes: (key) => key.startsWith('nyn_deutes') || key.startsWith('deutes'),
    ruta: (key) => key.startsWith('nyn_ruta') || key.startsWith('ruta_'),
    ranking: (key) => key.startsWith('nyn_ranking') || key.startsWith('ranking')
  };

  // Determinar la ruta exacta del archivo JSON del módulo según el usuario activo
  function getModuleFilePath(moduleName, user) {
    const userFolder = `dades ${user}`;
    const uLower = user.toLowerCase();
    const uUpper = user.toUpperCase();

    switch (moduleName) {
      case 'quadrant':
        if (user === 'Albert') {
          return `${userFolder}/quadrant_ALBERT.json`;
        }
        return `${userFolder}/quadrant.json`;
        
      case 'vacances':
        return `${userFolder}/Vacances_2026_07-04-2026.json`;
        
      case 'comercials': {
        const mesSelect = document.getElementById('mesActual');
        const anySelect = document.getElementById('anyActual');
        const mes = mesSelect ? mesSelect.value : 'marc';
        const any = anySelect ? anySelect.value : '2026';
        return `${userFolder}/comercials_${uLower}_${mes}_${any}.json`;
      }
        
      case 'despeses':
        if (user === 'Albert') {
          return `${userFolder}/despeses_2026-04-10.json`;
        }
        return `${userFolder}/despeses.json`;
        
      case 'deutes':
        if (user === 'Albert') {
          return `${userFolder}/deutes_7-4-2026_ALBERT.json`;
        } else if (user === 'Laura') {
          return `${userFolder}/deutes_7-4-2026_LAURA (1).json`;
        }
        return `${userFolder}/deutes.json`;
        
      case 'inventari':
        return `${userFolder}/inventari.json`;
        
      case 'ruta':
        if (user === 'Albert') {
          return `${userFolder}/ruta_Albert_ALBERT.json`;
        } else if (user === 'Laura') {
          return `${userFolder}/ruta_Laura_LAURA.json`;
        }
        return `${userFolder}/ruta_${user}_${uUpper}.json`;
        
      case 'ranking':
        return `${userFolder}/ranking.json`;
        
      default:
        return `${userFolder}/${moduleName}.json`;
    }
  }

  // Inyectar banner informativo de estado arriba de la interfaz
  function injectStatusBanner(type, message, lockedBy = '') {
    const existing = document.getElementById('nyn-persistence-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'nyn-persistence-banner';
    banner.style.position = 'sticky';
    banner.style.top = '0';
    banner.style.zIndex = '99999';
    banner.style.display = 'flex';
    banner.style.alignItems = 'center';
    banner.style.justifyContent = 'space-between';
    banner.style.padding = '6px 16px';
    banner.style.fontSize = '11px';
    banner.style.fontWeight = 'bold';
    banner.style.fontFamily = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
    banner.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';

    if (type === 'readonly') {
      banner.style.backgroundColor = '#f59e0b';
      banner.style.color = '#ffffff';
    } else if (type === 'locked') {
      banner.style.backgroundColor = '#ef4444';
      banner.style.color = '#ffffff';
    } else {
      banner.style.backgroundColor = '#10b981';
      banner.style.color = '#ffffff';
    }

    const textSpan = document.createElement('span');
    textSpan.innerText = message;
    banner.appendChild(textSpan);

    if (type === 'locked' && userRole === 'jefe operaciones') {
      const unlockBtn = document.createElement('button');
      unlockBtn.innerText = 'Forçar Desbloqueig';
      unlockBtn.style.marginLeft = '12px';
      unlockBtn.style.padding = '2px 8px';
      unlockBtn.style.backgroundColor = '#ffffff';
      unlockBtn.style.color = '#ef4444';
      unlockBtn.style.border = 'none';
      unlockBtn.style.borderRadius = '3px';
      unlockBtn.style.cursor = 'pointer';
      unlockBtn.style.fontSize = '10px';
      unlockBtn.style.fontWeight = 'bold';
      
      unlockBtn.onclick = async () => {
        if (confirm(`Estàs segur que vols forçar el desbloqueig de l'arxiu? Això pot causar pèrdua de dades si l'altre usuari està guardant.`)) {
          const isRelational = (activeModuleName === 'quadrant' || activeModuleName === 'vacances');
          if (isRelational && window.databaseAPI) {
            await window.databaseAPI.controlConcurrencia.forzarLiberacion('jefe_operaciones', userName);
          } else if (activeModuleName === 'comercials') {
            const mesSelect = document.getElementById('mesActual');
            const anySelect = document.getElementById('anyActual');
            const mes = mesSelect ? mesSelect.value : 'marc';
            const any = anySelect ? anySelect.value : '2026';
            let coordinadores = [];
            try {
              coordinadores = await api.getCoordinadores();
            } catch (e) {
              coordinadores = [
                { id: 'albert', nombre: 'Albert' },
                { id: 'laura', nombre: 'Laura' }
              ];
            }
            for (const coord of coordinadores) {
              const filePath = `dades ${coord.nombre}/comercials_${coord.id}_${mes}_${any}.json`;
              await api.forceReleaseLock(filePath);
            }
          } else {
            await api.forceReleaseLock(currentFilePath);
          }
          window.location.reload();
        }
      };
      banner.appendChild(unlockBtn);
    }

    document.body.insertBefore(banner, document.body.firstChild);
  }

  // Deshabilitar todos los controles de edición en la página
  function disableEditingControls() {
    isReadOnlyMode = true;
    
    // Inhabilitar inputs, selects y textareas editables en las tablas/formularios
    const inputs = document.querySelectorAll('tbody input, tbody select, textarea, select:not([id*="filter"]):not([id*="selectMonth"]):not([id*="selectYear"])');
    inputs.forEach(el => {
      el.disabled = true;
      el.style.opacity = '0.7';
      el.style.pointerEvents = 'none';
    });

    // Inhabilitar botones que ejecuten acciones de guardado, borrado o importación
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => {
      const text = btn.innerText.toLowerCase();
      const matchWord = ['guardar', 'salvar', 'esborrar', 'importar', 'afegir', 'nova', 'reset', 'delete', 'quicksave', 'tancar mes', 'afegir fila', 'borrar', 'eliminar'].some(word => text.includes(word));
      
      if (matchWord) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.pointerEvents = 'none';
      }
    });

    const radios = document.querySelectorAll('.sub-radio');
    radios.forEach(r => {
      r.disabled = true;
      r.style.pointerEvents = 'none';
    });
  }

  function handleLockLoss() {
    if (isReadOnlyMode) return;
    
    isReadOnlyMode = true;
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (saveTimeout) clearTimeout(saveTimeout);
    
    // Deshabilitar edición
    disableEditingControls();
    
    // Actualizar banner
    injectStatusBanner('locked', `🔒 Bloqueig Perdut: Aquest fitxer ja no està bloquejat por tu (ha expirat o ha estat alliberat). No es poden desar canvis.`);
    
    // Alerta emergente en catalán
    alert("S'ha perdut el bloqueig d'edició d'aquest fitxer (ha expirat o un administrador l'ha forçat). No es podran desar més canvis. Si us plau, copia els teus canvis manualment i recarrega la pàgina.");
  }

  function startHeartbeat(moduleName) {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    const isRelational = (moduleName === 'quadrant' || moduleName === 'vacances');
    
    heartbeatInterval = setInterval(async () => {
      if (isReadOnlyMode) {
        clearInterval(heartbeatInterval);
        return;
      }
      
      try {
        if (isRelational) {
          const dbRole = (userRole === 'jefe operaciones') ? 'jefe_operaciones' : 'coordinador';
          const lockResult = await window.databaseAPI.controlConcurrencia.adquirirLock(userName, dbRole);
          if (!lockResult.adquirido && !lockResult.success) {
            handleLockLoss();
          }
        } else {
          const checkResult = await api.checkLock(currentFilePath);
          if (!checkResult.locked || checkResult.lockedBy !== userName) {
            handleLockLoss();
          }
        }
      } catch (e) {
        console.warn('[PERSISTENCE] Error en verificación periódica de bloqueo:', e);
      }
    }, 30000); // Comprobar cada 30 segundos
  }

  async function initModule(moduleName) {
    if (!api) {
      console.warn('[PERSISTENCE] No se detectó la API de Electron IPC.');
      return true;
    }

    if (!userRole || !userName) {
      alert('Error de sessió: Rol o Usuari no definits.');
      return false;
    }

    activeModuleName = moduleName;
    const newFilePath = getModuleFilePath(moduleName, userName);
    const isRelational = (moduleName === 'quadrant' || moduleName === 'vacances');

    if (currentFilePath && currentFilePath !== newFilePath) {
      console.log(`[PERSISTENCE] Canviant de fitxer. Alliberant bloqueig anterior: ${currentFilePath}`);
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      if (isRelational) {
        await window.databaseAPI.controlConcurrencia.liberarLock(userName);
      } else {
        const isJefeOps = (userRole === 'jefe operaciones');
        await api.releaseLock(currentFilePath, userName, isJefeOps);
      }
    }
    currentFilePath = newFilePath;
    console.log(`[PERSISTENCE] Inicialitzant mòdul: ${moduleName} -> RUTA: ${currentFilePath}`);

    if (userRole === 'otro' || userRole === 'comercial') {
      disableEditingControls();
      injectStatusBanner('readonly', '👁️ Mode Només Lectura: Perfil de visualització (no es poden desar canvis).');
      return false;
    }

    let lockResult;
    if (isRelational) {
      const dbRole = (userRole === 'jefe operaciones') ? 'jefe_operaciones' : 'coordinador';
      lockResult = await window.databaseAPI.controlConcurrencia.adquirirLock(userName, dbRole);
    } else {
      lockResult = await api.acquireLock(currentFilePath, userName);
    }
    
    if (lockResult.success || lockResult.adquirido) {
      injectStatusBanner('edit', `📝 Mode Edició Actiu | Usuari: ${userName}`);
      
      // Iniciar el chequeo de latido periódico del lock
      startHeartbeat(moduleName);

      window.addEventListener('beforeunload', () => {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (isRelational) {
          window.databaseAPI.controlConcurrencia.liberarLock(userName);
        } else {
          const isJefeOps = (userRole === 'jefe operaciones');
          api.releaseLock(currentFilePath, userName, isJefeOps);
        }
      });
      return true;
    } else {
      disableEditingControls();
      const ocupadoPor = lockResult.usuarioActivo || lockResult.lockedBy || 'otro usuario';
      injectStatusBanner('locked', `🔒 Només Lectura: Aquest mòdul està sent editat per ${ocupadoPor}.`, ocupadoPor);
      return false;
    }
  }

  // Remapea claves antiguas de comerciales (sin año) al formato actual (con año)
  function remapComercialKeys(data, mes, any) {
    if (!data) return data;
    const remapped = {};

    // Detectar prefijos dinámicamente (nn_X_ donde X es una letra mayúscula)
    const prefixes = new Set();
    for (const key in data) {
      const m = key.match(/^(nn_[A-Z]_)/);
      if (m) prefixes.add(m[1]);
      remapped[key] = data[key];
    }

    // Para cada prefijo detectado, verificar si existe la clave con año
    prefixes.forEach(prefix => {
      const expectedKey = `${prefix}${mes}_${any}`;
      if (!remapped[expectedKey]) {
        // Buscar clave legacy sin año (ej: nn_A_marc -> nn_A_marc_2026)
        const legacyKey = `${prefix}${mes}`;
        if (data[legacyKey]) {
          remapped[expectedKey] = data[legacyKey];
          console.log(`[PERSISTENCE] Remapeada clave legacy: ${legacyKey} -> ${expectedKey}`);
        }
      }
    });

    return remapped;
  }

  function parsearRangoFecha(rangStr, año) {
    if (!rangStr || rangStr === "-") return null;
    const separador = rangStr.includes(" a ") ? " a " : " to ";
    const parts = rangStr.split(separador);
    
    try {
      if (parts.length === 1) {
        const dateParts = parts[0].split('/');
        if (dateParts.length < 3) return null;
        const fecha = `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;
        return { inicio: fecha, fin: fecha };
      } else if (parts.length >= 2) {
        const d1Parts = parts[0].split('/');
        const d2Parts = parts[1].split('/');
        if (d1Parts.length < 3 || d2Parts.length < 3) return null;
        const inicio = `${d1Parts[2]}-${d1Parts[1].padStart(2, '0')}-${d1Parts[0].padStart(2, '0')}`;
        const fin = `${d2Parts[2]}-${d2Parts[1].padStart(2, '0')}-${d2Parts[0].padStart(2, '0')}`;
        return { inicio, fin };
      }
    } catch (e) {
      console.warn('[PERSISTENCE] Error al parsear rango de fecha:', rangStr, e);
    }
    return null;
  }

  async function readData() {
    if (!window.databaseAPI) return null;

    if (activeModuleName === 'quadrant') {
      const mesSelect = document.getElementById('selectMonth');
      const anySelect = document.getElementById('selectYear');
      const mes = mesSelect ? parseInt(mesSelect.value) : new Date().getMonth();
      const any = anySelect ? parseInt(anySelect.value) : new Date().getFullYear();
      
      const mesNum = (mes + 1).toString().padStart(2, '0');
      const mesBusqueda = `${any}-${mesNum}-%`;

      let combinedData = {};

      try {
        // 1. Cargar agentes activos para LLISTES.personal
        const agentes = await window.databaseAPI.consultar("SELECT nombre FROM agentes WHERE activo = 1 ORDER BY nombre ASC", []);
        const personal = agentes.map(a => a.nombre);
        originalSetItem.call(localStorage, 'nyn_personal', JSON.stringify(["-", ...personal]));

        // 2. Cargar aparcamientos asignados para LLISTES.parkings
        const userLower = userName.toLowerCase();
        const queryParkings = "SELECT nombre FROM aparcamientos WHERE activo = 1 AND (LOWER(coordinador_responsable) = ? OR coordinador_responsable = 'Ambos') ORDER BY nombre ASC";
        const parkings = await window.databaseAPI.consultar(queryParkings, [userLower]);
        const parkingsNames = parkings.map(p => p.nombre);
        originalSetItem.call(localStorage, 'nyn_parkings', JSON.stringify(["-", ...parkingsNames]));

        // 3. Cargar asignaciones del cuadrante relacional del mes
        const queryTurnos = `
          SELECT q.*, ag.nombre as agente_nombre, ap.nombre as parking_nombre 
          FROM quadrant q 
          JOIN agentes ag ON q.agente_id = ag.id 
          JOIN aparcamientos ap ON q.aparcamiento_id = ap.id 
          WHERE q.fecha LIKE ?
        `;
        const turnos = await window.databaseAPI.consultar(queryTurnos, [mesBusqueda]);

        turnos.forEach(row => {
          const dia = parseInt(row.fecha.split('-')[2]);
          const cellKey = `nyn_v12_${any}_${mes}_${row.parking_nombre}_${row.turno}_${dia}`;
          combinedData[cellKey] = {
            w: row.agente_nombre,
            h: `${row.hora_inicio}-${row.hora_fin}`,
            s: row.es_substitucio === 1,
            n: row.nota || ""
          };
        });

        // 4. Cargar marcadores de pendientes del mes desde kv_store
        const keyPendientesPattern = `nyn_pendent_${any}_${mes}_%`;
        const pendientes = await window.databaseAPI.consultar("SELECT key, value FROM kv_store WHERE key LIKE ?", [keyPendientesPattern]);
        pendientes.forEach(row => {
          combinedData[row.key] = JSON.parse(row.value);
        });

      } catch (err) {
        console.error('[PERSISTENCE] Error cargando datos relacionales del cuadrante:', err);
      }

      return combinedData;
    }

    if (activeModuleName === 'vacances') {
      const anySelect = document.getElementById('selectAny');
      const any = anySelect ? anySelect.value : '2026';
      const key = `nyn_vacances_${any}`;

      let combinedData = {};

      try {
        // Cargar agentes y aparcamientos para LLISTES.centres y LLISTES.plantilla
        const agentes = await window.databaseAPI.consultar("SELECT nombre FROM agentes WHERE activo = 1 ORDER BY nombre ASC", []);
        const plantilla = agentes.map(a => a.nombre);
        originalSetItem.call(localStorage, 'nyn_plantilla', JSON.stringify(plantilla));

        const parkings = await window.databaseAPI.consultar("SELECT nombre FROM aparcamientos WHERE activo = 1 ORDER BY nombre ASC", []);
        const centres = parkings.map(p => p.nombre);
        originalSetItem.call(localStorage, 'nyn_centres', JSON.stringify(centres));

        // Cargar vacaciones JSON estructuradas de kv_store
        const rows = await window.databaseAPI.consultar("SELECT value FROM kv_store WHERE key = ?", [key]);
        if (rows && rows.length > 0 && rows[0].value) {
          combinedData[key] = JSON.parse(rows[0].value);
        } else {
          combinedData[key] = [];
        }
      } catch (err) {
        console.error('[PERSISTENCE] Error al cargar vacaciones de la base de datos única:', err);
      }

      return combinedData;
    }

    if (activeModuleName === 'comercials') {
      let coordinadores = [];
      try {
        coordinadores = await api.getCoordinadores();
      } catch (e) {
        coordinadores = [
          { id: 'albert', nombre: 'Albert' },
          { id: 'laura', nombre: 'Laura' }
        ];
      }

      const mesSelect = document.getElementById('mesActual');
      const anySelect = document.getElementById('anyActual');
      const mes = mesSelect ? mesSelect.value : 'marc';
      const any = anySelect ? anySelect.value : '2026';
      
      const combinedData = {};

      for (const coord of coordinadores) {
        const filePath = `dades ${coord.nombre}/comercials_${coord.id}_${mes}_${any}.json`;
        let coordData = null;

        // Intentar leer de SQLite kv_store
        try {
          const rows = await window.databaseAPI.consultar("SELECT value FROM kv_store WHERE key = ?", [filePath]);
          if (rows && rows.length > 0 && rows[0].value) {
            coordData = JSON.parse(rows[0].value);
          }
        } catch (dbErr) {
          console.warn(`[PERSISTENCE] Clave ${filePath} no encontrada en kv_store para leer.`, dbErr);
        }

        // Fallback a archivo JSON físico
        if (!coordData) {
          const result = await api.readFile(filePath);
          if (result.success) {
            coordData = result.data;
          }
        }

        // Fusionar claves
        if (coordData) {
          for (const key in coordData) {
            combinedData[key] = coordData[key];
          }
        }
      }

      return combinedData;
    }

    // Fallback para otros módulos (Gastos, etc.) usando la tabla kv_store en dades.db única
    try {
      const rows = await window.databaseAPI.consultar("SELECT value FROM kv_store WHERE key = ?", [currentFilePath]);
      if (rows && rows.length > 0 && rows[0].value) {
        return JSON.parse(rows[0].value);
      }
    } catch (dbErr) {
      console.warn(`[PERSISTENCE] Clave ${currentFilePath} no encontrada en kv_store. Intentando fallback legacy...`);
    }

    // Fallback legacy a archivos JSON físicos
    const result = await api.readFile(currentFilePath);
    if (result.success) {
      return result.data;
    }
    return null;
  }

  async function writeData(data) {
    if (isReadOnlyMode) return false;
    if (!window.databaseAPI) return false;

    if (activeModuleName === 'quadrant') {
      try {
        for (const [key, value] of Object.entries(data)) {
          if (key.startsWith('nyn_v12_')) {
            // Clave: nyn_v12_{año}_{mes}_{nombre_parking}_{turno}_{dia}
            const parts = key.split('_');
            if (parts.length < 7) continue;

            const año = parts[2];
            const mes = parts[3];
            const dia = parts[parts.length - 1];
            const turno = parts[parts.length - 2];
            const nombreParking = parts.slice(4, parts.length - 2).join(' ').toUpperCase();

            const cellData = typeof value === 'string' ? JSON.parse(value) : value;
            const trabajador = (cellData.w || "-").trim();
            const horario = (cellData.h || "-").trim();
            const esSub = cellData.s ? 1 : 0;
            const notaText = cellData.n || "";

            const mesNum = (Number(mes) + 1).toString().padStart(2, '0');
            const diaNum = Number(dia).toString().padStart(2, '0');
            const fechaStr = `${año}-${mesNum}-${diaNum}`;

            if (trabajador === "-" || trabajador === "") {
              // Eliminar turno si está vacío
              const deleteQuery = `
                DELETE FROM quadrant 
                WHERE fecha = ? 
                  AND aparcamiento_id = (SELECT id FROM aparcamientos WHERE nombre = ?) 
                  AND turno = ?
              `;
              await window.databaseAPI.ejecutar(deleteQuery, [fechaStr, nombreParking, turno]);
            } else {
              // Buscar IDs
              const pRow = await window.databaseAPI.consultar("SELECT id, sociedad_id FROM aparcamientos WHERE nombre = ?", [nombreParking]);
              const aRow = await window.databaseAPI.consultar("SELECT id FROM agentes WHERE nombre = ?", [trabajador]);

              if (pRow && pRow.length > 0 && aRow && aRow.length > 0) {
                const parkingId = pRow[0].id;
                const agenteId = aRow[0].id;
                let sociedadId = pRow[0].sociedad_id;

                // Buscar sociedad del contrato del agente para registrar el snapshot
                const cRow = await window.databaseAPI.consultar(`
                  SELECT sociedad_id 
                  FROM contratos_agentes 
                  WHERE agente_id = ? AND ? >= fecha_inicio AND (fecha_fin IS NULL OR ? <= fecha_fin)
                `, [agenteId, fechaStr, fechaStr]);
                if (cRow && cRow.length > 0) {
                  sociedadId = cRow[0].sociedad_id;
                }

                // Parsear horas
                const hoursParts = horario.split('-');
                const horaInicio = hoursParts[0] || '06:00';
                const horaFin = hoursParts[1] || '14:00';

                const insertQuery = `
                  INSERT OR REPLACE INTO quadrant (fecha, aparcamiento_id, agente_id, turno, hora_inicio, hora_fin, es_substitucio, nota, sociedad_contrato_snapshot_id)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;
                await window.databaseAPI.ejecutar(insertQuery, [
                  fechaStr, parkingId, agenteId, turno, horaInicio, horaFin, esSub, notaText, sociedadId
                ]);
              }
            }
          } else if (key.startsWith('nyn_pendent_')) {
            // Guardar marcador de pendientes del mes en kv_store
            await window.databaseAPI.ejecutar("INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)", [
              key, JSON.stringify(value)
            ]);
          }
        }
        return true;
      } catch (err) {
        console.error('[PERSISTENCE] Error guardando cuadrante relacional:', err);
        return false;
      }
    }

    if (activeModuleName === 'vacances') {
      const anySelect = document.getElementById('selectAny');
      const any = anySelect ? anySelect.value : '2026';
      const key = `nyn_vacances_${any}`;

      try {
        // 1. Guardar JSON completo en kv_store para vacaciones.html
        let rawVacances = data[key] || [];
        if (typeof rawVacances === 'string') {
          try {
            rawVacances = JSON.parse(rawVacances);
          } catch (e) {
            rawVacances = [];
          }
        }
        await window.databaseAPI.ejecutar("INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)", [
          key, JSON.stringify(rawVacances)
        ]);

        // 2. Volcar de manera atómica a la tabla relacional vacances para el cuadrante inteligente
        for (const fila of rawVacances) {
          const nombreAgente = (fila.n || "-").trim();
          if (nombreAgente === "-" || nombreAgente === "") continue;

          // Buscar ID de agente
          const aRow = await window.databaseAPI.consultar("SELECT id FROM agentes WHERE nombre = ?", [nombreAgente]);
          if (aRow && aRow.length > 0) {
            const agenteId = aRow[0].id;

            // Eliminar vacaciones previas del agente para este año
            const queryBorrar = "DELETE FROM vacances WHERE agente_id = ? AND (fecha_inicio LIKE ? OR fecha_fin LIKE ?)";
            await window.databaseAPI.ejecutar(queryBorrar, [agenteId, `${any}-%`, `${any}-%`]);

            // Parsear e insertar los rangos de vacaciones válidos
            const rango1 = parsearRangoFecha(fila.p, any);
            const rango2 = parsearRangoFecha(fila.p2, any);

            if (rango1) {
              await window.databaseAPI.ejecutar("INSERT INTO vacances (agente_id, fecha_inicio, fecha_fin) VALUES (?, ?, ?)", [
                agenteId, rango1.inicio, rango1.fin
              ]);
            }
            if (rango2) {
              await window.databaseAPI.ejecutar("INSERT INTO vacances (agente_id, fecha_inicio, fecha_fin) VALUES (?, ?, ?)", [
                agenteId, rango2.inicio, rango2.fin
              ]);
            }
          }
        }
        return true;
      } catch (err) {
        console.error('[PERSISTENCE] Error guardando vacaciones relacionales:', err);
        return false;
      }
    }

    // Caso general para otros módulos, guardando en la tabla kv_store
    try {
      await window.databaseAPI.ejecutar("INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)", [
        currentFilePath, JSON.stringify(data)
      ]);
      return true;
    } catch (err) {
      console.error(`[PERSISTENCE] Error escribiendo clave ${currentFilePath} en la base de datos única:`, err);
    }

    // Fallback legacy a archivos físicos
    const result = await api.writeFile(currentFilePath, data, userName);
    if (!result.success && result.error === 'LOCK_LOST') {
      handleLockLoss();
    }
    return result.success;
  }

  // Guardado diferido (Debounce)
  function debouncedSave() {
    if (isSyncing || isReadOnlyMode) return;
    if (saveTimeout) clearTimeout(saveTimeout);
    
    saveTimeout = setTimeout(async () => {
      console.log('[PERSISTENCE] Guardant dades al fitxer físic de xarxa...');
      await syncSave();
    }, 400);
  }

  // Interceptar la escritura y eliminación de localStorage de forma transparente
  const originalSetItem = localStorage.setItem;
  const originalRemoveItem = localStorage.removeItem;
  const originalClear = localStorage.clear;

  localStorage.setItem = function(key, val) {
    originalSetItem.apply(this, arguments);
    if (!isSyncing && !isReadOnlyMode) {
      debouncedSave();
      window.dispatchEvent(new CustomEvent('localStorage-changed', { detail: { action: 'set', key, val } }));
    }
  };

  localStorage.removeItem = function(key) {
    originalRemoveItem.apply(this, arguments);
    if (!isSyncing && !isReadOnlyMode) {
      debouncedSave();
      window.dispatchEvent(new CustomEvent('localStorage-changed', { detail: { action: 'remove', key } }));
    }
  };

  localStorage.clear = function() {
    originalClear.apply(this, arguments);
    if (!isSyncing && !isReadOnlyMode) {
      debouncedSave();
      window.dispatchEvent(new CustomEvent('localStorage-changed', { detail: { action: 'clear' } }));
    }
  };

  async function syncLoad(moduleName) {
    isSyncing = true;
    const canEdit = await initModule(moduleName);
    const data = await readData();
    if (data) {
      const filter = moduleFilters[moduleName] || (() => true);
      
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (filter(key)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => originalRemoveItem.call(localStorage, k));

      for (const key in data) {
        if (filter(key)) {
          const val = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]);
          originalSetItem.call(localStorage, key, val);
        }
      }
      
      // Auto-corrección dinámica para Comerciales (mapeo de claves antiguas/migradas al mes/año actual)
      if (moduleName === 'comercials') {
        const mesSelect = document.getElementById('mesActual');
        const anySelect = document.getElementById('anyActual');
        if (mesSelect && anySelect) {
          const mes = mesSelect.value;
          const any = anySelect.value;
          
          // Buscar prefijos dinámicos de coordinadores en los datos cargados
          const prefixes = new Set();
          for (const key in data) {
            const m = key.match(/^(nn_[A-Z]_)/);
            if (m) prefixes.add(m[1]);
          }
          
          prefixes.forEach(prefix => {
            const targetKey = `${prefix}${mes}_${any}`;
            let found = localStorage.getItem(targetKey);
            if (!found || found === '[]') {
              for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k.startsWith(prefix) && k !== targetKey) {
                  const val = localStorage.getItem(k);
                  if (val && val !== '[]') {
                    originalSetItem.call(localStorage, targetKey, val);
                    console.log(`[PERSISTENCE] Clonada clave comercial: ${k} -> ${targetKey}`);
                    break;
                  }
                }
              }
            }
          });
        }
      }
    }
    isSyncing = false;
    return canEdit;
  }

  async function syncSave() {
    if (isReadOnlyMode) return false;
    
    let filterKey = 'quadrant';
    for (const key in moduleFilters) {
      if (currentFilePath.toLowerCase().includes(key)) {
        filterKey = key;
        break;
      }
    }
    const filter = moduleFilters[filterKey] || (() => true);

    // CASO ESPECIAL: Comerciales. Sincronizamos las claves individuales de cada coordinador en su propio archivo de red.
    if (filterKey === 'comercials') {
      const mesSelect = document.getElementById('mesActual');
      const anySelect = document.getElementById('anyActual');
      const mes = mesSelect ? mesSelect.value : 'marc';
      const any = anySelect ? anySelect.value : '2026';

      let coordinadores = [];
      try {
        coordinadores = await api.getCoordinadores();
      } catch (e) {
        coordinadores = [
          { id: 'albert', nombre: 'Albert' },
          { id: 'laura', nombre: 'Laura' }
        ];
      }

      let success = true;
      for (const coord of coordinadores) {
        // Un coordinador solo puede guardar sus propios datos de comerciales
        if (userRole === 'coordinador' && userName.toLowerCase() !== coord.nombre.toLowerCase()) {
          continue;
        }

        // Obtener el prefijo del coordinador (ej: nn_A_ para Albert)
        const prefix = `nn_${coord.nombre.charAt(0).toUpperCase()}_`;
        
        // Extraer las claves asociadas a este coordinador del localStorage
        const coordData = {};
        let hasData = false;
        
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key.startsWith(prefix)) {
            coordData[key] = localStorage.getItem(key);
            hasData = true;
          }
        }

        // Si es el coordinador actual de la sesión, añadimos claves transversales de comerciales
        if (userName === coord.nombre) {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('nn_last_export_')) {
              coordData[key] = localStorage.getItem(key);
            }
          }
        }

        // Si tenemos datos activos en localstorage para la clave de mes/año de este coordinador, los guardamos en su JSON correspondiente
        const targetKey = `${prefix}${mes}_${any}`;
        if (localStorage.getItem(targetKey) !== null || hasData) {
          const filePath = `dades ${coord.nombre}/comercials_${coord.id}_${mes}_${any}.json`;
          const writeRes = await api.writeFile(filePath, coordData, userName);
          if (!writeRes.success) {
            console.error(`[PERSISTENCE] Error al guardar datos de comerciales para ${coord.nombre}:`, writeRes.error);
            if (writeRes.error === 'LOCK_LOST') {
              handleLockLoss();
            }
            success = false;
          } else {
            console.log(`[PERSISTENCE] Guardados comerciales de ${coord.nombre} en: ${filePath}`);
          }
        }
      }
      return success;
    }

    // Caso general para los demás módulos
    const dataToSave = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (filter(key)) {
        dataToSave[key] = localStorage.getItem(key);
      }
    }
    return await writeData(dataToSave);
  }

  return {
    init: initModule,
    read: readData,
    write: writeData,
    syncLoad,
    syncSave,
    getFilePath: () => currentFilePath,
    isReadOnly: () => isReadOnlyMode
  };
})();

// --- NUEVA CARGA DESDE SQLITE ---
async function loadAparcamientos() {
    try {
        console.log("Cargando aparcamientos desde SQLite...");
        // Usamos la nueva API relacional
        const data = await window.databaseAPI.getAparcamientosRelacional();
        console.log("Aparcamientos cargados de SQLite:", data);
        return data || [];
    } catch (error) {
        console.error('Error loading aparcamientos from SQLite:', error);
        
        // Fallback: Si falla SQLite por lo que sea, intentamos cargar el viejo JSON
        console.warn("Intentando cargar JSON antiguo como fallback...");
        try {
            const legacyData = await window.api.getAparcamientos();
            return legacyData ? JSON.parse(legacyData) : [];
        } catch (legacyError) {
             console.error('Error loading fallback JSON:', legacyError);
             return [];
        }
    }
}

// --- NUEVA CARGA DE PERSONAL DESDE SQLITE ---

// Unificamos a todos los trabajadores bajo la misma lectura relacional
async function loadCoordinadores() {
    try {
        console.log("Cargando personal (agentes) desde SQLite...");
        const data = await window.databaseAPI.getAgentesRelacional();
        
        // Adaptamos temporalmente la salida para que las pantallas HTML viejas no se rompan
        // (ya que antes esperaban id, nom, cognoms en lugar del nombre completo)
        const adaptado = data.map(agente => ({
            id: agente.id,
            nombre: agente.nombre, // Usamos el nombre centralizado
            nom: agente.nombre.split(' ')[0], // Hack de compatibilidad
            cognoms: agente.nombre.split(' ').slice(1).join(' '), // Hack de compatibilidad
            ranking: agente.ranking_score,
            es_empresa_externa: agente.es_empresa_externa
        }));
        
        console.log("Agentes cargados:", adaptado);
        return adaptado;
    } catch (error) {
        console.error('Error loading agentes from SQLite:', error);
        
        // Fallback de emergencia al JSON antiguo
        console.warn("Intentando cargar JSON de coordinadores antiguo como fallback...");
        try {
            const legacyData = await window.api.getCoordinadores();
            return legacyData ? JSON.parse(legacyData) : [];
        } catch (legacyError) {
             return [];
        }
    }
}

// Ahora loadComercials simplemente llama a loadCoordinadores para que todos usen la BD única
async function loadComercials() {
    return await loadCoordinadores();
}

// Funciones antiguas (Comentadas por seguridad)
/*
async function loadCoordinadores() {
    try {
        const data = await window.api.getCoordinadores();
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('Error loading coordinadores:', error);
        return [];
    }
}
async function loadComercials() { ... }
*/

// Antigua versión (Comentada para no perderla)
/*
async function loadAparcamientos() {
    try {
        const data = await window.api.getAparcamientos();
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('Error loading aparcamientos:', error);
        return [];
    }
}
*/
