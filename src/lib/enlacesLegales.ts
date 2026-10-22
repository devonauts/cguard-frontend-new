/**
 * Los enlaces a la Política de privacidad y a los Términos, en el idioma de
 * quien los abre. La web (cguardpro.com) los sirve así:
 *   español → /privacy/ y /terms/ (la raíz es la versión española)
 *   resto   → /{idioma}/privacy/ y /{idioma}/terms/
 * Un idioma que la web no tenga cae al inglés. Si la web cambia sus rutas, se
 * cambia SÓLO aquí.
 */
const WEB = "https://cguardpro.com";
const CON_PAGINA = ["en", "pt", "fr", "de", "it", "nl", "pl"];

export type DocumentoLegal = "privacy" | "terms";

export function enlaceLegal(doc: DocumentoLegal, idioma?: string): string {
  const base = (idioma || "en").toLowerCase().split("-")[0];

  if (base === "es") return `${WEB}/${doc}/`;

  return `${WEB}/${CON_PAGINA.includes(base) ? base : "en"}/${doc}/`;
}

/**
 * Where the privacy/terms links point on THIS host.
 *
 * Our hosts: our site, as above. A partner's host: never our site — its
 * companies must not land on cguardpro.com from the sign-up form. The partner's
 * published support URL serves both links when there is one; otherwise `null`,
 * and the form renders the acceptance text without links (the checkbox stays).
 */
export function enlaceLegalDelAnfitrion(
  doc: DocumentoLegal,
  idioma: string | undefined,
  anfitrion: { deSocio: boolean; urlDeSoporte: string | null | undefined },
): string | null {
  if (!anfitrion.deSocio) return enlaceLegal(doc, idioma);

  return urlSegura(anfitrion.urlDeSoporte);
}

/** An http(s) URL ready for an `href`, or null. A bare domain gets `https://`. */
function urlSegura(valor: string | null | undefined): string | null {
  const v = (valor || "").trim();

  if (!v) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);

    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}
