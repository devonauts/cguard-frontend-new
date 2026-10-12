import { useEffect, useState, type RefObject } from "react";

/**
 * ¿El hueco está (o está a punto de estar) a la vista?
 *
 * AHORRO · Los mapas piden su instancia SÓLO cuando su hueco se acerca a la
 * pantalla: una ficha larga con el mapa al fondo, una pestaña que nadie abre o
 * un modal plegado no cuestan nada. Una vez a la vista, se queda en `true`.
 *
 * Sin `IntersectionObserver` (navegadores viejos, pruebas) devuelve `true` de
 * inmediato: esto no puede dejar una pantalla sin mapa.
 */
export function useCercaDeLaVista(
  ref: RefObject<HTMLElement | null>,
  margen = "250px",
): boolean {
  const [cerca, setCerca] = useState(false);

  useEffect(() => {
    const nodo = ref.current;

    if (cerca) return;
    // Sin observador, o sin nodo que observar: se monta ya (red de seguridad).
    if (typeof IntersectionObserver !== "function" || !nodo) {
      setCerca(true);

      return;
    }

    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setCerca(true);
          obs.disconnect();
        }
      },
      { rootMargin: margen },
    );

    obs.observe(nodo);

    return () => obs.disconnect();
  }, [cerca, margen, ref]);

  return cerca;
}

export default useCercaDeLaVista;
