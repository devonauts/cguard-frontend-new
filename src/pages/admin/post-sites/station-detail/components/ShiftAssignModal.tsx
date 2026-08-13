import { localToday, rotationDseOf, nextRestDates, weeklyRestWeekday, shortRestLabel, type RotationCycle } from '@/lib/utils';
import { useEffect, useMemo, useState } from 'react';
import { Loader2, UserPlus, Repeat, CalendarRange, Moon } from 'lucide-react';
import { toast } from 'sonner';
import { ApiService } from '@/services/api/apiService';
import { Modal, Segmented } from '@/components/kit';
import { FIELD_CLS_LG, LabeledField } from '@/pages/admin/clientes/components/_shared/tab-kit';
import { Button } from '@/components/ui/button';
import type { Station } from '@/types';

// Local YYYY-MM-DD (avoid toISOString — it shifts day in negative-UTC zones).
const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface StationDetail extends Station {
  startingTimeInDay?: string | null;
  finishTimeInDay?: string | null;
}

// A scheduler position row from `/station/:id/positions`.
interface PositionRow { id: string; type?: string; sortOrder?: number }
// A rotation style (patrón) — dayShifts/nightShifts/restDays define the cycle.
interface RotationStyleRow extends RotationCycle { id: string; name?: string }
// A raw shift row from `/shift` (only the fields this modal reads).
interface ShiftRow { id?: string; startTime?: string; start?: string; endTime?: string; end?: string }
// A guard autocomplete row.
interface GuardAutoRow { guardId?: string; id?: string; value?: string; fullName?: string; name?: string; label?: string; email?: string }

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called after a successful save. firstDate = the first created turno's date. */
  onSaved: (firstDate?: Date) => void;
  station: StationDetail;
  stationId: string;
  postSiteId: string;
  presetGuardId?: string;
};

/**
 * The single guard-assignment modal (used by the Turnos tab AND "Vigilantes
 * Asignados"). Rotación mode assigns the guard to a POSITION (Vigilante 1/2) via
 * the scheduling engine, which staggers day/night automatically from the
 * station's patrón de rotación — NO per-guard jornada or pattern. "Turno único"
 * creates a one-off shift. Self-contained: loads its own guards + positions.
 */
