const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  readFile: (relativePath) => ipcRenderer.invoke('read-file', relativePath),
  writeFile: (relativePath, data, userName) => ipcRenderer.invoke('write-file', relativePath, data, userName),
  checkLock: (relativePath) => ipcRenderer.invoke('check-lock', relativePath),
  acquireLock: (relativePath, userName) => ipcRenderer.invoke('acquire-lock', relativePath, userName),
  releaseLock: (relativePath, userName, isJefeOps) => ipcRenderer.invoke('release-lock', relativePath, userName, isJefeOps),
  forceReleaseLock: (relativePath) => ipcRenderer.invoke('force-release-lock', relativePath),
  // Gestión dinámica de coordinadores
  getCoordinadores: () => ipcRenderer.invoke('get-coordinadores'),
  addCoordinador: (nombre, apellido, zona) => ipcRenderer.invoke('add-coordinador', nombre, apellido, zona),
  removeCoordinador: (id) => ipcRenderer.invoke('remove-coordinador', id),
  // Gestión dinámica de aparcamientos
  getAparcamientos: () => ipcRenderer.invoke('get-aparcamientos'),
  saveAparcamientos: (aparcamientos) => ipcRenderer.invoke('save-aparcamientos', aparcamientos),
  renameAparcamiento: (oldName, newName) => ipcRenderer.invoke('rename-aparcamiento', oldName, newName),
  // Importación manual de JSONs
  importJsonData: (coordFolder, fileName, jsonContent) => ipcRenderer.invoke('import-json-data', coordFolder, fileName, jsonContent),
  migrarJsonCuadrante: (dataJSON) => ipcRenderer.invoke('migrar-json-cuadrante', { dataJSON }),
  migrarJsonDeutes: (dataJSON) => ipcRenderer.invoke('migrar-json-deutes', { dataJSON }),
  migrarJsonComercials: (dataJSON) => ipcRenderer.invoke('migrar-json-comercials', { dataJSON }),
  seleccionarArchivosMigracion: () => ipcRenderer.invoke('seleccionar-archivos-migracion'),
  crearBackupMigracion: (tipo) => ipcRenderer.invoke('crear-backup-migracion', { tipo }),
  // Cerrar aplicación
  closeApp: () => ipcRenderer.invoke('app-close'),
  // Gestión de sociedades
  getSociedades: () => ipcRenderer.invoke('get-sociedades'),
  addSociedad: (datos) => ipcRenderer.invoke('add-sociedad', datos),
  updateSociedad: (id, datos) => ipcRenderer.invoke('update-sociedad', id, datos),
  deactivateSociedad: (id) => ipcRenderer.invoke('deactivate-sociedad', id),
  // Gestión de contratos de trabajadores
  getContratosAgente: (agenteId) => ipcRenderer.invoke('get-contratos-agente', agenteId),
  addContratoAgente: (datos) => ipcRenderer.invoke('add-contrato-agente', datos),
  cerrarContratoAgente: (contratoId) => ipcRenderer.invoke('cerrar-contrato-agente', contratoId),
  fixFocus: () => ipcRenderer.invoke('focus-fix')
});

contextBridge.exposeInMainWorld('databaseAPI', {
  getUserConfig: () => ipcRenderer.invoke('get-user-config')
});

contextBridge.exposeInMainWorld('dbAPI', {
  read: (dbKey, query, params) => ipcRenderer.invoke('read-db', { dbKey, query, params }),
  write: (dbKey, query, params) => {
    const userRole = sessionStorage.getItem('userRole') || 'invitado';
    const userName = sessionStorage.getItem('user') || 'Desconocido';
    return ipcRenderer.invoke('write-db', { dbKey, query, params, userRole, userName });
  },
  writeBatch: (dbKey, operations) => {
    const userRole = sessionStorage.getItem('userRole') || 'invitado';
    const userName = sessionStorage.getItem('user') || 'Desconocido';
    return ipcRenderer.invoke('write-db-batch', { dbKey, operations, userRole, userName });
  },
  forceUnlock: (dbKey) => ipcRenderer.invoke('force-unlock-db', dbKey),
  onNetworkStatus: (callback) => ipcRenderer.on('network-status', (_event, data) => callback(data)),
  saveTurnoCuadranteSeguro: (params) => {
    const userRole = sessionStorage.getItem('userRole') || 'invitado';
    const userName = sessionStorage.getItem('userName') || sessionStorage.getItem('user') || 'Desconocido';
    return ipcRenderer.invoke('save-turno-cuadrante-seguro', { ...params, userRole, userName });
  }
});


