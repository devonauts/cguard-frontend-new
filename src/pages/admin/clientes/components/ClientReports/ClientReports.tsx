import { useEffect, useMemo, useRef, useState } from 'react';
import { clientDisplayName } from '@/lib/clientName';
import type { Client } from '@/types/client';
import useScrollToTopOnMount from '@/hooks/useScrollToTopOnMount';
import { clientService } from '@/lib/api/clientService';
import { Section, EmptyState, StatusBadge, Modal, GlassPanel, IconTile } from '@/components/kit';
import {
  FIELD_CLS, LabeledField, TabTable, THead, Th, Tr, RowAction, Pager, TabFooter, TabLoading,
} from '../_shared/tab-kit';
import { Sparkline, Donut, AreaChart, MeterBar } from '@/components/charts';
import { CHART_VARS, alphaVar, rampVar } from '@/lib/chartColors';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  TrendingUp, TrendingDown, Search, AlertTriangle, Route as RouteIcon, Users, MapPin, Clock,
  ShieldCheck, FileBarChart, CalendarClock, Plus, Trash2, Download, RefreshCw, FileText, UserCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

// ── Shape of GET /client-account/:id/reports (clientAccountReports.ts) ──
interface ReportKpi {
  key: string; label: string; value: number | null; deltaPct: number;
  invert?: boolean; spark: number[]; tone: string; unit?: string; isTime?: boolean;
}
interface Cumplimiento {
  pct: number | null; cumplidos: number; parciales: number; incumplidos: number;
  cumplidosPct: number; parcialesPct: number; incumplidosPct: number; total: number; hasData: boolean;
}
interface IncidentePorTipo { type: string; count: number; pct: number; }
interface IncidentePorEstado { key: string; label: string; count: number; pct: number; }
interface ActividadDia { date: string; value: number; }
interface QuickReport { key: string; label: string; }
interface ProgramadoRow { id: string; name: string; cron: string; active: boolean; frequency: string | null; nextRunAt: string | null; params: Record<string, unknown>; }
interface ReportRow { id: string; code: string; name: string; sede: string; puesto: string | null; generadoPor: string; fecha: string | null; tipo: string; formato: string; }
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

const QUICK_ICON: Record<string, LucideIcon> = { incidents: AlertTriangle, rounds: RouteIcon, visitors: UserCheck, attendance: Users, coverage: MapPin, 'guard-activity': Users };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtDT = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const fmtD = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' }); };

/** Actividad diaria — la serie temporal de la pestaña. */
function ActividadChart({ data }: { data: Array<{ date: string; value: number }> }) {
  if (!data || data.length < 2) return <EmptyState icon={<FileBarChart className="h-5 w-5" />} title="Sin datos" description="No hay actividad en el período." />;
  const dia = (iso: string) => new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short' });
  return (
    <AreaChart
      height={190}
      ariaLabel="Actividades por día"
      data={data.map((d) => ({ label: dia(d.date), value: d.value }))}
      formatValue={(v) => `${v.toLocaleString('es-EC')} actividades`}
    />
  );
}

