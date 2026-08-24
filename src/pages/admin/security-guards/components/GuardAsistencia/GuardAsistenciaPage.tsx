import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import GuardsLayout from '@/layouts/GuardsLayout';
import { Section, StatCard, EmptyState, SkeletonCards } from '@/components/kit';
import { Button } from '@/components/ui/button';
import attendanceService, { type AttendanceRecord } from '@/lib/api/attendanceService';
import { StatusBadge, ApprovalBadge, STATUS_META, approvalLabel, fmtDateTime, fmtTime, fmtHours } from '@/pages/admin/nomina/shared';
import { CalendarClock, ChevronLeft, ChevronRight, Download, Clock, CalendarDays, Timer, ExternalLink } from 'lucide-react';

type Period = 'week' | 'month';

/** [start, end] bounds for the period containing `anchor` (local time). */
function rangeFor(period: Period, anchor: Date): [Date, Date] {
  const y = anchor.getFullYear(), m = anchor.getMonth(), d = anchor.getDate();
  if (period === 'week') {
    const dow = (anchor.getDay() + 6) % 7; // Monday = 0
    const start = new Date(y, m, d - dow, 0, 0, 0, 0);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999);
    return [start, end];
  }
  return [new Date(y, m, 1, 0, 0, 0, 0), new Date(y, m + 1, 0, 23, 59, 59, 999)];
}

function shiftAnchor(period: Period, anchor: Date, dir: number): Date {
  const d = new Date(anchor);
  if (period === 'week') d.setDate(d.getDate() + dir * 7);
  else d.setMonth(d.getMonth() + dir);
  return d;
}

