/**
 * ════════════════════════════════════════════════════════════════════════════
 * PULSACIÓN LARGA = CLIC DERECHO
 *
 * El Horario reparte casi todo lo que se puede hacer con un día —cubrir el
 * turno, poner una novedad, cambiar las horas, borrarlo— en el menú del clic
 * derecho. En un teléfono no hay clic derecho, así que esas acciones
 * sencillamente NO EXISTÍAN: se veía la rejilla y no se podía operar con ella.
 *
 * Esto convierte una pulsación sostenida en el mismo menú, en las mismas
 * coordenadas.
 *
 * Tres detalles que hacen que no estorbe:
 *
 *  · Se cancela al MOVER el dedo (6 px de holgura). Sin eso, arrastrar para
 *    desplazar la rejilla —el gesto más común en un móvil— abriría el menú a
 *    media pasada.
 *  · Se cancela al levantar antes de tiempo, para que un toque normal siga
 *    siendo un toque.
 *  · Al dispararse llama a `preventDefault` sobre el `touchend` pendiente y
 *    marca el menú como táctil, porque el navegador emite un `mousedown`
 *    sintético justo después y ése cerraría el menú que acaba de abrirse.
 * ════════════════════════════════════════════════════════════════════════════
 */

const RETARDO_MS = 450;
const HOLGURA_PX = 6;

export type PuntoDePulsacion = { clientX: number; clientY: number };

export function handlersDePulsacionLarga(
  alPulsar: (punto: PuntoDePulsacion) => void,
) {
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let origen: { x: number; y: number } | null = null;
  let disparado = false;

  const cancelar = () => {
    if (temporizador) clearTimeout(temporizador);
    temporizador = null;
    origen = null;
  };

  return {
    onTouchStart: (e: React.TouchEvent) => {
      // Con dos dedos el usuario está haciendo zoom, no pidiendo un menú.
      if (e.touches.length !== 1) return cancelar();
      const t = e.touches[0];

      origen = { x: t.clientX, y: t.clientY };
      disparado = false;
      temporizador = setTimeout(() => {
        disparado = true;
        temporizador = null;
        alPulsar({ clientX: t.clientX, clientY: t.clientY });
      }, RETARDO_MS);
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (!origen || !temporizador) return;
      const t = e.touches[0];

      if (!t) return;
      if (
        Math.abs(t.clientX - origen.x) > HOLGURA_PX ||
        Math.abs(t.clientY - origen.y) > HOLGURA_PX
      )
        cancelar();
    },
    onTouchEnd: (e: React.TouchEvent) => {
      /* Si el menú ya se abrió, este `touchend` no debe convertirse en el clic
         sintético que lo cerraría de inmediato. */
      if (disparado) e.preventDefault();
      disparado = false;
      cancelar();
    },
    onTouchCancel: cancelar,
  };
}
