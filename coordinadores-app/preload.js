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
  addCoordinador: (nombre, apellido) => ipcRenderer.invoke('add-coordinador', nombre, apellido),
  removeCoordinador: (id) => ipcRenderer.invoke('remove-coordinador', id),
  // Gestión dinámica de aparcamientos
  getAparcamientos: () => ipcRenderer.invoke('get-aparcamientos'),
  saveAparcamientos: (aparcamientos) => ipcRenderer.invoke('save-aparcamientos', aparcamientos),
  renameAparcamiento: (oldName, newName) => ipcRenderer.invoke('rename-aparcamiento', oldName, newName),
  // Importación manual de JSONs
  importJsonData: (coordFolder, fileName, jsonContent) => ipcRenderer.invoke('import-json-data', coordFolder, fileName, jsonContent),
  // Cerrar aplicación
  closeApp: () => ipcRenderer.invoke('app-close')
});

contextBridge.exposeInMainWorld('databaseAPI', {
  consultar: (sql, params = []) => ipcRenderer.invoke('db-query', { sql, params }),
  ejecutar: (sql, params = []) => ipcRenderer.invoke('db-execute', { sql, params }),
  controlConcurrencia: {
    adquirirLock: (userName, userRole) => ipcRenderer.invoke('lock-acquire', { userName, userRole }),
    liberarLock: (userName) => ipcRenderer.invoke('lock-release', { userName }),
    forzarLiberacion: (userRole, adminName) => ipcRenderer.invoke('lock-force-release', { userRole, adminName })
  },
  migrarJsonDeutes: (filePath) => ipcRenderer.invoke('migrar-json-deutes', { filePath }),
  migrarJsonCuadrante: (dataJSON) => ipcRenderer.invoke('migrar-json-cuadrante', { dataJSON }),
  obtenerPropuestasAsistente: (fecha, aparcamientoId) => ipcRenderer.invoke('obtener-propuestas-asistente', { fecha, aparcamientoId }),
  calcularAlertasCuadrante: (fechaInicio, fechaFin) => ipcRenderer.invoke('calcular-alertas-cuadrante', { fechaInicio, fechaFin })
});
