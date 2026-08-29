import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarClock, Sun, Moon, MapPin, Settings2 } from 'lucide-react';
import AppLayout from '@/layouts/app-layout';
import GuardsLayout from '@/layouts/GuardsLayout';
import { Button } from '@/components/ui/button';
import { PageContainer, EmptyState, StatusBadge, SkeletonCards, GlassPanel } from '@/components/kit';
import { ListSection } from './ListSection';
import { supervisorService } from '@/lib/api/supervisorService';

import { localeActual } from '@/lib/localeActual'
interface ScheduleRow {
  date: string | null;
  start: string | null;
  end: string | null;
  kind: 'day' | 'night' | string;
  position: { id: string; name: string; zone: string | null } | null;
}

function fmtTime(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString(localeActual(), { hour: '2-digit', minute: '2-digit' });
}

function fmtDateHeading(v: string): string {
  // v is a YYYY-MM-DD string — parse as local date to avoid tz drift.
  const [y, m, d] = v.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  if (isNaN(date.getTime())) return v;
  const s = date.toLocaleDateString(localeActual(), { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function SupervisorSchedulePage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ScheduleRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    supervisorService
      .getSchedule(id)
      .then((res) => setRows((res?.rows ?? []) as ScheduleRow[]))
      .catch(() => toast.error('No se pudo cargar el horario'))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(load, [load]);

  const manageBtn = (
    <Button variant="outline" size="sm" onClick={() => navigate('/supervisor-positions')}>
      <Settings2 className="mr-2 h-4 w-4" /> {t('ui.SupervisorSchedulePage.configurarRotacion', 'Configurar rotación')}
    </Button>
  );

  // Group upcoming shifts by date, preserving chronological order.
  const groups: { date: string; rows: ScheduleRow[] }[] = [];
  for (const r of rows ?? []) {
    const key = r.date ?? '—';
    let g = groups.find((x) => x.date === key);
    if (!g) {
      g = { date: key, rows: [] };
      groups.push(g);
    }
    g.rows.push(r);
  }

  return (
    <AppLayout>
      <GuardsLayout navKey="supervisors" title="Horario">
        <PageContainer>
          {loading ? (
            <SkeletonCards count={3} />
          ) : !rows || rows.length === 0 ? (
            <EmptyState
              icon={<CalendarClock />}
              title={t('ui.SupervisorSchedulePage.sinHorarioGenerado', 'Sin horario generado')}
              description="Depende del puesto asignado y su rotación. La rotación (día/noche) se configura en el puesto."
              action={manageBtn}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                  Próximos turnos generados a partir del puesto asignado y su rotación.
                </p>
                {manageBtn}
              </div>

              {groups.map((g) => (
                <ListSection key={g.date} title={g.date === "—" ? "Sin fecha" : fmtDateHeading(g.date)} icon={<CalendarClock />}>
                  <div className="space-y-2">
                    {g.rows.map((r, i) => {
                      const night = r.kind === 'night';
                      return (
                        <GlassPanel
                          key={i}
                          flat
                          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <StatusBadge tone={night ? 'info' : 'warn'} dot={false}>
                              {night ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
                              {night ? 'Noche' : 'Día'}
                            </StatusBadge>
                            <span className="text-sm font-semibold tabular-nums">
                              {fmtTime(r.start)} – {fmtTime(r.end)}
                            </span>
                          </div>
                          {r.position && (
                            <span className="inline-flex min-w-0 items-center gap-1.5 text-xs" style={{ color: 'var(--ink-soft)' }}>
                              <MapPin className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">
                                {r.position.name}
                                {r.position.zone ? ` · ${r.position.zone}` : ''}
                              </span>
                            </span>
                          )}
                        </GlassPanel>
                      );
                    })}
                  </div>
                </ListSection>
              ))}
            </>
          )}
        </PageContainer>
      </GuardsLayout>
    </AppLayout>
  );
}
