import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  pad2, fmtDate, addDays, tzOffsetMs, dateToWall, wallToDate, minLabel, segmentize,
  type Segment,
} from './scheduleTime';
import { useTranslation } from 'react-i18next';
import { nombreDeVigilante } from "@/lib/guardName";
import { Clock, Loader2, MapPin, Pencil, Trash2, User, X } from 'lucide-react';
import { ApiService } from '@/services/api/apiService';
import { toast } from 'sonner';
import { confirmDialog } from '@/components/ui/confirmDialog';
import ContextMenu, { CtxMenuState } from './ContextMenu';
import type { Station, ShiftRecord, GuardOption } from '@/types';
import { stationLabel, stationShort } from "@/lib/stationName";

import { localeActual } from '@/lib/localeActual'
/**
 * Semana/Día timeline for Programador › Horario, Google-Calendar style with a
 * PUESTO sub-axis: DAYS are the top-level COLUMNS and inside each day there is
 * one SUB-COLUMN per estación (the "subclasificación"). HOURS run vertically
 * down the frozen left gutter (tenant wall-clock). Drag on a sub-column to
 * DRAW a work block for THAT estación — you can drag diagonally into the next
 * day (07:00 → 07:00 = 24h turno); overnight blocks split at midnight.
 * Right-click a block for Editar / Duplicar / Eliminar. Blocks are real
 * ad-hoc `shift` rows (same backend as the station "Turno único").
 */

// ─── Types ──────────────────────────────────────────────────────────────────

interface Props {
  tenantId: string;
  view: 'week' | 'day';
  days: Date[]; // visible calendar days (tenant wall). Day view passes 2 (hoy + siguiente).
  stations: Station[];
  shifts: ShiftRecord[];
  guardsPool: GuardOption[];
  guardColorMap: Record<string, string>;
  tz?: string;
  todayStr: string;
  onChanged: () => void; // silent refetch upstream
}

// ─── Tenant-timezone wall-clock helpers ─────────────────────────────────────

const DAY_MS = 86400000;
const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
/* La aritmética de tiempo vive en `scheduleTime.ts` — una sola copia y con
   pruebas. Estaba duplicada aquí y en `Schedule.tsx`: dos versiones de la misma
   matemática, ninguna probada, justo donde un error de una hora no se ve hasta
   que un vigilante ficha. `dateToWall` y `wallToDate` se RE-EXPORTAN porque
   media docena de archivos las importan de aquí desde siempre. */

export { wallToDate, dateToWall } from './scheduleTime';

const wallStrToDate = (s: string, tz?: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
  if (!m) return null;
  return wallToDate(+m[1], +m[2], +m[3], +m[4] * 60 + +m[5], tz);
};

const shiftWallStr = (iso: string, tz?: string): string => {
  const w = dateToWall(new Date(iso), tz);
  return `${w.dateStr}T${pad2(Math.floor(w.minutes / 60))}:${pad2(w.minutes % 60)}`;
};

const addDaysToWallStr = (s: string, n: number): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(.+)$/.exec(s);
  if (!m) return s;
  const d = new Date(+m[1], +m[2] - 1, +m[3] + n);
  return `${fmtDate(d)}T${m[4]}`;
};



/** Middle-button (rueda) drag-to-pan for a scroll container. */
export const startPan = (e: React.MouseEvent, el: HTMLElement | null) => {
  if (e.button !== 1 || !el) return;
  e.preventDefault(); // suppress the browser's middle-click autoscroll/paste
  const sx = e.clientX, sy = e.clientY, sl = el.scrollLeft, st = el.scrollTop;
  const move = (ev: MouseEvent) => {
    el.scrollLeft = sl - (ev.clientX - sx);
    el.scrollTop = st - (ev.clientY - sy);
  };
  const up = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    document.body.style.cursor = '';
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  document.body.style.cursor = 'grabbing';
};



// ─── Component ──────────────────────────────────────────────────────────────

