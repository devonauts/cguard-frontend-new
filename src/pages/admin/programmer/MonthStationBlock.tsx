import type { LucideIcon } from "lucide-react";
import { horaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";
import {
  handlersDePulsacionLarga,
  type PuntoDePulsacion,
} from "./pulsacionLarga";
import type {
  StationPosition,
  GuardAssignment,
  Station,
  ScheduleOverride,
  StationAlert,
} from "@/types";

import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Clock, Plus, Shield, Sun, X } from "lucide-react";

import {
  type Tone,
  tonePill,
  toneCard,
  CODE_LABEL,
  codePill,
  columnRules,
} from "./codeTones";
import { COL_W } from "./gridBand";

import { Button } from "@/components/ui/button";
import { nombreDeVigilante } from "@/lib/guardName";
import { diasCompactos, diasDeLasPlazas } from "@/lib/diasDeLaSemana";
import { etiquetaDeHorario as etiquetaDeJornada, resumenDeHorario } from "@/lib/jornadasDePlazas";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * UN PUESTO DE LA HOJA DEL MES — Y POR QUÉ VIVE APARTE
 *
 * `Schedule.tsx` es un solo componente de 3.500 líneas. Cualquier cambio de
 * estado —abrir un diálogo, cruzar de mes al desplazar, arrastrar para
 * seleccionar celdas— obligaba a React a recorrer TODA la hoja. Con los datos
 * reales de producción (30 puestos, 30 posiciones, un lienzo de un año) eso son
 * decenas de miles de nodos por gesto: es lo que congelaba las computadoras.
 *
 * Aquí cada puesto es un componente MEMOIZADO. Al arrastrar una selección sólo
 * se vuelve a pintar el puesto tocado; los otros veintinueve no se enteran.
 *
 * Para que la memoización SIRVA, todas las props tienen que conservar su
 * identidad entre renders:
 *   · los arrays y mapas de datos vienen de `useMemo` en la hoja;
 *   · los manejadores llegan en UN objeto estable (`h`) cuyos campos se
 *     reasignan en cada render de la hoja — por eso siempre se llaman como
 *     `h.loQueSea(...)` y nunca se desestructuran: desestructurar congelaría la
 *     función vieja y con ella el estado viejo;
 *   · la selección llega ya recortada a este puesto (`sel`), y vale `null`
 *     cuando la selección no lo toca. `null === null`, así que el puesto no se
 *     repinta.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** Selección de celdas, ya recortada a las filas de ESTE puesto. */
export type BlockSel = {
  /** Filas (id de posición) dentro del rango seleccionado. */
  keys: Set<string>;
  /** Columnas del rango, inclusivas. */
  c1: number;
  c2: number;
  /** La celda con el foco (la que se movería con el teclado). */
  focusKey: string;
  fc: number;
};

/** Manejadores de la hoja. El OBJETO es estable; sus campos, no. */
export type MonthGridHandlers = {
  configureStation: (station: Station) => void;
  addPosition: (stationId: string) => void;
  editPosition: (station: Station, pos: StationPosition) => void;
  deletePosition: (stationId: string, positionId: string) => void;
  openAssignForm: (
    stationId: string,
    positionId: string,
    dateStr?: string,
  ) => void;
  removeAssignment: (assignmentId: string) => void;
  onGuardDragStart: (
    e: React.DragEvent,
    guardId: string,
    fromAssignment?: GuardAssignment,
  ) => void;
  handleDrop: (
    e: React.DragEvent,
    stationId: string,
    positionId: string,
    dateStr?: string,
  ) => void;
  /** Arrastrar una tarjeta de cobertura para moverla de día o de puesto. */
  onCoverageDragStart: (e: React.DragEvent, shiftId: string) => void;
  openCellCtx: (
    /* Clic derecho o pulsación larga: al menú le basta con el punto. */
    e: React.MouseEvent | PuntoDePulsacion,
    station: Station,
    pos: StationPosition,
    posAssignments: GuardAssignment[],
    dateStr: string,
  ) => void;
  setOverrideTarget: (t: {
    guardId: string;
    guardName: string;
    date: string;
    assignmentId?: string;
  }) => void;
  startCellSelect: (rowKey: string, c: number, shift: boolean) => void;
  hoverCellSelect: (rowKey: string, c: number) => void;
  isWorkDay: (
    assignment: GuardAssignment,
    date: Date,
  ) => "day" | "night" | "rest";
  /** Elegir UNA de las tarjetas apiladas en un casillero (dos personas en la
   *  misma plaza). Se llama en el mousedown de la tarjeta, ANTES de que la
   *  celda abra la selección. */
  pickAssignment: (assignmentId: string) => void;
};

/** Translated label of a station's schedule type (it used to print «12H DAY»). */
const SCHEDULE_TYPE_KEY: Record<string, string> = {
  "12h-day": "supervisorPositions.scheduleType.12hDay",
  "12h-night": "supervisorPositions.scheduleType.12hNight",
  "24h": "supervisorPositions.scheduleType.24h",
  custom: "supervisorPositions.scheduleType.custom",
};

