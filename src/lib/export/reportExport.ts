import i18n from "@/i18n";
/**
 * ════════════════════════════════════════════════════════════════════════════
 * C-GUARD PRO — LAS TRES SALIDAS DE UN INFORME (CSV · EXCEL · PDF)
 *
 * ── QUÉ HABÍA ANTES ────────────────────────────────────────────────────────
 * Cada pantalla que exportaba se escribía su propio exportador. Los conté:
 * ocho copias de `csvCell`, ocho `document.createElement('a')`, y dos formas
 * distintas de poner el BOM. Peor: lo que el menú llamaba «Exportar como
 * Excel» era un `.csv` renombrado, y «Exportar como PDF» abría una pestaña y
 * llamaba a `window.print()`. Ninguna de las dos producía el archivo que
 * prometía su rótulo.
 *
 * Aquí viven las tres de verdad, una sola vez:
 *
 *   csv    → texto separado por comas, RFC-4180, con BOM UTF-8.
 *   excel  → un `.xlsx` real (SheetJS), con título, anchos de columna y
 *            autofiltro. Se abre en Excel, en Numbers y en Google Sheets.
 *   pdf    → un `.pdf` real y descargable (jsPDF + autoTable), con cabecera
 *            repetida en cada página y numeración.
 *
 * ── POR QUÉ EL PDF NO ES `window.print()` ──────────────────────────────────
 * Porque el objetivo es un móvil. Safari en iOS bloquea la ventana emergente
 * en cuanto el clic no llega directísimo desde el gesto (y con un menú de por
 * medio, no llega), y el diálogo de impresión de Android no siempre ofrece
 * «Guardar como PDF». El supervisor que exporta desde la calle —que es quien
 * más exporta— se quedaba sin archivo. Una descarga es una descarga en los
 * tres sitios.
 *
 * Se conserva «Imprimir» como acción aparte, y no por nostalgia: las fuentes
 * estándar de jsPDF son cp1252, así que cubren el español, el portugués, el
 * francés, el italiano, el alemán y el neerlandés, pero NO la ł ni la ą del
 * polaco. En polaco, la ventana de impresión sigue siendo la salida fiel.
 *
 * ── DÓNDE SE GENERA CADA COSA ──────────────────────────────────────────────
 * Esto es la salida DEL NAVEGADOR: sirve para los informes que el navegador ya
 * tiene enteros en memoria (los de `DataReport`, Nómina, GPS…). Los que salen
 * del SERVIDOR —bitácora de accesos, informes de cliente— se generan en
 * `backend/services/reportExportService.ts`, con exceljs y pdfkit, porque allí
 * están todas las filas y no sólo la página cargada. Las dos rutas producen
 * las mismas tres extensiones a propósito.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { loadXlsx } from "../lazyXlsx";
import { loadPdf } from "../lazyPdf";
import { nombreDelProducto } from "@/hooks/usePageTitle";

/**
 * The default report footer, signed with THIS host's product name. On a
 * partner's host that is the partner's brand; with no published name the
 * footer is left empty rather than falling back to ours.
 */
export function pieDeInforme(nombreApp: string = nombreDelProducto()): string {
  return nombreApp
    ? i18n.t("ui.reportExport.generadoPor", {
        defaultValue: "Generado por {{nombreApp}}",
        nombreApp,
      })
    : "";
}

export type ExportFormat = "csv" | "excel" | "pdf";

/** Una columna, tal como se exporta: rótulo ya traducido y valor ya formateado. */
export interface ExportColumn<T> {
  label: string;
  value: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
}

export interface ExportMeta {
  /** Título del documento — encabeza el PDF y la primera fila del Excel. */
  title: string;
  /** Segunda línea: normalmente el rango de fechas y el número de registros. */
  subtitle?: string;
  /** Nombre del archivo SIN extensión. Se sanea aquí. */
  fileBase: string;
  /** Pie del PDF. Por defecto, el nombre del producto. */
  footer?: string;
}

/* ── Utilidades comunes ──────────────────────────────────────────────────── */

const texto = (v: unknown): string => (v == null ? "" : String(v));

