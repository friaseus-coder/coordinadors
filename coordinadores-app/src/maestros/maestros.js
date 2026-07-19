// ============================================================
//  DATOS MAESTROS — Aparcamientos y Empleados
// ============================================================

// Estado interno para los paneles maestros
const _maestros = {
    aparcamientos: { modo: 'add', parsedData: null },
    empleados:     { modo: 'add', parsedData: null }
};

// Plantillas vacías por tabla
const _maestrosPlantillas = {
    aparcamientos: [
        {
            numero_obra: "OB-0001",
            nombre: "Parking Ejemplo",
            zona: "Zona 1",
            es_remotizado: 0,
            tipo_gestion: "propio",
            permitir_vacio_laborables: 0,
            sociedad_id: 1,
            coordinador_responsable: "Albert",
            activo: 1
        }
    ],
    empleados: [
        {
            agent:          "Nom Cognom",
            centre:         "NN CONCEPT",
            societat:       "ABCN",
            torn:           "MATÍ",
            zona:           "Zona 1",
            coneixements:   7.5,
            atencio:        8.0,
            disponibilitat: 9.0,
            actitud:        8.5,
            valoracio:      8.25,
            observacions:   "Sense observacions"
        }
    ]
};

/**
 * Colapsa / expande un panel maestro.
 */
function toggleMaestrosPanel(tabla) {
    const body = document.getElementById(`maestrosBody${capitalizar(tabla)}`);
    const icon = document.getElementById(`toggleIcon${capitalizar(tabla)}`);
    const isOpen = body.classList.contains('open');
    if (isOpen) {
        body.classList.remove('open');
        icon.classList.remove('open');
    } else {
        body.classList.add('open');
        icon.classList.add('open');
    }
}

function capitalizar(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Cambia el modo de importación (add / overwrite) para un panel maestro.
 */
function seleccionarModoMaestros(tabla, modo) {
    _maestros[tabla].modo = modo;

    const addEl      = document.getElementById(`modo${capitalizar(tabla)}-add`);
    const overwriteEl = document.getElementById(`modo${capitalizar(tabla)}-overwrite`);
    const hintEl     = document.getElementById(`hintModo${capitalizar(tabla)}`);

    addEl.classList.toggle('selected', modo === 'add');
    overwriteEl.classList.toggle('selected', modo === 'overwrite');
    addEl.querySelector('input').checked = (modo === 'add');
    overwriteEl.querySelector('input').checked = (modo === 'overwrite');

    if (hintEl) {
        hintEl.textContent = modo === 'add'
            ? '🔵 Añadir: inserta sin borrar los existentes.'
            : '🔴 Sobrescribir: borrará TODOS los registros antes de importar.';
        hintEl.style.color = modo === 'overwrite' ? 'var(--danger)' : 'var(--text-muted)';
    }
}

/**
 * Parsea un texto CSV con separador ; en un array de objetos.
 */
function parsearCSV(texto) {
    const SEP = ';';
    const lineas = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < texto.length; i++) {
        const ch = texto[i];
        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < texto.length && texto[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === '\n') {
                lineas.push(current);
                current = '';
            } else if (ch === '\r') {
            } else {
                current += ch;
            }
        }
    }
    if (current.trim()) lineas.push(current);

    if (lineas.length < 2) return [];

    const cabeceras = lineas[0].split(SEP).map(h => h.trim());
    const resultados = [];

    for (let i = 1; i < lineas.length; i++) {
        const linea = lineas[i].trim();
        if (!linea) continue;

        const campos = [];
        let campo = '';
        let enComillas = false;
        for (let j = 0; j < linea.length; j++) {
            const c = linea[j];
            if (enComillas) {
                if (c === '"') {
                    if (j + 1 < linea.length && linea[j + 1] === '"') {
                        campo += '"';
                        j++;
                    } else {
                        enComillas = false;
                    }
                } else {
                    campo += c;
                }
            } else {
                if (c === '"') {
                    enComillas = true;
                } else if (c === SEP) {
                    campos.push(campo.trim());
                    campo = '';
                } else {
                    campo += c;
                }
            }
        }
        campos.push(campo.trim());

        const obj = {};
        cabeceras.forEach((cab, idx) => {
            obj[cab] = campos[idx] !== undefined ? campos[idx] : '';
        });
        resultados.push(obj);
    }
    return resultados;
}

