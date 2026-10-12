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
  type Franja,
  type Persona,
  type Plan,
  type Puesto,
} from "@/lib/planificador/motor";
import { planDesdeHorarioReal, type PlanReal } from "@/lib/planificador/real";
import {
  planificarPublicacion,
  publicar,
  type Publicacion,
} from "@/lib/planificador/publicar";
import {
  estadoDelBorrador,
  firmaDe,
  guardarBorrador,
  leerBorrador,
  olvidarBorrador,
} from "@/lib/planificador/borrador";
import { useFrenoAlSalir } from "@/lib/useFrenoAlSalir";
import { confirmDialog } from "@/components/ui/confirmDialog";

/**
 * PROGRAMADOR › PLANIFICADOR
 *
 * Una hoja para ARMAR el horario como borrador: qué pide cada puesto, qué
 * rotación lleva cada persona y quién cubre lo que falta. Abre con la operación
 * real (la lee de `scheduler/overview`) y todo lo que se cambie aquí se queda
 * aquí: no escribe nada en el servidor ni mueve un turno de nadie.
 *
 * Toda la lógica vive en `lib/planificador/motor` (con sus mil casos); este
 * archivo sólo pinta y traduce toques en llamadas al motor.
 */

/** `localStorage`, o nada si el navegador lo bloquea. */
const almacen = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

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
  const tenantId = localStorage.getItem("tenantId") || "";
  const base = useMemo(() => lunesDe(hoyEnLaEmpresa()), []);
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
  /* El borrador se guarda en el navegador para no perderlo al cerrar la
     pestaña. Sólo la PRIMERA carga lo recupera; «Volver al horario real»,
     «Descartar» y publicar lo tiran. La firma es la del horario real leído:
     un borrador hecho contra otro horario no se devuelve. */
  const recuperarRef = useRef(true);
  const firmaRef = useRef("");
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

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    setCargando(true);
    try {
      const [ov, rot]: any[] = await Promise.all([
        ApiService.get(
          `/tenant/${tenantId}/scheduler/overview?startDate=${sumaDias(base, -ANTES)}&endDate=${sumaDias(base, 59)}`,
        ),
        ApiService.get(`/tenant/${tenantId}/rotation-styles`),
      ]);
      const r = planDesdeHorarioReal(
        ov?.data || ov || {},
        rot?.rows || rot?.data?.rows || [],
        base,
        zonaDeLaEmpresa(),
        60,
      );

      limpiar(r.plan, -ANTES, DESPUES);
      pila.current = [];
      setLeido({ ...r, plan: copiar(r.plan) });
      {
        const lista: any[] = (ov?.data || ov || {}).assignments || [];
        const m: Record<string, AsignacionCruda> = {};

        for (const a of lista) if (a?.id) m[String(a.id)] = a;
        setCrudas(m);
      }
      const firma = firmaDe(r.plan);
      let plan = r.plan;
      let toques = 0;

      firmaRef.current = firma;
      if (recuperarRef.current) {
        recuperarRef.current = false;
        const g = leerBorrador(almacen(), tenantId, base, firma);

        if (g.tipo === "ok") {
          plan = g.plan;
          toques = g.toques;
          toast.message(
            t(
              "ui.Planificador.borradorRecuperado",
              "Se recuperó tu borrador sin publicar. Publícalo o descártalo.",
            ),
          );
        } else if (g.tipo === "caducado") {
          olvidarBorrador(almacen(), tenantId);
          toast.message(
            t(
              "ui.Planificador.borradorCaducado",
              "Tenías un borrador sin publicar, pero el horario real cambió desde entonces y se descartó.",
            ),
          );
        }
      } else olvidarBorrador(almacen(), tenantId);
      setPlan(plan);
      setParecido(r.comparados ? r.coincidencia : null);
      setCambios(toques);
      setSemana(0);
    } catch {
      toast.error(
        t("ui.Planificador.noSePudoCargar", "No se pudo cargar el horario."),
      );
    } finally {
      setCargando(false);
    }
  }, [tenantId, base, t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Todo cambio pasa por aquí: copia, aplica, limpia y guarda para deshacer. */
  const cambiar = useCallback(
    (fn: (p: Plan) => void) => {
      const actual = planRef.current;

      if (!actual) return;
      pila.current.push(JSON.stringify(actual));
      if (pila.current.length > 40) pila.current.shift();
      const p = copiar(actual);

      fn(p);
      limpiar(p, d0 - ANTES, d0 + DESPUES);
      setPlan(p);
      setCambios((n) => n + 1);
    },
    [d0],
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

    limpiar(p, s * 7 - ANTES, s * 7 + DESPUES);
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
  const publicacion = useMemo(
    () =>
      plan && leido
        ? planificarPublicacion(leido.plan, plan, leido.enlace, {
            tenantId,
            base,
            hoy: hoyIdx,
            dias: DESPUES,
            fechaDe: (d) => sumaDias(base, d),
            instanteDe: (d, min) =>
              instanteEnLaEmpresa(
                sumaDias(base, d + Math.floor(min / 1440)),
                Math.floor((min % 1440) / 60),
                min % 60,
              ).toISOString(),
          })
        : null,
    [plan, leido, tenantId, base, hoyIdx],
  );
  const borrador = estadoDelBorrador(publicacion?.cambios.length, cambios);

  // Guardar el borrador tocado (con un respiro: un arrastre son muchos toques).
  useEffect(() => {
    if (!plan || !leido || !firmaRef.current) return;
    if (!borrador.avisarAlSalir) {
      if (!cambios) return;
      olvidarBorrador(almacen(), tenantId);

      return;
    }
    const id = window.setTimeout(
      () =>
        guardarBorrador(almacen(), tenantId, {
          base,
          firma: firmaRef.current,
          toques: cambios,
          plan,
        }),
      600,
    );

    return () => window.clearTimeout(id);
  }, [plan, leido, cambios, borrador.avisarAlSalir, tenantId, base]);

  useFrenoAlSalir(borrador.avisarAlSalir, () =>
    confirmDialog({
      title: t("ui.Planificador.salirTitulo", "Hay cambios sin publicar"),
      message: t("ui.Planificador.salirMensaje", {
        defaultValue:
          "{{n}} cambios del Planificador no están en el horario real. Si sales, se quedan como borrador en este navegador: no los verán la central, el Horario ni los vigilantes hasta que pulses «Publicar».",
        n: borrador.pendientes,
      }),
      confirmText: t("ui.Planificador.salirSinPublicar", "Salir sin publicar"),
      cancelText: t("ui.Planificador.seguirAqui", "Seguir aquí"),
      tone: "danger",
    }),
  );

  const descartar = async () => {
    if (
      !(await confirmDialog({
        title: t("ui.Planificador.descartarTitulo", "Descartar el borrador"),
        message: t("ui.Planificador.descartarMensaje", {
          defaultValue:
            "Se pierden los {{n}} cambios sin publicar y el Planificador vuelve a mostrar el horario real.",
          n: borrador.pendientes,
        }),
        confirmText: t("ui.Planificador.descartar", "Descartar borrador"),
        tone: "danger",
      }))
    )
      return;
    olvidarBorrador(almacen(), tenantId);
    void cargar();
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
  }, [plan, busca, soloHuecos, d0]);

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
    busca.trim() !== "" || soloHuecos || puestosVisibles.length <= 2;
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
              <Button disabled={cargando} variant="outline" onClick={cargar}>
                <RotateCcw size={15} />{" "}
                {t("ui.Planificador.volverAlReal", "Volver al horario real")}
              </Button>
              <Button
                disabled={!publicacion?.cambios.length}
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
              {cambios > 0 && (
                <StatusBadge tone="slate">
                  {cambios === 1
                    ? t("ui.Planificador.unCambio", "1 cambio en el borrador")
                    : t("ui.Planificador.cambios", {
                        defaultValue: "{{n}} cambios en el borrador",
                        n: cambios,
                      })}
                </StatusBadge>
              )}
            </>
          }
          icon={<CalendarRange />}
          subtitle={t(
            "ui.Planificador.subtitulo",
            "Di qué pide cada puesto, dale a cada quien su rotación y deja que los sacafrancos cubran lo que falta.",
          )}
          title={t("ui.Planificador.titulo", "Planificador")}
        />

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
              "Todavía no hay puestos que planificar.",
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
                    "Buscar puesto o vigilante",
                  )}
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  checked={soloHuecos}
                  type="checkbox"
                  onChange={(e) => setSoloHuecos(e.target.checked)}
                />
                {t(
                  "ui.Planificador.soloConHuecos",
                  "Sólo puestos con algo sin cubrir",
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
              <table
                className="border-separate border-spacing-0 text-sm tabular-nums"
                style={{
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
                        "Puesto y vigilante",
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
                                      plan={plan}
                                      pu={pu}
                                      cambiar={cambiar}
                                      setHoja={setHoja}
                                      asignar={setAsignando}
                                      confirmando={confirmarQuitar}
                                      quitar={quitarVigilante}
                                      sustituir={setSustituyendo}
                                      editar={setEditando}
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
                            "cubren lo que falta en sus puestos fijos",
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
                            setAgregandoSf(puestosVisibles.map((x) => x.id))
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
                      editar={setEditando}
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
                            {t("ui.Planificador.sinPuesto", "Sin puesto")}{" "}
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
                        editar={setEditando}
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
                "Toca un turno para cambiar ese día, la rotación para cambiarla entera, y lo rojo para ver quién puede cubrirlo. El punto ● marca lo que cubre el sacafranco fijo del puesto.",
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
              void cargar();
            }}
          />
        )}
      </PageContainer>
    </AppLayout>
  );
}

