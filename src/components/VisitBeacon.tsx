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
import { useEffect, useRef } from "react"
import { useLocation } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"

const API = (import.meta.env.VITE_API_URL as string | undefined) || ""
const LATIDO_MS = 60_000

function idDeSesion(): string {
  try {
    let s = sessionStorage.getItem("cg_vid")
    if (!s) {
      s = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
      sessionStorage.setItem("cg_vid", s)
    }
    return s
  } catch {
    return "c" + Math.random().toString(36).slice(2, 12)
  }
}

export default function VisitBeacon() {
  const { user } = useAuth()
  const location = useLocation()
  // La ruta viva, leída por el latido sin re-armar el intervalo en cada página.
  const rutaRef = useRef(location.pathname)
  rutaRef.current = location.pathname + location.search

  const datosRef = useRef<{ tenantId: string | null; tenantName: string | null; userEmail: string | null }>({
    tenantId: null, tenantName: null, userEmail: null,
  })
  useEffect(() => {
    const u: any = user
    const primer = u && Array.isArray(u.tenants) && u.tenants.length > 0 ? u.tenants[0] : null
    datosRef.current = {
      tenantId: (typeof localStorage !== "undefined" ? localStorage.getItem("tenantId") : null)
        || primer?.tenantId || primer?.tenant?.id || null,
      tenantName: primer?.tenant?.name || null,
      userEmail: u?.email || null,
    }
  }, [user])

  useEffect(() => {
    if (!API) return
    let vivo = true

    const enviar = (beat: boolean) => {
      if (!vivo) return
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
            ...datosRef.current,
          }),
        }).catch(() => {})
      } catch { /* una visita perdida no es un incidente */ }
    }

    enviar(false)
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") enviar(true)
    }, LATIDO_MS)
    return () => { vivo = false; window.clearInterval(t) }
    // Una página vista por cada cambio de ruta; el latido lo monta la primera.
  }, [location.pathname])

  return null
}