export default function ShiftAssignModal({ open, onClose, onSaved, station, stationId, postSiteId, presetGuardId }: Props) {
  const tenantId = (station?.tenantId || localStorage.getItem('tenantId') || '') as string;

  const [assignMode, setAssignMode] = useState<'single' | 'rotation'>('rotation');
  const [shiftGuard, setShiftGuard] = useState('');
  const [guardsOptions, setGuardsOptions] = useState<{ id: string; label: string }[]>([]);
  const [loadingGuards, setLoadingGuards] = useState(false);
  const [saving, setSaving] = useState(false);
  // The rotation PHASE comes from the station position (staggered), not a date —
  // so we don't ask for one (no date input). Shifts simply begin today.
  const [rotationStartDate, setRotationStartDate] = useState(() => localToday());
  // Optional end date: assign the guard to the station only until this date (e.g.
  // temporary cover). Empty ⇒ indefinite. Backend already supports endDate.
  const [rotationEndDate, setRotationEndDate] = useState('');
  const [rotationStyles, setRotationStyles] = useState<RotationStyleRow[]>([]);
  const [selectedPositionId, setSelectedPositionId] = useState('');
  const [shiftStart, setShiftStart] = useState('');
  const [shiftEnd, setShiftEnd] = useState('');
  const [positions, setPositions] = useState<PositionRow[]>([]);
  // Occupancy (tenant-wide active rotations) so we never offer a vigilante who
  // already has an assignment, nor a puesto that's already taken.
  const [occupiedGuardIds, setOccupiedGuardIds] = useState<Set<string>>(new Set());
  const [occupiedPositionIds, setOccupiedPositionIds] = useState<Set<string>>(new Set());

  // Assignable positions (puestos). Fijos shown as "Vigilante 1/2…" (they rotate
  // through day AND night, staggered by the engine); sacafranco shown separately.
  // A puesto already taken is flagged `occupied` (disabled in the UI).
  const positionOptions = useMemo(() => {
    const fijos = positions.filter((p: PositionRow) => (p.type || 'fijo') !== 'sacafranco');
    const sacas = positions.filter((p: PositionRow) => (p.type || 'fijo') === 'sacafranco');
    return [
      ...fijos.map((p: PositionRow, i: number) => ({ id: p.id, label: `Vigilante ${i + 1}`, type: 'fijo' as const, occupied: occupiedPositionIds.has(String(p.id)) })),
      ...sacas.map((p: PositionRow, i: number) => ({ id: p.id, label: sacas.length > 1 ? `Sacafranco ${i + 1}` : 'Sacafranco', type: 'sacafranco' as const, occupied: occupiedPositionIds.has(String(p.id)) })),
    ];
  }, [positions, occupiedPositionIds]);

  // Vigilantes free to assign (drop anyone with an active rotation anywhere).
  const availableGuards = useMemo(
    () => guardsOptions.filter((g) => !occupiedGuardIds.has(String(g.id))),
    [guardsOptions, occupiedGuardIds],
  );

  // Live rest-day preview for the selected fijo puesto. THE PHASE IS THE START DATE:
  // the cycle's day-0 (first work day) is the guard's fecha de inicio, so the planner
  // sees "empieza X → descansa Y" and adjusts the start date until the libre is right.
  // No offset knob — the start date is the single control (matches the backend).
  const restPreview = useMemo(() => {
    const pos = positions.find((p) => p.id === selectedPositionId);
    if (!pos || (pos.type || 'fijo') === 'sacafranco') return null;
    const style = rotationStyles.find((s) => String(s.id) === String((station as any).rotationStyleId));
    if (!style) return null;
    const cycle = style.dayShifts + style.nightShifts + style.restDays;
    if (cycle <= 0 || !rotationStartDate) return null;
    const start = new Date(rotationStartDate + 'T12:00:00');
    const offset = ((rotationDseOf(start) % cycle) + cycle) % cycle; // phase = startDate
    const dates = nextRestDates(style, offset, start, style.restDays >= 2 ? 2 : 1);
    return {
      weekday: weeklyRestWeekday(style, offset),
      dates,
      startWeekday: start.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' }),
    };
  }, [positions, selectedPositionId, rotationStyles, station, rotationStartDate]);

  // Initialize + load data each time the modal opens.
  useEffect(() => {
    if (!open) return;
    const startHour = station?.startingTimeInDay || '07:00';
    const endHour = station?.finishTimeInDay || '19:00';
    const target = dateKey(new Date());
    setShiftStart(`${target}T${startHour}`);
    setShiftEnd(`${target}T${endHour}`);
    setShiftGuard(presetGuardId || '');
    setRotationStartDate(target);
    setAssignMode('rotation');
    setSelectedPositionId('');

    (async () => {
      setLoadingGuards(true);
      try {
        const res: any = await ApiService.get(`/tenant/${tenantId}/security-guard/autocomplete?limit=200`);
        const list = Array.isArray(res) ? res : (res?.rows ?? []);
        setGuardsOptions(list.map((r: GuardAutoRow) => ({ id: r.guardId || r.id || r.value || '', label: r.fullName || r.name || r.label || r.email || '' })).filter((g: { id: string; label: string }) => g.id));
      } catch { setGuardsOptions([]); } finally { setLoadingGuards(false); }
    })();
    ApiService.get(`/tenant/${tenantId}/station/${stationId}/positions`).then((r: any) => setPositions(Array.isArray(r) ? r : (r?.rows ?? []))).catch(() => {});
    // Rotation styles → resolve the station's patrón (dayShifts/nightShifts/restDays)
    // so we can preview the guard's rest day.
    ApiService.get(`/tenant/${tenantId}/rotation-styles`).then((r: any) => setRotationStyles(Array.isArray(r) ? r : (r?.rows ?? r?.data?.rows ?? []))).catch(() => {});
    // Tenant-wide active assignments → occupied vigilantes + occupied puestos.
    ApiService.get(`/tenant/${tenantId}/guard-assignments?status=active`).then((r: any) => {
      const rows = Array.isArray(r) ? r : (r?.rows ?? []);
      const og = new Set<string>(); const op = new Set<string>();
      for (const a of rows) {
        const isRotation = a.kind ? a.kind === 'rotation' : (!!a.positionId || !!a.isRelief);
        if (!isRotation) continue;
        const gid = String(a.guardId || a.guard?.id || '');
        if (gid) og.add(gid);
        if (String(a.stationId) === String(stationId) && a.positionId) op.add(String(a.positionId));
      }
      setOccupiedGuardIds(og); setOccupiedPositionIds(op);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Default the puesto to the first FREE one once positions/occupancy load.
  useEffect(() => {
    if (!open) return;
    const free = positionOptions.find((p) => !p.occupied);
    if (free && (!selectedPositionId || positionOptions.find((p) => p.id === selectedPositionId)?.occupied)) {
      setSelectedPositionId(free.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, positionOptions]);

  // A slot already taken by THIS guard is the desired end state, not an error.
  const isBenignSlotConflict = (e: any) => {
    const blob = `${e?.message || ''} ${(() => { try { return JSON.stringify(e?.data ?? e?.response ?? ''); } catch { return ''; } })()}`;
    return /uniq_shift_slot/i.test(blob);
  };

  // Fetch the station's current shifts (fresh — avoids stale-overlap conflicts).
  const fetchCurrentShifts = async (): Promise<ShiftRow[]> => {
    try {
      const r: any = await ApiService.get(`/tenant/${tenantId}/shift?filter[station]=${encodeURIComponent(stationId)}&limit=999&_=${Date.now()}`);
      return Array.isArray(r) ? r : (r?.rows ?? []);
    } catch { return []; }
  };

  // Replace whatever already occupies a slot at this station (one turno per slot).
  const deleteOverlappingShifts = async (list: ShiftRow[], start: Date, end: Date) => {
    const s = start.getTime(); const e = end.getTime();
    const matched = list.filter((r: ShiftRow) => {
      const rs = new Date(r.startTime || r.start || '').getTime();
      const re = new Date(r.endTime || r.end || '').getTime();
      return Number.isFinite(rs) && Number.isFinite(re) && rs < e && re > s;
    });
    const ids = matched.map((r: ShiftRow) => r.id).filter(Boolean);
    if (ids.length) {
      await ApiService.delete(`/tenant/${tenantId}/shift?ids=${ids.join(',')}`);
      matched.forEach((m) => { const i = list.indexOf(m); if (i >= 0) list.splice(i, 1); });
    }
    return ids.length;
  };

  const saveShift = async () => {
    if (!shiftGuard) { toast.error('Seleccione un vigilante'); return; }

    // ── Turno único (one-off ad-hoc shift) ────────────────────────────────────
    if (assignMode === 'single') {
      if (!shiftStart || !shiftEnd) { toast.error('Complete todos los campos'); return; }
      const start = new Date(shiftStart); const end = new Date(shiftEnd);
      if (end <= start) { toast.error('La hora de fin debe ser posterior al inicio'); return; }
      if ((end.getTime() - start.getTime()) > 24 * 60 * 60 * 1000) { toast.error('Un turno no puede durar más de 24 horas'); return; }
      const current = await fetchCurrentShifts();
      setSaving(true);
      try {
        await deleteOverlappingShifts(current, start, end);
        await ApiService.post(`/tenant/${tenantId}/shift`, { data: { startTime: start.toISOString(), endTime: end.toISOString(), station: stationId, guard: shiftGuard, postSiteId } });
        toast.success('Turno creado');
        onSaved(start);
      } catch (e: any) {
        if (isBenignSlotConflict(e)) { toast.success('El vigilante ya estaba asignado a ese turno'); onSaved(start); }
        else toast.error(e?.data?.message || e?.message || 'Error al crear turno');
      } finally { setSaving(false); }
      return;
    }

    // ── Rotación → the scheduling ENGINE (assign to a position) ────────────────
    // The guard is assigned to a station POSITION (Vigilante 1/2). The engine
    // generates the staggered rotation (one starts day, the other night, swapping
    // each cycle) from the station's patrón de rotación. Same path as Programador.
    if (!selectedPositionId) { toast.error('Seleccione el puesto (Vigilante)'); return; }
    const pos = positions.find((p: PositionRow) => p.id === selectedPositionId);
    const isRelief = (pos?.type || 'fijo') === 'sacafranco';
    setSaving(true);
    try {
      // Single POST — the backend derives the rotation phase from startDate
      // (day-0 = fecha de inicio). No offset, no rephase.
      await ApiService.post(`/tenant/${tenantId}/guard-assignment`, {
        data: {
          guardId: shiftGuard,
          stationId,
          positionId: selectedPositionId,
          startDate: rotationStartDate,
          endDate: rotationEndDate || null,
          isRelief,
        },
      });
      toast.success('Vigilante asignado · si es fijo, la rotación se genera automáticamente; los sacafrancos se colocan a mano en Programador › Horario');
      onSaved(new Date(rotationStartDate + 'T12:00:00'));
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || 'Error al asignar');
    } finally { setSaving(false); }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      size="md"
      icon={<UserPlus className="h-5 w-5" />}
      title="Asignar vigilante"
      description="Programa la cobertura del turno de este puesto"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={saveShift} disabled={saving || !shiftGuard || (assignMode === 'rotation' && !selectedPositionId)}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            {assignMode === 'rotation' ? 'Asignar rotación' : 'Crear turno'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
          <Segmented
            className="w-full [&>button]:flex-1"
            value={assignMode}
            onChange={setAssignMode}
            options={[
              { value: 'rotation', label: <span className="inline-flex items-center gap-1.5"><Repeat size={13} /> Rotación</span> },
              { value: 'single', label: <span className="inline-flex items-center gap-1.5"><CalendarRange size={13} /> Turno único</span> },
            ]}
          />

          <LabeledField label="Vigilante">
            {loadingGuards ? (
              <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground"><Loader2 size={12} className="animate-spin" /> Cargando…</div>
            ) : (
              <select value={shiftGuard} onChange={(e) => setShiftGuard(e.target.value)} className={FIELD_CLS_LG}>
                <option value="">Seleccionar vigilante…</option>
                {availableGuards.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
            )}
            {!loadingGuards && availableGuards.length === 0 && (
              <p className="mt-1.5 text-[11px]" style={{ color: 'var(--warn-text)' }}>Todos los vigilantes ya tienen una asignación activa. Libera uno o crea un nuevo vigilante.</p>
            )}
          </LabeledField>

          {assignMode === 'rotation' ? (
            <>
              {/* Puesto (Vigilante): assign to a position — the engine staggers day/night. */}
              <LabeledField label="Puesto">
                {positionOptions.length === 0 ? (
                  <div className="rounded-xl px-3 py-2 text-xs" style={{ background: 'color-mix(in oklab, var(--warn) 12%, transparent)', color: 'var(--warn-text)' }}>Configura primero el horario de la estación (Vista general › Horario del turno) para crear los puestos.</div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {positionOptions.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        disabled={p.occupied}
                        onClick={() => setSelectedPositionId(p.id)}
                        title={p.occupied ? 'Puesto ocupado' : undefined}
                        className="cg-focus rounded-xl border px-3 py-2 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:line-through"
                        style={p.occupied
                          ? { borderColor: 'var(--hairline)', color: 'var(--ink-faint)', opacity: 0.5 }
                          : selectedPositionId === p.id
                            ? { borderColor: 'var(--brand-line)', background: 'var(--brand-wash)', color: 'var(--brand-text)' }
                            : { borderColor: 'var(--hairline)', color: 'var(--ink-soft)' }}
                      >{p.label}{p.occupied ? ' · ocupado' : ''}</button>
                    ))}
                  </div>
                )}
                <p className="mt-1.5 text-[11px] text-muted-foreground">Los vigilantes alternan día y noche según el horario de la estación. El ciclo arranca en su <b>fecha de inicio</b> — cámbiala para mover el día de descanso.</p>
              </LabeledField>

              {/* Fecha de inicio = la fase de la rotación (día-0 del ciclo). */}
              <LabeledField label="Fecha de inicio del turno">
                <input type="date" value={rotationStartDate} onChange={(e) => setRotationStartDate(e.target.value)} className={FIELD_CLS_LG} />
                {restPreview && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2" style={{ borderColor: 'var(--brand-line)', background: 'var(--brand-wash)' }}>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarRange size={13} className="brand-text" /> Empieza <span className="font-medium capitalize text-foreground">{restPreview.startWeekday}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-xs">
                      <Moon size={13} className="brand-text" />
                      {restPreview.weekday
                        ? <span className="text-muted-foreground">Descansa: <span className="font-semibold capitalize brand-text">{restPreview.weekday}</span></span>
                        : <span className="capitalize text-muted-foreground">Descanso: {restPreview.dates.map(shortRestLabel).join(' · ')}</span>}
                    </span>
                  </div>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground/70">Para escalonar dos vigilantes en un puesto 24h, dales fechas de inicio distintas.</p>
              </LabeledField>

              <LabeledField label="Hasta (opcional)">
                <input type="date" value={rotationEndDate} min={rotationStartDate} onChange={(e) => setRotationEndDate(e.target.value)} className={FIELD_CLS_LG} />
                <p className="mt-1 text-[10px] text-muted-foreground/70">Déjalo vacío para una asignación indefinida; pon una fecha para una cobertura temporal.</p>
              </LabeledField>
            </>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <LabeledField label="Inicio">
                <input type="datetime-local" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} className={FIELD_CLS_LG} />
              </LabeledField>
              <LabeledField label="Fin">
                <input type="datetime-local" value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} className={FIELD_CLS_LG} />
              </LabeledField>
            </div>
          )}
      </div>
    </Modal>
  );
}
