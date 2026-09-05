import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Route as RouteIcon, User, Clock, MapPin, Camera, MessageSquareText, Siren, AlertTriangle, CheckCircle2,
  SkipForward, Ban, ArrowUp, ArrowDown, Trash2, Plus, ListChecks, Users2, History as HistoryIcon, Pause,
} from 'lucide-react';
import AppLayout from '@/layouts/app-layout';
import Breadcrumb from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { PageContainer, PageHeader, Section, StatCard, StatusBadge, EmptyState, GlassPanel, SkeletonCards, Stagger, Modal, FormField, FIELD_CLS } from '@/components/kit';
import { confirmDialog } from '@/components/ui/confirmDialog';
import { promptDialog } from '@/components/ui/promptDialog';
import { usePageTitle } from '@/hooks/usePageTitle';
import { getAuthToken } from '@/lib/api';
import { crearSocket, cerrarSocket } from '@/lib/socket';
import routeService from '@/lib/api/routeService';
import { localeActual } from '@/lib/localeActual';
import RouteMap from '../routes/RouteMap';
import {
  RUN_STATUS_LABEL, RUN_STATUS_TONE, VISIT_STATUS_LABEL, VISIT_STATUS_TONE, SCHEDULE_LABEL, SCHEDULE_TONE,
  EVENT_LABEL, SKIP_REASON_LABEL, SEVERITY_LABEL, SEVERITY_TONE, fmtHora, fmtDur,
} from './runLabels';

/**
 * UNA EJECUCIÓN DE RUTA, ENTERA. Si está abierta, es el puesto de mando de la
 * central: se ve dónde va el supervisor, qué parada toca, y se puede cambiar
 * el PLAN (añadir, quitar, reordenar, omitir, abortar) — nunca las visitas,
 * que las registra quien está en el sitio. Si está cerrada, es la
 * reconstrucción de sólo lectura: llegadas, inspección con las preguntas de
 * entonces, fotos, novedades y la línea de tiempo completa.
 */
const OPEN = new Set(['in_progress', 'paused']);
const TERMINAL = new Set(['completed', 'skipped', 'missed']);

