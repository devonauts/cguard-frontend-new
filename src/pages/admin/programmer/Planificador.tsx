import { usePuede } from "@/hooks/usePuede";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CalendarRange,
  CalendarX,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MoreHorizontal,
  Repeat,
  SlidersHorizontal as Ajustes,
  UserMinus,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  UserPlus,
  Undo2,
  Wand2,
} from "lucide-react";
import { Link } from "react-router-dom";
import ShiftAssignModal from "@/pages/admin/post-sites/station-detail/components/ShiftAssignModal";
import AgregarSacafrancoModal from "@/components/schedule/AgregarSacafrancoModal";
import CambiarVigilanteModal from "@/components/schedule/CambiarVigilanteModal";
import EditarAsignacionModal, {
  type AsignacionCruda,
} from "@/components/schedule/EditarAsignacionModal";
import { toast } from "sonner";

import AppLayout from "@/layouts/app-layout";
import {
  PageContainer,
  PageHeader,
  StatusBadge,
  EmptyState,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiService } from "@/services/api/apiService";
import {
  hoyEnLaEmpresa,
  instanteEnLaEmpresa,
  sumaDias,
  zonaDeLaEmpresa,
} from "@/lib/horaDeLaEmpresa";
import { localeActual } from "@/lib/localeActual";
import {
  FRANCO,
  LIBRE,
  acomodar,
  candidatos,
  clave,
  copiar,
  cubrirTodo,
  diaPasado,
  diasTrabajados,
  esSacafranco,
  etiqueta,
  falta,
  fijosDe,
  horasSemana,
  impedimento,
  limpiar,
  partir,
  pide,
  poner,
  propio,
  propios,
  quitar,
  resumen,
  seguidos,
  turnoDe,
  ventanaDelMotor,
  type Franja,
  type Persona,
  type Plan,
  type Puesto,
} from "@/lib/planificador/motor";
import { planDesdeHorarioReal, type PlanReal } from "@/lib/planificador/real";
import {
  contextoEnLaEmpresa,
  planificarPublicacion,
  type Publicacion,
} from "@/lib/planificador/publicar";
import {
  baseParaAbrir,
  borradorCaducado,
  claveDelBorrador,
  estadoDelBorrador,
  firmaDe,
} from "@/lib/planificador/borrador";
import { rebasePlan, touchedBy, touchedByCalls } from "@/lib/planificador/rebase";
import {
  DraftConflict,
  descartarBorradorDelServidor,
  guardarBorradorEnElServidor,
  leerBorradorDelServidor,
  publicarEnElServidor,
  seguirEditando,
  type Conflict,
  type Editor,
  type Publicado,
} from "@/lib/planificador/servidor";
import { useFrenoAlSalir } from "@/lib/useFrenoAlSalir";
import { confirmDialog } from "@/components/ui/confirmDialog";
import HorarioModos from "./HorarioModos";
import {
  indiceDeMarcas,
  juntarCambios,
  queCambio,
  textoDeBorrador,
  type AvisoDeBorrador,
  type CambioEnVivo,
  type IndiceDeMarcas,
} from "@/lib/planificador/avisoEnVivo";

/**
 * TURNOS › HORARIO › BORRADOR (antes «Planificador»)
 *
 * Una hoja para ARMAR el horario como borrador: qué pide cada puesto, qué
 * rotación lleva cada persona y quién cubre lo que falta. Abre con la operación
 * real (la lee de `scheduler/overview`) y nada llega al horario real hasta
 * «Publicar».
 *
 * Fase 2 (2026-10-31): el borrador se guarda en el SERVIDOR, compartido por
 * quienes editan ese horario (se ve quién más lo tiene abierto); si el horario
 * real o el borrador cambian debajo, se combinan (`rebase.ts`); y «Publicar»
 * aplica todo de una vez en el servidor o nada (`servidor.ts`).
 *
 * Toda la lógica vive en `lib/planificador/motor` (con sus mil casos); este
 * archivo sólo pinta y traduce toques en llamadas al motor.
 */

/** Old browsers kept the draft in localStorage: forget it, the server has it now. */
function olvidarBorradorDelNavegador(tenantId: string) {
  try {
    window.localStorage.removeItem(claveDelBorrador(tenantId));
  } catch {
    /* blocked storage: nothing to forget */
  }
}

/** Server-side draft bookkeeping (not React state: saves read it synchronously). */
interface EnElServidor {
  version: number;
  /** Server time just before the live read the draft is diffed against. */
  baseAt: string | null;
  /** The plan last known to be on the server: the base when merging a 409. */
  guardado: Plan | null;
}

type Hoja =
  | { tipo: "hueco"; k: string }
  | { tipo: "cobertura"; puesto: string }
  | { tipo: "rotacion"; persona: string }
  | { tipo: "fijos"; persona: string }
  | { tipo: "ausencia"; persona: string }
  | { tipo: "reglas" }
  | { tipo: "publicar" }
  | null;

const FRANJAS_EXTRA: Record<string, Franja> = {
  D: { id: "D", nombre: "Diurna", ini: 420, fin: 1140 },
  N: { id: "N", nombre: "Nocturna", ini: 1140, fin: 420 },
  M8: { id: "M8", nombre: "Mañana", ini: 360, fin: 840 },
  T8: { id: "T8", nombre: "Tarde", ini: 840, fin: 1320 },
  N8: { id: "N8", nombre: "Noche", ini: 1320, fin: 360 },
  X24: { id: "X24", nombre: "24 horas", ini: 420, fin: 420 },
};
const siete = (n: number) => [n, n, n, n, n, n, n];
const COBERTURAS: Array<{
  id: string;
  nombre: string;
  detalle: string;
  franjas: string[];
  pide: Record<string, number[]>;
}> = [
  {
    id: "24h",
    nombre: "24 horas",
    detalle: "1 de día y 1 de noche, todos los días",
    franjas: ["D", "N"],
    pide: { D: siete(1), N: siete(1) },
  },
  {
    id: "24h2",
    nombre: "24 horas reforzado",
    detalle: "2 de día y 1 de noche, todos los días",
    franjas: ["D", "N"],
    pide: { D: siete(2), N: siete(1) },
  },
  {
    id: "dia",
    nombre: "Sólo de día",
    detalle: "1 de día, todos los días",
    franjas: ["D"],
    pide: { D: siete(1) },
  },
  {
    id: "noche",
    nombre: "Sólo de noche",
    detalle: "1 de noche, todos los días",
    franjas: ["N"],
    pide: { N: siete(1) },
  },
  {
    id: "lv",
    nombre: "Día, lunes a viernes",
    detalle: "1 de día; sábado y domingo cerrado",
    franjas: ["D"],
    pide: { D: [1, 1, 1, 1, 1, 0, 0] },
  },
  {
    id: "3x8",
    nombre: "Tres turnos de 8 horas",
    detalle: "Mañana, tarde y noche, 1 en cada uno",
    franjas: ["M8", "T8", "N8"],
    pide: { M8: siete(1), T8: siete(1), N8: siete(1) },
  },
  {
    id: "24x24",
    nombre: "Turno de 24 horas",
    detalle: "1 persona el día entero (24×24, 24×48)",
    franjas: ["X24"],
    pide: { X24: siete(1) },
  },
];

const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const horario = (f?: Franja) => (f ? `${hhmm(f.ini)}–${hhmm(f.fin)}` : "");
/* La letra de una franja es su TRAMO por la hora de entrada (D / T / N, «24»
   si es el día entero), igual que en el formulario del puesto. */
const letra = (f?: Franja) =>
  !f
    ? "?"
    : f.tramo
      ? f.tramo
      : f.id === "D"
        ? "D"
        : f.id === "N"
          ? "N"
          : f.ini === f.fin
            ? "24"
            : f.ini >= 1080 || f.ini < 300
              ? "N"
              : f.ini >= 720
                ? "T"
                : "D";
const esNoche = (f?: Franja) => letra(f) === "N";
const esTarde = (f?: Franja) => letra(f) === "T";
const corto = (n: string) => {
  const a = n.trim().split(/\s+/);

  return a.length > 1 ? `${a[0]} ${a[1].charAt(0)}.` : a[0];
};

/** Colores de una celda según la franja: día cálido, noche fría. */
function tono(f?: Franja): React.CSSProperties {
  return esNoche(f)
    ? {
        background: "color-mix(in oklab, var(--brand) 18%, transparent)",
        color: "var(--brand-text)",
      }
    : esTarde(f)
      ? {
          background: "color-mix(in oklab, var(--warn) 40%, var(--brand) 12%)",
          color: "var(--ink)",
        }
      : {
          background: "color-mix(in oklab, var(--warn) 22%, transparent)",
          color: "var(--warn-text, var(--ink))",
        };
}
const ROJO: React.CSSProperties = {
  background: "color-mix(in oklab, var(--bad) 14%, transparent)",
  color: "var(--bad-text)",
};
const VERDE: React.CSSProperties = {
  background: "color-mix(in oklab, var(--ok) 16%, transparent)",
  color: "var(--ok-text, var(--ok))",
};
const AMBAR: React.CSSProperties = {
  background: "color-mix(in oklab, var(--warn) 20%, transparent)",
  color: "var(--warn-text, var(--ink))",
};
const GRIS: React.CSSProperties = {
  background: "var(--glass-sunken)",
  color: "var(--ink-soft)",
};

/** El lunes de la semana de `dia` (YYYY-MM-DD), sin pasar por la zona del navegador. */
function lunesDe(dia: string): string {
  const [y, m, d] = dia.split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;

  return sumaDias(dia, -dow);
}

/* LA VENTANA DE LA HOJA: diez días hacia atrás y seis semanas hacia delante
   (un mes y pico) desde el lunes de la semana activa. Es lo que hace la
   mayoría de tableros de dotación: una semana de foco, el mes a la vista y
   un poco de margen a los lados para ver de dónde viene y a dónde va cada
   rotación. El motor trabaja sobre esta misma ventana. */
const ANTES = 10;
const DESPUES = 42;

