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

    const nombres = [...clave.split("|"), "connect"];
    for (const n of nombres) socket.on(n, alAvisar);

    return () => {
      if (temporizador) clearTimeout(temporizador);
      for (const n of nombres) socket.off(n, alAvisar);
      cerrarSocket(socket);
    };
  }, [clave, agruparMs, activo]);
}

export default useEventoEnVivo;