export default function RouteRunDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { runId = '' } = useParams<{ runId: string }>();
  usePageTitle('Ejecución de ruta');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [tab, setTab] = useState<'visitas' | 'eventos'>('visitas');
  const locale = localeActual();

  const load = useCallback(async () => {
    try { setData(await routeService.runDetail(runId)); }
    catch (e: any) { toast.error(e?.message || t('ui.RouteRunDetail.errorCarga', 'No se pudo cargar la ejecución')); }
    finally { setLoading(false); }
  }, [runId, t]);

  useEffect(() => {
    load();
    const tid = localStorage.getItem('tenantId');
    const socket = tid ? crearSocket(getAuthToken() || '', tid) : null;
    const onProgress = (e: any) => { if (!e?.runId || String(e.runId) === runId) load(); };
    if (socket) socket.on('route:progress', onProgress);
    return () => { if (socket) { socket.off('route:progress', onProgress); cerrarSocket(socket); } };
  }, [load, runId]);

  const ex = data?.execution;
  const stops: any[] = ex?.stops || [];
  const abierta = ex ? OPEN.has(ex.status) : false;
  const sum = ex?.summary;
  const mapStops = useMemo(() => stops.filter((s) => s.lat != null && s.lng != null).map((s) => ({ id: String(s.routePointId), nombre: s.name || '', direccion: s.address || '', lat: Number(s.lat), lng: Number(s.lng), duracion: s.duration ?? null })), [stops]);

  const accion = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(); }
    catch (e: any) { toast.error(e?.response?.data?.message || e?.message || 'Error'); }
    finally { setBusy(false); }
  };
  const omitir = async (s: any) => {
    const notes = await promptDialog({ title: t('ui.RouteRunDetail.omitirTitulo', 'Omitir «{{name}}»', { name: s.name }), message: t('ui.RouteRunDetail.omitirMsg', 'El supervisor verá la parada como omitida por instrucción de operaciones. Indica el motivo.'), placeholder: 'Motivo', confirmText: 'Omitir' });
    if (notes === null) return;
    await accion(() => routeService.dispatchSkipStop(runId, s.routePointId, { reason: 'operations_instruction', notes }), t('ui.RouteRunDetail.omitida', 'Parada omitida'));
  };
  const quitar = async (s: any) => {
    const reason = await promptDialog({ title: t('ui.RouteRunDetail.quitarTitulo', 'Quitar «{{name}}» del plan', { name: s.name }), message: t('ui.RouteRunDetail.quitarMsg', 'Sale del recorrido de hoy (queda registrada como omitida por operaciones). La ruta base no cambia.'), placeholder: 'Motivo', confirmText: 'Quitar' });
    if (reason === null) return;
    await accion(() => routeService.dispatchRemoveStop(runId, s.routePointId, reason), t('ui.RouteRunDetail.quitada', 'Parada quitada del plan'));
  };
  const mover = async (idx: number, dir: -1 | 1) => {
    const pendientes = stops.filter((s) => !TERMINAL.has(s.visit?.status || 'pending'));
    const i = pendientes.findIndex((s) => s.routePointId === stops[idx].routePointId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= pendientes.length) return;
    const ids = pendientes.map((s) => String(s.routePointId));
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await accion(() => routeService.dispatchReorder(runId, ids, 'Reordenado por operaciones'), t('ui.RouteRunDetail.reordenada', 'Plan reordenado'));
  };
  const abortar = async () => {
    const reason = await promptDialog({ title: t('ui.RouteRunDetail.abortarTitulo', 'Abortar la ruta'), message: t('ui.RouteRunDetail.abortarMsg', 'Las paradas sin visitar quedan como no visitadas y el supervisor recibe el aviso. Esto no se deshace.'), placeholder: 'Motivo (obligatorio)', confirmText: 'Abortar' });
    if (!reason) return;
    if (!(await confirmDialog({ title: t('ui.RouteRunDetail.abortarConfirm', '¿Abortar definitivamente?'), message: reason, confirmText: 'Sí, abortar' }))) return;
    await accion(() => routeService.dispatchAbort(runId, reason), t('ui.RouteRunDetail.abortada', 'Ruta abortada'));
  };

  const titulo = data?.routeName || data?.route?.name || t('ui.RouteRunDetail.titulo', 'Ejecución de ruta');

  return (
    <AppLayout>
      <Breadcrumb items={[{ label: 'Patrulla vehicular', path: '/vehicle-patrol' }, { label: 'Historial', path: '/vehicle-patrol/history' }, { label: titulo }]} />
      <PageContainer width="wide">
        <PageHeader
          icon={<RouteIcon />}
          title={titulo}
          subtitle={data ? `${data.date || ''}${data.supervisorName ? ` · ${data.supervisorName}` : ''}` : undefined}
          badges={ex ? (
            <>
              <StatusBadge tone={RUN_STATUS_TONE[ex.status] || 'neutral'}>{RUN_STATUS_LABEL[ex.status] || ex.status}</StatusBadge>
              {abierta && ex.scheduleState && ex.scheduleState !== 'on_time' && <StatusBadge tone={SCHEDULE_TONE[ex.scheduleState]}>{SCHEDULE_LABEL[ex.scheduleState]} · +{ex.varianceMinutes} min</StatusBadge>}
              {ex.planVersion > 1 && <StatusBadge tone="brand" dot={false}>{t('ui.RouteRunDetail.planV', 'Plan v{{v}}', { v: ex.planVersion })}</StatusBadge>}
            </>
          ) : undefined}
          actions={abierta ? (
            <>
              <Button variant="outline" onClick={() => setAddOpen(true)} disabled={busy}><Plus className="size-4" />{t('ui.RouteRunDetail.agregarParada', 'Añadir parada')}</Button>
              <Button variant="destructive" onClick={abortar} disabled={busy}><Ban className="size-4" />{t('ui.RouteRunDetail.abortar', 'Abortar ruta')}</Button>
            </>
          ) : undefined}
        />

        {loading ? <SkeletonCards count={4} /> : !ex ? (
          <EmptyState icon={<AlertTriangle />} title={t('ui.RouteRunDetail.noExiste', 'La ejecución no existe o no está disponible.')} />
        ) : (
          <>
            <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label={t('ui.RouteRunDetail.paradas', 'Paradas')} value={`${ex.progress?.completed ?? 0}/${ex.progress?.total ?? stops.length}`} icon={<ListChecks />} accent="brand" />
              <StatCard label={t('ui.RouteRunDetail.inicio', 'Inicio')} value={fmtHora(ex.startedAt, locale)} hint={ex.completedAt ? `${t('ui.RouteRunDetail.fin', 'Fin')} ${fmtHora(ex.completedAt, locale)}` : ex.pausedAt ? t('ui.RouteRunDetail.enPausaDesde', 'En pausa desde {{h}}', { h: fmtHora(ex.pausedAt, locale) }) : undefined} icon={<Clock />} />
              <StatCard label={t('ui.RouteRunDetail.inspeccion', 'Inspección media')} value={sum?.averageInspection != null ? `${Math.round(sum.averageInspection)}%` : '—'} icon={<CheckCircle2 />} accent="ok" />
              <StatCard label={t('ui.RouteRunDetail.hallazgos', 'Hallazgos críticos')} value={sum?.criticalFindings ?? stops.reduce((n, s) => n + (s.observations || []).filter((o: any) => o.severity === 'critical').length, 0)} icon={<AlertTriangle />} accent="danger" />
            </Stagger>

            {sum && (
              <GlassPanel flat className="mt-4 grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-4">
                <div><p className="cg-eyebrow">{t('ui.RouteRunDetail.duracion', 'Duración')}</p><p className="font-semibold">{fmtDur(sum.totalSeconds)}</p></div>
                <div><p className="cg-eyebrow">{t('ui.RouteRunDetail.enVisitas', 'En visitas')}</p><p className="font-semibold">{fmtDur(sum.visitSeconds)}</p></div>
                <div><p className="cg-eyebrow">{t('ui.RouteRunDetail.enTransito', 'En tránsito')}</p><p className="font-semibold">{fmtDur(sum.travelSeconds)}</p></div>
                <div><p className="cg-eyebrow">{t('ui.RouteRunDetail.enPausa', 'En pausa')}</p><p className="font-semibold">{fmtDur(sum.pausedSeconds)}</p></div>
                <div><p className="cg-eyebrow">{t('ui.RouteRunDetail.fotos', 'Fotos')}</p><p className="font-semibold">{sum.photos ?? 0}</p></div>
                <div><p className="cg-eyebrow">{t('ui.RouteRunDetail.novedades', 'Novedades')}</p><p className="font-semibold">{sum.observations ?? 0}</p></div>
                <div><p className="cg-eyebrow">{t('ui.RouteRunDetail.incidentes', 'Incidentes')}</p><p className="font-semibold">{sum.incidents ?? 0}</p></div>
                <div><p className="cg-eyebrow">{t('ui.RouteRunDetail.fueraDeZona', 'Fuera de zona')}</p><p className="font-semibold">{sum.geofenceFlags ?? 0}</p></div>
              </GlassPanel>
            )}

            {mapStops.length > 0 && (
              <div className="mt-4 overflow-hidden rounded-2xl"><RouteMap stops={mapStops} height={300} hud={false} /></div>
            )}

            <div className="mt-4 flex gap-2">
              <Button size="sm" variant={tab === 'visitas' ? 'brand' : 'outline'} onClick={() => setTab('visitas')}><MapPin className="size-3.5" />{t('ui.RouteRunDetail.visitas', 'Visitas')}</Button>
              <Button size="sm" variant={tab === 'eventos' ? 'brand' : 'outline'} onClick={() => setTab('eventos')}><HistoryIcon className="size-3.5" />{t('ui.RouteRunDetail.lineaDeTiempo', 'Línea de tiempo')} ({(data.events || []).length})</Button>
            </div>

            {tab === 'visitas' && (
              <Section title={t('ui.RouteRunDetail.recorrido', 'Recorrido')} icon={<MapPin />} className="mt-2">
                <div className="space-y-3">
                  {stops.map((s, idx) => <VisitaCard key={s.routePointId} s={s} idx={idx} abierta={abierta} busy={busy} locale={locale} onSkip={() => omitir(s)} onRemove={() => quitar(s)} onMove={(d) => mover(idx, d)} />)}
                </div>
              </Section>
            )}
            {tab === 'eventos' && (
              <Section title={t('ui.RouteRunDetail.lineaDeTiempo', 'Línea de tiempo')} icon={<HistoryIcon />} className="mt-2">
                <Eventos events={data.events || []} stops={stops} locale={locale} />
              </Section>
            )}
          </>
        )}
      </PageContainer>

      <AgregarParadaModal open={addOpen} onOpenChange={setAddOpen} stops={stops} onAdd={async (body) => { await accion(() => routeService.dispatchAddStop(runId, body), t('ui.RouteRunDetail.paradaAgregada', 'Parada añadida al plan')); setAddOpen(false); }} busy={busy} />
    </AppLayout>
  );
}

