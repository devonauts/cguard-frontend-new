import type * as React from 'react';
import { useEffect, useState } from 'react';
import { format as dateFnsFormat } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { ApiService } from '@/services/api/apiService';
import securityGuardService from '@/lib/api/securityGuardService';
import { Section, StatCard, EmptyState, IconTile, StatusBadge, SkeletonBlock } from '@/components/kit';
import { MapPin, Gauge, CalendarDays, Building2, Clock } from 'lucide-react';
import type {
  GuardDetail,
  GuardAssignmentRow,
  GuardPerformance,
  PerformanceStats,
  ScheduleSnapshot,
} from '../../guardDetailTypes';

type Props = {
  guard: GuardDetail & { firstName?: string; lastName?: string };
};

/** A mapped memo row shown in the recent-activity feed. */
interface SummaryActivity {
  initial: string;
  message: string;
  timestamp: string;
  badge: string | null;
  subject: string;
}

/** A memo row as returned by the memos endpoint. */
interface MemoRow {
  content?: string;
  subject?: string;
  dateTime?: string;
  createdAt?: string;
  wasAccepted?: boolean;
}

/** A distinct station derived from the assignment rows. */
interface StationSummary {
  stationName: string | null;
  postSiteName: string | null;
  clientName: string | null;
  window: string | null;
}

// Espeja src/pages/admin/clientes/components/ClientCoverage/ScheduleCard.tsx.
// Día / Noche / Libre no son estados semánticos (nada está «mal» de noche): el
// día usa el azul informativo y la noche el acento de marca, que es lo único con
// color en pantalla. Ambos salen de variables, así que siguen al tono elegido.
const CELL: Record<string, { label: string; style: React.CSSProperties }> = {
  day: {
    label: 'D',
    style: { background: 'color-mix(in oklab, var(--info) 16%, transparent)', color: 'var(--info-text)' },
  },
  night: {
    label: 'N',
    style: { background: 'var(--brand-wash)', color: 'var(--brand-text)' },
  },
  rest: {
    label: 'L',
    style: { background: 'var(--glass-sunken)', color: 'var(--ink-soft)' },
  },
  none: {
    label: '·',
    style: { color: 'var(--ink-faint)' },
  },
};

