import { localToday } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { nombreDeVigilante, inicialesDeVigilante, primerNombre } from "@/lib/guardName";
import { getTenantTimezone } from '@/utils/tenantLocation';
import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from "react";
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Users,
  X,
  Loader2,
  Clock,
  Shield,
  Sparkles,
  Zap,
  Sun,
  AlertTriangle,
  Bot,
  ArrowRight,
  FileText,
  CheckCircle2,
  Trash2,
  Plus as PlusIcon,
  MinusCircle,
  RefreshCw,
  MapPin,
  CalendarDays,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { StatusBadge, Segmented, IconTile, EmptyState } from "@/components/kit";
import { MeterBar } from "@/components/charts";
import { ApiService } from "@/services/api/apiService";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirmDialog";
import ScheduleTimeline, { dateToWall, wallToDate, startPan } from "./ScheduleTimeline";
import RotationStyleSelect from "@/components/schedule/RotationStyleSelect";
import ContextMenu, { CtxItem, CtxMenuState } from "./ContextMenu";
import TransferShiftModal, { TransferTarget } from "./TransferShiftModal";
import { stationLabel } from "@/lib/stationName";
import SupervisionSection from './SupervisionSection';
import MonthStationBlock, { type BlockSel, type MonthGridHandlers } from './MonthStationBlock';
import { COL_W, COL_STICKY_W } from './gridBand';

import { localeActual } from '@/lib/localeActual'
import {
  type Tone, tonePill, toneCard, toneInk,
  OVERRIDE_TONE, CODE_LABEL, CODE_ORDER, codeFill, codePill, codeCard, columnRules,
} from './codeTones';

import type {
  RotationStyle,
  StationPosition,
  GuardAssignment,
  GuardRef,
  Station,
  ShiftRecord,
  GuardOption,
  ScheduleOverride,
  StationAlert,
} from "@/types";

// ─── Types ──────────────────────────────────────────────────────────────────

// Raw guard row shape as returned by securityGuardService / scheduler guard pool.
interface RawGuardRow {
  guardId?: string;
  id?: string;
  value?: string;
  fullName?: string;
  name?: string;
  label?: string;
  email?: string;
}

// One row of the post-publish implementation plan (who was notified of what).
interface PlanItem {
  id?: string;
  guardId?: string;
  guardName?: string;
  added?: number;
  changed?: number;
  removed?: number;
  notifyStatus?: string;
}

// One proposed change in the AI scheduler draft.
interface ProposalChange {
  id?: string;
  action?: string;
  startTime?: string;
  meta?: { shiftType?: string };
}

// Real coverage of the LIVE schedule (GET /scheduler/coverage).
interface CoverageInfo {
  coveredPct?: number;
  gapCount?: number;
  overstaffCount?: number;
}

// Staffing requirements + current headcount (GET /scheduler/staffing).
interface StaffingInfo {
  fijosNeeded?: number;
  sacafrancosNeeded?: number;
  totalGuardsNeeded?: number;
  currentFijoGuards?: number;
  currentSfGuards?: number;
  peakDemand?: number;
  sfRotation?: { id?: string; name?: string; dayShifts?: number; nightShifts?: number; restDays?: number };
  stationAlerts?: StationAlert[];
}

// Result of POST /scheduler/auto-assign.
interface AutoAssignResult {
  assignmentsCreated?: number;
  titularesAssigned?: number;
  sacafrancosAssigned?: number;
  unassignedRemaining?: number;
}

// Proposal summary + warnings (GET /scheduler/proposals/:id).
interface ProposalCoverageWarning {
  coveredPct?: number;
  gapCount?: number;
  overstaffCount?: number;
}
interface ProposalWarnings {
  total?: number;
  coverage?: ProposalCoverageWarning;
  restViolations?: unknown[];
  doubleBookings?: unknown[];
  sfStyleInconsistencies?: unknown[];
  // Estos dos los calcula scheduleValidation.ts y viajan en la respuesta desde
  // que se publicó Configuración › Jornada. No estaban declarados aquí, así que
  // ni siquiera se podían leer sin que TypeScript protestara — y por eso la
  // lista de avisos de abajo nunca los pintó. El ajuste era real, el motor era
  // real, y el aviso moría en el borde de la pantalla.
  shortRests?: unknown[];
  weeklyOverloads?: unknown[];
  maxConsecutiveAllowed?: number;
}
interface ProposalCost {
  currency?: string;
  hasRate?: boolean;
  projected?: number;
  delta?: number;
}
interface ProposalSummary {
  added?: number;
  removed?: number;
  changed?: number;
  guardsAffected?: number;
  cost?: ProposalCost;
  warnings?: ProposalWarnings;
}
interface ProposalData {
  proposal?: { id?: string; summary?: ProposalSummary };
  changes?: ProposalChange[];
}

// Post-publish implementation plan (GET /scheduler/proposals/:id/plan).
interface PlanData {
  plan?: { notifiedGuards?: number; totalGuards?: number };
  items?: PlanItem[];
}

// Station-detail fields read by the "configurar estación" modal.
interface StationConfigDetail {
  startingTimeInDay?: string;
  finishTimeInDay?: string;
  restCoverage?: string;
}

// A selectable grid row = one puesto (fijo or sacafranco) with its assignments.
interface SelRow {
  key: string; // position id
  station: Station | null;
  pos: StationPosition;
  assignments: GuardAssignment[];
  isSf: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Format a Date as a LOCAL date-only string (YYYY-MM-DD). Using toISOString() here
// would convert local-midnight dates to UTC and shift the day back for users west of
// UTC (all of LATAM), causing wrong-month queries and off-by-one cell/override matching.
const fmtDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Today's YYYY-MM-DD in the COMPANY timezone (cached by AppLayout). The
// operator may be in a different zone than the operation — the horario always
// runs on company wall-clock.
// El formateador se cachea por zona: construir un `Intl.DateTimeFormat` cuesta
// decenas de microsegundos y `tzToday()` se llama en cada render de la hoja.
const DAY_DTF_CACHE = new Map<string, Intl.DateTimeFormat>();
const tzToday = (): string => {
  const tz = getTenantTimezone();
  if (tz) {
    try {
      let f = DAY_DTF_CACHE.get(tz);
      if (!f) {
        f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
        DAY_DTF_CACHE.set(tz, f);
      }
      return f.format(new Date());
    } catch { /* bad cached tz → device time */ }
  }
  return localToday();
};

const addDays = (d: Date, n: number): Date => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

// Days since the 2024-01-01 rotation epoch (matches backend getGlobalEpoch).
// MUST use UTC arithmetic: subtracting LOCAL midnights and flooring loses a
// day in DST timezones (929 days − 1h → floor 928), which shifted the whole
// painted rotation by one day for any viewer outside a fixed-offset zone —
// the "puse que empieza hoy y se refleja mañana" bug.
const dseOf = (d: Date): number =>
  Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2024, 0, 1)) / 86400000);

type ViewMode = 'month' | 'week' | 'day';

const VIEW_KEY = 'programador.horario.view';

/* La ventana se recalcula en CADA evento de desplazamiento, así que el margen
   (`COL_OVERSCAN`) sólo tiene que cubrir lo que el dedo alcanza a correr entre
   dos fotogramas: no hace falta que sea grande. `COL_CHUNK` redondea los
   extremos de la ventana, y es lo que hace que desplazarse no dispare un render
   por fotograma sino uno cada COL_CHUNK columnas (≈2.600 px). Los dos valores
   están MEDIDOS: con 60/7 la hoja bloquea menos hilo al desplazar que la
   versión sin virtualizar, y con 28/7 bloquea el doble. La geometría (COL_W /
   COL_STICKY_W) vive en `gridBand`. */
const COL_CHUNK = 60;
const COL_OVERSCAN = 7;

/* ─── Papeles de color ───────────────────────────────────────────────────────
   Ni un color escrito a mano. Cada cosa que se pinta declara su PAPEL
   (`brand` / `ok` / `warn` / `bad` / `info` / `neutral`) y el relleno sale de
   los tokens, así que el mismo código se lee bien en claro y en oscuro y sigue
   funcionando cuando el usuario cambia el acento.                              */
const POSITION_TONE: Record<string, { tone: Tone; icon: LucideIcon }> = {
  fijo: { tone: 'warn', icon: Sun },
  sacafranco: { tone: 'ok', icon: Shield },
};

/* Colores de IDENTIDAD de cada vigilante. No son diez colores elegidos a mano:
   son diez giros de tono SOBRE el acento del usuario, a la misma luminosidad y
   croma. El primero es exactamente su color de marca, y si cambia el acento la
   rueda entera gira con él. Sólo se usan como filo/rail — nunca como tinta de
   texto pequeño, que es donde ese nivel de luminosidad no da contraste. */
const GUARD_HUE_STEPS = [0, 150, 60, 210, 105, 255, 30, 180, 300, 135];
const guardHueColor = (i: number) =>
  `oklch(0.66 0.15 calc(var(--brand-h) + ${GUARD_HUE_STEPS[i % GUARD_HUE_STEPS.length]}))`;

/* Tintes de columna. Hoy y domingo se pintan en la cabecera congelada Y en el
   cuerpo; con dos valores sueltos la cabecera salía más densa que su propia
   columna. Una constante por papel y las dos capas coinciden. */
const TINT_TODAY = 'color-mix(in oklab, var(--brand) 8%, transparent)';
const TINT_SUNDAY = 'color-mix(in oklab, var(--bad) 5%, transparent)';

// Keyboard → novedad code (spreadsheet typing).
const KEY_CODES: Record<string, string> = { d: 'D', n: 'N', l: 'L', v: 'V', f: 'F', p: 'PM', '2': '24' };

// ─── Component ──────────────────────────────────────────────────────────────

