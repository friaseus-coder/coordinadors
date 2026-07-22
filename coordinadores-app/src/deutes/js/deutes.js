document.addEventListener('alpine:init', () => {
    Alpine.data('moduloDeudas', () => ({
        listaAgentes: [],
        incidencias: [],
        nuevaIncidencia: {
            agente: '',
            fecha: new Date().toISOString().split('T')[0],
            tipo: 'Bolsa Horas (+)',
            horas: 0,
            comentarios: ''
        },
        filtros: {
            agente: 'ALL',
            tipo: 'ALL'
        },
        usuarioActual: sessionStorage.getItem('userName') || 'Coordinador',
        userRole: sessionStorage.getItem('userRole') || 'coordinador',

        async init() {
            if (window.api && window.api.setSession) {
                window.api.setSession(this.usuarioActual, this.userRole);
            }
            await this.cargarCatalogos();
            await this.cargarIncidencias();

            if (window.api && window.api.onDataChanged) {
                window.api.onDataChanged((event) => {
                    if (event && (event.dbKey === 'operativa' || event.dbKey === 'finanzas' || event.table === 'incidencias_horarias' || event.table === 'deutes')) {
                        this.cargarIncidencias();
                    }
                });
            }
        },

        async cargarCatalogos() {
            try {
                if (window.api && window.api.maestros) {
                    const rows = await window.api.maestros.obtenerTrabajadores();
                    this.listaAgentes = (rows || []).map(r => r.nombre || r);
                }
            } catch (err) {
                console.error("Error al cargar agentes:", err);
            }
        },

        async cargarIncidencias() {
            try {
                if (window.api && window.api.deutes) {
                    const rows = await window.api.deutes.obtener();
                    this.incidencias = rows || [];
                }
            } catch (err) {
                console.error("Error al cargar incidencias:", err);
            }
        },

        get balances() {
            const map = {};
            this.listaAgentes.forEach(name => {
                map[name] = 0;
            });
            this.incidencias.forEach(inc => {
                const worker = inc.id_trabajador || inc.comercial;
                if (map[worker] === undefined) {
                    map[worker] = 0;
                }
                const hrs = Math.abs(parseFloat(inc.impacto_horas || inc.import || 0));
                if (inc.tipo_incidencia === 'Bolsa Horas (+)') {
                    map[worker] += hrs;
                } else if (inc.tipo_incidencia === 'Deuda Horas (-)') {
                    map[worker] -= hrs;
                }
            });
            return map;
        },

        get incidenciasFiltradas() {
            return this.incidencias.filter(inc => {
                const worker = inc.id_trabajador || inc.comercial;
                const coincideAgente = this.filtros.agente === 'ALL' || worker === this.filtros.agente;
                const coincideTipo = this.filtros.tipo === 'ALL' || inc.tipo_incidencia === this.filtros.tipo;
                return coincideAgente && coincideTipo;
            });
        },

        async registrarIncidencia() {
            if (!this.nuevaIncidencia.agente) {
                alert("Por favor, selecciona un trabajador.");
                return;
            }
            if (this.nuevaIncidencia.horas <= 0) {
                alert("Por favor, introduce un número de horas mayor que 0.");
                return;
            }

            const datos = {
                id_trabajador: this.nuevaIncidencia.agente,
                fecha_inicio: this.nuevaIncidencia.fecha,
                tipo_incidencia: this.nuevaIncidencia.tipo,
                impacto_horas: this.nuevaIncidencia.horas,
                coordinador: this.usuarioActual,
                estado: 'Aprobado',
                comentarios: this.nuevaIncidencia.comentarios.trim()
            };

            try {
                if (window.api && window.api.incidencias) {
                    await window.api.incidencias.guardar(datos);
                }
                this.nuevaIncidencia.agente = '';
                this.nuevaIncidencia.horas = 0;
                this.nuevaIncidencia.comentarios = '';
                await this.cargarIncidencias();
                alert("✅ Ajuste de horas guardado correctamente.");
            } catch (err) {
                console.error("Error al registrar incidencia:", err);
                alert("❌ Error al guardar el ajuste de horas: " + err.message);
            }
        },

        getTranslatedIncidencia(tipo) {
            return window.DbLanguageMap ? window.DbLanguageMap.translate(tipo, 'incidencia', window.i18n ? window.i18n.getLanguage() : 'ca') : tipo;
        },

        async eliminarIncidencia(id) {
            if (!confirm("¿Estás seguro de que deseas eliminar este registro de horas?")) return;
            try {
                if (window.api && window.api.deutes) {
                    await window.api.deutes.eliminar(id);
                }
                await this.cargarIncidencias();
            } catch (err) {
                console.error("Error al eliminar registro:", err);
                alert("❌ Error al eliminar el registro: " + err.message);
            }
        }
    }));
});