/** Nombre de archivo seguro: sin acentos, sin barras, sin espacios. */
export function fileSafe(s: string): string {
  return (
    (s || "informe")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "informe"
  );
}

/** Dispara la descarga de un blob. La única copia de este truco en el CRM. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revocar en el mismo tick cancela la descarga en Safari; se le da margen.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Convierte CUALQUIER color CSS a un `[r,g,b]` que jsPDF entienda.
 *
 * Hace falta porque los tokens del CRM están en `oklch()` y jsPDF sólo sabe de
 * RGB. En vez de traducir oklch a mano —que es una conversión de espacio de
 * color con sus curvas— se le deja el trabajo al motor: se pinta un píxel en
 * un lienzo y se lee. Si el navegador no supiera leer el color, el `fillStyle`
 * se queda en el centinela y devolvemos `null` para que el llamador use su
 * color de reserva, en vez de pintar un negro accidental.
 */
export function cssColorToRgb(css: string): [number, number, number] | null {
  const v = (css || "").trim();

  if (!v) return null;
  try {
    const canvas = document.createElement("canvas");

    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d");

    if (!ctx) return null;
    const centinela = "#010203";

    ctx.fillStyle = centinela;
    ctx.fillStyle = v;
    if (ctx.fillStyle === centinela && v.toLowerCase() !== centinela)
      return null;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;

    if (!d[3]) return null;

    return [d[0], d[1], d[2]];
  } catch {
    return null;
  }
}

/** El acento vivo de la empresa, en RGB, para la cabecera del PDF. */
function colorDeMarca(): {
  brand: [number, number, number];
  ink: [number, number, number];
} {
  const fallbackBrand: [number, number, number] = [30, 41, 59];
  const fallbackInk: [number, number, number] = [255, 255, 255];

  try {
    const css = getComputedStyle(document.documentElement);

    return {
      brand: cssColorToRgb(css.getPropertyValue("--brand")) || fallbackBrand,
      ink: cssColorToRgb(css.getPropertyValue("--brand-ink")) || fallbackInk,
    };
  } catch {
    return { brand: fallbackBrand, ink: fallbackInk };
  }
}

/* ── CSV ─────────────────────────────────────────────────────────────────── */

