import { useState, useEffect, useCallback } from 'react';
import { Shield, CheckCircle2, CalendarDays, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ApiService } from '@/services/api/apiService';
import { getTenantTimezone } from '@/utils/tenantLocation';
import { EmptyState, Modal } from '@/components/kit';

/** Local (tenant-tz) YYYY-MM-DD for a shift start. */
function localDateKey(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: getTenantTimezone(), year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find(p => p.type === t)?.value || '';
  return `${g('year')}-${g('month')}-${g('day')}`;
}

import { localToday } from '@/lib/utils';
const today = () => localToday();

interface Candidate { id: string; name: string; busy: Set<string>; freeForGaps: number; busyOnGaps: number; }

// Raw API rows read while ranking candidates.
interface AssignmentRow { positionId?: string | null; isRelief?: boolean; guardId?: string; guard?: { id?: string } | null }
interface GuardAutoRow { guardId?: string; id?: string; fullName?: string; label?: string; name?: string }
interface ShiftRow { guardId?: string; guard?: { id?: string } | null; startTime?: string }
interface PositionRow { id: string; type?: string }

/**
 * Assign a Sacafranco (relief) to cover the fijos' rest-day gaps. Shows each
 * candidate as a card with the next-14-day availability strip — the station's gap
 * days are highlighted, and days the guard already works (at any station) are marked
 * busy — so you pick someone free on the days you need.
 */