/**
 * Convierte un array de objetos a texto CSV con separador ;.
 */
function generarCSV(datos, columnas) {
    const SEP = ';';
    function escaparCampo(val) {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(SEP) || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }

    const cabecera = columnas.join(SEP);
    const filas = datos.map(obj =>
        columnas.map(col => escaparCampo(obj[col])).join(SEP)
    );
    return '\uFEFF' + cabecera + '\n' + filas.join('\n');
}

/**
 * Gestiona la selección de archivo CSV o JSON para un panel maestro.
 */
function onArchivoMaestrosSeleccionado(tabla, inputEl) {
    const file = inputEl.files[0];
    const lblEl = document.getElementById(`lblArchivo${capitalizar(tabla)}`);
    const btnImportar = document.getElementById(`btnImportar${capitalizar(tabla)}`);
    const logEl = document.getElementById(`log${capitalizar(tabla)}`);

    _maestros[tabla].parsedData = null;
    btnImportar.disabled = true;
    mostrarLogMaestros(logEl, 'info', `⏳ Leyendo archivo...`);

    if (!file) {
        lblEl.textContent = 'Ningún archivo seleccionado.';
        logEl.style.display = 'none';
        return;
    }

    const nombreArchivoMinusculas = file.name.toLowerCase();
    const esJson = nombreArchivoMinusculas.endsWith('.json');

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            let datos = null;

            if (esJson) {
                const parsed = JSON.parse(e.target.result);

                if (Array.isArray(parsed)) {
                    datos = parsed;
                } else if (parsed && typeof parsed === 'object') {
                    const candidato = Object.values(parsed).find(v => Array.isArray(v));
                    if (candidato) {
                        datos = candidato;
                    } else {
                        datos = Object.entries(parsed).map(([key, val]) => {
                            if (typeof val === 'object' && val !== null) return { nombre: key, ...val };
                            return { nombre: key };
                        });
                    }
                }
            } else {
                datos = parsearCSV(e.target.result);
            }

            if (!datos || datos.length === 0) {
                throw new Error(esJson 
                    ? 'El JSON no contiene un array de registros válido.' 
                    : 'El CSV no contiene registros válidos. Asegúrate de que la primera fila sean las cabeceras.');
            }

            // Normalizar para empleados
            if (tabla === 'empleados') {
                datos = datos.map(item => {
                    const nombre = item.agent || item.nombre || item.name || item.nom || '';
                    
                    let jsonPrefs = null;
                    if (esJson && item.json_preferencias) {
                        jsonPrefs = item.json_preferencias;
                    } else {
                        jsonPrefs = JSON.stringify({
                            centre:   item.centre   || null,
                            societat: item.societat || null,
                            torn:     item.torn     || null,
                            zona:     item.zona     || null
                        });
                    }

                    return {
                        nombre:            nombre,
                        email:             item.email || item.mail || null,
                        rol:               item.rol || item.role || 'Coordinador',
                        activo:            item.activo !== undefined && item.activo !== '' ? Number(item.activo) : 1,
                        json_preferencias: jsonPrefs,
                        coneixements:   parseFloat(item.coneixements)   || 0,
                        atencio:        parseFloat(item.atencio)        || 0,
                        disponibilitat: parseFloat(item.disponibilitat) || 0,
                        actitud:        parseFloat(item.actitud)        || 0,
                        valoracio:      parseFloat(item.valoracio)      || 0,
                        observacions:   item.observacions || null
                    };
                }).filter(r => r.nombre && r.nombre.trim() !== '');
            }

            // Normalizar para aparcamientos
            if (tabla === 'aparcamientos') {
                datos = datos.map(item => ({
                    numero_obra:                item.numero_obra || null,
                    nombre:                     item.nombre || item.name || item.nom || '',
                    zona:                       item.zona || null,
                    es_remotizado:              item.es_remotizado !== undefined && item.es_remotizado !== '' ? Number(item.es_remotizado) : 0,
                    tipo_gestion:               item.tipo_gestion || null,
                    permitir_vacio_laborables:  item.permitir_vacio_laborables !== undefined && item.permitir_vacio_laborables !== '' ? Number(item.permitir_vacio_laborables) : 0,
                    sociedad_id:                item.sociedad_id || null,
                    coordinador_responsable:    item.coordinador_responsable || null,
                    activo:                     item.activo !== undefined && item.activo !== '' ? Number(item.activo) : 1
                })).filter(r => r.nombre && r.nombre.trim() !== '');
            }

            _maestros[tabla].parsedData = datos;
            lblEl.textContent = `✅ ${file.name} — ${datos.length} registro(s) listos.`;
            lblEl.style.color = 'var(--success)';
            btnImportar.disabled = false;
            mostrarLogMaestros(logEl, 'info', `📋 ${datos.length} registro(s) parseados correctamente. Haz clic en "Importar" para confirmar.`);

        } catch(err) {
            console.error(`[Maestros/${tabla}] Error al parsear el archivo:`, err);
            lblEl.textContent = `❌ Error al leer el archivo: ${err.message}`;
            lblEl.style.color = 'var(--danger)';
            btnImportar.disabled = true;
            mostrarLogMaestros(logEl, 'error', `❌ Error al parsear el archivo: ${err.message}`);
        }
    };
    reader.onerror = () => {
        mostrarLogMaestros(logEl, 'error', '❌ Error al leer el archivo.');
    };
    reader.readAsText(file, 'UTF-8');
}

