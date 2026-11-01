import { cicloDe as leerCiclo } from "@/lib/secuenciaDeRotacion";
import { urlDePatrones } from "@/lib/patronesVigentes";
import { useTranslation } from "react-i18next";
import {
  localToday,
  rotationDseOf,
  nextRestDates,
  weeklyRestWeekday,
  shortRestLabel,
  type RotationCycle,
} from "@/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarRange,
  Check,
  Loader2,
  Moon,
  Repeat,
  Search,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { ApiService } from "@/services/api/apiService";
import { Modal, Segmented } from "@/components/kit";
import OperationSetupAlert, {
  needsOperationSetup,
} from "@/pages/admin/post-sites/components/OperationSetup/OperationSetupAlert";
import {
  FIELD_CLS_LG,
  LabeledField,
} from "@/pages/admin/clientes/components/_shared/tab-kit";
import { Button } from "@/components/ui/button";
import SecuenciaPropiaSelect from "@/components/schedule/SecuenciaPropiaSelect";
import { nombreDeTramo } from "@/components/schedule/tramos";

import type { Station } from "@/types";

import { localeActual } from "@/lib/localeActual";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";
import { esEvento, eventoTerminado, ventanaDeLaPlaza } from "@/lib/eventos";
import {
  AvisoFechasDelEvento,
  useCandidatosLibres,
  useSede,
  useVigilantesOrdenados,
} from "@/components/post-sites/EventoDeLaSede";
import { todosLosVigilantes } from "@/lib/listarCompleto";
/** «19:00|07:00» a partir de dos horas («19:00:00»); vacío si falta alguna. */
const claveVentana = (ini?: string | null, fin?: string | null) => {
  const a = String(ini || "").slice(0, 5);
  const b = String(fin || "").slice(0, 5);

  return /^\d{2}:\d{2}$/.test(a) && /^\d{2}:\d{2}$/.test(b) ? `${a}|${b}` : "";
};
// Local YYYY-MM-DD (avoid toISOString — it shifts day in negative-UTC zones).
const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

interface StationDetail extends Station {
  startingTimeInDay?: string | null;
  finishTimeInDay?: string | null;
}

// A scheduler position row from `/station/:id/positions`.
interface PositionRow {
  id: string;
  type?: string;
  sortOrder?: number;
  startTime?: string | null;
  endTime?: string | null;
  rotationStyleId?: string | null;
}
// A rotation style (patrón) — dayShifts/nightShifts/restDays define the cycle.
interface RotationStyleRow extends RotationCycle {
  id: string;
  name?: string;
}
// A raw shift row from `/shift` (only the fields this modal reads).
interface ShiftRow {
  id?: string;
  startTime?: string;
  start?: string;
  endTime?: string;
  end?: string;
}
// A guard autocomplete row.
interface GuardAutoRow {
  guardId?: string;
  id?: string;
  value?: string;
  fullName?: string;
  name?: string;
  label?: string;
  email?: string;
}

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
 * station's patrón de rotación. "Turno único" creates a one-off shift.
 * Self-contained: loads its own guards + positions.
 *
 * La rotación de la estación es el DEFECTO y sigue siendo lo normal. Desde
 * 2026-09-06 se puede además darle a un vigilante concreto SU secuencia
 * («Secuencia de este vigilante»): hay estaciones —Batallón Sur, 07:00–23:00 en
 * dos bloques— donde el fijo 1 hace 2 mañanas y 2 tardes y el fijo 2 hace 3 y 2,
 * y no hay forma de escribir eso con un solo ciclo por estación.
 */