function Kpi({ icon, k }: { icon: ReactNode; k: ReportKpi }) {
  const up = (k.deltaPct || 0) >= 0;
  const good = k.invert ? !up : up; // for incidents/response, up is bad
  const val = k.isTime && k.value != null ? `${Math.floor(k.value / 60).toString().padStart(2, '0')}:${(k.value % 60).toString().padStart(2, '0')}` : (k.value ?? 0).toLocaleString('es-EC');
  return (
    <GlassPanel flat className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs text-muted-foreground truncate">{k.label}</div>
        <span className={`grid h-7 w-7 place-items-center rounded-lg [&_svg]:size-3.5`} style={{ background: alphaVar(toneVar(k.tone), 15), color: toneVar(k.tone) }}>{icon}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-2xl font-bold leading-none">{val}{k.unit ? <span className="ml-1 text-sm font-medium text-muted-foreground">{k.unit}</span> : ''}</span>
        {k.deltaPct != null && k.deltaPct !== 0 && (
          <span className="inline-flex items-center gap-0.5 text-xs font-medium" style={{ color: good ? 'var(--ok-text)' : 'var(--bad-text)' }}>{up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{Math.abs(k.deltaPct)}%</span>
        )}
      </div>
      <div className="mt-1.5"><Sparkline data={k.spark || []} color={toneVar(k.tone)} ariaLabel={`Tendencia de ${k.label}`} /></div>
      <div className="text-[11px] text-muted-foreground">Vs. período anterior</div>
    </GlassPanel>
  );
}

export default function ClientReports({ client }: { client: Client & { companyName?: string } }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useScrollToTopOnMount(containerRef);

  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(ymd(new Date(today.getTime() - 30 * 24 * 3600 * 1000)));
  const [to, setTo] = useState(ymd(today));
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 8;
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState('');

  const [schedOpen, setSchedOpen] = useState(false);
  const [schedForm, setSchedForm] = useState({ name: '', type: 'incidents', frequency: 'weekly' });
  const [saving, setSaving] = useState(false);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try { const d = await clientService.getClientReports(client.id, { from, to, q: q.trim() || undefined, page, perPage }); setData(d); }
    catch { /* silent */ } finally { setLoading(false); }
  };
  useEffect(() => { const t = setTimeout(() => load(), 250); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [from, to, q, page, client.id]);

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
  const fmtUpdated = data?.updatedAt ? new Date(data.updatedAt).toLocaleString('es-EC', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

  const KPI_ICONS: Record<string, ReactNode> = { incidentes: <AlertTriangle />, rondas: <RouteIcon />, asistencias: <Users />, checkpoints: <MapPin />, respuesta: <Clock /> };

  const doExport = async (type: string) => {
    setExporting(type);
    try { await clientService.exportClientReport(client.id, type, from, to); toast.success('Exportación descargada'); }
    catch { toast.error('No se pudo exportar'); } finally { setExporting(''); }
  };
  const saveSchedule = async () => {
    setSaving(true);
    try { await clientService.createReportSchedule(client.id, schedForm); toast.success('Reporte programado'); setSchedOpen(false); setSchedForm({ name: '', type: 'incidents', frequency: 'weekly' }); await load(true); }
    catch { toast.error('No se pudo programar'); } finally { setSaving(false); }
  };
  const delSchedule = async (s: ProgramadoRow) => { if (!window.confirm(`¿Eliminar "${s.name}"?`)) return; try { await clientService.deleteReportSchedule(client.id, s.id); await load(true); } catch { toast.error('No se pudo eliminar'); } };

  if (loading && !data) return <TabLoading />;

  return (
    <div ref={containerRef} className="space-y-4">
      {/* Date range */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm"><span className="text-xs font-medium text-muted-foreground">Período</span>
          <input type="date" className={`${FIELD_CLS} w-auto`} value={from} onChange={(e) => setFrom(e.target.value)} /><span className="text-muted-foreground">–</span>
          <input type="date" className={`${FIELD_CLS} w-auto`} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button size="sm" variant="brand" onClick={() => setSchedOpen(true)}><CalendarClock className="mr-1.5 h-4 w-4" /> Programar reporte</Button>
      </div>

      {/* KPI row + cumplimiento */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
        {kpis.map((k) => <Kpi key={k.key} k={k} icon={KPI_ICONS[k.key] || <FileBarChart />} />)}
        <GlassPanel flat className="p-4 sm:col-span-2 lg:col-span-3 xl:col-span-2">
          <div className="mb-2 text-xs text-muted-foreground">Cumplimiento de estaciones</div>
          {cumplimiento.hasData === false ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Donut segments={[]} centerTop="—" centerBottom="Sin datos" />
              <p className="min-w-0 flex-1 text-xs text-muted-foreground">No hay turnos programados ni asistencias en el período.</p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {/* Cumplido / parcial / incumplido es un ESTADO: verde, ámbar y rojo semánticos. */}
              <Donut
                segments={[
                  { value: cumplimiento.cumplidos || 0, tone: 'ok', label: 'Cumplidos' },
                  { value: cumplimiento.parciales || 0, tone: 'warn', label: 'Parciales' },
                  { value: cumplimiento.incumplidos || 0, tone: 'bad', label: 'Incumplidos' },
                ]}
                centerTop={`${cumplimiento.pct ?? 0}%`} centerBottom="Cumplim."
              />
              <div className="min-w-0 flex-1 space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CHART_VARS.ok }} /><span className="truncate">Cumplidos</span><b className="ml-auto tabular-nums">{cumplimiento.cumplidosPct ?? 0}%</b></div>
                <div className="flex items-center gap-1.5"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CHART_VARS.warn }} /><span className="truncate">Parciales</span><b className="ml-auto tabular-nums">{cumplimiento.parcialesPct ?? 0}%</b></div>
                <div className="flex items-center gap-1.5"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CHART_VARS.bad }} /><span className="truncate">Incumplidos</span><b className="ml-auto tabular-nums">{cumplimiento.incumplidosPct ?? 0}%</b></div>
              </div>
            </div>
          )}
        </GlassPanel>
      </div>

      {/* Gráficos + columna derecha */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2.2fr_1fr]">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Section title="Incidentes por tipo" icon={<AlertTriangle className="h-4 w-4" />}>
            {porTipo.length === 0 ? <EmptyState icon={<AlertTriangle className="h-5 w-5" />} title="Sin incidentes" description="No hay incidentes en el período." /> : (
              <div className="flex items-center gap-3">
                {/* Los tipos vienen ordenados por frecuencia: una rampa del acento
                    hacia el gris lo dice mejor que siete colores sin relación, y
                    admite tantos tipos como haya sin inventar tonos nuevos. */}
                <Donut segments={porTipo.map((t, i) => ({ value: t.count, color: rampVar(i, porTipo.length), label: t.type }))} centerTop={String(data?.incidentesTotal ?? 0)} centerBottom="Total" />
                <div className="flex-1 space-y-1.5 text-xs">
                  {porTipo.slice(0, 6).map((t, i) => (<div key={t.type} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: rampVar(i, porTipo.length) }} /><span className="truncate">{t.type}</span><span className="ml-auto tabular-nums text-muted-foreground">{t.count} ({t.pct}%)</span></div>))}
                </div>
              </div>
            )}
          </Section>

          <Section title="Incidentes por estado" icon={<ShieldCheck className="h-4 w-4" />}>
            {porEstado.every((e) => e.count === 0) ? <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="Sin incidentes" description="No hay incidentes en el período." /> : (
              <div className="space-y-3 pt-1">
                {porEstado.map((e) => (
                  <div key={e.key}>
                    <div className="mb-1 flex items-center justify-between text-sm"><span className="text-muted-foreground">{e.label}</span><span className="tabular-nums text-xs">{e.count} ({e.pct}%)</span></div>
                    <MeterBar height={8} pct={e.pct} ariaLabel={e.label}
                      tone={e.key === 'resuelto' ? 'ok' : e.key === 'investigacion' ? 'info' : 'bad'} />
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Actividades por día" icon={<TrendingUp className="h-4 w-4" />}><ActividadChart data={actividades} /></Section>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <Section title="Filtros aplicados" icon={<Search className="h-4 w-4" />}>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="neutral" dot={false}>Período: {fmtD(from)} – {fmtD(to)}</StatusBadge>
              <StatusBadge tone="neutral" dot={false}>Cliente: {clientDisplayName(client, 'Cliente')}</StatusBadge>
            </div>
          </Section>

          <Section title="Reportes rápidos" icon={<FileBarChart className="h-4 w-4" />}>
            <div className="space-y-1">
              {quickReports.map((r) => { const Icon = QUICK_ICON[r.key] || FileText; return (
                <button key={r.key} onClick={() => doExport(r.key)} disabled={!!exporting} className="cg-focus flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-opacity hover:opacity-80 disabled:opacity-50">
                  <IconTile size="sm"><Icon /></IconTile>
                  <span className="flex-1">{r.label}</span>
                  {exporting === r.key ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : <Download className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              ); })}
            </div>
          </Section>

          <Section title="Reportes programados" icon={<CalendarClock className="h-4 w-4" />}
            action={<button onClick={() => setSchedOpen(true)} className="cg-focus inline-flex items-center gap-1 rounded-md text-xs font-semibold hover:underline" style={{ color: 'var(--brand-text)' }}><Plus className="h-3.5 w-3.5" /> Programar</button>}>
            {programados.length === 0 ? <EmptyState icon={<CalendarClock className="h-5 w-5" />} title="Sin reportes programados" description="Programa un reporte recurrente por correo." /> : (
              <div className="divide-y">
                {programados.map((s) => (
                  <div key={s.id} className="flex items-start justify-between gap-2 py-2.5">
                    <div className="min-w-0"><div className="text-sm font-medium truncate">{s.name}</div><div className="text-xs text-muted-foreground">{s.frequency || s.cron}</div></div>
                    <div className="flex shrink-0 items-center gap-1.5"><StatusBadge tone={s.active ? 'ok' : 'neutral'} dot={false}>{s.active ? 'Activo' : 'Pausado'}</StatusBadge><RowAction title="Eliminar programación" tone="bad" onClick={() => delSchedule(s)}><Trash2 className="h-3.5 w-3.5" /></RowAction></div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>

      {/* Todos los reportes */}
      <Section title="Todos los reportes" icon={<FileText className="h-4 w-4" />}>
        <div className="mb-3 relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input className={`${FIELD_CLS} pl-8`} placeholder="Buscar reporte por nombre…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        {reportsList.length === 0 ? (
          <EmptyState icon={<FileText className="h-5 w-5" />} title="Sin reportes" description="Aún no hay reportes operativos generados para este cliente en el período." />
        ) : (
          <TabTable>
              <THead>
                <Th>Nombre del reporte</Th><Th>Tipo</Th><Th>Sede / Estación</Th><Th>Generado por</Th><Th>Generado el</Th><Th>Formato</Th>
              </THead>
              <tbody>
                {reportsList.map((r) => (
                  <Tr key={r.id}>
                    <td className="px-2 py-2.5"><div className="flex items-center gap-2"><IconTile size="sm"><FileText /></IconTile><div><div className="max-w-[220px] truncate font-medium">{r.name}</div><div className="text-xs" style={{ color: 'var(--ink-faint)' }}>{r.code}</div></div></div></td>
                    <td className="px-2 py-2.5"><StatusBadge tone="neutral" dot={false}>{r.tipo}</StatusBadge></td>
                    <td className="px-2 py-2.5"><div className="truncate max-w-[150px]">{r.sede}</div>{r.puesto && r.puesto !== r.sede && <div className="text-xs text-muted-foreground truncate max-w-[150px]">{r.puesto}</div>}</td>
                    <td className="px-2 py-2.5 truncate max-w-[130px]">{r.generadoPor}</td>
                    <td className="px-2 py-2.5 tabular-nums text-xs">{r.fecha ? fmtDT(r.fecha) : '—'}</td>
                    <td className="px-2 py-2.5">{r.formato}</td>
                  </Tr>
                ))}
              </tbody>
          </TabTable>
        )}
        <Pager page={page} pageCount={pageCount} total={reportsTotal} perPage={perPage} noun="reportes" onPage={setPage} />
      </Section>

      <TabFooter
        icon={<FileBarChart />}
        note="Las métricas se calculan sobre la operación real del cliente en el período seleccionado."
        updatedAt={fmtUpdated}
        onRefresh={() => load()}
      />

      {/* Schedule modal */}
      <Modal open={schedOpen} onOpenChange={(o) => { if (!saving) setSchedOpen(o); }} title="Programar reporte" icon={<CalendarClock className="h-5 w-5" />}
        footer={<><Button variant="outline" onClick={() => setSchedOpen(false)} disabled={saving}>Cancelar</Button><Button onClick={saveSchedule} disabled={saving || !schedForm.name.trim()}>{saving ? 'Guardando…' : 'Programar'}</Button></>}>
        <div className="space-y-3">
          <LabeledField label="Nombre"><input className={FIELD_CLS} placeholder="Informe semanal de operaciones" value={schedForm.name} onChange={(e) => setSchedForm({ ...schedForm, name: e.target.value })} /></LabeledField>
          <LabeledField label="Reporte">
            <select className={FIELD_CLS} value={schedForm.type} onChange={(e) => setSchedForm({ ...schedForm, type: e.target.value })}>
              <option value="incidents">Reporte de incidentes</option><option value="rounds">Reporte de rondas</option><option value="visitors">Reporte de visitas</option><option value="attendance">Reporte de asistencia</option><option value="coverage">Cumplimiento de estaciones</option><option value="guard-activity">Actividad por guardia</option>
            </select>
          </LabeledField>
          <LabeledField label="Frecuencia">
            <select className={FIELD_CLS} value={schedForm.frequency} onChange={(e) => setSchedForm({ ...schedForm, frequency: e.target.value })}>
              <option value="daily">Diario (07:00)</option><option value="weekly">Semanal (lunes 08:00)</option><option value="monthly">Mensual (día 1, 09:00)</option>
            </select>
          </LabeledField>
        </div>
      </Modal>
    </div>
  );
}
