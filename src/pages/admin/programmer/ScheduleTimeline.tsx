import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  pad2, fmtDate, addDays, tzOffsetMs, dateToWall, wallToDate, minLabel, segmentize,
  minutosArrastrados,
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
  /* El ref es la VERDAD del trazo mientras dura el gesto, y lo escribe
     `beginDraw` a mano. Aquí se sincronizaba desde el estado en cada render
     (`draftStateRef.current = draft`), lo que pisaría con un valor viejo lo que
     el `mousemove` acaba de escribir. Se deja que lo gobierne el gesto. */
  const draftStateRef = useRef<{ stationId: string; anchor: number; head: number } | null>(null);

  const pointTo = useCallback((clientX: number, clientY: number, rect: DOMRect): { abs: number; stationIdx: number } => {
    const xIn = Math.max(0, Math.min(canvasW - 1, clientX - rect.left));
    const di = Math.max(0, Math.min(dayCount - 1, Math.floor(xIn / dayW)));
    const si = Math.max(0, Math.min(stationCount - 1, Math.floor((xIn - di * dayW) / SUBCOL_W)));
    const rawMin = (clientY - rect.top) / pxPerMin;
    const min = Math.max(0, Math.min(1440, Math.round(rawMin / snapStep) * snapStep));
    return { abs: di * 1440 + min, stationIdx: si };
  }, [canvasW, dayCount, dayW, stationCount, SUBCOL_W, pxPerMin, snapStep]);

  /**
   * DIBUJAR UN BLOQUE. Las escuchas se enganchan AQUÍ, no en un `useEffect`.
   *
   * Tenía el mismo fallo que tenía el arrastre: el efecto que ponía
   * `mousemove`/`mouseup` dependía de que `draft` dejara de ser null, y un
   * efecto corre después del commit y del pintado. Un trazo rápido despachaba
   * todos sus `mousemove` antes de que existiera la escucha, `head` no se movía
   * del ancla, el bloque medía cero minutos y el diálogo no llegaba a abrirse.
   * Con el ratón lento no se notaba; con un gesto decidido, sí.
   */
  const beginDraw = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    draftRectRef.current = rect;
    const { abs, stationIdx } = pointTo(e.clientX, e.clientY, rect);
    const st = stations[stationIdx];
    if (!st) return;
    const inicial = { stationId: st.id, anchor: abs, head: abs };
    draftStateRef.current = inicial;
    setDraft(inicial);

    const onMove = (ev: MouseEvent) => {
      const r = draftRectRef.current;
      const cur = draftStateRef.current;
      if (!r || !cur) return;
      let head = pointTo(ev.clientX, ev.clientY, r).abs;
      // Un turno no puede pasar de 24 h: se acota en vivo (regla del backend).
      head = Math.max(cur.anchor - 1440, Math.min(cur.anchor + 1440, head));
      const next = { ...cur, head };
      draftStateRef.current = next;
      setDraft(next);
    };

    const soltar = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    const onUp = () => {
      soltar();
      const prev = draftStateRef.current;
      draftStateRef.current = null;
      setDraft(null);
      if (!prev) return;
      const a = Math.min(prev.anchor, prev.head);
      const b = Math.max(prev.anchor, prev.head);
      // Menos de media hora es un clic, no un trazo.
      if (b - a >= 30) openBlockModal(a, b, '', prev.stationId);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ─── Create / edit block modal ───────────────────────────────────────────

  const [blockModal, setBlockModal] = useState<{ stationId: string; startStr: string; endStr: string; guardId: string; editingId?: string } | null>(null);

  /* ── REPETICIÓN ────────────────────────────────────────────────────────
     Dibujar un bloque creaba UN turno para UN día: cubrir una semana eran
     siete gestos y un mes, treinta. Eso no es programar, es teclear. Aquí se
     elige de una vez si el trazo es un turno suelto o una temporada.
     `patron` (N trabaja / M descansa) está porque un vigilante de campo no
     hace «lunes a viernes»: hace 4-2 o 6-1, y sin esa opción habría que
     borrar los descansos a mano. */
  type Repeticion = { tipo: 'unica' | 'diaria' | 'dias' | 'intervalo' | 'patron' | 'rotacion'; weekdays: number[]; cadaN: number; trabaja: number; descansa: number; hasta: string };
  const [rep, setRep] = useState<Repeticion>({ tipo: 'unica', weekdays: [1, 2, 3, 4, 5], cadaN: 2, trabaja: 4, descansa: 2, hasta: '' });
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
        const cuerpo = {
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          station: blockModal.stationId,
          guard: blockModal.guardId,
          postSiteId: station?.postSiteId,
        };
        if (rep.tipo === 'unica') {
          await ApiService.post(`/tenant/${tenantId}/shift`, { data: cuerpo });
          toast.success(overlapping.length ? 'Turno creado (reemplazó turnos solapados)' : 'Turno creado');
        } else {
          // La serie la expande el servidor: un día que choque se omite y se
          // informa, en vez de tumbar la temporada entera.
          const r: any = await ApiService.post(`/tenant/${tenantId}/shift/series`, {
            data: { ...cuerpo, repeticion: { ...rep, hasta: rep.hasta || null } },
          });
          const d = r?.data ?? r;
          const om = d?.omitidos?.length || 0;
          toast.success(om
            ? `${d.creados} turno(s) creados · ${om} día(s) omitido(s) por choque`
            : `${d.creados} turno(s) creados`);
        }
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

  /**
   * «Éste y todos los siguientes». Borrar de uno en uno está bien para un cambio
   * suelto; deshacer una temporada entera eran decenas de clics, y a mitad de
   * camino es fácil dejarse días sueltos. El corte lo hace el SERVIDOR desde la
   * hora del turno elegido: la pantalla sólo tiene cargada la ventana visible, así
   * que «todos los siguientes» no se puede resolver aquí sin dejarse los que aún
   * no se han pedido.
   */
  const deleteShiftAndFuture = async (target: ShiftRecord) => {
    const isEngine = !!target.positionId;
    const ok = await confirmDialog({
      title: 'Eliminar éste y los siguientes',
      message: isEngine
        ? 'Se eliminarán este turno y todos los del mismo vigilante en este puesto de aquí en adelante. Lo ya ocurrido no se toca. Ojo: esto NO da de baja su asignación, así que la rotación puede volver a generarlos.'
        : 'Se eliminarán este turno y todos los del mismo vigilante en este puesto de aquí en adelante. Lo ya ocurrido no se toca.',
      confirmText: 'Eliminar los siguientes',
      tone: 'danger',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const r: any = await ApiService.delete(`/tenant/${tenantId}/shift/${target.id}/futuros`);
      const d = r?.data ?? r;
      const n = d?.eliminados ?? 0;
      toast.success(`${n} turno${n === 1 ? '' : 's'} eliminado${n === 1 ? '' : 's'}`);
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
        { label: 'Eliminar éste y los siguientes…', danger: true, onClick: () => void deleteShiftAndFuture(s) },
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

  /* ════════════════════════════════════════════════════════════════════════
     MOVER Y ESTIRAR UN BLOQUE — segunda versión, después de romperlo en vivo
     ────────────────────────────────────────────────────────────────────────
     La primera fallaba por dos cosas que ahora están explícitas:

     1. DOS GESTOS A LA VEZ. El `stopPropagation` iba sobre el evento de PUNTERO
        y el lienzo dibuja con `onMouseDown`: son secuencias distintas, así que
        parar una no para la otra. Arrastrar movía el turno Y abría el diálogo de
        «nuevo bloque», y las dos máquinas de estado se pisaban el mismo
        `draftRectRef`. De ahí salía el desplazamiento absurdo.
        → El bloque conserva su `onMouseDown` que corta la propagación, y el
          arrastre usa su PROPIO ref.

     2. EL DESPLAZAMIENTO SALÍA DE `pointTo`, que acota los minutos a [0,1440] y
        saca el día de la coordenada X. Eso no es un desplazamiento, es una
        posición recortada: arrastrar hacia abajo adelantaba el turno 3,5 h.
        → Ahora se restan dos coordenadas de pantalla (`minutosArrastrados`, en
          `scheduleTime`, con pruebas que fijan el SIGNO).
     ════════════════════════════════════════════════════════════════════════ */
  type Arrastre = {
    shift: ShiftRecord; modo: 'mover' | 'inicio' | 'fin';
    a0: number; b0: number; yInicial: number; delta: number; movido: boolean;
  };
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const arrastreRef = useRef<Arrastre | null>(null);
  useEffect(() => { arrastreRef.current = arrastre; }, [arrastre]);
  /** Un arrastre no debe abrir además el detalle al soltar. */
  const suprimirClick = useRef(false);

  /**
   * LAS ESCUCHAS SE ENGANCHAN AQUÍ MISMO, no en un `useEffect`.
   *
   * La versión anterior las ponía en un efecto que dependía de que `arrastre`
   * dejara de ser null. Un efecto corre DESPUÉS del commit y del pintado, así
   * que un arrastre rápido —el de una automatización, o el de un dedo decidido—
   * despacha todos sus `pointermove` ANTES de que la escucha exista: el gesto se
   * quedaba en cero, `movido` nunca se ponía a true y el turno no se movía.
   * Enganchando en el propio manejador no hay ventana en la que perder eventos.
   *
   * El estado vive en un REF (la verdad del gesto) y se copia a estado de React
   * sólo para pintar la vista previa. Así `onUp` nunca lee un valor viejo.
   */
  const empezarArrastre = (e: React.PointerEvent, s: ShiftRecord, modo: Arrastre['modo']) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    const a0 = absOfWall(dateToWall(new Date(s.startTime), tz));
    const b0 = absOfWall(dateToWall(new Date(s.endTime), tz));
    const inicial: Arrastre = { shift: s, modo, a0, b0, yInicial: e.clientY, delta: 0, movido: false };
    arrastreRef.current = inicial;
    setArrastre(inicial);

    const onMove = (ev: PointerEvent) => {
      const cur = arrastreRef.current;
      if (!cur) return;
      const delta = minutosArrastrados(cur.yInicial, ev.clientY, pxPerMin, snapStep);
      const next = { ...cur, delta, movido: cur.movido || delta !== 0 };
      arrastreRef.current = next;
      setArrastre(next);
    };

    const soltar = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancelar);
    };

    /* CANCELAR NO ES SOLTAR. Un `pointercancel` lo lanza el navegador cuando el
       gesto se lo queda otra cosa —el sistema, un scroll táctil, una ventana que
       roba el foco—. Eso es «no lo hice», no «ya está». Estaba enganchado al
       mismo manejador que `pointerup`, así que un gesto interrumpido GUARDABA el
       turno en la hora a la que hubiera llegado el dedo. Salió probando: mandé un
       cancel a propósito y el turno se movió igual. */
    const onCancelar = () => {
      soltar();
      arrastreRef.current = null;
      setArrastre(null);
    };

    const onUp = async () => {
      soltar();
      const prev = arrastreRef.current;
      arrastreRef.current = null;
      setArrastre(null);
      if (!prev || !prev.movido) return;   // fue un clic: lo abre `onClick`
      suprimirClick.current = true;

      let a = prev.a0, b = prev.b0;
      if (prev.modo === 'mover') { a += prev.delta; b += prev.delta; }
      else if (prev.modo === 'inicio') a += prev.delta;
      else b += prev.delta;

      if (b - a < 30) { toast.error('Un turno no puede durar menos de 30 minutos'); return; }
      if (b - a > 1440) { toast.error('Un turno no puede durar más de 24 horas'); return; }

      const inicio = wallStrToDate(absToWallStr(a), tz);
      const fin = wallStrToDate(absToWallStr(b), tz);
      if (!inicio || !fin) return;
      try {
        const est = stationById.get(prev.shift.stationId);
        await ApiService.put(`/tenant/${tenantId}/shift/${prev.shift.id}`, {
          data: {
            startTime: inicio.toISOString(), endTime: fin.toISOString(),
            station: prev.shift.stationId, guard: prev.shift.guardId, postSiteId: est?.postSiteId,
          },
        });
        toast.success(prev.modo === 'mover' ? 'Turno movido' : 'Turno ajustado');
        onChanged?.();
      } catch (err: any) {
        toast.error(err?.data?.message || err?.message || 'No se pudo mover el turno');
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancelar);
  };

  const arrastreSegs = useMemo(() => {
    if (!arrastre || !arrastre.movido) return [];
    let a = arrastre.a0, b = arrastre.b0;
    if (arrastre.modo === 'mover') { a += arrastre.delta; b += arrastre.delta; }
    else if (arrastre.modo === 'inicio') a += arrastre.delta;
    else b += arrastre.delta;
    return b > a ? segmentize(a, b, dayCount) : [];
  }, [arrastre, dayCount]);

  const arrastreStationIdx = arrastre ? (stationIndexById.get(arrastre.shift.stationId) ?? 0) : 0;


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
                  /** ¿Es ESTE el bloque que se está moviendo ahora mismo? */
                  const arrastrando = !!arrastre?.movido && arrastre.shift.id === s.id;
                  return (
                    <div
                      key={`${s.id}-${seg.dayIdx}`}
                      /* Cristal PLANO: se pinta uno por turno y por día. Un
                         `backdrop-filter` aquí multiplica el coste por cada
                         bloque de la rejilla. */
                      className={`absolute overflow-hidden px-1.5 py-0.5 transition-[filter] hover:brightness-110 ${arrastrando ? 'cursor-grabbing border-2 border-dashed' : `cursor-grab ${isEngine ? 'border border-dashed' : 'border'}`} ${seg.first ? 'rounded-t-md' : ''} ${seg.last ? 'rounded-b-md' : ''}`}
                      title={`${name} · ${timeLbl}${isEngine ? ' · generado por rotación' : ' · turno manual'} — arrastra para mover · tira de los bordes para ajustar · clic derecho: opciones`}
                      /* LOS DOS. `onMouseDown` impide que el lienzo empiece a
                         DIBUJAR debajo (secuencia de ratón); `onPointerDown`
                         arranca el arrastre (secuencia de puntero, la que
                         también sirve para el dedo). Quitar el primero fue el
                         fallo de la versión anterior. */
                      onMouseDown={e => { if (e.button === 0) e.stopPropagation(); }}
                      onPointerDown={e => empezarArrastre(e, s, 'mover')}
                      onClick={() => {
                        if (suprimirClick.current) { suprimirClick.current = false; return; }
                        setDetail(s);
                      }}
                      onContextMenu={e => openBlockCtx(e, s)}
                      style={{
                        top: seg.top * pxPerMin,
                        height: Math.max(8, h - 1),
                        left: di * dayW + si * SUBCOL_W + 4 + lane * laneW,
                        width: laneW - 2,
                        backgroundColor: `color-mix(in oklab, ${color} ${isEngine ? 10 : 18}%, transparent)`,
                        borderColor: `color-mix(in oklab, ${color} 42%, transparent)`,
                        ...(seg.first ? { borderTop: `3px solid ${color}` } : {}),
                        /* ── DE DÓNDE VENÍA ────────────────────────────────
                           Mientras se arrastra, el sitio original no se
                           «apaga» y ya: se dibuja como lo que es, el hueco que
                           se está dejando. Borde PUNTEADO, sin relleno y con su
                           hora vieja tachada encima. Bajar la opacidad y nada
                           más se leía como «el turno sigue ahí», que es justo
                           lo que no está pasando. */
                        ...(arrastrando ? {
                          backgroundColor: 'transparent',
                          borderColor: 'var(--ink-faint)',
                          borderTopColor: 'var(--ink-faint)',
                          borderTopWidth: 2,
                          // El `borderTop: 3px solid` del primer trozo se pone
                          // ANTES; sin esto el hueco salía con tres lados
                          // punteados y la tapa entera, que se lee como si el
                          // bloque siguiera vivo.
                          borderTopStyle: 'dashed',
                        } : null),
                        touchAction: 'none',
                      }}
                    >

                      {seg.first && (
                        <div
                          onPointerDown={e => empezarArrastre(e, s, 'inicio')}
                          onMouseDown={e => { if (e.button === 0) e.stopPropagation(); }}
                          className="absolute inset-x-0 top-0 h-2 cursor-ns-resize"
                          style={{ touchAction: 'none' }}
                          title="Ajustar la hora de entrada"
                        />
                      )}
                      {seg.last && (
                        <div
                          onPointerDown={e => empezarArrastre(e, s, 'fin')}
                          onMouseDown={e => { if (e.button === 0) e.stopPropagation(); }}
                          className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                          style={{ touchAction: 'none' }}
                          title="Ajustar la hora de salida"
                        />
                      )}
                      {seg.first && h > 20 && (
                        <span
                          className="block truncate text-[9px] font-semibold"
                          style={{ color: arrastrando ? 'var(--ink-faint)' : 'var(--ink)' }}
                        >
                          {arrastrando ? 'Estaba aquí' : name.split(' ')[0]}
                        </span>
                      )}
                      {seg.first && h > 38 && (
                        <span
                          className="block truncate text-[8px] tabular-nums"
                          style={{
                            color: arrastrando ? 'var(--ink-faint)' : 'var(--ink-soft)',
                            textDecoration: arrastrando ? 'line-through' : undefined,
                          }}
                        >
                          {timeLbl}
                        </span>
                      )}
                    </div>
                  );
                });
              })}

              {/* Vista previa del bloque que se mueve o se estira */}
              {arrastreSegs.map(seg => (
                <div
                  key={`arr-${seg.dayIdx}`}
                  className={`pointer-events-none absolute border-2 ${seg.first ? 'rounded-t-md' : ''} ${seg.last ? 'rounded-b-md' : ''}`}
                  style={{
                    top: seg.top * pxPerMin,
                    height: (seg.bottom - seg.top) * pxPerMin,
                    left: seg.dayIdx * dayW + arrastreStationIdx * SUBCOL_W + 3,
                    width: SUBCOL_W - 6,
                    background: 'var(--brand-wash)', borderColor: 'var(--brand)',
                  }}
                >
                  {seg.first && arrastre && (
                    <span className="block px-1 pt-0.5 text-[9px] font-bold tabular-nums" style={{ color: 'var(--brand-text)' }}>
                      {(() => {
                        let a = arrastre.a0, b = arrastre.b0;
                        if (arrastre.modo === 'mover') { a += arrastre.delta; b += arrastre.delta; }
                        else if (arrastre.modo === 'inicio') a += arrastre.delta;
                        else b += arrastre.delta;
                        return `${minLabel(a)}–${minLabel(b)}`;
                      })()}
                    </span>
                  )}
                </div>
              ))}

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

                {/* ── REPETIR ──────────────────────────────────────────── */}
                {!editing && (
                  <div className="rounded-xl p-3" style={{ border: '1px solid var(--hairline)', background: 'var(--glass-sunken)' }}>
                    <label className="cg-eyebrow mb-1.5 block">Repetir</label>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {([
                        { v: 'unica', l: 'Solo este día' },
                        { v: 'diaria', l: 'Todos los días' },
                        { v: 'dias', l: 'Días de la semana' },
                        { v: 'intervalo', l: 'Cada N días' },
                        { v: 'patron', l: 'Trabaja / descansa' },
                        // Sólo si el puesto TIENE rotación: ofrecerla en un puesto
                        // sin ciclo configurado lleva a un error que el usuario no
                        // puede resolver desde este diálogo.
                        ...(stationById.get(blockModal.stationId)?.rotationStyleId
                          ? [{ v: 'rotacion' as const, l: 'Seguir la rotación del puesto' }]
                          : []),
                      ] as const).map(o => (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() => setRep(r => ({ ...r, tipo: o.v }))}
                          className={`cg-focus rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-all ${rep.tipo === o.v ? 'glass-brand' : 'glass-flat'}`}
                        >
                          {o.l}
                        </button>
                      ))}
                    </div>

                    {rep.tipo === 'rotacion' && (
                      <p className="mt-2.5 text-[11px] leading-snug" style={{ color: 'var(--ink-soft)' }}>
                        El vigilante seguirá el ciclo del puesto: pasará de día a noche y
                        librará cuando toque. <strong>Las horas las pone el puesto</strong>, no
                        el bloque que dibujaste, y entra en el mismo compás que sus compañeros.
                      </p>
                    )}

                    {rep.tipo === 'dias' && (
                      <div className="mt-2.5 flex gap-1">
                        {[{ n: 1, l: 'L' }, { n: 2, l: 'M' }, { n: 3, l: 'X' }, { n: 4, l: 'J' }, { n: 5, l: 'V' }, { n: 6, l: 'S' }, { n: 0, l: 'D' }].map(d => {
                          const on = rep.weekdays.includes(d.n);
                          return (
                            <button
                              key={d.n}
                              type="button"
                              onClick={() => setRep(r => ({ ...r, weekdays: on ? r.weekdays.filter(x => x !== d.n) : [...r.weekdays, d.n] }))}
                              className={`cg-focus h-7 w-7 rounded-full text-[11px] font-bold transition-all ${on ? 'glass-brand' : 'glass-flat'}`}
                            >
                              {d.l}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {rep.tipo === 'intervalo' && (
                      <div className="mt-2.5 flex items-center gap-2 text-[11px]">
                        <span style={{ color: 'var(--ink-soft)' }}>Uno de cada</span>
                        <input type="number" min={1} max={30} value={rep.cadaN}
                          onChange={e => setRep(r => ({ ...r, cadaN: Number(e.target.value) || 1 }))}
                          className="w-16 rounded-lg border px-2 py-1 text-sm tabular-nums outline-none focus:border-primary"
                          style={{ borderColor: 'var(--hairline)', background: 'var(--float)' }} />
                        <span style={{ color: 'var(--ink-soft)' }}>días</span>
                      </div>
                    )}

                    {rep.tipo === 'patron' && (
                      <div className="mt-2.5 flex items-center gap-2 text-[11px]">
                        <input type="number" min={1} max={30} value={rep.trabaja}
                          onChange={e => setRep(r => ({ ...r, trabaja: Number(e.target.value) || 1 }))}
                          className="w-16 rounded-lg border px-2 py-1 text-sm tabular-nums outline-none focus:border-primary"
                          style={{ borderColor: 'var(--hairline)', background: 'var(--float)' }} />
                        <span style={{ color: 'var(--ink-soft)' }}>trabaja ·</span>
                        <input type="number" min={0} max={30} value={rep.descansa}
                          onChange={e => setRep(r => ({ ...r, descansa: Number(e.target.value) || 0 }))}
                          className="w-16 rounded-lg border px-2 py-1 text-sm tabular-nums outline-none focus:border-primary"
                          style={{ borderColor: 'var(--hairline)', background: 'var(--float)' }} />
                        <span style={{ color: 'var(--ink-soft)' }}>descansa</span>
                      </div>
                    )}

                    {rep.tipo !== 'unica' && (
                      <div className="mt-2.5">
                        <label className="cg-eyebrow mb-1 block">Hasta</label>
                        <input type="date" value={rep.hasta}
                          onChange={e => setRep(r => ({ ...r, hasta: e.target.value }))}
                          className={inputCls} />
                        <p className="mt-1.5 text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                          {rep.hasta
                            ? 'El ciclo empieza el día dibujado. Un día que choque con otro turno del vigilante se omite y se te dice cuál.'
                            : 'Pon una fecha de fin: sin ella sólo se crea el turno de este día.'}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--hairline)', background: 'var(--glass-sunken)' }}>
                <button onClick={() => setBlockModal(null)} className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-all">{t('actions.cancel')}</button>
                <button
                  onClick={saveBlock}
                  disabled={blockSaving || !blockModal.guardId || !blockModal.stationId || hours <= 0 || hours > 24}
                  className="cg-btn-brand cg-focus rounded-full px-5 py-2 text-sm font-semibold transition-all disabled:opacity-40"
                >
                  {blockSaving ? <Loader2 size={14} className="animate-spin" /> : (editing ? 'Guardar cambios' : (rep.tipo === 'unica' || !rep.hasta ? 'Crear turno' : 'Crear la serie'))}
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
                {/* Desde aquí se llega tras pinchar un turno en la Agenda, y es
                    donde se notaba que sólo se podía borrar de uno en uno. */}
                <button
                  onClick={() => void deleteShiftAndFuture(detail)}
                  disabled={deleting}
                  className="cg-focus flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-all disabled:opacity-50"
                  style={{ color: 'var(--bad-text)' }}
                >
                  {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Éste y los siguientes
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
