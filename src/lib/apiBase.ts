/**
 * Where the CRM talks to the backend.
 *
 * On our own planes (app.<zone>, the desktop app, the mobile webviews, local
 * development) it is `VITE_API_URL`, as always. On a PARTNER's host —its
 * subdomain or its own domain— it is `/api` on that same host: nginx there
 * proxies to the backend with the Host preserved, so a partner's customer
 * never sees our API's domain in the browser's network tab.
 *
 * Every place that needs the API base goes through here; nothing reads
 * `VITE_API_URL` directly any more.
 */

const PLANOS_PROPIOS = new Set(["app", "www", "api", "partners", "domains"]);

function zonaDe(url: string | undefined): string {
  try {
    const host = new URL(String(url || "")).hostname.toLowerCase();
    return host.split(".").slice(-2).join(".");
  } catch {
    return "";
  }
}

/** Our own planes keep the configured API; everything else is a partner host. */
export function esAnfitrionDePlataforma(
  hostname: string,
  configurada?: string,
): boolean {
  const h = String(hostname || "").toLowerCase();
  if (
    !h ||
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "[::1]" ||
    h.endsWith(".localhost")
  )
    return true;
  const zona = zonaDe(configurada);
  if (!zona) return true; // relative or unset base: already same-origin
  if (h === zona) return true;
  if (h.endsWith(`.${zona}`)) {
    const etiqueta = h.slice(0, -(zona.length + 1));
    return PLANOS_PROPIOS.has(etiqueta);
  }
  return false;
}

export function resolveApiBase(): string | undefined {
  const configurada = import.meta.env.VITE_API_URL as string | undefined;
  if (typeof window === "undefined") return configurada;
  try {
    const { protocol, hostname, origin } = window.location;
    if (!/^https?:$/.test(protocol) || (window as any).cguardDesktop)
      return configurada;
    if (esAnfitrionDePlataforma(hostname, configurada)) return configurada;
    return `${origin}/api`;
  } catch {
    return configurada;
  }
}
