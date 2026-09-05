import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { History as HistoryIcon, User, Clock, ChevronRight, Flag } from 'lucide-react';
import AppLayout from '@/layouts/app-layout';
import Breadcrumb from '@/components/ui/breadcrumb';
import { PageContainer, PageHeader, Section, StatusBadge, EmptyState, ListRow, SkeletonCards, Toolbar, FIELD_CLS } from '@/components/kit';
import { usePageTitle } from '@/hooks/usePageTitle';
import routeService from '@/lib/api/routeService';
import { localeActual } from '@/lib/localeActual';
import { RUN_STATUS_LABEL, RUN_STATUS_TONE, fmtHora } from './runLabels';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * HISTORIAL DE EJECUCIONES: cada vez que un supervisor recorrió una ruta,
 * con su resultado. Filtra por fechas y estado; cada fila abre la
 * reconstrucción completa.
 */
export default function RouteRunsHistoryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  usePageTitle('Historial de rutas');
  const [from, setFrom] = useState(() => ymd(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(() => ymd(new Date()));
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<any[] | null>(null);
  const locale = localeActual();

  useEffect(() => {
    let vivo = true;
    setRows(null);
    routeService.runHistory({ from, to, status: status || undefined, limit: 200 })
      .then((r) => { if (vivo) setRows(r.rows); })
      .catch((e) => { toast.error(e?.message || 'Error'); if (vivo) setRows([]); });
    return () => { vivo = false; };
  }, [from, to, status]);

  return (
    <AppLayout>
      <Breadcrumb items={[{ label: 'Patrulla vehicular', path: '/vehicle-patrol' }, { label: 'Historial' }]} />
      <PageContainer width="wide">
        <PageHeader icon={<HistoryIcon />} title={t('ui.RouteRunsHistory.titulo', 'Historial de rutas')} subtitle={t('ui.RouteRunsHistory.sub', 'Cada recorrido de supervisión que se ejecutó, con su resultado y su evidencia.')} />
        <Toolbar>
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink-soft)' }}>{t('ui.RouteRunsHistory.desde', 'Desde')}
            <input type="date" className={FIELD_CLS} style={{ width: 170 }} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Desde" />
          </label>
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink-soft)' }}>{t('ui.RouteRunsHistory.hasta', 'Hasta')}
            <input type="date" className={FIELD_CLS} style={{ width: 170 }} value={to} onChange={(e) => setTo(e.target.value)} aria-label="Hasta" />
          </label>
          <select className={FIELD_CLS} style={{ width: 220 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Estado">
            <option value="">{t('ui.RouteRunsHistory.todos', 'Todos los estados')}</option>
            {Object.entries(RUN_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Toolbar>
        <Section title={t('ui.RouteRunsHistory.ejecuciones', 'Ejecuciones')} icon={<Flag />}>
          {rows === null ? <SkeletonCards count={4} /> : rows.length === 0 ? (
            <EmptyState icon={<HistoryIcon />} title={t('ui.RouteRunsHistory.vacio', 'Sin recorridos en este periodo')} />
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <ListRow
                  key={r.id}
                  onClick={() => navigate(`/vehicle-patrol/runs/${r.id}`)}
                  title={r.routeName || t('ui.RouteRunsHistory.ruta', 'Ruta')}
                  subtitle={(
                    <span className="flex flex-wrap gap-x-3">
                      <span>{r.date}</span>
                      {r.supervisorName && <span><User className="mr-1 inline size-3" />{r.supervisorName}</span>}
                      {r.startedAt && <span><Clock className="mr-1 inline size-3" />{fmtHora(r.startedAt, locale)}{r.completedAt ? ` – ${fmtHora(r.completedAt, locale)}` : ''}</span>}
                    </span>
                  )}
                  badges={<StatusBadge tone={RUN_STATUS_TONE[r.status] || 'neutral'}>{RUN_STATUS_LABEL[r.status] || r.status}</StatusBadge>}
                  meta={(
                    <span className="text-xs tabular-nums" style={{ color: 'var(--ink-soft)' }}>
                      {r.summary ? `${r.summary.stopsCompleted}/${r.summary.stopsPlanned}` : `${r.progress?.completed ?? 0}/${r.progress?.total ?? 0}`}
                      {r.summary?.averageInspection != null ? ` · ${Math.round(r.summary.averageInspection)}%` : ''}
                      {r.summary?.criticalFindings ? ` · ${r.summary.criticalFindings} crít.` : ''}
                    </span>
                  )}
                  actions={<ChevronRight className="size-4" style={{ color: 'var(--ink-faint)' }} />}
                />
              ))}
            </div>
          )}
        </Section>
      </PageContainer>
    </AppLayout>
  );
}
