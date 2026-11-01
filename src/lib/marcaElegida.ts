/**
 * The BRAND chosen in the top bar (module «Multimarca»), per company. Empty =
 * «Todas las marcas» (no brand narrowing).
 *
 * It travels on every request as `x-cguard-brand` (`<brandId>` or nothing);
 * the server narrows what it returns with it: that brand's clients, their
 * sites and stations, and the people registered in it or working there. It
 * never widens anything. Brand and branch combine (intersection).
 *
 * Mirrors `sucursalElegida.ts`: the browser copy is the one every request
 * carries; the account copy (`PUT /brands/workspace`) proposes the same brand
 * on any device. The sign-in sets a flag so the first CRM screen asks which
 * brand to work in (once per sign-in).
 */
const clave = (tenantId: string) => `cguard.marca.${tenantId}`;
const PREGUNTAR = "cguard.preguntarMarca";

/** The header the server reads. */
export const CABECERA_DE_MARCA = "x-cguard-brand";

/** The value the server uses for «every brand». */
export const TODAS_LAS_MARCAS = "all";

/** The event any button uses to open the brand chooser. */
export const EVENTO_ELEGIR_MARCA = "cg:elegir-marca";

export function marcaElegida(): string | null {
  try {
    const t = localStorage.getItem("tenantId");

    if (!t) return null;
    const v = localStorage.getItem(clave(t));

    return v && v !== TODAS_LAS_MARCAS ? v : null;
  } catch {
    return null;
  }
}

export function elegirMarca(brandId: string | null): void {
  try {
    const t = localStorage.getItem("tenantId");

    if (!t) return;
    if (brandId && brandId !== TODAS_LAS_MARCAS)
      localStorage.setItem(clave(t), brandId);
    else localStorage.removeItem(clave(t));
  } catch {
    /* no storage: stays on «all» */
  }
}

/** The workspace in the server's format: 'all' or the brand id. */
export function marcaActual(): string {
  return marcaElegida() || TODAS_LAS_MARCAS;
}

/** The sign-in sets it: the next CRM screen asks which brand to work in. */
export function marcarQueHayQuePreguntarLaMarca(): void {
  try {
    localStorage.setItem(PREGUNTAR, "1");
  } catch {
    /* nothing */
  }
}

export function hayQuePreguntarLaMarca(): boolean {
  try {
    return localStorage.getItem(PREGUNTAR) === "1";
  } catch {
    return false;
  }
}

export function yaSePreguntoLaMarca(): void {
  try {
    localStorage.removeItem(PREGUNTAR);
  } catch {
    /* nothing */
  }
}

/** Opens the brand chooser from anywhere (the bar, the phone pill). */
export function abrirSelectorDeMarca(): void {
  window.dispatchEvent(new Event(EVENTO_ELEGIR_MARCA));
}

/** The header for a request, or nothing when no brand is chosen. */
export function cabeceraDeMarca(): Record<string, string> {
  const b = marcaElegida();

  return b ? { [CABECERA_DE_MARCA]: b } : {};
}
