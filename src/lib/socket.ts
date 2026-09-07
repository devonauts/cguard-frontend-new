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

/* ── UN SOLO SOCKET POR IDENTIDAD, COMPARTIDO ───────────────────────────────
   `crearSocket` devolvía una conexión NUEVA en cada llamada, y socket.io 4 no
   multiplexa: dos `io()` al mismo origen y namespace abren dos Managers y dos
   sockets TCP de verdad. El CRM tiene seis puntos de creación y tres montados
   siempre (co-navegación, campana, radio), así que cada pestaña abría entre 3 y
   5 websockets. Con dos pestañas, ocho — y la tormenta de reconexión tras cada
   despliegue era ocho veces el número de personas, no una.

   Las apps móviles y el superadmin ya resolvieron esto con un socket
   compartido; el CRM se quedó atrás. El propio repo lo tiene escrito en la app
   de vigilante: «abrir un segundo socket con la misma identidad es exactamente
   el error que ya costó 6.087 expulsiones en la radio».

   Aquí se comparte por (token, tenant) con recuento de referencias. Quien llama
   no cambia: sigue pidiendo su socket y cerrándolo al desmontar; lo que cambia
   es que por debajo es el mismo, y sólo se cierra de verdad cuando lo suelta el
   último. Un cambio de empresa o de sesión produce una clave distinta, así que
   abre una conexión nueva — que es lo correcto: la identidad es otra.

   Los `on`/`off` de cada consumidor conviven sin pisarse porque socket.io
   guarda los oyentes por evento y cada uno retira EL SUYO por referencia. */
type Compartido = { socket: Socket; clave: string; usos: number };
let compartido: Compartido | null = null;

/** Abre la conexión en vivo del tenant. El servidor sólo acepta websocket. */
export function crearSocket(token: string, tenantId: string): Socket {
  const clave = `${tenantId}::${token}`;
  if (compartido && compartido.clave === clave && !compartido.socket.disconnected) {
    compartido.usos++;
    return compartido.socket;
  }
  // Identidad distinta (o el anterior murió): el viejo se suelta entero.
  if (compartido) {
    try { cerrarDeVerdad(compartido.socket); } catch { /* ya estaba cerrado */ }
    compartido = null;
  }
  const socket = io(socketOrigin(), {
    path: SOCKET_PATH,
    transports: ['websocket'],
    withCredentials: true,
    auth: { token, tenantId },
  });
  compartido = { socket, clave, usos: 1 };
  return socket;
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

  /* ── SOLTAR NO ES CERRAR ─────────────────────────────────────────────────
     Con el socket compartido, cada consumidor llama aquí al desmontarse. Si
     esto cerrara siempre, el primer panel que se va dejaría sin tiempo real a
     la campana, a la radio y a la co-navegación — y encima `removeAllListeners`
     borraría los oyentes de TODOS, no sólo los suyos.

     Así que se descuenta un uso y sólo se cierra de verdad cuando lo suelta el
     último. Cada consumidor ya retira sus propios `on` con su `off` antes de
     llamar aquí, que es lo correcto y sigue funcionando igual. */
  if (compartido && compartido.socket === socket) {
    compartido.usos--;
    if (compartido.usos > 0) return;
    compartido = null;
  }

  cerrarDeVerdad(socket, esperaMaxMs);
}

/** El cierre real, con el drenado del saludo a medias. */
function cerrarDeVerdad(socket: Socket, esperaMaxMs = 8000): void {
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
