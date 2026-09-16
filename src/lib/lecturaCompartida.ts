/**
 * UNA LECTURA, MUCHOS LECTORES.
 *
 * El patrón que ya estaba escrito a mano en `tenant.service.ts`,
 * `useNotificationStream.ts` y `appearanceSync.ts`, con el mismo agujero en los
 * tres: compartían la promesa EN VUELO, pero nada más. Eso junta a quien
 * pregunta mientras la petición viaja y deja fuera al que llega justo después
 * de que termine — que es exactamente lo que medimos en producción: la campana
 * de avisos montaba 91 ms tarde y pedía el histórico por segunda vez.
 *
 * Aquí se comparten las dos cosas: la promesa mientras vuela y el RESULTADO
 * durante una ventana corta. Con eso, un arranque entero se sirve de una sola
 * respuesta.
 *
 * Un fallo NO se guarda nunca: quien reintente tiene que poder volver a pedir
 * de verdad (`checkAuth` reintenta con retroceso ante un 503, y si le
 * devolviéramos la promesa rechazada memorizada reintentaría contra una pared).
 */
export interface LectorCompartido<T> {
  /** Lee, compartiendo con quien esté leyendo a la vez o acabe de leer. */
  leer: () => Promise<T>;
  /** Tira lo memorizado (cambio de sesión, de empresa, o un dato que caducó). */
  olvidar: () => void;
}

export function crearLecturaCompartida<T>(
  pedir: () => Promise<T>,
  frescoMs = 15_000,
  ahora: () => number = Date.now,
): LectorCompartido<T> {
  let enVuelo: Promise<T> | null = null;
  let ultimo: { dato: T; t: number } | null = null;

  return {
    leer() {
      if (ultimo && ahora() - ultimo.t < frescoMs) {
        return Promise.resolve(ultimo.dato);
      }
      if (enVuelo) return enVuelo;

      enVuelo = pedir()
        .then((d) => {
          ultimo = { dato: d, t: ahora() };

          return d;
        })
        .finally(() => {
          // Se suelta SIEMPRE, también al fallar.
          enVuelo = null;
        });

      return enVuelo;
    },
    olvidar() {
      enVuelo = null;
      ultimo = null;
    },
  };
}
