document.addEventListener('alpine:init', () => {
    Alpine.data('moduloInventario', () => ({
        dades: {
            cataleg: [],
            stock: [],
            comandes: [],
            magatzems: ["OFICINES", "PROVENÇA", "CÒRSEGA"],
            categories: ["CONSUMIBLES IMPRESSORA", "MATERIAL OFIMÀTIC", "MANTENIMENT I VARIS", "MOBILIARI I ERGONOMIA"]
        },
        centresLlista: [],
        
        showModalGestio: false,
        newRef: '',
        newNom: '',
        newCat: 'CONSUMIBLES IMPRESSORA',
        
        usuarioActual: sessionStorage.getItem('userName') || 'Albert',
        userRole: sessionStorage.getItem('userRole') || 'coordinador',

        async init() {
            if (window.api && window.api.setSession) {
                window.api.setSession(this.usuarioActual, this.userRole);
            }
            await this.cargarCentres();
            await this.carregar();

            if (window.api && window.api.onDataChanged) {
                window.api.onDataChanged((event) => {
                    if (event && (event.dbKey === 'finanzas' || event.table?.includes('inventario'))) {
                        console.log('[INVENTARI UI] Delta extern detectat, actualitzant dades...');
                        this.carregar();
                    }
                });
            }
        },

        async cargarCentres() {
            try {
                if (window.api && window.api.maestros) {
                    const rows = await window.api.maestros.obtenerAparcamientos();
                    this.centresLlista = [...(rows || []).map(r => r.nombre), "OFICINA CENTRAL"].sort();
                } else {
                    this.centresLlista = ["OFICINES", "PROVENÇA", "CÒRSEGA", "OFICINA CENTRAL"].sort();
                }
            } catch (err) {
                console.error("Error al cargar centros de la BD en inventario:", err);
                this.centresLlista = ["OFICINA CENTRAL"];
            }
        },

        async carregar() {
            try {
                this.dades.cataleg = await window.AppServices.Finanzas.Inventario.obtenerArticulos();
                
                const almacenes = await window.AppServices.Finanzas.Inventario.obtenerAlmacenes();
                this.dades.magatzems = almacenes.map(a => a.nombre);
                if (this.dades.magatzems.length === 0) {
                    this.dades.magatzems = ["OFICINES", "PROVENÇA", "CÒRSEGA", "OFICINA CENTRAL"];
                }
                
                this.dades.stock = await window.AppServices.Finanzas.Inventario.obtenerStockGlobal();
                this.dades.comandes = await window.AppServices.Finanzas.Inventario.obtenerComandas();
            } catch (err) {
                console.error("Error al cargar inventario:", err);
            }
        },

        getCatClass(ref) {
            const m = this.dades.cataleg.find(x => x.ref === ref);
            if (!m) return "";
            const c = m.cat;
            if (c.includes("CONSUM")) return "row-consumibles";
            if (c.includes("OFIM")) return "row-ofimatica";
            if (c.includes("MANTEN")) return "row-manteniment";
            if (c.includes("MOBILI")) return "row-mobiliari";
            return "";
        },

        getEstocDisponible(ref) {
            const s = this.dades.stock.find(x => x.ref === ref);
            return s ? s.stock : 0;
        },

        async modQty(stockId, delta) {
            const item = this.dades.stock.find(x => x.id === stockId);
            if (item) {
                const newStock = Math.max(0, item.stock + delta);
                try {
                    const res = await window.AppServices.Finanzas.Inventario.actualizarStock(stockId, newStock, item.version);
                    if (res && res.code === 'OCC_CONFLICT') {
                        alert("⚠️ Conflicte de concurrencia: Algú ha modificat aquest stock abans. S'actualitzaran les dades.");
                        await this.carregar();
                        return;
                    }
                    item.stock = newStock;
                    item.version += 1;
                } catch(e) {
                    alert("Error actualitzant stock: " + e.message);
                    await this.carregar();
                }
            }
        },

        async afegirFilaStock() {
            const articulo_id = prompt("ID del Artículo a añadir (vea el catálogo):");
            if (!articulo_id) return;
            const almacenes = await window.AppServices.Finanzas.Inventario.obtenerAlmacenes();
            if (almacenes.length === 0) return;
            
            try {
                await window.AppServices.Finanzas.Inventario.crearStock(articulo_id, almacenes[0].id);
                await this.carregar();
            } catch(e) {
                alert("Error al añadir al stock: " + e.message);
            }
        },

        async borrarStock(stockId) {
            if (confirm("Segur que vols eliminar aquesta fila d'stock?")) {
                await window.AppServices.Finanzas.Inventario.borrarStock(stockId);
                await this.carregar();
            }
        },

        async novaComanda() {
            const artId = prompt("Introdueix ID de l'Article per a la comanda:");
            if(!artId) return;
            const centre = prompt("A quin centre va dirigit?") || "CENTRAL";
            
            const comanda = {
                data: new Date().toISOString().split('T')[0],
                centre: centre,
                articulo_id: artId,
                uds: 1,
                estat: 'pendent',
                rec: ''
            };
            
            try {
                await window.AppServices.Finanzas.Inventario.crearComanda(comanda);
                await this.carregar();
            } catch(e) {
                alert("Error creant comanda: " + e.message);
            }
        },

        async canviarEstat(index) {
            const c = this.dades.comandes[index];
            const s = this.dades.stock.find(x => x.articulo_id === c.articulo_id && x.magatzem === 'OFICINA CENTRAL');
            
            if (c.estat === 'pendent') {
                if (!s || s.stock < c.uds) {
                    alert("No hi ha prou stock disponible al magatzem principal!");
                    return;
                }
                const newStock = s.stock - c.uds;
                try {
                    await window.AppServices.Finanzas.Inventario.actualizarStock(s.id, newStock, s.version);
                    c.estat = 'entregat';
                    c.rec = new Date().toISOString().split('T')[0];
                    await window.AppServices.Finanzas.Inventario.actualizarComanda(c.id, c.estat, c.rec);
                    await this.carregar();
                } catch(e) {
                    alert("Error processant comanda: " + e.message);
                    await this.carregar();
                }
            } else {
                if (s) {
                    const newStock = s.stock + c.uds;
                    try {
                        await window.AppServices.Finanzas.Inventario.actualizarStock(s.id, newStock, s.version);
                        c.estat = 'pendent';
                        c.rec = '';
                        await window.AppServices.Finanzas.Inventario.actualizarComanda(c.id, c.estat, c.rec);
                        await this.carregar();
                    } catch(e) {}
                }
            }
        },

        async borrarCom(index) {
            const c = this.dades.comandes[index];
            if (confirm("Vols eliminar aquesta comanda?")) {
                await window.AppServices.Finanzas.Inventario.borrarComanda(c.id);
                await this.carregar();
            }
        },

        comprovarNovaCat(value) {
            if (value === "ADD_CAT") {
                const n = prompt("Nova temàtica:").toUpperCase();
                if (n && !this.dades.categories.includes(n)) {
                    this.dades.categories.push(n);
                    this.newCat = n;
                } else {
                    this.newCat = this.dades.categories[0];
                }
            }
        },

        async afegirAlCataleg() {
            if (!this.newRef || !this.newNom) {
                alert("Falten camps per omplir.");
                return;
            }
            try {
                await window.AppServices.Finanzas.Inventario.crearArticulo(
                    this.newRef.trim(), 
                    this.newNom.trim().toUpperCase(), 
                    this.newCat
                );
                this.newRef = '';
                this.newNom = '';
                await this.carregar();
            } catch(e) {
                alert("Error afegint article: " + e.message);
            }
        },

        async eliminarDelCataleg(index) {
            const art = this.dades.cataleg[index];
            if (confirm("Vols eliminar l'article del catàleg?")) {
                try {
                    await window.AppServices.Finanzas.Inventario.eliminarArticulo(art.id);
                    await this.carregar();
                } catch(e) {
                    alert("No s'ha pogut esborrar, potser està en ús en l'stock: " + e.message);
                }
            }
        }
    }));
});
