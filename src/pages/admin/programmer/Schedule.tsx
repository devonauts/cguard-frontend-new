import { usePuede } from "@/hooks/usePuede";
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
import CorrerCicloModal from "@/components/schedule/CorrerCicloModal";
import {
  handlersDePulsacionLarga,
  type PuntoDePulsacion,
} from "./pulsacionLarga";
import SupervisionSection from "./SupervisionSection";
import AllStaffSection from "./AllStaffSection";
import AsignarAPuestoModal from "./AsignarAPuestoModal";
import MonthStationBlock, {
  type BlockSel,
  type MonthGridHandlers,
} from "./MonthStationBlock";
import BloqueVisible from "./BloqueVisible";
import MonthCalendar from "./MonthCalendar";
import { stationService } from "@/lib/api/stationService";
import { clientDisplayName, isPersonFallback } from "@/lib/clientName";

import AgendaView from "./AgendaView";
import OrganigramaView, { type SedeInfo } from "./OrganigramaView";
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
import { Link, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  StatusBadge,
  Segmented,
  IconTile,
  EmptyState,
  NumberStepper,
} from "@/components/kit";

import HorarioModos from "./HorarioModos";
import { aplicarDeUnaVez, DraftConflict } from "@/lib/planificador/servidor";
import { MeterBar } from "@/components/charts";
import { ApiService } from "@/services/api/apiService";
import { confirmDialog } from "@/components/ui/confirmDialog";
import RotationStyleSelect from "@/components/schedule/RotationStyleSelect";
import {
  etiquetaPrimerTramo,
  etiquetaSegundoTramo,
} from "@/components/schedule/tramos";
import { stationLabel } from "@/lib/stationName";
import {
  esSemanal,
  nombreDeEstilo,
  type Traductor,
} from "@/lib/secuenciaDeRotacion";
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
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";
import { crearSocket, cerrarSocket } from "@/lib/socket";
import { getAuthToken } from "@/lib/api";
import i18n from "@/i18n";
import { todosLosVigilantes, listarTodo } from "@/lib/listarCompleto";
import { ErrorDeCarga } from "@/components/kit/ErrorDeCarga";

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

/** Short weekday label in the active UI language ("Lun", "Mon"…). */
const diaCorto = (d: Date): string => {
  const s = d
    // tz: civil day built at local midnight (a calendar date, not an instant).
    .toLocaleDateString(localeActual(), { weekday: "short" })
    .replace(".", "");

  return s.charAt(0).toUpperCase() + s.slice(1);
};

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

/**
 * La casilla del ciclo por la que entró una asignación, deshaciendo su fase.
 *
 * La fase es la INVERSA del índice (`fase = dse(alta) − índice`), así que el
 * índice se recupera restando al revés. Sin esto, abrir un sacafranco que entró
 * en la noche 1 muestra «D1» y guardarlo lo re-fasea en silencio — le mueve el
 * mes entero por haberle corregido el nombre.
 */
