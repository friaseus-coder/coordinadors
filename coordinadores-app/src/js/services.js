/**
 * Services Layer / Repository Pattern para la Intranet de Coordinadores.
 * Centraliza todas las llamadas a las APIs IPC de dominio de window.api.
 */

window.AppServices = {
    Operativa: {
        /**
         * Obtener cuadrantes de turnos filtrados por mes, año y opcionalmente aparcamiento.
         */
        obtenerCuadrantes: async (mes, anio, parkingId) => {
            return await window.api.cuadrante.obtenerCuadrantes(mes, anio, parkingId);
        },

        /**
         * Guardar o registrar un turno en el cuadrante.
         */
        guardarTurno: async (turno) => {
            return await window.api.cuadrante.guardarTurno(turno);
        },

        /**
         * Obtener las reglas de negocio desde la base de datos de catálogos.
         */
        obtenerReglas: async () => {
            return await window.api.maestros.obtenerReglas();
        },

        /**
         * Obtener incidencias de vacaciones registradas en el sistema.
         */
        obtenerIncidenciasVacaciones: async () => {
            return await window.api.incidencias.obtenerVacaciones();
        },

        /**
         * Registrar una nueva incidencia horaria (Vacación, baja, deuda, etc.).
         */
        guardarIncidencia: async (datos) => {
            return await window.api.incidencias.guardar(datos);
        },

        /**
         * Actualizar el estado de una incidencia por su ID.
         */
        cambiarEstadoIncidencia: async (id, nuevoEstado) => {
            return await window.api.incidencias.cambiarEstado(id, nuevoEstado);
        },

        /**
         * Eliminar físicamente una incidencia por su ID.
         */
        eliminarIncidencia: async (id) => {
            return await window.api.incidencias.eliminar(id);
        }
    },

    Finanzas: {
        /**
         * Obtener los gastos de kilometraje de un usuario en un periodo específico.
         */
        obtenerGastos: async (usuario, mes, anio) => {
            return await window.api.finanzas.obtenerGastos(usuario, mes, anio);
        },

        /**
         * Registrar un nuevo movimiento económico (kilometraje, rutas, compras).
         */
        guardarMovimiento: async (datos) => {
            return await window.api.finanzas.guardarMovimiento(datos);
        },

        Inventario: {
            /**
             * Obtener todos los artículos del catálogo.
             */
            obtenerArticulos: async () => {
                return await window.api.inventario.obtenerArticulos();
            },
            crearArticulo: async (referencia, nombre, categoria) => {
                return await window.api.inventario.crearArticulo(referencia, nombre, categoria);
            },
            eliminarArticulo: async (id) => {
                return await window.api.inventario.eliminarArticulo(id);
            },
            
            /**
             * Obtener todos los almacenes.
             */
            obtenerAlmacenes: async () => {
                return await window.api.inventario.obtenerAlmacenes();
            },
            crearAlmacen: async (nombre) => {
                return await window.api.inventario.crearAlmacen(nombre);
            },

            /**
             * Obtener el stock global actual con sus versiones OCC.
             */
            obtenerStockGlobal: async () => {
                return await window.api.inventario.obtenerStockGlobal();
            },
            crearStock: async (articulo_id, almacen_id) => {
                return await window.api.inventario.crearStock(articulo_id, almacen_id);
            },
            borrarStock: async (id) => {
                return await window.api.inventario.borrarStock(id);
            },

            /**
             * Actualiza el stock de un artículo con control optimista de concurrencia (OCC).
             */
            actualizarStock: async (existenciaId, nuevoStock, expectedVersion) => {
                return await window.api.inventario.actualizarStock(existenciaId, nuevoStock, expectedVersion);
            },
            
            /**
             * Comandas
             */
            obtenerComandas: async () => {
                return await window.api.inventario.obtenerComandas();
            },
            crearComanda: async (comanda) => {
                return await window.api.inventario.crearComanda(comanda);
            },
            actualizarComanda: async (id, estat, rec) => {
                return await window.api.inventario.actualizarComanda(id, estat, rec);
            },
            borrarComanda: async (id) => {
                return await window.api.inventario.borrarComanda(id);
            }
        }
    },

    Maestros: {
        /**
         * Obtener todos los empleados activos del sistema.
         */
        obtenerEmpleados: async () => {
            return await window.api.maestros.obtenerEmpleados();
        },

        /**
         * Obtener los trabajadores activos que pueden cubrir cuadrantes de turnos.
         */
        obtenerTrabajadores: async () => {
            return await window.api.maestros.obtenerTrabajadores();
        },

        /**
         * Obtener el listado de aparcamientos activos del grupo.
         */
        obtenerAparcamientos: async () => {
            return await window.api.maestros.obtenerAparcamientos();
        }
    }
};
