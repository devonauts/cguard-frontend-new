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