const EMPTY_ASG: GuardAssignment[] = [];

/** Una persona cubriendo algo en una estación un día, tal y como la resume
 *  `sfStationCoverage`. `code` es su mitad (D o N) según su hora de entrada. */
type CoberturaDia = {
  id: string;
  guardId: string;
  name: string;
  fullName: string;
  code: "D" | "N";
  ext?: boolean;
};

/** Códigos que dejan el puesto SIN esa persona — los que abren un hueco que
 *  alguien viene a cubrir. `D`, `N` y `24` no: esos son trabajo. */
const ABSENCE_CODES = new Set(["V", "PM", "F", "L"]);

/* Copia literal de los de la hoja a propósito: son el TINTE de la rejilla y
   tienen que valer lo mismo en los dos sitios. */
const TINT_TODAY = "color-mix(in oklab, var(--brand) 8%, transparent)";
const TINT_SUNDAY = "color-mix(in oklab, var(--bad) 5%, transparent)";

const POSITION_TONE: Record<string, { tone: Tone; icon: LucideIcon }> = {
  fijo: { tone: "warn", icon: Sun },
  sacafranco: { tone: "ok", icon: Shield },
};

// Día/Noche letter for a WORKING cell — misma regla que el backend
// (`shiftHalfByStart`, umbral 18/6) para que la letra pintada coincida con el
// turno generado.
/**
 * LA LETRA DE LA CELDA — LA MISMA REGLA QUE EL MOTOR, SIN UNA SEGUNDA VERDAD.
 *
 * `shiftGenerationService` decide la hora de un turno así, y sólo así:
 *
 *     dayStartTime   = position.startTime        // la ventana de SU plaza
 *     nightStartTime = position.endTime          // la inversa
 *     estado 'day'   → el turno empieza a dayStartTime
 *     estado 'night' → el turno empieza a nightStartTime
 *
 * De modo que la letra es la BANDA de la hora en que de verdad entra. Para el
 * Fijo 1 (07:00-19:00) eso da D y luego N; para el Fijo 2 (19:00-07:00), N y
 * luego D. Los dos se turnan, que es lo que significa una rotación con noches.
 *
 * ── LO QUE HABÍA AQUÍ Y POR QUÉ ESTABA MAL ─────────────────────────────────
 * Una bandera `hoursDecideHalf`: si los fijos de la estación tenían horas
 * distintas entre sí, la letra salía SÓLO de la hora de la plaza y la rotación
 * se ignoraba. El comentario lo defendía así: «un puesto de 24 h con Fijo 1
 * 07:00–19:00 y Fijo 2 19:00–07:00 son un diurno fijo y un nocturno fijo, no
 * dos que se turnan».
 *
 * Eso no es cierto cuando el patrón TIENE noches. Central BAS, 2026-09-13:
 * puesto de 24 h en 3-3-2, el motor generaba a Carlos D D D / N N N y a
 * Leonardo al revés —comprobado fila a fila en la base— y la rejilla enseñaba
 * una fila entera de «D» y otra entera de «N». El dueño veía su rotación
 * convertida en dos turnos fijos y no entendía nada. Con razón.
 *
 * No hace falta ninguna bandera: si el patrón no tiene noches, el estado nunca
 * vale 'night' y la letra sale de `position.startTime` como siempre.
 */
/** La letra de un turno REAL: la banda de la hora a la que se entra. */
function horaDeEntradaAletra(ini: Date): "D" | "N" {
  // The band of the COMPANY clock, not the viewer's device.
  const h = Number(horaDeLaEmpresa(ini).slice(0, 2));

  return h >= 18 || h < 6 ? "N" : "D";
}

function dnCode(
  scheduleType: string | null | undefined,
  posStartTime: string | null | undefined,
  status: "day" | "night",
  posEndTime?: string | null,
): "D" | "N" {
  // Los puestos de una sola mitad no tienen nada que decidir.
  if (scheduleType === "12h-night") return "N";
  if (scheduleType === "12h-day") return "D";

  const horaDeEntrada = status === "night" ? posEndTime : posStartTime;
  const h = parseInt(String(horaDeEntrada || "").split(":")[0], 10);

  if (!Number.isNaN(h)) return h >= 18 || h < 6 ? "N" : "D";

  // Sin horas en la plaza, el estado del ciclo es lo único que queda.
  return status === "night" ? "N" : "D";
}

