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

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] = useState<Language>(() => {
        const app = localStorage.getItem('app_language');
        const legacy = localStorage.getItem('language');
        return ((app || legacy) as Language) || 'es';
    });

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        localStorage.setItem('app_language', lang);
        // also set generic key used by legacy pages (Google Translate page)
        try { localStorage.setItem('language', lang); } catch {}
        void setAppLanguage(lang);
    };

    useEffect(() => {
        // On mount, prefer `app_language` but fall back to legacy `language`.
        try {
            const app = localStorage.getItem('app_language');
            const legacy = localStorage.getItem('language');
            const chosen = (app || legacy || language) as Language;

            // If keys are out of sync, normalize them so both contain the same value
            if (app !== chosen) {
                try { localStorage.setItem('app_language', chosen); } catch {}
            }
            if (legacy !== chosen) {
                try { localStorage.setItem('language', chosen); } catch {}
            }

            setLanguageState(chosen);
            void setAppLanguage(chosen);

            // FUENTE DE VERDAD: el idioma que la persona guardó en su perfil vive
            // en el backend. En un navegador nuevo (localStorage vacío) o si el
            // servidor conoce una elección más reciente, se siembra desde /auth/me
            // — así el idioma viaja con la cuenta, no con el dispositivo. Solo lee
            // si la sesión está autenticada; en el login (401) cae al geoIP de abajo.
            const norm = (x: any): Language | null => {
                const s = String(x || '').slice(0, 2).toLowerCase();
                return s === 'es' || s === 'en' || s === 'pt' ? (s as Language) : null;
            };
            api.get('/auth/me').then((resp: any) => {
                const d = resp && resp.data !== undefined ? resp.data : resp;
                const backendLang = norm(d?.language);
                if (backendLang && backendLang !== chosen) setLanguage(backendLang);
            }).catch(() => { /* sin sesión: seguimos con lo local / geoIP */ });

            // Sin NINGUNA preferencia (ni local ni en backend): el primer idioma lo
            // sugiere la ubicación (geoIP offline del backend).
            if (!app && !legacy) {
                api.get('/website/locale').then((resp: any) => {
                    const d = resp && resp.data !== undefined ? resp.data : resp;
                    const sug = String(d?.idioma || '') as Language;
                    if (sug === 'en' || sug === 'pt') setLanguage(sug);
                }).catch(() => { /* español, como siempre */ });
            }
        } catch (e) {
            // ignore
        }
    }, []);

    return (
        <LanguageContext.Provider value={{ language, setLanguage }}>
            {children}
        </LanguageContext.Provider>
    );
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
