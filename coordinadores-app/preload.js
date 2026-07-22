const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Archivos y utilidades
  readFile: (relativePath) => ipcRenderer.invoke('read-file', relativePath),
  writeFile: (relativePath, data, userName) => ipcRenderer.invoke('write-file', relativePath, data, userName),
  closeApp: () => ipcRenderer.invoke('app-close'),
  fixFocus: () => ipcRenderer.invoke('focus-fix'),

  // Eventos de cambios en tiempo real y deltas
  onDataChanged: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('app:data-changed', handler);
    return () => ipcRenderer.removeListener('app:data-changed', handler);
  },
  onDeltaApplied: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('app:delta-applied', handler);
    return () => ipcRenderer.removeListener('app:delta-applied', handler);
  },

  // Gestión de sesión y RBAC
  setSession: (user, role) => ipcRenderer.invoke('app:session:set', { user, role }),
  getSession: () => ipcRenderer.invoke('app:session:get'),

  // Dominio: Cuadrante y Operativa
  cuadrante: {
    obtenerCuadrantes: (mes, anio, parkingId) => ipcRenderer.invoke('app:cuadrante:obtener', { mes, anio, parkingId }),
    getTurnos: (fechaInicio, fechaFin) => ipcRenderer.invoke('get-turnos-cuadrante', { fechaInicio, fechaFin }),
    guardarTurno: (turno) => ipcRenderer.invoke('app:cuadrante:guardarTurno', turno),
    deleteTurno: (params) => ipcRenderer.invoke('delete-turno-cuadrante', params),
    obtenerAlertas: (fechaInicio, fechaFin) => ipcRenderer.invoke('calcular-alertas-cuadrante', { fechaInicio, fechaFin }),
    obtenerPropuestas: (fecha, aparcamientoId) => ipcRenderer.invoke('obtener-propuestas-asistente', { fecha, aparcamientoId }),
    obtenerRecomendaciones: (fecha, aparcamientoId) => ipcRenderer.invoke('obtener-recomendaciones-cuadrante', { fecha, aparcamientoId })
  },

  // Dominio: Incidencias y Vacaciones
  incidencias: {
    obtenerVacaciones: () => ipcRenderer.invoke('app:incidencias:obtenerVacaciones'),
    guardar: (datos) => ipcRenderer.invoke('app:incidencias:guardar', datos),
    cambiarEstado: (id, nuevoEstado) => ipcRenderer.invoke('app:incidencias:cambiarEstado', { id, nuevoEstado }),
    eliminar: (id) => ipcRenderer.invoke('app:incidencias:eliminar', { id })
  },
  vacaciones: {
    obtener: () => ipcRenderer.invoke('get-vacaciones-relacional'),
    guardar: (datos) => ipcRenderer.invoke('save-vacacion-relacional', datos),
    eliminar: (id) => ipcRenderer.invoke('delete-vacacion-relacional', { id })
  },

  // Dominio: Finanzas, Despeses y Deutes
  finanzas: {
    obtenerGastos: (usuario, mes, anio) => ipcRenderer.invoke('app:finanzas:obtenerGastos', { usuario, mes, anio }),
    guardarMovimiento: (datos) => ipcRenderer.invoke('app:finanzas:guardarMovimiento', datos)
  },
  despeses: {
    obtener: () => ipcRenderer.invoke('app:despeses:obtener'),
    guardar: (datos) => ipcRenderer.invoke('app:despeses:guardar', datos),
    eliminar: (id) => ipcRenderer.invoke('app:despeses:eliminar', { id })
  },
  deutes: {
    obtener: () => ipcRenderer.invoke('app:deutes:obtener'),
    guardar: (datos) => ipcRenderer.invoke('app:deutes:guardar', datos),
    eliminar: (id) => ipcRenderer.invoke('app:deutes:eliminar', { id })
  },

  // Dominio: Inventario
  inventario: {
    obtenerArticulos: () => ipcRenderer.invoke('app:inventario:obtenerArticulos'),
    crearArticulo: (referencia, nombre, categoria) => ipcRenderer.invoke('app:inventario:crearArticulo', { referencia, nombre, categoria }),
    eliminarArticulo: (id) => ipcRenderer.invoke('app:inventario:eliminarArticulo', { id }),
    obtenerAlmacenes: () => ipcRenderer.invoke('app:inventario:obtenerAlmacenes'),
    crearAlmacen: (nombre) => ipcRenderer.invoke('app:inventario:crearAlmacen', { nombre }),
    obtenerStockGlobal: () => ipcRenderer.invoke('app:inventario:obtenerStockGlobal'),
    crearStock: (articulo_id, almacen_id) => ipcRenderer.invoke('app:inventario:crearStock', { articulo_id, almacen_id }),
    borrarStock: (id) => ipcRenderer.invoke('app:inventario:borrarStock', { id }),
    actualizarStock: (existenciaId, nuevoStock, expectedVersion) => ipcRenderer.invoke('app:inventario:actualizarStock', { existenciaId, nuevoStock, expectedVersion }),
    obtenerComandas: () => ipcRenderer.invoke('app:inventario:obtenerComandas'),
    crearComanda: (comanda) => ipcRenderer.invoke('app:inventario:crearComanda', comanda),
    actualizarComanda: (id, estat, rec) => ipcRenderer.invoke('app:inventario:actualizarComanda', { id, estat, rec }),
    borrarComanda: (id) => ipcRenderer.invoke('app:inventario:borrarComanda', { id }),
    obtenerRelacional: () => ipcRenderer.invoke('get-inventari-relacional'),
    guardarRelacional: (datos) => ipcRenderer.invoke('save-inventari-relacional', datos),
    eliminarRelacional: (id) => ipcRenderer.invoke('delete-inventari-relacional', { id })
  },

  // Dominio: Comerciales
  comerciales: {
    obtener: () => ipcRenderer.invoke('app:comerciales:obtener'),
    guardar: (datos) => ipcRenderer.invoke('app:comerciales:guardar', datos),
    actualizar: (datos, expectedVersion) => ipcRenderer.invoke('app:comerciales:actualizar', { datos, expectedVersion }),
    eliminar: (id) => ipcRenderer.invoke('app:comerciales:eliminar', { id })
  },

  // Dominio: Maestros, Empleados, Aparcamientos, Sociedades, Contratos y Reglas
  maestros: {
    obtenerEmpleados: () => ipcRenderer.invoke('app:maestros:obtenerEmpleados'),
    obtenerTrabajadores: () => ipcRenderer.invoke('app:maestros:obtenerTrabajadores'),
    obtenerAparcamientos: () => ipcRenderer.invoke('app:maestros:obtenerAparcamientos'),
    obtenerReglas: () => ipcRenderer.invoke('app:maestros:obtenerReglas'),
    actualizarRegla: (clave, value) => ipcRenderer.invoke('app:regles:actualizar', { clave, value }),
    importarEmpleados: (datos, modo) => ipcRenderer.invoke('importar-empleados-maestros', datos, modo),
    importarAparcamientos: (datos, modo) => ipcRenderer.invoke('importar-aparcamientos-maestros', datos, modo)
  },
  sociedades: {
    obtener: () => ipcRenderer.invoke('get-sociedades'),
    guardar: (datos) => ipcRenderer.invoke('add-sociedad', datos),
    actualizar: (id, datos) => ipcRenderer.invoke('update-sociedad', id, datos),
    desactivar: (id) => ipcRenderer.invoke('deactivate-sociedad', id)
  },
  contratos: {
    obtener: (agenteId) => ipcRenderer.invoke('get-contratos-agente', agenteId),
    guardar: (datos) => ipcRenderer.invoke('add-contrato-agente', datos),
    cerrar: (contratoId) => ipcRenderer.invoke('cerrar-contrato-agente', contratoId)
  },
  coordinadores: {
    obtener: () => ipcRenderer.invoke('get-coordinadores'),
    agregar: (nombre, apellido, zona) => ipcRenderer.invoke('add-coordinador', nombre, apellido, zona),
    eliminar: (id) => ipcRenderer.invoke('remove-coordinador', id)
  },
  aparcamientos: {
    obtener: () => ipcRenderer.invoke('get-aparcamientos'),
    guardar: (aparcamientos) => ipcRenderer.invoke('save-aparcamientos', aparcamientos),
    renombrar: (oldName, newName) => ipcRenderer.invoke('rename-aparcamiento', oldName, newName),
    obtenerRelacional: () => ipcRenderer.invoke('get-aparcamientos-relacional'),
    actualizarRelacional: (id, datos) => ipcRenderer.invoke('update-aparcamiento-relacional', id, datos),
    obtenerHistorico: (id) => ipcRenderer.invoke('get-historico-aparcamiento', id)
  },
  migracion: {
    importJsonData: (coordFolder, fileName, jsonContent) => ipcRenderer.invoke('import-json-data', coordFolder, fileName, jsonContent),
    migrarJsonCuadrante: (dataJSON) => ipcRenderer.invoke('migrar-json-cuadrante', { dataJSON }),
    migrarJsonDeutes: (dataJSON) => ipcRenderer.invoke('migrar-json-deutes', { dataJSON }),
    migrarJsonComercials: (dataJSON) => ipcRenderer.invoke('migrar-json-comercials', { dataJSON }),
    migrarJsonVacaciones: (dataJSON) => ipcRenderer.invoke('migrar-json-vacaciones', { dataJSON }),
    seleccionarArchivos: () => ipcRenderer.invoke('seleccionar-archivos-migracion'),
    crearBackup: (tipo) => ipcRenderer.invoke('crear-backup-migracion', { tipo })
  }
});

contextBridge.exposeInMainWorld('configAPI', {
  validateNetworkPath: (testPath) => ipcRenderer.invoke('validate-network-path', testPath),
  updateSystemConfig: (newPath) => ipcRenderer.invoke('update-system-config', newPath)
});