function rangeLabel(period: Period, anchor: Date): string {
  const [s, e] = rangeFor(period, anchor);
  if (period === 'month') return s.toLocaleDateString('es', { month: 'long', year: 'numeric' });
  const sameMonth = s.getMonth() === e.getMonth();
  return `${s.toLocaleDateString('es', { day: '2-digit', month: sameMonth ? undefined : 'short' })} – ${e.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}`;
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Hoja de asistencia individual del vigilante — sus marcaciones (guardShift)
 * del periodo, con resumen (turnos, días, horas, tardanzas), tabla detallada y
 * exportación CSV. Es la vista de Nómina · Registros filtrada a un solo
 * trabajador. :id = securityGuard id (guardShift.guardNameId).
 */
export default function GuardAsistenciaPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const [rows, setRows] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('month');
  const [anchor, setAnchor] = useState<Date>(() => new Date());

  const [rangeStart, rangeEnd] = useMemo(() => rangeFor(period, anchor), [period, anchor]);

  const load = useCallback(() => {
    if (!id) { setLoading(false); return; }
    setLoading(true);
    attendanceService
      .list({
        'filter[guardName]': id,
        'filter[punchInTimeRange][0]': rangeStart.toISOString(),
        'filter[punchInTimeRange][1]': rangeEnd.toISOString(),
        limit: 500,
        orderBy: 'punchInTime_DESC',
      })
      .then((r) => setRows(r.rows || []))
      .catch((e) => toast.error(e?.message || 'Error al cargar la asistencia'))
      .finally(() => setLoading(false));
  }, [id, rangeStart, rangeEnd]);
  useEffect(load, [load]);

  const summary = useMemo(() => {
    const days = new Set<string>();
    let hours = 0, late = 0;
    for (const r of rows) {
      if (r.punchInTime) days.add(new Date(r.punchInTime).toLocaleDateString('es'));
      hours += Number(r.hoursWorked || 0);
      if (r.status === 'late' || Number(r.lateMinutes || 0) > 0) late += 1;
    }
    return { shifts: rows.length, days: days.size, hours: Math.round(hours * 100) / 100, late };
  }, [rows]);

  const exportCsv = () => {
    if (!rows.length) { toast.error('No hay registros para exportar'); return; }
    const headers = ['Fecha', 'Puesto', 'Programado inicio', 'Programado fin', 'Entrada', 'Salida', 'Horas', 'Tarde (min)', 'Extra (min)', 'Fuera de geocerca', 'Estado', 'Aprobación'];
    const body = rows.map((r) => [
      r.punchInTime ? new Date(r.punchInTime).toLocaleDateString('es') : '',
      r.stationName?.stationName || '',
      fmtTime(r.scheduledStart), fmtTime(r.scheduledEnd),
      r.punchInTime ? new Date(r.punchInTime).toLocaleString('es') : '',
      r.punchOutTime ? new Date(r.punchOutTime).toLocaleString('es') : '',
      r.hoursWorked ?? '', r.lateMinutes ?? 0, r.overtimeMinutes ?? 0,
      r.punchInOutsideGeofence ? 'Sí' : 'No',
      STATUS_META[r.status]?.label || r.status || '', approvalLabel(r.approvalStatus),
    ]);
    const csv = [headers, ...body].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `asistencia_${period}_${rangeStart.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${rows.length} registro(s) exportado(s)`);
  };

  return (
    <GuardsLayout navKey="keep-safe" title="guards.nav.asistencia">
      <div className="mx-auto max-w-6xl space-y-4 pb-24">
        {/* Resumen del periodo */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={<CalendarClock />} accent="blue" label="Turnos" value={String(summary.shifts)} />
          <StatCard icon={<CalendarDays />} accent="green" label={t("ui.GuardAsistencia.diasTrabajados", "Días trabajados")} value={String(summary.days)} />
          <StatCard icon={<Clock />} accent="primary" label="Horas totales" value={summary.hours.toFixed(2)} />
          <StatCard icon={<Timer />} accent="orange" label="Tardanzas" value={String(summary.late)} />
        </div>

        <Section
          title="Hoja de asistencia"
          icon={<CalendarClock className="h-4 w-4" />}
          action={
            <div className="flex flex-wrap items-center gap-2">
              {/* Periodo */}
              <div className="flex items-center rounded-xl border border-border bg-background p-0.5">
                {(['week', 'month'] as Period[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${period === p ? 'brand-fill' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {p === 'week' ? 'Semana' : 'Mes'}
                  </button>
                ))}
              </div>
              {/* Navegador de rango */}
              <div className="flex items-center gap-1 rounded-xl border border-border bg-background px-2 py-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAnchor((a) => shiftAnchor(period, a, -1))}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="min-w-[150px] text-center text-sm font-medium capitalize">{rangeLabel(period, anchor)}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAnchor((a) => shiftAnchor(period, a, 1))}><ChevronRight className="h-4 w-4" /></Button>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={!rows.length}>
                <Download className="h-4 w-4" /> CSV
              </Button>
            </div>
          }
        >
          {loading ? (
            <SkeletonCards count={4} />
          ) : rows.length === 0 ? (
            <EmptyState icon={<CalendarClock />} title="Sin marcaciones" description={`Este vigilante no registró asistencia en ${rangeLabel(period, anchor)}.`} />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5 text-left font-semibold">Fecha</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Puesto</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Entrada</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Salida</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Horas</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Estado</th>
                    <th className="px-3 py-2.5 text-left font-semibold">{t("ui.GuardAsistencia.aprobacion", "Aprobación")}</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20">
                      <td className="px-3 py-2.5 text-foreground">{r.punchInTime ? new Date(r.punchInTime).toLocaleDateString('es', { day: '2-digit', month: 'short' }) : '—'}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{r.stationName?.stationName || '—'}</td>
                      <td className="px-3 py-2.5 tabular-nums">{fmtDateTime(r.punchInTime)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{r.punchOutTime ? fmtDateTime(r.punchOutTime) : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmtHours(r.hoursWorked)}</td>
                      <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-2.5"><ApprovalBadge status={r.approvalStatus} /></td>
                      <td className="px-3 py-2.5 text-right">
                        <Link to={`/nomina/records?focus=${r.id}`} className="inline-flex items-center gap-1 text-xs brand-text hover:underline" title="Ver en Asistencia">
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
