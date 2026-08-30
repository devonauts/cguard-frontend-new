import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Clock, Plus, Shield, Sun, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { nombreDeVigilante } from '@/lib/guardName';
import { type Tone, tonePill, toneCard, CODE_LABEL, codePill, columnRules } from './codeTones';
import { COL_W } from './gridBand';
import type { StationPosition, GuardAssignment, Station, ScheduleOverride, StationAlert } from '@/types';

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
  openAssignForm: (stationId: string, positionId: string, dateStr?: string) => void;
  removeAssignment: (assignmentId: string) => void;
  onGuardDragStart: (e: React.DragEvent, guardId: string, fromAssignment?: GuardAssignment) => void;
  handleDrop: (e: React.DragEvent, stationId: string, positionId: string, dateStr?: string) => void;
  openCellCtx: (e: React.MouseEvent, station: Station, pos: StationPosition, posAssignments: GuardAssignment[], dateStr: string) => void;
  setOverrideTarget: (t: { guardId: string; guardName: string; date: string; assignmentId?: string }) => void;
  startCellSelect: (rowKey: string, c: number, shift: boolean) => void;
  hoverCellSelect: (rowKey: string, c: number) => void;
  isWorkDay: (assignment: GuardAssignment, date: Date) => 'day' | 'night' | 'rest';
};

const EMPTY_ASG: GuardAssignment[] = [];

/* Copia literal de los de la hoja a propósito: son el TINTE de la rejilla y
   tienen que valer lo mismo en los dos sitios. */
const TINT_TODAY = 'color-mix(in oklab, var(--brand) 8%, transparent)';
const TINT_SUNDAY = 'color-mix(in oklab, var(--bad) 5%, transparent)';

const POSITION_TONE: Record<string, { tone: Tone; icon: LucideIcon }> = {
  fijo: { tone: 'warn', icon: Sun },
  sacafranco: { tone: 'ok', icon: Shield },
};

// Día/Noche letter for a WORKING cell — misma regla que el backend
// (`shiftHalfByStart`, umbral 18/6) para que la letra pintada coincida con el
// turno generado.
function dnCode(
  scheduleType: string | null | undefined,
  posStartTime: string | null | undefined,
  status: 'day' | 'night',
  /**
   * ¿Los fijos de este puesto tienen HORAS DISTINTAS entre sí? Entonces cada uno
   * es dueño de su mitad y la letra sale de SU horario, no de la fase.
   *
   * Es la misma regla que el detector de huecos del backend (`hoursDecideHalf`
   * en shiftGenerationService): un puesto de 24 h con Fijo 1 07:00–19:00 y
   * Fijo 2 19:00–07:00 son un diurno fijo y un nocturno fijo, no dos que se
   * turnan. Sin esto la rejilla pintaba «D» al de la noche —la rotación sin
   * noches sólo sabe decir 'day'— y el horario dejaba de coincidir con lo que
   * el motor genera de verdad.
   */
  hoursDecideHalf?: boolean,
): 'D' | 'N' {
  if (hoursDecideHalf) {
    const hp = parseInt(String(posStartTime || '').split(':')[0], 10);
    if (!Number.isNaN(hp)) return hp >= 18 || hp < 6 ? 'N' : 'D';
  }
  if (scheduleType === '24h') return status === 'night' ? 'N' : 'D';
  if (scheduleType === '12h-night') return 'N';
  if (scheduleType === '12h-day') return 'D';
  const h = parseInt(String(posStartTime || '').split(':')[0], 10);
  return !Number.isNaN(h) && (h >= 18 || h < 6) ? 'N' : 'D';
}

export type MonthStationBlockProps = {
  station: Station;
  stationPositions: StationPosition[];
  stationAlert: StationAlert | undefined;
  assignmentsByPosition: Map<string, GuardAssignment[]>;
  overrideByGuardDate: Map<string, ScheduleOverride>;
  sfStationCoverage: Map<string, { name: string; fullName: string; code: 'D' | 'N' }[]>;
  guardColorMap: Record<string, string>;
  monthDays: Date[];
  monthDayStrs: string[];
  monthDaySunday: boolean[];
  colA: number;
  colB: number;
  gridCols: string;
  todayStr: string;
  sel: BlockSel | null;
  h: MonthGridHandlers;
};

