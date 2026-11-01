import type { LucideIcon } from "lucide-react";
import { useEtiquetasDeSucursal } from "@/hooks/useEtiquetasDeSucursal";
import type { ReportTone } from "./reportIcons";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import ReportPageShell from "./ReportPageShell";

import { Segmented } from "@/components/kit";
import MobileCardList from "@/components/responsive/MobileCardList";
import { useEsTelefono } from "@/hooks/useEsTelefono";
import { exportColumns, pieDeInforme, type ExportFormat } from "@/lib/export/reportExport";
import { MarcaSinSenal } from "@/components/conexion/MarcaSinSenal";
import { AvisoLlegoTarde, llegadaDe } from "@/components/conexion/AvisoLlegoTarde";
import { useMarcasSinSenal } from "@/hooks/useMarcasSinSenal";
import {
  createNameMask,
  exportValue,
  hiddenFromSettings,
  NOTHING_HIDDEN,
  visibleColumns,
  type HiddenNames,
  type NameMask,
  type PrivacyMark,
} from "./reportPrivacy";

/** «13/09/2026, 10:50 a. m.», «2026-09-13 10:50», «10:50». Sólo marcas de
 *  tiempo: un valor que EMPIEZA por una fecha pero sigue con texto no lo es. */
const ES_FECHA =
  /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})?[\s,]*(\d{1,2}:\d{2}(:\d{2})?(\s*[ap]\.?\s*m\.?)?)?$/i;

export interface ReportColumn<T> {
  key: string;
  label: string;
  /** Clave i18n del rótulo. Los `columns[]` son constantes de MÓDULO: se
   *  evalúan al importar el fichero, antes de que i18next sepa el idioma, así
   *  que ahí no se puede llamar a `t()`. El texto se resuelve aquí, al pintar
   *  —y también al exportar, porque el rótulo viaja al CSV y a la impresión. */
  labelKey?: string;
  /** Cell value as a string (used for the table, CSV and print alike). A cell
   *  that joins several names («Sede · Cliente») passes each one through
   *  `mask`, which is the identity on screen and the privacy rule in files. */
  value: (row: T, mask?: NameMask) => string;
  align?: "left" | "right" | "center";
  /**
   * Marca de privacidad. `guardName` = la columna identifica al vigilante y
   * OBEDECE al ajuste «ocultar nombre del vigilante» de Configuración ›
   * Informes. La auditoría del 15-ago lo encontró aplicado en el servidor
   * (informes del cliente, PDF de KPIs) y en NINGUNA de las cuatro salidas que
   * este componente arma en el navegador — tabla, CSV, Excel/impresión y PDF
   * salían con nombre igual. Al filtrar AQUÍ, una sola regla cubre las cuatro.
   *
   * `clientName` / `siteName` / `stationName`: the whole cell is that name and
   * is pseudonymized in exported and printed files (see reportPrivacy.ts).
   */
  privacy?: PrivacyMark;
}

interface DataReportProps<T> {
  /**
   * Módulo Sucursales (fase 4): la SEDE de cada fila. Con ella, en la vista
   * global, el informe gana la columna «Sucursal» —en pantalla y en las
   * exportaciones, que salen de las mismas columnas—. Sin ella, nada cambia.
   */
  sedeDe?: (row: T) => string | null | undefined;
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Tono del informe. `bad` para los que hablan de un peligro (pánico, caídas). */
  tone?: ReportTone;
  columns: ReportColumn<T>[];
  /** Fetch rows for a date range. Return the full set to display + export. */
  load: (range: { from: string; to: string }) => Promise<T[]>;
  /** Optional client-side text search over the rendered row values. */
  searchable?: boolean;
  /**
   * Filtros PROPIOS del informe, dentro del mismo cajón que el rango de fechas
   * (un selector de estación, de cliente…). Van aquí y no en la página para que
   * compartan el botón «Aplicar»: dos sitios distintos donde tocar filtros
   * acaban con uno aplicado y el otro no.
   */
  extraFilters?: ReactNode;
  /**
   * Resumen que va ENCIMA de la tabla (cifras, fichas, una lista corta). Se
   * pinta con cada carga y no viaja al CSV: la tabla es lo que se exporta.
   */
  summary?: ReactNode;
  /** Days back the default range spans (default 30). */
  defaultDays?: number;
  emptyMessage?: string;
  /**
   * Marca una fila como crítica. Devuelve el tono semántico (`bad`/`warn`) y la
   * fila se dibuja con una regla de ese color en el canto izquierdo. La
   * severidad SIEMPRE sale de aquí, nunca del acento de la empresa.
   */
  rowTone?: (row: T) => "bad" | "warn" | "ok" | undefined;
  /**
   * Abrir el detalle de una fila. Un informe cuyas filas se pueden auditar
   * —recorridos, marcaciones— deja de ser una tabla que se mira y pasa a ser
   * una que se revisa. Sin esta prop la tabla se comporta igual que siempre.
   */
  onRowClick?: (row: T) => void;
  /**
   * Recibe la función que vuelve a pedir las filas. Sirve para refrescar el
   * informe después de cambiar algo desde el detalle (aceptar o rechazar un
   * punto de ronda) sin recargar la página ni perder el rango elegido.
   */
  reloadRef?: React.MutableRefObject<(() => void) | null>;
  /**
   * El id del registro que se puede haber hecho SIN SEÑAL en el teléfono
   * (turno, escaneo, incidente…). Con él, las filas que llegaron tarde llevan
   * «Registrado sin señal · llegó 03:40». Una consulta por página visible.
   */
  idSinSenal?: (row: T) => string | null | undefined;
}

