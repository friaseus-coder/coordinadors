document.addEventListener('alpine:init', () => {
    Alpine.data('moduloComerciales', () => ({
        comerciales: [],
        busqueda: '',
        nuevaTarifa: {
            nombre: '',
            direccion: '',
            plantas: '',
            capacidad: '',
            plazas_libres: '',
            tarifa: '',
            notas: ''
        },
        showFormNueva: false,
        usuarioActual: sessionStorage.getItem('userName') || 'Albert',
        userRole: sessionStorage.getItem('userRole') || 'coordinador',

        async init() {
            await this.cargarComerciales();
        },

        async cargarComerciales() {
            try {
                const rows = await window.dbAPI.read('comercial', "SELECT * FROM comerciales ORDER BY nombre ASC", []);
                this.comerciales = rows.map(r => ({
                    ...r,
                    editing: false
                }));
            } catch (err) {
                console.error("Error al cargar comerciales:", err);
            }
        },

        get comercialesFiltrados() {
            const query = this.busqueda.trim().toUpperCase();
            if (!query) return this.comerciales;
            return this.comerciales.filter(c => 
                (c.nombre || '').toUpperCase().includes(query) ||
                (c.direccion || '').toUpperCase().includes(query) ||
                (c.notas || '').toUpperCase().includes(query) ||
                (c.tarifa || '').toUpperCase().includes(query)
            );
        },

        canEdit() {
            return this.userRole === 'jefe operaciones' || this.userRole === 'coordinador';
        },

        getColorDP(valor) {
            const n = parseInt(valor);
            if (isNaN(n)) return "";
            if (n <= 10) return "text-emerald-700 font-bold"; 
            if (n <= 25) return "text-blue-700 font-bold"; 
            return "text-rose-700 font-bold"; 
        },

        async agregarComercial() {
            if (!this.nuevaTarifa.nombre.trim()) {
                alert("Por favor, introduce el nombre del aparcamiento.");
                return;
            }

            const query = `
                INSERT INTO comerciales (nombre, direccion, plantas, capacidad, plazas_libres, tarifa, notas)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            const params = [
                this.nuevaTarifa.nombre.trim().toUpperCase(),
                this.nuevaTarifa.direccion.trim(),
                this.nuevaTarifa.plantas.trim(),
                this.nuevaTarifa.capacidad.trim(),
                this.nuevaTarifa.plazas_libres.trim(),
                this.nuevaTarifa.tarifa.trim(),
                this.nuevaTarifa.notas.trim()
            ];

            try {
                await window.dbAPI.write('comercial', query, params);
                this.nuevaTarifa = {
                    nombre: '',
                    direccion: '',
                    plantas: '',
                    capacidad: '',
                    plazas_libres: '',
                    tarifa: '',
                    notas: ''
                };
                this.showFormNueva = false;
                await this.cargarComerciales();
                alert("✅ Tarifa comercial añadida correctamente.");
            } catch (err) {
                console.error("Error al agregar comercial:", err);
                alert("❌ Error al guardar el comercial.");
            }
        },

        async guardarEdicion(c) {
            try {
                const query = `
                    UPDATE comerciales 
                    SET nombre = ?, direccion = ?, plantas = ?, capacidad = ?, plazas_libres = ?, tarifa = ?, notas = ? 
                    WHERE id = ?
                `;
                const params = [
                    c.nombre.toUpperCase(),
                    c.direccion,
                    c.plantas,
                    c.capacidad,
                    c.plazas_libres,
                    c.tarifa,
                    c.notas,
                    c.id
                ];
                await window.dbAPI.write('comercial', query, params);
                c.editing = false;
                await this.cargarComerciales();
            } catch (err) {
                console.error("Error al guardar edición:", err);
                alert("❌ Error al guardar los cambios.");
            }
        },

        async eliminarComercial(id) {
            if (!confirm("¿Estás seguro de que deseas eliminar este registro de comercial?")) return;
            try {
                await window.dbAPI.write('comercial', "DELETE FROM comerciales WHERE id = ?", [id]);
                await this.cargarComerciales();
            } catch (err) {
                console.error("Error al eliminar comercial:", err);
                alert("❌ Error al eliminar el registro.");
            }
        }
    }));
});
