document.addEventListener('alpine:init', () => {
    Alpine.data('moduloReglas', () => ({
        rules: [],
        editedRules: {},
        coberturas: [],
        aparcamientos: [],
        
        // Nueva regla
        nuevaRegla: {
            clave: '',
            categoria: 'GENERAL',
            tipo: 'texto',
            value: '',
            descripcion: ''
        },

        // Nueva cobertura
        nuevaCobertura: {
            aparcamiento_id: '',
            fecha: '',
            turno: 'MATÍ',
            hora_inicio: '06:00',
            hora_fin: '14:00'
        },

        usuarioActual: sessionStorage.getItem('userName') || 'Coordinador',
        userRole: sessionStorage.getItem('userRole') || 'coordinador',
        toastMessage: '',
        toastType: 'success',
        showToast: false,

        async init() {
            await this.loadRules();
            await this.loadAparcamientos();
            await this.loadCoberturas();
        },

        showToastNotification(message, type = 'success') {
            this.toastMessage = message;
            this.toastType = type;
            this.showToast = true;
            setTimeout(() => {
                this.showToast = false;
            }, 3500);
        },

        async loadRules() {
            try {
                // Leemos directamente del catálogo de reglas
                const sql = "SELECT clave, value, tipo, categoria, descripcion FROM reglas_config ORDER BY clave ASC";
                this.rules = await window.dbAPI.read('catalogos', sql, []);
                this.editedRules = {};
            } catch (err) {
                console.error("Error al cargar reglas:", err);
                this.showToastNotification("Error al cargar las reglas de negocio.", "error");
            }
        },

        trackEdit(clave, value) {
            this.editedRules[clave] = value;
        },

        get hasChanges() {
            return Object.keys(this.editedRules).length > 0;
        },

        async saveChanges() {
            if (!this.hasChanges) return;
            try {
                for (const clave in this.editedRules) {
                    const value = this.editedRules[clave];
                    await window.dbAPI.write('catalogos', "UPDATE reglas_config SET value = ? WHERE clave = ?", [value, clave]);
                }
                this.showToastNotification(i18n.t('successSaveRules') || "Reglas guardadas correctamente.", "success");
                await this.loadRules();
            } catch (err) {
                console.error("Error al guardar reglas:", err);
                this.showToastNotification("Error al guardar las reglas de negocio.", "error");
            }
        },

        async addRule() {
            const clave = this.nuevaRegla.clave.trim().toLowerCase();
            if (!clave) {
                alert("Por favor, introduce una clave para la regla.");
                return;
            }

            if (this.rules.some(r => r.clave === clave)) {
                alert("Esta regla ya existe.");
                return;
            }

            try {
                const sql = "INSERT INTO reglas_config (clave, value, tipo, categoria, descripcion) VALUES (?, ?, ?, ?, ?)";
                const params = [
                    clave,
                    this.nuevaRegla.value,
                    this.nuevaRegla.tipo,
                    this.nuevaRegla.categoria,
                    this.nuevaRegla.descripcion.trim()
                ];
                await window.dbAPI.write('catalogos', sql, params);
                this.showToastNotification("Regla añadida correctamente.", "success");
                
                // Reset form
                this.nuevaRegla = {
                    clave: '',
                    categoria: 'GENERAL',
                    tipo: 'texto',
                    value: '',
                    descripcion: ''
                };
                await this.loadRules();
            } catch (err) {
                console.error("Error al agregar regla:", err);
                this.showToastNotification("Error al añadir la regla.", "error");
            }
        },

        adjustValueInput() {
            if (this.nuevaRegla.tipo === 'booleano') {
                this.nuevaRegla.value = '0';
            } else {
                this.nuevaRegla.value = '';
            }
        },

        async loadAparcamientos() {
            try {
                const rows = await window.dbAPI.read('catalogos', "SELECT id, nombre FROM aparcamientos WHERE activo = 1 ORDER BY nombre ASC", []);
                this.aparcamientos = rows;
                if (rows.length > 0) {
                    this.nuevaCobertura.aparcamiento_id = rows[0].id.toString();
                }
            } catch (err) {
                console.error("Error al cargar aparcamientos:", err);
            }
        },

        async loadCoberturas() {
            try {
                const sql = `
                    SELECT c.*, a.nombre AS aparcamiento_nombre 
                    FROM coberturas_requeridas c 
                    JOIN aparcamientos a ON c.aparcamiento_id = a.id 
                    WHERE c.activo = 1 AND c.dia_semana IS NULL AND c.fecha IS NOT NULL
                    ORDER BY c.fecha ASC, c.hora_inicio ASC
                `;
                this.coberturas = await window.dbAPI.read('catalogos', sql, []);
            } catch (err) {
                console.error("Error al cargar coberturas:", err);
            }
        },

        adjustCoberturaHorario() {
            const t = this.nuevaCobertura.turno;
            if (t === 'MATÍ') {
                this.nuevaCobertura.hora_inicio = '06:00';
                this.nuevaCobertura.hora_fin = '14:00';
            } else if (t === 'TARDA') {
                this.nuevaCobertura.hora_inicio = '14:00';
                this.nuevaCobertura.hora_fin = '22:00';
            } else if (t === 'NIT') {
                this.nuevaCobertura.hora_inicio = '22:00';
                this.nuevaCobertura.hora_fin = '06:00';
            }
        },

        async addCobertura() {
            const cob = this.nuevaCobertura;
            if (!cob.aparcamiento_id || !cob.fecha || !cob.turno || !cob.hora_inicio || !cob.hora_fin) {
                alert("Todos los campos de la cobertura son obligatorios.");
                return;
            }

            try {
                const checkSql = "SELECT id FROM coberturas_requeridas WHERE aparcamiento_id = ? AND fecha = ? AND turno = ? AND activo = 1";
                const existing = await window.dbAPI.read('catalogos', checkSql, [cob.aparcamiento_id, cob.fecha, cob.turno]);
                if (existing && existing.length > 0) {
                    alert("Ya existe una cobertura requerida para ese centro, fecha y turno.");
                    return;
                }

                const sql = `
                    INSERT INTO coberturas_requeridas (aparcamiento_id, dia_semana, fecha, turno, hora_inicio, hora_fin, activo)
                    VALUES (?, NULL, ?, ?, ?, ?, 1)
                `;
                await window.dbAPI.write('catalogos', sql, [cob.aparcamiento_id, cob.fecha, cob.turno, cob.hora_inicio, cob.hora_fin]);
                this.showToastNotification("Cobertura añadida correctamente.", "success");
                
                // Reset form
                this.nuevaCobertura.fecha = '';
                this.nuevaCobertura.turno = 'MATÍ';
                this.nuevaCobertura.hora_inicio = '06:00';
                this.nuevaCobertura.hora_fin = '14:00';

                await this.loadCoberturas();
            } catch (err) {
                console.error("Error al registrar cobertura:", err);
                this.showToastNotification("Error al añadir la cobertura.", "error");
            }
        },

        async deleteCobertura(id) {
            if (!confirm("¿Estás seguro de que deseas eliminar esta cobertura requerida?")) return;
            try {
                await window.dbAPI.write('catalogos', "DELETE FROM coberturas_requeridas WHERE id = ?", [id]);
                this.showToastNotification("Cobertura obligatoria eliminada.", "success");
                await this.loadCoberturas();
            } catch (err) {
                console.error("Error al eliminar cobertura:", err);
                this.showToastNotification("Error al eliminar la cobertura.", "error");
            }
        }
    }));
});
