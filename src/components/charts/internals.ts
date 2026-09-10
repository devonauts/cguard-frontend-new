/* Piezas internas compartidas por los gráficos. No se exportan al resto del CRM. */

import { useEffect, useId, useRef, useState } from "react";

/**
 * Ancho real del contenedor en píxeles.
 *
 * Sin esto habría que usar `preserveAspectRatio="none"`, que estira el viewBox
 * y con él el grosor del trazo y los puntos: una línea de 2px sale de 3,4px en
 * horizontal y el punto final se convierte en una elipse. Midiendo, el sistema
 * de coordenadas del SVG es el de la pantalla y todo sale redondo y del grosor
 * pedido. Además da las coordenadas en píxeles que necesita el puntero para
 * saber sobre qué dato está.
 */
export function useElementWidth<T extends HTMLElement>(fallback = 320) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;

    if (!el) return;
    const medir = () => {
      const w = el.clientWidth;

      if (w > 0) setWidth(w);
    };

    medir();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir);

    ro.observe(el);

    return () => ro.disconnect();
  }, []);

  return [ref, width] as const;
}

/**
 * Identificador único para los `<defs>` del SVG.
 *
 * Dos gráficos con el mismo `id="grad"` en la página hacen que el segundo pinte
 * con el degradado del primero — el `url(#…)` resuelve al primero que aparece
 * en el documento. Se quitan los dos puntos de `useId` porque un `url(#:r3:)`
 * es frágil en algunos motores.
 */
export function useSvgId(prefix: string): string {
  return `${prefix}-${useId().replace(/:/g, "")}`;
}

/** Rectángulo con SÓLO las esquinas de arriba redondeadas — la punta de la barra. */
export function topRoundedRect(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  const rr = Math.max(0, Math.min(r, w / 2, h));

  if (h <= 0) return "";

  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

/** Acota un número. */
export const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));
