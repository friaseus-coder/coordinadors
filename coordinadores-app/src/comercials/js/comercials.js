document.addEventListener('alpine:init', () => {
    Alpine.data('moduloComerciales', () => ({
        comerciales: [],
        busqueda: '',
        nuevaTarifa: {
            aparcamiento: '',
            vacantes: '',
            tarifa: '',
            observaciones: ''
        },
        showFormNueva: false,
        usuarioActual: sessionStorage.getItem('userName') || 'Albert',
        userRole: sessionStorage.getItem('userRole') || 'coordinador',

        async init() {
            await this.cargarComerciales();
        },

        normalizeName(name) {
            if (!name) return "";
            return name.toUpperCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .replace(/^(N\.N\.|N\.N|NN|N\.|NUÑEZ|NURIA)\s*/i, "")
                .replace(/[-\.\(\)\s]/g, "")
                .trim();
        },

        async cargarComerciales() {
            try {
                // Cargar todas las tarifas comerciales de la BD
                const rows = await window.dbAPI.read('comercial', "SELECT * FROM tarifas_comerciales ORDER BY aparcamiento ASC", []);
                
                // Cargar aparcamientos oficiales de catálogos
                let oficiales = [];
                try {
                    oficiales = await window.dbAPI.read('catalogos', "SELECT nombre FROM aparcamientos WHERE activo = 1", []);
                } catch (catErr) {
                    console.error("Error al cargar catálogos de aparcamientos:", catErr);
                }

                this.comerciales = rows.map(r => {
                    const rawName = (r.aparcamiento || '').trim();
                    const normInput = this.normalizeName(rawName);
                    let matchedName = rawName;

                    if (normInput && oficiales.length > 0) {
                        // 1. Coincidencia exacta normalizada
                        let found = oficiales.find(o => this.normalizeName(o.nombre) === normInput);
                        
                        // 2. Coincidencia startsWith/includes normalizada
                        if (!found) {
                            found = oficiales.find(o => {
                                const normO = this.normalizeName(o.nombre);
                                return normO.startsWith(normInput) || normInput.startsWith(normO);
                            });
                        }
                        
                        // 3. Primeras 5 letras
                        if (!found) {
                            found = oficiales.find(o => {
                                const normO = this.normalizeName(o.nombre);
                                return normO.substring(0, 5) === normInput.substring(0, 5);
                            });
                        }
                        
                        if (found) {
                            matchedName = found.nombre;
                        }
                    }

                    return {
                        ...r,
                        aparcamiento: matchedName,
                        editing: false
                    };
                });
            } catch (err) {
                console.error("Error al cargar comerciales:", err);
            }
        },

        get comercialesFiltrados() {
            const query = this.busqueda.trim().toUpperCase();
            if (!query) return this.comerciales;
            return this.comerciales.filter(c => 
                (c.aparcamiento || '').toUpperCase().includes(query) ||
                (c.observaciones || '').toUpperCase().includes(query) ||
                (String(c.tarifa) || '').toUpperCase().includes(query)
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
            if (!this.nuevaTarifa.aparcamiento.trim()) {
                alert("Por favor, introduce el nombre del aparcamiento.");
                return;
            }
            
            const mes = new Date().getMonth() + 1;
            const anio = new Date().getFullYear();

            const query = `
                INSERT INTO tarifas_comerciales (coordinador, mes, anio, aparcamiento, vacantes, tarifa, observaciones)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            const params = [
                this.usuarioActual,
                mes,
                anio,
                this.nuevaTarifa.aparcamiento.trim().toUpperCase(),
                parseInt(this.nuevaTarifa.vacantes) || 0,
                parseFloat(this.nuevaTarifa.tarifa) || 0,
                this.nuevaTarifa.observaciones.trim()
            ];

            try {
                await window.dbAPI.write('comercial', query, params);
                this.nuevaTarifa = {
                    aparcamiento: '',
                    vacantes: '',
                    tarifa: '',
                    observaciones: ''
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
                    UPDATE tarifas_comerciales 
                    SET aparcamiento = ?, vacantes = ?, tarifa = ?, observaciones = ? 
                    WHERE id = ?
                `;
                const params = [
                    c.aparcamiento.toUpperCase(),
                    parseInt(c.vacantes) || 0,
                    parseFloat(c.tarifa) || 0,
                    c.observaciones,
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
                await window.dbAPI.write('comercial', "DELETE FROM tarifas_comerciales WHERE id = ?", [id]);
                await this.cargarComerciales();
            } catch (err) {
                console.error("Error al eliminar comercial:", err);
                alert("❌ Error al eliminar el registro.");
            }
        }
    }));
});
