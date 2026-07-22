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
            if (window.api && window.api.setSession) {
                window.api.setSession(this.usuarioActual, this.userRole);
            }
            await this.cargarComerciales();

            // Suscribirse a cambios en tiempo real desde otras terminales
            if (window.api && window.api.onDataChanged) {
                window.api.onDataChanged((event) => {
                    if (event && (event.dbKey === 'comercial' || event.table === 'comerciales' || event.table === 'tarifas_comerciales')) {
                        console.log('[COMERCIALES UI] Cambio en tiempo real detectado, recargando datos...');
                        this.cargarComerciales();
                    }
                });
            }
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
                let rows = [];
                if (window.api && window.api.comerciales) {
                    rows = await window.api.comerciales.obtener();
                }

                let oficiales = [];
                try {
                    if (window.api && window.api.maestros) {
                        oficiales = await window.api.maestros.obtenerAparcamientos();
                    }
                } catch (catErr) {
                    console.error("Error al cargar catálogos de aparcamientos:", catErr);
                }

                this.comerciales = (rows || []).map(r => {
                    const rawName = (r.aparcamiento || r.nombre || '').trim();
                    const normInput = this.normalizeName(rawName);
                    let matchedName = rawName;

                    if (normInput && oficiales.length > 0) {
                        let found = oficiales.find(o => this.normalizeName(o.nombre) === normInput);
                        if (!found) {
                            found = oficiales.find(o => {
                                const normO = this.normalizeName(o.nombre);
                                return normO.startsWith(normInput) || normInput.startsWith(normO);
                            });
                        }
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
                (c.aparcamiento || c.nombre || '').toUpperCase().includes(query) ||
                (c.observaciones || c.notas || '').toUpperCase().includes(query) ||
                (String(c.tarifa) || '').toUpperCase().includes(query)
            );
        },

        canEdit() {
            return this.userRole === 'jefe operaciones' || this.userRole === 'coordinador' || this.userRole === 'admin';
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

            const datos = {
                nombre: this.nuevaTarifa.aparcamiento.trim().toUpperCase(),
                direccion: '',
                plantas: '',
                capacidad: '',
                plazas_libres: String(this.nuevaTarifa.vacantes || 0),
                tarifa: String(this.nuevaTarifa.tarifa || 0),
                notas: this.nuevaTarifa.observaciones.trim()
            };

            try {
                const res = await window.api.comerciales.guardar(datos);
                if (res && res.code === 'OCC_CONFLICT') {
                    alert("⚠️ Conflicto OCC: Registro modificado previamente. Se actualizarán los datos.");
                    await this.cargarComerciales();
                    return;
                }
                this.nuevaTarifa = { aparcamiento: '', vacantes: '', tarifa: '', observaciones: '' };
                this.showFormNueva = false;
                await this.cargarComerciales();
                alert("✅ Tarifa comercial añadida correctamente.");
            } catch (err) {
                console.error("Error al agregar comercial:", err);
                alert("❌ Error al guardar el comercial: " + err.message);
            }
        },

        async guardarEdicion(c) {
            try {
                const datos = {
                    id: c.id,
                    nombre: (c.aparcamiento || c.nombre).toUpperCase(),
                    direccion: c.direccion || '',
                    plantas: c.plantas || '',
                    capacidad: c.capacidad || '',
                    plazas_libres: String(c.vacantes || c.plazas_libres || 0),
                    tarifa: String(c.tarifa || 0),
                    notas: c.observaciones || c.notas || ''
                };

                const res = await window.api.comerciales.actualizar(datos, c.version || 1);
                if (res && res.code === 'OCC_CONFLICT') {
                    alert("⚠️ Conflicto OCC: El registro fue modificado por otro usuario. Refrescando datos...");
                    c.editing = false;
                    await this.cargarComerciales();
                    return;
                }
                c.editing = false;
                await this.cargarComerciales();
            } catch (err) {
                console.error("Error al guardar edición:", err);
                alert("❌ Error al guardar los cambios: " + err.message);
            }
        },

        async eliminarComercial(id) {
            if (!confirm("¿Estás seguro de que deseas eliminar este registro de comercial?")) return;
            try {
                await window.api.comerciales.eliminar(id);
                await this.cargarComerciales();
            } catch (err) {
                console.error("Error al eliminar comercial:", err);
                alert("❌ Error al eliminar el registro: " + err.message);
            }
        }
    }));
});
