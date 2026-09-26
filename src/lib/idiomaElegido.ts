import { resolveApiBase } from "@/lib/apiBase";

/**
 * The language the person chose in the CRM, for the server.
 *
 * The axios client already sends it as Accept-Language. Plain `fetch()` calls
 * and EventSource did not: the browser then sends ITS language, so a person
 * who chose French on a Spanish computer got server text in Spanish.
 */
export function idiomaElegido(): string {
  try {
    return (
      localStorage.getItem("app_language") ||
      localStorage.getItem("language") ||
      localStorage.getItem("i18nextLng") ||
      (typeof navigator !== "undefined" && navigator.language) ||
      "es"
    );
  } catch {
    return "es";
  }
}

function esNuestraApi(url: string): boolean {
  try {
    const u = new URL(url, window.location.href);
    const base = new URL(resolveApiBase() || "/api", window.location.href);

    return (
      u.origin === base.origin &&
      u.pathname.startsWith(base.pathname.replace(/\/+$/, "") || "/")
    );
  } catch {
    return false;
  }
}

/**
 * Adds Accept-Language to every `fetch()` aimed at our API, once, at startup.
 * Requests to other hosts (maps, third parties) are left untouched.
 */
export function instalarIdiomaEnFetch(): void {
  if (typeof window === "undefined" || (window as any).__idiomaEnFetch) return;
  (window as any).__idiomaEnFetch = true;
  const original = window.fetch.bind(window);

  window.fetch = (entrada: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url =
        typeof entrada === "string"
          ? entrada
          : entrada instanceof URL
            ? entrada.href
            : entrada.url;

      if (esNuestraApi(url)) {
        const cabeceras = new Headers(
          init?.headers ||
            (entrada instanceof Request ? entrada.headers : undefined),
        );

        if (!cabeceras.has("Accept-Language")) {
          cabeceras.set("Accept-Language", idiomaElegido());
        }

        return original(entrada, { ...init, headers: cabeceras });
      }
    } catch {
      /* never block a request over a header */
    }

    return original(entrada, init);
  };
}
