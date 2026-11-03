import { io, type Socket } from "socket.io-client";

import { SOCKET_PATH, socketOrigin } from "@/lib/socket";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LA PUERTA ANTI-COPIA, EN VIVO (Mike, 2026-10-14).
 *
 * El servidor dice por socket qué hacer:
 *   · `seguridad:verificar` → esta pestaña se va YA a /verificacion-humana
 *     (la dirección o la cuenta quedó marcada, aunque la página ya estuviera
 *     abierta);
 *   · `seguridad:vigilar`   → mirar si hay herramientas de desarrollador
 *     abiertas. Sólo llega a quien no está en nuestra lista libre, así que a
 *     nosotros nunca se nos para el depurador.
 *
 * Qué se avisa (`seguridad:senal`), y el servidor retiene:
 *   · en la ENTRADA (sin sesión): abiertas y copiando (copiar, ver código,
 *     guardar la página, menú contextual…), o abiertas más de 30 s;
 *   · con SESIÓN: abiertas más de 1 minuto seguido.
 *
 * Cómo se ven abiertas: un hilo aparte (public/hilo-de-guardia.js) ejecuta
 * `debugger` cada medio segundo; con las herramientas abiertas el depurador lo
 * para y deja de contestar mientras la página sigue viva. Desactivar los
 * puntos de ruptura lo esquiva: es una señal, no un muro.
 *
 * What does NOT count (ENTEC, 2026-11-03: 20,379 s "open" on
 * /auth/invitation held their office IP and everyone behind it):
 *   · a hidden or frozen tab, or a sleeping computer: the worker stops, but
 *     so does the page. If the page's own clock skipped more than 3 s, or the
 *     tab is not visible, the count goes back to 0;
 *   · the window size only counts together with a copy action on the sign-in
 *     screens, never for the 30 s: Edge's sidebar, zoom or a phone keyboard
 *     change it just like docked tools do.
 * ════════════════════════════════════════════════════════════════════════════
 */

export const URL_VERIFICACION = "/verificacion-humana";

const ENTRADA_ABIERTAS_MS = 30_000;
const SESION_ABIERTAS_MS = 60_000;
const HILO_CALLADO_MS = 1_500;
const CLOCK_JUMP_MS = 3_000;
const SALTO_DE_TAMANO_PX = 160;

let yendo = false;

/** Fuera de aquí: a la verificación (nginx sirve esa página fuera del CRM). */
export function irAVerificacion(): void {
  if (yendo || typeof window === "undefined") return;
  if (window.location.pathname.startsWith(URL_VERIFICACION)) return;
  yendo = true;
  window.location.replace(URL_VERIFICACION);
}

export type Modo = "entrada" | "sesion";

interface Vigilancia {
  parar: () => void;
}

/**
 * The "tools open" count, browser-free so it can be tested. Every second the
 * page calls `tick` with the time, whether the tab is visible and when the
 * worker last answered; it returns the seconds open once the mode's wait is
 * over, and `null` until then.
 */
export class DevtoolsClock {
  private openSince = 0;
  private lastTick: number;

  constructor(
    private readonly modo: Modo,
    ahora: number,
  ) {
    this.lastTick = ahora;
  }

  /** For the copy check: are the tools already counted as open? */
  get counting(): boolean {
    return this.openSince > 0;
  }

  seconds(ahora: number): number {
    return this.openSince ? Math.round((ahora - this.openSince) / 1000) : 0;
  }

  /**
   * `ultimaRespuesta` comes back corrected: after a sleep the current time is
   * taken as the last answer, so the worker gets its grace period again.
   */
  tick(
    ahora: number,
    visible: boolean,
    ultimaRespuesta: number,
  ): { segundos: number | null; ultimaRespuesta: number } {
    const skipped = ahora - this.lastTick > CLOCK_JUMP_MS;

    this.lastTick = ahora;
    if (!visible || skipped) {
      // Hidden, frozen or asleep: that is why the worker is quiet, not a debugger.
      this.openSince = 0;

      return { segundos: null, ultimaRespuesta: ahora };
    }
    if (ahora - ultimaRespuesta > HILO_CALLADO_MS) {
      if (!this.openSince) this.openSince = ahora;
      const espera =
        this.modo === "entrada" ? ENTRADA_ABIERTAS_MS : SESION_ABIERTAS_MS;

      if (ahora - this.openSince >= espera) {
        return { segundos: this.seconds(ahora), ultimaRespuesta };
      }
    } else {
      // The worker answered in time: tools closed, the count restarts.
      this.openSince = 0;
    }

    return { segundos: null, ultimaRespuesta };
  }
}

