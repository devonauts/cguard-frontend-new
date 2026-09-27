/**
 * Junta lo que llega dentro de una ventana corta y lo suelta de una vez.
 *
 * Los barridos del servidor escriben en el mismo tic todo lo que encuentran;
 * sin esto, diecisiete avisos eran diecisiete tarjetas y diecisiete campanadas.
 * La ventana empieza con el PRIMERO y no se alarga con cada uno: una lluvia
 * continua no puede retrasar indefinidamente el primer aviso.
 */
export interface Rafaga<T> {
  meter(x: T): void;
  /** Descarta lo pendiente sin soltarlo (al desmontar). */
  cancelar(): void;
}

export function crearRafaga<T>(
  ventanaMs: number,
  alSoltar: (lote: T[]) => void,
  reloj: {
    setTimeout: (f: () => void, ms: number) => unknown;
    clearTimeout: (id: unknown) => void;
  } = {
    setTimeout: (f, ms) => setTimeout(f, ms),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  },
): Rafaga<T> {
  let lote: T[] = [];
  let temporizador: unknown = null;

  return {
    meter(x: T) {
      lote.push(x);
      if (temporizador) return;
      temporizador = reloj.setTimeout(() => {
        temporizador = null;
        const salen = lote;

        lote = [];
        if (salen.length) alSoltar(salen);
      }, ventanaMs);
    },
    cancelar() {
      if (temporizador) reloj.clearTimeout(temporizador);
      temporizador = null;
      lote = [];
    },
  };
}
