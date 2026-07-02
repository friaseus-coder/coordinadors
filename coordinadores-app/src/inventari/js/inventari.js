document.addEventListener('alpine:init', () => {
    Alpine.data('moduloInventario', () => ({
        dades: {
            cataleg: [],
            stock: [],
            comandes: [],
            magatzems: ["OFICINES", "PROVENÇA", "CÒRSEGA"],
            categories: ["CONSUMIBLES IMPRESSORA", "MATERIAL OFIMÀTIC", "MANTENIMENT I VARIS", "MOBILIARI I ERGONOMIA"]
        },
        centresLlista: ["NN ARAGÓ", "NN BONANOVA", "NN BORRELL", "NN BRUC", "NN CONCEPT", "NN CORSEGA", "NN DIAGONAL", "NN EL PALLOL", "NN ESPRONCEDA", "NN ESTEVE TARRADAS", "NN GEIGLE", "NN GRAN VIA", "NN HERCEGOVINA", "NN MASTER CATALONIA", "NN LA ROTONDA", "NN PEDRALBES", "NN ROCAFORT", "NN SANTALÓ", "NN SANT GERVASI", "NN SENTMENAT 2", "NN TAMARITA", "NN TARRAGONA", "NN TRAVESSERA", "NN URGELL", "NN URGELL 2", "NN VALENCIA", "NN VALENCIA 2", "NN VALENCIA 3", "NN VIA AUGUSTA", "ZONA FRANCA", "OFICINA CENTRAL"].sort(),
        
        showModalGestio: false,
        newRef: '',
        newNom: '',
        newCat: 'CONSUMIBLES IMPRESSORA',
        
        usuarioActual: sessionStorage.getItem('userName') || 'Albert',
        userRole: sessionStorage.getItem('userRole') || 'coordinador',

        async init() {
            await this.carregar();
        },

        async carregar() {
            try {
                const keyPath = `dades ${this.usuarioActual}/inventari`;
                const rows = await window.dbAPI.read('finanzas', "SELECT value FROM kv_store WHERE key = ?", [keyPath]);
                if (rows && rows.length > 0 && rows[0].value) {
                    const parsed = JSON.parse(rows[0].value);
                    this.dades = {
                        cataleg: parsed.cataleg || [],
                        stock: parsed.stock || [],
                        comandes: parsed.comandes || [],
                        magatzems: parsed.magatzems || ["OFICINES", "PROVENÇA", "CÒRSEGA"],
                        categories: parsed.categories || ["CONSUMIBLES IMPRESSORA", "MATERIAL OFIMÀTIC", "MANTENIMENT I VARIS", "MOBILIARI I ERGONOMIA"]
                    };
                }
            } catch (err) {
                console.error("Error al cargar inventario:", err);
            }
        },

        async guardar() {
            try {
                const keyPath = `dades ${this.usuarioActual}/inventari`;
                const serialized = JSON.stringify(this.dades);
                await window.dbAPI.write('finanzas', "INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)", [
                    keyPath, serialized
                ]);
            } catch (err) {
                console.error("Error al guardar inventario:", err);
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

        modQty(stockId, delta) {
            const item = this.dades.stock.find(x => x.id === stockId);
            if (item) {
                item.stock = Math.max(0, item.stock + delta);
                this.guardar();
            }
        },

        canviarMag(stockId, value) {
            if (value === "ADD") {
                const n = prompt("Introduïu el nom del nou magatzem:").toUpperCase();
                if (n && !this.dades.magatzems.includes(n)) {
                    this.dades.magatzems.push(n);
                    const item = this.dades.stock.find(x => x.id === stockId);
                    if (item) item.magatzem = n;
                    this.guardar();
                }
            } else {
                const item = this.dades.stock.find(x => x.id === stockId);
                if (item) {
                    item.magatzem = value;
                    this.guardar();
                }
            }
        },

        canviarItemStock(stockId, value) {
            if (value && this.dades.stock.find(x => x.ref === value && x.id !== stockId)) {
                alert("Aquest material ja està afegit al stock.");
                return;
            }
            const item = this.dades.stock.find(x => x.id === stockId);
            if (item) {
                item.ref = value;
                this.guardar();
            }
        },

        afegirFilaStock() {
            this.dades.stock.unshift({
                id: Date.now(),
                magatzem: this.dades.magatzems[0],
                ref: "",
                stock: 0
            });
        },

        borrarStock(stockId) {
            this.dades.stock = this.dades.stock.filter(x => x.id !== stockId);
            this.guardar();
        },

        novaComanda() {
            this.dades.comandes.unshift({
                data: new Date().toISOString().split('T')[0],
                centre: "",
                ref: "",
                uds: 1,
                estat: 'pendent',
                rec: ''
            });
        },

        async canviarEstat(index) {
            const c = this.dades.comandes[index];
            const s = this.dades.stock.find(x => x.ref === c.ref);
            if (!c.ref || !c.centre) {
                alert("Cal completar el centre i el material per poder marcar-lo com entregat.");
                return;
            }

            if (c.estat === 'pendent') {
                if (!s || s.stock < c.uds) {
                    alert("No hi ha prou stock disponible al magatzem!");
                    return;
                }
                s.stock -= c.uds;
                c.estat = 'entregat';
                c.rec = new Date().toISOString().split('T')[0];
            } else {
                if (s) s.stock += c.uds;
                c.estat = 'pendent';
            }
            await this.guardar();
        },

        borrarCom(index) {
            this.dades.comandes.splice(index, 1);
            this.guardar();
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

        afegirAlCataleg() {
            if (!this.newRef || !this.newNom) {
                alert("Falten camps per omplir.");
                return;
            }
            this.dades.cataleg.push({
                cat: this.newCat,
                ref: this.newRef.trim(),
                nom: this.newNom.trim().toUpperCase()
            });
            this.newRef = '';
            this.newNom = '';
            this.guardar();
        },

        eliminarDelCataleg(index) {
            this.dades.cataleg.splice(index, 1);
            this.guardar();
        },

        exportarJSON() {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([JSON.stringify(this.dades)], { type: "application/json" }));
            a.download = "inventari.json";
            a.click();
        },

        importarJSON(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const parsed = JSON.parse(e.target.result);
                    this.dades = parsed;
                    await this.guardar();
                    alert("✅ Inventari importat correctament.");
                } catch (err) {
                    console.error(err);
                    alert("❌ El fitxer seleccionat no és un JSON d'inventari vàlid.");
                }
            };
            reader.readAsText(file);
        }
    }));
});
