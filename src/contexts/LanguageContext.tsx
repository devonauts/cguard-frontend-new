import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { setAppLanguage } from '@/i18n';
import api from '@/lib/api';

type Language = 'es' | 'en' | 'pt';
/** Lo que la persona ELIGE. 'auto' = que lo decida el navegador. */
type LanguageChoice = 'auto' | Language;

interface LanguageContextType {
    /** El idioma que se está mostrando ahora mismo. Siempre concreto. */
    language: Language;
    /** Lo elegido en Configuración › Idioma ('auto' si nunca se tocó). */
    choice: LanguageChoice;
    /** Elegir idioma, o volver a 'auto'. Guarda en el navegador y en la cuenta. */
    setChoice: (choice: LanguageChoice) => void;
    /** Qué idioma detecta el navegador ahora (para enseñarlo junto a «Automático»). */
    detected: Language;
    /** Atajo histórico: fija un idioma concreto. Equivale a setChoice(lang). */
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
 * Por defecto el CRM MUESTRA el idioma del NAVEGADOR (`navigator.languages`, el
 * equivalente a la config de idioma del sistema), igual que la app del vigilante
 * sigue la config del teléfono. NO se detecta por IP: dónde estás no dice en qué
 * idioma lees — alguien en Miami puede querer español y alguien en Quito, inglés.
 *
 * Prioridad:
 *   1. Elección en Configuración › Idioma (es|en|pt). Gana siempre.
 *   2. Idioma del navegador (es | en | pt).
 *   3. Español, si el navegador está en algo que no tenemos.
 *
 * DÓNDE SE GUARDA, Y POR QUÉ EN DOS SITIOS:
 *   · localStorage → para que el PRIMER pintado ya salga en tu idioma, sin
 *     esperar a la red. Sin esto verías un parpadeo de español en cada carga.
 *   · la CUENTA (users.languageChoice) → para que la elección te siga a
 *     cualquier computadora, y para que el SERVIDOR sepa en qué idioma
 *     escribirte: los correos y notificaciones salen sin navegador delante, así
 *     que no pueden preguntarle nada al tuyo.
 *
 * «Automático» tiene que ser un estado ALCANZABLE, no solo el punto de partida:
 * quien eligió inglés por probar debe poder volver a que lo decida el navegador.
 * Por eso se guarda la ELECCIÓN ('auto'|es|en|pt) y no solo el idioma resultante.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * Limpia la cookie que dejó la antigua pantalla /idioma, que montaba Google
 * Translate encima del CRM. Mientras esa cookie exista, Google retraduce por
 * máquina lo que el sistema real ya tradujo bien, y aparecen mezclas raras. La
 * pantalla que la ponía ya no existe, así que sin esto quien la usara una vez se
 * quedaba atrapado sin manera de apagarla.
 *
 * Se borra en el host Y en el dominio raíz porque así se escribía (app.x.com y
 * .x.com son cookies distintas; borrar una deja viva la otra).
 */
const limpiarGoogleTranslate = () => {
    try {
        if (!document.cookie.includes('googtrans')) return;
        const host = window.location.hostname;
        const raiz = host.split('.').length > 2 ? '.' + host.split('.').slice(-2).join('.') : host;
        const caducada = 'googtrans=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/';
        document.cookie = caducada;
        document.cookie = `${caducada};domain=${host}`;
        document.cookie = `${caducada};domain=${raiz}`;
    } catch { /* sin document/cookies */ }
};

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

/** La elección guardada en ESTE navegador. */
const storedChoice = (): LanguageChoice => {
    try {
        // `app_language_manual` es la marca de la versión anterior del ajuste,
        // cuando solo existía «elegido/no elegido». Se sigue leyendo para no
        // desconfigurar a quien ya había elegido antes de que existiera 'auto'.
        if (localStorage.getItem('app_language_manual') === '1') {
            const m = norm(localStorage.getItem('app_language_choice') || localStorage.getItem('app_language'));
            if (m) return m;
        }
        const c = localStorage.getItem('app_language_choice');
        const m = norm(c);
        if (m) return m;
    } catch { /* sin storage */ }
    return 'auto';
};

/** El idioma del PRIMER pintado (síncrono): elección → navegador → español. */
const resolveInitial = (): Language => {
    const c = storedChoice();
    if (c !== 'auto') return c;
    return detectBrowser() || 'es';
};

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] = useState<Language>(resolveInitial);
    const [choice, setChoiceState] = useState<LanguageChoice>(storedChoice);
    const detected = detectBrowser() || 'es';

    /** Aplica una elección: pinta, guarda en el navegador y la manda a la cuenta. */
    const setChoice = (next: LanguageChoice) => {
        const efectivo: Language = next === 'auto' ? (detectBrowser() || 'es') : next;
        setChoiceState(next);
        setLanguageState(efectivo);
        try {
            if (next === 'auto') {
                localStorage.removeItem('app_language_choice');
                localStorage.removeItem('app_language_manual'); // limpiar la marca vieja
            } else {
                localStorage.setItem('app_language_choice', next);
                localStorage.setItem('app_language_manual', '1'); // compatibilidad hacia atrás
            }
            localStorage.setItem('app_language', efectivo);
            localStorage.setItem('language', efectivo); // clave heredada (header/api)
        } catch { /* almacenamiento no disponible */ }
        void setAppLanguage(efectivo);
        // A la cuenta viajan las DOS cosas: la elección (para que te siga a otro
        // equipo) y el idioma efectivo (que es el que el servidor usa al escribirte).
        saveAccountLanguage(efectivo, next);
    };

    /** Atajo histórico, por si algo fuera del ajuste fija un idioma concreto. */
    const setLanguage = (lang: Language) => setChoice(lang);

    useEffect(() => {
        limpiarGoogleTranslate();

        // Primero, lo que sabe este navegador (ya pintado por resolveInitial).
        const local = storedChoice();
        const efectivoLocal: Language = local === 'auto' ? (detectBrowser() || 'es') : local;
        setChoiceState(local);
        setLanguageState(efectivoLocal);
        void setAppLanguage(efectivoLocal);
        try {
            localStorage.setItem('app_language', efectivoLocal);
            localStorage.setItem('language', efectivoLocal);
        } catch { /* nada */ }

        // Después, la CUENTA — que es la que manda cuando hay elección, porque es
        // la que sigue a la persona entre equipos.
        //
        // SOLO si hay sesión: en la pantalla de login no hay token, y pegarle a
        // /auth/me ahí devolvía 403 —y encima mostraba el aviso «Prohibido» y
        // gastaba una petición—. `silentError` es cinturón y tirantes por si el
        // token está vencido.
        let tieneSesion = false;
        try { tieneSesion = !!localStorage.getItem('authToken'); } catch { /* sin storage */ }
        if (!tieneSesion) return;

        api.get('/auth/me', { toast: { silentError: true } } as any).then((resp: any) => {
            const d = resp && resp.data !== undefined ? resp.data : resp;
            const cuentaEleccion = norm(d?.languageChoice);
            const cuentaIdioma = norm(d?.language);

            if (local !== 'auto') {
                // Elegiste en ESTE navegador: manda lo tuyo y, si la cuenta no lo
                // refleja (el guardado falló, o vienes de la versión anterior del
                // ajuste), se repara sola.
                if (cuentaEleccion !== local) saveAccountLanguage(efectivoLocal, local);
                return;
            }

            if (cuentaEleccion) {
                // No elegiste aquí, pero SÍ en otro equipo: esa elección te sigue.
                setChoiceState(cuentaEleccion);
                setLanguageState(cuentaEleccion);
                void setAppLanguage(cuentaEleccion);
                try {
                    localStorage.setItem('app_language_choice', cuentaEleccion);
                    localStorage.setItem('app_language_manual', '1');
                    localStorage.setItem('app_language', cuentaEleccion);
                    localStorage.setItem('language', cuentaEleccion);
                } catch { /* nada */ }
                return;
            }

            // Nadie ha elegido nada: seguimos en automático. Solo se RELLENA el
            // idioma efectivo de la cuenta si estaba vacío, para que los correos
            // salgan en el idioma que esta persona está viendo.
            if (!cuentaIdioma) saveAccountLanguage(efectivoLocal, 'auto');
        }).catch(() => { /* token vencido u otro: sin ruido */ });
    }, []);

    return (
        <LanguageContext.Provider value={{ language, choice, setChoice, detected, setLanguage }}>
            {children}
        </LanguageContext.Provider>
    );
}

/** Persiste en la cuenta. Silencioso: esto nunca puede romper la UI. */
function saveAccountLanguage(lang: Language, choice: LanguageChoice) {
    api.put('/auth/profile', {
        data: { language: lang, languageChoice: choice === 'auto' ? null : choice },
        toast: { silentError: true },
    } as any).catch(() => { /* mejor esfuerzo */ });
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}

export { LANGUAGES };
export type { Language, LanguageChoice };
