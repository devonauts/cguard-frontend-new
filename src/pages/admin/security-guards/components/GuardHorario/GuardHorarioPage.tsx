import type * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import AppLayout from '@/layouts/app-layout';
import GuardsLayout from '@/layouts/GuardsLayout';
import { Section, EmptyState } from '@/components/kit';
import { Button } from '@/components/ui/button';
import securityGuardService from '@/lib/api/securityGuardService';
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import type { ScheduleSnapshot } from '../../guardDetailTypes';

// Must stay identical to the client ScheduleCard legend — same engine
// (scheduleGridService) feeds both, so the codes must read the same too.
// Día y noche NO son estados semánticos: el día toma el azul informativo y la
// noche el acento de marca. El hueco de cobertura SÍ lo es y va en rojo fijo.
const CELL: Record<string, { label: string; style: React.CSSProperties; title: string }> = {
  day: {
    label: 'D',
    style: { background: 'color-mix(in oklab, var(--info) 16%, transparent)', color: 'var(--info-text)' },
    title: 'Turno de día',
  },
  night: {
    label: 'N',
    style: { background: 'var(--brand-wash)', color: 'var(--brand-text)' },
    title: 'Turno de noche',
  },
  rest: {
    label: 'L',
    style: { background: 'var(--glass-sunken)', color: 'var(--ink-soft)' },
    title: 'Libre',
  },
  gap: {
    label: '!',
    style: { background: 'color-mix(in oklab, var(--bad) 16%, transparent)', color: 'var(--bad-text)' },
    title: 'Sin turno generado (hueco de cobertura)',
  },
  none: {
    label: '·',
    style: { color: 'var(--ink-faint)' },
    title: 'Sin rotación configurada',
  },
};

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Horario — read-only rotation grid (D/N/L) for a single vigilante across all
 * their stations/positions. Rotation is configured on the station, so there is
 * no CRUD here. Mirrors the client ScheduleCard grid. :id = securityGuard id.
 */
export default function GuardHorarioPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const [data, setData] = useState<ScheduleSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [start, setStart] = useState<string | undefined>(undefined);

  const load = async (quiet = false) => {
    if (!id) { setLoading(false); return; }
    if (!quiet) setLoading(true);
    try {
      const d = await securityGuardService.getSchedule(id, { startDate: start });
      setData(d);
    } catch { /* silent */ } finally { setLoading(false); }
  };
  useEffect(() => { setLoading(true); load(); /* eslint-disable-next-line */ }, [id, start]);

  const days = data?.days || [];
  const rows = data?.rows || [];

  const shiftWindow = (deltaDays: number) => {
    const cur = data?.startDate ? new Date(`${data.startDate}T00:00:00`) : new Date();
    cur.setDate(cur.getDate() + deltaDays);
    setStart(ymd(cur));
  };

  const rangeLabel = data?.startDate && data?.endDate
    ? `${new Date(`${data.startDate}T00:00:00`).toLocaleDateString('es-EC', { day: '2-digit', month: 'short' })} – ${new Date(`${data.endDate}T00:00:00`).toLocaleDateString('es-EC', { day: '2-digit', month: 'short' })}`
    : '';

  return (
    <AppLayout>
      <GuardsLayout navKey="keep-safe" title="guards.nav.horario">
        <div className="mx-auto max-w-5xl pb-24">
          <Section
            title={t('comun.horario')}
            icon={<CalendarDays className="h-4 w-4" />}
            action={
              <div className="flex items-center gap-1.5">
                <span className="hidden text-xs sm:inline" style={{ color: 'var(--ink-soft)' }}>{rangeLabel}</span>
                <Button variant="outline" size="icon-sm" onClick={() => shiftWindow(-14)} title={t('ui.GuardHorarioPage.quincenaAnterior')}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" onClick={() => setStart(undefined)}>Hoy</Button>
                <Button variant="outline" size="icon-sm" onClick={() => shiftWindow(14)} title={t('ui.GuardHorarioPage.quincenaSiguiente')}><ChevronRight className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon-sm" onClick={() => load()} title="Actualizar"><RefreshCw className="h-4 w-4" /></Button>
              </div>
            }
          >
            {loading && !data ? (
              <div className="py-8 text-center text-sm" style={{ color: 'var(--ink-soft)' }}>{t('comun.cargandoHorario')}</div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<CalendarDays className="h-5 w-5" />}
                title={t('ui.GuardHorarioPage.sinHorario')}
                description={t('ui.GuardHorarioPage.esteVigilanteNoTienePuestos')}
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className="cg-eyebrow sticky left-0 z-10 min-w-[220px] border-b px-2 py-2 text-left" style={{ background: 'var(--glass-solid)', borderColor: 'var(--hairline)' }}>{t('ui.GuardHorarioPage.puestoCliente')}</th>
                        {days.map((d) => (
                          <th
                            key={d.date}
                            className="border-b px-1 py-1 text-center text-[11px] font-medium"
                            style={{ borderColor: 'var(--hairline)', color: d.isToday ? 'var(--brand-text)' : d.weekend ? 'var(--ink-faint)' : 'var(--ink-soft)' }}
                          >
                            <div>{d.dow}</div><div className={`tabular-nums ${d.isToday ? 'font-bold' : ''}`}>{d.day}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.assignmentId || r.positionId} className="transition-colors hover:[background:var(--glass-sunken)]">
                          <td className="sticky left-0 z-10 min-w-[220px] border-b px-2 py-1.5" style={{ background: 'var(--glass-solid)', borderColor: 'var(--hairline)' }}>
                            <div className="text-sm font-semibold">
                              {r.stationName}
                              <span className="font-normal" style={{ color: 'var(--ink-soft)' }}> · {r.positionName}{r.positionType === 'sacafranco' ? ' · SF' : ''}</span>
                            </div>
                            <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                              {[r.sedeName, r.clientName].filter(Boolean).join(' · ')}
                              {r.rotationStyleName ? <span style={{ color: 'var(--ink-faint)' }}> · {r.rotationStyleName}</span> : null}
                            </div>
                          </td>
                          {(r.cells || []).map((c) => {
                            const m = CELL[c.status] || CELL.none;
                            const tip = [m.title, c.hours, c.covering && c.guardName ? `Cubre: ${c.guardName}` : null]
                              .filter(Boolean).join(' · ');
                            return (
                              <td key={c.date} className="border-b p-0.5 text-center" style={{ borderColor: 'var(--hairline)' }}>
                                <span title={tip} className="relative grid h-7 w-full min-w-[26px] place-items-center rounded-lg text-[11px] font-bold" style={m.style}>
                                  {m.label}
                                  {c.covering && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full" style={{ background: 'var(--warn)' }} />}
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
                    { k: 'gap', label: 'Sin turno generado' },
                  ].map(({ k, label }) => (
                    <span key={k} className="inline-flex items-center gap-1.5">
                      <span className="grid h-4 w-4 place-items-center rounded text-[10px] font-bold" style={CELL[k].style}>{CELL[k].label}</span> {label}
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--warn)' }} />{" "}{t('ui.GuardHorarioPage.cubreOtroVigilante')}</span>
                  <span className="ml-auto">{t("ui.GuardHorario.laRotacionSeConfiguraEn", "La rotación se configura en la estación.")}</span>
                </div>
              </>
            )}
          </Section>
        </div>
      </GuardsLayout>
    </AppLayout>
  );
}
