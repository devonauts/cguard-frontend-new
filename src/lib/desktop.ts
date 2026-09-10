/**
 * Puente con el escritorio — y con el sistema operativo en general.
 *
 * El CRM corre en tres envolturas: pestaña de navegador, PWA instalada y la app
 * de escritorio (Electron, carpeta desktop/). Este módulo es el ÚNICO sitio que
 * sabe distinguirlas; el resto del código llama a estas funciones y cada
 * envoltura hace lo que puede:
 *
 *   · notifyNative()  — aviso DEL SISTEMA (aparece aunque el CRM esté
 *     minimizado o detrás de otra ventana). En Electron la API web Notification
 *     ya es nativa; en navegador/PWA pide permiso una sola vez. Para una
 *     central de monitoreo esto es la diferencia entre ver el pánico y no verlo.
 *   · setAppBadge()   — contador en el icono (dock de macOS / barra de tareas /
 *     icono de la PWA). Electron vía el preload; PWA vía la Badging API.
 *   · onDeepLink()    — enlaces cguardpro:// abiertos desde fuera (el push del
 *     teléfono del dueño abre el incidente en su escritorio).
 *
 * `window.cguardDesktop` lo inyecta el preload de Electron (desktop/preload.cjs).
 * Si no existe, estamos en web y cada función degrada con elegancia.
 */

interface CguardDesktopBridge {
  setBadge: (count: number, overlayDataUrl?: string) => void;
  /** Des-esconde y enfoca la ventana (bandeja/minimizada). */
  focusWindow?: () => void;
  onDeepLink: (cb: (path: string) => void) => void;
  version?: string;
}

declare global {
  interface Window {
    cguardDesktop?: CguardDesktopBridge;
  }
}

/** ¿Corremos dentro de la app de escritorio? */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && !!window.cguardDesktop;
}

/* ── Avisos del sistema ─────────────────────────────────────────────────── */

let permissionAsked = false;

/** Pide el permiso de avisos una sola vez, y solo tras un gesto real (llamar
 *  esto desde un flujo de usuario, no al cargar — los navegadores penalizan el
 *  prompt en frío). En Electron el permiso ya está concedido por el shell. */
export function ensureNotificationPermission(): void {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default" && !permissionAsked) {
      permissionAsked = true;
      void Notification.requestPermission();
    }
  } catch {
    /* sin soporte */
  }
}

/**
 * Aviso nativo del sistema — SOLO cuando el CRM no está a la vista (minimizado,
 * en otra pestaña, detrás de otra app). Con la ventana visible ya están el
 * chime y el toast; duplicarlos en el centro de notificaciones es ruido.
 * Al tocarlo, trae la ventana al frente y navega a `path` si se indicó.
 */
export function notifyNative(
  title: string,
  body?: string,
  path?: string,
  eventId?: string,
): void {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      document.hasFocus()
    )
      return;
    const n = new Notification(title, {
      body: body || undefined,
      // El tag colapsa DUPLICADOS DEL MISMO EVENTO (dos montajes del stream, o
      // re-entrega del SO) — por eso usa el ID del evento, no el título: dos
      // pánicos distintos con el mismo título son DOS avisos, no uno (la
      // auditoría encontró que el tag por título tragaba el segundo pánico).
      tag: eventId ? `cguard-${eventId}` : undefined,
      icon: "/assets/logo/c-guard-app-logo.png",
    });

    n.onclick = () => {
      // En Electron, window.focus() no des-esconde una ventana en bandeja —
      // hay que pedírselo al proceso principal.
      try {
        window.cguardDesktop?.focusWindow?.();
      } catch {
        /* ignore */
      }
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      if (path) navigateInApp(path);
      n.close();
    };
  } catch {
    /* best-effort — un aviso perdido no puede romper nada */
  }
}

/* ── Contador en el icono ───────────────────────────────────────────────── */

/** Punto rojo con número (estilo barra de tareas de Windows), dibujado aquí
 *  porque el main process de Electron no tiene canvas. 32×32, legible a 16px. */
function drawBadgeOverlay(n: number): string | undefined {
  try {
    const c = document.createElement("canvas");

    c.width = 32;
    c.height = 32;
    const ctx = c.getContext("2d");

    if (!ctx) return undefined;
    ctx.beginPath();
    ctx.arc(16, 16, 15, 0, Math.PI * 2);
    ctx.fillStyle = "#d21f3c";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px -apple-system, 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(n > 99 ? "99+" : String(n), 16, 17);

    return c.toDataURL("image/png");
  } catch {
    return undefined;
  }
}

export function setAppBadge(count: number): void {
  const n = Math.max(0, Math.floor(count) || 0);

  // Electron (dock / barra de tareas) — el preload habla con el main process.
  // El overlay dibujado solo lo usa Windows; en macOS basta el número.
  try {
    window.cguardDesktop?.setBadge(n, n > 0 ? drawBadgeOverlay(n) : undefined);
  } catch {
    /* ignore */
  }
  // PWA instalada (Badging API — Chrome/Edge).
  try {
    const nav: any = navigator;

    if (typeof nav?.setAppBadge === "function") {
      if (n > 0) void nav.setAppBadge(n);
      else void nav.clearAppBadge?.();
    }
  } catch {
    /* ignore */
  }
}

/* ── Deep links (cguardpro://…) ─────────────────────────────────────────── */

/** Navegar dentro de la SPA sin recargar: pushState + popstate para que
 *  react-router (BrowserRouter) se entere. */
export function navigateInApp(path: string): void {
  try {
    const clean = path.startsWith("/") ? path : `/${path}`;

    window.history.pushState({}, "", clean);
    window.dispatchEvent(new PopStateEvent("popstate"));
  } catch {
    /* ignore */
  }
}

/** Suscribirse a los enlaces cguardpro:// que abren la app desde fuera. */
export function onDeepLink(cb: (path: string) => void): void {
  try {
    window.cguardDesktop?.onDeepLink(cb);
  } catch {
    /* ignore */
  }
}

/**
 * Mapa deep link → ruta REAL del CRM. El backend emite cguardpro://<entidad>/<id>
 * (ver communicationService.ts) pero las rutas del CRM no siempre se llaman
 * igual — sin este mapa, cada enlace caía en el 404 del router (auditoría
 * 2026-08-18). Lo que no tiene detalle propio aterriza en su LISTA, que siempre
 * es mejor que un 404.
 */
function mapDeepLink(raw: string): string {
  const clean = raw.startsWith("/") ? raw.slice(1) : raw;
  const [entity, id] = clean.split("/");

  switch (entity) {
    case "incidents":
      return id ? `/dispatch-tickets/${id}` : "/dispatch-tickets";
    case "visitors":
      return "/visitors"; // la bitácora es la vista de detalle
    case "tasks":
      return "/tasks";
    case "messages":
      return "/messenger";
    case "shifts":
      return "/nomina/time-clock"; // el punch vive en el reloj de nómina
    case "rondas":
      return "/dashboard"; // sin detalle propio en el CRM aún
    default:
      return `/${clean}`; // ruta ya-CRM (p.ej. /dispatch-tickets/x)
  }
}

// Manejo por defecto: un deep link navega dentro de la SPA. Registrado al
// importar el módulo (main.tsx lo importa una vez).
if (typeof window !== "undefined" && window.cguardDesktop) {
  onDeepLink((path) => navigateInApp(mapDeepLink(path)));
}
