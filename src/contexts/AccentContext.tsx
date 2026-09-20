import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";

import {
  leerAparienciaDeLaCuenta,
  guardarApariencia,
  cambioLocalReciente,
} from "@/lib/appearanceSync";
import {
  ACCENT_DEFAULT,
  aplicarAccent,
  acota,
  CROMA_MAX,
  CLAVE,
  hayAccentElegido,
  leerGuardado,
  restaurarAccentDelUsuario,
  esMetal,
  mismoAcento,
  muestraDeAcento,
  choqueConEstado,
  ACCENT_PRESETS,
  type Accent,
} from "@/lib/acentoDelUsuario";

/* Se reexportan: hay pantallas que los importan de aquí. */
export {
  ACCENT_DEFAULT,
  aplicarAccent,
  hayAccentElegido,
  restaurarAccentDelUsuario,
  esMetal,
  mismoAcento,
  muestraDeAcento,
  choqueConEstado,
};
export type { Accent };

/**
 * El acento configurable del CRM.
 *
 * Sólo escribe DOS variables y UN atributo en el <html>: el tono, el croma y el
 * acabado. Todo lo demás —relleno, texto, borde, lavado, brillo, lámina
 * metálica, colores de gráfico, en claro y en oscuro— lo deriva `tokens.css` de
 * ahí. Por eso cambiar el acento repinta la aplicación entera sin volver a
 * renderizar un solo componente de React: es el navegador recalculando
 * variables CSS.
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

/* Los colores predefinidos viven en `acentoDelUsuario.ts`, con el resto de la
   lógica pura: son datos, no React, y así las pruebas pueden recorrerlos sin
   arrastrar el cliente de API (que necesita `localStorage` y no existe en el
   entorno de pruebas). Se reexportan porque cuatro pantallas los importan de
   aquí desde siempre. */
export { ACCENT_PRESETS };

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

  useEffect(() => {
    aplicarAccent(accent);
  }, [accent]);

  // Al arrancar: lo que diga la cuenta manda sobre la caché de este navegador.
  useEffect(() => {
    let vivo = true;

    leerAparienciaDeLaCuenta().then((a) => {
      if (!vivo) return;
      cuentaLeida.current = true;
      // Si acabas de cambiarlo aquí, la cuenta puede ir hasta 20 s atrasada
      // (caché de identidad por instancia): no dejes que revierta tu cambio.
      if (cambioLocalReciente()) return;
      const g = a?.accent;

      if (g && typeof g.h === "number" && typeof g.c === "number") {
        const seguro: Accent = {
          h: acota(g.h, 0, 360),
          c: acota(g.c, 0, CROMA_MAX),
        };

        if (g.metal === true) seguro.metal = true;

        setAccentState(seguro);
        try {
          localStorage.setItem(CLAVE, JSON.stringify(seguro));
        } catch {}
      } else if (a && a.accent === null) {
        // La cuenta dice explícitamente «el de fábrica».
        setAccentState(ACCENT_DEFAULT);
        try {
          localStorage.removeItem(CLAVE);
        } catch {}
      }
    });

    return () => {
      vivo = false;
    };
  }, []);

  const setAccent = useCallback((a: Accent) => {
    const seguro: Accent = {
      h: acota(a.h, 0, 360),
      c: acota(a.c, 0, CROMA_MAX),
    };

    /* Sólo se guarda encendido. Un `metal: false` guardado no significa nada que
       la ausencia no diga ya, y el backend lo descarta igual. */
    if (a.metal === true) seguro.metal = true;

    setAccentState(seguro);
    try {
      localStorage.setItem(CLAVE, JSON.stringify(seguro));
    } catch {}
    guardarApariencia({ accent: seguro });
  }, []);

  const resetAccent = useCallback(() => {
    setAccentState(ACCENT_DEFAULT);
    try {
      localStorage.removeItem(CLAVE);
    } catch {}
    // null = «vuelve al de fábrica» también en la cuenta; si no, al recargar
    // volvería el acento viejo desde el servidor.
    guardarApariencia({ accent: null });
  }, []);

  return (
    <AccentContext.Provider
      value={{ accent, setAccent, resetAccent, presets: ACCENT_PRESETS }}
    >
      {children}
    </AccentContext.Provider>
  );
}

export function useAccent() {
  return useContext(AccentContext);
}
