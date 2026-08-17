import { loadXlsx } from '../../../lib/lazyXlsx';
import { useEffect, useState, useCallback } from "react";
import AppLayout from "@/layouts/app-layout";
import { DataTable, type Column } from "@/components/table/DataTable";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { FileDown, Printer, Lock, FileSpreadsheet, CalendarDays, Clock, Timer, UserX } from "lucide-react";
import attendanceService from "@/lib/api/attendanceService";
import { PageContainer, PageHeader, Section, MetricTile, Stagger, Toolbar, StatusBadge, EmptyState } from "@/components/kit";

interface SummaryRow {
  id: string;
  guardId: string;
  guardName: string;
  shifts: number;
  regularHours: number;
  overtimeHours: number;
  totalHours: number;
  lateCount: number;
  missedClockouts: number;
  noShows: number;
  approvedCorrections: number;
  daysWorked?: number;
  role?: string;
}

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

interface HoursTotals {
  shifts: number;
  totalHours: number;
  overtimeHours: number;
  lateCount: number;
  noShows: number;
}

// Shape returned by attendanceService.payrollSummary (unwrapped API payload).
// The endpoint keeps its historical name; it returns hours only — see the note
// on payrollSummary in the backend's attendanceAdminService.
interface HoursSummaryResponse {
  rows?: SummaryRow[];
  totals?: HoursTotals;
}

/** Cifra de nómina: alineada a la derecha y en cifras de ancho fijo, para que
 *  las columnas se puedan comparar de un vistazo. */
function Num({ v, strong, tone }: { v: React.ReactNode; strong?: boolean; tone?: "warn" | "bad" }) {
  return (
    <span
      className={`block text-right tabular-nums ${strong ? "font-semibold" : ""}`}
      style={tone ? { color: `var(--${tone}-text)`, fontWeight: 600 } : undefined}
    >
      {v}
    </span>
  );
}