/**
 * Descarga los datos actuales de una tabla maestros o una plantilla si está vacía.
 */
async function descargarDatosMaestros(tabla) {
    if (!window.dbAPI) {
        mostrarAlerta('API de base de datos no disponible.');
        return;
    }

    const logEl = document.getElementById(`log${capitalizar(tabla)}`);
    mostrarLogMaestros(logEl, 'info', `⏳ Leyendo tabla ${tabla}...`);

    try {
        let datosExport = [];

        if (tabla === 'empleados') {
            const filas = await window.dbAPI.read('catalogos', `SELECT * FROM empleados`, []);
            let rankingMap = {};
            try {
                const rankingRows = await window.dbAPI.read('operativa',
                    `SELECT id_trabajador, coneixements, atencio, disponibilitat, actitud, valoracio, observacions FROM ranking`, []);
                if (rankingRows) {
                    for (const r of rankingRows) {
                        rankingMap[r.id_trabajador] = r;
                    }
                }
            } catch(e) {
                console.warn('[Descarga Maestros] No se pudo leer ranking:', e.message);
            }

            if (filas && filas.length > 0) {
                datosExport = filas.map(emp => {
                    let prefs = {};
                    try {
                        if (emp.json_preferencias) {
                            prefs = JSON.parse(emp.json_preferencias);
                        }
                    } catch(e) {}

                    const rk = rankingMap[emp.nombre] || {};

                    return {
                        agent:          emp.nombre,
                        email:          emp.email || null,
                        rol:            emp.rol || 'Coordinador',
                        activo:         emp.activo !== undefined ? emp.activo : 1,
                        centre:         prefs.centre || null,
                        societat:       prefs.societat || null,
                        torn:           prefs.torn || null,
                        zona:           prefs.zona || null,
                        coneixements:   rk.coneixements || 0,
                        atencio:        rk.atencio || 0,
                        disponibilitat: rk.disponibilitat || 0,
                        actitud:        rk.actitud || 0,
                        valoracio:      rk.valoracio || 0,
                        observacions:   rk.observacions || null
                    };
                });
            }

        } else if (tabla === 'aparcamientos') {
            const filas = await window.dbAPI.read('catalogos',
                `SELECT numero_obra, nombre, zona, es_remotizado, tipo_gestion,
                        permitir_vacio_laborables, sociedad_id, coordinador_responsable, activo
                 FROM aparcamientos`, []);

            if (filas && filas.length > 0) {
                datosExport = filas;
            }
        }

        const columnasCSV = {
            aparcamientos: ['numero_obra','nombre','zona','es_remotizado','tipo_gestion','permitir_vacio_laborables','sociedad_id','coordinador_responsable','activo'],
            empleados:     ['agent','email','rol','activo','centre','societat','torn','zona','coneixements','atencio','disponibilitat','actitud','valoracio','observacions']
        };

        let contenido;
        let nombreArchivo;
        const columnas = columnasCSV[tabla];

        if (datosExport.length > 0) {
            contenido = generarCSV(datosExport, columnas);
            nombreArchivo = `${tabla}_${new Date().toISOString().slice(0,10)}.csv`;
            mostrarLogMaestros(logEl, 'success', `✅ ${datosExport.length} registro(s) exportados en formato CSV.`);
        } else {
            contenido = generarCSV(_maestrosPlantillas[tabla], columnas);
            nombreArchivo = `plantilla_${tabla}.csv`;
            mostrarLogMaestros(logEl, 'info', `ℹ️ La tabla ${tabla} está vacía. Se descarga una plantilla CSV.`);
        }

        const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = nombreArchivo;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);

    } catch(err) {
        console.error(`[Maestros/${tabla}] Error al descargar:`, err);
        mostrarLogMaestros(logEl, 'error', `❌ Error al leer la base de datos: ${err.message}`);
    }
}

