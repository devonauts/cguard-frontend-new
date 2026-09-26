import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Lock, CalendarDays, Clock, Timer, UserX } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { DataTable, type Column } from "@/components/table/DataTable";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import ExportMenu from "@/components/reports/ExportMenu";
import { exportMatrix, type ExportFormat } from "@/lib/export/reportExport";
import attendanceService from "@/lib/api/attendanceService";
import { diaDeLaEmpresa, limitesDelDia} from "@/lib/horaDeLaEmpresa";
import {
  PageContainer,
  PageHeader,
  Section,
  MetricTile,
  StatsStrip,
  Stagger,
  Toolbar,
  StatusBadge,
  EmptyState,
} from "@/components/kit";

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

/* Ver la nota de `NominaTimecards`: el día es el de la empresa, no el de UTC. */
function isoDay(d: Date) {
  return diaDeLaEmpresa(d);
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
function Num({
  v,
  strong,
  tone,
}: {
  v: React.ReactNode;
  strong?: boolean;
  tone?: "warn" | "bad";
}) {
  return (
    <span
      className={`block text-right tabular-nums ${strong ? "font-semibold" : ""}`}
      style={
        tone ? { color: `var(--${tone}-text)`, fontWeight: 600 } : undefined
      }
    >
      {v}
    </span>
  );
}

export default function NominaHoursSummary() {
  const { t } = useTranslation();
  // Arranca en 14 días sólo hasta que el servidor diga cuál es el periodo real.
  // Antes se quedaba ahí para siempre: el selector «semanal / quincenal /
  // mensual» de Configuración se guardaba y no cambiaba una sola cifra de este
  // informe, así que dos empresas con periodos distintos veían lo mismo.
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 14 * 864e5)));
  const [to, setTo] = useState(isoDay(new Date()));
  const [periodo, setPeriodo] = useState<{
    label: string;
    periodType?: string;
    from: string;
    to: string;
  } | null>(null);
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [totals, setTotals] = useState<HoursTotals | null>(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    attendanceService
      // Se mandaba `2026-09-19T00:00:00` sin zona, y el servidor lo lee con
      // `new Date()`, o sea en la zona DEL SERVIDOR. El periodo de nómina
      // empezaba donde estuviera la máquina. Ahora viaja el instante exacto que
      // corresponde a la medianoche de la empresa.
      .payrollSummary(limitesDelDia(from, to))
      .then((d: HoursSummaryResponse) => {
        setRows(
          (d.rows || []).map((r: SummaryRow) => ({
            ...r,
            id: r.id ?? r.guardId,
          })),
        );
        setTotals(d.totals || null);
      })
      .catch((e) => toast.error(
          e?.message ||
            t("ui.NominaHoursSummary.errorAlGenerarElResumen", "Error al generar el resumen"),
        ))
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
        setPeriodo({
          label: p.label,
          periodType: p.periodType,
          from: p.from,
          to: p.to,
        });
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

  // The server's `label` comes in Spanish; translate from `periodType` and keep
  // the label only as a fallback for unknown types.
  const periodoNombre = periodo
    ? t(`ui.NominaHoursSummary.periodo.${periodo.periodType || "unknown"}`, {
        defaultValue: periodo.label.toLowerCase(),
      })
    : "";

  const closePeriod = async () => {
    if (
      !(await confirmDialog({
        title: t("ui.NominaHoursSummary.cerrarPeriodo", "Cerrar periodo"),
        message: t("ui.NominaHoursSummary.cerrarElPeriodoHasta", {
          to,
          defaultValue:
            "¿Cerrar el periodo hasta {{to}}? Los registros quedarán bloqueados (solo lectura).",
        }),
        confirmText: t("ui.NominaHoursSummary.cerrarPeriodo", "Cerrar periodo"),
        tone: "danger",
      }))
    )
      return;
    setClosing(true);
    try {
      const r = await attendanceService.closePeriod(limitesDelDia(to).end);

      toast.success(
        t("ui.NominaHoursSummary.periodoCerrado", {
          count: r.lockedCount,
          defaultValue: "Periodo cerrado · {{count}} registro(s) bloqueado(s)",
        }),
      );
    } catch (e) {
      toast.error(
        (e as { message?: string })?.message ||
          t("ui.NominaHoursSummary.errorAlCerrarElPeriodo", "Error al cerrar el periodo"),
      );
    } finally {
      setClosing(false);
    }
  };

  /**
   * Las tres salidas del resumen de horas, desde una sola tabla de columnas.
   *
   * Antes eran tres funciones separadas con tres listas de encabezados escritas
   * a mano, y ya se habían desincronizado: el CSV llevaba «Sin salida» y el PDF
   * no, así que el mismo periodo daba dos informes con distinto número de
   * columnas. Ahora la lista es una, y los tres archivos dicen lo mismo.
   */
  const COLUMNAS_EXPORT: {
    label: string;
    get: (r: SummaryRow) => string | number;
  }[] = [
    { label: t("comun.vigilante", "Vigilante"), get: (r) => r.guardName },
    { label: t("ui.NominaHoursSummary.diasTrabajados", "Días trabajados"), get: (r) => r.daysWorked ?? 0 },
    { label: t("ui.NominaHoursSummary.turnos", "Turnos"), get: (r) => r.shifts },
    { label: t("ui.NominaHoursSummary.horasRegulares", "Horas regulares"), get: (r) => Number(r.regularHours).toFixed(2) },
    { label: t("ui.NominaHoursSummary.horasExtra", "Horas extra"), get: (r) => Number(r.overtimeHours).toFixed(2) },
    { label: t("ui.NominaHoursSummary.horasTotales", "Horas totales"), get: (r) => Number(r.totalHours).toFixed(2) },
    { label: t("ui.NominaHoursSummary.tardanzas", "Tardanzas"), get: (r) => r.lateCount },
    { label: t("ui.NominaHoursSummary.sinSalida", "Sin salida"), get: (r) => r.missedClockouts },
    { label: t("ui.NominaHoursSummary.inasistencias", "Inasistencias"), get: (r) => r.noShows },
    { label: t("ui.NominaHoursSummary.correcciones", "Correcciones"), get: (r) => r.approvedCorrections },
  ];

  const exportar = async (format: ExportFormat) => {
    if (!rows.length) return;
    try {
      await exportMatrix(
        format,
        COLUMNAS_EXPORT.map((c) => c.label),
        rows.map((r) => COLUMNAS_EXPORT.map((c) => c.get(r))),
        {
          title: t("ui.NominaHoursSummary.resumenDeHoras", "Resumen de horas"),
          subtitle: t("ui.NominaHoursSummary.subtituloExport", {
            from,
            to,
            count: rows.length,
            defaultValue: "{{from}} a {{to}} · {{count}} persona(s)",
          }),
          fileBase: `horas-trabajadas-${from}_${to}`,
        },
        // Todo lo que no sea el nombre es un número: alineado a la derecha se
        // compara de un vistazo columna abajo.
        COLUMNAS_EXPORT.map((_, i) => (i === 0 ? "left" : "right")),
      );
      toast.success(
        t("ui.NominaHoursSummary.filasExportadas", {
          count: rows.length,
          defaultValue: "{{count}} fila(s) exportada(s)",
        }),
      );
    } catch (e) {
      console.error("export horas", e);
      toast.error(
        t("ui.NominaHoursSummary.noSePudoGenerarElArchivo", "No se pudo generar el archivo"),
      );
    }
  };

  const columns: Column<SummaryRow>[] = [
    {
      key: "guardName",
      header: t("comun.vigilante", "Vigilante"),
      render: (_v, r) => (
        <span className="inline-flex items-center gap-1.5">
          {r.guardName}
          {r.role === "supervisor" && (
            <StatusBadge dot={false} tone="warn">
              {t("comun.supervisor", "Supervisor")}
            </StatusBadge>
          )}
          {r.role === "administrative" && (
            <StatusBadge dot={false} tone="info">
              {t("ui.NominaHoursSummary.administrativo", "Administrativo")}
            </StatusBadge>
          )}
        </span>
      ),
    },
    {
      key: "daysWorked",
      header: t("ui.NominaHoursSummary.diasTrabajados", "Días trabajados"),
      render: (_v, r) => <Num strong v={r.daysWorked ?? 0} />,
    },
    {
      key: "shifts",
      header: t("ui.NominaHoursSummary.turnos", "Turnos"),
      render: (_v, r) => <Num v={r.shifts} />,
    },
    {
      key: "regularHours",
      header: t("ui.NominaHoursSummary.hRegulares", "H. regulares"),
      render: (_v, r) => <Num v={r.regularHours.toFixed(2)} />,
    },
    {
      key: "overtimeHours",
      header: t("ui.NominaHoursSummary.hExtra", "H. extra"),
      render: (_v, r) => (
        <Num
          tone={r.overtimeHours > 0 ? "warn" : undefined}
          v={r.overtimeHours.toFixed(2)}
        />
      ),
    },
    {
      key: "totalHours",
      header: t("ui.NominaHoursSummary.hTotales", "H. totales"),
      render: (_v, r) => <Num strong v={r.totalHours.toFixed(2)} />,
    },
    {
      key: "lateCount",
      header: t("ui.NominaHoursSummary.tardanzas", "Tardanzas"),
      render: (_v, r) => (
        <Num tone={r.lateCount > 0 ? "warn" : undefined} v={r.lateCount} />
      ),
    },
    {
      key: "noShows",
      header: t("ui.NominaHoursSummary.inasistencias", "Inasistencias"),
      render: (_v, r) => (
        <Num tone={r.noShows > 0 ? "bad" : undefined} v={r.noShows} />
      ),
    },
    {
      key: "approvedCorrections",
      header: t("ui.NominaHoursSummary.correcciones", "Correcciones"),
      render: (_v, r) => <Num v={r.approvedCorrections} />,
    },
  ];

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          icon={<Clock />}
          subtitle={
            periodo
              ? t("ui.NominaHoursSummary.subtituloConPeriodo", {
                  periodo: periodoNombre,
                  defaultValue:
                    "Días trabajados y horas por persona · periodo {{periodo}}",
                })
              : t(
                  "ui.NominaHoursSummary.diasTrabajadosYHorasPorPersona",
                  "Días trabajados y horas por persona en el periodo",
                )
          }
          title={t("ui.NominaHoursSummary.resumenDeHoras", "Resumen de horas")}
        />

        {/* Barra: rango de fechas (izquierda) · exportar y acciones (derecha) */}
        <Toolbar className="justify-between gap-3 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="cg-eyebrow">
              {t("comun.desde", "Desde")}
              <input
                className="cg-input cg-focus mt-1 block px-3 py-1.5 text-sm tabular-nums"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="cg-eyebrow">
              {t("comun.hasta", "Hasta")}
              <input
                className="cg-input cg-focus mt-1 block px-3 py-1.5 text-sm tabular-nums"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <Button disabled={loading} variant="brand" onClick={load}>
              {loading
                ? t("ui.NominaHoursSummary.generando", "Generando…")
                : t("ui.NominaHoursSummary.generar", "Generar")}
            </Button>
            {/* El periodo que la empresa configuró. Antes esta pantalla abría
                siempre en 14 días fijos, así que el ajuste no se notaba en
                ningún sitio y no había forma de volver al corte real después de
                mirar otras fechas. */}
            {periodo && (from !== periodo.from || to !== periodo.to) && (
              <Button
                size="sm"
                title={`${periodo.from} → ${periodo.to}`}
                variant="ghost"
                onClick={() => {
                  setFrom(periodo.from);
                  setTo(periodo.to);
                }}
              >
                {t("ui.NominaHoursSummary.volverAlPeriodo", {
                  periodo: periodoNombre,
                  defaultValue: "Volver al periodo {{periodo}}",
                })}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Tres botones seguidos ocupaban toda la barra en un teléfono y
                empujaban «Cerrar periodo» a una línea suya. Uno solo, y el
                formato se elige dentro. */}
            <ExportMenu disabled={!rows.length} size="sm" onExport={exportar} />
            <Button
              disabled={closing}
              size="sm"
              variant="destructive"
              onClick={closePeriod}
            >
              <Lock className="mr-1.5 h-4 w-4" />{" "}
              {closing
                ? t("ui.NominaExceptions.cerrando", "Cerrando…")
                : t("ui.NominaHoursSummary.cerrarPeriodo", "Cerrar periodo")}
            </Button>
          </div>
        </Toolbar>

        {totals && (
          <StatsStrip className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricTile
              hint={t(
                "ui.NominaHoursSummary.turnosConMarcacionEnElPeriodo",
                "Turnos con marcación en el periodo",
              )}
              icon={<CalendarDays />}
              label={t("ui.NominaHoursSummary.turnos", "Turnos")}
              value={totals.shifts}
            />
            <MetricTile
              hint={t("ui.NominaHoursSummary.sumaDeHorasTrabajadas", "Suma de horas trabajadas")}
              icon={<Clock />}
              label={t("ui.NominaHoursSummary.horasTotales", "Horas totales")}
              value={Number(totals.totalHours).toFixed(2)}
            />
            <MetricTile
              delta={
                totals.totalHours > 0
                  ? {
                      value: `${((totals.overtimeHours / totals.totalHours) * 100).toFixed(1)} %`,
                      direction: totals.overtimeHours > 0 ? "up" : "flat",
                    }
                  : undefined
              }
              hint={t("ui.NominaHoursSummary.sobreElTotalDeHoras", "Sobre el total de horas")}
              icon={<Timer />}
              label={t("ui.NominaHoursSummary.horasExtra", "Horas extra")}
              value={Number(totals.overtimeHours).toFixed(2)}
            />
            <MetricTile
              hint={t("ui.NominaHoursSummary.incidenciasDePuntualidad", "Incidencias de puntualidad")}
              icon={<UserX />}
              label={t("ui.NominaHoursSummary.tardanzasInasist", "Tardanzas / Inasist.")}
              value={`${totals.lateCount} / ${totals.noShows}`}
            />
          </StatsStrip>
        )}

        <Section icon={<Clock />} title={t("ui.NominaHoursSummary.detallePorPersona", "Detalle por persona")}>
          <div className="overflow-x-auto">
            <DataTable
              columns={columns}
              data={rows}
              emptyState={
                <EmptyState
                  description={t(
                    "ui.NominaHoursSummary.eligeOtroRangoDeFechas",
                    "Elige otro rango de fechas y vuelve a generar el resumen.",
                  )}
                  icon={<Clock />}
                  title={t(
                    "ui.NominaHoursSummary.sinDatosEnElRango",
                    "Sin datos en el rango",
                  )}
                />
              }
            />
          </div>
        </Section>
      </PageContainer>
    </AppLayout>
  );
}
