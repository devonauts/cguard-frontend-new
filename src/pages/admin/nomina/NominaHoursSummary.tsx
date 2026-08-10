import { loadXlsx } from '../../../lib/lazyXlsx';
import { useEffect, useState, useCallback } from "react";
import AppLayout from "@/layouts/app-layout";
import { DataTable, type Column } from "@/components/table/DataTable";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { FileDown, Printer, Lock, FileSpreadsheet, CalendarDays, Clock, Timer, UserX } from "lucide-react";
import attendanceService from "@/lib/api/attendanceService";
import { PageContainer, PageHeader, Section, StatCard, Stagger } from "@/components/kit";

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

export default function NominaHoursSummary() {
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 14 * 864e5)));
  const [to, setTo] = useState(isoDay(new Date()));
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
  useEffect(load, []);

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
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:18px}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-top:12px}
      th,td{border:1px solid #ddd;padding:6px;text-align:left}th{background:#C8860A;color:#fff}</style></head>
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
          {r.role === "supervisor" && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
              Supervisor
            </span>
          )}
          {r.role === "administrative" && (
            <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
              Administrativo
            </span>
          )}
        </span>
      ),
    },
    { key: "daysWorked", header: "Días trabajados", render: (_v, r) => <span className="font-semibold">{r.daysWorked ?? 0}</span> },
    { key: "shifts", header: "Turnos" },
    { key: "regularHours", header: "H. regulares", render: (_v, r) => r.regularHours.toFixed(2) },
    { key: "overtimeHours", header: "H. extra", render: (_v, r) => r.overtimeHours.toFixed(2) },
    { key: "totalHours", header: "H. totales", render: (_v, r) => r.totalHours.toFixed(2) },
    { key: "lateCount", header: "Tardanzas" },
    { key: "noShows", header: "Inasistencias" },
    { key: "approvedCorrections", header: "Correcciones" },
  ];

  return (
    <AppLayout>
      <PageContainer width="wide" className="p-4 sm:p-6">
        <PageHeader
          icon={<Clock />}
          title="Resumen de horas"
          subtitle="Días trabajados y horas por persona en el periodo"
        />

        {/* Toolbar: rango de fechas (izquierda) · exportar y acciones (derecha) */}
        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-2">
            <label className="cg-eyebrow">
              Desde
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded-lg border border-border bg-background px-3 py-1.5 text-sm" />
            </label>
            <label className="cg-eyebrow">
              Hasta
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block rounded-lg border border-border bg-background px-3 py-1.5 text-sm" />
            </label>
            <Button variant="brand" onClick={load} disabled={loading}>
              {loading ? "Generando…" : "Generar"}
            </Button>
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
            <Button variant="outline" size="sm" onClick={closePeriod} disabled={closing} className="text-red-600">
              <Lock className="mr-1.5 h-4 w-4" /> {closing ? "Cerrando…" : "Cerrar periodo"}
            </Button>
          </div>
        </div>

        {totals && (
          <Stagger className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard icon={<CalendarDays />} accent="primary" label="Turnos" value={totals.shifts} />
            <StatCard icon={<Clock />} accent="blue" label="Horas totales" value={Number(totals.totalHours).toFixed(2)} />
            <StatCard icon={<Timer />} accent="orange" label="Horas extra" value={Number(totals.overtimeHours).toFixed(2)} />
            <StatCard icon={<UserX />} accent="red" label="Tardanzas / Inasist." value={`${totals.lateCount} / ${totals.noShows}`} />
          </Stagger>
        )}

        <div className="mt-5">
          <Section title="Detalle por persona" icon={<Clock />}>
            <div className="overflow-x-auto">
              <DataTable
                columns={columns}
                data={rows}
                emptyState={<div className="py-12 text-center text-sm text-muted-foreground">Sin datos en el rango</div>}
              />
            </div>
          </Section>
        </div>
      </PageContainer>
    </AppLayout>
  );
}
