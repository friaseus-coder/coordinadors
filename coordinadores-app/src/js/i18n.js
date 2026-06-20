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
      optDesembre: "DESEMBRE"
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
      optDesembre: "DICIEMBRE"
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

  // Registrar el listener de cambio en localStorage para refrescar traducción en caliente
  window.addEventListener('storage', (e) => {
    if (!e.key || e.key === 'nyn_idioma') {
      translatePage();
      // Disparar evento personalizado por si la página necesita hacer tareas extra al cambiar idioma
      window.dispatchEvent(new CustomEvent('languageChanged', { detail: getLanguage() }));
    }
  });

  // Autoejecutar traducción cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', translatePage);
  } else {
    // Si ya cargó, traducir directamente
    setTimeout(translatePage, 1);
  }

  return {
    getLanguage,
    setLanguage,
    translatePage,
    t,
    translations
  };
})();
