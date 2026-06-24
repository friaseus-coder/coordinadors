/**
 * i18n.js - Soporte multi-idioma (Catalán / Castellano) para los menús y la interfaz
 * de la Intranet de Coordinadores.
 */

const i18n = (() => {
  // Obtener idioma activo (por defecto catalán 'ca')
  function getLanguage() {
    return localStorage.getItem('nyn_idioma') || 'ca';
  }
  
  function setLanguage(lang) {
    if (lang === 'ca' || lang === 'es') {
      localStorage.setItem('nyn_idioma', lang);
      
      // Traducir la ventana actual
      translatePage();
      window.dispatchEvent(new CustomEvent('languageChanged', { detail: lang }));
      
      // Propagar síncronamente a los iframes hijos
      const iframes = document.querySelectorAll('iframe');
      if (iframes.length > 0) {
        iframes.forEach(iframe => {
          try {
            if (iframe.contentWindow) {
              iframe.contentWindow.localStorage.setItem('nyn_idioma', lang);
              if (iframe.contentWindow.i18n) {
                iframe.contentWindow.i18n.translatePage();
                iframe.contentWindow.dispatchEvent(new CustomEvent('languageChanged', { detail: lang }));
              }
            }
          } catch (e) {}
        });
      }

      // Propagar hacia arriba si estamos en un iframe hijo
      try {
        if (window.parent && window.parent !== window) {
          window.parent.localStorage.setItem('nyn_idioma', lang);
          if (window.parent.i18n) {
            window.parent.i18n.setLanguage(lang);
          }
        }
      } catch (e) {}
    }
  }

  const translations = {
    ca: {
      // Login (index.html)
      loginTitle: "Intranet de Coordinadors",
      loginSubtitle: "Selecciona el teu perfil d'accés per entrar al sistema",
      roleAdminTitle: "Cap d'Operacions",
      roleAdminDesc: "Accés total d'administrador. Permet desar canvis i forçar el desbloqueig de fitxers.",
      roleCoordTitle: "Coordinador",
      roleCoordDesc: "Mode d'edició amb bloqueig. Permet modificar fitxers controlant la concurrència.",
      roleComercialTitle: "Comercials",
      roleComercialDesc: "Accés de només lectura per a comercials. Permet consultar disponibilitat i preus.",
      selectNameLabel: "Selecciona el teu nom:",
      customNameLabel: "Escriu el teu nom:",
      enterPortal: "Entrar al Portal",
      loadingCoords: "-- Carregant coordinadors... --",
      selectCoordDefault: "-- Tria un coordinador --",
      otherCustomCoord: "Altre (Especificar...)",
      
      // Portal (portal.html)
      tabHome: "🏠 Inici",
      tabQuadrant: "📋 Quadrant",
      tabRoutes: "📍 Rutes",
      tabRanking: "⭐ Ranking",
      tabComercials: "💰 Comercials",
      tabVacances: "🏖️ Vacances",
      tabDeutes: "⏳ Deutes",
      tabChecklist: "✅ Chklst",
      tabGastos: "💸 Despeses",
      tabInventari: "📦 Inventari",
      tabSac: "🛠️ SAC",
      tabNotificador: "📩 Notificador",
      tabLog: "📜 Log",
      tabRegles: "📋 Normes",
      tabMore: "➕ Més",
      reglesTitle: "📋 Normes del Quadrant",
      reglesSubtitle: "Configuració dels paràmetres operatius i regles de negoci.",
      colRuleClave: "CLAU",
      colRuleDesc: "DESCRIPCIÓ",
      colRuleValor: "VALOR ACTUAL",
      colRuleCategoria: "CATEGORIA",
      btnSaveRules: "💾 Desar Canvis",
      btnAddRuleTitle: "➕ Afegir Nova Norma",
      lblRuleClave: "Clau de la norma (ex: max_hores)",
      lblRuleDesc: "Descripció funcional",
      lblRuleTipo: "Tipus de dada",
      lblRuleCat: "Categoria",
      lblRuleValor: "Valor inicial",
      btnAddRule: "Afegir Norma",
      ruleTypeNumber: "Número",
      ruleTypeBoolean: "Booleà (0 / 1)",
      ruleTypeString: "Text",
      successSaveRules: "✅ S'han desat els canvis en les normes correctament.",
      successAddRule: "✅ Norma afegida correctament a la base de dades.",
      errorAddRuleExists: "⚠️ Aquesta clau ja existeix a la base de dades.",
      reglesCobTitle: "Cobertures Obligatòries (Dies Específics)",
      reglesCobSubtitle: "Torns presencials requerits per a un dia concret de l'any. S'eliminaran automàticament al Tancar el Mes corresponent.",
      colCobAparcamiento: "Aparcament",
      colCobFecha: "Data",
      colCobTurno: "Torn",
      colCobHorario: "Horari",
      colCobAcciones: "Accions",
      reglesAddCobTitle: "➕ Afegir Cobertura Obligatòria Temporal",
      lblCobAparcamiento: "Aparcament",
      lblCobFecha: "Data del Calendari",
      lblCobTurno: "Torn",
      lblCobHoraInicio: "Hora Inici",
      lblCobHoraFin: "Hora Fi",
      btnAddCob: "Afegir Cobertura",
      optSelectAparcamiento: "-- Selecciona Aparcament --",
      sacTitle: "Gestor d'incidències pàrkings (SAC)",
      lblSacCentre: "Selecciona el centre:",
      optSacSelectCentre: "-- Escull el centre --",
      lblSacZona: "Zona específica de la incidència:",
      placeholderSacZona: "Ex: Planta -2, rampa d'entrada, plaça 22...",
      lblSacAssumpte: "Resum breu (per l'assumpte):",
      placeholderSacAssumpte: "Ex: Enllumenat fos, Mirall trencat",
      lblSacMotiu: "Motiu detallat:",
      placeholderSacMotiu: "Descriviu aquí els detalls...",
      lblSacUrgencia: "Nivell d'urgència:",
      optUrgenciaBaixa: "baixa",
      optUrgenciaMitjana: "mitjana",
      optUrgenciaAlta: "alta",
      optUrgenciaUrgent: "urgent",
      optUrgenciaCritica: "CRÍTICA",
      lblSacCopia: "Còpia opcional a:",
      btnSacGenerar: "GENERAR CORREU",
      sacAlertFields: "Si us plau, omple tots els camps obligatoris.",
      sacAlertObert: "SAC: Obert formulari d'incidències",
      welcome: "Benvingut",
      datacenter: "(centre de dades coordinadors)",
      btnUnlockFiles: "Desbloquejar Fitxers",
      btnManageCoord: "⚙️ Coordinadors",
      btnAdministration: "⚙️ Administració",
      btnExitApp: "🚪 Sortir",
      confirmExitApp: "Atenció: Estàs a punt de tancar l'aplicació. Això alliberarà tots els teus bloquejos actius. Vols continuar?",
      celebrationNone: "Avui no se celebra res especial al món 🙁",
      celebrationSpecial: "🌟 Feliç dia de <b>{day}</b>!",
      confirmUnlockAll: "Atenció: Estàs a punt de desbloquejar manualment tots els fitxers del sistema. Això eliminarà qualsevol bloqueig actiu. Desitges continuar?",
      successUnlockAll: "S'han desbloquejat correctament tots els fitxers.",
      errorUnlockAll: "Error en desbloquejar: ",
      
      // Modal Coordinadores (portal.html)
      modalTitle: "⚙️ Gestió de Coordinadors",
      inputNomPlaceholder: "Nom (ex: Marc)",
      inputCognomPlaceholder: "Cognom (ex: López)",
      btnAdd: "➕ Afegir",
      btnRemove: "✕ Eliminar",
      btnClose: "Tancar",
      confirmRemoveCoord: "⚠️ Estàs segur que vols eliminar a {name} de la llista de coordinadors?\n\n(Les seves dades NO s'esborraran)",
      btnManageAparcaments: "🚗 Aparcaments",
      modalAparcamentTitle: "🚗 Gestió d'Aparcaments",
      inputAparcamentPlaceholder: "Nom de l'aparcament (ex: BEJAR 63)",
      selectCoordPlaceholder: "-- Coordinador --",
      confirmRemoveAparcament: "⚠️ Estàs segur que vols eliminar l'aparcament {name}?\n\n(Això no esborrarà els historials ja guardats)",
      importSectionTitle: "MIGRACIÓ E IMPORTACIÓ DE DADES",
      btnImportJson: "📥 Importar JSON històric",
      confirmImport: "⚠️ Estàs segur que vols importar aquest fitxer JSON?\n\nAixò sobreescriurà les dades actuals en SQLite d'aquest mòdul per a tu.",
      successImport: "✅ Dades importades correctament a la base de dades SQLite del coordinador.",
      
      // Comercials (comercials.html)
      comercialsTitle: "Disponibilitat i Preus",
      placeholderSearch: "🔍 Cercar aparcament (centre o adreça)...",
      colCentre: "CENTRE",
      colAdreça: "ADREÇA",
      colFixes: "FIXES",
      colVariables: "VARIABLES",
      colVacants: "VACANTS",
      colTarifa: "TARIFA (promig)",
      colObs: "OBSERVACIONS",
      legendApte: "<10 apte",
      legendRisc: "10-25 risc",
      legendNoApte: ">25 no apte (urgent abonar)",
      shortcuts: "Dreceres de teclat",
      btnAddCentre: "+ afegir centre",
      btnResetData: "⚠️ esborrar dades",
      btnCopyMonth: "📋 Copiar a altre mes/any",
      confirmResetComercials: "⚠️⚠️⚠️ ATENCIÓ ⚠️⚠️⚠️\n\nEstàs a punt de buidar la taula de: {name}.\n\n❗ Aquesta acció NO té volta enrere.\n❗ Es perdran definitivament totes les dades d'aquest mes.\n\nVols continuar?",
      confirmCopyComercials: "Estàs segur que vols copiar les dades de {from} a {to}?",
      successCopyComercials: "✅ Dades copiades amb èxit a {to}.",
      errorWriteDest: "❌ Error al desar el fitxer de destí: ",
      errorApiNotAvailable: "❌ Error: API d'Electron no disponible.",
      errorNoDataToCopy: "⚠️ No hi ha dades en el mes actual per poder copiar.",
      errorDestExists: "⚠️ Error: Ja existeixen dades guardades a {to}. No es permet sobreescriure.",
      confirmDeleteCentre: "Eliminar centre?",
      errorNoPermission: "⚠️ No tens permisos per realitzar accions sobre aquest comercial.",
      promptDestMonth: "Introdueix el MES de destí (gener, febrer, marc, abril, maig, juny, juliol, agost, setembre, octubre, novembre, desembre):",
      errorInvalidMonth: "⚠️ Mes no vàlid.",
      promptDestYear: "Introdueix l'ANY de destí (ej: 2026, 2027, 2028):",
      errorInvalidYear: "⚠️ Any no vàlid.",
      errorSameSourceDest: "⚠️ El mes i any de destí són els mateixos que els d'origen.",
      optGener: "GENER",
      optFebrer: "FEBRER",
      optMarc: "MARÇ",
      optAbril: "ABRIL",
      optMaig: "MAIG",
      optJuny: "JUNY",
      optJuliol: "JULIOL",
      optAgost: "AGOST",
      optSetembre: "SETEMBRE",
      optOctubre: "OCTUBRE",
      optNovembre: "NOVEMBRE",
      optDesembre: "DESEMBRE",
      // Vacances (vacances.html)
      vacancesAddRow: "➕ Afegir Fila",
      vacancesManageData: "⚙️ Gestionar Dades",
      vacancesExportExcel: "📥 Exportar Excel",
      vacancesExportJSON: "💾 Exportar",
      vacancesImportJSON: "📂 Importar",
      vacancesClearData: "🗑️ Esborrar dades",
      vacancesLastExportNone: "Última exportació: Mai",
      vacancesLastExportPrefix: "Última exportació: ",
      vacancesTitle: "VACANCES PÀRKINGS",
      colTrabajador: "TREBALLADOR",
      vacancesPeriod1: "1er PERÍODE",
      vacancesPeriod2: "2on PERÍODE",
      vacancesDisfrutados: "DISFRUTATS",
      vacancesPendientes: "PENDENTS",
      vacancesCorrespondientes: "CORRESPONENTS",
      vacancesFestivosPeriodo: "FESTIUS PERÍODE",
      vacancesNumFestivos: "Nº FESTIUS",
      vacancesBolsaHoras: "BOSSA HORES",
      vacancesObservaciones: "OBSERVACIONS",
      vacancesManageDataModal: "⚙️ GESTIONAR DADES",
      vacancesLabelTypeList: "TIPUS DE LLISTA:",
      vacancesOptCentres: "Centres",
      vacancesOptTreballadors: "Treballadors",
      vacancesOptAnys: "Anys",
      vacancesLabelSelectElement: "SELECCIONA ELEMENT:",
      vacancesLabelNameEdit: "NOM (AFEGIR O MODIFICAR):",
      vacancesPlaceholderWrite: "Escriu aquí...",
      vacancesBtnAddNew: "➕ Afegir Nou",
      vacancesBtnModify: "✏️ Modificar",
      vacancesBtnDelete: "🗑️ Eliminar",
      vacancesBtnClose: "Tancar",
      vacancesErrorImport: "⚠️ Error al importar.",
      vacancesErrorNoDataExport: "No hi ha dades visibles per exportar.",
      vacancesConfirmResetAll: "⚠️ Esborrar tot?",
      vacancesConfirmDelete: "Segur que vols eliminar \"{val}\"?",
      // Cuadrante & Rutas (quadrant.html, ruta.html)
      displayMonth: "Mes de ",
      rellotge: "Rellotge",
      llegendaExport: "| Darrera exportació: Sense dades",
      llegendaExportPrefix: "| Darrera exportació: ",
      quadrantLabelPeriodo: "📅 Període:",
      quadrantLabelFiltros: "🔍 Filtres:",
      quadrantOptAllCentres: "Tots els Centres",
      quadrantOptAllWorkers: "Tots els Treballadors",
      quadrantOptAllHours: "Tots els Horaris / Torns",
      quadrantOptMati: "Només Matí",
      quadrantOptTarda: "Només Tarda",
      quadrantOptNit: "Només Nit",
      quadrantBtnResetFilters: "♻️ Reset Filtres",
      quadrantLabelAcciones: "⚡ Accions:",
      quadrantBtnRecompte: "📊 Recompte Hores",
      quadrantBtnManageData: "⚙️ Gestionar Dades",
      quadrantBtnExportNext: "🚚 Exportar a ...",
      quadrantBtnCloseMonth: "🔒 Tancar Mes",
      quadrantBtnAlertes: "⚠️ Alertes ({count})",
      quadrantLabelArchivos: "💾 Fitxers:",
      quadrantBtnExcel: "📥 Excel",
      quadrantBtnPrint: "🖨️ Imprimir",
      quadrantBtnExportBackup: "💾 Exportar Backup",
      quadrantBtnImportBackup: "📂 Importar Backup",
      quadrantBtnImportVacances: "🌴 Importar Vacances",
      quadrantBtnClearMonth: "🗑️ Esborrar dades del mes",
      quadrantAlertsTitle: "⚠️ SITUACIONS PER SOLUCIONAR (ALERTES DE NEGOCI)",
      // Rutas
      rutaTitle: "Full de Visites 2026",
      rutaLabelMes: "Mes:",
      rutaBtnManage: "⚙️ Editar Centres / Backup",
      rutaManageTitle: "Gestió de Centres",
      rutaBtnEdit: "📝 Editar",
      rutaBtnDelete: "🗑️ Eliminar",
      rutaBtnClose: "Tancar",
      rutaLegendNational: "Festiu nacional",
      rutaLegendLocal: "Festiu local",
      rutaLegendConvenio: "Festiu conveni",
      rutaLegendEmpresa: "Festiu empresa",
      rutaLegendVigilia: "Vigília",
      rutaLegendNight: "Visita nocturna",
      rutaLegendHoliday: "Festiu",
      rutaLegendExportNone: "|  Darrera exportació rutes: Cap dada encara",
      rutaLegendExportPrefix: "|  Darrera exportació rutes: ",
      rutaBtnResetAlbert: "⚠️ Reset Albert",
      rutaBtnResetLaura: "⚠️ Reset Laura",
      rutaBtnExportAlbert: "💾 Exportar Albert",
      rutaBtnExportLaura: "💾 Exportar Laura",
      rutaBtnImportAlbert: "📂 Importar Albert",
      rutaBtnImportLaura: "📂 Importar Laura",
      colJornada: "JORNADA",
      quadrantOptFrangesHoraries: "Franges Horàries",
      quadrantTitleRecompte: "📊 RECOMPTE D'HORES",
      asistenteTitle: "Assistent",
      asistenteBtnDesasignar: "Desassignar",
      asistenteRecomendados: "Recomanats",
      asistenteDescartados: "Descartats",
      asistenteNoSugeridos: "No hi ha treballadors suggerits.",
      asistenteNoDescartados: "No hi ha treballadors descartats.",
      asistenteExterno: "EXTERN",
      asistenteRanking: "Rànquing",
      asistenteHorasMes: "Hores mes",
      asistenteConflictosOk: "Sense conflictes",
      asistenteAsignar: "ASSIGNAR",
      asistenteLabelDesasignar: "Desassignar torn / Deixar buit",
      mappingModalTitle: "📂 MAPEIG DE DADES D'IMPORTACIÓ",
      mappingModalDesc: "S'han detectat discrepàncies entre els centres/treballadors del fitxer seleccionat i el teu catàleg local. Si us plau, indica com s'han d'associar aquests elements:",
      mappingModalCentres: "🏢 centres no coincidents",
      mappingModalTreballadors: "👤 treballadors no coincidents",
      mappingModalBtnCancel: "Cancel·lar",
      mappingModalBtnConfirm: "Confirmar Importació"
    },
    es: {
      // Login (index.html)
      loginTitle: "Intranet de Coordinadores",
      loginSubtitle: "Selecciona tu perfil de acceso para ingresar al sistema",
      roleAdminTitle: "Jefe de Operaciones",
      roleAdminDesc: "Acceso total de administrador. Permite guardar cambios y forzar el desbloqueo de archivos.",
      roleCoordTitle: "Coordinador",
      roleCoordDesc: "Modo de edición con bloqueo. Permite modificar archivos controlando la concurrencia.",
      roleComercialTitle: "Comerciales",
      roleComercialDesc: "Acceso de solo lectura para comerciales. Permite consultar disponibilidad y precios.",
      selectNameLabel: "Selecciona tu nombre:",
      customNameLabel: "Escribe tu nombre:",
      enterPortal: "Entrar al Portal",
      loadingCoords: "-- Cargando coordinadores... --",
      selectCoordDefault: "-- Elige un coordinador --",
      otherCustomCoord: "Otro (Especificar...)",
      
      // Portal (portal.html)
      tabHome: "🏠 Inicio",
      tabQuadrant: "📋 Cuadrante",
      tabRoutes: "📍 Rutas",
      tabRanking: "⭐ Ranking",
      tabComercials: "💰 Comerciales",
      tabVacances: "🏖️ Vacaciones",
      tabDeutes: "⏳ Deudas",
      tabChecklist: "✅ Chklst",
      tabGastos: "💸 Gastos",
      tabInventari: "📦 Inventario",
      tabSac: "🛠️ SAC",
      tabNotificador: "📩 Notificador",
      tabLog: "📜 Log",
      tabRegles: "📋 Normas",
      tabMore: "➕ Más",
      reglesTitle: "📋 Normas del Cuadrante",
      reglesSubtitle: "Configuración de los parámetros operativos y reglas de negocio.",
      colRuleClave: "CLAVE",
      colRuleDesc: "DESCRIPCIÓN",
      colRuleValor: "VALOR ACTUAL",
      colRuleCategoria: "CATEGORÍA",
      btnSaveRules: "💾 Guardar Cambios",
      btnAddRuleTitle: "➕ Añadir Nueva Norma",
      lblRuleClave: "Clave de la norma (ej: max_horas)",
      lblRuleDesc: "Descripción funcional",
      lblRuleTipo: "Tipo de dato",
      lblRuleCat: "Categoría",
      lblRuleValor: "Valor inicial",
      btnAddRule: "Añadir Norma",
      ruleTypeNumber: "Número",
      ruleTypeBoolean: "Booleano (0 / 1)",
      ruleTypeString: "Texto",
      successSaveRules: "✅ Se han guardado los cambios en las normas correctamente.",
      successAddRule: "✅ Norma añadida correctamente en la base de datos.",
      errorAddRuleExists: "⚠️ Esta clave ya existe en la base de datos.",
      reglesCobTitle: "Coberturas Obligatorias (Días Específicos)",
      reglesCobSubtitle: "Turnos presenciales requeridos para un día concreto del año. Se eliminarán automáticamente al Cerrar el Mes correspondiente.",
      colCobAparcamiento: "Aparcamiento",
      colCobFecha: "Fecha",
      colCobTurno: "Turno",
      colCobHorario: "Horario",
      colCobAcciones: "Acciones",
      reglesAddCobTitle: "➕ Añadir Cobertura Obligatoria Temporal",
      lblCobAparcamiento: "Aparcamiento",
      lblCobFecha: "Fecha del Calendario",
      lblCobTurno: "Turno",
      lblCobHoraInicio: "Hora Inicio",
      lblCobHoraFin: "Hora Fin",
      btnAddCob: "Añadir Cobertura",
      optSelectAparcamiento: "-- Selecciona Aparcamiento --",
      sacTitle: "Gestor de incidencias parkings (SAC)",
      lblSacCentre: "Selecciona el centro:",
      optSacSelectCentre: "-- Elige el centro --",
      lblSacZona: "Zona específica de la incidencia:",
      placeholderSacZona: "Ej: Planta -2, rampa de entrada, plaza 22...",
      lblSacAssumpte: "Resumen breve (para el asunto):",
      placeholderSacAssumpte: "Ej: Alumbrado fundido, Espejo roto",
      lblSacMotiu: "Motivo detallado:",
      placeholderSacMotiu: "Describa aquí los detalles...",
      lblSacUrgencia: "Nivel de urgencia:",
      optUrgenciaBaixa: "baja",
      optUrgenciaMitjana: "media",
      optUrgenciaAlta: "alta",
      optUrgenciaUrgent: "urgente",
      optUrgenciaCritica: "CRÍTICA",
      lblSacCopia: "Copia opcional a:",
      btnSacGenerar: "GENERAR CORREO",
      sacAlertFields: "Por favor, rellene todos los campos obligatorios.",
      sacAlertObert: "SAC: Abierto formulario de incidencias",
      welcome: "Bienvenido",
      datacenter: "(centro de datos coordinadores)",
      btnUnlockFiles: "Desbloquear Archivos",
      btnManageCoord: "⚙️ Coordinadores",
      btnAdministration: "⚙️ Administración",
      btnExitApp: "🚪 Salir",
      confirmExitApp: "Atención: Estás a punto de cerrar la aplicación. Esto liberará todos tus bloqueos activos. ¿Deseas continuar?",
      celebrationNone: "Hoy no se celebra nada especial en el mundo 🙁",
      celebrationSpecial: "🌟 ¡Feliz día de <b>{day}</b>!",
      confirmUnlockAll: "Atención: Estás a punto de desbloquear manualmente todos los archivos del sistema. Esto eliminará cualquier bloqueo activo. ¿Deseas continuar?",
      successUnlockAll: "Se han desbloqueado correctamente todos los archivos.",
      errorUnlockAll: "Error al desbloquear: ",
      
      // Modal Coordinadores (portal.html)
      modalTitle: "⚙️ Gestión de Coordinadores",
      inputNomPlaceholder: "Nombre (ej: Marc)",
      inputCognomPlaceholder: "Apellido (ej: López)",
      btnAdd: "➕ Añadir",
      btnRemove: "✕ Eliminar",
      btnClose: "Cerrar",
      confirmRemoveCoord: "⚠️ ¿Estás seguro de que deseas eliminar a {name} de la lista de coordinadores?\n\n(Sus datos NO se borrarán)",
      btnManageAparcaments: "🚗 Aparcamientos",
      modalAparcamentTitle: "🚗 Gestión de Aparcamientos",
      inputAparcamentPlaceholder: "Nombre del aparcamiento (ej: BEJAR 63)",
      selectCoordPlaceholder: "-- Coordinador --",
      confirmRemoveAparcament: "⚠️ ¿Estás seguro de que deseas eliminar el aparcamiento {name}?\n\n(Esto no borrará los historiales ya guardados)",
      importSectionTitle: "MIGRACIÓN E IMPORTACIÓN DE DATOS",
      btnImportJson: "📥 Importar JSON histórico",
      confirmImport: "⚠️ ¿Estás seguro de que deseas importar este archivo JSON?\n\nEsto sobrescribirá los datos actuales en SQLite de este módulo para ti.",
      successImport: "✅ Datos importados correctamente en la base de datos SQLite del coordinador.",
      
      // Comercials (comercials.html)
      comercialsTitle: "Disponibilidad y Precios",
      placeholderSearch: "🔍 Buscar aparcamiento (centro o dirección)...",
      colCentre: "CENTRO",
      colAdreça: "DIRECCIÓN",
      colFixes: "FIJOS",
      colVariables: "VARIABLES",
      colVacants: "VACANTES",
      colTarifa: "TARIFA (promedio)",
      colObs: "OBSERVACIONES",
      legendApte: "<10 apto",
      legendRisc: "10-25 riesgo",
      legendNoApte: ">25 no apto (urgente abonar)",
      shortcuts: "Atajos de teclado",
      btnAddCentre: "+ añadir centro",
      btnResetData: "⚠️ borrar datos",
      btnCopyMonth: "📋 Copiar a otro mes/año",
      confirmResetComercials: "⚠️⚠️⚠️ ATENCIÓN ⚠️⚠️⚠️\n\nEstás a punto de vaciar la tabla de: {name}.\n\n❗ Esta acción NO tiene vuelta atrás.\n❗ Se perderán definitivamente todos los datos de este mes.\n\n¿Deseas continuar?",
      confirmCopyComercials: "¿Estás seguro de que deseas copiar los datos de {from} a {to}?",
      successCopyComercials: "✅ Datos copiados con éxito a {to}.",
      errorWriteDest: "❌ Error al guardar el archivo de destino: ",
      errorApiNotAvailable: "❌ Error: API de Electron no disponible.",
      errorNoDataToCopy: "⚠️ No hay datos en el mes actual para copiar.",
      errorDestExists: "⚠️ Error: Ya existen datos guardados en {to}. No se permite sobrescribir.",
      confirmDeleteCentre: "¿Eliminar centro?",
      errorNoPermission: "⚠️ No tienes permisos para realizar acciones sobre este comercial.",
      promptDestMonth: "Introduce el MES de destino (gener, febrer, marc, abril, maig, juny, juliol, agost, setembre, octubre, novembre, desembre):",
      errorInvalidMonth: "⚠️ Mes no válido.",
      promptDestYear: "Introduce el AÑO de destino (ej: 2026, 2027, 2028):",
      errorInvalidYear: "⚠️ Año no válido.",
      errorSameSourceDest: "⚠️ El mes y año de destino son los mismos que los de origen.",
      optGener: "ENERO",
      optFebrer: "FEBRERO",
      optMarc: "MARZO",
      optAbril: "ABRIL",
      optMaig: "MAYO",
      optJuny: "JUNIO",
      optJuliol: "JULIO",
      optAgost: "AGOSTO",
      optSetembre: "SEPTIEMBRE",
      optOctubre: "OCTUBRE",
      optNovembre: "NOVIEMBRE",
      optDesembre: "DICIEMBRE",
      // Vacaciones (vacances.html)
      vacancesAddRow: "➕ Añadir Fila",
      vacancesManageData: "⚙️ Gestionar Datos",
      vacancesExportExcel: "📥 Exportar Excel",
      vacancesExportJSON: "💾 Exportar",
      vacancesImportJSON: "📂 Importar",
      vacancesClearData: "🗑️ Borrar datos",
      vacancesLastExportNone: "Última exportación: Nunca",
      vacancesLastExportPrefix: "Última exportación: ",
      vacancesTitle: "VACACIONES PARKINGS",
      colTrabajador: "TRABAJADOR",
      vacancesPeriod1: "1er PERÍODO",
      vacancesPeriod2: "2do PERÍODO",
      vacancesDisfrutados: "DISFRUTADOS",
      vacancesPendientes: "PENDIENTES",
      vacancesCorrespondientes: "CORRESPONDIENTES",
      vacancesFestivosPeriodo: "FESTIVOS PERÍODO",
      vacancesNumFestivos: "Nº FESTIVOS",
      vacancesBolsaHoras: "BOLSA HORAS",
      vacancesObservaciones: "OBSERVACIONES",
      vacancesManageDataModal: "⚙️ GESTIONAR DATOS",
      vacancesLabelTypeList: "TIPO DE LISTA:",
      vacancesOptCentres: "Centros",
      vacancesOptTreballadors: "Trabajadores",
      vacancesOptAnys: "Años",
      vacancesLabelSelectElement: "SELECCIONA ELEMENTO:",
      vacancesLabelNameEdit: "NOMBRE (AÑADIR O MODIFICAR):",
      vacancesPlaceholderWrite: "Escribe aquí...",
      vacancesBtnAddNew: "➕ Añadir Nuevo",
      vacancesBtnModify: "✏️ Modificar",
      vacancesBtnDelete: "🗑️ Eliminar",
      vacancesBtnClose: "Cerrar",
      vacancesErrorImport: "⚠️ Error al importar.",
      vacancesErrorNoDataExport: "No hay datos visibles para exportar.",
      vacancesConfirmResetAll: "⚠️ ¿Borrar todo?",
      vacancesConfirmDelete: "¿Seguro que quieres eliminar \"{val}\"?",
      // Cuadrante & Rutas (quadrant.html, ruta.html)
      displayMonth: "Mes de ",
      rellotge: "Reloj",
      llegendaExport: "| Última exportación: Sin datos",
      llegendaExportPrefix: "| Última exportación: ",
      quadrantLabelPeriodo: "📅 Período:",
      quadrantLabelFiltros: "🔍 Filtros:",
      quadrantOptAllCentres: "Todos los Centros",
      quadrantOptAllWorkers: "Todos los Trabajadores",
      quadrantOptAllHours: "Todos los Horarios / Turnos",
      quadrantOptMati: "Solo Mañana",
      quadrantOptTarda: "Solo Tarde",
      quadrantOptNit: "Solo Noche",
      quadrantBtnResetFilters: "♻️ Reset Filtros",
      quadrantLabelAcciones: "⚡ Acciones:",
      quadrantBtnRecompte: "📊 Recuento Horas",
      quadrantBtnManageData: "⚙️ Gestionar Datos",
      quadrantBtnExportNext: "🚚 Exportar a ...",
      quadrantBtnCloseMonth: "🔒 Cerrar Mes",
      quadrantBtnAlertes: "⚠️ Alertas ({count})",
      quadrantLabelArchivos: "💾 Archivos:",
      quadrantBtnExcel: "📥 Excel",
      quadrantBtnPrint: "🖨️ Imprimir",
      quadrantBtnExportBackup: "💾 Exportar Backup",
      quadrantBtnImportBackup: "📂 Importar Backup",
      quadrantBtnImportVacances: "🌴 Importar Vacaciones",
      quadrantBtnClearMonth: "🗑️ Borrar datos del mes",
      quadrantAlertsTitle: "⚠️ SITUACIONES POR SOLUCIONAR (ALERTAS DE NEGOCIO)",
      // Rutas
      rutaTitle: "Hoja de Visitas 2026",
      rutaLabelMes: "Mes:",
      rutaBtnManage: "⚙️ Editar Centros / Backup",
      rutaManageTitle: "Gestión de Centros",
      rutaBtnEdit: "📝 Editar",
      rutaBtnDelete: "🗑️ Eliminar",
      rutaBtnClose: "Cerrar",
      rutaLegendNational: "Festivo nacional",
      rutaLegendLocal: "Festivo local",
      rutaLegendConvenio: "Festivo convenio",
      rutaLegendEmpresa: "Festivo empresa",
      rutaLegendVigilia: "Víspera",
      rutaLegendNight: "Visita nocturna",
      rutaLegendHoliday: "Festivo",
      rutaLegendExportNone: "|  Última exportación rutas: Sin datos aún",
      rutaLegendExportPrefix: "|  Última exportación rutas: ",
      rutaBtnResetAlbert: "⚠️ Reset Albert",
      rutaBtnResetLaura: "⚠️ Reset Laura",
      rutaBtnExportAlbert: "💾 Exportar Albert",
      rutaBtnExportLaura: "💾 Exportar Laura",
      rutaBtnImportAlbert: "📂 Importar Albert",
      rutaBtnImportLaura: "📂 Importar Laura",
      colJornada: "JORNADA",
      quadrantOptFrangesHoraries: "Franjas Horarias",
      quadrantTitleRecompte: "📊 RECUENTO DE HORAS",
      asistenteTitle: "Asistente",
      asistenteBtnDesasignar: "Desasignar",
      asistenteRecomendados: "Recomendados",
      asistenteDescartados: "Descartados",
      asistenteNoSugeridos: "No hay trabajadores sugeridos.",
      asistenteNoDescartados: "No hay trabajadores descartados.",
      asistenteExterno: "EXTERNO",
      asistenteRanking: "Ranking",
      asistenteHorasMes: "Horas mes",
      asistenteConflictosOk: "Sin conflictos",
      asistenteAsignar: "ASIGNAR",
      asistenteLabelDesasignar: "Desassignar turno / Dejar vacío",
      mappingModalTitle: "📂 MAPEO DE DATOS DE IMPORTACIÓN",
      mappingModalDesc: "Se han detectado discrepancias entre los centros/trabajadores del archivo seleccionado y tu catálogo local. Por favor, indica cómo se deben asociar estos elementos:",
      mappingModalCentres: "🏢 centros no coincidentes",
      mappingModalTreballadors: "👤 trabajadores no coincidentes",
      mappingModalBtnCancel: "Cancelar",
      mappingModalBtnConfirm: "Confirmar Importación"
    }
  };

  // Función para traducir todos los elementos de la página que contengan el atributo data-i18n
  function translatePage() {
    const lang = getLanguage();
    const t = translations[lang];
    if (!t) return;

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (t[key]) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          el.placeholder = t[key];
        } else {
          el.innerHTML = t[key];
        }
      }
    });

    // Sincronizar el selector de idioma si existe en la página
    const selector = document.getElementById('language-selector');
    if (selector) {
      selector.value = lang;
    }
  }

  // Obtener una clave de traducción con reemplazo opcional de plantillas {clave}
  function t(key, replacements = {}) {
    const lang = getLanguage();
    const tDict = translations[lang];
    if (!tDict || !tDict[key]) return key;
    
    let text = tDict[key];
    for (const placeholder in replacements) {
      text = text.replace(new RegExp(`{${placeholder}}`, 'g'), replacements[placeholder]);
    }
    return text;
  }

  window.changeLanguage = function(lang) {
    setLanguage(lang);
    localStorage.setItem('app_language', lang);
  };

  window.applyTranslations = function() {
    translatePage();
  };

  async function checkRoleGuard() {
    const rolesPermitidos = document.body && document.body.getAttribute('data-required-roles');
    if (rolesPermitidos) {
      // 1. Obtener rol de sessionStorage
      let activeRole = sessionStorage.getItem('userRole');
      if (activeRole === 'jefe operaciones') activeRole = 'jefe_operaciones';
      
      // 2. Si no hay rol en sesión, consultar config.json a través de IPC
      if (!activeRole && window.databaseAPI && window.databaseAPI.getUserConfig) {
        try {
          const config = await window.databaseAPI.getUserConfig();
          if (config.role) {
            activeRole = config.role;
          }
        } catch (e) {
          console.error("[i18n-Guard] Error al leer config para verificar rol:", e);
        }
      }
      
      // 3. Fallback seguro (si no hay rol, asumir comercial)
      activeRole = activeRole || 'comercial';
      
      // 4. Comprobar si el rol está permitido
      const allowedList = rolesPermitidos.split(',').map(r => r.trim());
      let accessGranted = allowedList.includes(activeRole);
      
      // El comercial tiene acceso a cualquier pantalla que permita al coordinador
      if (!accessGranted && activeRole === 'comercial' && allowedList.includes('coordinador')) {
        accessGranted = true;
      }
      
      if (!accessGranted) {
        alert("Acceso denegado: no dispone de los permisos necesarios para ver esta pantalla.");
        // Determinar ruta de redirección al portal
        const path = window.location.pathname;
        const redirectUrl = (path.includes('/admin/') || path.includes('/chklst/') || path.includes('/comercials/') || 
                             path.includes('/despeses/') || path.includes('/deutes/') || path.includes('/inventari/') || 
                             path.includes('/log/') || path.includes('/notificador/') || path.includes('/quadrant/') || 
                             path.includes('/ranking/') || path.includes('/regles/') || path.includes('/ruta/') || 
                             path.includes('/sac/') || path.includes('/vacances/'))
          ? '../portal.html'
          : 'portal.html';
        window.location.href = redirectUrl;
      }
    }
  }

  async function initI18n() {
    let savedLang = localStorage.getItem('app_language') || localStorage.getItem('nyn_idioma');
    if (!savedLang && window.databaseAPI && window.databaseAPI.getUserConfig) {
      try {
        const config = await window.databaseAPI.getUserConfig();
        savedLang = config.language;
      } catch (e) {
        console.error("Error reading config.json for language:", e);
      }
    }
    savedLang = savedLang || 'ca'; // fallback to ca if still empty
    setLanguage(savedLang);
    
    // Ejecutar verificación de roles
    await checkRoleGuard();
  }

  // Registrar el listener de cambio en localStorage para refrescar traducción en caliente
  window.addEventListener('storage', (e) => {
    if (!e.key || e.key === 'nyn_idioma' || e.key === 'app_language') {
      const activeLang = getLanguage();
      translatePage();
      window.dispatchEvent(new CustomEvent('languageChanged', { detail: activeLang }));
    }
  });

  // Autoejecutar traducción e inicialización cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initI18n);
  } else {
    setTimeout(initI18n, 1);
  }

  return {
    getLanguage,
    setLanguage,
    translatePage,
    t,
    translations
  };
})();