/**
 * Importa los datos mediante IPC al Main Process.
 */
async function importarDatosMaestros(tabla) {
    if (!window.api) {
        mostrarAlerta('API principal no disponible.');
        return;
    }

    const datos    = _maestros[tabla].parsedData;
    const modo     = _maestros[tabla].modo;
    const logEl    = document.getElementById(`log${capitalizar(tabla)}`);
    const btnEl    = document.getElementById(`btnImportar${capitalizar(tabla)}`);

    if (!datos || datos.length === 0) {
        mostrarLogMaestros(logEl, 'error', '❌ No hay datos válidos para importar.');
        return;
    }

    if (modo === 'overwrite') {
        const confirmar = confirm(
            `⚠️ ATENCIÓN: Se borrarán TODOS los registros de ${tabla} antes de importar.\n` +
            `Se insertarán ${datos.length} nuevo(s) registro(s).\n\n¿Deseas continuar?`
        );
        if (!confirmar) return;
    }

    btnEl.disabled = true;
    btnEl.innerHTML = '<span class="spinner"></span> Importando...';
    mostrarLogMaestros(logEl, 'info', '⏳ Iniciando importación transaccional...');

    try {
        let resultado;
        if (tabla === 'empleados') {
            resultado = await window.api.importarEmpleadosMaestros(datos, modo);
        } else if (tabla === 'aparcamientos') {
            resultado = await window.api.importarAparcamientosMaestros(datos, modo);
        }

        if (resultado.success) {
            mostrarAlerta(resultado.message);
            mostrarLogMaestros(logEl, 'success', resultado.message);
            if(window.parent && typeof window.parent.loadCatalogos === 'function') {
                 window.parent.loadCatalogos();
            }
        } else {
            mostrarAlerta(`❌ Error: ${resultado.error}`);
            mostrarLogMaestros(logEl, 'error', `❌ Error: ${resultado.error}`);
        }
    } catch(errGlobal) {
        console.error(`[Maestros/${tabla}] Error global:`, errGlobal);
        mostrarLogMaestros(logEl, 'error', `❌ Error inesperado: ${errGlobal.message}`);
        mostrarAlerta(`❌ Error al ejecutar la importación: ${errGlobal.message}`);
    } finally {
        btnEl.disabled = false;
        btnEl.innerHTML = '🚀 Importar';
    }
}