export default function NominaHoursSummary() {
  // Arranca en 14 días sólo hasta que el servidor diga cuál es el periodo real.
  // Antes se quedaba ahí para siempre: el selector «semanal / quincenal /
  // mensual» de Configuración se guardaba y no cambiaba una sola cifra de este
  // informe, así que dos empresas con periodos distintos veían lo mismo.
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 14 * 864e5)));
  const [to, setTo] = useState(isoDay(new Date()));
  const [periodo, setPeriodo] = useState<{ label: string; from: string; to: string } | null>(null);
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [totals, setTotals] = useState<HoursTotals | null>(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    attendanceService
      .payrollSummary({ from: `${from}T00:00:00`, to: `${to}T23:59:59` })
      .then((d: HoursSummaryResponse) => {
        setRows((d.rows || []).map((r: SummaryRow) => ({ ...r, id: r.id ?? r.guardId })));
        setTotals(d.totals || null);
      })
      .catch((e) => toast.error(e?.message || "Error al generar el resumen"))
      .finally(() => setLoading(false));
  }, [from, to]);

  // Se pregunta el periodo ANTES de la primera carga y se ajustan las fechas; el
  // efecto de abajo dispara `load` cuando cambian. Si falla, se queda con los 14
  // días — un informe con el rango equivocado es mejor que ninguno.
  useEffect(() => {
    let vivo = true;
    attendanceService
      .currentPeriod()
      .then((p) => {
        if (!vivo || !p?.from || !p?.to) return;
        setPeriodo({ label: p.label, from: p.from, to: p.to });
        setFrom(p.from);
        setTo(p.to);
      })
      .catch(() => {
        /* se conserva el rango por defecto */
      });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(load, [from, to]);

  const closePeriod = async () => {
    if (!(await confirmDialog({ title: 'Cerrar periodo', message: `Cerrar el periodo hasta ${to}? Los registros quedarán bloqueados (solo lectura).`, confirmText: 'Cerrar periodo', tone: 'danger' }))) return;
    setClosing(true);
    try {
      const r = await attendanceService.closePeriod(`${to}T23:59:59`);
      toast.success(`Periodo cerrado · ${r.lockedCount} registro(s) bloqueado(s)`);
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Error al cerrar el periodo");
    } finally {
      setClosing(false);
    }
  };

  const exportXlsx = async () => {
    const data = rows.map((r) => ({
      Vigilante: r.guardName,
      Turnos: r.shifts,
      "Días trabajados": r.daysWorked ?? 0,
      "Horas regulares": r.regularHours,
      "Horas extra": r.overtimeHours,
      "Horas totales": r.totalHours,
      Tardanzas: r.lateCount,
      "Sin salida": r.missedClockouts,
      Inasistencias: r.noShows,
      Correcciones: r.approvedCorrections,
    }));
    const XLSX = await loadXlsx();
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Horas");
    XLSX.writeFile(wb, `horas-trabajadas-${from}_${to}.xlsx`);
  };

  const exportPdf = () => {
    // El encabezado de la tabla impresa toma el acento vivo del CRM: si el
    // usuario cambió el color, el PDF cambia con él. Si el navegador no puede
    // resolverlo, la celda sale sin relleno en vez de con un dorado fijo.
    const css = getComputedStyle(document.documentElement);
    const brand = css.getPropertyValue("--brand").trim();
    const brandInk = css.getPropertyValue("--brand-ink").trim();
    // El filo de la tabla impresa también sale del token, no de un gris fijo.
    const line = css.getPropertyValue("--hairline").trim();
    const esc = (s: unknown) =>
      String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
    const head = ["Vigilante", "Días trab.", "Turnos", "H. reg.", "H. extra", "H. tot.", "Tardanzas", "Inasist.", "Correc."];
    const body = rows
      .map((r) => {
        const cells = [r.guardName, r.daysWorked ?? 0, r.shifts, r.regularHours.toFixed(2), r.overtimeHours.toFixed(2), r.totalHours.toFixed(2), r.lateCount, r.noShows, r.approvedCorrections];
        return `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`;
      })
      .join("");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Horas trabajadas ${esc(from)} a ${esc(to)}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px}h1{font-size:18px}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-top:12px}
      th,td{border:1px solid ${line || "currentColor"};padding:6px;text-align:left}
      th{background:${brand || "transparent"};color:${brandInk || "inherit"}}
      td:not(:first-child){text-align:right;font-variant-numeric:tabular-nums}</style></head>
      <body><h1>Resumen de horas · ${esc(from)} a ${esc(to)}</h1>
      <table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  const exportCsv = () => {
    const headers = [
      "Vigilante", "Días trabajados", "Turnos", "Horas regulares", "Horas extra",
      "Horas totales", "Tardanzas", "Sin salida", "Inasistencias", "Correcciones",
    ];
    const lines = rows.map((r) =>
      [r.guardName, r.daysWorked ?? 0, r.shifts, r.regularHours, r.overtimeHours, r.totalHours, r.lateCount, r.missedClockouts, r.noShows, r.approvedCorrections]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [headers.join(","), ...lines].join("\r\n");
    const link = document.createElement("a");
    // Prepend UTF-8 BOM so Excel renders accented guard names (ñ/á/é) correctly.
    link.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    link.download = `horas-trabajadas-${from}_${to}.csv`;
    link.click();
  };

  const columns: Column<SummaryRow>[] = [
    {
      key: "guardName",
      header: "Vigilante",
      render: (_v, r) => (
        <span className="inline-flex items-center gap-1.5">
          {r.guardName}
          {r.role === "supervisor" && <StatusBadge tone="warn" dot={false}>Supervisor</StatusBadge>}
          {r.role === "administrative" && <StatusBadge tone="info" dot={false}>Administrativo</StatusBadge>}
        </span>
      ),
    },
    { key: "daysWorked", header: "Días trabajados", render: (_v, r) => <Num v={r.daysWorked ?? 0} strong /> },
    { key: "shifts", header: "Turnos", render: (_v, r) => <Num v={r.shifts} /> },
    { key: "regularHours", header: "H. regulares", render: (_v, r) => <Num v={r.regularHours.toFixed(2)} /> },
    { key: "overtimeHours", header: "H. extra", render: (_v, r) => <Num v={r.overtimeHours.toFixed(2)} tone={r.overtimeHours > 0 ? "warn" : undefined} /> },
    { key: "totalHours", header: "H. totales", render: (_v, r) => <Num v={r.totalHours.toFixed(2)} strong /> },
    { key: "lateCount", header: "Tardanzas", render: (_v, r) => <Num v={r.lateCount} tone={r.lateCount > 0 ? "warn" : undefined} /> },
    { key: "noShows", header: "Inasistencias", render: (_v, r) => <Num v={r.noShows} tone={r.noShows > 0 ? "bad" : undefined} /> },
    { key: "approvedCorrections", header: "Correcciones", render: (_v, r) => <Num v={r.approvedCorrections} /> },
  ];

  return (
    <AppLayout>
      <PageContainer width="wide" className="p-4 sm:p-6">
        <PageHeader
          icon={<Clock />}
          title="Resumen de horas"
          subtitle={
            periodo
              ? `Días trabajados y horas por persona · periodo ${periodo.label.toLowerCase()}`
              : "Días trabajados y horas por persona en el periodo"
          }
        />

        {/* Barra: rango de fechas (izquierda) · exportar y acciones (derecha) */}
        <Toolbar className="justify-between gap-3 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="cg-eyebrow">
              Desde
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="cg-input cg-focus mt-1 block px-3 py-1.5 text-sm tabular-nums" />
            </label>
            <label className="cg-eyebrow">
              Hasta
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="cg-input cg-focus mt-1 block px-3 py-1.5 text-sm tabular-nums" />
            </label>
            <Button variant="brand" onClick={load} disabled={loading}>
              {loading ? "Generando…" : "Generar"}
            </Button>
            {/* El periodo que la empresa configuró. Antes esta pantalla abría
                siempre en 14 días fijos, así que el ajuste no se notaba en
                ningún sitio y no había forma de volver al corte real después de
                mirar otras fechas. */}
            {periodo && (from !== periodo.from || to !== periodo.to) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setFrom(periodo.from); setTo(periodo.to); }}
                title={`${periodo.from} → ${periodo.to}`}
              >
                Volver al periodo {periodo.label.toLowerCase()}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
              <FileDown className="mr-1.5 h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportXlsx} disabled={!rows.length}>
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
            </Button>
            <Button variant="outline" size="sm" onClick={exportPdf} disabled={!rows.length}>
              <Printer className="mr-1.5 h-4 w-4" /> PDF
            </Button>
            <Button variant="destructive" size="sm" onClick={closePeriod} disabled={closing}>
              <Lock className="mr-1.5 h-4 w-4" /> {closing ? "Cerrando…" : "Cerrar periodo"}
            </Button>
          </div>
        </Toolbar>

        {totals && (
          <Stagger className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricTile icon={<CalendarDays />} label="Turnos" value={totals.shifts} hint="Turnos con marcación en el periodo" />
            <MetricTile icon={<Clock />} label="Horas totales" value={Number(totals.totalHours).toFixed(2)} hint="Suma de horas trabajadas" />
            <MetricTile
              icon={<Timer />}
              label="Horas extra"
              value={Number(totals.overtimeHours).toFixed(2)}
              delta={totals.totalHours > 0
                ? { value: `${((totals.overtimeHours / totals.totalHours) * 100).toFixed(1)} %`, direction: totals.overtimeHours > 0 ? "up" : "flat" }
                : undefined}
              hint="Sobre el total de horas"
            />
            <MetricTile
              icon={<UserX />}
              label="Tardanzas / Inasist."
              value={`${totals.lateCount} / ${totals.noShows}`}
              hint="Incidencias de puntualidad"
            />
          </Stagger>
        )}

        <Section title="Detalle por persona" icon={<Clock />}>
          <div className="overflow-x-auto">
            <DataTable
              columns={columns}
              data={rows}
              emptyState={
                <EmptyState
                  icon={<Clock />}
                  title="Sin datos en el rango"
                  description="Elige otro rango de fechas y vuelve a generar el resumen."
                />
              }
            />
          </div>
        </Section>
      </PageContainer>
    </AppLayout>
  );
}