export default function Planificador() {
  const { t } = useTranslation();
  // Publishing and live changes need station edit rights (lib/reglasDeAcciones).
  const editarPlan = usePuede("turnos.publicarPlanificador");
  const tenantId = localStorage.getItem("tenantId") || "";
  /* Day 0 of the plan. This week's Monday, or the Monday the shared draft was
     made on (up to two weeks back) so its day indexes keep their dates. */
  const [base, setBase] = useState(() => lunesDe(hoyEnLaEmpresa()));
  const baseRef = useRef(base);

  baseRef.current = base;
  const hoyIdx = useMemo(() => {
    const [y, m, d] = hoyEnLaEmpresa().split("-").map(Number);
    const [by, bm, bd] = base.split("-").map(Number);

    return Math.round(
      (Date.UTC(y, m - 1, d) - Date.UTC(by, bm - 1, bd)) / 86_400_000,
    );
  }, [base]);

  const [plan, setPlanEstado] = useState<Plan | null>(null);
  // El plan vigente, también fuera del estado: los botones necesitan el
  // RESULTADO de un cambio en el acto (cuántos turnos cubrió, si el acomodo
  // mejoró) para decírselo a quien lo pulsó. Dentro de un actualizador de
  // estado ese resultado llega tarde — el aviso salía antes que la cuenta y
  // decía «no hay nadie libre» habiendo cubierto cinco turnos.
  const planRef = useRef<Plan | null>(null);
  const setPlan = (p: Plan | null) => {
    planRef.current = p;
    setPlanEstado(p);
  };
  const [parecido, setParecido] = useState<number | null>(null);
  /** Lo leído del servidor, tal cual: contra esto se calcula qué publicar. */
  const [leido, setLeido] = useState<PlanReal | null>(null);
  const [cargando, setCargando] = useState(true);
  const [semana, setSemana] = useState(0);
  const [cambios, setCambios] = useState(0);
  // `?busca=` llega desde la puesta en marcha de un cliente: abre ya filtrado.
  const [busca, setBusca] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("busca") || "";
    } catch {
      return "";
    }
  });
  const [soloHuecos, setSoloHuecos] = useState(false);
  const [hoja, setHoja] = useState<Hoja>(null);
  const [pensando, setPensando] = useState(false);
  const pila = useRef<string[]>([]);
  /* EL BORRADOR VIVE EN EL SERVIDOR, compartido por quienes editan este
     horario. `firmaRef` es la huella del horario real leído; `srvRef`, lo que
     el servidor tiene (versión, desde cuándo vale la lectura, último plan
     guardado). Se combina, nunca se pisa: ver `rebase.ts`. */
  const firmaRef = useRef("");
  const srvRef = useRef<EnElServidor>({ version: 0, baseAt: null, guardado: null });
  /** Live edits on what this draft changes (phase 5): banner + marked cells. */
  const [enVivo, setEnVivo] = useState<CambioEnVivo[]>([]);
  /** The plan as the draft was opened, untouched: the autosave skips it. */
  const planAbiertoRef = useRef<Plan | null>(null);
  const leidoRef = useRef<PlanReal | null>(null);
  const cambiosRef = useRef(0);

  cambiosRef.current = cambios;
  /** Who else has this draft open (heartbeat every 30 s). */
  const [editores, setEditores] = useState<Editor[]>([]);
  /** null = nothing to save · «pendiente» = edited, not on the server yet. */
  const [guardado, setGuardado] = useState<
    null | "pendiente" | "guardando" | "guardado" | "error"
  >(null);
  /** Filters: one station, one shift type. */
  const [soloPuesto, setSoloPuesto] = useState("");
  const [soloFranja, setSoloFranja] = useState("");
  const d0 = semana * 7;
  /* LA REJILLA ES UNA HOJA QUE SE DESPLAZA: se pintan tres semanas seguidas
     (la anterior, la de la vista y la siguiente) y se mueve a izquierda y
     derecha, con hoy marcado. Los botones de semana cambian la ventana del
     motor y desplazan la hoja hasta su lunes. */
  const diasVista = useMemo(
    () => Array.from({ length: ANTES + DESPUES }, (_, i) => d0 - ANTES + i),
    [d0],
  );
  const rejillaRef = useRef<HTMLDivElement | null>(null);
  const ANCHO_DIA = 104;

  useEffect(() => {
    const el = rejillaRef.current;

    if (!el) return;
    el.scrollTo({ left: ANTES * ANCHO_DIA, behavior: "smooth" });
  }, [semana, cargando]);

  /**
   * Read the live schedule and lay the draft on top of it.
   *
   * `conservarLocal` (the default): my edits not yet on the server travel
   * with me — a direct change or a reload no longer throws the draft away.
   * Whatever moved underneath (the live schedule, or someone else's save of
   * the shared draft) is merged three-way; only what both sides changed is
   * listed, and mine is kept.
   */
  const cargar = useCallback(
    async (opciones?: { conservarLocal?: boolean }) => {
      if (!tenantId) return;
      const conservarLocal = opciones?.conservarLocal !== false;

      setCargando(true);
      try {
        const local =
          conservarLocal &&
          planRef.current &&
          leidoRef.current &&
          cambiosRef.current > 0
            ? { original: leidoRef.current.plan, plan: planRef.current }
            : null;
        // The server clock BEFORE the live read: a change after it that the
        // read missed is caught by the publish check, never silently undone.
        const srv = await leerBorradorDelServidor(tenantId);
        let draft = srv.draft;

        if (draft && borradorCaducado(draft.updatedAt) && !local) {
          await descartarBorradorDelServidor(tenantId, draft.version).catch(
            () => undefined,
          );
          toast.message(
            t(
              "ui.Planificador.borradorViejo",
              "Había un borrador sin publicar de hace más de una semana; se descartó.",
            ),
          );
          draft = null;
        }
        const lunes = lunesDe(hoyEnLaEmpresa());
        const b = local
          ? baseRef.current
          : baseParaAbrir(draft?.base || null, lunes);

        if (draft && !local && draft.base && draft.base !== b) {
          // Made on a Monday too far back to line its days up: start over.
          await descartarBorradorDelServidor(tenantId, draft.version).catch(
            () => undefined,
          );
          toast.message(
            t(
              "ui.Planificador.borradorOtraSemana",
              "El borrador sin publicar era de otra semana y ya no encaja en el calendario; se descartó.",
            ),
          );
          draft = null;
        }
        if (draft?.liveChanges?.length) {
          const leidoEn = draft.baseAt || "";
          const nuevos = draft.liveChanges.filter((c) => !leidoEn || c.at > leidoEn);

          if (nuevos.length) setEnVivo((prev) => juntarCambios(prev, nuevos));
        }
        if (b !== baseRef.current) {
          baseRef.current = b;
          setBase(b);
        }
        const hoyB = (() => {
          const [y, m, d] = hoyEnLaEmpresa().split("-").map(Number);
          const [by, bm, bd] = b.split("-").map(Number);

          return Math.round(
            (Date.UTC(y, m - 1, d) - Date.UTC(by, bm - 1, bd)) / 86_400_000,
          );
        })();
        const semanaB = Math.max(0, Math.floor(hoyB / 7));
        const ventana = ventanaDelMotor(semanaB * 7, hoyB, ANTES, DESPUES);
        const [ov, rot]: any[] = await Promise.all([
          ApiService.get(
            `/tenant/${tenantId}/scheduler/overview?startDate=${sumaDias(b, -ANTES)}&endDate=${sumaDias(b, 59)}`,
          ),
          ApiService.get(`/tenant/${tenantId}/rotation-styles?includeArchived=1`),
        ]);
        const r = planDesdeHorarioReal(
          ov?.data || ov || {},
          rot?.rows || rot?.data?.rows || [],
          b,
          zonaDeLaEmpresa(),
          60,
          Date.now(),
        );

        limpiar(r.plan, ...ventana);
        pila.current = [];
        leidoRef.current = { ...r, plan: copiar(r.plan) };
        setLeido(leidoRef.current);
        {
          const lista: any[] = (ov?.data || ov || {}).assignments || [];
          const m: Record<string, AsignacionCruda> = {};

          for (const a of lista) if (a?.id) m[String(a.id)] = a;
          setCrudas(m);
        }
        const firma = firmaDe(r.plan);
        const antes = srvRef.current;

        firmaRef.current = firma;
        olvidarBorradorDelNavegador(tenantId);

        // What travels onto the fresh read: my edits (merged first with a
        // newer shared draft, if someone saved meanwhile), or the shared draft.
        let llevar: { original: Plan | null; plan: Plan } | null = null;
        const choques: string[] = [];

        if (local) {
          if (draft && draft.version !== antes.version && draft.plan) {
            const m = rebasePlan(
              antes.guardado ?? local.original,
              local.plan,
              draft.plan,
            );

            choques.push(...m.conflicts);
            llevar = { original: draft.original ?? local.original, plan: m.plan };
            toast.message(
              t("ui.Planificador.otroGuardo", {
                defaultValue:
                  "{{quien}} también cambió el borrador; se juntaron sus cambios con los tuyos.",
                quien:
                  draft.updatedBy ||
                  t("ui.Planificador.otraPersona", "Otra persona"),
              }),
            );
          } else llevar = local;
        } else if (draft?.plan) {
          llevar = { original: draft.original, plan: draft.plan };
          toast.message(
            t("ui.Planificador.borradorAbierto", {
              defaultValue:
                "Se abrió el borrador sin publicar (guardado por {{quien}}). Publícalo o descártalo.",
              quien: draft.updatedBy || "—",
            }),
          );
        }
        let plan = r.plan;
        let toques = 0;

        if (llevar) {
          toques = Math.max(
            1,
            local ? cambiosRef.current : draft?.touches || 1,
          );
          if (llevar.original && firmaDe(llevar.original) === firma)
            plan = llevar.plan;
          else {
            const m = rebasePlan(llevar.original ?? r.plan, llevar.plan, r.plan);

            plan = m.plan;
            limpiar(plan, ...ventana);
            choques.push(...m.conflicts, ...m.dropped);
            if (!m.conflicts.length && !m.dropped.length)
              toast.message(
                t(
                  "ui.Planificador.realCambio",
                  "El horario real cambió debajo del borrador; tus cambios siguen encima de lo nuevo.",
                ),
              );
          }
        }
        // What already happened comes from the live read, never from a saved
        // draft: a day that ended since the draft was saved is drawn as it was.
        if (plan !== r.plan) {
          const hecho = new Map(r.plan.personas.map((x) => [x.id, x.pasado]));

          for (const x of plan.personas) {
            const h = hecho.get(x.id);

            if (h) x.pasado = h;
            else delete x.pasado;
          }
          limpiar(plan, ...ventana);
        }
        if (choques.length)
          toast.warning(
            t("ui.Planificador.choques", {
              defaultValue:
                "Esto lo cambiaron tú y otra persona a la vez; se quedó tu versión: {{lista}}",
              lista: [...new Set(choques)].slice(0, 6).join(", "),
            }),
            { duration: 12000 },
          );
        srvRef.current = {
          version: srv.draft && draft ? draft.version : 0,
          baseAt: srv.now,
          guardado: draft?.plan ?? null,
        };
        setEditores(srv.editors);
        setPlan(plan);
        setParecido(r.comparados ? r.coincidencia : null);
        setCambios(toques);
        cambiosRef.current = toques;
        setSemana(semanaB);
        // Opening a draft writes nothing: only my own unsaved edits, or a
        // rebase that had to drop or override something, are saved (QA: every
        // open sent a PUT, which also cleared the draft's live-change marks).
        const guardarAlAbrir = !!llevar && (!!local || choques.length > 0);

        planAbiertoRef.current = guardarAlAbrir ? null : plan;
        setGuardado(llevar ? (guardarAlAbrir ? "pendiente" : "guardado") : null);
      } catch {
        toast.error(
          t("ui.Planificador.noSePudoCargar", "No se pudo cargar el horario."),
        );
      } finally {
        setCargando(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tenantId, t],
  );

  // Once per company: `cargar` changes identity when the language loads, and
  // reading twice showed every notice twice.
  useEffect(() => {
    void cargar({ conservarLocal: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  /** Todo cambio pasa por aquí: copia, aplica, limpia y guarda para deshacer. */
  const cambiar = useCallback(
    (fn: (p: Plan) => void, dia?: { persona: string; d: number }) => {
      const actual = planRef.current;

      if (!actual) return;
      /* A day that already happened stays as it happened: clicking it is not
         an edit, so nothing is saved or counted (QA 2026-11-02, N11). */
      if (dia && diaPasado(actual, dia.persona, dia.d, hoyIdx)) {
        toast.message(
          t(
            "ui.Planificador.pasadoNoSeCambia",
            "Lo que ya pasó no se cambia desde el borrador: ese día se queda como fue.",
          ),
          { id: "planificador-pasado" },
        );

        return;
      }
      pila.current.push(JSON.stringify(actual));
      if (pila.current.length > 40) pila.current.shift();
      const p = copiar(actual);

      fn(p);
      limpiar(p, ...ventanaDelMotor(d0, hoyIdx, ANTES, DESPUES));
      setPlan(p);
      setCambios((n) => n + 1);
    },
    [d0, hoyIdx, t],
  );
  const deshacer = () => {
    const s = pila.current.pop();

    if (!s) return;
    setPlan(JSON.parse(s));
    setCambios((n) => Math.max(0, n - 1));
  };
  const irA = (s: number) => {
    setSemana(s);
    // Los fijos se calculan para la semana a la vista; al moverse, se rehacen ahí.
    const actual = planRef.current;

    if (!actual) return;
    const p = copiar(actual);

    limpiar(p, ...ventanaDelMotor(s * 7, hoyIdx, ANTES, DESPUES));
    setPlan(p);
  };

  const r = useMemo(
    () => (plan ? resumen(plan, d0, d0 + 7) : null),
    [plan, d0],
  );
  // Lo mismo para las tres semanas a la vista: los rótulos de cada columna.
  const rv = useMemo(
    () => (plan ? resumen(plan, d0 - ANTES, d0 + DESPUES) : null),
    [plan, d0],
  );
  // Qué habría que publicar AHORA. No es el contador de toques: lo que los
  // sacafrancos fijos cubren solos al cargar también es nuevo para el horario.
  const contextoDePublicacion = useCallback(
    () =>
      contextoEnLaEmpresa(
        tenantId,
        base,
        hoyIdx,
        DESPUES,
        (dia, h, m) => instanteEnLaEmpresa(dia, h, m),
        Date.now(),
      ),
    [tenantId, base, hoyIdx],
  );
  const publicacion = useMemo(
    () =>
      plan && leido
        ? planificarPublicacion(
            leido.plan,
            plan,
            leido.enlace,
            contextoDePublicacion(),
          )
        : null,
    [plan, leido, contextoDePublicacion],
  );
  const borrador = estadoDelBorrador(publicacion?.cambios.length, cambios);

  /** The guards and stations this draft changes: the plan diff plus what its
      publish calls write (sent with every save and with «Publicar»). */
  const tocadoDelBorrador = useCallback(
    (
      l: NonNullable<typeof leidoRef.current>,
      p: Plan,
      pub?: ReturnType<typeof planificarPublicacion>,
    ) => {
      const a = touchedBy(l.plan, p, l.enlace.personas);
      let b = { guardIds: [] as string[], stationIds: [] as string[] };

      try {
        const pp = pub || planificarPublicacion(l.plan, p, l.enlace, contextoDePublicacion());

        b = touchedByCalls(
          pp.cambios.flatMap((c) => c.llamadas),
          l.enlace.personas,
        );
      } catch {
        /* the plan diff alone still names most of it */
      }

      return {
        guardIds: [...new Set([...a.guardIds, ...b.guardIds])],
        stationIds: [...new Set([...a.stationIds, ...b.stationIds])],
      };
    },
    [contextoDePublicacion],
  );

  /** Someone changed live what this draft also changes (phase 5). */
  const alAvisoDeBorrador = useCallback(
    (a: AvisoDeBorrador) => {
      setEnVivo((prev) => juntarCambios(prev, a.items || []));
      toast.warning(textoDeBorrador(t, a), {
        id: `cruce-borrador-${a.draftId}`,
        duration: 12000,
      });
    },
    [t],
  );
  const marcas = useMemo(
    () => indiceDeMarcas(enVivo, leido?.enlace.personas || {}),
    [enVivo, leido],
  );

  /* ── SAVE TO THE SERVER ───────────────────────────────────────────────────
     One save at a time, in order. A 409 means someone else saved the shared
     draft (or published / discarded it): re-read and merge, never overwrite. */
  const enCursoRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const guardarAhora = useCallback((forzar = false): Promise<boolean> => {
    const una = async (): Promise<boolean> => {
      const p = planRef.current;
      const l = leidoRef.current;

      if (!p || !l || !tenantId) return true;
      const s = srvRef.current;

      // Untouched and nothing on the server: a late autosave (e.g. right
      // after a publish) has nothing to do. Publishing forces the save.
      if (!forzar && cambiosRef.current === 0 && s.version === 0) return true;

      try {
        if (firmaDe(p) === firmaRef.current) {
          // Back to exactly the live schedule: nothing to keep.
          if (s.version > 0) {
            await descartarBorradorDelServidor(tenantId, s.version);
            srvRef.current = { ...s, version: 0, guardado: null };
          }
          setGuardado(null);

          return true;
        }
        setGuardado("guardando");
        const d = await guardarBorradorEnElServidor(tenantId, {
          version: s.version,
          plan: p,
          original: l.plan,
          base: baseRef.current,
          baseAt: s.baseAt,
          signature: firmaRef.current,
          touches: cambiosRef.current,
          touched: tocadoDelBorrador(l, p),
        });

        srvRef.current = { ...srvRef.current, version: d.version, guardado: p };
        setEditores(d.editors || []);
        // Edited again while this save travelled: another save follows.
        setGuardado(planRef.current === p ? "guardado" : "pendiente");

        return true;
      } catch (e) {
        if (
          e instanceof DraftConflict &&
          (e.reason === "draftChanged" || e.reason === "draftMissing")
        ) {
          if (e.reason === "draftMissing") {
            srvRef.current = { ...srvRef.current, version: 0, guardado: null };
            toast.message(
              t(
                "ui.Planificador.borradorYaNoEsta",
                "Otra persona publicó o descartó el borrador. Se volvió a leer el horario real con tus cambios encima.",
              ),
            );
          }
          await cargar();

          return false;
        }
        setGuardado("error");

        return false;
      }
    };
    const siguiente = enCursoRef.current.then(una, una);

    enCursoRef.current = siguiente.catch(() => false);

    return siguiente;
  }, [tenantId, cargar, t, tocadoDelBorrador]);

  // Save the touched draft (with a breather: one drag is many touches).
  useEffect(() => {
    if (cargando || !plan || !leido || !firmaRef.current || !cambios) return;
    // The plan exactly as it was opened: nothing to write yet. The first
    // edit disarms this for good (an undo back to it must still be saved).
    if (plan === planAbiertoRef.current) return;
    planAbiertoRef.current = null;
    setGuardado((g) => (g === "guardando" ? g : "pendiente"));
    const id = window.setTimeout(() => void guardarAhora(), 1200);

    return () => window.clearTimeout(id);
  }, [plan, leido, cambios, cargando, guardarAhora]);

  // Who else has it open: a heartbeat while the editor is on screen.
  useEffect(() => {
    if (!tenantId) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible")
        void seguirEditando(tenantId).then(setEditores);
    }, 30_000);

    return () => window.clearInterval(id);
  }, [tenantId]);

  // Leaving is safe once the server has the draft; only an unsaved edit asks.
  useFrenoAlSalir(
    guardado === "pendiente" || guardado === "guardando" || guardado === "error",
    () =>
      confirmDialog({
        title: t("ui.Planificador.salirTituloServidor", "Hay cambios sin guardar"),
        message: t(
          "ui.Planificador.salirMensajeServidor",
          "Tus últimos cambios del borrador todavía no llegaron al servidor. Si sales ahora, se pierden.",
        ),
        confirmText: t("ui.Planificador.salirSinGuardar", "Salir igual"),
        cancelText: t("ui.Planificador.seguirAqui", "Seguir aquí"),
        tone: "danger",
      }),
  );

  /** «Volver al horario real» / «Descartar borrador»: for everyone who shares it. */
  const descartar = async () => {
    if (
      (borrador.pendientes > 0 || srvRef.current.version > 0) &&
      !(await confirmDialog({
        title: t("ui.Planificador.descartarTitulo", "Descartar el borrador"),
        message: t("ui.Planificador.descartarMensajeCompartido", {
          defaultValue:
            "Se pierden los {{count}} cambios sin publicar, también para quien más lo esté editando, y vuelve a verse el horario real.",
          count: borrador.pendientes,
        }),
        confirmText: t("ui.Planificador.descartar", "Descartar borrador"),
        tone: "danger",
      }))
    )
      return;
    try {
      if (srvRef.current.version > 0)
        await descartarBorradorDelServidor(tenantId, srvRef.current.version);
    } catch (e) {
      if (e instanceof DraftConflict && e.reason === "draftChanged") {
        toast.error(e.message);
        await cargar();

        return;
      }
    }
    srvRef.current = { version: 0, baseAt: null, guardado: null };
    cambiosRef.current = 0;
    setCambios(0);
    setGuardado(null);
    await cargar({ conservarLocal: false });
  };

  /** Publish: save first (the server applies exactly what was reviewed), then all or nothing. */
  const publicarAhora = async (): Promise<Publicado> => {
    await guardarAhora(true);
    const l = leidoRef.current;
    const p = planRef.current;

    if (!l || !p) return { applied: 0, kept: [] };
    const pub = planificarPublicacion(l.plan, p, l.enlace, contextoDePublicacion());

    return publicarEnElServidor(tenantId, {
      version: srvRef.current.version,
      baseAt: srvRef.current.baseAt,
      touched: tocadoDelBorrador(l, p, pub),
      changes: pub.cambios.map((c) => ({
        text: c.texto,
        calls: c.llamadas.map((x) => ({
          method: x.metodo,
          path: x.ruta,
          body: x.cuerpo,
        })),
      })),
    });
  };
  const fechas = useMemo(
    () =>
      Array.from({ length: ANTES + DESPUES }, (_, i) => {
        const dia = sumaDias(base, d0 - ANTES + i);
        const [y, m, d] = dia.split("-").map(Number);
        const f = new Date(Date.UTC(y, m - 1, d));

        return {
          num: d,
          nombre: f.toLocaleDateString(localeActual(), {
            weekday: "short",
            timeZone: "UTC",
          }),
          largo: f.toLocaleDateString(localeActual(), {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "UTC",
          }),
          mes: f.toLocaleDateString(localeActual(), {
            month: "short",
            timeZone: "UTC",
          }),
        };
      }),
    [base, d0],
  );

  const puestosVisibles = useMemo(() => {
    if (!plan) return [];
    const q = busca.trim().toLowerCase();

    return plan.puestos.filter((pu) => {
      if (soloPuesto && pu.id !== soloPuesto) return false;
      if (soloFranja && !pu.franjas.includes(soloFranja)) return false;
      if (soloHuecos) {
        let hay = false;

        for (let i = 0; i < 7 && !hay; i++)
          for (const f of pu.franjas)
            if (falta(plan, pu, f, d0 + i) > 0) hay = true;
        if (!hay) return false;
      }
      if (!q) return true;
      if (`${pu.nombre} ${pu.detalle || ""}`.toLowerCase().includes(q))
        return true;

      return plan.personas.some(
        (p) => p.puesto === pu.id && p.nombre.toLowerCase().includes(q),
      );
    });
  }, [plan, busca, soloHuecos, soloPuesto, soloFranja, d0]);

  /* ── ACORDEÓN CLIENTE → SEDE → ESTACIÓN ──────────────────────────────────
     Pedido del dueño: «sale el cliente, se da click y abre la sede, se da
     click y abre la estación, se da click y muestra los turnos». Cada fila
     cerrada resume por día lo que falta en todo lo que cuelga de ella, así
     la hoja cerrada ya dice dónde hay huecos. Buscando o filtrando se abre
     todo; con dos puestos o menos, también. */
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  /** El puesto al que se le está asignando gente (popup de la ficha). */
  const [asignando, setAsignando] = useState<Puesto | null>(null);
  /** Las asignaciones tal como llegan del overview, por id (para «editar»). */
  const [crudas, setCrudas] = useState<Record<string, AsignacionCruda>>({});
  /** La persona cuya asignación se edita en la hoja. */
  const [editando, setEditando] = useState<Persona | null>(null);
  /** La persona a la que se sustituye en su plaza («cambiar»). */
  const [sustituyendo, setSustituyendo] = useState<Persona | null>(null);
  /** «Agregar sacafranco»: abierto con los puestos de este cliente marcados. */
  const [agregandoSf, setAgregandoSf] = useState<string[] | null>(null);
  const estacionesParaSf = useMemo(
    () =>
      (plan?.puestos || []).map((pu) => ({
        id: pu.id,
        nombre: pu.nombre,
        sede: pu.sede,
        cliente: pu.cliente,
      })),
    [plan],
  );
  /* «Quitar» a alguien de su puesto cierra su asignación en el servidor. Se
     pide dos veces (sin diálogo del navegador) y se relee el horario. */
  const [confirmarQuitar, setConfirmarQuitar] = useState<string | null>(null);
  /* ── LOS CAMBIOS DIRECTOS YA NO SE LLEVAN EL BORRADOR ──────────────────
     Asignar, cambiar, editar, agregar sacafranco y quitar escriben en el
     horario REAL y luego se relee. Antes eso tiraba el borrador (y había que
     preguntar); ahora el borrador se combina con lo nuevo al releer
     (`cargar` conserva lo local). Sólo queda comprobar el permiso. */
  const antesDeUnCambioDirecto = useCallback(async (): Promise<boolean> => {
    if (!editarPlan.puede) {
      toast.info(editarPlan.porQueNo);
      return false;
    }
    // Whatever is not on the server yet goes there first.
    await guardarAhora();

    return true;
  }, [editarPlan.puede, editarPlan.porQueNo, guardarAhora]);
  const directo =
    <T,>(abrir: (v: T) => void) =>
    (v: T) => {
      void antesDeUnCambioDirecto().then((si) => {
        if (si) abrir(v);
      });
    };
  const quitarVigilante = async (p: Persona) => {
    const a = leido?.enlace.personas[p.id]?.assignmentId;

    if (!a) {
      toast.error(
        t(
          "ui.Planificador.sinAsignacionGuardada",
          "Esta persona todavía no tiene asignación guardada; publica primero.",
        ),
      );

      return;
    }
    if (confirmarQuitar !== p.id) {
      setConfirmarQuitar(p.id);
      toast.message(
        t("ui.Planificador.confirmaQuitar", {
          defaultValue:
            "Vuelve a pulsar «quitar» para sacar a {{nombre}} del puesto.",
          nombre: p.nombre,
        }),
      );

      return;
    }
    if (!(await antesDeUnCambioDirecto())) {
      setConfirmarQuitar(null);

      return;
    }
    try {
      await ApiService.delete(`/tenant/${tenantId}/guard-assignment/${a}`);
      toast.success(
        t("ui.Planificador.quitado", {
          defaultValue: "{{nombre}} ya no está en este puesto.",
          nombre: p.nombre,
        }),
      );
      setConfirmarQuitar(null);
      void cargar();
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || "Error");
    }
  };
  const abrirTodo =
    busca.trim() !== "" ||
    soloHuecos ||
    !!soloPuesto ||
    !!soloFranja ||
    puestosVisibles.length <= 2;
  const estaAbierto = (k: string) => abiertos[k] ?? abrirTodo;
  const alternar = (k: string) =>
    setAbiertos((a) => ({ ...a, [k]: !(a[k] ?? abrirTodo) }));
  const grupos = useMemo(() => {
    type Sede = { id: string; nombre: string; puestos: Puesto[] };
    type Cliente = { id: string; nombre: string; sedes: Map<string, Sede> };
    const cs = new Map<string, Cliente>();

    for (const pu of puestosVisibles) {
      const cid = pu.clienteId || "";
      const sid = pu.sedeId || "";
      const c = cs.get(cid) || {
        id: cid,
        nombre: pu.cliente || t("ui.Planificador.sinCliente", "Sin cliente"),
        sedes: new Map<string, Sede>(),
      };
      const s = c.sedes.get(sid) || {
        id: sid,
        nombre: pu.sede || t("ui.Planificador.sinSede", "Sin sede"),
        puestos: [],
      };

      s.puestos.push(pu);
      c.sedes.set(sid, s);
      cs.set(cid, c);
    }
    const orden = (a: { nombre: string }, b: { nombre: string }) =>
      a.nombre.localeCompare(b.nombre);

    return [...cs.values()]
      .sort(orden)
      .map((c) => ({ ...c, sedes: [...c.sedes.values()].sort(orden) }));
  }, [puestosVisibles, t]);

  const hacerAcomodo = () => {
    if (!plan) return;
    setPensando(true);
    // Un respiro para que el botón pinte «pensando» antes de bloquear el hilo.
    setTimeout(() => {
      let res = { antes: 0, despues: 0 };

      cambiar((p) => {
        p.no = {};
        res = acomodar(p, d0, d0 + 28);
      });
      setPensando(false);
      toast.message(
        res.despues === 0
          ? t(
              "ui.Planificador.acomodadoCompleto",
              "Acomodado: las próximas 4 semanas quedan completas.",
            )
          : res.despues < res.antes
            ? t(
                "ui.Planificador.acomodadoParcial",
                "Acomodado. Con esta gente y estas rotaciones aún quedan huecos: hace falta otro sacafranco o cambiar una rotación.",
              )
            : t(
                "ui.Planificador.acomodadoIgual",
                "Ya estaba en su mejor acomodo con esta gente y estas rotaciones.",
              ),
      );
    }, 30);
  };
  const hacerCubrir = () => {
    let res = { hechos: 0, quedan: 0 };

    cambiar((p) => {
      res = cubrirTodo(p, d0, d0 + 7);
    });
    toast.message(
      res.hechos
        ? t("ui.Planificador.cubiertosN", {
            defaultValue:
              "Cubiertos {{n}} turnos. Quedan {{q}} sin sacafranco libre.",
            n: res.hechos,
            q: res.quedan,
          })
        : t(
            "ui.Planificador.nadieLibre",
            "No hay sacafranco libre para lo que falta. Se puede cubrir a mano con hora extra.",
          ),
    );
  };

  const sacas = plan
    ? plan.personas.filter((p) => esSacafranco(p) && !p.sinPuesto)
    : [];
  /** Activos sin asignación: pueden cubrir, nunca se colocan solos. */
  const bolsa = plan ? plan.personas.filter((p) => !!p.sinPuesto) : [];
  const [verBolsa, setVerBolsa] = useState(false);

  return (
    <AppLayout>
      <PageContainer width="full">
        <PageHeader
          actions={
            <>
              <Button
                disabled={!pila.current.length}
                variant="outline"
                onClick={deshacer}
              >
                <Undo2 size={15} /> {t("ui.Planificador.deshacer", "Deshacer")}
              </Button>
              <Button
                disabled={cargando}
                variant="outline"
                onClick={() => void descartar()}
              >
                <RotateCcw size={15} />{" "}
                {t("ui.Planificador.volverAlReal", "Volver al horario real")}
              </Button>
              <Button
                disabled={!publicacion?.cambios.length || !editarPlan.puede}
                title={editarPlan.porQueNo}
                variant="brand"
                onClick={() => setHoja({ tipo: "publicar" })}
              >
                <Send size={15} />{" "}
                {publicacion?.cambios.length
                  ? t("ui.Planificador.publicarN", {
                      defaultValue: "Publicar {{n}}",
                      n: publicacion.cambios.length,
                    })
                  : t("ui.Planificador.publicar", "Publicar")}
              </Button>
            </>
          }
          badges={
            <>
              <StatusBadge tone="amber">
                {t("ui.Planificador.borrador", "Borrador hasta que publiques")}
              </StatusBadge>
              {parecido != null && (
                <StatusBadge tone={parecido >= 0.9 ? "green" : "slate"}>
                  {t("ui.Planificador.parecido", {
                    defaultValue: "Se parece al horario real en un {{n}} %",
                    n: Math.round(parecido * 100),
                  })}
                </StatusBadge>
              )}
              {/* How many EDITS were made, not how many changes «Publicar»
                  sends (that one also counts the sacafrancos' automatic
                  covers): both said «cambios» with different numbers. */}
              {cambios > 0 && (
                <StatusBadge tone="slate">
                  {cambios === 1
                    ? t("ui.Planificador.unCambio", "1 edición")
                    : t("ui.Planificador.cambios", {
                        defaultValue: "{{n}} ediciones",
                        n: cambios,
                      })}
                </StatusBadge>
              )}
              {guardado && (
                <StatusBadge
                  tone={
                    guardado === "error"
                      ? "red"
                      : guardado === "guardado"
                        ? "green"
                        : "slate"
                  }
                >
                  {guardado === "guardado"
                    ? t("ui.Planificador.guardadoEnServidor", "Guardado para todo el equipo")
                    : guardado === "error"
                      ? t("ui.Planificador.noSeGuardo", "No se pudo guardar; se reintenta al próximo cambio")
                      : t("ui.Planificador.guardando", "Guardando…")}
                </StatusBadge>
              )}
              {editores.length > 0 && (
                <StatusBadge tone="blue">
                  {t("ui.Planificador.tambienEditando", {
                    defaultValue: "También lo está editando: {{quien}}",
                    quien: editores.map((e) => e.name).join(", "),
                  })}
                </StatusBadge>
              )}
            </>
          }
          icon={<CalendarRange />}
          subtitle={t(
            "ui.Planificador.subtitulo",
            "Di qué pide cada estación, dale a cada quien su rotación y deja que los sacafrancos cubran lo que falta.",
          )}
          title={t("ui.Planificador.tituloBorrador", "Horario · borrador")}
        />
        <HorarioModos alAvisoDeBorrador={alAvisoDeBorrador} modo="borrador" />

        {!cargando && enVivo.length > 0 && (
          <FranjaEnVivo
            cambios={enVivo}
            onEntendido={() => setEnVivo([])}
            onReleer={() => void cargar()}
          />
        )}

        {/* LA FRANJA DEL BORRADOR. Una pastilla en la cabecera no bastó: se
            corrió el ciclo de un vigilante, no se publicó, y la pantalla lo
            daba libre mientras el horario real y VigIA lo tenían trabajando.
            Mientras haya algo sin publicar, esto se queda pegado arriba. */}
        {!cargando && borrador.sinPublicar && (
          <div
            className="sticky top-0 z-30 mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/60 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm dark:border-amber-500/40 dark:bg-amber-950/80 dark:text-amber-100"
            role="status"
          >
            <AlertTriangle
              className="shrink-0 text-amber-600 dark:text-amber-400"
              size={18}
            />
            <div className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">
                {borrador.pendientes === 1
                  ? t(
                      "ui.Planificador.franjaUnCambio",
                      "Borrador sin publicar · 1 cambio",
                    )
                  : t("ui.Planificador.franjaCambios", {
                      defaultValue: "Borrador sin publicar · {{n}} cambios",
                      n: borrador.pendientes,
                    })}
              </span>
              <span className="text-amber-900/80 dark:text-amber-100/80">
                {" — "}
                {t(
                  "ui.Planificador.franjaNadaEnElReal",
                  "nada de esto está en el horario real todavía",
                )}
              </span>
            </div>
            {cambios > 0 && (
              <Button size="sm" variant="outline" onClick={descartar}>
                <RotateCcw size={14} />{" "}
                {t("ui.Planificador.descartar", "Descartar borrador")}
              </Button>
            )}
            <Button
              size="sm"
              variant="brand"
              disabled={!editarPlan.puede}
              title={editarPlan.porQueNo}
              onClick={() => setHoja({ tipo: "publicar" })}
            >
              <Send size={14} /> {t("ui.Planificador.publicar", "Publicar")}
            </Button>
          </div>
        )}

        {cargando || !plan || !r ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : !plan.puestos.length ? (
          <EmptyState
            icon={<CalendarRange />}
            title={t(
              "ui.Planificador.sinPuestos",
              "Todavía no hay estaciones que planificar.",
            )}
          />
        ) : (
          <>
            <div className="glass mb-4 flex flex-wrap items-center gap-3 p-3">
              <div className="flex items-center gap-1.5 font-semibold">
                <Button
                  aria-label={t(
                    "ui.Planificador.semanaAnterior",
                    "Semana anterior",
                  )}
                  size="icon"
                  variant="outline"
                  onClick={() => irA(semana - 1)}
                >
                  <ChevronLeft size={16} />
                </Button>
                <span className="min-w-[9.5rem] text-center text-sm tabular-nums">
                  {fechas[ANTES].num} {fechas[ANTES].mes} –{" "}
                  {fechas[ANTES + 6].num} {fechas[ANTES + 6].mes}
                </span>
                <Button
                  aria-label={t(
                    "ui.Planificador.semanaSiguiente",
                    "Semana siguiente",
                  )}
                  size="icon"
                  variant="outline"
                  onClick={() => irA(semana + 1)}
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                <span
                  className="rounded-full px-3 py-1 text-xs font-semibold"
                  style={r.sin ? GRIS : VERDE}
                >
                  {t("ui.Planificador.cubiertos", {
                    defaultValue: "{{n}} de {{total}} turnos cubiertos",
                    n: r.total - r.sin,
                    total: r.total,
                  })}
                </span>
                {r.sin > 0 && (
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold"
                    style={ROJO}
                  >
                    {t("ui.Planificador.sinCubrir", {
                      defaultValue: "{{n}} sin cubrir",
                      n: r.sin,
                    })}
                  </span>
                )}
                {r.sobran > 0 && (
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold"
                    style={AMBAR}
                  >
                    {t("ui.Planificador.sobran", {
                      defaultValue: "{{n}} de sobra",
                      n: r.sobran,
                    })}
                  </span>
                )}
              </div>
              <Button
                disabled={pensando}
                variant="brand"
                onClick={hacerAcomodo}
              >
                {pensando ? (
                  <Loader2 className="animate-spin" size={15} />
                ) : (
                  <Wand2 size={15} />
                )}{" "}
                {t("ui.Planificador.acomodar", "Acomodar")}
              </Button>
              <Button disabled={!r.sin} variant="outline" onClick={hacerCubrir}>
                {t("ui.Planificador.cubrirLoQueFalta", "Cubrir lo que falta")}
              </Button>
              <Button
                title={t(
                  "ui.Planificador.reglasTitulo",
                  "Descanso entre turnos, días seguidos y horas por semana",
                )}
                variant="outline"
                onClick={() => setHoja({ tipo: "reglas" })}
              >
                <SlidersHorizontal size={15} />{" "}
                {t("ui.Planificador.reglas", "Reglas")}
              </Button>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-3">
              <label className="relative min-w-0 flex-1 sm:max-w-xs">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
                  size={14}
                  style={{ color: "var(--ink-soft)" }}
                />
                <input
                  className="cg-input h-9 w-full pl-8 pr-3 text-sm"
                  placeholder={t(
                    "ui.Planificador.buscar",
                    "Buscar estación o vigilante",
                  )}
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </label>
              <select
                aria-label={t("ui.Planificador.filtroEstacion", "Estación")}
                className="cg-input h-9 min-w-0 max-w-full px-2 text-sm sm:max-w-[14rem]"
                value={soloPuesto}
                onChange={(e) => setSoloPuesto(e.target.value)}
              >
                <option value="">
                  {t("ui.Planificador.todasLasEstaciones", "Todas las estaciones")}
                </option>
                {[...plan.puestos]
                  .sort((a, b) => a.nombre.localeCompare(b.nombre))
                  .map((pu) => (
                    <option key={pu.id} value={pu.id}>
                      {pu.sede ? `${pu.nombre} · ${pu.sede}` : pu.nombre}
                    </option>
                  ))}
              </select>
              <select
                aria-label={t("ui.Planificador.filtroTurno", "Tipo de turno")}
                className="cg-input h-9 min-w-0 max-w-full px-2 text-sm sm:max-w-[12rem]"
                value={soloFranja}
                onChange={(e) => setSoloFranja(e.target.value)}
              >
                <option value="">
                  {t("ui.Planificador.todosLosTurnos", "Todos los turnos")}
                </option>
                {Object.values(plan.franjas).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nombre}
                  </option>
                ))}
              </select>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  checked={soloHuecos}
                  type="checkbox"
                  onChange={(e) => setSoloHuecos(e.target.checked)}
                />
                {t(
                  "ui.Planificador.soloConHuecos",
                  "Sólo estaciones con algo sin cubrir",
                )}
              </label>
              <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
                {t("ui.Planificador.nPuestos", {
                  defaultValue: "{{n}} de {{total}} puestos",
                  n: puestosVisibles.length,
                  total: plan.puestos.length,
                })}
              </span>
            </div>

            <div ref={rejillaRef} className="glass overflow-x-auto">
              {/* `table-fixed` + an explicit width: with the automatic layout a
                  long client name widened the first column over the days and
                  `truncate` never kicked in (QA-94). */}
              <table
                className="table-fixed border-separate border-spacing-0 text-sm tabular-nums"
                style={{
                  width: `calc(13rem + ${diasVista.length * ANCHO_DIA}px)`,
                  minWidth: `calc(13rem + ${(ANTES + DESPUES) * ANCHO_DIA}px)`,
                }}
              >
                <colgroup>
                  <col style={{ width: "13rem" }} />
                  {diasVista.map((d) => (
                    <col
                      key={d}
                      style={{
                        width: ANCHO_DIA,
                        background:
                          d === hoyIdx
                            ? "color-mix(in oklab, var(--brand) 10%, transparent)"
                            : d < d0 || d >= d0 + 7
                              ? "color-mix(in oklab, var(--ink) 4%, transparent)"
                              : undefined,
                      }}
                    />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th
                      className="sticky left-0 z-[1] w-56 min-w-[13rem] border-b px-3 py-2 text-left text-xs font-semibold"
                      style={{
                        borderColor: "var(--hairline)",
                        background: "var(--background)",
                        color: "var(--ink-soft)",
                      }}
                    >
                      {t(
                        "ui.Planificador.puestoYVigilante",
                        "Estación y vigilante",
                      )}
                    </th>
                    {fechas.map((f, i) => (
                      <th
                        key={i}
                        className="border-b px-1.5 py-2 text-center text-xs font-semibold"
                        style={{
                          borderColor: "var(--hairline)",
                          color: "var(--ink-soft)",
                        }}
                        title={f.largo}
                      >
                        <span
                          className="block text-[10px] font-bold uppercase tracking-wide"
                          style={{
                            color: "var(--brand-text)",
                            minHeight: "0.9rem",
                          }}
                        >
                          {i === 0 || f.num === 1 ? f.mes : ""}
                        </span>
                        <span className="capitalize">{f.nombre}</span>
                        <span
                          className="block text-base"
                          style={{
                            color:
                              diasVista[i] === hoyIdx
                                ? "var(--brand-text)"
                                : "var(--ink)",
                          }}
                        >
                          {f.num}
                          {diasVista[i] === hoyIdx && (
                            <span
                              className="ml-1 rounded-full px-1.5 align-middle text-[9px] font-bold uppercase"
                              style={{
                                background: "var(--brand)",
                                color: "var(--brand-ink)",
                              }}
                            >
                              {t("ui.Planificador.hoy", "hoy")}
                            </span>
                          )}
                        </span>
                        <span
                          className="mt-0.5 inline-block rounded-full px-1.5 text-[10px] font-bold"
                          style={rv && rv.porDia[i] ? ROJO : VERDE}
                        >
                          {rv && rv.porDia[i]
                            ? t("ui.Planificador.nSinCubrir", {
                                defaultValue: "{{n}} sin cubrir",
                                n: rv.porDia[i],
                              })
                            : t("ui.Planificador.completo", "completo")}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grupos.map((c) => {
                    const kc = `c:${c.id}`;
                    const puestosC = c.sedes.flatMap((s) => s.puestos);

                    return (
                      <Fragment key={kc}>
                        <FilaGrupo
                          abierto={estaAbierto(kc)}
                          /* Clave propia: `nPuestos` es la de la barra («n de
                             total») y aquí no hay total — salía «{{total}}». */
                          detalle={t("ui.Planificador.nPuestosGrupo", {
                            defaultValue: "{{n}} puestos",
                            n: puestosC.length,
                          })}
                          dias={diasVista}
                          nivel={1}
                          nombre={c.nombre}
                          plan={plan}
                          puestos={puestosC}
                          onToggle={() => alternar(kc)}
                        />
                        {estaAbierto(kc) &&
                          c.sedes.map((s) => {
                            const ks = `s:${c.id}|${s.id}`;

                            return (
                              <Fragment key={ks}>
                                <FilaGrupo
                                  abierto={estaAbierto(ks)}
                                  detalle={t("ui.Planificador.nPuestosGrupo", {
                                    defaultValue: "{{n}} puestos",
                                    n: s.puestos.length,
                                  })}
                                  dias={diasVista}
                                  nivel={2}
                                  nombre={s.nombre}
                                  plan={plan}
                                  puestos={s.puestos}
                                  accion={
                                    s.id ? (
                                      <Link
                                        aria-label={t(
                                          "ui.Planificador.nuevaEstacion",
                                          "Nueva estación",
                                        )}
                                        className={ICONO}
                                        title={t(
                                          "ui.Planificador.nuevaEstacion",
                                          "Nueva estación",
                                        )}
                                        to={`/post-sites/${s.id}/stations/new`}
                                      >
                                        <Plus className="h-3.5 w-3.5" />
                                      </Link>
                                    ) : null
                                  }
                                  onToggle={() => alternar(ks)}
                                />
                                {estaAbierto(ks) &&
                                  s.puestos.map((pu) => (
                                    <FilasDePuesto
                                      key={pu.id}
                                      abierto={estaAbierto(`p:${pu.id}`)}
                                      d0={d0}
                                      dias={diasVista}
                                      marcas={marcas}
                                      base={base}
                                      plan={plan}
                                      pu={pu}
                                      cambiar={cambiar}
                                      setHoja={setHoja}
                                      asignar={directo(setAsignando)}
                                      confirmando={confirmarQuitar}
                                      quitar={quitarVigilante}
                                      sustituir={directo(setSustituyendo)}
                                      editar={directo(setEditando)}
                                      desistir={() => setConfirmarQuitar(null)}
                                      onToggle={() => alternar(`p:${pu.id}`)}
                                    />
                                  ))}
                              </Fragment>
                            );
                          })}
                      </Fragment>
                    );
                  })}
                  <tr>
                    <td
                      className="p-0 text-xs font-bold"
                      colSpan={diasVista.length + 1}
                      style={{ background: "var(--glass-sunken)" }}
                    >
                      <div
                        className="sticky left-0 w-max max-w-[min(60rem,calc(100vw-22rem))] rounded-r-md px-3 py-2"
                        style={{
                          background:
                            "color-mix(in oklab, var(--background) 88%, var(--ink) 12%)",
                        }}
                      >
                        {t("ui.Planificador.sacafrancos", "Sacafrancos")}{" "}
                        <span
                          className="font-normal"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          ·{" "}
                          {t(
                            "ui.Planificador.cubrenSusPuestos",
                            "cubren lo que falta en sus estaciones fijas",
                          )}
                        </span>
                        <button
                          className="cg-btn-glass cg-focus ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          title={t(
                            "ui.Planificador.probarOtroTitulo",
                            "Prueba cómo quedaría con un sacafranco más",
                          )}
                          onClick={() =>
                            cambiar((x) => {
                              const n =
                                x.personas.filter((y) =>
                                  y.id.startsWith("nuevo-"),
                                ).length + 1;

                              x.personas.push({
                                id: `nuevo-${Date.now()}`,
                                nombre: `${t("ui.Planificador.sacafrancoNuevo", "Sacafranco nuevo")} ${n}`,
                                puesto: null,
                                patron: [
                                  LIBRE,
                                  LIBRE,
                                  LIBRE,
                                  LIBRE,
                                  LIBRE,
                                  LIBRE,
                                  FRANCO,
                                ],
                                desfase: 0,
                                manual: {},
                                fijos: [],
                                ausencias: [],
                              });
                            })
                          }
                        >
                          <UserPlus size={12} />{" "}
                          {t(
                            "ui.Planificador.probarOtro",
                            "Probar con uno más",
                          )}
                        </button>
                        <button
                          className="cg-focus ml-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                          style={{
                            background: "var(--brand)",
                            color: "var(--brand-ink)",
                          }}
                          type="button"
                          onClick={() =>
                            directo(setAgregandoSf)(
                              puestosVisibles.map((x) => x.id),
                            )
                          }
                        >
                          <UserPlus size={12} />{" "}
                          {t(
                            "ui.Planificador.agregarSacafranco",
                            "Agregar sacafranco",
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {sacas.map((s) => (
                    <FilaDeSacafranco
                      key={s.id}
                      d0={d0}
                      dias={diasVista}
                      plan={plan}
                      s={s}
                      cambiar={cambiar}
                      confirmando={confirmarQuitar}
                      editar={directo(setEditando)}
                      retirar={quitarVigilante}
                      desistir={() => setConfirmarQuitar(null)}
                      setHoja={setHoja}
                    />
                  ))}
                  {/* LA BOLSA: activos sin asignación. Pueden cubrir (salen
                      como candidatos al tocar un hueco), nunca se colocan
                      solos. Plegada por defecto: suele ser larga. */}
                  {bolsa.length > 0 && (
                    <tr>
                      <td
                        className="p-0 text-xs font-bold"
                        colSpan={diasVista.length + 1}
                        style={{ background: "var(--glass-sunken)" }}
                      >
                        <div
                          className="sticky left-0 flex w-max max-w-[min(60rem,calc(100vw-22rem))] items-center gap-2 rounded-r-md px-3 py-2"
                          style={{
                            background:
                              "color-mix(in oklab, var(--background) 88%, var(--ink) 12%)",
                          }}
                        >
                          <button
                            className="cg-focus inline-flex items-center gap-1"
                            type="button"
                            onClick={() => setVerBolsa((v) => !v)}
                          >
                            {verBolsa ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                            {t("ui.Planificador.sinPuesto", "Sin estación")}{" "}
                            <span
                              className="font-normal"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              ·{" "}
                              {t("ui.Planificador.sinPuestoDetalle", {
                                defaultValue:
                                  "{{n}} disponible(s) para cubrir; toca un hueco para elegirlos",
                                n: bolsa.length,
                              })}
                            </span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {verBolsa &&
                    bolsa.map((s) => (
                      <FilaDeSacafranco
                        key={s.id}
                        d0={d0}
                        dias={diasVista}
                        plan={plan}
                        s={s}
                        cambiar={cambiar}
                        confirmando={confirmarQuitar}
                        editar={directo(setEditando)}
                        retirar={quitarVigilante}
                        desistir={() => setConfirmarQuitar(null)}
                        setHoja={setHoja}
                      />
                    ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs" style={{ color: "var(--ink-soft)" }}>
              {t(
                "ui.Planificador.pie",
                "Toca un turno para cambiar ese día, la rotación para cambiarla entera, y lo rojo para ver quién puede cubrirlo. El punto ● marca lo que cubre el sacafranco fijo de la estación.",
              )}
            </p>
          </>
        )}

        {/* El mismo popup de asignar de la ficha de la estación, abierto desde
            aquí (pedido del dueño: «debemos reutilizar ese componente»). Al
            guardar se relee el horario real. */}
        {asignando && (
          <ShiftAssignModal
            open
            postSiteId={asignando.sedeId || ""}
            station={
              {
                id: asignando.id,
                tenantId,
                stationName: asignando.nombre,
              } as any
            }
            stationId={asignando.id}
            onClose={() => setAsignando(null)}
            onSaved={() => {
              setAsignando(null);
              void cargar();
            }}
          />
        )}
        {sustituyendo &&
          leido?.enlace.personas[sustituyendo.id]?.assignmentId && (
            <CambiarVigilanteModal
              open
              assignmentId={leido.enlace.personas[sustituyendo.id].assignmentId}
              guardIdActual={leido.enlace.personas[sustituyendo.id].guardId}
              nombreActual={sustituyendo.nombre}
              puesto={
                plan?.puestos.find((x) => x.id === sustituyendo.puesto)
                  ?.nombre || ""
              }
              tenantId={tenantId}
              onClose={() => setSustituyendo(null)}
              onSaved={() => {
                setSustituyendo(null);
                void cargar();
              }}
            />
          )}
        {editando &&
          crudas[leido?.enlace.personas[editando.id]?.assignmentId || ""] && (
            <EditarAsignacionModal
              open
              asignacion={
                crudas[leido!.enlace.personas[editando.id].assignmentId]
              }
              estaciones={estacionesParaSf}
              nombre={editando.nombre}
              semanal={!!leido!.enlace.personas[editando.id].semanal}
              tenantId={tenantId}
              onClose={() => setEditando(null)}
              onSaved={() => {
                setEditando(null);
                void cargar();
              }}
            />
          )}
        {agregandoSf && (
          <AgregarSacafrancoModal
            open
            estaciones={estacionesParaSf}
            preseleccion={agregandoSf}
            tenantId={tenantId}
            onClose={() => setAgregandoSf(null)}
            onSaved={() => {
              setAgregandoSf(null);
              void cargar();
            }}
          />
        )}
        {plan && hoja?.tipo === "hueco" && (
          <HojaHueco
            k={hoja.k}
            plan={plan}
            cambiar={cambiar}
            cerrar={() => setHoja(null)}
            fechaDe={(d) => sumaDias(base, d)}
          />
        )}
        {plan && hoja?.tipo === "cobertura" && (
          <HojaCobertura
            plan={plan}
            puestoId={hoja.puesto}
            cambiar={cambiar}
            cerrar={() => setHoja(null)}
          />
        )}
        {plan && hoja?.tipo === "rotacion" && (
          <HojaRotacion
            personaId={hoja.persona}
            plan={plan}
            cambiar={cambiar}
            cerrar={() => setHoja(null)}
          />
        )}
        {plan && hoja?.tipo === "fijos" && (
          <HojaFijos
            personaId={hoja.persona}
            plan={plan}
            cambiar={cambiar}
            cerrar={() => setHoja(null)}
          />
        )}
        {plan && hoja?.tipo === "ausencia" && (
          <HojaAusencia
            d0={d0}
            fechaDe={(d) => sumaDias(base, d)}
            hoy={hoyIdx}
            personaId={hoja.persona}
            plan={plan}
            cambiar={cambiar}
            cerrar={() => setHoja(null)}
          />
        )}
        {plan && hoja?.tipo === "reglas" && (
          <HojaReglas
            plan={plan}
            cambiar={cambiar}
            cerrar={() => setHoja(null)}
          />
        )}
        {publicacion && hoja?.tipo === "publicar" && (
          <HojaPublicar
            publicacion={publicacion}
            cerrar={() => setHoja(null)}
            publicado={() => {
              setHoja(null);
              // Published: nothing local is pending any more (a queued
              // autosave now finds nothing to do instead of re-creating it).
              srvRef.current = { version: 0, baseAt: null, guardado: null };
              cambiosRef.current = 0;
              setCambios(0);
              setGuardado(null);
              void cargar({ conservarLocal: false });
            }}
            publicarAhora={publicarAhora}
            recargar={() => void cargar()}
          />
        )}
      </PageContainer>
    </AppLayout>
  );
}

/** `dia`: the click is on that person's day; a day that already happened is not edited. */
type Cambiar = (
  fn: (p: Plan) => void,
  dia?: { persona: string; d: number },
) => void;
const CELDA = "flex min-h-[3.25rem] flex-col gap-1";
const BTN =
  "cg-focus w-full rounded-lg px-1 py-1.5 text-xs font-bold leading-tight";
const TD = "border-b px-1 py-1 align-top";
const QUIEN = "sticky left-0 z-[1] border-b border-r px-3 py-1.5 text-left";

/* ── LAS ACCIONES DE UNA FILA ──────────────────────────────────────────────
   Una fila no puede ser una hilera de pastillas (así quedó al ir añadiendo
   «asignar», «cambiar», «quitar», «editar»…). Regla: a la vista sólo lo de uso
   diario (el ciclo y mover un día); todo lo demás en un menú «⋯». Mismo patrón
   en cliente, sede, estación y persona. */
const ICONO =
  "cg-btn-glass cg-focus inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full";

function Icono({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={title}
      className={ICONO}
      title={title}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

interface AccionDeMenu {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  /** Un enlace (sale de la hoja): se dice con el icono de «abrir». */
  to?: string;
  peligro?: boolean;
  separador?: boolean;
}

function MenuAcciones({
  title,
  items,
}: {
  title: string;
  items: AccionDeMenu[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={title}
          className={ICONO}
          title={title}
          type="button"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {items.map((it, i) => (
          <Fragment key={i}>
            {it.separador && <DropdownMenuSeparator />}
            {it.to ? (
              <DropdownMenuItem asChild>
                <Link className="flex items-center gap-2" to={it.to}>
                  {it.icon}
                  <span>{it.label}</span>
                  <ExternalLink className="ml-auto h-3 w-3 opacity-60" />
                </Link>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                className="flex items-center gap-2"
                style={
                  it.peligro
                    ? { color: "var(--danger-text, #e5484d)" }
                    : undefined
                }
                onSelect={() => it.onClick?.()}
              >
                {it.icon}
                <span>{it.label}</span>
              </DropdownMenuItem>
            )}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** «¿Quitar a X?» en la propia fila, en vez de una pastilla roja permanente. */
function ConfirmarQuitar({
  nombre,
  si,
  no,
}: {
  nombre: string;
  si: () => void;
  no: () => void;
}) {
  const { t } = useTranslation();

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{
        background:
          "color-mix(in oklab, var(--danger, #e5484d) 14%, transparent)",
        color: "var(--danger-text, #e5484d)",
      }}
    >
      {t("ui.Planificador.quitarA", {
        defaultValue: "¿Quitar a {{nombre}}?",
        nombre: corto(nombre),
      })}
      <button className="cg-focus ml-1 underline" type="button" onClick={si}>
        {t("ui.Planificador.si", "Sí")}
      </button>
      <button
        className="cg-focus underline opacity-70"
        type="button"
        onClick={no}
      >
        {t("ui.Planificador.no", "No")}
      </button>
    </span>
  );
}

/** Cuánta gente falta en el puesto ese día, sumando sus franjas. */
function faltaDia(plan: Plan, pu: Puesto, d: number): number {
  let n = 0;

  for (const f of pu.franjas) n += Math.max(0, falta(plan, pu, f, d));

  return n;
}

/** La celda-resumen de una fila cerrada: lo que falta ese día, o ✓. */
function ResumenDia({
  plan,
  puestos,
  d,
  onClick,
}: {
  plan: Plan;
  puestos: Puesto[];
  d: number;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  let n = 0;
  let hay = false;

  for (const pu of puestos) {
    n += faltaDia(plan, pu, d);
    if (!hay && pu.franjas.some((f) => pide(pu, f, d) > 0)) hay = true;
  }
  if (n > 0)
    return (
      <button className={BTN} style={ROJO} onClick={onClick}>
        {t("ui.Planificador.faltaN", { defaultValue: "falta {{n}}", n })}
      </button>
    );

  return (
    <span
      className={`${BTN} block text-center font-semibold`}
      style={hay ? GRIS : { color: "var(--ink-faint)" }}
    >
      {hay ? "✓" : "—"}
    </span>
  );
}

const SANGRIA = ["0.75rem", "0.75rem", "1.5rem", "2.25rem"];

/** Fila de cliente (nivel 1) o de sede (nivel 2) del acordeón. */
function FilaGrupo({
  nivel,
  nombre,
  detalle,
  abierto,
  onToggle,
  plan,
  puestos,
  dias,
  accion,
}: {
  nivel: 1 | 2;
  nombre: string;
  detalle?: string;
  abierto: boolean;
  onToggle: () => void;
  plan: Plan;
  puestos: Puesto[];
  dias: number[];
  /** Algo que hacer sobre el grupo (crear una estación en la sede…). */
  accion?: React.ReactNode;
}) {
  const Flecha = abierto ? ChevronDown : ChevronRight;
  const fondo =
    nivel === 1
      ? "color-mix(in oklab, var(--background) 86%, var(--ink) 14%)"
      : "color-mix(in oklab, var(--background) 93%, var(--ink) 7%)";

  return (
    <tr>
      <td
        className={QUIEN}
        style={{
          borderColor: "var(--hairline)",
          background: fondo,
          paddingLeft: SANGRIA[nivel],
        }}
      >
        <button
          className="cg-focus flex w-full items-center gap-1.5 text-left"
          type="button"
          onClick={onToggle}
        >
          <Flecha className="h-3.5 w-3.5 shrink-0" />
          <span
            className={`block min-w-0 truncate ${nivel === 1 ? "text-sm font-bold" : "text-xs font-semibold"}`}
          >
            {nombre}
          </span>
          {detalle && (
            <span
              className="shrink-0 text-[11px] font-normal"
              style={{ color: "var(--ink-soft)" }}
            >
              {detalle}
            </span>
          )}
        </button>
        {accion && <span className="mt-0.5 block pl-5">{accion}</span>}
      </td>
      {dias.map((d, i) => (
        <td
          key={i}
          className={TD}
          style={{ borderColor: "var(--hairline)", background: fondo }}
        >
          <ResumenDia d={d} plan={plan} puestos={puestos} onClick={onToggle} />
        </td>
      ))}
    </tr>
  );
}

function FilasDePuesto({
  plan,
  pu,
  d0,
  dias,
  marcas,
  base,
  cambiar,
  setHoja,
  abierto,
  onToggle,
  asignar,
  quitar,
  confirmando,
  sustituir,
  editar,
  desistir,
}: {
  plan: Plan;
  pu: Puesto;
  d0: number;
  dias: number[];
  /** Live edits on what the draft changes (phase 5), by person/station and day. */
  marcas?: IndiceDeMarcas;
  base?: string;
  cambiar: Cambiar;
  setHoja: (h: Hoja) => void;
  abierto: boolean;
  onToggle: () => void;
  asignar: (pu: Puesto) => void;
  quitar: (p: Persona, confirmando: boolean) => void;
  confirmando: string | null;
  sustituir: (p: Persona) => void;
  editar: (p: Persona) => void;
  desistir: () => void;
}) {
  const { t } = useTranslation();
  const fijos = fijosDe(plan, pu.id);
  const gente = plan.personas.filter((p) => p.puesto === pu.id);
  const cob = COBERTURAS.find(
    (c) =>
      c.franjas.join() === pu.franjas.join() &&
      JSON.stringify(c.pide) === JSON.stringify(pu.pide),
  );
  const fondo = {
    borderColor: "var(--hairline)",
    background: "var(--background)",
  };

  const Flecha = abierto ? ChevronDown : ChevronRight;

  return (
    <>
      <tr>
        <td
          className={QUIEN}
          style={{
            ...fondo,
            background:
              "color-mix(in oklab, var(--background) 94%, var(--ink) 6%)",
            paddingLeft: SANGRIA[3],
          }}
        >
          <button
            className="cg-focus flex w-full items-center gap-1.5 text-left"
            type="button"
            onClick={onToggle}
          >
            <Flecha className="h-3.5 w-3.5 shrink-0" />
            <span className="block min-w-0 truncate text-xs font-bold">
              {pu.nombre}
              {pu.detalle && (
                <span
                  className="font-normal"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {" "}
                  · {pu.detalle}
                </span>
              )}
            </span>
          </button>
          <span className="mt-0.5 flex flex-wrap items-center gap-1 pl-5 text-xs">
            <button
              className="cg-btn-glass cg-focus rounded-full px-2 py-0.5 text-[11px] font-semibold"
              title={t(
                "ui.Planificador.cambiarCobertura",
                "Cambiar lo que pide la estación",
              )}
              onClick={() => setHoja({ tipo: "cobertura", puesto: pu.id })}
            >
              {cob
                ? cob.nombre
                : pu.franjas
                    .map((f) => plan.franjas[f]?.nombre || f)
                    .join(" + ")}
            </button>
            <span className="font-normal" style={{ color: "var(--ink-soft)" }}>
              {fijos.length
                ? `↔ ${fijos.map((s) => corto(s.nombre)).join(", ")}`
                : t("ui.Planificador.sinSacafranco", "sin sacafranco")}
            </span>
            {pu.sedeId && (
              <>
                <Icono
                  title={t(
                    "ui.Planificador.asignarVigilante",
                    "Asignar vigilante",
                  )}
                  onClick={() => asignar(pu)}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                </Icono>
                <MenuAcciones
                  items={[
                    {
                      label: t(
                        "ui.Planificador.asignarVigilante",
                        "Asignar vigilante",
                      ),
                      icon: <UserPlus className="h-4 w-4" />,
                      onClick: () => asignar(pu),
                    },
                    {
                      label: t(
                        "ui.Planificador.cambiarCobertura",
                        "Cambiar lo que pide la estación",
                      ),
                      icon: <Ajustes className="h-4 w-4" />,
                      onClick: () =>
                        setHoja({ tipo: "cobertura", puesto: pu.id }),
                    },
                    {
                      label: t(
                        "ui.Planificador.abrirFichaEstacion",
                        "Abrir la ficha de la estación",
                      ),
                      icon: <Pencil className="h-4 w-4" />,
                      to: `/post-sites/${pu.sedeId}/stations/${pu.id}/overview`,
                      separador: true,
                    },
                  ]}
                  title={t("ui.Planificador.masAcciones", "Más acciones")}
                />
              </>
            )}
          </span>
        </td>
        {/* La cobertura va EN la fila de la estación (pedido del dueño): por
            día, cada franja con quién la cubre o cuánto falta. */}
        {Array.from({ length: dias.length }, (_, i) => {
          const d = dias[i];
          const celdas: React.ReactNode[] = [];

          for (const f of pu.franjas) {
            const n = pide(pu, f, d);
            const pr = propios(plan, pu, f, d);
            const k = clave(pu.id, f, d);
            const cu = plan.cubre[k] || [];
            const fa = n - pr - cu.length;
            const fr = plan.franjas[f];

            if (!n && !pr) continue;
            if (fa > 0)
              celdas.push(
                <button
                  key={f}
                  className={BTN}
                  style={ROJO}
                  title={horario(fr)}
                  onClick={() => setHoja({ tipo: "hueco", k })}
                >
                  {letra(fr)}{" "}
                  {t("ui.Planificador.faltaN", {
                    defaultValue: "falta {{n}}",
                    n: fa,
                  })}
                </button>,
              );
            else if (cu.length) {
              const q = plan.personas.find((p) => p.id === cu[0]);

              celdas.push(
                <button
                  key={f}
                  className={BTN}
                  style={q && !esSacafranco(q) ? AMBAR : VERDE}
                  title={horario(fr)}
                  onClick={() => setHoja({ tipo: "hueco", k })}
                >
                  {letra(fr)} · {plan.auto[`${k}|${cu[0]}`] ? "● " : ""}
                  {q ? corto(q.nombre) : "?"}
                  {cu.length > 1 ? ` +${cu.length - 1}` : ""}
                </button>,
              );
            } else if (pr > n)
              celdas.push(
                <span
                  key={f}
                  className={`${BTN} block text-center`}
                  style={AMBAR}
                  title={horario(fr)}
                >
                  {letra(fr)}{" "}
                  {t("ui.Planificador.sobraN", {
                    defaultValue: "sobra {{n}}",
                    n: pr - n,
                  })}
                </span>,
              );
            else
              celdas.push(
                <span
                  key={f}
                  className={`${BTN} block text-center font-semibold`}
                  style={GRIS}
                  title={horario(fr)}
                >
                  {letra(fr)} ✓
                </span>,
              );
          }

          const enVivoAqui =
            marcas && base && !marcas.vacio ? marcas.puesto(pu.id, sumaDias(base, d)) : [];

          return (
            <td
              key={i}
              className={TD}
              style={{
                borderColor: "var(--hairline)",
                background:
                  "color-mix(in oklab, var(--background) 94%, var(--ink) 6%)",
                position: enVivoAqui.length ? "relative" : undefined,
              }}
            >
              <MarcaEnVivo cambios={enVivoAqui} />
              <div className={CELDA}>
                {celdas.length ? (
                  celdas
                ) : (
                  <span
                    className={`${BTN} block border border-dashed text-center font-medium`}
                    style={{
                      borderColor: "var(--hairline)",
                      color: "var(--ink-soft)",
                    }}
                  >
                    {t("ui.Planificador.cerrado", "cerrado")}
                  </span>
                )}
              </div>
            </td>
          );
        })}
      </tr>
      {abierto && (
        <>
          {gente.map((p) => (
            <tr key={p.id}>
              <td className={QUIEN} style={fondo}>
                <span className="block truncate font-semibold">{p.nombre}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1">
                  <button
                    className="cg-btn-glass cg-focus rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    title={t(
                      "ui.Planificador.cambiarRotacion",
                      "Cambiar su rotación",
                    )}
                    onClick={() => setHoja({ tipo: "rotacion", persona: p.id })}
                  >
                    {etiquetaDe(plan, p)}
                  </button>
                  {/* A weekly style is anchored to the calendar: no shifting it. */}
                  {p.patron.length > 1 && !p.semanal && (
                    <>
                      <Icono
                        title={t(
                          "ui.Planificador.regresarTitulo",
                          "Empezar la rotación un día antes",
                        )}
                        onClick={() =>
                          cambiar((x) => {
                            const q = x.personas.find((y) => y.id === p.id)!;
                            q.desfase += 1;
                            q.manual = {};
                          })
                        }
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Icono>
                      <Icono
                        title={t(
                          "ui.Planificador.correrTitulo",
                          "Empezar la rotación un día después",
                        )}
                        onClick={() =>
                          cambiar((x) => {
                            const q = x.personas.find((y) => y.id === p.id)!;
                            q.desfase -= 1;
                            q.manual = {};
                          })
                        }
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Icono>
                    </>
                  )}
                  {confirmando === p.id ? (
                    <ConfirmarQuitar
                      nombre={p.nombre}
                      no={desistir}
                      si={() => quitar(p, true)}
                    />
                  ) : (
                    <MenuAcciones
                      items={[
                        {
                          label: t(
                            "ui.Planificador.ausenciaTitulo",
                            "Falta, vacaciones, permiso o incapacidad",
                          ),
                          icon: <CalendarX className="h-4 w-4" />,
                          onClick: () =>
                            setHoja({ tipo: "ausencia", persona: p.id }),
                        },
                        {
                          label: t(
                            "ui.Planificador.editarMenu",
                            "Editar su asignación (fechas, ciclo, próximo libre)",
                          ),
                          icon: <Pencil className="h-4 w-4" />,
                          onClick: () => editar(p),
                        },
                        {
                          label: t(
                            "ui.Planificador.cambiarMenu",
                            "Cambiar por otra persona",
                          ),
                          icon: <Repeat className="h-4 w-4" />,
                          onClick: () => sustituir(p),
                        },
                        {
                          label: t(
                            "ui.Planificador.quitarMenu",
                            "Quitar de la estación",
                          ),
                          icon: <UserMinus className="h-4 w-4" />,
                          onClick: () => quitar(p, false),
                          peligro: true,
                          separador: true,
                        },
                      ]}
                      title={t("ui.Planificador.masAcciones", "Más acciones")}
                    />
                  )}
                </span>
              </td>
              {Array.from({ length: dias.length }, (_, i) => {
                const d = dias[i];
                const aus = (p.ausencias || []).find(
                  (a) => d >= a.desde && d <= a.hasta,
                );
                const c = propio(p, d);
                const fr = plan.franjas[c];
                const extra = c === FRANCO ? turnoDe(plan, p, d) : null;
                const orden = [...pu.franjas, FRANCO];
                const sig = () =>
                  cambiar(
                    (x) => {
                      const q = x.personas.find((y) => y.id === p.id)!;
                      q.manual[d] =
                        orden[(orden.indexOf(propio(q, d)) + 1) % orden.length];
                    },
                    { persona: p.id, d },
                  );

                const enVivoAqui =
                  marcas && base && !marcas.vacio ? marcas.persona(p.id, sumaDias(base, d)) : [];

                return (
                  <td
                    key={i}
                    className={TD}
                    style={{
                      borderColor: "var(--hairline)",
                      position: enVivoAqui.length ? "relative" : undefined,
                    }}
                  >
                    <MarcaEnVivo cambios={enVivoAqui} />
                    <div className={CELDA}>
                      {aus ? (
                        <span
                          className={`${BTN} block text-center font-medium capitalize`}
                          style={aus.tipo === "falta" ? ROJO : GRIS}
                        >
                          {aus.tipo}
                        </span>
                      ) : c === FRANCO || !fr ? (
                        <button
                          className={`${BTN} border border-dashed font-medium`}
                          style={{
                            borderColor: "var(--hairline)",
                            color: "var(--ink-soft)",
                          }}
                          onClick={sig}
                        >
                          {t("ui.Planificador.franco", "Franco")}
                          {extra && (
                            <small className="block font-normal">
                              {t("ui.Planificador.extraEn", {
                                defaultValue: "extra en {{puesto}}",
                                puesto:
                                  plan.puestos.find(
                                    (x) => x.id === extra.puesto,
                                  )?.nombre || "",
                              })}
                            </small>
                          )}
                        </button>
                      ) : (
                        <button className={BTN} style={tono(fr)} onClick={sig}>
                          {letra(fr)}
                          <small className="block font-normal opacity-80">
                            {horario(fr)}
                          </small>
                        </button>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
          {!gente.length && (
            <tr>
              <td
                className="border-b p-0 text-xs italic"
                colSpan={dias.length + 1}
                style={{
                  borderColor: "var(--hairline)",
                  color: "var(--ink-soft)",
                }}
              >
                <div
                  className="sticky left-0 w-max px-3 py-1.5"
                  style={{ background: "var(--background)" }}
                >
                  {t(
                    "ui.Planificador.nadieAsignado",
                    "Nadie asignado a esta estación.",
                  )}
                  {pu.sedeId && (
                    <button
                      className="cg-btn-glass cg-focus ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold not-italic"
                      style={{ color: "var(--brand-text)" }}
                      type="button"
                      onClick={() => asignar(pu)}
                    >
                      <UserPlus className="h-3 w-3" />
                      {t(
                        "ui.Planificador.asignarVigilante",
                        "Asignar vigilante",
                      )}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          )}
        </>
      )}
    </>
  );
}

function etiquetaDe(plan: Plan, p: Persona): string {
  if (p.patron.length === 1 && p.patron[0] !== FRANCO)
    return esSacafranco(p) ? "Siempre disponible" : "Todos los días";
  const nombres: Record<string, string> = {};

  for (const id of Object.keys(plan.franjas))
    nombres[id] = letra(plan.franjas[id]);

  return (
    (etiqueta(p.patron, nombres) || "Sin rotación") +
    (p.francoDobleDomingo ? " · dom" : "")
  );
}

function FilaDeSacafranco({
  plan,
  s,
  d0,
  dias,
  cambiar,
  setHoja,
  editar,
  retirar,
  confirmando,
  desistir,
}: {
  plan: Plan;
  s: Persona;
  d0: number;
  dias: number[];
  cambiar: Cambiar;
  setHoja: (h: Hoja) => void;
  editar: (p: Persona) => void;
  /** Cerrar su asignación («quitar» en pantalla; `quitar` es del motor aquí). */
  retirar: (p: Persona, confirmando: boolean) => void;
  confirmando: string | null;
  desistir: () => void;
}) {
  const { t } = useTranslation();
  const trabajados = diasTrabajados(plan, s, d0, d0 + 7);
  const horas = horasSemana(plan, s, d0);
  let max = 0;

  for (let i = 0; i < 7; i++)
    if (turnoDe(plan, s, d0 + i))
      max = Math.max(max, seguidos(plan, s, d0 + i));
  const fondo = {
    borderColor: "var(--hairline)",
    background: "var(--background)",
  };
  const n = (s.fijos || []).length;

  return (
    <tr>
      <td className={QUIEN} style={fondo}>
        <span className="block truncate font-semibold">{s.nombre}</span>
        <span
          className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px]"
          style={{ color: "var(--ink-soft)" }}
        >
          <button
            className="cg-btn-glass cg-focus rounded-full px-2 py-0.5 font-semibold"
            style={{ color: "var(--ink)" }}
            onClick={() => setHoja({ tipo: "fijos", persona: s.id })}
          >
            {n === 1
              ? t("ui.Planificador.unPuestoFijo", "1 estación fija")
              : t("ui.Planificador.nPuestosFijos", {
                  defaultValue: "{{n}} puestos fijos",
                  n,
                })}
          </button>
          <button
            className="cg-btn-glass cg-focus rounded-full px-2 py-0.5 font-semibold"
            style={{ color: "var(--ink)" }}
            onClick={() => setHoja({ tipo: "rotacion", persona: s.id })}
          >
            {etiquetaDe(plan, s)}
          </button>
          {/* El sacafranco también corre su ciclo: moverlo uno o dos días es
              lo que cuadra sus libres con los huecos de los fijos. */}
          {s.patron.length > 1 && !s.semanal && (
            <>
              <Icono
                title={t(
                  "ui.Planificador.regresarTitulo",
                  "Empezar la rotación un día antes",
                )}
                onClick={() =>
                  cambiar((x) => {
                    const q = x.personas.find((y) => y.id === s.id)!;
                    q.desfase += 1;
                    q.manual = {};
                  })
                }
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Icono>
              <Icono
                title={t(
                  "ui.Planificador.correrTitulo",
                  "Empezar la rotación un día después",
                )}
                onClick={() =>
                  cambiar((x) => {
                    const q = x.personas.find((y) => y.id === s.id)!;
                    q.desfase -= 1;
                    q.manual = {};
                  })
                }
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Icono>
            </>
          )}
          {confirmando === s.id ? (
            <ConfirmarQuitar
              nombre={s.nombre}
              no={desistir}
              si={() => retirar(s, true)}
            />
          ) : (
            <MenuAcciones
              items={
                s.id.startsWith("nuevo-")
                  ? [
                      {
                        label: t(
                          "ui.Planificador.ausenciaTitulo",
                          "Falta, vacaciones, permiso o incapacidad",
                        ),
                        icon: <CalendarX className="h-4 w-4" />,
                        onClick: () =>
                          setHoja({ tipo: "ausencia", persona: s.id }),
                      },
                      {
                        label: t(
                          "ui.Planificador.quitarDeLaPrueba",
                          "Quitar de la prueba",
                        ),
                        icon: <UserMinus className="h-4 w-4" />,
                        onClick: () =>
                          cambiar((x) => {
                            x.personas = x.personas.filter(
                              (y) => y.id !== s.id,
                            );
                          }),
                        peligro: true,
                        separador: true,
                      },
                    ]
                  : [
                      {
                        label: t(
                          "ui.Planificador.ausenciaTitulo",
                          "Falta, vacaciones, permiso o incapacidad",
                        ),
                        icon: <CalendarX className="h-4 w-4" />,
                        onClick: () =>
                          setHoja({ tipo: "ausencia", persona: s.id }),
                      },
                      {
                        label: t(
                          "ui.Planificador.editarSfMenu",
                          "Editar (fechas, ciclo, estaciones que cubre)",
                        ),
                        icon: <Pencil className="h-4 w-4" />,
                        onClick: () => editar(s),
                      },
                      {
                        label: t(
                          "ui.Planificador.quitarSfMenu",
                          "Quitar de sacafranco",
                        ),
                        icon: <UserMinus className="h-4 w-4" />,
                        onClick: () => retirar(s, false),
                        peligro: true,
                        separador: true,
                      },
                    ]
              }
              title={t("ui.Planificador.masAcciones", "Más acciones")}
            />
          )}
          {t("ui.Planificador.diasYHoras", {
            defaultValue: "{{d}} días · {{h}} h",
            d: trabajados,
            h: horas,
          })}
          {trabajados < 4 && (
            <span className="rounded-full px-1.5 font-semibold" style={AMBAR}>
              {t("ui.Planificador.leSobranDias", "le sobran días")}
            </span>
          )}
          {max > plan.reglas.maxSeguidos && (
            <span className="rounded-full px-1.5 font-semibold" style={ROJO}>
              {t("ui.Planificador.muchosSeguidos", "muchos días seguidos")}
            </span>
          )}
        </span>
      </td>
      {Array.from({ length: dias.length }, (_, i) => {
        const d = dias[i];
        const aus = (s.ausencias || []).find(
          (a) => d >= a.desde && d <= a.hasta,
        );
        const tu = turnoDe(plan, s, d);
        const fr = tu ? plan.franjas[tu.franja] : undefined;

        return (
          <td key={i} className={TD} style={{ borderColor: "var(--hairline)" }}>
            <div className={CELDA}>
              {aus ? (
                <span
                  className={`${BTN} block text-center font-medium capitalize`}
                  style={aus.tipo === "falta" ? ROJO : GRIS}
                >
                  {aus.tipo}
                </span>
              ) : tu ? (
                <button
                  className={BTN}
                  style={tono(fr)}
                  title={t(
                    "ui.Planificador.quitarCobertura",
                    "Quitar esta cobertura",
                  )}
                  onClick={() =>
                    cambiar(
                      (x) => {
                        quitar(x, tu.k!, s.id);
                        x.no[tu.k!] = 1;
                      },
                      { persona: s.id, d },
                    )
                  }
                >
                  {letra(fr)}
                  <small className="block truncate font-normal opacity-80">
                    {plan.puestos.find((x) => x.id === tu.puesto)?.nombre}
                  </small>
                </button>
              ) : (
                <button
                  className={`${BTN} border border-dashed font-medium`}
                  style={{
                    borderColor: "var(--hairline)",
                    color: "var(--ink-soft)",
                  }}
                  onClick={() =>
                    cambiar(
                      (x) => {
                        const q = x.personas.find((y) => y.id === s.id)!;
                        q.manual[d] = propio(q, d) === FRANCO ? LIBRE : FRANCO;
                      },
                      { persona: s.id, d },
                    )
                  }
                >
                  {propio(s, d) === FRANCO
                    ? t("ui.Planificador.franco", "Franco")
                    : t("ui.Planificador.disponible", "Disponible")}
                </button>
              )}
            </div>
          </td>
        );
      })}
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/* Las hojas                                                           */
/* ------------------------------------------------------------------ */

function Marco({
  titulo,
  detalle,
  cerrar,
  children,
}: {
  titulo: string;
  detalle?: string;
  cerrar: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(a) => !a && cerrar()}>
      <DialogContent className="max-w-lg gap-3">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {detalle && <DialogDescription>{detalle}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
const OPCION =
  "cg-focus flex w-full items-center gap-3 rounded-xl border p-2.5 text-left text-sm";
const marca = (on: boolean) => (
  <span
    className="grid h-5 w-5 flex-none place-items-center rounded-md border-2 text-xs font-extrabold"
    style={{
      borderColor: on ? "var(--brand)" : "var(--hairline)",
      color: "var(--brand-text)",
    }}
  >
    {on ? "✓" : ""}
  </span>
);
const estiloOpcion = (on: boolean): React.CSSProperties =>
  on
    ? { borderColor: "var(--brand)", background: "var(--brand-wash)" }
    : { borderColor: "var(--hairline)" };

function HojaHueco({
  plan,
  k,
  cambiar,
  cerrar,
  fechaDe,
}: {
  plan: Plan;
  k: string;
  cambiar: Cambiar;
  cerrar: () => void;
  fechaDe: (d: number) => string;
}) {
  const { t } = useTranslation();
  const { puesto, franja, d } = partir(k);
  const pu = plan.puestos.find((p) => p.id === puesto);

  if (!pu) return null;
  const fr = plan.franjas[franja];
  const ya = plan.cubre[k] || [];
  const fa = falta(plan, pu, franja, d);
  const [y, m, dd] = fechaDe(d).split("-").map(Number);
  const dia = new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString(
    localeActual(),
    { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" },
  );
  const lista = fa > 0 ? candidatos(plan, pu, franja, d) : [];
  const fijo = fijosDe(plan, pu.id).find((s) => !ya.includes(s.id));
  const porque = fijo && fa > 0 ? impedimento(plan, fijo, pu, franja, d) : null;
  let primero = true;

  return (
    <Marco
      cerrar={cerrar}
      detalle={`${dia} · ${t("ui.Planificador.pideN", { defaultValue: "pide {{n}}", n: pide(pu, franja, d) })}, ${fa > 0 ? t("ui.Planificador.faltaN", { defaultValue: "falta {{n}}", n: fa }) : t("ui.Planificador.completo", "completo")}`}
      titulo={`${pu.nombre} · ${fr ? (fr.nombre.includes(horario(fr)) ? fr.nombre : `${fr.nombre} ${horario(fr)}`) : ""}`}
    >
      {porque && (
        <p className="rounded-lg p-2.5 text-sm" style={AMBAR}>
          {t("ui.Planificador.suFijoNoPuede", {
            defaultValue:
              "Su sacafranco fijo es {{nombre}}, pero ese día no puede: {{motivo}}.",
            nombre: fijo!.nombre,
            motivo: porque.toLowerCase(),
          })}
        </p>
      )}
      <div className="flex max-h-[50dvh] flex-col gap-2 overflow-y-auto">
        {ya.map((id) => {
          const p = plan.personas.find((x) => x.id === id);

          return (
            <button
              key={id}
              className={OPCION}
              style={estiloOpcion(true)}
              onClick={() => {
                cambiar((x) => {
                  quitar(x, k, id);
                  x.no[k] = 1;
                });
                cerrar();
              }}
            >
              {marca(true)}
              <span className="min-w-0 flex-1">
                <b>{p?.nombre}</b>
                <span
                  className="block text-xs"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {t(
                    "ui.Planificador.cubreEsteTurno",
                    "Cubre este turno. Toca para quitarlo.",
                  )}
                </span>
              </span>
            </button>
          );
        })}
        {lista.map((c) => {
          const mejor = !c.impedimento && primero;

          if (!c.impedimento) primero = false;

          return (
            <button
              key={c.persona.id}
              className={OPCION}
              disabled={!!c.bloqueo}
              style={{
                ...estiloOpcion(false),
                opacity: c.bloqueo ? 0.55 : 1,
              }}
              onClick={() => {
                cambiar((x) => {
                  delete x.no[k];
                  poner(x, k, c.persona.id);
                });
                cerrar();
              }}
            >
              <span
                className="grid h-8 w-8 flex-none place-items-center rounded-full text-xs font-bold"
                style={{
                  background: "var(--brand-wash)",
                  color: "var(--brand-text)",
                }}
              >
                {c.persona.nombre
                  .split(/\s+/)
                  .map((x) => x.charAt(0))
                  .join("")
                  .slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1">
                <b>{c.persona.nombre}</b>
                <span
                  className="block text-xs"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {c.bloqueo ||
                    (c.sinPuesto
                      ? t(
                          "ui.Planificador.sinPuestoDisponible",
                          "Sin estación: disponible",
                        )
                      : c.extra
                        ? t(
                            "ui.Planificador.horaExtra",
                            "Está en franco: se paga como hora extra",
                          )
                        : `${c.suyo ? t("ui.Planificador.esSuPuesto", "Es su estación fija") + " · " : t("ui.Planificador.sacafranco", "Sacafranco") + " · "}${c.dias === 1 ? t("ui.Planificador.unDiaSemana", "1 día esta semana") : t("ui.Planificador.nDiasSemana", { defaultValue: "{{n}} días esta semana", n: c.dias })}`)}
                  {!c.bloqueo && c.aviso && (
                    <span
                      className="ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                      style={AMBAR}
                      title={t(
                        "ui.Planificador.avisoNoBloquea",
                        "Es un aviso, no una regla: la empresa decide.",
                      )}
                    >
                      {c.aviso}
                    </span>
                  )}
                </span>
              </span>
              {mejor && (
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                  style={{
                    background: "var(--brand)",
                    color: "var(--brand-ink)",
                  }}
                >
                  {t("ui.Planificador.mejorOpcion", "Mejor opción")}
                </span>
              )}
            </button>
          );
        })}
        {fa > 0 && !lista.length && (
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {t(
              "ui.Planificador.nadieDisponible",
              "No hay nadie disponible ese día.",
            )}
          </p>
        )}
      </div>
    </Marco>
  );
}

function HojaCobertura({
  plan,
  puestoId,
  cambiar,
  cerrar,
}: {
  plan: Plan;
  puestoId: string;
  cambiar: Cambiar;
  cerrar: () => void;
}) {
  const { t } = useTranslation();
  const pu = plan.puestos.find((p) => p.id === puestoId);

  if (!pu) return null;

  return (
    <Marco
      cerrar={cerrar}
      detalle={t(
        "ui.Planificador.coberturaDetalle",
        "Cuánta gente pide la estación. La hoja marca en rojo lo que falte y en ámbar lo que sobre.",
      )}
      titulo={t("ui.Planificador.coberturaDe", {
        defaultValue: "Qué pide {{puesto}}",
        puesto: pu.nombre,
      })}
    >
      <div className="flex flex-col gap-2">
        {COBERTURAS.map((c) => {
          const on =
            c.franjas.join() === pu.franjas.join() &&
            JSON.stringify(c.pide) === JSON.stringify(pu.pide);

          return (
            <button
              key={c.id}
              className={OPCION}
              style={estiloOpcion(on)}
              onClick={() => {
                cambiar((x) => {
                  const q = x.puestos.find((y) => y.id === puestoId)!;
                  const antes = q.franjas;

                  for (const f of c.franjas)
                    x.franjas[f] = x.franjas[f] || FRANJAS_EXTRA[f];
                  q.franjas = [...c.franjas];
                  q.pide = JSON.parse(JSON.stringify(c.pide));
                  // La rotación de su gente hablaba en las franjas de antes: se
                  // traduce por posición (la 1.ª de antes pasa a la 1.ª de ahora).
                  for (const p of x.personas) {
                    if (p.puesto !== puestoId) continue;
                    const tr = (cod: string) => {
                      const i = antes.indexOf(cod);
                      return i < 0
                        ? cod
                        : c.franjas[Math.min(i, c.franjas.length - 1)];
                    };

                    p.patron = p.patron.map(tr);
                    p.manual = {};
                  }
                  for (const k of Object.keys(x.no))
                    if (k.startsWith(`${puestoId}|`)) delete x.no[k];
                });
                cerrar();
              }}
            >
              {marca(on)}
              <span className="min-w-0 flex-1">
                <b>{c.nombre}</b>
                <span
                  className="block text-xs"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {c.detalle}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Marco>
  );
}

function HojaRotacion({
  plan,
  personaId,
  cambiar,
  cerrar,
}: {
  plan: Plan;
  personaId: string;
  cambiar: Cambiar;
  cerrar: () => void;
}) {
  const { t } = useTranslation();
  const p = plan.personas.find((x) => x.id === personaId);
  const [pat, setPat] = useState<string[]>(() => (p ? [...p.patron] : []));
  const [dobleDomingo, setDobleDomingo] = useState(!!p?.francoDobleDomingo);

  if (!p) return null;
  const saca = esSacafranco(p);
  const fr = saca
    ? []
    : plan.puestos.find((x) => x.id === p.puesto)?.franjas || [];
  const a = saca ? LIBRE : fr[0] || "D";
  const b = saca ? LIBRE : fr[1] || a;
  const orden = saca ? [LIBRE, FRANCO] : [...fr, FRANCO];
  const rep = (c: string, n: number) => Array<string>(n).fill(c);
  const listas: Array<{ n: string; p: string[] }> = [
    {
      n: t("ui.Planificador.rot52", "5 días de trabajo, 2 de franco"),
      p: [...rep(a, 5), FRANCO, FRANCO],
    },
    {
      n: t("ui.Planificador.rot61", "6 días de trabajo, 1 de franco"),
      p: [...rep(a, 6), FRANCO],
    },
    {
      n: t("ui.Planificador.rot44", "4 días de trabajo, 4 de franco"),
      p: [...rep(a, 4), ...rep(FRANCO, 4)],
    },
    { n: t("ui.Planificador.rot11", "Un día sí y un día no"), p: [a, FRANCO] },
    ...(a !== b
      ? [
          {
            n: t("ui.Planificador.rot222", "2-2-2 rotativo"),
            p: [a, a, b, b, FRANCO, FRANCO],
          },
          {
            n: t("ui.Planificador.rot442", "4-4-2 rotativo"),
            p: [...rep(a, 4), ...rep(b, 4), FRANCO, FRANCO],
          },
          {
            n: t(
              "ui.Planificador.rot71dn",
              "7-1 que alterna día y noche (rol peruano)",
            ),
            p: [...rep(a, 7), FRANCO, ...rep(b, 7), FRANCO],
          },
          {
            n: t("ui.Planificador.rot771", "7 de día, 7 de noche, 1 de franco"),
            p: [...rep(a, 7), ...rep(b, 7), FRANCO],
          },
        ]
      : []),
  ];
  const nombres: Record<string, string> = {};

  for (const id of Object.keys(plan.franjas))
    nombres[id] = letra(plan.franjas[id]);

  return (
    <Marco
      cerrar={cerrar}
      detalle={t(
        "ui.Planificador.rotacionDetalle",
        "Elige una lista o arma la tuya tocando cada día. Se repite sola hacia adelante.",
      )}
      titulo={t("ui.Planificador.rotacionDe", {
        defaultValue: "Rotación de {{nombre}}",
        nombre: corto(p.nombre),
      })}
    >
      <div className="flex max-h-[32dvh] flex-col gap-2 overflow-y-auto">
        {listas.map((l, i) => {
          const on = l.p.join() === pat.join();

          return (
            <button
              key={i}
              className={OPCION}
              style={estiloOpcion(on)}
              onClick={() => setPat([...l.p])}
            >
              {marca(on)}
              <span className="min-w-0 flex-1">
                <b>{l.n}</b>
                <span
                  className="block text-xs"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {t("ui.Planificador.seRepiteCada", {
                    defaultValue: "{{etq}} · se repite cada {{n}} días",
                    etq: etiqueta(l.p, nombres),
                    n: l.p.length,
                  })}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-sm">
        <b>{t("ui.Planificador.aTuMedida", "A tu medida")}</b>{" "}
        <span style={{ color: "var(--ink-soft)" }}>
          · {etiqueta(pat, nombres) || "—"} ·{" "}
          {t("ui.Planificador.cadaNDias", {
            defaultValue: "cada {{n}} días",
            n: pat.length,
          })}
        </span>
      </p>
      <div
        className="grid gap-1.5"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(3.4rem, 1fr))",
        }}
      >
        {pat.map((c, i) => {
          const f = plan.franjas[c];

          return (
            <button
              key={i}
              className={`${BTN} ${c === FRANCO || c === LIBRE ? "border border-dashed font-medium" : ""}`}
              style={
                c === FRANCO || c === LIBRE
                  ? { borderColor: "var(--hairline)", color: "var(--ink-soft)" }
                  : tono(f)
              }
              onClick={() =>
                setPat((x) =>
                  x.map((y, j) =>
                    j === i
                      ? orden[(orden.indexOf(y) + 1) % orden.length] || FRANCO
                      : y,
                  ),
                )
              }
            >
              {c === FRANCO
                ? t("ui.Planificador.franco", "Franco")
                : c === LIBRE
                  ? t("ui.Planificador.disp", "Disp.")
                  : letra(f)}
              <small className="block font-normal opacity-80">
                {t("ui.Planificador.diaN", {
                  defaultValue: "día {{n}}",
                  n: i + 1,
                })}
              </small>
            </button>
          );
        })}
      </div>
      {!saca && (
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            checked={dobleDomingo}
            className="mt-1"
            type="checkbox"
            onChange={(e) => setDobleDomingo(e.target.checked)}
          />
          <span>
            <b>
              {t(
                "ui.Planificador.dobleDomingo",
                "Si el franco cae en domingo, el lunes también descansa",
              )}
            </b>
            <span
              className="block text-xs"
              style={{ color: "var(--ink-soft)" }}
            >
              {t(
                "ui.Planificador.dobleDomingoDetalle",
                "La regla del rol peruano: el libre se va corriendo y la vuelta completa de un 7-1 son 49 días.",
              )}
            </span>
          </span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pat.length < 2}
          size="sm"
          variant="outline"
          onClick={() => setPat((x) => x.slice(0, -1))}
        >
          {t("ui.Planificador.quitarDia", "− quitar día")}
        </Button>
        <Button
          disabled={pat.length > 27}
          size="sm"
          variant="outline"
          onClick={() => setPat((x) => [...x, FRANCO])}
        >
          {t("ui.Planificador.anadirDia", "+ añadir día")}
        </Button>
        <span className="flex-1" />
        <Button
          size="sm"
          variant="brand"
          onClick={() => {
            cambiar((x) => {
              const q = x.personas.find((y) => y.id === personaId)!;
              q.patron = [...pat];
              q.desfase = 0;
              q.manual = {};
              q.francoDobleDomingo = dobleDomingo || undefined;
            });
            cerrar();
          }}
        >
          {t("ui.Planificador.usarRotacion", "Usar esta rotación")}
        </Button>
      </div>
    </Marco>
  );
}

function HojaFijos({
  plan,
  personaId,
  cambiar,
  cerrar,
}: {
  plan: Plan;
  personaId: string;
  cambiar: Cambiar;
  cerrar: () => void;
}) {
  const { t } = useTranslation();
  const s = plan.personas.find((x) => x.id === personaId);

  if (!s) return null;

  return (
    <Marco
      cerrar={cerrar}
      detalle={t(
        "ui.Planificador.fijosDetalle",
        "Cubre solo lo que falte en estas estaciones.",
      )}
      titulo={t("ui.Planificador.fijosDe", {
        defaultValue: "Puestos fijos de {{nombre}}",
        nombre: corto(s.nombre),
      })}
    >
      <div className="flex max-h-[55dvh] flex-col gap-2 overflow-y-auto">
        {plan.puestos.map((pu) => {
          const on = (s.fijos || []).includes(pu.id);
          const otros = fijosDe(plan, pu.id).filter((x) => x.id !== s.id);

          return (
            <button
              key={pu.id}
              className={OPCION}
              style={estiloOpcion(on)}
              onClick={() =>
                cambiar((x) => {
                  const q = x.personas.find((y) => y.id === personaId)!;
                  q.fijos = (q.fijos || []).includes(pu.id)
                    ? q.fijos!.filter((z) => z !== pu.id)
                    : [...(q.fijos || []), pu.id];
                })
              }
            >
              {marca(on)}
              <span className="min-w-0 flex-1">
                <b>{pu.nombre}</b>
                <span
                  className="block text-xs"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {pu.franjas
                    .map((f) => plan.franjas[f]?.nombre || f)
                    .join(" + ")}
                  {otros.length
                    ? ` · ${t("ui.Planificador.tambienLoCubre", { defaultValue: "también lo cubre {{nombre}}", nombre: otros.map((o) => corto(o.nombre)).join(", ") })}`
                    : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button size="sm" variant="brand" onClick={cerrar}>
          {t("ui.Planificador.listo", "Listo")}
        </Button>
      </div>
    </Marco>
  );
}

function HojaAusencia({
  plan,
  personaId,
  d0,
  hoy,
  fechaDe,
  cambiar,
  cerrar,
}: {
  plan: Plan;
  personaId: string;
  d0: number;
  hoy: number;
  fechaDe: (d: number) => string;
  cambiar: Cambiar;
  cerrar: () => void;
}) {
  const { t } = useTranslation();
  const p = plan.personas.find((x) => x.id === personaId);
  const [tipo, setTipo] = useState("vacaciones");
  // Arranca hoy si la semana en pantalla es la de hoy; si no, en su lunes.
  const [desde, setDesde] = useState(
    hoy >= d0 && hoy < d0 + 7 ? hoy : d0,
  );
  const [dias, setDias] = useState(7);
  /** El índice de un `YYYY-MM-DD`: la inversa de `fechaDe`. */
  const indiceDe = (fecha: string) => {
    const utc = (s: string) => {
      const [y, m, dd] = s.split("-").map(Number);

      return Date.UTC(y, m - 1, dd);
    };

    return Math.round((utc(fecha) - utc(fechaDe(0))) / 86400000);
  };

  if (!p) return null;
  const dia = (d: number, largo = false) => {
    const [y, m, dd] = fechaDe(d).split("-").map(Number);

    return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString(
      localeActual(),
      largo
        ? { day: "numeric", month: "short", timeZone: "UTC" }
        : { weekday: "short", day: "numeric", timeZone: "UTC" },
    );
  };
  const TIPOS = [
    ["falta", t("ui.Planificador.falta", "Falta (no se presentó)")],
    ["vacaciones", t("ui.Planificador.vacaciones", "Vacaciones")],
    ["permiso", t("ui.Planificador.permiso", "Permiso")],
    ["incapacidad", t("ui.Planificador.incapacidad", "Incapacidad")],
  ];

  return (
    <Marco
      cerrar={cerrar}
      detalle={t(
        "ui.Planificador.ausenciaDetalle",
        "Esos días no trabaja ni puede cubrir. La hoja enseña los turnos que quedan sin cubrir.",
      )}
      titulo={t("ui.Planificador.ausenciaDe", {
        defaultValue: "Ausencia de {{nombre}}",
        nombre: corto(p.nombre),
      })}
    >
      {(p.ausencias || []).length > 0 && (
        <div className="flex flex-col gap-1.5">
          {(p.ausencias || []).map((a, i) => (
            <button
              key={i}
              className={OPCION}
              style={estiloOpcion(true)}
              onClick={() =>
                cambiar((x) => {
                  const q = x.personas.find((y) => y.id === personaId)!;
                  q.ausencias = (q.ausencias || []).filter((_, j) => j !== i);
                })
              }
            >
              {marca(true)}
              <span className="min-w-0 flex-1">
                <b className="capitalize">{a.tipo}</b> · {dia(a.desde, true)}
                {a.hasta > a.desde ? ` – ${dia(a.hasta, true)}` : ""}
                <span
                  className="block text-xs"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {t("ui.Planificador.tocaParaQuitar", "Toca para quitarla.")}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {TIPOS.map(([id, nombre]) => (
          <button
            key={id}
            className="cg-focus rounded-full border px-3 py-1 text-sm font-semibold"
            style={estiloOpcion(tipo === id)}
            onClick={() => {
              setTipo(id);
              // Una falta es de un día; lo demás arranca en una semana.
              setDias(id === "falta" ? 1 : 7);
            }}
          >
            {nombre}
          </button>
        ))}
      </div>
      <p className="text-sm font-semibold">
        {t("ui.Planificador.empieza", "Empieza el")}
      </p>
      {/* La semana en pantalla a un toque, y cualquier otra fecha en el campo:
          unas vacaciones del mes que viene no obligan a cambiar de semana. */}
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 7 }, (_, i) => (
          <button
            key={i}
            className={`${BTN} border capitalize`}
            style={estiloOpcion(desde === d0 + i)}
            onClick={() => setDesde(d0 + i)}
          >
            {dia(d0 + i)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span style={{ color: "var(--ink-soft)" }}>
          {t("ui.Planificador.uOtraFecha", "u otra fecha")}
        </span>
        <input
          className="cg-input cg-focus h-8 px-2 text-sm"
          min={fechaDe(hoy - 7)}
          type="date"
          value={fechaDe(desde)}
          onChange={(e) => {
            if (e.target.value) setDesde(indiceDe(e.target.value));
          }}
        />
        <span className="tabular-nums" style={{ color: "var(--ink-soft)" }}>
          {dias > 1
            ? t("ui.Planificador.hastaEl", {
                defaultValue: "hasta el {{fecha}}",
                fecha: dia(desde + dias - 1, true),
              })
            : dia(desde, true)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">
          {t("ui.Planificador.dura", "Dura")}
        </span>
        <Button
          disabled={dias <= 1}
          size="sm"
          variant="outline"
          onClick={() => setDias((n) => Math.max(1, n - 1))}
        >
          −
        </Button>
        <span className="min-w-[4.5rem] text-center tabular-nums">
          {dias === 1
            ? t("ui.Planificador.unDia", "1 día")
            : t("ui.Planificador.nDias", {
                defaultValue: "{{n}} días",
                n: dias,
              })}
        </span>
        <Button
          disabled={dias >= 60}
          size="sm"
          variant="outline"
          onClick={() => setDias((n) => Math.min(60, n + 1))}
        >
          +
        </Button>
        {[7, 14, 30].map((n) => (
          <Button
            key={n}
            size="sm"
            variant="outline"
            onClick={() => setDias(n)}
          >
            {n}
          </Button>
        ))}
        <span className="flex-1" />
        <Button
          size="sm"
          variant="brand"
          onClick={() => {
            cambiar((x) => {
              const q = x.personas.find((y) => y.id === personaId)!;
              (q.ausencias = q.ausencias || []).push({
                desde,
                hasta: desde + dias - 1,
                tipo,
              });
            });
            cerrar();
          }}
        >
          {t("ui.Planificador.anadirAusencia", "Añadir ausencia")}
        </Button>
      </div>
    </Marco>
  );
}

function HojaReglas({
  plan,
  cambiar,
  cerrar,
}: {
  plan: Plan;
  cambiar: Cambiar;
  cerrar: () => void;
}) {
  const { t } = useTranslation();
  const r = plan.reglas;
  const fila = (
    titulo: string,
    detalle: string,
    valor: number,
    opciones: Array<[number, string]>,
    poner: (n: number) => void,
  ) => (
    <div>
      <p className="text-sm font-semibold">{titulo}</p>
      <p className="mb-1.5 text-xs" style={{ color: "var(--ink-soft)" }}>
        {detalle}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {opciones.map(([n, nombre]) => (
          <button
            key={n}
            className="cg-focus rounded-full border px-3 py-1 text-sm font-semibold"
            style={estiloOpcion(valor === n)}
            onClick={() => poner(n)}
          >
            {nombre}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <Marco
      cerrar={cerrar}
      detalle={t(
        "ui.Planificador.reglasDetalle",
        "Los límites de tu empresa. El Planificador los respeta cuando coloca solo a los sacafrancos; si tú eliges a alguien que los pasa, te avisa y te deja. Al cambiarlos se recoloca lo que el Planificador había puesto solo.",
      )}
      titulo={t("ui.Planificador.reglasDeCobertura", "Reglas para cubrir")}
    >
      {fila(
        t("ui.Planificador.reglaDescanso", "Descanso mínimo entre dos turnos"),
        t(
          "ui.Planificador.reglaDescansoDetalle",
          "Con 10 horas, quien sale de noche no entra de día esa mañana.",
        ),
        r.descansoMin,
        [
          [480, "8 h"],
          [600, "10 h"],
          [720, "12 h"],
          [1440, "24 h"],
        ],
        (n) =>
          cambiar((x) => {
            x.reglas.descansoMin = n;
          }),
      )}
      {fila(
        t("ui.Planificador.reglaSeguidos", "Días seguidos, como mucho"),
        t(
          "ui.Planificador.reglaSeguidosDetalle",
          "Contando su turno propio y lo que cubra.",
        ),
        r.maxSeguidos,
        [
          [5, "5"],
          [6, "6"],
          [7, "7"],
          [12, "12"],
        ],
        (n) =>
          cambiar((x) => {
            x.reglas.maxSeguidos = n;
          }),
      )}
      {fila(
        t("ui.Planificador.reglaHoras", "Horas por semana, como mucho"),
        t("ui.Planificador.reglaHorasDetalle", "De lunes a domingo."),
        r.maxHorasSemana,
        [
          [48, "48 h"],
          [60, "60 h"],
          [72, "72 h"],
          [84, "84 h"],
        ],
        (n) =>
          cambiar((x) => {
            x.reglas.maxHorasSemana = n;
          }),
      )}
      <div className="flex justify-end">
        <Button size="sm" variant="brand" onClick={cerrar}>
          {t("ui.Planificador.listo", "Listo")}
        </Button>
      </div>
    </Marco>
  );
}

function HojaPublicar({
  publicacion,
  cerrar,
  publicado,
  publicarAhora,
  recargar,
}: {
  publicacion: Publicacion;
  cerrar: () => void;
  publicado: () => void;
  /** Saves, then publishes on the server: everything or nothing. */
  publicarAhora: () => Promise<Publicado>;
  /** Re-read the live schedule keeping the draft on top. */
  recargar: () => void;
}) {
  const { t } = useTranslation();
  const [enCurso, setEnCurso] = useState(false);
  const [error, setError] = useState<{
    texto: string;
    conflictos: Conflict[];
    recargar: boolean;
  } | null>(null);
  const { cambios, noPublicables } = publicacion;
  /* La lista por persona (o puesto), no un muro de 87 renglones: «Guardia
     Demo: cubre Caseta 1 el 7, Caseta 3 el 10…». El texto de cada cambio
     empieza por el nombre; aquí se le quita para no repetirlo. */
  const grupos = useMemo(() => {
    const m = new Map<string, string[]>();

    for (const c of cambios) {
      const quien = c.quien || "";
      const que = quien
        ? c.texto.startsWith(`${quien}: `)
          ? c.texto.slice(quien.length + 2)
          : c.texto.startsWith(`${quien} `)
            ? c.texto.slice(quien.length + 1)
            : c.texto
        : c.texto;

      m.set(quien, [...(m.get(quien) || []), que]);
    }

    return [...m.entries()];
  }, [cambios]);
  const ir = async () => {
    setEnCurso(true);
    setError(null);
    try {
      const r = await publicarAhora();

      toast.success(
        t("ui.Planificador.publicadoOk", {
          defaultValue: "Publicado: {{n}} cambios ya están en el horario.",
          n: r.applied,
        }),
      );
      if (r.kept.length)
        toast.warning(
          t("ui.Planificador.seQuedaronConMarcaje", {
            defaultValue:
              "Esto no se aplicó porque el turno ya tiene marcaje y se queda: {{lista}}",
            lista: r.kept.map((k) => k.text).join(" · "),
          }),
          { duration: 12000 },
        );
      publicado();
    } catch (e: any) {
      if (e instanceof DraftConflict)
        setError({
          texto: e.message,
          conflictos: e.conflicts,
          recargar: [
            "scheduleChanged",
            "stationGone",
            "draftChanged",
            "draftMissing",
          ].includes(e.reason),
        });
      else
        setError({
          texto:
            e?.data?.message ||
            e?.message ||
            t("ui.Planificador.noSePublico", "No se publicó nada. Inténtalo de nuevo."),
          conflictos: [],
          recargar: false,
        });
    } finally {
      setEnCurso(false);
    }
  };
  const describir = (c: Conflict) =>
    [
      c.by ||
        t("ui.Planificador.otraPersona", "Otra persona"),
      c.kind === "assignment"
        ? t("ui.Planificador.cambioAsignacion", "cambió la asignación de")
        : c.kind === "mark"
          ? t("ui.Planificador.cambioMarca", "cambió una novedad de")
          : t("ui.Planificador.cambioTurno", "cambió un turno de"),
      [c.guard, c.station, c.day].filter(Boolean).join(" · "),
    ].join(" ");

  return (
    <Marco
      cerrar={cerrar}
      detalle={t(
        "ui.Planificador.publicarDetalleTodo",
        "Esto escribe en el horario real: lo verán la central, el Horario y los vigilantes en su app. Va todo de una vez: si un cambio falla, no se publica nada.",
      )}
      titulo={t("ui.Planificador.publicarTitulo", "Publicar el borrador")}
    >
      {error ? (
        <div className="flex flex-col gap-2">
          <p className="rounded-lg p-2.5 text-sm" style={ROJO}>
            {error.texto}
          </p>
          {error.conflictos.length > 0 && (
            <ul
              className="max-h-[40dvh] overflow-y-auto pl-5 text-sm"
              style={{ listStyle: "disc" }}
            >
              {error.conflictos.map((c, i) => (
                <li key={i}>{describir(c)}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {/* The dialog already has its «Cerrar» (×): this one says where it goes. */}
            <Button size="sm" variant="outline" onClick={cerrar}>
              {t("ui.Planificador.volverAlBorrador", "Volver al borrador")}
            </Button>
            {error.recargar && (
              <Button
                size="sm"
                variant="brand"
                onClick={() => {
                  cerrar();
                  recargar();
                }}
              >
                <RotateCcw size={14} />{" "}
                {t("ui.Planificador.recargarConLoNuevo", "Recargar con lo nuevo y revisar")}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          {cambios.length ? (
            <div>
              <p className="mb-1.5 text-sm font-semibold">
                {t("ui.Planificador.seVaAPublicar", {
                  defaultValue: "Se va a publicar ({{n}})",
                  n: cambios.length,
                })}
              </p>
              <div className="max-h-[36dvh] space-y-2 overflow-y-auto text-sm">
                {grupos.map(([quien, lista]) => (
                  <div key={quien || "—"}>
                    {quien && (
                      <div className="font-semibold">
                        {quien}
                        <span
                          className="ml-1.5 font-normal tabular-nums"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {lista.length}
                        </span>
                      </div>
                    )}
                    <ul className="pl-5" style={{ listStyle: "disc" }}>
                      {lista.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              {t(
                "ui.Planificador.nadaQuePublicar",
                "No hay nada que el horario real pueda recibir de este borrador.",
              )}
            </p>
          )}
          {noPublicables.length > 0 && (
            <div>
              <p
                className="mb-1.5 text-sm font-semibold"
                style={{ color: "var(--warn-text, var(--ink))" }}
              >
                {t("ui.Planificador.seQuedaEnBorrador", {
                  defaultValue: "Se queda en el borrador ({{n}})",
                  n: noPublicables.length,
                })}
              </p>
              <ul
                className="max-h-[24dvh] overflow-y-auto pl-5 text-sm"
                style={{ listStyle: "disc", color: "var(--ink-soft)" }}
              >
                {noPublicables.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {enCurso && (
              <span className="text-sm" style={{ color: "var(--ink-soft)" }}>
                {t("ui.Planificador.publicandoDeUnaVez", "Publicando todo de una vez…")}
              </span>
            )}
            <Button
              disabled={enCurso}
              size="sm"
              variant="outline"
              onClick={cerrar}
            >
              {t("ui.Planificador.cancelar", "Cancelar")}
            </Button>
            <Button
              disabled={!cambios.length || enCurso}
              size="sm"
              variant="brand"
              onClick={ir}
            >
              {enCurso ? (
                <Loader2 className="animate-spin" size={14} />
              ) : (
                <Send size={14} />
              )}{" "}
              {t("ui.Planificador.publicarN", {
                defaultValue: "Publicar {{n}}",
                n: cambios.length,
              })}
            </Button>
          </div>
        </>
      )}
    </Marco>
  );
}

/** A small mark on a cell someone changed live after the draft was read (phase 5). */
function MarcaEnVivo({ cambios }: { cambios: CambioEnVivo[] }) {
  const { t } = useTranslation();

  if (!cambios.length) return null;
  const c = cambios[0];
  const texto = t("ui.AvisoEnVivo.marca", {
    defaultValue: "Cambiado en vivo por {{quien}}: {{que}}",
    quien: c.by || "—",
    que: queCambio(t, c),
  });

  return (
    <span
      aria-label={texto}
      className="absolute right-0.5 top-0.5 z-10 inline-block size-2.5 rounded-full ring-2"
      role="img"
      style={{ background: "var(--warn)", ["--tw-ring-color" as any]: "var(--background)" }}
      title={texto}
    />
  );
}

/** «Cambiaron en vivo…»: stays until it is read or the draft is re-read. */
function FranjaEnVivo({
  cambios,
  onEntendido,
  onReleer,
}: {
  cambios: CambioEnVivo[];
  onEntendido: () => void;
  onReleer: () => void;
}) {
  const { t } = useTranslation();
  const primeros = cambios.slice(0, 3);
  const resto = cambios.length - primeros.length;

  return (
    <div
      className="mb-4 flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3 text-sm"
      role="status"
      style={{
        borderColor: "color-mix(in oklab, var(--warn) 55%, transparent)",
        background: "color-mix(in oklab, var(--warn) 12%, var(--background))",
      }}
    >
      <AlertTriangle className="mt-0.5 shrink-0" size={18} style={{ color: "var(--warn)" }} />
      {/* basis-64: on a phone the text keeps the row and the buttons wrap below. */}
      <div className="min-w-0 flex-1 basis-64">
        <p className="font-semibold">
          {t("ui.AvisoEnVivo.franjaTitulo", {
            defaultValue: "Cambiaron en vivo lo que este borrador también cambia ({{count}})",
            count: cambios.length,
          })}
        </p>
        <ul className="mt-1 space-y-0.5">
          {primeros.map((c, i) => (
            <li key={i} className="min-w-0 break-words">
              {t("ui.AvisoEnVivo.franjaLinea", {
                defaultValue: "{{que}} — {{quien}}",
                que: queCambio(t, c),
                quien: c.by || "—",
              })}
            </li>
          ))}
          {resto > 0 && (
            <li style={{ color: "var(--ink-soft)" }}>
              {t("ui.AvisoEnVivo.franjaMas", { defaultValue: "y {{count}} más", count: resto })}
            </li>
          )}
        </ul>
        <p className="mt-1" style={{ color: "var(--ink-soft)" }}>
          {t(
            "ui.AvisoEnVivo.franjaAyuda",
            "Las celdas con un punto cambiaron en vivo. «Ver lo nuevo» vuelve a leer el horario real con tus cambios encima; al publicar se revisa otra vez.",
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onReleer}>
          <RotateCcw size={14} /> {t("ui.AvisoEnVivo.releer", "Ver lo nuevo")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onEntendido}>
          {t("ui.AvisoEnVivo.entendido", "Entendido")}
        </Button>
      </div>
    </div>
  );
}