/**
 * Mira si las herramientas de desarrollador están abiertas y avisa al
 * servidor por `socket` cuando se cumple la regla de `modo`.
 */
export function vigilarHerramientas(socket: Socket, modo: Modo): Vigilancia {
  const cuenta = new DevtoolsClock(modo, Date.now());
  let ultimaRespuesta = Date.now();
  let avisado = false;
  const base = {
    ancho: window.outerWidth - window.innerWidth,
    alto: window.outerHeight - window.innerHeight,
    zoom: window.devicePixelRatio,
  };
  const visible = () =>
    typeof document === "undefined" || document.visibilityState === "visible";

  const avisar = (segundos: number, extra: Record<string, unknown>) => {
    if (avisado) return;
    avisado = true;
    socket.emit("seguridad:senal", {
      tipo: modo === "entrada" ? "devtools-entrada" : "devtools-sesion",
      segundos,
      ruta: window.location.pathname,
      ...extra,
    });
  };

  let hilo: Worker | null = null;

  try {
    hilo = new Worker("/hilo-de-guardia.js");
    hilo.onmessage = () => {
      ultimaRespuesta = Date.now();
    };
  } catch {
    hilo = null;
  }

  // Copy actions on the sign-in screens only: docked tools = the inner window
  // suddenly loses more than 160 px at the same zoom.
  const saltoDeTamano = () =>
    window.devicePixelRatio === base.zoom &&
    (window.outerWidth - window.innerWidth - base.ancho > SALTO_DE_TAMANO_PX ||
      window.outerHeight - window.innerHeight - base.alto > SALTO_DE_TAMANO_PX);

  const reloj = window.setInterval(() => {
    if (!hilo) return;
    const r = cuenta.tick(Date.now(), visible(), ultimaRespuesta);

    ultimaRespuesta = r.ultimaRespuesta;
    if (r.segundos !== null) avisar(r.segundos, { accion: "abiertas" });
  }, 1000);

  // En la entrada: abiertas Y copiando = en el acto.
  const alCopiar = (accion: string) => {
    if (modo !== "entrada" || !visible()) return;
    if (cuenta.counting || saltoDeTamano())
      avisar(cuenta.seconds(Date.now()), { accion });
  };
  const onCopy = () => alCopiar("copiar");
  const onCut = () => alCopiar("cortar");
  const onMenu = () => alCopiar("menu");
  const onTecla = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    const k = String(e.key || "").toLowerCase();

    if (mod && k === "u") alCopiar("ver-codigo");
    else if (mod && k === "s") alCopiar("guardar");
    else if (mod && k === "c") alCopiar("copiar");
    else if (mod && k === "a") alCopiar("seleccionar-todo");
    else if (mod && e.shiftKey && (k === "c" || k === "i" || k === "j"))
      alCopiar("inspeccionar");
    else if (k === "f12") alCopiar("inspeccionar");
  };

  document.addEventListener("copy", onCopy);
  document.addEventListener("cut", onCut);
  document.addEventListener("contextmenu", onMenu);
  window.addEventListener("keydown", onTecla, true);

  return {
    parar() {
      window.clearInterval(reloj);
      try {
        hilo?.terminate();
      } catch {
        /* */
      }
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("contextmenu", onMenu);
      window.removeEventListener("keydown", onTecla, true);
    },
  };
}

/** Engancha la puerta a un socket: escucha «verificar» y «vigilar». */
export function engancharPuerta(socket: Socket, modo: Modo): () => void {
  let vigilancia: Vigilancia | null = null;
  const onVerificar = () => irAVerificacion();
  const onVigilar = () => {
    if (!vigilancia) vigilancia = vigilarHerramientas(socket, modo);
  };

  socket.on("seguridad:verificar", onVerificar);
  socket.on("seguridad:vigilar", onVigilar);

  return () => {
    socket.off("seguridad:verificar", onVerificar);
    socket.off("seguridad:vigilar", onVigilar);
    vigilancia?.parar();
    vigilancia = null;
  };
}

/**
 * La pantalla de entrada no tiene sesión: abre un socket ANÓNIMO que sólo
 * sirve a la puerta. Devuelve cómo cerrarlo.
 */
export function abrirPuertaDeEntrada(): () => void {
  let socket: Socket | null = null;

  try {
    socket = io(socketOrigin(), {
      path: SOCKET_PATH,
      transports: ["websocket"],
      withCredentials: true,
      auth: { puerta: true },
      reconnectionAttempts: 5,
    });
  } catch {
    return () => {};
  }
  const soltar = engancharPuerta(socket, "entrada");

  return () => {
    soltar();
    try {
      socket?.disconnect();
    } catch {
      /* */
    }
  };
}
