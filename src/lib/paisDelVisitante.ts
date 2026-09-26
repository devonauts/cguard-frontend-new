import { resolveApiBase } from "@/lib/apiBase";
/**
 * ════════════════════════════════════════════════════════════════════════════
 * WHERE IS THIS PERSON? — for form defaults, never for anything that matters
 *
 * Order, as asked: the IP country (the edge/backend answers it), then the
 * browser's language region, then the device's time zone. The first that is
 * known wins. The IP answer is cached for the session, so it is one request.
 * ════════════════════════════════════════════════════════════════════════════
 */

const CLAVE = "cg:paisDelVisitante";
const API = (resolveApiBase() as string | undefined) || "/api";

/** Common time zones → country, for the device fallback. */
const ZONAS: Record<string, string> = {
  "America/Guayaquil": "EC", "Pacific/Galapagos": "EC", "America/Bogota": "CO", "America/Lima": "PE",
  "America/Caracas": "VE", "America/La_Paz": "BO", "America/Santiago": "CL", "America/Asuncion": "PY",
  "America/Montevideo": "UY", "America/Argentina/Buenos_Aires": "AR", "America/Buenos_Aires": "AR",
  "America/Sao_Paulo": "BR", "America/Manaus": "BR", "America/Fortaleza": "BR", "America/Recife": "BR",
  "America/Panama": "PA", "America/Costa_Rica": "CR", "America/Managua": "NI", "America/Tegucigalpa": "HN",
  "America/El_Salvador": "SV", "America/Guatemala": "GT", "America/Mexico_City": "MX", "America/Monterrey": "MX",
  "America/Tijuana": "MX", "America/Cancun": "MX", "America/Merida": "MX", "America/Chihuahua": "MX",
  "America/Hermosillo": "MX", "America/Mazatlan": "MX", "America/Santo_Domingo": "DO", "America/Havana": "CU",
  "America/Puerto_Rico": "PR", "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US",
  "America/Phoenix": "US", "America/Los_Angeles": "US", "America/Anchorage": "US", "Pacific/Honolulu": "US",
  "America/Detroit": "US", "America/Toronto": "CA", "America/Vancouver": "CA", "America/Edmonton": "CA",
  "America/Winnipeg": "CA", "America/Halifax": "CA", "Europe/Madrid": "ES", "Atlantic/Canary": "ES",
  "Europe/Lisbon": "PT", "Europe/London": "GB", "Europe/Dublin": "IE", "Europe/Paris": "FR",
  "Europe/Berlin": "DE", "Europe/Rome": "IT", "Europe/Amsterdam": "NL", "Europe/Brussels": "BE",
  "Europe/Zurich": "CH", "Europe/Vienna": "AT", "Europe/Warsaw": "PL", "Europe/Prague": "CZ",
  "Europe/Stockholm": "SE", "Europe/Oslo": "NO", "Europe/Copenhagen": "DK", "Europe/Helsinki": "FI",
  "Europe/Athens": "GR", "Europe/Bucharest": "RO", "Europe/Istanbul": "TR",
};

function valido(c: unknown): string | null {
  const s = String(c || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : null;
}

/** Browser language region: es-EC → EC. */
export function paisDelNavegador(): string | null {
  try {
    const idiomas = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]) || [];
    for (const l of idiomas) {
      const r = valido(String(l || "").match(/[-_]([A-Za-z]{2})\b/)?.[1]);
      if (r) return r;
    }
  } catch { /* no navigator */ }
  return null;
}

/** Device time zone → country, when known. */
export function paisDelDispositivo(): string | null {
  try {
    return ZONAS[Intl.DateTimeFormat().resolvedOptions().timeZone] ?? null;
  } catch {
    return null;
  }
}

/** What is known right now, without waiting for the network. */
export function paisConocido(): string | null {
  try {
    const g = valido(sessionStorage.getItem(CLAVE));
    if (g) return g;
  } catch { /* storage blocked */ }
  return paisDelNavegador() ?? paisDelDispositivo();
}

let enCurso: Promise<string | null> | null = null;

/** The IP country (one request per session), else the browser, else the device. */
export function paisDelVisitante(): Promise<string | null> {
  if (enCurso) return enCurso;
  enCurso = (async () => {
    try {
      const guardado = valido(sessionStorage.getItem(CLAVE));
      if (guardado) return guardado;
    } catch { /* storage blocked */ }
    try {
      const control = new AbortController();
      const reloj = setTimeout(() => control.abort(), 2500);
      const r = await fetch(`${API}/platform/country`, { signal: control.signal, credentials: "omit" });
      clearTimeout(reloj);
      const pais = r.ok ? valido((await r.json())?.country) : null;
      if (pais) {
        try { sessionStorage.setItem(CLAVE, pais); } catch { /* storage blocked */ }
        return pais;
      }
    } catch { /* offline or blocked: fall back */ }
    return paisDelNavegador() ?? paisDelDispositivo();
  })();
  return enCurso;
}
