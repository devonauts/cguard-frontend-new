/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL CÓDIGO DEL CRM, DETRÁS DE LA SESIÓN (2026-10-25).
 *
 * Un rastreador alemán se llevó ~400 trozos del CRM sin iniciar sesión: la
 * pantalla de acceso era la misma aplicación, y el navegador podía pedir todo
 * lo demás. Desde ahora el servidor sólo entrega el CRM de verdad
 * (`index.html`, `/assets/*`, `/sw.js`) a un navegador con la cookie `cg_crm`,
 * HttpOnly, que firma el backend. Sin ella se sirve la mini-aplicación pública
 * (`/p/`): acceso, registro, invitaciones, recuperar contraseña y las vistas
 * públicas por enlace.
 *
 * Este módulo es el lado del navegador de ese trato:
 *   · `abrirSesionDeCodigo`  — POST /__sesion con el token → el servidor pone
 *     la cookie. Al entrar, al arrancar con sesión y cada 4 h.
 *   · `cerrarSesionDeCodigo` — DELETE /__sesion → la quita. Al salir y en
 *     cualquier cierre forzado (401, sesión desplazada, acceso bloqueado).
 *
 * Nunca rompe nada: si la petición falla se apunta en la consola y se sigue.
 * El servidor es quien decide; esto sólo le pide la cookie a tiempo.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { notifyDesktopSignedOut } from "@/lib/desktop";

const RUTA = "/__sesion";

/** Refresco mientras la pestaña sigue abierta: la cookie caduca sola. */
export const REFRESCO_MS = 4 * 60 * 60 * 1000;

export type ResultadoDeSesion = "ok" | "rechazada" | "fallo";

/**
 * Sólo en la web: la app de escritorio carga el bundle desde `app://` (no hay
 * nginx ni cookie que valga) y las pruebas no tienen `location` http.
 */
function disponible(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if ((window as any).cguardDesktop) return false;

    return /^https?:$/.test(window.location.protocol);
  } catch {
    return false;
  }
}

function leerToken(): string | null {
  try {
    return localStorage.getItem("authToken");
  } catch {
    return null;
  }
}

/** Pide la cookie del código. `rechazada` = el token ya no vale (401/403). */
export async function abrirSesionDeCodigo(
  token: string | null = leerToken(),
): Promise<ResultadoDeSesion> {
  if (!disponible() || !token) return "fallo";
  try {
    const r = await fetch(RUTA, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (r.ok) return "ok";
    if (r.status === 401 || r.status === 403) return "rechazada";
    console.warn(`[sesion-de-codigo] no se pudo abrir: ${r.status}`);

    return "fallo";
  } catch (e: any) {
    console.warn("[sesion-de-codigo] no se pudo abrir:", e?.message || e);

    return "fallo";
  }
}

/**
 * Quita la cookie. `keepalive`: casi siempre la llama un cierre que recarga la
 * página justo después, y la petición tiene que salir igual.
 */
export function cerrarSesionDeCodigo(): Promise<void> {
  /* In the desktop app there is no cookie: every forced close (401, session
     replaced, access blocked) passes through here, so this is where the shell
     learns the session is over and takes the window back to its sign-in. */
  notifyDesktopSignedOut();
  if (!disponible()) return Promise.resolve();
  try {
    return fetch(RUTA, {
      method: "DELETE",
      credentials: "same-origin",
      cache: "no-store",
      keepalive: true,
    }).then(
      () => undefined,
      (e: any) => {
        console.warn("[sesion-de-codigo] no se pudo cerrar:", e?.message || e);
      },
    );
  } catch {
    return Promise.resolve();
  }
}

/** Como `cerrarSesionDeCodigo`, pero sin esperar más de `ms` (antes de recargar). */
export function cerrarSesionDeCodigoConTope(ms = 800): Promise<void> {
  return Promise.race([
    cerrarSesionDeCodigo(),
    new Promise<void>((ok) => setTimeout(ok, ms)),
  ]);
}

let mantenida = false;

/** Arranque del CRM: si hay sesión, renueva la cookie ahora y cada 4 h. */
export function mantenerSesionDeCodigo(): void {
  if (mantenida || !disponible()) return;
  mantenida = true;
  if (leerToken()) void abrirSesionDeCodigo();
  setInterval(() => {
    if (leerToken()) void abrirSesionDeCodigo();
  }, REFRESCO_MS);
}
