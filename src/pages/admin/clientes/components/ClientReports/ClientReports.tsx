import type { Client } from "@/types/client";
import type { ExportFormat } from "@/lib/export/reportExport";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  TrendingUp,
  TrendingDown,
  Search,
  AlertTriangle,
  Route as RouteIcon,
  Users,
  MapPin,
  Clock,
  ShieldCheck,
  FileBarChart,
  CalendarClock,
  Plus,
  Trash2,
  Download,
  RefreshCw,
  FileText,
  UserCheck,
} from "lucide-react";

import {
  FIELD_CLS,
  LabeledField,
  TabTable,
  THead,
  Th,
  Tr,
  RowAction,
  Pager,
  TabFooter,
  TabLoading,
} from "../_shared/tab-kit";

import { clientDisplayName } from "@/lib/clientName";
import useScrollToTopOnMount from "@/hooks/useScrollToTopOnMount";
import { clientService } from "@/lib/api/clientService";
import {
  Section,
  EmptyState,
  StatusBadge,
  Modal,
  GlassPanel,
  IconTile,
  Segmented,
  SearchInput,
} from "@/components/kit";
import { Sparkline, Donut, AreaChart, MeterBar } from "@/components/charts";
import { CHART_VARS, alphaVar, rampVar } from "@/lib/chartColors";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { localeActual } from "@/lib/localeActual";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";
// ── Shape of GET /client-account/:id/reports (clientAccountReports.ts) ──
interface ReportKpi {
  key: string;
  label: string;
  value: number | null;
  deltaPct: number;
  invert?: boolean;
  spark: number[];
  tone: string;
  unit?: string;
  isTime?: boolean;
}
interface Cumplimiento {
  pct: number | null;
  cumplidos: number;
  parciales: number;
  incumplidos: number;
  cumplidosPct: number;
  parcialesPct: number;
  incumplidosPct: number;
  total: number;
  hasData: boolean;
}
interface IncidentePorTipo {
  type: string;
  count: number;
  pct: number;
}
interface IncidentePorEstado {
  key: string;
  label: string;
  count: number;
  pct: number;
}
interface ActividadDia {
  date: string;
  value: number;
}
interface QuickReport {
  key: string;
  label: string;
}
interface ProgramadoRow {
  id: string;
  name: string;
  cron: string;
  active: boolean;
  frequency: string | null;
  nextRunAt: string | null;
  params: Record<string, unknown>;
}
interface ReportRow {
  id: string;
  code: string;
  name: string;
  sede: string;
  puesto: string | null;
  generadoPor: string;
  fecha: string | null;
  tipo: string;
  formato: string;
}
interface ReportsData {
  period: { from: string; to: string };
  tz: string;
  kpis: ReportKpi[];
  cumplimiento: Cumplimiento;
  incidentesPorTipo: IncidentePorTipo[];
  incidentesTotal: number;
  incidentesPorEstado: IncidentePorEstado[];
  actividadesPorDia: ActividadDia[];
  quickReports: QuickReport[];
  programados: ProgramadoRow[];
  reportsList: ReportRow[];
  reportsTotal: number;
  updatedAt: string;
}

/**
 * El `tone` que manda el backend por cada KPI, traducido al sistema.
 *
 * Rojo/ámbar/verde siguen siendo semánticos —un incidente tiene que verse como
 * un incidente aunque el acento sea rojo—, y lo que antes era azul o violeta
 * (dos colores sin significado propio) pasa a ser un escalón del acento.
 */
const TONE_VAR: Record<string, string> = {
  red: CHART_VARS.bad,
  green: CHART_VARS.ok,
  orange: CHART_VARS.warn,
  blue: CHART_VARS.series[0],
  violet: CHART_VARS.series[1],
};
const toneVar = (t: string) => TONE_VAR[t] || CHART_VARS.series[0];

