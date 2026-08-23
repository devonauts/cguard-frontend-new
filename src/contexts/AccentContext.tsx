import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { leerAparienciaDeLaCuenta, guardarApariencia } from "@/lib/appearanceSync";

/**
 * El acento configurable del CRM.
 *
 * Sólo escribe DOS variables en el <html>: el tono y el croma. Todo lo demás —
 * relleno, texto, borde, lavado, brillo, colores de gráfico, en claro y en
 * oscuro— lo deriva `tokens.css` de esas dos. Por eso cambiar el acento repinta
 * la aplicación entera sin volver a renderizar un solo componente de React: es
 * el navegador recalculando variables CSS.
 *
 * LA LUMINOSIDAD NO SE TOCA, y no es un descuido. La fija el sistema porque es
 * lo que garantiza que el texto contraste sobre el acento SEA CUAL SEA EL TONO
 * (ver la cabecera de tokens.css con la medición). Dejar que el usuario la
 * moviera es exactamente cómo se consigue un botón amarillo con letra blanca
 * ilegible.
 *
 * DÓNDE VIVE EL ACENTO. En la CUENTA (`users.appearance`), para que te siga a
 * cualquier navegador o computadora. `localStorage` sigue aquí, pero ya no es la
 * verdad: es la caché del PRIMER PINTADO — sin ella verías el acento de fábrica
 * durante el ida y vuelta al servidor, y luego un salto de color. Al arrancar se
 * pinta lo cacheado y, cuando responde la cuenta, gana lo guardado ahí.
 */

export type Accent = { h: number; c: number };

/** Tono y croma; el nombre es sólo para la interfaz. */
export const ACCENT_PRESETS: Array<{ id: string; label: string; h: number; c: number }> = [
  { id: "mostaza", label: "Mostaza oro", h: 88, c: 0.16 },
  { id: "ambar", label: "Ámbar", h: 70, c: 0.16 },
  { id: "lima", label: "Lima", h: 125, c: 0.16 },
  { id: "esmeralda", label: "Esmeralda", h: 155, c: 0.15 },
  { id: "cian", label: "Cian", h: 205, c: 0.14 },
  { id: "azul", label: "Azul", h: 250, c: 0.15 },
  { id: "violeta", label: "Violeta", h: 295, c: 0.16 },
  { id: "magenta", label: "Magenta", h: 340, c: 0.16 },
  { id: "carmesi", label: "Carmesí", h: 22, c: 0.17 },
  { id: "acero", label: "Acero", h: 250, c: 0.04 },
];

export const ACCENT_DEFAULT: Accent = { h: 88, c: 0.16 };

const CLAVE = "cguard-accent";

/** Croma máximo. Por encima, los tonos amarillo/verde se salen de gamut y el
 *  navegador los recorta de forma desigual: dos acentos «igual de saturados»
 *  saldrían con intensidades distintas. */
const CROMA_MAX = 0.2;

const acota = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function leerGuardado(): Accent {
  try {
    const bruto = localStorage.getItem(CLAVE);
    if (bruto) {
      const v = JSON.parse(bruto);
      if (typeof v?.h === "number" && typeof v?.c === "number") {
        return { h: acota(v.h, 0, 360), c: acota(v.c, 0, CROMA_MAX) };
      }
    }
  } catch {}
  return ACCENT_DEFAULT;
}

/** Escribe en el <html>. Fuera del ciclo de React a propósito: se llama también
 *  antes del primer render para que no haya un parpadeo con el acento por
 *  defecto. */
export function aplicarAccent(a: Accent) {
  const raiz = document.documentElement;
  raiz.style.setProperty("--brand-h", String(a.h));
  raiz.style.setProperty("--brand-c", String(a.c));
}

interface AccentContextValue {
  accent: Accent;
  setAccent: (a: Accent) => void;
  resetAccent: () => void;
  presets: typeof ACCENT_PRESETS;
}

const AccentContext = createContext<AccentContextValue>({
  accent: ACCENT_DEFAULT,
  setAccent: () => {},
  resetAccent: () => {},
  presets: ACCENT_PRESETS,
});

export function AccentProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<Accent>(leerGuardado);
  /** Mientras no llegue la cuenta, lo que se ve es la caché: no la subas todavía
   *  o le pisarías al usuario el acento que eligió en otro dispositivo. */
  const cuentaLeida = useRef(false);

  useEffect(() => { aplicarAccent(accent); }, [accent]);

  // Al arrancar: lo que diga la cuenta manda sobre la caché de este navegador.
  useEffect(() => {
    let vivo = true;
    leerAparienciaDeLaCuenta().then((a) => {
      if (!vivo) return;
      cuentaLeida.current = true;
      const g = a?.accent;
      if (g && typeof g.h === "number" && typeof g.c === "number") {
        const seguro = { h: acota(g.h, 0, 360), c: acota(g.c, 0, CROMA_MAX) };
        setAccentState(seguro);
        try { localStorage.setItem(CLAVE, JSON.stringify(seguro)); } catch {}
      } else if (a && a.accent === null) {
        // La cuenta dice explícitamente «el de fábrica».
        setAccentState(ACCENT_DEFAULT);
        try { localStorage.removeItem(CLAVE); } catch {}
      }
    });
    return () => { vivo = false; };
  }, []);

  const setAccent = useCallback((a: Accent) => {
    const seguro = { h: acota(a.h, 0, 360), c: acota(a.c, 0, CROMA_MAX) };
    setAccentState(seguro);
    try { localStorage.setItem(CLAVE, JSON.stringify(seguro)); } catch {}
    guardarApariencia({ accent: seguro });
  }, []);

  const resetAccent = useCallback(() => {
    setAccentState(ACCENT_DEFAULT);
    try { localStorage.removeItem(CLAVE); } catch {}
    // null = «vuelve al de fábrica» también en la cuenta; si no, al recargar
    // volvería el acento viejo desde el servidor.
    guardarApariencia({ accent: null });
  }, []);

  return (
    <AccentContext.Provider value={{ accent, setAccent, resetAccent, presets: ACCENT_PRESETS }}>
      {children}
    </AccentContext.Provider>
  );
}

export function useAccent() {
  return useContext(AccentContext);
}