function MonthStationBlockInner({
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
  h,
}: MonthStationBlockProps) {
  const { t } = useTranslation();
  const hasPositions = stationPositions.length > 0;

  /* Horas distintas entre los fijos ⇒ cada fila es dueña de su mitad (diurno
     fijo / nocturno fijo). Iguales ⇒ se turnan por fase, como siempre. */
  const horasDecidenMitad = useMemo(
    () => new Set(stationPositions.filter(p => p.type === 'fijo').map(p => String(p.startTime || '07:00'))).size > 1,
    [stationPositions],
  );

  /* El anillo de la selección va por CLASE y no por `style` porque la celda ya
     usa `style` para su propio tinte, y un `background` en línea le ganaría
     siempre. `ring-primary`/`bg-primary` son los tokens puente de shadcn: se
     repintan solos cuando el usuario cambia el acento. */
  const cellSelCls = (rowKey: string, c: number): string => {
    if (!sel || c < sel.c1 || c > sel.c2 || !sel.keys.has(rowKey)) return '';
    return rowKey === sel.focusKey && c === sel.fc
      ? ' ring-2 ring-inset ring-primary bg-primary/10'
      : ' ring-1 ring-inset ring-primary/40 bg-primary/5';
  };

  /* ── COBERTURA HUÉRFANA ────────────────────────────────────────────────
     Una cobertura se pinta SOBRE la «L» del fijo al que releva. Eso deja dos
     agujeros por los que un turno real desaparece de la hoja:

       · el puesto no tiene vigilante ACTIVO (la asignación quedó `ended`, o
         nunca se hizo) — la fila entera sale en «·» y no hay ninguna «L» sobre
         la que pintar;
       · el fijo TRABAJA ese día — la celda ya muestra su D/N/24 y tapa al que
         viene a cubrir además de él.

     En los dos casos el turno se creaba en la base y la rejilla no se movía:
     «cubrí la noche y no pasó nada». Esto devuelve la lista de coberturas del
     día CUANDO ninguna fila del puesto va a enseñarlas, para pintarlas en la
     primera fila. Devuelve `null` —y no cuesta nada— en cuanto alguna «L» ya
     se encarga, que es el caso normal del sacafranco. */
  const coberturaSinPintar = (dateStr: string, day: Date) => {
    const lista = sfStationCoverage.get(`${station.id}-${dateStr}`);
    if (!lista || !lista.length) return null;
    for (const p of stationPositions) {
      for (const a of assignmentsByPosition.get(p.id) || EMPTY_ASG) {
        // Una novedad ocupa la celda entera: esa fila no pinta la cobertura.
        if (overrideByGuardDate.has(`${a.guardId}|${dateStr}`)) continue;
        if (h.isWorkDay(a, day) === 'rest') return null;
      }
    }
    return lista;
  };

  /** Sólo la primera fila pinta la cobertura huérfana, o saldría repetida en
   *  cada posición del puesto. */
  const primeraFilaId = stationPositions[0]?.id;

  /** La píldora de una cobertura que ninguna «L» va a enseñar. */
  const pildoraCobertura = (lista: { name: string; fullName: string; code: 'D' | 'N' }[]) => (
    <div
      className="flex min-h-[18px] flex-1 cursor-default flex-col items-center justify-center rounded"
      style={toneCard('ok', 12, 22)}
      title={`Cubre: ${lista.map(x => x.fullName).join(', ')}`}
    >
      <span className="text-[10px] font-bold leading-none">{lista[0].code}</span>
      <span className="text-[8px] leading-none opacity-80">{lista[0].name}</span>
    </div>
  );

  const renderFijoCell = (pos: StationPosition, posAssignments: GuardAssignment[], day: Date, dayIdx: number) => {
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
        id={`hc-${pos.id}-${dayIdx}`}
        /* Celda de rejilla: estilos PLANOS, jamás `backdrop-filter`. Este nodo
           se pinta una vez por puesto y por día — un mes de un turno grande son
           miles. */
        className={`flex min-h-[36px] px-0.5 py-0.5${selCls}`}
        style={{
          borderRight: '1px solid var(--hairline)',
          background: selCls
            ? undefined
            : isToday
              ? TINT_TODAY
              : isSunday ? TINT_SUNDAY : undefined,
        }}
        onMouseDown={e => { if (e.button === 0) h.startCellSelect(pos.id, dayIdx, e.shiftKey); }}
        onMouseEnter={() => h.hoverCellSelect(pos.id, dayIdx)}
        onDragOver={e => e.preventDefault()}
        onDrop={e => h.handleDrop(e, station.id, pos.id, dateStr)}
        onContextMenu={e => h.openCellCtx(e, station, pos, posAssignments, dateStr)}
      >
        {posAssignments.length === 0 ? (
          // SIN VIGILANTE = SIN ROTACIÓN. Aquí se pintaba D/N/L a partir del
          // offset guardado en el puesto: una rotación inventada para un puesto
          // que nadie trabaja, que es de dónde salían las "L" que no cuadraban
          // con nadie. La fase es del vigilante; sin vigilante no hay fase.
          //
          // Lo que SÍ hay que enseñar es un turno REAL: un puesto sin rotación
          // se tapa día a día, y ése es justo el caso en el que la cobertura no
          // tiene ninguna «L» donde pintarse (ver `coberturaSinPintar`).
          (() => {
            const huerfana = pos.id === primeraFilaId ? coberturaSinPintar(dateStr, day) : null;
            if (huerfana) return pildoraCobertura(huerfana);
            return (
              <div
                className="flex flex-1 cursor-pointer items-center justify-center rounded border border-dashed"
                style={{ borderColor: 'var(--hairline)', background: 'var(--glass-sunken)' }}
                title={t('ui.Schedule.puestoSinVigilanteDobleClic')}
                onDoubleClick={() => h.openAssignForm(station.id, pos.id, dateStr)}
              >
                <span className="text-[10px] font-bold" style={{ color: 'var(--ink-faint)' }}>·</span>
              </div>
            );
          })()
        ) : (
          <div className="flex-1 flex flex-col gap-0.5">
            {posAssignments.map(assignment => {
              const guardName = nombreDeVigilante(assignment.guard, '?');
              const color = guardColorMap[assignment.guardId] || 'var(--ink-faint)';
              const override = overrideByGuardDate.get(`${assignment.guardId}|${dateStr}`);

              // If there's an override, show it instead of calculated rotation
              if (override) {
                const oType = override.type;
                return (
                  <div
                    key={assignment.id}
                    className="flex min-h-[18px] flex-1 cursor-pointer items-center justify-center rounded"
                    style={{ ...codePill(oType), borderLeft: `2px solid ${color}` }}
                    title={`${guardName} — ${CODE_LABEL[oType] ?? oType}${override.note ? ': ' + override.note : ''} (doble clic para editar)`}
                    onDoubleClick={() => h.setOverrideTarget({ guardId: assignment.guardId, guardName, date: dateStr, assignmentId: assignment.id })}
                  >
                    <span className="text-[10px] font-bold">{oType}</span>
                  </div>
                );
              }

              const workStatus = h.isWorkDay(assignment, day);

              if (workStatus === 'rest') {
                const coverKey = `${station.id}-${dateStr}`;
                const coveringSfs = sfStationCoverage.get(coverKey) || [];
                const sfLabel = coveringSfs.length > 0 ? coveringSfs[0].name : '';
                const sfTooltip = coveringSfs.length > 0 ? coveringSfs.map(s => s.fullName).join(', ') : '';
                return (
                  <div
                    key={assignment.id}
                    className="relative flex min-h-[18px] flex-1 cursor-pointer items-center justify-center rounded"
                    style={sfLabel ? toneCard('ok', 12, 22) : { background: 'var(--glass-sunken)' }}
                    title={`${guardName} — Libre${sfTooltip ? ` · Cubre: ${sfTooltip}` : ' (clic derecho: asignar sacafranco)'}`}
                    onDoubleClick={() => h.setOverrideTarget({ guardId: assignment.guardId, guardName, date: dateStr, assignmentId: assignment.id })}
                  >
                    {sfLabel ? (
                      <span className="text-[8px] font-bold">{sfLabel}</span>
                    ) : (
                      <span className="text-[10px] font-bold" style={{ color: 'var(--ink-faint)' }}>L</span>
                    )}
                  </div>
                );
              }

              const code = dnCode(station.scheduleType, pos.startTime, workStatus as 'day' | 'night', horasDecidenMitad);
              // El color sale del MISMO mapa que la leyenda; el 24 h se pinta con
              // su propio código, que ya es el más denso de la rejilla. Un puesto
              // partido en dos mitades NO es un 24 h para quien lo trabaja: son
              // 12 h: la píldora '24' ahí mentiría sobre la jornada.
              const is24h = station.scheduleType === '24h' && !horasDecidenMitad;
              const pillCode = is24h && code !== 'N' ? '24' : code;

              return (
                <div
                  key={assignment.id}
                  className="flex min-h-[18px] flex-1 cursor-pointer items-center justify-center rounded hover:opacity-80"
                  style={{ ...codePill(pillCode), borderLeft: `2px solid ${color}` }}
                  title={`${guardName} — ${CODE_LABEL[code] ?? code}${is24h ? ' · 24 h' : ''} (doble clic para novedad)`}
                  onDoubleClick={() => h.setOverrideTarget({ guardId: assignment.guardId, guardName, date: dateStr, assignmentId: assignment.id })}
                >
                  <span className="text-[10px] font-bold">{code}</span>
                </div>
              );
            })}
            {/* El fijo TRABAJA y además vino alguien a cubrir: su píldora se
                apila debajo en vez de quedar invisible detrás de la D/N. */}
            {pos.id === primeraFilaId && (() => {
              const huerfana = coberturaSinPintar(dateStr, day);
              return huerfana ? pildoraCobertura(huerfana) : null;
            })()}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="last:border-b-0" style={{ borderBottom: '1px solid var(--hairline)' }}>
      {/* Station header */}
      <div className="grid" style={{ gridTemplateColumns: gridCols, background: 'var(--glass-sunken)' }}>
        <div
          className="sticky left-0 z-20 flex items-center gap-2 px-4 py-2"
          style={{ background: 'var(--glass-solid)', borderRight: '1px solid var(--hairline)' }}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              {/* Nominativo: several puestos share a name, so
                  the name alone identifies nothing. */}
              {station.nickname && (
                <span className="glass-sunken shrink-0 px-1.5 py-0.5 font-mono text-[10px] font-bold" style={{ color: 'var(--ink-soft)' }}>
                  {station.nickname}
                </span>
              )}
              <div className="truncate text-sm font-semibold">{station.stationName}</div>
            </div>
            <button
              onClick={() => h.configureStation(station)}
              className="cg-focus text-[11px] transition-colors hover:underline"
              style={{ color: 'var(--ink-soft)' }}
              title={t("ui.Schedule.cambiarTipoDeHorarioRotacion", "Cambiar tipo de horario / rotación")}
            >
              {station.scheduleType ? station.scheduleType.replace('-', ' ').toUpperCase() : 'Sin configurar'}
            </button>
            {stationAlert && (
              <div className="mt-1 flex items-center gap-1 flex-wrap">
                {stationAlert.missingFijoCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold tabular-nums" style={toneCard('bad')}>
                    <AlertTriangle size={9} />
                    {stationAlert.missingFijoCount} fijo(s) faltan
                  </span>
                )}
                {stationAlert.sfUncoveredDays > 0 && (
                  <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold tabular-nums" style={toneCard('warn')}>
                    <AlertTriangle size={9} />
                    {stationAlert.sfUncoveredDays} L sin SF
                  </span>
                )}
              </div>
            )}
          </div>
          {!hasPositions && (
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => h.configureStation(station)}>
              Configurar
            </Button>
          )}
          {hasPositions && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => h.configureStation(station)}
                className="cg-btn-ghost cg-focus rounded p-1 transition-colors"
                title={t("ui.Schedule.reconfigurarElPuestoTipoDe", "Reconfigurar el puesto (tipo de horario y rotación)")}
              >
                <Clock size={14} />
              </button>
              <button
                onClick={() => h.addPosition(station.id)}
                className="cg-btn-ghost cg-focus rounded p-1 transition-colors"
                title="Agregar un puesto a esta estación (fijo o sacafranco)"
              >
                <Plus size={14} />
              </button>
            </div>
          )}
        </div>
        {/* Un solo nodo para las 365 rayitas — ver `columnRules`. */}
        <div style={{ gridColumn: '2 / -1', ...columnRules(COL_W) }} />
      </div>

      {/* Position rows */}
      {stationPositions.map(pos => {
        const posAssignments = assignmentsByPosition.get(pos.id) || EMPTY_ASG;
        const meta = POSITION_TONE[pos.type] || POSITION_TONE.fijo;
        const Icon = meta.icon;

        return (
          <div key={pos.id} className="grid" style={{ gridTemplateColumns: gridCols, borderTop: '1px solid var(--hairline)' }}>
            {/* Nombre del puesto */}
            <div
              id={`hr-${pos.id}`}
              className="sticky left-0 z-20 flex items-center gap-2 px-4 py-2"
              style={{ background: 'var(--glass-solid)', borderRight: '1px solid var(--hairline)' }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => h.handleDrop(e, station.id, pos.id)}
            >
              <div className="flex h-6 w-6 items-center justify-center rounded" style={tonePill(meta.tone, 14)}>
                <Icon size={12} />
              </div>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => h.editPosition(station, pos)}
                  className="cg-focus block max-w-full truncate text-left text-xs font-semibold hover:underline"
                  title="Editar el puesto (nombre, horas, plazas) sin rehacer la estación"
                >
                  {pos.name}
                </button>
                <div className="text-[10px] tabular-nums" style={{ color: 'var(--ink-soft)' }}>
                  {(() => {
                    // Real hours come from the POSITION (custom blocks carry
                    // their own window; start==end wraps the full day).
                    // A 24h STATION is covered by two fijos doing 12h each,
                    // swapping day/night — label the fijo, not the station.
                    if (station.scheduleType === '24h' && !horasDecidenMitad) return 'Turnos de 12h · D/N rotativo';
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
                    const name = a.guard ? nombreDeVigilante(a.guard).split(' ')[0] : '?';
                    const color = guardColorMap[a.guardId] || 'var(--ink-faint)';
                    return (
                      <button
                        key={a.id}
                        draggable
                        onDragStart={e => h.onGuardDragStart(e, a.guardId, a)}
                        onClick={() => h.removeAssignment(a.id)}
                        /* Ficha arrastrable: el color de identidad
                           va en el filo, no en la tinta — a ese
                           tamaño el texto necesita `--ink`. */
                        className="cg-focus cursor-grab rounded px-1.5 py-0.5 text-[9px] font-semibold active:cursor-grabbing"
                        style={{
                          background: `color-mix(in oklab, ${color} 16%, transparent)`,
                          borderLeft: `2px solid ${color}`,
                          color: 'var(--ink)',
                        }}
                        title={`${nombreDeVigilante(a.guard, 'Vigilante')} — Arrastra para mover · Clic para remover`}
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
                    onClick={() => h.openAssignForm(station.id, pos.id)}
                    className="cg-focus rounded-md p-1 transition-colors"
                    style={tonePill('brand', 14)}
                    title={t('comun.asignarVigilante')}
                  >
                    <Plus size={12} />
                  </button>
                  <button
                    onClick={() => h.deletePosition(station.id, pos.id)}
                    className="cg-focus rounded-md p-1 transition-colors hover:bg-[color-mix(in_oklab,var(--bad)_12%,transparent)]"
                    style={{ color: 'var(--ink-faint)' }}
                    title={t("ui.Schedule.eliminarPosicion", "Eliminar posición")}
                  >
                    <X size={11} />
                  </button>
                </div>
              )}
            </div>

            {/* Day cells */}
            <div />
            {monthDays.slice(colA, colB).map((day, k) => renderFijoCell(pos, posAssignments, day, colA + k))}
            <div />
          </div>
        );
      })}

      {/* No positions configured */}
      {!hasPositions && (
        <div className="grid" style={{ gridTemplateColumns: gridCols, borderTop: '1px solid var(--hairline)' }}>
          <div className="col-span-full px-4 py-4 text-center">
            <p className="mb-2 text-xs" style={{ color: 'var(--ink-soft)' }}>{t('ui.Schedule.estePuestoNoTienePosiciones')}</p>
            <Button size="sm" variant="outline" className="text-xs" onClick={() => h.configureStation(station)}>
              Configurar posiciones
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
