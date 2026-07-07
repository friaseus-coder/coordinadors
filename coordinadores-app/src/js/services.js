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
