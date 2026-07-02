document.addEventListener('alpine:init', () => {
    Alpine.data('moduloCuadrantes', () => ({
        filtros: { 
            mes: new Date().getMonth().toString(), 
            anio: new Date().getFullYear().toString(), 
            parking: 'ALL',
            trabajador: 'ALL',
            horario: 'ALL'
        },
        listaTrabajadores: [],
        listaParkings: [],
        listaHorarios: ["-", "06:00-14:00", "14:00-22:00", "22:00-06:00", "09:00-17:00", "17:00-01:00", "08:00-16:00", "16:00-00:00", "07:00-15:00", "15:00-23:00", "10:00-18:00", "18:00-02:00"],
        turnosDB: [],
        pendientesParkings: {},
        lockedMonths: {},
        
        // Modales y overlays
        showHoresModal: false,
        horesConveni: 0,
        resumTreballadors: {},
        
        showDeleteModal: false,
        deleteType: 'personal',
        deleteItem: '',
        editInput: '',
        
        showNoteModal: false,
        noteText: '',
        noteCellId: '',
        
        // Asistente lateral
        selectedCellId: null,
        asistenteData: {
            sugeridos: [],
            descartados: [],
            info: ''
        },

        // Reloj en tiempo real
        reloj: '',

        async init() {
            this.iniciarReloj();
            await this.cargarCatalogos();
            await this.cargarCuadrantes();
        },

        iniciarReloj() {
            const format = () => {
                const now = new Date();
                this.reloj = now.toLocaleTimeString();
            };
            format();
            setInterval(format, 1000);
        },

        async cargarCatalogos() {
            try {
                // Gracias a ATTACH en main.js, podemos consultar agentes y aparcamientos desde 'operativa'
                this.listaTrabajadores = await window.dbAPI.read('operativa', "SELECT nombre FROM agentes WHERE activo = 1 ORDER BY nombre ASC", []);
                this.listaParkings = await window.dbAPI.read('operativa', "SELECT nombre FROM aparcamientos WHERE activo = 1 ORDER BY nombre ASC", []);
            } catch (err) {
                console.error("Error al cargar catálogos:", err);
            }
        },

        async cargarCuadrantes() {
            try {
                const mesNum = (parseInt(this.filtros.mes) + 1).toString().padStart(2, '0');
                const pattern = `${this.filtros.anio}-${mesNum}-%`;

                // Cargar asignaciones del mes actual
                const query = `
                    SELECT q.*, a.nombre as agente_nombre, ap.nombre as aparcamiento_nombre 
                    FROM quadrant q
                    LEFT JOIN agentes a ON q.agente_id = a.id
                    JOIN aparcamientos ap ON q.aparcamiento_id = ap.id
                    WHERE q.fecha LIKE ?
                `;
                this.turnosDB = await window.dbAPI.read('operativa', query, [pattern]);

                // Cargar marcadores de pendientes
                const keyPendientesPattern = `nyn_pendent_${this.filtros.anio}_${this.filtros.mes}_%`;
                const pendientes = await window.dbAPI.read('operativa', "SELECT key, value FROM kv_store WHERE key LIKE ?", [keyPendientesPattern]);
                const map = {};
                pendientes.forEach(r => {
                    const park = r.key.split('_').slice(4).join('_');
                    map[park] = JSON.parse(r.value);
                });
                this.pendientesParkings = map;

                // Cargar bloqueo del mes
                const lockKey = `nyn_locked_${this.filtros.anio}_${this.filtros.mes}`;
                const lockRow = await window.dbAPI.read('operativa', "SELECT value FROM kv_store WHERE key = ?", [lockKey]);
                this.lockedMonths[lockKey] = lockRow && lockRow.length > 0 ? JSON.parse(lockRow[0].value) : false;

            } catch (err) {
                console.error("Error al cargar cuadrantes:", err);
            }
        },

        isMonthLocked() {
            const lockKey = `nyn_locked_${this.filtros.anio}_${this.filtros.mes}`;
            return !!this.lockedMonths[lockKey];
        },

        async toggleLockMonth() {
            const lockKey = `nyn_locked_${this.filtros.anio}_${this.filtros.mes}`;
            const locked = this.isMonthLocked();

            if (!locked) {
                const lockConfirmMsg = i18n.getLanguage() === 'es'
                    ? "Si cierras el Mes no podrás editar sus datos hasta que lo vuelvas a abrir y requiere CONTRASEÑA. ¿Deseas continuar?"
                    : "Si tanques el Mes no podràs editar-ne les dades fins que el tornis a obrir i requereix PASSWORD. Vols continuar?";
                if (confirm(lockConfirmMsg)) {
                    await window.dbAPI.write('operativa', "INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)", [
                        lockKey, JSON.stringify(true)
                    ]);
                    this.lockedMonths[lockKey] = true;

                    // Borrar coberturas requeridas específicas de este mes
                    try {
                        const mesNum = (parseInt(this.filtros.mes) + 1).toString().padStart(2, '0');
                        const patronFecha = `${this.filtros.anio}-${mesNum}-%`;
                        await window.dbAPI.write('catalogos', "DELETE FROM coberturas_requeridas WHERE fecha LIKE ? AND dia_semana IS NULL", [patronFecha]);
                    } catch (err) {
                        console.error("Error al borrar coberturas requeridas temporales:", err);
                    }
                }
            } else {
                const unlockConfirmMsg = i18n.getLanguage() === 'es'
                    ? "¿Deseas volver a abrir el mes y hacerlo editable? requiere CONTRASEÑA. ¿Deseas continuar?"
                    : "Vols tornar a obrir el mes i fer-lo editable? requereix PASSWORD. Vols continuar?";
                if (confirm(unlockConfirmMsg)) {
                    const codeLabel = i18n.getLanguage() === 'es' ? "Código:" : "Codi:";
                    if (prompt(codeLabel) === "1234") {
                        await window.dbAPI.write('operativa', "INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)", [
                            lockKey, JSON.stringify(false)
                        ]);
                        this.lockedMonths[lockKey] = false;
                    } else {
                        alert(i18n.getLanguage() === 'es' ? "Código incorrecto" : "Codi incorrecte");
                    }
                }
            }
        },

        get diasDelMes() {
            const days = [];
            const numDays = new Date(parseInt(this.filtros.anio), parseInt(this.filtros.mes) + 1, 0).getDate();
            const NOM_DIES = i18n.getLanguage() === 'es'
                ? ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
                : ["Diu", "Dill", "Dim", "Dix", "Dij", "Div", "Dis"];
            for (let d = 1; d <= numDays; d++) {
                const dateObj = new Date(parseInt(this.filtros.anio), parseInt(this.filtros.mes), d);
                const dayOfWeek = NOM_DIES[dateObj.getDay()];
                const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                const isFest = this.isFestiu(parseInt(this.filtros.mes), d, "GENERAL");
                days.push({
                    dia: d,
                    label: `${dayOfWeek} ${d}`,
                    isWeekend,
                    isFestiu: isFest
                });
            }
            return days;
        },

        isFestiu(m, d, parkName) {
            const COMUNS = ["0-1", "0-6", "3-3", "3-6", "4-1", "5-24", "7-15", "8-11", "9-12", "11-8", "11-25", "11-26"];
            const BCN_ONLY = ["4-25", "8-24"];
            const REUS_ONLY = ["5-29", "8-25"];
            const check = `${m}-${d}`;
            if (COMUNS.includes(check)) return true;
            const esReus = (parkName || "").toUpperCase().includes("PALLOL") || (parkName || "").toUpperCase().includes("REUS");
            if (esReus && REUS_ONLY.includes(check)) return true;
            return !esReus && BCN_ONLY.includes(check);
        },

        get matrizCuadrante() {
            const rows = [];
            const numDays = new Date(parseInt(this.filtros.anio), parseInt(this.filtros.mes) + 1, 0).getDate();
            
            // Filtrar parkings
            const parkingsToRender = this.listaParkings.filter(p => this.filtros.parking === 'ALL' || p.nombre === this.filtros.parking);

            parkingsToRender.forEach(p => {
                const park = p.nombre;
                const isPendent = !!this.pendientesParkings[park];

                ["MATÍ", "TARDA", "NIT"].forEach(turno => {
                    if (this.filtros.horario !== 'ALL' && this.filtros.horario !== `T_${turno}`) return;

                    const dias = [];
                    let rowMatchesWorkerFilter = false;

                    for (let d = 1; d <= numDays; d++) {
                        const dateObj = new Date(parseInt(this.filtros.anio), parseInt(this.filtros.mes), d);
                        const mesNum = (parseInt(this.filtros.mes) + 1).toString().padStart(2, '0');
                        const diaNum = d.toString().padStart(2, '0');
                        const fechaStr = `${this.filtros.anio}-${mesNum}-${diaNum}`;
                        const cellKey = `nyn_v12_${this.filtros.anio}_${this.filtros.mes}_${park}_${turno}_${d}`;

                        const reg = this.turnosDB.find(t => t.fecha === fechaStr && t.aparcamiento_nombre === park && t.turno === turno) || {};
                        const worker = reg.agente_nombre || "-";
                        const hours = reg.hora_inicio ? `${reg.hora_inicio}-${reg.hora_fin}` : "-";
                        const isSub = reg.es_substitucio === 1;
                        const note = reg.nota || "";

                        if (this.filtros.trabajador === 'ALL' || worker === this.filtros.trabajador) {
                            rowMatchesWorkerFilter = true;
                        }

                        const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                        const isFest = this.isFestiu(parseInt(this.filtros.mes), d, park);
                        const isVac = this.comprovarSiTeVacances(worker, d, parseInt(this.filtros.mes), parseInt(this.filtros.anio));

                        dias.push({
                            dia: d,
                            fecha: fechaStr,
                            key: cellKey,
                            worker,
                            hours,
                            isSub,
                            note,
                            isWeekend,
                            isFestiu: isFest,
                            isVacances: isVac
                        });
                    }

                    if (rowMatchesWorkerFilter) {
                        rows.push({
                            parking: park,
                            turno,
                            isPendent,
                            dias
                        });
                    }
                });
            });
            return rows;
        },

        async guardarCambio(park, turno, dia, field, value) {
            if (this.isMonthLocked()) return;
            try {
                const mesNum = (parseInt(this.filtros.mes) + 1).toString().padStart(2, '0');
                const diaNum = dia.toString().padStart(2, '0');
                const fechaStr = `${this.filtros.anio}-${mesNum}-${diaNum}`;

                const pRow = await window.dbAPI.read('operativa', "SELECT id FROM aparcamientos WHERE nombre = ?", [park]);
                if (!pRow || pRow.length === 0) return;
                const parkingId = pRow[0].id;

                const reg = this.turnosDB.find(t => t.fecha === fechaStr && t.aparcamiento_nombre === park && t.turno === turno) || {};

                let workerName = field === 'worker' ? value : (reg.agente_nombre || "-");
                let hoursStr = field === 'hours' ? value : (reg.hora_inicio ? `${reg.hora_inicio}-${reg.hora_fin}` : "-");
                let isSub = field === 'isSub' ? (value ? 1 : 0) : (reg.es_substitucio || 0);

                if (workerName === "-" || workerName === "") {
                    await window.dbAPI.write('operativa', "DELETE FROM quadrant WHERE fecha = ? AND aparcamiento_id = ? AND turno = ?", [fechaStr, parkingId, turno]);
                } else {
                    const aRow = await window.dbAPI.read('operativa', "SELECT id FROM agentes WHERE nombre = ?", [workerName]);
                    if (!aRow || aRow.length === 0) return;
                    const agenteId = aRow[0].id;

                    // --- VALIDACIÓN DE REGLAS DE NEGOCIO ---
                    // Comprobar si el trabajador ya tiene un turno asignado ese día en cualquier otro parking/turno.
                    // Si se está actualizando la misma celda (mismo parking + mismo turno), excluirla de la comprobación.
                    const esActualizacion = (checkRow) => checkRow && checkRow.length > 0;
                    const checkExistente = await window.dbAPI.read(
                        'operativa',
                        "SELECT id FROM quadrant WHERE fecha = ? AND aparcamiento_id = ? AND turno = ?",
                        [fechaStr, parkingId, turno]
                    );
                    const idExistente = esActualizacion(checkExistente) ? checkExistente[0].id : null;

                    const estaLibre = await this.validarReglasAsignacion(agenteId, fechaStr, idExistente);
                    if (!estaLibre) {
                        const msg = i18n.getLanguage() === 'es'
                            ? `Error: ${workerName} ya tiene un turno asignado el día ${dia}/${mesNum} en otro parking.`
                            : `Error: ${workerName} ja té un torn assignat el dia ${dia}/${mesNum} en un altre parking.`;
                        alert(msg);
                        await this.cargarCuadrantes();
                        return;
                    }
                    // -----------------------------------------

                    const hoursParts = hoursStr.split('-');
                    const horaInicio = hoursParts[0] || '06:00';
                    const horaFin = hoursParts[1] || '14:00';

                    const startHour = parseFloat(horaInicio.split(':')[0]) + parseFloat(horaInicio.split(':')[1] || 0) / 60;
                    let endHour = parseFloat(horaFin.split(':')[0]) + parseFloat(horaFin.split(':')[1] || 0) / 60;
                    if (endHour < startHour) endHour += 24;
                    const horasTrabajadas = endHour - startHour;

                    if (idExistente) {
                        await window.dbAPI.write('operativa', `
                            UPDATE quadrant 
                            SET agente_id = ?, hora_inicio = ?, hora_fin = ?, horas_trabajadas = ?, es_substitucio = ?
                            WHERE id = ?
                        `, [agenteId, horaInicio, horaFin, horasTrabajadas, isSub, idExistente]);
                    } else {
                        await window.dbAPI.write('operativa', `
                            INSERT INTO quadrant (fecha, aparcamiento_id, agente_id, turno, hora_inicio, hora_fin, horas_trabajadas, es_substitucio)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        `, [fechaStr, parkingId, agenteId, turno, horaInicio, horaFin, horasTrabajadas, isSub]);
                    }
                }

                await this.cargarCuadrantes();
            } catch (err) {
                console.error("Error guardando celda:", err);
            }
        },

        /**
         * Valida si un trabajador ya tiene algún turno asignado en una fecha dada.
         * Excluye el registro existente de la misma celda (idExistente) para permitir actualizaciones.
         * @param {number} agenteId      - ID del agente en la tabla agentes
         * @param {string} fechaStr      - Fecha en formato YYYY-MM-DD
         * @param {number|null} idExistente - ID del registro quadrant que se está actualizando (null si es nuevo)
         * @returns {Promise<boolean>}   - true si el agente está libre ese día, false si ya está ocupado
         */
        async validarReglasAsignacion(agenteId, fechaStr, idExistente) {
            try {
                let rows;
                if (idExistente) {
                    // Actualizar celda existente: excluir ese registro para no bloquearse a sí mismo
                    rows = await window.dbAPI.read(
                        'operativa',
                        "SELECT id FROM quadrant WHERE agente_id = ? AND fecha = ? AND id != ?",
                        [agenteId, fechaStr, idExistente]
                    );
                } else {
                    // Nueva asignación: buscar cualquier registro del agente en esa fecha
                    rows = await window.dbAPI.read(
                        'operativa',
                        "SELECT id FROM quadrant WHERE agente_id = ? AND fecha = ?",
                        [agenteId, fechaStr]
                    );
                }
                // Si existen registros, el trabajador ya está ocupado ese día
                return !rows || rows.length === 0;
            } catch (err) {
                console.error("[Validación] Error al comprobar solapamiento de turnos:", err);
                // En caso de error de BD, permitir la operación para no bloquear el flujo de trabajo
                return true;
            }
        },

        async toggleMarcador(park, val) {
            try {
                const key = `nyn_pendent_${this.filtros.anio}_${this.filtros.mes}_${park}`;
                await window.dbAPI.write('operativa', "INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)", [
                    key, JSON.stringify(val)
                ]);
                this.pendientesParkings[park] = val;
            } catch (err) {
                console.error("Error al toggle marcador:", err);
            }
        },

        async resetAll() {
            const dangerMsg1 = i18n.getLanguage() === 'es'
                ? "⚠️ PELIGRO: Se borrarán todos los datos del mes y por lo tanto perderás todo el trabajo realizado. ¿Estás seguro?"
                : "⚠️ PERILL: S'esborraran totes les dades del mes i per tant perdràs tota la feina feta. N'estàs segur?";
            const dangerMsg2 = i18n.getLanguage() === 'es'
                ? "⚠️ ¿Estás totalmente convencido de querer borrar todos los datos de este mes? Esta acción no se puede deshacer."
                : "⚠️ Estàs totalment convençut de voler esborrar totes les dades d'aquest mes? Aquesta acció no es pot desfer.";
            if (confirm(dangerMsg1) && confirm(dangerMsg2)) {
                const userPromptMsg = i18n.getLanguage() === 'es'
                    ? "Por seguridad y registro, introduce tu nombre (ALBERT / LAURA):"
                    : "Per seguretat i registre, introdueix el teu nom (ALBERT / LAURA):";
                const usuari = prompt(userPromptMsg);

                if (usuari && (usuari.toUpperCase() === "ALBERT" || usuari.toUpperCase() === "LAURA")) {
                    const mesNum = (parseInt(this.filtros.mes) + 1).toString().padStart(2, '0');
                    const pattern = `${this.filtros.anio}-${mesNum}-%`;

                    await window.dbAPI.write('operativa', "DELETE FROM quadrant WHERE fecha LIKE ?", [pattern]);
                    await this.cargarCuadrantes();
                    alert(i18n.getLanguage() === 'es' ? "Datos borrados correctamente." : "Dades esborrades correctament.");
                } else {
                    alert(i18n.getLanguage() === 'es' ? "Acción cancelada: Nombre de usuario no válido." : "Acció cancel·lada: Nom d'usuari no vàlid.");
                }
            }
        },

        async exportToNextMonth() {
            const nMI = (parseInt(this.filtros.mes) + 1) % 12;
            const nY = (parseInt(this.filtros.mes) === 11) ? parseInt(this.filtros.anio) + 1 : parseInt(this.filtros.anio);
            
            const mesosList = i18n.getLanguage() === 'es'
                ? ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
                : ["Gener","Febrer","Març","Abril","Maig","Juny","Juliol","Agost","Setembre","Octubre","Novembre","Desembre"];

            const confirmMsg = i18n.getLanguage() === 'es'
                ? `⚠️ ¿Deseas exportar la rotación a ${mesosList[nMI]}?\r\nSe respetarán los turnos de fin de semana y no se rellenarán huecos.`
                : `⚠️ Vols exportar la rotació a ${mesosList[nMI]}?\r\nEs respectaran els torns de cap de setmana i no s'ompliran buits.`;
                
            if (!confirm(confirmMsg)) return;

            try {
                const destMesNum = (nMI + 1).toString().padStart(2, '0');
                const destPattern = `${nY}-${destMesNum}-%`;

                // 1. Limpieza absoluta del mes de destino
                await window.dbAPI.write('operativa', "DELETE FROM quadrant WHERE fecha LIKE ?", [destPattern]);

                // 2. Recorremos cada día del mes de destino
                const diesMesSeguent = new Date(nY, nMI + 1, 0).getDate();

                for (let d = 1; d <= diesMesSeguent; d++) {
                    const dObj = new Date(nY, nMI, d);
                    const dS = dObj.getDay();
                    const destFechaStr = `${nY}-${destMesNum}-${d.toString().padStart(2, '0')}`;

                    for (const p of this.listaParkings) {
                        const parkName = p.nombre;
                        const esVermellAvui = (dS === 0 || dS === 6 || this.isFestiu(nMI, d, parkName));

                        for (const turno of ["MATÍ", "TARDA", "NIT"]) {
                            let dadesCopiades = null;

                            // Buscamos coincidencia en el mes actual
                            for (let diaO = 1; diaO <= 31; diaO++) {
                                const dObjO = new Date(parseInt(this.filtros.anio), parseInt(this.filtros.mes), diaO);
                                if (dObjO.getMonth() !== parseInt(this.filtros.mes)) break;

                                const dSO = dObjO.getDay();
                                const esVermellO = (dSO === 0 || dSO === 6 || this.isFestiu(parseInt(this.filtros.mes), diaO, parkName));

                                if (dS === dSO && esVermellAvui === esVermellO) {
                                    const origMesNum = (parseInt(this.filtros.mes) + 1).toString().padStart(2, '0');
                                    const origFechaStr = `${this.filtros.anio}-${origMesNum}-${diaO.toString().padStart(2, '0')}`;

                                    const reg = this.turnosDB.find(t => t.fecha === origFechaStr && t.aparcamiento_nombre === parkName && t.turno === turno);
                                    if (reg && reg.agente_nombre && reg.agente_nombre !== "-" && reg.es_substitucio !== 1) {
                                        dadesCopiades = reg;
                                        break;
                                    }
                                }
                            }

                            if (dadesCopiades) {
                                await window.dbAPI.write('operativa', `
                                    INSERT INTO quadrant (fecha, aparcamiento_id, agente_id, turno, hora_inicio, hora_fin, horas_trabajadas, es_substitucio)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                                `, [
                                    destFechaStr,
                                    dadesCopiades.aparcamiento_id,
                                    dadesCopiades.agente_id,
                                    turno,
                                    dadesCopiades.hora_inicio,
                                    dadesCopiades.hora_fin,
                                    dadesCopiades.horas_trabajadas
                                ]);
                            }
                        }
                    }
                }

                this.filtros.mes = nMI.toString();
                this.filtros.anio = nY.toString();
                await this.cargarCuadrantes();
                alert(i18n.getLanguage() === 'es' ? "✅ Exportación realizada" : "✅ Exportació realitzada");
            } catch (err) {
                console.error("Error al exportar rotación:", err);
            }
        },

        calcularHoresMes() {
            const resum = {};
            const numDays = new Date(parseInt(this.filtros.anio), parseInt(this.filtros.mes) + 1, 0).getDate();
            let horesConveniMes = 0;

            for (let d = 1; d <= numDays; d++) {
                const data = new Date(parseInt(this.filtros.anio), parseInt(this.filtros.mes), d);
                if (data.getDay() >= 1 && data.getDay() <= 5 && !this.isFestiu(parseInt(this.filtros.mes), d, "GENERAL")) {
                    horesConveniMes += 8;
                }
            }

            this.listaTrabajadores.forEach(t => {
                resum[t.nombre] = { diurnes: 0, nocturnes: 0, festives: 0, total: 0 };
            });

            this.turnosDB.forEach(reg => {
                const worker = reg.agente_nombre;
                if (!worker || worker === "-" || !resum[worker]) return;

                const partsH = (reg.hora_inicio && reg.hora_fin) ? `${reg.hora_inicio}-${reg.hora_fin}`.split('-') : [];
                if (partsH.length !== 2) return;

                let inici = parseInt(partsH[0]), fi = parseInt(partsH[1]);
                if (fi <= inici) fi += 24;

                const diaInt = parseInt(reg.fecha.split('-')[2]);

                for (let h = inici; h < fi; h++) {
                    let horaReal = h % 24;
                    let diaActualCalcul = h >= 24 ? diaInt + 1 : diaInt;
                    let esFestiuRang = (horaReal >= 22)
                        ? this.isFestiu(parseInt(this.filtros.mes), diaActualCalcul + 1, reg.aparcamiento_nombre)
                        : this.isFestiu(parseInt(this.filtros.mes), diaActualCalcul, reg.aparcamiento_nombre);

                    if (esFestiuRang) {
                        resum[worker].festives++;
                    } else if (horaReal >= 6 && horaReal < 22) {
                        resum[worker].diurnes++;
                    } else {
                        resum[worker].nocturnes++;
                    }
                    resum[worker].total++;
                }
            });

            this.horesConveni = horesConveniMes;
            this.resumTreballadors = resum;
            this.showHoresModal = true;
        },

        resetFilters() {
            this.filtros.parking = 'ALL';
            this.filtros.trabajador = 'ALL';
            this.filtros.horario = 'ALL';
        },

        getTranslatedTorn(torn) {
            if (i18n.getLanguage() === 'es') {
                if (torn === "MATÍ") return "MAÑANA";
                if (torn === "TARDA") return "TARDE";
                if (torn === "NIT") return "NOCHE";
            }
            return torn;
        },

        // Asistente lateral
        async openAssistant(cellKey) {
            if (this.isMonthLocked()) return;
            this.selectedCellId = cellKey;
            
            const parts = cellKey.split('_');
            const dia = parts[parts.length - 1];
            const torn = parts[parts.length - 2];
            const park = parts.slice(4, parts.length - 2).join(' ');

            const mesNum = (parseInt(this.filtros.mes) + 1).toString().padStart(2, '0');
            const fecha = `${this.filtros.anio}-${mesNum}-${dia.toString().padStart(2, '0')}`;

            this.asistenteData.info = `🏢 ${park.toUpperCase()} | 📅 ${dia}/${mesNum}/${this.filtros.anio} | ⏰ ${this.getTranslatedTorn(torn)}`;
            
            this.asistenteData.sugeridos = [];
            this.asistenteData.descartados = [];

            try {
                const dbPark = await window.dbAPI.read('catalogos', "SELECT id FROM aparcamientos WHERE nombre = ?", [park.toUpperCase()]);
                if (dbPark && dbPark.length > 0) {
                    const aparcamientoId = dbPark[0].id;
                    if (typeof obtenerAsistenteAsignacion === 'function') {
                        const res = await obtenerAsistenteAsignacion(fecha, aparcamientoId);
                        this.asistenteData.sugeridos = res.sugeridos || [];
                        this.asistenteData.descartados = res.restringidos || res.descartados || [];
                    }
                }
            } catch (err) {
                console.error("Error en asistente:", err);
            }

            const panel = document.getElementById('panel-asistente');
            if (panel) panel.classList.remove('hidden');
        },

        closeAssistant() {
            this.selectedCellId = null;
            const panel = document.getElementById('panel-asistente');
            if (panel) panel.classList.add('hidden');
        },

        async asignarAgenteDesdeAsistente(nombre) {
            if (!this.selectedCellId) return;
            const parts = this.selectedCellId.split('_');
            const dia = parseInt(parts[parts.length - 1]);
            const turno = parts[parts.length - 2];
            const park = parts.slice(4, parts.length - 2).join(' ');

            await this.guardarCambio(park, turno, dia, 'worker', nombre);
            this.closeAssistant();
        },

        // Notas
        openNote(cellKey) {
            this.noteCellId = cellKey;
            const reg = this.turnosDB.find(t => {
                const parts = cellKey.split('_');
                const dia = parseInt(parts[parts.length - 1]);
                const turno = parts[parts.length - 2];
                const park = parts.slice(4, parts.length - 2).join(' ');
                const mesNum = (parseInt(this.filtros.mes) + 1).toString().padStart(2, '0');
                const fechaStr = `${this.filtros.anio}-${mesNum}-${dia.toString().padStart(2, '0')}`;
                return t.fecha === fechaStr && t.aparcamiento_nombre === park && t.turno === turno;
            }) || {};
            this.noteText = reg.nota || '';
            this.showNoteModal = true;
        },

        async saveNote() {
            if (!this.noteCellId) return;
            const parts = this.noteCellId.split('_');
            const dia = parseInt(parts[parts.length - 1]);
            const turno = parts[parts.length - 2];
            const park = parts.slice(4, parts.length - 2).join(' ');

            try {
                const mesNum = (parseInt(this.filtros.mes) + 1).toString().padStart(2, '0');
                const diaNum = dia.toString().padStart(2, '0');
                const fechaStr = `${this.filtros.anio}-${mesNum}-${diaNum}`;

                const pRow = await window.dbAPI.read('operativa', "SELECT id FROM aparcamientos WHERE nombre = ?", [park]);
                if (pRow && pRow.length > 0) {
                    const parkingId = pRow[0].id;
                    const checkRow = await window.dbAPI.read('operativa', "SELECT id FROM quadrant WHERE fecha = ? AND aparcamiento_id = ? AND turno = ?", [fechaStr, parkingId, turno]);
                    
                    if (checkRow && checkRow.length > 0) {
                        await window.dbAPI.write('operativa', "UPDATE quadrant SET nota = ? WHERE id = ?", [this.noteText, checkRow[0].id]);
                    } else {
                        await window.dbAPI.write('operativa', `
                            INSERT INTO quadrant (fecha, aparcamiento_id, agente_id, turno, hora_inicio, hora_fin, horas_trabajadas, nota)
                            VALUES (?, ?, 0, ?, '06:00', '14:00', 8, ?)
                        `, [fechaStr, parkingId, turno, this.noteText]);
                    }
                    await this.cargarCuadrantes();
                }
            } catch (err) {
                console.error("Error al guardar nota:", err);
            }
            this.showNoteModal = false;
        },

        // Vacaciones
        comprovarSiTeVacances(nomTreballador, dia, mes, any) {
            if (!nomTreballador || nomTreballador === "-" || nomTreballador === "") return false;
            const dadesRaw = localStorage.getItem('nyn_vacances'); 
            if (!dadesRaw) return false;

            let llistaVacances = [];
            try {
                llistaVacances = JSON.parse(dadesRaw);
            } catch(e) { return false; }
            
            const dataCel = new Date(any, mes, dia);
            dataCel.setHours(0, 0, 0, 0);

            const netejar = (t) => t ? t.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim() : "";
            const nomNetQuadrant = netejar(nomTreballador);

            return llistaVacances.some(v => {
                if (netejar(v.n) !== nomNetQuadrant) return false;
                
                const periodes = [];
                if (v.p && v.p !== "" && v.p !== "PENDENTS") periodes.push(v.p);
                if (v.p2 && v.p2 !== "" && v.p2 !== "PENDENTS") periodes.push(v.p2);

                return periodes.some(textPeriode => {
                    let dInici, dFi;
                    if (textPeriode.includes(" to ")) {
                        const parts = textPeriode.split(" to ");
                        dInici = this.parsearDataCustom(parts[0]);
                        dFi = this.parsearDataCustom(parts[1]);
                    } else {
                        dInici = this.parsearDataCustom(textPeriode);
                        dFi = new Date(dInici);
                    }
                    return (dataCel >= dInici && dataCel <= dFi);
                });
            });
        },

        parsearDataCustom(str) {
            const p = str.trim().split('/');
            const d = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
            d.setHours(0, 0, 0, 0);
            return d;
        },

        async importarVacances(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const jsonComplet = JSON.parse(e.target.result);
                    const llistaAEmmagatzemar = jsonComplet.dades || [];

                    if (llistaAEmmagatzemar.length === 0) {
                        alert("Atenció: No s'han trobat dades a la clau 'dades' del fitxer.");
                        return;
                    }

                    localStorage.setItem('nyn_vacances', JSON.stringify(llistaAEmmagatzemar));
                    
                    if (typeof persistence !== 'undefined' && persistence.syncSave) {
                        await persistence.syncSave();
                    }

                    await this.cargarCuadrantes();
                    alert("✅ Vacances actualitzades correctament! Ara es pintaran les caselles liles.");
                } catch (err) {
                    console.error("Error en la importació:", err);
                    alert("❌ El fitxer seleccionat no és un JSON de vacances vàlid.");
                }
            };
            reader.readAsText(file);
        },

        // Mapeo / Gestionar Datos modal
        openDeleteModal() {
            this.showDeleteModal = true;
            this.updateDeleteOptions();
        },

        updateDeleteOptions() {
            // No hacemos nada complejo, Alpine maneja los campos reactivos en la vista
        },

        async addNewItem() {
            if (this.deleteType === 'parkings') {
                const nou = prompt("Nou centre:");
                if (nou && nou.trim()) {
                    const nouTrim = nou.trim().toUpperCase();
                    const existing = this.listaParkings.find(ap => ap.nombre.toUpperCase() === nouTrim);
                    if (existing) {
                        alert("Aquest centre ja existeix.");
                        return;
                    }
                    try {
                        const allParkings = await window.api.getAparcamientos();
                        allParkings.push({
                            nombre: nouTrim,
                            coordinadorId: (sessionStorage.getItem('userName') || 'Administrador').toLowerCase()
                        });
                        const res = await window.api.saveAparcamientos(allParkings);
                        if (res && res.success) {
                            await this.cargarCatalogos();
                            alert("✅ Centre afegit correctament.");
                        } else {
                            alert("Error: " + (res?.error || "desconegut"));
                        }
                    } catch (e) {
                        console.error(e);
                        alert("Error al desar el centre.");
                    }
                }
            } else {
                const nou = prompt("Nou element:");
                if (nou && nou.trim()) {
                    // Cargar lista existente de localStorage
                    const key = 'nyn_' + this.deleteType;
                    const llista = JSON.parse(localStorage.getItem(key) || '["-"]');
                    llista.push(nou.trim());
                    llista.sort();
                    localStorage.setItem(key, JSON.stringify(llista));
                    await this.cargarCatalogos();
                }
            }
        },

        exportarExcel() {
            const mesNom = ['GENER','FEBRER','MARÇ','ABRIL','MAIG','JUNY','JULIOL','AGOST','SETEMBRE','OCTUBRE','NOVEMBRE','DESEMBRE'][parseInt(this.filtros.mes)];
            const headerRow = ["CENTRE", "TORN"];
            const days = this.diasDelMes;
            days.forEach(d => headerRow.push(d.dia.toString()));
            
            const ws_data = [
                [`INFORME CUADRANTES - ${mesNom} ${this.filtros.anio}`],
                [],
                headerRow
            ];
            
            this.matrizCuadrante.forEach(row => {
                const rData = [row.parking, this.getTranslatedTorn(row.turno)];
                row.dias.forEach(d => {
                    rData.push(d.worker === "-" ? "" : d.worker);
                });
                ws_data.push(rData);
            });
            
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(ws_data);
            XLSX.utils.book_append_sheet(wb, ws, "Cuadrante");
            XLSX.writeFile(wb, `Cuadrante_${this.filtros.parking}_${mesNom}_${this.filtros.anio}.xlsx`);
        }
    }));
});