/**
 * Un SOS o incidente que llegó tarde lleva la franja roja («ocurrió hace N
 * min»); el resto de lo hecho sin señal, la etiqueta discreta.
 */
function EtiquetaSinSenal({ fila, marca }: { fila: any; marca?: any }) {
  const tarde = llegadaDe(fila, marca);

  return tarde ? (
    <AvisoLlegoTarde compacto className="ml-2" datos={tarde} />
  ) : (
    <MarcaSinSenal className="ml-2" marca={marca} />
  );
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysAgo(n: number): string {
  const d = new Date();

  d.setDate(d.getDate() - n);

  return ymd(d);
}

/** Presets del conmutador de rango. El cajón de filtros sigue permitiendo
 *  cualquier fecha: esto sólo son los tres atajos habituales. */
const PRESETS = [7, 30, 90] as const;

/**
 * La página de informe genérica: una consulta real, una tabla con el tema del
 * CRM, un filtro de rango y TRES exportaciones que producen lo que su nombre
 * dice — `.xlsx`, `.pdf` y `.csv`.
 *
 * Lo de «lo que su nombre dice» no es una obviedad: hasta ahora «Exportar como
 * Excel» bajaba un `.csv` renombrado y «Exportar como PDF» abría el diálogo de
 * impresión. Los tres formatos se arman ahora en `lib/export/reportExport`, a
 * partir de las MISMAS `columns[]` que pinta la tabla, así que el archivo y la
 * pantalla no pueden discrepar — incluida la regla de privacidad que quita la
 * columna del vigilante.
 */
export default function DataReport<T>({
  sedeDe,
  title,
  description,
  icon,
  tone,
  columns: columnsProp,
  load,
  searchable = true,
  extraFilters,
  summary,
  defaultDays = 30,
  emptyMessage,
  rowTone,
  onRowClick,
  reloadRef,
  idSinSenal,
}: DataReportProps<T>) {
  const { t } = useTranslation();
  const rotulo = (c: ReportColumn<T>) =>
    c.labelKey ? t(c.labelKey, c.label) : c.label;
  // Configuración › Informes (privacy switches) also rules what the browser
  // builds. Fails open: with no readable setting, everything is shown — as
  // always.
  const [ocultos, setOcultos] = useState<HiddenNames>(NOTHING_HIDDEN);

  useEffect(() => {
    (async () => {
      try {
        const tenantId = localStorage.getItem("tenantId");

        if (!tenantId) return;
        const api = (await import("@/lib/api")).default;
        const { data } = await api.get(`/tenant/${tenantId}/settings`, {
          toast: { silentError: true },
        } as any);

        setOcultos(hiddenFromSettings(data?.reportSettings));
      } catch {
        /* sin ajuste → todo visible */
      }
    })();
  }, []);
  const columnasBase = useMemo(
    () => visibleColumns(columnsProp, ocultos),
    [columnsProp, ocultos],
  );
  /** A fresh mask per file, so each file numbers its pseudonyms from 1. */
  const mascaraDeArchivo = () =>
    createNameMask(ocultos, {
      clientName: t("ui.DataReport.seudonimoCliente", "Cliente"),
      siteName: t("ui.DataReport.seudonimoSede", "Sede"),
      stationName: t("ui.DataReport.seudonimoPuesto", "Puesto"),
    });
  const etiquetas = useEtiquetasDeSucursal();
  const columns = useMemo(
    () =>
      sedeDe && etiquetas.activo
        ? [
            ...columnasBase,
            {
              key: "__sucursal",
              label: "Sucursal",
              labelKey: "sucursales.etiqueta.columna",
              value: (row: T) => etiquetas.texto(etiquetas.deSede(sedeDe(row))) || "—",
            } as ReportColumn<T>,
          ]
        : columnasBase,
    [columnasBase, sedeDe, etiquetas],
  );
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(() => daysAgo(defaultDays));
  const [to, setTo] = useState(() => ymd(today));
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const tableRef = useRef<HTMLDivElement>(null);
  const esTelefono = useEsTelefono();

  const fetchRows = useCallback(() => {
    setLoading(true);
    load({ from, to })
      .then((r) => setRows(Array.isArray(r) ? r : []))
      .catch(() => {
        setRows([]);
        toast.error(
          t("ui.DataReport.errorCargarInforme", "No se pudo cargar el informe"),
        );
      })
      .finally(() => setLoading(false));
  }, [from, to, load]);

  useEffect(() => {
    fetchRows();
  }, [from, to]);

  // El mando a distancia del informe, para quien lo haya pedido.
  useEffect(() => {
    if (!reloadRef) return;
    reloadRef.current = fetchRows;

    return () => {
      reloadRef.current = null;
    };
  }, [reloadRef, fetchRows]);

  const filtered = useMemo(() => {
    if (!searchable || !search.trim()) return rows;
    const q = search.toLowerCase();

    return rows.filter((row) =>
      columns.some((c) => c.value(row).toLowerCase().includes(q)),
    );
  }, [rows, search, columns, searchable]);

  /* ── Paginación (en cliente) ──────────────────────────────────────────────
     Las filas ya están todas en memoria: el informe las necesita enteras para
     exportar y para imprimir, así que pedirle páginas al servidor obligaría a
     una segunda consulta sólo para el CSV. Se corta aquí, sobre `filtered`, y
     el pie dice exactamente lo que la tabla pinta. */
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Cualquier cosa que cambie el conjunto devuelve a la primera página: quedarse
  // en la 40 después de buscar un texto que sólo tiene 3 resultados se ve como
  // un informe vacío.
  useEffect(() => {
    setPage(1);
  }, [search, rows]);

  const lastPage = Math.max(1, Math.ceil(filtered.length / pageSize));
  // Se recorta en el render además del efecto: entre el cambio de conjunto y el
  // efecto hay un pintado, y ese pintado no debe cortar por un índice muerto.
  const currentPage = Math.min(page, lastPage);
  const pageRows = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize],
  );
  const marcasSinSenal = useMarcasSinSenal(idSinSenal ? pageRows.map((r) => idSinSenal(r)) : []);

  // Qué atajo está activo se DEDUCE del rango: si el usuario escribe fechas a
  // mano en el cajón de filtros, ninguno queda marcado y no hay estado que se
  // pueda desincronizar.
  const activePreset = useMemo(() => {
    if (to !== ymd(new Date())) return "";
    const hit = PRESETS.find((d) => daysAgo(d) === from);

    return hit ? String(hit) : "";
  }, [from, to]);

  const applyPreset = (v: string) => {
    setFrom(daysAgo(Number(v)));
    setTo(ymd(new Date()));
  };

  const rangeLabel = t("ui.DataReport.rangoDeA", { defaultValue: "{{from}} a {{to}}", from, to });
  const fileBase = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  /**
   * Exporta lo que se está VIENDO (`filtered`), no lo que se cargó: si el
   * usuario buscó «Torre B», el archivo trae Torre B. Y trae el conjunto
   * entero, no la página pintada — una exportación recortada a las 25 filas de
   * la paginación es una trampa silenciosa.
   */
  const [exportando, setExportando] = useState(false);
  const exportar = async (format: ExportFormat) => {
    if (!filtered.length) {
      toast.info(
        t(
          "ui.DataReport.sinFilasParaExportar",
          "No hay registros que exportar",
        ),
      );

      return;
    }
    setExportando(true);
    try {
      const mask = mascaraDeArchivo();

      await exportColumns(
        format,
        columns.map((c) => ({
          label: rotulo(c),
          value: (row: T) => exportValue(c, row, mask),
          align: c.align,
        })),
        filtered,
        {
          title,
          subtitle: t("ui.DataReport.rangoRegistros", { defaultValue: "Rango: {{range}} · {{count}} registro(s)", range: rangeLabel, count: filtered.length }),
          fileBase: `${fileBase}-${to}`,
        },
      );
      toast.success(
        t("ui.DataReport.informeExportado", "Informe exportado") +
          ` (${format === "excel" ? "Excel" : format.toUpperCase()})`,
      );
    } catch (e) {
      console.error("export failed", e);
      toast.error(
        t("ui.DataReport.errorExportar", "No se pudo generar el archivo"),
      );
    } finally {
      setExportando(false);
    }
  };

  // El documento impreso es una página aparte: no hereda las variables del CRM,
  // así que sus neutros van escritos en oklch (los mismos valores acromáticos
  // del sistema) en vez de un azul marino a mano.
  const printableHtml = () => {
    const mask = mascaraDeArchivo();
    const head = columns
      .map((c) => `<th>${escapeHtml(rotulo(c))}</th>`)
      .join("");
    const body = filtered
      .map(
        (row) =>
          `<tr>${columns.map((c) => `<td>${escapeHtml(exportValue(c, row, mask))}</td>`).join("")}</tr>`,
      )
      .join("");

    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
      <style>
        body{font-family:'Urbanist Variable','Urbanist','Segoe UI',Arial,sans-serif;color:oklch(0.17 0 0);margin:28px}
        h1{font-size:18px;margin:0 0 2px} .sub{color:oklch(0.47 0 0);font-size:12px;margin:0 0 16px}
        table{border-collapse:collapse;width:100%;font-size:12px}
        th{background:oklch(0.20 0 0);color:oklch(1 0 0);text-align:left;padding:7px 9px}
        td{padding:6px 9px;border-bottom:1px solid oklch(0.90 0 0)}
        tr:nth-child(even) td{background:oklch(0.97 0 0)}
        .foot{margin-top:18px;color:oklch(0.62 0 0);font-size:10px;text-align:right}
      </style></head><body>
      <h1>${escapeHtml(title)}</h1>
      <p class="sub">${escapeHtml(t("ui.DataReport.rangoRegistros", { defaultValue: "Rango: {{range}} · {{count}} registro(s)", range: rangeLabel, count: filtered.length }))}</p>
      <table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${columns.length}" style="text-align:center;color:oklch(0.62 0 0);padding:24px">${escapeHtml(t("ui.DataReport.sinDatos", "Sin datos"))}</td></tr>`}</tbody></table>
      <p class="foot">${escapeHtml(pieDeInforme())}</p>
      </body></html>`;
  };

  const openPrint = (autoPrint: boolean) => {
    const w = window.open("", "_blank");

    if (!w) {
      toast.error(
        t(
          "ui.DataReport.habilitaVentanasEmergentes",
          "Habilita las ventanas emergentes para exportar",
        ),
      );

      return;
    }
    w.document.write(printableHtml());
    w.document.close();
    if (autoPrint) {
      w.focus();
      setTimeout(() => w.print(), 300);
    }
  };

  return (
    <ReportPageShell
      count={filtered.length}
      description={description}
      empty={{ message: emptyMessage }}
      exporting={exportando}
      filters={
        <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="cg-eyebrow">{t("comun.desde", "Desde")}</label>
            <input
              className="cg-input w-full px-3 py-2 text-sm"
              max={to}
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="cg-eyebrow">{t("comun.hasta", "Hasta")}</label>
            <input
              className="cg-input w-full px-3 py-2 text-sm"
              min={from}
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        {extraFilters}
        </div>
      }
      icon={icon}
      loading={loading}
      pagination={{
        page: currentPage,
        pageSize,
        total: filtered.length,
        onPageChange: setPage,
        // Cambiar el tamaño de página desde la 7 dejaría al usuario en un sitio
        // que ya no existe: se vuelve al principio.
        onPageSizeChange: (n) => {
          setPageSize(n);
          setPage(1);
        },
      }}
      rangeControl={
        <Segmented
          options={PRESETS.map((d) => ({
            value: String(d),
            label: t("ui.DataReport.nDias", { defaultValue: "{{count}} días", count: d }),
          }))}
          value={activePreset}
          onChange={applyPreset}
        />
      }
      search={searchable ? search : undefined}
      title={title}
      tone={tone}
      onApplyFilters={fetchRows}
      onExport={exportar}
      onPrint={() => openPrint(true)}
      onSearchChange={searchable ? setSearch : undefined}
    >
      {/* Con filas; sin ellas el armazón pinta su «sin datos», que es lo que
          hay que ver. */}
      {!loading && filtered.length > 0 && summary}
      {loading || filtered.length === 0 ? null : esTelefono ? (
        /* ── EL INFORME, PLEGADO EN FICHAS ─────────────────────────────────
           Diez informes comparten este componente y todos pintaban de siete a
           nueve columnas en 390 px. `ReportColumn` ya trae lo que hace falta
           para una ficha —un rótulo y un valor que es texto—, porque es lo
           mismo que viaja al CSV y a la impresión.

           La primera columna titula; el resto van como rótulo y valor. El tono
           de la fila —el rojo de un pánico, el de una caída— se conserva: es
           severidad, y perderla en el teléfono sería perder justo lo que se
           mira primero. */
        <MobileCardList
          items={pageRows}
          renderCard={(row: T) => {
            const t = rowTone?.(row);
            /* Titula la primera columna que NO sea una marca de tiempo. En un
               informe la fecha va delante porque ordena la tabla, pero lo que
               se busca al repasar la lista es el título del incidente, el
               recorrido o el nombre del vigilante; una ficha encabezada por
               «13/09/2026, 10:50 a. m.» obliga a leerla entera para saber de
               qué va. La fecha no se pierde: baja a su propia línea. */
            const iTitulo = Math.max(
              0,
              columns.findIndex((c) => !ES_FECHA.test(c.value(row).trim())),
            );
            const primera = columns[iTitulo];
            const resto = columns.filter((_, i) => i !== iTitulo);

            return (
              <div
                className="-m-4 rounded-[inherit] p-4"
                style={
                  t
                    ? {
                        background: `color-mix(in oklab, var(--${t}) 7%, transparent)`,
                        boxShadow: `inset 3px 0 0 0 var(--${t})`,
                      }
                    : undefined
                }
              >
                <div className="text-sm font-semibold">
                  {primera ? primera.value(row) : ""}
                  {idSinSenal && (
                    <EtiquetaSinSenal fila={row} marca={marcasSinSenal[String(idSinSenal(row) ?? "")]} />
                  )}
                </div>
                {resto.length > 0 && (
                  <dl className="mt-1.5 grid gap-1.5 text-xs">
                    {resto.map((c) => {
                      const v = c.value(row);

                      if (!v || v === "—" || v === "-") return null;

                      return (
                        <div
                          key={c.key}
                          className="flex items-start justify-between gap-3"
                        >
                          <dt
                            className="shrink-0"
                            style={{ color: "var(--ink-faint)" }}
                          >
                            {rotulo(c)}
                          </dt>
                          <dd className="min-w-0 text-right tabular-nums">
                            {v}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                )}
              </div>
            );
          }}
          onItemClick={onRowClick}
        />
      ) : (
        <div ref={tableRef} className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr
                className="cg-eyebrow border-b text-left"
                style={{
                  borderColor: "var(--hairline)",
                  background: "var(--glass-sunken)",
                }}
              >
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={`px-4 py-3 ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""}`}
                  >
                    {rotulo(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, i) => {
                const t = rowTone?.(row);

                return (
                  <tr
                    key={(currentPage - 1) * pageSize + i}
                    className="border-b transition-colors hover:bg-[var(--glass-sunken)]"
                    // Con detalle, la fila es un control: se pulsa con el ratón y
                    // también con el teclado. Un informe que sólo se puede
                    // auditar con ratón no se puede auditar.
                    role={onRowClick ? "button" : undefined}
                    style={{
                      cursor: onRowClick ? "pointer" : undefined,
                      borderColor: "var(--hairline)",
                      // La fila crítica se tiñe con su semántico, nunca con el
                      // acento: un pánico es rojo aunque la empresa elija verde.
                      background: t
                        ? `color-mix(in oklab, var(--${t}) 7%, transparent)`
                        : undefined,
                    }}
                    tabIndex={onRowClick ? 0 : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onRowClick(row);
                            }
                          }
                        : undefined
                    }
                  >
                    {columns.map((c, ci) => (
                      <td
                        key={c.key}
                        className={`relative px-4 py-2.5 ${c.align === "right" ? "text-right tabular-nums" : c.align === "center" ? "text-center" : ""}`}
                      >
                        {ci === 0 && t && (
                          <span
                            aria-hidden
                            className="absolute left-0 top-1/2 h-[60%] w-[3px] -translate-y-1/2 rounded-full"
                            style={{
                              background: `var(--${t})`,
                              boxShadow: `0 0 12px color-mix(in oklab, var(--${t}) 45%, transparent)`,
                            }}
                          />
                        )}
                        {c.value(row)}
                        {ci === 0 && idSinSenal && (
                          <EtiquetaSinSenal fila={row} marca={marcasSinSenal[String(idSinSenal(row) ?? "")]} />
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ReportPageShell>
  );
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
