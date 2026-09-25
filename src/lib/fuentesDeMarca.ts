/**
 * The partner's typeface: a KEY from a closed list (the backend's
 * `services/reseller/fuentesDeMarca.ts` keeps the same keys), mapped here to a
 * Google Fonts family. Never a URL from the server, never a CSS string: the
 * only stylesheet this can load is the Google Fonts one built below.
 */
export const FUENTES_DE_MARCA: Record<string, { familia: string; google: string; respaldo: string }> = {
  inter: { familia: "Inter", google: "Inter:wght@400;500;600;700", respaldo: "sans-serif" },
  poppins: { familia: "Poppins", google: "Poppins:wght@400;500;600;700", respaldo: "sans-serif" },
  montserrat: { familia: "Montserrat", google: "Montserrat:wght@400;500;600;700", respaldo: "sans-serif" },
  roboto: { familia: "Roboto", google: "Roboto:wght@400;500;700", respaldo: "sans-serif" },
  "open-sans": { familia: "Open Sans", google: "Open+Sans:wght@400;500;600;700", respaldo: "sans-serif" },
  lato: { familia: "Lato", google: "Lato:wght@400;700", respaldo: "sans-serif" },
  nunito: { familia: "Nunito", google: "Nunito:wght@400;500;600;700", respaldo: "sans-serif" },
  "dm-sans": { familia: "DM Sans", google: "DM+Sans:wght@400;500;600;700", respaldo: "sans-serif" },
  manrope: { familia: "Manrope", google: "Manrope:wght@400;500;600;700", respaldo: "sans-serif" },
  "work-sans": { familia: "Work Sans", google: "Work+Sans:wght@400;500;600;700", respaldo: "sans-serif" },
  raleway: { familia: "Raleway", google: "Raleway:wght@400;500;600;700", respaldo: "sans-serif" },
  "ibm-plex-sans": { familia: "IBM Plex Sans", google: "IBM+Plex+Sans:wght@400;500;600;700", respaldo: "sans-serif" },
  "source-serif-4": { familia: "Source Serif 4", google: "Source+Serif+4:wght@400;500;600;700", respaldo: "serif" },
  merriweather: { familia: "Merriweather", google: "Merriweather:wght@400;700", respaldo: "serif" },
};

export function esFuenteDeMarca(v: unknown): v is string {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(FUENTES_DE_MARCA, v);
}

const ID_ENLACE = "cg-fuente-de-marca-enlace";
const ID_ESTILO = "cg-fuente-de-marca";

/**
 * Apply (or remove, with `null`) the partner's typeface on the whole CRM.
 *
 * The CRM names its fonts in several stylesheets, so the override is one
 * scoped rule that wins everywhere while it is on; code blocks keep their
 * monospace. Removing it gives the platform typeface back, as `aplicarMarca`
 * requires of every brand value it sets.
 */
export function aplicarFuenteDeMarca(clave: string | null): void {
  try {
    const f = clave && esFuenteDeMarca(clave) ? FUENTES_DE_MARCA[clave] : null;
    document.getElementById(ID_ENLACE)?.remove();
    document.getElementById(ID_ESTILO)?.remove();
    if (!f) return;
    const enlace = document.createElement("link");
    enlace.id = ID_ENLACE;
    enlace.rel = "stylesheet";
    enlace.href = `https://fonts.googleapis.com/css2?family=${f.google}&display=swap`;
    document.head.appendChild(enlace);
    const estilo = document.createElement("style");
    estilo.id = ID_ESTILO;
    const pila = `"${f.familia}", ui-sans-serif, system-ui, ${f.respaldo}`;
    estilo.textContent =
      `:root{--font-sans:${pila};--font-display:${pila};}` +
      `body, body *:not(code):not(pre):not(kbd):not(samp){font-family:${pila} !important;}`;
    document.head.appendChild(estilo);
  } catch { /* cosmetic: never breaks the page */ }
}
