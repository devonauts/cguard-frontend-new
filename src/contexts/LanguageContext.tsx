import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { setAppLanguage } from '@/i18n';

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