type Cambiar = (fn: (p: Plan) => void) => void;
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
                "Cambiar lo que pide el puesto",
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
                        "Cambiar lo que pide el puesto",
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

          return (
            <td
              key={i}
              className={TD}
              style={{
                borderColor: "var(--hairline)",
                background:
                  "color-mix(in oklab, var(--background) 94%, var(--ink) 6%)",
              }}
            >
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
                  {p.patron.length > 1 && (
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
                            "Quitar del puesto",
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
                  cambiar((x) => {
                    const q = x.personas.find((y) => y.id === p.id)!;
                    q.manual[d] =
                      orden[(orden.indexOf(propio(q, d)) + 1) % orden.length];
                  });

                return (
                  <td
                    key={i}
                    className={TD}
                    style={{ borderColor: "var(--hairline)" }}
                  >
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
                    "Nadie asignado a este puesto.",
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
              ? t("ui.Planificador.unPuestoFijo", "1 puesto fijo")
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
          {s.patron.length > 1 && (
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
                    cambiar((x) => {
                      quitar(x, tu.k!, s.id);
                      x.no[tu.k!] = 1;
                    })
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
                    cambiar((x) => {
                      const q = x.personas.find((y) => y.id === s.id)!;
                      q.manual[d] = propio(q, d) === FRANCO ? LIBRE : FRANCO;
                    })
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
                          "Sin puesto: disponible",
                        )
                      : c.extra
                        ? t(
                            "ui.Planificador.horaExtra",
                            "Está en franco: se paga como hora extra",
                          )
                        : `${c.suyo ? t("ui.Planificador.esSuPuesto", "Es su puesto fijo") + " · " : t("ui.Planificador.sacafranco", "Sacafranco") + " · "}${c.dias === 1 ? t("ui.Planificador.unDiaSemana", "1 día esta semana") : t("ui.Planificador.nDiasSemana", { defaultValue: "{{n}} días esta semana", n: c.dias })}`)}
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
        "Cuánta gente pide el puesto. La hoja marca en rojo lo que falte y en ámbar lo que sobre.",
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
        "Cubre solo lo que falte en estos puestos.",
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
}: {
  publicacion: Publicacion;
  cerrar: () => void;
  publicado: () => void;
}) {
  const { t } = useTranslation();
  const [enCurso, setEnCurso] = useState<[number, number] | null>(null);
  const [fallos, setFallos] = useState<string[] | null>(null);
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
  const api = {
    post: (r: string, c: any) => ApiService.post(r, c),
    put: (r: string, c: any) => ApiService.put(r, c),
    del: (r: string) => ApiService.delete(r),
  };
  const ir = async () => {
    setEnCurso([0, cambios.length]);
    const f = await publicar(publicacion, api, (h, n) => setEnCurso([h, n]));

    setEnCurso(null);
    if (f.length) {
      setFallos(f);
      toast.error(
        t("ui.Planificador.publicadoConFallos", {
          defaultValue:
            "Publicado con {{n}} fallos. El resto ya está en el horario.",
          n: f.length,
        }),
      );
    } else {
      toast.success(
        t("ui.Planificador.publicadoOk", {
          defaultValue: "Publicado: {{n}} cambios ya están en el horario.",
          n: cambios.length,
        }),
      );
      publicado();
    }
  };

  return (
    <Marco
      cerrar={cerrar}
      detalle={t(
        "ui.Planificador.publicarDetalle",
        "Esto escribe en el horario real: lo verán la central, el Horario y los vigilantes en su app.",
      )}
      titulo={t("ui.Planificador.publicarTitulo", "Publicar el borrador")}
    >
      {fallos ? (
        <div className="flex flex-col gap-2">
          <p className="rounded-lg p-2.5 text-sm" style={ROJO}>
            {t("ui.Planificador.noSePudieron", {
              defaultValue: "{{n}} cambios no se pudieron publicar:",
              n: fallos.length,
            })}
          </p>
          <ul
            className="max-h-[40dvh] overflow-y-auto pl-5 text-sm"
            style={{ listStyle: "disc" }}
          >
            {fallos.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button size="sm" variant="brand" onClick={publicado}>
              {t("ui.Planificador.verHorario", "Ver cómo quedó")}
            </Button>
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
              <span
                className="text-sm tabular-nums"
                style={{ color: "var(--ink-soft)" }}
              >
                {enCurso[0]} / {enCurso[1]}
              </span>
            )}
            <Button
              disabled={!!enCurso}
              size="sm"
              variant="outline"
              onClick={cerrar}
            >
              {t("ui.Planificador.cancelar", "Cancelar")}
            </Button>
            <Button
              disabled={!cambios.length || !!enCurso}
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