/** Una celda CSV según RFC-4180: se entrecomilla sólo si hace falta. */
export function csvCell(v: unknown): string {
  const s = texto(v);

  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv(
  headers: string[],
  body: (string | number | null | undefined)[][],
): Blob {
  const lineas = [headers.map(csvCell).join(",")];

  for (const fila of body) lineas.push(fila.map(csvCell).join(","));

  // BOM UTF-8: sin él, Excel abre el archivo en Latin-1 y destroza cada acento
  // y cada ñ. Es la diferencia entre un archivo que se usa y uno que devuelven
  // diciendo «está mal».
  return new Blob(["﻿" + lineas.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
}

/* ── Excel ───────────────────────────────────────────────────────────────── */

/**
 * A valid worksheet name: at most 31 characters, none of `: \ / ? * [ ]`, and
 * no apostrophe at either end. SheetJS THROWS on anything else — that is how
 * «Informe de Entrada/Salida» lost its Excel export while every other report
 * had one.
 */
export function sheetName(title: string, fallback = "Informe"): string {
  const clean = String(title || "")
    .replace(/[:\\/?*[\]]/g, "-")
    .replace(/^'+|'+$/g, "")
    .trim()
    .slice(0, 31)
    .replace(/^'+|'+$/g, "")
    .trim();

  return clean || fallback;
}

/**
 * Un `.xlsx` de verdad: título, subtítulo, cabecera, datos, anchos calculados
 * y autofiltro sobre la cabecera.
 *
 * NOTA sobre el aspecto: la edición comunitaria de SheetJS escribe estructura,
 * no estilo — no hay negritas ni rellenos. Se compensa con lo que sí controla
 * y de verdad importa al abrirlo: los anchos de columna (una hoja con todo a
 * 8 caracteres es ilegible), el autofiltro y los números guardados COMO
 * números, no como texto, para que se puedan sumar. El Excel con formato es el
 * que genera el servidor con exceljs, en los informes que salen de allí.
 */
async function buildXlsxBlob(
  headers: string[],
  body: (string | number | null | undefined)[][],
  meta: ExportMeta,
): Promise<Blob> {
  const XLSX = await loadXlsx();

  const filas: (string | number | null)[][] = [];

  filas.push([meta.title]);
  if (meta.subtitle) filas.push([meta.subtitle]);
  filas.push([]);
  const filaCabecera = filas.length; // índice 0-based de la cabecera

  filas.push(headers);
  for (const f of body) {
    filas.push(
      f.map((c) => {
        if (c == null || c === "") return "";
        if (typeof c === "number") return c;
        // Un texto que es exactamente un número entra como número: si no, la
        // columna «Horas» no se puede sumar en la propia hoja.
        const s = String(c).trim();

        if (/^-?\d+(\.\d+)?$/.test(s)) {
          const n = Number(s);

          if (Number.isFinite(n)) return n;
        }

        return s;
      }),
    );
  }

  const ws = XLSX.utils.aoa_to_sheet(filas);

  // Ancho por columna: el del contenido más largo, con tope para que una
  // descripción de 400 caracteres no empuje al resto fuera de la pantalla.
  ws["!cols"] = headers.map((h, i) => {
    let max = String(h).length;

    for (const f of body) {
      const len = texto(f[i]).length;

      if (len > max) max = len;
    }

    return { wch: Math.min(60, Math.max(10, max + 2)) };
  });

  // El título ocupa el ancho de la tabla en vez de desbordar la celda A1.
  if (headers.length > 1) {
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
      ...(meta.subtitle
        ? [{ s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } }]
        : []),
    ];
  }

  // Autofiltro sobre la cabecera: con dos mil filas, poder ordenar y filtrar por
  // columna dentro del propio Excel es la mitad de su valor.
  //
  // Panel congelado NO se pone, aunque haría falta: la edición comunitaria de
  // SheetJS no escribe `pane` (comprobado en la 0.18.5 — el escritor no tiene
  // ni `xSplit` ni `ySplit`), y un ajuste que no llega al archivo es peor que
  // no prometerlo. El Excel del SERVIDOR sí lo lleva, porque exceljs sí puede.
  if (body.length) {
    const primera = XLSX.utils.encode_cell({ r: filaCabecera, c: 0 });
    const ultima = XLSX.utils.encode_cell({
      r: filaCabecera + body.length,
      c: headers.length - 1,
    });

    ws["!autofilter"] = { ref: `${primera}:${ultima}` };
  }

  const wb = XLSX.utils.book_new();

  // El nombre de la hoja tiene tope duro de 31 caracteres en el formato; pasarse
  // genera un archivo que Excel se niega a abrir.
  XLSX.utils.book_append_sheet(
    wb,
    ws,
    sheetName(meta.title, i18n.t("ui.reportExport.informe", "Informe")),
  );
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });

  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/* ── PDF ─────────────────────────────────────────────────────────────────── */

/**
 * Un `.pdf` descargable con la tabla completa.
 *
 * La orientación se decide por el número de columnas, no a ojo: hasta seis
 * columnas caben en vertical y se leen mejor así; de siete en adelante, apaisado
 * o las celdas se parten en tres líneas cada una.
 */
/**
 * Las fuentes estándar de jsPDF son cp1252: un solo carácter de fuera (la
 * flecha de «sáb 24 oct 14:00 → 02:00», el espacio fino con el que `Intl`
 * separa los miles en francés) hace que jsPDF escriba la línea ENTERA en
 * UTF-16 y el visor la pinta como basura. Se cambian por su par cp1252.
 */
const paraPdf = (s: string): string =>
  s
    .replace(/→/g, "–")
    .replace(/[  ]/g, " ")
    .replace(/−/g, "-");

