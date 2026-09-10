/**
 * Carga de `jspdf` + `jspdf-autotable` bajo demanda, una sola vez por sesión.
 *
 * Mismo patrón —y mismo motivo— que `lazyXlsx`: entre las dos son ~350 kB, y
 * hasta que alguien pulsa «Exportar PDF» no hacen ninguna falta. Importadas de
 * forma estática entrarían en el chunk de cada informe.
 *
 * ── POR QUÉ UN PDF DE VERDAD Y NO `window.print()` ─────────────────────────
 * Lo que había en los informes se llamaba «Exportar como PDF» y en realidad
 * abría una pestaña y llamaba a `print()`. En un escritorio eso es un rodeo; en
 * un móvil es una vía muerta: Safari en iOS bloquea la ventana emergente si el
 * clic no llega directísimo, y el diálogo de impresión de Chrome en Android no
 * ofrece «Guardar como PDF» en todas las versiones. Quien exporta desde el
 * teléfono —el supervisor en la calle, que es quien más exporta— se quedaba sin
 * archivo. `jsPDF` produce un `.pdf` descargable igual en los tres sitios.
 *
 * Uso, dentro del manejador del botón:
 *
 *     const { jsPDF, autoTable } = await loadPdf();
 *     const doc = new jsPDF();
 *     autoTable(doc, { head, body });
 */
type PdfKit = {
  jsPDF: typeof import("jspdf").jsPDF;
  autoTable: typeof import("jspdf-autotable").default;
};

let cached: PdfKit | null = null;
let pending: Promise<PdfKit> | null = null;

export async function loadPdf(): Promise<PdfKit> {
  if (cached) return cached;
  // Promesa compartida: dos clics seguidos no descargan el módulo dos veces.
  if (!pending) {
    pending = Promise.all([import("jspdf"), import("jspdf-autotable")])
      .then(([core, table]) => {
        cached = { jsPDF: core.jsPDF, autoTable: table.default };
        pending = null;

        return cached;
      })
      .catch((e) => {
        pending = null;
        throw e;
      });
  }

  return pending;
}
