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

/**
 * Our own web domain. It is NOT derived from the API URL: the API lives on a
 * neutral infrastructure domain (api.mainconnector.com), so its zone says
 * nothing about which hosts are ours and which are a partner's.
 */
export const DOMINIO_DE_PLATAFORMA = "cguardpro.com";

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
  ) {
    return true;
  }
  // A relative or unset base is already same-origin.
  if (!/^https?:\/\//i.test(String(configurada || ""))) return true;
  if (h === DOMINIO_DE_PLATAFORMA) return true;
  if (h.endsWith(`.${DOMINIO_DE_PLATAFORMA}`)) {
    const etiqueta = h.slice(0, -(DOMINIO_DE_PLATAFORMA.length + 1));

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
