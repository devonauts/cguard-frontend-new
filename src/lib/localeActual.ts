import i18n from "@/i18n";

/**
 * Locale que deben usar las fechas y los números de la interfaz.
 *
 * POR QUÉ EXISTE. Había 144 llamadas con el idioma escrito a fuego
 * —`toLocaleDateString('es-EC', …)`, `Intl.NumberFormat('es')`— repartidas por
 * todo el CRM. Con la interfaz en alemán, el resto de la pantalla salía
 * traducido y las fechas seguían diciendo «27 ago» y los números usando la coma
 * ecuatoriana. Es el mismo fallo que dejó el inglés «en cáscara»: lo que no pasa
 * por el traductor no se traduce, y una fecha tampoco.
 *
 * Se conserva la REGIÓN cuando el idioma es el español, porque el formato
 * ecuatoriano es deliberado en ese mercado; para el resto se usa el idioma a
 * secas y el navegador aplica la convención que corresponde.
 */
export function localeActual(): string {
  const l = String(i18n.language || "es")
    .slice(0, 2)
    .toLowerCase();

  return l === "es" ? "es-EC" : l;
}

/** Igual, pero para quien necesita la lista que acepta `Intl`. */
export function localesActual(): string[] {
  return [localeActual()];
}
