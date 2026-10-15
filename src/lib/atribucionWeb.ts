/* ── ATRIBUCIÓN DEL SITIO WEB (cguardpro.com → app.cguardpro.com) ─────────
   El sitio decora sus enlaces a la app con `?cg=<sesión>&lp=<página de
   entrada>&lang=<idioma de la página>`. Antes sólo `/register` los leía, y
   quien pasaba por la raíz o por `/login` (el botón del pie va a la raíz) los
   perdía al navegar: el alta quedaba sin atribuir. Ahora se guardan en
   `sessionStorage` en cuanto la app arranca, venga por la ruta que venga, y
   los enlaces login ↔ registro los vuelven a colgar de la URL. */

const CLAVE_CG = "cg_web";
const CLAVE_LP = "cg_lp";
const CLAVE_LANG = "cg_lang";
/** Guarda el `cg` para el que ya se avisó `signup_started` en esta pestaña. */
const CLAVE_ALTA_INICIADA = "cg_alta_iniciada";

function limpio(v: string | null, max: number): string {
  return (v || "").trim().slice(0, max);
}

/**
 * Lee `cg`/`lp`/`lang` de la URL y los guarda en `sessionStorage`. Sin `cg` no
 * hace nada (no se pisa una atribución ya guardada). Un `cg` distinto es otra
 * sesión del sitio: sus `lp`/`lang` sustituyen a los anteriores.
 */
export function guardarAtribucionWeb(search?: string): void {
  try {
    const q = new URLSearchParams(
      search ?? (typeof window !== "undefined" ? window.location.search : ""),
    );
    const cg = limpio(q.get("cg"), 100);

    if (!cg) return;
    const lp = limpio(q.get("lp"), 255);
    const lang = limpio(q.get("lang"), 16);
    const nueva = sessionStorage.getItem(CLAVE_CG) !== cg;

    sessionStorage.setItem(CLAVE_CG, cg);
    if (lp) sessionStorage.setItem(CLAVE_LP, lp);
    else if (nueva) sessionStorage.removeItem(CLAVE_LP);
    if (lang) sessionStorage.setItem(CLAVE_LANG, lang);
    else if (nueva) sessionStorage.removeItem(CLAVE_LANG);
  } catch {
    /* la atribución nunca estorba */
  }
}

/** `?cg=…&lp=…&lang=…` con lo guardado, o "" si no hay atribución. */
export function consultaDeAtribucion(): string {
  try {
    const cg = sessionStorage.getItem(CLAVE_CG);

    if (!cg) return "";
    const q = new URLSearchParams({ cg });
    const lp = sessionStorage.getItem(CLAVE_LP);
    const lang = sessionStorage.getItem(CLAVE_LANG);

    if (lp) q.set("lp", lp);
    if (lang) q.set("lang", lang);

    return `?${q.toString()}`;
  } catch {
    return "";
  }
}

/**
 * `true` UNA sola vez por sesión del sitio (`cg`) en esta pestaña: la primera
 * vez que alguien toca de verdad el formulario de alta. Las recargas y los
 * robots que sólo abren el enlace decorado ya no cuentan como «alta empezada».
 */
export function marcarAltaIniciada(): boolean {
  try {
    const cg = sessionStorage.getItem(CLAVE_CG);

    if (!cg || sessionStorage.getItem(CLAVE_ALTA_INICIADA) === cg) return false;
    sessionStorage.setItem(CLAVE_ALTA_INICIADA, cg);

    return true;
  } catch {
    return false;
  }
}