const TIER_LABEL: Record<string, string> = {
  excellent: 'Excelente',
  good: 'Bueno',
  fair: 'Regular',
  needs_improvement: 'Por mejorar',
};
const TIER_ACCENT: Record<string, 'ok' | 'warn' | 'bad'> = {
  excellent: 'ok',
  good: 'ok',
  fair: 'warn',
  needs_improvement: 'bad',
};

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Shift startTime/endTime may arrive as an "HH:MM[:SS]" clock string or a full
// timestamp — show a clean "HH:MM - HH:MM" window when we can, otherwise skip it.
const clock = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const s = String(v);
  const m = s.match(/(\d{2}:\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : dateFnsFormat(d, 'HH:mm');
};
const windowLabel = (a: GuardAssignmentRow): string | null => {
  const from = clock(a.startTime);
  const to = clock(a.endTime);
  if (from && to) return `${from} - ${to}`;
  return from || to || null;
};

export default function GuardSummary({ guard }: Props) {
  const { t } = useTranslation();

  const [activities, setActivities] = useState<SummaryActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  const [assignments, setAssignments] = useState<GuardAssignmentRow[] | null>(null);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);

  const [perf, setPerf] = useState<GuardPerformance | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);

  const [schedule, setSchedule] = useState<ScheduleSnapshot | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  // ── Recent activity (memos feed) — REAL, kept as-is ──────────────────────
  useEffect(() => {
    if (!guard?.id) return;
    let mounted = true;
    setActivitiesLoading(true);
    const tenantId = localStorage.getItem('tenantId') || '';
    ApiService.get(
      `/tenant/${tenantId}/memos?filter[guardName]=${guard.id}&limit=10&orderBy=dateTime_DESC`,
    )
      .then((res: { rows?: MemoRow[] } | MemoRow[]) => {
        if (!mounted) return;
        const rows: MemoRow[] = Array.isArray(res) ? res : res.rows ?? [];
        const fullName =
          guard.fullName ??
          `${guard.firstName ?? ''} ${guard.lastName ?? ''}`.trim();
        const initial = fullName ? fullName.charAt(0).toUpperCase() : '?';
        const mapped: SummaryActivity[] = rows.map((memo: MemoRow) => ({
          initial,
          message: memo.content || memo.subject || '',
          timestamp: memo.dateTime
            ? dateFnsFormat(new Date(memo.dateTime), 'dd MMM yyyy HH:mm')
            : memo.createdAt
            ? dateFnsFormat(new Date(memo.createdAt), 'dd MMM yyyy HH:mm')
            : '',
          badge: memo.wasAccepted ? t('guards.summary.badge.accepted') : null,
          subject: memo.subject || '',
        }));
        setActivities(mapped);
      })
      .catch(() => {
        /* silently ignore — activity section just stays empty */
      })
      .finally(() => {
        if (mounted) setActivitiesLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [guard?.id]);

  // ── Station / post assignments — REAL ────────────────────────────────────
  useEffect(() => {
    if (!guard?.id) return;
    let mounted = true;
    setAssignmentsLoading(true);
    securityGuardService
      .getAssignments(guard.id)
      .then((res) => {
        if (mounted) setAssignments(res?.rows ?? []);
      })
      .catch(() => {
        if (mounted) setAssignments([]);
      })
      .finally(() => {
        if (mounted) setAssignmentsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [guard?.id]);

  // ── Performance (8-factor) — REAL ────────────────────────────────────────
  useEffect(() => {
    if (!guard?.id) return;
    let mounted = true;
    setPerfLoading(true);
    securityGuardService
      .getPerformance(guard.id, 30)
      .then((res) => {
        if (mounted) setPerf(res ?? null);
      })
      .catch(() => {
        if (mounted) setPerf(null);
      })
      .finally(() => {
        if (mounted) setPerfLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [guard?.id]);

  // ── Schedule snapshot (next 7 days) — REAL ───────────────────────────────
  useEffect(() => {
    if (!guard?.id) return;
    let mounted = true;
    setScheduleLoading(true);
    const today = new Date();
    const end = new Date(today.getTime() + 6 * 86400000);
    securityGuardService
      .getSchedule(guard.id, { startDate: ymd(today), endDate: ymd(end) })
      .then((res) => {
        if (mounted) setSchedule(res ?? null);
      })
      .catch(() => {
        if (mounted) setSchedule(null);
      })
      .finally(() => {
        if (mounted) setScheduleLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [guard?.id]);

  // ── Derive distinct stations from the (shift-level) assignment rows ───────
  const stations = (() => {
    const rows = assignments ?? [];
    const seen = new Map<string, StationSummary>();
    for (const a of rows) {
      const key = `${a.businessInfoId ?? ''}|${a.stationName ?? ''}|${a.postSiteName ?? ''}`;
      if (!seen.has(key)) {
        seen.set(key, {
          stationName: a.stationName || null,
          postSiteName: a.postSiteName || null,
          clientName: a.clientName || null,
          window: windowLabel(a),
        });
      }
    }
    return Array.from(seen.values());
  })();

  const days = schedule?.days || [];
  const scheduleRows = schedule?.rows || [];
  const stats: PerformanceStats = perf?.stats || {};

  return (
    <div className="space-y-6">
      {/* ── STATION / POST ASSIGNMENT ─────────────────────────────────────── */}
      <Section title={t("ui.GuardSummary.puestoYEstacion", "Puesto y estación")} icon={<MapPin className="h-4 w-4" />}>
        {assignmentsLoading && assignments === null ? (
          <div className="py-6 text-center text-sm" style={{ color: 'var(--ink-soft)' }}>{t("ui.GuardSummary.cargandoAsignacion", "Cargando asignación…")}</div>
        ) : stations.length === 0 ? (
          <EmptyState
            icon={<MapPin className="h-5 w-5" />}
            title={t("ui.GuardSummary.sinAsignacion", "Sin asignación")}
            description="Este vigilante todavía no tiene una estación o puesto asignado. Asígnalo desde la pestaña “Puesto y estaciones”."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {stations.map((s, i) => (
              /* Se repite → `glass-flat`, sin desenfoque. */
              <div key={i} className="glass-flat p-4">
                <div className="flex items-start gap-3">
                  <IconTile tone="brand"><Building2 /></IconTile>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{s.stationName || 'Estación'}</div>
                    {s.postSiteName && s.postSiteName !== s.stationName && (
                      <div className="truncate text-xs" style={{ color: 'var(--ink-soft)' }}>Sede: {s.postSiteName}</div>
                    )}
                    {s.clientName && (
                      <div className="truncate text-xs" style={{ color: 'var(--ink-soft)' }}>Cliente: {s.clientName}</div>
                    )}
                    {s.window && (
                      <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--ink-soft)' }}>
                        <Clock className="h-3.5 w-3.5" /> {s.window}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── PERFORMANCE SUMMARY ───────────────────────────────────────────── */}
      <Section
        title={t("ui.GuardSummary.desempenoUltimos30Dias", "Desempeño (últimos 30 días)")}
        icon={<Gauge className="h-4 w-4" />}
      >
        {perfLoading && perf === null ? (
          <div className="py-6 text-center text-sm" style={{ color: 'var(--ink-soft)' }}>{t("ui.GuardSummary.calculandoDesempeno", "Calculando desempeño…")}</div>
        ) : perf?.enabled === false ? (
          /* Apagada la medición no hay nota, y decir «faltan datos» convertiría
             una decisión de la empresa en un vacío que se llenaría solo. */
          <EmptyState
            icon={<Gauge />}
            title={
              perf.disabledBy === 'tenant'
                ? 'Tu empresa no está midiendo el desempeño'
                : 'A esta persona no se le mide el desempeño'
            }
            description={
              perf.disabledBy === 'tenant'
                ? 'La medición está desactivada para toda la empresa en Configuración › Vigilantes en turno.'
                : 'Puedes volver a activarlo desde la pestaña Desempeño de esta ficha.'
            }
          />
        ) : !perf?.hasData ? (
          <EmptyState
            icon={<Gauge />}
            title={t("ui.GuardSummary.sinDatosDeDesempeno", "Sin datos de desempeño")}
            description="Aún no hay datos suficientes para calcular el desempeño de este vigilante."
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Puntaje"
              value={`${perf.score}/100`}
              hint={TIER_LABEL[perf.tier] || perf.tier}
              accent={TIER_ACCENT[perf.tier] || 'neutral'}
              icon={<Gauge />}
            />
            <StatCard
              label="Asistencia"
              value={stats.attendanceRate != null ? `${stats.attendanceRate}%` : '—'}
              hint={`${stats.shiftsWorked ?? 0}/${stats.shiftsScheduled ?? 0} turnos`}
              accent="info"
            />
            <StatCard
              label="Horas trabajadas"
              value={stats.hoursWorked != null ? `${stats.hoursWorked} h` : '—'}
              accent="brand"
            />
            <StatCard
              label="Faltas / Atrasos"
              value={`${stats.absences ?? 0} / ${stats.tardies ?? 0}`}
              hint={
                stats.clientRatingCount
                  ? `Calif. cliente ${stats.clientRatingAvg ?? '—'} (${stats.clientRatingCount})`
                  : undefined
              }
              accent={
                (stats.absences ?? 0) > 0 || (stats.tardies ?? 0) > 0 ? 'warn' : 'ok'
              }
            />
          </div>
        )}
      </Section>

      {/* ── SCHEDULE SNAPSHOT (this week) ──────────────────────────────────── */}
      <Section title="Horario esta semana" icon={<CalendarDays className="h-4 w-4" />}>
        {scheduleLoading && schedule === null ? (
          <div className="py-6 text-center text-sm" style={{ color: 'var(--ink-soft)' }}>Cargando horario…</div>
        ) : scheduleRows.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-5 w-5" />}
            title={t("ui.GuardSummary.sinRotacionConfigurada", "Sin rotación configurada")}
            description="Este vigilante no tiene una rotación de turnos configurada en su estación."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th
                      className="cg-eyebrow sticky left-0 z-10 min-w-[160px] border-b px-2 py-2 text-left"
                      style={{ background: 'var(--glass-solid)', borderColor: 'var(--hairline)' }}
                    >
                      Estación · Puesto
                    </th>
                    {days.map((d) => (
                      <th
                        key={d.date}
                        className="border-b px-1 py-1 text-center text-[11px] font-medium"
                        style={{
                          borderColor: 'var(--hairline)',
                          color: d.isToday ? 'var(--brand-text)' : d.weekend ? 'var(--ink-faint)' : 'var(--ink-soft)',
                        }}
                      >
                        <div>{d.dow}</div>
                        <div className={`tabular-nums ${d.isToday ? 'font-bold' : ''}`}>{d.day}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scheduleRows.map((r, ri) => (
                    <tr key={ri} className="transition-colors hover:[background:var(--glass-sunken)]">
                      <td
                        className="sticky left-0 z-10 min-w-[160px] border-b px-2 py-1.5"
                        style={{ background: 'var(--glass-solid)', borderColor: 'var(--hairline)' }}
                      >
                        <div className="truncate text-xs font-semibold">{r.stationName || 'Estación'}</div>
                        <div className="truncate text-xs" style={{ color: 'var(--ink-soft)' }}>
                          {r.positionName}
                          {r.positionType === 'sacafranco' ? ' · SF' : ''}
                          {r.window ? ` · ${r.window}` : ''}
                        </div>
                      </td>
                      {(r.cells || []).map((c) => {
                        const m = CELL[c.status] || CELL.none;
                        return (
                          <td key={c.date} className="border-b p-0.5 text-center" style={{ borderColor: 'var(--hairline)' }}>
                            <span
                              className="grid h-7 w-full min-w-[26px] place-items-center rounded-lg text-[11px] font-bold"
                              style={m.style}
                            >
                              {m.label}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
              {[
                { k: 'day', label: 'Día' },
                { k: 'night', label: 'Noche' },
                { k: 'rest', label: 'Libre' },
              ].map(({ k, label }) => (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <span className="grid h-4 w-4 place-items-center rounded text-[10px] font-bold" style={CELL[k].style}>
                    {CELL[k].label}
                  </span>
                  {label}
                </span>
              ))}
            </div>
          </>
        )}
      </Section>

      {/* ── RECENT ACTIVITY (memos feed) — REAL, kept ─────────────────────── */}
      <Section title={t('guards.summary.recentActivity.title')} icon={<Clock className="h-4 w-4" />}>
        <div className="space-y-4">
          {activitiesLoading ? (
            <div className="space-y-2">
              <SkeletonBlock className="h-4 w-1/2" />
              <SkeletonBlock className="h-4 w-2/3" />
              <SkeletonBlock className="h-4 w-1/3" />
            </div>
          ) : activities.length > 0 ? (
            activities.map((activity: SummaryActivity, idx: number) => (
              <div
                key={idx}
                className="flex items-start gap-3 border-b pb-3 last:border-b-0"
                style={{ borderColor: 'var(--hairline)' }}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                  style={{ background: 'var(--brand-wash)', color: 'var(--brand-text)' }}
                >
                  {activity.initial}
                </div>
                <div className="flex-1">
                  {activity.subject && (
                    <p className="mb-0.5 text-xs font-semibold" style={{ color: 'var(--ink-soft)' }}>{activity.subject}</p>
                  )}
                  <p className="text-sm">{activity.message}</p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--ink-faint)' }}>{activity.timestamp}</p>
                </div>
                {activity.badge && <StatusBadge tone="ok" dot={false}>{activity.badge}</StatusBadge>}
              </div>
            ))
          ) : (
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              {t('guards.summary.recentActivity.empty') || 'Sin actividad reciente'}
            </p>
          )}
        </div>
      </Section>
    </div>
  );
}
