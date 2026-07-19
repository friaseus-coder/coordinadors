/**
 * Services Layer / Repository Pattern para la Intranet de Coordinadores.
 * Centraliza todas las consultas SQL de la aplicación para mayor mantenibilidad y limpieza.
 */

window.AppServices = {
    Operativa: {
        /**
         * Obtener cuadrantes de turnos filtrados por mes, año y opcionalmente aparcamiento.
         */
        obtenerCuadrantes: async (mes, anio, parkingId) => {
            const fechaPattern = `${anio}-${String(mes).padStart(2, '0')}-%`;
            let sql = `SELECT * FROM quadrant WHERE fecha LIKE ?`;
            const params = [fechaPattern];
            if (parkingId) {
                sql += ` AND aparcamiento_id = ?`;
                params.push(parkingId);
            }
            return await window.dbAPI.read('operativa', sql, params);
        },

        /**
         * Guardar o registrar un turno en el cuadrante.
         */
        guardarTurno: async (turno) => {
            const sql = `
                INSERT INTO quadrant (fecha, aparcamiento_id, agente_id, turno, hora_inicio, hora_fin, horas_trabajadas, es_substitucio, nota)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const params = [
                turno.fecha,
                turno.aparcamiento_id,
                turno.agente_id,
                turno.turno,
                turno.hora_inicio,
                turno.hora_fin,
                turno.horas_trabajadas || 8,
                turno.es_substitucio || 0,
                turno.nota || ''
            ];
            return await window.dbAPI.write('operativa', sql, params);
        },

        /**
         * Obtener las reglas de negocio desde la base de datos de catálogos.
         */
        obtenerReglas: async () => {
            return await window.dbAPI.read('catalogos', 'SELECT clave, value, tipo, categoria, descripcion FROM reglas_config ORDER BY clave ASC', []);
        },

        /**
         * Obtener incidencias de vacaciones registradas en el sistema.
         */
        obtenerIncidenciasVacaciones: async () => {
            const sql = `
                SELECT * FROM incidencias_horarias 
                WHERE tipo_incidencia = 'Vacaciones'
                ORDER BY fecha_inicio DESC
            `;
            return await window.dbAPI.read('operativa', sql, []);
        },

        /**
         * Registrar una nueva incidencia horaria (Vacación, baja, deuda, etc.).
         */
        guardarIncidencia: async (datos) => {
            const sql = `
                INSERT INTO incidencias_horarias (id_trabajador, fecha_inicio, fecha_fin, tipo_incidencia, impacto_horas, coordinador, estado, comentarios)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const params = [
                datos.id_trabajador,
                datos.fecha_inicio,
                datos.fecha_fin || null,
                datos.tipo_incidencia,
                datos.impacto_horas || 0,
                datos.coordinador,
                datos.estado,
                datos.comentarios
            ];
            return await window.dbAPI.write('operativa', sql, params);
        },

        /**
         * Actualizar el estado de una incidencia por su ID.
         */
        cambiarEstadoIncidencia: async (id, nuevoEstado) => {
            return await window.dbAPI.write('operativa', "UPDATE incidencias_horarias SET estado = ? WHERE id = ?", [nuevoEstado, id]);
        },

        /**
         * Eliminar físicamente una incidencia por su ID.
         */
        eliminarIncidencia: async (id) => {
            return await window.dbAPI.write('operativa', "DELETE FROM incidencias_horarias WHERE id = ?", [id]);
        }
    },

    Finanzas: {
        /**
         * Obtener los gastos de kilometraje de un usuario en un periodo específico.
         */
        obtenerGastos: async (usuario, mes, anio) => {
            const fechaPattern = `${anio}-${String(mes).padStart(2, '0')}-%`;
            let sql = `SELECT * FROM movimientos_economicos WHERE tipo_movimiento = 'Kilometraje' AND fecha LIKE ?`;
            const params = [fechaPattern];
            if (usuario) {
                sql += ` AND id_usuario = ?`;
                params.push(usuario);
            }
            return await window.dbAPI.read('finanzas', sql, params);
        },

        /**
         * Registrar un nuevo movimiento económico (kilometraje, rutas, compras).
         */
        guardarMovimiento: async (datos) => {
            const sql = `
                INSERT INTO movimientos_economicos (id_usuario, fecha, tipo_movimiento, concepto, importe, json_detalles)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            const params = [
                datos.id_usuario,
                datos.fecha,
                datos.tipo_movimiento,
                datos.concepto,
                datos.importe,
                datos.json_detalles
            ];
            return await window.dbAPI.write('finanzas', sql, params);
        },

        Inventario: {
            /**
             * Obtener todos los artículos del catálogo.
             */
            obtenerArticulos: async () => {
                return await window.dbAPI.read('finanzas', 'SELECT * FROM inventario_articulos ORDER BY nombre ASC', []);
            },
            crearArticulo: async (referencia, nombre, categoria) => {
                const sql = `INSERT INTO inventario_articulos (referencia, nombre, categoria) VALUES (?, ?, ?)`;
                return await window.dbAPI.write('finanzas', sql, [referencia, nombre, categoria]);
            },
            eliminarArticulo: async (id) => {
                const sql = `DELETE FROM inventario_articulos WHERE id = ?`;
                return await window.dbAPI.write('finanzas', sql, [id]);
            },
            
            /**
             * Obtener todos los almacenes.
             */
            obtenerAlmacenes: async () => {
                return await window.dbAPI.read('finanzas', 'SELECT * FROM inventario_almacenes ORDER BY nombre ASC', []);
            },
            crearAlmacen: async (nombre) => {
                const sql = `INSERT INTO inventario_almacenes (nombre) VALUES (?)`;
                return await window.dbAPI.write('finanzas', sql, [nombre]);
            },

            /**
             * Obtener el stock global actual con sus versiones OCC.
             */
            obtenerStockGlobal: async () => {
                const sql = `
                    SELECT e.id, a.id as articulo_id, a.referencia as ref, a.nombre as articulo, al.nombre as magatzem, e.stock, e.version, a.categoria as cat
                    FROM inventario_existencias e
                    JOIN inventario_articulos a ON e.articulo_id = a.id
                    JOIN inventario_almacenes al ON e.almacen_id = al.id
                `;
                return await window.dbAPI.read('finanzas', sql, []);
            },
            crearStock: async (articulo_id, almacen_id) => {
                const sql = `INSERT INTO inventario_existencias (articulo_id, almacen_id, stock) VALUES (?, ?, 0)`;
                return await window.dbAPI.write('finanzas', sql, [articulo_id, almacen_id]);
            },
            borrarStock: async (id) => {
                const sql = `DELETE FROM inventario_existencias WHERE id = ?`;
                return await window.dbAPI.write('finanzas', sql, [id]);
            },

            /**
             * Actualiza el stock de un artículo con control optimista de concurrencia (OCC).
             */
            actualizarStock: async (existenciaId, nuevoStock, expectedVersion) => {
                const sql = `UPDATE inventario_existencias SET stock = ? WHERE id = ?`;
                return await window.dbAPI.write('finanzas', sql, [nuevoStock, existenciaId], expectedVersion);
            },
            
            /**
             * Comandas
             */
            obtenerComandas: async () => {
                const sql = `
                    SELECT c.id, c.data, c.centre, c.articulo_id, a.referencia as ref, c.uds, c.estat, c.rec
                    FROM inventario_comandas c
                    JOIN inventario_articulos a ON c.articulo_id = a.id
                    ORDER BY c.data DESC, c.id DESC
                `;
                return await window.dbAPI.read('finanzas', sql, []);
            },
            crearComanda: async (comanda) => {
                const sql = `INSERT INTO inventario_comandas (data, centre, articulo_id, uds, estat, rec) VALUES (?, ?, ?, ?, ?, ?)`;
                return await window.dbAPI.write('finanzas', sql, [comanda.data, comanda.centre, comanda.articulo_id, comanda.uds, comanda.estat, comanda.rec]);
            },
            actualizarComanda: async (id, estat, rec) => {
                const sql = `UPDATE inventario_comandas SET estat = ?, rec = ? WHERE id = ?`;
                return await window.dbAPI.write('finanzas', sql, [estat, rec, id]);
            },
            borrarComanda: async (id) => {
                const sql = `DELETE FROM inventario_comandas WHERE id = ?`;
                return await window.dbAPI.write('finanzas', sql, [id]);
            }
        }
    },

    Maestros: {
        /**
         * Obtener todos los empleados activos del sistema.
         */
        obtenerEmpleados: async () => {
            return await window.dbAPI.read('catalogos', 'SELECT * FROM empleados WHERE activo = 1 ORDER BY nombre ASC', []);
        },

        /**
         * Obtener los trabajadores activos que pueden cubrir cuadrantes de turnos.
         */
        obtenerTrabajadores: async () => {
            return await window.dbAPI.read('catalogos', "SELECT nombre FROM empleados WHERE activo = 1 AND rol = 'Trabajador' ORDER BY nombre ASC", []);
        },

        /**
         * Obtener el listado de aparcamientos activos del grupo.
         */
        obtenerAparcamientos: async () => {
            return await window.dbAPI.read('catalogos', "SELECT id, nombre, numero_obra, zona, sociedad_id FROM aparcamientos WHERE activo = 1 ORDER BY nombre ASC", []);
        }
    }
};
