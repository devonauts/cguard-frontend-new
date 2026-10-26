/**
 * THE CAPTCHA IN A FRAME, FOR PARTNER DOMAINS (2026-10-26)
 *
 * Cloudflare only renders our Turnstile widget on the hostnames registered
 * for its key (cguardpro.com and its subdomains). A partner's own domain
 * (`admin.empresa.com`) is not one of them, so there the widget would fail
 * and nobody could sign in. Instead of registering every partner domain by
 * hand, the widget is rendered inside a small page served from our host
 * (`/captcha-marco` on app.cguardpro.com), which hands the token to the
 * parent with postMessage. Only that page needs to be on Cloudflare's list.
 *
 * Messages from the frame, all with `fuente: 'cg-captcha'`:
 *   { tipo: 'token', token }      solved
 *   { tipo: 'expirado' }          the token expired: solve again
 *   { tipo: 'error', codigo }     Turnstile error; codigo 'carga' = its script did not load
 *   { tipo: 'alto', alto }        the widget's height changed
 */

export const URL_DEL_MARCO_POR_DEFECTO =
  "https://app.cguardpro.com/captcha-marco";

function ipPrivada(h: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);

  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];

  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

/**
 * Should the captcha go in the frame on this host? No on our own domain
 * (the key is registered there), in `vite dev`, and on local or LAN test
 * hosts (Cloudflare's test keys work anywhere); yes everywhere else.
 */
export function usarMarcoDeCaptcha(hostname: string, dev: boolean): boolean {
  if (dev) return false;
  const h = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^\[|\]$/g, "");

  if (!h) return false;
  if (h === "cguardpro.com" || h.endsWith(".cguardpro.com")) return false;
  if (h === "localhost" || h.endsWith(".localhost") || h === "::1")
    return false;
  if (ipPrivada(h)) return false;

  return true;
}

export type TemaDelMarco = "light" | "dark" | "auto";

/** The frame's address for this page. */
export function urlDelMarco({
  base,
  origen,
  accion,
  idioma,
  tema,
}: {
  base?: string;
  origen: string;
  accion?: string;
  idioma?: string;
  tema?: TemaDelMarco;
}): string {
  const u = new URL(base || URL_DEL_MARCO_POR_DEFECTO);

  u.searchParams.set("origen", origen);
  if (accion) u.searchParams.set("accion", accion);
  if (idioma) u.searchParams.set("idioma", idioma);
  u.searchParams.set("tema", tema || "auto");

  return u.toString();
}

export type MensajeDelMarco =
  | { tipo: "token"; token: string }
  | { tipo: "expirado" }
  | { tipo: "error"; codigo: string }
  | { tipo: "alto"; alto: number };

/**
 * The frame's message, or null if it is not one: wrong origin, another
 * window (any page can post to us), or not ours.
 */
export function leerMensajeDelMarco(
  e: { origin: string; source: unknown; data: unknown },
  origenDelMarco: string,
  ventanaDelMarco: unknown,
): MensajeDelMarco | null {
  if (e.origin !== origenDelMarco) return null;
  if (!ventanaDelMarco || e.source !== ventanaDelMarco) return null;
  const d = e.data as any;

  if (!d || typeof d !== "object" || d.fuente !== "cg-captcha") return null;
  if (d.tipo === "token" && typeof d.token === "string" && d.token)
    return { tipo: "token", token: d.token };
  if (d.tipo === "expirado") return { tipo: "expirado" };
  if (d.tipo === "error")
    return { tipo: "error", codigo: String(d.codigo ?? "") };
  if (d.tipo === "alto" && Number.isFinite(Number(d.alto)))
    return { tipo: "alto", alto: Math.min(600, Math.max(40, Number(d.alto))) };

  return null;
}
