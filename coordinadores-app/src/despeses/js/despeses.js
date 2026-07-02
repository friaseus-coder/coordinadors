document.addEventListener('alpine:init', () => {
    Alpine.data('moduloGastos', () => ({
        listaGastos: [],
        nuevoGasto: { concepto: '', importe: 0 },

        async init() {
            await this.cargarGastos();
        },

        async cargarGastos() {
            // Usa la API existente para leer de finanzas_inventario.db
            const query = "SELECT * FROM movimientos_economicos WHERE tipo_movimiento = 'Gasto' ORDER BY fecha DESC";
            try {
                this.listaGastos = await window.dbAPI.read('finanzas', query, []);
            } catch (err) {
                console.error("Error al cargar gastos:", err);
            }
        },

        async guardarGasto() {
            if (!this.nuevoGasto.concepto || this.nuevoGasto.importe <= 0) {
                return alert("Datos inválidos");
            }

            const query = "INSERT INTO movimientos_economicos (id_usuario, fecha, tipo_movimiento, concepto, importe) VALUES (?, date('now'), 'Gasto', ?, ?)";
            const params = [
                sessionStorage.getItem('user') || sessionStorage.getItem('userName') || 'Sistema', 
                this.nuevoGasto.concepto, 
                this.nuevoGasto.importe
            ];

            try {
                await window.dbAPI.write('finanzas', query, params);
                // Limpiar formulario y recargar datos automáticamente
                this.nuevoGasto.concepto = '';
                this.nuevoGasto.importe = 0;
                await this.cargarGastos();
            } catch (err) {
                console.error("Error al guardar gasto:", err);
                alert("Error al guardar el gasto");
            }
        }
    }));
});
