import { useCallback, useEffect, useState } from "react";
import { messageService } from "@/lib/api/messageService";

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

export function useMessagesUnread(enabled = true): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const r: any = await messageService.unreadCount();
      const n = Number(r?.count ?? 0);
      setCount(Number.isFinite(n) && n > 0 ? n : 0);
    } catch {
      // Sin empresa seleccionada, sin permiso de mensajería o sin red: el punto
      // simplemente no aparece. Nunca rompe el menú.
      setCount(0);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let vivo = true;
    const tick = () => { if (vivo) refresh(); };

    tick();
    window.addEventListener(MESSAGES_CHANGED_EVENT, tick);
    window.addEventListener("focus", tick);
    const id = window.setInterval(tick, INTERVALO_MS);

    return () => {
      vivo = false;
      window.removeEventListener(MESSAGES_CHANGED_EVENT, tick);
      window.removeEventListener("focus", tick);
      window.clearInterval(id);
    };
  }, [enabled, refresh]);

  return count;
}

export default useMessagesUnread;
