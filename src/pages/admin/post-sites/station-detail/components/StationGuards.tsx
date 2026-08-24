import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, UserPlus, Users, Repeat, Shield, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '@/components/ui/confirmDialog';
import { ApiService } from '@/services/api/apiService';
import { Section, EmptyState, SkeletonCards, StatusBadge, Modal } from '@/components/kit';
import { FIELD_CLS_LG, LabeledField } from '@/pages/admin/clientes/components/_shared/tab-kit';
import { Button } from '@/components/ui/button';
import ShiftAssignModal from './ShiftAssignModal';
import { localToday } from '@/lib/utils';
import type { Station } from '@/types';

interface StationDetail extends Station {
  startingTimeInDay?: string | null;
  finishTimeInDay?: string | null;
}

type Props = { station: StationDetail; stationId: string; postSiteId: string };
type PosType = 'fijo' | 'sacafranco';

// A scheduler position row from `/station/:id/positions`.
interface PositionRow { id: string; type?: string; startTime?: string; endTime?: string; name?: string }

interface Assignment {
  id: string;                    // row key: `a:<assignmentId>` or `s:<userId>`
  assignmentId: string | null;   // guardAssignment id, if any
  guardUserId: string;
  guardName: string;
  positionId: string | null;
  positionName: string;
  type: PosType;
  rotation: string;
  workDays: Set<string>;
  shiftIds: string[];            // all of this guard's shift ids at the station
}

