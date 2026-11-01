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

import { iconoDeAvisos } from "@/lib/iconoDeAvisos";

/* ════════════════════════════════════════════════════════════════════════════
 * THE BRIDGE CONTRACT (desktop shell 1.1.0, 2026-10-31)
 *
 * `window.cguardDesktop` is exposed by the shell's preload (contextBridge),
 * only on `app://crm` (main re-checks the caller's origin and top frame). The
 * shell implements exactly these names. Its MAIN process owns the device key
 * and adds `X-CG-Desktop` / `X-CG-Device-Proof` to every API request; the
 * renderer (this code) never sees the key and never builds a proof.
 *
 * The web build is the SAME bundle: everything below is a no-op when the
 * bridge is missing, so a browser behaves exactly as before.
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The API's desktop error codes (backend i18n keys). They arrive in the JSON
 * body of a 401/403 as `code` (string) or as `messageCode` (the backend's
 * usual `Error401/Error403` shape, where `code` is the numeric status).
 */
export type DesktopErrorCode =
  | "desktop.deviceNotApproved"
  | "desktop.deviceProofInvalid"
  | "desktop.deviceRevoked"
  | "desktop.deviceRequired"
  | "desktop.updateRequired"
  // Any future `desktop.*` code is forwarded as-is.
  | (string & {});

/** The session the shell hands to the CRM at boot. */
export interface DesktopSession {
  /** JWT with the `dev: <deviceId>` claim (from `POST /api/desktop/session`). */
  token: string;
  deviceId?: string;
  /** Whatever the CRM passed as `data` to `signedIn` (JSON, ≤ 64 KB). */
  data?: unknown;
  /** The API the shell signs requests for (same as `apiBase`). */
  apiBase?: string;
}

/** A newer CRM bundle was downloaded, verified and switched in by the shell. */
export interface DesktopUpdateInfo {
  buildId: string;
  /** `true` = the API no longer works with the running build: the shell
   *  reloads by itself; the CRM never has to act on it. */
  required: boolean;
}

export interface CguardDesktopBridge {
  /** Shell version, e.g. "1.1.0". */
  version?: string;
  /** The OS (`darwin` | `win32`). */
  platform?: string;
  /** The API base the shell adds the device headers to, e.g.
   *  "https://api.mainconnector.com/api". The CRM uses it in the desktop so
   *  both always talk about the same host (see `lib/apiBase`). */
  apiBase?: string;
  /** OPTIONAL. The OS's preferred language (e.g. "es-EC"), for the first
   *  paint when the person never chose one. Electron's `navigator.language`
   *  follows the bundled Chromium locales, not the OS, unless the shell sets
   *  `--lang`. */
  locale?: string;

  /* ── Session (new in 1.1.0) ─────────────────────────────────────────────── */

  /**
   * The current approved-device session, or `null` (and always `null` unless
   * the CRM itself is loaded). Called ONCE at boot, before anything talks to
   * the API; `null` → the CRM calls `signedOut()` and does not mount.
   */
  getSession: () => Promise<DesktopSession | null>;
  /**
   * A token for the shell.
   *  · From the sign-in mini-app (`/p/`): the sign-in token (`dsk:'pending'`);
   *    the shell takes over (enrolment, pairing code, approval, CRM). Replaces
   *    the web's `POST /__sesion` + reload. A rejection makes the sign-in
   *    screen offer «try again / sign in again».
   *  · From the CRM, when the API hands it a replacement token (accepting an
   *    invitation, joining a company): a token whose `dev` claim is this
   *    device just replaces the stored one.
   * `data`: optional JSON (≤ 64 KB) returned by `getSession()`.
   */
  signedIn: (token: string, data?: unknown) => Promise<void> | void;
  /**
   * The session is over (sign-out from the menu, a 401, a session replaced
   * elsewhere, access blocked). The shell forgets the session token and shows
   * its sign-in. Idempotent.
   */
  signedOut: () => Promise<void> | void;
  /**
   * The API answered 401/403 with a `desktop.*` code. The shell shows its own
   * screen (pending approval, revoked → wipe, proof invalid, update needed…).
   * The CRM does not sign out on these codes; the shell decides.
   */
  deviceProblem: (code: DesktopErrorCode) => void;
  /**
   * «A new CRM build is ready» (checked at launch and every 15 min). The CRM
   * shows its «new version» notice; reloading goes through `applyUpdate()`
   * when present, else `location.reload()`. Returns an unsubscribe function.
   */
  onUpdateReady: (cb: (info: DesktopUpdateInfo) => void) => () => void;
  /** OPTIONAL. Switch to the downloaded build now (else `location.reload()`). */
  applyUpdate?: () => Promise<void> | void;

