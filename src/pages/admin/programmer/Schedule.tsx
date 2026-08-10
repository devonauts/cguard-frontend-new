import { localToday } from '@/lib/utils';
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
import { StatusBadge } from "@/components/kit";
import { ApiService } from "@/services/api/apiService";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirmDialog";
import ScheduleTimeline, { dateToWall, wallToDate, startPan } from "./ScheduleTimeline";
import RotationStyleSelect from "@/components/schedule/RotationStyleSelect";
import ContextMenu, { CtxItem, CtxMenuState } from "./ContextMenu";
import TransferShiftModal, { TransferTarget } from "./TransferShiftModal";
import { stationLabel } from "@/lib/stationName";
import type {
  RotationStyle,
  StationPosition,
  GuardAssignment,
  GuardRef,
  Station,
  ShiftRecord,
  GuardOption,
  ScheduleOverride,
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

// Per-station staffing alert (uncovered fijo slots / SF rest-day gaps).
interface StationAlert {
  stationId: string;
  stationName: string;
  nickname?: string | null;
  missingFijoCount: number;
  sfUncoveredDays: number;
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
const tzToday = (): string => {
  const tz = getTenantTimezone();
  if (tz) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
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

const POSITION_COLORS: Record<string, { bg: string; border: string; text: string; icon: LucideIcon }> = {
  fijo: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-600', icon: Sun },
  sacafranco: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-500', icon: Shield },
};

const GUARD_COLORS = [
  '#C8860A', '#3B82F6', '#A855F7', '#10B981', '#EF4444',
  '#EC4899', '#06B6D4', '#F59E0B', '#8B5CF6', '#14B8A6',
];

const OVERRIDE_STYLES: Record<string, { bg: string; text: string }> = {
  V: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  PM: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
  F: { bg: 'bg-red-500/20', text: 'text-red-400' },
  '24': { bg: 'bg-amber-500/15', text: 'text-amber-500' },
  D: { bg: 'bg-sky-500/15', text: 'text-sky-500' },
  N: { bg: 'bg-indigo-500/15', text: 'text-indigo-400' },
  L: { bg: 'bg-muted/30', text: 'text-muted-foreground/50' },
};

// Keyboard → novedad code (spreadsheet typing).
const KEY_CODES: Record<string, string> = { d: 'D', n: 'N', l: 'L', v: 'V', f: 'F', p: 'PM', '2': '24' };

// Día/Noche letter for a WORKING cell. Standard 24h alternates by rotation
// phase; 12h-day/12h-night are fixed. A CUSTOM puesto has no día/noche split in
// its rotation (the work count sits in dayShifts, so the phase is always 'day'),
// so classify it by the block's ACTUAL start hour — a 20:00→08:00 block is Noche.
// Mirrors the backend's shiftHalfByStart (18/6 threshold) so the grid label
// matches the generated shift instead of hard-forcing 'D' for every custom puesto.
function dnCode(
  scheduleType: string | null | undefined,
  posStartTime: string | null | undefined,
  status: 'day' | 'night',
): 'D' | 'N' {
  if (scheduleType === '24h') return status === 'night' ? 'N' : 'D';
  if (scheduleType === '12h-night') return 'N';
  if (scheduleType === '12h-day') return 'D';
  const h = parseInt(String(posStartTime || '').split(':')[0], 10);
  return !Number.isNaN(h) && (h >= 18 || h < 6) ? 'N' : 'D';
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function Schedule() {
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
      toast.error('Error al cargar horario');
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

  const getPositionsForStation = useCallback((stationId: string) =>
    positions.filter(p => p.stationId === stationId && p.type !== 'sacafranco'), [positions]);

  const getAssignmentsForPosition = useCallback((positionId: string) =>
    assignments.filter(a => a.positionId === positionId), [assignments]);

  const guardColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    let idx = 0;
    assignments.forEach(a => {
      if (a.guardId && !map[a.guardId]) {
        map[a.guardId] = GUARD_COLORS[idx % GUARD_COLORS.length];
        idx++;
      }
    });
    shifts.forEach(s => {
      if (s.guardId && !map[s.guardId]) {
        map[s.guardId] = GUARD_COLORS[idx % GUARD_COLORS.length];
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
    const byGuard = new Map<string, { guard: GuardRef | undefined; assignments: GuardAssignment[]; availability: { date: Date; status: 'covering' | 'available'; stationName?: string }[] }>();

    reliefAssignments.forEach(a => {
      if (!byGuard.has(a.guardId)) {
        byGuard.set(a.guardId, { guard: a.guard, assignments: [], availability: [] });
      }
      byGuard.get(a.guardId)!.assignments.push(a);
    });

    // Daily status from REAL shifts only: covering where a shift exists (any
    // station), libre otherwise. No rotation math — the SF is manual now.
    byGuard.forEach((data, guardId) => {
      monthDays.forEach(day => {
        const shift = shiftByGuardDate.get(`${guardId}|${fmtDate(day)}`);
        if (shift) {
          data.availability.push({ date: day, status: 'covering', stationName: stationsById.get(shift.stationId)?.stationName || 'Cobertura' });
        } else {
          data.availability.push({ date: day, status: 'available' });
        }
      });
    });

    return Array.from(byGuard.values());
  }, [assignments, positionsById, stationsById, shiftByGuardDate, monthDays]);

  // Map: `${stationId}-${dateStr}` → SF guard(s) ACTUALLY covering there that
  // day (real shifts only — shows on the fijo's L cell as "SF").
  const sfStationCoverage = useMemo(() => {
    const map = new Map<string, { name: string; fullName: string }[]>();
    for (const s of shifts) {
      if (!s.startTime || !reliefGuardIds.has(s.guardId)) continue;
      const dateStr = dateToWall(new Date(s.startTime), tzName).dateStr;
      const key = `${s.stationId}-${dateStr}`;
      const g = s.guard;
      const fullName = g
        ? `${g.firstName || ''} ${g.lastName || ''}`.trim()
        : (guardsPool.find(x => x.id === s.guardId)?.label || 'SF');
      const initials = g ? `${g.firstName?.[0] || ''}${g.lastName?.[0] || ''}`.toUpperCase() : 'SF';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ name: initials || 'SF', fullName });
    }
    return map;
  }, [shifts, reliefGuardIds, tzName, guardsPool]);

  // Per-station alerts for uncovered fijo slots and SF rest-day coverage gaps.
  const localStationAlerts = useMemo(() => {
    const rows: { stationId: string; stationName: string; nickname?: string | null; missingFijoCount: number; sfUncoveredDays: number }[] = [];

    for (const st of stations) {
      const stationFijoPositions = positions.filter(p => p.stationId === st.id && p.type === 'fijo');
      const stationFijoAssignments = assignments.filter(a => {
        const pos = positionsById.get(a.positionId);
        return a.stationId === st.id && !a.isRelief && pos?.type === 'fijo';
      });

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
  }, [stations, positions, positionsById, assignments, monthDays, sfStationCoverage, isWorkDay]);

  const stationAlerts = useMemo<StationAlert[]>(() => {
    const apiAlerts = staffing?.stationAlerts;
    const rows = Array.isArray(apiAlerts) ? apiAlerts : localStationAlerts;
    // The staffing endpoint does not return the nominativo, and this panel is
    // where you pick which puesto to fix — so stitch it back on from the
    // stations we already hold. Several puestos share a stationName; without it
    // the list names four different posts identically.
    const nickById = new Map(stations.map(st => [String(st.id), st.nickname ?? null]));
    return rows.map(a => (a.nickname ? a : { ...a, nickname: nickById.get(String(a.stationId)) ?? null }));
  }, [staffing, localStationAlerts, stations]);

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
      for (const pos of positions.filter(p => p.type === 'sacafranco')) {
        rows.push({ key: pos.id, station: stationsById.get(pos.stationId) || null, pos, assignments: getAssignmentsForPosition(pos.id), isSf: true });
      }
    }
    return rows;
  }, [stations, positions, sfSectionOpen, stationsById, getPositionsForStation, getAssignmentsForPosition]);

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

  const scrollCellIntoView = useCallback((rowKey: string, c: number) => {
    requestAnimationFrame(() => {
      document.getElementById(`hc-${rowKey}-${c}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }, []);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const openAssignForm = (stationId: string, positionId: string, dateStr?: string) => {
    setAssignTarget({ stationId, positionId });
    setAssignGuard('');
    setAssignStartDate(dateStr || tzToday());
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
      const nm = occupiedBy.guard ? `${occupiedBy.guard.firstName || ''} ${occupiedBy.guard.lastName || ''}`.trim() : 'el fijo';
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
    const sfName = g?.label || assignments.find(a => a.guardId === sfGuardId)?.guard?.firstName || 'Sacafranco';
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
      toast.error(e?.data?.message || e?.message || 'Error al asignar la cobertura');
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
      toast.success('Turno duplicado al día siguiente');
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
      toast.success('Turno eliminado');
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
        const nm = a.guard?.firstName || 'vigilante';
        const full = a.guard ? `${a.guard.firstName || ''} ${a.guard.lastName || ''}`.trim() : nm;
        items.push({ label: `Editar turno de ${nm} (vista Día)…`, onClick: () => jumpToDay(dateStr) });
        items.push({ label: 'Duplicar turno al día siguiente', onClick: () => void duplicateShiftNextDay(s) });
        items.push({ label: 'Eliminar turno de este día', danger: true, onClick: () => void deleteDayShift(s) });
        items.push({ label: '—' });
      }
    }
    if (posAssignments.length) {
      const a = posAssignments[0];
      const guardName = a.guard ? `${a.guard.firstName || ''} ${a.guard.lastName || ''}`.trim() : 'Vigilante';
      // On a rest (L) day the puesto is uncovered — offer to assign a sacafranco
      // to cover it (opens the picker modal). Skip when it's already covered.
      const resting = isWorkDay(a, new Date(dateStr + 'T00:00:00')) === 'rest';
      const alreadyCovered = (sfStationCoverage.get(`${station.id}-${dateStr}`) || []).length > 0;
      if (resting && !alreadyCovered) {
        items.push({ label: 'Asignar sacafranco…', onClick: () => setSfPick({ station, pos, dateStr, assignment: a, guardName }) });
        items.push({ label: '—' });
      }
      // Trasladar works with or without a generated shift row: with one we move
      // that exact turno, without one the backend resolves the cell's date in
      // the tenant timezone. Gating this on a shift row hid it on most cells,
      // because the grid paints D/N/L from the rotation, not from shift rows.
      items.push({
        label: `Trasladar a ${a.guard?.firstName || 'vigilante'} a otra estación…`,
        onClick: () => setTransferTarget({
          guardId: a.guardId,
          guardName,
          shiftId: shiftByGuardDate.get(`${a.guardId}|${dateStr}`)?.id ?? null,
          stationId: station.id,
          stationName: station.stationName,
          dateStr,
        }),
      });
      items.push({ label: 'Registrar novedad…', onClick: () => setOverrideTarget({ guardId: a.guardId, guardName, date: dateStr, assignmentId: a.id }) });
      const ov = getOverride(a.guardId, dateStr);
      if (ov) items.push({ label: `Quitar novedad (${ov.type})`, danger: true, onClick: () => void removeOverride(ov.id) });
    } else {
      items.push({ label: 'Asignar vigilante…', onClick: () => openAssignForm(station.id, pos.id, dateStr) });
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
        items.push({ label: 'Duplicar al día siguiente', onClick: () => void duplicateShiftNextDay(covShift) });
        items.push({ label: 'Quitar cobertura', danger: true, onClick: () => void removeSfCoverage(covShift) });
        items.push({ label: '—' });
      }
      const gName = sfGuard.guard ? `${sfGuard.guard.firstName || ''} ${sfGuard.guard.lastName || ''}`.trim() : 'Sacafranco';
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
      items.push({ label: 'Asignar sacafranco…', onClick: () => openAssignForm(pos.stationId, pos.id, dateStr) });
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
    setMoveFrom(from);
    setAssignTarget({ stationId, positionId });
    setAssignGuard(guardId);
    setAssignStartDate(dateStr || tzToday());
    setShowAssignForm(true);
  };

  const saveAssignment = async () => {
    if (!assignTarget || !assignGuard) {
      toast.error('Complete todos los campos');
      return;
    }
    const isSacafranco = positions.find(p => p.id === assignTarget.positionId)?.type === 'sacafranco';
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
    if (!(await confirmDialog({ title: 'Remover asignación', message: '¿Remover esta asignación? Se eliminarán los turnos futuros generados.', confirmText: 'Remover', tone: 'danger' }))) return;
    try {
      await ApiService.delete(`/tenant/${tenantId}/guard-assignment/${assignmentId}`);
      toast.success('Asignación removida');
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
      if (!cfgStart || !cfgEnd) { toast.error('Define la hora de inicio y fin'); return; }
      if (cfgBlockHours && !cfgBlocksOk) { toast.error('La duración del turno debe dividir exactamente la cobertura del puesto.'); return; }
      if (cfgRestCoverage === 'alternate' && !cfgAlternateOk) {
        toast.error('Para alternar sin sacafranco, el ciclo del patrón debe ser múltiplo de sus días de trabajo (ej. 1-1, 2-2).');
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
      toast.success('Estación configurada');
      setConfigStation(null);
      fetchAll();
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || 'Error');
    } finally {
      setConfigSaving(false);
    }
  };

  const addPosition = async (stationId: string) => {
    try {
      await ApiService.post(`/tenant/${tenantId}/station/${stationId}/positions`, {
        data: { name: 'Sacafranco', type: 'sacafranco', startTime: '07:00', endTime: '19:00', guardsNeeded: 1, sortOrder: 99 },
      });
      toast.success('Posición sacafranco agregada');
      fetchAll();
    } catch (e: any) {
      toast.error(e?.message || 'Error');
    }
  };

  const deletePosition = async (stationId: string, positionId: string) => {
    if (!(await confirmDialog({ title: 'Eliminar posición', message: '¿Eliminar esta posición?', confirmText: 'Eliminar', tone: 'danger' }))) return;
    try {
      await ApiService.delete(`/tenant/${tenantId}/station/${stationId}/positions/${positionId}`);
      toast.success('Posición eliminada');
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
      toast.error(e?.data?.message || e?.message || 'Error generando el borrador');
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
      toast.error(e?.data?.message || e?.message || 'Error en auto-asignación');
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
      toast.error(e?.data?.message || e?.message || 'Error en optimización');
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
          toLocal(s).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
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
          title: 'Ajustar la rotación desde este libre',
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
            toast.error(e?.data?.message || e?.message || 'No se pudo reajustar la rotación');
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
      toast.info('Selecciona celdas de un puesto con vigilante asignado');
      return;
    }
    // Single cell + L on a fijo → keep the full "rephase from this libre" flow.
    if (cells.length === 1 && type === 'L') {
      const { row, dateStr } = cells[0];
      const a = row.assignments[0];
      const guardName = a.guard ? `${a.guard.firstName || ''} ${a.guard.lastName || ''}`.trim() : 'Vigilante';
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

  const clearSelectedCells = useCallback(async () => {
    const cells = cellsInSelection();
    if (!cells.length) return;
    const victims: ScheduleOverride[] = [];
    for (const { row, dateStr } of cells) {
      for (const a of row.assignments) {
        const o = getOverride(a.guardId, dateStr);
        if (o) victims.push(o);
      }
    }
    if (!victims.length) return;
    const victimIds = new Set(victims.map(v => v.id));
    setOverrides(prev => prev.filter(o => !victimIds.has(o.id)));
    await Promise.allSettled(
      victims
        .filter(v => !String(v.id).startsWith('tmp-'))
        .map(v => ApiService.delete(`/tenant/${tenantId}/schedule-overrides/${v.id}`)),
    );
    toast.success(`${victims.length} novedad(es) eliminadas`);
    fetchAll({ silent: true });
  }, [cellsInSelection, getOverride, tenantId, fetchAll]);

  const openNovedadForFocus = useCallback(() => {
    if (!sel) return;
    const row = selectableRows[sel.fr];
    if (!row || !row.assignments.length) {
      if (row) openAssignForm(row.pos.stationId, row.pos.id, fmtDate(monthDays[sel.fc]));
      return;
    }
    const a = row.assignments[0];
    const guardName = a.guard ? `${a.guard.firstName || ''} ${a.guard.lastName || ''}`.trim() : 'Vigilante';
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

  const modalOpen = showAssignForm || !!configStation || !!overrideTarget || !!proposalData || !!sfCover;

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

  const onGridScroll = () => {
    cancelAnimationFrame(scrollSaveRaf.current);
    scrollSaveRaf.current = requestAnimationFrame(() => {
      persistView();
      // Toolbar month label follows the leftmost visible day of the canvas.
      const el = gridScrollRef.current;
      if (el && view === 'month') {
        const idx = Math.max(0, Math.min(monthDays.length - 1, Math.round((el.scrollLeft + 60) / 44)));
        const d = monthDays[idx];
        if (d && (d.getMonth() !== visibleMonth.getMonth() || d.getFullYear() !== visibleMonth.getFullYear())) {
          setVisibleMonth(new Date(d.getFullYear(), d.getMonth(), 1));
        }
      }
    });
  };

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
    return visibleMonth.toLocaleDateString('es', { month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase());
  }, [visibleMonth]);

  const rangeLabel = useMemo(() => {
    if (view === 'month') return monthLabel;
    const fmt = (d: Date) => d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
    if (view === 'week') {
      const a = timelineDays[0], b = timelineDays[timelineDays.length - 1];
      return `${fmt(a)} – ${fmt(b)} ${b.getFullYear()}`;
    }
    return currentDate.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase());
  }, [view, monthLabel, timelineDays, currentDate]);

  const todayStr = tzToday();
  const gridCols = `240px repeat(${monthDays.length}, 44px)`;
  const gridMinWidth = 240 + monthDays.length * 44;

  const selInfo = useMemo(() => {
    if (!sel || !selBounds) return null;
    const row = selectableRows[sel.fr];
    if (!row) return null;
    const count = (selBounds.r2 - selBounds.r1 + 1) * (selBounds.c2 - selBounds.c1 + 1);
    const guard = row.assignments[0]?.guard;
    const who = guard ? `${guard.firstName || ''} ${guard.lastName || ''}`.trim() : 'sin vigilante';
    return `${count} celda${count === 1 ? '' : 's'} · ${row.station?.stationName || ''} — ${row.pos.name} (${who})`;
  }, [sel, selBounds, selectableRows]);

  // ─── Cell renderers ──────────────────────────────────────────────────────

  const renderFijoCell = (station: Station, pos: StationPosition, posAssignments: GuardAssignment[], day: Date, dayIdx: number) => {
    const dateStr = fmtDate(day);
    const isToday = dateStr === todayStr;
    const isSunday = day.getDay() === 0;

    return (
      <div
        key={dayIdx}
        id={`hc-${pos.id}-${dayIdx}`}
        className={`border-r border-border/10 last:border-r-0 px-0.5 py-0.5 min-h-[36px] flex ${isToday ? 'bg-primary/3' : ''} ${isSunday ? 'bg-red-500/3' : ''}${cellSelCls(pos.id, dayIdx)}`}
        onMouseDown={e => { if (e.button === 0) startCellSelect(pos.id, dayIdx, e.shiftKey); }}
        onMouseEnter={() => hoverCellSelect(pos.id, dayIdx)}
        onDragOver={e => e.preventDefault()}
        onDrop={e => handleDrop(e, station.id, pos.id, dateStr)}
        onContextMenu={e => openCellCtx(e, station, pos, posAssignments, dateStr)}
      >
        {posAssignments.length === 0 ? (
          // SIN VIGILANTE = SIN ROTACIÓN. Aquí se pintaba D/N/L a partir del
          // offset guardado en el puesto: una rotación inventada para un puesto
          // que nadie trabaja, que es de dónde salían las "L" que no cuadraban
          // con nadie. La fase es del vigilante; sin vigilante no hay fase.
          <div
            className="flex-1 rounded bg-muted/10 border border-dashed border-border/40 flex items-center justify-center cursor-pointer"
            title="Puesto sin vigilante — doble clic para asignar"
            onDoubleClick={() => openAssignForm(station.id, pos.id, dateStr)}
          >
            <span className="text-[10px] font-bold text-muted-foreground/30">·</span>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-0.5">
            {posAssignments.map(assignment => {
              const guardName = assignment.guard
                ? `${assignment.guard.firstName || ''} ${assignment.guard.lastName || ''}`.trim()
                : '?';
              const color = guardColorMap[assignment.guardId] || '#666';
              const override = getOverride(assignment.guardId, dateStr);

              // If there's an override, show it instead of calculated rotation
              if (override) {
                const oType = override.type;
                const s = OVERRIDE_STYLES[oType] || { bg: 'bg-muted/30', text: 'text-foreground' };
                return (
                  <div
                    key={assignment.id}
                    className={`flex-1 min-h-[18px] rounded flex items-center justify-center cursor-pointer ${s.bg}`}
                    style={{ borderLeft: `2px solid ${color}` }}
                    title={`${guardName} — ${oType}${override.note ? ': ' + override.note : ''} (doble clic para editar)`}
                    onDoubleClick={() => setOverrideTarget({ guardId: assignment.guardId, guardName, date: dateStr, assignmentId: assignment.id })}
                  >
                    <span className={`text-[10px] font-bold ${s.text}`}>{oType}</span>
                  </div>
                );
              }

              const workStatus = isWorkDay(assignment, day);
              // is24h drives the cell COLOR (amber vs sky); the D/N letter itself
              // comes from dnCode (which also handles custom night puestos).
              const is24h = station.scheduleType === '24h';

              if (workStatus === 'rest') {
                const coverKey = `${station.id}-${dateStr}`;
                const coveringSfs = sfStationCoverage.get(coverKey) || [];
                const sfLabel = coveringSfs.length > 0 ? coveringSfs[0].name : '';
                const sfTooltip = coveringSfs.length > 0 ? coveringSfs.map(s => s.fullName).join(', ') : '';
                return (
                  <div
                    key={assignment.id}
                    className={`flex-1 min-h-[18px] rounded flex items-center justify-center cursor-pointer relative ${sfLabel ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-muted/30 hover:bg-muted/50'}`}
                    title={`${guardName} — Libre${sfTooltip ? ` · Cubre: ${sfTooltip}` : ' (clic derecho: asignar sacafranco)'}`}
                    onDoubleClick={() => setOverrideTarget({ guardId: assignment.guardId, guardName, date: dateStr, assignmentId: assignment.id })}
                  >
                    {sfLabel ? (
                      <span className="text-[8px] font-bold text-emerald-600">{sfLabel}</span>
                    ) : (
                      <span className="text-[10px] font-bold text-muted-foreground/50">L</span>
                    )}
                  </div>
                );
              }

              const code = dnCode(station.scheduleType, pos.startTime, workStatus as 'day' | 'night');
              const bg = code === 'N'
                ? 'bg-indigo-500/15'
                : is24h ? 'bg-amber-500/15' : 'bg-sky-500/15';
              const textColor = code === 'N'
                ? 'text-indigo-400'
                : is24h ? 'text-amber-500' : 'text-sky-500';

              return (
                <div
                  key={assignment.id}
                  className={`flex-1 min-h-[18px] rounded flex items-center justify-center cursor-pointer hover:opacity-80 ${bg}`}
                  style={{ borderLeft: `2px solid ${color}` }}
                  title={`${guardName} — ${code === 'N' ? 'Nocturno' : 'Diurno'} (doble clic para novedad)`}
                  onDoubleClick={() => setOverrideTarget({ guardId: assignment.guardId, guardName, date: dateStr, assignmentId: assignment.id })}
                >
                  <span className={`text-[10px] font-bold ${textColor}`}>{code}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="px-3 lg:px-4 pt-2 pb-2 flex flex-col">
        {/* ─── Compact toolbar ─── */}
        <div className="flex items-center gap-2 flex-wrap pb-2">
          <div className="flex items-center gap-2 mr-1">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <CalendarDays size={16} className="text-primary" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold text-foreground">Horario</div>
              <div className="text-[10px] text-muted-foreground hidden sm:block">Programador de rotaciones y coberturas</div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => nav(-1)} title="Anterior (Re Pág)"><ChevronLeft size={16} /></Button>
            <Button variant="outline" size="sm" onClick={goToday}>Hoy</Button>
            <span className="text-sm font-medium text-foreground min-w-[130px] text-center">{rangeLabel}</span>
            <Button variant="outline" size="sm" onClick={() => nav(1)} title="Siguiente (Av Pág)"><ChevronRight size={16} /></Button>
          </div>

          {/* View switcher: Mes = spreadsheet · Semana/Día = draw-a-block timeline */}
          <div className="flex items-center rounded-lg border border-border/40 overflow-hidden">
            {([['month', 'Mes'], ['week', 'Semana'], ['day', 'Día']] as [ViewMode, string][]).map(([v, label]) => (
              <button
                key={v}
                onClick={() => { setView(v); setSel(null); }}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${view === v ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {coverage && typeof coverage.coveredPct === 'number' && (() => {
            const ok = (coverage.gapCount || 0) === 0;
            return (
              <StatusBadge tone={ok ? 'green' : 'red'} dot={false}>
                {ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                Cobertura {coverage.coveredPct}%
                {(coverage.gapCount || 0) > 0 && <span>· {coverage.gapCount} sin cubrir</span>}
              </StatusBadge>
            );
          })()}

          {refreshing && <Loader2 size={14} className="animate-spin text-muted-foreground" />}

          <div className="flex-1" />

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPanelOpen(v => !v)}
            className="gap-1.5"
            title={panelOpen ? 'Ocultar panel lateral' : 'Mostrar panel (vigilantes, IA, personal)'}
          >
            {panelOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
            <span className="hidden md:inline">Panel</span>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-primary" size={32} />
          </div>
        ) : stations.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg">No hay estaciones configuradas</p>
            <p className="text-sm mt-2">Crea una estación desde la sección de Puestos para comenzar.</p>
          </div>
        ) : (
          <>
            {/* ─── Onboarding CTA: stations exist but unconfigured ─── */}
            {(positions.length === 0 || assignments.length === 0) && (
              <div className="mb-2 bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30 rounded-xl px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-start gap-3 flex-1">
                  <Sparkles size={18} className="text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <span className="font-bold text-foreground">Tus estaciones aún no tienen horario. </span>
                    Genera la asignación automática para crear los puestos, asignar vigilantes por cercanía y escalonar los turnos (sacafrancos incluidos).
                  </p>
                </div>
                <button
                  onClick={runAutoAssign}
                  disabled={autoAssigning}
                  className="shrink-0 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all shadow-sm flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  {autoAssigning ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                  {autoAssigning ? 'Asignando...' : 'Generar asignación automática'}
                </button>
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
                className="flex-1 min-w-0 overflow-auto outline-none select-none bg-card border border-border/40 rounded-xl shadow-sm"
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
                        <div className="absolute inset-y-0 left-0 w-[2.5px] rounded-full bg-primary/80 shadow-[0_0_6px_rgba(200,134,10,0.45)]" />
                        <div className="absolute inset-y-0 right-0 w-[2.5px] rounded-full bg-primary/35" />
                      </div>
                    );
                  })()}
                  {/* Header row (frozen) */}
                  <div className="grid sticky top-0 z-30 border-b border-border/30" style={{ gridTemplateColumns: gridCols }}>
                    <div className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-r border-border/20 sticky left-0 z-40 bg-card">
                      Estación / Puesto
                    </div>
                    {monthDays.map((day, i) => {
                      const isToday = fmtDate(day) === todayStr;
                      const isSunday = day.getDay() === 0;
                      return (
                        <div key={i} className="relative px-0.5 py-1.5 text-center border-r border-border/20 last:border-r-0 bg-card">
                          {/* Tint as an overlay: the cell itself stays OPAQUE so grid
                              content never shows through the frozen header. */}
                          {(isToday || isSunday) && (
                            <div className={`absolute inset-0 pointer-events-none ${isToday ? 'bg-primary/10' : 'bg-red-500/5'}`} />
                          )}
                          <div className="relative text-[9px] font-medium text-muted-foreground uppercase">{DAYS_ES[day.getDay()]}</div>
                          <div className={`relative text-xs font-semibold mt-0.5 ${isToday ? 'text-primary' : 'text-foreground'}`}>
                            {day.getDate()}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Station rows */}
                  {stations.map(station => {
                    const stationPositions = getPositionsForStation(station.id);
                    const hasPositions = stationPositions.length > 0;
                    const stationAlert = stationAlertByStationId.get(station.id);

                    return (
                      <div key={station.id} className="border-b border-border/20 last:border-b-0">
                        {/* Station header */}
                        <div className="grid bg-muted/10" style={{ gridTemplateColumns: gridCols }}>
                          <div className="px-4 py-2 flex items-center gap-2 border-r border-border/20 sticky left-0 z-20 bg-card">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {/* Nominativo: several puestos share a name, so
                                    the name alone identifies nothing. */}
                                {station.nickname && (
                                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
                                    {station.nickname}
                                  </span>
                                )}
                                <div className="text-sm font-semibold text-foreground truncate">{station.stationName}</div>
                              </div>
                              <button
                                onClick={() => configureStation(station)}
                                className="text-[11px] text-muted-foreground hover:text-primary transition-colors"
                                title="Cambiar tipo de horario / rotación"
                              >
                                {station.scheduleType ? station.scheduleType.replace('-', ' ').toUpperCase() : 'Sin configurar'}
                              </button>
                              {stationAlert && (
                                <div className="mt-1 flex items-center gap-1 flex-wrap">
                                  {stationAlert.missingFijoCount > 0 && (
                                    <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-red-600 font-medium">
                                      <AlertTriangle size={9} />
                                      {stationAlert.missingFijoCount} fijo(s) faltan
                                    </span>
                                  )}
                                  {stationAlert.sfUncoveredDays > 0 && (
                                    <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-700 font-medium">
                                      <AlertTriangle size={9} />
                                      {stationAlert.sfUncoveredDays} L sin SF
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            {!hasPositions && (
                              <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => configureStation(station)}>
                                Configurar
                              </Button>
                            )}
                            {hasPositions && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => configureStation(station)}
                                  className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                                  title="Reconfigurar estación (tipo de horario y rotación)"
                                >
                                  <Clock size={14} />
                                </button>
                                <button
                                  onClick={() => addPosition(station.id)}
                                  className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                                  title="Agregar posición sacafranco"
                                >
                                  <Plus size={14} />
                                </button>
                              </div>
                            )}
                          </div>
                          {monthDays.map((_, i) => (
                            <div key={i} className="border-r border-border/10 last:border-r-0" />
                          ))}
                        </div>

                        {/* Position rows */}
                        {stationPositions.map(pos => {
                          const posAssignments = getAssignmentsForPosition(pos.id);
                          const colors = POSITION_COLORS[pos.type] || POSITION_COLORS.fijo;
                          const Icon = colors.icon;

                          return (
                            <div key={pos.id} className="grid border-t border-border/10" style={{ gridTemplateColumns: gridCols }}>
                              {/* Position label */}
                              <div
                                className="px-4 py-2 flex items-center gap-2 border-r border-border/20 sticky left-0 z-20 bg-card"
                                onDragOver={e => e.preventDefault()}
                                onDrop={e => handleDrop(e, station.id, pos.id)}
                              >
                                <div className={`w-6 h-6 rounded flex items-center justify-center ${colors.bg}`}>
                                  <Icon size={12} className={colors.text} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-medium text-foreground truncate">{pos.name}</div>
                                  <div className="text-[10px] text-muted-foreground">
                                    {(() => {
                                      // Real hours come from the POSITION (custom blocks carry
                                      // their own window; start==end wraps the full day).
                                      // A 24h STATION is covered by two fijos doing 12h each,
                                      // swapping day/night — label the fijo, not the station.
                                      if (station.scheduleType === '24h') return 'Turnos de 12h · D/N rotativo';
                                      const st5 = (pos.startTime || '').slice(0, 5);
                                      const en5 = (pos.endTime || '').slice(0, 5);
                                      if (st5 && en5) return st5 === en5 ? `${st5} → ${en5} · 24h` : `${st5} – ${en5}`;
                                      return station.scheduleType === '12h-night' ? '19:00 – 07:00' : '07:00 – 19:00';
                                    })()}
                                  </div>
                                </div>
                                {/* Assigned guard names — draggable to MOVE to another puesto */}
                                {posAssignments.length > 0 && (
                                  <div className="flex flex-col gap-0.5">
                                    {posAssignments.map(a => {
                                      const name = a.guard ? `${a.guard.firstName || ''} ${a.guard.lastName || ''}`.trim().split(' ')[0] : '?';
                                      const color = guardColorMap[a.guardId] || '#666';
                                      return (
                                        <button
                                          key={a.id}
                                          draggable
                                          onDragStart={e => onGuardDragStart(e, a.guardId, a)}
                                          onClick={() => removeAssignment(a.id)}
                                          className="text-[9px] font-medium px-1.5 py-0.5 rounded cursor-grab active:cursor-grabbing"
                                          style={{ backgroundColor: `${color}20`, color }}
                                          title={`${a.guard?.firstName} ${a.guard?.lastName} — Arrastra para mover · Clic para remover`}
                                        >
                                          {name} ×
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                                {posAssignments.length === 0 && (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => openAssignForm(station.id, pos.id)}
                                      className="p-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                                      title="Asignar vigilante"
                                    >
                                      <Plus size={12} />
                                    </button>
                                    <button
                                      onClick={() => deletePosition(station.id, pos.id)}
                                      className="p-1 rounded-md hover:bg-red-500/10 text-muted-foreground/50 hover:text-red-500 transition-colors"
                                      title="Eliminar posición"
                                    >
                                      <X size={11} />
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Day cells */}
                              {monthDays.map((day, dayIdx) => renderFijoCell(station, pos, posAssignments, day, dayIdx))}
                            </div>
                          );
                        })}

                        {/* No positions configured */}
                        {!hasPositions && (
                          <div className="grid border-t border-border/10" style={{ gridTemplateColumns: gridCols }}>
                            <div className="col-span-full px-4 py-4 text-center">
                              <p className="text-xs text-muted-foreground mb-2">Esta estación no tiene posiciones configuradas</p>
                              <Button size="sm" variant="outline" className="text-xs" onClick={() => configureStation(station)}>
                                Configurar posiciones
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* ─── Sacafrancos Section ─── */}
                  {(() => {
                    const sfPositions = positions.filter(p => p.type === 'sacafranco');
                    if (sfPositions.length === 0) return null;
                    return (
                      // When EXPANDED, pin the sacafranco section to the bottom of
                      // the scroll viewport (sticky bottom-0) so the fijo stations
                      // scroll BEHIND it — you can reach a puesto high up the grid
                      // and still drag/assign an SF from here without it scrolling away.
                      <div className={`border-t-2 border-emerald-500/30${sfSectionOpen ? ' sticky bottom-0 z-30 bg-card shadow-[0_-8px_20px_-6px_rgba(0,0,0,0.30)]' : ''}`}>
                        {/* SF Header - clickable to expand/collapse */}
                        <div className="grid cursor-pointer bg-card" style={{ gridTemplateColumns: gridCols }} onClick={() => setSfSectionOpen(!sfSectionOpen)}>
                          <div className="px-4 py-2.5 flex items-center gap-2 border-r border-border/20 sticky left-0 z-20 bg-card">
                            <Shield size={14} className="text-emerald-500" />
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-emerald-600">Sacafrancos</div>
                              <div className="text-[10px] text-muted-foreground">{sfPositions.length} posiciones {sfSectionOpen ? '▾' : '▸ (clic para expandir)'}</div>
                            </div>
                          </div>
                          {monthDays.map((_, i) => <div key={i} className="border-r border-border/10 last:border-r-0 bg-emerald-500/5" />)}
                        </div>

                        {/* SF Position rows — only if expanded */}
                        {sfSectionOpen && sfPositions.map(pos => {
                          const posAssignments = getAssignmentsForPosition(pos.id);
                          const assigned = posAssignments.length > 0;
                          return (
                            <div key={pos.id} className="grid border-t border-border/10" style={{ gridTemplateColumns: gridCols }}>
                              {/* SF label */}
                              <div
                                className="px-4 py-2 flex items-center gap-2 border-r border-border/20 sticky left-0 z-20 bg-card"
                                onDragOver={e => e.preventDefault()}
                                onDrop={e => handleDrop(e, pos.stationId, pos.id)}
                              >
                                <div className="w-6 h-6 rounded flex items-center justify-center bg-emerald-500/10">
                                  <Shield size={12} className="text-emerald-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-medium text-foreground truncate">{pos.name}</div>
                                  <div className="text-[10px] text-muted-foreground">{pos.startTime} – {pos.endTime}</div>
                                </div>
                                {assigned && posAssignments[0]?.guard && (
                                  <button
                                    draggable
                                    onDragStart={e => onGuardDragStart(e, posAssignments[0].guardId, posAssignments[0])}
                                    onClick={() => removeAssignment(posAssignments[0].id)}
                                    className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 cursor-grab active:cursor-grabbing"
                                    title="Arrastra para mover · Clic para remover"
                                  >
                                    {posAssignments[0].guard.firstName?.split(' ')[0]} ×
                                  </button>
                                )}
                                {!assigned && (
                                  <button
                                    onClick={() => openAssignForm(pos.stationId, pos.id)}
                                    className="p-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 transition-colors"
                                    title="Asignar vigilante sacafranco"
                                  >
                                    <Plus size={12} />
                                  </button>
                                )}
                              </div>

                              {/* Day cells — REAL shifts only: all L until coverage is
                                  placed (drag the SF's L onto a puesto's L) or the
                                  optimizer generates it. */}
                              {monthDays.map((day, dayIdx) => {
                                const dateStr = fmtDate(day);
                                const isToday = dateStr === todayStr;
                                const isSunday = day.getDay() === 0;
                                const cellBase = `border-r border-border/10 last:border-r-0 px-0.5 py-0.5 min-h-[36px] flex ${isToday ? 'bg-primary/3' : ''} ${isSunday ? 'bg-red-500/3' : ''}${cellSelCls(pos.id, dayIdx)}`;
                                const cellProps = {
                                  id: `hc-${pos.id}-${dayIdx}`,
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
                                  const s = OVERRIDE_STYLES[override.type] || { bg: 'bg-muted/30', text: 'text-foreground' };
                                  const gName = sfGuard.guard ? `${sfGuard.guard.firstName || ''} ${sfGuard.guard.lastName || ''}`.trim() : '?';
                                  return (
                                    <div key={dayIdx} {...cellProps} className={cellBase}>
                                      <div
                                        className={`flex-1 rounded flex items-center justify-center cursor-pointer ${s.bg}`}
                                        title={`${gName} — ${override.type}${override.note ? ': ' + override.note : ''} (doble clic para editar)`}
                                        onDoubleClick={() => setOverrideTarget({ guardId: sfGuard.guardId, guardName: gName, date: dateStr, assignmentId: sfGuard.id })}
                                      >
                                        <span className={`text-[10px] font-bold ${s.text}`}>{override.type}</span>
                                      </div>
                                    </div>
                                  );
                                }

                                const openSfDetail = () => {
                                  if (!sfGuard) { openAssignForm(pos.stationId, pos.id, dateStr); return; }
                                  const gName = sfGuard.guard ? `${sfGuard.guard.firstName || ''} ${sfGuard.guard.lastName || ''}`.trim() : '?';
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
                                        className={`flex-1 rounded flex items-center justify-center ${assigned ? 'bg-muted/30 cursor-grab active:cursor-grabbing hover:bg-emerald-500/10' : 'bg-muted/20 border border-dashed border-border/30 cursor-pointer'}`}
                                        title={assigned ? 'Libre — arrastra este día sobre un L de un puesto para cubrirlo' : 'Sin vigilante — doble clic para asignar sacafranco'}
                                        onDoubleClick={openSfDetail}
                                      >
                                        <span className="text-[10px] font-bold text-muted-foreground/50">L</span>
                                      </div>
                                    </div>
                                  );
                                }

                                // Real coverage that day → D/N by the shift's start hour.
                                const startMin = dateToWall(new Date(covShift.startTime), tzName).minutes;
                                const isNightCov = startMin >= 18 * 60 || startMin < 6 * 60;
                                const code = isNightCov ? 'N' : 'D';
                                const covStName = stationsById.get(covShift.stationId)?.stationName || '';
                                const bg = isNightCov ? 'bg-indigo-500/15' : 'bg-emerald-500/15';
                                const textColor = isNightCov ? 'text-indigo-400' : 'text-emerald-500';
                                return (
                                  <div key={dayIdx} {...cellProps} className={cellBase}>
                                    <div
                                      className={`flex-1 rounded flex flex-col items-center justify-center cursor-pointer ${bg}`}
                                      title={`Cubre: ${covStName} — doble clic para quitar la cobertura`}
                                      onDoubleClick={() => removeSfCoverage(covShift)}
                                    >
                                      <span className={`text-[10px] font-bold ${textColor}`}>{code}</span>
                                      {covStName && <span className="text-[7px] text-muted-foreground leading-none">{covStName.slice(0, 3)}</span>}
                                    </div>
                                  </div>
                                );
                              })}
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
              {panelOpen && (
                <aside className="w-[280px] shrink-0 overflow-y-auto space-y-3 pr-0.5">
                  {/* Vigilantes disponibles — drag them onto the sheet */}
                  <div className="bg-card border border-border/40 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Users size={14} className="text-muted-foreground" />
                      <h3 className="text-xs font-semibold text-foreground">Vigilantes disponibles</h3>
                      <span className="text-[10px] text-muted-foreground">({unassignedGuards.length})</span>
                    </div>
                    {unassignedGuards.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">Todos los vigilantes están asignados.</p>
                    ) : (
                      <>
                        <p className="text-[10px] text-muted-foreground mb-2">Arrastra un vigilante a un puesto del horario.</p>
                        <div className="flex flex-wrap gap-1.5 max-h-[180px] overflow-y-auto">
                          {unassignedGuards.map(g => (
                            <div
                              key={g.id}
                              className="px-2.5 py-1 rounded-lg bg-muted/30 border border-border/30 text-[11px] font-medium text-foreground cursor-grab hover:border-primary/40 hover:bg-primary/5 transition-all active:cursor-grabbing"
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
                  <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles size={14} className="text-primary" />
                      <h3 className="text-xs font-bold text-foreground">Herramientas</h3>
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
                      className="w-full mt-2 px-3 py-2 bg-purple-600 text-white rounded-xl text-xs font-semibold hover:bg-purple-700 disabled:opacity-50 transition-all shadow-sm flex items-center justify-center gap-2"
                    >
                      {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      {aiLoading ? 'Analizando...' : 'Recomendación IA'}
                    </button>
                    {aiRecommendation && (
                      <div className="mt-2 p-3 bg-purple-500/5 border border-purple-500/20 rounded-lg max-h-[240px] overflow-y-auto">
                        <div className="text-[10px] font-semibold text-purple-600 mb-1"><Bot className="inline h-3 w-3 mr-1" />Recomendación IA:</div>
                        <div className="text-[10px] text-foreground/80 whitespace-pre-wrap leading-relaxed">{aiRecommendation}</div>
                      </div>
                    )}
                  </div>

                  {/* Personal necesario */}
                  <div className="bg-card border border-border/40 rounded-xl p-3 space-y-2">
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Personal Necesario</h3>
                    {staffing ? (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-amber-500/10 rounded-lg p-2 text-center">
                            <div className="text-lg font-bold text-amber-600">{staffing.fijosNeeded || 0}</div>
                            <div className="text-[9px] text-muted-foreground">Fijos</div>
                          </div>
                          <div className="bg-emerald-500/10 rounded-lg p-2 text-center">
                            <div className="text-lg font-bold text-emerald-500">{staffing.sacafrancosNeeded || 0}</div>
                            <div className="text-[9px] text-muted-foreground">Sacafrancos</div>
                          </div>
                          <div className="bg-sky-500/10 rounded-lg p-2 text-center">
                            <div className="text-lg font-bold text-sky-500">{staffing.totalGuardsNeeded || 0}</div>
                            <div className="text-[9px] text-muted-foreground">Total</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div className="bg-muted/20 rounded-lg p-2 text-center">
                            <div className="text-sm font-bold text-foreground">{staffing.currentFijoGuards || 0}<span className="text-muted-foreground font-normal">/{staffing.fijosNeeded || 0}</span></div>
                            <div className="text-[9px] text-muted-foreground">Fijos asignados</div>
                          </div>
                          <div className="bg-muted/20 rounded-lg p-2 text-center">
                            <div className="text-sm font-bold text-foreground">{staffing.currentSfGuards || 0}<span className="text-muted-foreground font-normal">/{staffing.sacafrancosNeeded || 0}</span></div>
                            <div className="text-[9px] text-muted-foreground">SF asignados</div>
                          </div>
                        </div>
                        {/* Hiring recommendation */}
                        {(((staffing.fijosNeeded || 0) - (staffing.currentFijoGuards || 0)) > 0 || ((staffing.sacafrancosNeeded || 0) - (staffing.currentSfGuards || 0)) > 0) && (
                          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-2 space-y-1">
                            <div className="text-[10px] font-semibold text-red-600"><AlertTriangle className="inline h-3 w-3 mr-1" />Contratar:</div>
                            {((staffing.fijosNeeded || 0) - (staffing.currentFijoGuards || 0)) > 0 && (
                              <div className="text-[10px] text-red-500">{(staffing.fijosNeeded || 0) - (staffing.currentFijoGuards || 0)} fijos más</div>
                            )}
                            {((staffing.sacafrancosNeeded || 0) - (staffing.currentSfGuards || 0)) > 0 && (
                              <div className="text-[10px] text-red-500">{(staffing.sacafrancosNeeded || 0) - (staffing.currentSfGuards || 0)} sacafrancos más</div>
                            )}
                          </div>
                        )}
                        {staffing.sfRotation && (
                          <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/20">
                            Rotación SF: <span className="font-semibold text-foreground">{staffing.sfRotation.name}</span> ({staffing.sfRotation.dayShifts}D-{staffing.sfRotation.nightShifts}N-{staffing.sfRotation.restDays}L)
                          </div>
                        )}
                        <div className="text-[10px] text-muted-foreground">
                          Demanda pico: <span className="font-semibold text-foreground">{staffing.peakDemand}</span> estaciones simultáneas
                        </div>

                        {stationAlerts.length > 0 && (
                          <div className="pt-2 border-t border-border/20 space-y-1.5">
                            <div className="flex items-center gap-1 text-[10px] font-semibold text-red-600">
                              <AlertTriangle size={11} />
                              Alertas por estación ({stationAlerts.length})
                            </div>
                            <div className="max-h-[160px] overflow-y-auto space-y-1 pr-1">
                              {stationAlerts.map(alert => (
                                <div key={alert.stationId} className="text-[10px] bg-red-500/5 border border-red-500/20 rounded px-2 py-1">
                                  <div className="font-medium text-foreground truncate">{stationLabel(alert)}</div>
                                  {alert.missingFijoCount > 0 && (
                                    <div className="text-red-500">• {alert.missingFijoCount} fijo(s) sin vigilante</div>
                                  )}
                                  {alert.sfUncoveredDays > 0 && (
                                    <div className="text-red-500">• {alert.sfUncoveredDays} día(s) L sin SF cubriendo</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-muted/20 rounded-lg p-2 text-center">
                          <div className="text-lg font-bold text-foreground">{stations.length}</div>
                          <div className="text-[9px] text-muted-foreground">Estaciones</div>
                        </div>
                        <div className="bg-muted/20 rounded-lg p-2 text-center">
                          <div className="text-lg font-bold text-foreground">{assignments.length}</div>
                          <div className="text-[9px] text-muted-foreground">Asignados</div>
                        </div>
                      </div>
                    )}
                    {/* Coverage */}
                    {(() => {
                      const fijoPositions = positions.filter(p => p.type !== 'sacafranco');
                      const covered = fijoPositions.filter(p => assignments.some(a => a.positionId === p.id)).length;
                      const pct = fijoPositions.length > 0 ? Math.round((covered / fijoPositions.length) * 100) : 0;
                      return (
                        <div className="pt-2 border-t border-border/20">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-muted-foreground">Cobertura Fijos</span>
                            <span className="text-[10px] font-semibold text-foreground">{pct}%</span>
                          </div>
                          <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="text-[9px] text-muted-foreground mt-1">{covered}/{fijoPositions.length} posiciones cubiertas</div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Sacafrancos summary */}
                  {sacafrancoData.length > 0 && (
                    <div className="bg-card border border-emerald-500/20 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Shield size={12} className="text-emerald-500" />
                        <h3 className="text-[11px] font-semibold text-foreground">Sacafrancos ({sacafrancoData.length})</h3>
                      </div>
                      <div className="space-y-1.5">
                        {sacafrancoData.map(sf => {
                          const name = sf.guard ? `${sf.guard.firstName || ''} ${sf.guard.lastName || ''}`.trim() : '?';
                          const availDays = sf.availability.filter(a => a.status === 'available').length;
                          const coverDays = sf.availability.filter(a => a.status === 'covering').length;
                          const stationsCovering = [...new Set(sf.assignments.map(a => stationsById.get(a.stationId)?.stationName).filter(Boolean))];
                          return (
                            <div key={sf.guard?.id || name} className="py-1.5 px-2 rounded bg-muted/20 space-y-0.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] text-foreground font-medium truncate">{name}</span>
                                <span className="flex items-center gap-1 shrink-0">
                                  <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-emerald-500/10 text-emerald-500">{availDays} disp</span>
                                  <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-amber-500/10 text-amber-600">{coverDays} cubre</span>
                                </span>
                              </div>
                              {stationsCovering.length > 0 && (
                                <div className="text-[9px] text-muted-foreground truncate">Cubre: {stationsCovering.join(', ')}</div>
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
            <div className="flex items-center gap-3 flex-wrap pt-1.5 text-[10px] text-muted-foreground">
              {view === 'month' ? (
                <>
                  <span className="font-medium text-foreground/70">{selInfo || 'Clic en una celda para seleccionar'}</span>
                  <span className="hidden md:inline"><b>Clic derecho</b>: editar/duplicar/eliminar turno y novedades · Escribe <b>D N L V F P 2</b> para novedad · <b>Supr</b> borra · Arrastra un día <b>L del sacafranco</b> sobre un L del puesto para cubrirlo · <b>Re/Av Pág</b> cambia mes</span>
                </>
              ) : (
                <span className="font-medium text-foreground/70">
                  Arrastra sobre la fila de una estación para <b>dibujar un bloque de trabajo</b> (p. ej. 07:00 → 07:00 del día siguiente) · Clic en un bloque: detalle / eliminar · Suelta un vigilante del panel sobre la línea · <b>Re/Av Pág</b> cambia {view === 'week' ? 'de semana' : 'de día'}
                </span>
              )}
              <span className="flex-1" />
              {view === 'month' && <span className="hidden lg:flex items-center gap-1.5">
                {[
                  { c: 'D', cls: 'bg-sky-500/15 text-sky-500' },
                  { c: 'N', cls: 'bg-indigo-500/15 text-indigo-400' },
                  { c: 'L', cls: 'bg-muted/40 text-muted-foreground' },
                  { c: 'V', cls: 'bg-purple-500/15 text-purple-400' },
                  { c: 'PM', cls: 'bg-orange-500/15 text-orange-400' },
                  { c: 'F', cls: 'bg-red-500/15 text-red-400' },
                  { c: '24', cls: 'bg-amber-500/15 text-amber-500' },
                ].map(x => (
                  <span key={x.c} className={`px-1.5 py-0.5 rounded font-bold ${x.cls}`}>{x.c}</span>
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

      {/* ─── SF coverage modal (drop an SF día on a puesto → shape the turno) ── */}
      {sfCover && (() => {
        const toMin = (x: string) => { const [h, mm] = x.split(':').map(n => parseInt(n, 10) || 0); return (h % 24) * 60 + (mm % 60); };
        const sMin = toMin(sfCover.startStr);
        const eMinRaw = toMin(sfCover.endStr);
        const nextDay = eMinRaw <= sMin;
        const durH = ((nextDay ? eMinRaw + 1440 : eMinRaw) - sMin) / 60;
        const quick = (start: string, end: string) => setSfCover(m => m ? { ...m, startStr: start, endStr: end } : m);
        const fechaHuman = new Date(sfCover.dateStr + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSfCover(null)}>
            <div className="bg-card border border-border/30 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-border/20 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Cubrir con sacafranco</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {sfCover.sfName} → {stationLabel(sfCover.station)} · {fechaHuman}
                  </p>
                </div>
                <button onClick={() => setSfCover(null)} className="p-1.5 rounded-lg hover:bg-muted/30 text-muted-foreground"><X size={15} /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
                  <p className="text-[11px] text-emerald-600">
                    Sugerido según lo que falta ese día: <b>{sfCover.suggested}</b>
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
                        className={`px-2 py-2 rounded-xl border text-center transition-all ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border/40 text-foreground hover:border-primary/40'}`}
                      >
                        <div className="text-xs font-semibold">{q.label}</div>
                        <div className="text-[10px] text-muted-foreground">{q.sub}</div>
                      </button>
                    );
                  })}
                </div>
                {/* Custom hours */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Inicio</label>
                    <input type="time" value={sfCover.startStr} onChange={e => setSfCover(m => m ? { ...m, startStr: e.target.value } : m)} className="w-full px-3 py-2.5 border border-border/40 rounded-xl text-sm bg-background font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Fin</label>
                    <input type="time" value={sfCover.endStr} onChange={e => setSfCover(m => m ? { ...m, endStr: e.target.value } : m)} className="w-full px-3 py-2.5 border border-border/40 rounded-xl text-sm bg-background font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <Clock size={12} />
                  Duración: <b className="text-foreground">{durH % 1 === 0 ? durH : durH.toFixed(1)}h</b>
                  {nextDay && <span>· termina al día siguiente</span>}
                  <span>· hora de la empresa</span>
                </p>
              </div>
              <div className="px-5 py-3 border-t border-border/20 flex items-center justify-end gap-2">
                <button onClick={() => setSfCover(null)} className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-all">Cancelar</button>
                <button
                  onClick={saveSfCover}
                  disabled={sfCoverSaving || durH <= 0 || durH > 24}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 transition-all shadow-sm"
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
        const fecha = new Date(dateStr + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        const rows = sacafrancoData.map(sf => {
          const gid = sf.assignments[0]?.guardId;
          const av = sf.availability.find(a => fmtDate(a.date) === dateStr);
          const name = sf.guard
            ? `${sf.guard.firstName || ''} ${sf.guard.lastName || ''}`.trim()
            : (guardsPool.find(g => g.id === gid)?.label || 'Sacafranco');
          return { gid, name: name || 'Sacafranco', busy: av?.status === 'covering', where: av?.stationName };
        }).filter(r => !!r.gid);
        const free = rows.filter(r => !r.busy);
        const busy = rows.filter(r => r.busy);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSfPick(null)}>
            <div className="bg-card border border-border/30 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-border/20 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Asignar sacafranco</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{stationLabel(station)} · {fecha}</p>
                </div>
                <button onClick={() => setSfPick(null)} className="p-1.5 rounded-lg hover:bg-muted/30 text-muted-foreground"><X size={15} /></button>
              </div>
              <div className="p-4 space-y-1.5 max-h-[50vh] overflow-y-auto">
                {rows.length === 0 && (
                  <p className="text-[12px] text-muted-foreground text-center py-4">No hay sacafrancos configurados. Crea un puesto sacafranco en la estación primero.</p>
                )}
                {free.map(r => (
                  <button
                    key={r.gid}
                    onClick={() => { setSfPick(null); void placeSfCoverage(station, pos, dateStr, r.gid!); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border/40 hover:border-emerald-500/50 hover:bg-emerald-500/5 text-left transition-all"
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 text-xs font-bold">{(r.name[0] || '?').toUpperCase()}</span>
                    <span className="flex-1 text-sm font-medium text-foreground">{r.name}</span>
                    <span className="text-[10px] font-semibold text-emerald-600">Libre</span>
                  </button>
                ))}
                {busy.map(r => (
                  <div key={r.gid} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border/20 opacity-60">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-muted/40 text-muted-foreground text-xs font-bold">{(r.name[0] || '?').toUpperCase()}</span>
                    <span className="flex-1 text-sm font-medium text-muted-foreground">{r.name}</span>
                    <span className="text-[10px] text-muted-foreground">Cubre {r.where || 'otro puesto'}</span>
                  </div>
                ))}
              </div>
              <div className="px-5 py-3 border-t border-border/20 flex items-center justify-between">
                <button
                  onClick={() => { const p = sfPick; setSfPick(null); setOverrideTarget({ guardId: p.assignment.guardId, guardName: p.guardName, date: p.dateStr, assignmentId: p.assignment.id }); }}
                  className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >Marcar novedad…</button>
                <button onClick={() => setSfPick(null)} className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/20">Cerrar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Assignment Modal ─────────────────────────────────────────────── */}
      {showAssignForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setShowAssignForm(false); setMoveFrom(null); }}>
          <div className="bg-card border border-border/30 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border/20 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">{moveFrom ? 'Mover Vigilante de Puesto' : 'Asignar Vigilante a Posición'}</h4>
              <button onClick={() => { setShowAssignForm(false); setMoveFrom(null); }} className="p-1.5 rounded-lg hover:bg-muted/30 text-muted-foreground"><X size={15} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Position info */}
              {assignTarget && (() => {
                const pos = positions.find(p => p.id === assignTarget.positionId);
                const st = stations.find(s => s.id === assignTarget.stationId);
                if (!pos || !st) return null;
                const colors = POSITION_COLORS[pos.type] || POSITION_COLORS.fijo;
                return (
                  <div className={`px-3 py-2 rounded-xl border ${colors.border} ${colors.bg}`}>
                    <div className={`text-xs font-semibold ${colors.text}`}>{stationLabel(st)} <ArrowRight className="inline h-3 w-3" /> {pos.name}</div>
                    <div className="text-[10px] text-muted-foreground">{pos.startTime} – {pos.endTime}</div>
                  </div>
                );
              })()}

              {/* Drag-move notice */}
              {moveFrom && (
                <div className="px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10">
                  <p className="text-[11px] text-amber-700">
                    Se moverá desde <span className="font-semibold">{stationsById.get(moveFrom.stationId)?.stationName || 'su puesto actual'}</span> — sus turnos futuros allí se eliminan.
                  </p>
                </div>
              )}

              {/* Guard */}
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Vigilante</label>
                {(() => {
                  // A vigilante can hold only ONE active rotation (fijo OR sacafranco).
                  // Drop everyone already assigned from the options so it's impossible
                  // to pick an occupied vigilante — except the one being MOVED here.
                  const occupiedIds = new Set(assignments.map(a => a.guardId));
                  const availableGuards = guardsPool.filter(g => !occupiedIds.has(g.id) || g.id === assignGuard);

                  return (
                    <select value={assignGuard} onChange={e => setAssignGuard(e.target.value)} className="w-full px-3 py-2.5 border border-border/40 rounded-xl text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none">
                      <option value="">Seleccionar vigilante...</option>
                      {availableGuards.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                      {availableGuards.length === 0 && <option value="" disabled>Todos los vigilantes ya están asignados</option>}
                    </select>
                  );
                })()}
                {positions.find(p => p.id === assignTarget?.positionId)?.type === 'sacafranco' && (
                  <p className="text-[10px] text-emerald-600 mt-1">Sacafranco: puede cubrir múltiples estaciones</p>
                )}
                {positions.find(p => p.id === assignTarget?.positionId)?.type === 'fijo' && (
                  <p className="text-[10px] text-amber-600 mt-1">Fijo: exclusivo a esta estación</p>
                )}
              </div>

              {/* Start date: bounds when shifts begin (and sets the phase on
                  alternation stations). Defaults to the day you dropped on. */}
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Primer día de turno</label>
                <input
                  type="date"
                  value={assignStartDate}
                  onChange={e => setAssignStartDate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-border/40 rounded-xl text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Los turnos se generan desde esta fecha (hora de la empresa).</p>
              </div>

              {/* The patrón de rotación is set on the STATION (Sitios › Estación ›
                  Horario del turno) and inherited here — not chosen per guard. */}
              {(() => {
                const st = stationsById.get(assignTarget?.stationId || '');
                const rot = st?.rotationStyleId ? rotationStylesById.get(st.rotationStyleId) : null;
                return (
                  <div className="rounded-lg border border-border/40 bg-muted/10 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">
                      Patrón de rotación: <span className="font-semibold text-foreground">{rot?.name || 'el de la estación'}</span> · se hereda de la estación.
                    </p>
                  </div>
                );
              })()}
            </div>
            <div className="px-5 py-3 border-t border-border/20 flex items-center justify-end gap-2">
              <button onClick={() => { setShowAssignForm(false); setMoveFrom(null); }} className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-all">Cancelar</button>
              <button onClick={saveAssignment} disabled={assignSaving || !assignGuard} className="px-5 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 transition-all shadow-sm">
                {assignSaving ? <Loader2 size={14} className="animate-spin" /> : (moveFrom ? 'Mover' : 'Asignar')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Configure Station Modal ─────────────────────────────────────── */}
      {configStation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfigStation(null)}>
          <div className="bg-card border border-border/30 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border/20 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">Configurar: {stationLabel(configStation)}</h4>
              <button onClick={() => setConfigStation(null)} className="p-1.5 rounded-lg hover:bg-muted/30 text-muted-foreground"><X size={15} /></button>
            </div>
            <div className="p-5 space-y-4">
              <label className="block text-[11px] font-medium text-muted-foreground mb-2 uppercase tracking-wide">Tipo de cobertura</label>
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
                    className={`p-3 rounded-xl border text-left transition-all ${configType === opt.value ? 'bg-primary/10 border-primary' : 'border-border/40 hover:border-border'}`}
                  >
                    <div className={`text-sm font-medium ${configType === opt.value ? 'text-primary' : 'text-foreground'}`}>{opt.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>

              {configType === 'custom' && (
                <div className="space-y-3">
                  {/* Quick preset: classic 24×24 alternation (no libres, no SF) */}
                  <button
                    type="button"
                    onClick={() => { setCfgStart('07:00'); setCfgEnd('07:00'); setCfgBlockHours(''); setCfgRestCoverage('alternate'); setConfigRotation(''); setCfgRotStyle(null); }}
                    className={`w-full px-3 py-2 rounded-xl border text-left transition-all ${cfgRestCoverage === 'alternate' && cfgWinMin === 1440 && !cfgBlockHours ? 'border-primary bg-primary/10' : 'border-border/40 hover:border-primary/40'}`}
                  >
                    <div className="text-xs font-semibold text-foreground">Preset 24×24 (alternancia diaria)</div>
                    <div className="text-[10px] text-muted-foreground">Un fijo trabaja las 24h, el otro va al día siguiente. Sin libres, sin sacafranco.</div>
                  </button>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Hora inicio</label>
                      <input type="time" value={cfgStart} onChange={e => setCfgStart(e.target.value)} className="w-full px-3 py-2 border border-border/40 rounded-lg text-sm bg-background font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Hora fin</label>
                      <input type="time" value={cfgEnd} onChange={e => setCfgEnd(e.target.value)} className="w-full px-3 py-2 border border-border/40 rounded-lg text-sm bg-background font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Turno por vigilante</label>
                    <select value={cfgBlockHours} onChange={e => setCfgBlockHours(e.target.value)} className="w-full px-3 py-2 border border-border/40 rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
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
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Cobertura de descansos</label>
                    <select value={cfgRestCoverage} onChange={e => setCfgRestCoverage(e.target.value as 'sacafranco' | 'alternate')} className="w-full px-3 py-2 border border-border/40 rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                      <option value="sacafranco">Sacafranco cubre los descansos</option>
                      <option value="alternate">Alternancia entre fijos (sin sacafranco)</option>
                    </select>
                    {cfgRestCoverage === 'alternate' && (
                      <p className={`mt-1.5 text-[11px] ${cfgAlternateOk ? 'text-muted-foreground' : 'text-red-500'}`}>
                        {!cfgRotStyle
                          ? 'Sin patrón elegido se usa 1-1: cada fijo trabaja su bloque completo y alterna con el siguiente, sin libres.'
                          : cfgAlternateOk
                            ? `Patrón ${cfgRotWork}-${cfgRotCycle - cfgRotWork}: ${cfgGuardsPerBlock} fijos alternando por bloque, sin sacafranco. Total ${cfgBlockCount * cfgGuardsPerBlock} fijos.`
                            : `El ciclo (${cfgRotCycle}) debe ser múltiplo de los días de trabajo (${cfgRotWork}). Usa 1-1, 2-2, 3-3…`}
                      </p>
                    )}
                    {cfgRestCoverage === 'sacafranco' && cfgBlocksOk && cfgBlockCount > 1 && (
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
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
            <div className="px-5 py-3 border-t border-border/20 flex items-center justify-end gap-2">
              <button onClick={() => setConfigStation(null)} className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground">Cancelar</button>
              <button onClick={saveStationConfig} disabled={configSaving} className="px-5 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 transition-all shadow-sm">
                {configSaving ? <Loader2 size={14} className="animate-spin" /> : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Override Modal ───────────────────────────────────────────────── */}
      {overrideTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setOverrideTarget(null)}>
          <div className="bg-card border border-border/30 rounded-2xl shadow-2xl w-full max-w-xs mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border/20">
              <h4 className="text-sm font-semibold text-foreground">Registrar Novedad</h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">{overrideTarget.guardName} — {overrideTarget.date}</p>
            </div>
            <div className="p-4 grid grid-cols-2 gap-2">
              {[
                { type: 'V', label: 'Vacaciones', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
                { type: 'PM', label: 'Permiso', color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
                { type: 'F', label: 'Falta', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
                { type: 'L', label: 'Libre', color: 'bg-muted/40 text-muted-foreground border-border/40' },
                { type: 'D', label: 'Diurno', color: 'bg-sky-500/15 text-sky-500 border-sky-500/30' },
                { type: 'N', label: 'Nocturno', color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30' },
                { type: '24', label: '24 Horas', color: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
              ].map(opt => (
                <button
                  key={opt.type}
                  onClick={() => performOverrideSave(overrideTarget, opt.type)}
                  className={`px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all hover:scale-105 ${opt.color}`}
                >
                  {opt.type} — {opt.label}
                </button>
              ))}
              {(() => {
                const existing = getOverride(overrideTarget.guardId, overrideTarget.date);
                if (!existing) return null;
                return (
                  <button
                    onClick={() => removeOverride(existing.id)}
                    className="col-span-2 px-3 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-all"
                  >
                    <X className="inline h-3.5 w-3.5 mr-1" />Quitar novedad actual ({existing.type})
                  </button>
                );
              })()}
            </div>
            <div className="px-5 py-3 border-t border-border/20 flex justify-end">
              <button onClick={() => setOverrideTarget(null)} className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground transition-all">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Draft horario review/diff Modal ──────────────────────────────── */}
      {proposalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-card shadow-2xl border border-border/30 overflow-hidden">
            <div className="px-5 py-4 border-b border-border/20">
              <div className="flex items-center gap-2">
                {planData ? <CheckCircle2 size={18} className="text-emerald-600" /> : <FileText size={18} className="text-primary" />}
                <h3 className="text-base font-bold text-foreground">{planData ? 'Plan de implementación' : 'Borrador de horario'}</h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {planData ? 'Horario publicado. Estos vigilantes fueron notificados de sus cambios.' : 'Revisa los cambios propuestos. Nada se aplica hasta que publiques.'}
              </p>
            </div>

            {planData ? (
              /* Implementation plan (post-publish): who was notified */
              <div className="flex-1 overflow-auto px-5 py-3">
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-emerald-700">
                  <Users size={16} />
                  <span className="text-sm font-semibold">
                    {(planData?.plan?.notifiedGuards ?? 0)} de {(planData?.plan?.totalGuards ?? planData?.items?.length ?? 0)} vigilantes notificados
                  </span>
                </div>
                {(planData?.items || []).length ? (
                  <div className="divide-y divide-border/20">
                    {(planData.items || []).map((it: PlanItem) => {
                      const ch: string[] = [];
                      if (it.added) ch.push(`+${it.added}`);
                      if (it.changed) ch.push(`~${it.changed}`);
                      if (it.removed) ch.push(`-${it.removed}`);
                      const ok = it.notifyStatus === 'sent';
                      return (
                        <div key={it.id || it.guardId} className="flex items-center gap-3 py-2">
                          <span className={`shrink-0 ${ok ? 'text-emerald-600' : 'text-muted-foreground'}`}>{ok ? <CheckCircle2 size={15} /> : <Clock size={15} />}</span>
                          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{it.guardName || 'Vigilante'}</span>
                          <span className="shrink-0 font-mono text-xs text-muted-foreground">{ch.join(' ')}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">No hubo vigilantes afectados.</p>
                )}
              </div>
            ) : (
            <>
            {/* Summary counters */}
            {(() => {
              const s = proposalData?.proposal?.summary || {};
              const cards = [
                { label: 'Nuevos', value: s.added || 0, icon: <PlusIcon size={14} />, cls: 'text-emerald-600' },
                { label: 'Eliminados', value: s.removed || 0, icon: <MinusCircle size={14} />, cls: 'text-red-600' },
                { label: 'Modificados', value: s.changed || 0, icon: <RefreshCw size={14} />, cls: 'text-amber-600' },
                { label: 'Vigilantes afectados', value: s.guardsAffected || 0, icon: <Users size={14} />, cls: 'text-foreground' },
              ];
              return (
                <div className="grid grid-cols-4 gap-2 px-5 py-3 border-b border-border/20">
                  {cards.map((c) => (
                    <div key={c.label} className="rounded-xl border border-border/30 p-2 text-center">
                      <div className={`flex items-center justify-center gap-1 ${c.cls}`}>{c.icon}<span className="text-lg font-bold tabular-nums">{c.value}</span></div>
                      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{c.label}</div>
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
                <div className="flex items-center justify-between px-5 py-2.5 border-b border-border/20">
                  <div className="flex items-center gap-2">
                    {ok ? <CheckCircle2 size={15} className="text-emerald-600" /> : <AlertTriangle size={15} className="text-red-600" />}
                    <span className="text-[11px] text-muted-foreground">Cobertura de puestos <span className="text-muted-foreground/70">(14 días)</span></span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className={`font-bold tabular-nums ${ok ? 'text-emerald-600' : 'text-red-600'}`}>{cov.coveredPct}%</span>
                    {(cov.gapCount || 0) > 0 && <span className="font-semibold text-red-600">{cov.gapCount} sin cubrir</span>}
                    {(cov.overstaffCount || 0) > 0 && <span className="text-amber-600">{cov.overstaffCount} sobre-cubierto</span>}
                  </div>
                </div>
              );
            })()}

            {/* Rest-rule + sacafranco warnings (reqs 3 & 9) */}
            {(() => {
              const w = proposalData?.proposal?.summary?.warnings;
              if (!w || (!w.total && !w.restViolations?.length && !w.doubleBookings?.length && !w.sfStyleInconsistencies?.length)) return null;
              const lines: string[] = [];
              if (w.doubleBookings?.length) lines.push(`${w.doubleBookings.length} vigilante(s) con doble asignación el mismo día`);
              if (w.restViolations?.length) lines.push(`${w.restViolations.length} vigilante(s) sin descanso semanal (más de ${w.maxConsecutiveAllowed || 7} días seguidos)`);
              if (w.sfStyleInconsistencies?.length) lines.push(`${w.sfStyleInconsistencies.length} sitio(s) con sacafrancos en estilos de turno distintos`);
              if (!lines.length) return null;
              return (
                <div className="px-5 py-2.5 border-b border-border/20">
                  <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-amber-700">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                    <div className="text-[11px] leading-relaxed">
                      <p className="font-semibold">Revisa antes de publicar:</p>
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
                      <CheckCircle2 size={28} className="text-emerald-600 mb-2" />
                      <p className="text-sm font-medium text-foreground">El horario ya está al día</p>
                      <p className="text-xs text-muted-foreground">No hay cambios que aplicar.</p>
                    </div>
                  );
                }
                const fmt = (d: string) => {
                  try { return new Date(d).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return d; }
                };
                const badge: Record<string, string> = {
                  add: 'bg-emerald-500/10 text-emerald-600',
                  remove: 'bg-red-500/10 text-red-600',
                  change: 'bg-amber-500/10 text-amber-600',
                };
                const label: Record<string, string> = { add: 'Nuevo', remove: 'Eliminar', change: 'Cambio' };
                return (
                  <div className="divide-y divide-border/20">
                    {changes.slice(0, 300).map((c: ProposalChange) => (
                      <div key={c.id} className="flex items-center gap-3 py-2">
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${badge[c.action || ''] || 'bg-muted text-foreground'}`}>{label[c.action || ''] || c.action}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-foreground">{fmt(c.startTime || '')} {c.meta?.shiftType ? `· ${c.meta.shiftType === 'night' ? 'Nocturno' : c.meta.shiftType === 'day' ? 'Diurno' : c.meta.shiftType}` : ''}</p>
                        </div>
                      </div>
                    ))}
                    {changes.length > 300 && (
                      <p className="py-2 text-center text-[11px] text-muted-foreground">+{changes.length - 300} cambios más…</p>
                    )}
                  </div>
                );
              })()}
            </div>
            </>
            )}

            <div className="px-5 py-3 border-t border-border/20 flex items-center justify-between gap-3">
              {planData ? (
                <button onClick={closeProposalModal} className="ml-auto px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary/90 transition-all shadow-sm">Listo</button>
              ) : (
                <>
                  <button onClick={discardProposal} disabled={publishing} className="px-4 py-2 rounded-xl text-sm font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50 transition-all flex items-center gap-1.5">
                    <Trash2 size={14} /> Descartar
                  </button>
                  {(() => {
                    const gaps = proposalData?.proposal?.summary?.warnings?.coverage?.gapCount || 0;
                    const hasGaps = gaps > 0;
                    return (
                      <button
                        onClick={() => publishProposal(hasGaps)}
                        disabled={publishing}
                        className={`px-6 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all shadow-sm flex items-center gap-2 ${hasGaps ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary/90'}`}
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