export type MonthStationBlockProps = {
  /**
   * EL TURNO QUE DE VERDAD EXISTE, por `guardId|fecha`.
   *
   * La rejilla pintaba la letra recalculando la rotación, mientras los turnos
   * generados estaban a un `Map` de distancia. Dos cuentas, dos verdades, y la
   * de la pantalla perdía: en Central BAS (2026-09-13) el motor tenía a un fijo
   * en D D D / N N N y la rejilla le pintaba una fila entera de «D».
   *
   * Un slot, una verdad: si hay turno, la letra sale de SU hora de entrada. La
   * rotación queda de respaldo sólo para los días que aún no tienen turno
   * generado (más allá del horizonte).
   */
  shiftByGuardDate: Map<
    string,
    { startTime?: string | Date | null; status?: string }
  >;
  /** Igual, pero por vigilante Y plaza: desempata a quien dobla. */
  shiftByGuardPosDate: Map<
    string,
    { startTime?: string | Date | null; status?: string }
  >;
  station: Station;
  stationPositions: StationPosition[];
  stationAlert: StationAlert | undefined;
  assignmentsByPosition: Map<string, GuardAssignment[]>;
  overrideByGuardDate: Map<string, ScheduleOverride>;
  sfStationCoverage: Map<
    string,
    {
      id: string;
      guardId: string;
      name: string;
      fullName: string;
      code: "D" | "N";
      ext?: boolean;
    }[]
  >;
  guardColorMap: Record<string, string>;
  monthDays: Date[];
  monthDayStrs: string[];
  monthDaySunday: boolean[];
  colA: number;
  colB: number;
  gridCols: string;
  todayStr: string;
  sel: BlockSel | null;
  /** Tarjeta elegida dentro de un casillero con dos personas (id de asignación). */
  cartaElegida: string | null;
  h: MonthGridHandlers;
};

