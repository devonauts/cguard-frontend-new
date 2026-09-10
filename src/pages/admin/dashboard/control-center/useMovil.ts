import { useEffect, useState } from "react";

/**
 * ¿Estamos en un teléfono? Por debajo de `md` (768 px) el panel cambia de
 * composición: el mapa pasa a ser el contenido y las cifras flotan encima.
 *
 * Se decide en JavaScript y no con clases `md:hidden` a propósito: pintar las
 * dos versiones a la vez montaría DOS mapas de Google — dos lienzos, dos juegos
 * de marcadores y dos suscripciones de teselas — para enseñar sólo uno. Aquí se
 * monta el que se ve.
 */
const CONSULTA = "(max-width: 767.98px)";

export function useEsMovil(): boolean {
  const [esMovil, setEsMovil] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;

    return window.matchMedia(CONSULTA).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(CONSULTA);
    const alCambiar = (e: MediaQueryListEvent | MediaQueryList) =>
      setEsMovil(e.matches);

    // Sincroniza por si el ancho cambió entre el primer render y el efecto
    // (rotar el teléfono durante la carga, abrir las herramientas del navegador).
    setEsMovil(mq.matches);
    if (mq.addEventListener) {
      mq.addEventListener(
        "change",
        alCambiar as (e: MediaQueryListEvent) => void,
      );

      return () =>
        mq.removeEventListener(
          "change",
          alCambiar as (e: MediaQueryListEvent) => void,
        );
    }
    // Safari antiguo: sólo tiene la API obsoleta.
    mq.addListener(alCambiar as (e: MediaQueryListEvent) => void);

    return () =>
      mq.removeListener(alCambiar as (e: MediaQueryListEvent) => void);
  }, []);

  return esMovil;
}
