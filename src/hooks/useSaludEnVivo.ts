import { useEffect, useState } from "react";
import { crearSocket, cerrarSocket } from "@/lib/socket";
import { getAuthToken } from "@/lib/api";

const tenantId = () => localStorage.getItem("tenantId") || "";

export type EstadoEnVivo = "conectado" | "reconectando" | "degradado";

/**
 * ¿Está el canal en vivo diciendo la verdad?
 *
 * ── POR QUÉ ESTO ES OBLIGATORIO AHORA Y NO LO ERA ANTES ─────────────────────
 * Mientras las pantallas sondeaban, un fallo del tiempo real se notaba poco:
 * seguían preguntando y se enteraban igual, sólo que más lento. Al pasar a
 * eventos eso cambia por completo. Hay dos formas de quedarse ciego:
 *
 *  · el socket se cae (túnel, cambio de wifi, despliegue) — el navegador lo
 *    sabe, y por eso está `disconnect`;
 *  · el socket sigue abierto y sano PERO el adaptador de Redis del servidor se
 *    cayó, así que los eventos de un worker no llegan a los sockets del otro.
 *    Esto el navegador NO puede saberlo solo: la conexión está viva y no llega
 *    nada. Por eso el servidor lo anuncia (`realtime:health`).
 *
 * En los dos casos el tablero se queda quieto. La diferencia entre un tablero
 * quieto porque no pasa nada y uno quieto porque está ciego es, en una empresa
 * de seguridad, la diferencia entre una noche tranquila y una emergencia que
 * nadie está viendo.
 *
 * Un tablero que admite que está ciego es más útil que uno que finge estar al
 * día. Este hook devuelve el estado; quien lo use decide cómo enseñarlo.
 */
export function useSaludEnVivo(): EstadoEnVivo {
  const [estado, setEstado] = useState<EstadoEnVivo>("conectado");

  useEffect(() => {
    const tid = tenantId();
    if (!tid) return;
    const socket = crearSocket(getAuthToken() || "", tid);

    // El servidor manda la salud al conectar y en cada cambio del adaptador.
    const alSalud = (p: any) => setEstado(p?.degraded ? "degradado" : "conectado");
    const alConectar = () => setEstado("conectado");
    const alCaer = () => setEstado("reconectando");

    socket.on("realtime:health", alSalud);
    socket.on("connect", alConectar);
    socket.on("disconnect", alCaer);
    // Si ya estaba conectado cuando montamos, el `connect` no vuelve a llegar.
    if (socket.connected) setEstado("conectado");

    return () => {
      socket.off("realtime:health", alSalud);
      socket.off("connect", alConectar);
      socket.off("disconnect", alCaer);
      cerrarSocket(socket);
    };
  }, []);

  return estado;
}

export default useSaludEnVivo;
