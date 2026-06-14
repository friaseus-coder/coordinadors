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
          await api.forceReleaseLock(currentFilePath);
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
    
    heartbeatInterval = setInterval(async () => {
      if (isReadOnlyMode) {
        clearInterval(heartbeatInterval);
        return;
      }
      
      try {
        const checkResult = await api.checkLock(currentFilePath);
        if (!checkResult.locked || checkResult.lockedBy !== userName) {
          handleLockLoss();
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

    const newFilePath = getModuleFilePath(moduleName, userName);
    if (currentFilePath && currentFilePath !== newFilePath) {
      console.log(`[PERSISTENCE] Canviant de fitxer. Alliberant bloqueig anterior: ${currentFilePath}`);
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      const isJefeOps = (userRole === 'jefe operaciones');
      await api.releaseLock(currentFilePath, userName, isJefeOps);
    }
    currentFilePath = newFilePath;
    console.log(`[PERSISTENCE] Inicialitzant mòdul: ${moduleName} -> RUTA: ${currentFilePath}`);

    if (userRole === 'otro' || userRole === 'comercial') {
      disableEditingControls();
      injectStatusBanner('readonly', '👁️ Mode Només Lectura: Perfil de visualització (no es poden desar canvis).');
      return false;
    }

    const lockResult = await api.acquireLock(currentFilePath, userName);
    
    if (lockResult.success) {
      injectStatusBanner('edit', `📝 Mode Edició Actiu | Usuari: ${userName}`);
      
      // Iniciar el chequeo de latido periódico del lock
      startHeartbeat(moduleName);

      window.addEventListener('beforeunload', () => {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        const isJefeOps = (userRole === 'jefe operaciones');
        api.releaseLock(currentFilePath, userName, isJefeOps);
      });
      return true;
    } else {
      disableEditingControls();
      injectStatusBanner('locked', `🔒 Només Lectura: Aquest mòdul està sent editat per ${lockResult.lockedBy}.`);
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

  async function readData() {
    if (!api) return null;

    // Si es Comerciales, fusionamos las bases de datos de TODOS los coordinadores registrados
    if (currentFilePath && currentFilePath.toLowerCase().includes('comercials')) {
      const mesSelect = document.getElementById('mesActual');
      const anySelect = document.getElementById('anyActual');
      const mes = mesSelect ? mesSelect.value : 'marc';
      const any = anySelect ? anySelect.value : '2026';
      
      let combinedData = {};
      
      // Leer la lista de coordinadores dinámicamente
      let coordinadores = [];
      try {
        coordinadores = await api.getCoordinadores();
      } catch (e) {
        // Fallback a los coordinadores clásicos
        coordinadores = [
          { id: 'albert', nombre: 'Albert' },
          { id: 'laura', nombre: 'Laura' }
        ];
      }
      
      for (const coord of coordinadores) {
        const filePath = `dades ${coord.nombre}/comercials_${coord.id}_${mes}_${any}.json`;
        const res = await api.readFile(filePath);
        if (res.success && res.data) {
          const remapped = remapComercialKeys(res.data, mes, any);
          combinedData = { ...combinedData, ...remapped };
        }
      }
      
      console.log(`[PERSISTENCE] Comercials carregats (${coordinadores.length} coordinadors): ${Object.keys(combinedData).filter(k => k.startsWith('nn_')).join(', ')}`);
      return combinedData;
    }

    const result = await api.readFile(currentFilePath);
    if (result.success) {
      return result.data;
    } else {
      console.error('[PERSISTENCE] Error al llegir fitxer:', result.error);
      return null;
    }
  }

  async function writeData(data) {
    if (isReadOnlyMode) return false;
    if (!api) return false;
    if (!currentFilePath) {
      console.warn('[PERSISTENCE] Intent d\'escriptura ignorat: cap fitxer actiu definit.');
      return false;
    }
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
    }
  };

  localStorage.removeItem = function(key) {
    originalRemoveItem.apply(this, arguments);
    if (!isSyncing && !isReadOnlyMode) {
      debouncedSave();
    }
  };

  localStorage.clear = function() {
    originalClear.apply(this, arguments);
    if (!isSyncing && !isReadOnlyMode) {
      debouncedSave();
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
