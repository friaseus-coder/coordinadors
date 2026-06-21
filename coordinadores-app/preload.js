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
  calcularAlertasCuadrante: (fechaInicio, fechaFin) => ipcRenderer.invoke('calcular-alertas-cuadrante', { fechaInicio, fechaFin }),

  // --- Sociedades ---
  getSociedades: () => ipcRenderer.invoke('get-sociedades'),
  addSociedad: (datos) => ipcRenderer.invoke('add-sociedad', datos),
  updateSociedad: (id, datos) => ipcRenderer.invoke('update-sociedad', id, datos),
  deactivateSociedad: (id) => ipcRenderer.invoke('deactivate-sociedad', id),

  // --- Aparcamientos Relacionales ---
  getAparcamientosRelacional: () => ipcRenderer.invoke('get-aparcamientos-relacional'),
  updateAparcamientoRelacional: (id, datos) => ipcRenderer.invoke('update-aparcamiento-relacional', id, datos),
  getHistoricoAparcamiento: (aparcamientoId) => ipcRenderer.invoke('get-historico-aparcamiento', aparcamientoId),

  // --- Contratos de Agentes ---
  getContratosAgente: (agenteId) => ipcRenderer.invoke('get-contratos-agente', agenteId),
  addContratoAgente: (datos) => ipcRenderer.invoke('add-contrato-agente', datos),
  cerrarContratoAgente: (contratoId) => ipcRenderer.invoke('cerrar-contrato-agente', contratoId),

  // --- Personal / Agentes ---
  getAgentesRelacional: () => ipcRenderer.invoke('get-agentes-relacional'),

  // --- Cuadrante Relacional ---
  getTurnosCuadrante: (fechaInicio, fechaFin) => ipcRenderer.invoke('get-turnos-cuadrante', { fechaInicio, fechaFin }),
  saveTurnoCuadrante: (turnoData) => ipcRenderer.invoke('save-turno-cuadrante', turnoData),
  deleteTurnoCuadrante: (fecha, aparcamiento_id, turno) => ipcRenderer.invoke('delete-turno-cuadrante', { fecha, aparcamiento_id, turno })
});
