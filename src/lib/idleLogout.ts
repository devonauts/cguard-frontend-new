import i18n from "@/i18n";
/**
 * Cierre de sesión por inactividad — el motor del ajuste de Configuración ›
 * Seguridad (settings.sessionPolicy.idleTimeoutMinutes).
 *
 * El caso que cierra es el de la auditoría del 15-ago: «un navegador de
 * recepción queda abierto un mes». La política vivía escrita en la base sin un
 * solo consumidor; esto la hace real DONDE está el riesgo: el CRM abierto y
 * desatendido. (Las apps de campo quedan fuera a propósito — un vigilante no
 * teclea durante horas y su turno ES la sesión.)
 *
 * Diseño:
 *  - La actividad se mide con eventos de entrada (puntero, teclado, scroll),
 *    anotados con throttle de 5 s: escuchar cada movimiento sería gratis para
 *    el usuario y caro para la batería.
 *  - Un solo intervalo de 30 s compara contra el umbral. 0 = apagado (defecto).
 *  - Aviso 2 minutos antes (si warnBeforeLogout): cualquier actividad lo
 *    cancela. Sin sorpresa no hay confianza en el ajuste.
 *  - El cierre pasa por el MISMO signOut del menú: limpia todo lo que ya
 *    limpia, sin inventar un segundo camino de salida.
 */
import { toast } from "sonner";

import api from "@/lib/api";

const CHECK_MS = 30_000;
const THROTTLE_MS = 5_000;
const AVISO_MS = 2 * 60_000;

let lastActivity = Date.now();
let lastMark = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let avisado = false;
let listeners: Array<[string, EventListener]> = [];

function marcarActividad() {
  const now = Date.now();

  if (now - lastMark < THROTTLE_MS) return;
  lastMark = now;
  lastActivity = now;
  avisado = false;
}

export function stopIdleLogout() {
  if (timer) clearInterval(timer);
  timer = null;
  for (const [ev, fn] of listeners) window.removeEventListener(ev, fn);
  listeners = [];
}

/**
 * Arranca (o re-arranca) el vigilante de inactividad leyendo la política del
 * tenant. Llamar de nuevo es seguro: se reinicia limpio.
 */
export async function startIdleLogout(
  signOut: () => Promise<void>,
): Promise<void> {
  stopIdleLogout();
  try {
    const tenantId = localStorage.getItem("tenantId");

    if (!tenantId || !localStorage.getItem("authToken")) return;

    const { data } = await api.get(`/tenant/${tenantId}/settings`, {
      toast: { silentError: true },
    } as any);
    const pol = (data && data.sessionPolicy) || {};
    const idleMin = Number(pol.idleTimeoutMinutes) || 0;

    if (idleMin <= 0) return; // apagado — el comportamiento de siempre

    const warn = pol.warnBeforeLogout !== false;

    lastActivity = Date.now();
    avisado = false;

    for (const ev of [
      "pointerdown",
      "keydown",
      "wheel",
      "touchstart",
      "visibilitychange",
    ] as const) {
      const fn = () => {
        if (ev !== "visibilitychange" || document.visibilityState === "visible")
          marcarActividad();
      };

      window.addEventListener(ev, fn, { passive: true });
      listeners.push([ev, fn]);
    }

    const limiteMs = idleMin * 60_000;

    timer = setInterval(async () => {
      if (!localStorage.getItem("authToken")) {
        stopIdleLogout();

        return;
      }
      const idleMs = Date.now() - lastActivity;

      if (
        warn &&
        !avisado &&
        idleMs >= limiteMs - AVISO_MS &&
        idleMs < limiteMs
      ) {
        avisado = true;
        toast.warning(
          i18n.t(
            "ui.idleLogout.tuSesionSeCerraraEn2Minutos",
            "Tu sesión se cerrará en 2 minutos por inactividad. Mueve el ratón para seguir dentro.",
          ),
          { duration: 110_000 },
        );

        return;
      }
      if (idleMs >= limiteMs) {
        stopIdleLogout();
        try {
          await signOut();
        } catch {
          /* el 401 posterior termina el trabajo */
        }
        toast.info(
          i18n.t(
            "ui.idleLogout.cerramosTuSesionPorInactividad",
            "Cerramos tu sesión por inactividad. Vuelve a entrar cuando quieras.",
          ),
        );
      }
    }, CHECK_MS);
  } catch {
    /* sin política legible no se vigila: fallar abierto es no cambiar nada */
  }
}