const ranuraDesdeLaFase = (
  asg: { startDate?: any; platoonOffset?: any } | null | undefined,
  ciclo: { dayShifts?: number; nightShifts?: number; restDays?: number } | null | undefined,
): number => {
  if (!asg?.startDate || !ciclo) return 0;
  const largo =
    (ciclo.dayShifts || 0) + (ciclo.nightShifts || 0) + (ciclo.restDays || 0);

  if (largo <= 0) return 0;
  const dse = dseOf(new Date(`${String(asg.startDate).slice(0, 10)}T00:00:00`));

  return (((dse - (Number(asg.platoonOffset) || 0)) % largo) + largo) % largo;
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
  if (!r)
    return i18n.t(
      "ui.Schedule.ranuraPrimerTurnoDeDia",
      "Ese día trabaja el primer turno de día del ciclo.",
    );
  if (r.tipo === "libre")
    return i18n.t(
      "ui.Schedule.ranuraEmpiezaLibrando",
      "Empieza librando: sus turnos arrancan cuando termine ese bloque de libres.",
    );
  if (r.tipo === "noche")
    return i18n.t("ui.Schedule.ranuraEntraDirectoALa", {
      defaultValue:
        "Entra directo a la {{etiqueta}} del ciclo, no por el primer turno de día.",
      etiqueta: r.etiqueta,
    });

  return r.i === 0
    ? i18n.t(
        "ui.Schedule.ranuraPrimerTurnoDeDiaNormal",
        "Ese día trabaja el primer turno de día del ciclo — lo normal.",
      )
    : i18n.t("ui.Schedule.ranuraEntraPorLa", {
        defaultValue:
          "Entra por la {{etiqueta}}: ese día ya lleva {{n}} turno(s) de día corridos del ciclo.",
        etiqueta: r.etiqueta,
        n: r.i,
      });
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
                ? i18n.t("ui.Schedule.turnoDeDiaNDelCiclo", {
                    defaultValue: "Turno de día {{n}} del ciclo",
                    n: r.i + 1,
                  })
                : r.tipo === "noche"
                  ? i18n.t("ui.Schedule.turnoDeNocheNDelCiclo", {
                      defaultValue: "Turno de tarde/noche {{n}} del ciclo",
                      n: r.i + 1,
                    })
                  : i18n.t("ui.Schedule.diaLibreNDelCiclo", {
                      defaultValue: "Día libre {{n}} del ciclo",
                      n: r.i + 1,
                    })
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
const VISTAS = [
  "month",
  "calendar",
  "week",
  "day",
  "agenda",
  "organigrama",
] as const;

/* ── UNA HOJA DE CÁLCULO NO ES UNA PREFERENCIA EN UN TELÉFONO ──────────────
   La caída a Agenda en pantalla estrecha estaba escrita, pero iba LA ÚLTIMA:
   sólo se aplicaba si no había preferencia guardada. Y quien usa el CRM en el
   escritorio tiene «month» guardado —en `localStorage` y en la cuenta, que
   además sincroniza entre dispositivos—, así que en el móvil abría la rejilla
   igualmente. Ésa es la queja: «no vale nada en móvil».

   En 390 px una rejilla obliga a desplazarse en las dos direcciones para leer
   un dato; eso no es lo que nadie eligió, es un estado roto. Así que la
   pantalla manda sobre lo guardado, y SÓLO en este sentido: se cae a Agenda,
   nunca al revés. La preferencia del escritorio no se toca — al volver al
   ordenador sigue en su vista. */
const vistaUsableAqui = (v: ViewMode): ViewMode => {
  try {
    // El organigrama también es una lista: sirve igual en el teléfono.
    if (
      v !== "agenda" &&
      v !== "organigrama" &&
      window.matchMedia("(max-width: 767px)").matches
    )
      return "agenda";
  } catch {
    /* SSR o navegador sin matchMedia */
  }

  return v;
};

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

/** Phase 2: the station requirement is edited only in the station sheet. The
    old in-grid editors stay below this switch until the single schedule
    editor replaces this page. */
const REQUISITO_EN_LA_FICHA: boolean = true;

export default function Schedule() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  /* Read-only for who cannot edit stations (lib/reglasDeAcciones): the menus,
     the assign form and drag-and-drop say why instead of failing on save. */
  const editarHorario = usePuede("turnos.editarHorario");
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
  /** The last load failed: say it instead of «no stations yet». */
  const [falloCarga, setFalloCarga] = useState(false);
  const [refreshing, setRefreshing] = useState(false); // silent refetches (grid stays mounted)
  const hasLoadedRef = useRef(false);
  /** Bumped after every load so «Todo el personal» reloads with the sheet. */
  const [personalVersion, setPersonalVersion] = useState(0);

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

      if (esVista(cache)) return vistaUsableAqui(cache);
    } catch {
      /* almacenamiento bloqueado */
    }
    if (esVista(savedView.v) && savedView.v !== "month")
      return vistaUsableAqui(savedView.v);
    // Sin preferencia: en una pantalla estrecha la hoja de cálculo no sirve.
    return vistaUsableAqui("month");
  });

  /* Lo que diga la CUENTA gana a la caché local — salvo que la persona acabe de
     tocar el selector en esta pestaña (`cambioLocalReciente`), porque entonces
     el servidor todavía va por detrás y devolverle el valor viejo se vería como
     que la elección «no se guardó». Es la misma cautela que usan el tema y el
     acento. */
  /* Ancho de pantalla, en vivo: girar el teléfono o abrir el CRM en una ventana
     estrecha cambia lo que tiene sentido ofrecer. */
  const [pantallaEstrecha, setPantallaEstrecha] = useState(() => {
    try {
      return window.matchMedia("(max-width: 767px)").matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let mq: MediaQueryList;

    try {
      mq = window.matchMedia("(max-width: 767px)");
    } catch {
      return;
    }
    const alCambiar = () => setPantallaEstrecha(mq.matches);

    mq.addEventListener("change", alCambiar);

    return () => mq.removeEventListener("change", alCambiar);
  }, []);

  const vistaDeCuentaAplicada = useRef(false);

  useEffect(() => {
    let vivo = true;

    leerAparienciaDeLaCuenta().then((ap) => {
      if (!vivo || vistaDeCuentaAplicada.current) return;
      vistaDeCuentaAplicada.current = true;
      if (cambioLocalReciente()) return;
      const v = ap?.scheduler?.view;

      if (esVista(v)) {
        // Lo mismo que al montar: la cuenta puede traer «month» desde el
        // escritorio, y en un teléfono eso es volver a la hoja de cálculo.
        setView(vistaUsableAqui(v));
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
  /* ── LA ESTACIÓN SE CONFIGURA COMO EL SACAFRANCO: POR PASOS ──────────────
     Este diálogo era una sola pantalla que abría por el tipo de cobertura —lo
     más estructural y lo que menos se toca— y no decía en ningún momento QUIÉN
     está dentro. Se cambiaba el ciclo de un puesto sin ver que tenía tres
     vigilantes trabajándolo.

     Ahora sigue la forma que ya funciona en el alta del sacafranco: primero
     quiénes, luego su ciclo, y la jornada al final. Y el ciclo se guarda por la
     puerta que NO da de baja a nadie (`PUT /station/:id/rotation`). */
  /** Móvil: hoja para elegir a qué puesto entrar (la rejilla no está). */
  const [elegirPuesto, setElegirPuesto] = useState(false);

  /* ── LAS SEDES, SÓLO PARA EL ORGANIGRAMA ───────────────────────────────────
     El resumen del programador trae de cada estación el `postSiteId`, no el
     nombre de la sede. El organigrama agrupa por sede, así que se pide la lista
     de sedes una vez —la misma lectura cacheada que usan las demás pantallas—
     y sólo cuando alguien abre esa vista. */
  const [sedesDelOrganigrama, setSedesDelOrganigrama] = useState<
    Map<string, SedeInfo>
  >(() => new Map());
  const sedesPedidas = useRef(false);

  useEffect(() => {
    if (view !== "organigrama" || sedesPedidas.current) return;
    sedesPedidas.current = true;
    listarTodo(({ limit, offset }) => stationService.list({}, { limit, offset }))
      .then((res) => {
        const m = new Map<string, SedeInfo>();

        for (const r of res?.rows || []) {
          const c: any = (r as any).client;

          m.set(String(r.id), {
            nombre: r.name || (r as any).companyName || "",
            // Si el cliente no tiene nombre de empresa, `clientDisplayName`
            // cae al de la persona de contacto, que debajo de una sede se
            // lee como si fuera el cliente. Mejor nada.
            cliente:
              c && !isPersonFallback(c)
                ? clientDisplayName(c) || undefined
                : undefined,
          });
        }
        setSedesDelOrganigrama(m);
      })
      .catch(() => {
        // Sin nombres de sede el árbol se agrupa igual; vuelve a intentarlo
        // la próxima vez que se abra la vista.
        sedesPedidas.current = false;
      });
  }, [view]);
  const [configPaso, setConfigPaso] = useState<1 | 2 | 3>(1);
  const [cfgRotMode, setCfgRotMode] = useState<"rotativo" | "manual">("rotativo");
  const [cfgDias, setCfgDias] = useState(4);
  const [cfgNoches, setCfgNoches] = useState(4);
  const [cfgLibres, setCfgLibres] = useState(2);
  /** El ciclo que la estación tenía al abrir: sin esto no se sabe si cambió. */
  const [cfgRotOriginal, setCfgRotOriginal] = useState<string>("");
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
  /** El ciclo que dibujan las tres ruedas del paso 2. */
  const cfgCicloLen = Math.max(0, cfgDias) + Math.max(0, cfgNoches) + Math.max(0, cfgLibres);
  const cfgNombreCiclo =
    cfgNoches > 0 ? `${cfgDias}-${cfgNoches}-${cfgLibres}` : `${cfgDias}-${cfgLibres}`;
  /** ¿Las ruedas dicen algo distinto de lo que la estación tiene guardado? */
  const cfgCambiaElCiclo = useMemo(() => {
    if (cfgRotMode !== "rotativo") return false;
    const actual = cfgRotOriginal
      ? rotationStyles.find((r) => r.id === cfgRotOriginal)
      : null;

    if (!actual) return cfgDias + cfgNoches > 0;

    return (
      (actual.dayShifts || 0) !== cfgDias ||
      (actual.nightShifts || 0) !== cfgNoches ||
      (actual.restDays || 0) !== cfgLibres
    );
  }, [cfgRotMode, cfgRotOriginal, rotationStyles, cfgDias, cfgNoches, cfgLibres]);

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
    view === "calendar" || view === "agenda" || view === "organigrama"
      ? calRange.desde
      : view === "month"
        ? fmtDate(rango.desde)
        : fmtDate(addDays(timelineDays[0], -1));
  const endDateStr =
    view === "calendar" || view === "agenda" || view === "organigrama"
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
            ApiService.get(`/tenant/${tenantId}/rotation-styles?includeArchived=1`),
            todosLosVigilantes(tenantId),
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
        setFalloCarga(false);
        setPersonalVersion((v) => v + 1);
      } catch (e: any) {
        console.error("[Scheduler] fetch error", e);
        setFalloCarga(true);
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

  /* ── «TODO EL PERSONAL» ─────────────────────────────────────────────────
     Stable props so the memoized band does not repaint on every drag of the
     sheet: the tints read the same precomputed arrays as the sheet, and the
     «Asignar a un puesto» handler goes through a ref. */
  const tintPersonalMes = useCallback(
    (_d: Date, i: number) =>
      monthDayStrs[i] === tzToday()
        ? TINT_TODAY
        : monthDaySunday[i]
          ? TINT_SUNDAY
          : undefined,
    [monthDayStrs, monthDaySunday],
  );
  const tintPersonalLinea = useCallback(
    (d: Date) =>
      fmtDate(d) === tzToday()
        ? TINT_TODAY
        : d.getDay() === 0
          ? TINT_SUNDAY
          : undefined,
    [],
  );
  const [asignarPersona, setAsignarPersona] = useState<{
    userId: string;
    name: string;
  } | null>(null);
  const abrirAsignarPersona = useCallback(
    (p: { userId: string; name: string }) => setAsignarPersona(p),
    [],
  );

  /* ── EL HORARIO SE ENTERA SOLO DE LOS TURNOS NUEVOS ──────────────────────
     Al crear una estación o asignar a alguien, los turnos se generan EN
     SEGUNDO PLANO: el Horario se cargaba antes de que terminaran y se quedaba
     sin ellos hasta que se recargaba la página a mano (2026-10-02, «no está
     automarcando los turnos creados, toca dar refresh»). El servidor ya avisa
     con `schedule:changed` al terminar cada generación; nadie lo escuchaba.
     Ahora se recarga en silencio —la rejilla no se desmonta— agrupando la
     ráfaga de avisos de una estación con varias plazas en una sola consulta,
     y al reconectar el socket se recupera lo que pudo pasar mientras estaba
     caído. */
  const fetchAllRef = useRef(fetchAll);

  useEffect(() => {
    fetchAllRef.current = fetchAll;
  }, [fetchAll]);
  useEffect(() => {
    if (!tenantId) return;
    let espera: ReturnType<typeof setTimeout> | null = null;
    let yaConecto = false;
    const recargar = () => {
      if (espera) clearTimeout(espera);
      espera = setTimeout(() => {
        espera = null;
        void fetchAllRef.current({ silent: true });
      }, 1200);
    };
    const alConectar = () => {
      if (yaConecto) recargar();
      yaConecto = true;
    };
    let socket: ReturnType<typeof crearSocket> | null = null;

    try {
      socket = crearSocket(getAuthToken() || "", String(tenantId));
      socket.on("schedule:changed", recargar);
      socket.on("connect", alConectar);
    } catch {
      /* sin socket: el Horario sigue funcionando como antes */
    }

    return () => {
      if (espera) clearTimeout(espera);
      if (socket) {
        socket.off("schedule:changed", recargar);
        socket.off("connect", alConectar);
        cerrarSocket(socket);
      }
    };
  }, [tenantId]);

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
  //
  // Quien DOBLA tiene dos turnos ese día: el suyo y el que le tocó encadenar.
  // Aquí gana siempre el suyo. Ganaba el último —que es justo el doblaje,
  // porque empieza más tarde— y su propia casilla pasaba de «D» a «N»: el
  // horario mentía sobre el turno que de verdad le toca. El doblaje se ve donde
  // corresponde, en la píldora «2×» de la plaza que fue a cubrir.
  const shiftByGuardDate = useMemo(() => {
    const m = new Map<string, ShiftRecord>();

    for (const s of shifts) {
      if (!s.startTime) continue;
      const k = `${s.guardId}|${dateToWall(new Date(s.startTime), tzName).dateStr}`;
      const previo = m.get(k);

      if (s.status === "extension" && previo && previo.status !== "extension")
        continue;

      m.set(k, s);
    }

    return m;
  }, [shifts, tzName]);

  /**
   * `${guardId}|${positionId}|${dateStr}` → el turno de ESE vigilante en ESA
   * plaza. La casilla de un fijo lo mira primero: si su titular dobló el mismo
   * día, saber cuáles son sus turnos no basta para decidir qué letra le toca a
   * ESTA casilla; hay que quedarse con el de esta plaza.
   */
  const shiftByGuardPosDate = useMemo(() => {
    const m = new Map<string, ShiftRecord>();

    for (const s of shifts) {
      if (!s.startTime || !s.positionId) continue;
      const k = `${s.guardId}|${s.positionId}|${dateToWall(new Date(s.startTime), tzName).dateStr}`;
      const previo = m.get(k);

      // Gana el primero, y entre un doblaje y un turno normal, el normal.
      if (previo && (previo.status !== "extension" || s.status === "extension"))
        continue;

      m.set(k, s);
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

  /* ── QUIÉNES ESTÁN DENTRO, PLAZA A PLAZA ────────────────────────────────
     Se listan las PLAZAS, no las asignaciones: así se ven también las vacías,
     que son la mitad de la pregunta —«¿quién está aquí?» casi siempre acaba en
     «y aquí no hay nadie»—. Las asignaciones sin plaza (`adhoc`) van al final,
     porque existen pero no ocupan asiento. */
  const cfgFilas = useMemo(() => {
    type Fila = {
      key: string;
      plaza: string;
      vigilante: string | null;
      asignacion: GuardAssignment | null;
      positionId: string | null;
      ciclo: string;
      adhoc: boolean;
      esRelevo: boolean;
    };
    if (!configStation) return [] as Fila[];

    const delPuesto = assignments.filter(
      (a) =>
        String(a.stationId) === String(configStation.id) &&
        a.status === "active" &&
        (a as any).role !== "shadow",
    );
    const heredado = configStation.rotationStyleId
      ? rotationStyles.find((r) => r.id === String(configStation.rotationStyleId))
      : null;
    const cicloDe = (a: GuardAssignment | null) => {
      if (!a) return heredado ? nombreDeEstilo(heredado, t as Traductor) : "";
      const propio = a.rotationStyleId
        ? rotationStyles.find((r) => r.id === String(a.rotationStyleId))
        : null;
      const rot = propio || heredado;

      return rot ? nombreDeEstilo(rot, t as Traductor) : "";
    };

    const filas: Fila[] = (positionsByStation.get(String(configStation.id)) || [])
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((pos) => {
        const a = delPuesto.find((x) => String(x.positionId) === String(pos.id)) || null;

        return {
          key: String(pos.id),
          plaza: pos.name || t("ui.Schedule.plaza", "Puesto"),
          vigilante: a
            ? nombreDeVigilante(
                a.guard,
                t("settings.companyPolicies.guardNoNameFallback", "Sin nombre"),
              )
            : null,
          asignacion: a,
          positionId: String(pos.id),
          ciclo: cicloDe(a),
          adhoc: false,
          esRelevo: pos.type === "sacafranco",
        };
      });

    /* El `adhoc` no tiene plaza: cuadrante DIARIO y sin descansos, pensado para
       tapar un hueco unos días. Enseñarle el ciclo de la estación sería mentira
       —no lo usa— y en un puesto fijo es un estado que conviene ver, porque el
       día que esa persona libre saldrá como ausencia. */
    for (const a of delPuesto) {
      if (a.positionId && filas.some((f) => f.positionId === String(a.positionId))) continue;
      filas.push({
        key: String(a.id),
        plaza: t(
          "ui.Schedule.cuadranteDiarioSinPlaza",
          "Cuadrante diario (sin puesto)",
        ),
        vigilante: nombreDeVigilante(
          a.guard,
          t("settings.companyPolicies.guardNoNameFallback", "Sin nombre"),
        ),
        asignacion: a,
        positionId: null,
        ciclo: "",
        adhoc: true,
        esRelevo: !!a.isRelief,
      });
    }

    return filas;
  }, [configStation, assignments, positionsByStation, rotationStyles]);
  /** Los que de verdad hay dentro, para las cuentas de la cabecera. */
  const cfgVigilantes = useMemo(
    () => cfgFilas.filter((f) => !!f.asignacion),
    [cfgFilas],
  );

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
        guardsPool.find((x) => x.id === s.guardId)?.label ||
        t("ui.Schedule.cobertura", "Cobertura");
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
              stationsById.get(turno.stationId)?.stationName ||
              t("ui.Coverage.otroPuesto", "otro puesto");
          } else if (propia && isWorkDay(propia, dia) !== "rest") {
            estado = "deTurno";
            detalle =
              stationsById.get(propia.stationId)?.stationName ||
              t("ui.TransferShiftModal.suPuesto", "su puesto");
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
    /* ── A QUIÉN SE RELEVA ────────────────────────────────────────────────
       Va como PARÁMETRO y no como un `setMoveFrom` antes de llamar, porque
       esta función termina limpiándolo: ponerlo fuera se perdía en silencio y
       el relevo se convertía en un alta — los dos vigilantes acababan activos
       en la misma plaza, con su cuadrante cada uno, y el puesto contaba doble
       cobertura. Pasó de verdad al probar «Cambiar» desde el móvil. */
    relevarA?: GuardAssignment | null,
  ) => {
    if (!editarHorario.puede) {
      toast.info(editarHorario.porQueNo);
      return;
    }
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
    setMoveFrom(relevarA || null);
    setShowAssignForm(true);
  };

  const onGuardDragStart = (
    e: React.DragEvent,
    guardId: string,
    fromAssignment?: GuardAssignment,
  ) => {
    if (!editarHorario.puede) {
      e.preventDefault();
      toast.info(editarHorario.porQueNo);
      return;
    }
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
      const nm = nombreDeVigilante(
        occupiedBy.guard,
        t("ui.Schedule.elFijo", "el fijo"),
      );

      toast.error(
        t("ui.Schedule.eseDiaEstaDeTurno", {
          defaultValue:
            "Ese día {{nombre}} está de turno en este puesto. Primero libera el día (novedad de Libre/Vacaciones/Permiso, o elimina el turno con clic derecho) y luego arrastra el sacafranco.",
          nombre: nm,
        }),
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
        t("ui.PostSiteWizard.jornada.sacafranco", "Sacafranco"),
      );

    setSfCover({
      sfGuardId,
      sfName,
      station,
      dateStr,
      startStr: hhmm(startMin),
      endStr: hhmm(endMin),
      suggested: `${code} · ${hhmm(startMin)} – ${hhmm(endMin)}${endNextDay || endMin <= startMin ? t("ui.Schedule.diaSiguienteParen", " (día siguiente)") : ""}`,
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
      toast.success(
        t("ui.Schedule.sacafrancoCubre", {
          defaultValue: "Sacafranco cubre {{estacion}}",
          estacion: stationLabel(sfCover.station),
        }),
      );
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
      stationsById.get(shift.stationId)?.stationName ||
      t("ui.Schedule.laEstacion", "la estación");

    if (
      !(await confirmDialog({
        title: t("ui.Schedule.quitarCobertura", "Quitar cobertura"),
        message: t("ui.Schedule.quitarCoberturaConfirm", {
          defaultValue:
            "¿Quitar la cobertura del sacafranco en {{estacion}} ese día? Se elimina el turno.",
          estacion: stName,
        }),
        confirmText: t("ui.SupervisionSection.quitar", "Quitar"),
        tone: "danger",
      }))
    )
      return;
    try {
      await ApiService.delete(`/tenant/${tenantId}/shift/${shift.id}`);
      toast.success(t("ui.Schedule.coberturaEliminada", "Cobertura eliminada"));
      fetchAll({ silent: true });
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("ui.ShiftTemplates.errorAlEliminar", "Error al eliminar"),
      );
    }
  };

  // ─── Right-click menu on the year canvas ─────────────────────────────────

  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  /** Opens a cell menu; read-only users get one line that says why. */
  const abrirMenu = (m: CtxMenuState) =>
    setCtxMenu(
      editarHorario.puede
        ? m
        : { ...m, items: [{ label: editarHorario.porQueNo || "", disabled: true }] },
    );
  // "Trasladar a otra estación" from a right-clicked cell.
  const [transferTarget, setTransferTarget] = useState<TransferTarget | null>(
    null,
  );
  // "Correr ciclo…" de una asignación rotativa (escribe en el horario real).
  const [correrCiclo, setCorrerCiclo] = useState<{
    assignmentId: string;
    nombre: string;
  } | null>(null);

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
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("ui.Schedule.errorAlDuplicar", "Error al duplicar"),
      );
    }
  };

  const deleteDayShift = async (s: ShiftRecord) => {
    const msg = s.positionId
      ? t(
          "ui.Schedule.eliminarTurnoDelDiaGeneradoConfirm",
          "¿Eliminar el turno de este día? Fue generado por la rotación y puede regenerarse al reoptimizar o reasignar.",
        )
      : t(
          "ui.Schedule.eliminarTurnoDelDiaConfirm",
          "¿Eliminar el turno de este día?",
        );

    if (
      !(await confirmDialog({
        title: t("ui.ScheduleTimeline.eliminarTurno", "Eliminar turno"),
        message: msg,
        confirmText: t("common.delete", "Eliminar"),
        tone: "danger",
      }))
    )
      return;
    try {
      await ApiService.delete(`/tenant/${tenantId}/shift/${s.id}`);
      toast.success(t("comun.turnoEliminado"));
      fetchAll({ silent: true });
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("ui.ShiftTemplates.errorAlEliminar", "Error al eliminar"),
      );
    }
  };

  const openCellCtx = (
    e: React.MouseEvent | PuntoDePulsacion,
    station: Station,
    pos: StationPosition,
    posAssignments: GuardAssignment[],
    dateStr: string,
  ) => {
    /* Puede venir de un clic derecho o de una pulsación larga; lo segundo no
       tiene `preventDefault` que dar. */
    const tactil = !("preventDefault" in e);

    if (!tactil) (e as React.MouseEvent).preventDefault();
    const items: CtxItem[] = [];
    /* Cada casillero es una hoja de asistencia: lo que se puede hacer con él es
       cambiar QUÉ pasó (novedad), cambiar las horas o borrarlo. Antes esas tres
       cosas sólo llegaban a la PRIMERA persona de la plaza y nunca a quien vino
       a cubrir, así que un turno de cobertura no se podía ni editar ni borrar
       desde la hoja. Ahora sale una entrada por cada persona del casillero. */
    const varios = posAssignments.length > 1;

    for (const a of posAssignments) {
      const s = shiftByGuardDate.get(`${a.guardId}|${dateStr}`);
      const nm = primerNombre(
        a.guard,
        t("ui.Schedule.vigilanteMinus", "vigilante"),
      );
      const full = nombreDeVigilante(a.guard, nm);
      const suf = varios
        ? t("ui.Schedule.sufijoDeNombre", { defaultValue: " de {{nombre}}", nombre: nm })
        : "";

      items.push({
        label: t("ui.Schedule.menuCambiarACodigos", {
          defaultValue: "Cambiar a V / PM / F / L{{suf}}…",
          suf,
        }),
        onClick: () =>
          abrirNovedad({
            guardId: a.guardId,
            guardName: full,
            date: dateStr,
            assignmentId: a.id,
          }),
      });
      // ── DOBLAR TURNO: UNA ENTRADA POR PERSONA ─────────────────────────
      // Antes salía UNA sola vez, siempre para la PRIMERA persona de la plaza.
      // En una plaza con varios (día/noche, rotativa) eso extendía a quien no
      // era: EcuaSeguridad, 03/10, pidió doblar a Dino Soffe y el diálogo se
      // abrió con Flavio, que libraba — sin turno ese día, el tramo empezaba
      // «ahora», chocaba con el turno de otro y el servidor respondía «ese
      // puesto ya tiene a otro vigilante». Cada persona, con SU turno.
      //
      // Se le pasa el PUESTO y el fin de su turno: son los dos datos que el
      // servidor tendría que adivinar de «su último turno», y adivinarlos
      // fallaba en cuanto el vigilante tenía turno al día siguiente.
      //
      // Y SÓLO a quien trabaja ese día, con su NOMBRE en la entrada. La segunda
      // vuelta del mismo caso: Flavio (el fijo) libraba y lo cubría Dino; el
      // menú decía «Extender turno…» a secas en la casilla de Flavio, eso es lo
      // que se pulsa, y se volvía a extender a quien estaba en su casa.
      const trabajaHoy =
        !!s &&
        s.stationId === station.id &&
        cuentaComoCobertura(s) &&
        !getOverride(a.guardId, dateStr) &&
        isWorkDay(a, new Date(dateStr + "T00:00:00")) !== "rest";

      if (trabajaHoy)
        items.push({
          label: t("ui.Schedule.menuExtenderTurnoDe", {
            defaultValue: "Extender turno de {{nombre}}…",
            nombre: nm,
          }),
          onClick: () =>
            setExtendTarget({
              guardId: a.guardId,
              guardName: full,
              stationId: station.id,
              stationName: stationLabel(station),
              scheduledEnd: s?.endTime ?? null,
            }),
        });
      if (s && s.stationId === station.id) {
        items.push({
          label: t("ui.Schedule.menuEditarElTurno", {
            defaultValue: "Editar el turno{{suf}}…",
            suf,
          }),
          onClick: () => openShiftEditor(s, full),
        });
        items.push({
          label: t("ui.Schedule.menuDuplicarElTurno", {
            defaultValue: "Duplicar el turno{{suf}} al día siguiente",
            suf,
          }),
          onClick: () => void duplicateShiftNextDay(s),
        });
        items.push({
          label: t("ui.Schedule.menuEliminarElTurno", {
            defaultValue: "Eliminar el turno{{suf}} de este día",
            suf,
          }),
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
        guardsPool.find((x) => x.id === cs.guardId)?.label ||
          t("ui.Schedule.laCobertura", "la cobertura"),
      );
      const full = nombreDeVigilante(cs.guard, nm);

      items.push({
        label: t("ui.Schedule.menuCambiarCodigosCobertura", {
          defaultValue: "Cambiar a V / PM / F / L a {{nombre}} (cobertura)…",
          nombre: nm,
        }),
        onClick: () =>
          abrirNovedad({
            guardId: cs.guardId,
            guardName: full,
            date: dateStr,
          }),
      });
      // Quien vino a cubrir también puede tener que doblar.
      items.push({
        label: t("ui.Schedule.menuExtenderTurnoCobertura", {
          defaultValue: "Extender turno de {{nombre}} (cobertura)…",
          nombre: nm,
        }),
        onClick: () =>
          setExtendTarget({
            guardId: cs.guardId,
            guardName: full,
            stationId: station.id,
            stationName: stationLabel(station),
            scheduledEnd: cs.endTime ?? null,
          }),
      });
      items.push({
        label: t("ui.Schedule.menuEliminarLaCoberturaDe", {
          defaultValue: "Eliminar la cobertura de {{nombre}}",
          nombre: nm,
        }),
        danger: true,
        onClick: () => void deleteDayShift(cs),
      });
      items.push({ label: "—" });
    }
    if (posAssignments.length) {
      const a = posAssignments[0];
      const guardName = nombreDeVigilante(
        a.guard,
        t("comun.vigilante", "Vigilante"),
      );
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
            ? t("ui.Schedule.menuAnadirOtroRelevo", "Añadir otro relevo este día…")
            : t("ui.Schedule.menuCubrirEsteDia", "Cubrir este día…"),
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
        label: t("ui.Schedule.menuTrasladarAOtraEstacion", {
          defaultValue: "Trasladar a {{nombre}} a otra estación…",
          nombre: primerNombre(
            a.guard,
            t("ui.Schedule.vigilanteMinus", "vigilante"),
          ),
        }),
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
      // ── CORRER EL CICLO ───────────────────────────────────────────────
      // Un ciclo que quedó un día adelantado (o atrasado) se corrige aquí, en
      // el horario real. En el Planificador sólo era un borrador: B.A.S. lo
      // corrió allí el 11/10, no lo publicó y el vigilante siguió trabajando.
      // Una entrada por cada titular con rotación de la casilla.
      for (const c of posAssignments) {
        const pz = positionsById.get(c.positionId);
        const rota =
          (station.rotationStyleId &&
            rotationStylesById.get(station.rotationStyleId)) ||
          c.rotationStyle ||
          (c.rotationStyleId && rotationStylesById.get(c.rotationStyleId));

        if (
          !rota ||
          // A weekly style is anchored to the calendar: there is no cycle to
          // run (the server refuses it with 409).
          esSemanal(rota) ||
          c.isRelief ||
          pz?.type === "sacafranco" ||
          c.role === "shadow"
        )
          continue;
        items.push({
          label: t("ui.Schedule.menuCorrerCiclo", {
            defaultValue: "Correr ciclo de {{nombre}}…",
            nombre: primerNombre(
              c.guard,
              t("ui.Schedule.vigilanteMinus", "vigilante"),
            ),
          }),
          onClick: () =>
            setCorrerCiclo({
              assignmentId: c.id,
              nombre: nombreDeVigilante(
                c.guard,
                t("comun.vigilante", "Vigilante"),
              ),
            }),
        });
      }
      // ── APRENDIZ EN ACOMPAÑAMIENTO ────────────────────────────────────
      // El vigilante nuevo hace unas semanas junto al titular antes de tomar su
      // propio puesto. Sigue SUS días —no una rotación propia, que caería en
      // los libres del titular— y no cuenta como cobertura: si el titular falta
      // y sólo ficha el aprendiz, el puesto sale descubierto, que es la verdad.
      items.push({
        label: t("ui.Schedule.menuPonerUnAprendiz", {
          defaultValue: "Poner un aprendiz con {{nombre}}…",
          nombre: primerNombre(
            a.guard,
            t("ui.Schedule.esteVigilante", "este vigilante"),
          ),
        }),
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

      // «Extender turno…» va arriba, una entrada por persona del casillero.
      const suShift = shiftByGuardDate.get(`${a.guardId}|${dateStr}`);
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
        const queEs = (
          CODE_LABEL[String(ov!.type)] || t("ui.Schedule.novedadMinus", "novedad")
        ).toLowerCase();
        const quien = primerNombre(
          a.guard,
          t("ui.Schedule.esteVigilante", "este vigilante"),
        );

        items.push({
          // «Cubrir el turno de X (vacaciones) con otro vigilante…»: lo que se
          // cubre es el TURNO, y entre paréntesis por qué está libre.
          label: t("ui.Schedule.menuCubrirElTurnoDe", {
            defaultValue:
              "Cubrir el turno de {{nombre}} ({{motivo}}) con otro vigilante…",
            nombre: quien,
            motivo: queEs,
          }),
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
          label: t("ui.Schedule.menuQuitarCodigo", {
            defaultValue: "Quitar {{codigo}}",
            codigo: (
              CODE_LABEL[String(ov.type)] ||
              t("ui.Schedule.novedadConTipo", {
                defaultValue: "novedad ({{tipo}})",
                tipo: ov.type,
              })
            ).toLowerCase(),
          }),
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
          label: t(
            "ui.Schedule.menuAnadirUnTurnoSuelto",
            "Añadir un turno suelto aquí…",
          ),
          onClick: () => openAssignForm(station.id, pos.id, dateStr),
        });
      }
    } else {
      items.push({
        label: t(
          "ui.Schedule.menuCubrirEsteDiaConUnVigilante",
          "Cubrir este día con un vigilante…",
        ),
        onClick: () => openAssignForm(station.id, pos.id, dateStr),
      });
    }
    abrirMenu({ x: e.clientX, y: e.clientY, items, tactil });
  };

  /* ── DESDE LA AGENDA TAMBIÉN SE OPERA ───────────────────────────────────
     Tocar un turno saltaba a la vista de DÍA, que en un teléfono es otra
     rejilla: la agenda servía para mirar y para nada más. Y mirar no es lo que
     se hace desde el móvil — se hace «Fulano no llega, cubre este turno».

     Se abre el MISMO menú de la rejilla, con las mismas acciones, en el punto
     que se tocó. Un turno lleva encima su estación, su plaza y su día, que es
     todo lo que el menú necesita. */
  const accionesDelTurno = (sh: ShiftRecord, punto: PuntoDePulsacion) => {
    const station = stationsById.get(String(sh.stationId));
    const pos = sh.positionId ? positionsById.get(String(sh.positionId)) : null;

    if (!station) return;
    const dateStr = dateToWall(new Date(sh.startTime), tzName).dateStr;
    /* Sin plaza el turno es una cobertura suelta (o un `adhoc`): el menú se
       abre igual sobre la PRIMERA plaza de la estación, que es donde la rejilla
       pinta esas coberturas y desde donde ya sabe borrarlas. */
    const plaza = pos || getPositionsForStation(String(sh.stationId))[0];

    if (!plaza) return;
    openCellCtx(
      punto,
      station,
      plaza,
      assignmentsByPosition.get(String(plaza.id)) || [],
      dateStr,
    );
  };

  const openSfCtx = (
    e: React.MouseEvent | PuntoDePulsacion,
    pos: StationPosition,
    sfGuard: GuardAssignment | null,
    dateStr: string,
  ) => {
    /* Puede venir de un clic derecho o de una pulsación larga; lo segundo no
       tiene `preventDefault` que dar. */
    const tactil = !("preventDefault" in e);

    if (!tactil) (e as React.MouseEvent).preventDefault();
    const items: CtxItem[] = [];

    if (sfGuard) {
      const covShift = shiftByGuardDate.get(`${sfGuard.guardId}|${dateStr}`);

      if (covShift) {
        items.push({
          label: t(
            "ui.Schedule.menuEditarCoberturaVistaDia",
            "Editar cobertura (vista Día)…",
          ),
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
          label: t("ui.Schedule.quitarCobertura", "Quitar cobertura"),
          danger: true,
          onClick: () => void removeSfCoverage(covShift),
        });
        items.push({ label: "—" });
      }
      const gName = nombreDeVigilante(
        sfGuard.guard,
        t("ui.PostSiteWizard.jornada.sacafranco", "Sacafranco"),
      );

      // Cambiarle el patrón o las estaciones que cubre sin tener que borrarlo y
      // volver a crearlo, que era la única vía.
      items.push({
        label: t(
          "ui.Schedule.menuEditarSacafranco",
          "Editar sacafranco (patrón y estaciones)…",
        ),
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
        label: t(
          "ui.Schedule.menuTrasladarAOtraEstacionSf",
          "Trasladar a otra estación…",
        ),
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
        label: t(
          "ui.Schedule.menuMarcarElDia",
          "Marcar el día (V / PM / F / L)…",
        ),
        onClick: () =>
          abrirNovedad({
            guardId: sfGuard.guardId,
            guardName: gName,
            date: dateStr,
            assignmentId: sfGuard.id,
          }),
      });
      items.push({
        label: t("ui.Schedule.menuExtenderTurno", {
          defaultValue: "Extender turno{{suf}}…",
          suf: "",
        }),
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
          label: t("ui.Schedule.menuDeshacerCodigo", {
            defaultValue: "Deshacer {{codigo}} — volver a su turno",
            codigo: (CODE_LABEL[String(ov.type)] || ov.type).toLowerCase(),
          }),
          danger: true,
          onClick: () => void removeOverride(ov.id),
        });
    } else {
      // La posición de sacafranco admite las dos cosas: tapar ese día (turno
      // suelto) o dejar a alguien fijo en la posición (rotación). El diálogo
      // pregunta cuál; el nombre ya no promete sólo una.
      items.push({
        label: t(
          "ui.Schedule.menuAsignarAEstaPosicion",
          "Asignar a esta posición…",
        ),
        onClick: () => openAssignForm(pos.stationId, pos.id, dateStr),
      });
    }
    abrirMenu({ x: e.clientX, y: e.clientY, items, tactil });
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
    /* ALL OR NOTHING (phase 2): moving a block of coverage used to PUT each
       day on its own, and a failure on day 4 left days 1–3 moved and the
       rest where they were. Now the whole block moves in one server
       transaction, or nothing moves and the message names the day. */
    const cambios = objetivo.map((s) => {
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

      return {
        text: t("ui.Schedule.moverCoberturaDel", {
          defaultValue: "Mover la cobertura del {{dia}}",
          dia: diaDelTurno(s),
        }),
        calls: [
          {
            method: "put",
            path: `/tenant/${tenantId}/shift/${s.id}`,
            body: {
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
            },
          },
        ],
      };
    });
    let movidos = 0;

    try {
      movidos = await aplicarDeUnaVez(tenantId, cambios);
    } catch (err: any) {
      toast.error(
        err instanceof DraftConflict
          ? err.message
          : t("ui.Schedule.noSePudoMover", "No se pudo mover."),
      );
    }
    setMoveSaving(false);
    if (movidos) {
      toast.success(
        movidos === 1
          ? t("ui.Schedule.coberturaMovida", "Cobertura movida")
          : t("ui.Schedule.nDiasMovidos", {
              defaultValue: "{{n}} días movidos",
              n: movidos,
            }),
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
          toast.error(
            t(
              "ui.Schedule.elUltimoDiaNoPuedeSerAnterior",
              "El último día no puede ser anterior al primero.",
            ),
          );

          return;
        }
        if (n > TOPE_DIAS) {
          toast.error(
            t("ui.Schedule.elRangoSonNDias", {
              defaultValue:
                "El rango son {{n}} días; el máximo es {{max}}. Divídelo en tramos.",
              n,
              max: TOPE_DIAS,
            }),
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
            fallados.length
              ? t("ui.Schedule.noSePudoCrearNingunTurnoConErrores", {
                  defaultValue:
                    "No se pudo crear ningún turno ({{n}} día(s) con error).",
                  n: fallados.length,
                })
              : t(
                  "ui.Schedule.noSePudoCrearNingunTurno",
                  "No se pudo crear ningún turno.",
                ),
          );
        } else if (fallados.length) {
          // Se dicen las fechas: sin ellas hay que revisar el cuadrante a mano.
          toast.warning(
            t("ui.Schedule.turnosCreadosFalloEn", {
              defaultValue: "{{n}} turno(s) creado(s). Falló en: {{dias}}.",
              n: creados,
              dias: fallados.join(", "),
            }),
          );
        } else if (dias.length > 1) {
          toast.success(
            reemplazados
              ? t("ui.Schedule.nTurnosCreadosReemplazaron", {
                  defaultValue:
                    "{{n}} turnos creados (reemplazaron {{r}} solapado(s))",
                  n: creados,
                  r: reemplazados,
                })
              : t("ui.Schedule.nTurnosCreados", {
                  defaultValue: "{{n}} turnos creados",
                  n: creados,
                }),
          );
        } else {
          toast.success(
            reemplazados
              ? t(
                  "ui.ScheduleTimeline.turnoCreadoReemplazo",
                  "Turno creado (reemplazó turnos solapados)",
                )
              : t("ui.Schedule.turnoCreadoParaEseDia", "Turno creado para ese día"),
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
      // rotation per vigilante), then create the new assignment — in ONE
      // server transaction (phase 2): if the new one is refused, the guard
      // stays where they were instead of ending up with no station.
      const nueva = {
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
      };

      if (moveFrom)
        await aplicarDeUnaVez(tenantId, [
          {
            text: t("ui.Schedule.moverDePuesto", "Mover al vigilante de puesto"),
            calls: [
              {
                method: "delete",
                path: `/tenant/${tenantId}/guard-assignment/${moveFrom.id}`,
              },
              {
                method: "post",
                path: `/tenant/${tenantId}/guard-assignment`,
                body: nueva,
              },
            ],
          },
        ]);
      else
        await ApiService.post(`/tenant/${tenantId}/guard-assignment`, nueva);
      toast.success(
        moveFrom
          ? t("ui.Schedule.vigilanteMovidoDePuesto", "Vigilante movido de puesto")
          : assignEditing
            ? t("ui.Schedule.sacafrancoActualizado", "Sacafranco actualizado")
            : t("ui.Schedule.vigilanteAsignado", "Vigilante asignado"),
      );
      setShowAssignForm(false);
      setMoveFrom(null);
      fetchAll();
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("ui.Schedule.errorAlAsignar", "Error al asignar"),
      );
    } finally {
      setAssignSaving(false);
    }
  };

  const removeAssignment = async (assignmentId: string) => {
    if (
      !(await confirmDialog({
        title: t("ui.Schedule.removerAsignacion", "Remover asignación"),
        message: t(
          "ui.Schedule.removerAsignacionConfirm",
          "¿Remover esta asignación? Los turnos futuros se anulan; los ya trabajados se conservan en el historial.",
        ),
        confirmText: t("ui.Schedule.remover", "Remover"),
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
      toast.error(e?.message || t("ui.Schedule.error", "Error"));
    }
  };

  /* ── EL REQUISITO SE CAMBIA EN LA FICHA DE LA ESTACIÓN (fase 2) ──────────
     Horas, cuántos a la vez y qué días son el requisito de la estación, y
     tiene UNA puerta: Estación › Requisito. «Reconfigurar» y editar una plaza
     fija llevan allí en vez de abrir aquí un segundo editor que pensaba
     distinto. El sacafranco sigue con su asistente: no es requisito. */
  const irAlRequisito = (station: Station) => {
    const sede = (station as any).postSiteId;

    navigate(
      sede
        ? `/post-sites/${sede}/stations/${station.id}/overview#requisito`
        : `/stations`,
    );
  };

  const configureStation = (station: Station) => {
    if (REQUISITO_EN_LA_FICHA) {
      irAlRequisito(station);

      return;
    }
    setConfigStation(station);
    setConfigPaso(1);
    setConfigType(station.scheduleType || "24h");
    setConfigRotation(station.rotationStyleId || "");
    setCfgRotOriginal(station.rotationStyleId || "");
    /* Las ruedas arrancan en el ciclo que la estación TIENE. Ponerlas en un
       número cualquiera haría creer que guardar sin tocarlas no cambia nada
       cuando sí lo cambiaría — el mismo cuidado que en el editor de plaza. */
    {
      const actual = station.rotationStyleId
        ? rotationStyles.find((r) => r.id === String(station.rotationStyleId))
        : null;

      setCfgRotMode(actual ? "rotativo" : "manual");
      setCfgDias(actual?.dayShifts ?? 4);
      setCfgNoches(actual?.nightShifts ?? 4);
      setCfgLibres(actual?.restDays ?? 2);
    }
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
    /* ── CAMBIAR SÓLO EL CICLO NO ES «RECONFIGURAR» ────────────────────────
       `auto-positions` es la puerta del ALTA: vuelve a derivar las plazas desde
       el tipo de jornada y la ventana, y cuando el recuento sale distinto las
       que sobran se cierran y sus asignaciones pasan a `ended` — por eso el
       aviso decía que habría que reasignar. Pero el caso más corriente no toca
       la forma del puesto: es «a esta estación cámbiale el ciclo». Para ése
       existe ahora `PUT /station/:id/rotation`, que cambia el ciclo, conserva
       las plazas con su identidad y su gente, y sólo rehace los turnos futuros.

       Se compara contra lo que la estación tiene HOY; si la forma no se movió,
       se va por la puerta que no echa a nadie y no se pregunta nada. */
    /* El ciclo lo dicen ahora las tres ruedas del paso 2, no un desplegable:
       se resuelve (o se crea) el patrón con esos números, igual que en el
       sacafranco. En «Turno fijo» no hay ciclo que guardar. */
    let cicloElegido: string | null = configRotation || null;

    /* En «Personalizado» el patrón lo elige el selector del paso 3, que sabe de
       bloques; en el resto lo dicen las ruedas del paso 2. */
    if (configType !== "custom" && cfgRotMode === "rotativo") {
      if (cfgDias + cfgNoches < 1) {
        toast.error(
          t(
            "ui.Schedule.elCicloNecesitaAlMenosUnTurno",
            "El ciclo necesita al menos un turno de trabajo.",
          ),
        );

        return;
      }
      cicloElegido = await resolverEstiloDeRotacion(cfgDias, cfgNoches, cfgLibres);
      if (!cicloElegido) return;
    }

    const soloElCiclo =
      configType === (configStation.scheduleType || "24h") &&
      configType !== "custom" &&
      !!cicloElegido &&
      cicloElegido !== cfgRotOriginal;

    if (soloElCiclo) {
      setConfigSaving(true);
      try {
        await ApiService.put(
          `/tenant/${tenantId}/station/${configStation.id}/rotation`,
          { data: { rotationStyleId: cicloElegido } },
        );
        toast.success(
          t(
            "ui.Schedule.cicloActualizado",
            "Ciclo actualizado — los turnos futuros se rehicieron y nadie perdió su puesto",
          ),
        );
        setConfigStation(null);
        fetchAll();
      } catch (e: any) {
        toast.error(e?.data?.message || e?.message || t("ui.Schedule.error", "Error"));
      } finally {
        setConfigSaving(false);
      }

      return;
    }

    if (
      !(await confirmDialog({
        message: t(
          "ui.Schedule.cambiarElHorarioReconfiguraConfirm",
          "Cambiar el horario reconfigura los puestos del turno. Si hay vigilantes asignados a esta estación, deberán reasignarse. ¿Continuar?",
        ),
        confirmText: t("ui.Schedule.continuar", "Continuar"),
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
            rotationStyleId: cicloElegido || undefined, // alternate + none → engine seeds 1-1
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
      toast.error(e?.data?.message || e?.message || t("ui.Schedule.error", "Error"));
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
      toast.error(t("ui.Schedule.eligeAlAprendiz", "Elige al aprendiz"));

      return;
    }
    if (!shadowFor.endDate) {
      toast.error(
        t(
          "ui.Schedule.unAcompanamientoNecesitaFechaDeFin",
          "Un acompañamiento necesita fecha de fin",
        ),
      );

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
        t(
          "ui.Schedule.aprendizEnAcompanamientoToast",
          "Aprendiz en acompañamiento — sigue los días del titular y no cuenta como cobertura",
        ),
      );
      setShadowFor(null);
      fetchAll({ silent: true });
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t(
            "ui.Schedule.noSePudoRegistrarElAcompanamiento",
            "No se pudo registrar el acompañamiento",
          ),
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
    /* ── EL ASISTENTE VA POR PASOS ────────────────────────────────────────
       Todo cabía en un solo diálogo mientras fueron cuatro preguntas. Con la
       alternancia entre estaciones son tres bloques que no se leen de una: quién
       ciclo corre, y por dónde rota. En una pantalla seguida hay que hacer
       scroll para saber si ya se contestó algo. */
    sfPaso?: 1 | 2 | 3;
    /** Editando: la asignación del sacafranco (la alternancia y el alta viven ahí). */
    assignmentId?: string;
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
    /** Editando una plaza: true = ciclo propio, false = el de la estación. */
    rotPropio?: boolean;
    /** El ciclo que la plaza tenía al abrir. Sirve para NO reescribirlo —y con
     *  él la fase— cuando la edición sólo tocó el nombre o las horas. */
    rotOriginal?: string | null;
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

  /* ── EL CICLO TAMBIÉN SE EDITA, Y SIN ECHAR A NADIE ──────────────────────
     El editor de un puesto preguntaba nombre, tipo, horas y plazas — pero no el
     CICLO, que es lo que decide qué días trabaja quien esté ahí. Cambiarlo sólo
     se podía por «Reconfigurar», que vuelve a derivar las plazas desde la
     jornada: en cuanto el recuento sale distinto, las que sobran se cierran y
     sus asignaciones pasan a `ended`. O sea, para cambiar un 4-4-2 había que
     arriesgarse a quedarse sin el vigilante o sin el sacafranco.

     El ciclo se dice con tres ruedas (día · tarde/noche · libres) igual que en
     el alta del sacafranco, y al guardar se busca el patrón con esos números o
     se crea (`resolverEstiloDeRotacion`). Vacío = hereda el de la estación. */
  /* ── EDITAR UN SACAFRANCO ES EL MISMO ASISTENTE ─────────────────────────
     Un sacafranco vive en DOS tablas: la plaza (nombre, horas) y su asignación
     (quién es, desde cuándo, su ciclo, por qué casilla entra y la alternancia de
     estaciones). El editor genérico de puestos sólo conoce la primera, así que
     para cambiarle la alternancia había que borrarlo y volver a crearlo — y la baja
     le anula los turnos futuros.

     Aquí se abre el asistente ya relleno con las dos, y al guardar se escriben
     las dos. La fila no se toca: conserva su identidad y su historial. */
  const editSacafranco = (station: Station, pos: StationPosition) => {
    const asg = assignments.find(
      (a) => String(a.positionId) === String(pos.id) && a.status === "active",
    );
    const ciclo = asg?.rotationStyleId
      ? rotationStyles.find((r) => r.id === String(asg.rotationStyleId))
      : null;
    /* La lista que cubre manda el ORDEN de la alternancia. Si está vacía, al menos su
       propia estación: una alternancia sin estaciones no se puede dibujar. */
    const cubiertas = Array.isArray(asg?.coveredStationIds)
      ? (asg?.coveredStationIds as string[]).map(String).filter(Boolean)
      : [];
    const marcadas = cubiertas.length ? cubiertas : [String(pos.stationId)];
    const dias = (asg as any)?.coveredStationDays || {};

    setPosEditor({
      sfWizard: true,
      sfPaso: 1,
      stationId: station.id,
      stationIds: marcadas,
      positionId: pos.id,
      assignmentId: asg ? String(asg.id) : undefined,
      stationName: stationLabel(station),
      name: pos.name || "",
      type: "sacafranco",
      startTime: (pos.startTime || "07:00").slice(0, 5),
      endTime: (pos.endTime || "19:00").slice(0, 5),
      guardsNeeded: String((pos as any).guardsNeeded ?? 1),
      guardId: asg?.guardId ? String(asg.guardId) : undefined,
      rotMode: ciclo ? "rotativo" : "manual",
      rotationStyleId: ciclo?.id,
      rotDays: ciclo?.dayShifts ?? 5,
      rotNights: ciclo?.nightShifts ?? 0,
      rotRest: ciclo?.restDays ?? 2,
      /* La casilla de entrada se RECUPERA deshaciendo la fase; si no, abrir uno
         que entró en la noche 1 mostraría «D1» y guardarlo lo re-fasearía sin
         avisar. Es la misma cuenta que ya hace el diálogo de asignación. */
      cycleStartIndex:
        asg && ciclo ? ranuraDesdeLaFase(asg, ciclo) : 0,
      stationDays: { ...dias },
      startDate: asg?.startDate ? String(asg.startDate).slice(0, 10) : tzToday(),
    });
  };

  const editPosition = (station: Station, pos: StationPosition) => {
    /* Un sacafranco no cabe en el diálogo genérico: la mitad de lo suyo —su
       ciclo, por qué casilla entra, y por qué estaciones rota— vive en la
       ASIGNACIÓN, no en la plaza. Se deriva a su asistente por cualquier
       puerta desde la que se abra. */
    if ((pos.type || "fijo") === "sacafranco") {
      editSacafranco(station, pos);

      return;
    }
    if (REQUISITO_EN_LA_FICHA) {
      irAlRequisito(station);

      return;
    }
    const propio = (pos as any).rotationStyleId
      ? rotationStyles.find((r) => r.id === String((pos as any).rotationStyleId))
      : null;
    /* Sin ciclo propio se enseña el de la ESTACIÓN: es el que esa plaza está
       usando de verdad, y arrancar las ruedas en otro número haría creer que
       guardar sin tocarlas no cambia nada cuando sí lo cambiaría. */
    const efectivo =
      propio ||
      (station.rotationStyleId
        ? rotationStyles.find((r) => r.id === String(station.rotationStyleId))
        : null);

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
      rotPropio: !!propio,
      rotOriginal: propio ? propio.id : null,
      rotDays: efectivo?.dayShifts ?? 5,
      rotNights: efectivo?.nightShifts ?? 0,
      rotRest: efectivo?.restDays ?? 2,
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
      toast.error(
        t(
          "ui.Schedule.elCicloNecesitaAlMenosUnTurno",
          "El ciclo necesita al menos un turno de trabajo.",
        ),
      );

      return null;
    }

    const igual = rotationStyles.find(
      (r) =>
        !r.weekly &&
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
      toast.error(
        t(
          "ui.Schedule.noSePudoGuardarElCiclo",
          "No se pudo guardar el ciclo de rotación.",
        ),
      );

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
      toast.error(
        t("ui.Schedule.eligeAlMenosUnaEstacion", "Elige al menos una estación"),
      );

      return;
    }
    if (!posEditor.name.trim()) {
      toast.error(
        t("ui.Schedule.ponleUnNombreAlPuesto", "Ponle un nombre al puesto"),
      );

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

      /* ── EDITANDO UN SACAFRANCO: LAS DOS TABLAS, UN SOLO GUARDAR ──────
         La plaza lleva nombre y horas; la asignación lleva su ciclo, por qué
         casilla entra y la RONDA de estaciones. Se escriben las dos y no se
         borra nada: la fila conserva su identidad y sus turnos pasados. */
      if (posEditor.sfWizard && posEditor.positionId) {
        await ApiService.put(
          `/tenant/${tenantId}/station/${posEditor.stationId}/positions/${posEditor.positionId}`,
          { data },
        );

        if (posEditor.assignmentId) {
          const rotativo = (posEditor.rotMode || "manual") === "rotativo";
          let estilo: string | null = null;

          if (rotativo) {
            estilo = await resolverEstiloDeRotacion(
              posEditor.rotDays ?? 0,
              posEditor.rotNights ?? 0,
              posEditor.rotRest ?? 0,
            );
            // El resolver ya dijo por qué no se pudo. Guardar la plaza y
            // callarse el ciclo dejaría las dos tablas discrepando.
            if (!estilo) return;
          }

          /* El orden de `stationIds` ES la cadencia, y el servidor lo conserva
             tal cual desde que la alternancia lo lee. Los días se recortan a las
             estaciones que de verdad cubre. */
          const dias: Record<string, number> = {};
          for (const id of ids) {
            const n = Math.floor(posEditor.stationDays?.[id] ?? 1);

            dias[id] = Number.isFinite(n) && n > 0 ? n : 1;
          }

          await ApiService.put(
            `/tenant/${tenantId}/guard-assignment/${posEditor.assignmentId}`,
            {
              data: {
                rotationStyleId: estilo,
                startDate: posEditor.startDate || undefined,
                cycleStartIndex: rotativo ? posEditor.cycleStartIndex || 0 : 0,
                coveredStationIds: ids,
                coveredStationDays: ids.length > 1 ? dias : null,
              },
            },
          );
        }

        toast.success(
          ids.length > 1
            ? t("ui.Schedule.sacafrancoActualizadoRota", {
                defaultValue:
                  "Sacafranco actualizado — rota por {{n}} estaciones",
                n: ids.length,
              })
            : t("ui.Schedule.sacafrancoActualizado", "Sacafranco actualizado"),
        );
        setPosEditor(null);
        fetchAll({ silent: true });

        return;
      }

      if (posEditor.positionId) {
        /* ── EL CICLO NO VA POR AQUÍ, Y ES A PROPÓSITO ───────────────────
           `PUT /positions/:id` guarda el ciclo de la PLAZA, pero el generador
           resuelve con `assignment.rotationStyleId || station.rotationStyleId`:
           la plaza no la mira. Su ciclo es sólo la plantilla que hereda quien
           se asigne después — y un sacafranco ni eso. Guardarlo ahí y quedarse
           tan anchos no le movería un turno a quien ya está dentro, que es
           justo lo que hacía creer que había que borrarlo para cambiárselo.

           El ciclo va por `PUT /station/:id/rotation`, que lo baja también a
           las asignaciones vivas de la plaza y rehace los turnos futuros en una
           sola reconciliación (con su vuelta atrás si falla). */
        let cicloPedido: string | null = null;

        if (posEditor.rotPropio) {
          const d = Math.max(0, posEditor.rotDays ?? 0);
          const n = Math.max(0, posEditor.rotNights ?? 0);
          const l = Math.max(0, posEditor.rotRest ?? 0);

          cicloPedido = await resolverEstiloDeRotacion(d, n, l);
          // El resolver ya avisó por qué no se pudo; guardar las horas y
          // callarse el ciclo sería peor que no guardar nada.
          if (!cicloPedido) return;
        }

        await ApiService.put(
          `/tenant/${tenantId}/station/${posEditor.stationId}/positions/${posEditor.positionId}`,
          { data },
        );

        /* Sólo si CAMBIÓ. Reescribirlo en cada guardado volvería a calcular la
           fase desde la fecha de inicio, y eso le desharía el descanso a quien
           se lo hubieran colocado a mano con «Aplicar este descanso». */
        const cambioElCiclo =
          (cicloPedido || null) !== (posEditor.rotOriginal || null);

        if (cambioElCiclo) {
          await ApiService.put(
            `/tenant/${tenantId}/station/${posEditor.stationId}/rotation`,
            {
              data: {
                positionRotationStyleIds: {
                  [posEditor.positionId]: cicloPedido,
                },
              },
            },
          );
        }

        /* Este mensaje ya no es una promesa: el servidor sólo responde 200
           cuando los turnos futuros SE REHICIERON de verdad. Si la
           reconciliación falla devuelve 409, deja el puesto con sus horas
           anteriores y el `catch` de abajo enseña el motivo. Antes se
           prometía lo mismo pasara lo que pasara. */
        toast.success(
          cambioElCiclo
            ? t(
                "ui.Schedule.puestoYCicloActualizados",
                "Puesto y ciclo actualizados — los turnos futuros se rehicieron y nadie perdió su asignación",
              )
            : t(
                "ui.Schedule.puestoActualizado",
                "Puesto actualizado — los turnos futuros se rehicieron con las horas nuevas",
              ),
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
              /* La cadencia, con las MISMAS cuentas que enseñó la vista previa:
                 sin cuenta, un día — que es lo que dibujaba la tira. Mandarla a
                 medias dejaba que el motor pusiera su propio uno y la pantalla
                 prometía una vuelta distinta de la que salía. */
              coveredStationDays: (() => {
                if (ids.length < 2) return null;
                const d = posEditor.stationDays || {};
                const limpio: Record<string, number> = {};

                for (const sid of ids) {
                  const n = Math.floor(Number(d[sid]));

                  limpio[sid] = Number.isFinite(n) && n > 0 ? n : 1;
                }

                return limpio;
              })(),
            },
          });
          setPosEditor(null);
          toast.success(
            posEditor.rotMode === "rotativo"
              ? t("ui.Schedule.sacafrancoCreadoRotativo", {
                  defaultValue:
                    "Sacafranco creado y asignado — cubre {{n}} estación(es). Sus turnos tardan unos segundos.",
                  n: ids.length,
                })
              : t("ui.Schedule.sacafrancoCreadoManual", {
                  defaultValue:
                    "Sacafranco creado y asignado — cubre {{n}} estación(es). Su mes empieza en blanco: coloca sus días arrastrándolos o con «Optimizar sacafrancos».",
                  n: ids.length,
                }),
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
        /* Prometía «cubrirá N estaciones» aunque la alternancia todavía no estuviera
           guardada en ninguna parte: se guarda con la ASIGNACIÓN, y este camino
           es el de la fila sin vigilante. Si se abandona el diálogo que viene
           detrás, la cobertura se queda sin escribir — así que aquí se dice lo
           que de verdad ha pasado. */
        toast.success(
          ids.length > 1
            ? t(
                "ui.Schedule.sacafrancoCreadoAsignaleUnVigilante",
                "Sacafranco creado. Asígnale un vigilante: hasta entonces no se guarda en qué estaciones cubre ni cada cuántos días.",
              )
            : t("ui.Schedule.sacafrancoCreado", "Sacafranco creado"),
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
        ids.length > 1
          ? t("ui.Schedule.nPuestosAgregados", {
              defaultValue: "{{n}} puestos agregados",
              n: ids.length,
            })
          : t("ui.Schedule.puestoAgregado", "Puesto agregado"),
      );
      setPosEditor(null);
      fetchAll({ silent: true });
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("ui.Schedule.noSePudoGuardarElPuesto", "No se pudo guardar el puesto"),
      );
    } finally {
      setPosSaving(false);
    }
  };

  const deletePosition = async (stationId: string, positionId: string) => {
    if (
      !(await confirmDialog({
        title: t("ui.Schedule.eliminarPosicion", "Eliminar posición"),
        message: t(
          "ui.Schedule.eliminarEstaPosicionConfirm",
          "¿Eliminar esta posición?",
        ),
        confirmText: t("common.delete", "Eliminar"),
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
      toast.error(
        e?.message || t("ui.ShiftTemplates.errorAlEliminar", "Error al eliminar"),
      );
    }
  };

  // AI Auto-assign
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [autoResult, setAutoResult] = useState<AutoAssignResult | null>(null);

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
        rem > 0
          ? t("ui.Schedule.vigilantesGeolocalizadosPendientes", {
              defaultValue:
                "{{n}} vigilante(s) geolocalizados · {{rem}} pendientes (ejecuta de nuevo)",
              n: g,
              rem,
            })
          : t("ui.Schedule.vigilantesGeolocalizados", {
              defaultValue: "{{n}} vigilante(s) geolocalizados",
              n: g,
            }),
      );
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t(
            "ui.Schedule.errorAlGeolocalizarVigilantes",
            "Error al geolocalizar vigilantes",
          ),
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
        t("ui.RadioDispatch.status.no_response", "Sin respuesta");

      setAiRecommendation(rec);
    } catch (e: any) {
      toast.error(t("ui.Schedule.errorAlConsultarIa", "Error al consultar IA"));
      console.error(e);
    } finally {
      setAiLoading(false);
    }
  };

  const runAutoAssign = async () => {
    if (
      !(await confirmDialog({
        message: t(
          "ui.Schedule.autoAsignarConfirm",
          "¿Asignar automáticamente vigilantes a todas las estaciones sin cubrir?\n\nSolo se cubren los puestos VACÍOS con vigilantes sin asignar (por cercanía, configurando rotaciones y sacafrancos). NO se moverá ni reasignará ningún vigilante que ya esté asignado a un puesto.",
        ),
        confirmText: t("ui.SupervisionSection.asignar", "Asignar"),
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
      toast.success(
        t("ui.Schedule.nAsignacionesCreadas", {
          defaultValue: "{{n}} asignaciones creadas",
          n: res.assignmentsCreated,
        }),
      );
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
        message: t(
          "ui.Schedule.optimizarSacafrancosConfirm",
          "¿Optimizar la rotación de sacafrancos?\n\nATENCIÓN: esto MOVERÁ vigilantes sacafranco ya asignados a otros puestos/estaciones y regenerará sus turnos para maximizar cobertura. Los vigilantes fijos NO se tocan.",
        ),
        confirmText: t("ui.Schedule.optimizar", "Optimizar"),
      }))
    )
      return;
    setAutoAssigning(true);
    try {
      const res = await ApiService.post(
        `/tenant/${tenantId}/scheduler/optimize-sacafrancos`,
        { data: {} },
      );

      toast.success(
        res?.message ||
          t("ui.Schedule.sacafrancosOptimizados", "Sacafrancos optimizados"),
      );
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
          i18n.t("ui.Schedule.eseDiaYaEstaCerrado", {
            defaultValue:
              "Ese día ya está cerrado. El horario se edita desde el {{fecha}} en adelante, para no cambiar turnos ya trabajados ni pagos ya emitidos.",
            fecha: fechaMinimaEditable(getTenantTimezone()),
          }),
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

        // A weekly style has no franco to move: its days off are weekdays
        // (the server answers 409). It falls through to «solo este día».
        if (isFijo && rot && rot.restDays > 0 && !esSemanal(rot)) {
          const dayMs = 86400000;
          const toLocal = (s: string) => new Date(s + "T00:00:00");
          const fmt = (d: Date) =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const fmtHuman = (s: string) =>
            // tz: civil day built at local midnight (a calendar date, not an instant).
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
              ? t("ui.Schedule.elFecha", {
                  defaultValue: "el {{fecha}}",
                  fecha: fmtHuman(blockStart),
                })
              : t("ui.Schedule.nDiasDeDescanso", {
                  defaultValue: "{{n}} días de descanso ({{fechas}})",
                  n: rot.restDays,
                  fechas: blockDates
                    .map(fmtHuman)
                    .join(t("ui.Schedule.separadorY", " y ")),
                });

          const applyForward = await confirmDialog({
            title: t(
              "ui.Schedule.ajustarLaRotacionDesdeEsteLibre",
              "Ajustar la rotación desde este libre",
            ),
            message: t("ui.Schedule.ajustarRotacionConfirm", {
              defaultValue:
                "El puesto usa el patrón {{patron}}{{libres}}. ¿Quieres que {{nombre}} descanse {{bloque}} y la secuencia continúe automáticamente desde ahí?\n\nSe recalculan solo los turnos futuros de este vigilante — los demás no se tocan.\n\n«Solo este día» registra únicamente una novedad de libre en esa fecha.",
              patron: rot.name,
              libres:
                rot.restDays > 1
                  ? t("ui.Schedule.nLibresSeguidos", {
                      defaultValue: " ({{n}} libres seguidos)",
                      n: rot.restDays,
                    })
                  : "",
              nombre: target.guardName,
              bloque: blockHuman,
            }),
            confirmText: t("ui.Schedule.aplicarEnAdelante", "Aplicar en adelante"),
            cancelText: t("ui.ScheduleTimeline.soloEsteDia", "Solo este día"),
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
                t("ui.Schedule.rotacionReajustada", {
                  defaultValue:
                    "Rotación {{patron}} reajustada — la secuencia sigue desde este libre",
                  patron: rot.name,
                }),
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
          t("ui.Schedule.eseDiaQuedaComo", {
            defaultValue: "Ese día queda como {{codigo}}",
            codigo: (CODE_LABEL[type] || type).toLowerCase(),
          }),
        );
        setOverrideTarget(null);
        fetchAll();
      } catch (e: any) {
        toast.error(e?.message || t("ui.Schedule.error", "Error"));
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
      toast.success(
        t("ui.Schedule.eseDiaVuelveASuTurno", "Ese día vuelve a su turno"),
      );
      setOverrideTarget(null);
      fetchAll();
    } catch (e: any) {
      toast.error(e?.message || t("ui.Schedule.error", "Error"));
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
        const guardName = nombreDeVigilante(
          a.guard,
          t("comun.vigilante", "Vigilante"),
        );

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

      if (failed)
        toast.error(
          t("ui.Schedule.diasNoSePudieronMarcar", {
            defaultValue: "{{n}} día(s) no se pudieron marcar",
            n: failed,
          }),
        );
      else
        toast.success(
          t("ui.Schedule.diasMarcadosComo", {
            defaultValue: "{{n}} día(s) marcados como {{codigo}}",
            n: jobs.length,
            codigo: (CODE_LABEL[type] || type).toLowerCase(),
          }),
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
      /* ── BORRAR UN DÍA QUE TODAVÍA NO EXISTE ──────────────────────────
         La rejilla pinta la rotación más allá de donde el horario está
         materializado, así que ahí se ve una D y no hay fila que borrar. Supr
         se limitaba a explicarlo y a mandar al operador a escribir la novedad a
         mano — desde su silla, eso es «selecciono, borro y no pasa nada», y
         cuando el horizonte avanza esos días aparecen: «se regeneran».

         La novedad de LIBRE es justo el mecanismo que el propio mensaje
         recomendaba (`dropAbsenceDays` la respeta al generar), así que se
         escribe aquí en vez de pedirla. El resultado es el mismo desde
         cualquier lado: el día queda bloqueado y la rotación no lo crea. */
      if (proyectado) {
        if (
          !(await confirmDialog({
            title: t("ui.Schedule.bloquearEsosDias", "Bloquear esos días"),
            message: t(
              "ui.Schedule.bloquearEsosDiasConfirm",
              "Ahí la rejilla enseña el patrón proyectado: el turno todavía no está creado, así que no hay nada que borrar. Se marcan como LIBRE para que la rotación no los cree cuando avance el horizonte.",
            ),
            confirmText: t("ui.Schedule.marcarLibres", "Marcar libres"),
          }))
        )
          return;
        await applyCodeToSelection("L");

        return;
      }
      toast.info(
        filaVacia
          ? t(
              "ui.Schedule.esePuestoNoTieneVigilante",
              "Ese puesto no tiene vigilante asignado: no hay turno que borrar.",
            )
          : t(
              "ui.Schedule.enEsasCeldasNoHayTurno",
              "En esas celdas no hay turno ni novedad — están libres (L). Doble clic para registrar una novedad.",
            ),
      );

      return;
    }

    // Un turno es trabajo real de alguien: se confirma. Una novedad se deshace
    // volviéndola a escribir, así que ésa sigue sin preguntar.
    if (turnos.length) {
      const partes = [
        t("ui.Schedule.nTurnosParte", {
          defaultValue: "{{n}} turno(s)",
          n: turnos.length,
        }),
        victims.length
          ? t("ui.Schedule.nNovedadesParte", {
              defaultValue: "{{n}} novedad(es)",
              n: victims.length,
            })
          : "",
      ]
        .filter(Boolean)
        .join(" y ");
      /* ── ESTE AVISO DECÍA LO CONTRARIO DE LO QUE PASA ────────────────────
         Advertía de que «los turnos generados por la rotación pueden volver a
         aparecer al reoptimizar o reasignar». Era verdad antes de que el
         borrado firmara su lápida; hoy no lo es, y decirlo es peor que no decir
         nada: le cuenta al operador que su decisión no es de fiar, justo lo que
         el contrato del Horario promete al revés —el cuadrante se genera una
         vez y a partir de ahí manda quien lo edita—.

         Comprobado contra el motor: borrar y regenerar la asignación, regenerar
         la estación entera y cambiarle el ciclo dejan los días borrados a cero.
         `ShiftRepository.destroy` firma con `pinned` y la supresión del
         generador respeta esa firma. */
      const msg = t("ui.Schedule.eliminarSeleccionConfirm", {
        defaultValue:
          "Se eliminarán {{partes}}. Los días quedan libres y la rotación NO los vuelve a crear: el borrado se respeta al regenerar.",
        partes,
      });

      if (
        !(await confirmDialog({
          title: t("ui.Schedule.eliminarLaSeleccion", "Eliminar la selección"),
          message: msg,
          confirmText: t("common.delete", "Eliminar"),
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
      toast.error(
        t("ui.Schedule.eliminacionesNoCompletadas", {
          defaultValue: "{{n}} eliminación(es) no se pudieron completar",
          n: failed,
        }),
      );
    else {
      const partes = [
        turnos.length
          ? t("ui.Schedule.nTurnosParte", {
              defaultValue: "{{n}} turno(s)",
              n: turnos.length,
            })
          : "",
        victims.length
          ? t("ui.Schedule.nNovedadesParte", {
              defaultValue: "{{n}} novedad(es)",
              n: victims.length,
            })
          : "",
      ]
        .filter(Boolean)
        .join(t("ui.Schedule.separadorY", " y "));

      toast.success(
        t("ui.Schedule.partesEliminadas", {
          defaultValue: "{{partes}} eliminado(s)",
          partes,
        }),
      );
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
    // Supr también marca libres los días proyectados: sin esta dependencia se
    // quedaría con una versión vieja y escribiría sobre la selección anterior.
    applyCodeToSelection,
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
    const guardName = nombreDeVigilante(
      a.guard,
      t("comun.vigilante", "Vigilante"),
    );

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
      if (view === "calendar" || view === "agenda" || view === "organigrama") {
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
    if (view === "calendar" || view === "agenda" || view === "organigrama") {
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
      toast.success(t("ui.Schedule.turnoActualizado", "Turno actualizado"));
      setShiftEdit(null);
      fetchAll({ silent: true });
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t(
            "ui.Schedule.noSePudoActualizarElTurno",
            "No se pudo actualizar el turno",
          ),
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
      // tz: civil day built at local midnight (a calendar date, not an instant).
      .toLocaleDateString(localeActual(), { month: "long", year: "numeric" })
      .replace(/^./, (c) => c.toUpperCase());
  }, [visibleMonth]);

  const rangeLabel = useMemo(() => {
    if (
      view === "month" ||
      view === "calendar" ||
      view === "agenda" ||
      view === "organigrama"
    )
      return monthLabel;
    const fmt = (d: Date) =>
      // tz: civil day built at local midnight (a calendar date, not an instant).
      d.toLocaleDateString(localeActual(), { day: "numeric", month: "short" });

    if (view === "week") {
      const a = timelineDays[0],
        b = timelineDays[timelineDays.length - 1];

      return `${fmt(a)} – ${fmt(b)} ${b.getFullYear()}`;
    }

    return currentDate
      // tz: civil day built at local midnight (a calendar date, not an instant).
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
    const who = nombreDeVigilante(
      guard,
      t("ui.Schedule.sinVigilante", "sin vigilante"),
    );

    return t("ui.Schedule.selInfo", {
      defaultValue: "{{count}} celdas · {{estacion}} — {{puesto}} ({{quien}})",
      count,
      estacion: row.station?.stationName || "",
      puesto: row.pos.name,
      quien: who,
    });
  }, [sel, selBounds, selectableRows]);

  // ─── Cell renderers ──────────────────────────────────────────────────────

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="px-3 lg:px-4 pt-2 pb-2 flex flex-col">
        {/* Un solo editor: «En vivo» (esto) y «Borrador» (el compartido). */}
        <HorarioModos className="mb-2" modo="vivo" />
        {!editarHorario.puede && (
          <div
            className="mb-2 rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: "var(--hairline)", color: "var(--ink-soft)" }}
          >
            {t("ui.puede.horarioSoloLectura", "Solo lectura: tu rol puede ver el horario, no cambiarlo.")}
          </div>
        )}
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
                {t("ui.Schedule.rotacionesYCoberturas", "Rotaciones y coberturas")}
              </div>
            </div>
          </div>

          {/* En el teléfono ocupa el ANCHO: las flechas a los extremos y el mes
              centrado entre ellas. Pegado a la izquierda con 70 px de vacío a
              la derecha, el «›» quedaba en mitad de la pantalla y no donde el
              pulgar lo busca. En `sm` mide lo que mide su contenido. */}
          <div className="flex w-full items-center gap-1.5 sm:w-auto">
            <Button
              size="sm"
              title={t("ui.Schedule.anteriorRePag", "Anterior (Re Pág)")}
              variant="outline"
              onClick={() => nav(-1)}
            >
              <ChevronLeft size={16} />
            </Button>
            <Button size="sm" variant="outline" onClick={goToday}>
              {t("kit.dateRange.today", "Hoy")}
            </Button>
            <span className="min-w-[130px] flex-1 text-center text-sm font-semibold sm:flex-none">
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

          {/* Rango: Mes = hoja de cálculo · Semana/Día = línea de tiempo dibujable.

              ── EN UN TELÉFONO NO SE OFRECEN LAS REJILLAS ──────────────────
              Hoja, Semana y Día se leen desplazándose en las DOS direcciones.
              En 390 px eso no es una vista peor: es una pantalla en la que no
              se puede trabajar. Ofrecerla es invitar a un estado roto —y es
              justo como se llega aquí, porque basta con haberla elegido una vez
              en el escritorio—. Se dejan las dos que sí funcionan con el pulgar:
              la lista y el calendario del mes. En cuanto hay ancho vuelven todas. */}
          <Segmented<ViewMode>
            options={
              pantallaEstrecha
                ? [
                    { value: "agenda", label: t("ui.Schedule.vistaAgenda", "Agenda") },
                    { value: "organigrama", label: t("ui.Organigrama.vista") },
                    {
                      value: "calendar",
                      label: t("ui.Schedule.vistaCalendario", "Calendario"),
                    },
                  ]
                : [
                    { value: "month", label: t("ui.Schedule.vistaHoja", "Hoja") },
                    {
                      value: "calendar",
                      label: t("ui.Schedule.vistaCalendario", "Calendario"),
                    },
                    { value: "week", label: t("ui.Schedule.vistaSemana", "Semana") },
                    { value: "day", label: t("ui.Schedule.vistaDia", "Día") },
                    { value: "agenda", label: t("ui.Schedule.vistaAgenda", "Agenda") },
                    { value: "organigrama", label: t("ui.Organigrama.vista") },
                  ]
            }
            /* En el teléfono ocupa el ancho: pegado a la izquierda sobraba
               medio ancho a la derecha y parecía mal puesto. */
            expandir={pantallaEstrecha}
            value={view}
            onChange={elegirVista}
          />

          {/* ── LAS PUERTAS QUE SÓLO EXISTÍAN EN LA HOJA ────────────────────
              Asignar a alguien, editarle el puesto o crear un sacafranco se
              hacían desde la rejilla: el «+» de cada estación, el reloj, el
              nombre de la plaza. En un teléfono la rejilla no se puede usar —y
              desde que no se ofrece, esas acciones no tenían NINGUNA puerta—.
              Aquí están las dos que hacen falta: entrar a un puesto (y desde su
              asistente asignar, cambiar o quitar gente) y crear un sacafranco.
              En pantalla ancha no aparecen: ahí ya están en su sitio. */}
          {pantallaEstrecha && (
            /* `w-full` y no sólo `flex-1` en los hijos: el contenedor vive en
               una fila que envuelve, así que sin él los dos botones se quedan
               midiendo su contenido y sobra medio ancho a la derecha — el mismo
               desajuste que tenía el riel de vistas. */
            <div className="flex w-full items-center gap-2">
              <Button
                className="flex-1"
                size="sm"
                variant="outline"
                onClick={() => setElegirPuesto(true)}
              >
                <Shield className="mr-1.5" size={15} />
                {t("ui.Coverage.puestos", "Puestos")}
              </Button>
              <Button
                className="flex-1"
                size="sm"
                variant="outline"
                onClick={addSacafranco}
              >
                <Plus className="mr-1.5" size={15} />
                {t("ui.PostSiteWizard.jornada.sacafranco", "Sacafranco")}
              </Button>
            </div>
          )}

          {coverage &&
            typeof coverage.coveredPct === "number" &&
            (() => {
              const ok = (coverage.gapCount || 0) === 0;

              return (
                <StatusBadge
                  /* A lo ancho en el teléfono: es el titular del día —cuánto
                     está cubierto y cuánto no—, y encogida a su texto en una
                     esquina se lee como una etiqueta más de las muchas que hay
                     en la pantalla.

                     `[&>span]:flex`: el envoltorio interno de `StatusBadge` es
                     un bloque, y los `svg` del sistema son `display: block`, así
                     que el triángulo de aviso se ponía en una línea para él solo
                     encima del texto. En fila queda al lado, como en el resto de
                     las etiquetas. */
                  className="w-full justify-center whitespace-nowrap [&>span]:flex [&>span]:items-center [&>span]:gap-1.5 sm:w-auto"
                  dot={false}
                  tone={ok ? "ok" : "bad"}
                >
                  {ok ? (
                    <CheckCircle2 size={13} />
                  ) : (
                    <AlertTriangle size={13} />
                  )}
                  {t("ui.Schedule.coberturaPct", {
                    defaultValue: "Cobertura {{pct}}%",
                    pct: coverage.coveredPct,
                  })}
                  {(coverage.gapCount || 0) > 0 && (
                    <span>
                      {t("ui.Schedule.nSinCubrir", {
                        defaultValue: "· {{n}} sin cubrir",
                        n: coverage.gapCount,
                      })}
                    </span>
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
                ? t("ui.Schedule.ocultarPanelLateral", "Ocultar panel lateral")
                : t(
                    "ui.Schedule.mostrarPanel",
                    "Mostrar panel (vigilantes, IA, personal)",
                  )
            }
            variant="outline"
            onClick={alternarPanel}
          >
            {panelOpen ? (
              <PanelRightClose size={15} />
            ) : (
              <PanelRightOpen size={15} />
            )}
            <span className="hidden md:inline">
              {t("ui.Schedule.panel", "Panel")}
            </span>
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
        ) : falloCarga && stations.length === 0 ? (
          <div className="py-10">
            <ErrorDeCarga onRetry={() => void fetchAll({ silent: false })} />
          </div>
        ) : stations.length === 0 ? (
          <div className="py-10">
            <EmptyState
              action={
                <Button asChild variant="brand">
                  <Link to="/stations">
                    <Plus className="mr-2 h-4 w-4" />
                    {t("ui.Schedule.irAEstaciones", "Ir a Estaciones")}
                  </Link>
                </Button>
              }
              description={t("ui.Schedule.creaUnPuestoDesdeLa")}
              icon={<MapPin />}
              title={t(
                "ui.Schedule.todaviaNoHayPuestosConfigurados",
                "Todavía no hay estaciones",
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
                    {t(
                      "ui.Schedule.generaLaAsignacionAutomatica",
                      "Genera la asignación automática para crear los puestos, asignar vigilantes por cercanía y escalonar los turnos (sacafrancos incluidos).",
                    )}
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
                    ? t("ui.Schedule.asignando", "Asignando…")
                    : t(
                        "ui.Schedule.generarAsignacionAutomatica",
                        "Generar asignación automática",
                      )}
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
              {view === "organigrama" ? (
                <OrganigramaView
                  assignments={assignments}
                  dateStrOf={(iso) => dateToWall(new Date(iso), tzName).dateStr}
                  guardColorMap={guardColorMap}
                  positionsByStation={positionsByStation}
                  sedes={sedesDelOrganigrama}
                  shifts={shifts}
                  stations={stations}
                  timeOf={(iso) => {
                    const w = dateToWall(new Date(iso), tzName);

                    return `${String(Math.floor(w.minutes / 60)).padStart(2, "0")}:${String(w.minutes % 60).padStart(2, "0")}`;
                  }}
                  todayStr={todayStr}
                  onConfigurarPuesto={configureStation}
                  onPickShift={(sh, punto) =>
                    punto
                      ? accionesDelTurno(sh, punto)
                      : jumpToDay(
                          dateToWall(new Date(sh.startTime), tzName).dateStr,
                        )
                  }
                />
              ) : view === "agenda" ? (
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
                  onPickShift={(sh, punto) =>
                    punto
                      ? accionesDelTurno(sh, punto)
                      : jumpToDay(
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
                    className="shrink-0 overflow-auto rounded-xl"
                    style={{
                      border: "1px solid var(--hairline)",
                      /* Everyone can be a long list: it scrolls inside so the
                         timeline below keeps its room. */
                      maxHeight: "60vh",
                    }}
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
                    {/* TODO EL PERSONAL — also in Semana/Día: whoever has no
                        seat was invisible here too. Same columns, with zero-width
                        pads where the year sheet keeps its virtualized margins. */}
                    <AllStaffSection
                      colA={0}
                      colB={timelineDays.length}
                      colWidth={64}
                      gridCols={`${COL_STICKY_W}px 0px repeat(${timelineDays.length}, minmax(64px, 1fr)) 0px`}
                      monthDays={timelineDays}
                      refreshKey={personalVersion}
                      tintFor={tintPersonalLinea}
                      todayStr={todayStr}
                      onAsignarAPuesto={abrirAsignarPersona}
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
                        {t("comun.puesto", "Puesto")}
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
                              {diaCorto(day)}
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

                    {/* TODO EL PERSONAL — misma rejilla. Una fila por PERSONA
                      (vigilantes, supervisores y oficina), con dónde está y sus
                      horas cada día, y «Sin horario» en ámbar. Sustituye a la
                      banda «Oficina»: la jornada semanal se edita desde aquí.
                      Va debajo de Supervisión y encima de los puestos. */}
                    <AllStaffSection
                      colA={colA}
                      colB={colB}
                      gridCols={gridCols}
                      monthDays={monthDays}
                      refreshKey={personalVersion}
                      tintFor={tintPersonalMes}
                      todayStr={todayStr}
                      onAsignarAPuesto={abrirAsignarPersona}
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
                                  shiftByGuardPosDate={shiftByGuardPosDate}
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
                                  {t("ui.Schedule.sacafrancos", "Sacafrancos")}
                                </div>
                                <div
                                  className="text-[10px]"
                                  style={{ color: "var(--ink-soft)" }}
                                >
                                  {sfPositions.length === 0
                                    ? t("ui.Schedule.ningunoTodavia", "ninguno todavía")
                                    : t("ui.Schedule.nPosiciones", {
                                        defaultValue: "{{count}} posiciones",
                                        count: sfPositions.length,
                                      })}{" "}
                                  {sfSectionOpen
                                    ? "▾"
                                    : t(
                                        "ui.Schedule.clicParaExpandir",
                                        "▸ (clic para expandir)",
                                      )}
                                </div>
                              </div>
                              {/* Crear un sacafranco desde aquí: el modal pregunta
                                a QUÉ estación va, en vez de heredar una. */}
                              <button
                                className="cg-focus flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold"
                                style={tonePill("ok", 14)}
                                title={t(
                                  "ui.Schedule.crearUnSacafrancoYElegirEstacion",
                                  "Crear un sacafranco y elegir en qué estación va",
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addSacafranco();
                                }}
                              >
                                <Plus size={11} /> {t("ui.Schedule.agregar", "Agregar")}
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
                              {t(
                                "ui.Schedule.noHaySacafrancos",
                                "No hay sacafrancos. Con «Agregar» creas uno y eliges en qué estación va.",
                              )}
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
                                      {/* ── LA PUERTA PARA EDITARLO ────────
                                          El nombre era texto plano, así que un
                                          sacafranco ya creado no se podía tocar:
                                          la fila sólo ofrecía «asignar» y
                                          «eliminar», y para cambiarle el ciclo o
                                          la alternancia había que borrarlo y rehacerlo
                                          —con lo que se le anulan los turnos
                                          futuros—. Ahora abre su asistente, el
                                          mismo con el que se creó. */}
                                      <button
                                        className="cg-focus block max-w-full truncate text-left text-xs font-semibold hover:underline"
                                        title={t(
                                          "ui.Schedule.editarEsteSacafranco",
                                          "Editar este sacafranco: su ciclo y por qué estaciones rota",
                                        )}
                                        type="button"
                                        onClick={() => {
                                          const st = stationsById.get(
                                            pos.stationId,
                                          );

                                          if (st) editSacafranco(st, pos);
                                        }}
                                      >
                                        {pos.name}
                                      </button>
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
                                          title={t(
                                            "ui.Schedule.eliminarEstaPosicionDeSacafranco",
                                            "Eliminar esta posición de sacafranco",
                                          )}
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
                                      /* En un móvil no hay clic derecho: sin
                                         esto, cubrir un turno desde el teléfono
                                         era imposible. */
                                      ...handlersDePulsacionLarga((punto) =>
                                        openSfCtx(
                                          punto,
                                          pos,
                                          posAssignments[0] || null,
                                          dateStr,
                                        ),
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
                                            title={t(
                                              "ui.MonthStationBlock.novedadDobleClicParaEditar",
                                              {
                                                defaultValue:
                                                  "{{nombre}} — {{codigo}}{{nota}} (doble clic para editar)",
                                                nombre: gName,
                                                codigo:
                                                  CODE_LABEL[override.type] ??
                                                  override.type,
                                                nota: override.note
                                                  ? ": " + override.note
                                                  : "",
                                              },
                                            )}
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
                                                ? t(
                                                    "ui.Schedule.libreArrastraEsteDia",
                                                    "Libre — arrastra este día sobre una L de un puesto para cubrirlo",
                                                  )
                                                : t(
                                                    "ui.Schedule.sinVigilanteDobleClicParaAsignar",
                                                    "Sin vigilante — doble clic para asignar sacafranco",
                                                  )
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
                                          title={t("ui.Schedule.cubreDobleClicParaQuitar", {
                                            defaultValue:
                                              "Cubre: {{estacion}} — {{codigo}} · doble clic para quitar la cobertura",
                                            estacion: covStName,
                                            codigo: CODE_LABEL[code],
                                          })}
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
                      <h3 className="cg-eyebrow">
                        {t("ui.Schedule.vigilantesDisponibles", "Vigilantes disponibles")}
                      </h3>
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
                      <h3 className="cg-eyebrow">
                        {t("ui.Schedule.herramientas", "Herramientas")}
                      </h3>
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
                      {aiLoading
                        ? t("ui.Schedule.analizando", "Analizando…")
                        : t("ui.Schedule.recomendacionIa", "Recomendación IA")}
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
                    <h3 className="cg-eyebrow">
                      {t("ui.Schedule.personalNecesario", "Personal necesario")}
                    </h3>
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
                              {t("ui.Schedule.fijos", "Fijos")}
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
                              {t("ui.Schedule.sacafrancos", "Sacafrancos")}
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
                              {t("ui.Schedule.fijosAsignados", "Fijos asignados")}
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
                              {t("ui.Schedule.sfAsignados", "SF asignados")}
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
                              {t("ui.Schedule.haceFaltaContratar", "Hace falta contratar:")}
                            </div>
                            {(staffing.fijosNeeded || 0) -
                              (staffing.currentFijoGuards || 0) >
                              0 && (
                              <div className="text-[10px] tabular-nums">
                                •{" "}
                                {t("ui.Schedule.nFijosMas", {
                                  defaultValue: "{{n}} fijos más",
                                  n:
                                    (staffing.fijosNeeded || 0) -
                                    (staffing.currentFijoGuards || 0),
                                })}
                              </div>
                            )}
                            {(staffing.sacafrancosNeeded || 0) -
                              (staffing.currentSfGuards || 0) >
                              0 && (
                              <div className="text-[10px] tabular-nums">
                                •{" "}
                                {t("ui.Schedule.nSacafrancosMas", {
                                  defaultValue: "{{n}} sacafrancos más",
                                  n:
                                    (staffing.sacafrancosNeeded || 0) -
                                    (staffing.currentSfGuards || 0),
                                })}
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
                          {t("ui.Schedule.demandaPico", "Demanda pico:")}{" "}
                          <span
                            className="font-semibold tabular-nums"
                            style={{ color: "var(--ink)" }}
                          >
                            {staffing.peakDemand}
                          </span>{" "}
                          {t("ui.Schedule.puestosSimultaneos", "puestos simultáneos")}
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
                              {t("ui.Schedule.alertasPorPuesto", {
                                defaultValue: "Alertas por puesto ({{n}})",
                                n: stationAlerts.length,
                              })}
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
                                      •{" "}
                                      {t("ui.Schedule.fijosSinVigilante", {
                                        defaultValue: "{{n}} fijo(s) sin vigilante",
                                        n: alert.missingFijoCount,
                                      })}
                                    </div>
                                  )}
                                  {alert.uncoveredDays > 0 && (
                                    <div className="tabular-nums">
                                      •{" "}
                                      {t("ui.Schedule.diasSinCubrirCubriendo", {
                                        defaultValue: "{{n}} día(s) sin cubrir cubriendo",
                                        n: alert.uncoveredDays,
                                      })}
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
                            {t("ui.Coverage.puestos", "Puestos")}
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
                            {t("ui.Schedule.asignados", "Asignados")}
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
                            {t("ui.Schedule.posicionesCubiertas", {
                              defaultValue: "{{cubiertas}}/{{total}} posiciones cubiertas",
                              cubiertas: covered,
                              total: fijoPositions.length,
                            })}
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
                          {t("ui.Schedule.sacafrancosN", {
                            defaultValue: "Sacafrancos ({{n}})",
                            n: sacafrancoData.length,
                          })}
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
                                    {t("ui.Schedule.nLibre", {
                                      defaultValue: "{{n}} libre",
                                      n: availDays,
                                    })}
                                  </span>
                                  <span
                                    className="rounded px-1.5 py-0.5 text-[9px] font-semibold tabular-nums"
                                    style={tonePill("warn", 12)}
                                  >
                                    {t("ui.Schedule.nCubre", {
                                      defaultValue: "{{n}} cubre",
                                      n: coverDays,
                                    })}
                                  </span>
                                </span>
                              </div>
                              {stationsCovering.length > 0 && (
                                <div
                                  className="truncate text-[9px]"
                                  style={{ color: "var(--ink-soft)" }}
                                >
                                  {t("ui.Schedule.cubreEstaciones", {
                                    defaultValue: "Cubre: {{estaciones}}",
                                    estaciones: stationsCovering.join(", "),
                                  })}
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
                  {t(
                    "ui.Schedule.ayudaAgenda",
                    "Lista por día · toca un turno para abrir ese día ·",
                  )}{" "}
                  <b>{t("ui.Schedule.reAvPag", "Re/Av Pág")}</b>{" "}
                  {t("ui.Schedule.cambiaDeMes", "cambia de mes")}
                </span>
              ) : view === "calendar" ? (
                <span
                  className="font-medium"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {t(
                    "ui.Schedule.ayudaCalendario",
                    "El mes de un vistazo · Clic en un turno o en «+N más» para abrir ese día ·",
                  )}{" "}
                  <b>{t("ui.Schedule.reAvPag", "Re/Av Pág")}</b>{" "}
                  {t("ui.Schedule.cambiaDeMes", "cambia de mes")}
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
                    <b>{t("ui.Schedule.clicDerecho", "Clic derecho")}</b>
                    {t("ui.Schedule.editarDuplicarEliminarTurnoY")}{" "}
                    <b>D N L V F P 2</b> {t("ui.Schedule.paraNovedad")}{" "}
                    <b>{t("ui.Schedule.teclaSupr", "Supr")}</b>{" "}
                    {t(
                      "ui.Schedule.borraArrastraUnDia",
                      "borra · Arrastra un día",
                    )}{" "}
                    <b>{t("ui.Schedule.lDelSacafranco")}</b>{" "}
                    {t("ui.Schedule.sobreUnLDelPuesto")}{" "}
                    <b>{t("ui.Schedule.reAvPag", "Re/Av Pág")}</b>{" "}
                    {t("ui.Schedule.cambiaMes", "cambia mes")}
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
                  <b>{t("ui.Schedule.dibujarUnBloqueDeTrabajo")}</b>{" "}
                  {t(
                    "ui.Schedule.ayudaLineaDeTiempo",
                    "(p. ej. 07:00 → 07:00 del día siguiente) · Clic en un bloque: detalle / eliminar · Suelta un vigilante del panel sobre la línea ·",
                  )}{" "}
                  <b>{t("ui.Schedule.reAvPag2", "Re/Av Pág")}</b>{" "}
                  {view === "week"
                    ? t("ui.Schedule.cambiaDeSemana", "cambia de semana")
                    : t("ui.Schedule.cambiaDeDia", "cambia de día")}
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
      {/* «Asignar a un puesto» desde Todo el personal: se elige la plaza y se
          abre el MISMO formulario de asignar que abre el arrastre. */}
      {asignarPersona && (
        <AsignarAPuestoModal
          assignments={assignments}
          nombre={asignarPersona.name}
          positions={positions}
          stations={stations}
          onClose={() => setAsignarPersona(null)}
          onPick={(stationId, positionId) => {
            const guardId = asignarPersona.userId;

            setAsignarPersona(null);
            openAssignForm(stationId, positionId);
            setAssignGuard(guardId);
          }}
        />
      )}
      {correrCiclo && (
        <CorrerCicloModal
          open
          assignmentId={correrCiclo.assignmentId}
          nombre={correrCiclo.nombre}
          onClose={() => setCorrerCiclo(null)}
          onDone={() => {
            setCorrerCiclo(null);
            fetchAll({ silent: true });
          }}
        />
      )}

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
                      {t("ui.Schedule.aprendizEnAcompanamiento", "Aprendiz en acompañamiento")}
                    </h4>
                    <p
                      className="mt-0.5 text-[11px]"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {t("ui.Schedule.juntoA", {
                        defaultValue: "Junto a {{titular}} · {{estacion}}",
                        titular: shadowFor.titularName,
                        estacion: shadowFor.stationName,
                      })}
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
                      {t("ui.Schedule.trabaja", "Trabaja")}{" "}
                      <b>
                        {t("ui.Schedule.losMismosDiasQue", {
                          defaultValue: "los mismos días que {{titular}}",
                          titular: shadowFor.titularName,
                        })}
                      </b>{" "}
                      {t(
                        "ui.Schedule.yFichaConNormalidadPero",
                        "y ficha con normalidad, pero",
                      )}{" "}
                      <b>{t("ui.Schedule.noCuentaComoCobertura", "no cuenta como cobertura")}</b>
                      {t(
                        "ui.Schedule.siElTitularFalta",
                        ": si el titular falta, el puesto sigue apareciendo descubierto.",
                      )}
                    </p>
                  </div>
                  <div>
                    <label
                      className="mb-1 block text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {t("ui.Schedule.aprendiz", "Aprendiz")}
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
                      <option value="">
                        {t("ui.SupervisionSection.selecciona", "Selecciona…")}
                      </option>
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
                        {t("comun.desde", "Desde")}
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
                        {t("comun.hasta", "Hasta")}
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
                    {t(
                      "ui.Schedule.elAcompanamientoTieneFinal",
                      "El acompañamiento tiene final: cuando termine, el aprendiz deja de seguir este puesto. Para que se quede, asígnalo a su propio puesto.",
                    )}
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
                    {t("common.cancel", "Cancelar")}
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
                      t("ui.Schedule.ponerEnAcompanamiento", "Poner en acompañamiento")
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

          /* El ciclo de la plaza que se está editando, en sus tres números, y
             el de la estación para poder nombrarlo en la opción «heredar». */
          const rotD = Math.max(0, posEditor.rotDays ?? 5);
          const rotN = Math.max(0, posEditor.rotNights ?? 0);
          const rotL = Math.max(0, posEditor.rotRest ?? 2);
          const rotLen = rotD + rotN + rotL;
          const rotNombre =
            rotN > 0 ? `${rotD}-${rotN}-${rotL}` : `${rotD}-${rotL}`;
          const estacionDelEditor = stationsById.get(posEditor.stationId);
          const estiloDeLaEstacion = estacionDelEditor?.rotationStyleId
            ? rotationStyles.find(
                (r) => r.id === String(estacionDelEditor.rotationStyleId),
              )
            : null;

          /* ── ASISTENTE DEL SACAFRANCO ────────────────────────────────────────
           El diálogo genérico de puestos preguntaba «Tipo: fijo o sacafranco» y
           se titulaba «Agregar puesto». Cuando ya se sabe que se está creando un
           sacafranco eso sobra, y en cambio falta todo lo que un sacafranco SÍ
           necesita: quién es, qué horas cubre, si su mes es rotativo o se coloca
           a mano, y en qué estaciones cubre — con cuál de ellas de base. */
          /* El MISMO asistente crea y edita. Antes editar un sacafranco caía
             en el diálogo genérico de puestos —nombre, tipo, horas— donde no
             existen ni su ciclo ni las estaciones que cubre: para cambiarle la
             alternancia había que borrarlo y rehacerlo. */
          if (posEditor.sfWizard) {
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

            const paso = posEditor.sfPaso || 1;
            const editando = !!posEditor.positionId;

            /* ── LA RONDA, COMO SE VA A LEER ───────────────────────────────
               El orden es el de `marcadas` (es lo que se guarda en
               `coveredStationIds`) y las cuentas salen de `stationDays`; sin
               cuenta, un día. Así «3-1» se escribe con dos casillas y se lee
               entero en la vista previa de abajo, que es lo único que dice si
               lo que se tecleó es lo que se quería. */
            const tramosPorEstacion = marcadas.map((id) => ({
              id,
              dias: Math.max(1, Math.floor(posEditor.stationDays?.[id] ?? 1)),
            }));
            const pasosDeLaAlternancia = tramosPorEstacion.reduce((a, t) => a + t.dias, 0);
            const cadencia = tramosPorEstacion.map((t) => t.dias).join("-");
            /* ── LA VUELTA DE VERDAD: ESTACIÓN **Y** TRAMO ─────────────────
               Enseñar sólo la estación no dice la operación. Su ciclo es D/N/L
               y la alternancia avanza por días TRABAJADOS, así que las dos cosas se
               entrelazan: con una alternancia 3-1 sobre un 3-3-2, la estación B no cae
               siempre de noche ni siempre de día — va rotando. Sin verlo, nadie
               sabe cuántos turnos de día y cuántos de noche acaba haciendo en
               cada sitio, que es justo lo que hay que decidir.

               El tramo que SE REPITE no es el ciclo ni la alternancia: es donde vuelven a
               coincidir. Con W días de trabajo por ciclo y una alternancia de R, se
               repite cada R/mcd(W,R) ciclos. Un 3-3-2 (W=6) con alternancia 3-1 (R=4)
               da 2 ciclos: 12 turnos, no 4.

               Se simula igual que el motor —los libres se saltan y NO gastan
               paso de la alternancia— para que lo que se promete aquí sea lo que sale. */
            const mcd = (a: number, b: number): number => (b ? mcd(b, a % b) : a);
            const trabajaPorCiclo = sfDias + sfNoches;
            const ciclosHastaRepetir =
              pasosDeLaAlternancia > 0 && trabajaPorCiclo > 0
                ? pasosDeLaAlternancia / mcd(trabajaPorCiclo, pasosDeLaAlternancia)
                : 1;
            const estacionEnPaso = (paso0: number): string => {
              let r = pasosDeLaAlternancia > 0 ? paso0 % pasosDeLaAlternancia : 0;

              for (const t of tramosPorEstacion) {
                if (r < t.dias) return t.id;
                r -= t.dias;
              }

              return tramosPorEstacion[0]?.id || "";
            };
            /** Los turnos de una vuelta entera, en orden, con su tramo. */
            const secuenciaDeTurnos: { id: string; noche: boolean }[] = [];
            if (pasosDeLaAlternancia > 0 && trabajaPorCiclo > 0 && sfCicloLen > 0) {
              let trabajados = 0;

              for (let d = 0; d < ciclosHastaRepetir * sfCicloLen; d++) {
                const pos = (sfArranque + d) % sfCicloLen;

                if (pos >= trabajaPorCiclo) continue; // libre: no gasta paso
                secuenciaDeTurnos.push({
                  id: estacionEnPaso(trabajados),
                  noche: pos >= sfDias,
                });
                trabajados++;
              }
            }
            /** Por estación: cuántos de día y cuántos de noche en esa vuelta. */
            const resumenPorEstacion = marcadas.map((id) => ({
              id,
              dia: secuenciaDeTurnos.filter((x) => x.id === id && !x.noche).length,
              noche: secuenciaDeTurnos.filter((x) => x.id === id && x.noche).length,
            }));
            /** Iniciales para la tira: A, B, C… en el orden de la lista. */
            const letraDe = (id: string) =>
              String.fromCharCode(65 + Math.max(0, marcadas.indexOf(id)));

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
                        {/* El mismo diálogo hace las dos cosas, así que tiene
                            que decir cuál está haciendo: abrirlo sobre uno que
                            ya existe y leer «Agregar» hace dudar de si se va a
                            crear otro. */}
                        {editando
                          ? t("ui.Schedule.editarSacafranco", "Editar sacafranco")
                          : t("ui.Schedule.agregarSacafranco", "Agregar sacafranco")}
                      </h4>
                      <p
                        className="mt-0.5 text-[11px]"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {marcadas.length
                          ? t("ui.Schedule.cubreNEstaciones", {
                              defaultValue: "Cubre {{n}} estación(es)",
                              n: marcadas.length,
                            })
                          : t(
                              "ui.Schedule.elRelevoQueCubreLosDescansos",
                              "El relevo que cubre los descansos de los fijos",
                            )}
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
                    {/* ── LOS TRES PASOS, SIEMPRE A LA VISTA ──────────────
                        Sin esto el diálogo no dice cuánto queda ni deja volver
                        a lo ya contestado sin perderlo. */}
                    <div className="flex items-center gap-1.5">
                      {[
                        { n: 1 as const, t: t("ui.Schedule.pasoQuien", "Quién") },
                        { n: 2 as const, t: t("ui.Schedule.pasoSuCiclo", "Su ciclo") },
                        {
                          n: 3 as const,
                          t: t("ui.Schedule.pasoDondeCubre", "Dónde cubre"),
                        },
                      ].map((x) => (
                        <button
                          key={x.n}
                          className={`cg-focus flex-1 rounded-lg px-2 py-1.5 text-center text-[10px] font-semibold transition-all ${paso === x.n ? "glass-brand" : "glass-flat"}`}
                          type="button"
                          onClick={() => set({ sfPaso: x.n })}
                        >
                          <span className="tabular-nums">{x.n}</span> · {x.t}
                        </button>
                      ))}
                    </div>

                    {paso === 1 && (
                    <>
                    {/* Quién */}
                    <div>
                      <label className="cg-eyebrow mb-1.5 block">
                        {t("comun.vigilante", "Vigilante")}
                      </label>
                      <select
                        className="cg-input cg-focus w-full px-3 py-2.5 text-sm"
                        value={posEditor.guardId || ""}
                        onChange={(e) => set({ guardId: e.target.value })}
                      >
                        <option value="">
                          {t(
                            "ui.Schedule.sinVigilantePorAhora",
                            "Sin vigilante por ahora — sólo crear la fila",
                          )}
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
                          ? t(
                              "ui.Schedule.seCreaLaFilaYSeLeAsigna",
                              "Se crea la fila y se le asigna en un solo paso.",
                            )
                          : t(
                              "ui.Schedule.soloAparecenQuienesNoTienen",
                              "Sólo aparecen quienes no tienen ya una rotación activa. Sin elegir a nadie se crea la fila vacía y se asigna después.",
                            )}
                      </p>
                    </div>

                    {/* Nombre */}
                    <div>
                      <label className="cg-eyebrow mb-1.5 block">
                        {t("ui.Schedule.nombreDeLaFila", "Nombre de la fila")}
                      </label>
                      <input
                        className="cg-input cg-focus w-full px-3 py-2.5 text-sm"
                        placeholder={t("ui.PostSiteWizard.jornada.sacafranco", "Sacafranco")}
                        value={posEditor.name}
                        onChange={(e) => set({ name: e.target.value })}
                      />
                    </div>

                    </>
                    )}

                    {paso === 2 && (
                    <>
                    {/* Fijo o rotativo — igual que al dar de alta a un vigilante.
                      Las HORAS no se preguntan: un sacafranco no tiene horario
                      propio, cubre el hueco que deja el fijo y toma las horas de
                      ESE hueco (así lo calcula el generador). */}
                    <div>
                      <label className="cg-eyebrow mb-1.5 block">
                        {t("ui.Schedule.tipoDeTurno", "Tipo de turno")}
                      </label>
                      <Segmented<"rotativo" | "manual">
                        options={[
                          {
                            value: "rotativo",
                            label: t("ui.Schedule.turnoRotativo", "Turno rotativo"),
                          },
                          {
                            value: "manual",
                            label: t("ui.Schedule.turnoFijo", "Turno fijo"),
                          },
                        ]}
                        value={posEditor.rotMode || "manual"}
                        onChange={(v) => set({ rotMode: v })}
                      />
                      {(posEditor.rotMode || "manual") === "rotativo" ? (
                        <div className="mt-2">
                          <label className="cg-eyebrow mb-1.5 block">
                            {t("ui.Schedule.estiloDeRotacion", "Estilo de rotación")}
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
                              hint={t(
                                "ui.Schedule.seguidosAntesDeCambiarDeBloque",
                                "Seguidos, antes de cambiar de bloque",
                              )}
                              label={t("ui.Schedule.turnosDeDia", "Turnos de día")}
                              max={31}
                              min={0}
                              suffix="D"
                              value={sfDias}
                              onChange={(v) => set({ rotDays: v })}
                            />
                            <NumberStepper
                              hint={t(
                                "ui.Schedule.elSegundoBloqueDelPuesto",
                                "El segundo bloque del puesto",
                              )}
                              label={t(
                                "ui.Schedule.turnosDeTardeONoche",
                                "Turnos de tarde o noche",
                              )}
                              max={31}
                              min={0}
                              suffix="T/N"
                              value={sfNoches}
                              onChange={(v) => set({ rotNights: v })}
                            />
                            <NumberStepper
                              hint={t(
                                "ui.Schedule.losQueLibraAlCerrarElCiclo",
                                "Los que libra al cerrar el ciclo",
                              )}
                              label={t("ui.Schedule.diasLibres", "Días libres")}
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
                              <span>{t("ui.Schedule.ciclo", "Ciclo")}</span>
                              <span className="font-semibold tabular-nums">
                                {sfCicloLen > 0
                                  ? t("ui.Schedule.cicloNombreNDias", {
                                      defaultValue: "{{nombre}} · {{count}} días",
                                      nombre: sfNombreCiclo,
                                      count: sfCicloLen,
                                    })
                                  : "—"}
                              </span>
                            </div>
                          </div>
                          <p
                            className="mt-1 text-[10px]"
                            style={{ color: "var(--ink-faint)" }}
                          >
                            {sfDias + sfNoches < 1
                              ? t(
                                  "ui.Schedule.necesitaAlMenosUnTurno",
                                  "Necesita al menos un turno de trabajo.",
                                )
                              : t(
                                  "ui.Schedule.seLeGeneranSusTurnos",
                                  "Se le generan sus turnos con este ciclo, con su propio compás (no el de la estación). Tarda unos segundos.",
                                )}
                          </p>
                        </div>
                      ) : (
                        <p
                          className="mt-1.5 text-[10px]"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          {t(
                            "ui.Schedule.sinPatronPropio",
                            "Sin patrón propio: su mes empieza en blanco y sus días se colocan sobre los descansos —arrastrándolos o con «Optimizar sacafrancos».",
                          )}
                        </p>
                      )}
                    </div>

                    </>
                    )}

                    {paso === 3 && (
                    <>
                    {/* En qué estaciones cubre */}
                    <div>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <label className="cg-eyebrow block">
                          {t("ui.Schedule.enQueEstacionesCubre", "En qué estaciones cubre")}
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
                            {t("ui.Schedule.limpiar", "Limpiar")}
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
                            {t("ui.Schedule.noHayEstaciones", "No hay estaciones.")}
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
                                    {t("ui.ScheduleTimeline.dias", "días")}
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
                        {/* Este texto se quedó atrás: decía «sus turnos se
                            generan en su puesto base» y «no reparte sus días
                            solo», que era verdad mientras la lista era sólo un
                            permiso de fichaje. Con la cadencia de abajo SÍ los
                            reparte — y seguir diciendo lo contrario debajo de
                            una tira que la enseña es peor que no decir
                            nada. */}
                        {!marcadas.length
                          ? t("ui.Schedule.marcaAlMenosUna", "Marca al menos una.")
                          : marcadas.length === 1
                            ? t(
                                "ui.Schedule.todosSusDiasVanAEstaEstacion",
                                "Todos sus días de trabajo van a esta estación.",
                              )
                            : t(
                                "ui.Schedule.elOrdenYLosDiasDicenComoAlterna",
                                "El orden y los días de abajo dicen cómo alterna: se recorre tal cual, sin adivinar huecos.",
                              )}
                      </p>

                      {/* ── SIN VIGILANTE, LA RONDA NO SE GUARDA ───────────
                          La alternancia vive en la ASIGNACIÓN, no en la plaza: crear
                          la fila sin nadie dentro deja las estaciones y la
                          cadencia sin sitio donde guardarse. Antes esto pasaba
                          en silencio —el aviso decía «cubrirá 4 estaciones» y
                          al reabrirlo sólo quedaba la suya—. */}
                      {!editando && !posEditor.guardId && marcadas.length > 1 && (
                        <p
                          className="mt-1.5 rounded-lg px-2 py-1.5 text-[10px]"
                          style={toneCard("warn", 8, 26)}
                        >
                          {t(
                            "ui.Schedule.sinVigilanteLaFilaSeCreaVacia",
                            "Sin vigilante, la fila se crea vacía y esto",
                          )}
                          <b>
                            {" "}
                            {t(
                              "ui.Schedule.seVuelveAPreguntarAlAsignarlo",
                              "se vuelve a preguntar al asignarlo",
                            )}
                          </b>
                          {t(
                            "ui.Schedule.esSuAsignacionLaQueLoGuarda",
                            ": es su asignación la que lo guarda.",
                          )}
                        </p>
                      )}
                    </div>

                    {/* ── CÓMO ALTERNA ENTRE ELLAS ─────────────────────────
                        Marcar las estaciones no dice la operación: «3 días en
                        una y 1 en la otra» no es lo mismo que «2 y 2», ni que
                        «1, 1, 1 y 1». Aquí se escribe la cadencia —el ORDEN de
                        la lista más los días de cada una— y debajo se enseña la
                        tira que va a salir, que es lo único que confirma que lo
                        tecleado es lo que se quería.

                        Ojo con lo que esto NO hace: no busca huecos. El reparto
                        automático se retiró porque miraba los descansos de toda
                        la empresa y colocaba al sacafranco donde le parecía. La
                        alternancia se recorre y punto. */}
                    {marcadas.length > 1 && (
                      <div>
                        <label className="cg-eyebrow mb-1.5 block">
                          {t("ui.Schedule.comoAlternaEntreEllas", "Cómo alterna entre ellas")}
                        </label>
                        <div
                          className="space-y-1 rounded-xl px-2 py-2"
                          style={{ border: "1px solid var(--hairline)" }}
                        >
                          {tramosPorEstacion.map((tramo, idx) => {
                            const st = stationsById.get(tramo.id);

                            return (
                              <div
                                key={tramo.id}
                                className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs"
                              >
                                <span
                                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold"
                                  style={tonePill("ok", 14)}
                                >
                                  {letraDe(tramo.id)}
                                </span>
                                <span className="min-w-0 flex-1 truncate">
                                  {st ? stationLabel(st) : "—"}
                                </span>
                                <NumberStepper
                                  label=""
                                  max={31}
                                  min={1}
                                  suffix="d"
                                  value={tramo.dias}
                                  onChange={(v) =>
                                    set({
                                      stationDays: {
                                        ...(posEditor.stationDays || {}),
                                        [tramo.id]: Math.max(1, v),
                                      },
                                    })
                                  }
                                />
                                {/* El orden ES la cadencia: primero A tres
                                    días, luego B uno. Sin poder moverlas, la
                                    única forma de reordenar era desmarcarlas
                                    todas y volver a marcarlas en otro orden. */}
                                <div className="flex shrink-0 flex-col">
                                  <button
                                    aria-label={t("ui.Schedule.subir", "Subir")}
                                    className="cg-btn-ghost cg-focus rounded px-1 text-[9px] leading-tight disabled:opacity-30"
                                    disabled={idx === 0}
                                    type="button"
                                    onClick={() => {
                                      const v = [...marcadas];

                                      [v[idx - 1], v[idx]] = [v[idx], v[idx - 1]];
                                      set({ stationIds: v });
                                    }}
                                  >
                                    ▲
                                  </button>
                                  <button
                                    aria-label={t("ui.Schedule.bajar", "Bajar")}
                                    className="cg-btn-ghost cg-focus rounded px-1 text-[9px] leading-tight disabled:opacity-30"
                                    disabled={idx === tramosPorEstacion.length - 1}
                                    type="button"
                                    onClick={() => {
                                      const v = [...marcadas];

                                      [v[idx], v[idx + 1]] = [v[idx + 1], v[idx]];
                                      set({ stationIds: v });
                                    }}
                                  >
                                    ▼
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* ── LO QUE DE VERDAD VA A HACER ────────────────
                            La tira decía DÓNDE pero no QUÉ turno, y eso deja la
                            decisión a medias: con una alternancia 3-1 sobre un 3-3-2,
                            la segunda estación no cae siempre de noche ni
                            siempre de día — va rotando. Ahora cada casilla lleva
                            su tramo, y encima va la cuenta por estación, que es
                            la pregunta de verdad: cuántos de día y cuántos de
                            noche acaba haciendo en cada sitio. */}
                        <div
                          className="mt-2 rounded-xl px-3 py-2"
                          style={toneCard("ok", 8, 26)}
                        >
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <span className="cg-eyebrow">
                              {t("ui.Schedule.comoQuedaRepartido", "Cómo queda repartido")}
                            </span>
                            <span className="text-[11px] font-semibold tabular-nums">
                              {t("ui.Schedule.nTurnosNDias", {
                                defaultValue: "{{count}} turnos · {{dias}} días",
                                count: secuenciaDeTurnos.length,
                                dias: ciclosHastaRepetir * sfCicloLen,
                              })}
                            </span>
                          </div>

                          {/* La cuenta por estación: lo que se estaba pidiendo. */}
                          <div className="space-y-1">
                            {resumenPorEstacion.map((r) => {
                              const st = stationsById.get(r.id);

                              return (
                                <div
                                  key={r.id}
                                  className="flex items-center gap-2 text-[11px]"
                                >
                                  <span
                                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold"
                                    style={tonePill("ok", 14)}
                                  >
                                    {letraDe(r.id)}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate">
                                    {st ? stationLabel(st) : "—"}
                                  </span>
                                  <span className="shrink-0 tabular-nums">
                                    <b>{r.dia}</b> {t("ui.Schedule.deDia", "de día")} ·{" "}
                                    <b>{r.noche}</b> {t("ui.Schedule.deNoche", "de noche")}
                                  </span>
                                </div>
                              );
                            })}
                          </div>

                          {secuenciaDeTurnos.length > 0 && (
                            <div
                              className="mt-2 flex flex-wrap gap-1 pt-2"
                              style={{ borderTop: "1px solid var(--hairline)" }}
                            >
                              {secuenciaDeTurnos.map((t, i) => (
                                <span
                                  key={`${t.id}-${i}`}
                                  className="flex h-6 w-6 flex-col items-center justify-center rounded leading-none"
                                  style={tonePill(t.noche ? "info" : "ok", 14)}
                                  title={(() => {
                                    const st = stationsById.get(t.id);

                                    return `${st ? stationLabel(st) : ""} · ${t.noche ? i18n.t("ui.tramos.noche", "noche") : i18n.t("ui.tramos.dia", "día")}`;
                                  })()}
                                >
                                  <span className="text-[10px] font-bold">
                                    {letraDe(t.id)}
                                  </span>
                                  <span className="text-[7px] font-semibold opacity-80">
                                    {t.noche ? "N" : "D"}
                                  </span>
                                </span>
                              ))}
                              <span
                                className="self-center text-[10px]"
                                style={{ color: "var(--ink-faint)" }}
                              >
                                {t("ui.Schedule.yseRepite", "· y se repite")}
                              </span>
                            </div>
                          )}

                          <p
                            className="mt-1.5 text-[10px]"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {/* ── LA EXPLICACIÓN TIENE QUE SER VERDAD ────
                                Decía «por eso la misma estación le toca unas
                                veces de día y otras de noche» SIEMPRE que el
                                ciclo y la alternancia no encajaran. Con un ciclo sin
                                tramo de noche eso es falso —salen doce casillas
                                todas de día y el texto debajo hablando de
                                noches—, y la coletilla de los descansos sobra
                                cuando el ciclo no tiene ninguno. Se dice sólo
                                lo que se ve. */}
                            {ciclosHastaRepetir > 1
                              ? t("ui.Schedule.cicloYAlternanciaNoEncajan", {
                                  defaultValue:
                                    "Su ciclo ({{ciclo}}) y la alternancia ({{cadencia}}) no encajan a la primera: tardan {{n}} ciclos en volver a coincidir.",
                                  ciclo: sfNombreCiclo,
                                  cadencia,
                                  n: ciclosHastaRepetir,
                                })
                              : t("ui.Schedule.cicloYAlternanciaEncajan", {
                                  defaultValue:
                                    "Su ciclo ({{ciclo}}) y la alternancia ({{cadencia}}) encajan a la primera.",
                                  ciclo: sfNombreCiclo,
                                  cadencia,
                                })}
                            {ciclosHastaRepetir > 1 && sfNoches > 0 && sfDias > 0
                              ? t(
                                  "ui.Schedule.porEsoLaMismaEstacion",
                                  " Por eso la misma estación le toca unas veces de día y otras de noche.",
                                )
                              : ""}
                            {sfLibres > 0
                              ? t(
                                  "ui.Schedule.losDiasDeDescansoNoGastan",
                                  " Los días de descanso no gastan turno de estación.",
                                )
                              : t(
                                  "ui.Schedule.sinDescansosCadaDiaGasta",
                                  " Sin descansos, cada día del ciclo gasta un paso de la alternancia.",
                                )}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* De cuál cuelga su horario */}
                    {marcadas.length > 1 && (
                      <div>
                        <label className="cg-eyebrow mb-1.5 block">
                          {t("ui.Schedule.empiezaSuHorarioEn", "Empieza su horario en")}
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
                          {t(
                            "ui.Schedule.suFilaViveEnEstaEstacion",
                            "Su fila vive en esta estación y desde aquí arranca su horario. Cubre igual todas las marcadas.",
                          )}
                        </p>
                      </div>
                    )}

                    {/* Desde cuándo — y CON QUÉ DÍA DE SU CICLO */}
                    <div>
                      <label className="cg-eyebrow mb-1.5 block">
                        {t("ui.Schedule.primerDia", "Primer día")}
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
                              {t(
                                "ui.Schedule.eseDiaQueTurnoDeLaRotacionHace",
                                "Ese día, ¿qué turno de la rotación hace?",
                              )}
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
                    </>
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
                      className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-semibold"
                      type="button"
                      onClick={() =>
                        paso === 1
                          ? setPosEditor(null)
                          : set({ sfPaso: (paso - 1) as 1 | 2 })
                      }
                    >
                      {paso === 1
                        ? t("common.cancel", "Cancelar")
                        : t("ui.Schedule.atras", "Atrás")}
                    </button>
                    {paso < 3 ? (
                      <button
                        className="cg-btn-brand cg-focus rounded-full px-5 py-2 text-sm font-semibold transition-all disabled:opacity-40"
                        type="button"
                        disabled={
                          /* Rotativo sin un solo turno de trabajo no es un
                             ciclo: el generador no escribiría nada y el
                             sacafranco nacería con el mes vacío sin decirlo.
                             Se corta AQUÍ, en el paso que lo pregunta, y no al
                             final — donde ya no se ve qué hay que arreglar. */
                          paso === 2 &&
                          (posEditor.rotMode || "manual") === "rotativo" &&
                          sfDias + sfNoches < 1
                        }
                        onClick={() => set({ sfPaso: (paso + 1) as 2 | 3 })}
                      >
                        {t("ui.Schedule.siguiente", "Siguiente")}
                      </button>
                    ) : (
                      <button
                        className="cg-btn-brand cg-focus rounded-full px-5 py-2 text-sm font-semibold transition-all disabled:opacity-40"
                        disabled={
                          posSaving ||
                          marcadas.length === 0 ||
                          ((posEditor.rotMode || "manual") === "rotativo" &&
                            !!posEditor.guardId &&
                            sfDias + sfNoches < 1)
                        }
                        onClick={savePosition}
                      >
                        {posSaving ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : editando ? (
                          t("settings.mobileHub.saveChanges", "Guardar cambios")
                        ) : (
                          t("ui.Schedule.crearSacafranco", "Crear sacafranco")
                        )}
                      </button>
                    )}
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
                        ? t("ui.Schedule.editarPuesto", "Editar puesto")
                        : t("ui.Schedule.agregarPuesto", "Agregar puesto")}
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
                      {t("comun.nombre", "Nombre")}
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
                      {t("comun.tipo", "Tipo")}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        {
                          v: "fijo",
                          label: t("ui.Schedule.fijo", "Fijo"),
                          sub: t("ui.Schedule.trabajaSuRotacion", "trabaja su rotación"),
                        },
                        {
                          v: "sacafranco",
                          label: t("ui.PostSiteWizard.jornada.sacafranco", "Sacafranco"),
                          sub: t("ui.Schedule.cubreDescansos", "cubre descansos"),
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
                      {
                        label: t("ui.codeTones.diurno", "Diurno"),
                        sub: "07–19",
                        s: "07:00",
                        e: "19:00",
                      },
                      {
                        label: t("ui.codeTones.nocturno", "Nocturno"),
                        sub: "19–07",
                        s: "19:00",
                        e: "07:00",
                      },
                      {
                        label: t("ui.codeTones.veinticuatroHoras", "24 horas"),
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
                        {t("ui.StaffSchedule.entra", "Entra")}
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
                        {t("ui.StaffSchedule.sale", "Sale")}
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
                        {t("ui.Schedule.plazas", "Puestos")}
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
                  {/* ── EL CICLO DE ESTA PLAZA ────────────────────────────
                    Sólo al EDITAR: al crear todavía no hay a quién aplicárselo
                    y el ciclo lo pone el primer vigilante que se asigne (ver
                    guardAssignmentCreate). Aquí se cambia en sitio — nadie
                    pierde el puesto y sólo se rehacen los turnos futuros. */}
                  {posEditor.positionId ? (
                    <div>
                      <label
                        className="mb-1 block text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {t("ui.Schedule.cicloDeRotacion", "Ciclo de rotación")}
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          {
                            v: false,
                            label: t("ui.Schedule.elDeLaEstacion", "El de la estación"),
                            sub: estiloDeLaEstacion
                              ? estiloDeLaEstacion.name
                              : t("ui.Schedule.sinCiclo", "sin ciclo"),
                          },
                          {
                            v: true,
                            label: t("ui.Schedule.propio", "Propio"),
                            sub: t("ui.Schedule.soloEstePuesto", "sólo este puesto"),
                          },
                        ].map((o) => (
                          <button
                            key={String(o.v)}
                            className={`cg-focus rounded-xl border px-2 py-2 text-center transition-all ${!!posEditor.rotPropio === o.v ? "glass-brand" : "glass-flat"}`}
                            onClick={() => set({ rotPropio: o.v })}
                          >
                            <div className="text-xs font-semibold">
                              {o.label}
                            </div>
                            <div
                              className="truncate text-[10px]"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              {o.sub}
                            </div>
                          </button>
                        ))}
                      </div>
                      {posEditor.rotPropio ? (
                        <div
                          className="mt-2 space-y-2.5 rounded-xl px-3 py-2.5"
                          style={{ border: "1px solid var(--hairline)" }}
                        >
                          <NumberStepper
                            hint={t(
                              "ui.Schedule.seguidosAntesDeCambiarDeBloque",
                              "Seguidos, antes de cambiar de bloque",
                            )}
                            label={t("ui.Schedule.turnosDeDia", "Turnos de día")}
                            max={31}
                            min={0}
                            suffix="D"
                            value={rotD}
                            onChange={(v) => set({ rotDays: v })}
                          />
                          <NumberStepper
                            hint={t(
                              "ui.Schedule.elSegundoBloqueDelPuesto",
                              "El segundo bloque del puesto",
                            )}
                            label={t(
                              "ui.Schedule.turnosDeTardeONoche",
                              "Turnos de tarde o noche",
                            )}
                            max={31}
                            min={0}
                            suffix="T/N"
                            value={rotN}
                            onChange={(v) => set({ rotNights: v })}
                          />
                          <NumberStepper
                            hint={t(
                              "ui.Schedule.losQueLibraAlCerrarElCiclo",
                              "Los que libra al cerrar el ciclo",
                            )}
                            label={t("ui.Schedule.diasLibres", "Días libres")}
                            max={31}
                            min={0}
                            suffix="L"
                            value={rotL}
                            onChange={(v) => set({ rotRest: v })}
                          />
                          <div
                            className="flex items-center justify-between gap-2 pt-1 text-[11px]"
                            style={{
                              borderTop: "1px solid var(--hairline)",
                              color: "var(--ink-soft)",
                            }}
                          >
                            <span>{t("ui.Schedule.ciclo", "Ciclo")}</span>
                            <span className="font-semibold tabular-nums">
                              {rotLen > 0
                                ? t("ui.Schedule.cicloNombreNDias", {
                                    defaultValue: "{{nombre}} · {{count}} días",
                                    nombre: rotNombre,
                                    count: rotLen,
                                  })
                                : "—"}
                            </span>
                          </div>
                          {rotD + rotN < 1 ? (
                            <p
                              className="text-[11px]"
                              style={{ color: "var(--danger)" }}
                            >
                              {t(
                                "ui.Schedule.elCicloNecesitaAlMenosUnTurno",
                                "El ciclo necesita al menos un turno de trabajo.",
                              )}
                            </p>
                          ) : rotL === 0 ? (
                            <p
                              className="text-[11px]"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              {t(
                                "ui.Schedule.sinDescansoSeTrabajaTodosLosDias",
                                "Sin descanso: se trabaja todos los días y no hace falta sacafranco que releve.",
                              )}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div
                    className="rounded-xl px-3 py-2"
                    style={toneCard("ok", 8, 26)}
                  >
                    <p className="text-[11px]">
                      {t("ui.Schedule.jornadaDe", "Jornada de")}{" "}
                      <b>{durH % 1 === 0 ? durH : durH.toFixed(1)} h</b>
                      {eMin <= sMin
                        ? t(
                            "ui.Schedule.terminaAlDiaSiguienteParen",
                            " (termina al día siguiente)",
                          )
                        : ""}
                      .
                      {posEditor.positionId
                        ? t(
                            "ui.Schedule.losTurnosFuturosSeRehacen",
                            " Los turnos futuros se rehacen con estas horas; las asignaciones no se tocan.",
                          )
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
                    {t("common.cancel", "Cancelar")}
                  </button>
                  <button
                    className="cg-btn-brand cg-focus rounded-full px-5 py-2 text-sm font-semibold transition-all disabled:opacity-40"
                    disabled={
                      posSaving ||
                      /* Un ciclo propio sin ningún turno de trabajo no es un
                         ciclo: el generador no escribiría nada y la plaza se
                         quedaría con el mes vacío sin decirlo. */
                      (!!posEditor.rotPropio && rotD + rotN < 1)
                    }
                    onClick={savePosition}
                  >
                    {posSaving ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : posEditor.positionId ? (
                      t("common.save", "Guardar")
                    ) : (
                      t("ui.Schedule.agregar", "Agregar")
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
          // tz: civil day built at local midnight (a calendar date, not an instant).
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
                      {
                        label: t("ui.codeTones.diurno", "Diurno"),
                        sub: "07–19",
                        s: "07:00",
                        e: "19:00",
                      },
                      {
                        label: t("ui.codeTones.nocturno", "Nocturno"),
                        sub: "19–07",
                        s: "19:00",
                        e: "07:00",
                      },
                      {
                        label: t("ui.codeTones.veinticuatroHoras", "24 horas"),
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
                      <label className="cg-eyebrow mb-1.5 block">
                        {t("ui.ScheduleTimeline.inicio", "Inicio")}
                      </label>
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
                      <label className="cg-eyebrow mb-1.5 block">
                        {t("ui.ScheduleTimeline.fin", "Fin")}
                      </label>
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
                    {t("ui.ScheduleTimeline.duracion", "Duración:")}{" "}
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
                      t("ui.Schedule.cubrirPuesto", "Cubrir puesto")
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
          // tz: civil day built at local midnight (a calendar date, not an instant).
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
                  {t("ui.codeTones.libre", "Libre")}
                </span>
              );
            if (r.estado === "deTurno")
              return (
                <span
                  className="text-[10px]"
                  style={{ color: "var(--warn-text)" }}
                >
                  {t("ui.Schedule.deTurno", {
                    defaultValue: "De turno · {{detalle}}",
                    detalle: r.detalle,
                  })}
                </span>
              );
            if (r.estado === "ocupado")
              return (
                <span
                  className="text-[10px]"
                  style={{ color: "var(--ink-faint)" }}
                >
                  {t("ui.Schedule.cubreDetalle", {
                    defaultValue: "Cubre {{detalle}}",
                    detalle: r.detalle,
                  })}
                </span>
              );

            return (
              <span
                className="text-[10px]"
                style={{ color: "var(--bad-text)" }}
              >
                {t("ui.Schedule.ausente", {
                  defaultValue: "Ausente · {{detalle}}",
                  detalle: CODE_LABEL[r.detalle] ?? r.detalle,
                })}
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
                    {t("ui.PostSiteWizard.jornada.sacafranco", "Sacafranco")}
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
                    {t("ui.Schedule.marcarNovedad", "Marcar novedad…")}
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
            t("ui.Schedule.laCobertura", "la cobertura"),
          );
          const stDestino = stationsById.get(moveCover.stationId);
          const origen = diaDelTurno(moveCover.shift);
          const fmtDia = (v: string) =>
            // tz: civil day built at local midnight (a calendar date, not an instant).
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
                    {t("ui.Schedule.moverLaCoberturaDe", {
                      defaultValue: "Mover la cobertura de {{nombre}}",
                      nombre,
                    })}
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
                        {t("ui.Schedule.cambiaAlPuesto", "Cambia al puesto")}{" "}
                        <span
                          className="font-semibold"
                          style={{ color: "var(--ink)" }}
                        >
                          {stDestino
                            ? stationLabel(stDestino)
                            : t("ui.Schedule.destino", "destino")}
                        </span>
                        .
                      </div>
                    )}
                    <div className="mt-1" style={{ color: "var(--ink-faint)" }}>
                      {t(
                        "ui.Schedule.conservaSuHorario",
                        "Conserva su horario y las horas que se pagan.",
                      )}
                    </div>
                  </div>

                  <p
                    className="text-[12px]"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {nDias > 1 ? (
                      <>
                        {t(
                          "ui.Schedule.estaCoberturaSeAgregoJunto",
                          "Esta cobertura se agregó junto a otras: son",
                        )}{" "}
                        <span
                          className="font-semibold"
                          style={{ color: "var(--ink)" }}
                        >
                          {t("ui.Schedule.nDiasSeguidos", {
                            defaultValue: "{{n}} días seguidos",
                            n: nDias,
                          })}
                        </span>
                        {t("ui.Schedule.delAlQueMueves", {
                          defaultValue: ", del {{desde}} al {{hasta}}. ¿Qué mueves?",
                          desde: fmtDia(primero),
                          hasta: fmtDia(ultimo),
                        })}
                      </>
                    ) : (
                      t(
                        "ui.Schedule.esUnDiaSuelto",
                        "Es un día suelto: no hay más días que mover con él.",
                      )
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
                        t("ui.Schedule.moverLosNDias", {
                          defaultValue: "Mover los {{n}} días",
                          n: nDias,
                        })
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
                      t("ui.Schedule.moverSoloEsteDia", "Mover sólo este día")
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
                    ? t("ui.Schedule.editarSacafranco", "Editar sacafranco")
                    : assignMode === "single"
                      ? t("ui.Schedule.cubrirEsteDia", "Cubrir este día")
                      : puestoRota
                        ? t(
                            "ui.Schedule.asignarVigilanteALaRotacion",
                            "Asignar vigilante a la rotación",
                          )
                        : t(
                            "ui.Schedule.asignarVigilanteAlTurnoFijo",
                            "Asignar vigilante al turno fijo",
                          )}
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
                            ? t(
                                "ui.Schedule.rotaDiaYNoche",
                                "Rota día y noche según el patrón del puesto",
                              )
                            : esNoche
                              ? t(
                                  "ui.Schedule.turnoFijoDeNoche",
                                  "Turno fijo de NOCHE — siempre en este horario",
                                )
                              : t(
                                  "ui.Schedule.turnoFijoDeDia",
                                  "Turno fijo de DÍA — siempre en este horario",
                                )}
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
                        t("ui.Schedule.suPuestoActual", "su puesto actual")}
                    </span>{" "}
                    {t(
                      "ui.Schedule.susTurnosFuturosAlliSeEliminan",
                      "— sus turnos futuros allí se eliminan.",
                    )}
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
                      {
                        value: "rango",
                        label: t("ui.Schedule.variosDias", "Varios días"),
                      },
                      {
                        value: "rotation",
                        label: puestoRota
                          ? t("ui.ShiftAssignModal.rotacion", "Rotación")
                          : t("ui.Schedule.turnoFijo", "Turno fijo"),
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
                      ? t(
                          "ui.Schedule.ayudaModoUnDia",
                          "Un turno suelto para la fecha elegida. No entra en el horario del puesto.",
                        )
                      : assignMode === "rango"
                        ? `${t(
                            "ui.Schedule.ayudaModoRango",
                            "Un turno suelto por cada día del rango, con las mismas horas.",
                          )} ${
                            diasEntre(assignStartDate, assignEndDate) > 0
                              ? t("ui.Schedule.seCrearanNTurnos", {
                                  defaultValue: "Se crearán {{n}} turno(s).",
                                  n: diasEntre(assignStartDate, assignEndDate),
                                })
                              : t(
                                  "ui.Schedule.elUltimoDiaNoPuedeSerAnterior",
                                  "El último día no puede ser anterior al primero.",
                                )
                          }`
                        : puestoRota
                          ? t(
                              "ui.Schedule.ayudaModoRotacion",
                              "Entra en la rotación del puesto: se generan sus turnos y irá alternando día y noche. Tarda unos segundos.",
                            )
                          : t(
                              "ui.Schedule.ayudaModoFijo",
                              "Se queda en este horario todos sus días de trabajo, sin alternar. Tarda unos segundos.",
                            )}
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
                            ? t(
                                "ui.Schedule.yaTieneTurnoEseDiaSufijo",
                                " · ya tiene turno ese día",
                              )
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
                      {t(
                        "ui.Schedule.yaTieneTurnoEseDiaAviso",
                        "Ya tiene turno ese día: el nuevo reemplazará al que se solape.",
                      )}
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
                    ? t("ui.Schedule.diaQueCubre", "Día que cubre")
                    : assignMode === "rango"
                      ? t("comun.desde", "Desde")
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
                      {t("comun.hasta", "Hasta")}
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
                    : t(
                        "ui.Schedule.losTurnosSeGeneranDesdeEstaFecha",
                        "Los turnos se generan desde esta fecha (hora de la empresa).",
                      )}
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
                          {t(
                            "ui.Schedule.eseDiaQueTurnoDeLaRotacionHace",
                            "Ese día, ¿qué turno de la rotación hace?",
                          )}
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
                      rotationStylesById.get(String((estacionDelAsignado as any)?.rotationStyleId || "")) || null,
                    );
                    const lista = (
                      jornadas.length
                        ? jornadas
                        : jornadasPorTipo(
                            (estacionDelAsignado as any)?.scheduleType || "24h",
                            estacionDelAsignado as any,
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
                          {t("ui.Schedule.queTurnoCubre", "Qué turno cubre")}
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
                                  {b.etiqueta === "Diurno"
                                    ? t("ui.codeTones.diurno", "Diurno")
                                    : b.etiqueta === "Nocturno"
                                      ? t("ui.codeTones.nocturno", "Nocturno")
                                      : b.etiqueta === "24 horas"
                                        ? t("ui.codeTones.veinticuatroHoras", "24 horas")
                                        : b.etiqueta}
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
                      <label className="cg-eyebrow mb-1.5 block">
                        {t("ui.StaffSchedule.entra", "Entra")}
                      </label>
                      <input
                        className="cg-input cg-focus w-full px-3 py-2 font-mono text-sm tabular-nums"
                        type="time"
                        value={assignStartTime}
                        onChange={(e) => setAssignStartTime(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="cg-eyebrow mb-1.5 block">
                        {t("ui.StaffSchedule.sale", "Sale")}
                      </label>
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
                      : t(
                          "ui.Schedule.horasTomadasDelPuesto",
                          "Horas tomadas del puesto; puedes cambiarlas.",
                        )}
                    {assignMode === "rango"
                      ? t(
                          "ui.Schedule.lasMismasParaTodosLosDias",
                          " Las mismas para todos los días del rango.",
                        )
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
                            {rot?.name || t("ui.Schedule.elDelPuesto", "el del puesto")}
                          </span>{" "}
                          {t("ui.Schedule.seHeredaDelPuesto", "· se hereda del puesto.")}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <>
                      <div>
                        <label className="cg-eyebrow mb-1.5 block">
                          {t("ui.Schedule.suPatronDeRotacion", "Su patrón de rotación")}
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
                            {t(
                              "ui.Schedule.sinPatronPropioMesLibre",
                              "Sin patrón propio — mes libre, se cubre a mano",
                            )}
                          </option>
                          {rotationStyles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {nombreDeEstilo(r, t as Traductor)}
                              {ciclo(r) ? ` · ${ciclo(r)}` : ""}
                              {st?.rotationStyleId === r.id
                                ? t(
                                    "ui.Schedule.elDeEstaEstacionParen",
                                    " (el de esta estación)",
                                  )
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
                            ? t(
                                "ui.Schedule.seLeGeneranSusTurnosCorto",
                                "Se le generan sus turnos con este ciclo. Tarda unos segundos.",
                              )
                            : t(
                                "ui.Schedule.empiezaConElMesEnBlanco",
                                "Empieza con el mes en blanco: sus días se colocan arrastrándolos sobre los descansos, o con «Optimizar sacafrancos».",
                              )}
                        </p>
                      </div>

                      <div>
                        <label className="cg-eyebrow mb-1.5 block">
                          {t("ui.Schedule.estacionesQueCubre", "Estaciones que cubre")}
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
                              ? t("ui.Schedule.soloBuscaraDescansosEn", {
                                  defaultValue:
                                    "Sólo buscará descansos que cubrir en {{n}} estación(es).",
                                  n: assignCovered.length,
                                })
                              : t(
                                  "ui.Schedule.sinMarcarNingunaCubreTodas",
                                  "Sin marcar ninguna cubre TODAS las estaciones con puestos fijos.",
                                )}
                          </p>
                          {assignCovered.length > 0 && (
                            <button
                              className="cg-btn-ghost cg-focus shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                              type="button"
                              onClick={() => setAssignCovered([])}
                            >
                              {t("ui.ShiftTemplates.todas", "Todas")}
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
                  t("ui.Schedule.mover", "Mover")
                ) : assignEditing ? (
                  t("settings.mobileHub.saveChanges", "Guardar cambios")
                ) : assignMode === "single" ? (
                  t("ui.Schedule.cubrirElDia", "Cubrir el día")
                ) : (
                  t("ui.Schedule.asignarALaRotacion", "Asignar a la rotación")
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Configure Station Modal ─────────────────────────────────────── */}
      {/* ── ELEGIR PUESTO (sólo móvil) ──────────────────────────────────────
          Una lista de estaciones con lo que hace falta para decidir a cuál
          entrar: cuánta gente tiene y cuántas plazas le faltan por cubrir. Al
          tocar una se abre su asistente, el mismo del reloj en el escritorio,
          y desde su primer paso se asigna, se cambia o se quita gente. */}
      {elegirPuesto && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "oklch(0 0 0 / 0.55)" }}
          onClick={() => setElegirPuesto(false)}
        >
          <div
            className="glass-raised max-h-[80vh] w-full overflow-hidden rounded-t-2xl animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--hairline)" }}
            >
              <div>
                <h4 className="text-sm font-semibold">
                  {t("ui.Coverage.puestos", "Puestos")}
                </h4>
                <p
                  className="mt-0.5 text-[11px]"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {t(
                    "ui.Schedule.entraAUnoParaAsignar",
                    "Entra a uno para asignar, cambiar o quitar vigilantes",
                  )}
                </p>
              </div>
              <button
                className="cg-btn-ghost cg-focus rounded-lg p-1.5"
                onClick={() => setElegirPuesto(false)}
              >
                <X size={15} />
              </button>
            </div>
            <div className="max-h-[calc(80vh-72px)] overflow-y-auto p-2">
              {stations.map((st) => {
                const plazas = positionsByStation.get(String(st.id)) || [];
                const dentro = assignments.filter(
                  (a) =>
                    String(a.stationId) === String(st.id) &&
                    a.status === "active",
                ).length;
                const vacias = plazas.filter(
                  (p) =>
                    !assignments.some(
                      (a) =>
                        String(a.positionId) === String(p.id) &&
                        a.status === "active",
                    ),
                ).length;

                return (
                  <button
                    key={st.id}
                    className="cg-focus flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-[var(--glass-sunken)]"
                    type="button"
                    onClick={() => {
                      setElegirPuesto(false);
                      configureStation(st);
                    }}
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={tonePill(vacias ? "warn" : "ok", 14)}
                    >
                      <Shield size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {stationLabel(st)}
                      </span>
                      <span
                        className="block truncate text-[11px]"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {t("ui.Schedule.nVigilantes", {
                          defaultValue: "{{count}} vigilantes",
                          count: dentro,
                        })}
                        {vacias
                          ? t("ui.Schedule.nPlazasSinCubrir", {
                              defaultValue: " · {{count}} puestos sin cubrir",
                              count: vacias,
                            })
                          : t("ui.Schedule.completo", " · completo")}
                      </span>
                    </span>
                    <ChevronRight
                      size={16}
                      style={{ color: "var(--ink-faint)" }}
                    />
                  </button>
                );
              })}
              {stations.length === 0 && (
                <p
                  className="px-3 py-6 text-center text-[11px]"
                  style={{ color: "var(--ink-faint)" }}
                >
                  {t("ui.Schedule.noHayPuestosTodavia", "No hay estaciones todavía.")}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

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
              <div>
                <h4 className="text-sm font-semibold">
                  {stationLabel(configStation)}
                </h4>
                <p
                  className="mt-0.5 text-[11px]"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {cfgVigilantes.length
                    ? t("ui.Schedule.nVigilantesEnEstePuesto", {
                        defaultValue: "{{count}} vigilantes en este puesto",
                        count: cfgVigilantes.length,
                      })
                    : t(
                        "ui.Schedule.todaviaNoHayNadieAsignado",
                        "Todavía no hay nadie asignado",
                      )}
                </p>
              </div>
              <button
                className="cg-btn-ghost cg-focus rounded-lg p-1.5"
                onClick={() => setConfigStation(null)}
              >
                <X size={15} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Los tres pasos, igual que en el alta del sacafranco. */}
              <div className="flex items-center gap-1.5">
                {[
                  { n: 1 as const, t: t("ui.Schedule.pasoQuienes", "Quiénes") },
                  { n: 2 as const, t: t("ui.Schedule.pasoSuCiclo", "Su ciclo") },
                  { n: 3 as const, t: t("ui.Schedule.pasoSuJornada", "Su jornada") },
                ].map((x) => (
                  <button
                    key={x.n}
                    className={`cg-focus flex-1 rounded-lg px-2 py-1.5 text-center text-[10px] font-semibold transition-all ${configPaso === x.n ? "glass-brand" : "glass-flat"}`}
                    type="button"
                    onClick={() => setConfigPaso(x.n)}
                  >
                    <span className="tabular-nums">{x.n}</span> · {x.t}
                  </button>
                ))}
              </div>

              {/* ── PASO 1 · QUIÉNES ────────────────────────────────────────
                  El diálogo abría por el tipo de cobertura y no decía en ningún
                  momento quién está dentro. Se cambiaba el ciclo de un puesto
                  con tres personas trabajándolo sin verlas. */}
              {configPaso === 1 && (
                <div>
                  <label className="cg-eyebrow mb-1.5 block">
                    {t("ui.Schedule.vigilantesAsignados", "Vigilantes asignados")}
                  </label>
                  {cfgFilas.length === 0 ? (
                    <p
                      className="rounded-xl px-3 py-2 text-[11px]"
                      style={toneCard("warn", 8, 26)}
                    >
                      {t(
                        "ui.Schedule.estePuestoTodaviaNoTienePlazas",
                        "Esta estación todavía no tiene puestos. Créalos en el paso 3, eligiendo su jornada.",
                      )}
                    </p>
                  ) : (
                    <div
                      className="max-h-56 space-y-1 overflow-y-auto rounded-xl px-2 py-2"
                      style={{ border: "1px solid var(--hairline)" }}
                    >
                      {cfgFilas.map((f) => (
                        <div
                          key={f.key}
                          className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs"
                        >
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                            style={tonePill(
                              f.adhoc
                                ? "warn"
                                : !f.asignacion
                                  ? "neutral"
                                  : f.esRelevo
                                    ? "info"
                                    : "ok",
                              14,
                            )}
                          >
                            <Shield size={12} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div
                              className="truncate font-semibold"
                              style={
                                f.vigilante
                                  ? undefined
                                  : { color: "var(--ink-faint)" }
                              }
                            >
                              {f.vigilante || t("comun.sinAsignar", "Sin asignar")}
                            </div>
                            <div
                              className="truncate text-[10px]"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              {f.plaza}
                              {f.adhoc
                                ? t(
                                    "ui.Schedule.diaADiaSinDescansos",
                                    " · día a día, sin descansos",
                                  )
                                : f.ciclo
                                  ? ` · ${f.ciclo}`
                                  : t("ui.Schedule.sinCicloSufijo", " · sin ciclo")}
                            </div>
                          </div>
                          {/* ── QUITAR Y CAMBIAR ─────────────────────────
                              Ver quién está dentro sin poder tocarlo deja la
                              pregunta a medias. «Cambiar» reusa el formulario de
                              asignación con `moveFrom`: libera al de ahora y
                              pone al nuevo en la MISMA plaza, que es lo que
                              significa relevar. Los dos cierran este diálogo
                              porque abren el suyo. */}
                          {f.asignacion ? (
                            <div className="flex shrink-0 items-center gap-1">
                              {f.positionId && (
                                <button
                                  className="cg-btn-ghost cg-focus rounded-lg px-2 py-1 text-[10px] font-semibold"
                                  title={t(
                                    "ui.Schedule.ponerAOtroVigilanteEnEstaPlaza",
                                    "Poner a otro vigilante en este puesto",
                                  )}
                                  type="button"
                                  onClick={() => {
                                    const asg = f.asignacion;

                                    setConfigStation(null);
                                    openAssignForm(
                                      String(configStation.id),
                                      String(f.positionId),
                                      undefined,
                                      null,
                                      undefined,
                                      null,
                                      undefined,
                                      asg,
                                    );
                                  }}
                                >
                                  {t("ui.Schedule.cambiar", "Cambiar")}
                                </button>
                              )}
                              <button
                                className="cg-btn-ghost cg-focus rounded-lg p-1"
                                title={t(
                                  "ui.Schedule.quitarAEsteVigilanteDelPuesto",
                                  "Quitar a este vigilante del puesto",
                                )}
                                type="button"
                                onClick={async () => {
                                  const id = String(f.asignacion!.id);

                                  setConfigStation(null);
                                  await removeAssignment(id);
                                }}
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <button
                              className="cg-btn-ghost cg-focus shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold"
                              title={t(
                                "ui.Schedule.asignarUnVigilanteAEstaPlaza",
                                "Asignar un vigilante a este puesto",
                              )}
                              type="button"
                              onClick={() => {
                                setConfigStation(null);
                                openAssignForm(
                                  String(configStation.id),
                                  String(f.positionId),
                                );
                              }}
                            >
                              {t("ui.SupervisionSection.asignar", "Asignar")}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <p
                    className="mt-1 text-[10px]"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {t(
                      "ui.Schedule.elCicloDelPasoSiguiente",
                      "El ciclo del paso siguiente es el de la ESTACIÓN: lo heredan quienes no tengan uno propio.",
                    )}
                  </p>
                </div>
              )}

              {/* ── PASO 2 · SU CICLO ───────────────────────────────────── */}
              {configPaso === 2 && (
                <div>
                  <label className="cg-eyebrow mb-1.5 block">
                    {t("ui.Schedule.tipoDeTurno", "Tipo de turno")}
                  </label>
                  <Segmented<"rotativo" | "manual">
                    options={[
                      {
                        value: "rotativo",
                        label: t("ui.Schedule.turnoRotativo", "Turno rotativo"),
                      },
                      {
                        value: "manual",
                        label: t("ui.Schedule.turnoFijo", "Turno fijo"),
                      },
                    ]}
                    value={cfgRotMode}
                    onChange={setCfgRotMode}
                  />
                  {cfgRotMode === "rotativo" ? (
                    <div className="mt-2">
                      <label className="cg-eyebrow mb-1.5 block">
                        {t("ui.Schedule.estiloDeRotacion", "Estilo de rotación")}
                      </label>
                      <div
                        className="space-y-2.5 rounded-xl px-3 py-2.5"
                        style={{ border: "1px solid var(--hairline)" }}
                      >
                        <NumberStepper
                          hint={t(
                            "ui.Schedule.seguidosAntesDeCambiarDeBloque",
                            "Seguidos, antes de cambiar de bloque",
                          )}
                          label={t("ui.Schedule.turnosDeDia", "Turnos de día")}
                          max={31}
                          min={0}
                          suffix="D"
                          value={cfgDias}
                          onChange={setCfgDias}
                        />
                        <NumberStepper
                          hint={t(
                            "ui.Schedule.elSegundoBloqueDelPuesto",
                            "El segundo bloque del puesto",
                          )}
                          label={t(
                            "ui.Schedule.turnosDeTardeONoche",
                            "Turnos de tarde o noche",
                          )}
                          max={31}
                          min={0}
                          suffix="T/N"
                          value={cfgNoches}
                          onChange={setCfgNoches}
                        />
                        <NumberStepper
                          hint={t(
                            "ui.Schedule.losQueLibraAlCerrarElCiclo",
                            "Los que libra al cerrar el ciclo",
                          )}
                          label={t("ui.Schedule.diasLibres", "Días libres")}
                          max={31}
                          min={0}
                          suffix="L"
                          value={cfgLibres}
                          onChange={setCfgLibres}
                        />
                        <div
                          className="flex items-center justify-between gap-2 pt-1 text-[11px]"
                          style={{
                            borderTop: "1px solid var(--hairline)",
                            color: "var(--ink-soft)",
                          }}
                        >
                          <span>{t("ui.Schedule.ciclo", "Ciclo")}</span>
                          <span className="font-semibold tabular-nums">
                            {cfgCicloLen > 0
                              ? t("ui.Schedule.cicloNombreNDias", {
                                  defaultValue: "{{nombre}} · {{count}} días",
                                  nombre: cfgNombreCiclo,
                                  count: cfgCicloLen,
                                })
                              : "—"}
                          </span>
                        </div>
                        {cfgDias + cfgNoches < 1 ? (
                          <p
                            className="text-[11px]"
                            style={{ color: "var(--danger)" }}
                          >
                            {t(
                              "ui.Schedule.elCicloNecesitaAlMenosUnTurno",
                              "El ciclo necesita al menos un turno de trabajo.",
                            )}
                          </p>
                        ) : cfgLibres === 0 ? (
                          <p
                            className="text-[11px]"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {t(
                              "ui.Schedule.sinDescansoSeTrabajaTodosLosDias",
                              "Sin descanso: se trabaja todos los días y no hace falta sacafranco que releve.",
                            )}
                          </p>
                        ) : null}
                      </div>
                      {cfgCambiaElCiclo && cfgVigilantes.length > 0 && (
                        <p
                          className="mt-2 rounded-lg px-2 py-1.5 text-[10px]"
                          style={toneCard("ok", 8, 26)}
                        >
                          {t("ui.Schedule.seAplicaANVigilantes", {
                            defaultValue:
                              "Se aplica a {{count}} vigilantes y se rehacen sus turnos futuros.",
                            count: cfgVigilantes.length,
                          })}{" "}
                          <b>{t("ui.Schedule.nadiePierdeSuPuesto", "Nadie pierde su puesto.")}</b>
                        </p>
                      )}
                    </div>
                  ) : (
                    <p
                      className="mt-1.5 text-[10px]"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      {t(
                        "ui.Schedule.sinCicloDeEstacion",
                        "Sin ciclo de estación, cada vigilante necesita el suyo propio o su mes sale en blanco.",
                      )}
                    </p>
                  )}
                </div>
              )}

              {/* ── PASO 3 · SU JORNADA ─────────────────────────────────── */}
              {configPaso === 3 && (
              <>
              <label className="cg-eyebrow mb-2 block">
                {t("ui.Schedule.tipoDeCobertura")}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    value: "24h",
                    label: t("ui.Schedule.tipo24Horas", "24 Horas"),
                    desc: t(
                      "ui.Schedule.tipo24HorasDesc",
                      "Fijo 1 + Fijo 2 + Sacafranco",
                    ),
                  },
                  {
                    value: "12h-day",
                    label: t("ui.Schedule.tipo12hDiurno", "12h Diurno"),
                    desc: t(
                      "ui.Schedule.tipo12hDiurnoDesc",
                      "Fijo 1 (día) + Sacafranco",
                    ),
                  },
                  {
                    value: "12h-night",
                    label: t("ui.Schedule.tipo12hNocturno", "12h Nocturno"),
                    desc: t(
                      "ui.Schedule.tipo12hNocturnoDesc",
                      "Fijo 1 (noche) + Sacafranco",
                    ),
                  },
                  {
                    value: "custom",
                    label: t("ui.RotationStyleSelect.personalizado", "Personalizado"),
                    desc: t(
                      "ui.Schedule.tipoPersonalizadoDesc",
                      "Ventana propia, bloques, 24×24…",
                    ),
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
                      {t(
                        "ui.Schedule.plantilla24x24",
                        "Plantilla 24×24 (alternancia diaria)",
                      )}
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
                        {cfgWinMin === 1440
                          ? t(
                              "ui.Schedule.todaLaJornada1Fijo24h",
                              "Toda la jornada (1 fijo · 24h)",
                            )
                          : t(
                              "ui.Schedule.todaLaJornada1Fijo",
                              "Toda la jornada (1 fijo)",
                            )}
                      </option>
                      {[4, 6, 8, 12].map((h) => {
                        const fits =
                          cfgWinMin > 0 && cfgWinMin % (h * 60) === 0;
                        const k = fits ? cfgWinMin / (h * 60) : 0;

                        return (
                          <option key={h} disabled={!fits} value={String(h)}>
                            {h}h
                            {fits
                              ? t("ui.Schedule.flechaNFijos", {
                                  defaultValue: " → {{count}} fijos",
                                  count: k,
                                })
                              : t(
                                  "ui.Schedule.noDivideLaCobertura",
                                  " (no divide la cobertura)",
                                )}
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
                          ? t(
                              "ui.Schedule.sinPatronElegidoSeUsa11",
                              "Sin patrón elegido se usa 1-1: cada fijo trabaja su bloque completo y alterna con el siguiente, sin libres.",
                            )
                          : cfgAlternateOk
                            ? t("ui.Schedule.patronFijosAlternando", {
                                defaultValue:
                                  "Patrón {{trabajo}}-{{libres}}: {{porBloque}} fijos alternando por bloque, sin sacafranco. Total {{total}} fijos.",
                                trabajo: cfgRotWork,
                                libres: cfgRotCycle - cfgRotWork,
                                porBloque: cfgGuardsPerBlock,
                                total: cfgBlockCount * cfgGuardsPerBlock,
                              })
                            : t("ui.Schedule.elCicloDebeSerMultiplo", {
                                defaultValue:
                                  "El ciclo ({{ciclo}}) debe ser múltiplo de los días de trabajo ({{trabajo}}). Usa 1-1, 2-2, 3-3…",
                                ciclo: cfgRotCycle,
                                trabajo: cfgRotWork,
                              })}
                      </p>
                    )}
                    {cfgRestCoverage === "sacafranco" &&
                      cfgBlocksOk &&
                      cfgBlockCount > 1 && (
                        <p
                          className="mt-1.5 text-[11px]"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {t("ui.Schedule.hDeCoberturaEnBloques", {
                            defaultValue:
                              "{{horas}}h de cobertura en {{bloques}} bloques consecutivos de {{horasBloque}}h — {{bloques}} fijos + sacafranco.",
                            horas: cfgWinMin / 60,
                            bloques: cfgBlockCount,
                            horasBloque: Number(cfgBlockHours),
                          })}
                        </p>
                      )}
                  </div>
                </div>
              )}

              {/* ── EL CICLO SE ELIGE UNA SOLA VEZ ──────────────────────────
                  Las tres ruedas del paso 2 ya dicen el ciclo. Dejar aquí el
                  catálogo entero era el mismo dato en dos controles y la duda
                  de cuál manda.

                  Se queda SÓLO en «Personalizado», donde no sobra: ahí la
                  estación está partida en bloques y el patrón reparte DOS
                  tramos (mañana y tarde), algo que tres números no saben
                  decir. Y es el que alimenta la comprobación de la alternancia
                  sin sacafranco. */}
              {configType === "custom" ? (
                <RotationStyleSelect
                  etiquetaPrimerBloque={cfgPrimerTramo}
                  etiquetaSegundoBloque={cfgSegundoTramo}
                  scheduleType={configType}
                  value={configRotation}
                  onChange={setConfigRotation}
                  onStyleChange={setCfgRotStyle}
                  bloques={cfgBlockCount}
                />
              ) : (
                <p
                  className="rounded-xl px-3 py-2 text-[11px]"
                  style={toneCard("ok", 8, 26)}
                >
                  {t("ui.Schedule.suCicloEsElDelPaso2", "Su ciclo es el del paso 2:")}{" "}
                  <b>
                    {cfgRotMode === "rotativo"
                      ? t("ui.Schedule.cicloNombreNDias", {
                          defaultValue: "{{nombre}} · {{count}} días",
                          nombre: cfgNombreCiclo,
                          count: cfgCicloLen,
                        })
                      : t(
                          "ui.Schedule.turnoFijoSinCicloDeEstacion",
                          "turno fijo, sin ciclo de estación",
                        )}
                  </b>
                  .
                </p>
              )}
              </>
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
                className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-all"
                type="button"
                onClick={() =>
                  configPaso === 1
                    ? setConfigStation(null)
                    : setConfigPaso((configPaso - 1) as 1 | 2)
                }
              >
                {configPaso === 1
                  ? t("actions.cancel")
                  : t("ui.Schedule.atras", "Atrás")}
              </button>
              <div className="flex items-center gap-2">
                {/* Desde el paso 2 se puede guardar SÓLO el ciclo: es el cambio
                    más corriente y no toca la forma del puesto, así que no hay
                    por qué obligar a pasar por la jornada para llegar al botón. */}
                {configPaso === 2 && cfgCambiaElCiclo && (
                  <button
                    className="cg-btn-brand cg-focus rounded-full px-5 py-2 text-sm font-semibold transition-all disabled:opacity-40"
                    disabled={
                      configSaving ||
                      (cfgRotMode === "rotativo" && cfgDias + cfgNoches < 1)
                    }
                    onClick={saveStationConfig}
                  >
                    {configSaving ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : (
                      t("ui.Schedule.guardarElCiclo", "Guardar el ciclo")
                    )}
                  </button>
                )}
                {configPaso < 3 ? (
                  <button
                    className={`cg-focus rounded-full px-5 py-2 text-sm font-semibold transition-all disabled:opacity-40 ${configPaso === 2 && cfgCambiaElCiclo ? "cg-btn-ghost" : "cg-btn-brand"}`}
                    disabled={
                      configPaso === 2 &&
                      cfgRotMode === "rotativo" &&
                      cfgDias + cfgNoches < 1
                    }
                    type="button"
                    onClick={() => setConfigPaso((configPaso + 1) as 2 | 3)}
                  >
                    {t("ui.Schedule.siguiente", "Siguiente")}
                  </button>
                ) : (
                  <button
                    className="cg-btn-brand cg-focus rounded-full px-5 py-2 text-sm font-semibold transition-all disabled:opacity-40"
                    disabled={configSaving}
                    onClick={saveStationConfig}
                  >
                    {configSaving ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : (
                      t("common.save", "Guardar")
                    )}
                  </button>
                )}
              </div>
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
                  <h4 className="text-sm font-semibold">
                    {t("ui.Schedule.quePasoEseDia", "Qué pasó ese día")}
                  </h4>
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
                      {t("ui.Schedule.turnoRegistrado", "Turno registrado")}
                      {stTurno
                        ? t("ui.Schedule.enEstacion", {
                            defaultValue: " en {{estacion}}",
                            estacion: stationLabel(stTurno),
                          })
                        : ""}
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
                      ? t(
                          "ui.Schedule.vPmYFDejanElDiaMarcado",
                          "V, PM y F dejan el día marcado así en la hoja de asistencia (Nómina) y abren el hueco en Cobertura. El turno se conserva como constancia de que estaba programado — «Deshacer» lo devuelve.",
                        )
                      : t("ui.Schedule.marcaLoQuePasoEseDia", "Marca lo que pasó ese día.")}
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
                        {t("ui.Schedule.deshacerVolverASuTurno", {
                          defaultValue: "Deshacer — volver a su turno ({{codigo}})",
                          codigo: CODE_LABEL[existing.type] || existing.type,
                        })}
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
                        {t(
                          "ui.Schedule.editarEsteTurnoHorasYEstacion",
                          "Editar este turno (horas y estación)…",
                        )}
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
                        {t("ui.Schedule.eliminarEsteTurno", "Eliminar este turno")}
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
            rotationStylesById.get(String((estacionDestino as any)?.rotationStyleId || "")) || null,
          );
          const turnos = (
            deLasPlazas.length
              ? deLasPlazas
              : jornadasPorTipo(
                  (estacionDestino as any)?.scheduleType || "24h",
                  estacionDestino as any,
                )
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
                    <h4 className="text-sm font-semibold">
                      {t("ui.Schedule.editarElTurno", "Editar el turno")}
                    </h4>
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
                    <label className="cg-eyebrow mb-1.5 block">
                      {t("ui.Schedule.estacion", "Estación")}
                    </label>
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
                        {t(
                          "ui.Schedule.elTurnoSeMueveDeEstacion",
                          "El turno se mueve de estación. Deja de contar como cobertura de su puesto anterior.",
                        )}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="cg-eyebrow mb-1.5 block">
                      {t("comun.turno", "Turno")}
                    </label>
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
                              {b.etiqueta === "Diurno"
                                ? t("ui.codeTones.diurno", "Diurno")
                                : b.etiqueta === "Nocturno"
                                  ? t("ui.codeTones.nocturno", "Nocturno")
                                  : b.etiqueta === "24 horas"
                                    ? t("ui.codeTones.veinticuatroHoras", "24 horas")
                                    : b.etiqueta}
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
                        <label className="cg-eyebrow mb-1 block">
                          {t("ui.StaffSchedule.entra", "Entra")}
                        </label>
                        <input
                          className="cg-input cg-focus w-full px-2 py-2 font-mono text-sm tabular-nums"
                          type="time"
                          value={shiftEdit.start}
                          onChange={(e) => set({ start: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="cg-eyebrow mb-1 block">
                          {t("ui.StaffSchedule.sale", "Sale")}
                        </label>
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
                      {t("ui.Schedule.jornadaDe", "Jornada de")}{" "}
                      <b>{durH % 1 === 0 ? durH : durH.toFixed(1)} h</b>
                      {eMin <= sMin
                        ? t(
                            "ui.Schedule.terminaAlDiaSiguienteParen",
                            " (termina al día siguiente)",
                          )
                        : ""}
                      .
                    </p>
                  </div>

                  {shiftEdit.shift.positionId && (
                    <div
                      className="rounded-xl px-3 py-2"
                      style={toneCard("warn", 10, 26)}
                    >
                      <p className="text-[11px]">
                        {t(
                          "ui.Schedule.esteTurnoLoGeneroLaRotacion",
                          "Este turno lo generó la rotación. El cambio se queda hasta que se reoptimice o se reasigne el puesto; para que no vuelva, corrige las horas del puesto en la cabecera de la estación.",
                        )}
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
                    {t("common.delete", "Eliminar")}
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-semibold"
                      disabled={shiftEditSaving}
                      onClick={() => setShiftEdit(null)}
                    >
                      {t("common.cancel", "Cancelar")}
                    </button>
                    <button
                      className="cg-btn-brand cg-focus rounded-full px-5 py-2 text-sm font-semibold transition-all disabled:opacity-40"
                      disabled={shiftEditSaving}
                      onClick={saveShiftEdit}
                    >
                      {shiftEditSaving ? (
                        <Loader2 className="animate-spin" size={14} />
                      ) : (
                        t("common.save", "Guardar")
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

    </AppLayout>
  );
}
