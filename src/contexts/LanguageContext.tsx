import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { setAppLanguage } from '@/i18n';
import api from '@/lib/api';

type Language = 'es' | 'en' | 'pt';

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANGUAGES = {
    es: { code: 'es', name: 'Español', flag: '🇪🇸' },
    en: { code: 'en', name: 'English', flag: '🇺🇸' },
    pt: { code: 'pt', name: 'Português', flag: '🇧🇷' },
};

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL IDIOMA DEL CRM — se comporta como una app móvil con la config del teléfono.
 *
 * El CRM MUESTRA el idioma del NAVEGADOR (`navigator.languages`, el equivalente
 * a la config de idioma del sistema), igual que la app del vigilante sigue la
 * config del teléfono. No se detecta por IP: dónde estás no dice en qué idioma
 * lees.
 *
 * Prioridad:
 *   1. Elección MANUAL en el selector — pega SOLO esto (marca `app_language_manual`).
 *   2. Idioma del navegador (es | en | pt).
 *   3. Español, si el navegador está en algo que no tenemos.
 *
 * Una elección manual es lo único pegajoso; un valor auto NO bloquea la
 * detección —por eso un `es` viejo en el almacenamiento ya no te deja atrapado
 * en español—. El idioma efectivo se guarda además en la CUENTA (solo el
 * servidor manda los correos y notificaciones: no puede leer tu navegador al
 * enviarlos, así que necesita el valor guardado para escribir en tu idioma).
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Normaliza cualquier código (es-419, en-US, pt-BR…) a es|en|pt, o null. */
const norm = (x: any): Language | null => {
    const s = String(x || '').slice(0, 2).toLowerCase();
    return s === 'es' || s === 'en' || s === 'pt' ? (s as Language) : null;
};

/** El idioma del navegador/SO (config del sistema), mapeado a es|en|pt. */
const detectBrowser = (): Language | null => {
    try {
        const list =
            (typeof navigator !== 'undefined' && navigator.languages && navigator.languages.length
                ? navigator.languages
                : [typeof navigator !== 'undefined' ? navigator.language : '']) || [];
        for (const l of list) {
            const m = norm(l);
            if (m) return m;
        }
    } catch { /* sin navigator */ }
    return null;
};

/** El idioma del PRIMER pintado (síncrono): manual pegado → navegador → español. */
const resolveInitial = (): Language => {
    try {
        if (localStorage.getItem('app_language_manual') === '1') {
            const m = norm(localStorage.getItem('app_language'));
            if (m) return m;
        }
    } catch { /* sin storage */ }
    return detectBrowser() || 'es';
};

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] = useState<Language>(resolveInitial);

    /** Elección MANUAL (selector): pega en este navegador y viaja a la cuenta. */
    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        try {
            localStorage.setItem('app_language', lang);
            localStorage.setItem('app_language_manual', '1'); // esto es lo pegajoso
            localStorage.setItem('language', lang); // clave heredada (header/api)
        } catch { /* almacenamiento no disponible */ }
        void setAppLanguage(lang);
        // El guardado en la cuenta lo hace el propio selector (ProfileUserForm),
        // que ya llama a AccountService.updateProfile({language}).
    };

    useEffect(() => {
        const manual = (() => { try { return localStorage.getItem('app_language_manual') === '1'; } catch { return false; } })();

        // Idioma efectivo: manual pegado, o el del navegador, o español.
        const effective: Language = manual
            ? (norm(localStorage.getItem('app_language')) || detectBrowser() || 'es')
            : (detectBrowser() || 'es');

        setLanguageState(effective);
        void setAppLanguage(effective);
        // Mantener el almacenamiento (y la clave heredada del header) al día SIN
        // marcarlo manual: un auto-detectado debe seguir siendo re-evaluable.
        try {
            localStorage.setItem('app_language', effective);
            localStorage.setItem('language', effective);
        } catch { /* nada */ }

        // Sincronizar con la CUENTA para que los correos/notificaciones (que salen
        // del servidor, sin acceso al navegador) usen el mismo idioma que ves.
        api.get('/auth/me').then((resp: any) => {
            const d = resp && resp.data !== undefined ? resp.data : resp;
            const acct = norm(d?.language);
            if (manual) {
                // Elección deliberada: que la cuenta la refleje (auto-reparación si
                // el guardado del selector falló en su momento).
                if (acct !== effective) saveAccountLanguage(effective);
            } else if (!acct) {
                // Auto-detectado: solo RELLENA una cuenta vacía; nunca pisa una
                // elección manual hecha en otro dispositivo.
                saveAccountLanguage(effective);
            }
        }).catch(() => { /* sin sesión (login): nada que sincronizar */ });
    }, []);

    return (
        <LanguageContext.Provider value={{ language, setLanguage }}>
            {children}
        </LanguageContext.Provider>
    );
}

/** Persiste el idioma en la cuenta. Silencioso: nunca puede romper la UI. */
function saveAccountLanguage(lang: Language) {
    api.put('/auth/profile', { data: { language: lang } }).catch(() => { /* mejor esfuerzo */ });
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}

export { LANGUAGES };
export type { Language };
