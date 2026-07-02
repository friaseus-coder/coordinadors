document.addEventListener('alpine:init', () => {
    Alpine.data('moduloVacaciones', () => ({
        listaAgentes: [],
        incidencias: [],
        nuevaSolicitud: {
            agente: '',
            fecha_inicio: '',
            fecha_fin: '',
            estado: 'Aprobado',
            comentarios: ''
        },
        filtros: {
            anio: '2026',
            agente: 'ALL',
            estado: 'ALL'
        },
        usuarioActual: sessionStorage.getItem('userName') || 'Coordinador',
        userRole: sessionStorage.getItem('userRole') || 'coordinador',

        async init() {
            await this.cargarCatalogos();
            await this.cargarIncidencias();
        },

        async cargarCatalogos() {
            try {
                const rows = await window.dbAPI.read('catalogos', "SELECT nombre FROM agentes WHERE activo = 1 ORDER BY nombre ASC", []);
                this.listaAgentes = rows.map(r => r.nombre);
            } catch (err) {
                console.error("Error al cargar agentes:", err);
            }
        },

        async cargarIncidencias() {
            try {
                const query = `
                    SELECT * FROM incidencias_horarias 
                    WHERE tipo_incidencia = 'Vacaciones'
                    ORDER BY fecha_inicio DESC
                `;
                const rows = await window.dbAPI.read('operativa', query, []);
                this.incidencias = rows;
            } catch (err) {
                console.error("Error al cargar incidencias:", err);
            }
        },

        get incidenciasFiltradas() {
            return this.incidencias.filter(inc => {
                const coincideAnio = !this.filtros.anio || inc.fecha_inicio.startsWith(this.filtros.anio);
                const coincideAgente = this.filtros.agente === 'ALL' || inc.id_trabajador === this.filtros.agente;
                const coincideEstado = this.filtros.estado === 'ALL' || inc.estado === this.filtros.estado;
                return coincideAnio && coincideAgente && coincideEstado;
            });
        },

        async registrarSolicitud() {
            if (!this.nuevaSolicitud.agente) {
                alert("Por favor, selecciona un trabajador.");
                return;
            }
            if (!this.nuevaSolicitud.fecha_inicio) {
                alert("Por favor, introduce la fecha de inicio.");
                return;
            }

            const query = `
                INSERT INTO incidencias_horarias (id_trabajador, fecha_inicio, fecha_fin, tipo_incidencia, impacto_horas, coordinador, estado, comentarios)
                VALUES (?, ?, ?, 'Vacaciones', 0, ?, ?, ?)
            `;
            const params = [
                this.nuevaSolicitud.agente,
                this.nuevaSolicitud.fecha_inicio,
                this.nuevaSolicitud.fecha_fin || null,
                this.usuarioActual,
                this.nuevaSolicitud.estado,
                this.nuevaSolicitud.comentarios.trim()
            ];

            try {
                await window.dbAPI.write('operativa', query, params);
                // Limpiar formulario
                this.nuevaSolicitud.agente = '';
                this.nuevaSolicitud.fecha_inicio = '';
                this.nuevaSolicitud.fecha_fin = '';
                this.nuevaSolicitud.comentarios = '';
                await this.cargarIncidencias();
                alert("✅ Vacaciones registradas correctamente.");
            } catch (err) {
                console.error("Error al guardar vacaciones:", err);
                alert("❌ Error al guardar las vacaciones.");
            }
        },

        async cambiarEstado(id, nuevoEstado) {
            try {
                await window.dbAPI.write('operativa', "UPDATE incidencias_horarias SET estado = ? WHERE id = ?", [nuevoEstado, id]);
                await this.cargarIncidencias();
            } catch (err) {
                console.error("Error al cambiar estado:", err);
                alert("❌ Error al cambiar el estado.");
            }
        },

        async eliminarSolicitud(id) {
            if (!confirm("¿Estás seguro de que deseas eliminar esta solicitud de vacaciones?")) return;
            try {
                await window.dbAPI.write('operativa', "DELETE FROM incidencias_horarias WHERE id = ?", [id]);
                await this.cargarIncidencias();
            } catch (err) {
                console.error("Error al eliminar solicitud:", err);
                alert("❌ Error al eliminar la solicitud.");
            }
        }
    }));
});