async function buildPdfBlob(
  headers: string[],
  body: (string | number | null | undefined)[][],
  meta: ExportMeta,
  aligns: ("left" | "right" | "center")[],
): Promise<Blob> {
  meta = {
    ...meta,
    title: paraPdf(meta.title),
    subtitle: meta.subtitle ? paraPdf(meta.subtitle) : meta.subtitle,
  };
  headers = headers.map(paraPdf);
  body = body.map((f) => f.map((v) => paraPdf(texto(v))));
  const { jsPDF, autoTable } = await loadPdf();
  const apaisado = headers.length > 6;
  const doc = new jsPDF({
    orientation: apaisado ? "landscape" : "portrait",
    unit: "pt",
    format: "a4",
  });
  const { brand, ink } = colorDeMarca();
  const anchoPagina = doc.internal.pageSize.getWidth();
  const altoPagina = doc.internal.pageSize.getHeight();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(20, 20, 20);
  doc.text(meta.title, 32, 40);
  if (meta.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    doc.text(meta.subtitle, 32, 56);
  }

  autoTable(doc, {
    head: [headers],
    body: body.map((f) => f.map(texto)),
    startY: meta.subtitle ? 70 : 54,
    margin: { left: 32, right: 32, bottom: 34 },
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: 4,
      overflow: "linebreak",
      valign: "middle",
    },
    // La cabecera lleva el acento que la empresa haya elegido: si cambió el
    // color del CRM, el PDF cambia con él.
    headStyles: {
      fillColor: brand,
      textColor: ink,
      fontStyle: "bold",
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: [246, 246, 247] },
    columnStyles: Object.fromEntries(aligns.map((a, i) => [i, { halign: a }])),
    // `repeat` y no `firstPage`: sin esto, la página 2 es una lista de valores
    // sin nombre de columna y el informe deja de poder auditarse.
    showHead: "everyPage",
    didDrawPage: () => {
      const pagina = doc.getNumberOfPages();

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(140, 140, 140);
      const pie = meta.footer || pieDeInforme();
      if (pie) doc.text(pie, 32, altoPagina - 16);
      doc.text(String(pagina), anchoPagina - 32, altoPagina - 16, {
        align: "right",
      });
    },
  });

  if (!body.length) {
    doc.setFontSize(10);
    doc.setTextColor(140, 140, 140);
    doc.text(
      i18n.t(
        "ui.reportExport.sinDatosEnElRangoSeleccionado",
        "Sin datos en el rango seleccionado.",
      ),
      32,
      (meta.subtitle ? 70 : 54) + 40,
    );
  }

  return doc.output("blob");
}

/* ── La puerta de entrada ────────────────────────────────────────────────── */

/**
 * Exporta una matriz (cabecera + filas) en el formato pedido y la descarga.
 * Para pantallas que ya arman sus propios arrays: Nómina, GPS, bitácoras.
 */
export async function exportMatrix(
  format: ExportFormat,
  headers: string[],
  body: (string | number | null | undefined)[][],
  meta: ExportMeta,
  aligns?: ("left" | "right" | "center")[],
): Promise<void> {
  const base = fileSafe(meta.fileBase);
  const cols =
    aligns && aligns.length === headers.length
      ? aligns
      : headers.map(() => "left" as const);

  if (format === "csv") {
    downloadBlob(`${base}.csv`, buildCsv(headers, body));

    return;
  }
  if (format === "excel") {
    downloadBlob(`${base}.xlsx`, await buildXlsxBlob(headers, body, meta));

    return;
  }
  downloadBlob(`${base}.pdf`, await buildPdfBlob(headers, body, meta, cols));
}

/**
 * La misma exportación, a partir de columnas tipadas — la forma que usan los
 * informes de `DataReport`, donde el rótulo y el formateo de cada celda ya
 * están definidos y se comparten con la tabla de pantalla. Que la tabla y el
 * archivo salgan de la MISMA `value()` es lo que garantiza que digan lo mismo.
 */
export async function exportColumns<T>(
  format: ExportFormat,
  columns: ExportColumn<T>[],
  rows: T[],
  meta: ExportMeta,
): Promise<void> {
  const headers = columns.map((c) => c.label);
  const body = rows.map((r) => columns.map((c) => c.value(r)));
  const aligns = columns.map((c) => c.align || "left");

  await exportMatrix(format, headers, body, meta, aligns);
}

/** Extensión que producirá cada formato — para mensajes y rótulos. */
export const EXPORT_EXT: Record<ExportFormat, string> = {
  csv: "csv",
  excel: "xlsx",
  pdf: "pdf",
};