export default function Schedule() {
  const { t } = useTranslation();
  const tenantId = localStorage.getItem('tenantId') || '';

  // Saved view (month + scroll + panels) so edits/reloads bring you back to the
  // exact same spot instead of jumping to the top.
  const savedView = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem(VIEW_KEY) || 'null') || {}; } catch { return {}; }
  }, []);

  // Data
  const [stations, setStations] = useState<Station[]>([]);
  const [positions, setPositions] = useState<StationPosition[]>([]);
  const [assignments, setAssignments] = useState<GuardAssignment[]>([]);
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [overrides, setOverrides] = useState<ScheduleOverride[]>([]);
  const [rotationStyles, setRotationStyles] = useState<RotationStyle[]>([]);
  const [guardsPool, setGuardsPool] = useState<GuardOption[]>([]);
  const [staffing, setStaffing] = useState<StaffingInfo | null>(null);
  const [loading, setLoading] = useState(true);       // initial load only
  const [refreshing, setRefreshing] = useState(false); // silent refetches (grid stays mounted)
  const hasLoadedRef = useRef(false);

  // View state
  const [currentDate, setCurrentDate] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(VIEW_KEY) || 'null');
      if (saved?.a) {
        const [y, mo, d] = String(saved.a).split('-').map(Number);
        if (y && mo && d) return new Date(y, mo - 1, d);
      }
      if (saved?.m) {
        const [y, mo] = String(saved.m).split('-').map(Number);
        if (y && mo) return new Date(y, mo - 1, 1);
      }
    } catch { /* fall through */ }
    const [y, mo, d] = tzToday().split('-').map(Number);
    return new Date(y, mo - 1, d);
  });
  const [view, setView] = useState<ViewMode>(savedView.v === 'week' || savedView.v === 'day' ? savedView.v : 'month');
  const [panelOpen, setPanelOpen] = useState<boolean>(savedView.panel ?? true);
  const [sfSectionOpen, setSfSectionOpen] = useState<boolean>(savedView.sf ?? false);
  // Month label in the toolbar follows the SCROLL position of the year canvas.
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const [y, mo] = tzToday().split('-').map(Number);
    return new Date(y, mo - 1, 1);
  });

  // Assignment form
  const [showAssignForm, setShowAssignForm] = useState(false);
  /**
   * Qué se crea al soltar (o al elegir «Asignar vigilante…» con el clic derecho).
   *
   * `single` = UN turno para ESE día. `rotation` = meter al vigilante en la
   * rotación del puesto, que es lo que hacía siempre: el servidor genera un AÑO
   * de turnos (365 días; en esta base, 172 de media y hasta 318 por asignación)
   * antes de contestar. Por eso «tardaba una eternidad» — y por eso el defecto
   * ahora es `single`: tapar el hueco de hoy es el gesto de todos los días, y
   * meter a alguien en la rotación es la excepción. Un traslado (arrastrar una
   * asignación existente a otro puesto) SIEMPRE es rotación: ahí no hay elección.
   */
  const [assignMode, setAssignMode] = useState<'single' | 'rotation'>('single');
  const [sfPickQuery, setSfPickQuery] = useState('');
  const [assignStartTime, setAssignStartTime] = useState('07:00');
  const [assignEndTime, setAssignEndTime] = useState('19:00');
  const [assignTarget, setAssignTarget] = useState<{ stationId: string; positionId: string } | null>(null);
  const [assignGuard, setAssignGuard] = useState('');
  const [assignStartDate, setAssignStartDate] = useState(() => tzToday());
  const [assignSaving, setAssignSaving] = useState(false);
  const [moveFrom, setMoveFrom] = useState<GuardAssignment | null>(null); // drag-move source
  const [coverage, setCoverage] = useState<CoverageInfo | null>(null); // real coverage of live schedule

  // Configure station form — SAME model as the station-page "Horario del
  // turno" editor (StationOverview): custom window + turno por vigilante +
  // cobertura de descansos (sacafranco | alternancia 24x24). Same
  // /auto-positions payload so both screens configure identically.
  const [configStation, setConfigStation] = useState<Station | null>(null);
  const [configType, setConfigType] = useState('24h');
  const [configRotation, setConfigRotation] = useState('');
  const [configSaving, setConfigSaving] = useState(false);
  const [cfgStart, setCfgStart] = useState('07:00');
  const [cfgEnd, setCfgEnd] = useState('07:00');
  const [cfgBlockHours, setCfgBlockHours] = useState(''); // '' = whole window per fijo
  const [cfgRestCoverage, setCfgRestCoverage] = useState<'sacafranco' | 'alternate'>('sacafranco');
  const [cfgRotStyle, setCfgRotStyle] = useState<{ dayShifts: number; nightShifts: number; restDays: number } | null>(null);

  // Window math (mirrors StationOverview): wraps midnight; start==end → 24h.
  const cfgWinMin = useMemo(() => {
    if (!cfgStart || !cfgEnd) return 0;
    const toMin = (x: string) => { const [h, mm] = x.split(':').map(n => parseInt(n, 10) || 0); return ((h % 24) * 60 + (mm % 60) + 1440) % 1440; };
    const w = (toMin(cfgEnd) - toMin(cfgStart) + 1440) % 1440;
    return w === 0 ? 1440 : w;
  }, [cfgStart, cfgEnd]);
  const cfgBlocksOk = Number(cfgBlockHours) > 0 && cfgWinMin > 0 && cfgWinMin % (Number(cfgBlockHours) * 60) === 0;
  const cfgBlockCount = cfgBlocksOk ? cfgWinMin / (Number(cfgBlockHours) * 60) : 1;
  const cfgRotCycle = cfgRotStyle ? (cfgRotStyle.dayShifts || 0) + (cfgRotStyle.nightShifts || 0) + (cfgRotStyle.restDays || 0) : 0;
  const cfgRotWork = cfgRotStyle ? (cfgRotStyle.dayShifts || 0) + (cfgRotStyle.nightShifts || 0) : 0;
  const cfgAlternateOk = cfgRestCoverage !== 'alternate' || !cfgRotStyle || (cfgRotWork > 0 && cfgRotCycle % cfgRotWork === 0);
  const cfgGuardsPerBlock = cfgRestCoverage === 'alternate' && cfgAlternateOk && cfgRotWork > 0 ? cfgRotCycle / cfgRotWork : 1;

  // ─── Data Loading ─────────────────────────────────────────────────────────

  // The Mes sheet is a CONTINUOUS canvas of the WHOLE current year: frozen
  // date header on top + frozen station column on the left, free horizontal
  // scroll through every day — "sin límite", capped at the current year.
  const todayYear = useMemo(() => Number(tzToday().slice(0, 4)), []);
  const monthDays = useMemo(() => {
    const days: Date[] = [];
    const d = new Date(todayYear, 0, 1);
    while (d.getFullYear() === todayYear) {
      days.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return days;
  }, [todayYear]);

  // `YYYY-MM-DD` y «¿es domingo?» de cada columna, precalculados UNA vez. Antes
  // `fmtDate(day)` se ejecutaba dentro de cada celda: 365 columnas x 55 filas =
  // ~20.000 construcciones de cadena en CADA render de la hoja.
  const monthDayStrs = useMemo(() => monthDays.map(fmtDate), [monthDays]);
  const monthDaySunday = useMemo(() => monthDays.map(d => d.getDay() === 0), [monthDays]);

  // Visible days for the Semana/Día timeline. Día shows 48h (the chosen day +
  // the next) so a block can be DRAWN across midnight — e.g. 07:00 → 07:00.
  const timelineDays = useMemo(() => {
    if (view === 'day') return [currentDate, addDays(currentDate, 1)];
    const start = addDays(currentDate, -((currentDate.getDay() + 6) % 7)); // Monday
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [view, currentDate]);

  // Fetch range follows the view: the year canvas loads the whole current
  // year; the timeline pads ±1 day so overnight shift tails are included.
  const startDateStr = view === 'month' ? `${todayYear}-01-01` : fmtDate(addDays(timelineDays[0], -1));
  const endDateStr = view === 'month' ? `${todayYear}-12-31` : fmtDate(addDays(timelineDays[timelineDays.length - 1], 1));

  const fetchAll = useCallback(async (opts?: { silent?: boolean }) => {
    // After the first load every refetch is SILENT: the grid stays mounted so
    // the scroll position (and selection context) survives every save.
    const silent = opts?.silent ?? hasLoadedRef.current;
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const [overviewRes, rotRes, guardsRes, staffingRes, coverageRes] = await Promise.all([
        ApiService.get(`/tenant/${tenantId}/scheduler/overview?startDate=${startDateStr}&endDate=${endDateStr}`),
        ApiService.get(`/tenant/${tenantId}/rotation-styles`),
        ApiService.get(`/tenant/${tenantId}/security-guard/autocomplete?limit=200`),
        ApiService.get(`/tenant/${tenantId}/scheduler/staffing`).catch(() => null),
        ApiService.get(`/tenant/${tenantId}/scheduler/coverage?days=14`).catch(() => null),
      ]);

      setCoverage(coverageRes?.data ?? coverageRes ?? null);
      const ov = overviewRes?.data || overviewRes || {};
      setStations(ov.stations || []);
      setPositions(ov.positions || []);
      setAssignments(ov.assignments || []);
      setShifts(ov.shifts || []);
      setOverrides(ov.overrides || []);

      const rots = rotRes?.rows || rotRes?.data?.rows || [];
      setRotationStyles(rots);

      const guards = Array.isArray(guardsRes) ? guardsRes : (guardsRes?.rows || []);
      setGuardsPool(guards.map((g: RawGuardRow) => ({
        id: g.guardId || g.id || g.value || '',
        label: g.fullName || g.name || g.label || g.email || '',
      })).filter((g: { id: string; label: string }) => g.id));

      if (staffingRes) {
        const sd = staffingRes?.data || staffingRes;
        setStaffing(sd);
      }
      hasLoadedRef.current = true;
    } catch (e: any) {
      console.error('[Scheduler] fetch error', e);
      toast.error(t('ui.Schedule.errorAlCargarHorario'));
    } finally {
      if (silent) setRefreshing(false); else setLoading(false);
    }
  }, [tenantId, startDateStr, endDateStr]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  // Pre-indexed lookups (built once per data load) to replace repeated O(n) .find()
  // scans inside the month grid / coverage memos.
  const stationsById = useMemo(() => {
    const m = new Map<string, Station>();
    for (const s of stations) m.set(s.id, s);
    return m;
  }, [stations]);

  const rotationStylesById = useMemo(() => {
    const m = new Map<string, RotationStyle>();
    for (const r of rotationStyles) m.set(r.id, r);
    return m;
  }, [rotationStyles]);

  const positionsById = useMemo(() => {
    const m = new Map<string, StationPosition>();
    for (const p of positions) m.set(p.id, p);
    return m;
  }, [positions]);

  // MANUAL SACAFRANCO: nothing is auto-scheduled for an SF. Their month starts
  // all-libre; coverage exists ONLY where a REAL shift exists — placed by
  // dragging the SF's día onto a puesto's L cell (creates an ad-hoc shift), or
  // in bulk via the explicit "Optimizar Sacafrancos" action.
  const tzName = getTenantTimezone();

  const reliefGuardIds = useMemo(() => {
    const s = new Set<string>();
    for (const a of assignments) {
      if (a.isRelief || positionsById.get(a.positionId)?.type === 'sacafranco') s.add(a.guardId);
    }
    return s;
  }, [assignments, positionsById]);

  // `${guardId}|${dateStr}` (tenant tz) → that guard's real shift that day.
  // SF cells read it for coverage; the right-click menu reads it for any guard.
  const shiftByGuardDate = useMemo(() => {
    const m = new Map<string, ShiftRecord>();
    for (const s of shifts) {
      if (!s.startTime) continue;
      m.set(`${s.guardId}|${dateToWall(new Date(s.startTime), tzName).dateStr}`, s);
    }
    return m;
  }, [shifts, tzName]);

  /* Índices, no barridos. Estas dos se llaman una vez por puesto y una vez por
     posición en CADA render; como `.filter()` eso era O(puestos x posiciones).
     Y —más importante— devolvían un array NUEVO cada vez, así que ninguna fila
     podía memoizarse. Ahora el array es el MISMO objeto mientras no cambien los
     datos, que es lo que deja que `React.memo` corte el render de la fila. */
  const EMPTY_POS = useMemo<StationPosition[]>(() => [], []);
  const EMPTY_ASG = useMemo<GuardAssignment[]>(() => [], []);

  const positionsByStation = useMemo(() => {
    const m = new Map<string, StationPosition[]>();
    for (const p of positions) {
      if (p.type === 'sacafranco') continue;
      const list = m.get(p.stationId);
      if (list) list.push(p); else m.set(p.stationId, [p]);
    }
    return m;
  }, [positions]);

  const assignmentsByPosition = useMemo(() => {
    const m = new Map<string, GuardAssignment[]>();
    for (const a of assignments) {
      const list = m.get(a.positionId);
      if (list) list.push(a); else m.set(a.positionId, [a]);
    }
    // EL TITULAR PRIMERO. Media pantalla lee `posAssignments[0]` como «quien
    // tiene este puesto» —la cabecera de la fila, el aspa de quitar, el arrastre
    // de mover—. Con un aprendiz en la misma plaza, el orden lo decidía la
    // consulta: el acompañante podía salir de dueño y el titular desaparecer de
    // su propia fila.
    for (const list of m.values()) {
      if (list.length > 1) list.sort((a, b) => Number(a.role === 'shadow') - Number(b.role === 'shadow'));
    }
    return m;
  }, [assignments]);

  const sfPositions = useMemo(() => positions.filter(p => p.type === 'sacafranco'), [positions]);

  const getPositionsForStation = useCallback((stationId: string) =>
    positionsByStation.get(stationId) || EMPTY_POS, [positionsByStation, EMPTY_POS]);

  const getAssignmentsForPosition = useCallback((positionId: string) =>
    assignmentsByPosition.get(positionId) || EMPTY_ASG, [assignmentsByPosition, EMPTY_ASG]);

  const guardColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    let idx = 0;
    assignments.forEach(a => {
      if (a.guardId && !map[a.guardId]) {
        map[a.guardId] = guardHueColor(idx);
        idx++;
      }
    });
    shifts.forEach(s => {
      if (s.guardId && !map[s.guardId]) {
        map[s.guardId] = guardHueColor(idx);
        idx++;
      }
    });
    return map;
  }, [assignments, shifts]);

  // Check if a guard works on a given date based on rotation.
  // useCallback so dependent memos (sfStationCoverage, localStationAlerts) keep a stable
  // identity and only recompute when their real inputs change.
  const isWorkDay = useCallback((assignment: GuardAssignment, date: Date): 'day' | 'night' | 'rest' => {
    // The patrón de rotación lives on the STATION now (assignment.rotationStyleId
    // is null), so resolve it from the station; fall back to any legacy embedded
    // style. (Reading assignment.rotationStyle made every day show "L".)
    const station = stationsById.get(assignment.stationId);
    const rot = (station?.rotationStyleId ? rotationStylesById.get(station.rotationStyleId) : null) || assignment.rotationStyle;
    if (!rot) return 'rest';

    // Vigencia: outside [startDate, endDate] the assignment generates no
    // shifts, so the grid must not paint work there (a cover \"hasta el 31\"
    // used to show D/N all year).
    const dStr = fmtDate(date);
    if (assignment.startDate && dStr < String(assignment.startDate).slice(0, 10)) return 'rest';
    if (assignment.endDate && dStr > String(assignment.endDate).slice(0, 10)) return 'rest';

    // For sacafranco positions, check if any fijo guard at the same station is resting
    const pos = positionsById.get(assignment.positionId);
    if (pos?.type === 'sacafranco' || assignment.isRelief) {
      // Sacafranco follows its OWN rotation using global epoch (Jan 1)
      const sfCycle = rot.dayShifts + rot.nightShifts + rot.restDays;
      if (sfCycle === 0) return 'rest';
      const sfDiff = dseOf(date); // DST-safe day index (matches backend getGlobalEpoch)
      const sfAdj = ((sfDiff - (assignment.platoonOffset || 0)) % sfCycle + sfCycle) % sfCycle;
      if (sfAdj < rot.dayShifts) return 'day';
      if (sfAdj < rot.dayShifts + rot.nightShifts) return 'night';
      return 'rest';
    }

    // ─── FIJO LOGIC ─── Guard rotates work/rest following the station rotation
    // Uses GLOBAL EPOCH (Jan 1) for consistent sequential pattern across all stations
    const cycleLength = rot.dayShifts + rot.nightShifts + rot.restDays;
    const daysSinceEpoch = dseOf(date); // DST-safe day index (matches backend getGlobalEpoch)
    const adjustedDay = ((daysSinceEpoch - assignment.platoonOffset) % cycleLength + cycleLength) % cycleLength;

    // For 24H positions: distinguish day/night phases
    // For 12H positions: both day and night rotation phases are just "work" days
    const is24h = station?.scheduleType === '24h';
    if (adjustedDay < rot.dayShifts) return 'day';
    if (adjustedDay < rot.dayShifts + rot.nightShifts) return is24h ? 'night' : 'day';
    return 'rest';
  }, [positionsById, stationsById, rotationStylesById]);


  // Unassigned guards (not in any active assignment)
  const unassignedGuards = useMemo(() => {
    const assignedIds = new Set(assignments.map(a => a.guardId));
    return guardsPool.filter(g => !assignedIds.has(g.id));
  }, [guardsPool, assignments]);

  // Sacafranco availability: guards assigned to sacafranco positions + their D/N/L schedule
  const sacafrancoData = useMemo(() => {
    const reliefAssignments = assignments.filter(a => {
      const pos = positionsById.get(a.positionId);
      return pos?.type === 'sacafranco' || a.isRelief;
    });

    // Group by guard (deduplicate — a sacafranco may have assignments at multiple stations)
    const byGuard = new Map<string, { guard: GuardRef | undefined; assignments: GuardAssignment[]; coverDays: number; availDays: number }>();

    reliefAssignments.forEach(a => {
      if (!byGuard.has(a.guardId)) {
        byGuard.set(a.guardId, { guard: a.guard, assignments: [], coverDays: 0, availDays: 0 });
      }
      byGuard.get(a.guardId)!.assignments.push(a);
    });

    // Daily status from REAL shifts only: covering where a shift exists (any
    // station), libre otherwise. No rotation math — the SF is manual now.
    //
    // El panel sólo enseña DOS NÚMEROS («N libre» / «N cubre»), así que aquí se
    // cuenta y ya. Antes se construía un array de 365 objetos por sacafranco
    // para luego recorrerlo dos veces contando: miles de objetos por render.
    byGuard.forEach((data, guardId) => {
      for (const dateStr of monthDayStrs) {
        if (shiftByGuardDate.has(`${guardId}|${dateStr}`)) data.coverDays++;
        else data.availDays++;
      }
    });

    return Array.from(byGuard.values());
  }, [assignments, positionsById, shiftByGuardDate, monthDayStrs]);

  // Map: `${stationId}-${dateStr}` → quién cubre REALMENTE ahí ese día (turnos
  // de verdad — se pinta sobre la casilla «L» del fijo).
  //
  // Antes sólo contaba a los SACAFRANCOS (`reliefGuardIds`). Con eso, tapar un
  // hueco con un vigilante cualquiera creaba el turno en la base y la rejilla no
  // lo enseñaba: parecía que no había pasado nada. Ahora cuenta cualquier turno
  // que NO venga de la rotación de ese puesto — que es la definición de una
  // cobertura, sea quien sea quien la haga.
  const sfStationCoverage = useMemo(() => {
    const map = new Map<string, { name: string; fullName: string; code: 'D' | 'N' }[]>();
    // Los turnos que la rotación del puesto genera llevan `positionId`; los
    // sueltos (cobertura, bloque dibujado, turno único) no. Un SF sigue contando
    // aunque su turno traiga posición, por compatibilidad con lo de antes.
    for (const s of shifts) {
      if (!s.startTime) continue;
      const esCobertura = !s.positionId || reliefGuardIds.has(s.guardId);
      if (!esCobertura) continue;
      const dateStr = dateToWall(new Date(s.startTime), tzName).dateStr;
      const key = `${s.stationId}-${dateStr}`;
      const g = s.guard;
      // El respaldo por `guardsPool` cubre el turno que llega sin objeto guard;
      // el segundo argumento cubre el que lo trae SIN nombre.
      const respaldo = guardsPool.find(x => x.id === s.guardId)?.label || 'Cobertura';
      const fullName = nombreDeVigilante(g, respaldo);
      const initials = inicialesDeVigilante(g, respaldo.slice(0, 2).toUpperCase());
      // D o N por la hora de inicio — el mismo umbral 18/6 del backend. Sólo lo
      // usa la cobertura HUÉRFANA (la que no cae sobre una «L»): ahí la celda
      // está vacía y la letra es lo único que dice si se cubrió el día o la noche.
      const startMin = dateToWall(new Date(s.startTime), tzName).minutes;
      const code: 'D' | 'N' = startMin >= 18 * 60 || startMin < 6 * 60 ? 'N' : 'D';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ name: initials || 'SF', fullName, code });
    }
    return map;
  }, [shifts, reliefGuardIds, tzName, guardsPool]);

  /* Los MISMOS turnos que `sfStationCoverage` resume por nombre, pero en crudo:
     hacen falta para poder BORRARLOS desde la selección. La píldora de cobertura
     se pinta en la primera fila del puesto, así que ahí es donde Supr la busca. */
  const coverageShiftsByStationDate = useMemo(() => {
    const map = new Map<string, ShiftRecord[]>();
    for (const s of shifts) {
      if (!s.startTime) continue;
      if (s.positionId && !reliefGuardIds.has(s.guardId)) continue;
      const key = `${s.stationId}-${dateToWall(new Date(s.startTime), tzName).dateStr}`;
      const list = map.get(key);
      if (list) list.push(s); else map.set(key, [s]);
    }
    return map;
  }, [shifts, reliefGuardIds, tzName]);

  // El servidor ya calcula estas alertas (`staffing.stationAlerts`). Cuando las
  // manda, este memo se saltaba… pero se calculaba igual y se tiraba: 30 puestos
  // x 365 dias x `isWorkDay` por nada. Ahora sale en la primera linea.
  const apiStationAlerts = Array.isArray(staffing?.stationAlerts) ? staffing!.stationAlerts : null;

  // Per-station alerts for uncovered fijo slots and SF rest-day coverage gaps.
  const localStationAlerts = useMemo(() => {
    const rows: { stationId: string; stationName: string; nickname?: string | null; missingFijoCount: number; sfUncoveredDays: number }[] = [];
    if (apiStationAlerts) return rows;

    // Indices por puesto, construidos UNA vez. Antes eran dos `.filter()` sobre
    // TODAS las posiciones y asignaciones DENTRO del bucle de puestos.
    const fijoPosByStation = new Map<string, StationPosition[]>();
    for (const p of positions) {
      if (p.type !== 'fijo') continue;
      const list = fijoPosByStation.get(p.stationId);
      if (list) list.push(p); else fijoPosByStation.set(p.stationId, [p]);
    }
    const fijoAsgByStation = new Map<string, GuardAssignment[]>();
    for (const a of assignments) {
      if (a.isRelief || positionsById.get(a.positionId)?.type !== 'fijo') continue;
      const list = fijoAsgByStation.get(a.stationId);
      if (list) list.push(a); else fijoAsgByStation.set(a.stationId, [a]);
    }

    for (const st of stations) {
      const stationFijoPositions = fijoPosByStation.get(st.id) || [];
      const stationFijoAssignments = fijoAsgByStation.get(st.id) || [];

      const assignedPosIds = new Set(stationFijoAssignments.map(a => a.positionId));
      const missingFijoCount = stationFijoPositions.filter(p => !assignedPosIds.has(p.id)).length;

      let sfUncoveredDays = 0;
      if (stationFijoAssignments.length > 0) {
        for (const day of monthDays) {
          const dateStr = fmtDate(day);
          const anyResting = stationFijoAssignments.some(a => isWorkDay(a, day) === 'rest');
          if (!anyResting) continue;

          const key = `${st.id}-${dateStr}`;
          const coveredBySf = (sfStationCoverage.get(key) || []).length > 0;
          if (!coveredBySf) sfUncoveredDays++;
        }
      }

      if (missingFijoCount > 0 || sfUncoveredDays > 0) {
        rows.push({
          stationId: st.id,
          stationName: st.stationName,
          nickname: st.nickname,
          missingFijoCount,
          sfUncoveredDays,
        });
      }
    }

    rows.sort((a, b) => (b.missingFijoCount + b.sfUncoveredDays) - (a.missingFijoCount + a.sfUncoveredDays));
    return rows;
  }, [apiStationAlerts, stations, positions, positionsById, assignments, monthDays, sfStationCoverage, isWorkDay]);

  const stationAlerts = useMemo<StationAlert[]>(() => {
    const rows = apiStationAlerts ?? localStationAlerts;
    // The staffing endpoint does not return the nominativo, and this panel is
    // where you pick which puesto to fix — so stitch it back on from the
    // stations we already hold. Several puestos share a stationName; without it
    // the list names four different posts identically.
    const nickById = new Map(stations.map(st => [String(st.id), st.nickname ?? null]));
    return rows.map(a => (a.nickname ? a : { ...a, nickname: nickById.get(String(a.stationId)) ?? null }));
  }, [apiStationAlerts, localStationAlerts, stations]);

  const stationAlertByStationId = useMemo(() => {
    const map = new Map<string, StationAlert>();
    for (const alert of stationAlerts || []) {
      if (alert?.stationId) map.set(alert.stationId, alert);
    }
    return map;
  }, [stationAlerts]);

  /**
   * Índice de novedades por (vigilante, día).
   *
   * Esto era un `overrides.find(...)` — un recorrido COMPLETO del array por cada
   * llamada. Y se llama una vez POR CELDA: la hoja del Mes es el año entero
   * (365 columnas) por cada puesto, así que con 90 puestos son ~33 000 llamadas
   * por render. Peor aún, la comparación hacía `String(o.date).slice(0, 10)`
   * DENTRO del bucle: una cadena nueva por cada elemento recorrido, en cada
   * celda. Medido en 620 ms por render.
   *
   * El mismo patrón correcto está ocho líneas más arriba
   * (`stationAlertByStationId`): un Map construido una vez por cambio de datos.
   *
   * Se conserva la semántica de `find`: si hubiera dos novedades para el mismo
   * vigilante y día, gana la PRIMERA — por eso el `has` antes del `set` y no un
   * `set` a secas, que se quedaría con la última.
   */
  const overrideByGuardDate = useMemo(() => {
    const map = new Map<string, ScheduleOverride>();
    for (const o of overrides || []) {
      if (!o?.guardId || !o?.date) continue;
      const key = `${o.guardId}|${String(o.date).slice(0, 10)}`;
      if (!map.has(key)) map.set(key, o);
    }
    return map;
  }, [overrides]);

  const getOverride = useCallback(
    (guardId: string, dateStr: string): ScheduleOverride | undefined =>
      overrideByGuardDate.get(`${guardId}|${dateStr}`),
    [overrideByGuardDate],
  );

  /**
   * Quién puede cubrir un día — TODOS los vigilantes, con su estado en esa fecha.
   *
   * Antes esta lista eran sólo los sacafrancos, y por eso la pantalla se
   * quedaba corta: hay sacafrancos fijos, sí, pero la mayoría de los huecos los
   * tapa quien ese día libra en otro puesto. Si la lista no los enseña, no
   * existen. Un sacafranco puede cubrir CUALQUIER estación (su asignación no lo
   * ata a una), así que aquí no se filtra por estación: se filtra por si puede
   * ese día.
   *
   * El estado sale de lo que YA sabe la rejilla: un turno real ese día = ocupado;
   * una novedad = ausente (y con qué); una rotación que ese día trabaja = de
   * turno en su puesto; el resto, libre.
   */
  const candidatosParaCubrir = useCallback((dateStr: string) => {
    const dia = new Date(dateStr + 'T00:00:00');
    const AUSENCIAS = ['V', 'PM', 'F', 'L'];
    return guardsPool.map(g => {
      const turno = shiftByGuardDate.get(`${g.id}|${dateStr}`);
      const nov = getOverride(g.id, dateStr);
      const propia = assignments.find(a => a.guardId === g.id && !a.isRelief);
      const esSf = reliefGuardIds.has(g.id);

      let estado: 'libre' | 'ocupado' | 'deTurno' | 'ausente' = 'libre';
      let detalle = '';
      if (nov && AUSENCIAS.includes(nov.type)) {
        estado = 'ausente'; detalle = nov.type;
      } else if (turno) {
        estado = 'ocupado'; detalle = stationsById.get(turno.stationId)?.stationName || 'otro puesto';
      } else if (propia && isWorkDay(propia, dia) !== 'rest') {
        estado = 'deTurno'; detalle = stationsById.get(propia.stationId)?.stationName || 'su puesto';
      }
      return { id: g.id, nombre: g.label, esSf, estado, detalle };
    }).sort((a, b) => {
      // Libres primero; entre libres, los sacafrancos delante (es su oficio).
      const peso = (r: typeof a) => (r.estado === 'libre' ? (r.esSf ? 0 : 1) : r.estado === 'deTurno' ? 2 : r.estado === 'ocupado' ? 3 : 4);
      const d = peso(a) - peso(b);
      return d !== 0 ? d : a.nombre.localeCompare(b.nombre);
    });
  }, [guardsPool, shiftByGuardDate, getOverride, assignments, reliefGuardIds, stationsById, isWorkDay]);

  // ─── Spreadsheet selection model ─────────────────────────────────────────
  // Rows (in visual order) that can hold a selection: every puesto row.

  const selectableRows = useMemo<SelRow[]>(() => {
    const rows: SelRow[] = [];
    for (const st of stations) {
      for (const pos of getPositionsForStation(st.id)) {
        rows.push({ key: pos.id, station: st, pos, assignments: getAssignmentsForPosition(pos.id), isSf: false });
      }
    }
    if (sfSectionOpen) {
      for (const pos of sfPositions) {
        rows.push({ key: pos.id, station: stationsById.get(pos.stationId) || null, pos, assignments: getAssignmentsForPosition(pos.id), isSf: true });
      }
    }
    return rows;
  }, [stations, sfPositions, sfSectionOpen, stationsById, getPositionsForStation, getAssignmentsForPosition]);

  const rowIndexByKey = useMemo(() => {
    const m = new Map<string, number>();
    selectableRows.forEach((r, i) => m.set(r.key, i));
    return m;
  }, [selectableRows]);

  // Selection: anchor (ar/ac) + focus (fr/fc) as indices into selectableRows / monthDays.
  const [sel, setSel] = useState<{ ar: number; ac: number; fr: number; fc: number } | null>(null);
  const mouseSelRef = useRef(false);

  const selBounds = useMemo(() => sel ? {
    r1: Math.min(sel.ar, sel.fr), r2: Math.max(sel.ar, sel.fr),
    c1: Math.min(sel.ac, sel.fc), c2: Math.max(sel.ac, sel.fc),
  } : null, [sel]);

  const cellSelCls = useCallback((rowKey: string, c: number): string => {
    if (!selBounds || !sel) return '';
    const r = rowIndexByKey.get(rowKey);
    if (r == null || r < selBounds.r1 || r > selBounds.r2 || c < selBounds.c1 || c > selBounds.c2) return '';
    const isFocus = r === sel.fr && c === sel.fc;
    // `ring-primary`/`bg-primary` son los tokens PUENTE de shadcn: apuntan a
    // `--brand`, así que la selección se repinta sola cuando el usuario cambia
    // el acento. Van como clases y no como estilo en línea porque esta función
    // devuelve className (la celda ya usa `style` para su propio tinte).
    return isFocus ? ' ring-2 ring-inset ring-primary bg-primary/10' : ' ring-1 ring-inset ring-primary/40 bg-primary/5';
  }, [selBounds, sel, rowIndexByKey]);

  const startCellSelect = useCallback((rowKey: string, c: number, shift: boolean) => {
    const r = rowIndexByKey.get(rowKey);
    if (r == null) return;
    setSel(prev => (shift && prev) ? { ...prev, fr: r, fc: c } : { ar: r, ac: c, fr: r, fc: c });
    if (!shift) mouseSelRef.current = true;
  }, [rowIndexByKey]);

  const hoverCellSelect = useCallback((rowKey: string, c: number) => {
    if (!mouseSelRef.current) return;
    const r = rowIndexByKey.get(rowKey);
    if (r == null) return;
    setSel(prev => prev ? { ...prev, fr: r, fc: c } : prev);
  }, [rowIndexByKey]);

  useEffect(() => {
    const up = () => { mouseSelRef.current = false; };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  /* Con la hoja virtualizada la celda destino puede NO estar pintada todavía,
     así que el desplazamiento horizontal se calcula por geometría (la columna
     `c` ocupa siempre [240 + c*44, 240 + (c+1)*44)) en vez de buscar el nodo.
     Para el eje vertical se usa la celda del NOMBRE de la fila, que es fija y
     existe siempre. Mover `scrollLeft` dispara el evento `scroll`, que es quien
     recalcula la ventana de columnas. */
  const scrollCellIntoView = useCallback((rowKey: string, c: number) => {
    const el = gridScrollRef.current;
    if (el) {
      if (c * COL_W < el.scrollLeft) el.scrollLeft = c * COL_W;
      else if (COL_STICKY_W + (c + 1) * COL_W > el.scrollLeft + el.clientWidth) {
        el.scrollLeft = COL_STICKY_W + (c + 1) * COL_W - el.clientWidth;
      }
    }
    document.getElementById(`hr-${rowKey}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, []);

  // ─── Actions ──────────────────────────────────────────────────────────────

  /** Las horas del puesto, para prefijar un turno de un solo día. */
  const horasDelPuesto = (positionId: string): [string, string] => {
    const pos = positionsById.get(positionId);
    const hhmm = (x?: string | null) => (x ? String(x).slice(0, 5) : '');
    const ini = hhmm(pos?.startTime) || '07:00';
    const fin = hhmm(pos?.endTime) || '19:00';
    return [ini, fin];
  };

  const openAssignForm = (stationId: string, positionId: string, dateStr?: string) => {
    const [ini, fin] = horasDelPuesto(positionId);
    setAssignTarget({ stationId, positionId });
    setAssignGuard('');
    setAssignStartDate(dateStr || tzToday());
    setAssignStartTime(ini);
    setAssignEndTime(fin);
    // Con fecha (clic derecho sobre un día) se asume tapar ESE día; sin fecha,
    // el gesto sólo puede significar rotación.
    setAssignMode(dateStr ? 'single' : 'rotation');
    setMoveFrom(null);
    setShowAssignForm(true);
  };

  const onGuardDragStart = (e: React.DragEvent, guardId: string, fromAssignment?: GuardAssignment) => {
    mouseSelRef.current = false; // a native drag never fires the mouseup that ends cell-selection
    e.dataTransfer.setData('guardId', guardId);
    if (fromAssignment) e.dataTransfer.setData('fromAssignmentId', fromAssignment.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  // Drop an SF's día onto a puesto cell → open the COVERAGE modal: prefilled
  // with what the station is missing that day (the suggestion), but fully
  // editable — D, N, 24h or any custom window. The SF has no rotation; every
  // coverage is placed and shaped by hand.
  const [sfCover, setSfCover] = useState<{
    sfGuardId: string; sfName: string; station: Station; dateStr: string;
    startStr: string; endStr: string; suggested: string;
  } | null>(null);
  const [sfCoverSaving, setSfCoverSaving] = useState(false);
  // Click-to-assign: clicking a fijo's "L" cell opens a picker of sacafrancos to
  // cover that day (no dragging needed — critical for puestos high up the grid).
  const [sfPick, setSfPick] = useState<{
    station: Station; pos: StationPosition; dateStr: string;
    assignment: GuardAssignment; guardName: string;
  } | null>(null);

  const placeSfCoverage = async (station: Station, pos: StationPosition, dateStr: string, sfGuardId: string) => {
    const stFijos = assignments.filter(a =>
      a.stationId === station.id && !a.isRelief && positionsById.get(a.positionId)?.type === 'fijo');
    const day = new Date(dateStr + 'T00:00:00');

    // GUARD: the SF only covers FREE days. If the puesto's fijo is working
    // that day (real shift or active rotation, and no absence novedad freeing
    // it), refuse — the day must be released first.
    const ABSENCES = ['V', 'PM', 'F', 'L'];
    const occupiedBy = assignments
      .filter(a => a.positionId === pos.id)
      .find(a => {
        const ov = getOverride(a.guardId, dateStr);
        if (ov) return !ABSENCES.includes(ov.type); // absence novedad = day freed
        const s = shiftByGuardDate.get(`${a.guardId}|${dateStr}`);
        if (s && s.stationId === station.id) return true;
        return isWorkDay(a, day) !== 'rest';
      });
    if (occupiedBy) {
      const nm = nombreDeVigilante(occupiedBy.guard, 'el fijo');
      toast.error(`Ese día ${nm} está de turno en este puesto. Primero libera el día (novedad de Libre/Vacaciones/Permiso, o elimina el turno con clic derecho) y luego arrastra el sacafranco.`);
      return;
    }
    const covered = new Set<string>();
    for (const a of stFijos) {
      const w = isWorkDay(a, day);
      if (w === 'rest') continue;
      if (station.scheduleType === '12h-day') covered.add('day');
      else if (station.scheduleType === '12h-night') covered.add('night');
      else covered.add(w === 'night' ? 'night' : 'day');
    }
    let startMin = 7 * 60, endMin = 19 * 60, endNextDay = false, code = 'D';
    if (station.scheduleType === 'custom' && pos.startTime && pos.endTime) {
      // Custom blocks carry their real hours on the position (24x24 → start==end).
      const toMin = (x: string) => { const [h, mm] = x.split(':').map(n => parseInt(n, 10) || 0); return (h % 24) * 60 + (mm % 60); };
      startMin = toMin(pos.startTime);
      endMin = toMin(pos.endTime);
      endNextDay = endMin <= startMin; // wraps midnight (full 24h when equal)
      code = startMin >= 18 * 60 || startMin < 6 * 60 ? 'N' : 'D';
    } else {
      const req: string[] = station.scheduleType === '24h' ? ['day', 'night'] : station.scheduleType === '12h-night' ? ['night'] : ['day'];
      const half = req.filter(h => !covered.has(h))[0] || req[0];
      if (half === 'night') { startMin = 19 * 60; endMin = 7 * 60; endNextDay = true; code = 'N'; }
    }
    // Open the coverage modal prefilled with the suggestion — the user shapes
    // the final turno (D / N / 24h / custom hours) before anything is created.
    const hhmm = (m: number) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const g = guardsPool.find(x => x.id === sfGuardId);
    const sfName = g?.label || primerNombre(assignments.find(a => a.guardId === sfGuardId)?.guard, 'Sacafranco');
    setSfCover({
      sfGuardId,
      sfName,
      station,
      dateStr,
      startStr: hhmm(startMin),
      endStr: hhmm(endMin),
      suggested: `${code} · ${hhmm(startMin)} – ${hhmm(endMin)}${endNextDay || endMin <= startMin ? ' (día siguiente)' : ''}`,
    });
  };

  const saveSfCover = async () => {
    if (!sfCover) return;
    const toMin = (x: string) => { const [h, mm] = x.split(':').map(n => parseInt(n, 10) || 0); return (h % 24) * 60 + (mm % 60); };
    const startMin = toMin(sfCover.startStr);
    let endMin = toMin(sfCover.endStr);
    const nextDay = endMin <= startMin; // wraps midnight (equal = full 24h)
    if (nextDay) endMin += 1440;
    const [y, mo, d] = sfCover.dateStr.split('-').map(Number);
    const start = wallToDate(y, mo, d, startMin, tzName);
    const end = wallToDate(y, mo, d, endMin, tzName);
    setSfCoverSaving(true);
    try {
      // Replace the SF's overlapping shifts (same rule as the turno único).
      const overlapping = shifts.filter(s =>
        s.guardId === sfCover.sfGuardId && new Date(s.startTime) < end && new Date(s.endTime) > start);
      if (overlapping.length) {
        await ApiService.delete(`/tenant/${tenantId}/shift?ids=${overlapping.map(s => s.id).join(',')}`).catch(() => {});
      }
      await ApiService.post(`/tenant/${tenantId}/shift`, {
        data: { startTime: start.toISOString(), endTime: end.toISOString(), station: sfCover.station.id, guard: sfCover.sfGuardId, postSiteId: sfCover.station.postSiteId },
      });
      toast.success(`Sacafranco cubre ${stationLabel(sfCover.station)}`);
      setSfCover(null);
      fetchAll({ silent: true });
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || t('ui.Schedule.errorAlAsignarLaCobertura', 'Error al asignar la cobertura'));
    } finally {
      setSfCoverSaving(false);
    }
  };

  const removeSfCoverage = async (shift: ShiftRecord) => {
    const stName = stationsById.get(shift.stationId)?.stationName || 'la estación';
    if (!(await confirmDialog({ title: 'Quitar cobertura', message: `¿Quitar la cobertura del sacafranco en ${stName} ese día? Se elimina el turno.`, confirmText: 'Quitar', tone: 'danger' }))) return;
    try {
      await ApiService.delete(`/tenant/${tenantId}/shift/${shift.id}`);
      toast.success('Cobertura eliminada');
      fetchAll({ silent: true });
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || 'Error al eliminar');
    }
  };

  // ─── Right-click menu on the year canvas ─────────────────────────────────

  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  // "Trasladar a otra estación" from a right-clicked cell.
  const [transferTarget, setTransferTarget] = useState<TransferTarget | null>(null);

  const duplicateShiftNextDay = async (s: ShiftRecord) => {
    try {
      const start = new Date(new Date(s.startTime).getTime() + 86400000);
      const end = new Date(new Date(s.endTime).getTime() + 86400000);
      await ApiService.post(`/tenant/${tenantId}/shift`, {
        data: { startTime: start.toISOString(), endTime: end.toISOString(), station: s.stationId, guard: s.guardId, postSiteId: stationsById.get(s.stationId)?.postSiteId },
      });
      toast.success(t('ui.Schedule.turnoDuplicadoAlDiaSiguiente'));
      fetchAll({ silent: true });
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || 'Error al duplicar');
    }
  };

  const deleteDayShift = async (s: ShiftRecord) => {
    const msg = s.positionId
      ? '¿Eliminar el turno de este día? Fue generado por la rotación y puede regenerarse al reoptimizar o reasignar.'
      : '¿Eliminar el turno de este día?';
    if (!(await confirmDialog({ title: 'Eliminar turno', message: msg, confirmText: 'Eliminar', tone: 'danger' }))) return;
    try {
      await ApiService.delete(`/tenant/${tenantId}/shift/${s.id}`);
      toast.success(t('comun.turnoEliminado'));
      fetchAll({ silent: true });
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || 'Error al eliminar');
    }
  };

  const openCellCtx = (e: React.MouseEvent, station: Station, pos: StationPosition, posAssignments: GuardAssignment[], dateStr: string) => {
    e.preventDefault();
    const items: CtxItem[] = [];
    for (const a of posAssignments) {
      const s = shiftByGuardDate.get(`${a.guardId}|${dateStr}`);
      if (s && s.stationId === station.id) {
        const nm = primerNombre(a.guard, 'vigilante');
        const full = nombreDeVigilante(a.guard, nm);
        items.push({ label: `Editar turno de ${nm} (vista Día)…`, onClick: () => jumpToDay(dateStr) });
        items.push({ label: t('ui.Schedule.duplicarTurnoAlDiaSiguiente', 'Duplicar turno al día siguiente'), onClick: () => void duplicateShiftNextDay(s) });
        items.push({ label: t('ui.Schedule.eliminarTurnoDeEsteDia', 'Eliminar turno de este día'), danger: true, onClick: () => void deleteDayShift(s) });
        items.push({ label: '—' });
      }
    }
    if (posAssignments.length) {
      const a = posAssignments[0];
      const guardName = nombreDeVigilante(a.guard, 'Vigilante');
      // On a rest (L) day the puesto is uncovered — offer to assign a sacafranco
      // to cover it (opens the picker modal). Skip when it's already covered.
      // ── QUIÉN CUBRE ESTE DÍA ──────────────────────────────────────────
      // El día que el fijo libra («L») es el hueco de verdad, y es donde más se
      // usa el clic derecho. Antes esto sólo salía si NADIE lo cubría aún y
      // sólo ofrecía sacafrancos; ahora sale siempre en un día de descanso —
      // añadir un segundo relevo es legítimo— y el selector enseña a todos.
      const resting = isWorkDay(a, new Date(dateStr + 'T00:00:00')) === 'rest';
      const yaCubierto = (sfStationCoverage.get(`${station.id}-${dateStr}`) || []).length > 0;
      if (resting) {
        items.push({
          label: yaCubierto ? 'Añadir otro relevo este día…' : 'Cubrir este día…',
          onClick: () => { setSfPickQuery(''); setSfPick({ station, pos, dateStr, assignment: a, guardName }); },
        });
        items.push({ label: '—' });
      }
      // Trasladar works with or without a generated shift row: with one we move
      // that exact turno, without one the backend resolves the cell's date in
      // the tenant timezone. Gating this on a shift row hid it on most cells,
      // because the grid paints D/N/L from the rotation, not from shift rows.
      items.push({
        label: `Trasladar a ${primerNombre(a.guard, 'vigilante')} a otra estación…`,
        onClick: () => setTransferTarget({
          guardId: a.guardId,
          guardName,
          shiftId: shiftByGuardDate.get(`${a.guardId}|${dateStr}`)?.id ?? null,
          stationId: station.id,
          stationName: station.stationName,
          dateStr,
        }),
      });
      // ── APRENDIZ EN ACOMPAÑAMIENTO ────────────────────────────────────
      // El vigilante nuevo hace unas semanas junto al titular antes de tomar su
      // propio puesto. Sigue SUS días —no una rotación propia, que caería en
      // los libres del titular— y no cuenta como cobertura: si el titular falta
      // y sólo ficha el aprendiz, el puesto sale descubierto, que es la verdad.
      items.push({
        label: `Poner un aprendiz con ${primerNombre(a.guard, 'este vigilante')}…`,
        onClick: () => setShadowFor({
          assignmentId: a.id,
          titularName: guardName,
          stationName: stationLabel(station),
          guardId: '',
          startDate: dateStr,
          endDate: '',
        }),
      });
      items.push({ label: 'Registrar novedad…', onClick: () => setOverrideTarget({ guardId: a.guardId, guardName, date: dateStr, assignmentId: a.id }) });
      const ov = getOverride(a.guardId, dateStr);
      if (ov) items.push({ label: `Quitar novedad (${ov.type})`, danger: true, onClick: () => void removeOverride(ov.id) });
      // ── TAPAR EL HUECO CON QUIEN SEA ──────────────────────────────────
      // Antes, un puesto CON fijo sólo ofrecía «Asignar sacafranco…», y sólo
      // si ese día libraba y nadie lo cubría ya. Sin sacafrancos configurados
      // el menú era un callejón sin salida: el hueco estaba ahí y no había
      // forma de taparlo desde la casilla. Esto vale para cualquier vigilante
      // y para cualquier día — es un turno suelto, no una rotación.
      // En un día TRABAJADO el selector de arriba no aplica (`placeSfCoverage`
      // se niega a doblar un día que el fijo trabaja, y hace bien). Para el caso
      // raro de reforzar un puesto, queda el turno suelto por el diálogo.
      if (!resting) {
        items.push({ label: '—' });
        items.push({ label: 'Añadir un turno suelto aquí…', onClick: () => openAssignForm(station.id, pos.id, dateStr) });
      }
    } else {
      items.push({ label: 'Cubrir este día con un vigilante…', onClick: () => openAssignForm(station.id, pos.id, dateStr) });
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, items });
  };

  const openSfCtx = (e: React.MouseEvent, pos: StationPosition, sfGuard: GuardAssignment | null, dateStr: string) => {
    e.preventDefault();
    const items: CtxItem[] = [];
    if (sfGuard) {
      const covShift = shiftByGuardDate.get(`${sfGuard.guardId}|${dateStr}`);
      if (covShift) {
        items.push({ label: 'Editar cobertura (vista Día)…', onClick: () => jumpToDay(dateStr) });
        items.push({ label: t('ui.Schedule.duplicarAlDiaSiguiente', 'Duplicar al día siguiente'), onClick: () => void duplicateShiftNextDay(covShift) });
        items.push({ label: 'Quitar cobertura', danger: true, onClick: () => void removeSfCoverage(covShift) });
        items.push({ label: '—' });
      }
      const gName = nombreDeVigilante(sfGuard.guard, 'Sacafranco');
      items.push({
        label: 'Trasladar a otra estación…',
        onClick: () => setTransferTarget({
          guardId: sfGuard.guardId,
          guardName: gName,
          shiftId: covShift?.id ?? null,
          stationId: covShift?.stationId ?? pos.stationId,
          stationName: stations.find(st => st.id === (covShift?.stationId ?? pos.stationId))?.stationName || null,
          dateStr,
        }),
      });
      items.push({ label: 'Registrar novedad…', onClick: () => setOverrideTarget({ guardId: sfGuard.guardId, guardName: gName, date: dateStr, assignmentId: sfGuard.id }) });
      const ov = getOverride(sfGuard.guardId, dateStr);
      if (ov) items.push({ label: `Quitar novedad (${ov.type})`, danger: true, onClick: () => void removeOverride(ov.id) });
    } else {
      // La posición de sacafranco admite las dos cosas: tapar ese día (turno
      // suelto) o dejar a alguien fijo en la posición (rotación). El diálogo
      // pregunta cuál; el nombre ya no promete sólo una.
      items.push({ label: 'Asignar a esta posición…', onClick: () => openAssignForm(pos.stationId, pos.id, dateStr) });
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, items });
  };

  const handleDrop = (e: React.DragEvent, stationId: string, positionId: string, dateStr?: string) => {
    e.preventDefault();
    // An SF día dropped on a puesto cell = place coverage (not an assignment).
    const sfCoverGuardId = e.dataTransfer.getData('sfCoverGuardId');
    if (sfCoverGuardId) {
      const st = stationsById.get(stationId);
      const pos = positionsById.get(positionId);
      if (st && pos && pos.type !== 'sacafranco' && dateStr) void placeSfCoverage(st, pos, dateStr, sfCoverGuardId);
      return;
    }
    const guardId = e.dataTransfer.getData('guardId');
    if (!guardId) return;
    const fromId = e.dataTransfer.getData('fromAssignmentId') || '';
    const from = fromId ? assignments.find(a => a.id === fromId) || null : null;
    if (from && from.positionId === positionId) return; // dropped back on its own puesto
    const [ini, fin] = horasDelPuesto(positionId);
    setMoveFrom(from);
    setAssignTarget({ stationId, positionId });
    setAssignGuard(guardId);
    setAssignStartDate(dateStr || tzToday());
    setAssignStartTime(ini);
    setAssignEndTime(fin);
    // Un traslado es siempre rotación; soltar sobre un día es tapar ese día.
    setAssignMode(from ? 'rotation' : (dateStr ? 'single' : 'rotation'));
    setShowAssignForm(true);
  };

  const saveAssignment = async () => {
    if (!assignTarget || !assignGuard) {
      toast.error(t('comun.completeTodosLosCampos'));
      return;
    }
    const isSacafranco = positions.find(p => p.id === assignTarget.positionId)?.type === 'sacafranco';

    // ── SÓLO ESTE DÍA ──────────────────────────────────────────────────────
    // Un turno suelto, exactamente el mismo que dibujar un bloque en la vista
    // Día o el «Turno único» de la estación: una petición, sin rotación y sin
    // generar un año de turnos. Es lo que hace falta para tapar un hueco.
    if (assignMode === 'single') {
      const toMin = (x: string) => { const [h, mm] = x.split(':').map(n => parseInt(n, 10) || 0); return (h % 24) * 60 + (mm % 60); };
      const startMin = toMin(assignStartTime);
      let endMin = toMin(assignEndTime);
      // Fin ≤ inicio = cruza la medianoche (iguales = 24 h completas).
      if (endMin <= startMin) endMin += 1440;
      const [y, mo, d] = assignStartDate.split('-').map(Number);
      const start = wallToDate(y, mo, d, startMin, tzName);
      const end = wallToDate(y, mo, d, endMin, tzName);
      setAssignSaving(true);
      try {
        // Reemplaza, no duplica: misma regla que el bloque dibujado y el turno único.
        const solapados = shifts.filter(x =>
          x.guardId === assignGuard && new Date(x.startTime) < end && new Date(x.endTime) > start);
        if (solapados.length) {
          await ApiService.delete(`/tenant/${tenantId}/shift?ids=${solapados.map(x => x.id).join(',')}`).catch(() => {});
        }
        const st = stationsById.get(assignTarget.stationId);
        await ApiService.post(`/tenant/${tenantId}/shift`, {
          data: {
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            station: assignTarget.stationId,
            guard: assignGuard,
            postSiteId: st?.postSiteId,
          },
        });
        toast.success(solapados.length ? 'Turno creado (reemplazó turnos solapados)' : 'Turno creado para ese día');
        setShowAssignForm(false);
        setMoveFrom(null);
        fetchAll({ silent: true });
      } catch (e: any) {
        toast.error(e?.data?.message || e?.message || t('ui.Schedule.errorAlCrearElTurno', 'Error al crear el turno'));
      } finally {
        setAssignSaving(false);
      }
      return;
    }

    setAssignSaving(true);
    try {
      // Drag-move: free the guard from their current puesto first (one active
      // rotation per vigilante), then create the new assignment.
      if (moveFrom) {
        await ApiService.delete(`/tenant/${tenantId}/guard-assignment/${moveFrom.id}`);
      }
      await ApiService.post(`/tenant/${tenantId}/guard-assignment`, {
        data: {
          guardId: assignGuard,
          stationId: assignTarget.stationId,
          positionId: assignTarget.positionId,
          startDate: assignStartDate,
          isRelief: isSacafranco,
          // No rotationStyleId here — the guard INHERITS the station's patrón de
          // rotación (resolved server-side in assignmentService from station.rotationStyleId).
        },
      });
      toast.success(moveFrom ? 'Vigilante movido de puesto' : 'Vigilante asignado');
      setShowAssignForm(false);
      setMoveFrom(null);
      fetchAll();
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || 'Error al asignar');
    } finally {
      setAssignSaving(false);
    }
  };

  const removeAssignment = async (assignmentId: string) => {
    if (!(await confirmDialog({ title: t('ui.Schedule.removerAsignacion', 'Remover asignación'), message: '¿Remover esta asignación? Los turnos futuros se anulan; los ya trabajados se conservan en el historial.', confirmText: 'Remover', tone: 'danger' }))) return;
    try {
      await ApiService.delete(`/tenant/${tenantId}/guard-assignment/${assignmentId}`);
      toast.success(t('ui.Schedule.asignacionRemovida'));
      fetchAll();
    } catch (e: any) {
      toast.error(e?.message || 'Error');
    }
  };

  const configureStation = (station: Station) => {
    setConfigStation(station);
    setConfigType(station.scheduleType || '24h');
    setConfigRotation(station.rotationStyleId || '');
    setCfgStart('07:00');
    setCfgEnd('07:00');
    setCfgBlockHours('');
    setCfgRestCoverage('sacafranco');
    setCfgRotStyle(null);
    // The overview payload doesn't carry the custom window/coverage — fetch the
    // station detail (best-effort) so the modal opens with the current values.
    ApiService.get(`/tenant/${tenantId}/station/${station.id}`)
      .then((res: StationConfigDetail & { data?: StationConfigDetail }) => {
        const s = res?.data ?? res ?? {};
        if (s.startingTimeInDay) setCfgStart(String(s.startingTimeInDay).slice(0, 5));
        if (s.finishTimeInDay) setCfgEnd(String(s.finishTimeInDay).slice(0, 5));
        if (s.restCoverage === 'alternate') setCfgRestCoverage('alternate');
      })
      .catch(() => { /* defaults stand */ });
  };

  const saveStationConfig = async () => {
    if (!configStation) return;
    if (configType === 'custom') {
      if (!cfgStart || !cfgEnd) { toast.error(t('comun.defineLaHoraDeInicio')); return; }
      if (cfgBlockHours && !cfgBlocksOk) { toast.error(t('comun.laDuracionDelTurnoDebe')); return; }
      if (cfgRestCoverage === 'alternate' && !cfgAlternateOk) {
        toast.error(t('comun.paraAlternarSinSacafrancoEl'));
        return;
      }
    }
    if (!(await confirmDialog({ message: 'Cambiar el horario reconfigura los puestos del turno. Si hay vigilantes asignados a esta estación, deberán reasignarse. ¿Continuar?', confirmText: 'Continuar' }))) return;
    setConfigSaving(true);
    try {
      // Same payload as the station-page editor — one engine, two doors.
      await ApiService.post(`/tenant/${tenantId}/station/${configStation.id}/auto-positions`, {
        data: {
          scheduleType: configType,
          rotationStyleId: configRotation || undefined, // alternate + none → engine seeds 1-1
          startTime: configType === 'custom' ? cfgStart : undefined,
          endTime: configType === 'custom' ? cfgEnd : undefined,
          blockHours: configType === 'custom' && cfgBlockHours ? Number(cfgBlockHours) : undefined,
          restCoverage: configType === 'custom' ? cfgRestCoverage : undefined,
        },
      });
      toast.success(t('ui.Schedule.estacionConfigurada'));
      setConfigStation(null);
      fetchAll();
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || 'Error');
    } finally {
      setConfigSaving(false);
    }
  };

  /**
   * ── EDITAR UN PUESTO SIN DESTRUIRLO ──────────────────────────────────────
   * Hasta ahora la única forma de cambiarle las horas a un puesto era volver a
   * pasar por «Reconfigurar», que llama a `auto-positions` — y eso BORRA las
   * posiciones, las asignaciones y los turnos de la estación para rehacerlos.
   * Cambiar un 07:00 costaba el horario entero.
   *
   * El backend ya tenía la puerta buena abierta y nadie la usaba:
   * `PUT /station/:id/positions/:positionId` cambia nombre/tipo/horas/plazas y
   * llama a `regenerateStationShiftsSafe`, que rehace los turnos futuros desde
   * las horas nuevas SIN tocar a quién está asignado. El mismo formulario crea
   * (POST) cuando no hay `positionId`.
   */
  /** Alta de un aprendiz que acompaña a un titular. */
  const [shadowFor, setShadowFor] = useState<{
    assignmentId: string; titularName: string; stationName: string;
    guardId: string; startDate: string; endDate: string;
  } | null>(null);
  const [shadowSaving, setShadowSaving] = useState(false);

  const saveShadow = async () => {
    if (!shadowFor) return;
    if (!shadowFor.guardId) { toast.error('Elige al aprendiz'); return; }
    if (!shadowFor.endDate) { toast.error('Un acompañamiento necesita fecha de fin'); return; }
    setShadowSaving(true);
    try {
      await ApiService.post(
        `/tenant/${tenantId}/guard-assignment/${shadowFor.assignmentId}/shadow`,
        { data: { guardId: shadowFor.guardId, startDate: shadowFor.startDate, endDate: shadowFor.endDate } },
      );
      toast.success('Aprendiz en acompañamiento — sigue los días del titular y no cuenta como cobertura');
      setShadowFor(null);
      fetchAll({ silent: true });
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || 'No se pudo registrar el acompañamiento');
    } finally {
      setShadowSaving(false);
    }
  };

  const [posEditor, setPosEditor] = useState<{
    stationId: string; positionId?: string; stationName: string;
    name: string; type: string; startTime: string; endTime: string; guardsNeeded: string;
  } | null>(null);
  const [posSaving, setPosSaving] = useState(false);

  const addPosition = (stationId: string) => {
    const st = stationsById.get(stationId);
    setPosEditor({
      stationId,
      stationName: st ? stationLabel(st) : '',
      name: 'Sacafranco', type: 'sacafranco',
      startTime: '07:00', endTime: '19:00', guardsNeeded: '1',
    });
  };

  const editPosition = (station: Station, pos: StationPosition) => {
    setPosEditor({
      stationId: station.id,
      positionId: pos.id,
      stationName: stationLabel(station),
      name: pos.name || '',
      type: pos.type || 'fijo',
      startTime: (pos.startTime || '07:00').slice(0, 5),
      endTime: (pos.endTime || '19:00').slice(0, 5),
      guardsNeeded: String((pos as any).guardsNeeded ?? 1),
    });
  };

  const savePosition = async () => {
    if (!posEditor) return;
    if (!posEditor.name.trim()) { toast.error('Ponle un nombre al puesto'); return; }
    setPosSaving(true);
    try {
      const data = {
        name: posEditor.name.trim(),
        type: posEditor.type,
        startTime: posEditor.startTime,
        endTime: posEditor.endTime,
        guardsNeeded: Number(posEditor.guardsNeeded) || 1,
      };
      if (posEditor.positionId) {
        await ApiService.put(`/tenant/${tenantId}/station/${posEditor.stationId}/positions/${posEditor.positionId}`, { data });
        toast.success('Puesto actualizado — los turnos futuros se rehicieron con las horas nuevas');
      } else {
        await ApiService.post(`/tenant/${tenantId}/station/${posEditor.stationId}/positions`, { data: { ...data, sortOrder: 99 } });
        toast.success('Puesto agregado');
      }
      setPosEditor(null);
      fetchAll({ silent: true });
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || 'No se pudo guardar el puesto');
    } finally {
      setPosSaving(false);
    }
  };

  const deletePosition = async (stationId: string, positionId: string) => {
    if (!(await confirmDialog({ title: t('ui.Schedule.eliminarPosicion', 'Eliminar posición'), message: '¿Eliminar esta posición?', confirmText: 'Eliminar', tone: 'danger' }))) return;
    try {
      await ApiService.delete(`/tenant/${tenantId}/station/${stationId}/positions/${positionId}`);
      toast.success(t('ui.Schedule.posicionEliminada'));
      fetchAll();
    } catch (e: any) {
      toast.error(e?.message || 'Error al eliminar');
    }
  };

  // AI Auto-assign
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [autoResult, setAutoResult] = useState<AutoAssignResult | null>(null);

  // Draft horario proposal (generate → review/diff → publish/discard).
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalData, setProposalData] = useState<ProposalData | null>(null); // { proposal, changes }
  const [publishing, setPublishing] = useState(false);
  const [planData, setPlanData] = useState<PlanData | null>(null); // implementation plan after publish

  const generateDraft = async () => {
    setProposalLoading(true);
    try {
      const gen = await ApiService.post(`/tenant/${tenantId}/scheduler/proposals`, { data: { scope: 'tenant' } });
      const id = gen?.proposalId || gen?.data?.proposalId;
      if (!id) throw new Error('No se pudo generar el borrador');
      const detail = await ApiService.get(`/tenant/${tenantId}/scheduler/proposals/${id}`);
      setProposalData(detail?.data ?? detail);
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || t('ui.Schedule.errorGenerandoElBorrador', 'Error generando el borrador'));
    } finally {
      setProposalLoading(false);
    }
  };

  const publishProposal = async (allowGaps = false) => {
    const id = proposalData?.proposal?.id;
    if (!id) return;
    setPublishing(true);
    try {
      const res = await ApiService.post(`/tenant/${tenantId}/scheduler/proposals/${id}/publish`, { data: { confirm: true, allowGaps } });
      const notified = res?.plan?.notifiedGuards ?? res?.data?.plan?.notifiedGuards ?? 0;
      toast.success(`Horario publicado · ${notified} vigilante${notified === 1 ? '' : 's'} notificado${notified === 1 ? '' : 's'}`);
      // Switch the modal to the implementation plan (who was notified).
      try {
        const plan = await ApiService.get(`/tenant/${tenantId}/scheduler/proposals/${id}/plan`);
        setPlanData(plan?.data ?? plan);
      } catch { setPlanData({ plan: { notifiedGuards: notified }, items: [] }); }
      fetchAll();
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || 'Error al publicar');
    } finally {
      setPublishing(false);
    }
  };

  const discardProposal = async () => {
    const id = proposalData?.proposal?.id;
    if (id) {
      try { await ApiService.post(`/tenant/${tenantId}/scheduler/proposals/${id}/discard`, { data: {} }); } catch { /* best effort */ }
    }
    setProposalData(null);
  };

  const closeProposalModal = () => { setProposalData(null); setPlanData(null); };

  // Geocode guards missing home coordinates (enables real proximity ranking).
  const [geocoding, setGeocoding] = useState(false);
  const runGeocode = async () => {
    setGeocoding(true);
    try {
      const res = await ApiService.post(`/tenant/${tenantId}/security-guard/geocode-missing`, {});
      const g = res?.geocoded ?? res?.data?.geocoded ?? 0;
      const rem = res?.remaining ?? res?.data?.remaining ?? 0;
      toast.success(`${g} vigilante(s) geolocalizados${rem > 0 ? ` · ${rem} pendientes (ejecuta de nuevo)` : ''}`);
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || 'Error al geolocalizar vigilantes');
    } finally {
      setGeocoding(false);
    }
  };
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState<string | null>(null);

  const runAiRecommend = async () => {
    setAiLoading(true);
    setAiRecommendation(null);
    try {
      const result: { recommendation?: string; data?: { recommendation?: string } } = await ApiService.post(`/tenant/${tenantId}/scheduler/ai-recommend`, { data: { type: 'optimize' } });
      const rec = result?.recommendation || result?.data?.recommendation || 'Sin respuesta';
      setAiRecommendation(rec);
    } catch (e: any) {
      toast.error('Error al consultar IA');
      console.error(e);
    } finally {
      setAiLoading(false);
    }
  };

  const runAutoAssign = async () => {
    if (!(await confirmDialog({ message: '¿Asignar automáticamente vigilantes a todas las estaciones sin cubrir?\n\nSolo se cubren los puestos VACÍOS con vigilantes sin asignar (por cercanía, configurando rotaciones y sacafrancos). NO se moverá ni reasignará ningún vigilante que ya esté asignado a un puesto.', confirmText: 'Asignar' }))) return;
    setAutoAssigning(true);
    setAutoResult(null);
    try {
      const res = await ApiService.post(`/tenant/${tenantId}/scheduler/auto-assign`, { data: {} });
      setAutoResult(res);
      toast.success(`${res.assignmentsCreated} asignaciones creadas`);
      fetchAll();
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || t('ui.Schedule.errorEnAutoAsignacion', 'Error en auto-asignación'));
    } finally {
      setAutoAssigning(false);
    }
  };

  const runOptimizeSacafrancos = async () => {
    if (!(await confirmDialog({ message: '¿Optimizar la rotación de sacafrancos?\n\nATENCIÓN: esto MOVERÁ vigilantes sacafranco ya asignados a otros puestos/estaciones y regenerará sus turnos para maximizar cobertura. Los vigilantes fijos NO se tocan.', confirmText: 'Optimizar' }))) return;
    setAutoAssigning(true);
    try {
      const res = await ApiService.post(`/tenant/${tenantId}/scheduler/optimize-sacafrancos`, { data: {} });
      toast.success(res?.message || 'Sacafrancos optimizados');
      fetchAll();
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || t('ui.Schedule.errorEnOptimizacion', 'Error en optimización'));
    } finally {
      setAutoAssigning(false);
    }
  };

  // Schedule overrides (novedades)
  const [overrideTarget, setOverrideTarget] = useState<{ guardId: string; guardName: string; date: string; assignmentId?: string } | null>(null);

  const performOverrideSave = useCallback(async (
    target: { guardId: string; guardName: string; date: string; assignmentId?: string },
    type: string,
    note?: string,
  ) => {
    // Marking an L on a fijo usually means "the real rotation is phased
    // differently" (the generated pattern put the libres on the wrong days).
    // The style already knows how many libres its cycle has (6-1 → 1, 4-4-2 →
    // 2), so ONE click is enough: the day you click becomes the START of the
    // rest block and it auto-extends `restDays` forward. We offer to re-anchor
    // THIS fijo's whole rotation from there — no need to place each L by hand.
    if (type === 'L' && target.assignmentId) {
      const assignment = assignments.find(a => a.id === target.assignmentId);
      const pos = assignment ? positionsById.get(assignment.positionId) : null;
      const isFijo = !!assignment && !(pos?.type === 'sacafranco' || assignment.isRelief);
      const station = assignment ? stationsById.get(assignment.stationId) : null;
      const rot = (station?.rotationStyleId ? rotationStylesById.get(station.rotationStyleId) : null) || assignment?.rotationStyle;

      if (isFijo && rot && rot.restDays > 0) {
        const dayMs = 86400000;
        const toLocal = (s: string) => new Date(s + 'T00:00:00');
        const fmt = (d: Date) =>
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const fmtHuman = (s: string) =>
          toLocal(s).toLocaleDateString(localeActual(), { weekday: 'long', day: 'numeric', month: 'long' });
        const guardId = target.guardId;
        const assignmentId = target.assignmentId;

        // The clicked day starts the rest block; it spans `restDays` forward.
        const blockStart = target.date;
        const blockDates = Array.from({ length: rot.restDays }, (_, i) =>
          fmt(new Date(toLocal(blockStart).getTime() + i * dayMs)),
        );
        const blockHuman =
          rot.restDays === 1
            ? `el ${fmtHuman(blockStart)}`
            : `${rot.restDays} días de descanso (${blockDates.map(fmtHuman).join(' y ')})`;

        const applyForward = await confirmDialog({
          title: t('ui.Schedule.ajustarLaRotacionDesdeEsteLibre', 'Ajustar la rotación desde este libre'),
          message:
            `El puesto usa el patrón ${rot.name}${rot.restDays > 1 ? ` (${rot.restDays} libres seguidos)` : ''}. ` +
            `¿Quieres que ${target.guardName} descanse ${blockHuman} y la secuencia continúe automáticamente desde ahí?\n\n` +
            `Se recalculan solo los turnos futuros de este vigilante — los demás no se tocan.\n\n` +
            `«Solo este día» registra únicamente una novedad de libre en esa fecha.`,
          confirmText: 'Aplicar en adelante',
          cancelText: 'Solo este día',
        });

        if (applyForward) {
          try {
            await ApiService.post(`/tenant/${tenantId}/guard-assignment/${assignmentId}/rephase`, {
              data: { restStartDate: blockStart },
            });
            // The rotation now rests on the block days. Remove any hand-placed
            // L novedades in that range so the grid is driven purely by the
            // pattern (no leftover/duplicate libres).
            const win = 45;
            const winStart = fmt(new Date(toLocal(blockStart).getTime() - win * dayMs));
            const winEnd = fmt(new Date(toLocal(blockStart).getTime() + win * dayMs));
            const fresh = await ApiService.get(
              `/tenant/${tenantId}/schedule-overrides?guardId=${guardId}&startDate=${winStart}&endDate=${winEnd}`,
            ).catch(() => null);
            const freshRows: ScheduleOverride[] = Array.isArray(fresh) ? fresh : (fresh?.rows || []);
            const toDelete = freshRows.filter(o => o.type === 'L' && blockDates.includes(String(o.date).slice(0, 10)));
            await Promise.all(
              toDelete.map(o => ApiService.delete(`/tenant/${tenantId}/schedule-overrides/${o.id}`).catch(() => {})),
            );
            toast.success(`Rotación ${rot.name} reajustada — la secuencia sigue desde este libre`);
            setOverrideTarget(null);
            fetchAll();
          } catch (e: any) {
            toast.error(e?.data?.message || e?.message || t('ui.Schedule.noSePudoReajustarLaRotacion', 'No se pudo reajustar la rotación'));
          }
          return;
        }
        // declined → fall through, save a single-day novedad as before
      }
    }

    try {
      await ApiService.post(`/tenant/${tenantId}/schedule-overrides`, {
        data: { guardId: target.guardId, assignmentId: target.assignmentId, date: target.date, type, note },
      });
      toast.success(`Novedad ${type} registrada`);
      setOverrideTarget(null);
      fetchAll();
    } catch (e: any) {
      toast.error(e?.message || 'Error');
    }
  }, [assignments, positionsById, stationsById, rotationStylesById, tenantId, fetchAll]);

  const removeOverride = async (id: string) => {
    try {
      await ApiService.delete(`/tenant/${tenantId}/schedule-overrides/${id}`);
      toast.success('Novedad eliminada');
      setOverrideTarget(null);
      fetchAll();
    } catch (e: any) {
      toast.error(e?.message || 'Error');
    }
  };

  // ─── Spreadsheet batch edits (typed codes / delete over a range) ─────────

  const cellsInSelection = useCallback((): { row: SelRow; dateStr: string }[] => {
    if (!selBounds) return [];
    const cells: { row: SelRow; dateStr: string }[] = [];
    for (let r = selBounds.r1; r <= selBounds.r2; r++) {
      const row = selectableRows[r];
      if (!row || !row.assignments.length) continue;
      for (let c = selBounds.c1; c <= selBounds.c2 && c < monthDays.length; c++) {
        cells.push({ row, dateStr: fmtDate(monthDays[c]) });
      }
    }
    return cells;
  }, [selBounds, selectableRows, monthDays]);

  const applyCodeToSelection = useCallback(async (type: string) => {
    const cells = cellsInSelection();
    if (!cells.length) {
      toast.info(t('ui.Schedule.seleccionaCeldasDeUnPuesto'));
      return;
    }
    // Single cell + L on a fijo → keep the full "rephase from this libre" flow.
    if (cells.length === 1 && type === 'L') {
      const { row, dateStr } = cells[0];
      const a = row.assignments[0];
      const guardName = nombreDeVigilante(a.guard, 'Vigilante');
      await performOverrideSave({ guardId: a.guardId, guardName, date: dateStr, assignmentId: a.id }, type);
      return;
    }
    // Optimistic: paint the cells immediately, then upsert in batch and
    // silently re-sync. The grid never unmounts, so you stay where you are.
    const now = Date.now();
    setOverrides(prev => {
      const drop = new Set(cells.flatMap(({ row, dateStr }) => row.assignments.map(a => `${a.guardId}|${dateStr}`)));
      const kept = prev.filter(o => !drop.has(`${o.guardId}|${String(o.date).slice(0, 10)}`));
      const added: ScheduleOverride[] = [];
      cells.forEach(({ row, dateStr }, i) =>
        row.assignments.forEach((a, j) =>
          added.push({ id: `tmp-${now}-${i}-${j}`, guardId: a.guardId, assignmentId: a.id, date: dateStr, type })));
      return [...kept, ...added];
    });
    const jobs = cells.flatMap(({ row, dateStr }) => row.assignments.map(a =>
      ApiService.post(`/tenant/${tenantId}/schedule-overrides`, {
        data: { guardId: a.guardId, assignmentId: a.id, date: dateStr, type },
      })));
    const results = await Promise.allSettled(jobs);
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed) toast.error(`${failed} novedad(es) no se pudieron guardar`);
    else toast.success(`Novedad ${type} aplicada (${jobs.length})`);
    fetchAll({ silent: true });
  }, [cellsInSelection, performOverrideSave, tenantId, fetchAll]);

  /**
   * Los TURNOS REALES que hay dentro de la selección.
   *
   * Supr sólo borraba novedades. Un turno —lo que la celda enseña como D, N o
   * 24— se quedaba donde estaba, y como la función salía en silencio cuando no
   * había ninguna novedad, seleccionar turnos y pulsar Supr no hacía nada NI
   * decía por qué. Es la queja: «selecciono, borro, y sigue ahí».
   *
   * Se recoge lo mismo que la celda pinta:
   *   · el turno del vigilante asignado a esa fila (su D/N/24), y
   *   · la cobertura suelta del puesto —el turno de quien NO está asignado—,
   *     que la rejilla pinta en la PRIMERA fila del puesto.
   */
  const shiftsInSelection = useCallback((): ShiftRecord[] => {
    if (!selBounds) return [];
    const vistos = new Set<string>();
    const out: ShiftRecord[] = [];
    const guardar = (s?: ShiftRecord) => {
      if (s && !vistos.has(s.id)) { vistos.add(s.id); out.push(s); }
    };
    for (let r = selBounds.r1; r <= selBounds.r2; r++) {
      const row = selectableRows[r];
      if (!row) continue;
      const esPrimeraFila = getPositionsForStation(row.pos.stationId)[0]?.id === row.pos.id;
      for (let c = selBounds.c1; c <= selBounds.c2 && c < monthDays.length; c++) {
        const dateStr = fmtDate(monthDays[c]);
        for (const a of row.assignments) {
          const s = shiftByGuardDate.get(`${a.guardId}|${dateStr}`);
          if (s && s.stationId === row.pos.stationId) guardar(s);
        }
        // La cobertura vive donde se ve: en la primera fila del puesto. En una
        // fila de sacafranco su propio turno ya entró por `row.assignments`.
        if (esPrimeraFila && !row.isSf) {
          for (const s of coverageShiftsByStationDate.get(`${row.pos.stationId}-${dateStr}`) || []) guardar(s);
        }
      }
    }
    return out;
  }, [selBounds, selectableRows, monthDays, shiftByGuardDate, coverageShiftsByStationDate, getPositionsForStation]);

  const clearSelectedCells = useCallback(async () => {
    const cells = cellsInSelection();
    const victims: ScheduleOverride[] = [];
    for (const { row, dateStr } of cells) {
      for (const a of row.assignments) {
        const o = getOverride(a.guardId, dateStr);
        if (o) victims.push(o);
      }
    }
    const turnos = shiftsInSelection();

    // Nunca en silencio: si no hay nada que borrar, decirlo.
    if (!victims.length && !turnos.length) {
      toast.info(sel
        ? t('ui.Schedule.laSeleccionNoTieneTurnos', 'La selección no tiene turnos ni novedades que borrar')
        : t('ui.Schedule.seleccionaCeldasDeUnPuesto'));
      return;
    }

    // Un turno es trabajo real de alguien: se confirma. Una novedad se deshace
    // volviéndola a escribir, así que ésa sigue sin preguntar.
    if (turnos.length) {
      const generados = turnos.some(s => s.positionId);
      const partes = [
        `${turnos.length} turno(s)`,
        victims.length ? `${victims.length} novedad(es)` : '',
      ].filter(Boolean).join(' y ');
      const msg = `Se eliminarán ${partes}.` + (generados
        ? ' Los turnos generados por la rotación pueden volver a aparecer al reoptimizar o reasignar.'
        : '');
      if (!(await confirmDialog({ title: 'Eliminar la selección', message: msg, confirmText: 'Eliminar', tone: 'danger' }))) return;
    }

    const victimIds = new Set(victims.map(v => v.id));
    const shiftIds = turnos.map(s => s.id);
    const shiftIdSet = new Set(shiftIds);
    // Optimista: la rejilla no se desmonta, así que el borrado se ve al instante
    // y el re-sync silencioso confirma.
    if (victimIds.size) setOverrides(prev => prev.filter(o => !victimIds.has(o.id)));
    if (shiftIdSet.size) setShifts(prev => prev.filter(s => !shiftIdSet.has(s.id)));

    const jobs: Promise<any>[] = victims
      .filter(v => !String(v.id).startsWith('tmp-'))
      .map(v => ApiService.delete(`/tenant/${tenantId}/schedule-overrides/${v.id}`));
    // En trozos: una selección de un año son cientos de ids y `?ids=` acabaría
    // pasándose del largo de URL que acepta nginx.
    for (let i = 0; i < shiftIds.length; i += 100) {
      const lote = shiftIds.slice(i, i + 100);
      jobs.push(ApiService.delete(`/tenant/${tenantId}/shift?ids=${lote.join(',')}`));
    }

    const results = await Promise.allSettled(jobs);
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed) toast.error(`${failed} eliminación(es) no se pudieron completar`);
    else {
      const partes = [
        turnos.length ? `${turnos.length} turno(s)` : '',
        victims.length ? `${victims.length} novedad(es)` : '',
      ].filter(Boolean).join(' y ');
      toast.success(`${partes} eliminado(s)`);
    }
    fetchAll({ silent: true });
  }, [cellsInSelection, shiftsInSelection, getOverride, tenantId, fetchAll, sel, t]);

  const openNovedadForFocus = useCallback(() => {
    if (!sel) return;
    const row = selectableRows[sel.fr];
    if (!row || !row.assignments.length) {
      if (row) openAssignForm(row.pos.stationId, row.pos.id, fmtDate(monthDays[sel.fc]));
      return;
    }
    const a = row.assignments[0];
    const guardName = nombreDeVigilante(a.guard, 'Vigilante');
    setOverrideTarget({ guardId: a.guardId, guardName, date: fmtDate(monthDays[sel.fc]), assignmentId: a.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, selectableRows, monthDays]);

  // ─── Navigation ───────────────────────────────────────────────────────────

  // The whole Horario is capped to the CURRENT year (the user's "máximo el año
  // de hoy") — the year canvas covers it entirely; week/day anchors clamp.
  const clampToYear = useCallback((d: Date) => {
    const min = new Date(todayYear, 0, 1);
    const max = new Date(todayYear, 11, 31);
    return d < min ? min : d > max ? max : d;
  }, [todayYear]);

  const gridScrollRef = useRef<HTMLDivElement>(null);

  /* ─── Virtualización horizontal de la hoja del Mes ─────────────────────────
     La hoja es un lienzo de UN AÑO: 365 columnas. Pintarlas todas ponía ~44.000
     nodos en el DOM (medido con los datos reales de 30 puestos x 30 posiciones)
     y obligaba al navegador a recorrerlos enteros ante CUALQUIER cambio: de ahí
     los congelamientos.

     Ahora sólo existen las columnas visibles más un margen. El ancho del año
     entero se conserva con dos columnas de relleno —una a cada lado—, así que
     la barra de desplazamiento, la línea de «hoy», el salto de mes y la
     posición guardada se comportan exactamente igual que antes.

     La ventana se redondea a bloques de COL_CHUNK días para que desplazar no
     dispare un render por fotograma, sino uno cada ~14 columnas.              */
  const [colWin, setColWin] = useState<{ a: number; b: number }>({ a: 0, b: 0 });

  const syncColWindow = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const total = monthDays.length;
    // La columna congelada de la izquierda (240 px) tapa el principio del
    // lienzo; se resta para no pedir columnas que quedan debajo de ella.
    const first = Math.floor(Math.max(0, el.scrollLeft - COL_STICKY_W) / COL_W);
    const last = Math.ceil(Math.max(0, el.scrollLeft + el.clientWidth - COL_STICKY_W) / COL_W);
    const a = Math.max(0, Math.floor((first - COL_OVERSCAN) / COL_CHUNK) * COL_CHUNK);
    const b = Math.min(total, Math.ceil((last + COL_OVERSCAN) / COL_CHUNK) * COL_CHUNK);
    setColWin(prev => (prev.a === a && prev.b === b ? prev : { a, b }));
  }, [monthDays.length]);

  // Mientras la ventana no se ha medido (primer pintado) se enseña un tramo
  // razonable: así la hoja nunca aparece vacía un fotograma.
  const colA = colWin.b > colWin.a ? colWin.a : 0;
  const colB = colWin.b > colWin.a ? colWin.b : Math.min(monthDays.length, 60);

  useLayoutEffect(() => {
    if (view !== 'month' || loading) return;
    syncColWindow(gridScrollRef.current);
    const onResize = () => syncColWindow(gridScrollRef.current);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [view, loading, syncColWindow]);

  const dayIndexOf = useCallback((y: number, mo1: number, d: number) =>
    Math.round((new Date(y, mo1 - 1, d).getTime() - new Date(todayYear, 0, 1).getTime()) / 86400000), [todayYear]);

  const scrollMonthTo = useCallback((monthIdx0: number) => {
    const m = Math.max(0, Math.min(11, monthIdx0));
    const idx = dayIndexOf(todayYear, m + 1, 1);
    gridScrollRef.current?.scrollTo({ left: Math.max(0, idx * 44), behavior: 'smooth' });
    setVisibleMonth(new Date(todayYear, m, 1));
  }, [dayIndexOf, todayYear]);

  const nav = useCallback((dir: number) => {
    setSel(null);
    if (view === 'month') { scrollMonthTo(visibleMonth.getMonth() + dir); return; }
    setCurrentDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + (view === 'week' ? dir * 7 : dir));
      return clampToYear(d);
    });
  }, [view, visibleMonth, scrollMonthTo, clampToYear]);

  const goToday = useCallback(() => {
    setSel(null);
    const [y, mo, d] = tzToday().split('-').map(Number);
    setCurrentDate(clampToYear(new Date(y, mo - 1, d)));
    if (view === 'month') {
      gridScrollRef.current?.scrollTo({ left: Math.max(0, (dayIndexOf(y, mo, d) - 3) * 44), behavior: 'smooth' });
      setVisibleMonth(new Date(y, mo - 1, 1));
    }
  }, [view, clampToYear, dayIndexOf]);

  // Right-click "Editar" from the year canvas jumps to that day in vista Día.
  const jumpToDay = useCallback((dateStr: string) => {
    const [y, mo, d] = dateStr.split('-').map(Number);
    setCurrentDate(clampToYear(new Date(y, mo - 1, d)));
    setView('day');
  }, [clampToYear]);

  // ─── Keyboard (spreadsheet mode) ─────────────────────────────────────────

  const modalOpen = showAssignForm || !!configStation || !!overrideTarget || !!proposalData || !!sfCover || !!posEditor || !!shadowFor;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (modalOpen) return;
      if (e.key === 'PageDown') { e.preventDefault(); nav(1); return; }
      if (e.key === 'PageUp') { e.preventDefault(); nav(-1); return; }
      if (!sel) return;

      const move = (dr: number, dc: number, extend: boolean) => {
        setSel(prev => {
          if (!prev) return prev;
          const r = Math.max(0, Math.min(selectableRows.length - 1, prev.fr + dr));
          const c = Math.max(0, Math.min(monthDays.length - 1, prev.fc + dc));
          const row = selectableRows[r];
          if (row) scrollCellIntoView(row.key, c);
          return extend ? { ...prev, fr: r, fc: c } : { ar: r, ac: c, fr: r, fc: c };
        });
      };

      switch (e.key) {
        case 'ArrowRight': e.preventDefault(); move(0, 1, e.shiftKey); return;
        case 'ArrowLeft': e.preventDefault(); move(0, -1, e.shiftKey); return;
        case 'ArrowDown': e.preventDefault(); move(1, 0, e.shiftKey); return;
        case 'ArrowUp': e.preventDefault(); move(-1, 0, e.shiftKey); return;
        case 'Home': e.preventDefault(); move(0, -monthDays.length, e.shiftKey); return;
        case 'End': e.preventDefault(); move(0, monthDays.length, e.shiftKey); return;
        case 'Escape': setSel(null); return;
        case 'Enter': e.preventDefault(); openNovedadForFocus(); return;
        case 'Delete':
        case 'Backspace': e.preventDefault(); void clearSelectedCells(); return;
        default: {
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          const code = KEY_CODES[e.key.toLowerCase()];
          if (code) { e.preventDefault(); void applyCodeToSelection(code); }
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, modalOpen, selectableRows, monthDays, nav, openNovedadForFocus, clearSelectedCells, applyCodeToSelection, scrollCellIntoView]);

  // ─── View persistence (month + scroll + panels) ──────────────────────────

  const scrollSaveRaf = useRef(0);
  const restoredRef = useRef(false);

  const persistView = useCallback(() => {
    // Don't write until the saved scroll has been restored — the mount-time
    // persist would otherwise clobber the saved position with 0/0.
    if (!restoredRef.current) return;
    const el = gridScrollRef.current;
    try {
      // When the year canvas isn't mounted (week/day view) keep its last saved
      // scroll instead of clobbering it with zeros.
      let prev: { sl?: number; st?: number } = {};
      try { prev = JSON.parse(sessionStorage.getItem(VIEW_KEY) || 'null') || {}; } catch { /* ignore */ }
      sessionStorage.setItem(VIEW_KEY, JSON.stringify({
        yr: todayYear,
        a: fmtDate(currentDate),
        v: view,
        sl: el ? el.scrollLeft : (prev.sl || 0),
        st: el ? el.scrollTop : (prev.st || 0),
        sf: sfSectionOpen,
        panel: panelOpen,
      }));
    } catch { /* storage full/blocked */ }
  }, [currentDate, view, sfSectionOpen, panelOpen, todayYear]);

  /* Guardar la posición toca `sessionStorage` (un `JSON.parse` + un `setItem`,
     ambos SÍNCRONOS). Esto colgaba de un `requestAnimationFrame`, o sea que se
     ejecutaba ~60 veces por segundo mientras el usuario desplazaba la hoja.
     Ahora se guarda cuando el desplazamiento PARA. */
  const scrollSaveTimer = useRef<number>(0);
  const persistViewRef = useRef(persistView);
  persistViewRef.current = persistView;

  const onGridScroll = () => {
    window.clearTimeout(scrollSaveTimer.current);
    scrollSaveTimer.current = window.setTimeout(() => persistViewRef.current(), 300);

    cancelAnimationFrame(scrollSaveRaf.current);
    scrollSaveRaf.current = requestAnimationFrame(() => {
      const el = gridScrollRef.current;
      if (!el || view !== 'month') return;
      syncColWindow(el);
      // Toolbar month label follows the leftmost visible day of the canvas.
      const idx = Math.max(0, Math.min(monthDays.length - 1, Math.round((el.scrollLeft + 60) / 44)));
      const d = monthDays[idx];
      if (d && (d.getMonth() !== visibleMonth.getMonth() || d.getFullYear() !== visibleMonth.getFullYear())) {
        setVisibleMonth(new Date(d.getFullYear(), d.getMonth(), 1));
      }
    });
  };

  useEffect(() => () => { window.clearTimeout(scrollSaveTimer.current); cancelAnimationFrame(scrollSaveRaf.current); }, []);

  useEffect(() => { persistView(); }, [persistView]);

  // Restore the saved scroll ONCE after the first data render; first visit
  // lands on today's column.
  useLayoutEffect(() => {
    if (loading || restoredRef.current) return;
    restoredRef.current = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(VIEW_KEY) || 'null');
      const el = gridScrollRef.current;
      if (!el) return;
      if (saved && saved.yr === todayYear && (saved.sl || saved.st)) {
        el.scrollLeft = saved.sl || 0;
        el.scrollTop = saved.st || 0;
      } else {
        const [y, mo, d] = tzToday().split('-').map(Number);
        el.scrollLeft = Math.max(0, (dayIndexOf(y, mo, d) - 3) * 44);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // ─── Immersive height: fill the viewport below the app header ────────────

  const shellRef = useRef<HTMLDivElement>(null);
  const [shellTop, setShellTop] = useState(140);
  // Content above the sheet can change height (onboarding banner appears/
  // disappears, coverage badge loads) — re-measure whenever those flip.
  const bannerVisible = !loading && stations.length > 0 && (positions.length === 0 || assignments.length === 0);
  useLayoutEffect(() => {
    const measure = () => {
      if (shellRef.current) setShellTop(Math.round(shellRef.current.getBoundingClientRect().top));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [loading, bannerVisible, coverage]);

  const monthLabel = useMemo(() => {
    return visibleMonth.toLocaleDateString(localeActual(), { month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase());
  }, [visibleMonth]);

  const rangeLabel = useMemo(() => {
    if (view === 'month') return monthLabel;
    const fmt = (d: Date) => d.toLocaleDateString(localeActual(), { day: 'numeric', month: 'short' });
    if (view === 'week') {
      const a = timelineDays[0], b = timelineDays[timelineDays.length - 1];
      return `${fmt(a)} – ${fmt(b)} ${b.getFullYear()}`;
    }
    return currentDate.toLocaleDateString(localeActual(), { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase());
  }, [view, monthLabel, timelineDays, currentDate]);

  const todayStr = tzToday();
  /* La rejilla pinta: columna congelada · relleno izquierdo · columnas visibles ·
     relleno derecho. Los dos rellenos suman lo que ocupan los días NO pintados,
     así que el lienzo mide siempre el año entero aunque sólo existan ~100
     columnas y la barra de desplazamiento no miente.

     Se probó la alternativa «pista fija del ancho del año + banda colocada con
     `translateX`», que en teoría evita recalcular la disposición al correr la
     ventana. MEDIDA: era peor (6.023 ms de hilo bloqueado contra 4.673 ms en el
     mismo barrido), seguramente por las ~60 capas de composición que crea. No
     volver a intentarlo sin medir. */
  const padLeftW = colA * COL_W;
  const padRightW = (monthDays.length - colB) * COL_W;
  const gridCols = `${COL_STICKY_W}px ${padLeftW}px repeat(${Math.max(0, colB - colA)}, ${COL_W}px) ${padRightW}px`;
  const gridMinWidth = COL_STICKY_W + monthDays.length * COL_W;

  /* ─── Lo que hace que la memoización de los puestos sirva ─────────────────
     `MonthStationBlock` está memoizado. Si le llegaran funciones nuevas en cada
     render la memoización no cortaría nada, así que los manejadores viajan en UN
     objeto cuya identidad no cambia nunca: aquí se le reasignan los campos, y el
     bloque los llama como `h.loQueSea(...)` en el momento del evento (nunca los
     desestructura, que congelaría la versión vieja y con ella el estado viejo). */
  const handlersRef = useRef<MonthGridHandlers>({} as MonthGridHandlers);
  Object.assign(handlersRef.current, {
    configureStation, addPosition, editPosition, deletePosition, openAssignForm,
    removeAssignment, onGuardDragStart, handleDrop, openCellCtx,
    setOverrideTarget, startCellSelect, hoverCellSelect, isWorkDay,
  });
  const handlers = handlersRef.current;

  /* La selección, recortada a las filas de un puesto. Vale `null` —siempre el
     MISMO valor— en los puestos que no toca, que es lo que deja que los otros
     veintinueve no se repinten en cada paso del arrastre. */
  const selRange = useMemo<BlockSel | null>(() => {
    if (!sel || !selBounds) return null;
    const keys = new Set<string>();
    for (let r = selBounds.r1; r <= selBounds.r2; r++) {
      const row = selectableRows[r];
      if (row) keys.add(row.key);
    }
    return { keys, c1: selBounds.c1, c2: selBounds.c2, focusKey: selectableRows[sel.fr]?.key || '', fc: sel.fc };
  }, [sel, selBounds, selectableRows]);

  const selForRows = (rows: StationPosition[]): BlockSel | null =>
    selRange && rows.some(p => selRange.keys.has(p.id)) ? selRange : null;

  const selInfo = useMemo(() => {
    if (!sel || !selBounds) return null;
    const row = selectableRows[sel.fr];
    if (!row) return null;
    const count = (selBounds.r2 - selBounds.r1 + 1) * (selBounds.c2 - selBounds.c1 + 1);
    const guard = row.assignments[0]?.guard;
    const who = nombreDeVigilante(guard, 'sin vigilante');
    return `${count} celda${count === 1 ? '' : 's'} · ${row.station?.stationName || ''} — ${row.pos.name} (${who})`;
  }, [sel, selBounds, selectableRows]);

  // ─── Cell renderers ──────────────────────────────────────────────────────


  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="px-3 lg:px-4 pt-2 pb-2 flex flex-col">
        {/* ─── Compact toolbar ─── */}
        <div className="flex items-center gap-2 flex-wrap pb-2">
          <div className="flex items-center gap-2 mr-1">
            <IconTile size="sm"><CalendarDays /></IconTile>
            <div className="leading-tight">
              <div className="font-display text-sm font-bold">{t('comun.horario')}</div>
              <div className="hidden text-[10px] sm:block" style={{ color: 'var(--ink-soft)' }}>Rotaciones y coberturas</div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => nav(-1)} title={t("ui.Schedule.anteriorRePag", "Anterior (Re Pág)")}><ChevronLeft size={16} /></Button>
            <Button variant="outline" size="sm" onClick={goToday}>Hoy</Button>
            <span className="min-w-[130px] text-center text-sm font-semibold">{rangeLabel}</span>
            <Button variant="outline" size="sm" onClick={() => nav(1)} title={t("ui.Schedule.siguienteAvPag", "Siguiente (Av Pág)")}><ChevronRight size={16} /></Button>
          </div>

          {/* Rango: Mes = hoja de cálculo · Semana/Día = línea de tiempo dibujable */}
          <Segmented<ViewMode>
            value={view}
            onChange={v => { setView(v); setSel(null); }}
            options={[
              { value: 'month', label: 'Mes' },
              { value: 'week', label: 'Semana' },
              { value: 'day', label: 'Día' },
            ]}
          />

          {coverage && typeof coverage.coveredPct === 'number' && (() => {
            const ok = (coverage.gapCount || 0) === 0;
            return (
              <StatusBadge tone={ok ? 'ok' : 'bad'} dot={false}>
                {ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                Cobertura {coverage.coveredPct}%
                {(coverage.gapCount || 0) > 0 && <span>· {coverage.gapCount} sin cubrir</span>}
              </StatusBadge>
            );
          })()}

          {refreshing && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--ink-faint)' }} />}

          <div className="flex-1" />

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPanelOpen(v => !v)}
            className="hidden gap-1.5 md:inline-flex"
            title={panelOpen ? 'Ocultar panel lateral' : 'Mostrar panel (vigilantes, IA, personal)'}
          >
            {panelOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
            <span className="hidden md:inline">Panel</span>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin" size={32} style={{ color: 'var(--brand-text)' }} />
          </div>
        ) : stations.length === 0 ? (
          <div className="py-10">
            <EmptyState
              icon={<MapPin />}
              title={t("ui.Schedule.todaviaNoHayPuestosConfigurados", "Todavía no hay puestos configurados")}
              description={t('ui.Schedule.creaUnPuestoDesdeLa')}
            />
          </div>
        ) : (
          <>
            {/* ─── Onboarding CTA: stations exist but unconfigured ─── */}
            {(positions.length === 0 || assignments.length === 0) && (
              <div className="glass glass-brand mb-2 flex flex-col gap-3 px-4 py-2.5 sm:flex-row sm:items-center">
                <div className="flex flex-1 items-start gap-3">
                  <Sparkles size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--brand-text)' }} />
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                    <span className="font-bold" style={{ color: 'var(--ink)' }}>{t("ui.Schedule.tusPuestosAunNoTienen", "Tus puestos aún no tienen horario.")}{" "}</span>
                    Genera la asignación automática para crear los puestos, asignar vigilantes por cercanía y escalonar los turnos (sacafrancos incluidos).
                  </p>
                </div>
                <Button variant="brand" onClick={runAutoAssign} disabled={autoAssigning} className="shrink-0 whitespace-nowrap">
                  {autoAssigning ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                  {autoAssigning ? 'Asignando…' : 'Generar asignación automática'}
                </Button>
              </div>
            )}

            {/* ─── Sheet + side panel fill the rest of the viewport ─── */}
            <div ref={shellRef} className="flex gap-2 min-h-0" style={{ height: `calc(100vh - ${shellTop + 8}px)`, minHeight: 320 }}>
              {/* ─── Mes = spreadsheet sheet · Semana/Día = draw-a-block timeline ─── */}
              {view !== 'month' ? (
                <ScheduleTimeline
                  tenantId={tenantId}
                  view={view}
                  days={timelineDays}
                  stations={stations}
                  shifts={shifts}
                  guardsPool={guardsPool}
                  guardColorMap={guardColorMap}
                  tz={getTenantTimezone()}
                  todayStr={todayStr}
                  onChanged={() => fetchAll({ silent: true })}
                />
              ) : (
              <div
                ref={gridScrollRef}
                onScroll={onGridScroll}
                onMouseDown={e => startPan(e, gridScrollRef.current)}
                tabIndex={0}
                /* `glass-flat`, NO `glass`: `backdrop-filter` obliga al navegador a
                   rasterizar lo que hay detrás en CADA fotograma, y esto es un
                   lienzo de 16.000 px que se desplaza. Es la regla que el
                   propio `glass.css` documenta para lo que hace scroll. */
                className="glass-flat flex-1 min-w-0 select-none overflow-auto outline-none"
              >
                <div className="relative" style={{ minWidth: gridMinWidth }}>
                  {/* Today guide: a full-height vertical line framing today's
                      column across every row (under the frozen header/column). */}
                  {(() => {
                    const [ty, tm, td] = todayStr.split('-').map(Number);
                    const idx = dayIndexOf(ty, tm, td);
                    if (idx < 0 || idx >= monthDays.length) return null;
                    return (
                      <div className="absolute inset-y-0 pointer-events-none z-[15]" style={{ left: 240 + idx * 44, width: 44 }}>
                        <div className="brand-glow-sm absolute inset-y-0 left-0 w-[2.5px] rounded-full" style={{ background: 'var(--brand)' }} />
                        <div className="absolute inset-y-0 right-0 w-[2.5px] rounded-full" style={{ background: 'var(--brand)', opacity: 0.4 }} />
                      </div>
                    );
                  })()}
                  {/* Header row (frozen) */}
                  {/* Fila de cabecera congelada. Fondo OPACO, sin desenfoque: se
                      queda fija sobre una rejilla que puede pintar un año entero. */}
                  <div className="sticky top-0 z-30 grid" style={{ gridTemplateColumns: gridCols, borderBottom: '1px solid var(--hairline)' }}>
                    <div
                      className="cg-eyebrow sticky left-0 z-40 px-4 py-2.5"
                      style={{ background: 'var(--glass-solid)', borderRight: '1px solid var(--hairline)' }}
                    >
                      Puesto
                    </div>
                    <div style={{ background: 'var(--glass-solid)' }} />
                    {monthDays.slice(colA, colB).map((day, k) => {
                      const i = colA + k;
                      const isToday = monthDayStrs[i] === todayStr;
                      const isSunday = monthDaySunday[i];
                      return (
                        <div
                          key={i}
                          className="relative px-0.5 py-1.5 text-center"
                          style={{ background: 'var(--glass-solid)', borderRight: '1px solid var(--hairline)' }}
                        >
                          {/* El tinte va de capa encima: la celda en sí queda OPACA
                              para que el contenido de la rejilla nunca se
                              transparente bajo la cabecera congelada. */}
                          {(isToday || isSunday) && (
                            <div
                              className="pointer-events-none absolute inset-0"
                              style={{ background: isToday ? TINT_TODAY : TINT_SUNDAY }}
                            />
                          )}
                          <div className="cg-eyebrow relative">{DAYS_ES[day.getDay()]}</div>
                          <div
                            className="relative mt-0.5 text-xs font-semibold tabular-nums"
                            style={{ color: isToday ? 'var(--brand-text)' : 'var(--ink)' }}
                          >
                            {day.getDate()}
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ background: 'var(--glass-solid)' }} />
                  </div>

                  {/* SUPERVISIÓN — arriba del todo, con la misma rejilla.
                      Todo su código vive en `SupervisionSection`: este fichero
                      ya pasa de 2.700 líneas y la supervisión corre sobre OTRO
                      motor (nunca toca `shift`/`guardShift`). */}
                  <SupervisionSection
                    monthDays={monthDays}
                    colA={colA}
                    colB={colB}
                    gridCols={gridCols}
                    tintFor={(_d, i) => (monthDayStrs[i] === todayStr ? TINT_TODAY : monthDaySunday[i] ? TINT_SUNDAY : undefined)}
                  />

                  {/* Station rows — cada puesto es un componente MEMOIZADO
                      (`MonthStationBlock`). Arrastrar una selección sólo repinta
                      el puesto tocado; antes repintaba la hoja entera. */}
                  {stations.map(station => (
                    <MonthStationBlock
                      key={station.id}
                      station={station}
                      stationPositions={getPositionsForStation(station.id)}
                      stationAlert={stationAlertByStationId.get(station.id)}
                      assignmentsByPosition={assignmentsByPosition}
                      overrideByGuardDate={overrideByGuardDate}
                      sfStationCoverage={sfStationCoverage}
                      guardColorMap={guardColorMap}
                      monthDays={monthDays}
                      monthDayStrs={monthDayStrs}
                      monthDaySunday={monthDaySunday}
                      colA={colA}
                      colB={colB}
                      gridCols={gridCols}
                      todayStr={todayStr}
                      sel={selForRows(getPositionsForStation(station.id))}
                      h={handlers}
                    />
                  ))}

                  {/* ─── Sacafrancos Section ─── */}
                  {(() => {
                    if (sfPositions.length === 0) return null;
                    return (
                      // When EXPANDED, pin the sacafranco section to the bottom of
                      // the scroll viewport (sticky bottom-0) so the fijo stations
                      // scroll BEHIND it — you can reach a puesto high up the grid
                      // and still drag/assign an SF from here without it scrolling away.
                      <div
                        className={sfSectionOpen ? 'sticky bottom-0 z-30' : undefined}
                        style={{
                          borderTop: '2px solid color-mix(in oklab, var(--ok) 30%, transparent)',
                          ...(sfSectionOpen ? { background: 'var(--glass-solid)', boxShadow: 'var(--lift-3)' } : {}),
                        }}
                      >
                        {/* Cabecera de sacafrancos — clic para plegar/desplegar */}
                        <div
                          className="grid cursor-pointer"
                          style={{ gridTemplateColumns: gridCols, background: 'var(--glass-solid)' }}
                          onClick={() => setSfSectionOpen(!sfSectionOpen)}
                        >
                          <div
                            className="sticky left-0 z-20 flex items-center gap-2 px-4 py-2.5"
                            style={{ background: 'var(--glass-solid)', borderRight: '1px solid var(--hairline)' }}
                          >
                            <Shield size={14} style={{ color: 'var(--ok-text)' }} />
                            <div className="flex-1">
                              <div className="text-sm font-semibold" style={{ color: 'var(--ok-text)' }}>Sacafrancos</div>
                              <div className="text-[10px]" style={{ color: 'var(--ink-soft)' }}>{sfPositions.length} posiciones {sfSectionOpen ? '▾' : '▸ (clic para expandir)'}</div>
                            </div>
                          </div>
                          <div
                            style={{
                              gridColumn: '2 / -1',
                              backgroundColor: 'color-mix(in oklab, var(--ok) 5%, transparent)',
                              ...columnRules(COL_W),
                            }}
                          />
                        </div>

                        {/* SF Position rows — only if expanded */}
                        {sfSectionOpen && sfPositions.map(pos => {
                          const posAssignments = getAssignmentsForPosition(pos.id);
                          const assigned = posAssignments.length > 0;
                          return (
                            <div key={pos.id} className="grid" style={{ gridTemplateColumns: gridCols, borderTop: '1px solid var(--hairline)' }}>
                              {/* Nombre del sacafranco */}
                              <div
                                id={`hr-${pos.id}`}
                                className="sticky left-0 z-20 flex items-center gap-2 px-4 py-2"
                                style={{ background: 'var(--glass-solid)', borderRight: '1px solid var(--hairline)' }}
                                onDragOver={e => e.preventDefault()}
                                onDrop={e => handleDrop(e, pos.stationId, pos.id)}
                              >
                                <div className="flex h-6 w-6 items-center justify-center rounded" style={tonePill('ok', 14)}>
                                  <Shield size={12} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-xs font-semibold">{pos.name}</div>
                                  <div className="text-[10px] tabular-nums" style={{ color: 'var(--ink-soft)' }}>{pos.startTime} – {pos.endTime}</div>
                                </div>
                                {assigned && posAssignments[0]?.guard && (
                                  <button
                                    draggable
                                    onDragStart={e => onGuardDragStart(e, posAssignments[0].guardId, posAssignments[0])}
                                    onClick={() => removeAssignment(posAssignments[0].id)}
                                    className="cg-focus cursor-grab rounded px-1.5 py-0.5 text-[9px] font-semibold active:cursor-grabbing"
                                    style={tonePill('ok', 14)}
                                    title={t('ui.Schedule.arrastraParaMoverClicPara')}
                                  >
                                    {primerNombre(posAssignments[0].guard)} ×
                                  </button>
                                )}
                                {!assigned && (
                                  <button
                                    onClick={() => openAssignForm(pos.stationId, pos.id)}
                                    className="cg-focus rounded-md p-1 transition-colors"
                                    style={tonePill('ok', 14)}
                                    title={t('ui.Schedule.asignarVigilanteSacafranco')}
                                  >
                                    <Plus size={12} />
                                  </button>
                                )}
                              </div>

                              {/* Day cells — REAL shifts only: all L until coverage is
                                  placed (drag the SF's L onto a puesto's L) or the
                                  optimizer generates it. */}
                              <div />
                              {monthDays.slice(colA, colB).map((day, k) => {
                                const dayIdx = colA + k;
                                const dateStr = monthDayStrs[dayIdx];
                                const isToday = dateStr === todayStr;
                                const isSunday = monthDaySunday[dayIdx];
                                // Celda de rejilla: plana, sin desenfoque — ver la
                                // nota en renderFijoCell. El tinte en línea se
                                // cede mientras la celda está seleccionada, o la
                                // selección (que va por clase) no se vería.
                                const selCls = cellSelCls(pos.id, dayIdx);
                                const cellBase = `flex min-h-[36px] px-0.5 py-0.5${selCls}`;
                                const cellStyle: React.CSSProperties = {
                                  borderRight: '1px solid var(--hairline)',
                                  background: selCls
                                    ? undefined
                                    : isToday
                                      ? TINT_TODAY
                                      : isSunday ? TINT_SUNDAY : undefined,
                                };
                                const cellProps = {
                                  id: `hc-${pos.id}-${dayIdx}`,
                                  style: cellStyle,
                                  onMouseDown: (e: React.MouseEvent) => { if (e.button === 0) startCellSelect(pos.id, dayIdx, e.shiftKey); },
                                  onMouseEnter: () => hoverCellSelect(pos.id, dayIdx),
                                  onDragOver: (e: React.DragEvent) => e.preventDefault(),
                                  onDrop: (e: React.DragEvent) => handleDrop(e, pos.stationId, pos.id, dateStr),
                                  onContextMenu: (e: React.MouseEvent) => openSfCtx(e, pos, posAssignments[0] || null, dateStr),
                                };

                                // Novedades (typed or via modal) also show on SF rows.
                                const sfGuard = assigned ? posAssignments[0] : null;
                                const override = sfGuard ? getOverride(sfGuard.guardId, dateStr) : undefined;
                                if (override && sfGuard) {
                                  const gName = nombreDeVigilante(sfGuard.guard, '?');
                                  return (
                                    <div key={dayIdx} {...cellProps} className={cellBase}>
                                      <div
                                        className="flex flex-1 cursor-pointer items-center justify-center rounded"
                                        style={codePill(override.type)}
                                        title={`${gName} — ${CODE_LABEL[override.type] ?? override.type}${override.note ? ': ' + override.note : ''} (doble clic para editar)`}
                                        onDoubleClick={() => setOverrideTarget({ guardId: sfGuard.guardId, guardName: gName, date: dateStr, assignmentId: sfGuard.id })}
                                      >
                                        <span className="text-[10px] font-bold">{override.type}</span>
                                      </div>
                                    </div>
                                  );
                                }

                                const openSfDetail = () => {
                                  if (!sfGuard) { openAssignForm(pos.stationId, pos.id, dateStr); return; }
                                  const gName = nombreDeVigilante(sfGuard.guard, '?');
                                  setOverrideTarget({ guardId: sfGuard.guardId, guardName: gName, date: dateStr, assignmentId: sfGuard.id });
                                };

                                const covShift = sfGuard ? shiftByGuardDate.get(`${sfGuard.guardId}|${dateStr}`) : undefined;

                                if (!covShift) {
                                  // Libre. Assigned SF days are DRAGGABLE — drop them on a
                                  // puesto's L cell to place the coverage there.
                                  return (
                                    <div key={dayIdx} {...cellProps} className={cellBase}>
                                      <div
                                        draggable={assigned}
                                        onDragStart={assigned && sfGuard ? (e) => {
                                          mouseSelRef.current = false;
                                          e.dataTransfer.setData('sfCoverGuardId', sfGuard.guardId);
                                          e.dataTransfer.effectAllowed = 'copy';
                                        } : undefined}
                                        className={`flex flex-1 items-center justify-center rounded ${assigned ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer border border-dashed'}`}
                                        style={assigned
                                          ? { background: 'var(--glass-sunken)' }
                                          : { background: 'var(--glass-sunken)', borderColor: 'var(--hairline)' }}
                                        title={assigned ? 'Libre — arrastra este día sobre una L de un puesto para cubrirlo' : 'Sin vigilante — doble clic para asignar sacafranco'}
                                        onDoubleClick={openSfDetail}
                                      >
                                        <span className="text-[10px] font-bold" style={{ color: 'var(--ink-faint)' }}>L</span>
                                      </div>
                                    </div>
                                  );
                                }

                                // Real coverage that day → D/N by the shift's start hour.
                                const startMin = dateToWall(new Date(covShift.startTime), tzName).minutes;
                                const isNightCov = startMin >= 18 * 60 || startMin < 6 * 60;
                                const code = isNightCov ? 'N' : 'D';
                                const covStName = stationsById.get(covShift.stationId)?.stationName || '';
                                return (
                                  <div key={dayIdx} {...cellProps} className={cellBase}>
                                    {/* Mismo mapa que la leyenda: una D es una D
                                        pinte quien la pinte, fijo o sacafranco. */}
                                    <div
                                      className="flex flex-1 cursor-pointer flex-col items-center justify-center rounded"
                                      style={codePill(code)}
                                      title={`Cubre: ${covStName} — ${CODE_LABEL[code]} · doble clic para quitar la cobertura`}
                                      onDoubleClick={() => removeSfCoverage(covShift)}
                                    >
                                      <span className="text-[10px] font-bold">{code}</span>
                                      {covStName && <span className="text-[8px] leading-none opacity-80">{covStName.slice(0, 3)}</span>}
                                    </div>
                                  </div>
                                );
                              })}
                              <div />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
              )}

              {/* ─── Side panel (former left sidebar + guard pool, now collapsible) ─── */}
              {/* En un teléfono el panel se esconde: 280 px fijos al lado de
                  la hoja dejaban la rejilla en 60 px de ancho, ilegible. */}
              {panelOpen && (
                <aside className="hidden w-[280px] shrink-0 overflow-y-auto space-y-3 pr-0.5 md:block">
                  {/* Vigilantes disponibles — drag them onto the sheet */}
                  <div className="glass p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Users size={14} style={{ color: 'var(--brand-text)' }} />
                      <h3 className="cg-eyebrow">Vigilantes disponibles</h3>
                      <span className="text-[10px] tabular-nums" style={{ color: 'var(--ink-faint)' }}>({unassignedGuards.length})</span>
                    </div>
                    {unassignedGuards.length === 0 ? (
                      <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>{t("ui.Schedule.todosLosVigilantesEstanAsignados", "Todos los vigilantes están asignados.")}</p>
                    ) : (
                      <>
                        <p className="mb-2 text-[10px]" style={{ color: 'var(--ink-soft)' }}>{t('ui.Schedule.arrastraUnVigilanteAUn')}</p>
                        <div className="flex max-h-[180px] flex-wrap gap-1.5 overflow-y-auto">
                          {unassignedGuards.map(g => (
                            /* Ficha arrastrable: cristal PLANO (se repiten) y
                               brillo del acento al agarrarla. */
                            <div
                              key={g.id}
                              className="glass-flat cursor-grab rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all hover:border-[var(--brand-line)] active:cursor-grabbing active:shadow-[0_0_18px_-6px_var(--brand-glow)]"
                              draggable
                              onDragStart={(e) => onGuardDragStart(e, g.id)}
                            >
                              {g.label}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* AI / herramientas */}
                  <div className="glass glass-brand p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Sparkles size={14} style={{ color: 'var(--brand-text)' }} />
                      <h3 className="cg-eyebrow">Herramientas</h3>
                    </div>
                    {/* RETIRADOS (2026-08-05, a pedido): "Generar borrador de
                        horario" y "Auto-asignar puestos vacíos".

                        Auto-asignar sólo reparte vigilantes que NO tienen
                        ninguna asignación activa, así que en una operación ya
                        montada no encuentra a nadie y devuelve ceros sin
                        explicar por qué. El borrador recalcula la rotación
                        desde cero y la compara contra los turnos reales: con
                        turnos creados fuera del motor da cifras sin sentido
                        (7% de cobertura, 431 huecos, +465% de costo).

                        El backend (/scheduler/auto-assign, /scheduler/proposals)
                        y el modal de revisión siguen intactos — esto es sólo el
                        punto de entrada, para poder reponerlo cuando la lógica
                        esté corregida. */}
                    {/* RETIRADO (2026-08-06, a pedido): "Optimizar Sacafrancos".
                        Reordena los offsets de los puestos y reparte el relevo,
                        pero el resultado no cuadra todavía: los sacafrancos
                        quedan con L irregulares porque la grilla no distingue
                        "descansa" de "trabaja pero no le tocó hueco ese día", y
                        con más sacafrancos que huecos simultáneos la mayoría de
                        sus días caen en el segundo caso.

                        Efecto secundario de dejarlo visible: cada corrida vuelve
                        a crear los turnos de sacafranco que se habían borrado a
                        mano.

                        Backend intacto (POST /scheduler/optimize-sacafrancos y
                        runOptimizeSacafrancos) — esto es solo el punto de
                        entrada, para reponerlo cuando la lógica esté resuelta. */}
                    {/* RETIRADO (2026-08-05, a pedido): "Geolocalizar vigilantes".
                        Convertía la dirección de domicilio de cada vigilante en
                        coordenadas (Nominatim) para ordenar por cercanía. Su
                        ÚNICO consumidor era el ranking por distancia de
                        auto-asignar, que ya está retirado, así que no aportaba
                        nada por sí solo. Además Nominatim admite ~1 pedido/s, de
                        modo que procesaba 10 por clic y había que repetirlo.
                        Endpoint intacto: POST /security-guard/geocode-missing. */}
                    <button
                      onClick={runAiRecommend}
                      disabled={aiLoading}
                      className="cg-btn-brand cg-focus mt-2 flex w-full items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-all disabled:opacity-50"
                    >
                      {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      {aiLoading ? 'Analizando…' : 'Recomendación IA'}
                    </button>
                    {aiRecommendation && (
                      <div className="glass-sunken mt-2 max-h-[240px] overflow-y-auto p-3">
                        <div className="mb-1 text-[10px] font-semibold" style={{ color: 'var(--brand-text)' }}><Bot className="mr-1 inline h-3 w-3" />{t("ui.Schedule.recomendacion", "Recomendación:")}</div>
                        <div className="whitespace-pre-wrap text-[10px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{aiRecommendation}</div>
                      </div>
                    )}
                  </div>

                  {/* Personal necesario */}
                  <div className="glass space-y-2 p-3">
                    <h3 className="cg-eyebrow">Personal necesario</h3>
                    {staffing ? (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-lg p-2 text-center" style={tonePill('warn', 12)}>
                            <div className="text-lg font-bold tabular-nums">{staffing.fijosNeeded || 0}</div>
                            <div className="text-[9px]" style={{ color: 'var(--ink-soft)' }}>Fijos</div>
                          </div>
                          <div className="rounded-lg p-2 text-center" style={tonePill('ok', 12)}>
                            <div className="text-lg font-bold tabular-nums">{staffing.sacafrancosNeeded || 0}</div>
                            <div className="text-[9px]" style={{ color: 'var(--ink-soft)' }}>Sacafrancos</div>
                          </div>
                          <div className="rounded-lg p-2 text-center" style={tonePill('brand', 14)}>
                            <div className="text-lg font-bold tabular-nums">{staffing.totalGuardsNeeded || 0}</div>
                            <div className="text-[9px]" style={{ color: 'var(--ink-soft)' }}>{t('comun.total')}</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div className="glass-sunken p-2 text-center">
                            <div className="text-sm font-bold tabular-nums">{staffing.currentFijoGuards || 0}<span className="font-normal" style={{ color: 'var(--ink-faint)' }}>/{staffing.fijosNeeded || 0}</span></div>
                            <div className="text-[9px]" style={{ color: 'var(--ink-soft)' }}>Fijos asignados</div>
                          </div>
                          <div className="glass-sunken p-2 text-center">
                            <div className="text-sm font-bold tabular-nums">{staffing.currentSfGuards || 0}<span className="font-normal" style={{ color: 'var(--ink-faint)' }}>/{staffing.sacafrancosNeeded || 0}</span></div>
                            <div className="text-[9px]" style={{ color: 'var(--ink-soft)' }}>SF asignados</div>
                          </div>
                        </div>
                        {/* Hiring recommendation */}
                        {(((staffing.fijosNeeded || 0) - (staffing.currentFijoGuards || 0)) > 0 || ((staffing.sacafrancosNeeded || 0) - (staffing.currentSfGuards || 0)) > 0) && (
                          <div className="space-y-1 rounded-lg p-2" style={toneCard('bad', 8, 22)}>
                            <div className="text-[10px] font-semibold"><AlertTriangle className="mr-1 inline h-3 w-3" />Hace falta contratar:</div>
                            {((staffing.fijosNeeded || 0) - (staffing.currentFijoGuards || 0)) > 0 && (
                              <div className="text-[10px] tabular-nums">• {(staffing.fijosNeeded || 0) - (staffing.currentFijoGuards || 0)} fijos más</div>
                            )}
                            {((staffing.sacafrancosNeeded || 0) - (staffing.currentSfGuards || 0)) > 0 && (
                              <div className="text-[10px] tabular-nums">• {(staffing.sacafrancosNeeded || 0) - (staffing.currentSfGuards || 0)} sacafrancos más</div>
                            )}
                          </div>
                        )}
                        {staffing.sfRotation && (
                          <div className="pt-1 text-[10px]" style={{ color: 'var(--ink-soft)', borderTop: '1px solid var(--hairline)' }}>
                            {t('ui.Schedule.rotacionSf', 'Rotación SF:')} <span className="font-semibold" style={{ color: 'var(--ink)' }}>{staffing.sfRotation.name}</span> ({staffing.sfRotation.dayShifts}D-{staffing.sfRotation.nightShifts}N-{staffing.sfRotation.restDays}L)
                          </div>
                        )}
                        <div className="text-[10px]" style={{ color: 'var(--ink-soft)' }}>
                          Demanda pico: <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>{staffing.peakDemand}</span> puestos simultáneos
                        </div>

                        {stationAlerts.length > 0 && (
                          <div className="space-y-1.5 pt-2" style={{ borderTop: '1px solid var(--hairline)' }}>
                            <div className="cg-eyebrow flex items-center gap-1 tabular-nums" style={{ color: 'var(--bad-text)' }}>
                              <AlertTriangle size={11} />
                              Alertas por puesto ({stationAlerts.length})
                            </div>
                            <div className="max-h-[160px] space-y-1 overflow-y-auto pr-1">
                              {stationAlerts.map(alert => (
                                <div key={alert.stationId} className="rounded px-2 py-1 text-[10px]" style={toneCard('bad', 8, 22)}>
                                  <div className="truncate font-semibold" style={{ color: 'var(--ink)' }}>{stationLabel(alert)}</div>
                                  {alert.missingFijoCount > 0 && (
                                    <div className="tabular-nums">• {alert.missingFijoCount} fijo(s) sin vigilante</div>
                                  )}
                                  {alert.sfUncoveredDays > 0 && (
                                    <div className="tabular-nums">• {alert.sfUncoveredDays} día(s) L sin SF cubriendo</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="glass-sunken p-2 text-center">
                          <div className="text-lg font-bold tabular-nums">{stations.length}</div>
                          <div className="text-[9px]" style={{ color: 'var(--ink-soft)' }}>Puestos</div>
                        </div>
                        <div className="glass-sunken p-2 text-center">
                          <div className="text-lg font-bold tabular-nums">{assignments.length}</div>
                          <div className="text-[9px]" style={{ color: 'var(--ink-soft)' }}>Asignados</div>
                        </div>
                      </div>
                    )}
                    {/* Coverage */}
                    {(() => {
                      const fijoPositions = positions.filter(p => p.type !== 'sacafranco');
                      const covered = fijoPositions.filter(p => assignments.some(a => a.positionId === p.id)).length;
                      const pct = fijoPositions.length > 0 ? Math.round((covered / fijoPositions.length) * 100) : 0;
                      return (
                        <div className="pt-2" style={{ borderTop: '1px solid var(--hairline)' }}>
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-[10px]" style={{ color: 'var(--ink-soft)' }}>{t('ui.Schedule.coberturaDeFijos', 'Cobertura de fijos')}</span>
                            <span className="text-[10px] font-semibold tabular-nums">{pct}%</span>
                          </div>
                          <MeterBar pct={pct} height={6} ariaLabel={t('ui.Schedule.coberturaDeFijos', 'Cobertura de fijos')} />
                          <div className="mt-1 text-[9px] tabular-nums" style={{ color: 'var(--ink-soft)' }}>{covered}/{fijoPositions.length} posiciones cubiertas</div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Sacafrancos summary */}
                  {sacafrancoData.length > 0 && (
                    <div className="glass p-3">
                      <div className="mb-2 flex items-center gap-1.5">
                        <Shield size={12} style={{ color: 'var(--ok-text)' }} />
                        <h3 className="cg-eyebrow tabular-nums">Sacafrancos ({sacafrancoData.length})</h3>
                      </div>
                      <div className="space-y-1.5">
                        {sacafrancoData.map(sf => {
                          const name = nombreDeVigilante(sf.guard, '?');
                          const { availDays, coverDays } = sf;
                          const stationsCovering = [...new Set(sf.assignments.map(a => stationsById.get(a.stationId)?.stationName).filter(Boolean))];
                          return (
                            <div key={sf.guard?.id || name} className="glass-sunken space-y-0.5 px-2 py-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-[10px] font-medium">{name}</span>
                                <span className="flex shrink-0 items-center gap-1">
                                  <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold tabular-nums" style={tonePill('ok', 12)}>{availDays} libre</span>
                                  <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold tabular-nums" style={tonePill('warn', 12)}>{coverDays} cubre</span>
                                </span>
                              </div>
                              {stationsCovering.length > 0 && (
                                <div className="truncate text-[9px]" style={{ color: 'var(--ink-soft)' }}>Cubre: {stationsCovering.join(', ')}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </aside>
              )}
            </div>

            {/* ─── Sheet hint bar ─── */}
            <div className="flex flex-wrap items-center gap-3 pt-1.5 text-[10px]" style={{ color: 'var(--ink-faint)' }}>
              {view === 'month' ? (
                <>
                  <span className="font-medium" style={{ color: 'var(--ink-soft)' }}>{selInfo || t('ui.Schedule.clicEnUnaCeldaParaSeleccionar', 'Clic en una celda para seleccionar')}</span>
                  {/* El botón que faltaba. Supr ya borraba, pero sólo estaba
                      escrito en la ayuda: quien seleccionaba con el ratón no
                      tenía dónde pulsar. */}
                  {sel && (
                    <button
                      type="button"
                      onClick={() => void clearSelectedCells()}
                      className="cg-focus inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all hover:opacity-80"
                      style={toneCard('bad', 12, 22)}
                      title={t('ui.Schedule.eliminarTurnosYNovedades', 'Eliminar los turnos y novedades de la selección (Supr)')}
                    >
                      <Trash2 size={11} /> {t('comun.eliminar', 'Eliminar')}
                    </button>
                  )}
                  <span className="hidden md:inline"><b>Clic derecho</b>{t('ui.Schedule.editarDuplicarEliminarTurnoY')}{" "}<b>D N L V F P 2</b>{" "}{t('ui.Schedule.paraNovedad')}{" "}<b>Supr</b>{" "}{t("ui.Schedule.borraArrastraUnDia", "borra · Arrastra un día")}{" "}<b>{t('ui.Schedule.lDelSacafranco')}</b>{" "}{t('ui.Schedule.sobreUnLDelPuesto')}{" "}<b>{t("ui.Schedule.reAvPag", "Re/Av Pág")}</b> cambia mes</span>
                </>
              ) : (
                <span className="font-medium" style={{ color: 'var(--ink-soft)' }}>
                  {t('ui.Schedule.arrastraSobreLaFilaDeUnPuestoPara', 'Arrastra sobre la fila de un puesto para')} <b>{t('ui.Schedule.dibujarUnBloqueDeTrabajo')}</b> (p. ej. 07:00 → 07:00 del día siguiente) · Clic en un bloque: detalle / eliminar · Suelta un vigilante del panel sobre la línea · <b>{t("ui.Schedule.reAvPag2", "Re/Av Pág")}</b> cambia {view === 'week' ? 'de semana' : 'de día'}
                </span>
              )}
              <span className="flex-1" />
              {/* Leyenda de los códigos tipados: mismas píldoras que la rejilla,
                  para que el significado se aprenda de un vistazo. */}
              {view === 'month' && <span className="hidden items-center gap-1.5 lg:flex">
                {CODE_ORDER.map((c) => (
                  <span
                    key={c}
                    title={CODE_LABEL[c]}
                    className="rounded px-1.5 py-0.5 font-bold"
                    style={codePill(c)}
                  >
                    {c}
                  </span>
                ))}
              </span>}
            </div>
          </>
        )}
      </div>

      {ctxMenu && <ContextMenu menu={ctxMenu} onClose={() => setCtxMenu(null)} />}
      <TransferShiftModal
        target={transferTarget}
        stations={stations}
        onClose={() => setTransferTarget(null)}
        onDone={() => fetchAll({ silent: true })}
      />

      {/* ─── Aprendiz en acompañamiento ──────────────────────────────────────── */}
      {shadowFor && (() => {
        const set = (patch: Partial<NonNullable<typeof shadowFor>>) => setShadowFor(m => m ? { ...m, ...patch } : m);
        // Todos los vigilantes de la empresa: el backend rechaza al propio
        // titular y a quien ya acompaña este puesto, con un mensaje que explica
        // por qué. Filtrar aquí duplicaría esa regla en dos sitios.
        const disponibles = guardsPool;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'oklch(0 0 0 / 0.55)' }} onClick={() => setShadowFor(null)}>
            <div className="glass-raised mx-4 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
                <div>
                  <h4 className="text-sm font-semibold">Aprendiz en acompañamiento</h4>
                  <p className="mt-0.5 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
                    Junto a {shadowFor.titularName} · {shadowFor.stationName}
                  </p>
                </div>
                <button onClick={() => setShadowFor(null)} className="cg-btn-ghost cg-focus rounded-lg p-1.5"><X size={15} /></button>
              </div>
              <div className="space-y-4 p-5">
                <div className="rounded-xl px-3 py-2" style={toneCard('ok', 8, 26)}>
                  <p className="text-[11px]">
                    Trabaja <b>los mismos días que {shadowFor.titularName}</b> y ficha con normalidad,
                    pero <b>no cuenta como cobertura</b>: si el titular falta, el puesto sigue apareciendo descubierto.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-soft)' }}>Aprendiz</label>
                  <select
                    value={shadowFor.guardId}
                    onChange={e => set({ guardId: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
                    style={{ borderColor: 'var(--hairline)', background: 'var(--glass-sunken)' }}
                  >
                    <option value="">Selecciona…</option>
                    {disponibles.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-soft)' }}>Desde</label>
                    <input type="date" value={shadowFor.startDate} onChange={e => set({ startDate: e.target.value })} className="w-full rounded-lg border px-2 py-2 text-sm tabular-nums outline-none focus:border-primary" style={{ borderColor: 'var(--hairline)', background: 'var(--glass-sunken)' }} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-soft)' }}>Hasta</label>
                    <input type="date" value={shadowFor.endDate} min={shadowFor.startDate} onChange={e => set({ endDate: e.target.value })} className="w-full rounded-lg border px-2 py-2 text-sm tabular-nums outline-none focus:border-primary" style={{ borderColor: 'var(--hairline)', background: 'var(--glass-sunken)' }} />
                  </div>
                </div>
                <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                  El acompañamiento tiene final: cuando termine, el aprendiz deja de seguir este puesto.
                  Para que se quede, asígnalo a su propia plaza.
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--hairline)', background: 'var(--glass-sunken)' }}>
                <button onClick={() => setShadowFor(null)} className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-semibold">Cancelar</button>
                <button onClick={saveShadow} disabled={shadowSaving || !shadowFor.guardId || !shadowFor.endDate} className="cg-btn-brand cg-focus rounded-full px-5 py-2 text-sm font-semibold transition-all disabled:opacity-40">
                  {shadowSaving ? <Loader2 size={14} className="animate-spin" /> : 'Poner en acompañamiento'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Editor de un puesto (nombre · tipo · horas · plazas) ───────────── */}
      {posEditor && (() => {
        const toMin = (x: string) => { const [h, mm] = x.split(':').map(n => parseInt(n, 10) || 0); return (h % 24) * 60 + (mm % 60); };
        const sMin = toMin(posEditor.startTime);
        const eMin = toMin(posEditor.endTime);
        const durH = ((eMin <= sMin ? eMin + 1440 : eMin) - sMin) / 60;
        const set = (patch: Partial<NonNullable<typeof posEditor>>) => setPosEditor(m => m ? { ...m, ...patch } : m);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'oklch(0 0 0 / 0.55)' }} onClick={() => setPosEditor(null)}>
            <div className="glass-raised mx-4 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
                <div>
                  <h4 className="text-sm font-semibold">{posEditor.positionId ? 'Editar puesto' : 'Agregar puesto'}</h4>
                  <p className="mt-0.5 text-[11px]" style={{ color: 'var(--ink-soft)' }}>{posEditor.stationName}</p>
                </div>
                <button onClick={() => setPosEditor(null)} className="cg-btn-ghost cg-focus rounded-lg p-1.5"><X size={15} /></button>
              </div>
              <div className="space-y-4 p-5">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-soft)' }}>Nombre</label>
                  <input
                    value={posEditor.name}
                    onChange={e => set({ name: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
                    style={{ borderColor: 'var(--hairline)', background: 'var(--glass-sunken)' }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-soft)' }}>Tipo</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { v: 'fijo', label: 'Fijo', sub: 'trabaja su rotación' },
                      { v: 'sacafranco', label: 'Sacafranco', sub: 'cubre descansos' },
                    ].map(o => (
                      <button
                        key={o.v}
                        onClick={() => set({ type: o.v })}
                        className={`cg-focus rounded-xl border px-2 py-2 text-center transition-all ${posEditor.type === o.v ? 'glass-brand' : 'glass-flat'}`}
                      >
                        <div className="text-xs font-semibold">{o.label}</div>
                        <div className="text-[10px]" style={{ color: 'var(--ink-soft)' }}>{o.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>
                {/* Atajos: las tres formas que cubren casi todo. Las horas
                    siguen siendo libres debajo. */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Diurno', sub: '07–19', s: '07:00', e: '19:00' },
                    { label: 'Nocturno', sub: '19–07', s: '19:00', e: '07:00' },
                    { label: '24 horas', sub: '07→07', s: '07:00', e: '07:00' },
                  ].map(q => {
                    const active = posEditor.startTime === q.s && posEditor.endTime === q.e;
                    return (
                      <button key={q.label} onClick={() => set({ startTime: q.s, endTime: q.e })} className={`cg-focus rounded-xl border px-2 py-2 text-center transition-all ${active ? 'glass-brand' : 'glass-flat'}`}>
                        <div className="text-xs font-semibold">{q.label}</div>
                        <div className="text-[10px] tabular-nums" style={{ color: 'var(--ink-soft)' }}>{q.sub}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-soft)' }}>Entra</label>
                    <input type="time" value={posEditor.startTime} onChange={e => set({ startTime: e.target.value })} className="w-full rounded-lg border px-2 py-2 text-sm tabular-nums outline-none focus:border-primary" style={{ borderColor: 'var(--hairline)', background: 'var(--glass-sunken)' }} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-soft)' }}>Sale</label>
                    <input type="time" value={posEditor.endTime} onChange={e => set({ endTime: e.target.value })} className="w-full rounded-lg border px-2 py-2 text-sm tabular-nums outline-none focus:border-primary" style={{ borderColor: 'var(--hairline)', background: 'var(--glass-sunken)' }} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-soft)' }}>Plazas</label>
                    <input type="number" min={1} max={20} value={posEditor.guardsNeeded} onChange={e => set({ guardsNeeded: e.target.value })} className="w-full rounded-lg border px-2 py-2 text-sm tabular-nums outline-none focus:border-primary" style={{ borderColor: 'var(--hairline)', background: 'var(--glass-sunken)' }} />
                  </div>
                </div>
                <div className="rounded-xl px-3 py-2" style={toneCard('ok', 8, 26)}>
                  <p className="text-[11px]">
                    Jornada de <b>{durH % 1 === 0 ? durH : durH.toFixed(1)} h</b>
                    {eMin <= sMin ? ' (termina al día siguiente)' : ''}.
                    {posEditor.positionId ? ' Los turnos futuros se rehacen con estas horas; las asignaciones no se tocan.' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--hairline)', background: 'var(--glass-sunken)' }}>
                <button onClick={() => setPosEditor(null)} className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-semibold">Cancelar</button>
                <button onClick={savePosition} disabled={posSaving} className="cg-btn-brand cg-focus rounded-full px-5 py-2 text-sm font-semibold transition-all disabled:opacity-40">
                  {posSaving ? <Loader2 size={14} className="animate-spin" /> : (posEditor.positionId ? 'Guardar' : 'Agregar')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── SF coverage modal (drop an SF día on a puesto → shape the turno) ── */}
      {sfCover && (() => {
        const toMin = (x: string) => { const [h, mm] = x.split(':').map(n => parseInt(n, 10) || 0); return (h % 24) * 60 + (mm % 60); };
        const sMin = toMin(sfCover.startStr);
        const eMinRaw = toMin(sfCover.endStr);
        const nextDay = eMinRaw <= sMin;
        const durH = ((nextDay ? eMinRaw + 1440 : eMinRaw) - sMin) / 60;
        const quick = (start: string, end: string) => setSfCover(m => m ? { ...m, startStr: start, endStr: end } : m);
        const fechaHuman = new Date(sfCover.dateStr + 'T00:00:00').toLocaleDateString(localeActual(), { weekday: 'long', day: 'numeric', month: 'long' });
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'oklch(0 0 0 / 0.55)' }} onClick={() => setSfCover(null)}>
            <div className="glass-raised mx-4 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
                <div>
                  <h4 className="text-sm font-semibold">{t('ui.Schedule.cubrirConSacafranco')}</h4>
                  <p className="mt-0.5 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
                    {sfCover.sfName} → {stationLabel(sfCover.station)} · {fechaHuman}
                  </p>
                </div>
                <button onClick={() => setSfCover(null)} className="cg-btn-ghost cg-focus rounded-lg p-1.5"><X size={15} /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="rounded-xl px-3 py-2" style={toneCard('ok', 8, 26)}>
                  <p className="text-[11px]">
                    {t('ui.Schedule.sugeridoSegunLoQueFaltaEseDia', 'Sugerido según lo que falta ese día:')} <b>{sfCover.suggested}</b>
                  </p>
                </div>
                {/* Quick shapes */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Diurno', sub: '07–19', s: '07:00', e: '19:00' },
                    { label: 'Nocturno', sub: '19–07', s: '19:00', e: '07:00' },
                    { label: '24 horas', sub: '07→07', s: '07:00', e: '07:00' },
                  ].map(q => {
                    const active = sfCover.startStr === q.s && sfCover.endStr === q.e;
                    return (
                      <button
                        key={q.label}
                        onClick={() => quick(q.s, q.e)}
                        className={`cg-focus rounded-xl border px-2 py-2 text-center transition-all ${active ? 'glass-brand' : 'glass-flat'}`}
                      >
                        <div className="text-xs font-semibold">{q.label}</div>
                        <div className="text-[10px] tabular-nums" style={{ color: 'var(--ink-soft)' }}>{q.sub}</div>
                      </button>
                    );
                  })}
                </div>
                {/* Custom hours */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="cg-eyebrow mb-1.5 block">Inicio</label>
                    <input type="time" value={sfCover.startStr} onChange={e => setSfCover(m => m ? { ...m, startStr: e.target.value } : m)} className="cg-input cg-focus w-full px-3 py-2.5 font-mono text-sm tabular-nums" />
                  </div>
                  <div>
                    <label className="cg-eyebrow mb-1.5 block">Fin</label>
                    <input type="time" value={sfCover.endStr} onChange={e => setSfCover(m => m ? { ...m, endStr: e.target.value } : m)} className="cg-input cg-focus w-full px-3 py-2.5 font-mono text-sm tabular-nums" />
                  </div>
                </div>
                <p className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
                  <Clock size={12} />
                  Duración: <b className="tabular-nums" style={{ color: 'var(--ink)' }}>{durH % 1 === 0 ? durH : durH.toFixed(1)}h</b>
                  {nextDay && <span>{t("ui.Schedule.terminaAlDiaSiguiente", "· termina al día siguiente")}</span>}
                  <span>{t('ui.Schedule.horaDeLaEmpresa')}</span>
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--hairline)', background: 'var(--glass-sunken)' }}>
                <button onClick={() => setSfCover(null)} className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-all">{t('actions.cancel')}</button>
                <button
                  onClick={saveSfCover}
                  disabled={sfCoverSaving || durH <= 0 || durH > 24}
                  className="cg-btn-brand cg-focus rounded-full px-5 py-2 text-sm font-semibold transition-all disabled:opacity-40"
                >
                  {sfCoverSaving ? <Loader2 size={14} className="animate-spin" /> : 'Cubrir puesto'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Sacafranco picker (click on an "L" cell) ─────────────────────── */}
      {sfPick && (() => {
        const { station, pos, dateStr } = sfPick;
        const fecha = new Date(dateStr + 'T00:00:00').toLocaleDateString(localeActual(), { weekday: 'long', day: 'numeric', month: 'long' });
        const q = sfPickQuery.trim().toLowerCase();
        const todos = candidatosParaCubrir(dateStr);
        const filas = q ? todos.filter(r => r.nombre.toLowerCase().includes(q)) : todos;
        const libres = filas.filter(r => r.estado === 'libre');
        const resto = filas.filter(r => r.estado !== 'libre');

        const chipEstado = (r: typeof filas[number]) => {
          if (r.estado === 'libre') return <span className="text-[10px] font-semibold" style={{ color: 'var(--ok-text)' }}>Libre</span>;
          if (r.estado === 'deTurno') return <span className="text-[10px]" style={{ color: 'var(--warn-text)' }}>De turno · {r.detalle}</span>;
          if (r.estado === 'ocupado') return <span className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>Cubre {r.detalle}</span>;
          return <span className="text-[10px]" style={{ color: 'var(--bad-text)' }}>Ausente · {r.detalle}</span>;
        };

        const elegir = (id: string) => { setSfPick(null); setSfPickQuery(''); void placeSfCoverage(station, pos, dateStr, id); };

        const fila = (r: typeof filas[number]) => (
          <button
            key={r.id}
            onClick={() => elegir(r.id)}
            className="glass-flat glass-hover cg-focus flex w-full items-center gap-2 px-3 py-2.5 text-left transition-all"
            style={r.estado === 'libre' ? undefined : { opacity: 0.72 }}
          >
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold"
              style={r.estado === 'libre' ? tonePill('ok', 16) : { background: 'var(--glass-raised)', color: 'var(--ink-soft)' }}
            >
              {(r.nombre[0] || '?').toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{r.nombre}</span>
              {r.esSf && (
                <span className="cg-eyebrow" style={{ color: 'var(--ok-text)' }}>Sacafranco</span>
              )}
            </span>
            {chipEstado(r)}
          </button>
        );

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'oklch(0 0 0 / 0.55)' }} onClick={() => { setSfPick(null); setSfPickQuery(''); }}>
            <div className="glass-raised mx-4 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold">{t('ui.Schedule.quienCubreEsteDia')}</h4>
                  <p className="mt-0.5 truncate text-[11px]" style={{ color: 'var(--ink-soft)' }}>{stationLabel(station)} · {fecha}</p>
                </div>
                <button onClick={() => { setSfPick(null); setSfPickQuery(''); }} className="cg-btn-ghost cg-focus rounded-lg p-1.5"><X size={15} /></button>
              </div>

              <div className="px-4 pt-3">
                <input
                  value={sfPickQuery}
                  onChange={e => setSfPickQuery(e.target.value)}
                  placeholder={t('comun.buscarVigilante')}
                  autoFocus
                  className="cg-input cg-focus w-full px-3 py-2 text-sm"
                />
              </div>

              <div className="max-h-[46vh] space-y-1.5 overflow-y-auto p-4">
                {filas.length === 0 && (
                  <p className="py-4 text-center text-[12px]" style={{ color: 'var(--ink-soft)' }}>
                    {q ? t('ui.Schedule.nadieCoincideConLaBusqueda', 'Nadie coincide con la búsqueda.') : t('ui.Schedule.noHayVigilantesParaMostrar', 'No hay vigilantes para mostrar.')}
                  </p>
                )}
                {libres.map(fila)}
                {resto.length > 0 && libres.length > 0 && (
                  <p className="cg-eyebrow px-1 pt-2">{t('ui.Schedule.yaTienenAlgoEseDia')}</p>
                )}
                {/* Se enseñan, y se pueden elegir: a veces hay que mover a
                    alguien de puesto y quien decide eso es quien mira, no la
                    pantalla. El turno nuevo reemplaza al que se solape. */}
                {resto.map(fila)}
              </div>

              <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid var(--hairline)', background: 'var(--glass-sunken)' }}>
                <button
                  onClick={() => { const p = sfPick; setSfPick(null); setSfPickQuery(''); setOverrideTarget({ guardId: p.assignment.guardId, guardName: p.guardName, date: p.dateStr, assignmentId: p.assignment.id }); }}
                  className="cg-focus text-[11px] font-semibold hover:underline"
                  style={{ color: 'var(--ink-soft)' }}
                >Marcar novedad…</button>
                <button onClick={() => { setSfPick(null); setSfPickQuery(''); }} className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-all">{t('actions.close')}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Assignment Modal ─────────────────────────────────────────────── */}
      {showAssignForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'oklch(0 0 0 / 0.55)' }} onClick={() => { setShowAssignForm(false); setMoveFrom(null); }}>
          <div className="glass-raised mx-4 max-h-[90vh] w-full max-w-md overflow-hidden overflow-y-auto animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
              <h4 className="text-sm font-semibold">{moveFrom ? t('ui.Schedule.moverVigilanteDePuesto', 'Mover vigilante de puesto') : (assignMode === 'single' ? t('ui.Schedule.cubrirEsteDia', 'Cubrir este día') : t('ui.Schedule.asignarVigilanteALaRotacion', 'Asignar vigilante a la rotación'))}</h4>
              <button onClick={() => { setShowAssignForm(false); setMoveFrom(null); }} className="cg-btn-ghost cg-focus rounded-lg p-1.5"><X size={15} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Position info */}
              {assignTarget && (() => {
                const pos = positions.find(p => p.id === assignTarget.positionId);
                const st = stations.find(s => s.id === assignTarget.stationId);
                if (!pos || !st) return null;
                const meta = POSITION_TONE[pos.type] || POSITION_TONE.fijo;
                return (
                  <div className="rounded-xl px-3 py-2" style={toneCard(meta.tone)}>
                    <div className="text-xs font-semibold">{stationLabel(st)} <ArrowRight className="inline h-3 w-3" /> {pos.name}</div>
                    <div className="text-[10px] tabular-nums opacity-80">{pos.startTime} – {pos.endTime}</div>
                  </div>
                );
              })()}

              {/* Drag-move notice */}
              {moveFrom && (
                <div className="rounded-xl px-3 py-2" style={toneCard('warn')}>
                  <p className="text-[11px]">
                    {t('ui.Schedule.seMoveraDesde', 'Se moverá desde')} <span className="font-semibold">{stationsById.get(moveFrom.stationId)?.stationName || 'su puesto actual'}</span> — sus turnos futuros allí se eliminan.
                  </p>
                </div>
              )}

              {/* ── Qué se va a crear ──────────────────────────────────────
                  Un traslado no tiene elección (mover una asignación es
                  rotación por definición), así que ahí no se enseña. */}
              {!moveFrom && (
                <div>
                  <Segmented<'single' | 'rotation'>
                    value={assignMode}
                    onChange={setAssignMode}
                    options={[
                      { value: 'single', label: t('ui.Schedule.soloEsteDia', 'Sólo este día') },
                      { value: 'rotation', label: t('ui.ShiftAssignModal.rotacion', 'Rotación') },
                    ]}
                  />
                  <p className="mt-1.5 text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                    {assignMode === 'single'
                      ? 'Un turno suelto para la fecha elegida. No entra en la rotación del puesto.'
                      : 'Entra en la rotación del puesto: se generan sus turnos de todo el año. Tarda unos segundos.'}
                  </p>
                </div>
              )}

              {/* Guard */}
              <div>
                <label className="cg-eyebrow mb-1.5 block">{t('comun.vigilante')}</label>
                {(() => {
                  // ── QUIÉN PUEDE APARECER AQUÍ ────────────────────────────
                  // En ROTACIÓN, sólo quien no tenga ya una: un vigilante
                  // sostiene UNA sola rotación activa (fijo o sacafranco) y el
                  // servidor rechaza el resto — esconderlos evita el error.
                  //
                  // Para UN DÍA esa regla no aplica: cubrir un hueco el martes
                  // no es «pertenecer» a ningún puesto, y quien tapa el hueco
                  // suele ser precisamente alguien que YA tiene su rotación en
                  // otro sitio y ese día libra. Filtrarlos dejaba la lista casi
                  // vacía justo cuando más falta hacía.
                  const ocupados = new Set(assignments.map(a => a.guardId));
                  const disponibles = assignMode === 'single'
                    ? guardsPool
                    : guardsPool.filter(g => !ocupados.has(g.id) || g.id === assignGuard);

                  // Con turno ese día ya: se muestran, pero avisados. El turno
                  // nuevo REEMPLAZA al que se solape, y conviene saberlo antes.
                  const conTurnoEseDia = (id: string) => !!shiftByGuardDate.get(`${id}|${assignStartDate}`);

                  return (
                    <select value={assignGuard} onChange={e => setAssignGuard(e.target.value)} className="cg-input cg-focus w-full px-3 py-2.5 text-sm">
                      <option value="">{t('comun.eligeUnVigilante')}</option>
                      {disponibles.map(g => (
                        <option key={g.id} value={g.id}>
                          {g.label}{assignMode === 'single' && conTurnoEseDia(g.id) ? ' · ya tiene turno ese día' : ''}
                        </option>
                      ))}
                      {disponibles.length === 0 && <option value="" disabled>{t("ui.Schedule.todosLosVigilantesYaEstan", "Todos los vigilantes ya están asignados")}</option>}
                    </select>
                  );
                })()}
                {assignMode === 'single' && assignGuard && shiftByGuardDate.get(`${assignGuard}|${assignStartDate}`) && (
                  <p className="mt-1 text-[10px]" style={{ color: 'var(--warn-text)' }}>
                    Ya tiene turno ese día: el nuevo reemplazará al que se solape.
                  </p>
                )}
                {assignMode === 'rotation' && positions.find(p => p.id === assignTarget?.positionId)?.type === 'sacafranco' && (
                  <p className="mt-1 text-[10px]" style={{ color: 'var(--ok-text)' }}>{t('ui.Schedule.sacafrancoPuedeCubrirVariosPuestos')}</p>
                )}
                {assignMode === 'rotation' && positions.find(p => p.id === assignTarget?.positionId)?.type === 'fijo' && (
                  <p className="mt-1 text-[10px]" style={{ color: 'var(--warn-text)' }}>{t('ui.Schedule.fijoExclusivoDeEstePuesto')}</p>
                )}
              </div>

              {/* Start date: bounds when shifts begin (and sets the phase on
                  alternation stations). Defaults to the day you dropped on. */}
              <div>
                <label className="cg-eyebrow mb-1.5 block">
                  {assignMode === 'single' ? 'Día que cubre' : t("ui.Schedule.primerDiaDeTurno", "Primer día de turno")}
                </label>
                <input
                  type="date"
                  value={assignStartDate}
                  onChange={e => setAssignStartDate(e.target.value)}
                  className="cg-input cg-focus w-full px-3 py-2.5 text-sm"
                />
                <p className="mt-1 text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                  {assignMode === 'single'
                    ? t('ui.Schedule.horaDeLaEmpresaPunto', 'Hora de la empresa.')
                    : 'Los turnos se generan desde esta fecha (hora de la empresa).'}
                </p>
              </div>

              {/* Horas del turno suelto. Vienen del puesto; si el fin es menor o
                  igual que el inicio, el turno cruza la medianoche (iguales = 24 h). */}
              {assignMode === 'single' && (
                <div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="cg-eyebrow mb-1.5 block">Entra</label>
                      <input type="time" value={assignStartTime} onChange={e => setAssignStartTime(e.target.value)} className="cg-input cg-focus w-full px-3 py-2 font-mono text-sm tabular-nums" />
                    </div>
                    <div>
                      <label className="cg-eyebrow mb-1.5 block">Sale</label>
                      <input type="time" value={assignEndTime} onChange={e => setAssignEndTime(e.target.value)} className="cg-input cg-focus w-full px-3 py-2 font-mono text-sm tabular-nums" />
                    </div>
                  </div>
                  <p className="mt-1 text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                    {assignEndTime <= assignStartTime
                      ? (assignEndTime === assignStartTime ? t('ui.Schedule.turnoDe24Horas', 'Turno de 24 horas.') : t('ui.Schedule.terminaAlDiaSiguientePunto', 'Termina al día siguiente.'))
                      : 'Horas tomadas del puesto; puedes cambiarlas.'}
                  </p>
                </div>
              )}

              {/* The patrón de rotación is set on the STATION (Sitios › Estación ›
                  Horario del turno) and inherited here — not chosen per guard. */}
              {assignMode === 'rotation' && (() => {
                const st = stationsById.get(assignTarget?.stationId || '');
                const rot = st?.rotationStyleId ? rotationStylesById.get(st.rotationStyleId) : null;
                return (
                  <div className="glass-sunken px-3 py-2">
                    <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
                      {t('ui.Schedule.patronDeRotacion', 'Patrón de rotación:')} <span className="font-semibold" style={{ color: 'var(--ink)' }}>{rot?.name || 'el del puesto'}</span> · se hereda del puesto.
                    </p>
                  </div>
                );
              })()}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--hairline)', background: 'var(--glass-sunken)' }}>
              <button onClick={() => { setShowAssignForm(false); setMoveFrom(null); }} className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-all">{t('actions.cancel')}</button>
              <button onClick={saveAssignment} disabled={assignSaving || !assignGuard} className="cg-btn-brand cg-focus rounded-full px-5 py-2 text-sm font-semibold transition-all disabled:opacity-40">
                {assignSaving ? <Loader2 size={14} className="animate-spin" /> : (moveFrom ? 'Mover' : (assignMode === 'single' ? 'Cubrir el día' : 'Asignar a la rotación'))}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Configure Station Modal ─────────────────────────────────────── */}
      {configStation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'oklch(0 0 0 / 0.55)' }} onClick={() => setConfigStation(null)}>
          <div className="glass-raised mx-4 max-h-[90vh] w-full max-w-md overflow-hidden overflow-y-auto animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
              <h4 className="text-sm font-semibold">Configurar: {stationLabel(configStation)}</h4>
              <button onClick={() => setConfigStation(null)} className="cg-btn-ghost cg-focus rounded-lg p-1.5"><X size={15} /></button>
            </div>
            <div className="p-5 space-y-4">
              <label className="cg-eyebrow mb-2 block">{t('ui.Schedule.tipoDeCobertura')}</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: '24h', label: '24 Horas', desc: 'Fijo 1 + Fijo 2 + Sacafranco' },
                  { value: '12h-day', label: '12h Diurno', desc: 'Fijo 1 (día) + Sacafranco' },
                  { value: '12h-night', label: '12h Nocturno', desc: 'Fijo 1 (noche) + Sacafranco' },
                  { value: 'custom', label: 'Personalizado', desc: 'Ventana propia, bloques, 24×24…' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { setConfigType(opt.value); setConfigRotation(''); setCfgRotStyle(null); }}
                    className={`cg-focus rounded-xl p-3 text-left transition-all ${configType === opt.value ? 'glass-flat glass-brand' : 'glass-flat glass-hover'}`}
                  >
                    <div className="text-sm font-semibold" style={configType === opt.value ? { color: 'var(--brand-text)' } : undefined}>{opt.label}</div>
                    <div className="mt-0.5 text-[10px]" style={{ color: 'var(--ink-soft)' }}>{opt.desc}</div>
                  </button>
                ))}
              </div>

              {configType === 'custom' && (
                <div className="space-y-3">
                  {/* Quick preset: classic 24×24 alternation (no libres, no SF) */}
                  <button
                    type="button"
                    onClick={() => { setCfgStart('07:00'); setCfgEnd('07:00'); setCfgBlockHours(''); setCfgRestCoverage('alternate'); setConfigRotation(''); setCfgRotStyle(null); }}
                    className={`cg-focus w-full rounded-xl px-3 py-2 text-left transition-all ${cfgRestCoverage === 'alternate' && cfgWinMin === 1440 && !cfgBlockHours ? 'glass-flat glass-brand' : 'glass-flat glass-hover'}`}
                  >
                    <div className="text-xs font-semibold">Plantilla 24×24 (alternancia diaria)</div>
                    <div className="text-[10px]" style={{ color: 'var(--ink-soft)' }}>{t("ui.Schedule.unFijoTrabajaLas24", "Un fijo trabaja las 24 h y el otro va al día siguiente. Sin libres y sin sacafranco.")}</div>
                  </button>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="cg-eyebrow mb-1.5 block">{t('comun.horaInicio')}</label>
                      <input type="time" value={cfgStart} onChange={e => setCfgStart(e.target.value)} className="cg-input cg-focus w-full px-3 py-2 font-mono text-sm tabular-nums" />
                    </div>
                    <div>
                      <label className="cg-eyebrow mb-1.5 block">{t('comun.horaFin')}</label>
                      <input type="time" value={cfgEnd} onChange={e => setCfgEnd(e.target.value)} className="cg-input cg-focus w-full px-3 py-2 font-mono text-sm tabular-nums" />
                    </div>
                  </div>
                  <div>
                    <label className="cg-eyebrow mb-1.5 block">{t('comun.turnoPorVigilante')}</label>
                    <select value={cfgBlockHours} onChange={e => setCfgBlockHours(e.target.value)} className="cg-input cg-focus w-full px-3 py-2 text-sm">
                      <option value="">Toda la jornada (1 fijo{cfgWinMin === 1440 ? ' · 24h' : ''})</option>
                      {[4, 6, 8, 12].map(h => {
                        const fits = cfgWinMin > 0 && cfgWinMin % (h * 60) === 0;
                        const k = fits ? cfgWinMin / (h * 60) : 0;
                        return (
                          <option key={h} value={String(h)} disabled={!fits}>
                            {h}h{fits ? ` → ${k} fijo${k > 1 ? 's' : ''}` : ' (no divide la cobertura)'}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="cg-eyebrow mb-1.5 block">{t('ui.Schedule.coberturaDeDescansos', 'Cobertura de descansos')}</label>
                    <select value={cfgRestCoverage} onChange={e => setCfgRestCoverage(e.target.value as 'sacafranco' | 'alternate')} className="cg-input cg-focus w-full px-3 py-2 text-sm">
                      <option value="sacafranco">{t('comun.sacafrancoCubreLosDescansos')}</option>
                      <option value="alternate">{t('comun.alternanciaEntreFijosSinSacafranco')}</option>
                    </select>
                    {cfgRestCoverage === 'alternate' && (
                      <p className="mt-1.5 text-[11px]" style={{ color: cfgAlternateOk ? 'var(--ink-soft)' : 'var(--bad-text)' }}>
                        {!cfgRotStyle
                          ? 'Sin patrón elegido se usa 1-1: cada fijo trabaja su bloque completo y alterna con el siguiente, sin libres.'
                          : cfgAlternateOk
                            ? `Patrón ${cfgRotWork}-${cfgRotCycle - cfgRotWork}: ${cfgGuardsPerBlock} fijos alternando por bloque, sin sacafranco. Total ${cfgBlockCount * cfgGuardsPerBlock} fijos.`
                            : `El ciclo (${cfgRotCycle}) debe ser múltiplo de los días de trabajo (${cfgRotWork}). Usa 1-1, 2-2, 3-3…`}
                      </p>
                    )}
                    {cfgRestCoverage === 'sacafranco' && cfgBlocksOk && cfgBlockCount > 1 && (
                      <p className="mt-1.5 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
                        {cfgWinMin / 60}h de cobertura en {cfgBlockCount} bloques consecutivos de {Number(cfgBlockHours)}h — {cfgBlockCount} fijos + sacafranco.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <RotationStyleSelect
                scheduleType={configType}
                value={configRotation}
                onChange={setConfigRotation}
                onStyleChange={setCfgRotStyle}
              />
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--hairline)', background: 'var(--glass-sunken)' }}>
              <button onClick={() => setConfigStation(null)} className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-all">{t('actions.cancel')}</button>
              <button onClick={saveStationConfig} disabled={configSaving} className="cg-btn-brand cg-focus rounded-full px-5 py-2 text-sm font-semibold transition-all disabled:opacity-40">
                {configSaving ? <Loader2 size={14} className="animate-spin" /> : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Override Modal ───────────────────────────────────────────────── */}
      {overrideTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'oklch(0 0 0 / 0.55)' }} onClick={() => setOverrideTarget(null)}>
          <div className="glass-raised mx-4 w-full max-w-xs overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
              <h4 className="text-sm font-semibold">Registrar novedad</h4>
              <p className="mt-0.5 text-[11px]" style={{ color: 'var(--ink-soft)' }}>{overrideTarget.guardName} — {overrideTarget.date}</p>
            </div>
            <div className="p-4 grid grid-cols-2 gap-2">
              {CODE_ORDER.map(c => (
                <button
                  key={c}
                  onClick={() => performOverrideSave(overrideTarget, c)}
                  /* Misma píldora que en la rejilla: el color que se elige aquí
                     es literalmente el que va a aparecer en la celda — los dos
                     salen de `codePill`. */
                  className="cg-focus rounded-xl px-3 py-2.5 text-xs font-semibold transition-all hover:scale-105"
                  style={codeCard(c)}
                >
                  {c} — {CODE_LABEL[c]}
                </button>
              ))}
              {(() => {
                const existing = getOverride(overrideTarget.guardId, overrideTarget.date);
                if (!existing) return null;
                return (
                  <button
                    onClick={() => removeOverride(existing.id)}
                    className="cg-focus col-span-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
                    style={toneCard('bad')}
                  >
                    <X className="inline h-3.5 w-3.5 mr-1" />Quitar novedad actual ({existing.type})
                  </button>
                );
              })()}
            </div>
            <div className="flex justify-end px-5 py-3" style={{ borderTop: '1px solid var(--hairline)', background: 'var(--glass-sunken)' }}>
              <button onClick={() => setOverrideTarget(null)} className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-all">{t('actions.close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Draft horario review/diff Modal ──────────────────────────────── */}
      {proposalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'oklch(0 0 0 / 0.5)' }}>
          <div className="glass-raised flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden">
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
              <div className="flex items-center gap-2">
                {planData ? <CheckCircle2 size={18} style={{ color: 'var(--ok-text)' }} /> : <FileText size={18} style={{ color: 'var(--brand-text)' }} />}
                <h3 className="font-display text-base font-bold">{planData ? t('ui.Schedule.planDeImplementacion', 'Plan de implementación') : t('ui.Schedule.borradorDeHorario', 'Borrador de horario')}</h3>
              </div>
              <p className="mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
                {planData ? 'Horario publicado. Estos vigilantes fueron notificados de sus cambios.' : 'Revisa los cambios propuestos. Nada se aplica hasta que publiques.'}
              </p>
            </div>

            {planData ? (
              /* Implementation plan (post-publish): who was notified */
              <div className="flex-1 overflow-auto px-5 py-3">
                <div className="mb-3 flex items-center gap-2 rounded-xl px-3 py-2" style={tonePill('ok', 12)}>
                  <Users size={16} />
                  <span className="text-sm font-semibold">
                    {(planData?.plan?.notifiedGuards ?? 0)} de {(planData?.plan?.totalGuards ?? planData?.items?.length ?? 0)} vigilantes notificados
                  </span>
                </div>
                {(planData?.items || []).length ? (
                  <div className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                    {(planData.items || []).map((it: PlanItem) => {
                      const ch: string[] = [];
                      if (it.added) ch.push(`+${it.added}`);
                      if (it.changed) ch.push(`~${it.changed}`);
                      if (it.removed) ch.push(`-${it.removed}`);
                      const ok = it.notifyStatus === 'sent';
                      return (
                        <div key={it.id || it.guardId} className="flex items-center gap-3 py-2">
                          <span className="shrink-0" style={{ color: ok ? 'var(--ok-text)' : 'var(--ink-faint)' }}>{ok ? <CheckCircle2 size={15} /> : <Clock size={15} />}</span>
                          <span className="min-w-0 flex-1 truncate text-sm">{it.guardName || 'Vigilante'}</span>
                          <span className="shrink-0 font-mono text-xs tabular-nums" style={{ color: 'var(--ink-soft)' }}>{ch.join(' ')}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm" style={{ color: 'var(--ink-soft)' }}>{t('ui.Schedule.noHuboVigilantesAfectados', 'No hubo vigilantes afectados.')}</p>
                )}
              </div>
            ) : (
            <>
            {/* Summary counters */}
            {(() => {
              const s = proposalData?.proposal?.summary || {};
              const cards = [
                { label: 'Nuevos', value: s.added || 0, icon: <PlusIcon size={14} />, tone: 'ok' as Tone },
                { label: 'Eliminados', value: s.removed || 0, icon: <MinusCircle size={14} />, tone: 'bad' as Tone },
                { label: 'Modificados', value: s.changed || 0, icon: <RefreshCw size={14} />, tone: 'warn' as Tone },
                { label: 'Vigilantes afectados', value: s.guardsAffected || 0, icon: <Users size={14} />, tone: 'neutral' as Tone },
              ];
              return (
                <div className="grid grid-cols-2 gap-2 px-5 py-3 sm:grid-cols-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
                  {cards.map((c) => (
                    <div key={c.label} className="glass-flat p-2 text-center">
                      <div className="flex items-center justify-center gap-1" style={{ color: toneInk(c.tone) }}>
                        {c.icon}<span className="text-lg font-bold tabular-nums">{c.value}</span>
                      </div>
                      <div className="cg-eyebrow mt-0.5">{c.label}</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Costo proyectado RETIRADO (2026-08-06): salía de la tarifa por hora
                de Nómina, que dejó de existir cuando se quitó el rol de pagos.
                Vuelve cuando el pago se reconstruya para cualquier país. */}

            {/* Coverage (Phase 7): is every puesto covered? */}
            {(() => {
              const cov = proposalData?.proposal?.summary?.warnings?.coverage;
              if (!cov) return null;
              const ok = (cov.gapCount || 0) === 0;
              return (
                <div className="flex items-center justify-between px-5 py-2.5" style={{ borderBottom: '1px solid var(--hairline)' }}>
                  <div className="flex items-center gap-2">
                    {ok ? <CheckCircle2 size={15} style={{ color: 'var(--ok-text)' }} /> : <AlertTriangle size={15} style={{ color: 'var(--bad-text)' }} />}
                    <span className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>{t('dashboard.coverage.title', 'Cobertura de puestos')} <span style={{ color: 'var(--ink-faint)' }}>{t("ui.Schedule.14Dias", "(14 días)")}</span></span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-bold tabular-nums" style={{ color: ok ? 'var(--ok-text)' : 'var(--bad-text)' }}>{cov.coveredPct}%</span>
                    {(cov.gapCount || 0) > 0 && <span className="font-semibold tabular-nums" style={{ color: 'var(--bad-text)' }}>{cov.gapCount} sin cubrir</span>}
                    {(cov.overstaffCount || 0) > 0 && <span className="tabular-nums" style={{ color: 'var(--warn-text)' }}>{cov.overstaffCount} sobre-cubierto</span>}
                  </div>
                </div>
              );
            })()}

            {/* Rest-rule + sacafranco warnings (reqs 3 & 9) */}
            {(() => {
              const w = proposalData?.proposal?.summary?.warnings;
              if (
                !w ||
                (!w.total &&
                  !w.restViolations?.length &&
                  !w.doubleBookings?.length &&
                  !w.sfStyleInconsistencies?.length &&
                  !w.shortRests?.length &&
                  !w.weeklyOverloads?.length)
              )
                return null;
              const lines: string[] = [];
              if (w.doubleBookings?.length) lines.push(`${w.doubleBookings.length} vigilante(s) con doble asignación el mismo día`);
              if (w.restViolations?.length) lines.push(`${w.restViolations.length} vigilante(s) sin descanso semanal (más de ${w.maxConsecutiveAllowed || 7} días seguidos)`);
              // Estos dos SE CALCULABAN y viajaban en la respuesta, y esta lista
              // no los leía: se podía fijar «descanso mínimo 12 h» y «tope 40 h
              // semanales» en Configuración › Jornada, publicar un horario que
              // violara las dos, y no recibir ni una señal. El ajuste existía,
              // el motor existía, y no llegaba a la pantalla.
              if (w.shortRests?.length) lines.push(`${w.shortRests.length} vigilante(s) con menos del descanso mínimo entre turnos`);
              if (w.weeklyOverloads?.length) lines.push(`${w.weeklyOverloads.length} vigilante(s) por encima del tope de horas semanales`);
              if (w.sfStyleInconsistencies?.length) lines.push(`${w.sfStyleInconsistencies.length} sitio(s) con sacafrancos en estilos de turno distintos`);
              if (!lines.length) return null;
              return (
                <div className="px-5 py-2.5" style={{ borderBottom: '1px solid var(--hairline)' }}>
                  <div className="flex items-start gap-2 rounded-xl px-3 py-2" style={tonePill('warn', 12)}>
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                    <div className="text-[11px] leading-relaxed">
                      <p className="font-semibold">{t('ui.Schedule.revisaAntesDePublicar', 'Revisa antes de publicar:')}</p>
                      <ul className="list-disc pl-4">
                        {lines.map((l, i) => <li key={i}>{l}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Change list */}
            <div className="flex-1 overflow-auto px-5 py-3">
              {(() => {
                const changes = (proposalData?.changes || []).filter((c: ProposalChange) => c.action !== 'keep');
                if (!changes.length) {
                  return (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <CheckCircle2 size={28} className="mb-2" style={{ color: 'var(--ok-text)' }} />
                      <p className="text-sm font-semibold">{t("ui.Schedule.elHorarioYaEstaAl", "El horario ya está al día")}</p>
                      <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{t('ui.Schedule.noHayCambiosQueAplicar')}</p>
                    </div>
                  );
                }
                const fmt = (d: string) => {
                  try { return new Date(d).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return d; }
                };
                const badge: Record<string, Tone> = { add: 'ok', remove: 'bad', change: 'warn' };
                const label: Record<string, string> = { add: 'Nuevo', remove: 'Eliminar', change: 'Cambio' };
                return (
                  <div className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                    {changes.slice(0, 300).map((c: ProposalChange) => (
                      <div key={c.id} className="flex items-center gap-3 py-2">
                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={tonePill(badge[c.action || ''] || 'neutral', 12)}>{label[c.action || ''] || c.action}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm tabular-nums">{fmt(c.startTime || '')} {c.meta?.shiftType ? `· ${c.meta.shiftType === 'night' ? 'Nocturno' : c.meta.shiftType === 'day' ? 'Diurno' : c.meta.shiftType}` : ''}</p>
                        </div>
                      </div>
                    ))}
                    {changes.length > 300 && (
                      <p className="py-2 text-center text-[11px]" style={{ color: 'var(--ink-soft)' }}>+{changes.length - 300} cambios más…</p>
                    )}
                  </div>
                );
              })()}
            </div>
            </>
            )}

            <div className="flex items-center justify-between gap-3 px-5 py-3" style={{ borderTop: '1px solid var(--hairline)', background: 'var(--glass-sunken)' }}>
              {planData ? (
                <button onClick={closeProposalModal} className="cg-btn-brand cg-focus ml-auto rounded-full px-6 py-2.5 text-sm font-semibold transition-all">Listo</button>
              ) : (
                <>
                  <button onClick={discardProposal} disabled={publishing} className="cg-focus flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-all disabled:opacity-50" style={{ color: 'var(--bad-text)' }}>
                    <Trash2 size={14} /> Descartar
                  </button>
                  {(() => {
                    const gaps = proposalData?.proposal?.summary?.warnings?.coverage?.gapCount || 0;
                    const hasGaps = gaps > 0;
                    return (
                      <button
                        onClick={() => publishProposal(hasGaps)}
                        disabled={publishing}
                        className={`cg-focus flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-all disabled:opacity-50 ${hasGaps ? 'cg-btn-bad' : 'cg-btn-brand'}`}
                      >
                        {publishing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        {publishing ? 'Publicando...' : hasGaps ? 'Publicar con faltantes' : 'Publicar y aplicar'}
                      </button>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
