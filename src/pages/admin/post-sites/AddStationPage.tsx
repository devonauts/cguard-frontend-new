import React, { useEffect, useState } from 'react';
import { invalidateEntity } from "@/lib/queryClient";
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronLeft, Loader2, Sun, Moon, Clock, SlidersHorizontal, ShieldPlus } from 'lucide-react';
import PostSiteLayout from '@/layouts/PostSiteLayout';
import { postSiteService, setTenantId as setGlobalTenantId } from '@/lib/api/postSiteService';
import { ApiService } from '@/services/api/apiService';
import { Button } from '@/components/ui/button';
import StationGeofencePolygon, { type PolyPoint } from '@/components/GoogleMap/StationGeofencePolygon';
import RotationStyleSelect from '@/components/schedule/RotationStyleSelect';
import { PageContainer, PageHeader } from '@/components/kit';
import { FIELD_CLS_LG } from '@/pages/admin/clientes/components/_shared/tab-kit';

// Mirrors the staffing model used in the Stations tab: one jornada = 1 fijo.
function jornadaType(start?: string, end?: string): 'diurno' | 'nocturno' | null {
  const hour = (s?: string) => {
    if (!s) return null;
    const m = String(s).match(/(\d{1,2}):(\d{2})/);
    return m ? parseInt(m[1], 10) : null;
  };
  const sh = hour(start);
  const eh = hour(end);
  if (sh == null) return null;
  if (eh != null && eh <= sh) return 'nocturno';
  if (sh >= 18 || sh < 5) return 'nocturno';
  return 'diurno';
}
function requiredFijos(_schedule?: string): number {
  return 1;
}

// The station's "horario" maps to the scheduling engine's scheduleType, which
// drives positions + shift generation (the SAME field Programador › Horario
// sets via /auto-positions). This keeps a single source of truth so any guard
// assigned to the station abides by its horario.
function turnoToScheduleType(turno: 'diurno' | 'nocturno' | '24h' | 'custom'): '12h-day' | '12h-night' | '24h' | 'custom' {
  switch (turno) {
    case 'diurno': return '12h-day';
    case 'nocturno': return '12h-night';
    case '24h': return '24h';
    default: return 'custom';
  }
}

// A turno (horario) is one of four types — the same way it's set up in the
// station's horario. Each type presets the jornada window(s); "custom" lets the
// user define the hours. A 24h post is two 12h jornadas (diurno + nocturno),
// hence 2 fijos.
type TurnoType = 'diurno' | 'nocturno' | '24h' | 'custom';
const ALL_DAYS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];

// One jornada (turno block) persisted on stationSchedule.
interface Jornada { tipo: string; startTime: string; endTime: string; guardsCount: string; days: string[] }

const TURNO_OPTIONS: {
  key: TurnoType; label: string; sub: string; start: string; end: string; guards: number;
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}[] = [
  { key: 'diurno',   label: '12h Diurno',     sub: '07:00 – 19:00',     start: '07:00', end: '19:00', guards: 1, Icon: Sun },
  { key: 'nocturno', label: '12h Nocturno',   sub: '19:00 – 07:00',     start: '19:00', end: '07:00', guards: 1, Icon: Moon },
  { key: '24h',      label: '24 Horas',       sub: 'Diurno + Nocturno', start: '00:00', end: '23:59', guards: 2, Icon: Clock },
  { key: 'custom',   label: 'Personalizado',  sub: 'Define tus horas',  start: '',      end: '',      guards: 1, Icon: SlidersHorizontal },
];

// Time helpers for the custom multi-block window (wraps midnight).
const toMin = (hhmm: string) => {
  const [h, m] = String(hhmm || '').split(':').map((n) => parseInt(n, 10) || 0);
  return ((h % 24) * 60 + (m % 60) + 1440) % 1440;
};
const toHHMM = (min: number) => {
  const mm = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
};
/** Coverage window length in minutes; '' inputs → 0. 00:00→00:00 = 24h. */
function windowMinutes(start: string, end: string): number {
  if (!start || !end) return 0;
  const w = (toMin(end) - toMin(start) + 1440) % 1440;
  return w === 0 ? 1440 : w;
}

