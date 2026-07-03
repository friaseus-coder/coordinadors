document.addEventListener('alpine:init', () => {
    Alpine.data('moduloRanking', () => ({
        dades: [],
        busqueda: '',
        viewMode: 'table', // 'table' o 'card'
        
        filtros: {
            centre: '',
            torn: '',
            zona: '',
            nota: ''
        },

        opcionsTorn: ["MATÍ", "TARDA", "CAP DE SET.", "NIT"],
        opcionsZona: ["Zona 1", "Zona 2", "Zona 3"],
        notesOptions: [
            { label: '<2', value: '0-2' },
            { label: '2 - 5', value: '2-5' },
            { label: '5 - 8', value: '5-8' },
            { label: '8 - 10', value: '8-10' }
        ],

        usuarioActual: sessionStorage.getItem('userName') || 'Albert',
        userRole: sessionStorage.getItem('userRole') || 'coordinador',

        async init() {
            await this.carregar();

            // Sincronizar el redibujado de gráficos cuando los datos filtrados cambien
            this.$watch('dadesFiltrades', (newVal) => {
                this.$nextTick(() => {
                    this.renderizarGraficos(newVal);
                });
            });

            // Redibujar gráficos si cambia el idioma en caliente
            window.addEventListener('languageChanged', () => {
                this.$nextTick(() => {
                    this.renderizarGraficos(this.dadesFiltrades);
                });
            });

            // Renderizado inicial
            this.$nextTick(() => {
                this.renderizarGraficos(this.dadesFiltrades);
            });
        },

        renderizarGraficos(arr) {
            if (typeof renderCentreChart === 'function') renderCentreChart(arr);
            if (typeof renderScatterChart === 'function') renderScatterChart(arr);
            if (typeof renderSunburstChart === 'function') renderSunburstChart(arr);
        },

        async carregar() {
            try {
                const keyPath = `dades ${this.usuarioActual}/ranking`;
                const rows = await window.dbAPI.read('operativa', "SELECT value FROM kv_store WHERE key = ?", [keyPath]);
                if (rows && rows.length > 0 && rows[0].value) {
                    this.dades = JSON.parse(rows[0].value);
                } else {
                    // Fallback a dades en data.js si no n'hi ha a la BD
                    if (typeof data === 'function') {
                        this.dades = data();
                    } else {
                        this.dades = [];
                    }
                }
                this.asignarOrdre();
            } catch (err) {
                console.error("Error al cargar ranking:", err);
                if (typeof data === 'function') {
                    this.dades = data();
                    this.asignarOrdre();
                }
            }
        },

        async guardar() {
            try {
                const keyPath = `dades ${this.usuarioActual}/ranking`;
                const serialized = JSON.stringify(this.dades);
                await window.dbAPI.write('operativa', "INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)", [
                    keyPath, serialized
                ]);
            } catch (err) {
                console.error("Error al guardar ranking:", err);
            }
        },

        asignarOrdre() {
            this.dades.forEach((d, i) => {
                if (d.ordre === undefined) d.ordre = i + 1;
            });
        },

        get centresUnics() {
            const set = new Set(this.dades.map(d => d.centre).filter(Boolean));
            return Array.from(set).sort();
        },

        get dadesFiltrades() {
            const query = this.busqueda.trim().toUpperCase();
            
            let resultado = this.dades.filter(d => {
                const coincideBusqueda = !query || 
                    (d.agent || '').toUpperCase().includes(query) ||
                    (d.centre || '').toUpperCase().includes(query) ||
                    (d.observacions || '').toUpperCase().includes(query);
                
                const coincideCentre = !this.filtros.centre || d.centre === this.filtros.centre;
                const coincideTorn = !this.filtros.torn || d.torn === this.filtros.torn;
                const coincideZona = !this.filtros.zona || d.zona === this.filtros.zona;
                
                let coincideNota = true;
                if (this.filtros.nota) {
                    const [min, max] = this.filtros.nota.split('-').map(Number);
                    const val = parseFloat(d.valoracio || 0);
                    coincideNota = val >= min && val <= max;
                }

                return coincideBusqueda && coincideCentre && coincideTorn && coincideZona && coincideNota;
            });

            // Retornar ordenado por valoración descendente
            return resultado.sort((a, b) => b.valoracio - a.valoracio);
        },

        recalcularValoracio(d) {
            const k = parseFloat(d.coneixements || 0);
            const at = parseFloat(d.atencio || 0);
            const di = parseFloat(d.disponibilitat || 0);
            const ac = parseFloat(d.actitud || 0);
            d.valoracio = parseFloat(((k + at + di + ac) / 4).toFixed(2));
            this.guardar();
        },

        getRowColor(val) {
            if (val >= 8) return 'background-color: rgba(218,165,32,0.15);';
            if (val >= 5) return 'background-color: rgba(0,128,0,0.06);';
            if (val >= 2) return 'background-color: rgba(255,0,0,0.05);';
            return 'background-color: rgba(0,0,0,0.06);';
        },

        getRatingClass(val) {
            if (val >= 8) return 'text-amber-600 font-bold';
            if (val >= 5) return 'text-green-600 font-bold';
            if (val >= 2) return 'text-red-500 font-bold';
            return 'text-gray-500 font-bold';
        },

        async afegirFila() {
            this.dades.push({
                agent: 'NOU AGENT',
                centre: this.centresUnics[0] || 'CENTRE',
                societat: 'EMPRESA',
                torn: 'MATÍ',
                zona: 'Zona 1',
                coneixements: 5,
                atencio: 5,
                disponibilitat: 5,
                actitud: 5,
                valoracio: 5,
                observacions: ''
            });
            this.asignarOrdre();
            await this.guardar();
        },

        async borrarFila(index) {
            if (!confirm("Vols eliminar aquest agent del rànquing?")) return;
            this.dades.splice(index, 1);
            this.asignarOrdre();
            await this.guardar();
        },

        exportarBackupJSON() {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([JSON.stringify(this.dades)], { type: "application/json" }));
            a.download = "ranking.json";
            a.click();
        },

        importarBackupJSON(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const parsed = JSON.parse(e.target.result);
                    this.dades = parsed;
                    this.asignarOrdre();
                    await this.guardar();
                    alert("✅ Rànquing importat correctament.");
                } catch (err) {
                    console.error(err);
                    alert("❌ El fitxer seleccionat no és un JSON de rànquing vàlid.");
                }
            };
            reader.readAsText(file);
        }
    }));
});
