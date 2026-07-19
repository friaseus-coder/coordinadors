

        function mostrarAlerta(msg) {
            const isError = String(msg).toLowerCase().includes('error');
            if (window.parent && typeof window.parent.showCustomAlert === 'function') {
                window.parent.showCustomAlert(msg, isError ? 'error' : 'success');
            } else {
                window.alert(msg);
            }
        }

       // Forzar traducción inmediata al cargar
       document.addEventListener('DOMContentLoaded', () => {
           if(typeof applyTranslations === 'function') applyTranslations();
       });
    