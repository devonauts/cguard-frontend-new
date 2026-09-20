import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock,
  CalendarDays,
  Timer,
  ExternalLink,
} from "lucide-react";

import GuardsLayout from "@/layouts/GuardsLayout";
import { Section, StatCard, StatsStrip, EmptyState, SkeletonCards } from "@/components/kit";
import { Button } from "@/components/ui/button";
import attendanceService, {
  type AttendanceRecord,
} from "@/lib/api/attendanceService";
import {
  StatusBadge,
  ApprovalBadge,
  STATUS_META,
  approvalLabel,
  fmtDateTime,
  fmtTime,
  fmtHours,
} from "@/pages/admin/nomina/shared";
import ExportMenu from "@/components/reports/ExportMenu";
import { exportMatrix, type ExportFormat } from "@/lib/export/reportExport";
import { localeActual } from "@/lib/localeActual";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";
type Period = "week" | "month";

/** [start, end] bounds for the period containing `anchor` (local time). */
function rangeFor(period: Period, anchor: Date): [Date, Date] {
  const y = anchor.getFullYear(),
    m = anchor.getMonth(),
    d = anchor.getDate();

  if (period === "week") {
    const dow = (anchor.getDay() + 6) % 7; // Monday = 0
    const start = new Date(y, m, d - dow, 0, 0, 0, 0);
    const end = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + 6,
      23,
      59,
      59,
      999,
    );

    return [start, end];
  }

  return [
    new Date(y, m, 1, 0, 0, 0, 0),
    new Date(y, m + 1, 0, 23, 59, 59, 999),
  ];
}

function shiftAnchor(period: Period, anchor: Date, dir: number): Date {
  const d = new Date(anchor);

  if (period === "week") d.setDate(d.getDate() + dir * 7);
  else d.setMonth(d.getMonth() + dir);

  return d;
}

function rangeLabel(period: Period, anchor: Date): string {
  const [s, e] = rangeFor(period, anchor);

  if (period === "month")
    return s.toLocaleDateString(localeActual(), { timeZone: zonaDeLaEmpresa(),
      month: "long",
      year: "numeric",
    });
  const sameMonth = s.getMonth() === e.getMonth();

  return `${s.toLocaleDateString(localeActual(), { timeZone: zonaDeLaEmpresa(), day: "2-digit", month: sameMonth ? undefined : "short" })} – ${e.toLocaleDateString(localeActual(), { timeZone: zonaDeLaEmpresa(), day: "2-digit", month: "short", year: "numeric" })}`;
}

/**
 * Hoja de asistencia individual del vigilante — sus marcaciones (guardShift)
 * del periodo, con resumen (turnos, días, horas, tardanzas), tabla detallada y
 * exportación en CSV, Excel o PDF. Es la vista de Nómina · Registros filtrada a
 * un solo trabajador. :id = securityGuard id (guardShift.guardNameId).
 */
