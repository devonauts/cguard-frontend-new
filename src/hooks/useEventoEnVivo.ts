import { useEffect, useRef } from "react";

import { crearSocket, cerrarSocket } from "@/lib/socket";
import { getAuthToken } from "@/lib/api";

const tenantId = () => localStorage.getItem("tenantId") || "";

/**
 * Refresca una pantalla cuando el servidor anuncia que su dato cambió.
 *
 * ── POR QUÉ UN HOOK Y NO COPIAR EL ENGANCHE ─────────────────────────────────
 * El patrón es siempre el mismo —abrir socket, escuchar N eventos, recargar,
 * recargar también al reconectar, darse de baja al desmontar— y son cinco
 * pantallas. Copiado cinco veces, la sexta se olvida de la baja o del
 * `connect`, que es justo el que importa.
 *
 * ── LAS DOS COSAS QUE HACE Y NO SE VEN ──────────────────────────────────────
 *
 * `connect` va SIEMPRE en la lista, aunque quien llama no lo pida. Un websocket
 * entrega lo que pasa MIENTRAS escuchas; no puede contarte lo que pasó mientras
 * el portátil dormía, el wifi saltaba o PM2 reciclaba un worker. Ése es el
 * único trabajo que hacía de verdad el sondeo, y el disparador correcto es
 * volver a estar conectado, no que hayan pasado N segundos.
 *
 * Y agrupa: varios eventos seguidos —una carga de vacaciones, una ráfaga de
 * fichajes al abrir un turno— producen UNA recarga, no veinte. El servidor ya
 * agrupa `coverage:changed`, pero los demás llegan sueltos y esta pantalla no
 * necesita verlos uno a uno: necesita estar al día.
 *
 * ── EL SOCKET ES COMPARTIDO ─────────────────────────────────────────────────
 * `crearSocket` devuelve el mismo por (token, tenant) con recuento, así que
 * llamar a esto desde cinco pantallas NO abre cinco conexiones. Cada una retira
 * SUS oyentes con `off` y suelta su referencia; el socket se cierra de verdad
 * cuando lo suelta el último.
 */
export function useEventoEnVivo(
  eventos: string[],
  recargar: () => void,
  opciones: { agruparMs?: number; activo?: boolean } = {},
): void {
  const { agruparMs = 400, activo = true } = opciones;

  // Se guarda en un ref para que cambiar la función de recarga en cada render
  // no destruya y rehaga la suscripción — el fallo clásico de este patrón.
  const recargarRef = useRef(recargar);

  recargarRef.current = recargar;

  const clave = eventos.join("|");

  useEffect(() => {
    if (!activo) return;
    const tid = tenantId();

    if (!tid) return;

    const socket = crearSocket(getAuthToken() || "", tid);
    let temporizador: ReturnType<typeof setTimeout> | null = null;

    const alAvisar = () => {
      if (temporizador) clearTimeout(temporizador);
      temporizador = setTimeout(() => recargarRef.current(), agruparMs);
    };

    /* ── EL HUECO QUE UN WEBSOCKET NO SABE CONTARTE ──────────────────────────
       Un socket entrega lo que pasa mientras escuchas. Si el portátil durmió
       cuarenta segundos, reconecta tan tranquilo y nadie avisa de los tres
       eventos perdidos: la pantalla se queda mintiendo con cara de estar al día.

       El servidor numera los eventos de estado por empresa. Aquí se guarda el
       último visto: si llega el 47 y el anterior fue el 45, hay hueco y se
       recarga igual. Recargar de más es gratis —la pantalla ya se estaba
       refrescando—; no enterarse no tiene arreglo.

       Un salto hacia ATRÁS significa que el contador se reinició (Redis
       reiniciado, o cambio a contador local): se acepta el nuevo y se recarga,
       en vez de quedarse esperando un número que ya no va a llegar. */
    /* ── EL NÚMERO ES POR EMPRESA, NO POR PANTALLA ───────────────────────
       Corregido tras la re-auditoría: esto comparaba `seq !== ultimaSeq + 1` y
       daba «hueco» casi siempre. El contador del backend es GLOBAL por empresa
       y lo comparten todos los eventos de supervisión, pero cada pantalla
       escucha uno o dos: entre dos `alarm:case` se cuelan fichajes, coberturas
       y rutas, así que el número salta de 40 a 47 sin que se haya perdido nada.

       Resultado: «hueco» permanente, recarga inmediata en cada evento y la
       agrupación de 400 ms sin efecto — justo lo que la agrupación existía para
       evitar, y peor que el sondeo que sustituye.

       Lo único que un número global puede decir con certeza es que fuimos HACIA
       ATRÁS (el contador se reinició: Redis reiniciado o caída al contador
       local). Eso sí obliga a recargar sin esperar. Avanzar de más es normal y
       no significa nada. */
    let ultimaSeq: number | null = null;
    const conSeq = (p: any) => {
      const seq = Number(p?.seq);

      if (Number.isFinite(seq)) {
        const reinicio = ultimaSeq != null && seq < ultimaSeq;

        ultimaSeq = seq;
        if (reinicio) {
          recargarRef.current();

          return;
        }
      }
      alAvisar();
    };

    const nombres = clave.split("|");

    for (const n of nombres) socket.on(n, conSeq);
    /* `connect` recarga SIEMPRE y reinicia la cuenta: tras una reconexión no
       sabemos qué nos perdimos, así que se pide el estado actual una vez y se
       vuelve a empezar a numerar desde lo que llegue. */
    const alConectar = () => {
      ultimaSeq = null;
      alAvisar();
    };

    socket.on("connect", alConectar);

    return () => {
      if (temporizador) clearTimeout(temporizador);
      for (const n of nombres) socket.off(n, conSeq);
      socket.off("connect", alConectar);
      cerrarSocket(socket);
    };
  }, [clave, agruparMs, activo]);
}

export default useEventoEnVivo;