export default function ShiftAssignModal({
  open,
  onClose,
  onSaved,
  station,
  stationId,
  postSiteId,
  presetGuardId,
}: Props) {
  const { t } = useTranslation();
  const tenantId = (station?.tenantId ||
    localStorage.getItem("tenantId") ||
    "") as string;

  const [assignMode, setAssignMode] = useState<"single" | "rotation">(
    "rotation",
  );
  /* La sede del puesto. Si no dice qué servicio presta, aquí no se asigna a
     nadie: se enseña el aviso con el camino y el botón queda cerrado. Es el
     mismo candado que pone el servidor (`exigirSedeConfigurada`). */
  /* Por el caché compartido (`useSede`): la ficha del puesto ya la leyó. */
  const sede = useSede(postSiteId, open);
  const sedeSinConfigurar = !!sede && needsOperationSetup(sede);
  /* Sede-EVENTO: no hay rotación, ni fecha de inicio, ni fin, ni ciclo. Se
     elige plaza y vigilante; el servidor pone las fechas con la vigencia. */
  const evento = esEvento(sede);
  const eventoAcabado = evento && eventoTerminado(sede);
  const [shiftGuard, setShiftGuard] = useState("");
  const [guardsOptions, setGuardsOptions] = useState<
    { id: string; label: string }[]
  >([]);
  const [loadingGuards, setLoadingGuards] = useState(false);
  const [saving, setSaving] = useState(false);
  // QA-97: the one-off shift awaited the current shifts BEFORE marking itself
  // as saving, so a double click sent two requests. Set synchronously.
  const savingRef = useRef(false);
  // The rotation PHASE comes from the station position (staggered), not a date —
  // so we don't ask for one (no date input). Shifts simply begin today.
  const [rotationStartDate, setRotationStartDate] = useState(() =>
    localToday(),
  );
  // Optional end date: assign the guard to the station only until this date (e.g.
  // temporary cover). Empty ⇒ indefinite. Backend already supports endDate.
  const [rotationEndDate, setRotationEndDate] = useState("");
  /** Secuencia propia del vigilante. Vacío = hereda la de la estación. */
  const [secuenciaPropia, setSecuenciaPropia] = useState("");
  const [rotationStyles, setRotationStyles] = useState<RotationStyleRow[]>([]);
  const [selectedPositionId, setSelectedPositionId] = useState("");
  /* En qué día de su ciclo entra el vigilante en la fecha de inicio (0 = el
     primer día de trabajo). «Entro hoy en la noche 3» es lo normal cuando se
     releva a alguien a mitad de ciclo; sin esto había que falsear la fecha. */
  const [cycleStartIndex, setCycleStartIndex] = useState(0);
  /** Enseñar el selector de ciclo propio (escondido: el puesto ya tiene el suyo). */
  const [mostrarSecuencia, setMostrarSecuencia] = useState(false);
  /* El ciclo de la estación cuando quien abre el popup no lo trae (el
     Planificador sólo conoce el puesto): se pide a la ficha. */
  const [rotEstacion, setRotEstacion] = useState<string | null>(null);
  const rotacionEstacion = (station as any)?.rotationStyleId ?? rotEstacion;
  /* El desplegable de vigilantes es propio: un buscador sobre los DISPONIBLES
     (sin asignación activa), no un <select> con doscientos nombres. */
  const [filtroVigilante, setFiltroVigilante] = useState("");
  const [listaAbierta, setListaAbierta] = useState(false);
  const [shiftStart, setShiftStart] = useState("");
  const [shiftEnd, setShiftEnd] = useState("");
  const [positions, setPositions] = useState<PositionRow[]>([]);
  // Occupancy (tenant-wide active rotations) so we never offer a vigilante who
  // already has an assignment, nor a puesto that's already taken.
  const [occupiedGuardIds, setOccupiedGuardIds] = useState<Set<string>>(
    new Set(),
  );
  const [occupiedPositionIds, setOccupiedPositionIds] = useState<Set<string>>(
    new Set(),
  );
  /* Evento: asignaciones puntuales de ESTA estación agrupadas por su ventana
     («19:00|07:00» → nombres). Ver `positionOptions`. */
  const [puntualesPorVentana, setPuntualesPorVentana] = useState<
    Record<string, string[]>
  >({});

  // Assignable positions (puestos). Fijos shown as "Vigilante 1/2…" (they rotate
  // through day AND night, staggered by the engine); sacafranco shown separately.
  // A puesto already taken is flagged `occupied` (disabled in the UI).
  /* ── QUÉ TRAMO ES CADA PLAZA ──────────────────────────────────────────────
     Las plazas se llamaban «Vigilante 1» y «Vigilante 2» y nada más. En un
     puesto de 24 h eso ya era ambiguo; en una estación partida en tramos
     —07:00–15:00 y 15:00–23:00— es directamente indescifrable: el que asigna no
     tiene forma de saber si el de arriba es el de la mañana o el de la tarde, y
     el tramo lo decide EXACTAMENTE esta elección. Se enseñan las horas. */
  const positionOptions = useMemo(() => {
    const fijos = positions.filter(
      (p: PositionRow) => (p.type || "fijo") !== "sacafranco",
    );
    const sacas = positions.filter(
      (p: PositionRow) => (p.type || "fijo") === "sacafranco",
    );
    const hhmm = (v?: string | null) => String(v || "").slice(0, 5);
    // Sólo se nombra el tramo cuando hay más de uno: en un puesto de un solo
    // bloque la etiqueta no distingue nada y sobra.
    const variasVentanas =
      new Set(fijos.map((p) => `${hhmm(p.startTime)}|${hhmm(p.endTime)}`))
        .size > 1;
    /* ── EVENTO: LA OCUPACIÓN VA POR VENTANA, NO POR PLAZA ───────────────────
       La asignación de un evento se guarda sin plaza y con las horas de la
       elegida, así que `occupiedPositionIds` nunca se llenaba y todas las
       plazas salían libres. Si hay 2 asignaciones de 19:00–07:00 y 3 plazas
       con esa ventana, las 2 primeras (por orden) se dan por cubiertas. */
    const usadasPorVentana: Record<string, number> = {};
    const cubiertaPor = (p: PositionRow): string | null => {
      if (!evento) return null;
      const k = claveVentana(p.startTime, p.endTime);

      if (!k) return null;
      const quienes = puntualesPorVentana[k] || [];
      const n = usadasPorVentana[k] || 0;

      if (n >= quienes.length) return null;
      usadasPorVentana[k] = n + 1;

      return quienes[n] || "—";
    };

    return [
      ...fijos.map((p: PositionRow, i: number) => {
        const ini = hhmm(p.startTime);
        const fin = hhmm(p.endTime);
        const horas = ini && fin ? `${ini}–${fin}` : "";
        const cubierta = cubiertaPor(p);

        return {
          id: p.id,
          label: t("ui.AsignacionEditModal.vigilanteN", {
            defaultValue: "Vigilante {{n}}",
            n: i + 1,
          }),
          horas,
          tramo: variasVentanas && ini ? nombreDeTramo(ini) : "",
          type: "fijo" as const,
          occupied: occupiedPositionIds.has(String(p.id)) || cubierta !== null,
          /** Evento: quién cubre ya esta plaza (por su ventana). */
          cubiertaPor: cubierta,
        };
      }),
      ...sacas.map((p: PositionRow, i: number) => ({
        id: p.id,
        label:
          sacas.length > 1
            ? t("ui.AsignacionEditModal.sacafrancoN", {
                defaultValue: "Sacafranco {{n}}",
                n: i + 1,
              })
            : t("clients.assignGuards.roleSf", "Sacafranco"),
        horas: "",
        tramo: "",
        type: "sacafranco" as const,
        occupied: occupiedPositionIds.has(String(p.id)),
        cubiertaPor: null as string | null,
      })),
    ];
  }, [positions, occupiedPositionIds, evento, puntualesPorVentana, t]);

  // Vigilantes free to assign (drop anyone with an active rotation anywhere).
  const availableGuards = useMemo(
    () => guardsOptions.filter((g) => !occupiedGuardIds.has(String(g.id))),
    [guardsOptions, occupiedGuardIds],
  );

  /* ── EVENTO: QUIÉN ESTÁ LIBRE EN ESAS HORAS ──────────────────────────────
     Tener puesto fijo no descarta a nadie: el de 07–19 puede ir a un evento
     de 20–02. Lo que cuenta es si sus turnos se CRUZAN con la plaza del
     evento, y eso lo contesta el servidor (`/coverage/candidates`). Los libres
     van primero; los ocupados se marcan pero se pueden elegir —si el choque
     es real, el servidor lo rechaza con un mensaje que se enseña tal cual—. */
  const ventanaEvento = useMemo(
    () =>
      evento
        ? ventanaDeLaPlaza(
            sede,
            positions.find((p) => p.id === selectedPositionId) ?? null,
          )
        : null,
    [evento, sede, positions, selectedPositionId],
  );
  const { libres, cargando: cargandoLibres } = useCandidatosLibres(
    stationId,
    ventanaEvento,
    open && evento && !eventoAcabado,
  );
  const vigilantesDelEvento = useVigilantesOrdenados(
    guardsOptions,
    evento ? libres : null,
  );
  const ocupadoEnEvento = useMemo(
    () =>
      new Set(
        vigilantesDelEvento
          .filter((g) => g.libre === false)
          .map((g) => String(g.id)),
      ),
    [vigilantesDelEvento],
  );

  // Live rest-day preview for the selected fijo puesto. THE PHASE IS THE START DATE:
  // the cycle's day-0 (first work day) is the guard's fecha de inicio, so the planner
  // sees "empieza X → descansa Y" and adjusts the start date until the libre is right.
  // No offset knob — the start date is the single control (matches the backend).
  const restPreview = useMemo(() => {
    const pos = positions.find((p) => p.id === selectedPositionId);

    if (!pos || (pos.type || "fijo") === "sacafranco") return null;
    // La vista previa tiene que mirar el MISMO ciclo que va a generar el
    // backend: con secuencia propia elegida, la suya; si no, la de la plaza
    // (ciclo por plaza); si no, la de la estación.
    const style = rotationStyles.find(
      (s) =>
        String(s.id) ===
        String(secuenciaPropia || pos.rotationStyleId || rotacionEstacion),
    );

    if (!style) return null;
    const cycle = leerCiclo(style).largo;

    if (cycle <= 0 || !rotationStartDate) return null;
    const start = new Date(rotationStartDate + "T12:00:00");
    // La fase es la fecha de inicio MENOS el día de ciclo en que entra (como
    // `phaseFromStartDate` en el servidor).
    const offset =
      (((rotationDseOf(start) - cycleStartIndex) % cycle) + cycle) % cycle;
    /* Las REGLAS y el ANCLA: con descanso dominical el ciclo se corre un día en
       cada domingo, y sin pasarlas esta vista previa prometía francos que el
       cuadrante no iba a cumplir. */
    const dates = nextRestDates(
      style,
      offset,
      start,
      style.restDays >= 2 ? 2 : 1,
      45,
      {
        alternatesDayNight: (style as any).alternatesDayNight,
        sundayDoubleRest: (style as any).sundayDoubleRest,
      },
      rotationDseOf(start),
    );

    return {
      weekday: weeklyRestWeekday(style, offset, {
        alternatesDayNight: (style as any).alternatesDayNight,
        sundayDoubleRest: (style as any).sundayDoubleRest,
      }),
      dates,
      startWeekday: start.toLocaleDateString(localeActual(), {
        timeZone: zonaDeLaEmpresa(),
        weekday: "long",
        day: "numeric",
        month: "short",
      }),
    };
  }, [
    positions,
    selectedPositionId,
    rotationStyles,
    station,
    rotationStartDate,
    secuenciaPropia,
    cycleStartIndex,
  ]);

  /* ── LOS DÍAS DEL CICLO, CON NOMBRE ─────────────────────────────────────
     Para elegir en cuál entra: «día 1 de 4 … noche 3 de 4 … libre 2 de 2».
     El primer bloque es el tramo PROPIO de la plaza y el segundo el espejo
     (así cuenta el motor `dayShifts`/`nightShifts`); el espejo empieza donde
     acaba la ventana propia. */
  const diasDelCiclo = useMemo(() => {
    const pos = positions.find((p) => p.id === selectedPositionId);

    if (!pos || (pos.type || "fijo") === "sacafranco") return [];
    const style = rotationStyles.find(
      (s) =>
        String(s.id) ===
        String(secuenciaPropia || pos.rotationStyleId || rotacionEstacion),
    );

    if (!style) return [];
    const propio = nombreDeTramo(
      pos.startTime || station?.startingTimeInDay || "07:00",
    );
    const espejo = nombreDeTramo(
      pos.endTime || station?.finishTimeInDay || "19:00",
    );
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const out: { k: number; label: string }[] = [];
    let k = 0;
    // Plaza de día entero (24×24) o un solo tramo: no hay espejo, los dos
    // bloques son trabajo seguido en la misma ventana.
    const unSoloTramo = propio === espejo;
    const trabajo = (style.dayShifts || 0) + (style.nightShifts || 0);
    const leido = leerCiclo(style);

    // Secuencia libre: un día por letra, tal cual está escrita.
    if (leido.secuencia)
      return leido.secuencia.split("").map((ch, idx) => ({
        k: idx,
        label:
          ch === "L"
            ? `${t("ui.ShiftAssignModal.libre", "Libre")} ${idx + 1} de ${leido.largo}`
            : unSoloTramo || ch === "D"
              ? `${unSoloTramo ? t("ui.ShiftAssignModal.trabajo", "Trabajo") : cap(propio)} ${idx + 1} de ${leido.largo}`
              : `${cap(espejo)} ${idx + 1} de ${leido.largo}`,
      }));

    for (let i = 0; i < (style.dayShifts || 0); i++, k++)
      out.push({
        k,
        label: unSoloTramo
          ? `${t("ui.ShiftAssignModal.trabajo", "Trabajo")} ${i + 1} de ${trabajo}`
          : `${cap(propio)} ${i + 1} de ${style.dayShifts}`,
      });
    for (let i = 0; i < (style.nightShifts || 0); i++, k++)
      out.push({
        k,
        label: unSoloTramo
          ? `${t("ui.ShiftAssignModal.trabajo", "Trabajo")} ${(style.dayShifts || 0) + i + 1} de ${trabajo}`
          : `${cap(espejo)} ${i + 1} de ${style.nightShifts}`,
      });
    for (let i = 0; i < (style.restDays || 0); i++, k++)
      out.push({
        k,
        label: `${t("ui.ShiftAssignModal.libre", "Libre")} ${i + 1} de ${style.restDays}`,
      });

    return out;
  }, [
    positions,
    selectedPositionId,
    rotationStyles,
    station,
    secuenciaPropia,
    t,
  ]);

  // Lo que se enseña en el desplegable: los disponibles que casen con lo escrito.
  // En un evento, TODOS: los libres primero y los ocupados marcados.
  const vigilantesFiltrados = useMemo(() => {
    const base: { id: string; label: string }[] = evento
      ? vigilantesDelEvento
      : availableGuards;
    const q = filtroVigilante.trim().toLowerCase();
    const elegido = guardsOptions.find((g) => g.id === shiftGuard);

    if (!q || (elegido && q === elegido.label.toLowerCase())) return base;

    return base.filter((g) => g.label.toLowerCase().includes(q));
  }, [
    evento,
    vigilantesDelEvento,
    availableGuards,
    filtroVigilante,
    guardsOptions,
    shiftGuard,
  ]);

  /* ── CÓMO SE LLAMA EL SEGUNDO TRAMO DEL CICLO EN ESTA ESTACIÓN ────────────
     En un puesto de 24 h es la NOCHE. En una estación partida en dos tramos
     diurnos —Batallón Sur, 07:00–15:00 y 15:00–23:00— es la TARDE, y llamarla
     noche hacía que el operador no reconociera lo que acababa de configurar. */
  const bloques = useMemo(() => {
    const fijos = positions.filter((p) => (p.type || "fijo") !== "sacafranco");
    const vistos = new Map<string, string>();

    for (const f of fijos) {
      const ini = String(f.startTime || "").slice(0, 5);
      const fin = String(f.endTime || "").slice(0, 5);

      if (ini && fin) vistos.set(`${ini}|${fin}`, ini);
    }

    return Array.from(vistos.values()).sort();
  }, [positions]);

  const etiquetaSegundoBloque = useMemo(() => {
    if (bloques.length < 2) return t("ui.AsignacionEditModal.noche", "noche");
    const posActual = positions.find((p) => p.id === selectedPositionId);
    const miIni = String(posActual?.startTime || bloques[0]).slice(0, 5);
    const i = bloques.indexOf(miIni);
    const otro = bloques[((i < 0 ? 0 : i) + 1) % bloques.length];

    return nombreDeTramo(otro);
  }, [bloques, positions, selectedPositionId]);

  /** Y cómo se llama el tramo PROPIO de la plaza elegida (el primero del ciclo). */
  const etiquetaPrimerBloque = useMemo(() => {
    if (bloques.length < 2) return t("ui.AsignacionEditModal.dia", "día");
    const posActual = positions.find((p) => p.id === selectedPositionId);

    return nombreDeTramo(
      String(posActual?.startTime || bloques[0]).slice(0, 5),
    );
  }, [bloques, positions, selectedPositionId]);

  /* La estación SIN ciclo: entonces elegirlo aquí no es una excepción, es LA
     pregunta. El ciclo ya no se inventa al crear el puesto —se preguntaba antes
     de que existiera nadie a quien aplicárselo— y sin él el generador no
     escribe un solo turno. */
  // Con el ciclo resuelto (la ficha lo trae; el Planificador lo pide aparte).
  const estacionSinCiclo = !rotacionEstacion;

  const patronDeLaEstacion = useMemo(
    () =>
      rotationStyles.find(
        (s) => String(s.id) === String((station as any).rotationStyleId),
      )?.name || null,
    [rotationStyles, station],
  );

  // Initialize + load data each time the modal opens.
  useEffect(() => {
    if (!open) return;
    const startHour = station?.startingTimeInDay || "07:00";
    const endHour = station?.finishTimeInDay || "19:00";
    const target = dateKey(new Date());

    setShiftStart(`${target}T${startHour}`);
    setShiftEnd(`${target}T${endHour}`);
    setShiftGuard(presetGuardId || "");
    setRotationStartDate(target);
    setAssignMode("rotation");
    setSelectedPositionId("");
    setSecuenciaPropia("");
    setCycleStartIndex(0);
    setMostrarSecuencia(false);
    setFiltroVigilante("");
    setListaAbierta(false);

    (async () => {
      setLoadingGuards(true);
      try {
        const res: any = await todosLosVigilantes(tenantId);
        const list = Array.isArray(res) ? res : (res?.rows ?? []);

        setGuardsOptions(
          list
            .map((r: GuardAutoRow) => ({
              id: r.guardId || r.id || r.value || "",
              label: r.fullName || r.name || r.label || r.email || "",
            }))
            .filter((g: { id: string; label: string }) => g.id),
        );
      } catch {
        setGuardsOptions([]);
      } finally {
        setLoadingGuards(false);
      }
    })();
    if ((station as any)?.rotationStyleId === undefined)
      ApiService.get(`/tenant/${tenantId}/station/${stationId}`)
        .then((r: any) =>
          setRotEstacion(
            r?.rotationStyleId || r?.data?.rotationStyleId || null,
          ),
        )
        .catch(() => setRotEstacion(null));
    ApiService.get(`/tenant/${tenantId}/station/${stationId}/positions`)
      .then((r: any) => setPositions(Array.isArray(r) ? r : (r?.rows ?? [])))
      .catch(() => {});
    // Rotation styles → resolve the station's patrón (dayShifts/nightShifts/restDays)
    // so we can preview the guard's rest day.
    ApiService.get(urlDePatrones(tenantId))
      .then((r: any) =>
        setRotationStyles(
          Array.isArray(r) ? r : (r?.rows ?? r?.data?.rows ?? []),
        ),
      )
      .catch(() => {});
    // Tenant-wide active assignments → occupied vigilantes + occupied puestos.
    ApiService.get(`/tenant/${tenantId}/guard-assignments?status=active`)
      .then((r: any) => {
        const rows = Array.isArray(r) ? r : (r?.rows ?? []);
        const og = new Set<string>();
        const op = new Set<string>();
        const pv: Record<string, string[]> = {};

        for (const a of rows) {
          /* Quien tiene CUALQUIER asignación activa —fijo o sacafranco— no se
             ofrece: aquí se filtraba por `kind === "rotation"` y los
             sacafrancos (kind «relief») seguían saliendo como disponibles
             (medido: 47 vigilantes, 20 asignados, el popup ofrecía 31). */
          const gid = String(a.guardId || a.guard?.id || "");

          if (gid) og.add(gid);
          if (String(a.stationId) === String(stationId) && a.positionId)
            op.add(String(a.positionId));
          /* Evento: la asignación se guarda SIN plaza (puntual) y con las
             horas de la plaza elegida. La ocupación sólo se puede leer por la
             ventana: «¿cuántos hay ya de 19:00 a 07:00?». */
          if (String(a.stationId) === String(stationId) && !a.positionId) {
            const k = claveVentana(a.startTime, a.endTime);

            if (k) {
              const g = a.guard || a.user || {};
              const nombre =
                g.fullName ||
                `${g.firstName || ""} ${g.lastName || ""}`.trim() ||
                g.email ||
                "";

              (pv[k] ||= []).push(nombre);
            }
          }
        }
        setOccupiedGuardIds(og);
        setOccupiedPositionIds(op);
        setPuntualesPorVentana(pv);
      })
      .catch(() => {});
  }, [open]);

  /* ── LA PLAZA TRAE SU CICLO ───────────────────────────────────────────────
     Al configurar el horario de la estación se le puede dar a cada plaza el
     suyo (BIOMAR: la mañana en un ciclo y la tarde en otro). Elegir la plaza
     aquí tiene que enseñar ESE ciclo, no «la de la estación»: si no, lo que se
     configuró en el puesto no aparece por ninguna parte y el operador cree que
     no se guardó. El backend hace lo mismo cuando no se le dice nada; esto sólo
     lo pone delante para que se vea y se pueda cambiar. */
  useEffect(() => {
    if (!open || !selectedPositionId) return;
    const pos = positions.find(
      (p) => String(p.id) === String(selectedPositionId),
    );

    setSecuenciaPropia(pos?.rotationStyleId ? String(pos.rotationStyleId) : "");
  }, [selectedPositionId, positions]);

  // Default the puesto to the first FREE one once positions/occupancy load.
  useEffect(() => {
    if (!open) return;
    // En un evento sólo se ofrecen las plazas fijas (no hay sacafranco).
    const candidatas = evento
      ? positionOptions.filter((p) => p.type === "fijo")
      : positionOptions;
    const free = candidatas.find((p) => !p.occupied);
    const elegidaOcupada = !!positionOptions.find(
      (p) => p.id === selectedPositionId,
    )?.occupied;

    if (free && (!selectedPositionId || elegidaOcupada)) {
      setSelectedPositionId(free.id);
    } else if (evento && !free && elegidaOcupada) {
      // Evento con todas las plazas cubiertas: no se deja una elegida a escondidas.
      setSelectedPositionId("");
    }
  }, [open, positionOptions, evento]);

  // A slot already taken by THIS guard is the desired end state, not an error.
  const isBenignSlotConflict = (e: any) => {
    const blob = `${e?.message || ""} ${(() => {
      try {
        return JSON.stringify(e?.data ?? e?.response ?? "");
      } catch {
        return "";
      }
    })()}`;

    // The backend now answers a slot collision as a 409 «already exists»
    // without naming the index: same benign case (the shift is there).
    if (e?.status === 409 && e?.data?.messageCode === "server.common.alreadyExists")
      return true;

    return /uniq_shift_slot/i.test(blob);
  };

  // Fetch the station's current shifts (fresh — avoids stale-overlap conflicts).
  const fetchCurrentShifts = async (): Promise<ShiftRow[]> => {
    try {
      const r: any = await ApiService.get(
        `/tenant/${tenantId}/shift?filter[station]=${encodeURIComponent(stationId)}&limit=999&_=${Date.now()}`,
      );

      return Array.isArray(r) ? r : (r?.rows ?? []);
    } catch {
      return [];
    }
  };

  // Replace whatever already occupies a slot at this station (one turno per slot).
  const deleteOverlappingShifts = async (
    list: ShiftRow[],
    start: Date,
    end: Date,
  ) => {
    const s = start.getTime();
    const e = end.getTime();
    const matched = list.filter((r: ShiftRow) => {
      const rs = new Date(r.startTime || r.start || "").getTime();
      const re = new Date(r.endTime || r.end || "").getTime();

      return Number.isFinite(rs) && Number.isFinite(re) && rs < e && re > s;
    });
    const ids = matched.map((r: ShiftRow) => r.id).filter(Boolean);

    if (ids.length) {
      await ApiService.delete(`/tenant/${tenantId}/shift?ids=${ids.join(",")}`);
      matched.forEach((m) => {
        const i = list.indexOf(m);
        if (i >= 0) list.splice(i, 1);
      });
    }

    return ids.length;
  };

  const saveShift = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      await saveShiftOnce();
    } finally {
      savingRef.current = false;
    }
  };

  const saveShiftOnce = async () => {
    if (!shiftGuard) {
      toast.error(t("ui.ShiftAssignModal.seleccioneUnVigilante"));
      return;
    }

    // ── Evento → asignación PUNTUAL; las fechas y horas las pone el servidor ──
    if (evento) {
      if (eventoAcabado) {
        toast.error(t("eventos.yaTermino", "Este evento ya terminó"));
        return;
      }
      if (positionOptions.length > 0 && !selectedPositionId) {
        toast.error(t("ui.ShiftAssignModal.seleccioneElPuestoVigilante"));
        return;
      }
      setSaving(true);
      try {
        await ApiService.post(`/tenant/${tenantId}/guard-assignment`, {
          data: {
            guardId: shiftGuard,
            stationId,
            positionId: selectedPositionId || null,
            isRelief: false,
          },
        });
        toast.success(
          t("eventos.vigilanteAsignado", "Vigilante asignado al evento"),
        );
        const desde = sede?.vigenteDesde ? new Date(sede.vigenteDesde) : null;

        onSaved(desde && !Number.isNaN(desde.getTime()) ? desde : undefined);
      } catch (e: any) {
        // El choque de horario lo explica el servidor: se enseña tal cual.
        toast.error(
          e?.data?.message ||
            e?.message ||
            t("ui.ShiftAssignModal.errorAlAsignar", "Error al asignar"),
        );
      } finally {
        setSaving(false);
      }

      return;
    }

    // ── Turno único (one-off ad-hoc shift) ────────────────────────────────────
    if (assignMode === "single") {
      if (!shiftStart || !shiftEnd) {
        toast.error(t("comun.completeTodosLosCampos"));
        return;
      }
      const start = new Date(shiftStart);
      const end = new Date(shiftEnd);

      if (end <= start) {
        toast.error(t("ui.ShiftAssignModal.laHoraDeFinDebe"));
        return;
      }
      if (end.getTime() - start.getTime() > 24 * 60 * 60 * 1000) {
        toast.error(t("comun.unTurnoNoPuedeDurar"));
        return;
      }
      const current = await fetchCurrentShifts();

      setSaving(true);
      try {
        await deleteOverlappingShifts(current, start, end);
        await ApiService.post(`/tenant/${tenantId}/shift`, {
          data: {
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            station: stationId,
            guard: shiftGuard,
            postSiteId,
          },
        });
        toast.success(t("ui.ShiftAssignModal.turnoCreado"));
        onSaved(start);
      } catch (e: any) {
        if (isBenignSlotConflict(e)) {
          toast.success(t("ui.ShiftAssignModal.elVigilanteYaEstabaAsignado"));
          onSaved(start);
        } else
          toast.error(
            e?.data?.message ||
              e?.message ||
              t(
                "ui.ShiftAssignModal.errorAlCrearTurno",
                "Error al crear turno",
              ),
          );
      } finally {
        setSaving(false);
      }

      return;
    }

    // ── Rotación → the scheduling ENGINE (assign to a position) ────────────────
    // The guard is assigned to a station POSITION (Vigilante 1/2). The engine
    // generates the staggered rotation (one starts day, the other night, swapping
    // each cycle) from the station's patrón de rotación. Same path as Programador.
    if (!selectedPositionId) {
      toast.error(t("ui.ShiftAssignModal.seleccioneElPuestoVigilante"));
      return;
    }
    const pos = positions.find((p: PositionRow) => p.id === selectedPositionId);
    const isRelief = (pos?.type || "fijo") === "sacafranco";

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
          // Vacío ⇒ el backend deja `rotationStyleId: null` y el generador
          // hereda el de la estación, que es el comportamiento de siempre.
          rotationStyleId: secuenciaPropia || null,
          isRelief,
          // En qué día de su ciclo cae la fecha de inicio («entra en la noche 3»).
          cycleStartIndex: isRelief ? 0 : cycleStartIndex,
        },
      });
      toast.success(t("ui.ShiftAssignModal.vigilanteAsignadoSiEsFijo"));
      onSaved(new Date(rotationStartDate + "T12:00:00"));
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("ui.ShiftAssignModal.errorAlAsignar", "Error al asignar"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      description={t("ui.ShiftAssignModal.programaLaCoberturaDelTurno")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("actions.cancel")}
          </Button>
          <Button
            onClick={saveShift}
            disabled={
              saving ||
              sedeSinConfigurar ||
              !shiftGuard ||
              (evento
                ? eventoAcabado ||
                  (positionOptions.length > 0 && !selectedPositionId)
                : assignMode === "rotation" &&
                  (!selectedPositionId ||
                    (estacionSinCiclo && !secuenciaPropia)))
            }
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <UserPlus size={14} />
            )}
            {evento
              ? t("eventos.asignarAlEvento", "Asignar al evento")
              : assignMode === "rotation"
                ? t("ui.ShiftAssignModal.asignarRotacion", "Asignar rotación")
                : t("ui.ShiftAssignModal.crearTurno", "Crear turno")}
          </Button>
        </>
      }
      icon={<UserPlus className="h-5 w-5" />}
      open={open}
      size="md"
      title={t("comun.asignarVigilante")}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      {sedeSinConfigurar && (
        <OperationSetupAlert context="guard" site={sede} siteId={postSiteId} />
      )}
      <div className="space-y-4" hidden={sedeSinConfigurar}>
        {evento && <AvisoFechasDelEvento sede={sede} />}
        {!evento && (
          <Segmented
            className="w-full [&>button]:flex-1"
            options={[
              {
                value: "rotation",
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <Repeat size={13} />{" "}
                    {t("ui.ShiftAssignModal.rotacion", "Rotación")}
                  </span>
                ),
              },
              {
                value: "single",
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarRange size={13} />{" "}
                    {t("ui.ShiftAssignModal.turnoUnico", "Turno único")}
                  </span>
                ),
              },
            ]}
            value={assignMode}
            onChange={setAssignMode}
          />
        )}

        <LabeledField label={t("comun.vigilante")}>
          {loadingGuards ? (
            <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />{" "}
              {t("common.loading")}
            </div>
          ) : (
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                size={14}
                style={{ color: "var(--ink-faint)" }}
              />
              <input
                autoComplete="off"
                className={`${FIELD_CLS_LG} pl-9`}
                placeholder={t(
                  "ui.ShiftAssignModal.buscarDisponible",
                  "Buscar entre los vigilantes disponibles…",
                )}
                value={
                  filtroVigilante ||
                  guardsOptions.find((g) => g.id === shiftGuard)?.label ||
                  ""
                }
                onBlur={() => setTimeout(() => setListaAbierta(false), 150)}
                onChange={(e) => {
                  setFiltroVigilante(e.target.value);
                  setShiftGuard("");
                  setListaAbierta(true);
                }}
                onFocus={() => setListaAbierta(true)}
              />
              {listaAbierta && (
                <div
                  className="glass absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-xl p-1"
                  style={{ background: "var(--background)" }}
                >
                  {vigilantesFiltrados.map((g) => (
                    <button
                      key={g.id}
                      className="cg-focus flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--brand-wash)]"
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setShiftGuard(g.id);
                        setFiltroVigilante("");
                        setListaAbierta(false);
                      }}
                    >
                      <span className="min-w-0 truncate">{g.label}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {evento && ocupadoEnEvento.has(String(g.id)) && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{
                              background:
                                "color-mix(in oklab, var(--warn) 14%, transparent)",
                              color: "var(--warn-text)",
                            }}
                          >
                            {t(
                              "eventos.ocupadoEseHorario",
                              "Ocupado en ese horario",
                            )}
                          </span>
                        )}
                        {g.id === shiftGuard && (
                          <Check className="h-4 w-4 shrink-0 brand-text" />
                        )}
                      </span>
                    </button>
                  ))}
                  {!vigilantesFiltrados.length && (
                    <p
                      className="px-3 py-2 text-xs"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {evento
                        ? t(
                            "eventos.nadieConEseNombre",
                            "Ningún vigilante con ese nombre.",
                          )
                        : t(
                            "ui.ShiftAssignModal.nadieDisponibleConEseNombre",
                            "Ningún vigilante disponible con ese nombre.",
                          )}
                    </p>
                  )}
                </div>
              )}
              <p
                className="mt-1 text-[11px]"
                style={{ color: "var(--ink-soft)" }}
              >
                {evento
                  ? cargandoLibres
                    ? t(
                        "eventos.buscandoLibres",
                        "Mirando quién está libre en esas horas…",
                      )
                    : libres
                      ? t("eventos.nLibres", {
                          defaultValue:
                            "{{count}} libres en esas horas, arriba · los que tienen un turno que se cruza salen marcados",
                          count: vigilantesDelEvento.filter((g) => g.libre).length,
                        })
                      : t(
                          "eventos.sinListaDeLibres",
                          "No se pudo saber quién está libre: si eliges a alguien con un turno que se cruza, se avisará al guardar.",
                        )
                  : t("ui.ShiftAssignModal.nDisponibles", {
                      defaultValue:
                        "{{count}} disponibles · sólo quienes no tienen ya una asignación activa",
                      count: availableGuards.length,
                    })}
              </p>
            </div>
          )}
          {!loadingGuards && !evento && availableGuards.length === 0 && (
            <p
              className="mt-1.5 text-[11px]"
              style={{ color: "var(--warn-text)" }}
            >
              {t("ui.ShiftAssignModal.todosLosVigilantesYaTienen")}
            </p>
          )}
        </LabeledField>

        {evento ? (
          positionOptions.length > 0 ? (
            <LabeledField label={t("eventos.plaza", "Puesto")}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {positionOptions
                  .filter((p) => p.type === "fijo")
                  .map((p) => (
                    <button
                      key={p.id}
                      className="cg-focus rounded-xl border px-3 py-2 text-left text-sm font-medium transition-all disabled:cursor-not-allowed"
                      disabled={p.occupied}
                      style={
                        p.occupied
                          ? {
                              borderColor: "var(--hairline)",
                              color: "var(--ink-faint)",
                              opacity: 0.5,
                            }
                          : selectedPositionId === p.id
                            ? {
                                borderColor: "var(--brand-line)",
                                background: "var(--brand-wash)",
                                color: "var(--brand-text)",
                              }
                            : {
                                borderColor: "var(--hairline)",
                                color: "var(--ink-soft)",
                              }
                      }
                      title={
                        p.occupied
                          ? t(
                              "ui.ShiftAssignModal.puestoOcupado",
                              "Puesto ocupado",
                            )
                          : p.horas || undefined
                      }
                      type="button"
                      onClick={() => setSelectedPositionId(p.id)}
                    >
                      <span className={p.occupied ? "line-through" : undefined}>
                        {p.label}
                      </span>
                      {p.occupied && !p.cubiertaPor
                        ? ` · ${t("ui.AsignacionEditModal.ocupado", "ocupado")}`
                        : ""}
                      {p.horas && (
                        <span className="mt-0.5 block text-[10px] font-normal tabular-nums opacity-80">
                          {p.horas}
                        </span>
                      )}
                      {p.cubiertaPor && (
                        <span className="mt-0.5 block truncate text-[10px] font-normal">
                          {t("eventos.plazaCubiertaPor", {
                            defaultValue: "Cubierta: {{nombre}}",
                            nombre: p.cubiertaPor,
                          })}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
              {(() => {
                const fijas = positionOptions.filter((p) => p.type === "fijo");
                const cubiertas = fijas.filter((p) => p.occupied).length;

                return (
                  <p
                    className="mt-1.5 text-[11px]"
                    style={{
                      color:
                        cubiertas >= fijas.length
                          ? "var(--warn-text)"
                          : "var(--ink-soft)",
                    }}
                  >
                    {cubiertas >= fijas.length
                      ? t(
                          "eventos.todasLasPlazasCubiertas",
                          "Todos los puestos de esta estación ya están cubiertos. Para cambiar a alguien, usa «Cambiar» en su fila.",
                        )
                      : t("eventos.plazasCubiertas", {
                          defaultValue: "{{n}} de {{total}} puestos cubiertos",
                          n: cubiertas,
                          total: fijas.length,
                        })}
                  </p>
                );
              })()}
            </LabeledField>
          ) : null
        ) : assignMode === "rotation" ? (
          <>
            {/* Puesto (Vigilante): assign to a position — the engine staggers day/night. */}
            <LabeledField label={t("comun.puesto")}>
              {positionOptions.length === 0 ? (
                <div
                  className="rounded-xl px-3 py-2 text-xs"
                  style={{
                    background:
                      "color-mix(in oklab, var(--warn) 12%, transparent)",
                    color: "var(--warn-text)",
                  }}
                >
                  {t("ui.ShiftAssignModal.configuraPrimeroElHorarioDe")}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {positionOptions.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={p.occupied}
                      onClick={() => setSelectedPositionId(p.id)}
                      title={
                        p.occupied
                          ? t(
                              "ui.ShiftAssignModal.puestoOcupado",
                              "Puesto ocupado",
                            )
                          : p.horas || undefined
                      }
                      className="cg-focus rounded-xl border px-3 py-2 text-left text-sm font-medium transition-all disabled:cursor-not-allowed"
                      style={
                        p.occupied
                          ? {
                              borderColor: "var(--hairline)",
                              color: "var(--ink-faint)",
                              opacity: 0.5,
                            }
                          : selectedPositionId === p.id
                            ? {
                                borderColor: "var(--brand-line)",
                                background: "var(--brand-wash)",
                                color: "var(--brand-text)",
                              }
                            : {
                                borderColor: "var(--hairline)",
                                color: "var(--ink-soft)",
                              }
                      }
                    >
                      <span className={p.occupied ? "line-through" : undefined}>
                        {p.label}
                      </span>
                      {p.occupied
                        ? ` · ${t("ui.AsignacionEditModal.ocupado", "ocupado")}`
                        : ""}
                      {/* Las horas de la plaza: son las que va a trabajar quien se
                            asigne aquí, y sin ellas no hay forma de distinguir la
                            plaza de la mañana de la de la tarde. */}
                      {p.horas && (
                        <span className="mt-0.5 block text-[10px] font-normal tabular-nums opacity-80">
                          {p.horas}
                          {p.tramo ? ` · ${p.tramo}` : ""}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {t("ui.ShiftAssignModal.losVigilantesAlternanDiaY")}{" "}
                <b>{t("ui.ShiftAssignModal.fechaDeInicio")}</b>{" "}
                {t(
                  "ui.ShiftAssignModal.cambialaParaMoverElDia",
                  "— cámbiala para mover el día de descanso.",
                )}
              </p>
            </LabeledField>

            {/* El ciclo ya se eligió al crear la estación: aquí NO se vuelve a
                preguntar (el dueño: «se ve redundante»). Sólo si el puesto no
                tiene ciclo, o si se pide a propósito un ciclo distinto para
                este vigilante. */}
            {selectedPositionId &&
              !estacionSinCiclo &&
              !mostrarSecuencia &&
              (positions.find((p) => p.id === selectedPositionId)?.type ||
                "fijo") !== "sacafranco" && (
                <p className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
                  {t(
                    "ui.ShiftAssignModal.heredaElCicloDelPuesto",
                    "Hereda el ciclo del puesto.",
                  )}{" "}
                  <button
                    className="cg-focus underline"
                    type="button"
                    onClick={() => setMostrarSecuencia(true)}
                  >
                    {t(
                      "ui.ShiftAssignModal.esteVigilanteLlevaOtro",
                      "¿Este vigilante lleva otro ciclo?",
                    )}
                  </button>
                </p>
              )}
            {selectedPositionId &&
              (estacionSinCiclo || mostrarSecuencia) &&
              (positions.find((p) => p.id === selectedPositionId)?.type ||
                "fijo") !== "sacafranco" && (
                <LabeledField
                  label={
                    estacionSinCiclo
                      ? t(
                          "ui.ShiftAssignModal.cadaCuantosDiasLibra",
                          "¿Cada cuántos días libra?",
                        )
                      : t(
                          "ui.AsignacionEditModal.secuenciaDeEsteVigilante",
                          "Secuencia de este vigilante",
                        )
                  }
                >
                  <SecuenciaPropiaSelect
                    etiquetaPrimerBloque={etiquetaPrimerBloque}
                    etiquetaSegundoBloque={etiquetaSegundoBloque}
                    obligatorio={estacionSinCiclo}
                    patronDeLaEstacion={patronDeLaEstacion}
                    tenantId={tenantId}
                    value={secuenciaPropia}
                    onChange={setSecuenciaPropia}
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground/70">
                    {estacionSinCiclo ? (
                      <>
                        {t(
                          "ui.ShiftAssignModal.puestoSinCiclo",
                          "Este puesto todavía no tiene ciclo. El que elijas aquí pasa a ser el del puesto, y sus compañeros lo heredan.",
                        )}
                      </>
                    ) : (
                      <>
                        {bloques.length > 1
                          ? t("ui.ShiftAssignModal.dejaloConEjemplo", {
                              defaultValue:
                                "Déjalo en «la de la estación» salvo que este vigilante tenga un ciclo distinto al de sus compañeros (por ejemplo 2 de {{primero}} y 2 de {{segundo}}).",
                              primero: etiquetaPrimerBloque,
                              segundo: etiquetaSegundoBloque,
                            })
                          : t(
                              "ui.AsignacionEditModal.dejaloEnLaDeLaEstacion",
                              "Déjalo en «la de la estación» salvo que este vigilante tenga un ciclo distinto al de sus compañeros.",
                            )}
                      </>
                    )}
                  </p>
                </LabeledField>
              )}

            {/* Fecha de inicio = la fase de la rotación (día-0 del ciclo). */}
            <LabeledField
              label={t("ui.ShiftAssignModal.fechaDeInicioDelTurno")}
            >
              <input
                type="date"
                value={rotationStartDate}
                onChange={(e) => setRotationStartDate(e.target.value)}
                className={FIELD_CLS_LG}
              />
              {diasDelCiclo.length > 1 && (
                <div className="mt-2">
                  <label
                    className="mb-1 block text-xs font-medium"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {t(
                      "ui.ShiftAssignModal.enQueDiaDelCicloEntra",
                      "¿En qué día de su ciclo entra ese día?",
                    )}
                  </label>
                  <select
                    className={FIELD_CLS_LG}
                    value={cycleStartIndex}
                    onChange={(e) => setCycleStartIndex(Number(e.target.value))}
                  >
                    {diasDelCiclo.map((o) => (
                      <option key={o.k} value={o.k}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {restPreview && (
                <div
                  className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2"
                  style={{
                    borderColor: "var(--brand-line)",
                    background: "var(--brand-wash)",
                  }}
                >
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarRange size={13} className="brand-text" />{" "}
                    {t("ui.AsignacionEditModal.empieza", "Empieza")}{" "}
                    <span className="font-medium capitalize text-foreground">
                      {restPreview.startWeekday}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs">
                    <Moon className="brand-text" size={13} />
                    {restPreview.weekday ? (
                      <span className="text-muted-foreground">
                        {t("ui.AsignacionEditModal.descansa", "Descansa:")}{" "}
                        <span className="font-semibold capitalize brand-text">
                          {restPreview.weekday}
                        </span>
                      </span>
                    ) : (
                      <span className="capitalize text-muted-foreground">
                        {t("ui.AsignacionEditModal.descanso", "Descanso:")}{" "}
                        {restPreview.dates.map(shortRestLabel).join(" · ")}
                      </span>
                    )}
                  </span>
                </div>
              )}
              <p className="mt-1 text-[10px] text-muted-foreground/70">
                {t("ui.ShiftAssignModal.paraEscalonarDosVigilantesEn")}
              </p>
            </LabeledField>

            <LabeledField label={t("ui.ShiftAssignModal.hastaOpcional")}>
              <input
                type="date"
                value={rotationEndDate}
                min={rotationStartDate}
                onChange={(e) => setRotationEndDate(e.target.value)}
                className={FIELD_CLS_LG}
              />
              <p className="mt-1 text-[10px] text-muted-foreground/70">
                {t(
                  "ui.ShiftAssignModal.dejaloVacioParaUnaAsignacion",
                  "Déjalo vacío para una asignación indefinida; pon una fecha para una cobertura temporal.",
                )}
              </p>
            </LabeledField>
          </>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LabeledField label={t("postSites.stations.startTime", "Inicio")}>
              <input
                type="datetime-local"
                value={shiftStart}
                onChange={(e) => setShiftStart(e.target.value)}
                className={FIELD_CLS_LG}
              />
            </LabeledField>
            <LabeledField label={t("postSites.stations.endTime", "Fin")}>
              <input
                type="datetime-local"
                value={shiftEnd}
                onChange={(e) => setShiftEnd(e.target.value)}
                className={FIELD_CLS_LG}
              />
            </LabeledField>
          </div>
        )}
      </div>
    </Modal>
  );
}
