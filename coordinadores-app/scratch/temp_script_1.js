
        // Configuración y variables de estado del asistente
        let pasoActual = 1;
        let selectedFiles = [];
        let backupRealizado = false;
        let backupFilePath = "";
        
        let catalogosLocales = { agentes: [], aparcamientos: [] };
        
        // Mapeos de nombres de entrada a base de datos
        let matchAparcamientosMap = new Map(); // clave: jsonName -> valor: dbId (o 'NEW', o 'SKIP')
        let matchAgentesMap = new Map(); // clave: jsonName -> valor: dbId (o 'NEW', o 'SKIP')
        
        // Estructuras de datos a migrar
        let registrosProcesados = []; // Todos los registros leídos del JSON
        let registrosExcluidos = []; // Registros excluidos de la importación
        let registrosParaInsertar = []; // Registros mapeados listos para base de datos
        
        // Comerciales: datos desencapsulados listos para importar
        let datosAImportar = [];
        
        // Gastos y Kilometraje
        let gastosAImportar = [];
        let empleadoIdUsuario = "";
        
        // Obtener APIs de Electron de forma segura
        const electronApi = window.api || (window.parent && window.parent.api);
        const dbApi = window.dbAPI || (window.parent && window.parent.dbAPI);

        async function loadCatalogos() {
            try {
                if (dbApi) {
                    // Cargar agentes (empleados con rol Trabajador)
                    catalogosLocales.agentes = await dbApi.read('catalogos', "SELECT id, nombre FROM empleados WHERE activo = 1 AND rol = 'Trabajador'", []);
                    // Cargar aparcamientos
                    catalogosLocales.aparcamientos = await dbApi.read('catalogos', "SELECT id, nombre, coordinador FROM aparcamientos WHERE activo = 1", []);
                }
            } catch (e) {
                console.error("Error al cargar catálogos maestros:", e);
            }
        }

        // Al cargar la ventana
        window.addEventListener('load', async () => {
            // Asegurar traducción de la ventana tras cargar
            const finalI18n = window.i18n || (typeof i18n !== 'undefined' ? i18n : null);
            if (finalI18n && typeof finalI18n.translatePage === 'function') {
                finalI18n.translatePage();
            }
            await loadCatalogos();
            actualizarInterfazTipo();
        });

        function reiniciarAsistente() {
            pasoActual = 1;
            selectedFiles = [];
            backupRealizado = false;
            backupFilePath = "";
            registrosProcesados = [];
            registrosExcluidos = [];
            registrosParaInsertar = [];
            datosAImportar = [];
            matchAparcamientosMap.clear();
            matchAgentesMap.clear();
            
            document.getElementById('fileListContainer').style.display = 'none';
            document.getElementById('btnGoToStep2').disabled = true;
            document.getElementById('btnGoToStep3').disabled = true;
            document.getElementById('btnHacerBackup').disabled = false;
            document.getElementById('txtStatusBackup').style.display = 'none';
            document.getElementById('inputArchivoJson').value = '';
            
            // Reset indicators
            for (let i = 1; i <= 5; i++) {
                const stepEl = document.getElementById(`stepIndicator-${i}`);
                stepEl.className = i === 1 ? 'step active' : 'step';
                
                const contentEl = document.getElementById(`stepContent-${i}`);
                contentEl.className = i === 1 ? 'step-content active' : 'step-content';
            }
            actualizarInterfazTipo();
        }

        function cerrarAsistente() {
            // Recargar e ir a home
            if (window.parent && window.parent.openTab) {
                window.parent.openTab('home', window.parent.document.querySelector('.tab-button'));
                // Recargar el portal
                window.parent.location.reload();
            }
        }

        function actualizarInterfazTipo() {
            const tipo = document.getElementById('tipoMigracion').value;
            const txtBds = document.getElementById('txtBdsAfectadas');
            const btnSelectElectron = document.getElementById('btnSelectElectron');
            const btnSelectHtml5 = document.getElementById('btnSelectHtml5');
            const fileListContainer = document.getElementById('fileListContainer');
            
            fileListContainer.style.display = 'none';
            fileListContainer.innerHTML = '';
            selectedFiles = [];
            datosAImportar = [];
            gastosAImportar = [];
            empleadoIdUsuario = "";
            document.getElementById('btnGoToStep2').disabled = true;
            document.getElementById('inputArchivoJson').value = '';
            
            if (tipo === 'comerciales') {
                txtBds.textContent = 'comercial.db';
                btnSelectElectron.style.display = 'none';
                btnSelectHtml5.style.display = 'inline-flex';
            } else if (tipo === 'rutas') {
                txtBds.textContent = 'finanzas_inventario.db';
                btnSelectElectron.style.display = 'none';
                btnSelectHtml5.style.display = 'inline-flex';
txtBds.textContent = 'finanzas_inventario.db';
                btnSelectElectron.style.display = 'none';
                btnSelectHtml5.style.display = 'inline-flex';
            } else {
                btnSelectHtml5.style.display = 'none';
                btnSelectElectron.style.display = 'inline-flex';
                txtBds.textContent = 'operativa_rrhh.db';
            }
        }

        async function manejarArchivoSeleccionado(event) {
            const files = Array.from(event.target.files);
            if (files.length === 0) return;
            
            const tipo = document.getElementById('tipoMigracion').value;
            const container = document.getElementById('fileListContainer');
            container.innerHTML = '';
            container.style.display = 'block';
            
            // Si la estrategia es 'add', acumulamos archivos, si no, los reemplazamos
            const isAddStrategy = document.getElementById('optAdd') && document.getElementById('optAdd').classList.contains('selected');
            if (!isAddStrategy) {
                selectedFiles = [];
                datosAImportar = [];
                gastosAImportar = [];
                empleadoIdUsuario = "";
            }
            
            let allValid = true;
            const isCa = (window.i18n && window.i18n.getLanguage() === 'ca');
            const successMsg = isCa ? "Lectura completada amb èxit" : "Lectura completada con éxito";
            
            // Variable global para detectar encabezados en comerciales
            if (tipo === 'comerciales') {
                window.columnasDetectadas = window.columnasDetectadas || [];
            }

            for (const file of files) {
                try {
                    const text = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = e => resolve(e.target.result);
                        reader.onerror = e => reject(e);
                        reader.readAsText(file);
                    });
                    
                    const isCsv = file.name.toLowerCase().endsWith('.csv');
                    let parsedData = null;
                    
                    if (isCsv) {
                        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
                        if (lines.length > 0) {
                            const sep = lines[0].includes(';') ? ';' : ',';
                            const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));
                            
                            if (tipo === 'comerciales' && window.columnasDetectadas.length === 0) {
                                window.columnasDetectadas = headers;
                            }
                            
                            parsedData = [];
                            for (let i = 1; i < lines.length; i++) {
                                const values = lines[i].split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
                                const rowObj = {};
                                headers.forEach((h, index) => {
                                    rowObj[h] = values[index] || '';
                                });
                                parsedData.push(rowObj);
                            }
                        } else {
                            parsedData = [];
                        }
                    } else {
                        parsedData = JSON.parse(text);
                    }
                    
                    const item = document.createElement('div');
                    item.className = 'file-item';
                    
                    if (tipo === 'comerciales') {
                        if (isCsv) {
                            datosAImportar.push(...parsedData);
                        } else {
                            for (const [key, value] of Object.entries(parsedData)) {
                                if (key.includes('last_export_time') || key.includes('last_export_author')) {
                                    continue;
                                }
                                
                                let rows = [];
                                if (typeof value === 'string' && value.startsWith('[[')) {
                                    try { rows = JSON.parse(value); } catch(e) {}
                                } else if (Array.isArray(value)) {
                                    rows = value;
                                }
                                
                                if (Array.isArray(rows)) {
                                    rows.forEach(row => {
                                        if (Array.isArray(row) && row.length >= 7) {
                                            datosAImportar.push(row);
                                        } else if (!Array.isArray(row) && typeof row === 'object') {
                                            datosAImportar.push(row);
                                        }
                                    });
                                }
                            }
                            
                            // Extraer columnas simuladas para JSON si no es CSV y no hay columnas
                            if (window.columnasDetectadas.length === 0 && datosAImportar.length > 0) {
                                const firstRow = datosAImportar[0];
                                if (Array.isArray(firstRow)) {
                                    window.columnasDetectadas = firstRow.map((_, i) => "Columna " + i);
                                } else if (typeof firstRow === 'object') {
                                    window.columnasDetectadas = Object.keys(firstRow);
                                }
                            }
                        }
                        
                        selectedFiles.push({ name: file.name, content: parsedData });
                        item.innerHTML = `
                            <span class="file-name">📄 ${file.name}</span>
                            <span class="file-size">${successMsg}</span>
                        `;
                        container.appendChild(item);
                        
                    } else if (tipo === 'rutas') {
                        let totalKeys = 0;
                        for (const [key, value] of Object.entries(parsedData)) {
                            if (key.startsWith('METADATA')) continue;
                            const parts = key.split('-');
                            if (parts.length >= 5) totalKeys++;
                        }
                        if (totalKeys === 0) throw new Error(isCa ? "No s'han trobat rutes vàlides." : "No se han encontrado rutas válidas.");
                        
                        selectedFiles.push({ name: file.name, content: parsedData });
                        item.innerHTML = `
                            <span class="file-name">📄 ${file.name}</span>
                            <span class="file-size">${successMsg} (${totalKeys} reg.)</span>
                        `;
                        container.appendChild(item);
                        
                    } else if (tipo === 'gastos') {
                        let totalRows = 0;
                        const empleado = parsedData["nyn_nom_empleat"];
                        if (!empleado) throw new Error(isCa ? "Sense nom empleat." : "Sin nombre empleado.");
                        
                        for (const [key, value] of Object.entries(parsedData)) {
                            if (key.startsWith('nyn_despeses_') && Array.isArray(value)) {
                                value.forEach(row => { if (Array.isArray(row) && row[0] && row[0] !== "") totalRows++; });
                            }
                        }
                        if (totalRows === 0) throw new Error(isCa ? "No hi ha despeses." : "No hay gastos.");
                        
                        empleadoIdUsuario = empleado;
                        selectedFiles.push({ name: file.name, content: parsedData });
                        item.innerHTML = `
                            <span class="file-name">📄 ${file.name}</span>
                            <span class="file-size">${successMsg} (${empleado}, ${totalRows} reg.)</span>
                        `;
                        container.appendChild(item);
                    }
                } catch (err) {
                    mostrarAlerta(isCa ? "Error de lectura: " + err.message : "Error de lectura: " + err.message);
                    document.getElementById('btnGoToStep2').disabled = true;
                }
            }
        }

        function seleccionarEstrategia(est) {
            document.getElementById('optAdd').className = est === 'add' ? 'radio-option selected' : 'radio-option';
            document.getElementById('optOverwrite').className = est === 'overwrite' ? 'radio-option selected' : 'radio-option';
            document.getElementById('optAdd').querySelector('input').checked = est === 'add';
            document.getElementById('optOverwrite').querySelector('input').checked = est === 'overwrite';
        }

        async function seleccionarArchivosJson() {
            if (!electronApi || !electronApi.seleccionarArchivosMigracion) {
                mostrarAlerta("API de selección de archivos no disponible.");
                return;
            }

            const result = await electronApi.seleccionarArchivosMigracion();
            if (result.success && result.files) {
                // Si la estrategia es 'add', permitimos acumular archivos
                const isAddStrategy = document.getElementById('optAdd').classList.contains('selected');
                if (isAddStrategy) {
                    const existingNames = new Set(selectedFiles.map(f => f.name));
                    result.files.forEach(f => {
                        if (!existingNames.has(f.name)) {
                            selectedFiles.push(f);
                        }
                    });
                } else {
                    selectedFiles = result.files;
                }
                
                const container = document.getElementById('fileListContainer');
                container.innerHTML = '';
                container.style.display = 'block';
                
                selectedFiles.forEach(file => {
                    const item = document.createElement('div');
                    item.className = 'file-item';
                    item.innerHTML = `
                        <span class="file-name">📄 ${file.name}</span>
                        <span class="file-size">Lectura completada con éxito</span>
                    `;
                    container.appendChild(item);
                });
                
                document.getElementById('btnGoToStep2').disabled = false;
            } else if (result.error) {
                mostrarAlerta("Error al cargar archivos: " + result.error);
            }
        }

        async function crearCopiaSeguridad() {
            const tipo = document.getElementById('tipoMigracion').value;
            const btn = document.getElementById('btnHacerBackup');
            const status = document.getElementById('txtStatusBackup');
            
            btn.disabled = true;
            status.style.display = 'block';
            status.innerHTML = `<span class="spinner"></span> Creant còpia de seguretat preventiva...`;
            status.style.color = 'var(--text-muted)';
            
            try {
                if (electronApi && electronApi.crearBackupMigracion) {
                    const result = await electronApi.crearBackupMigracion(tipo);
                    if (result.success) {
                        backupRealizado = true;
                        backupFilePath = result.filePath;
                        
                        status.style.color = 'var(--success)';
                        status.innerHTML = `✅ Còpia de seguretat guardada amb èxit a:<br><span style="font-size: 10px; font-family: monospace; word-break: break-all;">${result.filePath}</span>`;
                        
                        document.getElementById('btnGoToStep3').disabled = false;
                    } else if (result.reason) {
                        btn.disabled = false;
                        status.style.color = 'var(--danger)';
                        status.innerHTML = `❌ Copia cancel·lada: ${result.reason}`;
                    } else {
                        btn.disabled = false;
                        status.style.color = 'var(--danger)';
                        status.innerHTML = `❌ Error: ${result.error}`;
                    }
                } else {
                    status.innerHTML = `❌ API de Backup no disponible en este entorno.`;
                    status.style.color = 'var(--danger)';
                    btn.disabled = false;
                }
            } catch (e) {
                btn.disabled = false;
                status.style.color = 'var(--danger)';
                status.innerHTML = `❌ Excepció: ${e.message}`;
            }
        }

        function avanzarPaso(paso) {
            // Cambiar indicador
            document.getElementById(`stepIndicator-${pasoActual}`).className = 'step completed';
            document.getElementById(`stepIndicator-${paso}`).className = 'step active';
            
            // Cambiar contenido
            document.getElementById(`stepContent-${pasoActual}`).className = 'step-content';
            document.getElementById(`stepContent-${paso}`).className = 'step-content active';
            
            pasoActual = paso;
        }

        function retrocederPaso(paso) {
            // Cambiar indicador
            document.getElementById(`stepIndicator-${pasoActual}`).className = 'step';
            document.getElementById(`stepIndicator-${paso}`).className = 'step active';
            
            // Cambiar contenido
            document.getElementById(`stepContent-${pasoActual}`).className = 'step-content';
            document.getElementById(`stepContent-${paso}`).className = 'step-content active';
            
            pasoActual = paso;
        }

        // PASO 3: Análisis de catálogos y extracción de entidades
        async function analizarDatosYProceder() {
            const tipo = document.getElementById('tipoMigracion').value;
            
            // Ocultar información de Comerciales, Rutas y Gastos por defecto
            document.getElementById('sectionMatchColumnasComerciales').style.display = 'none';
            document.getElementById('infoComercialesMatching').style.display = 'none';
            document.getElementById('infoRutasMatching').style.display = 'none';
            document.getElementById('infoGastosMatching').style.display = 'none';
            
            let parkingsEnJson = new Set();
            let agentesEnJson = new Set();
            registrosProcesados = [];
            
            // Extraer entidades según el tipo de datos
            selectedFiles.forEach(file => {
                const content = file.content;
                
                if (tipo === 'deudas') {
                    const items = Array.isArray(content) ? content : [];
                    items.forEach(item => {
                        if (item.comercial) agentesEnJson.add(item.comercial.trim());
                        registrosProcesados.push({
                            comercial: item.comercial || 'Desconocido',
                            cliente: item.cliente || '',
                            import: item.import || 0,
                            fecha: item.fecha || ''
                        });
                    });
                }
                else if (tipo === 'vacaciones') {
                    const items = Array.isArray(content) ? content : [];
                    items.forEach(item => {
                        if (item.nombre) agentesEnJson.add(item.nombre.trim());
                        registrosProcesados.push({
                            nombre: item.nombre || '',
                            fecha_inicio: item.fecha_inicio || '',
                            fecha_fin: item.fecha_fin || ''
                        });
                    });
                }
                else if (tipo === 'comerciales') {
                    for (const [key, value] of Object.entries(content)) {
                        if (key === 'comerciales' || key === 'tarifas_comerciales') {
                            if (!value) continue;
                            
                            if (typeof value === 'object' && !Array.isArray(value)) {
                                for (const [subk, subv] of Object.entries(value)) {
                                    let subRows = [];
                                    if (typeof subv === 'string' && subv.startsWith('[[')) {
                                        try { subRows = JSON.parse(subv); } catch(e) {}
                                    } else if (Array.isArray(subv)) {
                                        subRows = subv;
                                    }
                                    if (Array.isArray(subRows)) {
                                        subRows.forEach(row => {
                                            if (Array.isArray(row) && row.length >= 7) {
                                                datosAImportar.push(row);
                                            } else if (!Array.isArray(row) && typeof row === 'object') {
                                                datosAImportar.push(row);
                                            }
                                        });
                                    }
                                }
                                continue;
                            }
                            
                            let rows = [];
                            if (typeof value === 'string' && value.startsWith('[[')) {
                                try { rows = JSON.parse(value); } catch(e) {}
                            } else if (Array.isArray(value)) {
                                rows = value;
                            }
                            
                            if (Array.isArray(rows)) {
                                rows.forEach(row => {
                                    if (Array.isArray(row) && row.length >= 7) {
                                        datosAImportar.push(row);
                                    } else if (!Array.isArray(row) && typeof row === 'object') {
                                        datosAImportar.push(row);
                                    }
                                });
                            }
                        }
                    }
                }
                else if (tipo === 'cuadrante') {
                    for (const [key, value] of Object.entries(content)) {
                        // Expresión regular robusta para detectar claves de cuadrante:
                        // Debe terminar en _MATÍ_dia, _MATI_dia, _TARDA_dia o _NIT_dia
                        if (/_(MATÍ|MATI|TARDA|NIT)_\d+$/i.test(key)) {
                            const parts = key.split('_');
                            if (parts.length < 5) continue;
                            
                            // Extraer datos de atrás hacia adelante (Split Inverso)
                            const dia = parts[parts.length - 1];
                            const turno = parts[parts.length - 2].toUpperCase();
                            const nombreParking = parts[parts.length - 3].toUpperCase().trim();
                            const mesJS = parts[parts.length - 4];
                            const año = parts[parts.length - 5];
                            
                            parkingsEnJson.add(nombreParking);
                            
                            let cellData = {};
                            if (typeof value === 'string') {
                                try { 
                                    cellData = JSON.parse(value); 
                                } catch(e) { 
                                    console.error("Error al parsear celda de cuadrante:", e, value);
                                    continue; 
                                }
                            } else if (value && typeof value === 'object') {
                                cellData = value;
                            }
                            
                            const wName = (cellData.w || '').trim();
                            if (wName && wName !== '-' && wName !== '') {
                                agentesEnJson.add(wName);
                            }
                            
                            // Estandarizar rawParts para mantener total compatibilidad con previsualizarImportacion y ejecutarMigracionFinal
                            const rawPartsNormalized = [
                                null, 
                                null, 
                                año, 
                                mesJS, 
                                null, 
                                turno, 
                                dia
                            ];
                            
                            registrosProcesados.push({
                                key: key,
                                parking: nombreParking,
                                agente: wName,
                                horas: cellData.h || '06:00-14:00',
                                es_sub: cellData.s ? 1 : 0,
                                nota: cellData.n || '',
                                rawParts: rawPartsNormalized
                            });
                        }
                    }
                } else if (tipo === 'rutas') {
                    // Procesar el JSON y agrupar por YYYY-MM-DD_Trabajador
                    const groups = {};
                    for (const [key, value] of Object.entries(content)) {
                        if (key.startsWith('METADATA')) continue;
                        const parts = key.split('-');
                        if (parts.length < 5) continue;
                        
                        const worker = parts[0];
                        const year = parts[1];
                        const monthRaw = parseInt(parts[2], 10);
                        const dayRaw = parseInt(parts[3], 10);
                        const stopIndex = parseInt(parts[4], 10);
                        const isHolidayKey = parts[5] === 'holiday';
                        
                        const month = String(monthRaw + 1).padStart(2, '0');
                        const day = String(dayRaw).padStart(2, '0');
                        const formattedDate = `${year}-${month}-${day}`;
                        
                        const groupKey = `${formattedDate}_${worker}`;
                        
                        if (!groups[groupKey]) {
                            groups[groupKey] = {
                                worker: worker,
                                date: formattedDate,
                                tempStops: [],
                                festivo: false
                            };
                        }
                        
                        if (isHolidayKey) {
                            if (value === "1" || value === 1 || value === true || value === "true") {
                                groups[groupKey].festivo = true;
                            }
                        } else {
                            if (value !== undefined && value !== null) {
                                groups[groupKey].tempStops[stopIndex] = value.toString().trim();
                            }
                        }
                    }
                    
                    Object.values(groups).forEach(g => {
                        const cleanStops = g.tempStops.filter(stop => stop !== undefined && stop !== null && stop !== "");
                        let concepto = "";
                        if (g.festivo) {
                            concepto = "FESTIVO";
                        } else {
                            concepto = cleanStops.join(" ➤ ");
                        }
                        
                        registrosProcesados.push({
                            worker: g.worker,
                            date: g.date,
                            stops: cleanStops,
                            festivo: g.festivo,
                            concepto: concepto
                        });
                    });
                    
                    // Ordenar por fecha y trabajador
                    registrosProcesados.sort((a, b) => {
                        if (a.date !== b.date) return a.date.localeCompare(b.date);
                        return a.worker.localeCompare(b.worker);
                    });
                } else if (tipo === 'gastos') {
                    // Extraer el nombre del empleado
                    const empleado = content["nyn_nom_empleat"];
                    empleadoIdUsuario = empleado;
                    
                    gastosAImportar = []; // Vaciar
                    for (const [key, value] of Object.entries(content)) {
                        if (key.startsWith('nyn_despeses_') && Array.isArray(value)) {
                            value.forEach(row => {
                                // Ignorar filas vacías
                                if (Array.isArray(row) && row[0] && row[0] !== "") {
                                    gastosAImportar.push({
                                        fecha: row[0],
                                        concepto: row[1] || "",
                                        km: row[2] || "0",
                                        tarifa: row[3] || "0",
                                        extras: row[4] || "0"
                                    });
                                }
                            });
                        }
                    }
                    
                    // Ordenar por fecha cronológicamente
                    gastosAImportar.sort((a, b) => a.fecha.localeCompare(b.fecha));
                }
            });

            // Recargar catálogos maestros antes de analizar
            await loadCatalogos();
            
            // Analizar discrepancias de Aparcamientos
            let discrepanciasParkings = [];
            const dbParkingsUpper = catalogosLocales.aparcamientos.map(p => p.nombre.toUpperCase());
            
            parkingsEnJson.forEach(jsonPkName => {
                const index = dbParkingsUpper.indexOf(jsonPkName.toUpperCase());
                if (index === -1) {
                    discrepanciasParkings.push(jsonPkName);
                } else {
                    matchAparcamientosMap.set(jsonPkName, catalogosLocales.aparcamientos[index].id);
                }
            });

            // Analizar discrepancias de Agentes (Personas)
            let discrepanciasAgentes = [];
            const dbAgentesUpper = catalogosLocales.agentes.map(a => a.nombre.toUpperCase());
            
            agentesEnJson.forEach(jsonAgName => {
                const index = dbAgentesUpper.indexOf(jsonAgName.toUpperCase());
                if (index === -1) {
                    discrepanciasAgentes.push(jsonAgName);
                } else {
                    matchAgentesMap.set(jsonAgName, catalogosLocales.agentes[index].id);
                }
            });

            // Decidir si mostramos el paso de matching o avanzamos directamente
            if (tipo === 'rutas') {
                document.getElementById('alertDiscrepancias').style.display = 'none';
                document.getElementById('alertCleanCatalogs').style.display = 'none';
                document.getElementById('sectionMatchParkings').style.display = 'none';
                document.getElementById('sectionMatchAgentes').style.display = 'none';
                document.getElementById('infoRutasMatching').style.display = 'block';
            } else if (tipo === 'gastos') {
                document.getElementById('alertDiscrepancias').style.display = 'none';
                document.getElementById('alertCleanCatalogs').style.display = 'none';
                document.getElementById('sectionMatchParkings').style.display = 'none';
                document.getElementById('sectionMatchAgentes').style.display = 'none';
                document.getElementById('infoGastosMatching').style.display = 'block';
            } else {
                if (discrepanciasParkings.length > 0 || discrepanciasAgentes.length > 0) {
                    document.getElementById('alertDiscrepancias').style.display = 'flex';
                    document.getElementById('alertCleanCatalogs').style.display = 'none';
                    
                    buildMatchingUI(discrepanciasParkings, discrepanciasAgentes);
                } else {
                    document.getElementById('alertDiscrepancias').style.display = 'none';
                    document.getElementById('alertCleanCatalogs').style.display = 'flex';
                    document.getElementById('sectionMatchParkings').style.display = 'none';
                    document.getElementById('sectionMatchAgentes').style.display = 'none';
                }
            }
            
            avanzarPaso(3);
        }

        function levenshteinDistance(a, b) {
            const matrix = [];
            for (let i = 0; i <= b.length; i++) {
                matrix[i] = [i];
            }
            for (let j = 0; j <= a.length; j++) {
                matrix[0][j] = j;
            }
            for (let i = 1; i <= b.length; i++) {
                for (let j = 1; j <= a.length; j++) {
                    if (b.charAt(i - 1) === a.charAt(j - 1)) {
                        matrix[i][j] = matrix[i - 1][j - 1];
                    } else {
                        matrix[i][j] = Math.min(
                            matrix[i - 1][j - 1] + 1,
                            matrix[i][j - 1] + 1,
                            matrix[i - 1][j] + 1
                        );
                    }
                }
            }
            return matrix[b.length][a.length];
        }

        function obtenerPropuestaAparcamiento(nombreJson, catalogosAparcamientos) {
            if (!nombreJson) return 'NEW';
            
            function normalizar(str) {
                return str.toUpperCase()
                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                    .replace(/\b(N\.N\.|N\.|NN|NUÑEZ|PARKING|APARCAMIENTO)\b/g, '')
                    .replace(/[^A-Z0-9]/g, '')
                    .trim();
            }
            
            const normaJson = normalizar(nombreJson);
            if (!normaJson) return 'NEW';
            
            let mejorMatch = null;
            let mejorScore = 0;
            
            for (const dbPk of catalogosAparcamientos) {
                const normaDb = normalizar(dbPk.nombre);
                if (!normaDb) continue;
                
                if (normaJson === normaDb) {
                    return dbPk.id;
                }
                
                if (normaJson.includes(normaDb) || normaDb.includes(normaJson)) {
                    const score = Math.min(normaJson.length, normaDb.length) / Math.max(normaJson.length, normaDb.length);
                    if (score > mejorScore) {
                        mejorScore = score;
                        mejorMatch = dbPk.id;
                    }
                }
                
                const dist = levenshteinDistance(normaJson, normaDb);
                const maxLength = Math.max(normaJson.length, normaDb.length);
                const similarity = 1 - (dist / maxLength);
                
                if (similarity > 0.60 && similarity > mejorScore) {
                    mejorScore = similarity;
                    mejorMatch = dbPk.id;
                }
            }
            
            if (mejorScore > 0.60) {
                return mejorMatch;
            }
            
            return 'NEW';
        }

        function buildMatchingUI(discrepanciasParkings, discrepanciasAgentes) {
            const bodyP = document.getElementById('bodyMatchParkings');
            const bodyA = document.getElementById('bodyMatchAgentes');
            
            bodyP.innerHTML = '';
            bodyA.innerHTML = '';
            
            if (discrepanciasParkings.length > 0) {
                document.getElementById('sectionMatchParkings').style.display = 'block';
                discrepanciasParkings.forEach((pk, idx) => {
                    const tr = document.createElement('tr');
                    
                    const propuestaId = obtenerPropuestaAparcamiento(pk, catalogosLocales.aparcamientos);
                    
                    let options = `<option value="SKIP">❌ Ometre registres d'aquest aparcament</option>`;
                    options += `<option value="NEW" ${propuestaId === 'NEW' ? 'selected' : ''}>➕ Crear com a nou aparcament en catàleg</option>`;
                    
                    const pksOrdenados = [...catalogosLocales.aparcamientos].sort((a, b) => {
                        const scoreA = a.nombre.toLowerCase().includes(pk.toLowerCase()) ? 1 : 0;
                        const scoreB = b.nombre.toLowerCase().includes(pk.toLowerCase()) ? 1 : 0;
                        return scoreB - scoreA;
                    });
                    
                    pksOrdenados.forEach(dbPk => {
                        const isSelected = dbPk.id == propuestaId ? 'selected' : '';
                        options += `<option value="${dbPk.id}" ${isSelected}>🚗 Vincular a: ${dbPk.nombre} ${isSelected ? '(Sugerido)' : ''}</option>`;
                    });
                    
                    tr.innerHTML = `
                        <td><span class="badge-entity">${pk}</span></td>
                        <td>
                            <select id="matchPk-${idx}" data-name="${pk}" onchange="updateMatch('parking', '${pk}', this.value)">
                                ${options}
                            </select>
                        </td>
                    `;
                    bodyP.appendChild(tr);
                    matchAparcamientosMap.set(pk, propuestaId);
                });
            } else {
                document.getElementById('sectionMatchParkings').style.display = 'none';
            }

            if (discrepanciasAgentes.length > 0) {
                document.getElementById('sectionMatchAgentes').style.display = 'block';
                discrepanciasAgentes.forEach((ag, idx) => {
                    const tr = document.createElement('tr');
                    
                    let options = `<option value="SKIP">❌ Ometre registres d'aquesta persona</option>`;
                    options += `<option value="NEW" selected>➕ Crear com a nou agent en catàleg</option>`;
                    
                    const agsOrdenados = [...catalogosLocales.agentes].sort((a, b) => {
                        const scoreA = a.nombre.toLowerCase().includes(ag.toLowerCase()) ? 1 : 0;
                        const scoreB = b.nombre.toLowerCase().includes(ag.toLowerCase()) ? 1 : 0;
                        return scoreB - scoreA;
                    });
                    
                    agsOrdenados.forEach(dbAg => {
                        options += `<option value="${dbAg.id}">👥 Vincular a: ${dbAg.nombre}</option>`;
                    });
                    
                    tr.innerHTML = `
                        <td><span class="badge-entity">${ag}</span></td>
                        <td>
                            <select id="matchAg-${idx}" data-name="${ag}" onchange="updateMatch('agente', '${ag}', this.value)">
                                ${options}
                            </select>
                        </td>
                    `;
                    bodyA.appendChild(tr);
                    matchAgentesMap.set(ag, 'NEW');
                });
            } else {
                document.getElementById('sectionMatchAgentes').style.display = 'none';
            }
        }

        function updateMatch(tipo, jsonName, value) {
            if (tipo === 'parking') {
                matchAparcamientosMap.set(jsonName, value);
            } else {
                matchAgentesMap.set(jsonName, value);
            }
        }

        function previsualizarImportacion() {
            const tipo = document.getElementById('tipoMigracion').value;
            const estrategia = document.querySelector('input[name="estrategia"]:checked').value;
            
            registrosParaInsertar = [];
            registrosExcluidos = [];
            
            const isCa = (window.i18n && window.i18n.getLanguage() === 'ca');
            
            if (tipo === 'comerciales') {
                document.getElementById('lblTotalRegistros').textContent = datosAImportar.length;
            } else if (tipo === 'gastos') {
                document.getElementById('lblTotalRegistros').textContent = gastosAImportar.length;
            } else {
                document.getElementById('lblTotalRegistros').textContent = registrosProcesados.length;
            }
            
            document.getElementById('lblEstrategiaTriada').textContent = estrategia === 'add' 
                ? (isCa ? 'Afegir' : 'Añadir') 
                : (isCa ? 'Sobrescriure' : 'Sobrescribir');
            
            const head = document.getElementById('headPreview');
            const body = document.getElementById('bodyPreview');
            
            head.innerHTML = '';
            body.innerHTML = '';
            
            let headers = [];
            if (tipo === 'cuadrante') {
                headers = isCa 
                    ? ['DATA', 'APARCAMENT', 'PERSONA / AGENT', 'TORN', 'HORES', 'ESTAT']
                    : ['FECHA', 'APARCAMIENTO', 'PERSONA / AGENTE', 'TURNO', 'HORAS', 'ESTADO'];
            } else if (tipo === 'vacaciones') {
                headers = isCa 
                    ? ['AGENT / PERSONA', 'INICI', 'FI', 'ESTAT']
                    : ['AGENTE / PERSONA', 'INICIO', 'FIN', 'ESTADO'];
            } else if (tipo === 'deudas') {
                headers = isCa 
                    ? ['COMERCIAL', 'CLIENT', 'IMPORT', 'DATA', 'ESTAT']
                    : ['COMERCIAL', 'CLIENTE', 'IMPORTE', 'FECHA', 'ESTADO'];
            } else if (tipo === 'comerciales') {
                headers = isCa 
                    ? ['NOM', 'PLACES LLIURES', 'TARIFA', 'NOTES']
                    : ['NOMBRE', 'PLAZAS LIBRES', 'TARIFA', 'NOTAS'];
            } else if (tipo === 'rutas') {
                headers = isCa 
                    ? ['DATA', 'TREBALLADOR', 'TIPUS', 'RECORREGUT (CONCEPTE)', 'ESTAT']
                    : ['FECHA', 'TRABAJADOR', 'TIPO', 'RECORRIDO (CONCEPTO)', 'ESTADO'];
            } else if (tipo === 'gastos') {
                headers = isCa 
                    ? ['DATA', 'TREBALLADOR', 'RECORREGUT (CONCEPTE)', 'KM', 'TARIFA', 'ESTAT']
                    : ['FECHA', 'TRABAJADOR', 'RECORRIDO (CONCEPTO)', 'KM', 'TARIFA', 'ESTADO'];
            }
            
            const trHead = document.createElement('tr');
            headers.forEach(h => {
                const th = document.createElement('th');
                th.textContent = h;
                trHead.appendChild(th);
            });
            head.appendChild(trHead);

            let countVisible = 0;
            
            if (tipo === 'comerciales') {
                const colAparcamiento = document.getElementById('match_col_aparcamiento').value;
                const colVacantes = document.getElementById('match_col_vacantes').value;
                const colTarifa = document.getElementById('match_col_tarifa').value;
                const colObservaciones = document.getElementById('match_col_observaciones').value;
                
                if (colAparcamiento === "") {
                    mostrarAlerta(isCa ? "Has de mapejar almenys la columna d'Aparcament" : "Debes mapear al menos la columna de Aparcamiento");
                    retrocederPaso(3);
                    return;
                }

                datosAImportar.forEach((row, i) => {
                    const centroName = Array.isArray(row) ? row[parseInt(colAparcamiento)] : row[colAparcamiento];
                    if (centroName === undefined || centroName === null || String(centroName).trim() === '') return;
                    
                    const pkName = String(centroName).trim().toUpperCase();
                    let coordName = 'Desconocido';
                    
                    const dbPk = catalogosLocales.aparcamientos.find(a => 
                        a.nombre.toUpperCase() === pkName || 
                        a.nombre.toUpperCase().includes(pkName) || 
                        pkName.includes(a.nombre.toUpperCase())
                    );
                    
                    if (dbPk && dbPk.coordinador) {
                        coordName = dbPk.coordinador;
                    }

                    const vacantsValue = colVacantes !== "" ? (Array.isArray(row) ? row[parseInt(colVacantes)] : row[colVacantes]) : '';
                    const tarifaValue = colTarifa !== "" ? (Array.isArray(row) ? row[parseInt(colTarifa)] : row[colTarifa]) : '';
                    const observacionesValue = colObservaciones !== "" ? (Array.isArray(row) ? row[parseInt(colObservaciones)] : row[colObservaciones]) : '';

                    registrosParaInsertar.push({
                        key: 'row_' + i,
                        coordinador: coordName,
                        centro: dbPk ? dbPk.nombre : pkName,
                        vacants: vacantsValue || '',
                        tarifa: tarifaValue || '',
                        observaciones: observacionesValue || ''
                    });
                });
                
                // Mostrar solo los primeros 15 registros de comerciales resueltos
                const maxPreview = Math.min(15, registrosParaInsertar.length);
                for (let idx = 0; idx < maxPreview; idx++) {
                    const r = registrosParaInsertar[idx];
                    const tr = document.createElement('tr');
                    
                    const cells = [r.centro, r.vacants, r.tarifa, r.observaciones];
                    cells.forEach(c => {
                        const td = document.createElement('td');
                        td.textContent = c !== undefined ? c : '';
                        tr.appendChild(td);
                    });
                    body.appendChild(tr);
                }
            } else {
                const arrIter = (tipo === 'gastos') ? gastosAImportar : registrosProcesados;
                arrIter.forEach((reg, i) => {
                    let status = 'ok';
                    let cells = [];
                    
                    if (tipo === 'deudas') {
                        const agentName = reg.comercial;
                        const destMatch = matchAgentesMap.get(agentName);
                        
                        if (destMatch === 'SKIP') {
                            status = 'skip';
                            registrosExcluidos.push(reg);
                        } else {
                            registrosParaInsertar.push({
                                comercial: agentName,
                                cliente: reg.cliente,
                                import: reg.import,
                                fecha: reg.fecha,
                                agenteId: destMatch
                            });
                            status = destMatch === 'NEW' ? 'mapped' : 'ok';
                        }
                        
                        cells = [reg.fecha, reg.comercial, reg.cliente, reg.import];
                    }
                    else if (tipo === 'vacaciones') {
                        const agentName = reg.nombre;
                        const destMatch = matchAgentesMap.get(agentName);
                        
                        if (destMatch === 'SKIP') {
                            status = 'skip';
                            registrosExcluidos.push(reg);
                        } else {
                            registrosParaInsertar.push({
                                nombre: agentName,
                                fecha_inicio: reg.fecha_inicio,
                                fecha_fin: reg.fecha_fin,
                                agenteId: destMatch
                            });
                            status = destMatch === 'NEW' ? 'mapped' : 'ok';
                        }
                        
                        cells = [reg.nombre, reg.fecha_inicio, reg.fecha_fin];
                    }
                    else if (tipo === 'cuadrante') {
                        const pkName = reg.parking;
                        const agName = reg.agente;
                        
                        const destPkMatch = matchAparcamientosMap.get(pkName);
                        const destAgMatch = agName ? matchAgentesMap.get(agName) : null;
                        
                        if (destPkMatch === 'SKIP' || destAgMatch === 'SKIP') {
                            status = 'skip';
                            registrosExcluidos.push(reg);
                        } else {
                            const parts = reg.rawParts;
                            const año = parts[2];
                            const mes = parts[3];
                            const dia = parts[parts.length - 1];
                            const turno = parts[parts.length - 2];
                            
                            const mesNum = (Number(mes) + 1).toString().padStart(2, '0');
                            const diaNum = Number(dia).toString().padStart(2, '0');
                            const fechaStr = `${año}-${mesNum}-${diaNum}`;
                            
                            registrosParaInsertar.push({
                                fecha: fechaStr,
                                parking: pkName,
                                agente: agName,
                                turno: turno,
                                horas: reg.horas,
                                es_sub: reg.es_sub,
                                nota: reg.nota,
                                parkingId: destPkMatch,
                                agenteId: destAgMatch
                            });
                            status = (destPkMatch === 'NEW' || destAgMatch === 'NEW') ? 'mapped' : 'ok';
                        }
                        
                        cells = [reg.rawParts[2] + '-' + (Number(reg.rawParts[3])+1) + '-' + reg.rawParts[reg.rawParts.length-1], reg.parking, reg.agente || '(Vaci)', reg.rawParts[reg.rawParts.length-2], reg.horas];
                    } else if (tipo === 'rutas') {
                        registrosParaInsertar.push({
                            worker: reg.worker,
                            date: reg.date,
                            stops: reg.stops,
                            festivo: reg.festivo,
                            concepto: reg.concepto
                        });
                        cells = [reg.date, reg.worker, 'Ruta Comercial', reg.concepto];
                    } else if (tipo === 'gastos') {
                        registrosParaInsertar.push({
                            fecha: reg.fecha,
                            concepto: reg.concepto,
                            km: reg.km,
                            tarifa: reg.tarifa,
                            extras: reg.extras
                        });
                        cells = [reg.fecha, empleadoIdUsuario, reg.concepto, reg.km, reg.tarifa];
                    }
                    
                    const maxRows = (tipo === 'rutas' || tipo === 'gastos') ? 15 : 100;
                    if (countVisible < maxRows && status !== 'skip') {
                        const tr = document.createElement('tr');
                        cells.forEach(c => {
                            const td = document.createElement('td');
                            td.textContent = c;
                            tr.appendChild(td);
                        });
                        
                        const tdStatus = document.createElement('td');
                        tdStatus.innerHTML = status === 'mapped' 
                            ? `<span class="preview-status mapped">${isCa ? 'Nou Catàleg' : 'Nuevo Catálogo'}</span>` 
                            : `<span class="preview-status ok">${isCa ? 'Correcte' : 'Correcto'}</span>`;
                        tr.appendChild(tdStatus);
                        
                        body.appendChild(tr);
                        countVisible++;
                    }
                });
            }
            
            const btnImport = document.getElementById('btnEjecutarMigracion');
            btnImport.innerHTML = `🚀 ${isCa ? 'Confirmar i Importar' : 'Confirmar e Importar'}`;
            btnImport.disabled = (registrosParaInsertar.length === 0);
            
            avanzarPaso(4);
        }

        async function ejecutarMigracionFinal() {
            if (!dbApi) {
                mostrarAlerta("API de base de datos no disponible.");
                return;
            }
            
            const btn = document.getElementById('btnEjecutarMigracion');
            btn.disabled = true;
            
            const tipo = document.getElementById('tipoMigracion').value;
            const estrategia = document.querySelector('input[name="estrategia"]:checked').value;
            const isCa = (window.i18n && window.i18n.getLanguage() === 'ca');
            
            btn.innerHTML = `<span class="spinner"></span> ${isCa ? 'Processant importació...' : 'Procesando importación...'}`;
            
            if (tipo === 'gastos') {
                try {
                    // Preguntar antes de importar (como pidió el usuario: "recuerda que primero se pregunta")
                    const confirmMsg = estrategia === 'overwrite'
                        ? (isCa 
                            ? "⚠️ ATENCIÓ: Es perdran TOTS els registres anteriors de Kilometratge a la base de dades. Vols continuar?"
                            : "⚠️ ATENCIÓN: Se perderán TODOS los registros anteriores de Kilometraje en la base de datos. ¿Deseas continuar?")
                        : (isCa
                            ? "⚠️ Estàs segur que vols importar els gastos? Els registres coincidents de data, treballador i kilometratge seran reemplaçats."
                            : "⚠️ ¿Estás seguro de que deseas importar los gastos? Los registros coincidentes de fecha, trabajador y kilometraje serán reemplazados.");
                    
                    if (!confirm(confirmMsg)) {
                        btn.disabled = false;
                        btn.innerHTML = `🚀 ${isCa ? 'Confirmar i Importar' : 'Confirmar e Importar'}`;
                        return;
                    }
                    
                    // Construir array de operaciones para batch
                    const opsGastos = [];
                    
                    if (estrategia === 'overwrite') {
                        opsGastos.push({ query: `
                            DELETE FROM movimientos_economicos 
                            WHERE tipo_movimiento = 'Kilometraje' AND id_usuario = ?
                        `, params: [empleadoIdUsuario] });
                    }
                    
                    for (const r of registrosParaInsertar) {
                        if (estrategia === 'add') {
                            opsGastos.push({ query: `
                                DELETE FROM movimientos_economicos 
                                WHERE id_usuario = ? AND fecha = ? AND tipo_movimiento = 'Kilometraje'
                            `, params: [empleadoIdUsuario, r.fecha] });
                        }
                        opsGastos.push({ query: `
                            INSERT INTO movimientos_economicos (id_usuario, fecha, tipo_movimiento, concepto, importe, json_detalles)
                            VALUES (?, ?, 'Kilometraje', ?, 0, ?)
                        `, params: [empleadoIdUsuario, r.fecha, r.concepto, JSON.stringify({ km: r.km, tarifa: r.tarifa, extras: r.extras })] });
                    }
                    
                    await window.dbAPI.writeBatch('finanzas', opsGastos);
                    
                    btn.disabled = false;
                    btn.innerHTML = `🚀 ${isCa ? 'Confirmar i Importar' : 'Confirmar e Importar'}`;
                    
                    document.getElementById('txtResultadoFinal').innerHTML = isCa
                        ? `S'han importat correctament <strong>${registrosParaInsertar.length}</strong> registres de kilometratge per a l'empleat <strong>${empleadoIdUsuario}</strong>.`
                        : `Se han importado correctamente <strong>${registrosParaInsertar.length}</strong> registros de kilometraje para el empleado <strong>${empleadoIdUsuario}</strong>.`;
                        
                    document.getElementById('sectionDatosExcluidos').style.display = 'none';
                    
                    avanzarPaso(5);
                } catch (errGlobal) {
                    console.error("Error global en migración de gastos:", errGlobal);
                    btn.disabled = false;
                    btn.innerHTML = `🚀 ${isCa ? 'Confirmar i Importar' : 'Confirmar e Importar'}`;
                    mostrarAlerta((isCa ? "❌ Error al executar la importació: " : "❌ Error al ejecutar la importación: ") + errGlobal.message);
                }
                return;
            }
            
            if (tipo === 'rutas') {
                try {
                    // Preguntar antes de importar (como pidió el usuario: "recuerda que primero se pregunta")
                    const confirmMsg = estrategia === 'overwrite'
                        ? (isCa 
                            ? "⚠️ ATENCIÓ: Es perdran TOTS els registres anteriors de Rutes Comercials a la base de dades. Vols continuar?"
                            : "⚠️ ATENCIÓN: Se perderán TODOS los registros anteriores de Rutas Comerciales en la datos. ¿Deseas continuar?")
                        : (isCa
                            ? "⚠️ Estàs segur que vols importar les rutes? Els registres coincidents de treballador i data seran reemplaçats."
                            : "⚠️ ¿Estás seguro de que deseas importar las rutas? Los registros coincidentes de trabajador y fecha serán reemplazados.");
                    
                    if (!confirm(confirmMsg)) {
                        btn.disabled = false;
                        btn.innerHTML = `🚀 ${isCa ? 'Confirmar i Importar' : 'Confirmar e Importar'}`;
                        return;
                    }
                    
                    // Construir array de operaciones para batch
                    const opsRutas = [];
                    
                    if (estrategia === 'overwrite') {
                        opsRutas.push({ query: "DELETE FROM movimientos_economicos WHERE tipo_movimiento = 'Ruta Comercial'", params: [] });
                    }
                    
                    for (const r of registrosParaInsertar) {
                        if (estrategia === 'add') {
                            opsRutas.push({ query: `
                                DELETE FROM movimientos_economicos 
                                WHERE id_usuario = ? AND fecha = ? AND tipo_movimiento = 'Ruta Comercial'
                            `, params: [r.worker, r.date] });
                        }
                        opsRutas.push({ query: `
                            INSERT INTO movimientos_economicos (id_usuario, fecha, tipo_movimiento, concepto, importe, json_detalles)
                            VALUES (?, ?, 'Ruta Comercial', ?, 0, ?)
                        `, params: [r.worker, r.date, r.concepto, JSON.stringify({ paradas: r.stops, festivo: r.festivo })] });
                    }
                    
                    await dbApi.writeBatch('finanzas', opsRutas);
                    
                    btn.disabled = false;
                    btn.innerHTML = `🚀 ${isCa ? 'Confirmar i Importar' : 'Confirmar e Importar'}`;
                    
                    document.getElementById('txtResultadoFinal').innerHTML = isCa
                        ? `S'han importat correctament <strong>${registrosParaInsertar.length}</strong> rutes comercials a la base de dades finances.`
                        : `Se han importado correctamente <strong>${registrosParaInsertar.length}</strong> rutas comerciales en la base de datos finanzas.`;
                        
                    document.getElementById('sectionDatosExcluidos').style.display = 'none';
                    
                    avanzarPaso(5);
                } catch (errGlobal) {
                    console.error("Error global en migración de rutas:", errGlobal);
                    btn.disabled = false;
                    btn.innerHTML = `🚀 ${isCa ? 'Confirmar i Importar' : 'Confirmar e Importar'}`;
                    mostrarAlerta((isCa ? "❌ Error al executar la importació: " : "❌ Error al ejecutar la importación: ") + errGlobal.message);
                }
                return;
            }
            
            if (tipo === 'comerciales') {
                try {
                    // Preguntar antes de importar
                    const confirmMsg = estrategia === 'overwrite'
                        ? (isCa 
                            ? "Es perdran TOTS els registres anteriors de Tarifes i Comercials a la base de dades. Vols continuar?"
                            : "Se perderán TODOS los registros anteriores de Tarifas y Comerciales en la base de datos. ¿Deseas continuar?")
                        : (isCa
                            ? "Estàs segur que vols importar els comercials? Els registres coincidents d'aparcament seran actualitzats/reemplaçats."
                            : "¿Estás seguro de que deseas importar los comerciales? Los registros coincidentes de aparcamiento serán actualizados/reemplazados.");
                    
                    if (!confirm(confirmMsg)) {
                        btn.disabled = false;
                        btn.innerHTML = `🚀 ${isCa ? 'Confirmar i Importar' : 'Confirmar e Importar'}`;
                        return;
                    }
                    
                    // Construir array de operaciones para batch
                    const ops = [];
                    
                    if (estrategia === 'overwrite') {
                        ops.push({ query: "DELETE FROM tarifas_comerciales", params: [] });
                    }
                    
                    for (const r of registrosParaInsertar) {
                        if (estrategia === 'add') {
                            ops.push({ query: "DELETE FROM tarifas_comerciales WHERE aparcamiento = ?", params: [r.centro.toUpperCase()] });
                        }
                        ops.push({ query: `
                            INSERT INTO tarifas_comerciales (coordinador, mes, anio, aparcamiento, vacantes, tarifa, observaciones)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `, params: [
                            r.coordinador || 'Desconocido',
                            new Date().getMonth() + 1,
                            new Date().getFullYear(),
                            r.centro.toUpperCase(),
                            r.vacants,
                            r.tarifa,
                            r.observaciones
                        ]});
                    }
                    
                    await dbApi.writeBatch('comercial', ops);
                    
                    // 3. Mostrar feedback y resetear UI
                    btn.disabled = false;
                    btn.innerHTML = `🚀 ${isCa ? 'Confirmar i Importar' : 'Confirmar e Importar'}`;
                    
                    const resumenMsg = isCa 
                        ? `Migració de Comerciales completada:\n- Èxits: ${registrosParaInsertar.length} registres`
                        : `Migración de Comerciales completada:\n- Éxitos: ${registrosParaInsertar.length} registros`;
                    mostrarAlerta(resumenMsg);
                    
                    reiniciarAsistente();
                } catch (errGlobal) {
                    console.error("Error global en migración de comerciales:", errGlobal);
                    btn.disabled = false;
                    btn.innerHTML = `🚀 ${isCa ? 'Confirmar i Importar' : 'Confirmar e Importar'}`;
                    mostrarAlerta((isCa ? "Error al executar la importació: " : "Error al ejecutar la importación: ") + errGlobal.message);
                }
                return;
            }
            
            try {
                let nuevosAgentes = new Set();
                let nuevosParkings = new Set();
                
                if (tipo === 'cuadrante' || tipo === 'deudas' || tipo === 'vacaciones') {
                    matchAgentesMap.forEach((val, key) => {
                        if (val === 'NEW') nuevosAgentes.add(key);
                    });
                }
                if (tipo === 'cuadrante' || tipo === 'comerciales') {
                    matchAparcamientosMap.forEach((val, key) => {
                        if (val === 'NEW') nuevosParkings.add(key);
                    });
                }
                
                if (nuevosAgentes.size > 0 || nuevosParkings.size > 0) {
                    const opsCatalogos = [];
                    
                    for (const name of nuevosAgentes) {
                        opsCatalogos.push({ query: "INSERT OR IGNORE INTO empleados (nombre, rol, activo) VALUES (?, 'Trabajador', 1)", params: [name] });
                    }
                    for (const name of nuevosParkings) {
                        opsCatalogos.push({ query: "INSERT OR IGNORE INTO aparcamientos (nombre, sociedad_id, activo) VALUES (?, 1, 1)", params: [name] });
                    }
                    
                    await dbApi.writeBatch('catalogos', opsCatalogos);
                    
                    await loadCatalogos();
                    
                    if (tipo === 'cuadrante' || tipo === 'deudas' || tipo === 'vacaciones') {
                        matchAgentesMap.forEach((val, key) => {
                            if (val === 'NEW') {
                                const dbAg = catalogosLocales.agentes.find(a => a.nombre.toUpperCase() === key.toUpperCase());
                                if (dbAg) matchAgentesMap.set(key, dbAg.id);
                            }
                        });
                    }
                    if (tipo === 'cuadrante' || tipo === 'comerciales') {
                        matchAparcamientosMap.forEach((val, key) => {
                            if (val === 'NEW') {
                                const dbPk = catalogosLocales.aparcamientos.find(p => p.nombre.toUpperCase() === key.toUpperCase());
                                if (dbPk) matchAparcamientosMap.set(key, dbPk.id);
                            }
                        });
                    }
                }

                // Construir array de operaciones para batch
                const opsOperativa = [];
                
                if (estrategia === 'overwrite') {
                    if (tipo === 'deudas') {
                        opsOperativa.push({ query: "DELETE FROM deutes", params: [] });
                    }
                    else if (tipo === 'vacaciones') {
                        opsOperativa.push({ query: "DELETE FROM vacances", params: [] });
                    }
                    else if (tipo === 'cuadrante' && registrosParaInsertar.length > 0) {
                        const fechas = registrosParaInsertar.map(r => r.fecha);
                        const minFecha = fechas.reduce((a, b) => a < b ? a : b);
                        const maxFecha = fechas.reduce((a, b) => a > b ? a : b);
                        opsOperativa.push({ query: "DELETE FROM quadrant WHERE fecha BETWEEN ? AND ?", params: [minFecha, maxFecha] });
                    }
                }

                let insertados = 0;
                
                if (tipo === 'deudas') {
                    for (const r of registrosParaInsertar) {
                        const resolvedAgId = matchAgentesMap.get(r.comercial);
                        if (resolvedAgId && resolvedAgId !== 'SKIP') {
                            let valorImport = typeof r.import === 'string' 
                                ? Number(r.import.replace(',', '.')) 
                                : Number(r.import);
                            opsOperativa.push({ query: `
                                INSERT INTO deutes (comercial, cliente, import, fecha, activo)
                                VALUES (?, ?, ?, ?, 1)
                            `, params: [r.comercial, r.cliente, valorImport, r.fecha] });
                            insertados++;
                        }
                    }
                }
                else if (tipo === 'vacaciones') {
                    for (const r of registrosParaInsertar) {
                        const resolvedAgId = matchAgentesMap.get(r.nombre);
                        if (resolvedAgId && resolvedAgId !== 'SKIP') {
                            opsOperativa.push({ query: `
                                INSERT INTO vacances (agente_id, fecha_inicio, fecha_fin)
                                VALUES (?, ?, ?)
                            `, params: [resolvedAgId, r.fecha_inicio, r.fecha_fin] });
                            insertados++;
                        }
                    }
                }
                else if (tipo === 'cuadrante') {
                    for (const r of registrosParaInsertar) {
                        const resolvedPkId = matchAparcamientosMap.get(r.parking);
                        const resolvedAgId = r.agente ? matchAgentesMap.get(r.agente) : null;
                        
                        if (resolvedPkId && resolvedPkId !== 'SKIP' && (!r.agente || (resolvedAgId && resolvedAgId !== 'SKIP'))) {
                            opsOperativa.push({ query: `
                                INSERT OR REPLACE INTO quadrant (fecha, aparcamiento_id, agente_id, turno, hora_inicio, hora_fin, es_substitucio, nota)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            `, params: [r.fecha, resolvedPkId, resolvedAgId || 0, r.turno, '06:00', '14:00', r.es_sub, r.nota] });
                            insertados++;
                        }
                    }
                }

                await dbApi.writeBatch('operativa', opsOperativa);
                
                document.getElementById('txtResultadoFinal').innerHTML = `S'han importat correctament <strong>${insertados}</strong> registres relacionals en la base de dades.`;
                
                if (registrosExcluidos.length > 0) {
                    document.getElementById('sectionDatosExcluidos').style.display = 'block';
                } else {
                    document.getElementById('sectionDatosExcluidos').style.display = 'none';
                }
                
                avanzarPaso(5);
            } catch (err) {
                btn.disabled = false;
                btn.innerHTML = '🚀 Confirmar i Importar';
                mostrarAlerta("❌ Error al executar la importació definitiva: " + err.message);
            }
        }

        function descargarExcluidosJson() {
            if (registrosExcluidos.length === 0) return;
            
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(registrosExcluidos, null, 2));
            const dlAnchorElem = document.createElement('a');
            dlAnchorElem.setAttribute("href", dataStr);
            dlAnchorElem.setAttribute("download", `Dades_Excloses_Migracio_${Date.now()}.json`);
            dlAnchorElem.click();
        }

        