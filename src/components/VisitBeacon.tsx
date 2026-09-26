/**
 * AVISO DE VISITA (CRM).
 *
 * Manda al panel del dueño quién está usando el CRM ahora mismo. Lo mismo que
 * ya hace el sitio público, con dos datos más que aquí SÍ se conocen: de qué
 * empresa es la sesión y con qué correo entró — es un panel interno del dueño
 * de la plataforma, no una analítica de terceros: no sale de nuestro servidor
 * y la dirección de red se recorta antes de guardarse.
 *
 * Se monta dentro del armazón autenticado, así que sólo late con sesión
 * abierta, y nunca pinta nada ni puede tumbar una pantalla: todo error se
 * traga.
 */
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { resolveApiBase } from "@/lib/apiBase";

const API = (resolveApiBase() as string | undefined) || "";
const LATIDO_MS = 60_000;

function idDeSesion(): string {
  try {
    let s = sessionStorage.getItem("cg_vid");

    if (!s) {
      s =
        "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem("cg_vid", s);
    }

    return s;
  } catch {
    return "c" + Math.random().toString(36).slice(2, 12);
  }
}

export default function VisitBeacon() {
  const { user } = useAuth();
  const location = useLocation();
  // La ruta viva, leída por el latido sin re-armar el intervalo en cada página.
  const rutaRef = useRef(location.pathname);

  rutaRef.current = location.pathname + location.search;
  /** La pantalla anterior: dentro del CRM `document.referrer` nunca cambia. */
  const anteriorRef = useRef<string | null>(null);

  const datosRef = useRef<{
    tenantId: string | null;
    tenantName: string | null;
    userEmail: string | null;
  }>({
    tenantId: null,
    tenantName: null,
    userEmail: null,
  });

  useEffect(() => {
    const u: any = user;
    const primer =
      u && Array.isArray(u.tenants) && u.tenants.length > 0
        ? u.tenants[0]
        : null;

    datosRef.current = {
      tenantId:
        (typeof localStorage !== "undefined"
          ? localStorage.getItem("tenantId")
          : null) ||
        primer?.tenantId ||
        primer?.tenant?.id ||
        null,
      tenantName: primer?.tenant?.name || null,
      userEmail: u?.email || null,
    };
  }, [user]);

  useEffect(() => {
    if (!API) return;
    let vivo = true;

    // ── ESTA pantalla ────────────────────────────────────────────────────
    // El CRM es una sola página que cambia de ruta, así que el «abrir» y el
    // «cerrar» de cada pantalla son el montaje y el desmontaje de este efecto.
    // El id viaja con cada aviso para que el servidor corrija SIEMPRE la misma
    // fila: abrir, latir y cerrar son tres avisos de una sola pantalla vista.
    let orden = 1;

    try {
      orden = Math.min(
        9999,
        (parseInt(sessionStorage.getItem("cg_ord") || "0", 10) || 0) + 1,
      );
      sessionStorage.setItem("cg_ord", String(orden));
    } catch {
      /* sin almacenamiento, todas serán la primera */
    }
    const pvId =
      `${idDeSesion()}-${orden}-${Math.random().toString(36).slice(2, 6)}`.slice(
        0,
        72,
      );
    const rutaAnterior = anteriorRef.current;

    anteriorRef.current = rutaRef.current;

    // Atención REAL: sólo corre con la pestaña a la vista. Un CRM abierto toda
    // la tarde en segundo plano no son ocho horas de uso.
    let acumulado = 0;
    let desde = document.visibilityState === "visible" ? Date.now() : 0;
    let scrollMax = 0;
    const segundos = () =>
      Math.round((acumulado + (desde ? Date.now() - desde : 0)) / 1000);
    const medirScroll = () => {
      try {
        const alto = document.documentElement.scrollHeight - window.innerHeight;
        const pct =
          alto <= 0 ? 100 : Math.round(((window.scrollY || 0) / alto) * 100);

        if (pct > scrollMax) scrollMax = Math.max(0, Math.min(100, pct));
      } catch {
        /* da igual */
      }
    };

    medirScroll();
    window.addEventListener("scroll", medirScroll, { passive: true });

    const enviar = (beat: boolean, cerrada = false) => {
      if (!vivo && !cerrada) return;
      try {
        fetch(`${API}/track`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "omit",
          keepalive: true,
          body: JSON.stringify({
            source: "crm",
            sessionId: idDeSesion(),
            path: rutaRef.current,
            title: (document.title || "").slice(0, 160),
            referrer: document.referrer || "",
            landing: rutaRef.current,
            lang: document.documentElement.lang || navigator.language || "",
            screen: `${screen.width}x${screen.height}`,
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
            beat,
            pv: {
              id: pvId,
              orden,
              // De qué pantalla venía. Dentro del CRM `document.referrer` se
              // queda congelado en la primera carga, así que la de verdad es
              // la ruta anterior que guardamos nosotros.
              referrer: rutaAnterior || document.referrer || "",
              segundos: segundos(),
              scroll: scrollMax,
              cerrada,
            },
            ...datosRef.current,
          }),
        }).catch(() => {});
      } catch {
        /* una visita perdida no es un incidente */
      }
    };

    const cerrar = () => {
      if (desde) {
        acumulado += Date.now() - desde;
        desde = 0;
      }
      medirScroll();
      enviar(true, true);
    };
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === "hidden") cerrar();
      else if (!desde) desde = Date.now();
    };

    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    window.addEventListener("pagehide", cerrar);

    enviar(false);
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") enviar(true);
    }, LATIDO_MS);

    return () => {
      // El desmontaje ES el cierre de la pantalla: se va con su atención
      // acumulada antes de que `vivo` corte los envíos.
      cerrar();
      vivo = false;
      window.clearInterval(t);
      window.removeEventListener("scroll", medirScroll);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      window.removeEventListener("pagehide", cerrar);
    };
    // Una pantalla vista por cada cambio de ruta; el latido lo monta cada una.
  }, [location.pathname]);

  return null;
}
