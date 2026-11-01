import { io, type Socket } from "socket.io-client";
import { resolveApiBase } from "@/lib/apiBase";
import { handleDesktopApiError } from "@/lib/desktop";
import { pedirRecarga } from "@/lib/recarga/recarga";
import { engancharPuerta } from "@/lib/seguridad/puertaEnVivo";
import { ReconnectFanout, SocketKeeper } from "@/lib/socketKeeper";
import { ApiService } from "@/services/api/apiService";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL SOCKET EN VIVO
 *
 * Estaba montado a mano en cuatro sitios —campana de avisos, mapa del panel,
 * rastreo GPS y sesión de soporte compartido— cada uno con su propia copia de
 * la ruta, del origen y del cierre. Cuatro copias es cuatro sitios donde
 * arreglar el mismo fallo, y así se quedó sin arreglar en todos.
 *
 * ── THE SOCKET ALWAYS COMES BACK (2026-10-30) ──────────────────────────────
 * socket.io-client never retries after the server REFUSES a handshake
 * (`connect_error` from the auth middleware) nor after the server closes the
 * socket itself ("io server disconnect"). Reproduced on the R620 test stack: an
 * API restart whose first reconnect hit the database before it was ready got
 * one `server_error` refusal, and the CRM stayed without live notices (panic,
 * entries, alarms) until the page was reloaded. Worse, the next screen to call
 * `crearSocket` saw `active === false`, closed the shared socket with
 * `removeAllListeners()` and opened a new one: the bell, co-browse and the
 * support banner kept a dead handle with no listeners.
 *
 * Now the ONE shared socket is supervised by `SocketKeeper` (pure, tested —
 * same logic as the field apps): manual reconnect with exponential backoff +
 * jitter whenever socket.io gave up, slower for session refusals (with a REST
 * session check whose 401 signs out through the normal path), an immediate
 * attempt when the tab becomes visible or the network comes back, and a zombie
 * check. The same Socket object is reused, so every screen's listeners
 * survive. The handshake payload is a FUNCTION: the token is read fresh on
 * every attempt. Screens' `connect` handlers (their "catch up" reads) go
 * through `ReconnectFanout`: after a reconnection they run one by one, spread
 * out, instead of all in the same tick against a server that just restarted.
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

/** socket.io's own loop (transport failures): first retry 1–3 s, then up to 30 s, randomised. */
const RECONNECTION_DELAY_MS = 2000;
const RECONNECTION_DELAY_MAX_MS = 30_000;
/** How often a connected socket is checked for a missing heartbeat. */
const ZOMBIE_CHECK_MS = 30_000;

/**
 * The session token as it is NOW. Read from storage (where `lib/api` writes
 * it) instead of importing `lib/api`, which imports this module through the
 * door channel; same source the REST client uses.
 */
function tokenActual(): string | null {
  try {
    return localStorage.getItem("authToken");
  } catch {
    return null;
  }
}

/**
 * A refused handshake may be a dead session: ask the server over REST. A 401
 * there goes through the client's normal sign-out path (clear the session and
 * land on /login, or «Acceso bloqueado»); a 200 means the refusal was transient
 * and the keeper just keeps retrying.
 */