export default function GuardAsistenciaPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const [rows, setRows] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("month");
  const [anchor, setAnchor] = useState<Date>(() => new Date());

  const [rangeStart, rangeEnd] = useMemo(
    () => rangeFor(period, anchor),
    [period, anchor],
  );

  const load = useCallback(() => {
    if (!id) {
      setLoading(false);

      return;
    }
    setLoading(true);
    attendanceService
      .list({
        "filter[guardName]": id,
        "filter[punchInTimeRange][0]": rangeStart.toISOString(),
        "filter[punchInTimeRange][1]": rangeEnd.toISOString(),
        limit: 500,
        orderBy: "punchInTime_DESC",
      })
      .then((r) => setRows(r.rows || []))
      .catch((e) => toast.error(e?.message || "Error al cargar la asistencia"))
      .finally(() => setLoading(false));
  }, [id, rangeStart, rangeEnd]);

  useEffect(load, [load]);

  const summary = useMemo(() => {
    const days = new Set<string>();
    let hours = 0,
      late = 0;

    for (const r of rows) {
      if (r.punchInTime)
        days.add(new Date(r.punchInTime).toLocaleDateString(localeActual(), { timeZone: zonaDeLaEmpresa() }));
      hours += Number(r.hoursWorked || 0);
      if (r.status === "late" || Number(r.lateMinutes || 0) > 0) late += 1;
    }

    return {
      shifts: rows.length,
      days: days.size,
      hours: Math.round(hours * 100) / 100,
      late,
    };
  }, [rows]);

  /**
   * La hoja de asistencia de ESTA persona, en los tres formatos.
   *
   * Es el documento que se imprime para una conversación de recursos humanos o
   * para adjuntar a una liquidación, y salía sólo en CSV: para llevarlo a una
   * reunión había que abrirlo, darle formato a mano y volverlo a exportar.
   */
  const COLUMNAS_EXPORT: {
    label: string;
    get: (r: AttendanceRecord) => string | number;
    align?: "left" | "right";
  }[] = [
    {
      label: "Fecha",
      get: (r) =>
        r.punchInTime
          ? new Date(r.punchInTime).toLocaleDateString(localeActual(), { timeZone: zonaDeLaEmpresa() })
          : "",
    },
    { label: "Puesto", get: (r) => r.stationName?.stationName || "" },
    { label: "Programado inicio", get: (r) => fmtTime(r.scheduledStart) },
    { label: "Programado fin", get: (r) => fmtTime(r.scheduledEnd) },
    {
      label: "Entrada",
      get: (r) =>
        r.punchInTime
          ? new Date(r.punchInTime).toLocaleString(localeActual(), { timeZone: zonaDeLaEmpresa() })
          : "",
    },
    {
      label: "Salida",
      get: (r) =>
        r.punchOutTime
          ? new Date(r.punchOutTime).toLocaleString(localeActual(), { timeZone: zonaDeLaEmpresa() })
          : "",
    },
    { label: "Horas", get: (r) => r.hoursWorked ?? "", align: "right" },
    { label: "Tarde (min)", get: (r) => r.lateMinutes ?? 0, align: "right" },
    {
      label: "Extra (min)",
      get: (r) => r.overtimeMinutes ?? 0,
      align: "right",
    },
    {
      label: "Fuera de geocerca",
      get: (r) => (r.punchInOutsideGeofence ? "Sí" : "No"),
    },
    {
      label: "Estado",
      get: (r) => STATUS_META[r.status]?.label || r.status || "",
    },
    { label: "Aprobación", get: (r) => approvalLabel(r.approvalStatus) },
  ];

  const exportar = async (format: ExportFormat) => {
    if (!rows.length) {
      toast.error(t("comun.noHayRegistrosParaExportar"));

      return;
    }
    try {
      await exportMatrix(
        format,
        COLUMNAS_EXPORT.map((c) => c.label),
        rows.map((r) => COLUMNAS_EXPORT.map((c) => c.get(r))),
        {
          title: "Hoja de asistencia",
          subtitle: `${rangeLabel(period, anchor)} \u00b7 ${rows.length} registro(s)`,
          fileBase: `asistencia-${period}-${rangeStart.toISOString().slice(0, 10)}`,
        },
        COLUMNAS_EXPORT.map((c) => c.align || "left"),
      );
      toast.success(`${rows.length} registro(s) exportado(s)`);
    } catch (e) {
      console.error("export asistencia vigilante", e);
      toast.error("No se pudo generar el archivo");
    }
  };

  return (
    <GuardsLayout navKey="keep-safe" title="guards.nav.asistencia">
      <div className="mx-auto max-w-6xl space-y-4 pb-24">
        {/* Resumen del periodo */}
        <StatsStrip className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            accent="blue"
            icon={<CalendarClock />}
            label="Turnos"
            value={String(summary.shifts)}
          />
          <StatCard
            accent="green"
            icon={<CalendarDays />}
            label={t("ui.GuardAsistencia.diasTrabajados", "Días trabajados")}
            value={String(summary.days)}
          />
          <StatCard
            accent="primary"
            icon={<Clock />}
            label="Horas totales"
            value={summary.hours.toFixed(2)}
          />
          <StatCard
            accent="orange"
            icon={<Timer />}
            label="Tardanzas"
            value={String(summary.late)}
          />
        </StatsStrip>

        <Section
          action={
            <div className="flex flex-wrap items-center gap-2">
              {/* Periodo */}
              <div className="flex items-center rounded-xl border border-border bg-background p-0.5">
                {(["week", "month"] as Period[]).map((p) => (
                  <button
                    key={p}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${period === p ? "brand-fill" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => setPeriod(p)}
                  >
                    {p === "week" ? "Semana" : "Mes"}
                  </button>
                ))}
              </div>
              {/* Navegador de rango */}
              <div className="flex items-center gap-1 rounded-xl border border-border bg-background px-2 py-1">
                <Button
                  className="h-7 w-7"
                  size="icon"
                  variant="ghost"
                  onClick={() => setAnchor((a) => shiftAnchor(period, a, -1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-[150px] text-center text-sm font-medium capitalize">
                  {rangeLabel(period, anchor)}
                </span>
                <Button
                  className="h-7 w-7"
                  size="icon"
                  variant="ghost"
                  onClick={() => setAnchor((a) => shiftAnchor(period, a, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <ExportMenu
                disabled={!rows.length}
                size="sm"
                onExport={exportar}
              />
            </div>
          }
          icon={<CalendarClock className="h-4 w-4" />}
          title={t("ui.GuardAsistenciaPage.hojaDeAsistencia")}
        >
          {loading ? (
            <SkeletonCards count={4} />
          ) : rows.length === 0 ? (
            <EmptyState
              description={`Este vigilante no registró asistencia en ${rangeLabel(period, anchor)}.`}
              icon={<CalendarClock />}
              title={t("ui.GuardAsistenciaPage.sinMarcaciones")}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5 text-left font-semibold">
                      {t("comun.fecha")}
                    </th>
                    <th className="px-3 py-2.5 text-left font-semibold">
                      {t("comun.puesto")}
                    </th>
                    <th className="px-3 py-2.5 text-left font-semibold">
                      Entrada
                    </th>
                    <th className="px-3 py-2.5 text-left font-semibold">
                      Salida
                    </th>
                    <th className="px-3 py-2.5 text-right font-semibold">
                      Horas
                    </th>
                    <th className="px-3 py-2.5 text-left font-semibold">
                      {t("comun.estado")}
                    </th>
                    <th className="px-3 py-2.5 text-left font-semibold">
                      {t("ui.GuardAsistencia.aprobacion", "Aprobación")}
                    </th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-border/20 hover:bg-muted/20"
                    >
                      <td className="px-3 py-2.5 text-foreground">
                        {r.punchInTime
                          ? new Date(r.punchInTime).toLocaleDateString(
                              localeActual(),
                              { timeZone: zonaDeLaEmpresa(), day: "2-digit", month: "short" },
                            )
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {r.stationName?.stationName || "—"}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {fmtDateTime(r.punchInTime)}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {r.punchOutTime ? (
                          fmtDateTime(r.punchOutTime)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {fmtHours(r.hoursWorked)}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge
                          approval={r.approvalStatus}
                          status={r.status}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <ApprovalBadge status={r.approvalStatus} />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Link
                          className="inline-flex items-center gap-1 text-xs brand-text hover:underline"
                          title={t("ui.GuardAsistenciaPage.verEnAsistencia")}
                          to={`/nomina/records?focus=${r.id}`}
                        >
                          Detalle <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </GuardsLayout>
  );
}