// Build the station's stationSchedule jornadas (the turno) from the selected
// type. Custom with a per-guard block length emits ONE jornada PER BLOCK so
// the horario/calendar reads the real per-vigilante coverage.
function buildJornadas(turnoType: TurnoType, start: string, end: string, blockHours?: number): Jornada[] {
  if (turnoType === '24h') {
    return [
      { tipo: 'Diurno',   startTime: '07:00', endTime: '19:00', guardsCount: '1', days: ALL_DAYS },
      { tipo: 'Nocturno', startTime: '19:00', endTime: '07:00', guardsCount: '1', days: ALL_DAYS },
    ];
  }
  const tipo = turnoType === 'diurno' ? 'Diurno' : turnoType === 'nocturno' ? 'Nocturno' : 'Personalizado';
  const win = windowMinutes(start, end);
  if (turnoType === 'custom' && blockHours && win > 0 && win % (blockHours * 60) === 0) {
    const blockMin = blockHours * 60;
    const k = win / blockMin;
    if (k > 1) {
      return Array.from({ length: k }, (_, i) => ({
        tipo: 'Personalizado',
        startTime: toHHMM(toMin(start) + i * blockMin),
        endTime: toHHMM(toMin(start) + (i + 1) * blockMin),
        guardsCount: '1',
        days: ALL_DAYS,
      }));
    }
  }
  return [{ tipo, startTime: start, endTime: end, guardsCount: '1', days: ALL_DAYS }];
}

/**
 * Full-page "Add station" form (replaces the old cramped modal that overflowed
 * the viewport because of the embedded geofence map). Route:
 *   /post-sites/:id/stations/new
 */