function verificarSesion(): void {
  if (!tokenActual()) return;
  ApiService.get("/auth/me").catch(() => {
    /* 401: already handled by ApiService; anything else: the keeper retries */
  });
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

   Aquí se comparte por empresa con recuento de referencias. Quien llama no
   cambia: sigue pidiendo su socket y cerrándolo al desmontar; lo que cambia es
   que por debajo es el mismo, y sólo se cierra de verdad cuando lo suelta el
   último. Un cambio de empresa abre una conexión nueva (la identidad es otra;
   en la práctica el selector de empresa recarga la página).

   A NEW SESSION in the same tab (a sign-in after support access, a token
   swapped in place) used to be a different key too: the old socket was closed
   with `removeAllListeners()` and every screen mounted at the root (co-browse,
   the support banner) kept a dead handle. Now the same socket re-handshakes
   with the new token and every listener stays where it was.

   Los `on`/`off` de cada consumidor conviven sin pisarse porque socket.io
   guarda los oyentes por evento y cada uno retira EL SUYO por referencia. */
type Compartido = {
  socket: Socket;
  tenantId: string;
  /** The token the screens asked with (the last one). */
  token: string;
  /** The token sent on the last handshake attempt. */
  tokenEnUso: string | null;
  usos: number;
  /** Cuántos consumidores quieren AHORA el chorro de posiciones. */
  salaMapa: number;
  /** El re-enganche tras reconectar, registrado una sola vez. */
  reengancheMapa: (() => void) | null;
  keeper: SocketKeeper;
  /** The screens' `connect` handlers, spread out after a reconnection. */
  fanout: ReconnectFanout;
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
   `off` explícitos que ya existen siguen funcionando igual.

   `connect` is the one event that does not go to socket.io: it goes to the
   shared `ReconnectFanout`, which runs it at once on the first connection and
   spread out after a reconnection (see lib/socketKeeper). Everything else is
   untouched. */
type Fn = (...a: any[]) => void;
/** [event, the caller's function, what was actually registered]. */
type Registro = [string, Fn, Fn];
const registrados = new WeakMap<
  object,
  { c: Compartido | null; propios: Registro[] }
>();

function envolver(socket: Socket, c: Compartido | null): Socket {
  const propios: Registro[] = [];
  const quitarConnect = (fn?: Fn) => {
    for (let i = propios.length - 1; i >= 0; i--) {
      const [e, f, h] = propios[i];

      if (e !== "connect" || (fn && f !== fn)) continue;
      c?.fanout.delete(h);
      propios.splice(i, 1);
    }
  };
  const proxy: Socket = new Proxy(socket, {
    get(destino: any, prop: string | symbol) {
      // Marca para que `cerrarSocket` pueda llegar al socket de verdad: el
      // envoltorio nunca es === al compartido, y sin esto el recuento no casaba
      // y volvíamos a cerrar en cada baja.
      if (prop === "__target") return destino;
      if (prop === "on" || prop === "once") {
        return (evento: string, fn: Fn) => {
          if (evento === "connect" && c) {
            const h: Fn =
              prop === "once"
                ? () => {
                    quitarConnect(fn);
                    fn();
                  }
                : fn;

            propios.push([evento, fn, h]);
            c.fanout.add(h);

            return proxy;
          }
          propios.push([evento, fn, fn]);
          (destino[prop] as any).call(destino, evento, fn);

          return proxy;
        };
      }
      if (prop === "off") {
        return (evento?: string, fn?: Fn) => {
          if (evento === "connect" && c) {
            // Only THIS caller's handlers: the keeper's own `connect` listener
            // lives on the real socket and must survive an `off("connect")`.
            quitarConnect(fn);

            return proxy;
          }
          if (evento && fn) {
            const i = propios.findIndex(([e, f]) => e === evento && f === fn);

            if (i >= 0) propios.splice(i, 1);
          }
          (destino.off as any).call(destino, evento, fn);

          return proxy;
        };
      }
      const v = destino[prop];

      return typeof v === "function" ? v.bind(destino) : v;
    },
  }) as Socket;

  registrados.set(proxy, { c, propios });

  return proxy;
}

/** Retira SÓLO lo que registró este llamante. */
function soltarOyentes(handle: Socket): void {
  const reg = registrados.get(handle as unknown as object);

  if (!reg) return;
  /* Se COPIA antes de iterar: `off` del envoltorio quita la entrada de este
     mismo array, y recorrer un array del que se va borrando se salta la mitad
     — que es exactamente lo que hacía esta función antes de la prueba. */
  const copia = reg.propios.slice();

  reg.propios.length = 0;
  const real: any = (handle as any).__target || handle;

  for (const [evento, , h] of copia) {
    try {
      if (evento === "connect" && reg.c) reg.c.fanout.delete(h);
      else real.off(evento, h);
    } catch {
      /* ya retirado */
    }
  }
}

/** Abre la conexión en vivo del tenant. El servidor sólo acepta websocket. */
export function crearSocket(token: string, tenantId: string): Socket {
  /* ── REUSE WHILE THE KEEPER OWNS IT ──────────────────────────────────────
     This checked `socket.active` before (and `disconnected` before that, see
     git history): a socket that was still negotiating, or that socket.io had
     given up on, was treated as dead, closed with `removeAllListeners()` and
     replaced — leaving every screen that already held it deaf. The keeper
     now brings that same socket back on its own, so it is reused for as long
     as it exists; only a teardown (`cerrarDeVerdad`) ends it. */
  const c0 = compartido;

  if (c0 && c0.tenantId === tenantId && !c0.keeper.stopped) {
    c0.usos++;
    if (token && token !== c0.token) {
      c0.token = token;
      /* A different session in this tab. Re-handshake now so the server puts
         the socket in the new identity's rooms — but only when the token the
         screen brings IS the current one (another tab may have signed in and
         left a newer token in storage: the handshake already uses that). */
      if (
        token === tokenActual() &&
        c0.tokenEnUso !== null &&
        c0.tokenEnUso !== token
      ) {
        try {
          c0.socket.disconnect();
          c0.socket.connect();
        } catch {
          /* the keeper retries */
        }
      }
    }

    return envolver(c0.socket, c0);
  }
  // Empresa distinta (o el anterior se cerró): el viejo se suelta entero.
  if (c0) {
    try {
      cerrarDeVerdad(c0.socket);
    } catch {
      /* ya estaba cerrado */
    }
    compartido = null;
  }

  // Filled right below; the handshake callback reads it lazily.
  let c: Compartido | undefined;
  let primerToken: string | null = null;
  const socket = io(socketOrigin(), {
    path: SOCKET_PATH,
    transports: ["websocket"],
    withCredentials: true,
    /* A FUNCTION, called on every (re)connection attempt: the token is read as
       it is NOW. A captured token was replayed forever, also after it died. */
    auth: (cb: (d: object) => void) => {
      const t = tokenActual() || c?.token || token;

      if (c) c.tokenEnUso = t;
      else primerToken = t;
      cb({ token: t, tenantId });
    },
    reconnectionDelay: RECONNECTION_DELAY_MS,
    reconnectionDelayMax: RECONNECTION_DELAY_MAX_MS,
    randomizationFactor: 0.5,
  });

  const keeper = new SocketKeeper({
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
    command: (cmd) => {
      // Signed out: there is no session to keep alive (sign-out reloads the
      // page right after; a later sign-in brings a token and a wake-up).
      if (!tokenActual()) return;
      try {
        if (cmd === "restart") socket.disconnect();
        socket.connect();
      } catch {
        /* the keeper retries */
      }
    },
    isActive: () => socket.active,
    isConnected: () => socket.connected,
    verifySession: verificarSesion,
  });
  const fanout = new ReconnectFanout({
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
    onError: (e) => console.warn("[socket] reconnect handler failed", e),
  });

  const nuevo: Compartido = {
    socket,
    tenantId,
    token,
    tokenEnUso: primerToken,
    usos: 1,
    salaMapa: 0,
    reengancheMapa: null,
    keeper,
    fanout,
  };

  c = nuevo;

  /* ── THE KEEPER'S EYES ─────────────────────────────────────────────────── */
  socket.on("connect", () => {
    keeper.onConnect();
    // A `server:restarting` may have stretched socket.io's delay: back to normal.
    try {
      socket.io.reconnectionDelay(RECONNECTION_DELAY_MS);
    } catch {
      /* */
    }
    fanout.onConnect();
  });
  socket.on("disconnect", (reason: string) => {
    fanout.onDisconnect();
    keeper.onDisconnect(String(reason || ""));
  });
  socket.on("connect_error", (e: any) => {
    fanout.onDisconnect();
    // Desktop app: a handshake refused with a `desktop.*` code (the server's
    // auth middleware puts it in `err.data`) goes straight to the shell.
    try {
      const d = e?.data;

      if (d && typeof d === "object") {
        handleDesktopApiError(Number(d.status) || 403, d);
      }
    } catch {
      /* never break the keeper */
    }
    keeper.onConnectError(String(e?.message || e || "error"));
  });
  // Any packet, and the engine's ping from the server, prove the link is alive.
  socket.onAny(() => keeper.onBeat());
  const alPing = () => keeper.onBeat();

  try {
    socket.io.on("ping", alPing);
  } catch {
    /* */
  }

  /* `server:restarting` (a deploy): reconnect after a RANDOM delay within the
     range the server asks for, so every open CRM does not come back at once. */
  socket.on("server:restarting", (p: any) => {
    const min = Number(p?.reintentarEnMs?.min) || 500;
    const max = Math.max(min, Number(p?.reintentarEnMs?.max) || 5000);

    try {
      socket.io.reconnectionDelay(min + Math.random() * (max - min));
    } catch {
      /* */
    }
  });
  /* The server cuts the socket when its token expires and says so first. Never
     trust the event alone: ask over REST (a 401 signs out the normal way). */
  socket.on("session:expired", verificarSesion);

  /* ── WAKE-UPS: tab visible again, network back, zombie check ───────────── */
  const despertar = () => keeper.wake();
  const alCambiarVisibilidad = () => {
    try {
      if (document.visibilityState === "visible") despertar();
    } catch {
      /* */
    }
  };
  let reloj: ReturnType<typeof setInterval> | null = null;

  try {
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    window.addEventListener("online", despertar);
    // A laptop that slept keeps a socket "connected" with no heartbeat.
    reloj = setInterval(() => {
      if (keeper.isStale()) keeper.wake();
    }, ZOMBIE_CHECK_MS);
  } catch {
    /* no DOM (tests) */
  }
  (socket as any).__apagarVigia = () => {
    keeper.stop();
    fanout.stop();
    if (reloj) clearInterval(reloj);
    try {
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      window.removeEventListener("online", despertar);
    } catch {
      /* */
    }
    try {
      socket.io.off("ping", alPing);
    } catch {
      /* */
    }
  };

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

  compartido = nuevo;

  return envolver(socket, nuevo);
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
   mira el contador hace el trabajo de todos. It is registered on the REAL
   socket on purpose: re-joining a room is cheap and must not wait for the
   spread-out catch-up of the screens. */
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
  // The keeper goes first: from here on nothing may reconnect this socket.
  try {
    (socket as any).__apagarVigia?.();
  } catch {
    /* */
  }
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
  // Already given up by socket.io (refused, or waiting in the keeper's
  // backoff): nothing is negotiating, close it now.
  if (!socket.active) {
    try {
      socket.disconnect();
    } catch {
      /* */
    }

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

/** Tests only: forget the shared socket without touching it. */
export function _olvidarSocketParaPruebas(): void {
  compartido = null;
}
