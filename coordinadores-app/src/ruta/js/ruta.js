document.addEventListener('alpine:init', () => {
    Alpine.data('moduloRutas', () => ({
        rutas: [],
        listaParkings: [],
        nuevaRuta: {
            fecha: new Date().toISOString().split('T')[0],
            concepto: '',
            paradas: ['']
        },
        usuarioActual: sessionStorage.getItem('userName') || 'Coordinador',
        userRole: sessionStorage.getItem('userRole') || 'coordinador',

        async init() {
            await this.cargarCatalogos();
            await this.cargarRutas();
        },

        async cargarCatalogos() {
            try {
                // Podemos usar 'finanzas' o 'operativa' (catalogos está adjunto en ambos, o 'catalogos' directamente)
                const rows = await window.dbAPI.read('catalogos', "SELECT nombre FROM aparcamientos WHERE activo = 1 ORDER BY nombre ASC", []);
                this.listaParkings = rows.map(r => r.nombre);
            } catch (err) {
                console.error("Error al cargar aparcamientos:", err);
            }
        },

        async cargarRutas() {
            try {
                const query = "SELECT * FROM movimientos_economicos WHERE tipo_movimiento = 'Ruta Comercial' ORDER BY fecha DESC";
                const rows = await window.dbAPI.read('finanzas', query, []);
                this.rutas = rows.map(r => {
                    let paradas = [];
                    try {
                        const detalles = JSON.parse(r.json_detalles);
                        paradas = detalles.paradas || [];
                    } catch (e) {
                        // Fallback si no es JSON válido
                        if (r.json_detalles) {
                            paradas = [r.json_detalles];
                        }
                    }
                    return {
                        ...r,
                        paradas
                    };
                });
            } catch (err) {
                console.error("Error al cargar rutas:", err);
            }
        },

        agregarParada() {
            this.nuevaRuta.paradas.push('');
        },

        eliminarParada(index) {
            if (this.nuevaRuta.paradas.length > 1) {
                this.nuevaRuta.paradas.splice(index, 1);
            } else {
                this.nuevaRuta.paradas[0] = '';
            }
        },

        async guardarRuta() {
            if (!this.nuevaRuta.concepto.trim()) {
                alert("Por favor, introduce un concepto para la ruta.");
                return;
            }

            const paradasFiltradas = this.nuevaRuta.paradas.filter(p => p.trim() !== '');
            if (paradasFiltradas.length === 0) {
                alert("Por favor, añade al menos una parada.");
                return;
            }

            const jsonDetalles = JSON.stringify({ paradas: paradasFiltradas });
            const query = `
                INSERT INTO movimientos_economicos (id_usuario, fecha, tipo_movimiento, concepto, importe, json_detalles)
                VALUES (?, ?, 'Ruta Comercial', ?, 0, ?)
            `;
            const params = [
                this.usuarioActual,
                this.nuevaRuta.fecha,
                this.nuevaRuta.concepto.trim(),
                jsonDetalles
            ];

            try {
                await window.dbAPI.write('finanzas', query, params);
                // Limpiar formulario
                this.nuevaRuta.concepto = '';
                this.nuevaRuta.paradas = [''];
                await this.cargarRutas();
                alert("✅ Ruta guardada correctamente.");
            } catch (err) {
                console.error("Error al guardar ruta:", err);
                alert("❌ Error al guardar la ruta.");
            }
        },

        async eliminarRuta(id) {
            if (!confirm("¿Estás seguro de que deseas eliminar esta ruta comercial?")) return;
            try {
                await window.dbAPI.write('finanzas', "DELETE FROM movimientos_economicos WHERE id = ?", [id]);
                await this.cargarRutas();
            } catch (err) {
                console.error("Error al eliminar ruta:", err);
                alert("❌ Error al eliminar la ruta.");
            }
        }
    }));
});