export default function SacafrancoAssignModal({
  open, onClose, stationId, tenantId, gapDates, onAssigned,
}: {
  open: boolean;
  onClose: () => void;
  stationId: string;
  tenantId: string;
  gapDates: string[]; // station rest-day gap dates (YYYY-MM-DD), next ~14 days
  onAssigned: () => void;
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);

  const days = (() => {
    const out: string[] = [];
    const d = new Date(); d.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) { out.push(new Date(d.getTime() + i * 86400000).toISOString().slice(0, 10)); }
    return out;
  })();
  const gapSet = new Set(gapDates);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [guardsRes, asgRes, shiftsRes] = await Promise.all([
        ApiService.get(`/tenant/${tenantId}/security-guard/autocomplete?limit=200`),
        ApiService.get(`/tenant/${tenantId}/guard-assignments?status=active`),
        ApiService.get(`/tenant/${tenantId}/shift?limit=999`),
      ]);
      const guards: GuardAutoRow[] = Array.isArray(guardsRes) ? guardsRes : (guardsRes?.rows || []);
      const asg: AssignmentRow[] = Array.isArray(asgRes) ? asgRes : (asgRes?.rows || []);
      const shifts: ShiftRow[] = Array.isArray(shiftsRes) ? shiftsRes : (shiftsRes?.rows || []);

      // A guard with an active rotation (fijo or relief) can't take another.
      const occupied = new Set<string>(
        asg.filter((a: AssignmentRow) => a.positionId || a.isRelief)
          .map((a: AssignmentRow) => String(a.guardId || a.guard?.id || '')).filter(Boolean),
      );
      // Busy dates per guard (works somewhere that day).
      const busyBy: Record<string, Set<string>> = {};
      for (const sh of shifts) {
        const gid = String(sh.guardId || sh.guard?.id || '');
        if (!gid || !sh.startTime) continue;
        (busyBy[gid] = busyBy[gid] || new Set()).add(localDateKey(sh.startTime));
      }
      const cands: Candidate[] = guards
        .map((g: GuardAutoRow) => ({ id: String(g.guardId || g.id || ''), name: g.fullName || g.label || g.name || 'Vigilante' }))
        .filter((g) => g.id && !occupied.has(g.id))
        .map((g) => {
          const busy = busyBy[g.id] || new Set<string>();
          const busyOnGaps = gapDates.filter(d => busy.has(d)).length;
          return { ...g, busy, busyOnGaps, freeForGaps: gapDates.length - busyOnGaps };
        })
        .sort((a: Candidate, b: Candidate) => b.freeForGaps - a.freeForGaps || a.busy.size - b.busy.size);
      setCandidates(cands);
    } catch {
      /* api client toasts */
    } finally { setLoading(false); }
  }, [tenantId, gapDates]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const assign = async (g: Candidate) => {
    setAssigning(g.id);
    try {
      // Ensure the station has a Sacafranco position to assign into.
      const posRes: any = await ApiService.get(`/tenant/${tenantId}/station/${stationId}/positions`);
      const posList = Array.isArray(posRes) ? posRes : (posRes?.rows || []);
      let sf = posList.find((p: PositionRow) => p.type === 'sacafranco');
      if (!sf) {
        const created: any = await ApiService.post(`/tenant/${tenantId}/station/${stationId}/positions`, {
          data: { name: 'Sacafranco', type: 'sacafranco', startTime: '07:00', endTime: '19:00', sortOrder: 2, guardsNeeded: 1 },
        });
        sf = created?.data || created;
      }
      await ApiService.post(`/tenant/${tenantId}/guard-assignment`, {
        data: { guardId: g.id, stationId, positionId: sf.id, startDate: today(), isRelief: true },
      });
      toast.success(`${g.name} asignado como sacafranco — quedó asignado como sacafranco — coloca su cobertura día a día en Programador › Horario (arrastra sus días L) o usa Optimizar Sacafrancos`);
      onAssigned();
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || 'No se pudo asignar el sacafranco');
    } finally { setAssigning(null); }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      size="lg"
      icon={<Shield className="h-5 w-5" />}
      title="Asignar sacafranco"
      description="Cubre los días de descanso de los fijos. Más disponibles primero."
    >
      <div className="space-y-3">
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-[10px]" style={{ color: 'var(--ink-soft)' }}>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm" style={{ background: 'color-mix(in oklab, var(--bad) 45%, transparent)' }} /> Día a cubrir (descanso del fijo)</span>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm" style={{ background: 'color-mix(in oklab, var(--warn) 55%, transparent)' }} /> Ocupado en otro puesto</span>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm" style={{ background: 'color-mix(in oklab, var(--ok) 45%, transparent)' }} /> Libre</span>
        </div>

        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12" style={{ color: 'var(--ink-soft)' }}><Loader2 className="animate-spin" /></div>
          ) : candidates.length === 0 ? (
            <EmptyState
              icon={<Shield />}
              title="Sin vigilantes disponibles"
              description="Todos los vigilantes tienen una rotación activa."
            />
          ) : candidates.map((g) => (
            <div key={g.id} className="glass-flat p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold" style={{ background: 'color-mix(in oklab, var(--ok) 16%, transparent)', color: 'var(--ok-text)' }}>
                    {g.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{g.name}</p>
                    <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
                      <CalendarDays size={11} className="inline mr-1" />
                      Libre {g.freeForGaps}/{gapDates.length} días a cubrir{g.busyOnGaps > 0 ? ` · ocupado ${g.busyOnGaps}` : ''}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => assign(g)}
                  disabled={!!assigning}
                  className="cg-focus flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  style={{ background: 'var(--ok)', color: 'var(--brand-ink)' }}
                >
                  {assigning === g.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  Asignar
                </button>
              </div>
              {/* 14-day availability strip */}
              <div className="mt-2 flex gap-0.5">
                {days.map((d) => {
                  const isGap = gapSet.has(d);
                  const isBusy = g.busy.has(d);
                  const fondo = isBusy
                    ? 'color-mix(in oklab, var(--warn) 55%, transparent)'
                    : isGap
                    ? 'color-mix(in oklab, var(--bad) 45%, transparent)'
                    : 'color-mix(in oklab, var(--ok) 28%, transparent)';
                  return <div key={d} title={`${d}${isGap ? ' · descanso del fijo' : ''}${isBusy ? ' · ocupado' : ''}`} className="h-4 flex-1 rounded-sm" style={{ background: fondo }} />;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