const QUICK_ICON: Record<string, LucideIcon> = {
  incidents: AlertTriangle,
  rounds: RouteIcon,
  visitors: UserCheck,
  attendance: Users,
  coverage: MapPin,
  "guard-activity": Users,
};
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDT = (iso: string) => {
  const d = new Date(iso);

  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(localeActual(), {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};
const fmtD = (iso: string) => {
  const d = new Date(iso);

  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(localeActual(), { timeZone: zonaDeLaEmpresa(),
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
};

/** Actividad diaria — la serie temporal de la pestaña. */
function ActividadChart({
  data,
}: {
  data: Array<{ date: string; value: number }>;
}) {
  const { t } = useTranslation();

  if (!data || data.length < 2)
    return (
      <EmptyState
        description={t(
          "ui.ClientReports.noHayActividadEnEl",
          "No hay actividad en el período.",
        )}
        icon={<FileBarChart className="h-5 w-5" />}
        title={t("comun.sinDatos")}
      />
    );
  const dia = (iso: string) =>
    new Date(iso).toLocaleDateString(localeActual(), { timeZone: zonaDeLaEmpresa(),
      day: "2-digit",
      month: "short",
    });

  return (
    <AreaChart
      ariaLabel="Actividades por día"
      data={data.map((d) => ({ label: dia(d.date), value: d.value }))}
      formatValue={(v) => `${v.toLocaleString(localeActual())} actividades`}
      height={190}
    />
  );
}

function Kpi({ icon, k }: { icon: ReactNode; k: ReportKpi }) {
  const { t } = useTranslation();
  const up = (k.deltaPct || 0) >= 0;
  const good = k.invert ? !up : up; // for incidents/response, up is bad
  const val =
    k.isTime && k.value != null
      ? `${Math.floor(k.value / 60)
          .toString()
          .padStart(2, "0")}:${(k.value % 60).toString().padStart(2, "0")}`
      : (k.value ?? 0).toLocaleString(localeActual());

  return (
    <GlassPanel flat className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs text-muted-foreground truncate">{k.label}</div>
        <span
          className={`grid h-7 w-7 place-items-center rounded-lg [&_svg]:size-3.5`}
          style={{
            background: alphaVar(toneVar(k.tone), 15),
            color: toneVar(k.tone),
          }}
        >
          {icon}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-2xl font-bold leading-none">
          {val}
          {k.unit ? (
            <span className="ml-1 text-sm font-medium text-muted-foreground">
              {k.unit}
            </span>
          ) : (
            ""
          )}
        </span>
        {k.deltaPct != null && k.deltaPct !== 0 && (
          <span
            className="inline-flex items-center gap-0.5 text-xs font-medium"
            style={{ color: good ? "var(--ok-text)" : "var(--bad-text)" }}
          >
            {up ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {Math.abs(k.deltaPct)}%
          </span>
        )}
      </div>
      <div className="mt-1.5">
        <Sparkline
          ariaLabel={`Tendencia de ${k.label}`}
          color={toneVar(k.tone)}
          data={k.spark || []}
        />
      </div>
      <div className="text-[11px] text-muted-foreground">
        {t("ui.ClientReports.vsPeriodoAnterior", "Vs. período anterior")}
      </div>
    </GlassPanel>
  );
}

export default function ClientReports({
  client,
}: {
  client: Client & { companyName?: string };
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useScrollToTopOnMount(containerRef);

  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(
    ymd(new Date(today.getTime() - 30 * 24 * 3600 * 1000)),
  );
  const [to, setTo] = useState(ymd(today));
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 8;
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState("");

  const [schedOpen, setSchedOpen] = useState(false);
  const [schedForm, setSchedForm] = useState({
    name: "",
    type: "incidents",
    frequency: "weekly",
  });
  const [saving, setSaving] = useState(false);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const d = await clientService.getClientReports(client.id, {
        from,
        to,
        q: q.trim() || undefined,
        page,
        perPage,
      });

      setData(d);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => load(), 250);

    return () => clearTimeout(t);
  }, [from, to, q, page, client.id]);

  const kpis: ReportKpi[] = data?.kpis || [];
  const cumplimiento: Partial<Cumplimiento> = data?.cumplimiento || {};
  const porTipo: IncidentePorTipo[] = data?.incidentesPorTipo || [];
  const porEstado: IncidentePorEstado[] = data?.incidentesPorEstado || [];
  const actividades: ActividadDia[] = data?.actividadesPorDia || [];
  const quickReports: QuickReport[] = data?.quickReports || [];
  const programados: ProgramadoRow[] = data?.programados || [];
  const reportsList: ReportRow[] = data?.reportsList || [];
  const reportsTotal = data?.reportsTotal ?? 0;
  const pageCount = Math.max(1, Math.ceil(reportsTotal / perPage));
  const fmtUpdated = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleString(localeActual(), { timeZone: zonaDeLaEmpresa(),
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const KPI_ICONS: Record<string, ReactNode> = {
    incidentes: <AlertTriangle />,
    rondas: <RouteIcon />,
    asistencias: <Users />,
    checkpoints: <MapPin />,
    respuesta: <Clock />,
  };

  /**
   * El formato de los reportes rápidos, elegido UNA vez para las cuatro filas.
   *
   * Se pone arriba y no dentro de cada fila a propósito: cada fila ya es un
   * botón que descarga, y meterle un menú a cada una convertiría una lista de
   * cuatro atajos en una lista de cuatro menús. Quien exporta aquí baja los
   * cuatro informes del mismo periodo, y los quiere en el mismo formato.
   *
   * PDF por defecto: éste es el informe que se le manda al CLIENTE, y lo que se
   * adjunta a un correo es un PDF. El CSV que salía antes obligaba al
   * destinatario a abrirlo y darle formato para poder leerlo.
   */
  const [formato, setFormato] = useState<ExportFormat>("pdf");

  const doExport = async (type: string) => {
    setExporting(type);
    try {
      await clientService.exportClientReport(
        client.id,
        type,
        from,
        to,
        formato,
      );
      toast.success(t("ui.ClientReports.exportacionDescargada"));
    } catch {
      toast.error(t("ui.ClientReports.noSePudoExportar"));
    } finally {
      setExporting("");
    }
  };
  const saveSchedule = async () => {
    setSaving(true);
    try {
      await clientService.createReportSchedule(client.id, schedForm);
      toast.success(t("ui.ClientReports.reporteProgramado"));
      setSchedOpen(false);
      setSchedForm({ name: "", type: "incidents", frequency: "weekly" });
      await load(true);
    } catch {
      toast.error(t("ui.ClientReports.noSePudoProgramar"));
    } finally {
      setSaving(false);
    }
  };
  const delSchedule = async (s: ProgramadoRow) => {
    if (
      !(await confirmDialog({
        message: `¿Eliminar "${s.name}"?`,
        tone: "danger",
      }))
    )
      return;
    try {
      await clientService.deleteReportSchedule(client.id, s.id);
      await load(true);
    } catch {
      toast.error(t("comun.noSePudoEliminar"));
    }
  };

  if (loading && !data) return <TabLoading />;

  return (
    <div ref={containerRef} className="space-y-4">
      {/* Date range */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-medium text-muted-foreground">
            {t("ui.ClientReports.periodo", "Período")}
          </span>
          <input
            className={`${FIELD_CLS} w-auto`}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <span className="text-muted-foreground">–</span>
          <input
            className={`${FIELD_CLS} w-auto`}
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <Button size="sm" variant="brand" onClick={() => setSchedOpen(true)}>
          <CalendarClock className="mr-1.5 h-4 w-4" />{" "}
          {t("ui.ClientReports.programarReporte")}
        </Button>
      </div>

      {/* KPI row + cumplimiento */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
        {kpis.map((k) => (
          <Kpi key={k.key} icon={KPI_ICONS[k.key] || <FileBarChart />} k={k} />
        ))}
        <GlassPanel
          flat
          className="p-4 sm:col-span-2 lg:col-span-3 xl:col-span-2"
        >
          <div className="mb-2 text-xs text-muted-foreground">
            {t(
              "ui.ClientReports.cumplimientoDeEstaciones",
              "Cumplimiento de estaciones",
            )}
          </div>
          {cumplimiento.hasData === false ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Donut centerBottom="Sin datos" centerTop="—" segments={[]} />
              <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                {t(
                  "ui.ClientReports.noHayTurnosProgramadosNi",
                  "No hay turnos programados ni asistencias en el período.",
                )}
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {/* Cumplido / parcial / incumplido es un ESTADO: verde, ámbar y rojo semánticos. */}
              <Donut
                centerBottom="Cumplim."
                centerTop={`${cumplimiento.pct ?? 0}%`}
                segments={[
                  {
                    value: cumplimiento.cumplidos || 0,
                    tone: "ok",
                    label: "Cumplidos",
                  },
                  {
                    value: cumplimiento.parciales || 0,
                    tone: "warn",
                    label: "Parciales",
                  },
                  {
                    value: cumplimiento.incumplidos || 0,
                    tone: "bad",
                    label: "Incumplidos",
                  },
                ]}
              />
              <div className="min-w-0 flex-1 space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: CHART_VARS.ok }}
                  />
                  <span className="truncate">Cumplidos</span>
                  <b className="ml-auto tabular-nums">
                    {cumplimiento.cumplidosPct ?? 0}%
                  </b>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: CHART_VARS.warn }}
                  />
                  <span className="truncate">Parciales</span>
                  <b className="ml-auto tabular-nums">
                    {cumplimiento.parcialesPct ?? 0}%
                  </b>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: CHART_VARS.bad }}
                  />
                  <span className="truncate">Incumplidos</span>
                  <b className="ml-auto tabular-nums">
                    {cumplimiento.incumplidosPct ?? 0}%
                  </b>
                </div>
              </div>
            </div>
          )}
        </GlassPanel>
      </div>

      {/* Gráficos + columna derecha */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2.2fr_1fr]">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Section
            icon={<AlertTriangle className="h-4 w-4" />}
            title={t("ui.ClientReports.incidentesPorTipo")}
          >
            {porTipo.length === 0 ? (
              <EmptyState
                description={t(
                  "ui.ClientReports.noHayIncidentesEnEl",
                  "No hay incidentes en el período.",
                )}
                icon={<AlertTriangle className="h-5 w-5" />}
                title={t("comun.sinIncidentes")}
              />
            ) : (
              <div className="flex items-center gap-3">
                {/* Los tipos vienen ordenados por frecuencia: una rampa del acento
                    hacia el gris lo dice mejor que siete colores sin relación, y
                    admite tantos tipos como haya sin inventar tonos nuevos. */}
                <Donut
                  centerBottom="Total"
                  centerTop={String(data?.incidentesTotal ?? 0)}
                  segments={porTipo.map((t, i) => ({
                    value: t.count,
                    color: rampVar(i, porTipo.length),
                    label: t.type,
                  }))}
                />
                <div className="flex-1 space-y-1.5 text-xs">
                  {porTipo.slice(0, 6).map((t, i) => (
                    <div key={t.type} className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: rampVar(i, porTipo.length) }}
                      />
                      <span className="truncate">{t.type}</span>
                      <span className="ml-auto tabular-nums text-muted-foreground">
                        {t.count} ({t.pct}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          <Section
            icon={<ShieldCheck className="h-4 w-4" />}
            title={t("ui.ClientReports.incidentesPorEstado")}
          >
            {porEstado.every((e) => e.count === 0) ? (
              <EmptyState
                description={t(
                  "ui.ClientReports.noHayIncidentesEnEl2",
                  "No hay incidentes en el período.",
                )}
                icon={<ShieldCheck className="h-5 w-5" />}
                title={t("comun.sinIncidentes")}
              />
            ) : (
              <div className="space-y-3 pt-1">
                {porEstado.map((e) => (
                  <div key={e.key}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{e.label}</span>
                      <span className="tabular-nums text-xs">
                        {e.count} ({e.pct}%)
                      </span>
                    </div>
                    <MeterBar
                      ariaLabel={e.label}
                      height={8}
                      pct={e.pct}
                      tone={
                        e.key === "resuelto"
                          ? "ok"
                          : e.key === "investigacion"
                            ? "info"
                            : "bad"
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section
            icon={<TrendingUp className="h-4 w-4" />}
            title={t(
              "ui.ClientReports.actividadesPorDia",
              "Actividades por día",
            )}
          >
            <ActividadChart data={actividades} />
          </Section>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <Section
            icon={<Search className="h-4 w-4" />}
            title="Filtros aplicados"
          >
            <div className="flex flex-wrap gap-2">
              <StatusBadge dot={false} tone="neutral">
                Período: {fmtD(from)} – {fmtD(to)}
              </StatusBadge>
              <StatusBadge dot={false} tone="neutral">
                Cliente: {clientDisplayName(client, "Cliente")}
              </StatusBadge>
            </div>
          </Section>

          <Section
            action={
              <Segmented
                options={[
                  { value: "pdf", label: "PDF" },
                  { value: "excel", label: "Excel" },
                  { value: "csv", label: "CSV" },
                ]}
                value={formato}
                onChange={(v) => setFormato(v as ExportFormat)}
              />
            }
            icon={<FileBarChart className="h-4 w-4" />}
            title={t("ui.ClientReports.reportesRapidos", "Reportes rápidos")}
          >
            <div className="space-y-1">
              {quickReports.map((r) => {
                const Icon = QUICK_ICON[r.key] || FileText;

                return (
                  <button
                    key={r.key}
                    className="cg-focus flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
                    disabled={!!exporting}
                    onClick={() => doExport(r.key)}
                  >
                    <IconTile size="sm">
                      <Icon />
                    </IconTile>
                    <span className="flex-1">{r.label}</span>
                    {exporting === r.key ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : (
                      <Download className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section
            action={
              <button
                className="cg-focus inline-flex items-center gap-1 rounded-md text-xs font-semibold hover:underline"
                style={{ color: "var(--brand-text)" }}
                onClick={() => setSchedOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" /> Programar
              </button>
            }
            icon={<CalendarClock className="h-4 w-4" />}
            title="Reportes programados"
          >
            {programados.length === 0 ? (
              <EmptyState
                description={t(
                  "ui.ClientReports.programaUnReporteRecurrentePor",
                )}
                icon={<CalendarClock className="h-5 w-5" />}
                title={t("ui.ClientReports.sinReportesProgramados")}
              />
            ) : (
              <div className="divide-y">
                {programados.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-start justify-between gap-2 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {s.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.frequency || s.cron}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <StatusBadge
                        dot={false}
                        tone={s.active ? "ok" : "neutral"}
                      >
                        {s.active ? "Activo" : "Pausado"}
                      </StatusBadge>
                      <RowAction
                        title={t(
                          "ui.ClientReports.eliminarProgramacion",
                          "Eliminar programación",
                        )}
                        tone="bad"
                        onClick={() => delSchedule(s)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </RowAction>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>

      {/* Todos los reportes */}
      <Section
        icon={<FileText className="h-4 w-4" />}
        title={t("ui.ClientReports.todosLosReportes")}
      >
        <SearchInput
          className="mb-3 max-w-sm"
          placeholder={t("ui.ClientReports.buscarReportePorNombre")}
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
        />
        {reportsList.length === 0 ? (
          <EmptyState
            description={t(
              "ui.ClientReports.aunNoHayReportesOperativos",
              "Aún no hay reportes operativos generados para este cliente en el período.",
            )}
            icon={<FileText className="h-5 w-5" />}
            title={t("ui.ClientReports.sinReportes")}
          />
        ) : (
          <TabTable>
            <THead>
              <Th>{t("ui.ClientReports.nombreDelReporte")}</Th>
              <Th>{t("comun.tipo")}</Th>
              <Th>{t("ui.ClientReports.sedeEstacion", "Sede / Estación")}</Th>
              <Th>{t("ui.ClientReports.generadoPor")}</Th>
              <Th>{t("ui.ClientReports.generadoEl")}</Th>
              <Th>Formato</Th>
            </THead>
            <tbody>
              {reportsList.map((r) => (
                <Tr key={r.id}>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2">
                      <IconTile size="sm">
                        <FileText />
                      </IconTile>
                      <div>
                        <div className="max-w-[220px] truncate font-medium">
                          {r.name}
                        </div>
                        <div
                          className="text-xs"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          {r.code}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    <StatusBadge dot={false} tone="neutral">
                      {r.tipo}
                    </StatusBadge>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="truncate max-w-[150px]">{r.sede}</div>
                    {r.puesto && r.puesto !== r.sede && (
                      <div className="text-xs text-muted-foreground truncate max-w-[150px]">
                        {r.puesto}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2.5 truncate max-w-[130px]">
                    {r.generadoPor}
                  </td>
                  <td className="px-2 py-2.5 tabular-nums text-xs">
                    {r.fecha ? fmtDT(r.fecha) : "—"}
                  </td>
                  <td className="px-2 py-2.5">{r.formato}</td>
                </Tr>
              ))}
            </tbody>
          </TabTable>
        )}
        <Pager
          noun="reportes"
          page={page}
          pageCount={pageCount}
          perPage={perPage}
          total={reportsTotal}
          onPage={setPage}
        />
      </Section>

      <TabFooter
        icon={<FileBarChart />}
        note="Las métricas se calculan sobre la operación real del cliente en el período seleccionado."
        updatedAt={fmtUpdated}
        onRefresh={() => load()}
      />

      {/* Schedule modal */}
      <Modal
        footer={
          <>
            <Button
              disabled={saving}
              variant="outline"
              onClick={() => setSchedOpen(false)}
            >
              {t("actions.cancel")}
            </Button>
            <Button
              disabled={saving || !schedForm.name.trim()}
              onClick={saveSchedule}
            >
              {saving ? "Guardando…" : "Programar"}
            </Button>
          </>
        }
        icon={<CalendarClock className="h-5 w-5" />}
        open={schedOpen}
        title={t("ui.ClientReports.programarReporte")}
        onOpenChange={(o) => {
          if (!saving) setSchedOpen(o);
        }}
      >
        <div className="space-y-3">
          <LabeledField label={t("comun.nombre")}>
            <input
              className={FIELD_CLS}
              placeholder={t("ui.ClientReports.informeSemanalDeOperaciones")}
              value={schedForm.name}
              onChange={(e) =>
                setSchedForm({ ...schedForm, name: e.target.value })
              }
            />
          </LabeledField>
          <LabeledField label={t("ui.ClientReports.reporte")}>
            <select
              className={FIELD_CLS}
              value={schedForm.type}
              onChange={(e) =>
                setSchedForm({ ...schedForm, type: e.target.value })
              }
            >
              <option value="incidents">
                {t("ui.ClientReports.reporteDeIncidentes")}
              </option>
              <option value="rounds">
                {t("ui.ClientReports.reporteDeRondas")}
              </option>
              <option value="visitors">
                {t("ui.ClientReports.reporteDeVisitas")}
              </option>
              <option value="attendance">
                {t("ui.ClientReports.reporteDeAsistencia")}
              </option>
              <option value="coverage">
                {t(
                  "ui.ClientReports.cumplimientoDeEstaciones",
                  "Cumplimiento de estaciones",
                )}
              </option>
              <option value="guard-activity">
                {t("ui.ClientReports.actividadPorGuardia")}
              </option>
            </select>
          </LabeledField>
          <LabeledField label="Frecuencia">
            <select
              className={FIELD_CLS}
              value={schedForm.frequency}
              onChange={(e) =>
                setSchedForm({ ...schedForm, frequency: e.target.value })
              }
            >
              <option value="daily">Diario (07:00)</option>
              <option value="weekly">
                {t("ui.ClientReports.semanalLunes0800")}
              </option>
              <option value="monthly">
                {t(
                  "ui.ClientReports.mensualDia10900",
                  "Mensual (día 1, 09:00)",
                )}
              </option>
            </select>
          </LabeledField>
        </div>
      </Modal>
    </div>
  );
}
