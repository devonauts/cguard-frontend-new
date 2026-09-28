/**
 * DESLIZAR A LA IZQUIERDA PARA QUITAR, como en el centro de notificaciones del
 * iPhone. Aquí vive la DECISIÓN —pura y con prueba—; el componente
 * `Deslizable` sólo la aplica al puntero.
 *
 * Dos preguntas:
 *  1. ¿El gesto es horizontal? Hasta que el dedo se mueve 8 px no se sabe si
 *     la persona quiere quitar el aviso o desplazar la lista. Si domina lo
 *     vertical, el gesto es de la lista y la fila no se mueve nada.
 *  2. Al soltar, ¿se quita o vuelve a su sitio? Se quita si se arrastró más
 *     del 40 % del ancho, o si fue un golpe rápido hacia la izquierda (como
 *     iOS: no hace falta llegar al final si el gesto fue decidido).
 */
export const UMBRAL_EJE_PX = 8;
export const FRACCION_PARA_QUITAR = 0.4;
/** px por milisegundo: un «golpe» a la izquierda más rápido que esto quita. */
export const VELOCIDAD_PARA_QUITAR = 0.6;

export type Eje = "horizontal" | "vertical" | null;

export function ejeDelGesto(dx: number, dy: number): Eje {
  if (Math.abs(dx) < UMBRAL_EJE_PX && Math.abs(dy) < UMBRAL_EJE_PX) return null;

  return Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
}

/** Sólo hacia la izquierda: a la derecha la fila no se mueve. */
export function desplazamiento(dx: number): number {
  return Math.min(0, dx);
}

export function alSoltar(
  dx: number,
  ancho: number,
  msDelGesto: number,
): "quitar" | "volver" {
  if (dx >= 0 || ancho <= 0) return "volver";
  if (-dx >= ancho * FRACCION_PARA_QUITAR) return "quitar";
  const velocidad = -dx / Math.max(1, msDelGesto);

  return velocidad >= VELOCIDAD_PARA_QUITAR && -dx >= 40 ? "quitar" : "volver";
}