// LOCAL calendar date (not UTC): toISOString() rolls to the next day for
// evening assignments in negative-UTC zones (Ecuador UTC-5 after 19:00), which
// pushed "today's" shift to tomorrow. Use the operator's wall-clock date.
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Local YYYY-MM-DD key (don't use toISOString — it shifts by timezone).
const dk = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const WEEKDAY = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
// The next 4 weeks (28 days), starting today.
const NEXT_DAYS: Date[] = Array.from({ length: 28 }, (_, i) => {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d;
});

/** A 4-week strip: filled on the days this guard works, muted on days off. For a
 *  fijo, the muted (rest) days are exactly what the sacafranco should fill. A
 *  small gap separates each week. */
function CoverageStrip({ work, type }: { work: Set<string>; type: PosType }) {
  if (!work || work.size === 0) return null;
  // El sacafranco (relevo) se lee siempre en el semántico «info»; el fijo, en el
  // acento de la marca. Ninguno es un color escrito a mano.
  const onFill = type === 'sacafranco' ? 'var(--info)' : 'var(--brand)';
  return (
    <div className="mt-1.5 flex gap-px overflow-x-auto pb-1">
      {NEXT_DAYS.map((d, i) => {
        const on = work.has(dk(d));
        const isToday = i === 0;
        const weekGap = i > 0 && i % 7 === 0 ? 'ml-1.5' : '';
        return (
          <div
            key={i}
            title={`${dk(d)} — ${on ? (type === 'sacafranco' ? 'cubre' : 'trabaja') : 'descansa'}`}
            className={`flex h-6 w-[18px] shrink-0 flex-col items-center justify-center rounded-sm text-[8px] font-semibold leading-none ${weekGap}`}
            style={{
              background: on ? onFill : 'var(--glass-sunken)',
              color: on ? 'var(--brand-ink)' : 'var(--ink-faint)',
              boxShadow: isToday ? 'inset 0 0 0 1px var(--ink-soft)' : undefined,
            }}
          >
            <span className="opacity-60">{WEEKDAY[d.getDay()]}</span>
            <span>{d.getDate()}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function StationGuards({ station, stationId, postSiteId }: Props) {
  const { t } = useTranslation();
  const tenantId = (station?.tenantId || localStorage.getItem('tenantId') || '') as string;
  const [showShiftModal, setShowShiftModal] = useState(false);

  const [rows, setRows] = useState<Assignment[]>([]);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [guards, setGuards] = useState<{ id: string; label: string }[]>([]);
  // Vigilantes with an active rotation ANYWHERE — excluded from the picker so an
  // occupied vigilante can never be chosen.
  const [occupiedGuardIds, setOccupiedGuardIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // modal state: 'fijo' | 'sacafranco' = assign new; or a change target.
  const [assignType, setAssignType] = useState<PosType | null>(null);
  const [changeTarget, setChangeTarget] = useState<Assignment | null>(null);
  const [pickGuard, setPickGuard] = useState('');
  const [assignStart, setAssignStart] = useState(() => localToday());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    setError(null);
    try {
      const ts = Date.now();
      const [aRes, pRes, gRes, sRes, allARes]: any[] = await Promise.all([
        ApiService.get(`/tenant/${tenantId}/guard-assignments?stationId=${encodeURIComponent(stationId)}&status=active&_=${ts}`).catch(() => []),
        ApiService.get(`/tenant/${tenantId}/station/${encodeURIComponent(stationId)}/positions?_=${ts}`).catch(() => []),
        ApiService.get(`/tenant/${tenantId}/security-guard?limit=999&_=${ts}`).catch(() => []),
        ApiService.get(`/tenant/${tenantId}/shift?filter[station]=${encodeURIComponent(stationId)}&limit=999&_=${ts}`).catch(() => []),
        ApiService.get(`/tenant/${tenantId}/guard-assignments?status=active&_=${ts}`).catch(() => []),
      ]);

      // Alias map: any guard id (securityGuard id, user id) -> canonical user id.
      // Lets us match shifts (which may reference either) to one guard reliably.
      const gRows = Array.isArray(gRes) ? gRes : (gRes?.rows ?? []);
      const aliasToUser: Record<string, string> = {};
      const nameByUser: Record<string, string> = {};
      const guardOptions: { id: string; label: string }[] = [];
      for (const r of gRows) {
        const u = r.guard || r;
        const userId = String(u.id || r.guardId || r.id || '');
        if (!userId) continue;
        const label = u.fullName || r.fullName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || '—';
        aliasToUser[userId] = userId;
        if (r.id) aliasToUser[String(r.id)] = userId;
        if (r.guardId) aliasToUser[String(r.guardId)] = userId;
        if (u.id) aliasToUser[String(u.id)] = userId;
        nameByUser[userId] = label;
        guardOptions.push({ id: userId, label });
      }
      setGuards(guardOptions.filter((x) => x.id && x.label));

      // Occupied vigilantes = anyone with an active ROTATION assignment anywhere.
      const allA = Array.isArray(allARes) ? allARes : (allARes?.rows ?? []);
      const occ = new Set<string>();
      for (const a of allA) {
        const isRot = a.kind ? a.kind === 'rotation' : (!!a.positionId || !!a.isRelief);
        if (!isRot) continue;
        const gid = String(a.guardId || a.guard?.id || '');
        if (gid) occ.add(aliasToUser[gid] || gid);
      }
      setOccupiedGuardIds(occ);

      // Per-guard work-days + shift ids from generated shifts (source of truth —
      // the Turnos tab writes raw shifts), canonicalized to the user id.
      const workByGuard: Record<string, Set<string>> = {};
      const shiftIdsByGuard: Record<string, string[]> = {};
      const sRows = Array.isArray(sRes) ? sRes : (sRes?.rows ?? []);
      for (const s of sRows) {
        const when = s.startTime || s.start || s.punchInTime;
        if (!when) continue;
        const d = new Date(when);
        if (isNaN(d.getTime())) continue;
        const sg = s.guard || s.securityGuard || s.user || {};
        const rawId = sg.id || sg.guardId || s.guardId || s.securityGuardId;
        if (!rawId) continue;
        const uid = aliasToUser[String(rawId)] || String(rawId);
        (workByGuard[uid] ||= new Set()).add(dk(d));
        (shiftIdsByGuard[uid] ||= []).push(String(s.id));
        if (!nameByUser[uid]) {
          const nm = sg.fullName || `${sg.firstName || ''} ${sg.lastName || ''}`.trim() || sg.email;
          if (nm) nameByUser[uid] = nm;
        }
      }

      // SINGLE SOURCE OF TRUTH = guardAssignment (the exact same records as
      // Programador › Horario). Adding/removing/changing here and there operate on
      // these, so the two views can never diverge. Shifts only enrich each row
      // with the guard's work-days/ids (for display + cleanup). A one-off "Turno
      // único" creates a raw shift, NOT an assignment, so it is not listed here.
      const aRows = Array.isArray(aRes) ? aRes : (aRes?.rows ?? []);
      const out: Assignment[] = [];
      for (const a of aRows) {
        const g = a.guard || a.user || {};
        const pos = a.position || {};
        const type: PosType = (pos.type || (a.isRelief ? 'sacafranco' : 'fijo')) as PosType;
        const uid = aliasToUser[String(g.id || a.guardId || '')] || String(g.id || a.guardId || '');
        out.push({
          id: `a:${a.id}`,
          assignmentId: String(a.id),
          guardUserId: uid,
          guardName: g.fullName || `${g.firstName || ''} ${g.lastName || ''}`.trim() || g.email || nameByUser[uid] || '—',
          positionId: a.positionId || pos.id || null,
          positionName: pos.name || (type === 'sacafranco' ? 'Sacafranco' : 'Fijo'),
          type,
          rotation: a.rotationStyle?.name || a.rotationStyle?.pattern || '',
          workDays: workByGuard[uid] || new Set(),
          shiftIds: Array.from(new Set(shiftIdsByGuard[uid] || [])),
        });
      }
      setRows(out);
      setPositions(Array.isArray(pRes) ? pRes : (pRes?.rows ?? []));
    } catch (e: any) {
      setError(e?.message || t('station.guards.loadError', 'Error al cargar vigilantes'));
    } finally {
      setLoading(false);
    }
  }, [stationId, tenantId, t]);

  useEffect(() => { load(); }, [load]);

  // Find a position of the given type, creating one if the station has none.
  const ensurePosition = async (type: PosType): Promise<string | null> => {
    // Reuse a FREE position of this type (never one already occupied by an active
    // assignment) — so we never put two vigilantes on the same puesto.
    const occupiedPos = new Set(rows.filter((r) => r.positionId).map((r) => String(r.positionId)));
    const free = positions.find((p: PositionRow) => (p.type || 'fijo') === type && !occupiedPos.has(String(p.id)));
    if (free) return free.id;
    try {
      const created: any = await ApiService.post(`/tenant/${tenantId}/station/${encodeURIComponent(stationId)}/positions`, {
        name: type === 'sacafranco' ? 'Sacafranco' : 'Fijo 1',
        type,
        startTime: station?.startingTimeInDay || '07:00',
        endTime: station?.finishTimeInDay || '19:00',
        guardsNeeded: 1,
      });
      const id = created?.id || created?.data?.id || null;
      return id;
    } catch {
      return null; // fall back to an ad-hoc assignment (positionId null)
    }
  };

  const doAssign = async (guardUserId: string, type: PosType, positionId?: string | null, startDate?: string) => {
    const pid = positionId !== undefined ? positionId : await ensurePosition(type);
    await ApiService.post(`/tenant/${tenantId}/guard-assignment`, {
      guardId: guardUserId,
      stationId,
      positionId: pid || undefined,
      isRelief: type === 'sacafranco',
      startDate: startDate || today(),
    });
  };

  // Delete shifts in batches (keeps the request URL within limits).
  const deleteShifts = async (ids: string[]) => {
    for (let i = 0; i < ids.length; i += 40) {
      const grp = ids.slice(i, i + 40);
      if (grp.length) await ApiService.delete(`/tenant/${tenantId}/shift?ids=${grp.map(encodeURIComponent).join(',')}`);
    }
  };

  const submitAssign = async () => {
    if (!pickGuard) { toast.error(t('station.guards.pickGuard', 'Selecciona un vigilante')); return; }
    setSaving(true);
    try {
      if (changeTarget && changeTarget.assignmentId) {
        // End the old assignment (+ its shifts), then create a fresh assignment
        // for the new guard on the SAME position. Single source = guardAssignment,
        // so this stays in sync with Programador › Horario.
        await ApiService.delete(`/tenant/${tenantId}/guard-assignment/${encodeURIComponent(changeTarget.assignmentId)}`);
        await deleteShifts(changeTarget.shiftIds);
        await doAssign(pickGuard, changeTarget.type, changeTarget.positionId, assignStart);
        toast.success(t('station.guards.changed', 'Vigilante actualizado'));
      } else if (assignType) {
        await doAssign(pickGuard, assignType, undefined, assignStart);
        toast.success(assignType === 'sacafranco'
          ? t('station.guards.sacaAdded', 'Sacafranco asignado')
          : t('station.guards.added', 'Vigilante asignado'));
      }
      closeModal();
      load();
      // Let the site-level roster (and any other listener) refresh.
      try { window.dispatchEvent(new CustomEvent('assignments:changed')); } catch { /* noop */ }
    } catch (e: any) {
      toast.error(e?.message || t('station.guards.assignFailed', 'No se pudo asignar'));
    } finally {
      setSaving(false);
    }
  };

  const removeGuard = async (a: Assignment) => {
    if (!(await confirmDialog({ title: 'Quitar vigilante', message: `¿Quitar a ${a.guardName} de este puesto? Se eliminarán sus turnos en este sitio.`, confirmText: 'Quitar', tone: 'danger' }))) return;
    try {
      if (a.assignmentId) {
        await ApiService.delete(`/tenant/${tenantId}/guard-assignment/${encodeURIComponent(a.assignmentId)}`);
      }
      // Remove their shifts so they disappear from the Turnos tab too.
      await deleteShifts(a.shiftIds);
      setRows((rs) => rs.filter((x) => x.id !== a.id));
      try { window.dispatchEvent(new CustomEvent('assignments:changed')); } catch { /* noop */ }
      toast.success(t('station.guards.removed', 'Vigilante removido del puesto y de los turnos'));
    } catch (e: any) {
      toast.error(e?.message || t('station.guards.removeFailed', 'No se pudo quitar'));
    }
  };

  const openAssign = (type: PosType) => { setAssignType(type); setChangeTarget(null); setPickGuard(''); setAssignStart(localToday()); };
  const openChange = (a: Assignment) => { setChangeTarget(a); setAssignType(null); setPickGuard(''); setAssignStart(localToday()); };
  const closeModal = () => { setAssignType(null); setChangeTarget(null); setPickGuard(''); };

  // Alternation = a custom station with >=2 fijo positions SHARING one block
  // (24x24 etc.). There the fijos cover the same block on opposite DAYS, so the
  // operator picks each guard's start day and the backend phases the assignment
  // to it — "empieza hoy" ⇒ trabaja hoy.
  const isAlternation = useMemo(() => {
    const fijos = (positions || []).filter((p: PositionRow) => (p.type || 'fijo') !== 'sacafranco');
    const blocks = new Map<string, number>();
    for (const p of fijos) {
      const k = `${p.startTime || ''}|${p.endTime || ''}`;
      blocks.set(k, (blocks.get(k) || 0) + 1);
    }
    return Array.from(blocks.values()).some((n) => n >= 2);
  }, [positions]);

  const modalOpen = !!assignType || !!changeTarget;
  const modalIsSaca = assignType === 'sacafranco' || changeTarget?.type === 'sacafranco';

  return (
    <>
      <Section
        icon={<Users />}
        title={
          <>
            {t('station.guards.title', 'Vigilantes Asignados')}
            {rows.length > 0 && <span className="ml-2 font-normal text-muted-foreground">({rows.length})</span>}
          </>
        }
        action={
          <div className="flex items-center gap-2">
            <Button variant="brand" size="sm" className="rounded-full" onClick={() => setShowShiftModal(true)}>
              <UserPlus size={15} /> {t('station.guards.assign', 'Asignar vigilante')}
            </Button>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => openAssign('sacafranco')}>
              <Repeat size={15} /> {t('station.guards.addSaca', 'Agregar sacafranco')}
            </Button>
          </div>
        }
        contentClassName="-mx-5 -mb-5"
      >
        <div className="px-5">
          <p className="-mt-2 text-xs text-muted-foreground">
            {t('station.guards.hint', 'El fijo cubre la rotación; el sacafranco se coloca a mano en Programador › Horario (o con Optimizar Sacafrancos).')}
          </p>
          {rows.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <span className="font-medium">{t("ui.StationGuards.proximas4Semanas", "Próximas 4 semanas:")}</span>
              <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-primary" /> Fijo trabaja</span>
              <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded" style={{ background: 'var(--info)' }} /> Sacafranco cubre</span>
              <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-muted/40" /> Descanso</span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="px-5 pb-5 pt-4"><SkeletonCards count={3} /></div>
        ) : error ? (
          <div className="p-6 text-sm" style={{ color: 'var(--bad-text)' }}>{error}</div>
        ) : rows.length === 0 ? (
          <div className="px-5 pb-5 pt-4">
            <EmptyState
              icon={<Users />}
              title={t('station.guards.empty', 'No hay vigilantes asignados. Asigna un vigilante fijo para empezar.')}
              action={
                <Button variant="brand" size="sm" className="rounded-full" onClick={() => setShowShiftModal(true)}>
                  <UserPlus size={15} /> {t('station.guards.assign', 'Asignar vigilante')}
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y border-t">
            {rows.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-6 py-3 hover:bg-muted/40">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={a.type === 'sacafranco'
                    ? { background: 'color-mix(in oklab, var(--info) 14%, transparent)', color: 'var(--info-text)' }
                    : { background: 'var(--brand-wash)', color: 'var(--brand-text)' }}
                >
                  {a.type === 'sacafranco' ? <Repeat size={16} /> : <Shield size={16} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{a.guardName}</span>
                    <StatusBadge tone={a.type === 'sacafranco' ? 'blue' : 'primary'} dot={false}>
                      {a.type === 'sacafranco' ? 'Sacafranco' : 'Fijo'}
                    </StatusBadge>
                    {a.rotation ? <span className="text-xs text-muted-foreground">· {a.rotation}</span> : null}
                  </div>
                  <div className="text-xs text-muted-foreground">{a.positionName}</div>
                  <CoverageStrip work={a.workDays} type={a.type} />
                </div>
                <button onClick={() => openChange(a)} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted/40" title={t('station.guards.change', 'Cambiar')}>
                  <RefreshCw size={13} /> {t('station.guards.change', 'Cambiar')}
                </button>
                <button onClick={() => removeGuard(a)} className="cg-focus rounded-md p-1.5" style={{ color: 'var(--bad-text)' }} title={t('station.guards.remove', 'Quitar')}>
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Assign / Change modal */}
      <Modal
        open={modalOpen}
        onOpenChange={(o) => { if (!o) closeModal(); }}
        size="sm"
        icon={modalIsSaca ? <Repeat className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
        title={changeTarget ? t('station.guards.changeTitle', 'Cambiar vigilante') : modalIsSaca ? t('station.guards.sacaTitle', 'Agregar sacafranco') : t('station.guards.assignTitle', 'Asignar vigilante')}
        description={modalIsSaca
          ? t('station.guards.sacaSub', 'Cubre los días de descanso del vigilante fijo')
          : t('station.guards.assignSub', 'Vigilante fijo de la rotación del puesto')}
        footer={
          <>
            <Button variant="outline" onClick={closeModal}>{t('common.cancel', 'Cancelar')}</Button>
            <Button onClick={submitAssign} disabled={saving || !pickGuard}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              {changeTarget ? t('station.guards.save', 'Guardar') : t('station.guards.assignBtn', 'Asignar')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
              {changeTarget && (
                <div className="glass-sunken px-3 py-2.5 text-sm">
                  {t('station.guards.replacing', 'Reemplazando a')} <span className="font-medium text-foreground">{changeTarget.guardName}</span>
                </div>
              )}
              <LabeledField label={t('station.guards.guard', 'Vigilante')}>
                <select value={pickGuard} onChange={(e) => setPickGuard(e.target.value)} className={FIELD_CLS_LG} autoFocus>
                  <option value="">{t('station.guards.selectGuard', 'Seleccionar vigilante…')}</option>
                  {guards.filter((g) => !occupiedGuardIds.has(g.id)).map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                </select>
                {guards.filter((g) => !occupiedGuardIds.has(g.id)).length === 0 && (
                  <p className="mt-1.5 text-[11px]" style={{ color: 'var(--warn-text)' }}>{t('station.guards.allBusy', 'Todos los vigilantes ya tienen una asignación activa.')}</p>
                )}
              </LabeledField>

              {/* Alternation (24x24 etc.): the operator picks the day this guard
                  starts working. The backend phases the rotation to it, so
                  "empieza hoy" = trabaja hoy. Assign the partner starting the
                  next day and they alternate automatically. */}
              {!modalIsSaca && isAlternation && (
                <LabeledField label={t('station.guards.startDay', 'Primer día de turno')}>
                  <input
                    type="date"
                    value={assignStart}
                    onChange={(e) => setAssignStart(e.target.value)}
                    className={FIELD_CLS_LG}
                  />
                  <p className="mt-1.5 text-[11px] text-muted-foreground">{t('station.guards.startDayHint', 'Este vigilante trabaja ese día y luego día por medio. Asigna a su relevo empezando al día siguiente.')}</p>
                </LabeledField>
              )}
        </div>
      </Modal>

      <ShiftAssignModal
        open={showShiftModal}
        onClose={() => setShowShiftModal(false)}
        onSaved={() => { setShowShiftModal(false); load(); }}
        station={station}
        stationId={stationId}
        postSiteId={postSiteId}
      />
    </>
  );
}
