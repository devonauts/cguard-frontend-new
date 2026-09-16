import { useEffect, useState } from "react";

import { messageService } from "@/lib/api/messageService";
import { crearSocket, cerrarSocket } from "@/lib/socket";
import { getAuthToken } from "@/lib/api";

/**
 * Mensajes sin leer del buzón del CRM — el punto del menú lateral.
 *
 * El buzón del CRM es COMPARTIDO: cualquiera de la oficina ve todos los hilos.
 * El contador, en cambio, es de cada persona (sale de sus acuses de recibo), así
 * que dos administradores pueden tener números distintos sobre los mismos hilos.
 *
 * Se refresca por tres vías, y las tres hacen falta:
 *  · el aviso `cg:messages-changed`, que dispara la campana cuando entra un
 *    mensaje y la pantalla de mensajería cuando se lee un hilo → reacción
 *    inmediata, sin esperar al reloj;
 *  · al volver a la pestaña, porque el intervalo no corre fiable en segundo plano;
 *  · un intervalo largo como red de seguridad si el socket estaba caído.
 *
 * ── UN SOLO RELOJ PARA TODOS LOS MONTAJES ──────────────────────────────────
 * El menú lateral está montado DOS VECES a la vez: el `aside` de escritorio
 * (`hidden lg:block`) y el cajón móvil (`lg:hidden`), que no se desmonta — sólo
 * se desplaza fuera de pantalla con `translate-x`. Como el hook creaba su propio
 * intervalo, el CRM pedía el contador DOS veces por minuto en cualquier
 * pantalla, siempre.
 *
 * Se arregla aquí y no en el layout a propósito: renderizar un solo menú según
 * el ancho obliga a desmontar y remontar al redimensionar o al girar el
 * teléfono, y eso rompe el estado del propio menú. Aquí el estado vive fuera de
 * React, con recuento de suscriptores: el primero que monta arranca el reloj, el
 * último que se va lo para, y todos comparten la misma respuesta.
 *
 * ── Y SE PARA CON LA PESTAÑA OCULTA ────────────────────────────────────────
 * Nadie lee el punto de un menú que no está en pantalla. Además el CRM mantiene
 * varios websockets abiertos, y Chrome NO aplica su estrangulamiento agresivo a
 * las pestañas con websocket — o sea que sin esta guarda el reloj seguía
 * corriendo a ritmo completo toda la noche.
 */
export const MESSAGES_CHANGED_EVENT = "cg:messages-changed";

/** Avisa al menú lateral de que el contador pudo cambiar. */
export function notifyMessagesChanged() {
  try {
    window.dispatchEvent(new CustomEvent(MESSAGES_CHANGED_EVENT));
  } catch {
    /* entornos sin CustomEvent (pruebas) — el intervalo lo recoge igual */
  }
}

const INTERVALO_MS = 60_000;

// ── Estado compartido, fuera de React ──────────────────────────────────────
let valor = 0;
let timer: number | null = null;
const suscriptores = new Set<(n: number) => void>();

function publicar(n: number) {
  valor = n;
  for (const f of suscriptores) f(n);
}

async function consultar() {
  try {
    const r: any = await messageService.unreadCount();
    const n = Number(r?.count ?? 0);

    publicar(Number.isFinite(n) && n > 0 ? n : 0);
  } catch {
    // Sin empresa seleccionada, sin permiso de mensajería o sin red: el punto
    // simplemente no aparece. Nunca rompe el menú.
    publicar(0);
  }
}

/** Sólo se consulta con la pestaña a la vista. */
const visible = () =>
  typeof document === "undefined" || document.visibilityState !== "hidden";

const tick = () => {
  if (visible()) void consultar();
};

const alVolver = () => {
  // Volver a la pestaña: se pide una vez de golpe y se rearma el reloj, que
  // pudo quedar parado mientras estaba oculta.
  if (visible()) {
    void consultar();
    arrancarTimer();
  } else pararTimer();
};

function arrancarTimer() {
  if (timer == null) timer = window.setInterval(tick, INTERVALO_MS);
}
function pararTimer() {
  if (timer != null) {
    window.clearInterval(timer);
    timer = null;
  }
}

/* El socket es la vía rápida: `message:changed` llega en cuanto alguien manda
   o lee un mensaje, para las tres ramas de destinatario. El reloj se queda como
   red de seguridad —a 60 s y parado con la pestaña oculta— por si el socket
   estaba caído, y `connect` recupera lo que pasó mientras no escuchábamos. */
let socketContador: ReturnType<typeof crearSocket> | null = null;

/* `connect` sirve para RECUPERAR lo que pasó mientras el socket estuvo caído.
   En la PRIMERA conexión no hay nada que recuperar: `arrancar()` acaba de
   preguntar unas milésimas antes, así que el handler disparaba una segunda
   consulta idéntica en cada arranque (medido: 2× /message-unread por carga).
   Sólo se recupera a partir de la RE-conexión. */
let yaConectoAlgunaVez = false;

const alConectar = () => {
  if (yaConectoAlgunaVez) tick();
  yaConectoAlgunaVez = true;
};

function arrancar() {
  window.addEventListener(MESSAGES_CHANGED_EVENT, tick);
  window.addEventListener("focus", alVolver);
  document.addEventListener("visibilitychange", alVolver);
  try {
    const tid = localStorage.getItem("tenantId") || "";

    if (tid) {
      socketContador = crearSocket(getAuthToken() || "", tid);
      socketContador.on("message:changed", tick);
      socketContador.on("connect", alConectar);
    }
  } catch {
    /* sin socket, el reloj sigue cubriendo */
  }
  arrancarTimer();
  void consultar();
}

function parar() {
  if (socketContador) {
    socketContador.off("message:changed", tick);
    socketContador.off("connect", alConectar);
    cerrarSocket(socketContador);
    socketContador = null;
  }
  window.removeEventListener(MESSAGES_CHANGED_EVENT, tick);
  window.removeEventListener("focus", alVolver);
  document.removeEventListener("visibilitychange", alVolver);
  pararTimer();
  yaConectoAlgunaVez = false;
  valor = 0;
}

export function useMessagesUnread(enabled = true): number {
  const [count, setCount] = useState(enabled ? valor : 0);

  useEffect(() => {
    if (!enabled) {
      setCount(0);

      return;
    }
    // El primero que monta arranca; el último que se va, para.
    const primero = suscriptores.size === 0;

    suscriptores.add(setCount);
    if (primero) arrancar();
    else setCount(valor); // los siguientes heredan el último valor conocido

    return () => {
      suscriptores.delete(setCount);
      if (suscriptores.size === 0) parar();
    };
  }, [enabled]);

  return count;
}
