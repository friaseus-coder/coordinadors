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
                    WHERE tipo_incidencia IN ('Deuda Horas (-)', 'Bolsa Horas (+)')
                    ORDER BY fecha_inicio DESC
                `;
                const rows = await window.dbAPI.read('operativa', query, []);
                this.incidencias = rows;
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
                const worker = inc.id_trabajador;
                if (map[worker] === undefined) {
                    map[worker] = 0;
                }
                const hrs = Math.abs(parseFloat(inc.impacto_horas || 0));
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
                const coincideAgente = this.filtros.agente === 'ALL' || inc.id_trabajador === this.filtros.agente;
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

            const query = `
                INSERT INTO incidencias_horarias (id_trabajador, fecha_inicio, tipo_incidencia, impacto_horas, coordinador, estado, comentarios)
                VALUES (?, ?, ?, ?, ?, 'Aprobado', ?)
            `;
            const params = [
                this.nuevaIncidencia.agente,
                this.nuevaIncidencia.fecha,
                this.nuevaIncidencia.tipo,
                this.nuevaIncidencia.horas,
                this.usuarioActual,
                this.nuevaIncidencia.comentarios.trim()
            ];

            try {
                await window.dbAPI.write('operativa', query, params);
                // Limpiar formulario
                this.nuevaIncidencia.agente = '';
                this.nuevaIncidencia.horas = 0;
                this.nuevaIncidencia.comentarios = '';
                await this.cargarIncidencias();
                alert("✅ Ajuste de horas guardado correctamente.");
            } catch (err) {
                console.error("Error al registrar incidencia:", err);
                alert("❌ Error al guardar el ajuste de horas.");
            }
        },

        async eliminarIncidencia(id) {
            if (!confirm("¿Estás seguro de que deseas eliminar este registro de horas?")) return;
            try {
                await window.dbAPI.write('operativa', "DELETE FROM incidencias_horarias WHERE id = ?", [id]);
                await this.cargarIncidencias();
            } catch (err) {
                console.error("Error al eliminar registro:", err);
                alert("❌ Error al eliminar el registro.");
            }
        }
    }));
});