function VisitaCard({ s, idx, abierta, busy, locale, onSkip, onRemove, onMove }: { s: any; idx: number; abierta: boolean; busy: boolean; locale: string; onSkip: () => void; onRemove: () => void; onMove: (d: -1 | 1) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const v = s.visit || {};
  const st = v.status || 'pending';
  const terminal = TERMINAL.has(st);
  const enSitio = st === 'arrived' || st === 'inspection_in_progress';
  const insp = s.inspection;
  const fotos: any[] = s.photos || [];
  const obs: any[] = s.observations || [];
  return (
    <GlassPanel flat className="p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold" style={{ background: 'var(--glass-sunken)' }}>{s.order ?? idx + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{s.name}</p>
            <StatusBadge tone={VISIT_STATUS_TONE[st] || 'neutral'}>{VISIT_STATUS_LABEL[st] || st}</StatusBadge>
            {s.priority && (s.priority === 'high' || s.priority === 'critical') && <StatusBadge tone="danger" dot={false}>{t('ui.RouteRunDetail.prioritaria', 'Prioritaria')}</StatusBadge>}
            {s.required === false && <StatusBadge tone="neutral" dot={false}>{t('ui.RouteRunDetail.opcional', 'Opcional')}</StatusBadge>}
            {s.arrival?.flagged && <StatusBadge tone="warn" dot={false}><AlertTriangle className="size-3" />{t('ui.RouteRunDetail.fueraDeZonaBadge', 'Fuera de zona')}{s.arrival.distanceMeters != null ? ` · ${Math.round(s.arrival.distanceMeters)} m` : ''}</StatusBadge>}
            {v.inspectionScore != null && <StatusBadge tone={v.inspectionScore >= 80 ? 'ok' : v.inspectionScore >= 60 ? 'warn' : 'danger'} dot={false}>{Math.round(v.inspectionScore)}%</StatusBadge>}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
            {s.address && <span>{s.address}</span>}
            {v.expectedArrivalAt && <span><Clock className="mr-1 inline size-3" />{t('ui.RouteRunDetail.previsto', 'Previsto')} {fmtHora(v.expectedArrivalAt, locale)}</span>}
            {v.arrivedAt && <span>{t('ui.RouteRunDetail.llegada', 'Llegada')} {fmtHora(v.arrivedAt, locale)}</span>}
            {v.completedAt && <span>{t('ui.RouteRunDetail.cierre', 'Cierre')} {fmtHora(v.completedAt, locale)}</span>}
            {v.timeSpentSeconds != null && <span>{fmtDur(v.timeSpentSeconds)} {t('ui.RouteRunDetail.enSitio', 'en el sitio')}</span>}
            {fotos.length > 0 && <span><Camera className="mr-1 inline size-3" />{fotos.length}</span>}
            {obs.length > 0 && <span><MessageSquareText className="mr-1 inline size-3" />{obs.length}</span>}
          </div>
          {s.skip && <p className="mt-1 text-xs" style={{ color: 'var(--warn-text)' }}><SkipForward className="mr-1 inline size-3" />{SKIP_REASON_LABEL[s.skip.reason] || s.skip.label || s.skip.reason}{s.skip.notes ? ` — ${s.skip.notes}` : ''}</p>}
          {s.arrival?.overrideReason && <p className="mt-1 text-xs" style={{ color: 'var(--warn-text)' }}>{t('ui.RouteRunDetail.motivoOverride', 'Motivo del registro fuera de zona')}: {s.arrival.overrideReason}</p>}

          {(insp?.responses || fotos.length || obs.length || v.notes || (v.guardVerifications || []).length) ? (
            <button type="button" className="mt-2 text-xs font-semibold underline" style={{ color: 'var(--brand-text)' }} onClick={() => setOpen((o) => !o)}>
              {open ? t('ui.RouteRunDetail.ocultarDetalle', 'Ocultar detalle') : t('ui.RouteRunDetail.verDetalle', 'Ver detalle de la visita')}
            </button>
          ) : null}

          {open && (
            <div className="mt-3 space-y-3 border-t pt-3" style={{ borderColor: 'var(--hairline)' }}>
              {insp?.snapshot?.sections && (
                <div>
                  <p className="cg-eyebrow mb-1">{t('ui.RouteRunDetail.inspeccionV', 'Inspección (plantilla v{{v}})', { v: insp.templateVersion || 1 })}</p>
                  {insp.snapshot.sections.map((sec: any) => (
                    <div key={sec.id} className="mb-2">
                      <p className="text-xs font-semibold" style={{ color: 'var(--ink-soft)' }}>{sec.title}</p>
                      {(sec.items || []).map((it: any) => {
                        const val = insp.responses?.[it.id];
                        if (val === undefined || val === null || val === '') return null;
                        return <p key={it.id} className="flex justify-between gap-4 border-b py-1 text-sm" style={{ borderColor: 'var(--hairline)' }}><span>{it.label}</span><strong>{Array.isArray(val) ? val.join(', ') : String(val)}</strong></p>;
                      })}
                    </div>
                  ))}
                </div>
              )}
              {(v.guardVerifications || []).length > 0 && (
                <div>
                  <p className="cg-eyebrow mb-1"><Users2 className="mr-1 inline size-3" />{t('ui.RouteRunDetail.personal', 'Personal del puesto')}</p>
                  {v.guardVerifications.map((g: any, i: number) => <p key={i} className="flex justify-between text-sm"><span>{g.name}</span><strong>{g.status}{g.note ? ` — ${g.note}` : ''}</strong></p>)}
                </div>
              )}
              {fotos.length > 0 && (
                <div>
                  <p className="cg-eyebrow mb-1"><Camera className="mr-1 inline size-3" />{t('ui.RouteRunDetail.fotos', 'Fotos')}</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {fotos.map((f: any) => { const u = f.downloadUrl || f.url || f.publicUrl; return u ? <a key={f.id} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="aspect-square w-full rounded-lg object-cover" loading="lazy" /></a> : null; })}
                  </div>
                </div>
              )}
              {obs.length > 0 && (
                <div>
                  <p className="cg-eyebrow mb-1"><MessageSquareText className="mr-1 inline size-3" />{t('ui.RouteRunDetail.novedades', 'Novedades')}</p>
                  {obs.map((o: any) => (
                    <div key={o.id} className="flex items-start gap-2 py-1 text-sm">
                      <StatusBadge tone={SEVERITY_TONE[o.severity] || 'neutral'} dot={false}>{SEVERITY_LABEL[o.severity] || o.severity}</StatusBadge>
                      <span className="flex-1">{o.text}</span>
                      {o.visibility === 'client_visible' && <StatusBadge tone="brand" dot={false}>{t('ui.RouteRunDetail.visibleCliente', 'Cliente')}</StatusBadge>}
                      {o.incidentId && <a className="underline" style={{ color: 'var(--danger-text)' }} href={`/reports/incident/${o.incidentId}`}><Siren className="inline size-3" /> {t('ui.RouteRunDetail.incidente', 'Incidente')}</a>}
                    </div>
                  ))}
                </div>
              )}
              {v.notes && <div><p className="cg-eyebrow mb-1">{t('ui.RouteRunDetail.notas', 'Notas')}</p><p className="whitespace-pre-wrap text-sm">{v.notes}</p></div>}
            </div>
          )}
        </div>
        {abierta && !terminal && (
          <div className="flex shrink-0 flex-col gap-1">
            <Button size="icon" variant="ghost" aria-label="Subir" disabled={busy || enSitio} onClick={() => onMove(-1)}><ArrowUp className="size-4" /></Button>
            <Button size="icon" variant="ghost" aria-label="Bajar" disabled={busy || enSitio} onClick={() => onMove(1)}><ArrowDown className="size-4" /></Button>
            <Button size="icon" variant="ghost" aria-label="Omitir" disabled={busy || enSitio} onClick={onSkip}><SkipForward className="size-4" /></Button>
            <Button size="icon" variant="ghost" aria-label="Quitar" disabled={busy || enSitio} onClick={onRemove}><Trash2 className="size-4" /></Button>
          </div>
        )}
      </div>
    </GlassPanel>
  );
}

function Eventos({ events, stops, locale }: { events: any[]; stops: any[]; locale: string }) {
  const { t } = useTranslation();
  const nombre = useMemo(() => new Map(stops.map((s) => [String(s.routePointId), s.name || ''])), [stops]);
  if (!events.length) return <EmptyState icon={<HistoryIcon />} title={t('ui.RouteRunDetail.sinEventos', 'Todavía no hay eventos')} />;
  return (
    <div className="space-y-1">
      {events.map((e) => {
        const p = e.payload || {};
        const detalle = e.type === 'stop.arrived' && p.distanceM != null ? `${p.distanceM} m${p.outside ? ' · fuera de zona' : ''}`
          : e.type === 'stop.completed' && p.score != null ? `${Math.round(p.score)}%`
          : e.type === 'stop.skipped' ? (p.notes || SKIP_REASON_LABEL[p.reason] || p.reason || '')
          : e.type === 'route.plan_updated' ? (p.change || p.reason || '')
          : e.type === 'route.paused' ? (p.reason || '')
          : e.type === 'route.aborted' ? (p.reason || '')
          : e.type === 'route.delayed' || e.type === 'route.at_risk' ? `+${p.varianceMinutes ?? 0} min`
          : e.type === 'observation.created' || e.type === 'incident.created' ? (p.text || '')
          : e.type === 'stop.geofence_override' ? (p.reason || '')
          : '';
        const tone = e.type.includes('aborted') || e.type === 'route.at_risk' || e.type === 'stop.missed' || e.type === 'incident.created' ? 'var(--danger-text)'
          : e.type === 'route.delayed' || e.type === 'stop.skipped' || e.type === 'stop.geofence_override' || e.type === 'route.paused' ? 'var(--warn-text)'
          : e.type === 'stop.completed' || e.type === 'route.completed' ? 'var(--ok-text)' : 'var(--ink)';
        return (
          <div key={e.id} className="grid grid-cols-[64px_1fr] gap-3 border-b py-2 text-sm" style={{ borderColor: 'var(--hairline)' }}>
            <span className="tabular-nums" style={{ color: 'var(--ink-soft)' }}>{fmtHora(e.at, locale)}</span>
            <div>
              <p className="font-semibold" style={{ color: tone }}>
                {e.type === 'route.paused' ? <Pause className="mr-1 inline size-3" /> : null}
                {EVENT_LABEL[e.type] || e.type}{e.routePointId && nombre.get(String(e.routePointId)) ? <span className="font-normal" style={{ color: 'var(--ink-soft)' }}> · {nombre.get(String(e.routePointId))}</span> : null}
              </p>
              {detalle && <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{detalle}</p>}
              {e.actorChannel === 'crm' && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{t('ui.RouteRunDetail.porCentral', 'Por la central')}{e.actorName ? ` · ${e.actorName}` : ''}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AgregarParadaModal({ open, onOpenChange, stops, onAdd, busy }: { open: boolean; onOpenChange: (v: boolean) => void; stops: any[]; onAdd: (b: any) => Promise<void>; busy: boolean }) {
  const { t } = useTranslation();
  const [siteId, setSiteId] = useState('');
  const [siteType, setSiteType] = useState('station');
  const [afterOrder, setAfterOrder] = useState<string>('');
  const [reason, setReason] = useState('');
  const [instructions, setInstructions] = useState('');
  const [priority, setPriority] = useState('normal');
  const [estaciones, setEstaciones] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const tid = localStorage.getItem('tenantId');
        const { default: api } = await import('@/lib/api');
        const { data } = await api.get<any>(`/tenant/${tid}/station?limit=500`);
        const rows = Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : [];
        setEstaciones(rows.map((r: any) => ({ id: String(r.id), name: r.name || r.stationName || r.id })));
      } catch { setEstaciones([]); }
    })();
  }, [open]);
  const pendientes = stops.filter((s) => !TERMINAL.has(s.visit?.status || 'pending'));
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t('ui.RouteRunDetail.agregarParada', 'Añadir parada')} icon={<Plus />} size="md"
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>{t('comun.cancelar', 'Cancelar')}</Button><Button variant="brand" disabled={!siteId || busy} onClick={() => onAdd({ siteType, siteId, afterOrder: afterOrder ? Number(afterOrder) : null, reason: reason || undefined, instructions: instructions || undefined, priority })}>{t('ui.RouteRunDetail.agregar', 'Añadir al plan')}</Button></>}>
      <div className="grid gap-3">
        <FormField label={t('ui.RouteRunDetail.puesto', 'Puesto')} required>
          <select className={FIELD_CLS} value={siteId} onChange={(e) => { setSiteId(e.target.value); setSiteType('station'); }}>
            <option value="">—</option>
            {estaciones.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </FormField>
        <FormField label={t('ui.RouteRunDetail.despuesDe', 'Después de')}>
          <select className={FIELD_CLS} value={afterOrder} onChange={(e) => setAfterOrder(e.target.value)}>
            <option value="">{t('ui.RouteRunDetail.alFinal', 'Al final del recorrido')}</option>
            {pendientes.map((s) => <option key={s.routePointId} value={s.order}>{s.order}. {s.name}</option>)}
          </select>
        </FormField>
        <FormField label={t('ui.RouteRunDetail.prioridad', 'Prioridad')}>
          <select className={FIELD_CLS} value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="low">Baja</option><option value="normal">Normal</option><option value="high">Alta</option><option value="critical">Crítica</option>
          </select>
        </FormField>
        <FormField label={t('ui.RouteRunDetail.instrucciones', 'Instrucciones para el supervisor')}>
          <textarea className="cg-input w-full px-3 py-2 text-sm" rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={2000} />
        </FormField>
        <FormField label={t('ui.RouteRunDetail.motivo', 'Motivo del cambio')}>
          <input className={FIELD_CLS} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </FormField>
      </div>
    </Modal>
  );
}
