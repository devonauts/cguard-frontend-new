import { io, type Socket } from 'socket.io-client';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL SOCKET EN VIVO
 *
 * Estaba montado a mano en cuatro sitios —campana de avisos, mapa del panel,
 * rastreo GPS y sesión de soporte compartido— cada uno con su propia copia de
 * la ruta, del origen y del cierre. Cuatro copias es cuatro sitios donde
 * arreglar el mismo fallo, y así se quedó sin arreglar en todos.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** El socket viaja bajo /api para cruzar el mismo proxy que el resto de la API. */
export const SOCKET_PATH = '/api/socket.io';

/** El origen del backend, deducido de la URL de la API. */
export function socketOrigin(): string {
  const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) || '';
  try {
    return new URL(apiUrl || window.location.origin, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
}

/** Abre la conexión en vivo del tenant. El servidor sólo acepta websocket. */
export function crearSocket(token: string, tenantId: string): Socket {
  return io(socketOrigin(), {
    path: SOCKET_PATH,
    transports: ['websocket'],
    withCredentials: true,
    auth: { token, tenantId },
  });
}

/**
 * Cierra el socket sin cortar un saludo a medias.
 *
 * EL PROBLEMA: `disconnect()` sobre una conexión que todavía está negociando
 * arranca el WebSocket en pleno CONNECTING, y el navegador lo anuncia con
 * «WebSocket is closed before the connection is established». Se ve como ruido
 * de consola pero no lo es del todo: el servidor llegó a abrir la sesión y se
 * entera de que murió por tiempo de espera, no por el cierre.
 *
 * CUÁNDO PASA: en desarrollo, cada montaje doble de StrictMode; y en
 * producción, cada vez que el efecto se rehace mientras la conexión anterior
 * aún no ha terminado de abrirse — al iniciar sesión, por ejemplo, cuando el
 * tenant pasa de vacío a real.
 *
 * LA SALIDA: si aún está negociando, se espera al desenlace —conexión o
 * error— y se cierra entonces, que es un cierre limpio por ambos lados. Con
 * tope de tiempo, porque un servidor que no contesta ni una cosa ni la otra
 * dejaría el socket abierto para siempre.
 */
export function cerrarSocket(socket: Socket | null | undefined, esperaMaxMs = 8000): void {
  if (!socket) return;

  socket.removeAllListeners();

  if (socket.connected) {
    socket.disconnect();
    return;
  }

  let cerrado = false;
  const cerrar = () => {
    if (cerrado) return;
    cerrado = true;
    clearTimeout(temporizador);
    socket.off('connect', cerrar);
    socket.off('connect_error', cerrar);
    socket.disconnect();
  };

  // El tope va primero para que `cerrar` pueda cancelarlo sin leer una variable
  // aún sin asignar.
  const temporizador = setTimeout(cerrar, esperaMaxMs);
  socket.once('connect', cerrar);
  socket.once('connect_error', cerrar);
}
