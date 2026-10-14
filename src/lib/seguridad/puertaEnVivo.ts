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
 * para y deja de contestar. Además, si la ventana pierde de golpe más de
 * 160 px por dentro sin cambiar por fuera (herramientas acopladas), también
 * cuenta — sólo para la entrada, porque el panel lateral del navegador hace lo
 * mismo. Desactivar los puntos de ruptura lo esquiva: es una señal, no un muro.
 * ════════════════════════════════════════════════════════════════════════════
 */

export const URL_VERIFICACION = "/verificacion-humana";

const ENTRADA_ABIERTAS_MS = 30_000;
const SESION_ABIERTAS_MS = 60_000;
const HILO_CALLADO_MS = 1_500;
const SALTO_DE_TAMANO_PX = 160;

let yendo = false;

/** Fuera de aquí: a la verificación (nginx sirve esa página fuera del CRM). */
export function irAVerificacion(): void {
  if (yendo || typeof window === "undefined") return;
  if (window.location.pathname.startsWith(URL_VERIFICACION)) return;
  yendo = true;
  window.location.replace(URL_VERIFICACION);
}

type Modo = "entrada" | "sesion";

interface Vigilancia {
  parar: () => void;
}

/**
 * Mira si las herramientas de desarrollador están abiertas y avisa al
 * servidor por `socket` cuando se cumple la regla de `modo`.
 */
export function vigilarHerramientas(socket: Socket, modo: Modo): Vigilancia {
  let abiertasDesde = 0;
  let ultimaRespuesta = Date.now();
  let avisado = false;
  const base = {
    ancho: window.outerWidth - window.innerWidth,
    alto: window.outerHeight - window.innerHeight,
  };

  const avisar = (extra: Record<string, unknown>) => {
    if (avisado) return;
    avisado = true;
    socket.emit("seguridad:senal", {
      tipo: modo === "entrada" ? "devtools-entrada" : "devtools-sesion",
      segundos: abiertasDesde
        ? Math.round((Date.now() - abiertasDesde) / 1000)
        : 0,
      ruta: window.location.pathname,
      ...extra,
    });
  };

  let hilo: Worker | null = null;

  try {
    hilo = new Worker("/hilo-de-guardia.js");
    hilo.onmessage = (e) => {
      ultimaRespuesta = Date.now();
      // Tardó en volver: estuvo parado en el depurador.
      if (Number(e.data) > 200 && !abiertasDesde)
        abiertasDesde = Date.now() - Number(e.data);
    };
  } catch {
    hilo = null;
  }

  const saltoDeTamano = () =>
    window.outerWidth - window.innerWidth - base.ancho > SALTO_DE_TAMANO_PX ||
    window.outerHeight - window.innerHeight - base.alto > SALTO_DE_TAMANO_PX;

  const abiertas = (): boolean => {
    const parado = !!hilo && Date.now() - ultimaRespuesta > HILO_CALLADO_MS;

    return parado || (modo === "entrada" && saltoDeTamano());
  };

  const reloj = window.setInterval(() => {
    if (abiertas()) {
      if (!abiertasDesde) abiertasDesde = Date.now();
      const lleva = Date.now() - abiertasDesde;

      if (
        lleva >= (modo === "entrada" ? ENTRADA_ABIERTAS_MS : SESION_ABIERTAS_MS)
      ) {
        avisar({ accion: "abiertas" });
      }
    } else if (Date.now() - ultimaRespuesta < HILO_CALLADO_MS) {
      // Contestó a tiempo: están cerradas. La cuenta del minuto vuelve a cero.
      abiertasDesde = 0;
    }
  }, 1000);

  // En la entrada: abiertas Y copiando = en el acto.
  const alCopiar = (accion: string) => {
    if (modo === "entrada" && abiertas()) avisar({ accion });
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
