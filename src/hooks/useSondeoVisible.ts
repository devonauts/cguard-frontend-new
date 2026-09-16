import { useEffect, useRef } from "react";

import { iniciarSondeoVisible } from "@/lib/sondeoVisible";

/**
 * UN RELOJ QUE SÓLO CORRE CUANDO ALGUIEN ESTÁ MIRANDO.
 *
 * Varias pantallas en vivo (cobertura, patrulla, aprobaciones de nómina, las
 * pestañas del cliente) se refrescan solas cada N segundos. El navegador NO
 * estrangula una pestaña que tiene un websocket abierto —y todas estas lo
 * tienen—, así que una pantalla olvidada en un monitor de guardia seguía
 * pidiendo a ritmo completo toda la noche: 8.640 peticiones en el peor caso,
 * para que no las viera nadie.
 *
 * Ese apaño estaba ya escrito a mano en ocho sitios y faltaba en cuatro. Aquí
 * vive una sola vez, y la lógica —comprobable— está en `lib/sondeoVisible.ts`.
 *
 * LA TAREA VA EN UNA REF, y ése es el motivo de que esto sea un hook y no un
 * `setInterval` suelto: si el intervalo dependiera de la función que le pasan,
 * cualquier `load` reconstruido en cada render —lo normal si a alguien se le
 * olvida el `useCallback`— desarmaría y rearmaría el reloj sin parar. Con la
 * ref, el temporizador se arma UNA vez y siempre llama a la última versión de
 * la tarea, así que los filtros de la pantalla van al día sin tocar el reloj.
 *
 * @param tarea   lo que hay que hacer en cada tic (y al volver a ver la pestaña)
 * @param cadaMs  periodo en milisegundos
 * @param activo  `false` desarma el reloj sin desmontar el componente
 */
export function useSondeoVisible(
  tarea: () => void,
  cadaMs: number,
  activo = true,
): void {
  const tareaRef = useRef(tarea);

  // Siempre la última versión, sin que eso rearme el temporizador.
  useEffect(() => {
    tareaRef.current = tarea;
  }, [tarea]);

  useEffect(() => {
    const sondeo = iniciarSondeoVisible({
      activo,
      tarea: () => tareaRef.current(),
      cadaMs,
      visible: () => document.visibilityState !== "hidden",
      alCambiarVisibilidad: (fn) => {
        document.addEventListener("visibilitychange", fn);

        return () => document.removeEventListener("visibilitychange", fn);
      },
    });

    return () => sondeo.detener();
  }, [cadaMs, activo]);
}

export default useSondeoVisible;