export default function ScheduleTimeline({
  tenantId, view, days, stations, shifts, guardsPool, guardColorMap, tz, todayStr, onChanged,
}: Props) {
  const { t } = useTranslation();
  const hourH = 36; // px per hour, vertical
  const pxPerMin = hourH / 60;
  const snapStep = 30;
  const dayCount = days.length;
  const totalMin = dayCount * 1440;
  const bodyH = 24 * hourH;
  const GUTTER_W = 56;
  const stationCount = Math.max(1, stations.length);
  // Sub-column per estación inside each day (the puesto sub-axis).
  const SUBCOL_W = view === 'day' ? 170 : 120;
  const dayW = stationCount * SUBCOL_W;
  const canvasW = dayCount * dayW;
  const HEADER_H = 46;
  const firstDayStr = fmtDate(days[0]);

  const stationIndexById = useMemo(() => {
    const m = new Map<string, number>();
    stations.forEach((s, i) => m.set(s.id, i));
    return m;
  }, [stations]);

  const stationById = useMemo(() => {
    const m = new Map<string, Station>();
    for (const s of stations) m.set(s.id, s);
    return m;
  }, [stations]);

  const absOfWall = useCallback((w: { dateStr: string; minutes: number }): number => {
    const dd = (Date.parse(w.dateStr + 'T00:00:00Z') - Date.parse(firstDayStr + 'T00:00:00Z')) / DAY_MS;
    return dd * 1440 + w.minutes;
  }, [firstDayStr]);

  // Shift segments per (day, station) cell-column + greedy lane packing inside each.
  const cells = useMemo(() => {
    const m = new Map<string, { items: { seg: Segment; shift: ShiftRecord; lane: number }[]; lanes: number }>();
    for (const s of shifts) {
      if (!s.startTime || !s.endTime) continue;
      const si = stationIndexById.get(s.stationId);
      if (si == null) continue;
      const a = absOfWall(dateToWall(new Date(s.startTime), tz));
      const b = absOfWall(dateToWall(new Date(s.endTime), tz));
      for (const seg of segmentize(a, b, dayCount)) {
        const key = `${seg.dayIdx}:${si}`;
        if (!m.has(key)) m.set(key, { items: [], lanes: 1 });
        m.get(key)!.items.push({ seg, shift: s, lane: 0 });
      }
    }
    for (const cell of m.values()) {
      cell.items.sort((x, y) => x.seg.top - y.seg.top || x.seg.bottom - y.seg.bottom);
      const laneEnds: number[] = [];
      for (const item of cell.items) {
        let lane = laneEnds.findIndex(end => end <= item.seg.top);
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
        laneEnds[lane] = item.seg.bottom;
        item.lane = lane;
      }
      cell.lanes = Math.max(1, laneEnds.length);
    }
    return m;
  }, [shifts, stationIndexById, absOfWall, tz, dayCount]);

  // "Now" marker (only inside today's day band).
  const now = useMemo(() => {
    const w = dateToWall(new Date(), tz);
    const di = days.findIndex(d => fmtDate(d) === w.dateStr);
    return di >= 0 ? { dayIdx: di, minutes: w.minutes } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, tz, shifts]); // shifts changes ~= a refresh tick

  // ─── Drag-to-draw (station comes from the anchor's sub-column) ──────────

  const [draft, setDraft] = useState<{ stationId: string; anchor: number; head: number } | null>(null);
  const draftRectRef = useRef<DOMRect | null>(null);
  const draftStateRef = useRef(draft);
  draftStateRef.current = draft;

  const pointTo = useCallback((clientX: number, clientY: number, rect: DOMRect): { abs: number; stationIdx: number } => {
    const xIn = Math.max(0, Math.min(canvasW - 1, clientX - rect.left));
    const di = Math.max(0, Math.min(dayCount - 1, Math.floor(xIn / dayW)));
    const si = Math.max(0, Math.min(stationCount - 1, Math.floor((xIn - di * dayW) / SUBCOL_W)));
    const rawMin = (clientY - rect.top) / pxPerMin;
    const min = Math.max(0, Math.min(1440, Math.round(rawMin / snapStep) * snapStep));
    return { abs: di * 1440 + min, stationIdx: si };
  }, [canvasW, dayCount, dayW, stationCount, SUBCOL_W, pxPerMin, snapStep]);

  const beginDraw = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    draftRectRef.current = rect;
    const { abs, stationIdx } = pointTo(e.clientX, e.clientY, rect);
    const st = stations[stationIdx];
    if (!st) return;
    setDraft({ stationId: st.id, anchor: abs, head: abs });
  };

  useEffect(() => {
    if (!draft) return;
    const onMove = (e: MouseEvent) => {
      const rect = draftRectRef.current;
      if (!rect) return;
      setDraft(prev => {
        if (!prev) return prev;
        let head = pointTo(e.clientX, e.clientY, rect).abs;
        // A shift can't exceed 24h (backend rule) — clamp the draw live.
        head = Math.max(prev.anchor - 1440, Math.min(prev.anchor + 1440, head));
        return { ...prev, head };
      });
    };
    const onUp = () => {
      const prev = draftStateRef.current;
      setDraft(null);
      if (prev) {
        const a = Math.min(prev.anchor, prev.head);
        const b = Math.max(prev.anchor, prev.head);
        if (b - a >= 30) openBlockModal(a, b, '', prev.stationId);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft !== null, pointTo]);

  // ─── Create / edit block modal ───────────────────────────────────────────

  const [blockModal, setBlockModal] = useState<{ stationId: string; startStr: string; endStr: string; guardId: string; editingId?: string } | null>(null);
  const [blockSaving, setBlockSaving] = useState(false);

  const absToWallStr = useCallback((abs: number): string => {
    const dayDate = addDays(days[0], Math.floor(abs / 1440));
    const m = ((abs % 1440) + 1440) % 1440;
    return `${fmtDate(dayDate)}T${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
  }, [days]);

  const openBlockModal = (aAbs: number, bAbs: number, guardId: string, stationId: string) => {
    setBlockModal({
      stationId: stationId || (stations.length === 1 ? stations[0].id : ''),
      startStr: absToWallStr(aAbs),
      endStr: absToWallStr(bAbs),
      guardId,
    });
  };

  const openEditModal = (s: ShiftRecord) => {
    setBlockModal({
      stationId: s.stationId,
      startStr: shiftWallStr(s.startTime, tz),
      endStr: shiftWallStr(s.endTime, tz),
      guardId: s.guardId,
      editingId: s.id,
    });
  };

  const openDuplicateModal = (s: ShiftRecord) => {
    // Same station/guard/hours, next day — adjust anything in the modal.
    setBlockModal({
      stationId: s.stationId,
      startStr: addDaysToWallStr(shiftWallStr(s.startTime, tz), 1),
      endStr: addDaysToWallStr(shiftWallStr(s.endTime, tz), 1),
      guardId: s.guardId,
    });
  };

  const saveBlock = async () => {
    if (!blockModal) return;
    if (!blockModal.stationId) { toast.error(t('comun.eligeUnPuesto')); return; }
    if (!blockModal.guardId) { toast.error(t('ui.ScheduleTimeline.eligeUnVigilante')); return; }
    const start = wallStrToDate(blockModal.startStr, tz);
    const end = wallStrToDate(blockModal.endStr, tz);
    if (!start || !end) { toast.error(t('ui.ScheduleTimeline.fechasInvalidas')); return; }
    if (end <= start) { toast.error(t('comun.elFinDebeSerPosterior')); return; }
    if (end.getTime() - start.getTime() > 24 * 3600000) { toast.error(t('comun.unTurnoNoPuedeDurar')); return; }
    const station = stationById.get(blockModal.stationId);
    setBlockSaving(true);
    try {
      if (blockModal.editingId) {
        await ApiService.put(`/tenant/${tenantId}/shift/${blockModal.editingId}`, {
          data: {
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            station: blockModal.stationId,
            guard: blockModal.guardId,
            postSiteId: station?.postSiteId,
          },
        });
        toast.success(t('ui.ScheduleTimeline.turnoActualizado'));
      } else {
        // Same semantics as the station "Turno único": clear this guard's
        // overlapping shifts first so the drawn block replaces, not duplicates.
        const overlapping = shifts.filter(s =>
          s.guardId === blockModal.guardId &&
          new Date(s.startTime) < end && new Date(s.endTime) > start,
        );
        if (overlapping.length) {
          await ApiService.delete(`/tenant/${tenantId}/shift?ids=${overlapping.map(s => s.id).join(',')}`).catch(() => {});
        }
        await ApiService.post(`/tenant/${tenantId}/shift`, {
          data: {
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            station: blockModal.stationId,
            guard: blockModal.guardId,
            postSiteId: station?.postSiteId,
          },
        });
        toast.success(overlapping.length ? 'Turno creado (reemplazó turnos solapados)' : 'Turno creado');
      }
      setBlockModal(null);
      onChanged();
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || t('ui.ScheduleTimeline.errorAlGuardarElTurno', 'Error al guardar el turno'));
    } finally {
      setBlockSaving(false);
    }
  };

  // ─── Block detail / delete / context menu ────────────────────────────────

  const [detail, setDetail] = useState<ShiftRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);

  const deleteShift = async (target: ShiftRecord) => {
    const isEngine = !!target.positionId;
    const ok = await confirmDialog({
      title: 'Eliminar turno',
      message: isEngine
        ? 'Este turno fue generado por la rotación de la estación. Puedes eliminarlo, pero puede regenerarse al reoptimizar o reasignar. ¿Eliminar?'
        : '¿Eliminar este turno?',
      confirmText: 'Eliminar',
      tone: 'danger',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await ApiService.delete(`/tenant/${tenantId}/shift/${target.id}`);
      toast.success(t('comun.turnoEliminado'));
      setDetail(null);
      onChanged();
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || 'Error al eliminar');
    } finally {
      setDeleting(false);
    }
  };

  const openBlockCtx = (e: React.MouseEvent, s: ShiftRecord) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Editar turno…', onClick: () => openEditModal(s) },
        { label: 'Duplicar (día siguiente)…', onClick: () => openDuplicateModal(s) },
        { label: 'Ver detalle', onClick: () => setDetail(s) },
        { label: '—' },
        { label: 'Eliminar turno', danger: true, onClick: () => void deleteShift(s) },
      ],
    });
  };

  // Drop a guard chip (from the side panel) onto a sub-column → prefilled block.
  const onCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const guardId = e.dataTransfer.getData('guardId');
    if (!guardId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const { abs, stationIdx } = pointTo(e.clientX, e.clientY, rect);
    openBlockModal(abs, Math.min(totalMin, abs + 12 * 60), guardId, stations[stationIdx]?.id || '');
  };

  // ─── Render helpers ──────────────────────────────────────────────────────

  const guardLabelOf = (s: ShiftRecord) =>
    s.guard ? nombreDeVigilante(s.guard) : (guardsPool.find(g => g.id === s.guardId)?.label || '?');

  // El tinte de la columna sale de los tokens: hoy lleva el acento del usuario,
  // el domingo un rojo tenue. Nada de colores fijos que se peleen con el acento.
  const dayTint = (day: Date): string | null => {
    if (fmtDate(day) === todayStr) return 'color-mix(in oklab, var(--brand) 8%, transparent)';
    if (day.getDay() === 0) return 'color-mix(in oklab, var(--bad) 5%, transparent)';
    return null;
  };

  const draftSegs = useMemo(() => {
    if (!draft) return [];
    const a = Math.min(draft.anchor, draft.head);
    const b = Math.max(draft.anchor, draft.head);
    return b > a ? segmentize(a, b, dayCount) : [];
  }, [draft, dayCount]);

  const draftStationIdx = draft ? (stationIndexById.get(draft.stationId) ?? 0) : 0;


  const inputCls = 'cg-input cg-focus w-full px-3 py-2.5 text-sm';

  const scrollRef = useRef<HTMLDivElement>(null);

  /* AL ABRIR, LA HORA DE AHORA. El lienzo mide 24 h (864 px) y nadie tocaba el
     scroll, así que la vista caía en las 00:00: en una pantalla corta eso es
     abrir el horario en mitad de la madrugada y tener que bajar a mano hasta el
     turno que está corriendo. Se centra la hora actual una sola vez. */
  const yaCentrado = useRef(false);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || yaCentrado.current) return;
    const w = dateToWall(new Date(), tz);
    const y = (w.minutes / 60) * hourH - el.clientHeight / 3;
    el.scrollTop = Math.max(0, y);
    yaCentrado.current = true;
  }, [tz, hourH]);

  return (
    <>
      <div
        ref={scrollRef}
        className="glass flex-1 min-w-0 select-none overflow-auto"
        onMouseDown={e => startPan(e, scrollRef.current)}
      >
        <div style={{ minWidth: GUTTER_W + canvasW }}>
          {/* ─── Frozen header: days row + estación sub-columns row ─── */}
          {/* Cabecera pegajosa: fondo OPACO, nunca `backdrop-filter`. Está por
              encima de una rejilla que puede pintar un año entero de celdas y
              cualquier desenfoque aquí obliga a rasterizarla en cada fotograma
              del desplazamiento. */}
          <div className="sticky top-0 z-30" style={{ background: 'var(--glass-solid)', borderBottom: '1px solid var(--hairline)' }}>
            <div className="flex" style={{ height: HEADER_H }}>
              <div
                className="cg-eyebrow sticky left-0 z-40 flex shrink-0 items-center justify-center"
                style={{ width: GUTTER_W, background: 'var(--glass-solid)', borderRight: '1px solid var(--hairline)' }}
              >
                Hora
              </div>
              <div className="relative" style={{ width: canvasW }}>
                {days.map((day, di) => {
                  const isToday = fmtDate(day) === todayStr;
                  return (
                    <div
                      key={di}
                      className="absolute bottom-0 top-0"
                      style={{
                        left: di * dayW,
                        width: dayW,
                        borderRight: '1px solid var(--hairline)',
                        background: isToday ? 'var(--brand-wash)' : undefined,
                      }}
                    >
                      <div
                        className="truncate px-2 pt-0.5 text-[11px] font-semibold"
                        style={{ color: isToday ? 'var(--brand-text)' : 'var(--ink)' }}
                      >
                        {DAYS_ES[day.getDay()]} {day.getDate()} <span className="font-normal" style={{ color: 'var(--ink-faint)' }}>{day.toLocaleDateString(localeActual(), { month: 'short' })}</span>
                        {view === 'day' && di === 1 && <span className="ml-1 text-[9px] font-normal" style={{ color: 'var(--ink-faint)' }}>{t('ui.ScheduleTimeline.siguiente')}</span>}
                      </div>
                      {/* Estación sub-columns */}
                      <div className="absolute left-0 right-0 bottom-0 flex" style={{ height: 22 }}>
                        {stations.map(st => (
                          <div
                            key={st.id}
                            className="flex shrink-0 items-center overflow-hidden px-1.5 last:border-r-0"
                            style={{ width: SUBCOL_W, borderRight: '1px solid var(--hairline)' }}
                            title={stationLabel(st)}
                          >
                            {/* Too narrow for both — show the nominativo, which
                                is the UNIQUE identifier, and keep the full
                                "P-031 · Caseta Principal" in the tooltip. */}
                            <span className="truncate font-mono text-[9px] font-semibold" style={{ color: 'var(--ink-soft)' }}>{stationShort(st)}</span>
                          </div>
                        ))}
                      </div>
                      {isToday && <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: 'var(--brand)' }} />}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ─── Body: hour gutter (frozen left) + canvas ─── */}
          <div className="flex">
            {/* Hour axis */}
            <div
              className="sticky left-0 z-20 relative shrink-0"
              style={{ width: GUTTER_W, height: bodyH, background: 'var(--glass-solid)', borderRight: '1px solid var(--hairline)' }}
            >
              {Array.from({ length: 24 }, (_, h) => h).map(h => (
                <span
                  key={h}
                  className="absolute right-1.5 -translate-y-1/2 text-[9px] tabular-nums"
                  style={{ top: h * hourH || 6, color: 'var(--ink-faint)' }}
                >
                  {pad2(h)}:00
                </span>
              ))}
              {now && (
                <div className="absolute left-0 right-0 z-10 h-px" style={{ top: now.minutes * pxPerMin, background: 'var(--brand)' }} />
              )}
            </div>

            {/* Canvas */}
            <div
              /* Marca el LIENZO: al arrastrar un bloque, las coordenadas del
                 puntero se convierten contra este rectángulo, no contra el del
                 bloque (que se mueve con el gesto). */
              data-lienzo
              className="relative cursor-crosshair"
              style={{
                width: canvasW,
                height: bodyH,
                backgroundImage: `repeating-linear-gradient(to bottom, var(--hairline) 0, var(--hairline) 1px, transparent 1px, transparent ${hourH}px)`,
              }}
              onMouseDown={beginDraw}
              onDragOver={e => e.preventDefault()}
              onDrop={onCanvasDrop}
            >
              {/* Day bands (tint + today bars) and estación sub-column separators */}
              {days.map((day, di) => {
                const tint = dayTint(day);
                const isToday = fmtDate(day) === todayStr;
                return (
                  <div key={di} className="pointer-events-none">
                    <div
                      className="absolute bottom-0 top-0"
                      style={{ left: di * dayW, width: dayW, backgroundColor: tint || undefined, borderRight: '1px solid var(--hairline)' }}
                    />
                    {stations.slice(0, -1).map((st, si) => (
                      <div key={st.id} className="absolute bottom-0 top-0" style={{ left: di * dayW + (si + 1) * SUBCOL_W, width: 0, borderRight: '1px solid var(--hairline)' }} />
                    ))}
                    {isToday && (
                      <>
                        <div className="absolute bottom-0 top-0 w-[3px] rounded-full" style={{ left: di * dayW, background: 'var(--brand)', opacity: 0.7 }} />
                        <div className="absolute bottom-0 top-0 w-[3px] rounded-full" style={{ left: (di + 1) * dayW - 3, background: 'var(--brand)', opacity: 0.7 }} />
                      </>
                    )}
                  </div>
                );
              })}

              {/* Now line (today's band only) */}
              {now && (
                <div
                  className="pointer-events-none absolute z-10 h-[2px]"
                  style={{ top: now.minutes * pxPerMin, left: now.dayIdx * dayW, width: dayW, background: 'var(--brand)', boxShadow: '0 0 10px 0 var(--brand-glow)' }}
                />
              )}

              {/* Shift block segments, per (day, estación) cell-column */}
              {Array.from(cells.entries()).map(([key, cell]) => {
                const [diStr, siStr] = key.split(':');
                const di = Number(diStr), si = Number(siStr);
                const laneW = (SUBCOL_W - 8) / cell.lanes;
                return cell.items.map(({ seg, shift: s, lane }) => {
                  const color = guardColorMap[s.guardId] || 'var(--ink-faint)';
                  const isEngine = !!s.positionId;
                  const h = (seg.bottom - seg.top) * pxPerMin;
                  const name = guardLabelOf(s);
                  const startW = dateToWall(new Date(s.startTime), tz);
                  const endW = dateToWall(new Date(s.endTime), tz);
                  const timeLbl = `${minLabel(startW.minutes)}–${minLabel(endW.minutes)}`;
                  return (
                    <div
                      key={`${s.id}-${seg.dayIdx}`}
                      /* Cristal PLANO: se pinta uno por turno y por día. Un
                         `backdrop-filter` aquí multiplica el coste por cada
                         bloque de la rejilla. */
                      className={`absolute cursor-pointer overflow-hidden px-1.5 py-0.5 transition-all hover:brightness-110 ${isEngine ? 'border border-dashed' : 'border'} ${seg.first ? 'rounded-t-md' : ''} ${seg.last ? 'rounded-b-md' : ''}`}
                      title={`${name} · ${timeLbl}${isEngine ? ' · generado por rotación' : ' · turno manual'} — clic: detalle · clic derecho: opciones`}
                      /* ── ARRASTRE RETIRADO (2026-08-30) ────────────────────
                         Se probó en producción y hacía DOS cosas mal a la vez:
                           · el `stopPropagation` iba sobre el evento de PUNTERO
                             y el lienzo dibuja con `onMouseDown` —secuencias
                             distintas—, así que un arrastre movía el turno Y
                             abría además el diálogo de «nuevo bloque»;
                           · el desplazamiento salía con el signo y la magnitud
                             equivocados: arrastrar hacia ABAJO adelantaba el
                             turno 3,5 h en vez de retrasarlo.
                         Dos turnos de la empresa de demostración acabaron
                         movidos. Se vuelve al gesto de antes —clic abre el
                         detalle, clic derecho edita— hasta que esté bien hecho
                         y con pruebas. Mejor sin gesto que con uno que mueve
                         turnos a horas que nadie pidió. */
                      onMouseDown={e => { if (e.button === 0) e.stopPropagation(); }}
                      onClick={() => setDetail(s)}
                      onContextMenu={e => openBlockCtx(e, s)}
                      style={{
                        top: seg.top * pxPerMin,
                        height: Math.max(8, h - 1),
                        left: di * dayW + si * SUBCOL_W + 4 + lane * laneW,
                        width: laneW - 2,
                        backgroundColor: `color-mix(in oklab, ${color} ${isEngine ? 10 : 18}%, transparent)`,
                        borderColor: `color-mix(in oklab, ${color} 42%, transparent)`,
                        ...(seg.first ? { borderTop: `3px solid ${color}` } : {}),
                        // El bloque que se está moviendo se apaga: lo que manda
                        // es la vista previa que sigue al dedo.
                      }}
                    >

                      {seg.first && h > 20 && (
                        <span className="block truncate text-[9px] font-semibold" style={{ color: 'var(--ink)' }}>
                          {name.split(' ')[0]}
                        </span>
                      )}
                      {seg.first && h > 38 && (
                        <span className="block truncate text-[8px] tabular-nums" style={{ color: 'var(--ink-soft)' }}>{timeLbl}</span>
                      )}
                    </div>
                  );
                });
              })}

              {/* Draw preview (in the anchor's estación sub-column) */}
              {draftSegs.map(seg => (
                <div
                  key={`draft-${seg.dayIdx}`}
                  className={`brand-glow pointer-events-none absolute flex items-start justify-center border-2 ${seg.first ? 'rounded-t-md' : ''} ${seg.last ? 'rounded-b-md' : ''}`}
                  style={{
                    top: seg.top * pxPerMin,
                    height: (seg.bottom - seg.top) * pxPerMin,
                    left: seg.dayIdx * dayW + draftStationIdx * SUBCOL_W + 3,
                    width: SUBCOL_W - 6,
                    background: 'var(--brand-wash)',
                    borderColor: 'var(--brand)',
                  }}
                >
                  {seg.first && draft && (
                    <span className="whitespace-nowrap px-1 pt-0.5 text-[9px] font-bold tabular-nums" style={{ color: 'var(--brand-text)' }}>
                      {minLabel(Math.min(draft.anchor, draft.head))} – {minLabel(Math.max(draft.anchor, draft.head))} · {((Math.max(draft.anchor, draft.head) - Math.min(draft.anchor, draft.head)) / 60).toFixed(1).replace('.0', '')}h
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {ctxMenu && <ContextMenu menu={ctxMenu} onClose={() => setCtxMenu(null)} />}

      {/* ─── Create / edit block modal ─── */}
      {blockModal && (() => {
        const start = wallStrToDate(blockModal.startStr, tz);
        const end = wallStrToDate(blockModal.endStr, tz);
        const hours = start && end && end > start ? (end.getTime() - start.getTime()) / 3600000 : 0;
        const editing = !!blockModal.editingId;
        // Velo SIN desenfoque: cubre la rejilla entera, y un `backdrop-filter`
        // a pantalla completa sobre un año de celdas cuesta un rasterizado por
        // fotograma. El diálogo ya trae su propio cristal.
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'oklch(0 0 0 / 0.55)' }}
            onClick={() => setBlockModal(null)}
          >
            <div className="glass-raised mx-4 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
                <h4 className="text-sm font-semibold">{editing ? 'Editar turno' : 'Nuevo bloque de trabajo'}</h4>
                <button onClick={() => setBlockModal(null)} className="cg-btn-ghost cg-focus rounded-lg p-1.5"><X size={15} /></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="cg-eyebrow mb-1.5 block">{t('comun.puesto')}</label>
                  <select
                    value={blockModal.stationId}
                    onChange={e => setBlockModal(m => m ? { ...m, stationId: e.target.value } : m)}
                    className={inputCls}
                  >
                    <option value="">{t('ui.ScheduleTimeline.eligeUnPuesto')}</option>
                    {stations.map(s => <option key={s.id} value={s.id}>{stationLabel(s)}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="cg-eyebrow mb-1.5 block">Inicio</label>
                    <input
                      type="datetime-local"
                      value={blockModal.startStr}
                      onChange={e => setBlockModal(m => m ? { ...m, startStr: e.target.value } : m)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="cg-eyebrow mb-1.5 block">Fin</label>
                    <input
                      type="datetime-local"
                      value={blockModal.endStr}
                      onChange={e => setBlockModal(m => m ? { ...m, endStr: e.target.value } : m)}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
                  <Clock size={12} />
                  {hours > 0
                    ? <span>{t("ui.ScheduleTimeline.duracion", "Duración:")}{" "}<b className="tabular-nums" style={{ color: 'var(--ink)' }}>{hours % 1 === 0 ? hours : hours.toFixed(1)}h</b>{hours === 24 ? ' (turno completo)' : ''} · hora de la empresa</span>
                    : <span className="font-medium" style={{ color: 'var(--bad-text)' }}>{t('comun.elFinDebeSerPosterior')}</span>}
                  {hours > 24 && <span className="font-medium" style={{ color: 'var(--bad-text)' }}>{t("ui.ScheduleTimeline.maximo24h", "· máximo 24h")}</span>}
                </div>
                <div>
                  <label className="cg-eyebrow mb-1.5 block">{t('comun.vigilante')}</label>
                  <select
                    value={blockModal.guardId}
                    onChange={e => setBlockModal(m => m ? { ...m, guardId: e.target.value } : m)}
                    className={inputCls}
                  >
                    <option value="">{t('comun.eligeUnVigilante')}</option>
                    {guardsPool.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                  </select>
                  {!editing && (
                    <p className="mt-1.5 text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                      Si el vigilante tiene turnos que se solapan con este bloque, se reemplazan.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--hairline)', background: 'var(--glass-sunken)' }}>
                <button onClick={() => setBlockModal(null)} className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-all">{t('actions.cancel')}</button>
                <button
                  onClick={saveBlock}
                  disabled={blockSaving || !blockModal.guardId || !blockModal.stationId || hours <= 0 || hours > 24}
                  className="cg-btn-brand cg-focus rounded-full px-5 py-2 text-sm font-semibold transition-all disabled:opacity-40"
                >
                  {blockSaving ? <Loader2 size={14} className="animate-spin" /> : (editing ? 'Guardar cambios' : 'Crear turno')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Block detail modal ─── */}
      {detail && (() => {
        const station = stationById.get(detail.stationId);
        const sw = dateToWall(new Date(detail.startTime), tz);
        const ew = dateToWall(new Date(detail.endTime), tz);
        const sameDay = sw.dateStr === ew.dateStr;
        const isEngine = !!detail.positionId;
        // Velo SIN desenfoque: cubre la rejilla entera, y un `backdrop-filter`
        // a pantalla completa sobre un año de celdas cuesta un rasterizado por
        // fotograma. El diálogo ya trae su propio cristal.
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'oklch(0 0 0 / 0.55)' }}
            onClick={() => setDetail(null)}
          >
            <div className="glass-raised mx-4 w-full max-w-xs overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
                <h4 className="text-sm font-semibold">{t('comun.turno')}</h4>
                <button onClick={() => setDetail(null)} className="cg-btn-ghost cg-focus rounded-lg p-1.5"><X size={15} /></button>
              </div>
              <div className="space-y-2.5 p-5 text-sm">
                <div className="flex items-center gap-2">
                  <User size={14} style={{ color: 'var(--ink-faint)' }} />
                  <span className="font-medium">{guardLabelOf(detail)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin size={14} style={{ color: 'var(--ink-faint)' }} />
                  <span>{station ? stationLabel(station) : 'Puesto'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={14} style={{ color: 'var(--ink-faint)' }} />
                  <span className="tabular-nums">
                    {sw.dateStr} {minLabel(sw.minutes)} → {sameDay ? '' : `${ew.dateStr} `}{minLabel(ew.minutes)}
                  </span>
                </div>
                <div
                  className="rounded-xl px-2.5 py-1.5 text-[11px] font-medium"
                  style={{
                    background: `color-mix(in oklab, var(--${isEngine ? 'warn' : 'ok'}) 12%, transparent)`,
                    color: `var(--${isEngine ? 'warn' : 'ok'}-text)`,
                  }}
                >
                  {isEngine ? t('ui.ScheduleTimeline.turnoGeneradoPorRotacion', 'Generado por la rotación del puesto (puede volver a aparecer si lo eliminas).') : t('ui.ScheduleTimeline.turnoManual', 'Turno manual (bloque dibujado o turno único).')}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--hairline)', background: 'var(--glass-sunken)' }}>
                <button
                  onClick={() => void deleteShift(detail)}
                  disabled={deleting}
                  className="cg-focus flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-all disabled:opacity-50"
                  style={{ color: 'var(--bad-text)' }}
                >
                  {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Eliminar
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setDetail(null); openEditModal(detail); }}
                    className="cg-focus flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-all"
                    style={{ color: 'var(--brand-text)' }}
                  >
                    <Pencil size={13} /> Editar
                  </button>
                  <button onClick={() => setDetail(null)} className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-all">{t('actions.close')}</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
