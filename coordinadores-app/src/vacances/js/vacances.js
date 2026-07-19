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
                const rows = await window.AppServices.Maestros.obtenerTrabajadores();
                this.listaAgentes = rows.map(r => r.nombre);
            } catch (err) {
                console.error("Error al cargar agentes:", err);
            }
        },

        async cargarIncidencias() {
            try {
                this.incidencias = await window.AppServices.Operativa.obtenerIncidenciasVacaciones();
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

            try {
                await window.AppServices.Operativa.guardarIncidencia({
                    id_trabajador: this.nuevaSolicitud.agente,
                    fecha_inicio: this.nuevaSolicitud.fecha_inicio,
                    fecha_fin: this.nuevaSolicitud.fecha_fin || null,
                    tipo_incidencia: 'Vacaciones',
                    impacto_horas: 0,
                    coordinador: this.usuarioActual,
                    estado: this.nuevaSolicitud.estado,
                    comentarios: this.nuevaSolicitud.comentarios.trim()
                });
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
                await window.AppServices.Operativa.cambiarEstadoIncidencia(id, nuevoEstado);
                await this.cargarIncidencias();
            } catch (err) {
                console.error("Error al cambiar estado:", err);
                alert("❌ Error al cambiar el estado.");
            }
        },

        async eliminarSolicitud(id) {
            if (!confirm("¿Estás seguro de que deseas eliminar esta solicitud de vacaciones?")) return;
            try {
                await window.AppServices.Operativa.eliminarIncidencia(id);
                await this.cargarIncidencias();
            } catch (err) {
                console.error("Error al eliminar solicitud:", err);
                alert("❌ Error al eliminar la solicitud.");
            }
        },

        getTranslatedIncidencia(tipo) {
            return window.DbLanguageMap ? window.DbLanguageMap.translate(tipo, 'incidencia', window.i18n ? window.i18n.getLanguage() : 'ca') : tipo;
        }
    }));
});
