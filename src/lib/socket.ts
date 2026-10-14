import { io, type Socket } from "socket.io-client";
import { resolveApiBase } from "@/lib/apiBase";
import { pedirRecarga } from "@/lib/recarga/recarga";
import { engancharPuerta } from "@/lib/seguridad/puertaEnVivo";

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
export const SOCKET_PATH = "/api/socket.io";

/** El origen del backend, deducido de la URL de la API. */
export function socketOrigin(): string {
  const apiUrl = (resolveApiBase() as string | undefined) || "";

  try {
    return new URL(apiUrl || window.location.origin, window.location.origin)
      .origin;
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
type Compartido = {
  socket: Socket;
  clave: string;
  usos: number;
  /** Cuántos consumidores quieren AHORA el chorro de posiciones. */
  salaMapa: number;
  /** El re-enganche tras reconectar, registrado una sola vez. */
  reengancheMapa: (() => void) | null;
};
let compartido: Compartido | null = null;

/* ── CADA QUIEN SE LLEVA LO SUYO ────────────────────────────────────────────
   Antes de compartir el socket, `cerrarSocket` hacía `removeAllListeners()`, y
   varios consumidores se apoyaban en eso: registran oyentes ANÓNIMOS y su
   limpieza sólo llama a `cerrarSocket`. Al pasar a un socket compartido eso
   dejó de valer por dos motivos opuestos: si sigue borrando todo, el primero
   que se va deja mudos a los demás; y si no borra nada, los oyentes anónimos
   se acumulan en cada montaje y no hay forma de retirarlos desde fuera.

   La solución no puede ser «que cada consumidor recuerde hacer `off`»: eso es
   justo lo que ya se olvidó tres veces. Se resuelve aquí, con un envoltorio que
   apunta lo que registra CADA llamante y lo retira exactamente al soltar. Para
   quien lo usa es transparente —sigue siendo el socket de siempre— y los
   `off` explícitos que ya existen siguen funcionando igual. */
const registrados = new WeakMap<
  object,
  Array<[string, (...a: any[]) => void]>
>();

function envolver(socket: Socket): Socket {
  const propios: Array<[string, (...a: any[]) => void]> = [];
  const proxy = new Proxy(socket, {
    get(destino: any, prop: string | symbol, receptor: any) {
      // Marca para que `cerrarSocket` pueda llegar al socket de verdad: el
      // envoltorio nunca es === al compartido, y sin esto el recuento no casaba
      // y volvíamos a cerrar en cada baja.
      if (prop === "__target") return destino;
      if (prop === "on" || prop === "once") {
        return (evento: string, fn: (...a: any[]) => void) => {
          propios.push([evento, fn]);

          return (destino[prop] as any).call(destino, evento, fn);
        };
      }
      if (prop === "off") {
        return (evento?: string, fn?: (...a: any[]) => void) => {
          if (evento && fn) {
            const i = propios.findIndex(([e, f]) => e === evento && f === fn);

            if (i >= 0) propios.splice(i, 1);
          }

          return (destino.off as any).call(destino, evento, fn);
        };
      }
      const v = destino[prop];

      return typeof v === "function" ? v.bind(destino) : v;
    },
  }) as Socket;

  registrados.set(proxy, propios);

  return proxy;
}

/** Retira SÓLO lo que registró este llamante. */
function soltarOyentes(handle: Socket): void {
  const propios = registrados.get(handle as unknown as object);

  if (!propios) return;
  /* Se COPIA antes de iterar: `off` del envoltorio quita la entrada de este
     mismo array, y recorrer un array del que se va borrando se salta la mitad
     — que es exactamente lo que hacía esta función antes de la prueba. */
  const copia = propios.slice();

  propios.length = 0;
  const real: any = (handle as any).__target || handle;

  for (const [evento, fn] of copia) {
    try {
      real.off(evento, fn);
    } catch {
      /* ya retirado */
    }
  }
}

/** Abre la conexión en vivo del tenant. El servidor sólo acepta websocket. */
export function crearSocket(token: string, tenantId: string): Socket {
  const clave = `${tenantId}::${token}`;

  /* ── `active`, NO `disconnected` ─────────────────────────────────────────
     `disconnected` es literalmente `!connected` (socket.io-client 4.8,
     socket.js:144), y `connected` sólo pasa a true cuando TERMINA el saludo.
     O sea que durante toda la negociación —y durante cada reconexión— vale
     `true`.

     Con la condición anterior, la rama de reutilización no se cumplía nunca
     mientras el socket estaba negociando… que es justo cuando montan los seis
     consumidores del panel, todos en el mismo tick. Cada uno veía
     `disconnected === true`, daba el socket anterior por muerto, llamaba a
     `cerrarDeVerdad` —con su `removeAllListeners()`— y abría el suyo. Resultado
     por carga de página: seis saludos, cinco sockets muertos nada más conectar,
     y cinco consumidores con un socket sin oyentes. Sólo funcionaba el último
     que montara. La campana, la co-navegación y los avisos de radio se caían en
     cada carga.

     `active` es `!!this.subs` (socket.js:180): verdadero desde que el socket se
     crea y mientras siga gestionado por su Manager, incluidas las
     reconexiones. Es la pregunta correcta: «¿este socket sigue vivo?», no
     «¿está conectado en este instante?». */
  if (compartido && compartido.clave === clave && compartido.socket.active) {
    compartido.usos++;

    return envolver(compartido.socket);
  }
  // Identidad distinta (o el anterior murió): el viejo se suelta entero.
  if (compartido) {
    try {
      cerrarDeVerdad(compartido.socket);
    } catch {
      /* ya estaba cerrado */
    }
    compartido = null;
  }
  const socket = io(socketOrigin(), {
    path: SOCKET_PATH,
    transports: ["websocket"],
    withCredentials: true,
    auth: { token, tenantId },
  });

  /* «Recargar paneles» (superadmin) viaja en ESTE socket, y el oyente se pone
     aquí, al nacer el socket, y no en un componente: el aviso escuchaba desde
     `AvisoDeRecarga` con su propio `crearSocket`, y cuando el token cambiaba
     (o otro consumidor reabría el compartido) su oyente moría con el socket
     viejo y nadie lo volvía a poner — el aviso no salía. Aquí cada socket nuevo
     lo lleva de serie. `cerrarDeVerdad` lo retira con todo lo demás. */
  socket.on("platform:reload", (p: any) =>
    pedirRecarga({
      id: String(p?.id || Date.now()),
      segundos: Number(p?.segundos) || 60,
      motivo: "plataforma",
      mensaje: p?.mensaje || null,
    }),
  );

  /* La puerta anti-copia en vivo: si el servidor marca esta dirección o esta
     cuenta, la pestaña se va a verificar al momento; y si pide vigilar, mira
     las herramientas de desarrollador. Ver lib/seguridad/puertaEnVivo. */
  (socket as any).__soltarPuerta = engancharPuerta(socket, "sesion");

  // Gusto: la vuelta de la autorización (la tarjeta de Conexiones y API escucha).
  socket.on("gusto:conexion", (p: any) =>
    window.dispatchEvent(new CustomEvent("cg:gusto", { detail: p })),
  );
  // Progreso del envío de horas a Gusto (fase 3), para la pestaña «Horas».
  socket.on("gusto:envio", (p: any) =>
    window.dispatchEvent(new CustomEvent("cg:gusto-envio", { detail: p })),
  );

  // «Enviar ahora» de un aviso: la ventana y la franja se refrescan al momento.
  socket.on("platform:announcement", (p: any) =>
    window.dispatchEvent(new CustomEvent("cg:anuncio", { detail: p })),
  );

  compartido = { socket, clave, usos: 1, salaMapa: 0, reengancheMapa: null };

  return envolver(socket);
}

/* ── LA SALA TAMBIÉN SE COMPARTE, ASÍ QUE TAMBIÉN SE CUENTA ─────────────────
   El socket lleva recuento de referencias y cada consumidor retira sus propios
   oyentes. La pertenencia a SALAS se había quedado fuera de ese mismo cuidado:
   `map:unsubscribe` saca al socket FÍSICO, no al que lo pide. Con dos pantallas
   de mapa abiertas sobre el mismo socket, la primera en desmontarse dejaba a la
   otra sin posiciones — el marcador quieto y ningún error.

   Hoy no pasa, porque el panel de control y el rastreo GPS viven en rutas
   distintas y no coexisten. Pero es exactamente el fallo que el recuento acaba
   de arreglar para los oyentes, esperando al tercer consumidor. Se cierra ahora,
   que cuesta veinte líneas, y no el día que alguien meta un mapa en una pestaña
   lateral y no entienda por qué el otro se congela.

   El re-enganche tras reconectar vive aquí y no en cada llamante: la
   pertenencia a salas se rehace desde cero en cada saludo, y un solo oyente que
   mira el contador hace el trabajo de todos. */
export function entrarEnSalaDelMapa(handle: Socket): () => void {
  const real: any = (handle as any).__target || handle;
  const c = compartido;

  // Un socket que no es el compartido (o que ya se soltó) se apaña solo: sin
  // recuento que llevar, pide y suelta directamente.
  if (!c || (c.socket !== handle && c.socket !== real)) {
    real.emit("map:subscribe");
    let fuera = false;

    return () => {
      if (!fuera) {
        fuera = true;
        real.emit("map:unsubscribe");
      }
    };
  }

  c.salaMapa++;
  if (c.salaMapa === 1) {
    real.emit("map:subscribe");
    c.reengancheMapa = () => {
      if (compartido && compartido.salaMapa > 0) real.emit("map:subscribe");
    };
    real.on("connect", c.reengancheMapa);
  }

  let soltado = false;

  return () => {
    if (soltado) return; // desmontar dos veces no descuenta dos veces
    soltado = true;
    if (!compartido || compartido !== c) return; // el socket ya se cerró entero
    c.salaMapa--;
    if (c.salaMapa > 0) return;
    c.salaMapa = 0;
    real.emit("map:unsubscribe");
    if (c.reengancheMapa) {
      real.off("connect", c.reengancheMapa);
      c.reengancheMapa = null;
    }
  };
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
export function cerrarSocket(
  socket: Socket | null | undefined,
  esperaMaxMs = 8000,
): void {
  if (!socket) return;

  /* ── SOLTAR NO ES CERRAR ─────────────────────────────────────────────────
     Con el socket compartido, cada consumidor llama aquí al desmontarse. Si
     esto cerrara siempre, el primer panel que se va dejaría sin tiempo real a
     la campana, a la radio y a la co-navegación — y encima `removeAllListeners`
     borraría los oyentes de TODOS, no sólo los suyos.

     Así que se descuenta un uso y sólo se cierra de verdad cuando lo suelta el
     último. Cada consumidor ya retira sus propios `on` con su `off` antes de
     llamar aquí, que es lo correcto y sigue funcionando igual. */
  // Lo primero, y pase lo que pase: retirar lo que registró QUIEN llama.
  soltarOyentes(socket);

  const real: Socket = (socket as any).__target || socket;

  if (
    compartido &&
    (compartido.socket === socket || compartido.socket === real)
  ) {
    compartido.usos--;
    if (compartido.usos > 0) return;
    compartido = null;
  }

  cerrarDeVerdad(compartido?.socket || real, esperaMaxMs);
}

/** El cierre real, con el drenado del saludo a medias. */
function cerrarDeVerdad(socket: Socket, esperaMaxMs = 8000): void {
  try {
    (socket as any).__soltarPuerta?.();
  } catch {
    /* */
  }
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
    socket.off("connect", cerrar);
    socket.off("connect_error", cerrar);
    socket.disconnect();
  };

  // El tope va primero para que `cerrar` pueda cancelarlo sin leer una variable
  // aún sin asignar.
  const temporizador = setTimeout(cerrar, esperaMaxMs);

  socket.once("connect", cerrar);
  socket.once("connect_error", cerrar);
}
