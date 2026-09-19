import { useEffect, useState } from "react";

/**
 * ¿Estamos en un teléfono? Por debajo de `md` (768 px) de Tailwind.
 *
 * Se decide en JavaScript y no con `md:hidden` porque quien lo usa NO pinta la
 * misma cosa dos veces con distinto aspecto: pinta una composición distinta —
 * un carrusel en vez de una rejilla, un mapa en vez de dos. Con clases de
 * visibilidad los dos árboles se montan, se suscriben y se piden datos, y sólo
 * uno se ve.
 *
 * El primer valor se lee de forma SÍNCRONA en el `useState` para que el primer
 * pintado ya sea el correcto y no haya un salto de rejilla a carrusel.
 */
const CONSULTA = "(max-width: 767.98px)";

export function useEsTelefono(): boolean {
  const [esTelefono, setEsTelefono] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;

    return window.matchMedia(CONSULTA).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(CONSULTA);
    const alCambiar = (e: MediaQueryListEvent | MediaQueryList) =>
      setEsTelefono(e.matches);

    // Resincroniza: el ancho puede haber cambiado entre el primer render y el
    // efecto (rotar el teléfono mientras carga, abrir las herramientas).
    setEsTelefono(mq.matches);

    if (mq.addEventListener) {
      const oyente = alCambiar as (e: MediaQueryListEvent) => void;

      mq.addEventListener("change", oyente);

      return () => mq.removeEventListener("change", oyente);
    }
    // Safari antiguo: sólo tiene la API obsoleta.
    const oyente = alCambiar as (e: MediaQueryListEvent) => void;

    mq.addListener(oyente);

    return () => mq.removeListener(oyente);
  }, []);

  return esTelefono;
}
