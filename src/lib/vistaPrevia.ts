/**
 * ════════════════════════════════════════════════════════════════════════════
 * PREVIEW MODE — the partner's own panel shows THIS login in an iframe
 *
 * `/?vistaPrevia=<signed token>&tema=claro|oscuro` renders the real login
 * dressed in the partner's DRAFT branding (see the backend's
 * `vistaPreviaDeMarca`). In this mode the page:
 *   - reads its identity from `/platform/context/preview` instead of the Host;
 *   - uses the theme the panel asks for, and never saves it;
 *   - takes live colour/name changes from the parent panel (postMessage);
 *   - never signs anyone in: it is a picture of the login, not a login.
 * ════════════════════════════════════════════════════════════════════════════
 */

function parametro(nombre: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(nombre);
  } catch {
    return null;
  }
}

export function tokenDeVistaPrevia(): string | null {
  const t = parametro("vistaPrevia");
  return t && t.length < 2048 ? t : null;
}

export function esVistaPrevia(): boolean {
  return !!tokenDeVistaPrevia();
}

/** The theme the panel asked for, or `null` outside preview mode. */
export function temaDeVistaPrevia(): "light" | "dark" | null {
  if (!esVistaPrevia()) return null;
  const t = parametro("tema");
  if (t === "oscuro" || t === "dark") return "dark";
  if (t === "claro" || t === "light") return "light";
  return null;
}

/** The message the panel sends when the partner moves a slider or types. */
export const TIPO_DE_MENSAJE = "cguard:vista-previa-de-marca";