export default function AddStationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [site, setSite] = useState<any | null>(null);
  const [loadingSite, setLoadingSite] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state (same fields as the previous modal).
  const [newName, setNewName] = useState('');
  const [nickname, setNickname] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [turnoType, setTurnoType] = useState<TurnoType | ''>('');
  const [rotationStyleId, setRotationStyleId] = useState('');
  const [startingTimeInDay, setStartingTimeInDay] = useState('');
  const [finishTimeInDay, setFinishTimeInDay] = useState('');
  // Custom: hours each fijo works per day ('' = one fijo covers the whole window).
  const [blockHours, setBlockHours] = useState('');
  // Custom: how rest days are covered — 'sacafranco' (staggered rests + relief
  // guard) or 'alternate' (fijos share each block phased so one always works,
  // e.g. 24x24 = trabaja 1 / descansa 1 con 2 fijos, sin sacafranco).
  const [restCoverage, setRestCoverage] = useState<'sacafranco' | 'alternate'>('sacafranco');
  const [rotStyle, setRotStyle] = useState<{ dayShifts: number; nightShifts: number; restDays: number } | null>(null);

  const customWindowMin = turnoType === 'custom' ? windowMinutes(startingTimeInDay, finishTimeInDay) : 0;
  const customBlockMin = Number(blockHours) > 0 ? Number(blockHours) * 60 : 0;
  const customBlocksOk = customBlockMin > 0 && customWindowMin > 0 && customWindowMin % customBlockMin === 0;
  const customBlockCount = customBlocksOk ? customWindowMin / customBlockMin : 1;
  // Alternation: fijos per block = cycle / workDays (must divide evenly).
  const rotCycle = rotStyle ? (rotStyle.dayShifts || 0) + (rotStyle.nightShifts || 0) + (rotStyle.restDays || 0) : 0;
  const rotWork = rotStyle ? (rotStyle.dayShifts || 0) + (rotStyle.nightShifts || 0) : 0;
  const alternateOk = restCoverage !== 'alternate' || (rotWork > 0 && rotCycle % rotWork === 0);
  const guardsPerBlock = turnoType === 'custom' && restCoverage === 'alternate' && alternateOk && rotWork > 0
    ? rotCycle / rotWork
    : 1;
  const requiredGuards = turnoType === '24h' ? 2 : turnoType === 'custom' ? customBlockCount * guardsPerBlock : 1;

  // Selecting a turno type presets its window; "custom" keeps the manual times.
  const selectTurno = (key: TurnoType) => {
    setTurnoType(key);
    const opt = TURNO_OPTIONS.find((o) => o.key === key);
    if (opt && key !== 'custom') {
      setStartingTimeInDay(opt.start);
      setFinishTimeInDay(opt.end);
    } else if (key === 'custom') {
      setStartingTimeInDay('');
      setFinishTimeInDay('');
    }
  };
  const [geofenceRadius, setGeofenceRadius] = useState('100');
  const [geofencePolygon, setGeofencePolygon] = useState<PolyPoint[]>([]);
  // Per-station clock-in tolerance windows (minutes). Empty = use tenant default.
  const [clockInEarlyBufferMin, setClockInEarlyBufferMin] = useState('');
  const [clockInLateGraceMin, setClockInLateGraceMin] = useState('');

  const stationsUrl = `/post-sites/${id}/stations`;

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    (async () => {
      setLoadingSite(true);
      try {
        const data = await postSiteService.get(id);
        if (!mounted) return;
        setSite(data);
        const tid = data?.tenantId || (data?.tenant && typeof data.tenant === "object" && (data.tenant.id || data.tenant.tenantId));
        if (tid) setGlobalTenantId(tid);
      } catch (e) {
        console.error(e);
        toast.error(t('postsite.Details.unexpected', 'Unexpected error occurred'));
      } finally {
        if (mounted) setLoadingSite(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  const createStation = async () => {
    const tenantId = site?.tenantId || localStorage.getItem('tenantId') || '';
    const postSiteId = site?.id || id || '';
    if (!newName.trim()) {
      toast.error(t('postSites.stations.provideName', 'Provide a name'));
      return;
    }
    if (!postSiteId) {
      toast.error(t('postsite.Details.unexpected', 'Unexpected error occurred'));
      return;
    }
    if (!turnoType) {
      toast.error(t('postSites.stations.provideSchedule', 'Selecciona un turno'));
      return;
    }
    if (turnoType === 'custom' && (!startingTimeInDay || !finishTimeInDay)) {
      toast.error(t('postSites.stations.provideCustomTimes', 'Define la hora de inicio y fin'));
      return;
    }
    if (turnoType === 'custom' && blockHours && !customBlocksOk) {
      toast.error(t('postSites.stations.blockMismatch', 'La duración del turno debe dividir exactamente la cobertura del puesto.'));
      return;
    }
    if (turnoType === 'custom' && restCoverage === 'alternate' && !alternateOk) {
      toast.error(t('postSites.stations.alternateMismatch', 'Para alternar sin sacafranco, el ciclo del patrón debe ser múltiplo de sus días de trabajo (ej. 1-1, 2-2).'));
      return;
    }
    setSaving(true);
    try {
      const latitud = site?.latitud || site?.latitude || '';
      const longitud = site?.longitud || site?.longitude || '';
      // The turno (horario) is stored as jornadas on stationSchedule so the
      // station's horario/calendar reads it as the required coverage.
      const jornadas = buildJornadas(turnoType, startingTimeInDay, finishTimeInDay, turnoType === 'custom' && blockHours ? Number(blockHours) : undefined);
      const stationStart = turnoType === '24h' ? '00:00' : startingTimeInDay;
      const stationEnd = turnoType === '24h' ? '23:59' : finishTimeInDay;
      const payload = {
        stationName: newName,
        nickname: nickname.trim() || null,
        postSiteId,
        latitud,
        longitud,
        stationSchedule: JSON.stringify(jornadas),
        turnoType,
        is24h: turnoType === '24h',
        numberOfGuardsInStation: String(requiredGuards),
        startingTimeInDay: stationStart,
        finishTimeInDay: stationEnd,
        geofenceRadius: Number(geofenceRadius) || 100,
        geofencePolygon: geofencePolygon.length >= 3 ? geofencePolygon : null,
        // Empty input → null so the tenant Nómina default applies.
        clockInEarlyBufferMin: clockInEarlyBufferMin.trim() === '' ? null : Number(clockInEarlyBufferMin),
        clockInLateGraceMin: clockInLateGraceMin.trim() === '' ? null : Number(clockInLateGraceMin),
        description: newDescription,
      } as any;
      const createdSt: any = await ApiService.post(`/tenant/${tenantId}/station`, { data: payload });
      const adopted = (createdSt && (createdSt.adoptedTours || createdSt.data?.adoptedTours)) || 0;
      if (adopted > 0) toast.success(`${adopted} ronda(s) del puesto anterior recuperada(s) en este puesto`);
      invalidateEntity("stations");
      const newStationId = createdSt?.id || createdSt?.data?.id || null;
      // Configure the station's horario through the scheduling engine (the same
      // endpoint Programador › Horario uses): this sets scheduleType, creates the
      // turno positions and regenerates shifts, so assigned guards abide by it.
      // Rotation pattern auto-defaults (4-4-2 for 24h, 5-2 for 12h).
      if (newStationId) {
        try {
          await ApiService.post(`/tenant/${tenantId}/station/${newStationId}/auto-positions`, {
            data: {
              scheduleType: turnoToScheduleType(turnoType),
              rotationStyleId: rotationStyleId || undefined,
              startTime: startingTimeInDay || undefined,
              endTime: finishTimeInDay || undefined,
              blockHours: turnoType === 'custom' && blockHours ? Number(blockHours) : undefined,
              restCoverage: turnoType === 'custom' ? restCoverage : undefined,
            },
          });
        } catch (cfgErr: any) {
          console.error('auto-positions failed', cfgErr);
          toast.warning(t('postSites.stations.horarioConfigFailed', 'Estación creada, pero no se pudo configurar el horario. Configúralo en Programador › Horario.'));
        }
      }
      toast.success(t('postSites.stations.created', 'Station created'));
      navigate(stationsUrl);
    } catch (err: any) {
      console.error('Failed creating station', err);
      toast.error(err?.message || t('postSites.stations.createFailed', 'Failed creating station'));
    } finally {
      setSaving(false);
    }
  };


  return (
    <PostSiteLayout
      title={site?.businessName || site?.companyName || site?.name || t('postSites.postsite', 'Post Site')}
      site={site}
    >
      <div className="p-4">
        <PageContainer width="narrow">
        <Link to={stationsUrl} className="cg-focus inline-flex items-center gap-1 rounded text-sm" style={{ color: 'var(--ink-soft)' }}>
          <ChevronLeft className="h-4 w-4" />
          {t('postSites.stations.backToStations', 'Estaciones')}
        </Link>
        <PageHeader
          icon={<ShieldPlus />}
          title={t('postSites.stations.createTitle', 'Crear estación')}
          subtitle={t('postSites.stations.createSubtitle', 'Define el turno, horario y la geocerca del puesto.')}
        />

        {loadingSite && !site ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--brand-text)' }} />
          </div>
        ) : (
          <div className="glass">
            <div className="space-y-6 p-6">
              {/* Name */}
              <div>
                <label className="mb-2 block text-sm font-medium">
                  {t('postSites.stations.form.name', 'Nombre *')}
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('postSites.stations.placeholderName', 'Nombre de la estación')}
                  className={FIELD_CLS_LG}
                  autoFocus
                />
              </div>

              {/* Nickname / nominativo — private to operations */}
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-medium">
                  {t('postSites.stations.form.nickname', 'Nominativo')}
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide" style={{ background: 'var(--glass-sunken)', color: 'var(--ink-soft)' }}>
                    {t('common.private', 'Privado')}
                  </span>
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder={t('postSites.stations.placeholderNickname', 'Apodo / nominativo interno')}
                  className={FIELD_CLS_LG}
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
                  {t('postSites.stations.form.nicknameHint', 'Solo visible para operaciones del tenant. El cliente no lo ve.')}
                </p>
              </div>

              {/* Turno (horario) — same setup as the station's horario */}
              <div>
                <label className="mb-2 block text-sm font-medium">
                  {t('postSites.stations.form.schedule', 'Turno (horario) *')}
                </label>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {TURNO_OPTIONS.map(({ key, label, sub, Icon }) => {
                    const selected = turnoType === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => selectTurno(key)}
                        className="cg-focus flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all"
                        style={
                          selected
                            ? { background: 'var(--brand-wash)', borderColor: 'var(--brand-line)', boxShadow: '0 0 22px -10px var(--brand-glow)' }
                            : { background: 'var(--glass-sunken)', borderColor: 'var(--hairline)' }
                        }
                      >
                        <Icon className="h-5 w-5" style={{ color: selected ? 'var(--brand-text)' : 'var(--ink-faint)' }} />
                        <div>
                          <p className="text-sm font-semibold" style={selected ? { color: 'var(--brand-text)' } : undefined}>{label}</p>
                          <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>{sub}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Patrón de rotación — chosen here at the station; assigned guards inherit it. */}
              {turnoType && (
                <div className="glass-sunken p-3">
                  <RotationStyleSelect scheduleType={turnoToScheduleType(turnoType)} value={rotationStyleId} onChange={setRotationStyleId} onStyleChange={setRotStyle} />
                </div>
              )}

              {/* Times: editable for diurno / nocturno / custom */}
              {turnoType && turnoType !== '24h' && (
                <div className={`grid grid-cols-1 gap-4 ${turnoType === 'custom' ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
                  <div>
                    <label className="mb-2 block text-sm font-medium">{t('postSites.stations.form.startTime', 'Inicio')}</label>
                    <input type="time" value={startingTimeInDay} onChange={(e) => setStartingTimeInDay(e.target.value)} className={FIELD_CLS_LG} />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium">{t('postSites.stations.form.endTime', 'Fin')}</label>
                    <input type="time" value={finishTimeInDay} onChange={(e) => setFinishTimeInDay(e.target.value)} className={FIELD_CLS_LG} />
                  </div>
                  {turnoType === 'custom' && (
                    <div>
                      <label className="mb-2 block text-sm font-medium">{t('postSites.stations.form.blockHours', 'Turno por vigilante')}</label>
                      <select value={blockHours} onChange={(e) => setBlockHours(e.target.value)} className={FIELD_CLS_LG}>
                        <option value="">{t('postSites.stations.form.wholeWindow', 'Toda la jornada')}</option>
                        {[4, 6, 8, 12, 24].map((h) => {
                          const fits = customWindowMin > 0 && customWindowMin % (h * 60) === 0;
                          const k = fits ? customWindowMin / (h * 60) : 0;
                          return (
                            <option key={h} value={String(h)} disabled={!fits}>
                              {h}h{fits ? ` → ${k} bloque${k > 1 ? 's' : ''}` : ' (no divide la cobertura)'}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                  {turnoType === 'custom' && (
                    <div>
                      <label className="mb-2 block text-sm font-medium">{t('postSites.stations.form.restCoverage', 'Cobertura de descansos')}</label>
                      <select value={restCoverage} onChange={(e) => setRestCoverage(e.target.value as any)} className={FIELD_CLS_LG}>
                        <option value="sacafranco">{t('postSites.stations.form.withSf', 'Sacafranco cubre los descansos')}</option>
                        <option value="alternate">{t('postSites.stations.form.alternate', 'Alternancia entre fijos (sin sacafranco)')}</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="mb-2 block text-sm font-medium">{t('postSites.stations.form.guards', 'Vigilantes')}</label>
                    <div className="glass-sunken flex h-[42px] items-center px-3 text-sm">
                      <span className="font-semibold">{requiredGuards} fijo{requiredGuards > 1 ? 's' : ''}</span>
                      {turnoType === 'custom' && customWindowMin > 0 ? (
                        <span className="ml-auto text-[11px]" style={{ color: 'var(--ink-soft)' }}>{customWindowMin / 60}h de cobertura</span>
                      ) : jornadaType(startingTimeInDay, finishTimeInDay) ? (
                        <span className="ml-auto text-[11px] capitalize" style={{ color: 'var(--ink-soft)' }}>{jornadaType(startingTimeInDay, finishTimeInDay)}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}

              {/* Custom breakdown: blocks × alternation */}
              {turnoType === 'custom' && restCoverage === 'alternate' && rotStyle && (
                <p
                  className="rounded-md p-3 text-xs"
                  style={alternateOk
                    ? { background: 'var(--glass-sunken)', color: 'var(--ink-soft)' }
                    : { background: 'color-mix(in oklab, var(--bad) 12%, transparent)', color: 'var(--bad-text)' }}
                >
                  {alternateOk
                    ? <>Patrón <strong>{rotWork}-{rotCycle - rotWork}</strong>: cada bloque lo comparten <strong>{guardsPerBlock} fijos alternando</strong> (uno trabaja mientras el otro descansa) — <strong>sin sacafranco</strong>. Total: {requiredGuards} fijo{requiredGuards > 1 ? 's' : ''}.</>
                    : <>El patrón {rotWork}-{rotCycle - rotWork} no permite alternancia exacta: el ciclo ({rotCycle}) debe ser múltiplo de los días de trabajo ({rotWork}). Usa 1-1, 2-2, 3-3…</>}
                </p>
              )}
              {turnoType === 'custom' && customBlocksOk && customBlockCount > 1 && (
                <div className="glass-sunken p-4 text-sm">
                  <p className="mb-2 font-medium">
                    Cobertura {customWindowMin / 60}h — {customBlockCount} bloques de {Number(blockHours)}h{guardsPerBlock > 1 ? ` × ${guardsPerBlock} fijos alternando` : ''}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
                    {Array.from({ length: customBlockCount }, (_, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" style={{ color: 'var(--brand-text)' }} />
                        Fijo {i + 1} · {toHHMM(toMin(startingTimeInDay) + i * customBlockMin)} – {toHHMM(toMin(startingTimeInDay) + (i + 1) * customBlockMin)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 24h is a fixed split into two jornadas */}
              {turnoType === '24h' && (
                <div className="glass-sunken p-4 text-sm">
                  <p className="mb-2 font-medium">Cobertura 24 horas — dos jornadas</p>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
                    <span className="inline-flex items-center gap-1.5"><Sun className="h-3.5 w-3.5" style={{ color: 'var(--warn-text)' }} /> Diurno · 07:00 – 19:00</span>
                    <span className="inline-flex items-center gap-1.5"><Moon className="h-3.5 w-3.5" style={{ color: 'var(--info-text)' }} /> Nocturno · 19:00 – 07:00</span>
                    <span className="ml-auto font-semibold">2 fijos</span>
                  </div>
                </div>
              )}

              {turnoType && (turnoType !== 'custom' || restCoverage !== 'alternate') && (
                <p className="rounded-md p-3 text-xs" style={{ background: 'var(--glass-sunken)', color: 'var(--ink-soft)' }}>
                  <strong style={{ color: 'var(--ink)' }}>{requiredGuards} vigilante{requiredGuards > 1 ? 's' : ''} fijo{requiredGuards > 1 ? 's' : ''}</strong> en el puesto +{' '}
                  <strong style={{ color: 'var(--ink)' }}>1 sacafranco</strong> que cubre los días de descanso. El sacafranco salta entre
                  puestos — no pertenece a un solo puesto, por eso no se cuenta en las vigilantes requeridas.
                </p>
              )}

              {/* Geofence radius */}
              <div>
                <label className="mb-2 block text-sm font-medium">
                  {t('postSites.stations.form.geofenceRadius', 'Radio geovalla (metros)')}
                </label>
                <input
                  type="number"
                  min="10"
                  max="5000"
                  value={geofenceRadius}
                  onChange={(e) => setGeofenceRadius(e.target.value)}
                  placeholder="100"
                  className={FIELD_CLS_LG}
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
                  {t('postSites.stations.form.geofenceHint', 'Distancia máxima para marcar entrada')}
                </p>
              </div>

              {/* Clock-in tolerance windows */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    {t('postSites.stations.form.clockInEarlyBuffer', 'Tolerancia de entrada anticipada (min)')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="240"
                    value={clockInEarlyBufferMin}
                    onChange={(e) => setClockInEarlyBufferMin(e.target.value)}
                    placeholder={t('common.default', 'Por defecto')}
                    className={FIELD_CLS_LG}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    {t('postSites.stations.form.clockInLateGrace', 'Tolerancia de entrada tardía (min)')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="240"
                    value={clockInLateGraceMin}
                    onChange={(e) => setClockInLateGraceMin(e.target.value)}
                    placeholder={t('common.default', 'Por defecto')}
                    className={FIELD_CLS_LG}
                  />
                </div>
                <p className="text-xs sm:col-span-2" style={{ color: 'var(--ink-soft)' }}>
                  {t('postSites.stations.form.clockInBufferHint', 'Minutos antes/después de la hora de inicio en que el vigilante puede marcar entrada. Vacío = usar el valor por defecto de la empresa.')}
                </p>
              </div>

              {/* Geofence polygon — now has full page width + height to work with */}
              <div>
                <label className="mb-2 block text-sm font-medium">Geocerca poligonal (opcional)</label>
                <p className="mb-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
                  Si defines un polígono (3+ puntos), se usa en lugar del radio para validar la marcación.
                </p>
                <StationGeofencePolygon
                  value={geofencePolygon}
                  onChange={setGeofencePolygon}
                  centerLat={Number(site?.latitud || site?.latitude) || undefined}
                  centerLng={Number(site?.longitud || site?.longitude) || undefined}
                />
              </div>

              {/* Description */}
              <div>
                <label className="mb-2 block text-sm font-medium">
                  {t('postSites.stations.form.description', 'Descripción')}
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder={t('postSites.stations.form.descriptionPlaceholder', 'Descripción opcional')}
                  className={`${FIELD_CLS_LG} resize-none`}
                  rows={4}
                />
              </div>
            </div>
          </div>
        )}

        {/* Sticky action bar */}
        <div className="glass sticky bottom-0 mt-4 flex items-center justify-end gap-3 p-3">
          <Button variant="outline" onClick={() => navigate(stationsUrl)} disabled={saving}>
            {t('actions.cancel', 'Cancelar')}
          </Button>
          <Button
            variant="brand"
            onClick={createStation}
            disabled={!newName.trim() || !turnoType || saving}
            className="gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('actions.save', 'Guardar')}
          </Button>
        </div>
        </PageContainer>
      </div>
    </PostSiteLayout>
  );
}
