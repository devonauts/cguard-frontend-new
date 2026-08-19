import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import ReportPageShell from "./ReportPageShell";
import type { ReportTone } from "./reportIcons";
import { Segmented } from "@/components/kit";

export interface ReportColumn<T> {
  key: string;
  label: string;
  /** Cell value as a string (used for the table, CSV and print alike). */
  value: (row: T) => string;
  align?: "left" | "right" | "center";
  /**
   * Marca de privacidad. `guardName` = la columna identifica al vigilante y
   * OBEDECE al ajuste «ocultar nombre del vigilante» de Configuración ›
   * Informes. La auditoría del 15-ago lo encontró aplicado en el servidor
   * (informes del cliente, PDF de KPIs) y en NINGUNA de las cuatro salidas que
   * este componente arma en el navegador — tabla, CSV, Excel/impresión y PDF
   * salían con nombre igual. Al filtrar AQUÍ, una sola regla cubre las cuatro.
   */
  privacy?: "guardName";
}

interface DataReportProps<T> {
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
  /** Days back the default range spans (default 30). */
  defaultDays?: number;
  emptyMessage?: string;
  /**
   * Marca una fila como crítica. Devuelve el tono semántico (`bad`/`warn`) y la
   * fila se dibuja con una regla de ese color en el canto izquierdo. La
   * severidad SIEMPRE sale de aquí, nunca del acento de la empresa.
   */
  rowTone?: (row: T) => "bad" | "warn" | "ok" | undefined;
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

function csvCell(v: string): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Generic, data-driven report page. Wraps ReportPageShell with a real data
 * fetch, a themed table, a date-range filter and WORKING exports (Excel/CSV,
 * PDF and print — all client-side, no backend needed). Turns a 6-line dead
 * shell into a functioning, exportable report.
 */
export default function DataReport<T>({
  title, description, icon, tone, columns: columnsProp, load, searchable = true, defaultDays = 30, emptyMessage, rowTone,
}: DataReportProps<T>) {
  // «Ocultar nombre del vigilante» (Configuración › Informes) también rige lo
  // que se arma en el navegador. Falla abierto: sin ajuste legible, se muestra
  // todo — igual que siempre.
  const [ocultarVigilante, setOcultarVigilante] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const tenantId = localStorage.getItem("tenantId");
        if (!tenantId) return;
        const api = (await import("@/lib/api")).default;
        const { data } = await api.get(`/tenant/${tenantId}/settings`, { toast: { silentError: true } } as any);
        setOcultarVigilante(!!data?.reportSettings?.hideGuardName);
      } catch { /* sin ajuste → todo visible */ }
    })();
  }, []);
  const columns = useMemo(
    () => (ocultarVigilante ? columnsProp.filter((c) => c.privacy !== "guardName") : columnsProp),
    [columnsProp, ocultarVigilante],
  );
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(() => daysAgo(defaultDays));
  const [to, setTo] = useState(() => ymd(today));
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const tableRef = useRef<HTMLDivElement>(null);

  const fetchRows = useCallback(() => {
    setLoading(true);
    load({ from, to })
      .then((r) => setRows(Array.isArray(r) ? r : []))
      .catch(() => { setRows([]); toast.error("No se pudo cargar el informe"); })
      .finally(() => setLoading(false));
  }, [from, to, load]);

  useEffect(() => { fetchRows(); /* eslint-disable-next-line */ }, [from, to]);

  const filtered = useMemo(() => {
    if (!searchable || !search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((row) => columns.some((c) => c.value(row).toLowerCase().includes(q)));
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
  useEffect(() => { setPage(1); }, [search, rows]);

  const lastPage = Math.max(1, Math.ceil(filtered.length / pageSize));
  // Se recorta en el render además del efecto: entre el cambio de conjunto y el
  // efecto hay un pintado, y ese pintado no debe cortar por un índice muerto.
  const currentPage = Math.min(page, lastPage);
  const pageRows = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize],
  );

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

  const rangeLabel = `${from} a ${to}`;
  const fileBase = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const exportExcel = () => {
    const header = columns.map((c) => csvCell(c.label)).join(",");
    const body = filtered.map((row) => columns.map((c) => csvCell(c.value(row))).join(",")).join("\n");
    // UTF-8 BOM so Excel opens accents correctly.
    download(`${fileBase}-${to}.csv`, new Blob(["﻿" + header + "\n" + body], { type: "text/csv;charset=utf-8;" }));
    toast.success("Informe exportado (Excel)");
  };

  // El documento impreso es una página aparte: no hereda las variables del CRM,
  // así que sus neutros van escritos en oklch (los mismos valores acromáticos
  // del sistema) en vez de un azul marino a mano.
  const printableHtml = () => {
    const head = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("");
    const body = filtered
      .map((row) => `<tr>${columns.map((c) => `<td>${escapeHtml(c.value(row))}</td>`).join("")}</tr>`)
      .join("");
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
      <style>
        body{font-family:'Inter Variable','Inter','Segoe UI',Arial,sans-serif;color:oklch(0.17 0 0);margin:28px}
        h1{font-size:18px;margin:0 0 2px} .sub{color:oklch(0.47 0 0);font-size:12px;margin:0 0 16px}
        table{border-collapse:collapse;width:100%;font-size:12px}
        th{background:oklch(0.20 0 0);color:oklch(1 0 0);text-align:left;padding:7px 9px}
        td{padding:6px 9px;border-bottom:1px solid oklch(0.90 0 0)}
        tr:nth-child(even) td{background:oklch(0.97 0 0)}
        .foot{margin-top:18px;color:oklch(0.62 0 0);font-size:10px;text-align:right}
      </style></head><body>
      <h1>${escapeHtml(title)}</h1>
      <p class="sub">Rango: ${escapeHtml(rangeLabel)} · ${filtered.length} registro(s)</p>
      <table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${columns.length}" style="text-align:center;color:oklch(0.62 0 0);padding:24px">Sin datos</td></tr>`}</tbody></table>
      <p class="foot">Generado por CGuardPro</p>
      </body></html>`;
  };

  const openPrint = (autoPrint: boolean) => {
    const w = window.open("", "_blank");
    if (!w) { toast.error("Habilita las ventanas emergentes para exportar"); return; }
    w.document.write(printableHtml());
    w.document.close();
    if (autoPrint) { w.focus(); setTimeout(() => w.print(), 300); }
  };

  return (
    <ReportPageShell
      title={title}
      description={description}
      icon={icon}
      tone={tone}
      count={filtered.length}
      loading={loading}
      search={searchable ? search : undefined}
      onSearchChange={searchable ? setSearch : undefined}
      onExportExcel={exportExcel}
      onExportPdf={() => openPrint(true)}
      onPrint={() => openPrint(true)}
      empty={{ message: emptyMessage }}
      pagination={{
        page: currentPage,
        pageSize,
        total: filtered.length,
        onPageChange: setPage,
        // Cambiar el tamaño de página desde la 7 dejaría al usuario en un sitio
        // que ya no existe: se vuelve al principio.
        onPageSizeChange: (n) => { setPageSize(n); setPage(1); },
      }}
      onApplyFilters={fetchRows}
      rangeControl={
        <Segmented
          value={activePreset}
          onChange={applyPreset}
          options={PRESETS.map((d) => ({ value: String(d), label: `${d} días` }))}
        />
      }
      filters={
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="cg-eyebrow">Desde</label>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
              className="cg-input w-full px-3 py-2 text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="cg-eyebrow">Hasta</label>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)}
              className="cg-input w-full px-3 py-2 text-sm" />
          </div>
        </div>
      }
    >
      {loading || filtered.length === 0 ? null : (
        <div ref={tableRef} className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr
                className="cg-eyebrow border-b text-left"
                style={{ borderColor: "var(--hairline)", background: "var(--glass-sunken)" }}
              >
                {columns.map((c) => (
                  <th key={c.key} className={`px-4 py-3 ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""}`}>{c.label}</th>
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
                    style={{
                      borderColor: "var(--hairline)",
                      // La fila crítica se tiñe con su semántico, nunca con el
                      // acento: un pánico es rojo aunque la empresa elija verde.
                      background: t ? `color-mix(in oklab, var(--${t}) 7%, transparent)` : undefined,
                    }}
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
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
