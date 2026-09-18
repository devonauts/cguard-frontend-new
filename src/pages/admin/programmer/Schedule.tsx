import type { LucideIcon } from "lucide-react";
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

import { useTranslation } from "react-i18next";
import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
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
import { toast } from "sonner";

import ExtendShiftDialog, { type ExtendTarget } from "./ExtendShiftDialog";
import ScheduleTimeline, {
  dateToWall,
  wallToDate,
  startPan,
} from "./ScheduleTimeline";
import ContextMenu, { CtxItem, CtxMenuState } from "./ContextMenu";
import TransferShiftModal, { TransferTarget } from "./TransferShiftModal";
import SupervisionSection from "./SupervisionSection";
import StaffScheduleSection from "./StaffScheduleSection";
import MonthStationBlock, {
  type BlockSel,
  type MonthGridHandlers,
} from "./MonthStationBlock";
import BloqueVisible from "./BloqueVisible";
import MonthCalendar from "./MonthCalendar";
import AgendaView from "./AgendaView";
import { COL_W, COL_STICKY_W } from "./gridBand";
import {
  type Tone,
  tonePill,
  toneCard,
  toneInk,
  CODE_LABEL,
  CODE_ORDER,
  codePill,
  codeCard,
  columnRules,
} from "./codeTones";

import { localToday } from "@/lib/utils";
import {
  nombreDeVigilante,
  inicialesDeVigilante,
  primerNombre,
} from "@/lib/guardName";
import { getTenantTimezone } from "@/utils/tenantLocation";
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import {
  StatusBadge,
  Segmented,
  IconTile,
  EmptyState,
  NumberStepper,
} from "@/components/kit";
import { MeterBar } from "@/components/charts";
import { ApiService } from "@/services/api/apiService";
import { confirmDialog } from "@/components/ui/confirmDialog";
import RotationStyleSelect from "@/components/schedule/RotationStyleSelect";
import {
  etiquetaPrimerTramo,
  etiquetaSegundoTramo,
} from "@/components/schedule/tramos";
import { stationLabel } from "@/lib/stationName";
import { localeActual } from "@/lib/localeActual";
import { cuentaComoCobertura } from "@/lib/shiftStatus";
import { sePuedeMarcar, fechaMinimaEditable } from "@/lib/ventanaDeEdicion";
import { jornadasDePlazas, jornadasPorTipo } from "@/lib/jornadasDePlazas";
import {
  leerAparienciaDeLaCuenta,
  guardarApariencia,
  cambioLocalReciente,
} from "@/lib/appearanceSync";
import { enLotes } from "@/lib/enLotes";

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
  sfRotation?: {
    id?: string;
    name?: string;
    dayShifts?: number;
    nightShifts?: number;
    restDays?: number;
  };
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

const DAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// Format a Date as a LOCAL date-only string (YYYY-MM-DD). Using toISOString() here
// would convert local-midnight dates to UTC and shift the day back for users west of
// UTC (all of LATAM), causing wrong-month queries and off-by-one cell/override matching.
const fmtDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

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
        f = new Intl.DateTimeFormat("en-CA", {
          timeZone: tz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
        DAY_DTF_CACHE.set(tz, f);
      }

      return f.format(new Date());
    } catch {
      /* bad cached tz → device time */
    }
  }

  return localToday();
};

const addDays = (d: Date, n: number): Date => {
  const r = new Date(d);

  r.setDate(r.getDate() + n);

  return r;
};

/**
 * Suma días a una fecha «YYYY-MM-DD» y devuelve otra «YYYY-MM-DD».
 *
 * Aritmética en UTC a propósito: sumar un día sobre medianoche LOCAL en una
 * zona con horario de verano puede devolver el mismo día o saltarse uno — el
 * mismo fallo que ya está documentado más abajo para la época de rotación.
 */
const addDaysStr = (ymd: string, n: number): string => {
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(y, (m || 1) - 1, d || 1));

  t.setUTCDate(t.getUTCDate() + n);

  return t.toISOString().slice(0, 10);
};

/** Días entre dos «YYYY-MM-DD», ambos inclusive. */
const diasEntre = (desde: string, hasta: string): number => {
  const p = (v: string) => {
    const [y, m, d] = v.slice(0, 10).split("-").map(Number);

    return Date.UTC(y, (m || 1) - 1, d || 1);
  };

  return Math.floor((p(hasta) - p(desde)) / 86400000) + 1;
};

// Days since the 2024-01-01 rotation epoch (matches backend getGlobalEpoch).
// MUST use UTC arithmetic: subtracting LOCAL midnights and flooring loses a
// day in DST timezones (929 days − 1h → floor 928), which shifted the whole
// painted rotation by one day for any viewer outside a fixed-offset zone —
// the "puse que empieza hoy y se refleja mañana" bug.
const dseOf = (d: Date): number =>
  Math.round(
    (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) -
      Date.UTC(2024, 0, 1)) /
      86400000,
  );

/**
 * ── LA SECUENCIA DEL CICLO, DÍA A DÍA ──────────────────────────────────────
 * Tres números (3 día · 3 noche · 2 libre) desplegados en las ocho casillas que
 * de verdad recorre el vigilante: D1 D2 D3 N1 N2 N3 L1 L2. El índice de cada
 * casilla es exactamente el `cycleStartIndex` que entiende el servidor, que lo
 * resta a la fecha de alta para colocar la fase (`getRotationStatus` resuelve
 * el día D con `(dse − fase) % ciclo`).
 *
 * Hace falta porque un sacafranco casi nunca entra por el principio: entra en
 * la noche 1 —cuando arranca el descanso que viene a tapar— o su primer día es
 * LIBRE porque el fijo todavía está. Sin poder decirlo, la única salida era
 * correr la fecha de alta hacia atrás hasta que el ciclo cuadrara, y entonces
 * el alta dejaba de decir cuándo entró de verdad.
 */
type RanuraDelCiclo = {
  i: number;
  etiqueta: string;
  tipo: "dia" | "noche" | "libre";
};

const ranurasDelCiclo = (
  dias: number,
  noches: number,
  libres: number,
): RanuraDelCiclo[] => {
  const d = Math.max(0, Math.floor(dias || 0));
  const n = Math.max(0, Math.floor(noches || 0));
  const l = Math.max(0, Math.floor(libres || 0));
  const out: RanuraDelCiclo[] = [];

  for (let i = 0; i < d; i += 1)
    out.push({ i, etiqueta: `D${i + 1}`, tipo: "dia" });
  for (let i = 0; i < n; i += 1)
    out.push({ i: d + i, etiqueta: `N${i + 1}`, tipo: "noche" });
  for (let i = 0; i < l; i += 1)
    out.push({ i: d + n + i, etiqueta: `L${i + 1}`, tipo: "libre" });

  return out;
};

/** El texto que explica qué significa entrar por esa casilla. */
const explicarRanura = (r?: RanuraDelCiclo): string => {
  if (!r) return "Ese día trabaja el primer turno de día del ciclo.";
  if (r.tipo === "libre")
    return "Empieza librando: sus turnos arrancan cuando termine ese bloque de libres.";
  if (r.tipo === "noche")
    return `Entra directo a la ${r.etiqueta} del ciclo, no por el primer turno de día.`;

  return r.i === 0
    ? "Ese día trabaja el primer turno de día del ciclo — lo normal."
    : `Entra por la ${r.etiqueta}: ese día ya lleva ${r.i} turno(s) de día corridos del ciclo.`;
};

/**
 * Las casillas del ciclo, para tocar una. Vive fuera del componente porque la
 * usan los DOS sitios donde se da de alta un sacafranco —el asistente y el
 * diálogo de asignación— y dos copias acabarían contando distinto.
 */
