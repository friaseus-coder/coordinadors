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
  migrarJsonCuadrante: (dataJSON) => ipcRenderer.invoke('migrar-json-cuadrante', { dataJSON }),
  migrarJsonDeutes: (dataJSON) => ipcRenderer.invoke('migrar-json-deutes', { dataJSON }),
  migrarJsonComercials: (dataJSON) => ipcRenderer.invoke('migrar-json-comercials', { dataJSON }),
  seleccionarArchivosMigracion: () => ipcRenderer.invoke('seleccionar-archivos-migracion'),
  crearBackupMigracion: (tipo) => ipcRenderer.invoke('crear-backup-migracion', { tipo }),
  // Cerrar aplicación
  closeApp: () => ipcRenderer.invoke('app-close')
});

contextBridge.exposeInMainWorld('databaseAPI', {
  getUserConfig: () => ipcRenderer.invoke('get-user-config')
});

contextBridge.exposeInMainWorld('dbAPI', {
  read: (dbKey, query, params) => ipcRenderer.invoke('read-db', { dbKey, query, params }),
  write: (dbKey, query, params) => ipcRenderer.invoke('write-db', { dbKey, query, params })
});