function MonthStationBlockInner({
  shiftByGuardDate,
  shiftByGuardPosDate,
  station,
  stationPositions,
  stationAlert,
  assignmentsByPosition,
  overrideByGuardDate,
  sfStationCoverage,
  guardColorMap,
  monthDays,
  monthDayStrs,
  monthDaySunday,
  colA,
  colB,
  gridCols,
  todayStr,
  sel,
  cartaElegida,
  h,
}: MonthStationBlockProps) {
  const { t, i18n } = useTranslation();
  const hasPositions = stationPositions.length > 0;

  /* Horas distintas entre los fijos ⇒ cada fila es dueña de su mitad (diurno
     fijo / nocturno fijo). Iguales ⇒ se turnan por fase, como siempre. */
  const horasDecidenMitad = useMemo(
    () =>
      new Set(
        stationPositions
          .filter((p) => p.type === "fijo")
          .map((p) => String(p.startTime || "07:00")),
      ).size > 1,
    [stationPositions],
  );

  /* El anillo de la selección va por CLASE y no por `style` porque la celda ya
     usa `style` para su propio tinte, y un `background` en línea le ganaría
     siempre. `ring-primary`/`bg-primary` son los tokens puente de shadcn: se
     repintan solos cuando el usuario cambia el acento. */
  const cellSelCls = (rowKey: string, c: number): string => {
    if (!sel || c < sel.c1 || c > sel.c2 || !sel.keys.has(rowKey)) return "";

    return rowKey === sel.focusKey && c === sel.fc
      ? " ring-2 ring-inset ring-primary bg-primary/10"
      : " ring-1 ring-inset ring-primary/40 bg-primary/5";
  };

  /* ── A QUÉ HUECO PERTENECE CADA COBERTURA ──────────────────────────────
     `sfStationCoverage` es una lista por ESTACIÓN Y DÍA: quién vino a cubrir
     algo ahí. No dice a quién releva. Pintarla entera en la celda del que falta
     hace que el sacafranco del DÍA aparezca también en el turno de NOCHE —
     duplicado, cubriendo un hueco que no es suyo.

     Cada cobertura trae su mitad (D o N, de su hora de entrada), y cada fila del
     puesto tiene o no un hueco ese día:

       · falta (V/PM/F/L) EN UN DÍA QUE LE TOCABA TRABAJAR → hueco de SU mitad;
       · descanso de la rotación → hueco, pero de mitad desconocida: en un 24 h a
         dos, la mitad que queda al aire depende de dónde esté el otro fijo;
       · trabaja → sin hueco.

     Se reparte por coincidencia exacta de mitad primero, luego a los descansos,
     y lo que no encaja se pinta aparte bajo la primera fila (un refuerzo, o una
     cobertura de un día que nadie tenía asignado). Una cobertura se pinta UNA
     sola vez.

     El caché es por render: las celdas preguntan por fila y por día, y sin él
     este reparto se recalcularía una vez por cada casilla. */
  const cacheReparto = new Map<
    string,
    { por: Map<string, CoberturaDia[]>; sobrantes: CoberturaDia[] }
  >();
  const repartoDelDia = (dateStr: string, day: Date) => {
    const guardado = cacheReparto.get(dateStr);

    if (guardado) return guardado;
    const lista = sfStationCoverage.get(`${station.id}-${dateStr}`) || [];
    const por = new Map<string, CoberturaDia[]>();
    const sobrantes: CoberturaDia[] = [];

    if (!lista.length) {
      const vacio = { por, sobrantes };

      cacheReparto.set(dateStr, vacio);

      return vacio;
    }

    const huecos: { key: string; half: "D" | "N" | null }[] = [];

    for (const p of stationPositions) {
      for (const a of assignmentsByPosition.get(p.id) || EMPTY_ASG) {
        const ov = overrideByGuardDate.get(`${a.guardId}|${dateStr}`);
        const estado = h.isWorkDay(a, day);

        if (ov && ABSENCE_CODES.has(String(ov.type))) {
          // Falta, y además le TOCABA trabajar: hay que taparle su mitad. Si ese
          // día libraba igualmente, no deja ningún hueco que cubrir.
          if (estado !== "rest")
            huecos.push({ key: a.id, half: estado === "night" ? "N" : "D" });
          continue;
        }
        if (ov) continue; // D/N/24 escrito a mano: esa persona trabaja.
        if (estado === "rest") huecos.push({ key: a.id, half: null });
      }
    }

    const usados = new Set<number>();

    for (const c of lista) {
      let i = huecos.findIndex(
        (x, idx) => !usados.has(idx) && x.half === c.code,
      );

      if (i < 0)
        i = huecos.findIndex((x, idx) => !usados.has(idx) && x.half === null);
      if (i < 0) {
        sobrantes.push(c);
        continue;
      }
      usados.add(i);
      const enEsaFila = por.get(huecos[i].key) || [];

      enEsaFila.push(c);
      por.set(huecos[i].key, enEsaFila);
    }
    const listo = { por, sobrantes };

    cacheReparto.set(dateStr, listo);

    return listo;
  };

  /** Sólo la primera fila pinta la cobertura huérfana, o saldría repetida en
   *  cada posición del puesto. */
  const primeraFilaId = stationPositions[0]?.id;

  /**
   * ── UNA PÍLDORA POR PERSONA QUE CUBRE ────────────────────────────────────
   *
   * Esto pintaba SÓLO `lista[0]`. Un día con dos coberturas —lo normal cuando
   * alguien está de vacaciones: un relevo tapa el día y otro la noche— enseñaba
   * una sola, y CUÁL salía dependía del orden del array. El caso real: se cubre
   * la noche, la lista traía primero al del día, y la celda decía «D» con el
   * nombre del otro. Desde fuera: «registré turno nocturno y se fue al turno del
   * día», y en los días en que el otro relevo iba primero, el nocturno
   * sencillamente no aparecía.
   *
   * Ahora se apilan todas. Cada una arrastra y abre SU hoja del día.
   */
  const pildorasCobertura = (lista: CoberturaDia[], dateStr: string) =>
    lista.map((c) => (
      // Una EXTENSIÓN (alguien doblando porque su relevo no llegó) va en ámbar,
      // no en verde: el verde dice «cubierto y en orden», y esto está cubierto
      // pero NO está en orden — hay una persona encadenando dos turnos.
      <div
        key={c.id}
        draggable
        className="flex min-h-[16px] flex-1 cursor-grab flex-col items-center justify-center rounded active:cursor-grabbing"
        style={toneCard(
          c.ext ? "warn" : "ok",
          c.ext ? 18 : 12,
          c.ext ? 34 : 22,
        )}
        title={
          c.ext
            ? t("ui.MonthStationBlock.doblaTurno", {
                defaultValue: "{{nombre}} DOBLA turno ({{codigo}})",
                nombre: c.fullName,
                codigo: CODE_LABEL[c.code] ?? c.code,
              })
            : t("ui.MonthStationBlock.cubreArrastraParaMoverlo", {
                defaultValue:
                  "Cubre {{nombre}} — {{codigo}} · arrastra para moverlo · doble clic para editar el día",
                nombre: c.fullName,
                codigo: CODE_LABEL[c.code] ?? c.code,
              })
        }
        onDragStart={(e) => h.onCoverageDragStart(e, c.id)}
        /* La cobertura también es la hoja de asistencia de alguien: se abre igual
         que cualquier otro casillero. Antes sólo se podía arrastrar. */
        onDoubleClick={() =>
          h.setOverrideTarget({
            guardId: c.guardId,
            guardName: c.fullName,
            date: dateStr,
          })
        }
      >
        <span className="text-[10px] font-bold leading-none">
          {c.ext ? "2×" : c.code}
        </span>
        <span className="text-[8px] leading-none opacity-80">{c.name}</span>
      </div>
    ));

  const renderFijoCell = (
    pos: StationPosition,
    posAssignments: GuardAssignment[],
    day: Date,
    dayIdx: number,
  ) => {
    const dateStr = monthDayStrs[dayIdx];
    const isToday = dateStr === todayStr;
    const isSunday = monthDaySunday[dayIdx];
    // La selección se pinta con clases (`cellSelCls`), y un `background` en
    // línea le ganaría siempre: el tinte de hoy/domingo se cede mientras la
    // celda está seleccionada, o la selección no se vería en esas columnas.
    const selCls = cellSelCls(pos.id, dayIdx);

    return (
      <div
        key={dayIdx}
        style={{
          borderRight: '1px solid var(--hairline)',
          background: selCls
            ? undefined
            : isToday
              ? TINT_TODAY
              : isSunday ? TINT_SUNDAY : undefined,
        }}
        onContextMenu={e => h.openCellCtx(e, station, pos, posAssignments, dateStr)}
        /* En un móvil no hay clic derecho, y en este menú vive casi todo lo que
           se puede hacer con un día: cubrirlo, ponerle una novedad, cambiarle
           las horas, borrarlo. Sin esto, la rejilla se veía pero no se operaba.
           El gesto se cancela al mover el dedo, así que desplazar la hoja —lo
           que más se hace en un teléfono— sigue funcionando igual. */
        {...handlersDePulsacionLarga(punto =>
          h.openCellCtx(punto, station, pos, posAssignments, dateStr),
        )}
        onDragOver={e => e.preventDefault()}
        onDrop={e => h.handleDrop(e, station.id, pos.id, dateStr)}
        onMouseDown={e => { if (e.button === 0) h.startCellSelect(pos.id, dayIdx, e.shiftKey); }}
        onMouseEnter={() => h.hoverCellSelect(pos.id, dayIdx)}
        id={`hc-${pos.id}-${dayIdx}`}
        /* Celda de rejilla: estilos PLANOS, jamás `backdrop-filter`. Este nodo
           se pinta una vez por puesto y por día — un mes de un turno grande son
           miles. */
        className={`flex min-h-[36px] px-0.5 py-0.5${selCls}`}
      >
        {posAssignments.length === 0 ? (
          // SIN VIGILANTE = SIN ROTACIÓN. Aquí se pintaba D/N/L a partir del
          // offset guardado en el puesto: una rotación inventada para un puesto
          // que nadie trabaja, que es de dónde salían las "L" que no cuadraban
          // con nadie. La fase es del vigilante; sin vigilante no hay fase.
          //
          // Lo que SÍ hay que enseñar es un turno REAL: un puesto sin rotación
          // se tapa día a día, y ése es justo el caso en el que la cobertura no
          // tiene ninguna «L» donde pintarse (ver `repartoDelDia`).
          (() => {
            const sueltas =
              pos.id === primeraFilaId
                ? repartoDelDia(dateStr, day).sobrantes
                : [];

            if (sueltas.length)
              return (
                <div className="flex flex-1 flex-col gap-0.5">
                  {pildorasCobertura(sueltas, dateStr)}
                </div>
              );

            return (
              <div
                className="flex flex-1 cursor-pointer items-center justify-center rounded border border-dashed"
                style={{
                  borderColor: "var(--hairline)",
                  background: "var(--glass-sunken)",
                }}
                title={t("ui.Schedule.puestoSinVigilanteDobleClic")}
                onDoubleClick={() =>
                  h.openAssignForm(station.id, pos.id, dateStr)
                }
              >
                <span
                  className="text-[10px] font-bold"
                  style={{ color: "var(--ink-faint)" }}
                >
                  ·
                </span>
              </div>
            );
          })()
        ) : (
          <div className="flex-1 flex flex-col gap-0.5">
            {posAssignments.map((assignment) => {
              const guardName = nombreDeVigilante(assignment.guard, "?");
              const color =
                guardColorMap[assignment.guardId] || "var(--ink-faint)";
              const override = overrideByGuardDate.get(
                `${assignment.guardId}|${dateStr}`,
              );
              /* Sólo hay algo que elegir cuando el casillero apila más de una
                 persona; con una sola, el anillo sería ruido. */
              const apiladas = posAssignments.length > 1;
              const elegida = apiladas && cartaElegida === assignment.id;
              const cartaProps = apiladas
                ? { onMouseDown: () => h.pickAssignment(assignment.id) }
                : {};
              const anillo = elegida ? " ring-2 ring-inset ring-primary" : "";

              // If there's an override, show it instead of calculated rotation
              if (override) {
                const oType = override.type;
                // Quien viene a tapar ESTE hueco se apila en la MISMA celda,
                // debajo de la V: el puesto que se cubre es éste.
                const relevos =
                  repartoDelDia(dateStr, day).por.get(assignment.id) || [];
                const tarjetaNovedad = (
                  <div
                    key={assignment.id}
                    {...cartaProps}
                    className={`flex min-h-[18px] flex-1 cursor-pointer items-center justify-center rounded${anillo}`}
                    style={{
                      ...codePill(oType),
                      borderLeft: `2px solid ${color}`,
                    }}
                    title={t("ui.MonthStationBlock.novedadDobleClicParaEditar", {
                      defaultValue:
                        "{{nombre}} — {{codigo}}{{nota}} (doble clic para editar)",
                      nombre: guardName,
                      codigo: CODE_LABEL[oType] ?? oType,
                      nota: override.note ? ": " + override.note : "",
                    })}
                    onDoubleClick={() =>
                      h.setOverrideTarget({
                        guardId: assignment.guardId,
                        guardName,
                        date: dateStr,
                        assignmentId: assignment.id,
                      })
                    }
                  >
                    <span className="text-[10px] font-bold">{oType}</span>
                  </div>
                );

                if (!relevos.length) return tarjetaNovedad;

                return (
                  <div
                    key={assignment.id}
                    className="flex flex-1 flex-col gap-0.5"
                  >
                    {tarjetaNovedad}
                    {pildorasCobertura(relevos, dateStr)}
                  </div>
                );
              }

              const workStatus = h.isWorkDay(assignment, day);

              if (workStatus === "rest") {
                const coveringSfs =
                  repartoDelDia(dateStr, day).por.get(assignment.id) || [];

                /* Cubierto: los relevos que tapan ESTE hueco (ver
                   `repartoDelDia`). Antes esta celda enseñaba `coveringSfs[0]`
                   —el segundo relevo era invisible— y después, al apilarlos
                   todos sin repartir, el del día salía además en la noche. */
                if (coveringSfs.length) {
                  return (
                    <div
                      key={assignment.id}
                      {...cartaProps}
                      className={`flex flex-1 flex-col gap-0.5${anillo}`}
                    >
                      {pildorasCobertura(coveringSfs, dateStr)}
                    </div>
                  );
                }

                // Sin nadie que lo cubra: la «L» pelada. No hay nada que
                // arrastrar aquí — lo arrastrable es la cobertura, y no la hay.
                return (
                  <div
                    key={assignment.id}
                    {...cartaProps}
                    className={`relative flex min-h-[18px] flex-1 cursor-pointer items-center justify-center rounded${anillo}`}
                    style={{ background: "var(--glass-sunken)" }}
                    title={t("ui.MonthStationBlock.libreClicDerechoCubrir", {
                      defaultValue:
                        "{{nombre}} — Libre (clic derecho: cubrir este día)",
                      nombre: guardName,
                    })}
                    onDoubleClick={() =>
                      h.setOverrideTarget({
                        guardId: assignment.guardId,
                        guardName,
                        date: dateStr,
                        assignmentId: assignment.id,
                      })
                    }
                  >
                    <span
                      className="text-[10px] font-bold"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      L
                    </span>
                  </div>
                );
              }

              const esAprendiz = (assignment as any).role === "shadow";
              // Un slot, una verdad: si el turno existe, manda su hora.
              // El turno de ESTA plaza manda; el mapa por día es el respaldo
              // para el turno que llega sin plaza asignada.
              const suTurno =
                shiftByGuardPosDate.get(
                  `${assignment.guardId}|${pos.id}|${dateStr}`,
                ) ?? shiftByGuardDate.get(`${assignment.guardId}|${dateStr}`);
              // Si lo único suyo ese día es un doblaje, su hora no describe
              // esta plaza: vale más la ventana declarada del puesto.
              const turnoReal =
                suTurno?.status === "extension" ? undefined : suTurno;
              const horaReal = turnoReal?.startTime
                ? new Date(turnoReal.startTime)
                : null;
              const code = horaReal
                ? horaDeEntradaAletra(horaReal)
                : dnCode(
                    station.scheduleType,
                    pos.startTime,
                    workStatus as "day" | "night",
                    pos.endTime,
                  );
              // El color sale del MISMO mapa que la leyenda; el 24 h se pinta con
              // su propio código, que ya es el más denso de la rejilla. Un puesto
              // partido en dos mitades NO es un 24 h para quien lo trabaja: son
              // 12 h: la píldora '24' ahí mentiría sobre la jornada.
              const is24h =
                station.scheduleType === "24h" && !horasDecidenMitad;
              const pillCode = is24h && code !== "N" ? "24" : code;

              return (
                <div
                  key={assignment.id}
                  {...cartaProps}
                  className={`flex min-h-[18px] flex-1 cursor-pointer items-center justify-center rounded hover:opacity-80${anillo}`}
                  style={{
                    ...codePill(pillCode),
                    borderLeft: `2px solid ${color}`,
                    // El aprendiz se distingue del titular de un vistazo: misma
                    // letra —trabaja el mismo día— pero apagado y punteado,
                    // porque esa plaza NO está cubierta por él.
                    ...(esAprendiz
                      ? {
                          opacity: 0.55,
                          borderStyle: "dashed",
                          borderWidth: "1px",
                        }
                      : null),
                  }}
                  title={
                    esAprendiz
                      ? t("ui.MonthStationBlock.aprendizEnAcompanamiento", {
                          defaultValue:
                            "{{nombre}} — aprendiz en acompañamiento (no cuenta como cobertura)",
                          nombre: guardName,
                        })
                      : t("ui.MonthStationBlock.dobleClicParaNovedad", {
                          defaultValue:
                            "{{nombre}} — {{codigo}}{{extra}} (doble clic para novedad)",
                          nombre: guardName,
                          codigo: CODE_LABEL[code] ?? code,
                          extra: is24h ? " · 24 h" : "",
                        })
                  }
                  onDoubleClick={() =>
                    h.setOverrideTarget({
                      guardId: assignment.guardId,
                      guardName,
                      date: dateStr,
                      assignmentId: assignment.id,
                    })
                  }
                >
                  <span className="text-[10px] font-bold">
                    {esAprendiz ? `${code}·a` : code}
                  </span>
                </div>
              );
            })}
            {/* El fijo TRABAJA y además vino alguien a cubrir: su píldora se
                apila debajo en vez de quedar invisible detrás de la D/N. */}
            {pos.id === primeraFilaId &&
              (() => {
                const sueltas = repartoDelDia(dateStr, day).sobrantes;

                return sueltas.length ? (
                  <>{pildorasCobertura(sueltas, dateStr)}</>
                ) : null;
              })()}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="last:border-b-0"
      style={{ borderBottom: "1px solid var(--hairline)" }}
    >
      {/* Station header */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: gridCols,
          background: "var(--glass-sunken)",
        }}
      >
        <div
          className="sticky left-0 z-20 flex items-center gap-2 px-4 py-2"
          style={{
            background: "var(--glass-solid)",
            borderRight: "1px solid var(--hairline)",
          }}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              {/* Nominativo: several puestos share a name, so
                  the name alone identifies nothing. */}
              {station.nickname && (
                <span
                  className="glass-sunken shrink-0 px-1.5 py-0.5 font-mono text-[10px] font-bold"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {station.nickname}
                </span>
              )}
              <div className="truncate text-sm font-semibold">
                {station.stationName}
              </div>
            </div>
            <button
              className="cg-focus text-[11px] transition-colors hover:underline"
              style={{ color: "var(--ink-soft)" }}
              title={t(
                "ui.Schedule.cambiarTipoDeHorarioRotacion",
                "Cambiar tipo de horario / rotación",
              )}
              onClick={() => h.configureStation(station)}
            >
              {(() => {
                /* The REAL schedule, like the station cards: «8h Diurno ·
                   09:00–17:00 · lun–vie». It used to print only the type
                   («Diurno (12h)») for a 09:00–17:00 post (Mike, 2026-10-29). */
                if (!station.scheduleType)
                  return t("ui.MonthStationBlock.sinConfigurar", "Sin configurar");
                const fija: any = (stationPositions as any[]).find((p) => p.type !== "sacafranco");
                const r = resumenDeHorario(station.scheduleType, {
                  startingTimeInDay: (station as any).startingTimeInDay ?? fija?.startTime,
                  finishTimeInDay: (station as any).finishTimeInDay ?? fija?.endTime,
                });
                const tipo = r.clave
                  ? etiquetaDeJornada(t as any, r)
                  : SCHEDULE_TYPE_KEY[station.scheduleType]
                    ? t(SCHEDULE_TYPE_KEY[station.scheduleType])
                    : station.scheduleType;
                const dias = diasCompactos(diasDeLasPlazas(stationPositions as any[]), i18n.language);

                return [tipo, r.ventana, dias].filter(Boolean).join(" · ");
              })()}
            </button>
            {stationAlert && (
              <div className="mt-1 flex items-center gap-1 flex-wrap">
                {stationAlert.missingFijoCount > 0 && (
                  <span
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold tabular-nums"
                    style={toneCard("bad")}
                  >
                    <AlertTriangle size={9} />
                    {t("ui.MonthStationBlock.fijosFaltan", {
                      defaultValue: "{{count}} fijo(s) faltan",
                      count: stationAlert.missingFijoCount,
                    })}
                  </span>
                )}
                {stationAlert.uncoveredDays > 0 && (
                  <span
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold tabular-nums"
                    style={toneCard("warn")}
                  >
                    <AlertTriangle size={9} />
                    {t("ui.MonthStationBlock.diasSinCubrir", {
                      defaultValue: "{{count}} día(s) sin cubrir",
                      count: stationAlert.uncoveredDays,
                    })}
                  </span>
                )}
              </div>
            )}
          </div>
          {!hasPositions && (
            <Button
              className="text-xs h-7"
              size="sm"
              variant="outline"
              onClick={() => h.configureStation(station)}
            >
              {t("ui.MonthStationBlock.configurar", "Configurar")}
            </Button>
          )}
          {hasPositions && (
            <div className="flex items-center gap-1">
              <button
                className="cg-btn-ghost cg-focus rounded p-1 transition-colors"
                title={t(
                  "ui.Schedule.reconfigurarElPuestoTipoDe",
                  "Reconfigurar el puesto (tipo de horario y rotación)",
                )}
                onClick={() => h.configureStation(station)}
              >
                <Clock size={14} />
              </button>
              <button
                className="cg-btn-ghost cg-focus rounded p-1 transition-colors"
                title={t(
                  "ui.MonthStationBlock.agregarUnPuestoAEstaEstacion",
                  "Agregar un puesto a esta estación (fijo o sacafranco)",
                )}
                onClick={() => h.addPosition(station.id)}
              >
                <Plus size={14} />
              </button>
            </div>
          )}
        </div>
        {/* Un solo nodo para las 365 rayitas — ver `columnRules`. */}
        <div style={{ gridColumn: "2 / -1", ...columnRules(COL_W) }} />
      </div>

      {/* Position rows */}
      {stationPositions.map((pos) => {
        const posAssignments = assignmentsByPosition.get(pos.id) || EMPTY_ASG;
        const meta = POSITION_TONE[pos.type] || POSITION_TONE.fijo;
        const Icon = meta.icon;

        return (
          <div
            key={pos.id}
            className="grid"
            style={{
              gridTemplateColumns: gridCols,
              borderTop: "1px solid var(--hairline)",
            }}
          >
            {/* Nombre del puesto */}
            <div
              className="sticky left-0 z-20 flex items-center gap-2 px-4 py-2"
              id={`hr-${pos.id}`}
              style={{
                background: "var(--glass-solid)",
                borderRight: "1px solid var(--hairline)",
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => h.handleDrop(e, station.id, pos.id)}
            >
              <div
                className="flex h-6 w-6 items-center justify-center rounded"
                style={tonePill(meta.tone, 14)}
              >
                <Icon size={12} />
              </div>
              <div className="min-w-0 flex-1">
                <button
                  className="cg-focus block max-w-full truncate text-left text-xs font-semibold hover:underline"
                  title={t(
                    "ui.MonthStationBlock.editarElPuestoSinRehacer",
                    "Editar la estación (nombre, horas, puestos) sin rehacerla",
                  )}
                  type="button"
                  onClick={() => h.editPosition(station, pos)}
                >
                  {pos.name}
                </button>
                <div
                  className="text-[10px] tabular-nums"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {(() => {
                    // Real hours come from the POSITION (custom blocks carry
                    // their own window; start==end wraps the full day).
                    // A 24h STATION is covered by two fijos doing 12h each,
                    // swapping day/night — label the fijo, not the station.
                    if (station.scheduleType === "24h" && !horasDecidenMitad)
                      return t(
                        "ui.MonthStationBlock.turnosDe12hRotativo",
                        "Turnos de 12h · D/N rotativo",
                      );
                    const st5 = (pos.startTime || "").slice(0, 5);
                    const en5 = (pos.endTime || "").slice(0, 5);

                    if (st5 && en5)
                      return st5 === en5
                        ? `${st5} → ${en5} · 24h`
                        : `${st5} – ${en5}`;

                    return station.scheduleType === "12h-night"
                      ? "19:00 – 07:00"
                      : "07:00 – 19:00";
                  })()}
                </div>
              </div>
              {/* Assigned guard names — draggable to MOVE to another puesto */}
              {posAssignments.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  {posAssignments.map((a) => {
                    const name = a.guard
                      ? nombreDeVigilante(a.guard).split(" ")[0]
                      : "?";
                    const color =
                      guardColorMap[a.guardId] || "var(--ink-faint)";

                    return (
                      <button
                        key={a.id}
                        draggable
                        style={{
                          background: `color-mix(in oklab, ${color} 16%, transparent)`,
                          borderLeft: `2px solid ${color}`,
                          color: 'var(--ink)',
                        }}
                        title={t("ui.MonthStationBlock.arrastraParaMoverClicParaRemover", {
                          defaultValue:
                            "{{nombre}} — Arrastra para mover · Clic para remover",
                          nombre: nombreDeVigilante(
                            a.guard,
                            t("comun.vigilante", "Vigilante"),
                          ),
                        })}
                        onDragStart={e => h.onGuardDragStart(e, a.guardId, a)}
                        onClick={() => h.removeAssignment(a.id)}
                        /* Ficha arrastrable: el color de identidad
                           va en el filo, no en la tinta — a ese
                           tamaño el texto necesita `--ink`. */
                        className="cg-focus cursor-grab rounded px-1.5 py-0.5 text-[9px] font-semibold active:cursor-grabbing"
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
                    className="cg-focus rounded-md p-1 transition-colors"
                    style={tonePill("brand", 14)}
                    title={t("comun.asignarVigilante")}
                    onClick={() => h.openAssignForm(station.id, pos.id)}
                  >
                    <Plus size={12} />
                  </button>
                  <button
                    className="cg-focus rounded-md p-1 transition-colors hover:bg-[color-mix(in_oklab,var(--bad)_12%,transparent)]"
                    style={{ color: "var(--ink-faint)" }}
                    title={t(
                      "ui.Schedule.eliminarPosicion",
                      "Eliminar posición",
                    )}
                    onClick={() => h.deletePosition(station.id, pos.id)}
                  >
                    <X size={11} />
                  </button>
                </div>
              )}
            </div>

            {/* Day cells */}
            <div />
            {monthDays
              .slice(colA, colB)
              .map((day, k) =>
                renderFijoCell(pos, posAssignments, day, colA + k),
              )}
            <div />
          </div>
        );
      })}

      {/* No positions configured */}
      {!hasPositions && (
        <div
          className="grid"
          style={{
            gridTemplateColumns: gridCols,
            borderTop: "1px solid var(--hairline)",
          }}
        >
          <div className="col-span-full px-4 py-4 text-center">
            <p className="mb-2 text-xs" style={{ color: "var(--ink-soft)" }}>
              {t("ui.Schedule.estePuestoNoTienePosiciones")}
            </p>
            <Button
              className="text-xs"
              size="sm"
              variant="outline"
              onClick={() => h.configureStation(station)}
            >
              {t(
                "ui.MonthStationBlock.configurarPosiciones",
                "Configurar posiciones",
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* `React.memo` a secas: la comparación por referencia es exactamente la que hace
   falta. Los datos llegan de `useMemo`, los manejadores en un objeto estable, y
   `sel` vale `null` —siempre el mismo valor— en los puestos que la selección no
   toca, que son todos menos uno mientras se arrastra. */
const MonthStationBlock = React.memo(MonthStationBlockInner);

export default MonthStationBlock;