function mostrarLogMaestros(logEl, tipo, mensaje) {
    logEl.textContent = mensaje;
    logEl.className = `maestros-status-log ${tipo}`;
    logEl.style.display = 'block';
}

// ============================================================
// COMPONENTE ALPINE.JS: EDICIÓN INDIVIDUAL DE EMPLEADOS (OCC)
// ============================================================
function empleadosManager() {
    return {
        open: false,
        search: '',
        empleados: [],
        newEmp: { nombre: '', rol: 'Trabajador' },
        toast: { show: false, message: '', type: '' },
        loading: false,

        get filteredEmpleados() {
            if (this.search === '') return this.empleados;
            const s = this.search.toLowerCase();
            return this.empleados.filter(e => 
                e.nombre.toLowerCase().includes(s) || 
                (e.email && e.email.toLowerCase().includes(s))
            );
        },

        async init() {
            if (this.open) {
                await this.loadEmpleados();
            }
            this.$watch('open', async (val) => {
                if (val && this.empleados.length === 0) {
                    await this.loadEmpleados();
                }
            });
        },

        async loadEmpleados() {
            try {
                const filas = await window.dbAPI.read('catalogos', 'SELECT * FROM empleados ORDER BY nombre ASC', []);
                this.empleados = filas.map(f => ({
                    ...f,
                    isDirty: false
                }));
            } catch (err) {
                this.showToast('❌ Error cargando empleados: ' + err.message, 'error');
            }
        },

        async saveEmpleado(emp) {
            this.loading = true;
            try {
                // OCC Update
                const query = "UPDATE empleados SET nombre = ?, email = ?, rol = ?, activo = ?, version = version + 1 WHERE id = ? AND version = ?";
                const params = [emp.nombre, emp.email || null, emp.rol, emp.activo, emp.id, emp.version];
                
                const result = await window.dbAPI.write('catalogos', query, params, emp.version);

                if (result.success) {
                    this.showToast(`✅ Empleado ${emp.nombre} guardado correctamente.`, 'success');
                    emp.version += 1;
                    emp.isDirty = false;
                } else {
                    if (result.error && result.error.includes('CONFLICT')) {
                        this.showToast('⚠️ CONFLICTO: Alguien más modificó este empleado. Recarga la tabla.', 'error');
                    } else {
                        this.showToast('❌ Error al guardar: ' + result.error, 'error');
                    }
                }
            } catch (err) {
                if (err.message && err.message.includes('CONFLICT')) {
                    this.showToast('⚠️ CONFLICTO: Alguien más modificó este empleado. Recarga la tabla para ver los cambios recientes.', 'error');
                } else {
                    this.showToast('❌ Error: ' + err.message, 'error');
                }
            } finally {
                this.loading = false;
            }
        },

        async crearEmpleado() {
            this.loading = true;
            try {
                const query = "INSERT INTO empleados (nombre, rol, activo, version) VALUES (?, ?, 1, 1)";
                const params = [this.newEmp.nombre, this.newEmp.rol];
                const result = await window.dbAPI.write('catalogos', query, params);
                
                if (result.success) {
                    this.showToast(`✅ Nuevo empleado añadido: ${this.newEmp.nombre}`, 'success');
                    this.newEmp = { nombre: '', rol: 'Trabajador' };
                    await this.loadEmpleados();
                } else {
                    this.showToast('❌ Error al crear: ' + result.error, 'error');
                }
            } catch (err) {
                this.showToast('❌ Error: ' + err.message, 'error');
            } finally {
                this.loading = false;
            }
        },

        showToast(message, type) {
            this.toast = { show: true, message, type };
            setTimeout(() => {
                this.toast.show = false;
            }, 5000);
        },

        getTranslatedRol(rol) {
            return window.DbLanguageMap ? window.DbLanguageMap.translate(rol, 'rol', window.i18n ? window.i18n.getLanguage() : 'ca') : rol;
        }
        }
    }
}