  /* ── OS integration (since 1.0.0) ───────────────────────────────────────── */

  setBadge: (count: number, overlayDataUrl?: string) => void;
  /** Des-esconde y enfoca la ventana (bandeja/minimizada). */
  focusWindow?: () => void;
  /** Returns an unsubscribe function (1.1.0). */
  onDeepLink: (cb: (path: string) => void) => (() => void) | void;
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

/** The bridge, with every member treated as possibly missing (older shells). */
function puente(): Partial<CguardDesktopBridge> | null {
  try {
    return (typeof window !== "undefined" && window.cguardDesktop) || null;
  } catch {
    return null;
  }
}

/* ── Session ────────────────────────────────────────────────────────────── */

/**
 * The boot read of the desktop session.
 *   · `undefined` — not a session-owning shell (web, or a pre-1.1 shell):
 *     keep the usual behaviour (the token in localStorage).
 *   · `null`      — the shell has no session.
 *   · a string    — the token to use for this run.
 */
export async function loadDesktopSession(): Promise<string | null | undefined> {
  const b = puente();

  if (!b || typeof b.getSession !== "function") return undefined;
  try {
    const s = await b.getSession();
    const token = s && typeof s.token === "string" ? s.token.trim() : "";

    return token || null;
  } catch {
    return null;
  }
}

/** How long boot waits for `getSession()` before giving up (it may refresh
 *  the session over the network, so this is generous). */
export const DESKTOP_SESSION_TIMEOUT_MS = 30_000;

/**
 * Boot in the desktop app: the CRM takes its session from the shell, never
 * from whatever an earlier run left in storage. `apply` stores the token the
 * way the rest of the CRM reads it (`lib/api` `setAuthToken`); it is called
 * with `null` first so nothing can leave with a stale token while the shell
 * answers. Resolves `true` when the CRM may mount (web and pre-1.1 shells
 * always), `false` when there is no session — the shell has then been told
 * (`signedOut`) and takes the window back to its sign-in.
 */
export async function bootDesktopSession(
  apply: (token: string | null) => void,
  timeoutMs = DESKTOP_SESSION_TIMEOUT_MS,
): Promise<boolean> {
  const b = puente();

  if (!b || typeof b.getSession !== "function") return true;
  try {
    apply(null);
  } catch {
    /* storage unavailable: the token below still reaches memory */
  }
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const token = await Promise.race([
    loadDesktopSession(),
    new Promise<null>((ok) => {
      reloj = setTimeout(() => ok(null), timeoutMs);
    }),
  ]);

  if (reloj !== undefined) clearTimeout(reloj);
  if (!token) {
    notifyDesktopSignedOut("/login");

    return false;
  }
  try {
    apply(token);
  } catch {
    notifyDesktopSignedOut("/login");

    return false;
  }

  return true;
}

/**
 * The sign-in hand-off of the public mini-app, in the desktop. `true` when
 * the shell took the token (it navigates on its own), `false` when there is
 * no shell to hand it to or the shell refused it.
 */
export async function handOffToDesktop(token: string): Promise<boolean> {
  const b = puente();

  if (!b || typeof b.signedIn !== "function" || !token) return false;
  try {
    await b.signedIn(token);

    return true;
  } catch {
    return false;
  }
}

let salidaAvisada = false;

/**
 * Tell the shell the session is over. Once per page: the sign-out, the 401
 * of a request in flight and the socket notice usually arrive together.
 * `true` when a session-owning shell was told (the caller then leaves the
 * navigation to the shell). `_path` (where the web would go) is not sent:
 * the shell always opens its own sign-in.
 */
export function notifyDesktopSignedOut(_path?: string): boolean {
  const b = puente();

  if (!b || typeof b.signedOut !== "function") return false;
  if (salidaAvisada) return true;
  salidaAvisada = true;
  try {
    void Promise.resolve(b.signedOut()).catch(() => {
      /* the shell's problem now */
    });
  } catch {
    /* ignore */
  }

  return true;
}

/**
 * A replacement token arrived while running (accepting an invitation, joining
 * a company): hand it to the shell (`signedIn`) so the next launch uses it.
 */
export function notifyDesktopSessionUpdated(token: string): void {
  const b = puente();

  if (!b || typeof b.signedIn !== "function" || !token) return;
  try {
    void Promise.resolve(b.signedIn(token)).catch(() => {
      /* kept for this run only */
    });
  } catch {
    /* ignore */
  }
}

/** Reload into the build the shell downloaded. */
export async function applyDesktopUpdate(): Promise<void> {
  const b = puente();

  try {
    if (b && typeof b.applyUpdate === "function") {
      await b.applyUpdate();

      return;
    }
  } catch {
    /* fall back to a plain reload */
  }
  window.location.reload();
}

/** The OS language the shell reports (desktop only), or null. */
export function desktopLocale(): string | null {
  const b = puente();
  const l = b && typeof b.locale === "string" ? b.locale.trim() : "";

  return l || null;
}

/** The API base the shell signs for (desktop only, https only), or null. */
export function desktopApiBase(): string | null {
  const b = puente();
  const u = b && typeof b.apiBase === "string" ? b.apiBase.trim() : "";

  // https always; plain http only for this computer (the shell's local test
  // server — a packaged shell never offers anything but its https API).
  const ok =
    /^https:\/\/[^/\s]+/i.test(u) ||
    /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i.test(u);

  return ok ? u.replace(/\/+$/, "") : null;
}

/* ── Device problems (`desktop.*` codes) ────────────────────────────────── */

const PREFIJO_DESKTOP = "desktop.";

/**
 * The `desktop.*` code of an API error, or `null`. Only inside the desktop
 * (a browser never gets these codes; if one did, it follows the normal path)
 * and only for 401/403.
 */
export function desktopErrorCode(
  status: number | undefined,
  body: unknown,
): DesktopErrorCode | null {
  if (!isDesktop()) return null;
  if (status !== 401 && status !== 403) return null;
  if (!body || typeof body !== "object") return null;
  const b = body as { code?: unknown; messageCode?: unknown };

  for (const c of [b.code, b.messageCode]) {
    if (
      typeof c === "string" &&
      c.startsWith(PREFIJO_DESKTOP) &&
      c.length <= 80
    )
      return c;
  }

  return null;
}

const VENTANA_PROBLEMA_MS = 10_000;
const ultimoProblema = new Map<string, number>();

/**
 * Hand a `desktop.*` code to the shell. The same code is not repeated within
 * 10 s: a screen fires a dozen requests at once and they all fail together.
 */
export function reportDeviceProblem(
  code: DesktopErrorCode,
  ahora = Date.now(),
): boolean {
  const b = puente();

  if (!b || typeof b.deviceProblem !== "function") return false;
  const antes = ultimoProblema.get(code);

  if (antes !== undefined && ahora - antes < VENTANA_PROBLEMA_MS) return true;
  ultimoProblema.set(code, ahora);
  try {
    b.deviceProblem(code);
  } catch {
    /* ignore */
  }

  return true;
}

/**
 * The API error handlers' single entry point: `true` when the error was a
 * desktop device problem and has been handed to the shell (the caller then
 * skips its own sign-out / toast handling).
 */
export function handleDesktopApiError(
  status: number | undefined,
  body: unknown,
): boolean {
  const code = desktopErrorCode(status, body);

  return code ? reportDeviceProblem(code) : false;
}

/* ── New CRM build ──────────────────────────────────────────────────────── */

/** Subscribe to the shell's «new build ready». No-op on the web. */
export function onDesktopUpdateReady(
  cb: (info: DesktopUpdateInfo) => void,
): () => void {
  const b = puente();

  if (!b || typeof b.onUpdateReady !== "function") return () => {};
  try {
    const off = b.onUpdateReady((info) => {
      try {
        cb({
          buildId: String(info?.buildId ?? ""),
          required: info?.required === true,
        });
      } catch {
        /* ignore */
      }
    });

    return typeof off === "function" ? off : () => {};
  } catch {
    return () => {};
  }
}

/** Only for tests. */
export function _resetDesktopForTests(): void {
  salidaAvisada = false;
  ultimoProblema.clear();
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
      // The host's icon (see `lib/iconoDeAvisos`): never ours on a partner's host.
      icon: iconoDeAvisos(),
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
