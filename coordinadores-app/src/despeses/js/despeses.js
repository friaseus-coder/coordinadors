document.addEventListener('alpine:init', () => {
    Alpine.data('moduloGastos', () => ({
        listaGastos: [],
        nuevoGasto: { concepto: '', importe: 0 },
        userRole: sessionStorage.getItem('userRole') || 'coordinador',

        async init() {
            if (window.api && window.api.setSession) {
                window.api.setSession(sessionStorage.getItem('user') || sessionStorage.getItem('userName') || 'Sistema', this.userRole);
            }
            await this.cargarGastos();

            if (window.api && window.api.onDataChanged) {
                window.api.onDataChanged((event) => {
                    if (event && (event.dbKey === 'finanzas' || event.table === 'despeses' || event.table === 'movimientos_economicos')) {
                        this.cargarGastos();
                    }
                });
            }
        },

        async cargarGastos() {
            try {
                if (window.api && window.api.despeses) {
                    this.listaGastos = await window.api.despeses.obtener();
                }
            } catch (err) {
                console.error("Error al cargar gastos:", err);
            }
        },

        async guardarGasto() {
            if (!this.nuevoGasto.concepto || this.nuevoGasto.importe <= 0) {
                return alert("Datos inválidos");
            }

            const datos = {
                fecha: new Date().toISOString().split('T')[0],
                comercial: sessionStorage.getItem('user') || sessionStorage.getItem('userName') || 'Sistema',
                concepto: this.nuevoGasto.concepto.trim(),
                importe: parseFloat(this.nuevoGasto.importe) || 0,
                estado: 'Poblado',
                coordinador: sessionStorage.getItem('user') || sessionStorage.getItem('userName') || 'Sistema'
            };

            try {
                if (window.api && window.api.despeses) {
                    await window.api.despeses.guardar(datos);
                }
                this.nuevoGasto.concepto = '';
                this.nuevoGasto.importe = 0;
                await this.cargarGastos();
            } catch (err) {
                console.error("Error al guardar gasto:", err);
                alert("Error al guardar el gasto: " + err.message);
            }
        },

        async eliminarGasto(id) {
            if (!confirm("¿Estás seguro de que deseas eliminar este gasto?")) return;
            try {
                if (window.api && window.api.despeses) {
                    await window.api.despeses.eliminar(id);
                }
                await this.cargarGastos();
            } catch (err) {
                console.error("Error al eliminar gasto:", err);
                alert("Error al eliminar el gasto: " + err.message);
            }
        }
    }));
});