function SelectorDeRanura({
  ranuras,
  value,
  onChange,
}: {
  ranuras: RanuraDelCiclo[];
  value: number;
  onChange: (i: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ranuras.map((r) => {
        const on = r.i === value;

        return (
          <button
            key={r.i}
            aria-pressed={on}
            className="cg-focus min-w-11 rounded-full px-2.5 py-1.5 text-[11px] font-semibold tabular-nums transition-all duration-150"
            style={
              on
                ? {
                    background: "var(--brand)",
                    color: "var(--brand-ink)",
                    boxShadow: "0 0 18px -6px var(--brand-glow)",
                  }
                : {
                    border: "1px solid var(--hairline)",
                    color:
                      r.tipo === "libre"
                        ? "var(--ink-faint)"
                        : "var(--ink-soft)",
                  }
            }
            title={
              r.tipo === "dia"
                ? `Turno de día ${r.i + 1} del ciclo`
                : r.tipo === "noche"
                  ? `Turno de tarde/noche ${r.i + 1} del ciclo`
                  : `Día libre ${r.i + 1} del ciclo`
            }
            type="button"
            onClick={() => onChange(r.i)}
          >
            {r.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

/** Los estilos del Horario. UNA lista: el tipo, la validación del arranque y la
 *  de la restauración salen todos de aquí. Estaba escrita a mano en tres sitios,
 *  y una copia que se quedara atrás rechazaría EN SILENCIO un estilo válido —
 *  el usuario elegiría Agenda y el CRM abriría en la hoja sin decir por qué.
 *  (El backend tiene su propia lista en `lib/uiAppearance`: es una frontera de
 *  confianza distinta, y ahí sanear es obligatorio aunque el cliente ya filtre.) */
const VISTAS = ["month", "calendar", "week", "day", "agenda"] as const;

type ViewMode = (typeof VISTAS)[number];
const esVista = (v: any): v is ViewMode =>
  typeof v === "string" && (VISTAS as readonly string[]).includes(v);

const VIEW_KEY = "programador.horario.view";
/** La preferencia de ESTILO sobrevive a la pestaña; la posición no. */
const VIEW_STYLE_KEY = "programador.horario.estilo";

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
/* Margen vertical: se construyen bastante ANTES de asomar, porque encontrarse
   un hueco en blanco al desplazar es peor que construir de más. */
const ROW_OVERSCAN_PX = 900;

/* ─── Papeles de color ───────────────────────────────────────────────────────
   Ni un color escrito a mano. Cada cosa que se pinta declara su PAPEL
   (`brand` / `ok` / `warn` / `bad` / `info` / `neutral`) y el relleno sale de
   los tokens, así que el mismo código se lee bien en claro y en oscuro y sigue
   funcionando cuando el usuario cambia el acento.                              */
const POSITION_TONE: Record<string, { tone: Tone; icon: LucideIcon }> = {
  fijo: { tone: "warn", icon: Sun },
  sacafranco: { tone: "ok", icon: Shield },
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
const TINT_TODAY = "color-mix(in oklab, var(--brand) 8%, transparent)";
const TINT_SUNDAY = "color-mix(in oklab, var(--bad) 5%, transparent)";

// Keyboard → novedad code (spreadsheet typing).
const KEY_CODES: Record<string, string> = {
  d: "D",
  n: "N",
  l: "L",
  v: "V",
  f: "F",
  p: "PM",
  "2": "24",
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function Schedule() {
  const { t } = useTranslation();
  const tenantId = localStorage.getItem("tenantId") || "";

  // Saved view (month + scroll + panels) so edits/reloads bring you back to the
  // exact same spot instead of jumping to the top.
  const savedView = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem(VIEW_KEY) || "null") || {};
    } catch {
      return {};
    }
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
  const [loading, setLoading] = useState(true); // initial load only
  const [refreshing, setRefreshing] = useState(false); // silent refetches (grid stays mounted)
  const hasLoadedRef = useRef(false);

  // View state
  const [currentDate, setCurrentDate] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(VIEW_KEY) || "null");

      if (saved?.a) {
        const [y, mo, d] = String(saved.a).split("-").map(Number);

        if (y && mo && d) return new Date(y, mo - 1, d);
      }
      if (saved?.m) {
        const [y, mo] = String(saved.m).split("-").map(Number);

        if (y && mo) return new Date(y, mo - 1, 1);
      }
    } catch {
      /* fall through */
    }
    const [y, mo, d] = tzToday().split("-").map(Number);

    return new Date(y, mo - 1, d);
  });
  /* ── LA PREFERENCIA VIVE EN LA CUENTA ─────────────────────────────────────
     Empezó en `sessionStorage` (se perdía al cerrar la pestaña) y pasó por
     `localStorage` (se perdía al cambiar de aparato). Ninguna de las dos sirve
     para lo que de verdad pasa: la misma persona abre el Horario en el portátil
     de la oficina, en el de casa y en el teléfono. Elegir «Agenda» en el móvil y
     encontrarse la hoja de cálculo en el siguiente aparato es volver a elegir
     cada vez.

     Ahora va en `users.appearance.scheduler`, que es donde ya viven el tema y el
     acento por exactamente el mismo motivo. `localStorage` se queda SÓLO como
     caché de arranque: pinta al instante mientras llega `/auth/me`, para no
     enseñar la vista equivocada durante medio segundo. La cuenta manda.

     En `sessionStorage` queda la POSICIÓN (scroll), que sí es de paso. */
  const [view, setView] = useState<ViewMode>(() => {
    try {
      const cache = localStorage.getItem(VIEW_STYLE_KEY);

      if (esVista(cache)) return cache;
    } catch {
      /* almacenamiento bloqueado */
    }
    if (esVista(savedView.v) && savedView.v !== "month") return savedView.v;
    // Sin preferencia: en una pantalla estrecha la hoja de cálculo no sirve.
    try {
      if (window.matchMedia("(max-width: 767px)").matches) return "agenda";
    } catch {
      /* SSR */
    }

    return "month";
  });

  /* Lo que diga la CUENTA gana a la caché local — salvo que la persona acabe de
     tocar el selector en esta pestaña (`cambioLocalReciente`), porque entonces
     el servidor todavía va por detrás y devolverle el valor viejo se vería como
     que la elección «no se guardó». Es la misma cautela que usan el tema y el
     acento. */
  const vistaDeCuentaAplicada = useRef(false);

  useEffect(() => {
    let vivo = true;

    leerAparienciaDeLaCuenta().then((ap) => {
      if (!vivo || vistaDeCuentaAplicada.current) return;
      vistaDeCuentaAplicada.current = true;
      if (cambioLocalReciente()) return;
      const v = ap?.scheduler?.view;

      if (esVista(v)) {
        setView(v);
        try {
          localStorage.setItem(VIEW_STYLE_KEY, v);
        } catch {
          /* bloqueado */
        }
      }
      if (typeof ap?.scheduler?.panel === "boolean")
        setPanelOpen(ap.scheduler.panel);
      if (typeof ap?.scheduler?.sf === "boolean")
        setSfSectionOpen(ap.scheduler.sf);
    });

    return () => {
      vivo = false;
    };
  }, []);

  /* ── UNA PREFERENCIA SE GUARDA CUANDO LA PERSONA LA ELIGE ────────────────
     Esto colgaba de un `useEffect` que miraba `view`, y por eso necesitaba una
     bandera de «primera pasada»: el componente monta con un valor por defecto
     ANTES de que conteste `/auth/me`, así que el efecto guardaba ese defecto
     encima de la preferencia real en cada carga de página. La bandera tapaba el
     síntoma; el problema era guardar en la derivación del estado en vez de en el
     acto del usuario.

     `elegirVista` es ahora el único sitio que escribe la preferencia, y se llama
     desde el selector. Un `setView` interno —restaurar de la cuenta, caer a
     Agenda en un móvil— NO la guarda, que es justo lo que se quiere: sólo se
     persiste lo que alguien eligió a propósito. */
  const elegirVista = useCallback((v: ViewMode) => {
    setView(v);
    setSel(null);
    try {
      localStorage.setItem(VIEW_STYLE_KEY, v);
    } catch {
      /* bloqueado */
    }
    guardarApariencia({ scheduler: { view: v } });
  }, []);

  const alternarPanel = useCallback(() => {
    setPanelOpen((abierto) => {
      const v = !abierto;

      guardarApariencia({ scheduler: { panel: v } });

      return v;
    });
  }, []);

  const alternarSacafrancos = useCallback(() => {
    setSfSectionOpen((abierta) => {
      const v = !abierta;

      guardarApariencia({ scheduler: { sf: v } });

      return v;
    });
  }, []);
  const [panelOpen, setPanelOpen] = useState<boolean>(savedView.panel ?? true);
  const [sfSectionOpen, setSfSectionOpen] = useState<boolean>(
    savedView.sf ?? false,
  );

  // Month label in the toolbar follows the SCROLL position of the year canvas.
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const [y, mo] = tzToday().split("-").map(Number);

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
  const [assignMode, setAssignMode] = useState<"single" | "rango" | "rotation">(
    "single",
  );
  /** Último día del rango a cubrir. Solo se usa en modo `rango`. */
  const [assignEndDate, setAssignEndDate] = useState(() => tzToday());
  const [sfPickQuery, setSfPickQuery] = useState("");
  const [assignStartTime, setAssignStartTime] = useState("07:00");
  const [assignEndTime, setAssignEndTime] = useState("19:00");
  const [assignTarget, setAssignTarget] = useState<{
    stationId: string;
    positionId: string;
  } | null>(null);
  const [assignGuard, setAssignGuard] = useState("");
  const [assignStartDate, setAssignStartDate] = useState(() => tzToday());
  const [assignSaving, setAssignSaving] = useState(false);
  /**
   * ── LO PROPIO DEL SACAFRANCO ────────────────────────────────────────────
   * Un fijo hereda el patrón de su estación y punto. Un sacafranco no: no
   * pertenece al compás de una estación, cubre los descansos de VARIAS, así que
   * lleva su propio ciclo y su propia lista de estaciones. El servidor ya lo
   * soportaba —el generador prefiere la rotación de la asignación cuando es
   * relevo, y lee `coveredStationIds`— pero no había dónde escribirlo.
   *
   * Vacío = el defecto de siempre: patrón de la estación, y cubre todas.
   */
  const [assignRotation, setAssignRotation] = useState("");
  /**
   * EN QUÉ DÍA DE SU CICLO ENTRA — el mismo `cycleStartIndex` del asistente.
   * 0 = el primer día trabaja el primer turno de día, que es lo de siempre.
   */
  const [assignCycleStart, setAssignCycleStart] = useState(0);
  const [assignCovered, setAssignCovered] = useState<string[]>([]);
  /** Asignación que se está EDITANDO (sacafranco ya puesto), sólo para el copy. */
  const [assignEditing, setAssignEditing] = useState<GuardAssignment | null>(
    null,
  );
  const [moveFrom, setMoveFrom] = useState<GuardAssignment | null>(null); // drag-move source
  const [coverage, setCoverage] = useState<CoverageInfo | null>(null); // real coverage of live schedule

  // Configure station form — SAME model as the station-page "Horario del
  // turno" editor (StationOverview): custom window + turno por vigilante +
  // cobertura de descansos (sacafranco | alternancia 24x24). Same
  // /auto-positions payload so both screens configure identically.
  const [configStation, setConfigStation] = useState<Station | null>(null);
  const [configType, setConfigType] = useState("24h");
  const [configRotation, setConfigRotation] = useState("");
  const [configSaving, setConfigSaving] = useState(false);
  const [cfgStart, setCfgStart] = useState("07:00");
  const [cfgEnd, setCfgEnd] = useState("07:00");
  const [cfgBlockHours, setCfgBlockHours] = useState(""); // '' = whole window per fijo
  const [cfgRestCoverage, setCfgRestCoverage] = useState<
    "sacafranco" | "alternate"
  >("sacafranco");
  const [cfgRotStyle, setCfgRotStyle] = useState<{
    dayShifts: number;
    nightShifts: number;
    restDays: number;
  } | null>(null);

  // Window math (mirrors StationOverview): wraps midnight; start==end → 24h.
  const cfgWinMin = useMemo(() => {
    if (!cfgStart || !cfgEnd) return 0;
    const toMin = (x: string) => {
      const [h, mm] = x.split(":").map((n) => parseInt(n, 10) || 0);

      return ((h % 24) * 60 + (mm % 60) + 1440) % 1440;
    };
    const w = (toMin(cfgEnd) - toMin(cfgStart) + 1440) % 1440;

    return w === 0 ? 1440 : w;
  }, [cfgStart, cfgEnd]);
  const cfgBlocksOk =
    Number(cfgBlockHours) > 0 &&
    cfgWinMin > 0 &&
    cfgWinMin % (Number(cfgBlockHours) * 60) === 0;
  const cfgBlockCount = cfgBlocksOk
    ? cfgWinMin / (Number(cfgBlockHours) * 60)
    : 1;
  // El segundo tramo del ciclo, por su nombre: 07:00–15:00 + 15:00–23:00 ⇒ «tarde».
  const cfgPrimerTramo = useMemo(
    () =>
      etiquetaPrimerTramo(cfgStart, Number(cfgBlockHours) * 60, cfgBlockCount),
    [cfgStart, cfgBlockHours, cfgBlockCount],
  );
  const cfgSegundoTramo = useMemo(
    () =>
      etiquetaSegundoTramo(cfgStart, Number(cfgBlockHours) * 60, cfgBlockCount),
    [cfgStart, cfgBlockHours, cfgBlockCount],
  );
  const cfgRotCycle = cfgRotStyle
    ? (cfgRotStyle.dayShifts || 0) +
      (cfgRotStyle.nightShifts || 0) +
      (cfgRotStyle.restDays || 0)
    : 0;
  const cfgRotWork = cfgRotStyle
    ? (cfgRotStyle.dayShifts || 0) + (cfgRotStyle.nightShifts || 0)
    : 0;
  const cfgAlternateOk =
    cfgRestCoverage !== "alternate" ||
    !cfgRotStyle ||
    (cfgRotWork > 0 && cfgRotCycle % cfgRotWork === 0);
  const cfgGuardsPerBlock =
    cfgRestCoverage === "alternate" && cfgAlternateOk && cfgRotWork > 0
      ? cfgRotCycle / cfgRotWork
      : 1;

  // ─── Data Loading ─────────────────────────────────────────────────────────

  // The Mes sheet is a CONTINUOUS canvas of the WHOLE current year: frozen
  // date header on top + frozen station column on the left, free horizontal
  // scroll through every day — "sin límite", capped at the current year.
  const todayYear = useMemo(() => Number(tzToday().slice(0, 4)), []);

  /* ─── LA HOJA CARGA TRES MESES, NO UN AÑO ────────────────────────────────
     Antes el lienzo era el año entero: 365 columnas. Eso no sólo pinta de más,
     es que TODO cuelga de ahí — la consulta pide doce meses de turnos, el
     recuento de alertas recorre estaciones x 365 días, y la rejilla mide 16.300
     px. Medido: 41.136 nodos y ~9 s hasta ver la hoja.

     Virtualizar las filas bajó los nodos un 73 % y el reloj sólo un 10 %, o sea
     que el problema no era construir el DOM sino la CANTIDAD DE DÍAS que se
     arrastra por todas partes. Con tres meses se cae de 365 a ~92 en la consulta,
     en el bucle de alertas y en el lienzo a la vez.

     El tramo empieza un mes ANTES del actual —para que se vea lo recién pasado—
     y se amplía de tres en tres al llegar a cualquiera de los dos bordes, sin
     salirse del año (el tope del producto). */
  const MESES_POR_TRAMO = 3;
  const primerDiaDeMes = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), 1);
  const ultimoDiaDeMes = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth() + 1, 0);

  /* ── UN AÑO RODANTE, NO EL AÑO DEL CALENDARIO ───────────────────────────
     El Horario estaba topado al año en curso: del 1 de enero al 31 de
     diciembre. Suena a «un año» y no lo es — en diciembre el usuario podía
     planificar TREINTA Y UN DÍAS, y en marzo diez meses. El horizonte que ve
     encogía según el mes en que estuvieras, sin decir por qué.

     Ahora la ventana acompaña al horizonte real del backend, que materializa
     365 días rodantes desde hoy: se puede mirar un mes atrás —lo recién
     pasado, que es lo que se consulta— y un año hacia delante, siempre.

     Los límites se recalculan al montar, no en cada render: la hoja vive
     abierta durante turnos enteros, y mover el tope bajo el usuario mientras
     trabaja mueve el lienzo bajo su dedo. */
  const limites = useMemo(() => {
    const [y, m, d] = tzToday().split("-").map(Number);
    const hoy = new Date(y, m - 1, d);

    return {
      min: primerDiaDeMes(new Date(y, m - 2, 1)), // el mes pasado
      max: new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 365),
    };
  }, []);

  const [rango, setRango] = useState(() => {
    const [y, m] = tzToday().split("-").map(Number);
    let desde = primerDiaDeMes(new Date(y, m - 2, 1));

    if (desde < limites.min) desde = limites.min;
    let hasta = ultimoDiaDeMes(
      new Date(desde.getFullYear(), desde.getMonth() + MESES_POR_TRAMO - 1, 1),
    );

    if (hasta > limites.max) hasta = limites.max;

    return { desde, hasta };
  });

  const monthDays = useMemo(() => {
    const days: Date[] = [];
    const d = new Date(rango.desde);

    while (d <= rango.hasta) {
      days.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }

    return days;
  }, [rango]);

  /* Al ampliar HACIA ATRÁS se añaden columnas a la izquierda, así que todo lo
     que había se corre: sin compensar el desplazamiento, la hoja pega un salto
     bajo el dedo. Se apunta aquí y se aplica cuando el lienzo ya creció. */
  const compensarPxRef = useRef(0);

  useLayoutEffect(() => {
    if (!compensarPxRef.current) return;
    const el = gridScrollRef.current;

    if (el) el.scrollLeft += compensarPxRef.current;
    compensarPxRef.current = 0;
  }, [monthDays.length]);

  /* Un mes al que se salta puede caer FUERA del tramo cargado. Se amplía primero
     y el salto queda pendiente hasta que el lienzo lo contiene. */
  const saltoPendienteRef = useRef<Date | null>(null);

  const ampliarRango = useCallback(
    (hacia: "antes" | "despues") => {
      setRango((prev) => {
        const minAnio = limites.min;
        const maxAnio = limites.max;

        if (hacia === "antes") {
          if (prev.desde <= minAnio) return prev;
          let nuevo = primerDiaDeMes(
            new Date(
              prev.desde.getFullYear(),
              prev.desde.getMonth() - MESES_POR_TRAMO,
              1,
            ),
          );

          if (nuevo < minAnio) nuevo = minAnio;
          compensarPxRef.current +=
            Math.round((prev.desde.getTime() - nuevo.getTime()) / 86400000) *
            COL_W;

          return { ...prev, desde: nuevo };
        }
        if (prev.hasta >= maxAnio) return prev;
        let nuevo = ultimoDiaDeMes(
          new Date(
            prev.hasta.getFullYear(),
            prev.hasta.getMonth() + MESES_POR_TRAMO,
            1,
          ),
        );

        if (nuevo > maxAnio) nuevo = maxAnio;

        return { ...prev, hasta: nuevo };
      });
    },
    [limites],
  );

  // `YYYY-MM-DD` y «¿es domingo?» de cada columna, precalculados UNA vez. Antes
  // `fmtDate(day)` se ejecutaba dentro de cada celda: 365 columnas x 55 filas =
  // ~20.000 construcciones de cadena en CADA render de la hoja.
  const monthDayStrs = useMemo(() => monthDays.map(fmtDate), [monthDays]);
  const monthDaySunday = useMemo(
    () => monthDays.map((d) => d.getDay() === 0),
    [monthDays],
  );

  // Visible days for the Semana/Día timeline. Día shows 48h (the chosen day +
  // the next) so a block can be DRAWN across midnight — e.g. 07:00 → 07:00.
  const timelineDays = useMemo(() => {
    if (view === "day") return [currentDate, addDays(currentDate, 1)];
    const start = addDays(currentDate, -((currentDate.getDay() + 6) % 7)); // Monday

    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [view, currentDate]);

  // Fetch range follows the view: the year canvas loads the whole current
  // year; the timeline pads ±1 day so overnight shift tails are included.
  /* La rejilla del año carga el año; la línea de tiempo, sus días ±1. El
     CALENDARIO carga UN MES —con la cola de la semana que se ve a los lados—:
     pedir el año para pintar 42 celdas sería traerse 20.000 filas para enseñar
     unas pocas. */
  const calRange = useMemo(() => {
    const primero = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth(),
      1,
    );
    const desde = addDays(primero, -((primero.getDay() + 6) % 7) - 1);

    return { desde: fmtDate(desde), hasta: fmtDate(addDays(desde, 43)) };
  }, [visibleMonth]);

  /* La AGENDA lee el mismo mes que el calendario: en el móvil se consulta «esta
     semana y la que viene», y pedir el año para una lista sería traerse 20.000
     filas por una pantalla de teléfono. */
  const startDateStr =
    view === "calendar" || view === "agenda"
      ? calRange.desde
      : view === "month"
        ? fmtDate(rango.desde)
        : fmtDate(addDays(timelineDays[0], -1));
  const endDateStr =
    view === "calendar" || view === "agenda"
      ? calRange.hasta
      : view === "month"
        ? fmtDate(rango.hasta)
        : fmtDate(addDays(timelineDays[timelineDays.length - 1], 1));

  const fetchAll = useCallback(
    async (opts?: { silent?: boolean }) => {
      // After the first load every refetch is SILENT: the grid stays mounted so
      // the scroll position (and selection context) survives every save.
      const silent = opts?.silent ?? hasLoadedRef.current;

      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const [overviewRes, rotRes, guardsRes, coverageRes] =
          await Promise.all([
            ApiService.get(
              `/tenant/${tenantId}/scheduler/overview?startDate=${startDateStr}&endDate=${endDateStr}`,
            ),
            ApiService.get(`/tenant/${tenantId}/rotation-styles`),
            ApiService.get(
              `/tenant/${tenantId}/security-guard/autocomplete?limit=200`,
            ),
            ApiService.get(
              `/tenant/${tenantId}/scheduler/coverage?days=14`,
            ).catch(() => null),
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

        const guards = Array.isArray(guardsRes)
          ? guardsRes
          : guardsRes?.rows || [];

        setGuardsPool(
          guards
            .map((g: RawGuardRow) => ({
              id: g.guardId || g.id || g.value || "",
              label: g.fullName || g.name || g.label || g.email || "",
            }))
            .filter((g: { id: string; label: string }) => g.id),
        );

        hasLoadedRef.current = true;
      } catch (e: any) {
        console.error("[Scheduler] fetch error", e);
        toast.error(t("ui.Schedule.errorAlCargarHorario"));
      } finally {
        if (silent) setRefreshing(false);
        else setLoading(false);
      }
    },
    [tenantId, startDateStr, endDateStr],
  );

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /* ── LAS ALERTAS SON DEL MES QUE SE MIRA ─────────────────────────────────
     `/scheduler/staffing` se pedía sin `year`/`month`, así que el servidor
     contestaba siempre por SU mes en curso: la hoja podía estar en noviembre y
     las insignias seguir describiendo septiembre. El parámetro existía en el
     backend desde el principio y nadie lo mandaba.

     Va en su propio efecto y no en el lote de arriba a propósito: depende del
     mes visible, y meterlo allí obligaría a recargar la rejilla entera —el año
     completo de turnos— cada vez que alguien pasa de un mes al siguiente. */
  const mesDeLasAlertas = visibleMonth.getFullYear() * 12 + visibleMonth.getMonth();

  useEffect(() => {
    if (!tenantId) return;
    let vigente = true;
    const anio = Math.floor(mesDeLasAlertas / 12);
    const mes = (mesDeLasAlertas % 12) + 1;

    ApiService.get(
      `/tenant/${tenantId}/scheduler/staffing?year=${anio}&month=${mes}`,
    )
      .then((res: any) => {
        if (vigente && res) setStaffing(res?.data || res);
      })
      .catch(() => {
        /* Las insignias son informativas: si no llegan, la hoja sigue. */
      });

    return () => {
      vigente = false;
    };
  }, [tenantId, mesDeLasAlertas]);

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
  /* El mismo mapa en un ref, para que `scrollCellIntoView` siga siendo estable
     (deps vacías) y aun así pueda saber de qué estación es una fila cuando su
     bloque todavía no está construido. */
  const posicionesRef = useRef(positionsById);

  posicionesRef.current = positionsById;

  // MANUAL SACAFRANCO: nothing is auto-scheduled for an SF. Their month starts
  // all-libre; coverage exists ONLY where a REAL shift exists — placed by
  // dragging the SF's día onto a puesto's L cell (creates an ad-hoc shift), or
  // in bulk via the explicit "Optimizar Sacafrancos" action.
  const tzName = getTenantTimezone();

  const reliefGuardIds = useMemo(() => {
    const s = new Set<string>();

    for (const a of assignments) {
      if (a.isRelief || positionsById.get(a.positionId)?.type === "sacafranco")
        s.add(a.guardId);
    }

    return s;
  }, [assignments, positionsById]);

  // `${guardId}|${dateStr}` (tenant tz) → that guard's real shift that day.
  // SF cells read it for coverage; the right-click menu reads it for any guard.
  const shiftByGuardDate = useMemo(() => {
    const m = new Map<string, ShiftRecord>();

    for (const s of shifts) {
      if (!s.startTime) continue;
      m.set(
        `${s.guardId}|${dateToWall(new Date(s.startTime), tzName).dateStr}`,
        s,
      );
    }

    return m;
  }, [shifts, tzName]);

  /**
   * La ventana que de VERDAD se trabaja en una plaza un día dado.
   *
   * Existe porque las horas declaradas en la plaza pueden no tener nada que ver
   * con los turnos reales. Caso medido en Seguridad B.A.S.: la plaza «Fijo 2»
   * dice 07:00–19:00 y los turnos de su titular alternan 12:00→00:00 y
   * 00:00→12:00. Al cubrir sus vacaciones, el modal se conformaba con las horas
   * de la plaza y creaba un turno DIURNO donde tocaba uno de noche.
   *
   * Se indexa por plaza y día, no por vigilante: al cubrir a alguien que está de
   * vacaciones puede que su propio turno ya no esté ahí, y lo que hay que
   * replicar es la ventana del PUESTO, que es la que el cliente contrató.
   */
  const shiftByPosDate = useMemo(() => {
    const m = new Map<string, ShiftRecord>();

    for (const sh of shifts) {
      if (!sh.startTime || !sh.positionId) continue;
      const k = `${sh.positionId}|${dateToWall(new Date(sh.startTime), tzName).dateStr}`;

      // Si hay varios, gana el primero: dos turnos en la misma plaza y día son
      // un relevo, y cualquiera de los dos da la ventana correcta mejor que la
      // hora declarada de la plaza.
      if (!m.has(k)) m.set(k, sh);
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
      if (p.type === "sacafranco") continue;
      const list = m.get(p.stationId);

      if (list) list.push(p);
      else m.set(p.stationId, [p]);
    }

    return m;
  }, [positions]);

  const assignmentsByPosition = useMemo(() => {
    const m = new Map<string, GuardAssignment[]>();

    for (const a of assignments) {
      const list = m.get(a.positionId);

      if (list) list.push(a);
      else m.set(a.positionId, [a]);
    }
    // EL TITULAR PRIMERO. Media pantalla lee `posAssignments[0]` como «quien
    // tiene este puesto» —la cabecera de la fila, el aspa de quitar, el arrastre
    // de mover—. Con un aprendiz en la misma plaza, el orden lo decidía la
    // consulta: el acompañante podía salir de dueño y el titular desaparecer de
    // su propia fila.
    for (const list of m.values()) {
      if (list.length > 1)
        list.sort(
          (a, b) => Number(a.role === "shadow") - Number(b.role === "shadow"),
        );
    }

    return m;
  }, [assignments]);

  const sfPositions = useMemo(
    () => positions.filter((p) => p.type === "sacafranco"),
    [positions],
  );

  const getPositionsForStation = useCallback(
    (stationId: string) => positionsByStation.get(stationId) || EMPTY_POS,
    [positionsByStation, EMPTY_POS],
  );

  const getAssignmentsForPosition = useCallback(
    (positionId: string) => assignmentsByPosition.get(positionId) || EMPTY_ASG,
    [assignmentsByPosition, EMPTY_ASG],
  );

  const guardColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    let idx = 0;

    assignments.forEach((a) => {
      if (a.guardId && !map[a.guardId]) {
        map[a.guardId] = guardHueColor(idx);
        idx++;
      }
    });
    shifts.forEach((s) => {
      if (s.guardId && !map[s.guardId]) {
        map[s.guardId] = guardHueColor(idx);
        idx++;
      }
    });

    return map;
  }, [assignments, shifts]);

  /**
   * ¿QUÉ HACE ESTA PERSONA ESE DÍA? — SE LEE, NO SE CALCULA.
   *
   * Aquí vivía una copia de la aritmética del ciclo (la 1.ª está en el
   * generador, la 2.ª estaba en `supervisorScheduleService` y la 3.ª en el
   * calendario de la app). Mientras un ciclo se dijo con tres números las
   * cuatro coincidían; en cuanto dejaron de coincidir, cada pantalla enseñó una
   * verdad distinta y ninguna era comprobable contra la otra.
   *
   * El 2026-09-13 eso costó un día entero en Seguridad B.A.S.: un puesto de
   * 24 h en 3-3-2 salía como dos turnos fijos en la rejilla mientras el motor
   * los rotaba de verdad, y un vigilante veía en su app el horario de su
   * compañero.
   *
   * La regla del dueño: «absolutamente nada debe volver a calcular; en todo
   * lugar debe reutilizar el mismo servicio y sólo reflejar eso». Así que esto
   * mira los TURNOS que existen: si hay turno, la banda sale de su hora de
   * entrada; si no hay, es libre. Un slot, una verdad.
   *
   * Se conserva la firma porque seis sitios preguntan «¿descansa este día?» y
   * la respuesta es la misma, sólo que ahora es cierta.
   *
   * Más allá del horizonte de generación no hay turnos y todo sale «libre». Eso
   * es lo honesto: no es que descanse, es que su horario aún no está hecho —y
   * antes la pantalla se lo inventaba con una cuenta que nadie podía auditar.
   */
  const isWorkDay = useCallback(
    (assignment: GuardAssignment, date: Date): "day" | "night" | "rest" => {
      const turno = shiftByGuardDate.get(
        `${assignment.guardId}|${fmtDate(date)}`,
      );

      if (!turno?.startTime) return "rest";

      const { minutes } = dateToWall(new Date(turno.startTime), tzName);

      return minutes >= 18 * 60 || minutes < 6 * 60 ? "night" : "day";
    },
    [shiftByGuardDate, tzName],
  );

  // Unassigned guards (not in any active assignment)
  const unassignedGuards = useMemo(() => {
    const assignedIds = new Set(assignments.map((a) => a.guardId));

    return guardsPool.filter((g) => !assignedIds.has(g.id));
  }, [guardsPool, assignments]);

  // Sacafranco availability: guards assigned to sacafranco positions + their D/N/L schedule
  const sacafrancoData = useMemo(() => {
    const reliefAssignments = assignments.filter((a) => {
      const pos = positionsById.get(a.positionId);

      return pos?.type === "sacafranco" || a.isRelief;
    });

    // Group by guard (deduplicate — a sacafranco may have assignments at multiple stations)
    const byGuard = new Map<
      string,
      {
        guard: GuardRef | undefined;
        assignments: GuardAssignment[];
        coverDays: number;
        availDays: number;
      }
    >();

    reliefAssignments.forEach((a) => {
      if (!byGuard.has(a.guardId)) {
        byGuard.set(a.guardId, {
          guard: a.guard,
          assignments: [],
          coverDays: 0,
          availDays: 0,
        });
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
    const map = new Map<
      string,
      {
        id: string;
        guardId: string;
        name: string;
        fullName: string;
        code: "D" | "N";
        ext?: boolean;
      }[]
    >();

    // Los turnos que la rotación del puesto genera llevan `positionId`; los
    // sueltos (cobertura, bloque dibujado, turno único) no. Un SF sigue contando
    // aunque su turno traiga posición, por compatibilidad con lo de antes.
    for (const s of shifts) {
      if (!s.startTime) continue;
      // ── UN TURNO ANULADO NO CUBRE NADA ────────────────────────────────
      // La píldora de cobertura salía de TODOS los turnos, sin mirar el
      // estado. Marcar «Libre» a quien cubría deja su turno en `absent`
      // (lo hace el backend en schedule-overrides), pero la casilla seguía
      // enseñando «N ET» como si el hombre fuera a ir: en Seguridad B.A.S.
      // se le dio el día a Edgardo Torres y su cobertura siguió pintada en
      // el puesto, así que nadie vio el hueco y nadie mandó a nadie.
      //
      // El servidor manda los `absent` A PROPÓSITO —la rejilla los necesita
      // para pintar la novedad encima y para saber que ahí falta gente—, así
      // que el filtro tiene que estar AQUÍ, en quien responde «¿quién
      // cubre?». Mismos estados que `VOIDED_SHIFT_STATUSES` del backend.
      if (!cuentaComoCobertura(s)) continue;
      const esCobertura = !s.positionId || reliefGuardIds.has(s.guardId);

      if (!esCobertura) continue;
      const dateStr = dateToWall(new Date(s.startTime), tzName).dateStr;
      const key = `${s.stationId}-${dateStr}`;
      const g = s.guard;
      // El respaldo por `guardsPool` cubre el turno que llega sin objeto guard;
      // el segundo argumento cubre el que lo trae SIN nombre.
      const respaldo =
        guardsPool.find((x) => x.id === s.guardId)?.label || "Cobertura";
      const fullName = nombreDeVigilante(g, respaldo);
      const initials = inicialesDeVigilante(
        g,
        respaldo.slice(0, 2).toUpperCase(),
      );
      // D o N por la hora de inicio — el mismo umbral 18/6 del backend. Sólo lo
      // usa la cobertura HUÉRFANA (la que no cae sobre una «L»): ahí la celda
      // está vacía y la letra es lo único que dice si se cubrió el día o la noche.
      const startMin = dateToWall(new Date(s.startTime), tzName).minutes;
      const code: "D" | "N" =
        startMin >= 18 * 60 || startMin < 6 * 60 ? "N" : "D";

      if (!map.has(key)) map.set(key, []);
      // `extension` = alguien DOBLÓ (su relevo no llegó). Se pinta distinto del
      // resto de coberturas: no es un sacafranco haciendo su trabajo, es una
      // persona encadenando dos turnos, y eso hay que verlo de un vistazo.
      map.get(key)!.push({
        id: s.id,
        guardId: s.guardId,
        name: initials || "SF",
        fullName,
        code,
        ext: s.status === "extension",
      });
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
      // Mismo criterio que la píldora de arriba: si no se pinta, tampoco se
      // ofrece en el menú ni se borra con Supr — si no, el clic derecho
      // enseñaba «Eliminar la cobertura de X» sobre una casilla vacía.
      if (!cuentaComoCobertura(s)) continue;
      if (s.positionId && !reliefGuardIds.has(s.guardId)) continue;
      const key = `${s.stationId}-${dateToWall(new Date(s.startTime), tzName).dateStr}`;
      const list = map.get(key);

      if (list) list.push(s);
      else map.set(key, [s]);
    }

    return map;
  }, [shifts, reliefGuardIds, tzName]);

  // El servidor ya calcula estas alertas (`staffing.stationAlerts`). Cuando las
  // manda, este memo se saltaba… pero se calculaba igual y se tiraba: 30 puestos
  // x 365 dias x `isWorkDay` por nada. Ahora sale en la primera linea.
  const apiStationAlerts = Array.isArray(staffing?.stationAlerts)
    ? staffing!.stationAlerts
    : null;

  /* ── AQUÍ HABÍA UNA SEGUNDA OPINIÓN, Y ERA LA MISMA EQUIVOCADA ──────────
     `localStationAlerts` recalculaba las insignias en el navegador con la
     regla vieja —«¿libra algún fijo y no vino un sacafranco?»—, que en un
     puesto de 24 h que alterna salta todos los días: el descanso de uno ES el
     turno del otro. Sólo se usaba cuando el servidor no contestaba, así que su
     único efecto posible era enseñar el número equivocado justo cuando nadie
     podía contrastarlo.

     La cobertura la calcula ahora el servidor a partir de los TURNOS
     (`/scheduler/staffing`, por tramos). Sin respuesta no se enseña insignia:
     no saber es mejor que inventar. */

  const stationAlerts = useMemo<StationAlert[]>(() => {
    const rows = apiStationAlerts ?? [];
    // The staffing endpoint does not return the nominativo, and this panel is
    // where you pick which puesto to fix — so stitch it back on from the
    // stations we already hold. Several puestos share a stationName; without it
    // the list names four different posts identically.
    const nickById = new Map(
      stations.map((st) => [String(st.id), st.nickname ?? null]),
    );

    return rows.map((a) =>
      a.nickname
        ? a
        : { ...a, nickname: nickById.get(String(a.stationId)) ?? null },
    );
  }, [apiStationAlerts, stations]);

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
  const candidatosParaCubrir = useCallback(
    (dateStr: string) => {
      const dia = new Date(dateStr + "T00:00:00");
      const AUSENCIAS = ["V", "PM", "F", "L"];

      return guardsPool
        .map((g) => {
          const turno = shiftByGuardDate.get(`${g.id}|${dateStr}`);
          const nov = getOverride(g.id, dateStr);
          const propia = assignments.find(
            (a) => a.guardId === g.id && !a.isRelief,
          );
          const esSf = reliefGuardIds.has(g.id);

          let estado: "libre" | "ocupado" | "deTurno" | "ausente" = "libre";
          let detalle = "";

          if (nov && AUSENCIAS.includes(nov.type)) {
            estado = "ausente";
            detalle = nov.type;
          } else if (turno) {
            estado = "ocupado";
            detalle =
              stationsById.get(turno.stationId)?.stationName || "otro puesto";
          } else if (propia && isWorkDay(propia, dia) !== "rest") {
            estado = "deTurno";
            detalle =
              stationsById.get(propia.stationId)?.stationName || "su puesto";
          }

          return { id: g.id, nombre: g.label, esSf, estado, detalle };
        })
        .sort((a, b) => {
          // Libres primero; entre libres, los sacafrancos delante (es su oficio).
          const peso = (r: typeof a) =>
            r.estado === "libre"
              ? r.esSf
                ? 0
                : 1
              : r.estado === "deTurno"
                ? 2
                : r.estado === "ocupado"
                  ? 3
                  : 4;
          const d = peso(a) - peso(b);

          return d !== 0 ? d : a.nombre.localeCompare(b.nombre);
        });
    },
    [
      guardsPool,
      shiftByGuardDate,
      getOverride,
      assignments,
      reliefGuardIds,
      stationsById,
      isWorkDay,
    ],
  );

  // ─── Spreadsheet selection model ─────────────────────────────────────────
  // Rows (in visual order) that can hold a selection: every puesto row.

  const selectableRows = useMemo<SelRow[]>(() => {
    const rows: SelRow[] = [];

    for (const st of stations) {
      for (const pos of getPositionsForStation(st.id)) {
        rows.push({
          key: pos.id,
          station: st,
          pos,
          assignments: getAssignmentsForPosition(pos.id),
          isSf: false,
        });
      }
    }
    if (sfSectionOpen) {
      for (const pos of sfPositions) {
        rows.push({
          key: pos.id,
          station: stationsById.get(pos.stationId) || null,
          pos,
          assignments: getAssignmentsForPosition(pos.id),
          isSf: true,
        });
      }
    }

    return rows;
  }, [
    stations,
    sfPositions,
    sfSectionOpen,
    stationsById,
    getPositionsForStation,
    getAssignmentsForPosition,
  ]);

  const rowIndexByKey = useMemo(() => {
    const m = new Map<string, number>();

    selectableRows.forEach((r, i) => m.set(r.key, i));

    return m;
  }, [selectableRows]);

  // Selection: anchor (ar/ac) + focus (fr/fc) as indices into selectableRows / monthDays.
  const [sel, setSel] = useState<{
    ar: number;
    ac: number;
    fr: number;
    fc: number;
  } | null>(null);
  const mouseSelRef = useRef(false);

  /* ── DOS CARTAS EN UN CASILLERO ──────────────────────────────────────────
     Una plaza con dos personas (24 h a dos, o titular + aprendiz) pinta DOS
     tarjetas en la MISMA celda, y la selección es de la celda: escribir «V»
     se lo ponía a los dos. Ahora la tarjeta sobre la que se pulsa se queda
     ELEGIDA y todo lo que se escriba o se borre va sólo a esa persona.

     El ratón baja primero en la tarjeta (hijo) y luego en la celda (padre),
     así que la tarjeta deja su id en el ref y la celda —que es quien abre la
     selección— lo recoge. Pulsar la celda por fuera de las tarjetas no deja
     nada en el ref y la elección se limpia: vuelve a ser «las dos». */
  const cartaRef = useRef<string | null>(null);
  const [cartaElegida, setCartaElegida] = useState<string | null>(null);
  const pickAssignment = useCallback((assignmentId: string) => {
    cartaRef.current = assignmentId;
  }, []);

  /** Las asignaciones de una fila que la selección afecta de verdad. */
  const asigsDeFila = useCallback(
    (row: SelRow): GuardAssignment[] => {
      if (!cartaElegida || row.assignments.length < 2) return row.assignments;
      const una = row.assignments.find((a) => a.id === cartaElegida);

      return una ? [una] : row.assignments;
    },
    [cartaElegida],
  );

  const selBounds = useMemo(
    () =>
      sel
        ? {
            r1: Math.min(sel.ar, sel.fr),
            r2: Math.max(sel.ar, sel.fr),
            c1: Math.min(sel.ac, sel.fc),
            c2: Math.max(sel.ac, sel.fc),
          }
        : null,
    [sel],
  );

  const cellSelCls = useCallback(
    (rowKey: string, c: number): string => {
      if (!selBounds || !sel) return "";
      const r = rowIndexByKey.get(rowKey);

      if (
        r == null ||
        r < selBounds.r1 ||
        r > selBounds.r2 ||
        c < selBounds.c1 ||
        c > selBounds.c2
      )
        return "";
      const isFocus = r === sel.fr && c === sel.fc;

      // `ring-primary`/`bg-primary` son los tokens PUENTE de shadcn: apuntan a
      // `--brand`, así que la selección se repinta sola cuando el usuario cambia
      // el acento. Van como clases y no como estilo en línea porque esta función
      // devuelve className (la celda ya usa `style` para su propio tinte).
      return isFocus
        ? " ring-2 ring-inset ring-primary bg-primary/10"
        : " ring-1 ring-inset ring-primary/40 bg-primary/5";
    },
    [selBounds, sel, rowIndexByKey],
  );

  const startCellSelect = useCallback(
    (rowKey: string, c: number, shift: boolean) => {
      setCartaElegida(cartaRef.current);
      cartaRef.current = null;
      const r = rowIndexByKey.get(rowKey);

      if (r == null) return;
      setSel((prev) =>
        shift && prev
          ? { ...prev, fr: r, fc: c }
          : { ar: r, ac: c, fr: r, fc: c },
      );
      if (!shift) mouseSelRef.current = true;
    },
    [rowIndexByKey],
  );

  const hoverCellSelect = useCallback(
    (rowKey: string, c: number) => {
      if (!mouseSelRef.current) return;
      const r = rowIndexByKey.get(rowKey);

      if (r == null) return;
      setSel((prev) => (prev ? { ...prev, fr: r, fc: c } : prev));
    },
    [rowIndexByKey],
  );

  useEffect(() => {
    const up = () => {
      mouseSelRef.current = false;
    };

    window.addEventListener("mouseup", up);

    return () => window.removeEventListener("mouseup", up);
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
      else if (
        COL_STICKY_W + (c + 1) * COL_W >
        el.scrollLeft + el.clientWidth
      ) {
        el.scrollLeft = COL_STICKY_W + (c + 1) * COL_W - el.clientWidth;
      }
    }
    /* La fila puede NO estar construida: con la hoja virtualizada por bloques,
       el puesto de destino quizá esté fuera de la ventana. Se cae entonces al
       bloque de su ESTACIÓN, que siempre existe (es el espaciador), y al
       acercarse se monta solo y el teclado vuelve a encontrar la fila. */
    const fila = document.getElementById(`hr-${rowKey}`);

    if (fila) {
      fila.scrollIntoView({ block: "nearest", inline: "nearest" });

      return;
    }
    const estacionId = posicionesRef.current.get(rowKey)?.stationId;

    if (estacionId)
      document
        .getElementById(`hs-${estacionId}`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);

  // ─── Actions ──────────────────────────────────────────────────────────────

  /** Las horas del puesto, para prefijar un turno de un solo día. */
  const horasDelPuesto = (positionId: string): [string, string] => {
    const pos = positionsById.get(positionId);
    const hhmm = (x?: string | null) => (x ? String(x).slice(0, 5) : "");
    const ini = hhmm(pos?.startTime) || "07:00";
    const fin = hhmm(pos?.endTime) || "19:00";

    return [ini, fin];
  };

  /** ¿La plaza elegida en el formulario ROTA día/noche? Sin noches en el patrón
   *  del puesto, no rota: el vigilante se queda en el horario de su plaza. */
  const puestoRota = useMemo(() => {
    if (!assignTarget) return true;
    const st = stationsById.get(assignTarget.stationId);
    const estilo = rotationStyles.find((r) => r.id === st?.rotationStyleId);

    return (estilo?.nightShifts || 0) > 0;
  }, [assignTarget, stationsById, rotationStyles]);

  /**
   * `copiarHorasDe` — el turno cuyo horario hay que replicar. Al tapar una
   * falta, las horas que importan son las del turno que quedó vacío, no las
   * nominales del puesto: en una estación que alterna día/noche, las del puesto
   * mandaban al reemplazo al horario equivocado.
   */
  const openAssignForm = (
    stationId: string,
    positionId: string,
    dateStr?: string,
    copiarHorasDe?: ShiftRecord | null,
    /** A quién se cubre, para precargar el rango de SU novedad. */
    cubriendoA?: string,
    /** Sacafranco YA asignado que se viene a editar (patrón / estaciones). */
    editar?: GuardAssignment | null,
    /** Estaciones que cubrirá, cuando el sacafranco se acaba de crear para
     *  varias a la vez (multi-selección del editor de puestos). */
    cubrePrecargado?: string[],
  ) => {
    // ── DE DÓNDE SALEN LAS HORAS, EN ORDEN ────────────────────────────────
    // 1) El turno que se está cubriendo, si quien abre el menú lo sabe.
    // 2) Cualquier turno REAL de esa plaza ese día — la ventana que se trabaja.
    // 3) Las horas declaradas de la plaza.
    // El paso 2 es nuevo y es el que arregla el fallo: la rama «Cubrir este día
    // con un vigilante…» no pasa turno (la casilla no muestra fijo porque está
    // de vacaciones), así que se caía al paso 3 y creaba un turno diurno sobre
    // un puesto nocturno.
    let [ini, fin] = horasDelPuesto(positionId);
    const deLaPlaza = dateStr
      ? shiftByPosDate.get(`${positionId}|${dateStr}`)
      : null;

    if (!copiarHorasDe && deLaPlaza) copiarHorasDe = deLaPlaza;
    if (copiarHorasDe) {
      const hm = (m: number) =>
        `${String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

      ini = hm(dateToWall(new Date(copiarHorasDe.startTime), tzName).minutes);
      fin = hm(dateToWall(new Date(copiarHorasDe.endTime), tzName).minutes);
    }
    setAssignTarget({ stationId, positionId });
    setAssignGuard(editar?.guardId || "");
    setAssignStartDate(
      editar?.startDate
        ? String(editar.startDate).slice(0, 10)
        : dateStr || tzToday(),
    );
    setAssignStartTime(ini);
    setAssignEndTime(fin);
    // Editando: se abre con lo que ya tiene puesto, no en blanco — era la queja.
    setAssignEditing(editar || null);
    setAssignRotation(
      editar?.rotationStyleId ? String(editar.rotationStyleId) : "",
    );
    /* Editando se enseña lo que de verdad hay guardado: la fase es la inversa
       del índice (`fase = dse(alta) − índice`), así que el índice se recupera
       deshaciendo esa resta. Sin esto, abrir un sacafranco que entró en la
       noche 1 mostraría «D1» y guardarlo lo re-faseaba en silencio. */
    setAssignCycleStart(
      (() => {
        if (!editar?.rotationStyleId || !editar?.startDate) return 0;
        const rotEd = rotationStylesById.get(String(editar.rotationStyleId));

        if (!rotEd) return 0;
        const largo =
          (rotEd.dayShifts || 0) + (rotEd.nightShifts || 0) + (rotEd.restDays || 0);

        if (largo <= 0) return 0;
        const dse = dseOf(new Date(`${String(editar.startDate).slice(0, 10)}T00:00:00`));

        return (((dse - (Number(editar.platoonOffset) || 0)) % largo) + largo) % largo;
      })(),
    );
    setAssignCovered(
      cubrePrecargado?.length
        ? cubrePrecargado.map(String)
        : Array.isArray(editar?.coveredStationIds)
          ? (editar!.coveredStationIds as string[]).map(String)
          : [],
    );

    // ── SI SE ABRE SOBRE UNA NOVEDAD, SE PRECARGA SU RANGO COMPLETO ────────
    // Cubrir unas vacaciones es cubrir QUINCE días, no el día en que se hizo
    // clic. Las novedades se guardan una fila por día, así que el rango se
    // reconstruye caminando hacia delante mientras siga el MISMO código para
    // la misma persona. Con eso el modal abre ya en «rango» y con la última
    // fecha puesta: quien opera solo elige a quién manda.
    // Editar un sacafranco es siempre su rotación, nunca un día suelto.
    let modo: "single" | "rango" | "rotation" = editar
      ? "rotation"
      : dateStr
        ? "single"
        : "rotation";
    let hastaStr = dateStr || tzToday();

    if (dateStr && cubriendoA) {
      const ovIni = getOverride(cubriendoA, dateStr);

      if (ovIni && ["V", "PM", "F"].includes(String(ovIni.type))) {
        let cursor = dateStr;

        for (let i = 0; i < 120; i += 1) {
          const sig = addDaysStr(cursor, 1);
          const ovSig = getOverride(cubriendoA, sig);

          if (!ovSig || String(ovSig.type) !== String(ovIni.type)) break;
          cursor = sig;
        }
        if (cursor !== dateStr) {
          modo = "rango";
          hastaStr = cursor;
        }
      }
    }
    setAssignEndDate(hastaStr);
    // Con fecha (clic derecho sobre un día) se asume tapar ESE día; sin fecha,
    // el gesto sólo puede significar rotación.
    setAssignMode(modo);
    setMoveFrom(null);
    setShowAssignForm(true);
  };

  const onGuardDragStart = (
    e: React.DragEvent,
    guardId: string,
    fromAssignment?: GuardAssignment,
  ) => {
    mouseSelRef.current = false; // a native drag never fires the mouseup that ends cell-selection
    e.dataTransfer.setData("guardId", guardId);
    if (fromAssignment)
      e.dataTransfer.setData("fromAssignmentId", fromAssignment.id);
    e.dataTransfer.effectAllowed = "move";
  };

  // Drop an SF's día onto a puesto cell → open the COVERAGE modal: prefilled
  // with what the station is missing that day (the suggestion), but fully
  // editable — D, N, 24h or any custom window. The SF has no rotation; every
  // coverage is placed and shaped by hand.
  const [sfCover, setSfCover] = useState<{
    sfGuardId: string;
    sfName: string;
    station: Station;
    dateStr: string;
    startStr: string;
    endStr: string;
    suggested: string;
  } | null>(null);
  const [sfCoverSaving, setSfCoverSaving] = useState(false);
  // Click-to-assign: clicking a fijo's "L" cell opens a picker of sacafrancos to
  // cover that day (no dragging needed — critical for puestos high up the grid).
  const [sfPick, setSfPick] = useState<{
    station: Station;
    pos: StationPosition;
    dateStr: string;
    assignment: GuardAssignment;
    guardName: string;
  } | null>(null);

  const placeSfCoverage = async (
    station: Station,
    pos: StationPosition,
    dateStr: string,
    sfGuardId: string,
  ) => {
    const stFijos = assignments.filter(
      (a) =>
        a.stationId === station.id &&
        !a.isRelief &&
        positionsById.get(a.positionId)?.type === "fijo",
    );
    const day = new Date(dateStr + "T00:00:00");

    // GUARD: the SF only covers FREE days. If the puesto's fijo is working
    // that day (real shift or active rotation, and no absence novedad freeing
    // it), refuse — the day must be released first.
    const ABSENCES = ["V", "PM", "F", "L"];
    const occupiedBy = assignments
      .filter((a) => a.positionId === pos.id)
      .find((a) => {
        const ov = getOverride(a.guardId, dateStr);

        if (ov) return !ABSENCES.includes(ov.type); // absence novedad = day freed
        const s = shiftByGuardDate.get(`${a.guardId}|${dateStr}`);

        if (s && s.stationId === station.id) return true;

        return isWorkDay(a, day) !== "rest";
      });

    if (occupiedBy) {
      const nm = nombreDeVigilante(occupiedBy.guard, "el fijo");

      toast.error(
        `Ese día ${nm} está de turno en este puesto. Primero libera el día (novedad de Libre/Vacaciones/Permiso, o elimina el turno con clic derecho) y luego arrastra el sacafranco.`,
      );

      return;
    }
    const covered = new Set<string>();

    for (const a of stFijos) {
      const w = isWorkDay(a, day);

      if (w === "rest") continue;
      if (station.scheduleType === "12h-day") covered.add("day");
      else if (station.scheduleType === "12h-night") covered.add("night");
      else covered.add(w === "night" ? "night" : "day");
    }
    let startMin = 7 * 60,
      endMin = 19 * 60,
      endNextDay = false,
      code = "D";

    if (station.scheduleType === "custom" && pos.startTime && pos.endTime) {
      // Custom blocks carry their real hours on the position (24x24 → start==end).
      const toMin = (x: string) => {
        const [h, mm] = x.split(":").map((n) => parseInt(n, 10) || 0);

        return (h % 24) * 60 + (mm % 60);
      };

      startMin = toMin(pos.startTime);
      endMin = toMin(pos.endTime);
      endNextDay = endMin <= startMin; // wraps midnight (full 24h when equal)
      code = startMin >= 18 * 60 || startMin < 6 * 60 ? "N" : "D";
    } else {
      const req: string[] =
        station.scheduleType === "24h"
          ? ["day", "night"]
          : station.scheduleType === "12h-night"
            ? ["night"]
            : ["day"];
      const half = req.filter((h) => !covered.has(h))[0] || req[0];

      if (half === "night") {
        startMin = 19 * 60;
        endMin = 7 * 60;
        endNextDay = true;
        code = "N";
      }
    }
    // Open the coverage modal prefilled with the suggestion — the user shapes
    // the final turno (D / N / 24h / custom hours) before anything is created.
    const hhmm = (m: number) =>
      `${String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const g = guardsPool.find((x) => x.id === sfGuardId);
    const sfName =
      g?.label ||
      primerNombre(
        assignments.find((a) => a.guardId === sfGuardId)?.guard,
        "Sacafranco",
      );

    setSfCover({
      sfGuardId,
      sfName,
      station,
      dateStr,
      startStr: hhmm(startMin),
      endStr: hhmm(endMin),
      suggested: `${code} · ${hhmm(startMin)} – ${hhmm(endMin)}${endNextDay || endMin <= startMin ? " (día siguiente)" : ""}`,
    });
  };

  const saveSfCover = async () => {
    if (!sfCover) return;
    const toMin = (x: string) => {
      const [h, mm] = x.split(":").map((n) => parseInt(n, 10) || 0);

      return (h % 24) * 60 + (mm % 60);
    };
    const startMin = toMin(sfCover.startStr);
    let endMin = toMin(sfCover.endStr);
    const nextDay = endMin <= startMin; // wraps midnight (equal = full 24h)

    if (nextDay) endMin += 1440;
    const [y, mo, d] = sfCover.dateStr.split("-").map(Number);
    const start = wallToDate(y, mo, d, startMin, tzName);
    const end = wallToDate(y, mo, d, endMin, tzName);

    setSfCoverSaving(true);
    try {
      // Replace the SF's overlapping shifts (same rule as the turno único).
      const overlapping = shifts.filter(
        (s) =>
          s.guardId === sfCover.sfGuardId &&
          new Date(s.startTime) < end &&
          new Date(s.endTime) > start,
      );

      if (overlapping.length) {
        await ApiService.delete(
          `/tenant/${tenantId}/shift?ids=${overlapping.map((s) => s.id).join(",")}`,
        ).catch(() => {});
      }
      await ApiService.post(`/tenant/${tenantId}/shift`, {
        data: {
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          station: sfCover.station.id,
          guard: sfCover.sfGuardId,
          postSiteId: sfCover.station.postSiteId,
        },
      });
      toast.success(`Sacafranco cubre ${stationLabel(sfCover.station)}`);
      setSfCover(null);
      fetchAll({ silent: true });
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t(
            "ui.Schedule.errorAlAsignarLaCobertura",
            "Error al asignar la cobertura",
          ),
      );
    } finally {
      setSfCoverSaving(false);
    }
  };

  const removeSfCoverage = async (shift: ShiftRecord) => {
    const stName =
      stationsById.get(shift.stationId)?.stationName || "la estación";

    if (
      !(await confirmDialog({
        title: "Quitar cobertura",
        message: `¿Quitar la cobertura del sacafranco en ${stName} ese día? Se elimina el turno.`,
        confirmText: "Quitar",
        tone: "danger",
      }))
    )
      return;
    try {
      await ApiService.delete(`/tenant/${tenantId}/shift/${shift.id}`);
      toast.success("Cobertura eliminada");
      fetchAll({ silent: true });
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || "Error al eliminar");
    }
  };

  // ─── Right-click menu on the year canvas ─────────────────────────────────

  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  // "Trasladar a otra estación" from a right-clicked cell.
  const [transferTarget, setTransferTarget] = useState<TransferTarget | null>(
    null,
  );

  const duplicateShiftNextDay = async (s: ShiftRecord) => {
    try {
      const start = new Date(new Date(s.startTime).getTime() + 86400000);
      const end = new Date(new Date(s.endTime).getTime() + 86400000);

      await ApiService.post(`/tenant/${tenantId}/shift`, {
        data: {
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          station: s.stationId,
          guard: s.guardId,
          postSiteId: stationsById.get(s.stationId)?.postSiteId,
        },
      });
      toast.success(t("ui.Schedule.turnoDuplicadoAlDiaSiguiente"));
      fetchAll({ silent: true });
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || "Error al duplicar");
    }
  };

  const deleteDayShift = async (s: ShiftRecord) => {
    const msg = s.positionId
      ? "¿Eliminar el turno de este día? Fue generado por la rotación y puede regenerarse al reoptimizar o reasignar."
      : "¿Eliminar el turno de este día?";

    if (
      !(await confirmDialog({
        title: "Eliminar turno",
        message: msg,
        confirmText: "Eliminar",
        tone: "danger",
      }))
    )
      return;
    try {
      await ApiService.delete(`/tenant/${tenantId}/shift/${s.id}`);
      toast.success(t("comun.turnoEliminado"));
      fetchAll({ silent: true });
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || "Error al eliminar");
    }
  };

  const openCellCtx = (
    e: React.MouseEvent,
    station: Station,
    pos: StationPosition,
    posAssignments: GuardAssignment[],
    dateStr: string,
  ) => {
    e.preventDefault();
    const items: CtxItem[] = [];
    /* Cada casillero es una hoja de asistencia: lo que se puede hacer con él es
       cambiar QUÉ pasó (novedad), cambiar las horas o borrarlo. Antes esas tres
       cosas sólo llegaban a la PRIMERA persona de la plaza y nunca a quien vino
       a cubrir, así que un turno de cobertura no se podía ni editar ni borrar
       desde la hoja. Ahora sale una entrada por cada persona del casillero. */
    const varios = posAssignments.length > 1;

    for (const a of posAssignments) {
      const s = shiftByGuardDate.get(`${a.guardId}|${dateStr}`);
      const nm = primerNombre(a.guard, "vigilante");
      const full = nombreDeVigilante(a.guard, nm);
      const suf = varios ? ` de ${nm}` : "";

      items.push({
        label: `Cambiar a V / PM / F / L${suf}…`,
        onClick: () =>
          abrirNovedad({
            guardId: a.guardId,
            guardName: full,
            date: dateStr,
            assignmentId: a.id,
          }),
      });
      if (s && s.stationId === station.id) {
        items.push({
          label: `Editar el turno${suf}…`,
          onClick: () => openShiftEditor(s, full),
        });
        items.push({
          label: `Duplicar el turno${suf} al día siguiente`,
          onClick: () => void duplicateShiftNextDay(s),
        });
        items.push({
          label: `Eliminar el turno${suf} de este día`,
          danger: true,
          onClick: () => void deleteDayShift(s),
        });
      }
      items.push({ label: "—" });
    }
    /* Quien viene a CUBRIR también tiene su turno en este casillero. */
    for (const cs of coverageShiftsByStationDate.get(
      `${station.id}-${dateStr}`,
    ) || []) {
      if (posAssignments.some((a) => a.guardId === cs.guardId)) continue;
      const nm = primerNombre(
        cs.guard,
        guardsPool.find((x) => x.id === cs.guardId)?.label || "la cobertura",
      );
      const full = nombreDeVigilante(cs.guard, nm);

      items.push({
        label: `Cambiar a V / PM / F / L a ${nm} (cobertura)…`,
        onClick: () =>
          abrirNovedad({
            guardId: cs.guardId,
            guardName: full,
            date: dateStr,
          }),
      });
      items.push({
        label: `Eliminar la cobertura de ${nm}`,
        danger: true,
        onClick: () => void deleteDayShift(cs),
      });
      items.push({ label: "—" });
    }
    if (posAssignments.length) {
      const a = posAssignments[0];
      const guardName = nombreDeVigilante(a.guard, "Vigilante");
      // On a rest (L) day the puesto is uncovered — offer to assign a sacafranco
      // to cover it (opens the picker modal). Skip when it's already covered.
      // ── QUIÉN CUBRE ESTE DÍA ──────────────────────────────────────────
      // El día que el fijo libra («L») es el hueco de verdad, y es donde más se
      // usa el clic derecho. Antes esto sólo salía si NADIE lo cubría aún y
      // sólo ofrecía sacafrancos; ahora sale siempre en un día de descanso —
      // añadir un segundo relevo es legítimo— y el selector enseña a todos.
      const resting = isWorkDay(a, new Date(dateStr + "T00:00:00")) === "rest";
      const yaCubierto =
        (sfStationCoverage.get(`${station.id}-${dateStr}`) || []).length > 0;

      if (resting) {
        items.push({
          label: yaCubierto
            ? "Añadir otro relevo este día…"
            : "Cubrir este día…",
          onClick: () => {
            setSfPickQuery("");
            setSfPick({ station, pos, dateStr, assignment: a, guardName });
          },
        });
        items.push({ label: "—" });
      }
      // Trasladar works with or without a generated shift row: with one we move
      // that exact turno, without one the backend resolves the cell's date in
      // the tenant timezone. Gating this on a shift row hid it on most cells,
      // because the grid paints D/N/L from the rotation, not from shift rows.
      items.push({
        label: `Trasladar a ${primerNombre(a.guard, "vigilante")} a otra estación…`,
        onClick: () =>
          setTransferTarget({
            guardId: a.guardId,
            guardName,
            shiftId:
              shiftByGuardDate.get(`${a.guardId}|${dateStr}`)?.id ?? null,
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
        label: `Poner un aprendiz con ${primerNombre(a.guard, "este vigilante")}…`,
        onClick: () =>
          setShadowFor({
            assignmentId: a.id,
            titularName: guardName,
            stationName: stationLabel(station),
            guardId: "",
            startDate: dateStr,
            endDate: "",
          }),
      });

      // Doblar turno: el que está en el puesto se queda porque su relevo no
      // llegó. Va junto a «novedad» porque es la misma familia — lo que pasó de
      // verdad, no lo que estaba planificado.
      //
      // Se le pasa el PUESTO y el fin de su turno: son los dos datos que el
      // servidor tendría que adivinar de «su último turno», y adivinarlos
      // fallaba en cuanto el vigilante tenía turno al día siguiente.
      const suShift = shiftByGuardDate.get(`${a.guardId}|${dateStr}`);

      items.push({
        label: "Extender turno…",
        onClick: () =>
          setExtendTarget({
            guardId: a.guardId,
            guardName,
            stationId: station.id,
            stationName: stationLabel(station),
            scheduledEnd: suShift?.endTime ?? null,
          }),
      });
      const ov = getOverride(a.guardId, dateStr);
      // ── LA FALTA TIENE QUE TENER SALIDA ───────────────────────────────
      // Registrar la novedad es la mitad del trabajo: el puesto sigue vacío.
      // Desde la misma casilla se ofrece taparlo con otro vigilante (turno
      // suelto de ese día), que es el caso del relevo temporal. Doblar al que
      // ya está sigue estando arriba, en «Extender turno…».
      // ── EL MENÚ DICE LO QUE DE VERDAD PASA ────────────────────────────
      // Esta entrada aparece para F, V y PM, y la etiqueta decía «la falta de»
      // en los tres casos: con alguien de VACACIONES el menú ofrecía «cubrir la
      // falta de ABRAHAN» justo encima de «Quitar novedad (V)». No es una
      // errata cosmética — llamar falta a unas vacaciones aprobadas es
      // exactamente lo que no debe leer quien opera el cuadrante.
      //
      // `CODE_LABEL` es el mismo mapa que ya rotula la leyenda y las casillas
      // del horario, así que la palabra sale de un solo sitio y no se puede
      // desincronizar.
      const hayNovedad = ov && ["F", "V", "PM"].includes(String(ov.type));

      if (hayNovedad) {
        const queEs = (CODE_LABEL[String(ov!.type)] || "novedad").toLowerCase();
        const quien = primerNombre(a.guard, "este vigilante");

        items.push({
          // «Cubrir el turno de X (vacaciones) con otro vigilante…»: lo que se
          // cubre es el TURNO, y entre paréntesis por qué está libre.
          label: `Cubrir el turno de ${quien} (${queEs}) con otro vigilante…`,
          // Se pasa a QUIÉN se cubre para que el modal precargue el rango
          // completo de su novedad: unas vacaciones son quince días, y hasta
          // ahora había que repetir el diálogo día por día.
          onClick: () =>
            openAssignForm(station.id, pos.id, dateStr, suShift, a.guardId),
        });
      }
      if (ov) {
        // El código crudo no significa nada para quien no lo escribió: «(V)» se
        // lee como una letra, «Vacaciones» se lee como lo que es.
        items.push({
          label: `Quitar ${(CODE_LABEL[String(ov.type)] || `novedad (${ov.type})`).toLowerCase()}`,
          danger: true,
          onClick: () => void removeOverride(ov.id),
        });
      }
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
        items.push({ label: "—" });
        items.push({
          label: "Añadir un turno suelto aquí…",
          onClick: () => openAssignForm(station.id, pos.id, dateStr),
        });
      }
    } else {
      items.push({
        label: "Cubrir este día con un vigilante…",
        onClick: () => openAssignForm(station.id, pos.id, dateStr),
      });
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, items });
  };

  const openSfCtx = (
    e: React.MouseEvent,
    pos: StationPosition,
    sfGuard: GuardAssignment | null,
    dateStr: string,
  ) => {
    e.preventDefault();
    const items: CtxItem[] = [];

    if (sfGuard) {
      const covShift = shiftByGuardDate.get(`${sfGuard.guardId}|${dateStr}`);

      if (covShift) {
        items.push({
          label: "Editar cobertura (vista Día)…",
          onClick: () => jumpToDay(dateStr),
        });
        items.push({
          label: t(
            "ui.Schedule.duplicarAlDiaSiguiente",
            "Duplicar al día siguiente",
          ),
          onClick: () => void duplicateShiftNextDay(covShift),
        });
        items.push({
          label: "Quitar cobertura",
          danger: true,
          onClick: () => void removeSfCoverage(covShift),
        });
        items.push({ label: "—" });
      }
      const gName = nombreDeVigilante(sfGuard.guard, "Sacafranco");

      // Cambiarle el patrón o las estaciones que cubre sin tener que borrarlo y
      // volver a crearlo, que era la única vía.
      items.push({
        label: "Editar sacafranco (patrón y estaciones)…",
        onClick: () =>
          openAssignForm(
            pos.stationId,
            pos.id,
            undefined,
            null,
            undefined,
            sfGuard,
          ),
      });
      items.push({
        label: "Trasladar a otra estación…",
        onClick: () =>
          setTransferTarget({
            guardId: sfGuard.guardId,
            guardName: gName,
            shiftId: covShift?.id ?? null,
            stationId: covShift?.stationId ?? pos.stationId,
            stationName:
              stations.find(
                (st) => st.id === (covShift?.stationId ?? pos.stationId),
              )?.stationName || null,
            dateStr,
          }),
      });
      items.push({
        label: "Marcar el día (V / PM / F / L)…",
        onClick: () =>
          abrirNovedad({
            guardId: sfGuard.guardId,
            guardName: gName,
            date: dateStr,
            assignmentId: sfGuard.id,
          }),
      });
      items.push({
        label: "Extender turno…",
        onClick: () =>
          setExtendTarget({
            guardId: sfGuard.guardId,
            guardName: gName,
            stationId: covShift?.stationId ?? pos.stationId,
            stationName:
              stations.find(
                (st) => st.id === (covShift?.stationId ?? pos.stationId),
              )?.stationName || null,
            scheduledEnd: covShift?.endTime ?? null,
          }),
      });
      const ov = getOverride(sfGuard.guardId, dateStr);

      if (ov)
        items.push({
          label: `Deshacer ${(CODE_LABEL[String(ov.type)] || ov.type).toLowerCase()} — volver a su turno`,
          danger: true,
          onClick: () => void removeOverride(ov.id),
        });
    } else {
      // La posición de sacafranco admite las dos cosas: tapar ese día (turno
      // suelto) o dejar a alguien fijo en la posición (rotación). El diálogo
      // pregunta cuál; el nombre ya no promete sólo una.
      items.push({
        label: "Asignar a esta posición…",
        onClick: () => openAssignForm(pos.stationId, pos.id, dateStr),
      });
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, items });
  };

  /* ─── MOVER UNA COBERTURA ARRASTRÁNDOLA ──────────────────────────────────
     Cubrir unas vacaciones crea N turnos sueltos, uno por día. Cuando la fecha
     se corre —el vigilante adelanta el viaje, el cliente cambia el día— había
     que borrarlos y rehacerlos uno a uno.

     No hay id de lote en la base: el rango se guarda como turnos independientes.
     Así que el lote se RECONSTRUYE caminando hacia los dos lados mientras el
     mismo vigilante siga teniendo cobertura al día siguiente — la misma técnica
     con la que el diálogo de cubrir reconstruye el rango de una novedad. Por eso
     el modal pregunta: este día, o el bloque entero. */

  /** ¿Este turno es una cobertura (y no el turno de rotación de una plaza)? */
  const esUnaCobertura = useCallback(
    (s: ShiftRecord) => !s.positionId || reliefGuardIds.has(s.guardId),
    [reliefGuardIds],
  );

  const diaDelTurno = useCallback(
    (s: ShiftRecord) => dateToWall(new Date(s.startTime), tzName).dateStr,
    [tzName],
  );

  const loteDeCobertura = useCallback(
    (s: ShiftRecord): ShiftRecord[] => {
      const lote = [s];

      for (const paso of [-1, 1]) {
        let cursor = diaDelTurno(s);

        for (let i = 0; i < 180; i += 1) {
          cursor = addDaysStr(cursor, paso);
          const vecino = shiftByGuardDate.get(`${s.guardId}|${cursor}`);

          if (!vecino || vecino.id === s.id || !esUnaCobertura(vecino)) break;
          lote.push(vecino);
        }
      }

      return lote.sort((a, b) => a.startTime.localeCompare(b.startTime));
    },
    [shiftByGuardDate, esUnaCobertura, diaDelTurno],
  );

  const [moveCover, setMoveCover] = useState<{
    shift: ShiftRecord;
    lote: ShiftRecord[];
    stationId: string;
    dateStr: string;
    delta: number;
  } | null>(null);
  const [moveSaving, setMoveSaving] = useState(false);

  const onCoverageDragStart = (e: React.DragEvent, shiftId: string) => {
    mouseSelRef.current = false; // un arrastre nativo no dispara el mouseup que cierra la selección
    e.dataTransfer.setData("coverShiftId", shiftId);
    e.dataTransfer.effectAllowed = "move";
  };

  const aplicarMovimiento = async (soloEste: boolean) => {
    if (!moveCover) return;
    const { shift, lote, stationId, dateStr, delta } = moveCover;
    const objetivo = soloEste ? [shift] : lote;
    const st = stationsById.get(stationId);

    setMoveSaving(true);
    let movidos = 0;
    const fallados: string[] = [];

    for (const s of objetivo) {
      const ini = new Date(s.startTime);
      const fin = new Date(s.endTime);
      const w = dateToWall(ini, tzName);
      // El día nuevo con la MISMA hora de pared, y la duración exacta encima:
      // sumar 24 h en milisegundos se descuadra una hora en el cambio horario,
      // y lo que se paga son las horas trabajadas, no el reloj.
      const destino = addDaysStr(w.dateStr, delta);
      const [dy, dm, dd] = destino.split("-").map(Number);
      const nuevoIni = wallToDate(dy, dm, dd, w.minutes, tzName);
      const nuevoFin = new Date(
        nuevoIni.getTime() + (fin.getTime() - ini.getTime()),
      );

      try {
        await ApiService.put(`/tenant/${tenantId}/shift/${s.id}`, {
          data: {
            // `station` y `postSite` van SIEMPRE: el servidor los reasigna sin
            // comprobar si venían, así que omitirlos los pondría a null.
            station: stationId,
            postSite: st?.postSiteId,
            guard: s.guardId,
            startTime: nuevoIni.toISOString(),
            endTime: nuevoFin.toISOString(),
            // Se desliga de la plaza vieja: una cobertura vive del puesto y el
            // día, y conservar una plaza de la estación de origen la haría
            // desaparecer de la rejilla al cambiar de puesto.
            positionId: null,
          },
        });
        movidos += 1;
      } catch (err: any) {
        // Un día que falla no aborta el resto, y se dice CUÁL.
        fallados.push(diaDelTurno(s));
      }
    }
    setMoveSaving(false);
    if (!movidos) {
      toast.error(
        `No se pudo mover${fallados.length ? ` (${fallados.length} día(s) con error)` : ""}.`,
      );
    } else if (fallados.length) {
      toast.warning(
        `${movidos} día(s) movido(s). Falló en: ${fallados.join(", ")}.`,
      );
    } else {
      toast.success(
        movidos === 1 ? "Cobertura movida" : `${movidos} días movidos`,
      );
    }
    if (movidos) {
      setMoveCover(null);
      fetchAll({ silent: true });
    }
  };

  const handleDrop = (
    e: React.DragEvent,
    stationId: string,
    positionId: string,
    dateStr?: string,
  ) => {
    e.preventDefault();
    // Una tarjeta de cobertura arrastrada = mover ese turno (y quizá su bloque).
    const coverShiftId = e.dataTransfer.getData("coverShiftId");

    if (coverShiftId && dateStr) {
      const s = shifts.find((x) => x.id === coverShiftId);

      if (!s) return;
      const origen = diaDelTurno(s);

      if (origen === dateStr && s.stationId === stationId) return; // no se movió
      const delta = diasEntre(origen, dateStr) - 1; // `diasEntre` es inclusivo

      setMoveCover({
        shift: s,
        lote: loteDeCobertura(s),
        stationId,
        dateStr,
        delta,
      });

      return;
    }
    // An SF día dropped on a puesto cell = place coverage (not an assignment).
    const sfCoverGuardId = e.dataTransfer.getData("sfCoverGuardId");

    if (sfCoverGuardId) {
      const st = stationsById.get(stationId);
      const pos = positionsById.get(positionId);

      if (st && pos && pos.type !== "sacafranco" && dateStr)
        void placeSfCoverage(st, pos, dateStr, sfCoverGuardId);

      return;
    }
    const guardId = e.dataTransfer.getData("guardId");

    if (!guardId) return;
    const fromId = e.dataTransfer.getData("fromAssignmentId") || "";
    const from = fromId
      ? assignments.find((a) => a.id === fromId) || null
      : null;

    if (from && from.positionId === positionId) return; // dropped back on its own puesto
    const [ini, fin] = horasDelPuesto(positionId);

    setMoveFrom(from);
    setAssignTarget({ stationId, positionId });
    setAssignGuard(guardId);
    setAssignStartDate(dateStr || tzToday());
    setAssignStartTime(ini);
    setAssignEndTime(fin);
    // Un traslado es siempre rotación; soltar sobre un día es tapar ese día.
    setAssignMode(from ? "rotation" : dateStr ? "single" : "rotation");
    setShowAssignForm(true);
  };

  const saveAssignment = async () => {
    if (!assignTarget || !assignGuard) {
      toast.error(t("comun.completeTodosLosCampos"));

      return;
    }
    const isSacafranco =
      positions.find((p) => p.id === assignTarget.positionId)?.type ===
      "sacafranco";

    // ── SÓLO ESTE DÍA ──────────────────────────────────────────────────────
    // Un turno suelto, exactamente el mismo que dibujar un bloque en la vista
    // Día o el «Turno único» de la estación: una petición, sin rotación y sin
    // generar un año de turnos. Es lo que hace falta para tapar un hueco.
    if (assignMode === "single" || assignMode === "rango") {
      const toMin = (x: string) => {
        const [h, mm] = x.split(":").map((n) => parseInt(n, 10) || 0);

        return (h % 24) * 60 + (mm % 60);
      };
      const startMin = toMin(assignStartTime);
      let endMin = toMin(assignEndTime);

      // Fin ≤ inicio = cruza la medianoche (iguales = 24 h completas).
      if (endMin <= startMin) endMin += 1440;

      // ── LOS DÍAS A CUBRIR ────────────────────────────────────────────────
      // Un día, o todos los del rango. El rango se acota a 92 días: un año
      // teclado por error («2036» en vez de «2026») crearía miles de turnos, y
      // eso no se deshace con un botón.
      const TOPE_DIAS = 92;
      const dias: string[] = [];

      if (assignMode === "single") {
        dias.push(assignStartDate);
      } else {
        const n = diasEntre(assignStartDate, assignEndDate);

        if (n < 1) {
          toast.error("El último día no puede ser anterior al primero.");

          return;
        }
        if (n > TOPE_DIAS) {
          toast.error(
            `El rango son ${n} días; el máximo es ${TOPE_DIAS}. Divídelo en tramos.`,
          );

          return;
        }
        for (let i = 0; i < n; i += 1)
          dias.push(addDaysStr(assignStartDate, i));
      }

      setAssignSaving(true);
      const st = stationsById.get(assignTarget.stationId);
      let creados = 0;
      let reemplazados = 0;
      const fallados: string[] = [];

      try {
        for (const diaStr of dias) {
          const [y, mo, d] = diaStr.split("-").map(Number);
          const start = wallToDate(y, mo, d, startMin, tzName);
          const end = wallToDate(y, mo, d, endMin, tzName);

          try {
            // Reemplaza, no duplica: misma regla que el bloque dibujado y el
            // turno único. Se hace por día para que un solape en el día 7 no
            // impida crear los otros catorce.
            const solapados = shifts.filter(
              (x) =>
                x.guardId === assignGuard &&
                new Date(x.startTime) < end &&
                new Date(x.endTime) > start,
            );

            if (solapados.length) {
              await ApiService.delete(
                `/tenant/${tenantId}/shift?ids=${solapados.map((x) => x.id).join(",")}`,
              ).catch(() => {});
              reemplazados += solapados.length;
            }
            await ApiService.post(`/tenant/${tenantId}/shift`, {
              data: {
                startTime: start.toISOString(),
                endTime: end.toISOString(),
                station: assignTarget.stationId,
                guard: assignGuard,
                postSiteId: st?.postSiteId,
              },
            });
            creados += 1;
          } catch (e: any) {
            // Un día que falla NO aborta el resto: cubrir 14 de 15 días y saber
            // cuál falta es mucho mejor que quedarse sin saber qué se creó.
            fallados.push(diaStr);
          }
        }

        if (!creados) {
          toast.error(
            `No se pudo crear ningún turno${fallados.length ? ` (${fallados.length} día(s) con error)` : ""}.`,
          );
        } else if (fallados.length) {
          // Se dicen las fechas: sin ellas hay que revisar el cuadrante a mano.
          toast.warning(
            `${creados} turno(s) creado(s). Falló en: ${fallados.join(", ")}.`,
          );
        } else if (dias.length > 1) {
          toast.success(
            `${creados} turnos creados${reemplazados ? ` (reemplazaron ${reemplazados} solapado(s))` : ""}`,
          );
        } else {
          toast.success(
            reemplazados
              ? "Turno creado (reemplazó turnos solapados)"
              : "Turno creado para ese día",
          );
        }

        if (creados) {
          setShowAssignForm(false);
          setMoveFrom(null);
          fetchAll({ silent: true });
        }
      } catch (e: any) {
        toast.error(
          e?.data?.message ||
            e?.message ||
            t("ui.Schedule.errorAlCrearElTurno", "Error al crear el turno"),
        );
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
        await ApiService.delete(
          `/tenant/${tenantId}/guard-assignment/${moveFrom.id}`,
        );
      }
      await ApiService.post(`/tenant/${tenantId}/guard-assignment`, {
        data: {
          guardId: assignGuard,
          stationId: assignTarget.stationId,
          positionId: assignTarget.positionId,
          startDate: assignStartDate,
          isRelief: isSacafranco,
          // Un FIJO no manda patrón: hereda el de la estación (el servidor
          // ignora lo que llegue). Un SACAFRANCO sí puede traer el suyo y su
          // lista de estaciones; vacíos = el defecto de antes (patrón de la
          // estación, cubre todas las de fijos).
          ...(isSacafranco
            ? {
                rotationStyleId: assignRotation || null,
                // Sin patrón no hay ciclo en el que entrar: el índice sólo
                // significa algo acompañado de una rotación.
                cycleStartIndex: assignRotation ? assignCycleStart : 0,
                coveredStationIds: assignCovered.length ? assignCovered : null,
              }
            : {}),
        },
      });
      toast.success(
        moveFrom
          ? "Vigilante movido de puesto"
          : assignEditing
            ? "Sacafranco actualizado"
            : "Vigilante asignado",
      );
      setShowAssignForm(false);
      setMoveFrom(null);
      fetchAll();
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || "Error al asignar");
    } finally {
      setAssignSaving(false);
    }
  };

  const removeAssignment = async (assignmentId: string) => {
    if (
      !(await confirmDialog({
        title: t("ui.Schedule.removerAsignacion", "Remover asignación"),
        message:
          "¿Remover esta asignación? Los turnos futuros se anulan; los ya trabajados se conservan en el historial.",
        confirmText: "Remover",
        tone: "danger",
      }))
    )
      return;
    try {
      await ApiService.delete(
        `/tenant/${tenantId}/guard-assignment/${assignmentId}`,
      );
      toast.success(t("ui.Schedule.asignacionRemovida"));
      fetchAll();
    } catch (e: any) {
      toast.error(e?.message || "Error");
    }
  };

  const configureStation = (station: Station) => {
    setConfigStation(station);
    setConfigType(station.scheduleType || "24h");
    setConfigRotation(station.rotationStyleId || "");
    setCfgStart("07:00");
    setCfgEnd("07:00");
    setCfgBlockHours("");
    setCfgRestCoverage("sacafranco");
    setCfgRotStyle(null);
    // The overview payload doesn't carry the custom window/coverage — fetch the
    // station detail (best-effort) so the modal opens with the current values.
    ApiService.get(`/tenant/${tenantId}/station/${station.id}`)
      .then((res: StationConfigDetail & { data?: StationConfigDetail }) => {
        const s = res?.data ?? res ?? {};

        if (s.startingTimeInDay)
          setCfgStart(String(s.startingTimeInDay).slice(0, 5));
        if (s.finishTimeInDay) setCfgEnd(String(s.finishTimeInDay).slice(0, 5));
        if (s.restCoverage === "alternate") setCfgRestCoverage("alternate");
      })
      .catch(() => {
        /* defaults stand */
      });
  };

  const saveStationConfig = async () => {
    if (!configStation) return;
    if (configType === "custom") {
      if (!cfgStart || !cfgEnd) {
        toast.error(t("comun.defineLaHoraDeInicio"));

        return;
      }
      if (cfgBlockHours && !cfgBlocksOk) {
        toast.error(t("comun.laDuracionDelTurnoDebe"));

        return;
      }
      if (cfgRestCoverage === "alternate" && !cfgAlternateOk) {
        toast.error(t("comun.paraAlternarSinSacafrancoEl"));

        return;
      }
    }
    if (
      !(await confirmDialog({
        message:
          "Cambiar el horario reconfigura los puestos del turno. Si hay vigilantes asignados a esta estación, deberán reasignarse. ¿Continuar?",
        confirmText: "Continuar",
      }))
    )
      return;
    setConfigSaving(true);
    try {
      // Same payload as the station-page editor — one engine, two doors.
      await ApiService.post(
        `/tenant/${tenantId}/station/${configStation.id}/auto-positions`,
        {
          data: {
            scheduleType: configType,
            rotationStyleId: configRotation || undefined, // alternate + none → engine seeds 1-1
            startTime: configType === "custom" ? cfgStart : undefined,
            endTime: configType === "custom" ? cfgEnd : undefined,
            blockHours:
              configType === "custom" && cfgBlockHours
                ? Number(cfgBlockHours)
                : undefined,
            restCoverage: configType === "custom" ? cfgRestCoverage : undefined,
          },
        },
      );
      toast.success(t("ui.Schedule.estacionConfigurada"));
      setConfigStation(null);
      fetchAll();
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || "Error");
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
   * reconcilia los turnos futuros con las horas nuevas SIN tocar a quién está
   * asignado (`reconcileScheduleChange`, acotado a esa plaza). Si no puede
   * rehacerlos devuelve 409 y deja el puesto como estaba: no existe el estado
   * «configuración nueva + turnos viejos + pantalla contenta». El mismo
   * formulario crea (POST) cuando no hay `positionId`.
   */
  /** Alta de un aprendiz que acompaña a un titular. */
  const [shadowFor, setShadowFor] = useState<{
    assignmentId: string;
    titularName: string;
    stationName: string;
    guardId: string;
    startDate: string;
    endDate: string;
  } | null>(null);
  const [shadowSaving, setShadowSaving] = useState(false);

  const saveShadow = async () => {
    if (!shadowFor) return;
    if (!shadowFor.guardId) {
      toast.error("Elige al aprendiz");

      return;
    }
    if (!shadowFor.endDate) {
      toast.error("Un acompañamiento necesita fecha de fin");

      return;
    }
    setShadowSaving(true);
    try {
      await ApiService.post(
        `/tenant/${tenantId}/guard-assignment/${shadowFor.assignmentId}/shadow`,
        {
          data: {
            guardId: shadowFor.guardId,
            startDate: shadowFor.startDate,
            endDate: shadowFor.endDate,
          },
        },
      );
      toast.success(
        "Aprendiz en acompañamiento — sigue los días del titular y no cuenta como cobertura",
      );
      setShadowFor(null);
      fetchAll({ silent: true });
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          "No se pudo registrar el acompañamiento",
      );
    } finally {
      setShadowSaving(false);
    }
  };

  const [posEditor, setPosEditor] = useState<{
    /** Estación BASE: de la que cuelga la posición. Al editar es la única. */
    stationId: string;
    /** Al CREAR: todas las estaciones marcadas. Un sacafranco suele cubrir
     *  varios puestos, así que la selección es múltiple; la primera marcada
     *  es la base y el resto son las que cubrirá. */
    stationIds: string[];
    positionId?: string;
    stationName: string;
    name: string;
    type: string;
    startTime: string;
    endTime: string;
    guardsNeeded: string;
    /* ── EL ASISTENTE DEL SACAFRANCO ──────────────────────────────────────
       Crear un sacafranco no es «agregar un puesto»: lo que hay que decidir es
       QUIÉN es, QUÉ horas cubre, si su mes es ROTATIVO o se coloca a mano, y
       EN QUÉ estaciones cubre — y de cuál cuelga su horario. Eso vive en dos
       tablas (la posición y la asignación), pero para quien opera es UNA sola
       decisión, así que se pregunta de una vez y se guarda en dos pasos. */
    sfWizard?: boolean;
    guardId?: string;
    rotMode?: "rotativo" | "manual";
    rotationStyleId?: string;
    /* ── EL CICLO, EN TRES NÚMEROS ────────────────────────────────────────
       El asistente ya no pide un patrón del catálogo: pide el ciclo con tres
       ruedas —cuántos turnos de día, cuántos de tarde/noche, cuántos libres—.
       Un desplegable sólo deja elegir combinaciones que alguien creó antes, y
       el ciclo de un sacafranco casi nunca coincide con las que hay. Al
       guardar se busca el patrón que tenga esos tres números y, si no existe,
       se crea uno (ver `resolverEstiloDeRotacion`). */
    rotDays?: number;
    rotNights?: number;
    rotRest?: number;
    /** Qué día de su ciclo es el PRIMER DÍA: 0 = el primer turno de día. */
    cycleStartIndex?: number;
    /** Cuántos días de su ciclo va a cada estación cubierta. */
    stationDays?: Record<string, number>;
    startDate?: string;
  } | null>(null);
  const [posSaving, setPosSaving] = useState(false);

  const addPosition = (stationId: string) => {
    const st = stationsById.get(stationId);

    setPosEditor({
      stationId,
      stationIds: stationId ? [stationId] : [],
      stationName: st ? stationLabel(st) : "",
      name: "Sacafranco",
      type: "sacafranco",
      startTime: "07:00",
      endTime: "19:00",
      guardsNeeded: "1",
    });
  };

  /* «Agregar sacafranco» desde la franja de sacafrancos: no viene de ninguna
     estación, así que abre el editor SIN estación y el modal pregunta a cuál
     va. Antes la única puerta era el «+» de un puesto concreto, y por eso el
     sacafranco recién creado aparecía colgado de una estación que el usuario
     no había elegido. */
  const addSacafranco = () => {
    setPosEditor({
      stationId: "",
      stationIds: [],
      stationName: "",
      name: "Sacafranco",
      type: "sacafranco",
      startTime: "07:00",
      endTime: "19:00",
      guardsNeeded: "1",
      sfWizard: true,
      guardId: "",
      rotMode: "manual",
      rotationStyleId: "",
      rotDays: 5,
      rotNights: 0,
      rotRest: 2,
      cycleStartIndex: 0,
      stationDays: {},
      startDate: tzToday(),
    });
  };

  const editPosition = (station: Station, pos: StationPosition) => {
    setPosEditor({
      stationId: station.id,
      stationIds: [station.id],
      positionId: pos.id,
      stationName: stationLabel(station),
      name: pos.name || "",
      type: pos.type || "fijo",
      startTime: (pos.startTime || "07:00").slice(0, 5),
      endTime: (pos.endTime || "19:00").slice(0, 5),
      guardsNeeded: String((pos as any).guardsNeeded ?? 1),
    });
  };

  /**
   * ── UN SACAFRANCO PARA VARIOS PUESTOS ────────────────────────────────────
   * Un sacafranco casi nunca cubre una sola estación: cubre los descansos de
   * varias. El modelo ya lo contempla, pero en dos sitios distintos:
   *
   *   · la POSICIÓN cuelga de UNA estación (su base, la fila que se ve en la
   *     hoja);
   *   · la ASIGNACIÓN lleva `coveredStationIds`, que es lo que de verdad mira
   *     el generador para decidir qué descansos puede tapar.
   *
   * Por eso al marcar varias estaciones NO se crean varias filas de sacafranco
   * —eso era justo la queja de las «4 filas iguales»—: se crea UNA en la
   * primera marcada y se abre la asignación con TODAS ya marcadas como las que
   * cubre. Un FIJO sí es de su estación y nada más, así que ahí sí sale una
   * posición por cada estación marcada.
   */
  /**
   * ── DE TRES NÚMEROS A UN PATRÓN ──────────────────────────────────────────
   * El asistente pregunta el ciclo con ruedas (3 día · 3 noche · 2 libre), pero
   * la asignación guarda un `rotationStyleId`. Aquí se cierra ese hueco: si la
   * empresa ya tiene un patrón con esos tres números se reutiliza —el catálogo
   * no se llena de «4-4-2» repetidos—, y si no, se crea uno con ese nombre.
   * El backend hace la misma comprobación (`reuseIfExists`) por si dos altas
   * simultáneas piden el mismo ciclo.
   */
  const resolverEstiloDeRotacion = async (
    dia: number,
    noche: number,
    libre: number,
  ): Promise<string | null> => {
    const d = Math.max(0, Math.floor(dia || 0));
    const n = Math.max(0, Math.floor(noche || 0));
    const l = Math.max(0, Math.floor(libre || 0));

    if (d + n < 1) {
      toast.error("El ciclo necesita al menos un turno de trabajo.");

      return null;
    }

    const igual = rotationStyles.find(
      (r) =>
        r.dayShifts === d &&
        r.nightShifts === n &&
        r.restDays === l &&
        !(r as any).alternatesDayNight &&
        !(r as any).sundayDoubleRest,
    );

    if (igual) return igual.id;

    const nombre = n > 0 ? `${d}-${n}-${l}` : `${d}-${l}`;
    const res: any = await ApiService.post(
      `/tenant/${tenantId}/rotation-style`,
      {
        data: {
          name: nombre,
          description:
            n > 0
              ? `${d} día · ${n} noche · ${l} libre`
              : `${d} trabaja · ${l} libre`,
          dayShifts: d,
          nightShifts: n,
          restDays: l,
          reuseIfExists: true,
        },
      },
    );
    const creado = res?.data ?? res;

    if (!creado?.id) {
      toast.error("No se pudo guardar el ciclo de rotación.");

      return null;
    }
    setRotationStyles((prev) =>
      prev.some((r) => r.id === creado.id) ? prev : [...prev, creado],
    );

    return String(creado.id);
  };

  const savePosition = async () => {
    if (!posEditor) return;
    const esSf = posEditor.type === "sacafranco";
    /* Sólo el asistente del sacafranco marca VARIAS estaciones. El «+» de un
       puesto trae la suya y punto — meterle ahí un selector convertía «agregar
       un vigilante a esta estación» en el diálogo del sacafranco. */
    const ids =
      posEditor.sfWizard && !posEditor.positionId
        ? posEditor.stationIds
        : posEditor.stationId
          ? [posEditor.stationId]
          : [];

    if (!ids.length) {
      toast.error("Elige al menos una estación");

      return;
    }
    if (!posEditor.name.trim()) {
      toast.error("Ponle un nombre al puesto");

      return;
    }
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
        await ApiService.put(
          `/tenant/${tenantId}/station/${posEditor.stationId}/positions/${posEditor.positionId}`,
          { data },
        );
        /* Este mensaje ya no es una promesa: el servidor sólo responde 200
           cuando los turnos futuros SE REHICIERON de verdad. Si la
           reconciliación falla devuelve 409, deja el puesto con sus horas
           anteriores y el `catch` de abajo enseña el motivo. Antes se
           prometía lo mismo pasara lo que pasara. */
        toast.success(
          "Puesto actualizado — los turnos futuros se rehicieron con las horas nuevas",
        );
        setPosEditor(null);
        fetchAll({ silent: true });

        return;
      }

      if (esSf) {
        /* La estación BASE es de la que cuelga su fila y donde empieza su
           horario; las marcadas son las que cubre. Son dos cosas distintas y
           por eso se preguntan por separado en el asistente. */
        const base =
          posEditor.stationId && ids.includes(posEditor.stationId)
            ? posEditor.stationId
            : ids[0];
        const creado: any = await ApiService.post(
          `/tenant/${tenantId}/station/${base}/positions`,
          { data: { ...data, sortOrder: 99 } },
        );
        const nuevoId = creado?.id || creado?.data?.id || "";

        // Con vigilante elegido se cierra el círculo aquí mismo: posición +
        // asignación con SU patrón y SUS estaciones. Sin vigilante se queda la
        // fila creada y se asigna después.
        if (posEditor.sfWizard && posEditor.guardId && nuevoId) {
          /* El ciclo elegido con las ruedas se convierte aquí en patrón. Si no
             se puede, se corta: mandar la asignación sin ciclo la daría de alta
             tapando huecos, que es justo lo que el operador acaba de NO pedir. */
          let estilo: string | null = null;

          if (posEditor.rotMode === "rotativo") {
            estilo = await resolverEstiloDeRotacion(
              posEditor.rotDays ?? 5,
              posEditor.rotNights ?? 0,
              posEditor.rotRest ?? 2,
            );
            if (!estilo) return; // `finally` baja el indicador de guardado
          }

          await ApiService.post(`/tenant/${tenantId}/guard-assignment`, {
            data: {
              guardId: posEditor.guardId,
              stationId: base,
              positionId: nuevoId,
              startDate: posEditor.startDate || tzToday(),
              isRelief: true,
              rotationStyleId: estilo,
              /* EN QUÉ PUNTO DEL CICLO ENTRA. 0 = su primer día es el primer
                 turno de día, que es lo de siempre. Lo demás es lo que pasa a
                 diario: entra en la noche 1, o su primer día es libre. */
              cycleStartIndex:
                posEditor.rotMode === "rotativo"
                  ? posEditor.cycleStartIndex || 0
                  : 0,
              coveredStationIds: ids.length ? ids : null,
              // Reparto por estación: sólo lo marcado y sólo si suma algo.
              coveredStationDays: (() => {
                const d = posEditor.stationDays || {};
                const limpio: Record<string, number> = {};

                for (const sid of ids)
                  if (Number(d[sid]) > 0) limpio[sid] = Number(d[sid]);

                return Object.keys(limpio).length ? limpio : null;
              })(),
            },
          });
          setPosEditor(null);
          toast.success(
            posEditor.rotMode === "rotativo"
              ? `Sacafranco creado y asignado — cubre ${ids.length} estación(es). Sus turnos tardan unos segundos.`
              : `Sacafranco creado y asignado — cubre ${ids.length} estación(es). Su mes empieza en blanco: coloca sus días arrastrándolos o con «Optimizar sacafrancos».`,
          );
          fetchAll();

          return;
        }

        /* SIN VIGILANTE se crea la fila y se abre la asignación. Lo elegido en
           el asistente —el ciclo y por qué casilla entra— viaja con ella: antes
           se perdía en silencio y el diálogo siguiente abría en blanco, así que
           configurar la rotación aquí no servía de nada si no se elegía a
           alguien en el mismo paso. */
        let estiloPrecargado: string | null = null;

        if (posEditor.rotMode === "rotativo") {
          estiloPrecargado = await resolverEstiloDeRotacion(
            posEditor.rotDays ?? 5,
            posEditor.rotNights ?? 0,
            posEditor.rotRest ?? 2,
          );
          if (!estiloPrecargado) return; // `finally` baja el indicador
        }

        setPosEditor(null);
        // Se espera al refresco: la asignación que se abre a continuación lee
        // el tipo de la posición recién creada para saber que es un relevo.
        await fetchAll({ silent: true });
        toast.success(
          ids.length > 1
            ? `Sacafranco creado — cubrirá ${ids.length} estaciones`
            : "Sacafranco creado",
        );
        if (nuevoId) {
          openAssignForm(base, nuevoId, undefined, null, undefined, null, ids);
          // `openAssignForm` calcula las horas del mapa de posiciones, que en
          // este render todavía no tiene la nueva: se imponen las del editor.
          setAssignStartTime(posEditor.startTime);
          setAssignEndTime(posEditor.endTime);
          setAssignStartDate(posEditor.startDate || tzToday());
          setAssignRotation(estiloPrecargado || "");
          setAssignCycleStart(
            estiloPrecargado ? posEditor.cycleStartIndex || 0 : 0,
          );
        }

        return;
      }

      // Fijo: una posición por estación marcada.
      for (const stId of ids) {
        await ApiService.post(`/tenant/${tenantId}/station/${stId}/positions`, {
          data: { ...data, sortOrder: 99 },
        });
      }
      toast.success(
        ids.length > 1 ? `${ids.length} puestos agregados` : "Puesto agregado",
      );
      setPosEditor(null);
      fetchAll({ silent: true });
    } catch (e: any) {
      toast.error(
        e?.data?.message || e?.message || "No se pudo guardar el puesto",
      );
    } finally {
      setPosSaving(false);
    }
  };

  const deletePosition = async (stationId: string, positionId: string) => {
    if (
      !(await confirmDialog({
        title: t("ui.Schedule.eliminarPosicion", "Eliminar posición"),
        message: "¿Eliminar esta posición?",
        confirmText: "Eliminar",
        tone: "danger",
      }))
    )
      return;
    try {
      await ApiService.delete(
        `/tenant/${tenantId}/station/${stationId}/positions/${positionId}`,
      );
      toast.success(t("ui.Schedule.posicionEliminada"));
      fetchAll();
    } catch (e: any) {
      toast.error(e?.message || "Error al eliminar");
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
      const gen = await ApiService.post(
        `/tenant/${tenantId}/scheduler/proposals`,
        { data: { scope: "tenant" } },
      );
      const id = gen?.proposalId || gen?.data?.proposalId;

      if (!id) throw new Error("No se pudo generar el borrador");
      const detail = await ApiService.get(
        `/tenant/${tenantId}/scheduler/proposals/${id}`,
      );

      setProposalData(detail?.data ?? detail);
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t(
            "ui.Schedule.errorGenerandoElBorrador",
            "Error generando el borrador",
          ),
      );
    } finally {
      setProposalLoading(false);
    }
  };

  const publishProposal = async (allowGaps = false) => {
    const id = proposalData?.proposal?.id;

    if (!id) return;
    setPublishing(true);
    try {
      const res = await ApiService.post(
        `/tenant/${tenantId}/scheduler/proposals/${id}/publish`,
        { data: { confirm: true, allowGaps } },
      );
      const notified =
        res?.plan?.notifiedGuards ?? res?.data?.plan?.notifiedGuards ?? 0;

      toast.success(
        `Horario publicado · ${notified} vigilante${notified === 1 ? "" : "s"} notificado${notified === 1 ? "" : "s"}`,
      );
      // Switch the modal to the implementation plan (who was notified).
      try {
        const plan = await ApiService.get(
          `/tenant/${tenantId}/scheduler/proposals/${id}/plan`,
        );

        setPlanData(plan?.data ?? plan);
      } catch {
        setPlanData({ plan: { notifiedGuards: notified }, items: [] });
      }
      fetchAll();
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || "Error al publicar");
    } finally {
      setPublishing(false);
    }
  };

  const discardProposal = async () => {
    const id = proposalData?.proposal?.id;

    if (id) {
      try {
        await ApiService.post(
          `/tenant/${tenantId}/scheduler/proposals/${id}/discard`,
          { data: {} },
        );
      } catch {
        /* best effort */
      }
    }
    setProposalData(null);
  };

  const closeProposalModal = () => {
    setProposalData(null);
    setPlanData(null);
  };

  // Geocode guards missing home coordinates (enables real proximity ranking).
  const [geocoding, setGeocoding] = useState(false);
  const runGeocode = async () => {
    setGeocoding(true);
    try {
      const res = await ApiService.post(
        `/tenant/${tenantId}/security-guard/geocode-missing`,
        {},
      );
      const g = res?.geocoded ?? res?.data?.geocoded ?? 0;
      const rem = res?.remaining ?? res?.data?.remaining ?? 0;

      toast.success(
        `${g} vigilante(s) geolocalizados${rem > 0 ? ` · ${rem} pendientes (ejecuta de nuevo)` : ""}`,
      );
    } catch (e: any) {
      toast.error(
        e?.data?.message || e?.message || "Error al geolocalizar vigilantes",
      );
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
      const result: {
        recommendation?: string;
        data?: { recommendation?: string };
      } = await ApiService.post(`/tenant/${tenantId}/scheduler/ai-recommend`, {
        data: { type: "optimize" },
      });
      const rec =
        result?.recommendation ||
        result?.data?.recommendation ||
        "Sin respuesta";

      setAiRecommendation(rec);
    } catch (e: any) {
      toast.error("Error al consultar IA");
      console.error(e);
    } finally {
      setAiLoading(false);
    }
  };

  const runAutoAssign = async () => {
    if (
      !(await confirmDialog({
        message:
          "¿Asignar automáticamente vigilantes a todas las estaciones sin cubrir?\n\nSolo se cubren los puestos VACÍOS con vigilantes sin asignar (por cercanía, configurando rotaciones y sacafrancos). NO se moverá ni reasignará ningún vigilante que ya esté asignado a un puesto.",
        confirmText: "Asignar",
      }))
    )
      return;
    setAutoAssigning(true);
    setAutoResult(null);
    try {
      const res = await ApiService.post(
        `/tenant/${tenantId}/scheduler/auto-assign`,
        { data: {} },
      );

      setAutoResult(res);
      toast.success(`${res.assignmentsCreated} asignaciones creadas`);
      fetchAll();
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("ui.Schedule.errorEnAutoAsignacion", "Error en auto-asignación"),
      );
    } finally {
      setAutoAssigning(false);
    }
  };

  const runOptimizeSacafrancos = async () => {
    if (
      !(await confirmDialog({
        message:
          "¿Optimizar la rotación de sacafrancos?\n\nATENCIÓN: esto MOVERÁ vigilantes sacafranco ya asignados a otros puestos/estaciones y regenerará sus turnos para maximizar cobertura. Los vigilantes fijos NO se tocan.",
        confirmText: "Optimizar",
      }))
    )
      return;
    setAutoAssigning(true);
    try {
      const res = await ApiService.post(
        `/tenant/${tenantId}/scheduler/optimize-sacafrancos`,
        { data: {} },
      );

      toast.success(res?.message || "Sacafrancos optimizados");
      fetchAll();
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("ui.Schedule.errorEnOptimizacion", "Error en optimización"),
      );
    } finally {
      setAutoAssigning(false);
    }
  };

  // Schedule overrides (novedades)
  const [overrideTarget, setOverrideTarget] = useState<{
    guardId: string;
    guardName: string;
    date: string;
    assignmentId?: string;
  } | null>(null);
  /**
   * Abre el diálogo de novedad, salvo en un día demasiado atrás.
   *
   * El tope lo impone el SERVIDOR (`lib/ventanaDeEdicion`); esto sólo evita que
   * alguien abra el diálogo, elija un código y se entere entonces de que no.
   * Regla del dueño: el horario se edita desde una semana atrás como máximo,
   * para no reescribir turnos ya trabajados ni pagos ya emitidos.
   */
  const abrirNovedad = useCallback(
    (target: {
      guardId: string;
      guardName: string;
      date: string;
      assignmentId?: string;
    }) => {
      if (!sePuedeMarcar(target.date, getTenantTimezone())) {
        toast.error(
          `Ese día ya está cerrado. El horario se edita desde el ${fechaMinimaEditable(
            getTenantTimezone(),
          )} en adelante, para no cambiar turnos ya trabajados ni pagos ya emitidos.`,
        );

        return;
      }
      setOverrideTarget(target);
    },
    [],
  );

  /** «Extender turno…»: el vigilante que ya está en el puesto se queda más. */
  const [extendTarget, setExtendTarget] = useState<ExtendTarget | null>(null);

  const performOverrideSave = useCallback(
    async (
      target: {
        guardId: string;
        guardName: string;
        date: string;
        assignmentId?: string;
      },
      type: string,
      note?: string,
    ) => {
      // Marking an L on a fijo usually means "the real rotation is phased
      // differently" (the generated pattern put the libres on the wrong days).
      // The style already knows how many libres its cycle has (6-1 → 1, 4-4-2 →
      // 2), so ONE click is enough: the day you click becomes the START of the
      // rest block and it auto-extends `restDays` forward. We offer to re-anchor
      // THIS fijo's whole rotation from there — no need to place each L by hand.
      if (type === "L" && target.assignmentId) {
        const assignment = assignments.find(
          (a) => a.id === target.assignmentId,
        );
        const pos = assignment
          ? positionsById.get(assignment.positionId)
          : null;
        const isFijo =
          !!assignment && !(pos?.type === "sacafranco" || assignment.isRelief);
        const station = assignment
          ? stationsById.get(assignment.stationId)
          : null;
        const rot =
          (station?.rotationStyleId
            ? rotationStylesById.get(station.rotationStyleId)
            : null) || assignment?.rotationStyle;

        if (isFijo && rot && rot.restDays > 0) {
          const dayMs = 86400000;
          const toLocal = (s: string) => new Date(s + "T00:00:00");
          const fmt = (d: Date) =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const fmtHuman = (s: string) =>
            toLocal(s).toLocaleDateString(localeActual(), {
              weekday: "long",
              day: "numeric",
              month: "long",
            });
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
              : `${rot.restDays} días de descanso (${blockDates.map(fmtHuman).join(" y ")})`;

          const applyForward = await confirmDialog({
            title: t(
              "ui.Schedule.ajustarLaRotacionDesdeEsteLibre",
              "Ajustar la rotación desde este libre",
            ),
            message:
              `El puesto usa el patrón ${rot.name}${rot.restDays > 1 ? ` (${rot.restDays} libres seguidos)` : ""}. ` +
              `¿Quieres que ${target.guardName} descanse ${blockHuman} y la secuencia continúe automáticamente desde ahí?\n\n` +
              `Se recalculan solo los turnos futuros de este vigilante — los demás no se tocan.\n\n` +
              `«Solo este día» registra únicamente una novedad de libre en esa fecha.`,
            confirmText: "Aplicar en adelante",
            cancelText: "Solo este día",
          });

          if (applyForward) {
            try {
              await ApiService.post(
                `/tenant/${tenantId}/guard-assignment/${assignmentId}/rephase`,
                {
                  data: { restStartDate: blockStart },
                },
              );
              // The rotation now rests on the block days. Remove any hand-placed
              // L novedades in that range so the grid is driven purely by the
              // pattern (no leftover/duplicate libres).
              const win = 45;
              const winStart = fmt(
                new Date(toLocal(blockStart).getTime() - win * dayMs),
              );
              const winEnd = fmt(
                new Date(toLocal(blockStart).getTime() + win * dayMs),
              );
              const fresh = await ApiService.get(
                `/tenant/${tenantId}/schedule-overrides?guardId=${guardId}&startDate=${winStart}&endDate=${winEnd}`,
              ).catch(() => null);
              const freshRows: ScheduleOverride[] = Array.isArray(fresh)
                ? fresh
                : fresh?.rows || [];
              const toDelete = freshRows.filter(
                (o) =>
                  o.type === "L" &&
                  blockDates.includes(String(o.date).slice(0, 10)),
              );

              await Promise.all(
                toDelete.map((o) =>
                  ApiService.delete(
                    `/tenant/${tenantId}/schedule-overrides/${o.id}`,
                  ).catch(() => {}),
                ),
              );
              toast.success(
                `Rotación ${rot.name} reajustada — la secuencia sigue desde este libre`,
              );
              setOverrideTarget(null);
              fetchAll();
            } catch (e: any) {
              toast.error(
                e?.data?.message ||
                  e?.message ||
                  t(
                    "ui.Schedule.noSePudoReajustarLaRotacion",
                    "No se pudo reajustar la rotación",
                  ),
              );
            }

            return;
          }
          // declined → fall through, save a single-day novedad as before
        }
      }

      try {
        await ApiService.post(`/tenant/${tenantId}/schedule-overrides`, {
          data: {
            guardId: target.guardId,
            assignmentId: target.assignmentId,
            date: target.date,
            type,
            note,
          },
        });
        toast.success(
          `Ese día queda como ${(CODE_LABEL[type] || type).toLowerCase()}`,
        );
        setOverrideTarget(null);
        fetchAll();
      } catch (e: any) {
        toast.error(e?.message || "Error");
      }
    },
    [
      assignments,
      positionsById,
      stationsById,
      rotationStylesById,
      tenantId,
      fetchAll,
    ],
  );

  const removeOverride = async (id: string) => {
    try {
      await ApiService.delete(`/tenant/${tenantId}/schedule-overrides/${id}`);
      toast.success("Ese día vuelve a su turno");
      setOverrideTarget(null);
      fetchAll();
    } catch (e: any) {
      toast.error(e?.message || "Error");
    }
  };

  // ─── Spreadsheet batch edits (typed codes / delete over a range) ─────────

  const cellsInSelection = useCallback((): {
    row: SelRow;
    dateStr: string;
    asigs: GuardAssignment[];
  }[] => {
    if (!selBounds) return [];
    const cells: { row: SelRow; dateStr: string; asigs: GuardAssignment[] }[] =
      [];

    for (let r = selBounds.r1; r <= selBounds.r2; r++) {
      const row = selectableRows[r];

      if (!row || !row.assignments.length) continue;
      const asigs = asigsDeFila(row);

      if (!asigs.length) continue;
      for (
        let c = selBounds.c1;
        c <= selBounds.c2 && c < monthDays.length;
        c++
      ) {
        cells.push({ row, dateStr: fmtDate(monthDays[c]), asigs });
      }
    }

    return cells;
  }, [selBounds, selectableRows, monthDays, asigsDeFila]);

  const applyCodeToSelection = useCallback(
    async (type: string) => {
      const cells = cellsInSelection();

      if (!cells.length) {
        toast.info(t("ui.Schedule.seleccionaCeldasDeUnPuesto"));

        return;
      }
      // Single cell + L on a fijo → keep the full "rephase from this libre" flow.
      if (cells.length === 1 && type === "L") {
        const { dateStr, asigs } = cells[0];
        const a = asigs[0];
        const guardName = nombreDeVigilante(a.guard, "Vigilante");

        await performOverrideSave(
          { guardId: a.guardId, guardName, date: dateStr, assignmentId: a.id },
          type,
        );

        return;
      }
      // Optimistic: paint the cells immediately, then upsert in batch and
      // silently re-sync. The grid never unmounts, so you stay where you are.
      const now = Date.now();

      setOverrides((prev) => {
        const drop = new Set(
          cells.flatMap(({ asigs, dateStr }) =>
            asigs.map((a) => `${a.guardId}|${dateStr}`),
          ),
        );
        const kept = prev.filter(
          (o) => !drop.has(`${o.guardId}|${String(o.date).slice(0, 10)}`),
        );
        const added: ScheduleOverride[] = [];

        cells.forEach(({ asigs, dateStr }, i) =>
          asigs.forEach((a, j) =>
            added.push({
              id: `tmp-${now}-${i}-${j}`,
              guardId: a.guardId,
              assignmentId: a.id,
              date: dateStr,
              type,
            }),
          ),
        );

        return [...kept, ...added];
      });
      /* OJO: esto es una lista de ENCARGOS, no de promesas. Construirla con
         `ApiService.post(...)` directamente lanzaba la petición al crear el
         array, así que para cuando se llegaba al `await` ya estaban TODAS en el
         aire y no había nada que limitar. `cells` es filas × días sin tope —una
         selección de dos meses sobre un turno grande son miles de celdas—, así
         que la avalancha tumbaba al servidor y disparaba el limitador de
         peticiones. Con encargos, `enLotes` deja seis en vuelo: el máximo que
         el navegador abre por origen de todas formas, o sea que no tarda más. */
      const jobs = cells.flatMap(({ asigs, dateStr }) =>
        asigs.map(
          (a) => () =>
            ApiService.post(`/tenant/${tenantId}/schedule-overrides`, {
              data: {
                guardId: a.guardId,
                assignmentId: a.id,
                date: dateStr,
                type,
              },
            }),
        ),
      );
      const results = await enLotes(jobs, (encargo) => encargo());
      const failed = results.filter((r) => r.status === "rejected").length;

      if (failed) toast.error(`${failed} día(s) no se pudieron marcar`);
      else
        toast.success(
          `${jobs.length} día(s) marcados como ${(CODE_LABEL[type] || type).toLowerCase()}`,
        );
      fetchAll({ silent: true });
    },
    [cellsInSelection, performOverrideSave, tenantId, fetchAll],
  );

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
      if (s && !vistos.has(s.id)) {
        vistos.add(s.id);
        out.push(s);
      }
    };

    for (let r = selBounds.r1; r <= selBounds.r2; r++) {
      const row = selectableRows[r];

      if (!row) continue;
      const esPrimeraFila =
        getPositionsForStation(row.pos.stationId)[0]?.id === row.pos.id;

      for (
        let c = selBounds.c1;
        c <= selBounds.c2 && c < monthDays.length;
        c++
      ) {
        const dateStr = fmtDate(monthDays[c]);

        for (const a of asigsDeFila(row)) {
          const s = shiftByGuardDate.get(`${a.guardId}|${dateStr}`);

          if (!s) continue;
          /* Se borra LO QUE LA CELDA PINTA.
             · Fila de fijo: su turno EN ESTA estación. La comparación existe
               para no borrar un turno que esa persona tenga en otro sitio y que
               esta fila no está enseñando.
             · Fila de SACAFRANCO: justo al revés. Su turno NUNCA está en la
               estación de su fila —esa es sólo su base—, está en la que fue a
               cubrir, y la celda lo pinta con el nombre de esa estación. Con la
               comparación puesta, Supr sobre un sacafranco no encontraba nada y
               contestaba «la selección no tiene turnos ni novedades que borrar»
               teniendo una D delante. */
          if (row.isSf || s.stationId === row.pos.stationId) guardar(s);
        }
        // La cobertura vive donde se ve: en la primera fila del puesto. En una
        // fila de sacafranco su propio turno ya entró por `row.assignments`.
        if (esPrimeraFila && !row.isSf && !cartaElegida) {
          for (const s of coverageShiftsByStationDate.get(
            `${row.pos.stationId}-${dateStr}`,
          ) || [])
            guardar(s);
        }
      }
    }

    return out;
  }, [
    selBounds,
    selectableRows,
    monthDays,
    shiftByGuardDate,
    coverageShiftsByStationDate,
    getPositionsForStation,
    asigsDeFila,
  ]);

  const clearSelectedCells = useCallback(async () => {
    const cells = cellsInSelection();
    const victims: ScheduleOverride[] = [];

    for (const { dateStr, asigs } of cells) {
      for (const a of asigs) {
        const o = getOverride(a.guardId, dateStr);

        if (o) victims.push(o);
      }
    }
    const turnos = shiftsInSelection();

    // Nunca en silencio: si no hay nada que borrar, decirlo.
    if (!victims.length && !turnos.length) {
      if (!sel) {
        toast.info(t("ui.Schedule.seleccionaCeldasDeUnPuesto"));

        return;
      }
      /* Decir POR QUÉ no hay nada. «La selección no tiene turnos ni novedades»
         delante de una D es lo que hace pensar que la pantalla miente, y hay
         tres motivos distintos detrás:
           · el puesto no tiene a nadie;
           · la celda es un descanso (nada que borrar);
           · la rejilla PINTA la rotación, pero el turno todavía no existe como
             fila — el horario se materializa unos meses por delante, y más allá
             de ese horizonte lo que se ve es la proyección del patrón. */
      const filas = selectableRows.slice(
        selBounds?.r1 ?? 0,
        (selBounds?.r2 ?? 0) + 1,
      );
      const filaVacia = filas.every((r) => !r || !r.assignments.length);
      let proyectado = false;

      if (!filaVacia && selBounds) {
        for (const row of filas) {
          if (!row) continue;
          for (
            let c = selBounds.c1;
            c <= selBounds.c2 && c < monthDays.length && !proyectado;
            c++
          ) {
            for (const a of asigsDeFila(row)) {
              if (isWorkDay(a, monthDays[c]) !== "rest") {
                proyectado = true;
                break;
              }
            }
          }
        }
      }
      toast.info(
        filaVacia
          ? "Ese puesto no tiene vigilante asignado: no hay turno que borrar."
          : proyectado
            ? "Ahí todavía no hay un turno creado: la rejilla está enseñando el patrón proyectado. El horario se genera unos meses por delante; para bloquear ese día usa una novedad (L, V, PM, F)."
            : "En esas celdas no hay turno ni novedad — están libres (L). Doble clic para registrar una novedad.",
      );

      return;
    }

    // Un turno es trabajo real de alguien: se confirma. Una novedad se deshace
    // volviéndola a escribir, así que ésa sigue sin preguntar.
    if (turnos.length) {
      const generados = turnos.some((s) => s.positionId);
      const partes = [
        `${turnos.length} turno(s)`,
        victims.length ? `${victims.length} novedad(es)` : "",
      ]
        .filter(Boolean)
        .join(" y ");
      const msg =
        `Se eliminarán ${partes}.` +
        (generados
          ? " Los turnos generados por la rotación pueden volver a aparecer al reoptimizar o reasignar."
          : "");

      if (
        !(await confirmDialog({
          title: "Eliminar la selección",
          message: msg,
          confirmText: "Eliminar",
          tone: "danger",
        }))
      )
        return;
    }

    const victimIds = new Set(victims.map((v) => v.id));
    const shiftIds = turnos.map((s) => s.id);
    const shiftIdSet = new Set(shiftIds);

    // Optimista: la rejilla no se desmonta, así que el borrado se ve al instante
    // y el re-sync silencioso confirma.
    if (victimIds.size)
      setOverrides((prev) => prev.filter((o) => !victimIds.has(o.id)));
    if (shiftIdSet.size)
      setShifts((prev) => prev.filter((s) => !shiftIdSet.has(s.id)));

    /* ENCARGOS, no promesas — ver el comentario de `applyCodeToSelection`. Los
       turnos ya iban en trozos de 100; las novedades no llevaban ningún tope y
       se borraban de una en una, todas a la vez. */
    const jobs: Array<() => Promise<any>> = victims
      .filter((v) => !String(v.id).startsWith("tmp-"))
      .map(
        (v) => () =>
          ApiService.delete(`/tenant/${tenantId}/schedule-overrides/${v.id}`),
      );

    // En trozos: una selección de un año son cientos de ids y `?ids=` acabaría
    // pasándose del largo de URL que acepta nginx.
    for (let i = 0; i < shiftIds.length; i += 100) {
      const lote = shiftIds.slice(i, i + 100);

      jobs.push(() =>
        ApiService.delete(`/tenant/${tenantId}/shift?ids=${lote.join(",")}`),
      );
    }

    const results = await enLotes(jobs, (encargo) => encargo());
    const failed = results.filter((r) => r.status === "rejected").length;

    if (failed)
      toast.error(`${failed} eliminación(es) no se pudieron completar`);
    else {
      const partes = [
        turnos.length ? `${turnos.length} turno(s)` : "",
        victims.length ? `${victims.length} novedad(es)` : "",
      ]
        .filter(Boolean)
        .join(" y ");

      toast.success(`${partes} eliminado(s)`);
    }
    fetchAll({ silent: true });
  }, [
    cellsInSelection,
    shiftsInSelection,
    getOverride,
    tenantId,
    fetchAll,
    sel,
    selBounds,
    selectableRows,
    monthDays,
    asigsDeFila,
    isWorkDay,
    t,
  ]);

  const openNovedadForFocus = useCallback(() => {
    if (!sel) return;
    const row = selectableRows[sel.fr];

    if (!row || !row.assignments.length) {
      if (row)
        openAssignForm(
          row.pos.stationId,
          row.pos.id,
          fmtDate(monthDays[sel.fc]),
        );

      return;
    }
    const a = asigsDeFila(row)[0] || row.assignments[0];
    const guardName = nombreDeVigilante(a.guard, "Vigilante");

    abrirNovedad({
      guardId: a.guardId,
      guardName,
      date: fmtDate(monthDays[sel.fc]),
      assignmentId: a.id,
    });
  }, [sel, selectableRows, monthDays, asigsDeFila]);

  // ─── Navigation ───────────────────────────────────────────────────────────

  // Las vistas de Semana y Día se anclan al MISMO horizonte que la hoja: un mes
  // atrás y un año adelante, rodando. Antes se topaban al año calendario, así
  // que en diciembre no se podía mirar la semana siguiente.
  const clampToYear = useCallback(
    (d: Date) => {
      return d < limites.min ? limites.min : d > limites.max ? limites.max : d;
    },
    [limites],
  );

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
  const [colWin, setColWin] = useState<{ a: number; b: number }>({
    a: 0,
    b: 0,
  });

  /* ─── LA VENTANA DE FILAS ────────────────────────────────────────────────
     Las columnas ya se virtualizaban; las filas no, así que con 50 estaciones se
     construían los 50 bloques aunque en pantalla quepan cinco: 41.136 nodos y
     9,3 s hasta ver la rejilla. Se calcula igual que la de columnas —con la
     aritmética del desplazamiento— y por el mismo motivo: es determinista y su
     peor caso es pintar de más.

     Antes se probó `content-visibility: auto` (9.295 ms contra 9.288 ms: nada,
     porque el coste es que React CONSTRUYE los elementos, no que el navegador
     los maquete) y un `IntersectionObserver` (deja la hoja VACÍA si no dispara).
     Las dos están documentadas en `BloqueVisible`; no reintentarlas sin medir.

     `b` arranca en el total: mientras no se haya medido nada se pinta TODO, que
     es lo lento de siempre pero nunca una hoja en blanco. */
  const alturasRef = useRef<Map<string, number>>(new Map());
  const basePxRef = useRef<HTMLDivElement>(null);
  const [rowWin, setRowWin] = useState<{ a: number; b: number }>({
    a: 0,
    b: Number.MAX_SAFE_INTEGER,
  });

  /** Alto de un bloque: el medido si ya se pintó una vez, si no la estimación. */
  const altoDeEstacion = useCallback(
    (st: Station) => {
      const medido = alturasRef.current.get(st.id);

      if (medido && medido > 0) return medido;

      return 86 + 48 * Math.max(1, getPositionsForStation(st.id).length);
    },
    [getPositionsForStation],
  );

  const syncRowWindow = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el || !stations.length) return;
      // Dónde empieza la tira de estaciones dentro del lienzo (debajo de la
      // cabecera de días, supervisión y oficina). Un div de alto cero lo marca.
      const base = basePxRef.current?.offsetTop ?? 0;
      const arriba = el.scrollTop - ROW_OVERSCAN_PX;
      const abajo = el.scrollTop + el.clientHeight + ROW_OVERSCAN_PX;
      let y = base;
      let a = 0;
      let b = stations.length;

      for (let i = 0; i < stations.length; i++) {
        const h = altoDeEstacion(stations[i]);

        if (y + h < arriba) a = i + 1;
        if (y > abajo) {
          b = i;
          break;
        }
        y += h;
      }
      if (a >= b) {
        a = 0;
        b = stations.length;
      } // nunca una hoja vacía
      setRowWin((prev) => (prev.a === a && prev.b === b ? prev : { a, b }));
    },
    [stations, altoDeEstacion],
  );

  const syncColWindow = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      const total = monthDays.length;
      // La columna congelada de la izquierda (240 px) tapa el principio del
      // lienzo; se resta para no pedir columnas que quedan debajo de ella.
      const first = Math.floor(
        Math.max(0, el.scrollLeft - COL_STICKY_W) / COL_W,
      );
      const last = Math.ceil(
        Math.max(0, el.scrollLeft + el.clientWidth - COL_STICKY_W) / COL_W,
      );
      const a = Math.max(
        0,
        Math.floor((first - COL_OVERSCAN) / COL_CHUNK) * COL_CHUNK,
      );
      const b = Math.min(
        total,
        Math.ceil((last + COL_OVERSCAN) / COL_CHUNK) * COL_CHUNK,
      );

      setColWin((prev) => (prev.a === a && prev.b === b ? prev : { a, b }));
    },
    [monthDays.length],
  );

  // Mientras la ventana no se ha medido (primer pintado) se enseña un tramo
  // razonable: así la hoja nunca aparece vacía un fotograma.
  const colA = colWin.b > colWin.a ? colWin.a : 0;
  const colB = colWin.b > colWin.a ? colWin.b : Math.min(monthDays.length, 60);

  useLayoutEffect(() => {
    if (view !== "month" || loading) return;
    syncColWindow(gridScrollRef.current);
    syncRowWindow(gridScrollRef.current);
    const onResize = () => {
      syncColWindow(gridScrollRef.current);
      syncRowWindow(gridScrollRef.current);
    };

    window.addEventListener("resize", onResize);

    return () => window.removeEventListener("resize", onResize);
  }, [view, loading, syncColWindow]);

  /* La columna 0 es el primer día del TRAMO cargado, no el 1 de enero. */
  const dayIndexOf = useCallback(
    (y: number, mo1: number, d: number) =>
      Math.round(
        (new Date(y, mo1 - 1, d).getTime() - rango.desde.getTime()) / 86400000,
      ),
    [rango],
  );

  /* `monthIdx0` es un mes ABSOLUTO (año × 12 + mes), no 0-11: con la ventana
     rodante los meses cruzan diciembre, y toparlos a [0,11] dejaba la
     navegación encerrada en el año en curso — que es justo lo que se quita. */
  const scrollMonthTo = useCallback(
    (monthIdx0: number) => {
      const crudo = new Date(Math.floor(monthIdx0 / 12), monthIdx0 % 12, 1);
      const objetivo =
        crudo < limites.min
          ? primerDiaDeMes(limites.min)
          : crudo > limites.max
            ? primerDiaDeMes(limites.max)
            : crudo;

      setVisibleMonth(objetivo);

      // Fuera del tramo cargado: se estira hasta abarcarlo y el salto espera a que
      // el lienzo exista, o se estaría desplazando a una columna que no está.
      if (objetivo < rango.desde || objetivo > rango.hasta) {
        saltoPendienteRef.current = objetivo;
        setRango((prev) => {
          const desde =
            objetivo < prev.desde ? primerDiaDeMes(objetivo) : prev.desde;
          const finMes = ultimoDiaDeMes(objetivo);
          const hasta = finMes > prev.hasta ? finMes : prev.hasta;

          return desde === prev.desde && hasta === prev.hasta
            ? prev
            : { desde, hasta };
        });

        return;
      }
      const idx = dayIndexOf(
        objetivo.getFullYear(),
        objetivo.getMonth() + 1,
        1,
      );

      gridScrollRef.current?.scrollTo({
        left: Math.max(0, idx * COL_W),
        behavior: "smooth",
      });
    },
    [dayIndexOf, limites, rango],
  );

  useLayoutEffect(() => {
    const objetivo = saltoPendienteRef.current;

    if (!objetivo) return;
    if (objetivo < rango.desde || objetivo > rango.hasta) return; // aún creciendo
    saltoPendienteRef.current = null;
    const idx = dayIndexOf(objetivo.getFullYear(), objetivo.getMonth() + 1, 1);

    gridScrollRef.current?.scrollTo({
      left: Math.max(0, idx * COL_W),
      behavior: "smooth",
    });
  }, [rango, dayIndexOf]);

  const nav = useCallback(
    (dir: number) => {
      setSel(null);
      if (view === "month") {
        scrollMonthTo(
          visibleMonth.getFullYear() * 12 + visibleMonth.getMonth() + dir,
        );

        return;
      }
      // El calendario navega por MESES, y su mes vivo es `visibleMonth` — el mismo
      // que la hoja del año, para que cambiar de vista no te mueva de sitio.
      if (view === "calendar" || view === "agenda") {
        setVisibleMonth(
          (prev) => new Date(prev.getFullYear(), prev.getMonth() + dir, 1),
        );

        return;
      }
      setCurrentDate((prev) => {
        const d = new Date(prev);

        d.setDate(d.getDate() + (view === "week" ? dir * 7 : dir));

        return clampToYear(d);
      });
    },
    [view, visibleMonth, scrollMonthTo, clampToYear],
  );

  const goToday = useCallback(() => {
    setSel(null);
    const [y, mo, d] = tzToday().split("-").map(Number);

    setCurrentDate(clampToYear(new Date(y, mo - 1, d)));
    if (view === "calendar" || view === "agenda") {
      setVisibleMonth(new Date(y, mo - 1, 1));

      return;
    }
    if (view === "month") {
      gridScrollRef.current?.scrollTo({
        left: Math.max(0, (dayIndexOf(y, mo, d) - 3) * 44),
        behavior: "smooth",
      });
      setVisibleMonth(new Date(y, mo - 1, 1));
    }
  }, [view, clampToYear, dayIndexOf]);

  // Right-click "Editar" from the year canvas jumps to that day in vista Día.
  /* ── EDITAR UN TURNO YA GENERADO ──────────────────────────────────────────
     «Editar el turno» llevaba a la vista Día y ahí te las arreglabas: no editaba
     nada. Pero el casillero ES el registro de asistencia de ese día, y la
     operación cambia sobre la marcha —entra más tarde, dobla, se le manda a otra
     estación—, así que se corrige donde se ve.

     Ojo con el PUT: `ShiftService.update` pasa `station`, `guard` y `postSite`
     por `filterIdInTenant`, que devuelve NULL cuando la clave no viene. Como el
     repositorio sólo salta las claves `undefined`, mandar sólo las horas dejaría
     el turno sin estación, sin vigilante y sin sitio. Por eso se reenvían
     siempre, con sus valores actuales. */
  const [shiftEdit, setShiftEdit] = useState<{
    shift: ShiftRecord;
    guardName: string;
    dateStr: string;
    stationId: string;
    start: string;
    end: string;
  } | null>(null);
  const [shiftEditSaving, setShiftEditSaving] = useState(false);

  const openShiftEditor = useCallback(
    (s: ShiftRecord, guardName: string) => {
      const hm = (v: string) => {
        const w = dateToWall(new Date(v), tzName).minutes;

        return `${String(Math.floor(w / 60)).padStart(2, "0")}:${String(w % 60).padStart(2, "0")}`;
      };

      setShiftEdit({
        shift: s,
        guardName,
        dateStr: dateToWall(new Date(s.startTime), tzName).dateStr,
        stationId: s.stationId,
        start: hm(s.startTime),
        end: hm(s.endTime),
      });
    },
    [tzName],
  );

  const saveShiftEdit = async () => {
    if (!shiftEdit) return;
    const toMin = (x: string) => {
      const [h, mm] = x.split(":").map((n) => parseInt(n, 10) || 0);

      return (h % 24) * 60 + (mm % 60);
    };
    const sMin = toMin(shiftEdit.start);
    let eMin = toMin(shiftEdit.end);

    if (eMin <= sMin) eMin += 1440; // cruza la medianoche (iguales = 24 h)
    const [y, mo, d] = shiftEdit.dateStr.split("-").map(Number);
    const inicio = wallToDate(y, mo, d, sMin, tzName);
    const fin = wallToDate(y, mo, d, eMin, tzName);
    const stDestino = stationsById.get(shiftEdit.stationId);

    setShiftEditSaving(true);
    try {
      await ApiService.put(`/tenant/${tenantId}/shift/${shiftEdit.shift.id}`, {
        data: {
          startTime: inicio.toISOString(),
          endTime: fin.toISOString(),
          // Se reenvían para NO perderlos (ver la nota de arriba).
          station: shiftEdit.stationId,
          guard: shiftEdit.shift.guardId,
          postSite: stDestino?.postSiteId || null,
          // La plaza sólo si el turno la tenía Y no se cambia de estación: una
          // plaza es de su estación, y arrastrarla a otra dejaría el turno
          // apuntando a un puesto que no existe allí.
          ...(shiftEdit.shift.positionId &&
          shiftEdit.stationId === shiftEdit.shift.stationId
            ? { positionId: shiftEdit.shift.positionId }
            : shiftEdit.stationId !== shiftEdit.shift.stationId
              ? { positionId: null }
              : {}),
        },
      });
      toast.success("Turno actualizado");
      setShiftEdit(null);
      fetchAll({ silent: true });
    } catch (e: any) {
      toast.error(
        e?.data?.message || e?.message || "No se pudo actualizar el turno",
      );
    } finally {
      setShiftEditSaving(false);
    }
  };

  const jumpToDay = useCallback(
    (dateStr: string) => {
      const [y, mo, d] = dateStr.split("-").map(Number);

      setCurrentDate(clampToYear(new Date(y, mo - 1, d)));
      setView("day");
    },
    [clampToYear],
  );

  // ─── Keyboard (spreadsheet mode) ─────────────────────────────────────────

  const modalOpen =
    showAssignForm ||
    !!configStation ||
    !!overrideTarget ||
    !!proposalData ||
    !!sfCover ||
    !!posEditor ||
    !!shadowFor ||
    !!shiftEdit;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;

      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      )
        return;
      if (modalOpen) return;
      if (e.key === "PageDown") {
        e.preventDefault();
        nav(1);

        return;
      }
      if (e.key === "PageUp") {
        e.preventDefault();
        nav(-1);

        return;
      }
      if (!sel) return;

      const move = (dr: number, dc: number, extend: boolean) => {
        setSel((prev) => {
          if (!prev) return prev;
          const r = Math.max(
            0,
            Math.min(selectableRows.length - 1, prev.fr + dr),
          );
          const c = Math.max(0, Math.min(monthDays.length - 1, prev.fc + dc));
          const row = selectableRows[r];

          if (row) scrollCellIntoView(row.key, c);

          return extend
            ? { ...prev, fr: r, fc: c }
            : { ar: r, ac: c, fr: r, fc: c };
        });
      };

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          move(0, 1, e.shiftKey);

          return;
        case "ArrowLeft":
          e.preventDefault();
          move(0, -1, e.shiftKey);

          return;
        case "ArrowDown":
          e.preventDefault();
          move(1, 0, e.shiftKey);

          return;
        case "ArrowUp":
          e.preventDefault();
          move(-1, 0, e.shiftKey);

          return;
        case "Home":
          e.preventDefault();
          move(0, -monthDays.length, e.shiftKey);

          return;
        case "End":
          e.preventDefault();
          move(0, monthDays.length, e.shiftKey);

          return;
        case "Escape":
          setSel(null);

          return;
        case "Enter":
          e.preventDefault();
          openNovedadForFocus();

          return;
        case "Delete":
        case "Backspace":
          e.preventDefault();
          void clearSelectedCells();

          return;
        default: {
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          const code = KEY_CODES[e.key.toLowerCase()];

          if (code) {
            e.preventDefault();
            void applyCodeToSelection(code);
          }
        }
      }
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [
    sel,
    modalOpen,
    selectableRows,
    monthDays,
    nav,
    openNovedadForFocus,
    clearSelectedCells,
    applyCodeToSelection,
    scrollCellIntoView,
  ]);

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

      try {
        prev = JSON.parse(sessionStorage.getItem(VIEW_KEY) || "null") || {};
      } catch {
        /* ignore */
      }
      sessionStorage.setItem(
        VIEW_KEY,
        JSON.stringify({
          yr: todayYear,
          // El tramo cargado forma parte de la identidad de la posición: un
          // `scrollLeft` guardado contra otro inicio apunta a otro día.
          tramo: fmtDate(rango.desde),
          a: fmtDate(currentDate),
          v: view,
          sl: el ? el.scrollLeft : prev.sl || 0,
          st: el ? el.scrollTop : prev.st || 0,
          sf: sfSectionOpen,
          panel: panelOpen,
        }),
      );
    } catch {
      /* storage full/blocked */
    }
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
    scrollSaveTimer.current = window.setTimeout(
      () => persistViewRef.current(),
      300,
    );

    cancelAnimationFrame(scrollSaveRaf.current);
    scrollSaveRaf.current = requestAnimationFrame(() => {
      const el = gridScrollRef.current;

      if (!el || view !== "month") return;
      syncColWindow(el);
      syncRowWindow(el);
      /* ── «Y ASÍ»: se amplía al llegar a cualquiera de los dos bordes ────────
         Un margen holgado para que el tramo nuevo esté antes de que el borde se
         vea. Las dos funciones no hacen nada al topar con el año, que es el
         límite del producto, así que esto no se dispara en bucle. */
      const BORDE_PX = 600;

      /* SÓLO DESPUÉS DE ATERRIZAR. Al montar, `scrollLeft` es 0 hasta que el
         efecto de restauración salta al día de hoy — y un 0 se lee como «está
         pegado al borde izquierdo», así que esto ampliaba hacia atrás en cada
         evento de la carga y se tragaba el año entero antes de que nadie tocara
         nada (medido: 365 columnas en vez de 92). Se espera a que la posición
         inicial esté puesta. */
      if (!restoredRef.current) return;
      if (el.scrollLeft < BORDE_PX) ampliarRango("antes");
      else if (el.scrollLeft + el.clientWidth > el.scrollWidth - BORDE_PX)
        ampliarRango("despues");
      // Toolbar month label follows the leftmost visible day of the canvas.
      const idx = Math.max(
        0,
        Math.min(monthDays.length - 1, Math.round((el.scrollLeft + 60) / 44)),
      );
      const d = monthDays[idx];

      if (
        d &&
        (d.getMonth() !== visibleMonth.getMonth() ||
          d.getFullYear() !== visibleMonth.getFullYear())
      ) {
        setVisibleMonth(new Date(d.getFullYear(), d.getMonth(), 1));
      }
    });
  };

  useEffect(
    () => () => {
      window.clearTimeout(scrollSaveTimer.current);
      cancelAnimationFrame(scrollSaveRaf.current);
    },
    [],
  );

  useEffect(() => {
    persistView();
  }, [persistView]);

  // Restore the saved scroll ONCE after the first data render; first visit
  // lands on today's column.
  useLayoutEffect(() => {
    if (loading || restoredRef.current) return;
    restoredRef.current = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(VIEW_KEY) || "null");
      const el = gridScrollRef.current;

      if (!el) return;
      if (
        saved &&
        saved.yr === todayYear &&
        saved.tramo === fmtDate(rango.desde) &&
        (saved.sl || saved.st)
      ) {
        el.scrollLeft = saved.sl || 0;
        el.scrollTop = saved.st || 0;
      } else {
        const [y, mo, d] = tzToday().split("-").map(Number);

        el.scrollLeft = Math.max(0, (dayIndexOf(y, mo, d) - 3) * 44);
      }
      // SALTAR NO ES DESPLAZARSE. Mover `scrollLeft` a mano deja la ventana de
      // columnas donde estaba —el tramo inicial, que es ENERO— mientras el
      // lienzo ya está en agosto: la hoja aparecía VACÍA, sin un puesto cubierto
      // a la vista, y sólo se poblaba cuando alguien tocaba la barra y disparaba
      // el evento `scroll` que la recalcula. Se recalcula aquí mismo, que es
      // donde se sabe que el lienzo acaba de moverse.
      syncColWindow(el);
      syncRowWindow(el);
    } catch {
      /* ignore */
    }
  }, [loading]);

  // ─── Immersive height: fill the viewport below the app header ────────────

  const shellRef = useRef<HTMLDivElement>(null);
  const [shellTop, setShellTop] = useState(140);
  // Content above the sheet can change height (onboarding banner appears/
  // disappears, coverage badge loads) — re-measure whenever those flip.
  const bannerVisible =
    !loading &&
    stations.length > 0 &&
    (positions.length === 0 || assignments.length === 0);

  useLayoutEffect(() => {
    const measure = () => {
      if (shellRef.current)
        setShellTop(Math.round(shellRef.current.getBoundingClientRect().top));
    };

    measure();
    window.addEventListener("resize", measure);

    return () => window.removeEventListener("resize", measure);
  }, [loading, bannerVisible, coverage]);

  const monthLabel = useMemo(() => {
    return visibleMonth
      .toLocaleDateString(localeActual(), { month: "long", year: "numeric" })
      .replace(/^./, (c) => c.toUpperCase());
  }, [visibleMonth]);

  const rangeLabel = useMemo(() => {
    if (view === "month" || view === "calendar" || view === "agenda")
      return monthLabel;
    const fmt = (d: Date) =>
      d.toLocaleDateString(localeActual(), { day: "numeric", month: "short" });

    if (view === "week") {
      const a = timelineDays[0],
        b = timelineDays[timelineDays.length - 1];

      return `${fmt(a)} – ${fmt(b)} ${b.getFullYear()}`;
    }

    return currentDate
      .toLocaleDateString(localeActual(), {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
      .replace(/^./, (c) => c.toUpperCase());
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
    configureStation,
    addPosition,
    editPosition,
    deletePosition,
    openAssignForm,
    removeAssignment,
    onGuardDragStart,
    handleDrop,
    openCellCtx,
    setOverrideTarget,
    startCellSelect,
    hoverCellSelect,
    isWorkDay,
    onCoverageDragStart,
    pickAssignment,
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

    return {
      keys,
      c1: selBounds.c1,
      c2: selBounds.c2,
      focusKey: selectableRows[sel.fr]?.key || "",
      fc: sel.fc,
    };
  }, [sel, selBounds, selectableRows]);

  const selForRows = (rows: StationPosition[]): BlockSel | null =>
    selRange && rows.some((p) => selRange.keys.has(p.id)) ? selRange : null;

  const selInfo = useMemo(() => {
    if (!sel || !selBounds) return null;
    const row = selectableRows[sel.fr];

    if (!row) return null;
    const count =
      (selBounds.r2 - selBounds.r1 + 1) * (selBounds.c2 - selBounds.c1 + 1);
    const guard = row.assignments[0]?.guard;
    const who = nombreDeVigilante(guard, "sin vigilante");

    return `${count} celda${count === 1 ? "" : "s"} · ${row.station?.stationName || ""} — ${row.pos.name} (${who})`;
  }, [sel, selBounds, selectableRows]);

  // ─── Cell renderers ──────────────────────────────────────────────────────

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="px-3 lg:px-4 pt-2 pb-2 flex flex-col">
        {/* ─── Compact toolbar ─── */}
        <div className="flex items-center gap-2 flex-wrap pb-2">
          <div className="flex items-center gap-2 mr-1">
            <IconTile size="sm">
              <CalendarDays />
            </IconTile>
            <div className="leading-tight">
              <div className="font-display text-sm font-bold">
                {t("comun.horario")}
              </div>
              <div
                className="hidden text-[10px] sm:block"
                style={{ color: "var(--ink-soft)" }}
              >
                Rotaciones y coberturas
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              title={t("ui.Schedule.anteriorRePag", "Anterior (Re Pág)")}
              variant="outline"
              onClick={() => nav(-1)}
            >
              <ChevronLeft size={16} />
            </Button>
            <Button size="sm" variant="outline" onClick={goToday}>
              Hoy
            </Button>
            <span className="min-w-[130px] text-center text-sm font-semibold">
              {rangeLabel}
            </span>
            <Button
              size="sm"
              title={t("ui.Schedule.siguienteAvPag", "Siguiente (Av Pág)")}
              variant="outline"
              onClick={() => nav(1)}
            >
              <ChevronRight size={16} />
            </Button>
          </div>

          {/* Rango: Mes = hoja de cálculo · Semana/Día = línea de tiempo dibujable */}
          <Segmented<ViewMode>
            options={[
              { value: "month", label: "Hoja" },
              { value: "calendar", label: "Calendario" },
              { value: "week", label: "Semana" },
              { value: "day", label: "Día" },
              { value: "agenda", label: "Agenda" },
            ]}
            value={view}
            onChange={elegirVista}
          />

          {coverage &&
            typeof coverage.coveredPct === "number" &&
            (() => {
              const ok = (coverage.gapCount || 0) === 0;

              return (
                <StatusBadge dot={false} tone={ok ? "ok" : "bad"}>
                  {ok ? (
                    <CheckCircle2 size={13} />
                  ) : (
                    <AlertTriangle size={13} />
                  )}
                  Cobertura {coverage.coveredPct}%
                  {(coverage.gapCount || 0) > 0 && (
                    <span>· {coverage.gapCount} sin cubrir</span>
                  )}
                </StatusBadge>
              );
            })()}

          {refreshing && (
            <Loader2
              className="animate-spin"
              size={14}
              style={{ color: "var(--ink-faint)" }}
            />
          )}

          <div className="flex-1" />

          <Button
            className="hidden gap-1.5 md:inline-flex"
            size="sm"
            title={
              panelOpen
                ? "Ocultar panel lateral"
                : "Mostrar panel (vigilantes, IA, personal)"
            }
            variant="outline"
            onClick={alternarPanel}
          >
            {panelOpen ? (
              <PanelRightClose size={15} />
            ) : (
              <PanelRightOpen size={15} />
            )}
            <span className="hidden md:inline">Panel</span>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2
              className="animate-spin"
              size={32}
              style={{ color: "var(--brand-text)" }}
            />
          </div>
        ) : stations.length === 0 ? (
          <div className="py-10">
            <EmptyState
              description={t("ui.Schedule.creaUnPuestoDesdeLa")}
              icon={<MapPin />}
              title={t(
                "ui.Schedule.todaviaNoHayPuestosConfigurados",
                "Todavía no hay puestos configurados",
              )}
            />
          </div>
        ) : (
          <>
            {/* ─── Onboarding CTA: stations exist but unconfigured ─── */}
            {(positions.length === 0 || assignments.length === 0) && (
              <div className="glass glass-brand mb-2 flex flex-col gap-3 px-4 py-2.5 sm:flex-row sm:items-center">
                <div className="flex flex-1 items-start gap-3">
                  <Sparkles
                    className="mt-0.5 shrink-0"
                    size={18}
                    style={{ color: "var(--brand-text)" }}
                  />
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    <span className="font-bold" style={{ color: "var(--ink)" }}>
                      {t(
                        "ui.Schedule.tusPuestosAunNoTienen",
                        "Tus puestos aún no tienen horario.",
                      )}{" "}
                    </span>
                    Genera la asignación automática para crear los puestos,
                    asignar vigilantes por cercanía y escalonar los turnos
                    (sacafrancos incluidos).
                  </p>
                </div>
                <Button
                  className="shrink-0 whitespace-nowrap"
                  disabled={autoAssigning}
                  variant="brand"
                  onClick={runAutoAssign}
                >
                  {autoAssigning ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <Zap size={16} />
                  )}
                  {autoAssigning
                    ? "Asignando…"
                    : "Generar asignación automática"}
                </Button>
              </div>
            )}

            {/* ─── Sheet + side panel fill the rest of the viewport ─── */}
            <div
              ref={shellRef}
              className="flex gap-2 min-h-0"
              style={{
                height: `calc(100vh - ${shellTop + 8}px)`,
                minHeight: 320,
              }}
            >
              {/* ─── Mes = spreadsheet sheet · Semana/Día = draw-a-block timeline ─── */}
              {view === "agenda" ? (
                <AgendaView
                  dateStrOf={(iso) => dateToWall(new Date(iso), tzName).dateStr}
                  days={monthDays.filter((d) => {
                    const ds = fmtDate(d);

                    return ds >= calRange.desde && ds <= calRange.hasta;
                  })}
                  guardColorMap={guardColorMap}
                  shifts={shifts}
                  stationsById={stationsById}
                  timeOf={(iso) => {
                    const w = dateToWall(new Date(iso), tzName);

                    return `${String(Math.floor(w.minutes / 60)).padStart(2, "0")}:${String(w.minutes % 60).padStart(2, "0")}`;
                  }}
                  todayStr={todayStr}
                  onPickShift={(sh) =>
                    jumpToDay(
                      dateToWall(new Date(sh.startTime), tzName).dateStr,
                    )
                  }
                />
              ) : view === "calendar" ? (
                <MonthCalendar
                  dateStrOf={(iso) => dateToWall(new Date(iso), tzName).dateStr}
                  guardColorMap={guardColorMap}
                  monthAnchor={visibleMonth}
                  shifts={shifts}
                  stationsById={stationsById}
                  timeOf={(iso) => {
                    const w = dateToWall(new Date(iso), tzName);

                    return `${String(Math.floor(w.minutes / 60)).padStart(2, "0")}:${String(w.minutes % 60).padStart(2, "0")}`;
                  }}
                  todayStr={todayStr}
                  onPickDay={(dateStr) => jumpToDay(dateStr)}
                  onPickShift={(sh) =>
                    jumpToDay(
                      dateToWall(new Date(sh.startTime), tzName).dateStr,
                    )
                  }
                />
              ) : view !== "month" ? (
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
                  {/* ── SUPERVISIÓN EN SEMANA/DÍA ─────────────────────────────
                      Esta sección sólo existía en la hoja del año, así que al
                      cambiar a Semana o Día los supervisores DESAPARECÍAN — como
                      si esa semana no la supervisara nadie.
                      Va ENCIMA de la línea de tiempo y no DENTRO a propósito: el
                      lienzo de la línea es dibujable y deriva la estación de la
                      posición horizontal del ratón, así que una columna que no
                      fuera una estación de verdad dejaría dibujar un turno contra
                      un `stationId` inventado. Aquí se lee; se dibuja abajo. */}
                  <div
                    className="shrink-0 overflow-x-auto rounded-xl"
                    style={{ border: "1px solid var(--hairline)" }}
                  >
                    <SupervisionSection
                      colA={0}
                      colB={timelineDays.length}
                      colWidth={64}
                      gridCols={`${COL_STICKY_W}px repeat(${timelineDays.length}, minmax(64px, 1fr))`}
                      monthDays={timelineDays}
                      tintFor={(d) =>
                        fmtDate(d) === todayStr
                          ? TINT_TODAY
                          : d.getDay() === 0
                            ? TINT_SUNDAY
                            : undefined
                      }
                    />
                  </div>
                  <div className="flex min-h-0 flex-1">
                    <ScheduleTimeline
                      days={timelineDays}
                      guardColorMap={guardColorMap}
                      guardsPool={guardsPool}
                      shifts={shifts}
                      stations={stations}
                      tenantId={tenantId}
                      todayStr={todayStr}
                      tz={getTenantTimezone()}
                      view={view}
                      onChanged={() => fetchAll({ silent: true })}
                    />
                  </div>
                </div>
              ) : (
                <div
                  ref={gridScrollRef}
                  onMouseDown={(e) => startPan(e, gridScrollRef.current)}
                  onScroll={onGridScroll}
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
                      const [ty, tm, td] = todayStr.split("-").map(Number);
                      const idx = dayIndexOf(ty, tm, td);

                      if (idx < 0 || idx >= monthDays.length) return null;

                      return (
                        <div
                          className="absolute inset-y-0 pointer-events-none z-[15]"
                          style={{ left: 240 + idx * 44, width: 44 }}
                        >
                          <div
                            className="brand-glow-sm absolute inset-y-0 left-0 w-[2.5px] rounded-full"
                            style={{ background: "var(--brand)" }}
                          />
                          <div
                            className="absolute inset-y-0 right-0 w-[2.5px] rounded-full"
                            style={{ background: "var(--brand)", opacity: 0.4 }}
                          />
                        </div>
                      );
                    })()}
                    {/* Header row (frozen) */}
                    {/* Fila de cabecera congelada. Fondo OPACO, sin desenfoque: se
                      queda fija sobre una rejilla que puede pintar un año entero. */}
                    <div
                      className="sticky top-0 z-30 grid"
                      style={{
                        gridTemplateColumns: gridCols,
                        borderBottom: "1px solid var(--hairline)",
                      }}
                    >
                      <div
                        className="cg-eyebrow sticky left-0 z-40 px-4 py-2.5"
                        style={{
                          background: "var(--glass-solid)",
                          borderRight: "1px solid var(--hairline)",
                        }}
                      >
                        Puesto
                      </div>
                      <div style={{ background: "var(--glass-solid)" }} />
                      {monthDays.slice(colA, colB).map((day, k) => {
                        const i = colA + k;
                        const isToday = monthDayStrs[i] === todayStr;
                        const isSunday = monthDaySunday[i];

                        return (
                          <div
                            key={i}
                            className="relative px-0.5 py-1.5 text-center"
                            style={{
                              background: "var(--glass-solid)",
                              borderRight: "1px solid var(--hairline)",
                            }}
                          >
                            {/* El tinte va de capa encima: la celda en sí queda OPACA
                              para que el contenido de la rejilla nunca se
                              transparente bajo la cabecera congelada. */}
                            {(isToday || isSunday) && (
                              <div
                                className="pointer-events-none absolute inset-0"
                                style={{
                                  background: isToday
                                    ? TINT_TODAY
                                    : TINT_SUNDAY,
                                }}
                              />
                            )}
                            <div className="cg-eyebrow relative">
                              {DAYS_ES[day.getDay()]}
                            </div>
                            <div
                              className="relative mt-0.5 text-xs font-semibold tabular-nums"
                              style={{
                                color: isToday
                                  ? "var(--brand-text)"
                                  : "var(--ink)",
                              }}
                            >
                              {day.getDate()}
                            </div>
                          </div>
                        );
                      })}
                      <div style={{ background: "var(--glass-solid)" }} />
                    </div>

                    {/* SUPERVISIÓN — arriba del todo, con la misma rejilla.
                      Todo su código vive en `SupervisionSection`: este fichero
                      ya pasa de 2.700 líneas y la supervisión corre sobre OTRO
                      motor (nunca toca `shift`/`guardShift`). */}
                    <SupervisionSection
                      colA={colA}
                      colB={colB}
                      gridCols={gridCols}
                      monthDays={monthDays}
                      tintFor={(_d, i) =>
                        monthDayStrs[i] === todayStr
                          ? TINT_TODAY
                          : monthDaySunday[i]
                            ? TINT_SUNDAY
                            : undefined
                      }
                    />

                    {/* OFICINA — misma rejilla, otro modelo: aquí no se gira, se
                      trabaja una semana. Va debajo de Supervisión y encima de
                      los puestos, que es el orden en que se lee la operación:
                      quien supervisa, quien administra, quien está en el puesto. */}
                    <StaffScheduleSection
                      colA={colA}
                      colB={colB}
                      gridCols={gridCols}
                      monthDays={monthDays}
                      tintFor={(_d, i) =>
                        monthDayStrs[i] === todayStr
                          ? TINT_TODAY
                          : monthDaySunday[i]
                            ? TINT_SUNDAY
                            : undefined
                      }
                    />

                    {/* Station rows — cada puesto es un componente MEMOIZADO
                      (`MonthStationBlock`). Arrastrar una selección sólo repinta
                      el puesto tocado; antes repintaba la hoja entera. */}
                    {/* Marca dónde empieza la tira de estaciones dentro del
                      lienzo; `syncRowWindow` mide desde aquí. Alto cero. */}
                    <div ref={basePxRef} />
                    {(() => {
                      const a = Math.max(
                        0,
                        Math.min(rowWin.a, stations.length),
                      );
                      const b = Math.max(
                        a,
                        Math.min(rowWin.b, stations.length),
                      );
                      // Los bloques fuera de la ventana no se CONSTRUYEN: ocupan su
                      // sitio con un espaciador, así la barra de desplazamiento y
                      // las posiciones siguen siendo las de siempre.
                      let antes = 0;

                      for (let i = 0; i < a; i++)
                        antes += altoDeEstacion(stations[i]);
                      let despues = 0;

                      for (let i = b; i < stations.length; i++)
                        despues += altoDeEstacion(stations[i]);

                      return (
                        <>
                          {antes > 0 && (
                            <div aria-hidden style={{ height: antes }} />
                          )}
                          {stations.slice(a, b).map((station) => {
                            const plazas = getPositionsForStation(station.id);

                            return (
                              <BloqueVisible
                                key={station.id}
                                alturas={alturasRef}
                                id={station.id}
                              >
                                <MonthStationBlock
                                  assignmentsByPosition={assignmentsByPosition}
                                  cartaElegida={cartaElegida}
                                  colA={colA}
                                  colB={colB}
                                  gridCols={gridCols}
                                  guardColorMap={guardColorMap}
                                  h={handlers}
                                  monthDayStrs={monthDayStrs}
                                  monthDaySunday={monthDaySunday}
                                  monthDays={monthDays}
                                  overrideByGuardDate={overrideByGuardDate}
                                  sel={selForRows(plazas)}
                                  sfStationCoverage={sfStationCoverage}
                                  shiftByGuardDate={shiftByGuardDate}
                                  station={station}
                                  stationAlert={stationAlertByStationId.get(
                                    station.id,
                                  )}
                                  stationPositions={plazas}
                                  todayStr={todayStr}
                                />
                              </BloqueVisible>
                            );
                          })}
                          {despues > 0 && (
                            <div aria-hidden style={{ height: despues }} />
                          )}
                        </>
                      );
                    })()}

                    {/* ─── Sacafrancos Section ─── */}
                    {(() => {
                      return (
                        // When EXPANDED, pin the sacafranco section to the bottom of
                        // the scroll viewport (sticky bottom-0) so the fijo stations
                        // scroll BEHIND it — you can reach a puesto high up the grid
                        // and still drag/assign an SF from here without it scrolling away.
                        <div
                          className={
                            sfSectionOpen ? "sticky bottom-0 z-30" : undefined
                          }
                          style={{
                            borderTop:
                              "2px solid color-mix(in oklab, var(--ok) 30%, transparent)",
                            ...(sfSectionOpen
                              ? {
                                  background: "var(--glass-solid)",
                                  boxShadow: "var(--lift-3)",
                                }
                              : {}),
                          }}
                        >
                          {/* Cabecera de sacafrancos — clic para plegar/desplegar */}
                          <div
                            className="grid cursor-pointer"
                            style={{
                              gridTemplateColumns: gridCols,
                              background: "var(--glass-solid)",
                            }}
                            onClick={alternarSacafrancos}
                          >
                            <div
                              className="sticky left-0 z-20 flex items-center gap-2 px-4 py-2.5"
                              style={{
                                background: "var(--glass-solid)",
                                borderRight: "1px solid var(--hairline)",
                              }}
                            >
                              <Shield
                                size={14}
                                style={{ color: "var(--ok-text)" }}
                              />
                              <div className="min-w-0 flex-1">
                                <div
                                  className="text-sm font-semibold"
                                  style={{ color: "var(--ok-text)" }}
                                >
                                  Sacafrancos
                                </div>
                                <div
                                  className="text-[10px]"
                                  style={{ color: "var(--ink-soft)" }}
                                >
                                  {sfPositions.length === 0
                                    ? "ninguno todavía"
                                    : `${sfPositions.length} ${sfPositions.length === 1 ? "posición" : "posiciones"}`}{" "}
                                  {sfSectionOpen
                                    ? "▾"
                                    : "▸ (clic para expandir)"}
                                </div>
                              </div>
                              {/* Crear un sacafranco desde aquí: el modal pregunta
                                a QUÉ estación va, en vez de heredar una. */}
                              <button
                                className="cg-focus flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold"
                                style={tonePill("ok", 14)}
                                title="Crear un sacafranco y elegir en qué estación va"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addSacafranco();
                                }}
                              >
                                <Plus size={11} /> Agregar
                              </button>
                            </div>
                            <div
                              style={{
                                gridColumn: "2 / -1",
                                backgroundColor:
                                  "color-mix(in oklab, var(--ok) 5%, transparent)",
                                ...columnRules(COL_W),
                              }}
                            />
                          </div>

                          {sfSectionOpen && sfPositions.length === 0 && (
                            <div
                              className="px-4 py-3 text-[11px]"
                              style={{
                                color: "var(--ink-soft)",
                                borderTop: "1px solid var(--hairline)",
                              }}
                            >
                              No hay sacafrancos. Con «Agregar» creas uno y
                              eliges en qué estación va.
                            </div>
                          )}

                          {/* SF Position rows — only if expanded */}
                          {sfSectionOpen &&
                            sfPositions.map((pos) => {
                              const posAssignments = getAssignmentsForPosition(
                                pos.id,
                              );
                              const assigned = posAssignments.length > 0;

                              return (
                                <div
                                  key={pos.id}
                                  className="grid"
                                  style={{
                                    gridTemplateColumns: gridCols,
                                    borderTop: "1px solid var(--hairline)",
                                  }}
                                >
                                  {/* Nombre del sacafranco */}
                                  <div
                                    className="sticky left-0 z-20 flex items-center gap-2 px-4 py-2"
                                    id={`hr-${pos.id}`}
                                    style={{
                                      background: "var(--glass-solid)",
                                      borderRight: "1px solid var(--hairline)",
                                    }}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) =>
                                      handleDrop(e, pos.stationId, pos.id)
                                    }
                                  >
                                    <div
                                      className="flex h-6 w-6 items-center justify-center rounded"
                                      style={tonePill("ok", 14)}
                                    >
                                      <Shield size={12} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-xs font-semibold">
                                        {pos.name}
                                      </div>
                                      {/* La estación es lo primero que hay que saber de
                                      un sacafranco: sin ella todas las filas se
                                      llaman igual y no se sabe cuál se está
                                      asignando. */}
                                      <div
                                        className="truncate text-[10px]"
                                        style={{ color: "var(--ink-soft)" }}
                                      >
                                        {(() => {
                                          const st = stationsById.get(
                                            pos.stationId,
                                          );

                                          return st ? stationLabel(st) : "—";
                                        })()}
                                        <span className="tabular-nums">
                                          {" "}
                                          · {pos.startTime} – {pos.endTime}
                                        </span>
                                      </div>
                                    </div>
                                    {assigned && posAssignments[0]?.guard && (
                                      <button
                                        draggable
                                        className="cg-focus cursor-grab rounded px-1.5 py-0.5 text-[9px] font-semibold active:cursor-grabbing"
                                        style={tonePill("ok", 14)}
                                        title={t(
                                          "ui.Schedule.arrastraParaMoverClicPara",
                                        )}
                                        onClick={() =>
                                          removeAssignment(posAssignments[0].id)
                                        }
                                        onDragStart={(e) =>
                                          onGuardDragStart(
                                            e,
                                            posAssignments[0].guardId,
                                            posAssignments[0],
                                          )
                                        }
                                      >
                                        {primerNombre(posAssignments[0].guard)}{" "}
                                        ×
                                      </button>
                                    )}
                                    {!assigned && (
                                      <>
                                        <button
                                          className="cg-focus rounded-md p-1 transition-colors"
                                          style={tonePill("ok", 14)}
                                          title={t(
                                            "ui.Schedule.asignarVigilanteSacafranco",
                                          )}
                                          onClick={() =>
                                            openAssignForm(
                                              pos.stationId,
                                              pos.id,
                                            )
                                          }
                                        >
                                          <Plus size={12} />
                                        </button>
                                        {/* Una posición de sacafranco vacía es una fila
                                        muerta en la hoja: se puede quitar aquí. */}
                                        <button
                                          className="cg-btn-ghost cg-focus rounded-md p-1"
                                          title="Eliminar esta posición de sacafranco"
                                          onClick={() =>
                                            deletePosition(
                                              pos.stationId,
                                              pos.id,
                                            )
                                          }
                                        >
                                          <X size={12} />
                                        </button>
                                      </>
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
                                      borderRight: "1px solid var(--hairline)",
                                      background: selCls
                                        ? undefined
                                        : isToday
                                          ? TINT_TODAY
                                          : isSunday
                                            ? TINT_SUNDAY
                                            : undefined,
                                    };
                                    const cellProps = {
                                      id: `hc-${pos.id}-${dayIdx}`,
                                      style: cellStyle,
                                      onMouseDown: (e: React.MouseEvent) => {
                                        if (e.button === 0)
                                          startCellSelect(
                                            pos.id,
                                            dayIdx,
                                            e.shiftKey,
                                          );
                                      },
                                      onMouseEnter: () =>
                                        hoverCellSelect(pos.id, dayIdx),
                                      onDragOver: (e: React.DragEvent) =>
                                        e.preventDefault(),
                                      onDrop: (e: React.DragEvent) =>
                                        handleDrop(
                                          e,
                                          pos.stationId,
                                          pos.id,
                                          dateStr,
                                        ),
                                      onContextMenu: (e: React.MouseEvent) =>
                                        openSfCtx(
                                          e,
                                          pos,
                                          posAssignments[0] || null,
                                          dateStr,
                                        ),
                                    };

                                    // Novedades (typed or via modal) also show on SF rows.
                                    const sfGuard = assigned
                                      ? posAssignments[0]
                                      : null;
                                    const override = sfGuard
                                      ? getOverride(sfGuard.guardId, dateStr)
                                      : undefined;

                                    if (override && sfGuard) {
                                      const gName = nombreDeVigilante(
                                        sfGuard.guard,
                                        "?",
                                      );

                                      return (
                                        <div
                                          key={dayIdx}
                                          {...cellProps}
                                          className={cellBase}
                                        >
                                          <div
                                            className="flex flex-1 cursor-pointer items-center justify-center rounded"
                                            style={codePill(override.type)}
                                            title={`${gName} — ${CODE_LABEL[override.type] ?? override.type}${override.note ? ": " + override.note : ""} (doble clic para editar)`}
                                            onDoubleClick={() =>
                                              abrirNovedad({
                                                guardId: sfGuard.guardId,
                                                guardName: gName,
                                                date: dateStr,
                                                assignmentId: sfGuard.id,
                                              })
                                            }
                                          >
                                            <span className="text-[10px] font-bold">
                                              {override.type}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    }

                                    const openSfDetail = () => {
                                      if (!sfGuard) {
                                        openAssignForm(
                                          pos.stationId,
                                          pos.id,
                                          dateStr,
                                        );

                                        return;
                                      }
                                      const gName = nombreDeVigilante(
                                        sfGuard.guard,
                                        "?",
                                      );

                                      abrirNovedad({
                                        guardId: sfGuard.guardId,
                                        guardName: gName,
                                        date: dateStr,
                                        assignmentId: sfGuard.id,
                                      });
                                    };

                                    const covShift = sfGuard
                                      ? shiftByGuardDate.get(
                                          `${sfGuard.guardId}|${dateStr}`,
                                        )
                                      : undefined;

                                    if (!covShift) {
                                      // Libre. Assigned SF days are DRAGGABLE — drop them on a
                                      // puesto's L cell to place the coverage there.
                                      return (
                                        <div
                                          key={dayIdx}
                                          {...cellProps}
                                          className={cellBase}
                                        >
                                          <div
                                            className={`flex flex-1 items-center justify-center rounded ${assigned ? "cursor-grab active:cursor-grabbing" : "cursor-pointer border border-dashed"}`}
                                            draggable={assigned}
                                            style={
                                              assigned
                                                ? {
                                                    background:
                                                      "var(--glass-sunken)",
                                                  }
                                                : {
                                                    background:
                                                      "var(--glass-sunken)",
                                                    borderColor:
                                                      "var(--hairline)",
                                                  }
                                            }
                                            title={
                                              assigned
                                                ? "Libre — arrastra este día sobre una L de un puesto para cubrirlo"
                                                : "Sin vigilante — doble clic para asignar sacafranco"
                                            }
                                            onDoubleClick={openSfDetail}
                                            onDragStart={
                                              assigned && sfGuard
                                                ? (e) => {
                                                    mouseSelRef.current = false;
                                                    e.dataTransfer.setData(
                                                      "sfCoverGuardId",
                                                      sfGuard.guardId,
                                                    );
                                                    e.dataTransfer.effectAllowed =
                                                      "copy";
                                                  }
                                                : undefined
                                            }
                                          >
                                            <span
                                              className="text-[10px] font-bold"
                                              style={{
                                                color: "var(--ink-faint)",
                                              }}
                                            >
                                              L
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    }

                                    // Real coverage that day → D/N by the shift's start hour.
                                    const startMin = dateToWall(
                                      new Date(covShift.startTime),
                                      tzName,
                                    ).minutes;
                                    const isNightCov =
                                      startMin >= 18 * 60 || startMin < 6 * 60;
                                    const code = isNightCov ? "N" : "D";
                                    const covStName =
                                      stationsById.get(covShift.stationId)
                                        ?.stationName || "";

                                    return (
                                      <div
                                        key={dayIdx}
                                        {...cellProps}
                                        className={cellBase}
                                      >
                                        {/* Mismo mapa que la leyenda: una D es una D
                                        pinte quien la pinte, fijo o sacafranco. */}
                                        <div
                                          className="flex flex-1 cursor-pointer flex-col items-center justify-center rounded"
                                          style={codePill(code)}
                                          title={`Cubre: ${covStName} — ${CODE_LABEL[code]} · doble clic para quitar la cobertura`}
                                          onDoubleClick={() =>
                                            removeSfCoverage(covShift)
                                          }
                                        >
                                          <span className="text-[10px] font-bold">
                                            {code}
                                          </span>
                                          {covStName && (
                                            <span className="text-[8px] leading-none opacity-80">
                                              {covStName.slice(0, 3)}
                                            </span>
                                          )}
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
                      <Users size={14} style={{ color: "var(--brand-text)" }} />
                      <h3 className="cg-eyebrow">Vigilantes disponibles</h3>
                      <span
                        className="text-[10px] tabular-nums"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        ({unassignedGuards.length})
                      </span>
                    </div>
                    {unassignedGuards.length === 0 ? (
                      <p
                        className="text-[11px]"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {t(
                          "ui.Schedule.todosLosVigilantesEstanAsignados",
                          "Todos los vigilantes están asignados.",
                        )}
                      </p>
                    ) : (
                      <>
                        <p
                          className="mb-2 text-[10px]"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {t("ui.Schedule.arrastraUnVigilanteAUn")}
                        </p>
                        <div className="flex max-h-[180px] flex-wrap gap-1.5 overflow-y-auto">
                          {unassignedGuards.map((g) => (
                            /* Ficha arrastrable: cristal PLANO (se repiten) y
                               brillo del acento al agarrarla. */
                            <div
                              key={g.id}
                              draggable
                              className="glass-flat cursor-grab rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all hover:border-[var(--brand-line)] active:cursor-grabbing active:shadow-[0_0_18px_-6px_var(--brand-glow)]"
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
                      <Sparkles
                        size={14}
                        style={{ color: "var(--brand-text)" }}
                      />
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
                      className="cg-btn-brand cg-focus mt-2 flex w-full items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-all disabled:opacity-50"
                      disabled={aiLoading}
                      onClick={runAiRecommend}
                    >
                      {aiLoading ? (
                        <Loader2 className="animate-spin" size={12} />
                      ) : (
                        <Sparkles size={12} />
                      )}
                      {aiLoading ? "Analizando…" : "Recomendación IA"}
                    </button>
                    {aiRecommendation && (
                      <div className="glass-sunken mt-2 max-h-[240px] overflow-y-auto p-3">
                        <div
                          className="mb-1 text-[10px] font-semibold"
                          style={{ color: "var(--brand-text)" }}
                        >
                          <Bot className="mr-1 inline h-3 w-3" />
                          {t("ui.Schedule.recomendacion", "Recomendación:")}
                        </div>
                        <div
                          className="whitespace-pre-wrap text-[10px] leading-relaxed"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {aiRecommendation}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Personal necesario */}
                  <div className="glass space-y-2 p-3">
                    <h3 className="cg-eyebrow">Personal necesario</h3>
                    {staffing ? (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          <div
                            className="rounded-lg p-2 text-center"
                            style={tonePill("warn", 12)}
                          >
                            <div className="text-lg font-bold tabular-nums">
                              {staffing.fijosNeeded || 0}
                            </div>
                            <div
                              className="text-[9px]"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              Fijos
                            </div>
                          </div>
                          <div
                            className="rounded-lg p-2 text-center"
                            style={tonePill("ok", 12)}
                          >
                            <div className="text-lg font-bold tabular-nums">
                              {staffing.sacafrancosNeeded || 0}
                            </div>
                            <div
                              className="text-[9px]"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              Sacafrancos
                            </div>
                          </div>
                          <div
                            className="rounded-lg p-2 text-center"
                            style={tonePill("brand", 14)}
                          >
                            <div className="text-lg font-bold tabular-nums">
                              {staffing.totalGuardsNeeded || 0}
                            </div>
                            <div
                              className="text-[9px]"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              {t("comun.total")}
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div className="glass-sunken p-2 text-center">
                            <div className="text-sm font-bold tabular-nums">
                              {staffing.currentFijoGuards || 0}
                              <span
                                className="font-normal"
                                style={{ color: "var(--ink-faint)" }}
                              >
                                /{staffing.fijosNeeded || 0}
                              </span>
                            </div>
                            <div
                              className="text-[9px]"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              Fijos asignados
                            </div>
                          </div>
                          <div className="glass-sunken p-2 text-center">
                            <div className="text-sm font-bold tabular-nums">
                              {staffing.currentSfGuards || 0}
                              <span
                                className="font-normal"
                                style={{ color: "var(--ink-faint)" }}
                              >
                                /{staffing.sacafrancosNeeded || 0}
                              </span>
                            </div>
                            <div
                              className="text-[9px]"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              SF asignados
                            </div>
                          </div>
                        </div>
                        {/* Hiring recommendation */}
                        {((staffing.fijosNeeded || 0) -
                          (staffing.currentFijoGuards || 0) >
                          0 ||
                          (staffing.sacafrancosNeeded || 0) -
                            (staffing.currentSfGuards || 0) >
                            0) && (
                          <div
                            className="space-y-1 rounded-lg p-2"
                            style={toneCard("bad", 8, 22)}
                          >
                            <div className="text-[10px] font-semibold">
                              <AlertTriangle className="mr-1 inline h-3 w-3" />
                              Hace falta contratar:
                            </div>
                            {(staffing.fijosNeeded || 0) -
                              (staffing.currentFijoGuards || 0) >
                              0 && (
                              <div className="text-[10px] tabular-nums">
                                •{" "}
                                {(staffing.fijosNeeded || 0) -
                                  (staffing.currentFijoGuards || 0)}{" "}
                                fijos más
                              </div>
                            )}
                            {(staffing.sacafrancosNeeded || 0) -
                              (staffing.currentSfGuards || 0) >
                              0 && (
                              <div className="text-[10px] tabular-nums">
                                •{" "}
                                {(staffing.sacafrancosNeeded || 0) -
                                  (staffing.currentSfGuards || 0)}{" "}
                                sacafrancos más
                              </div>
                            )}
                          </div>
                        )}
                        {staffing.sfRotation && (
                          <div
                            className="pt-1 text-[10px]"
                            style={{
                              color: "var(--ink-soft)",
                              borderTop: "1px solid var(--hairline)",
                            }}
                          >
                            {t("ui.Schedule.rotacionSf", "Rotación SF:")}{" "}
                            <span
                              className="font-semibold"
                              style={{ color: "var(--ink)" }}
                            >
                              {staffing.sfRotation.name}
                            </span>{" "}
                            ({staffing.sfRotation.dayShifts}D-
                            {staffing.sfRotation.nightShifts}N-
                            {staffing.sfRotation.restDays}L)
                          </div>
                        )}
                        <div
                          className="text-[10px]"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          Demanda pico:{" "}
                          <span
                            className="font-semibold tabular-nums"
                            style={{ color: "var(--ink)" }}
                          >
                            {staffing.peakDemand}
                          </span>{" "}
                          puestos simultáneos
                        </div>

                        {stationAlerts.length > 0 && (
                          <div
                            className="space-y-1.5 pt-2"
                            style={{ borderTop: "1px solid var(--hairline)" }}
                          >
                            <div
                              className="cg-eyebrow flex items-center gap-1 tabular-nums"
                              style={{ color: "var(--bad-text)" }}
                            >
                              <AlertTriangle size={11} />
                              Alertas por puesto ({stationAlerts.length})
                            </div>
                            <div className="max-h-[160px] space-y-1 overflow-y-auto pr-1">
                              {stationAlerts.map((alert) => (
                                <div
                                  key={alert.stationId}
                                  className="rounded px-2 py-1 text-[10px]"
                                  style={toneCard("bad", 8, 22)}
                                >
                                  <div
                                    className="truncate font-semibold"
                                    style={{ color: "var(--ink)" }}
                                  >
                                    {stationLabel(alert)}
                                  </div>
                                  {alert.missingFijoCount > 0 && (
                                    <div className="tabular-nums">
                                      • {alert.missingFijoCount} fijo(s) sin
                                      vigilante
                                    </div>
                                  )}
                                  {alert.uncoveredDays > 0 && (
                                    <div className="tabular-nums">
                                      • {alert.uncoveredDays} día(s) sin cubrir
                                      cubriendo
                                    </div>
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
                          <div className="text-lg font-bold tabular-nums">
                            {stations.length}
                          </div>
                          <div
                            className="text-[9px]"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            Puestos
                          </div>
                        </div>
                        <div className="glass-sunken p-2 text-center">
                          <div className="text-lg font-bold tabular-nums">
                            {assignments.length}
                          </div>
                          <div
                            className="text-[9px]"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            Asignados
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Coverage */}
                    {(() => {
                      const fijoPositions = positions.filter(
                        (p) => p.type !== "sacafranco",
                      );
                      const covered = fijoPositions.filter((p) =>
                        assignments.some((a) => a.positionId === p.id),
                      ).length;
                      const pct =
                        fijoPositions.length > 0
                          ? Math.round((covered / fijoPositions.length) * 100)
                          : 0;

                      return (
                        <div
                          className="pt-2"
                          style={{ borderTop: "1px solid var(--hairline)" }}
                        >
                          <div className="mb-1 flex items-center justify-between">
                            <span
                              className="text-[10px]"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              {t(
                                "ui.Schedule.coberturaDeFijos",
                                "Cobertura de fijos",
                              )}
                            </span>
                            <span className="text-[10px] font-semibold tabular-nums">
                              {pct}%
                            </span>
                          </div>
                          <MeterBar
                            ariaLabel={t(
                              "ui.Schedule.coberturaDeFijos",
                              "Cobertura de fijos",
                            )}
                            height={6}
                            pct={pct}
                          />
                          <div
                            className="mt-1 text-[9px] tabular-nums"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {covered}/{fijoPositions.length} posiciones
                            cubiertas
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Sacafrancos summary */}
                  {sacafrancoData.length > 0 && (
                    <div className="glass p-3">
                      <div className="mb-2 flex items-center gap-1.5">
                        <Shield size={12} style={{ color: "var(--ok-text)" }} />
                        <h3 className="cg-eyebrow tabular-nums">
                          Sacafrancos ({sacafrancoData.length})
                        </h3>
                      </div>
                      <div className="space-y-1.5">
                        {sacafrancoData.map((sf) => {
                          const name = nombreDeVigilante(sf.guard, "?");
                          const { availDays, coverDays } = sf;
                          const stationsCovering = [
                            ...new Set(
                              sf.assignments
                                .map(
                                  (a) =>
                                    stationsById.get(a.stationId)?.stationName,
                                )
                                .filter(Boolean),
                            ),
                          ];

                          return (
                            <div
                              key={sf.guard?.id || name}
                              className="glass-sunken space-y-0.5 px-2 py-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-[10px] font-medium">
                                  {name}
                                </span>
                                <span className="flex shrink-0 items-center gap-1">
                                  <span
                                    className="rounded px-1.5 py-0.5 text-[9px] font-semibold tabular-nums"
                                    style={tonePill("ok", 12)}
                                  >
                                    {availDays} libre
                                  </span>
                                  <span
                                    className="rounded px-1.5 py-0.5 text-[9px] font-semibold tabular-nums"
                                    style={tonePill("warn", 12)}
                                  >
                                    {coverDays} cubre
                                  </span>
                                </span>
                              </div>
                              {stationsCovering.length > 0 && (
                                <div
                                  className="truncate text-[9px]"
                                  style={{ color: "var(--ink-soft)" }}
                                >
                                  Cubre: {stationsCovering.join(", ")}
                                </div>
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
            <div
              className="flex flex-wrap items-center gap-3 pt-1.5 text-[10px]"
              style={{ color: "var(--ink-faint)" }}
            >
              {view === "agenda" ? (
                <span
                  className="font-medium"
                  style={{ color: "var(--ink-soft)" }}
                >
                  Lista por día · toca un turno para abrir ese día ·{" "}
                  <b>Re/Av Pág</b> cambia de mes
                </span>
              ) : view === "calendar" ? (
                <span
                  className="font-medium"
                  style={{ color: "var(--ink-soft)" }}
                >
                  El mes de un vistazo · Clic en un turno o en «+N más» para
                  abrir ese día · <b>Re/Av Pág</b> cambia de mes
                </span>
              ) : view === "month" ? (
                <>
                  <span
                    className="font-medium"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {selInfo ||
                      t(
                        "ui.Schedule.clicEnUnaCeldaParaSeleccionar",
                        "Clic en una celda para seleccionar",
                      )}
                  </span>
                  {/* El botón que faltaba. Supr ya borraba, pero sólo estaba
                      escrito en la ayuda: quien seleccionaba con el ratón no
                      tenía dónde pulsar. */}
                  {sel && (
                    <button
                      className="cg-focus inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all hover:opacity-80"
                      style={toneCard("bad", 12, 22)}
                      title={t(
                        "ui.Schedule.eliminarTurnosYNovedades",
                        "Eliminar los turnos y novedades de la selección (Supr)",
                      )}
                      type="button"
                      onClick={() => void clearSelectedCells()}
                    >
                      <Trash2 size={11} /> {t("comun.eliminar", "Eliminar")}
                    </button>
                  )}
                  <span className="hidden md:inline">
                    <b>Clic derecho</b>
                    {t("ui.Schedule.editarDuplicarEliminarTurnoY")}{" "}
                    <b>D N L V F P 2</b> {t("ui.Schedule.paraNovedad")}{" "}
                    <b>Supr</b>{" "}
                    {t(
                      "ui.Schedule.borraArrastraUnDia",
                      "borra · Arrastra un día",
                    )}{" "}
                    <b>{t("ui.Schedule.lDelSacafranco")}</b>{" "}
                    {t("ui.Schedule.sobreUnLDelPuesto")}{" "}
                    <b>{t("ui.Schedule.reAvPag", "Re/Av Pág")}</b> cambia mes
                  </span>
                </>
              ) : (
                <span
                  className="font-medium"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {t(
                    "ui.Schedule.arrastraSobreLaFilaDeUnPuestoPara",
                    "Arrastra sobre la fila de un puesto para",
                  )}{" "}
                  <b>{t("ui.Schedule.dibujarUnBloqueDeTrabajo")}</b> (p. ej.
                  07:00 → 07:00 del día siguiente) · Clic en un bloque: detalle
                  / eliminar · Suelta un vigilante del panel sobre la línea ·{" "}
                  <b>{t("ui.Schedule.reAvPag2", "Re/Av Pág")}</b> cambia{" "}
                  {view === "week" ? "de semana" : "de día"}
                </span>
              )}
              <span className="flex-1" />
              {/* Leyenda de los códigos tipados: mismas píldoras que la rejilla,
                  para que el significado se aprenda de un vistazo. */}
              {view === "month" && (
                <span className="hidden items-center gap-1.5 lg:flex">
                  {CODE_ORDER.map((c) => (
                    <span
                      key={c}
                      className="rounded px-1.5 py-0.5 font-bold"
                      style={codePill(c)}
                      title={CODE_LABEL[c]}
                    >
                      {c}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {ctxMenu && (
        <ContextMenu menu={ctxMenu} onClose={() => setCtxMenu(null)} />
      )}
      <TransferShiftModal
        stations={stations}
        target={transferTarget}
        onClose={() => setTransferTarget(null)}
        onDone={() => fetchAll({ silent: true })}
      />

      {/* ─── Aprendiz en acompañamiento ──────────────────────────────────────── */}
      {shadowFor &&
        (() => {
          const set = (patch: Partial<NonNullable<typeof shadowFor>>) =>
            setShadowFor((m) => (m ? { ...m, ...patch } : m));
          // Todos los vigilantes de la empresa: el backend rechaza al propio
          // titular y a quien ya acompaña este puesto, con un mensaje que explica
          // por qué. Filtrar aquí duplicaría esa regla en dos sitios.
          const disponibles = guardsPool;

          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center"
              style={{ background: "oklch(0 0 0 / 0.55)" }}
              onClick={() => setShadowFor(null)}
            >
              <div
                className="glass-raised mx-4 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="flex items-center justify-between px-5 py-4"
                  style={{ borderBottom: "1px solid var(--hairline)" }}
                >
                  <div>
                    <h4 className="text-sm font-semibold">
                      Aprendiz en acompañamiento
                    </h4>
                    <p
                      className="mt-0.5 text-[11px]"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      Junto a {shadowFor.titularName} · {shadowFor.stationName}
                    </p>
                  </div>
                  <button
                    className="cg-btn-ghost cg-focus rounded-lg p-1.5"
                    onClick={() => setShadowFor(null)}
                  >
                    <X size={15} />
                  </button>
                </div>
                <div className="space-y-4 p-5">
                  <div
                    className="rounded-xl px-3 py-2"
                    style={toneCard("ok", 8, 26)}
                  >
                    <p className="text-[11px]">
                      Trabaja <b>los mismos días que {shadowFor.titularName}</b>{" "}
                      y ficha con normalidad, pero{" "}
                      <b>no cuenta como cobertura</b>: si el titular falta, el
                      puesto sigue apareciendo descubierto.
                    </p>
                  </div>
                  <div>
                    <label
                      className="mb-1 block text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      Aprendiz
                    </label>
                    <select
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
                      style={{
                        borderColor: "var(--hairline)",
                        background: "var(--glass-sunken)",
                      }}
                      value={shadowFor.guardId}
                      onChange={(e) => set({ guardId: e.target.value })}
                    >
                      <option value="">Selecciona…</option>
                      {disponibles.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label
                        className="mb-1 block text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        Desde
                      </label>
                      <input
                        className="w-full rounded-lg border px-2 py-2 text-sm tabular-nums outline-none focus:border-primary"
                        style={{
                          borderColor: "var(--hairline)",
                          background: "var(--glass-sunken)",
                        }}
                        type="date"
                        value={shadowFor.startDate}
                        onChange={(e) => set({ startDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <label
                        className="mb-1 block text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        Hasta
                      </label>
                      <input
                        className="w-full rounded-lg border px-2 py-2 text-sm tabular-nums outline-none focus:border-primary"
                        min={shadowFor.startDate}
                        style={{
                          borderColor: "var(--hairline)",
                          background: "var(--glass-sunken)",
                        }}
                        type="date"
                        value={shadowFor.endDate}
                        onChange={(e) => set({ endDate: e.target.value })}
                      />
                    </div>
                  </div>
                  <p
                    className="text-[10px]"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    El acompañamiento tiene final: cuando termine, el aprendiz
                    deja de seguir este puesto. Para que se quede, asígnalo a su
                    propia plaza.
                  </p>
                </div>
                <div
                  className="flex items-center justify-end gap-2 px-5 py-3"
                  style={{
                    borderTop: "1px solid var(--hairline)",
                    background: "var(--glass-sunken)",
                  }}
                >
                  <button
                    className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-semibold"
                    onClick={() => setShadowFor(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    className="cg-btn-brand cg-focus rounded-full px-5 py-2 text-sm font-semibold transition-all disabled:opacity-40"
                    disabled={
                      shadowSaving || !shadowFor.guardId || !shadowFor.endDate
                    }
                    onClick={saveShadow}
                  >
                    {shadowSaving ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : (
                      "Poner en acompañamiento"
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* ─── Editor de un puesto (nombre · tipo · horas · plazas) ───────────── */}
      {posEditor &&
        (() => {
          const toMin = (x: string) => {
            const [h, mm] = x.split(":").map((n) => parseInt(n, 10) || 0);

            return (h % 24) * 60 + (mm % 60);
          };
          const sMin = toMin(posEditor.startTime);
          const eMin = toMin(posEditor.endTime);
          const durH = ((eMin <= sMin ? eMin + 1440 : eMin) - sMin) / 60;
          const set = (patch: Partial<NonNullable<typeof posEditor>>) =>
            setPosEditor((m) => (m ? { ...m, ...patch } : m));

          /* ── ASISTENTE DEL SACAFRANCO ────────────────────────────────────────
           El diálogo genérico de puestos preguntaba «Tipo: fijo o sacafranco» y
           se titulaba «Agregar puesto». Cuando ya se sabe que se está creando un
           sacafranco eso sobra, y en cambio falta todo lo que un sacafranco SÍ
           necesita: quién es, qué horas cubre, si su mes es rotativo o se coloca
           a mano, y en qué estaciones cubre — con cuál de ellas de base. */
          if (posEditor.sfWizard && !posEditor.positionId) {
            const marcadas = posEditor.stationIds;
            const alternar = (id: string) => {
              const siguiente = marcadas.includes(id)
                ? marcadas.filter((x) => x !== id)
                : [...marcadas, id];
              const base =
                posEditor.stationId && siguiente.includes(posEditor.stationId)
                  ? posEditor.stationId
                  : siguiente[0] || "";
              const stBase = stationsById.get(base);

              set({
                stationIds: siguiente,
                stationId: base,
                stationName: stBase ? stationLabel(stBase) : "",
              });
            };
            const baseActual =
              posEditor.stationId && marcadas.includes(posEditor.stationId)
                ? posEditor.stationId
                : marcadas[0] || "";
            // Un vigilante sostiene UNA rotación activa: ofrecer a los ya
            // asignados sólo produce un rechazo del servidor.
            const libres = unassignedGuards;

            /* ── EL CICLO QUE SE ESTÁ DIBUJANDO ────────────────────────────
               Los tres números de las ruedas y lo que se deriva de ellos: el
               largo del ciclo y la SECUENCIA día a día (D1 D2 … N1 … L1 …),
               que es lo que permite decir «entra en la noche 1» o «empieza
               librando» en vez de tener que falsear la fecha de alta. */
            const sfDias = Math.max(0, posEditor.rotDays ?? 5);
            const sfNoches = Math.max(0, posEditor.rotNights ?? 0);
            const sfLibres = Math.max(0, posEditor.rotRest ?? 2);
            const sfCicloLen = sfDias + sfNoches + sfLibres;
            const sfNombreCiclo =
              sfNoches > 0
                ? `${sfDias}-${sfNoches}-${sfLibres}`
                : `${sfDias}-${sfLibres}`;
            const sfRanuras = ranurasDelCiclo(sfDias, sfNoches, sfLibres);

            // Achicar el ciclo puede dejar el índice elegido fuera: se enrolla
            // igual que lo hará el servidor, así nunca se pinta nada elegido
            // que ya no existe.
            const sfArranque = sfCicloLen
              ? (posEditor.cycleStartIndex || 0) % sfCicloLen
              : 0;
            const sfRanuraElegida = sfRanuras.find((r) => r.i === sfArranque);

            return (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center"
                style={{ background: "oklch(0 0 0 / 0.55)" }}
                onClick={() => setPosEditor(null)}
              >
                <div
                  className="glass-raised mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    className="flex items-center justify-between px-5 py-4"
                    style={{ borderBottom: "1px solid var(--hairline)" }}
                  >
                    <div>
                      <h4 className="text-sm font-semibold">
                        Agregar sacafranco
                      </h4>
                      <p
                        className="mt-0.5 text-[11px]"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {marcadas.length
                          ? `Cubre ${marcadas.length} estación(es)`
                          : "El relevo que cubre los descansos de los fijos"}
                      </p>
                    </div>
                    <button
                      className="cg-btn-ghost cg-focus rounded-lg p-1.5"
                      onClick={() => setPosEditor(null)}
                    >
                      <X size={15} />
                    </button>
                  </div>

                  <div className="space-y-4 p-5">
                    {/* Quién */}
                    <div>
                      <label className="cg-eyebrow mb-1.5 block">
                        Vigilante
                      </label>
                      <select
                        className="cg-input cg-focus w-full px-3 py-2.5 text-sm"
                        value={posEditor.guardId || ""}
                        onChange={(e) => set({ guardId: e.target.value })}
                      >
                        <option value="">
                          Sin vigilante por ahora — sólo crear la fila
                        </option>
                        {libres.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.label}
                          </option>
                        ))}
                      </select>
                      <p
                        className="mt-1 text-[10px]"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        {posEditor.guardId
                          ? "Se crea la fila y se le asigna en un solo paso."
                          : "Sólo aparecen quienes no tienen ya una rotación activa. Sin elegir a nadie se crea la fila vacía y se asigna después."}
                      </p>
                    </div>

                    {/* Nombre */}
                    <div>
                      <label className="cg-eyebrow mb-1.5 block">
                        Nombre de la fila
                      </label>
                      <input
                        className="cg-input cg-focus w-full px-3 py-2.5 text-sm"
                        placeholder="Sacafranco"
                        value={posEditor.name}
                        onChange={(e) => set({ name: e.target.value })}
                      />
                    </div>

                    {/* Fijo o rotativo — igual que al dar de alta a un vigilante.
                      Las HORAS no se preguntan: un sacafranco no tiene horario
                      propio, cubre el hueco que deja el fijo y toma las horas de
                      ESE hueco (así lo calcula el generador). */}
                    <div>
                      <label className="cg-eyebrow mb-1.5 block">
                        Tipo de turno
                      </label>
                      <Segmented<"rotativo" | "manual">
                        options={[
                          { value: "rotativo", label: "Turno rotativo" },
                          { value: "manual", label: "Turno fijo" },
                        ]}
                        value={posEditor.rotMode || "manual"}
                        onChange={(v) => set({ rotMode: v })}
                      />
                      {(posEditor.rotMode || "manual") === "rotativo" ? (
                        <div className="mt-2">
                          <label className="cg-eyebrow mb-1.5 block">
                            Estilo de rotación
                          </label>
                          {/* TRES RUEDAS, NO UN DESPLEGABLE. El ciclo de un
                              sacafranco casi nunca es uno de los que ya están
                              creados, y elegir «4-4-2» de una lista obligaba a
                              salirse del asistente a crear el patrón primero.
                              Aquí se dice el ciclo y ya: al guardar se busca el
                              patrón con esos números o se crea. */}
                          <div
                            className="space-y-2.5 rounded-xl px-3 py-2.5"
                            style={{ border: "1px solid var(--hairline)" }}
                          >
                            <NumberStepper
                              hint="Seguidos, antes de cambiar de bloque"
                              label="Turnos de día"
                              max={31}
                              min={0}
                              suffix="D"
                              value={sfDias}
                              onChange={(v) => set({ rotDays: v })}
                            />
                            <NumberStepper
                              hint="El segundo bloque del puesto"
                              label="Turnos de tarde o noche"
                              max={31}
                              min={0}
                              suffix="T/N"
                              value={sfNoches}
                              onChange={(v) => set({ rotNights: v })}
                            />
                            <NumberStepper
                              hint="Los que libra al cerrar el ciclo"
                              label="Días libres"
                              max={31}
                              min={0}
                              suffix="L"
                              value={sfLibres}
                              onChange={(v) => set({ rotRest: v })}
                            />
                            <div
                              className="flex items-center justify-between gap-2 pt-1 text-[11px]"
                              style={{
                                borderTop: "1px solid var(--hairline)",
                                color: "var(--ink-soft)",
                              }}
                            >
                              <span>Ciclo</span>
                              <span className="font-semibold tabular-nums">
                                {sfCicloLen > 0
                                  ? `${sfNombreCiclo} · ${sfCicloLen} día${sfCicloLen === 1 ? "" : "s"}`
                                  : "—"}
                              </span>
                            </div>
                          </div>
                          <p
                            className="mt-1 text-[10px]"
                            style={{ color: "var(--ink-faint)" }}
                          >
                            {sfDias + sfNoches < 1
                              ? "Necesita al menos un turno de trabajo."
                              : "Se le generan sus turnos con este ciclo, con su propio compás (no el de la estación). Tarda unos segundos."}
                          </p>
                        </div>
                      ) : (
                        <p
                          className="mt-1.5 text-[10px]"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          Sin patrón propio: su mes empieza en blanco y sus días
                          se colocan sobre los descansos —arrastrándolos o con
                          «Optimizar sacafrancos».
                        </p>
                      )}
                    </div>

                    {/* En qué estaciones cubre */}
                    <div>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <label className="cg-eyebrow block">
                          En qué estaciones cubre
                        </label>
                        {marcadas.length > 0 && (
                          <button
                            className="cg-btn-ghost cg-focus rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            type="button"
                            onClick={() =>
                              set({
                                stationIds: [],
                                stationId: "",
                                stationName: "",
                              })
                            }
                          >
                            Limpiar
                          </button>
                        )}
                      </div>
                      <div
                        className="max-h-40 overflow-y-auto rounded-xl px-1 py-1"
                        style={{ border: "1px solid var(--hairline)" }}
                      >
                        {stations.length === 0 && (
                          <p
                            className="px-2 py-1.5 text-[11px]"
                            style={{ color: "var(--ink-faint)" }}
                          >
                            No hay estaciones.
                          </p>
                        )}
                        {stations.map((st) => {
                          const on = marcadas.includes(st.id);

                          return (
                            <div
                              key={st.id}
                              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-[var(--glass-sunken)]"
                            >
                              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                                <input
                                  checked={on}
                                  className="cg-focus"
                                  type="checkbox"
                                  onChange={() => alternar(st.id)}
                                />
                                <span
                                  className={`truncate ${on ? "font-semibold" : ""}`}
                                >
                                  {stationLabel(st)}
                                </span>
                              </label>
                              {/* Cuántos días de su ciclo van aquí. Sólo tiene
                                sentido cuando cubre más de una: con una sola,
                                todos sus días son de esa. */}
                              {on && marcadas.length > 1 && (
                                <div className="flex shrink-0 items-center gap-1">
                                  <input
                                    className="cg-input cg-focus w-12 px-1.5 py-1 text-center text-[11px] tabular-nums"
                                    max={31}
                                    min={0}
                                    placeholder="—"
                                    type="number"
                                    value={posEditor.stationDays?.[st.id] ?? ""}
                                    onChange={(e) => {
                                      const n = parseInt(e.target.value, 10);
                                      const prev = {
                                        ...(posEditor.stationDays || {}),
                                      };

                                      if (Number.isFinite(n) && n > 0)
                                        prev[st.id] = n;
                                      else delete prev[st.id];
                                      set({ stationDays: prev });
                                    }}
                                  />
                                  <span
                                    className="text-[10px]"
                                    style={{ color: "var(--ink-faint)" }}
                                  >
                                    días
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <p
                        className="mt-1 text-[10px]"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        {!marcadas.length
                          ? "Marca al menos una."
                          : marcadas.length === 1
                            ? "Todos sus días de trabajo van a esta estación."
                            : Object.keys(posEditor.stationDays || {}).length
                              ? "Son los puestos donde se le PERMITE fichar. Sus turnos se generan en su puesto base; para que cubra otro, arrastra su día allí."
                              : "Son los puestos donde se le permite fichar cuando le coloques un turno en ellos. No reparte sus días solo."}
                      </p>
                    </div>

                    {/* De cuál cuelga su horario */}
                    {marcadas.length > 1 && (
                      <div>
                        <label className="cg-eyebrow mb-1.5 block">
                          Empieza su horario en
                        </label>
                        <select
                          className="cg-input cg-focus w-full px-3 py-2.5 text-sm"
                          value={baseActual}
                          onChange={(e) => {
                            const stBase = stationsById.get(e.target.value);

                            set({
                              stationId: e.target.value,
                              stationName: stBase ? stationLabel(stBase) : "",
                            });
                          }}
                        >
                          {marcadas.map((id) => {
                            const st = stationsById.get(id);

                            return (
                              <option key={id} value={id}>
                                {st ? stationLabel(st) : id}
                              </option>
                            );
                          })}
                        </select>
                        <p
                          className="mt-1 text-[10px]"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          Su fila vive en esta estación y desde aquí arranca su
                          horario. Cubre igual todas las marcadas.
                        </p>
                      </div>
                    )}

                    {/* Desde cuándo — y CON QUÉ DÍA DE SU CICLO */}
                    <div>
                      <label className="cg-eyebrow mb-1.5 block">
                        Primer día
                      </label>
                      <input
                        className="cg-input cg-focus w-full px-3 py-2.5 text-sm"
                        type="date"
                        value={posEditor.startDate || tzToday()}
                        onChange={(e) => set({ startDate: e.target.value })}
                      />

                      {/* ── EN QUÉ PUNTO DE LA ROTACIÓN ENTRA ──────────────
                          Un sacafranco casi nunca entra por el principio: entra
                          en la noche 1 porque es cuando empieza el descanso que
                          viene a tapar, o su primer día es LIBRE porque el fijo
                          todavía está. Antes la única salida era correr la
                          fecha de alta hacia atrás hasta que el ciclo cuadrara,
                          y entonces el alta dejaba de decir cuándo entró. */}
                      {(posEditor.rotMode || "manual") === "rotativo" &&
                        sfRanuras.length > 0 && (
                          <div className="mt-2.5">
                            <label className="cg-eyebrow mb-1.5 block">
                              Ese día, ¿qué turno de la rotación hace?
                            </label>
                            <SelectorDeRanura
                              ranuras={sfRanuras}
                              value={sfArranque}
                              onChange={(i) => set({ cycleStartIndex: i })}
                            />
                            <p
                              className="mt-1 text-[10px]"
                              style={{ color: "var(--ink-faint)" }}
                            >
                              {explicarRanura(sfRanuraElegida)}
                            </p>
                          </div>
                        )}
                    </div>
                  </div>

                  <div
                    className="flex items-center justify-end gap-2 px-5 py-3"
                    style={{
                      borderTop: "1px solid var(--hairline)",
                      background: "var(--glass-sunken)",
                    }}
                  >
                    <button
                      className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-semibold"
                      onClick={() => setPosEditor(null)}
                    >
                      Cancelar
                    </button>
                    <button
                      className="cg-btn-brand cg-focus rounded-full px-5 py-2 text-sm font-semibold transition-all disabled:opacity-40"
                      disabled={
                        posSaving ||
                        marcadas.length === 0 ||
                        /* Rotativo sin un solo turno de trabajo no es un ciclo:
                           el generador no escribiría nada y el sacafranco
                           nacería con el mes vacío sin decirlo. */
                        ((posEditor.rotMode || "manual") === "rotativo" &&
                          !!posEditor.guardId &&
                          sfDias + sfNoches < 1)
                      }
                      onClick={savePosition}
                    >
                      {posSaving ? (
                        <Loader2 className="animate-spin" size={14} />
                      ) : (
                        "Crear sacafranco"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center"
              style={{ background: "oklch(0 0 0 / 0.55)" }}
              onClick={() => setPosEditor(null)}
            >
              <div
                className="glass-raised mx-4 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="flex items-center justify-between px-5 py-4"
                  style={{ borderBottom: "1px solid var(--hairline)" }}
                >
                  <div>
                    <h4 className="text-sm font-semibold">
                      {posEditor.positionId
                        ? "Editar puesto"
                        : "Agregar puesto"}
                    </h4>
                    <p
                      className="mt-0.5 text-[11px]"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {posEditor.stationName}
                    </p>
                  </div>
                  <button
                    className="cg-btn-ghost cg-focus rounded-lg p-1.5"
                    onClick={() => setPosEditor(null)}
                  >
                    <X size={15} />
                  </button>
                </div>
                <div className="space-y-4 p-5">
                  <div>
                    <label
                      className="mb-1 block text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      Nombre
                    </label>
                    <input
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
                      style={{
                        borderColor: "var(--hairline)",
                        background: "var(--glass-sunken)",
                      }}
                      value={posEditor.name}
                      onChange={(e) => set({ name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label
                      className="mb-1 block text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      Tipo
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        {
                          v: "fijo",
                          label: "Fijo",
                          sub: "trabaja su rotación",
                        },
                        {
                          v: "sacafranco",
                          label: "Sacafranco",
                          sub: "cubre descansos",
                        },
                      ].map((o) => (
                        <button
                          key={o.v}
                          className={`cg-focus rounded-xl border px-2 py-2 text-center transition-all ${posEditor.type === o.v ? "glass-brand" : "glass-flat"}`}
                          onClick={() => set({ type: o.v })}
                        >
                          <div className="text-xs font-semibold">{o.label}</div>
                          <div
                            className="text-[10px]"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {o.sub}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Atajos: las tres formas que cubren casi todo. Las horas
                    siguen siendo libres debajo. */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Diurno", sub: "07–19", s: "07:00", e: "19:00" },
                      {
                        label: "Nocturno",
                        sub: "19–07",
                        s: "19:00",
                        e: "07:00",
                      },
                      {
                        label: "24 horas",
                        sub: "07→07",
                        s: "07:00",
                        e: "07:00",
                      },
                    ].map((q) => {
                      const active =
                        posEditor.startTime === q.s &&
                        posEditor.endTime === q.e;

                      return (
                        <button
                          key={q.label}
                          className={`cg-focus rounded-xl border px-2 py-2 text-center transition-all ${active ? "glass-brand" : "glass-flat"}`}
                          onClick={() => set({ startTime: q.s, endTime: q.e })}
                        >
                          <div className="text-xs font-semibold">{q.label}</div>
                          <div
                            className="text-[10px] tabular-nums"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {q.sub}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label
                        className="mb-1 block text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        Entra
                      </label>
                      <input
                        className="w-full rounded-lg border px-2 py-2 text-sm tabular-nums outline-none focus:border-primary"
                        style={{
                          borderColor: "var(--hairline)",
                          background: "var(--glass-sunken)",
                        }}
                        type="time"
                        value={posEditor.startTime}
                        onChange={(e) => set({ startTime: e.target.value })}
                      />
                    </div>
                    <div>
                      <label
                        className="mb-1 block text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        Sale
                      </label>
                      <input
                        className="w-full rounded-lg border px-2 py-2 text-sm tabular-nums outline-none focus:border-primary"
                        style={{
                          borderColor: "var(--hairline)",
                          background: "var(--glass-sunken)",
                        }}
                        type="time"
                        value={posEditor.endTime}
                        onChange={(e) => set({ endTime: e.target.value })}
                      />
                    </div>
                    <div>
                      <label
                        className="mb-1 block text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        Plazas
                      </label>
                      <input
                        className="w-full rounded-lg border px-2 py-2 text-sm tabular-nums outline-none focus:border-primary"
                        max={20}
                        min={1}
                        style={{
                          borderColor: "var(--hairline)",
                          background: "var(--glass-sunken)",
                        }}
                        type="number"
                        value={posEditor.guardsNeeded}
                        onChange={(e) => set({ guardsNeeded: e.target.value })}
                      />
                    </div>
                  </div>
                  <div
                    className="rounded-xl px-3 py-2"
                    style={toneCard("ok", 8, 26)}
                  >
                    <p className="text-[11px]">
                      Jornada de{" "}
                      <b>{durH % 1 === 0 ? durH : durH.toFixed(1)} h</b>
                      {eMin <= sMin ? " (termina al día siguiente)" : ""}.
                      {posEditor.positionId
                        ? " Los turnos futuros se rehacen con estas horas; las asignaciones no se tocan."
                        : ""}
                    </p>
                  </div>
                </div>
                <div
                  className="flex items-center justify-end gap-2 px-5 py-3"
                  style={{
                    borderTop: "1px solid var(--hairline)",
                    background: "var(--glass-sunken)",
                  }}
                >
                  <button
                    className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-semibold"
                    onClick={() => setPosEditor(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    className="cg-btn-brand cg-focus rounded-full px-5 py-2 text-sm font-semibold transition-all disabled:opacity-40"
                    disabled={posSaving}
                    onClick={savePosition}
                  >
                    {posSaving ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : posEditor.positionId ? (
                      "Guardar"
                    ) : (
                      "Agregar"
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* ─── SF coverage modal (drop an SF día on a puesto → shape the turno) ── */}
      {sfCover &&
        (() => {
          const toMin = (x: string) => {
            const [h, mm] = x.split(":").map((n) => parseInt(n, 10) || 0);

            return (h % 24) * 60 + (mm % 60);
          };
          const sMin = toMin(sfCover.startStr);
          const eMinRaw = toMin(sfCover.endStr);
          const nextDay = eMinRaw <= sMin;
          const durH = ((nextDay ? eMinRaw + 1440 : eMinRaw) - sMin) / 60;
          const quick = (start: string, end: string) =>
            setSfCover((m) => (m ? { ...m, startStr: start, endStr: end } : m));
          const fechaHuman = new Date(
            sfCover.dateStr + "T00:00:00",
          ).toLocaleDateString(localeActual(), {
            weekday: "long",
            day: "numeric",
            month: "long",
          });

          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center"
              style={{ background: "oklch(0 0 0 / 0.55)" }}
              onClick={() => setSfCover(null)}
            >
              <div
                className="glass-raised mx-4 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="flex items-center justify-between px-5 py-4"
                  style={{ borderBottom: "1px solid var(--hairline)" }}
                >
                  <div>
                    <h4 className="text-sm font-semibold">
                      {t("ui.Schedule.cubrirConSacafranco")}
                    </h4>
                    <p
                      className="mt-0.5 text-[11px]"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {sfCover.sfName} → {stationLabel(sfCover.station)} ·{" "}
                      {fechaHuman}
                    </p>
                  </div>
                  <button
                    className="cg-btn-ghost cg-focus rounded-lg p-1.5"
                    onClick={() => setSfCover(null)}
                  >
                    <X size={15} />
                  </button>
                </div>
                <div className="p-5 space-y-4">
                  <div
                    className="rounded-xl px-3 py-2"
                    style={toneCard("ok", 8, 26)}
                  >
                    <p className="text-[11px]">
                      {t(
                        "ui.Schedule.sugeridoSegunLoQueFaltaEseDia",
                        "Sugerido según lo que falta ese día:",
                      )}{" "}
                      <b>{sfCover.suggested}</b>
                    </p>
                  </div>
                  {/* Quick shapes */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Diurno", sub: "07–19", s: "07:00", e: "19:00" },
                      {
                        label: "Nocturno",
                        sub: "19–07",
                        s: "19:00",
                        e: "07:00",
                      },
                      {
                        label: "24 horas",
                        sub: "07→07",
                        s: "07:00",
                        e: "07:00",
                      },
                    ].map((q) => {
                      const active =
                        sfCover.startStr === q.s && sfCover.endStr === q.e;

                      return (
                        <button
                          key={q.label}
                          className={`cg-focus rounded-xl border px-2 py-2 text-center transition-all ${active ? "glass-brand" : "glass-flat"}`}
                          onClick={() => quick(q.s, q.e)}
                        >
                          <div className="text-xs font-semibold">{q.label}</div>
                          <div
                            className="text-[10px] tabular-nums"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {q.sub}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {/* Custom hours */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="cg-eyebrow mb-1.5 block">Inicio</label>
                      <input
                        className="cg-input cg-focus w-full px-3 py-2.5 font-mono text-sm tabular-nums"
                        type="time"
                        value={sfCover.startStr}
                        onChange={(e) =>
                          setSfCover((m) =>
                            m ? { ...m, startStr: e.target.value } : m,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="cg-eyebrow mb-1.5 block">Fin</label>
                      <input
                        className="cg-input cg-focus w-full px-3 py-2.5 font-mono text-sm tabular-nums"
                        type="time"
                        value={sfCover.endStr}
                        onChange={(e) =>
                          setSfCover((m) =>
                            m ? { ...m, endStr: e.target.value } : m,
                          )
                        }
                      />
                    </div>
                  </div>
                  <p
                    className="flex items-center gap-1.5 text-[11px]"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    <Clock size={12} />
                    Duración:{" "}
                    <b className="tabular-nums" style={{ color: "var(--ink)" }}>
                      {durH % 1 === 0 ? durH : durH.toFixed(1)}h
                    </b>
                    {nextDay && (
                      <span>
                        {t(
                          "ui.Schedule.terminaAlDiaSiguiente",
                          "· termina al día siguiente",
                        )}
                      </span>
                    )}
                    <span>{t("ui.Schedule.horaDeLaEmpresa")}</span>
                  </p>
                </div>
                <div
                  className="flex items-center justify-end gap-2 px-5 py-3"
                  style={{
                    borderTop: "1px solid var(--hairline)",
                    background: "var(--glass-sunken)",
                  }}
                >
                  <button
                    className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-all"
                    onClick={() => setSfCover(null)}
                  >
                    {t("actions.cancel")}
                  </button>
                  <button
                    className="cg-btn-brand cg-focus rounded-full px-5 py-2 text-sm font-semibold transition-all disabled:opacity-40"
                    disabled={sfCoverSaving || durH <= 0 || durH > 24}
                    onClick={saveSfCover}
                  >
                    {sfCoverSaving ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : (
                      "Cubrir puesto"
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* ─── Sacafranco picker (click on an "L" cell) ─────────────────────── */}
      {sfPick &&
        (() => {
          const { station, pos, dateStr } = sfPick;
          const fecha = new Date(dateStr + "T00:00:00").toLocaleDateString(
            localeActual(),
            { weekday: "long", day: "numeric", month: "long" },
          );
          const q = sfPickQuery.trim().toLowerCase();
          const todos = candidatosParaCubrir(dateStr);
          const filas = q
            ? todos.filter((r) => r.nombre.toLowerCase().includes(q))
            : todos;
          const libres = filas.filter((r) => r.estado === "libre");
          const resto = filas.filter((r) => r.estado !== "libre");

          const chipEstado = (r: (typeof filas)[number]) => {
            if (r.estado === "libre")
              return (
                <span
                  className="text-[10px] font-semibold"
                  style={{ color: "var(--ok-text)" }}
                >
                  Libre
                </span>
              );
            if (r.estado === "deTurno")
              return (
                <span
                  className="text-[10px]"
                  style={{ color: "var(--warn-text)" }}
                >
                  De turno · {r.detalle}
                </span>
              );
            if (r.estado === "ocupado")
              return (
                <span
                  className="text-[10px]"
                  style={{ color: "var(--ink-faint)" }}
                >
                  Cubre {r.detalle}
                </span>
              );

            return (
              <span
                className="text-[10px]"
                style={{ color: "var(--bad-text)" }}
              >
                Ausente · {r.detalle}
              </span>
            );
          };

          const elegir = (id: string) => {
            setSfPick(null);
            setSfPickQuery("");
            void placeSfCoverage(station, pos, dateStr, id);
          };

          const fila = (r: (typeof filas)[number]) => (
            <button
              key={r.id}
              className="glass-flat glass-hover cg-focus flex w-full items-center gap-2 px-3 py-2.5 text-left transition-all"
              style={r.estado === "libre" ? undefined : { opacity: 0.72 }}
              onClick={() => elegir(r.id)}
            >
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold"
                style={
                  r.estado === "libre"
                    ? tonePill("ok", 16)
                    : {
                        background: "var(--glass-raised)",
                        color: "var(--ink-soft)",
                      }
                }
              >
                {(r.nombre[0] || "?").toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {r.nombre}
                </span>
                {r.esSf && (
                  <span
                    className="cg-eyebrow"
                    style={{ color: "var(--ok-text)" }}
                  >
                    Sacafranco
                  </span>
                )}
              </span>
              {chipEstado(r)}
            </button>
          );

          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center"
              style={{ background: "oklch(0 0 0 / 0.55)" }}
              onClick={() => {
                setSfPick(null);
                setSfPickQuery("");
              }}
            >
              <div
                className="glass-raised mx-4 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="flex items-center justify-between px-5 py-4"
                  style={{ borderBottom: "1px solid var(--hairline)" }}
                >
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold">
                      {t("ui.Schedule.quienCubreEsteDia")}
                    </h4>
                    <p
                      className="mt-0.5 truncate text-[11px]"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {stationLabel(station)} · {fecha}
                    </p>
                  </div>
                  <button
                    className="cg-btn-ghost cg-focus rounded-lg p-1.5"
                    onClick={() => {
                      setSfPick(null);
                      setSfPickQuery("");
                    }}
                  >
                    <X size={15} />
                  </button>
                </div>

                <div className="px-4 pt-3">
                  <input
                    autoFocus
                    className="cg-input cg-focus w-full px-3 py-2 text-sm"
                    placeholder={t("comun.buscarVigilante")}
                    value={sfPickQuery}
                    onChange={(e) => setSfPickQuery(e.target.value)}
                  />
                </div>

                <div className="max-h-[46vh] space-y-1.5 overflow-y-auto p-4">
                  {filas.length === 0 && (
                    <p
                      className="py-4 text-center text-[12px]"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {q
                        ? t(
                            "ui.Schedule.nadieCoincideConLaBusqueda",
                            "Nadie coincide con la búsqueda.",
                          )
                        : t(
                            "ui.Schedule.noHayVigilantesParaMostrar",
                            "No hay vigilantes para mostrar.",
                          )}
                    </p>
                  )}
                  {libres.map(fila)}
                  {resto.length > 0 && libres.length > 0 && (
                    <p className="cg-eyebrow px-1 pt-2">
                      {t("ui.Schedule.yaTienenAlgoEseDia")}
                    </p>
                  )}
                  {/* Se enseñan, y se pueden elegir: a veces hay que mover a
                    alguien de puesto y quien decide eso es quien mira, no la
                    pantalla. El turno nuevo reemplaza al que se solape. */}
                  {resto.map(fila)}
                </div>

                <div
                  className="flex items-center justify-between px-5 py-3"
                  style={{
                    borderTop: "1px solid var(--hairline)",
                    background: "var(--glass-sunken)",
                  }}
                >
                  <button
                    className="cg-focus text-[11px] font-semibold hover:underline"
                    style={{ color: "var(--ink-soft)" }}
                    onClick={() => {
                      const p = sfPick;

                      setSfPick(null);
                      setSfPickQuery("");
                      abrirNovedad({
                        guardId: p.assignment.guardId,
                        guardName: p.guardName,
                        date: p.dateStr,
                        assignmentId: p.assignment.id,
                      });
                    }}
                  >
                    Marcar novedad…
                  </button>
                  <button
                    className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-all"
                    onClick={() => {
                      setSfPick(null);
                      setSfPickQuery("");
                    }}
                  >
                    {t("actions.close")}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* ─── Assignment Modal ─────────────────────────────────────────────── */}
      {/* ─── Mover una cobertura (arrastrada) ────────────────────────────────
          La pregunta que importa: ¿este día o el bloque entero? Cubrir unas
          vacaciones son N turnos sueltos, y casi siempre se corren todos. */}
      {moveCover &&
        (() => {
          const nombre = nombreDeVigilante(
            moveCover.shift.guard,
            "la cobertura",
          );
          const stDestino = stationsById.get(moveCover.stationId);
          const origen = diaDelTurno(moveCover.shift);
          const fmtDia = (v: string) =>
            new Date(v + "T00:00:00").toLocaleDateString(localeActual(), {
              weekday: "short",
              day: "numeric",
              month: "short",
            });
          const cambiaDePuesto =
            moveCover.shift.stationId !== moveCover.stationId;
          const nDias = moveCover.lote.length;
          const primero = diaDelTurno(moveCover.lote[0]);
          const ultimo = diaDelTurno(moveCover.lote[nDias - 1]);

          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center"
              style={{ background: "oklch(0 0 0 / 0.55)" }}
              onClick={() => !moveSaving && setMoveCover(null)}
            >
              <div
                className="glass-raised w-[min(30rem,94vw)] rounded-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="flex items-center justify-between px-5 py-3"
                  style={{ borderBottom: "1px solid var(--hairline)" }}
                >
                  <h4 className="text-sm font-semibold">
                    Mover la cobertura de {nombre}
                  </h4>
                  <button
                    className="cg-btn-ghost cg-focus rounded-lg p-1.5"
                    disabled={moveSaving}
                    onClick={() => setMoveCover(null)}
                  >
                    <X size={15} />
                  </button>
                </div>

                <div className="space-y-3 px-5 py-4">
                  <div className="glass-sunken px-3 py-2 text-[11px]">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <span className="tabular-nums">{fmtDia(origen)}</span>
                      <ArrowRight className="h-3 w-3" />
                      <span className="tabular-nums">
                        {fmtDia(moveCover.dateStr)}
                      </span>
                    </div>
                    {cambiaDePuesto && (
                      <div
                        className="mt-1"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        Cambia al puesto{" "}
                        <span
                          className="font-semibold"
                          style={{ color: "var(--ink)" }}
                        >
                          {stDestino ? stationLabel(stDestino) : "destino"}
                        </span>
                        .
                      </div>
                    )}
                    <div className="mt-1" style={{ color: "var(--ink-faint)" }}>
                      Conserva su horario y las horas que se pagan.
                    </div>
                  </div>

                  <p
                    className="text-[12px]"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {nDias > 1 ? (
                      <>
                        Esta cobertura se agregó junto a otras: son{" "}
                        <span
                          className="font-semibold"
                          style={{ color: "var(--ink)" }}
                        >
                          {nDias} días seguidos
                        </span>
                        , del {fmtDia(primero)} al {fmtDia(ultimo)}. ¿Qué
                        mueves?
                      </>
                    ) : (
                      "Es un día suelto: no hay más días que mover con él."
                    )}
                  </p>
                </div>

                <div
                  className="flex flex-col gap-2 px-5 py-3"
                  style={{
                    borderTop: "1px solid var(--hairline)",
                    background: "var(--glass-sunken)",
                  }}
                >
                  {nDias > 1 && (
                    <button
                      className="cg-btn-brand cg-focus rounded-full px-5 py-2 text-sm font-semibold transition-all disabled:opacity-40"
                      disabled={moveSaving}
                      onClick={() => void aplicarMovimiento(false)}
                    >
                      {moveSaving ? (
                        <Loader2 className="mx-auto animate-spin" size={14} />
                      ) : (
                        `Mover los ${nDias} días`
                      )}
                    </button>
                  )}
                  <button
                    className={`${nDias > 1 ? "cg-btn-ghost" : "cg-btn-brand"} cg-focus rounded-full px-5 py-2 text-sm font-semibold transition-all disabled:opacity-40`}
                    disabled={moveSaving}
                    onClick={() => void aplicarMovimiento(true)}
                  >
                    {moveSaving ? (
                      <Loader2 className="mx-auto animate-spin" size={14} />
                    ) : (
                      "Mover sólo este día"
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {showAssignForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "oklch(0 0 0 / 0.55)" }}
          onClick={() => {
            setShowAssignForm(false);
            setMoveFrom(null);
            setAssignEditing(null);
          }}
        >
          <div
            className="glass-raised mx-4 max-h-[90vh] w-full max-w-md overflow-hidden overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--hairline)" }}
            >
              <h4 className="text-sm font-semibold">
                {moveFrom
                  ? t(
                      "ui.Schedule.moverVigilanteDePuesto",
                      "Mover vigilante de puesto",
                    )
                  : assignEditing
                    ? "Editar sacafranco"
                    : assignMode === "single"
                      ? t("ui.Schedule.cubrirEsteDia", "Cubrir este día")
                      : puestoRota
                        ? t(
                            "ui.Schedule.asignarVigilanteALaRotacion",
                            "Asignar vigilante a la rotación",
                          )
                        : "Asignar vigilante al turno fijo"}
              </h4>
              <button
                className="cg-btn-ghost cg-focus rounded-lg p-1.5"
                onClick={() => {
                  setShowAssignForm(false);
                  setMoveFrom(null);
                  setAssignEditing(null);
                }}
              >
                <X size={15} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* ¿El puesto elegido ROTA? Lo dice su patrón: sin noches, no rota. */}
              {(() => {
                return null;
              })()}
              {/* Position info */}
              {assignTarget &&
                (() => {
                  const pos = positions.find(
                    (p) => p.id === assignTarget.positionId,
                  );
                  const st = stations.find(
                    (s) => s.id === assignTarget.stationId,
                  );

                  if (!pos || !st) return null;
                  const meta = POSITION_TONE[pos.type] || POSITION_TONE.fijo;
                  /* ── QUÉ VA A HACER ESTA PERSONA, DICHO EN CLARO ─────────────
                   El diálogo enseñaba las horas de la plaza en letra pequeña y
                   llamaba «rotación» a todo. En un puesto de 24 h con patrón SIN
                   noches los dos fijos NO rotan: uno se queda de día y otro de
                   noche, y eso lo decide la plaza que se elija — pero no había
                   forma de saberlo desde aquí.

                   La mitad se deduce de la HORA DE ENTRADA, la misma regla que
                   usa el generador (`shiftHalfByStart`: entrar por la tarde o de
                   madrugada es noche). No se guarda nada nuevo: se nombra lo que
                   ya dice el puesto. */
                  const estiloPuesto = rotationStyles.find(
                    (r) => r.id === st.rotationStyleId,
                  );
                  const rota = (estiloPuesto?.nightShifts || 0) > 0;
                  const horaEntrada =
                    parseInt(
                      String(pos.startTime || "07:00").slice(0, 2),
                      10,
                    ) || 0;
                  const esNoche = horaEntrada >= 18 || horaEntrada < 6;

                  return (
                    <div
                      className="rounded-xl px-3 py-2"
                      style={toneCard(meta.tone)}
                    >
                      <div className="text-xs font-semibold">
                        {stationLabel(st)}{" "}
                        <ArrowRight className="inline h-3 w-3" /> {pos.name}
                      </div>
                      <div className="text-[10px] tabular-nums opacity-80">
                        {pos.startTime} – {pos.endTime}
                      </div>
                      {pos.type === "fijo" && (
                        <div className="mt-1 text-[11px] font-semibold">
                          {rota
                            ? "Rota día y noche según el patrón del puesto"
                            : `Turno fijo de ${esNoche ? "NOCHE" : "DÍA"} — siempre en este horario`}
                        </div>
                      )}
                    </div>
                  );
                })()}

              {/* Drag-move notice */}
              {moveFrom && (
                <div className="rounded-xl px-3 py-2" style={toneCard("warn")}>
                  <p className="text-[11px]">
                    {t("ui.Schedule.seMoveraDesde", "Se moverá desde")}{" "}
                    <span className="font-semibold">
                      {stationsById.get(moveFrom.stationId)?.stationName ||
                        "su puesto actual"}
                    </span>{" "}
                    — sus turnos futuros allí se eliminan.
                  </p>
                </div>
              )}

              {/* ── Qué se va a crear ──────────────────────────────────────
                  Un traslado no tiene elección (mover una asignación es
                  rotación por definición), así que ahí no se enseña. */}
              {!moveFrom && !assignEditing && (
                <div>
                  <Segmented<"single" | "rango" | "rotation">
                    options={[
                      {
                        value: "single",
                        label: t("ui.Schedule.soloEsteDia", "Sólo este día"),
                      },
                      // Cubrir unas vacaciones son QUINCE días, no uno. Antes había
                      // que repetir el diálogo día por día.
                      { value: "rango", label: "Varios días" },
                      {
                        value: "rotation",
                        label: puestoRota
                          ? t("ui.ShiftAssignModal.rotacion", "Rotación")
                          : "Turno fijo",
                      },
                    ]}
                    value={assignMode}
                    onChange={setAssignMode}
                  />
                  <p
                    className="mt-1.5 text-[10px]"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {assignMode === "single"
                      ? "Un turno suelto para la fecha elegida. No entra en el horario del puesto."
                      : assignMode === "rango"
                        ? `Un turno suelto por cada día del rango, con las mismas horas. ${diasEntre(assignStartDate, assignEndDate) > 0 ? `Se crearán ${diasEntre(assignStartDate, assignEndDate)} turno(s).` : "El último día no puede ser anterior al primero."}`
                        : puestoRota
                          ? "Entra en la rotación del puesto: se generan sus turnos y irá alternando día y noche. Tarda unos segundos."
                          : "Se queda en este horario todos sus días de trabajo, sin alternar. Tarda unos segundos."}
                  </p>
                </div>
              )}

              {/* Guard */}
              <div>
                <label className="cg-eyebrow mb-1.5 block">
                  {t("comun.vigilante")}
                </label>
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
                  const ocupados = new Set(assignments.map((a) => a.guardId));
                  const disponibles =
                    assignMode === "single"
                      ? guardsPool
                      : guardsPool.filter(
                          (g) => !ocupados.has(g.id) || g.id === assignGuard,
                        );

                  // Con turno ese día ya: se muestran, pero avisados. El turno
                  // nuevo REEMPLAZA al que se solape, y conviene saberlo antes.
                  const conTurnoEseDia = (id: string) =>
                    !!shiftByGuardDate.get(`${id}|${assignStartDate}`);

                  return (
                    <select
                      className="cg-input cg-focus w-full px-3 py-2.5 text-sm disabled:opacity-60"
                      disabled={!!assignEditing}
                      value={assignGuard}
                      onChange={(e) => setAssignGuard(e.target.value)}
                    >
                      <option value="">{t("comun.eligeUnVigilante")}</option>
                      {disponibles.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.label}
                          {assignMode === "single" && conTurnoEseDia(g.id)
                            ? " · ya tiene turno ese día"
                            : ""}
                        </option>
                      ))}
                      {disponibles.length === 0 && (
                        <option disabled value="">
                          {t(
                            "ui.Schedule.todosLosVigilantesYaEstan",
                            "Todos los vigilantes ya están asignados",
                          )}
                        </option>
                      )}
                    </select>
                  );
                })()}
                {assignMode === "single" &&
                  assignGuard &&
                  shiftByGuardDate.get(`${assignGuard}|${assignStartDate}`) && (
                    <p
                      className="mt-1 text-[10px]"
                      style={{ color: "var(--warn-text)" }}
                    >
                      Ya tiene turno ese día: el nuevo reemplazará al que se
                      solape.
                    </p>
                  )}
                {assignMode === "rotation" &&
                  positions.find((p) => p.id === assignTarget?.positionId)
                    ?.type === "sacafranco" && (
                    <p
                      className="mt-1 text-[10px]"
                      style={{ color: "var(--ok-text)" }}
                    >
                      {t("ui.Schedule.sacafrancoPuedeCubrirVariosPuestos")}
                    </p>
                  )}
                {assignMode === "rotation" &&
                  positions.find((p) => p.id === assignTarget?.positionId)
                    ?.type === "fijo" && (
                    <p
                      className="mt-1 text-[10px]"
                      style={{ color: "var(--warn-text)" }}
                    >
                      {t("ui.Schedule.fijoExclusivoDeEstePuesto")}
                    </p>
                  )}
              </div>

              {/* Start date: bounds when shifts begin (and sets the phase on
                  alternation stations). Defaults to the day you dropped on. */}
              <div>
                <label className="cg-eyebrow mb-1.5 block">
                  {assignMode === "single"
                    ? "Día que cubre"
                    : assignMode === "rango"
                      ? "Desde"
                      : t(
                          "ui.Schedule.primerDiaDeTurno",
                          "Primer día de turno",
                        )}
                </label>
                <input
                  className="cg-input cg-focus w-full px-3 py-2.5 text-sm"
                  type="date"
                  value={assignStartDate}
                  onChange={(e) => {
                    setAssignStartDate(e.target.value);
                    // El fin nunca puede quedar antes del inicio: se arrastra.
                    if (assignEndDate < e.target.value)
                      setAssignEndDate(e.target.value);
                  }}
                />
                {assignMode === "rango" && (
                  <>
                    <label className="cg-eyebrow mb-1.5 mt-3 block">
                      Hasta
                    </label>
                    <input
                      className="cg-input cg-focus w-full px-3 py-2.5 text-sm"
                      min={assignStartDate}
                      type="date"
                      value={assignEndDate}
                      onChange={(e) => setAssignEndDate(e.target.value)}
                    />
                  </>
                )}
                <p
                  className="mt-1 text-[10px]"
                  style={{ color: "var(--ink-faint)" }}
                >
                  {assignMode === "single"
                    ? t(
                        "ui.Schedule.horaDeLaEmpresaPunto",
                        "Hora de la empresa.",
                      )
                    : "Los turnos se generan desde esta fecha (hora de la empresa)."}
                </p>

                {/* ── Y QUÉ TURNO DE LA ROTACIÓN HACE ESE DÍA ──────────────
                    Sólo tiene sentido con patrón propio (sin él no hay ciclo)
                    y en una alta de rotación. Ver `ranurasDelCiclo`. */}
                {assignMode === "rotation" &&
                  positions.find((p) => p.id === assignTarget?.positionId)
                    ?.type === "sacafranco" &&
                  assignRotation &&
                  (() => {
                    const rotSel = rotationStylesById.get(assignRotation);

                    if (!rotSel) return null;
                    const ranuras = ranurasDelCiclo(
                      rotSel.dayShifts,
                      rotSel.nightShifts,
                      rotSel.restDays,
                    );

                    if (!ranuras.length) return null;
                    const idx = assignCycleStart % ranuras.length;

                    return (
                      <div className="mt-3">
                        <label className="cg-eyebrow mb-1.5 block">
                          Ese día, ¿qué turno de la rotación hace?
                        </label>
                        <SelectorDeRanura
                          ranuras={ranuras}
                          value={idx}
                          onChange={setAssignCycleStart}
                        />
                        <p
                          className="mt-1 text-[10px]"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          {explicarRanura(ranuras.find((r) => r.i === idx))}
                        </p>
                      </div>
                    );
                  })()}
              </div>

              {/* ── QUÉ TURNO CUBRE ─────────────────────────────────────────
                  Las horas salían del puesto y ya: en una estación de 24 h a dos
                  personas la plaza dice 07:00, así que TODO reemplazo acababa en
                  el turno de día aunque viniera a cubrir la noche. Y en «Varios
                  días» —cubrir unas vacaciones— ni siquiera se enseñaban las
                  horas, no había dónde corregirlo.

                  Ahora se elige, y las opciones son los turnos REALES de la
                  estación (los bloques distintos de sus plazas), no tres horarios
                  inventados. Las horas sueltas siguen debajo para el caso raro. */}
              {(assignMode === "single" || assignMode === "rango") && (
                <div>
                  {(() => {
                    /* Los turnos que de verdad existen en esta estación, con
                       el espejo del servidor (`lib/jornadasDePlazas`). Aquí
                       había una copia propia que NO filtraba sacafrancos —así
                       que ofrecía la ventana del relevo como si fuera una
                       jornada del puesto— y otra, en el diálogo de editar
                       turno, que sí los filtraba pero no reponía la noche de un
                       24 h. Dos copias de lo mismo que ya discrepaban entre
                       sí. */
                    const delPuesto = positions.filter(
                      (pp: any) => pp.stationId === assignTarget?.stationId,
                    );
                    const estacionDelAsignado = stations.find(
                      (x: any) => x.id === assignTarget?.stationId,
                    );
                    const jornadas = jornadasDePlazas(
                      delPuesto as any,
                      (estacionDelAsignado as any)?.scheduleType,
                    );
                    const lista = (
                      jornadas.length
                        ? jornadas
                        : jornadasPorTipo(
                            (estacionDelAsignado as any)?.scheduleType || "24h",
                          )
                    ).map(
                      (b: {
                        tipo: string;
                        startTime: string;
                        endTime: string;
                      }) => ({
                        ini: b.startTime,
                        fin: b.endTime,
                        etiqueta: b.tipo,
                      }),
                    );

                    return (
                      <>
                        <label className="cg-eyebrow mb-1.5 block">
                          Qué turno cubre
                        </label>
                        <div
                          className="mb-3 grid gap-2"
                          style={{
                            gridTemplateColumns: `repeat(${Math.min(3, lista.length)}, minmax(0, 1fr))`,
                          }}
                        >
                          {lista.map((b) => {
                            const activo =
                              assignStartTime === b.ini &&
                              assignEndTime === b.fin;

                            return (
                              <button
                                key={`${b.ini}|${b.fin}`}
                                className={`cg-focus rounded-xl border px-2 py-2 text-center transition-all ${activo ? "glass-brand" : "glass-flat"}`}
                                type="button"
                                onClick={() => {
                                  setAssignStartTime(b.ini);
                                  setAssignEndTime(b.fin);
                                }}
                              >
                                <div className="text-xs font-semibold">
                                  {b.etiqueta}
                                </div>
                                <div
                                  className="text-[10px] tabular-nums"
                                  style={{ color: "var(--ink-soft)" }}
                                >
                                  {b.ini}–{b.fin}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="cg-eyebrow mb-1.5 block">Entra</label>
                      <input
                        className="cg-input cg-focus w-full px-3 py-2 font-mono text-sm tabular-nums"
                        type="time"
                        value={assignStartTime}
                        onChange={(e) => setAssignStartTime(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="cg-eyebrow mb-1.5 block">Sale</label>
                      <input
                        className="cg-input cg-focus w-full px-3 py-2 font-mono text-sm tabular-nums"
                        type="time"
                        value={assignEndTime}
                        onChange={(e) => setAssignEndTime(e.target.value)}
                      />
                    </div>
                  </div>
                  <p
                    className="mt-1 text-[10px]"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {assignEndTime <= assignStartTime
                      ? assignEndTime === assignStartTime
                        ? t("ui.Schedule.turnoDe24Horas", "Turno de 24 horas.")
                        : t(
                            "ui.Schedule.terminaAlDiaSiguientePunto",
                            "Termina al día siguiente.",
                          )
                      : "Horas tomadas del puesto; puedes cambiarlas."}
                    {assignMode === "rango"
                      ? " Las mismas para todos los días del rango."
                      : ""}
                  </p>
                </div>
              )}

              {/* ── EL PATRÓN ───────────────────────────────────────────────
                  En un FIJO lo manda la estación (Sitios › Estación › Horario
                  del turno) y aquí sólo se enseña: si cada fijo trajera el suyo,
                  las dos plazas de un 24 h dejarían de encajar.

                  En un SACAFRANCO se elige. No pertenece al compás de ninguna
                  estación —cubre los descansos de varias— así que su ciclo de
                  trabajo y descanso es suyo. El generador ya lo prefería sobre el
                  de la estación; lo que faltaba era este campo. */}
              {assignMode === "rotation" &&
                (() => {
                  const st = stationsById.get(assignTarget?.stationId || "");
                  const rot = st?.rotationStyleId
                    ? rotationStylesById.get(st.rotationStyleId)
                    : null;
                  const esSf =
                    positions.find((p) => p.id === assignTarget?.positionId)
                      ?.type === "sacafranco";
                  const ciclo = (r: RotationStyle) => {
                    const partes = [
                      r.dayShifts ? `${r.dayShifts}D` : "",
                      r.nightShifts ? `${r.nightShifts}N` : "",
                      r.restDays ? `${r.restDays}L` : "",
                    ].filter(Boolean);

                    return partes.join("-");
                  };

                  if (!esSf) {
                    return (
                      <div className="glass-sunken px-3 py-2">
                        <p
                          className="text-[11px]"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {t(
                            "ui.Schedule.patronDeRotacion",
                            "Patrón de rotación:",
                          )}{" "}
                          <span
                            className="font-semibold"
                            style={{ color: "var(--ink)" }}
                          >
                            {rot?.name || "el del puesto"}
                          </span>{" "}
                          · se hereda del puesto.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <>
                      <div>
                        <label className="cg-eyebrow mb-1.5 block">
                          Su patrón de rotación
                        </label>
                        <select
                          className="cg-input cg-focus w-full px-3 py-2.5 text-sm"
                          value={assignRotation}
                          onChange={(e) => {
                            setAssignRotation(e.target.value);
                            // Otro ciclo, otras casillas: conservar el índice
                            // dejaría elegida una que ya no existe.
                            setAssignCycleStart(0);
                          }}
                        >
                          <option value="">
                            {rot
                              ? `Sin patrón propio — mes libre, se cubre a mano`
                              : "Sin patrón propio — mes libre, se cubre a mano"}
                          </option>
                          {rotationStyles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                              {ciclo(r) ? ` · ${ciclo(r)}` : ""}
                              {st?.rotationStyleId === r.id
                                ? " (el de esta estación)"
                                : ""}
                            </option>
                          ))}
                        </select>
                        <p
                          className="mt-1 text-[10px]"
                          style={{
                            color: assignRotation
                              ? "var(--ok-text)"
                              : "var(--ink-faint)",
                          }}
                        >
                          {assignRotation
                            ? "Se le generan sus turnos con este ciclo. Tarda unos segundos."
                            : "Empieza con el mes en blanco: sus días se colocan arrastrándolos sobre los descansos, o con «Optimizar sacafrancos»."}
                        </p>
                      </div>

                      <div>
                        <label className="cg-eyebrow mb-1.5 block">
                          Estaciones que cubre
                        </label>
                        <div
                          className="max-h-40 overflow-y-auto rounded-xl px-1 py-1"
                          style={{ border: "1px solid var(--hairline)" }}
                        >
                          {stations.map((s) => {
                            const marcada = assignCovered.includes(s.id);

                            return (
                              <label
                                key={s.id}
                                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-[var(--glass-sunken)]"
                              >
                                <input
                                  checked={marcada}
                                  className="cg-focus"
                                  type="checkbox"
                                  onChange={() =>
                                    setAssignCovered((prev) =>
                                      prev.includes(s.id)
                                        ? prev.filter((x) => x !== s.id)
                                        : [...prev, s.id],
                                    )
                                  }
                                />
                                <span
                                  className={marcada ? "font-semibold" : ""}
                                >
                                  {stationLabel(s)}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <p
                            className="text-[10px]"
                            style={{ color: "var(--ink-faint)" }}
                          >
                            {assignCovered.length
                              ? `Sólo buscará descansos que cubrir en ${assignCovered.length} estación(es).`
                              : "Sin marcar ninguna cubre TODAS las estaciones con puestos fijos."}
                          </p>
                          {assignCovered.length > 0 && (
                            <button
                              className="cg-btn-ghost cg-focus shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                              type="button"
                              onClick={() => setAssignCovered([])}
                            >
                              Todas
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  );
                })()}
            </div>
            <div
              className="flex items-center justify-end gap-2 px-5 py-3"
              style={{
                borderTop: "1px solid var(--hairline)",
                background: "var(--glass-sunken)",
              }}
            >
              <button
                className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-all"
                onClick={() => {
                  setShowAssignForm(false);
                  setMoveFrom(null);
                  setAssignEditing(null);
                }}
              >
                {t("actions.cancel")}
              </button>
              <button
                className="cg-btn-brand cg-focus rounded-full px-5 py-2 text-sm font-semibold transition-all disabled:opacity-40"
                disabled={assignSaving || !assignGuard}
                onClick={saveAssignment}
              >
                {assignSaving ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : moveFrom ? (
                  "Mover"
                ) : assignEditing ? (
                  "Guardar cambios"
                ) : assignMode === "single" ? (
                  "Cubrir el día"
                ) : (
                  "Asignar a la rotación"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Configure Station Modal ─────────────────────────────────────── */}
      {configStation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "oklch(0 0 0 / 0.55)" }}
          onClick={() => setConfigStation(null)}
        >
          <div
            className="glass-raised mx-4 max-h-[90vh] w-full max-w-md overflow-hidden overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--hairline)" }}
            >
              <h4 className="text-sm font-semibold">
                Configurar: {stationLabel(configStation)}
              </h4>
              <button
                className="cg-btn-ghost cg-focus rounded-lg p-1.5"
                onClick={() => setConfigStation(null)}
              >
                <X size={15} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <label className="cg-eyebrow mb-2 block">
                {t("ui.Schedule.tipoDeCobertura")}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    value: "24h",
                    label: "24 Horas",
                    desc: "Fijo 1 + Fijo 2 + Sacafranco",
                  },
                  {
                    value: "12h-day",
                    label: "12h Diurno",
                    desc: "Fijo 1 (día) + Sacafranco",
                  },
                  {
                    value: "12h-night",
                    label: "12h Nocturno",
                    desc: "Fijo 1 (noche) + Sacafranco",
                  },
                  {
                    value: "custom",
                    label: "Personalizado",
                    desc: "Ventana propia, bloques, 24×24…",
                  },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    className={`cg-focus rounded-xl p-3 text-left transition-all ${configType === opt.value ? "glass-flat glass-brand" : "glass-flat glass-hover"}`}
                    onClick={() => {
                      setConfigType(opt.value);
                      setConfigRotation("");
                      setCfgRotStyle(null);
                    }}
                  >
                    <div
                      className="text-sm font-semibold"
                      style={
                        configType === opt.value
                          ? { color: "var(--brand-text)" }
                          : undefined
                      }
                    >
                      {opt.label}
                    </div>
                    <div
                      className="mt-0.5 text-[10px]"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {opt.desc}
                    </div>
                  </button>
                ))}
              </div>

              {configType === "custom" && (
                <div className="space-y-3">
                  {/* Quick preset: classic 24×24 alternation (no libres, no SF) */}
                  <button
                    className={`cg-focus w-full rounded-xl px-3 py-2 text-left transition-all ${cfgRestCoverage === "alternate" && cfgWinMin === 1440 && !cfgBlockHours ? "glass-flat glass-brand" : "glass-flat glass-hover"}`}
                    type="button"
                    onClick={() => {
                      setCfgStart("07:00");
                      setCfgEnd("07:00");
                      setCfgBlockHours("");
                      setCfgRestCoverage("alternate");
                      setConfigRotation("");
                      setCfgRotStyle(null);
                    }}
                  >
                    <div className="text-xs font-semibold">
                      Plantilla 24×24 (alternancia diaria)
                    </div>
                    <div
                      className="text-[10px]"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {t(
                        "ui.Schedule.unFijoTrabajaLas24",
                        "Un fijo trabaja las 24 h y el otro va al día siguiente. Sin libres y sin sacafranco.",
                      )}
                    </div>
                  </button>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="cg-eyebrow mb-1.5 block">
                        {t("comun.horaInicio")}
                      </label>
                      <input
                        className="cg-input cg-focus w-full px-3 py-2 font-mono text-sm tabular-nums"
                        type="time"
                        value={cfgStart}
                        onChange={(e) => setCfgStart(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="cg-eyebrow mb-1.5 block">
                        {t("comun.horaFin")}
                      </label>
                      <input
                        className="cg-input cg-focus w-full px-3 py-2 font-mono text-sm tabular-nums"
                        type="time"
                        value={cfgEnd}
                        onChange={(e) => setCfgEnd(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="cg-eyebrow mb-1.5 block">
                      {t("comun.turnoPorVigilante")}
                    </label>
                    <select
                      className="cg-input cg-focus w-full px-3 py-2 text-sm"
                      value={cfgBlockHours}
                      onChange={(e) => setCfgBlockHours(e.target.value)}
                    >
                      <option value="">
                        Toda la jornada (1 fijo
                        {cfgWinMin === 1440 ? " · 24h" : ""})
                      </option>
                      {[4, 6, 8, 12].map((h) => {
                        const fits =
                          cfgWinMin > 0 && cfgWinMin % (h * 60) === 0;
                        const k = fits ? cfgWinMin / (h * 60) : 0;

                        return (
                          <option key={h} disabled={!fits} value={String(h)}>
                            {h}h
                            {fits
                              ? ` → ${k} fijo${k > 1 ? "s" : ""}`
                              : " (no divide la cobertura)"}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="cg-eyebrow mb-1.5 block">
                      {t(
                        "ui.Schedule.coberturaDeDescansos",
                        "Cobertura de descansos",
                      )}
                    </label>
                    <select
                      className="cg-input cg-focus w-full px-3 py-2 text-sm"
                      value={cfgRestCoverage}
                      onChange={(e) =>
                        setCfgRestCoverage(
                          e.target.value as "sacafranco" | "alternate",
                        )
                      }
                    >
                      <option value="sacafranco">
                        {t("comun.sacafrancoCubreLosDescansos")}
                      </option>
                      <option value="alternate">
                        {t("comun.alternanciaEntreFijosSinSacafranco")}
                      </option>
                    </select>
                    {cfgRestCoverage === "alternate" && (
                      <p
                        className="mt-1.5 text-[11px]"
                        style={{
                          color: cfgAlternateOk
                            ? "var(--ink-soft)"
                            : "var(--bad-text)",
                        }}
                      >
                        {!cfgRotStyle
                          ? "Sin patrón elegido se usa 1-1: cada fijo trabaja su bloque completo y alterna con el siguiente, sin libres."
                          : cfgAlternateOk
                            ? `Patrón ${cfgRotWork}-${cfgRotCycle - cfgRotWork}: ${cfgGuardsPerBlock} fijos alternando por bloque, sin sacafranco. Total ${cfgBlockCount * cfgGuardsPerBlock} fijos.`
                            : `El ciclo (${cfgRotCycle}) debe ser múltiplo de los días de trabajo (${cfgRotWork}). Usa 1-1, 2-2, 3-3…`}
                      </p>
                    )}
                    {cfgRestCoverage === "sacafranco" &&
                      cfgBlocksOk &&
                      cfgBlockCount > 1 && (
                        <p
                          className="mt-1.5 text-[11px]"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {cfgWinMin / 60}h de cobertura en {cfgBlockCount}{" "}
                          bloques consecutivos de {Number(cfgBlockHours)}h —{" "}
                          {cfgBlockCount} fijos + sacafranco.
                        </p>
                      )}
                  </div>
                </div>
              )}

              <RotationStyleSelect
                etiquetaPrimerBloque={cfgPrimerTramo}
                etiquetaSegundoBloque={cfgSegundoTramo}
                scheduleType={configType}
                value={configRotation}
                onChange={setConfigRotation}
                onStyleChange={setCfgRotStyle}
                /* Partida en bloques, la estación tiene DOS tramos que repartir en
                   el ciclo (mañana y tarde) — no sólo «trabaja / descansa». */
                bloques={configType === "custom" ? cfgBlockCount : 1}
              />
            </div>
            <div
              className="flex items-center justify-end gap-2 px-5 py-3"
              style={{
                borderTop: "1px solid var(--hairline)",
                background: "var(--glass-sunken)",
              }}
            >
              <button
                className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-all"
                onClick={() => setConfigStation(null)}
              >
                {t("actions.cancel")}
              </button>
              <button
                className="cg-btn-brand cg-focus rounded-full px-5 py-2 text-sm font-semibold transition-all disabled:opacity-40"
                disabled={configSaving}
                onClick={saveStationConfig}
              >
                {configSaving ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  "Guardar"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Override Modal ───────────────────────────────────────────────── */}
      <ExtendShiftDialog
        target={extendTarget}
        onClose={() => setExtendTarget(null)}
        onDone={() => void fetchAll({ silent: true })}
      />

      {overrideTarget &&
        (() => {
          /* ── LA HOJA DE ESE DÍA ───────────────────────────────────────────────
           Cada casillero de la rejilla ES el registro de asistencia de una
           persona en un día: lo que se decide aquí es qué pasó de verdad. El
           diálogo se llamaba «Registrar novedad» y sólo pintaba códigos, así
           que un turno ya generado (una N) no se veía por ningún lado y no
           había forma de cambiarlo ni de borrarlo desde aquí — había que
           adivinar el clic derecho.

           Ahora enseña el turno que hay (horas y puesto), deja cambiarlo a V,
           PM, F o L —que marca el turno como ausencia y abre la novedad de
           cobertura, no lo borra: la evidencia de que estaba programado y no
           trabajó es justo lo que necesita la nómina— y deja además EDITAR sus
           horas o ELIMINARLO cuando lo que hay que corregir es el turno. */
          const turnoDelDia = shiftByGuardDate.get(
            `${overrideTarget.guardId}|${overrideTarget.date}`,
          );
          const stTurno = turnoDelDia
            ? stationsById.get(turnoDelDia.stationId)
            : null;
          const hm = (v: string) => {
            const w = dateToWall(new Date(v), tzName).minutes;

            return `${String(Math.floor(w / 60)).padStart(2, "0")}:${String(w % 60).padStart(2, "0")}`;
          };

          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center"
              style={{ background: "oklch(0 0 0 / 0.55)" }}
              onClick={() => setOverrideTarget(null)}
            >
              <div
                className="glass-raised mx-4 max-h-[90vh] w-full max-w-xs overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="px-5 py-4"
                  style={{ borderBottom: "1px solid var(--hairline)" }}
                >
                  <h4 className="text-sm font-semibold">Qué pasó ese día</h4>
                  <p
                    className="mt-0.5 text-[11px]"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {overrideTarget.guardName} — {overrideTarget.date}
                  </p>
                </div>

                {turnoDelDia && (
                  <div
                    className="mx-4 mt-4 rounded-xl px-3 py-2"
                    style={toneCard("brand", 10, 26)}
                  >
                    <div className="text-[11px] font-semibold">
                      Turno registrado
                      {stTurno ? ` en ${stationLabel(stTurno)}` : ""}
                    </div>
                    <div className="text-[10px] tabular-nums opacity-80">
                      {hm(turnoDelDia.startTime)} – {hm(turnoDelDia.endTime)}
                      {turnoDelDia.status ? ` · ${turnoDelDia.status}` : ""}
                    </div>
                  </div>
                )}

                <div className="p-4 grid grid-cols-2 gap-2">
                  <p
                    className="col-span-2 -mb-1 text-[10px]"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {turnoDelDia
                      ? "V, PM y F dejan el día marcado así en la hoja de asistencia (Nómina) y abren el hueco en Cobertura. El turno se conserva como constancia de que estaba programado — «Deshacer» lo devuelve."
                      : "Marca lo que pasó ese día."}
                  </p>
                  {CODE_ORDER.map((c) => (
                    <button
                      key={c}
                      style={codeCard(c)}
                      onClick={() => performOverrideSave(overrideTarget, c)}
                      /* Misma píldora que en la rejilla: el color que se elige aquí
                     es literalmente el que va a aparecer en la celda — los dos
                     salen de `codePill`. */
                      className="cg-focus rounded-xl px-3 py-2.5 text-xs font-semibold transition-all hover:scale-105"
                    >
                      {c} — {CODE_LABEL[c]}
                    </button>
                  ))}
                  {(() => {
                    const existing = getOverride(
                      overrideTarget.guardId,
                      overrideTarget.date,
                    );

                    if (!existing) return null;

                    return (
                      <button
                        className="cg-focus col-span-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
                        style={toneCard("bad")}
                        onClick={() => removeOverride(existing.id)}
                      >
                        <X className="inline h-3.5 w-3.5 mr-1" />
                        Deshacer — volver a su turno (
                        {CODE_LABEL[existing.type] || existing.type})
                      </button>
                    );
                  })()}

                  {/* El turno en sí: cambiar sus horas o quitarlo. */}
                  {turnoDelDia && (
                    <>
                      <div
                        className="col-span-2 mt-1"
                        style={{ borderTop: "1px solid var(--hairline)" }}
                      />
                      <button
                        className="cg-focus col-span-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
                        style={toneCard("neutral")}
                        onClick={() => {
                          const g = overrideTarget.guardName;

                          setOverrideTarget(null);
                          openShiftEditor(turnoDelDia, g);
                        }}
                      >
                        Editar este turno (horas y estación)…
                      </button>
                      <button
                        className="cg-focus col-span-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
                        style={toneCard("bad")}
                        onClick={() => {
                          setOverrideTarget(null);
                          void deleteDayShift(turnoDelDia);
                        }}
                      >
                        <X className="inline h-3.5 w-3.5 mr-1" />
                        Eliminar este turno
                      </button>
                    </>
                  )}
                </div>
                <div
                  className="flex justify-end px-5 py-3"
                  style={{
                    borderTop: "1px solid var(--hairline)",
                    background: "var(--glass-sunken)",
                  }}
                >
                  <button
                    className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-all"
                    onClick={() => setOverrideTarget(null)}
                  >
                    {t("actions.close")}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* ─── Editar un turno ya generado ──────────────────────────────────── */}
      {shiftEdit &&
        (() => {
          const toMin = (x: string) => {
            const [h, mm] = x.split(":").map((n) => parseInt(n, 10) || 0);

            return (h % 24) * 60 + (mm % 60);
          };
          const sMin = toMin(shiftEdit.start);
          const eMin = toMin(shiftEdit.end);
          const durH = ((eMin <= sMin ? eMin + 1440 : eMin) - sMin) / 60;
          const set = (patch: Partial<NonNullable<typeof shiftEdit>>) =>
            setShiftEdit((m) => (m ? { ...m, ...patch } : m));
          /* Los turnos que de verdad existen en la estación de destino, con el
             espejo del servidor. Aquí había una copia propia que sí filtraba
             sacafrancos pero NO reponía la mitad de noche de un 24 h: en un
             puesto cuyas dos plazas comparten ventana, este diálogo sólo
             ofrecía el turno de día y no había forma de mover a alguien a la
             noche. */
          const plazasDestino = positions.filter(
            (pp: any) => pp.stationId === shiftEdit.stationId,
          );
          const estacionDestino = stations.find(
            (x: any) => x.id === shiftEdit.stationId,
          );
          const deLasPlazas = jornadasDePlazas(
            plazasDestino as any,
            (estacionDestino as any)?.scheduleType,
          );
          const turnos = (
            deLasPlazas.length
              ? deLasPlazas
              : jornadasPorTipo((estacionDestino as any)?.scheduleType || "24h")
          ).map((b: { tipo: string; startTime: string; endTime: string }) => ({
            ini: b.startTime,
            fin: b.endTime,
            etiqueta: b.tipo,
          }));
          const cambiaEstacion =
            shiftEdit.stationId !== shiftEdit.shift.stationId;

          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center"
              style={{ background: "oklch(0 0 0 / 0.55)" }}
              onClick={() => !shiftEditSaving && setShiftEdit(null)}
            >
              <div
                className="glass-raised mx-4 max-h-[90vh] w-full max-w-sm overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="flex items-center justify-between px-5 py-4"
                  style={{ borderBottom: "1px solid var(--hairline)" }}
                >
                  <div>
                    <h4 className="text-sm font-semibold">Editar el turno</h4>
                    <p
                      className="mt-0.5 text-[11px]"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {shiftEdit.guardName} — {shiftEdit.dateStr}
                    </p>
                  </div>
                  <button
                    className="cg-btn-ghost cg-focus rounded-lg p-1.5"
                    disabled={shiftEditSaving}
                    onClick={() => setShiftEdit(null)}
                  >
                    <X size={15} />
                  </button>
                </div>

                <div className="space-y-4 p-5">
                  <div>
                    <label className="cg-eyebrow mb-1.5 block">Estación</label>
                    <select
                      className="cg-input cg-focus w-full px-3 py-2.5 text-sm"
                      value={shiftEdit.stationId}
                      onChange={(e) => set({ stationId: e.target.value })}
                    >
                      {stations.map((st) => (
                        <option key={st.id} value={st.id}>
                          {stationLabel(st)}
                        </option>
                      ))}
                    </select>
                    {cambiaEstacion && (
                      <p
                        className="mt-1 text-[10px]"
                        style={{ color: "var(--warn-text)" }}
                      >
                        El turno se mueve de estación. Deja de contar como
                        cobertura de su plaza anterior.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="cg-eyebrow mb-1.5 block">Turno</label>
                    <div
                      className="mb-2 grid gap-2"
                      style={{
                        gridTemplateColumns: `repeat(${Math.min(3, turnos.length)}, minmax(0, 1fr))`,
                      }}
                    >
                      {turnos.map((b) => {
                        const activo =
                          shiftEdit.start === b.ini && shiftEdit.end === b.fin;

                        return (
                          <button
                            key={`${b.ini}|${b.fin}`}
                            className={`cg-focus rounded-xl border px-2 py-2 text-center transition-all ${activo ? "glass-brand" : "glass-flat"}`}
                            type="button"
                            onClick={() => set({ start: b.ini, end: b.fin })}
                          >
                            <div className="text-xs font-semibold">
                              {b.etiqueta}
                            </div>
                            <div
                              className="text-[10px] tabular-nums"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              {b.ini}–{b.fin}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="cg-eyebrow mb-1 block">Entra</label>
                        <input
                          className="cg-input cg-focus w-full px-2 py-2 font-mono text-sm tabular-nums"
                          type="time"
                          value={shiftEdit.start}
                          onChange={(e) => set({ start: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="cg-eyebrow mb-1 block">Sale</label>
                        <input
                          className="cg-input cg-focus w-full px-2 py-2 font-mono text-sm tabular-nums"
                          type="time"
                          value={shiftEdit.end}
                          onChange={(e) => set({ end: e.target.value })}
                        />
                      </div>
                    </div>
                    <p
                      className="mt-1 text-[10px]"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      Jornada de{" "}
                      <b>{durH % 1 === 0 ? durH : durH.toFixed(1)} h</b>
                      {eMin <= sMin ? " (termina al día siguiente)" : ""}.
                    </p>
                  </div>

                  {shiftEdit.shift.positionId && (
                    <div
                      className="rounded-xl px-3 py-2"
                      style={toneCard("warn", 10, 26)}
                    >
                      <p className="text-[11px]">
                        Este turno lo generó la rotación. El cambio se queda
                        hasta que se reoptimice o se reasigne el puesto; para
                        que no vuelva, corrige las horas de la plaza en la
                        cabecera de la estación.
                      </p>
                    </div>
                  )}
                </div>

                <div
                  className="flex items-center justify-between gap-2 px-5 py-3"
                  style={{
                    borderTop: "1px solid var(--hairline)",
                    background: "var(--glass-sunken)",
                  }}
                >
                  <button
                    className="cg-focus rounded-full px-3 py-2 text-xs font-semibold transition-all disabled:opacity-40"
                    disabled={shiftEditSaving}
                    style={toneCard("bad")}
                    onClick={() => {
                      const sh = shiftEdit.shift;

                      setShiftEdit(null);
                      void deleteDayShift(sh);
                    }}
                  >
                    <X className="inline h-3.5 w-3.5 mr-1" />
                    Eliminar
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-semibold"
                      disabled={shiftEditSaving}
                      onClick={() => setShiftEdit(null)}
                    >
                      Cancelar
                    </button>
                    <button
                      className="cg-btn-brand cg-focus rounded-full px-5 py-2 text-sm font-semibold transition-all disabled:opacity-40"
                      disabled={shiftEditSaving}
                      onClick={saveShiftEdit}
                    >
                      {shiftEditSaving ? (
                        <Loader2 className="animate-spin" size={14} />
                      ) : (
                        "Guardar"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {/* ─── Draft horario review/diff Modal ──────────────────────────────── */}
      {proposalData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "oklch(0 0 0 / 0.5)" }}
        >
          <div className="glass-raised flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden">
            <div
              className="px-5 py-4"
              style={{ borderBottom: "1px solid var(--hairline)" }}
            >
              <div className="flex items-center gap-2">
                {planData ? (
                  <CheckCircle2 size={18} style={{ color: "var(--ok-text)" }} />
                ) : (
                  <FileText size={18} style={{ color: "var(--brand-text)" }} />
                )}
                <h3 className="font-display text-base font-bold">
                  {planData
                    ? t(
                        "ui.Schedule.planDeImplementacion",
                        "Plan de implementación",
                      )
                    : t("ui.Schedule.borradorDeHorario", "Borrador de horario")}
                </h3>
              </div>
              <p className="mt-1 text-xs" style={{ color: "var(--ink-soft)" }}>
                {planData
                  ? "Horario publicado. Estos vigilantes fueron notificados de sus cambios."
                  : "Revisa los cambios propuestos. Nada se aplica hasta que publiques."}
              </p>
            </div>

            {planData ? (
              /* Implementation plan (post-publish): who was notified */
              <div className="flex-1 overflow-auto px-5 py-3">
                <div
                  className="mb-3 flex items-center gap-2 rounded-xl px-3 py-2"
                  style={tonePill("ok", 12)}
                >
                  <Users size={16} />
                  <span className="text-sm font-semibold">
                    {planData?.plan?.notifiedGuards ?? 0} de{" "}
                    {planData?.plan?.totalGuards ??
                      planData?.items?.length ??
                      0}{" "}
                    vigilantes notificados
                  </span>
                </div>
                {(planData?.items || []).length ? (
                  <div
                    className="divide-y"
                    style={{ borderColor: "var(--hairline)" }}
                  >
                    {(planData.items || []).map((it: PlanItem) => {
                      const ch: string[] = [];

                      if (it.added) ch.push(`+${it.added}`);
                      if (it.changed) ch.push(`~${it.changed}`);
                      if (it.removed) ch.push(`-${it.removed}`);
                      const ok = it.notifyStatus === "sent";

                      return (
                        <div
                          key={it.id || it.guardId}
                          className="flex items-center gap-3 py-2"
                        >
                          <span
                            className="shrink-0"
                            style={{
                              color: ok ? "var(--ok-text)" : "var(--ink-faint)",
                            }}
                          >
                            {ok ? (
                              <CheckCircle2 size={15} />
                            ) : (
                              <Clock size={15} />
                            )}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {it.guardName || "Vigilante"}
                          </span>
                          <span
                            className="shrink-0 font-mono text-xs tabular-nums"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {ch.join(" ")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p
                    className="py-8 text-center text-sm"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {t(
                      "ui.Schedule.noHuboVigilantesAfectados",
                      "No hubo vigilantes afectados.",
                    )}
                  </p>
                )}
              </div>
            ) : (
              <>
                {/* Summary counters */}
                {(() => {
                  const s = proposalData?.proposal?.summary || {};
                  const cards = [
                    {
                      label: "Nuevos",
                      value: s.added || 0,
                      icon: <PlusIcon size={14} />,
                      tone: "ok" as Tone,
                    },
                    {
                      label: "Eliminados",
                      value: s.removed || 0,
                      icon: <MinusCircle size={14} />,
                      tone: "bad" as Tone,
                    },
                    {
                      label: "Modificados",
                      value: s.changed || 0,
                      icon: <RefreshCw size={14} />,
                      tone: "warn" as Tone,
                    },
                    {
                      label: "Vigilantes afectados",
                      value: s.guardsAffected || 0,
                      icon: <Users size={14} />,
                      tone: "neutral" as Tone,
                    },
                  ];

                  return (
                    <div
                      className="grid grid-cols-2 gap-2 px-5 py-3 sm:grid-cols-4"
                      style={{ borderBottom: "1px solid var(--hairline)" }}
                    >
                      {cards.map((c) => (
                        <div
                          key={c.label}
                          className="glass-flat p-2 text-center"
                        >
                          <div
                            className="flex items-center justify-center gap-1"
                            style={{ color: toneInk(c.tone) }}
                          >
                            {c.icon}
                            <span className="text-lg font-bold tabular-nums">
                              {c.value}
                            </span>
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
                  const cov =
                    proposalData?.proposal?.summary?.warnings?.coverage;

                  if (!cov) return null;
                  const ok = (cov.gapCount || 0) === 0;

                  return (
                    <div
                      className="flex items-center justify-between px-5 py-2.5"
                      style={{ borderBottom: "1px solid var(--hairline)" }}
                    >
                      <div className="flex items-center gap-2">
                        {ok ? (
                          <CheckCircle2
                            size={15}
                            style={{ color: "var(--ok-text)" }}
                          />
                        ) : (
                          <AlertTriangle
                            size={15}
                            style={{ color: "var(--bad-text)" }}
                          />
                        )}
                        <span
                          className="text-[11px]"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {t(
                            "dashboard.coverage.title",
                            "Cobertura de puestos",
                          )}{" "}
                          <span style={{ color: "var(--ink-faint)" }}>
                            {t("ui.Schedule.14Dias", "(14 días)")}
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span
                          className="font-bold tabular-nums"
                          style={{
                            color: ok ? "var(--ok-text)" : "var(--bad-text)",
                          }}
                        >
                          {cov.coveredPct}%
                        </span>
                        {(cov.gapCount || 0) > 0 && (
                          <span
                            className="font-semibold tabular-nums"
                            style={{ color: "var(--bad-text)" }}
                          >
                            {cov.gapCount} sin cubrir
                          </span>
                        )}
                        {(cov.overstaffCount || 0) > 0 && (
                          <span
                            className="tabular-nums"
                            style={{ color: "var(--warn-text)" }}
                          >
                            {cov.overstaffCount} sobre-cubierto
                          </span>
                        )}
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

                  if (w.doubleBookings?.length)
                    lines.push(
                      `${w.doubleBookings.length} vigilante(s) con doble asignación el mismo día`,
                    );
                  if (w.restViolations?.length)
                    lines.push(
                      `${w.restViolations.length} vigilante(s) sin descanso semanal (más de ${w.maxConsecutiveAllowed || 7} días seguidos)`,
                    );
                  // Estos dos SE CALCULABAN y viajaban en la respuesta, y esta lista
                  // no los leía: se podía fijar «descanso mínimo 12 h» y «tope 40 h
                  // semanales» en Configuración › Jornada, publicar un horario que
                  // violara las dos, y no recibir ni una señal. El ajuste existía,
                  // el motor existía, y no llegaba a la pantalla.
                  if (w.shortRests?.length)
                    lines.push(
                      `${w.shortRests.length} vigilante(s) con menos del descanso mínimo entre turnos`,
                    );
                  if (w.weeklyOverloads?.length)
                    lines.push(
                      `${w.weeklyOverloads.length} vigilante(s) por encima del tope de horas semanales`,
                    );
                  if (w.sfStyleInconsistencies?.length)
                    lines.push(
                      `${w.sfStyleInconsistencies.length} sitio(s) con sacafrancos en estilos de turno distintos`,
                    );
                  if (!lines.length) return null;

                  return (
                    <div
                      className="px-5 py-2.5"
                      style={{ borderBottom: "1px solid var(--hairline)" }}
                    >
                      <div
                        className="flex items-start gap-2 rounded-xl px-3 py-2"
                        style={tonePill("warn", 12)}
                      >
                        <AlertTriangle className="mt-0.5 shrink-0" size={15} />
                        <div className="text-[11px] leading-relaxed">
                          <p className="font-semibold">
                            {t(
                              "ui.Schedule.revisaAntesDePublicar",
                              "Revisa antes de publicar:",
                            )}
                          </p>
                          <ul className="list-disc pl-4">
                            {lines.map((l, i) => (
                              <li key={i}>{l}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Change list */}
                <div className="flex-1 overflow-auto px-5 py-3">
                  {(() => {
                    const changes = (proposalData?.changes || []).filter(
                      (c: ProposalChange) => c.action !== "keep",
                    );

                    if (!changes.length) {
                      return (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <CheckCircle2
                            className="mb-2"
                            size={28}
                            style={{ color: "var(--ok-text)" }}
                          />
                          <p className="text-sm font-semibold">
                            {t(
                              "ui.Schedule.elHorarioYaEstaAl",
                              "El horario ya está al día",
                            )}
                          </p>
                          <p
                            className="text-xs"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {t("ui.Schedule.noHayCambiosQueAplicar")}
                          </p>
                        </div>
                      );
                    }
                    const fmt = (d: string) => {
                      try {
                        return new Date(d).toLocaleString(undefined, {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        });
                      } catch {
                        return d;
                      }
                    };
                    const badge: Record<string, Tone> = {
                      add: "ok",
                      remove: "bad",
                      change: "warn",
                    };
                    const label: Record<string, string> = {
                      add: "Nuevo",
                      remove: "Eliminar",
                      change: "Cambio",
                    };

                    return (
                      <div
                        className="divide-y"
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        {changes.slice(0, 300).map((c: ProposalChange) => (
                          <div
                            key={c.id}
                            className="flex items-center gap-3 py-2"
                          >
                            <span
                              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                              style={tonePill(
                                badge[c.action || ""] || "neutral",
                                12,
                              )}
                            >
                              {label[c.action || ""] || c.action}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm tabular-nums">
                                {fmt(c.startTime || "")}{" "}
                                {c.meta?.shiftType
                                  ? `· ${c.meta.shiftType === "night" ? "Nocturno" : c.meta.shiftType === "day" ? "Diurno" : c.meta.shiftType}`
                                  : ""}
                              </p>
                            </div>
                          </div>
                        ))}
                        {changes.length > 300 && (
                          <p
                            className="py-2 text-center text-[11px]"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            +{changes.length - 300} cambios más…
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </>
            )}

            <div
              className="flex items-center justify-between gap-3 px-5 py-3"
              style={{
                borderTop: "1px solid var(--hairline)",
                background: "var(--glass-sunken)",
              }}
            >
              {planData ? (
                <button
                  className="cg-btn-brand cg-focus ml-auto rounded-full px-6 py-2.5 text-sm font-semibold transition-all"
                  onClick={closeProposalModal}
                >
                  Listo
                </button>
              ) : (
                <>
                  <button
                    className="cg-focus flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-all disabled:opacity-50"
                    disabled={publishing}
                    style={{ color: "var(--bad-text)" }}
                    onClick={discardProposal}
                  >
                    <Trash2 size={14} /> Descartar
                  </button>
                  {(() => {
                    const gaps =
                      proposalData?.proposal?.summary?.warnings?.coverage
                        ?.gapCount || 0;
                    const hasGaps = gaps > 0;

                    return (
                      <button
                        className={`cg-focus flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-all disabled:opacity-50 ${hasGaps ? "cg-btn-bad" : "cg-btn-brand"}`}
                        disabled={publishing}
                        onClick={() => publishProposal(hasGaps)}
                      >
                        {publishing ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          <CheckCircle2 size={14} />
                        )}
                        {publishing
                          ? "Publicando..."
                          : hasGaps
                            ? "Publicar con faltantes"
                            : "Publicar y aplicar"}
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
