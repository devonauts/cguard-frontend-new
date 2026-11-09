export interface RotationStyle {
  id: string;
  name: string;
  description?: string;
  dayShifts: number;
  nightShifts: number;
  restDays: number;
  /** Secuencia libre (una letra por día: D/N/L); nula en los patrones de tres números. */
  sequence?: string | null;
  /** Weekly style: `sequence` is 7 letters anchored to the calendar (0 = Monday). */
  weekly?: boolean;
  isSystem: boolean;
}
export interface StationPosition {
  id: string;
  name: string;
  type: "fijo" | "sacafranco";
  startTime: string;
  endTime: string;
  guardsNeeded: number;
  sortOrder: number;
  stationId: string;
  /** Ciclo PROPIO de la plaza. Vacío = hereda el de la estación. */
  rotationStyleId?: string | null;
}
export interface GuardRef {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
}
export interface GuardAssignment {
  id: string;
  guardId: string;
  stationId: string;
  positionId: string;
  rotationStyleId: string;
  startDate: string;
  endDate?: string;
  platoonOffset: number;
  isRelief: boolean;
  /** Sacafranco: estaciones cuyos descansos cubre. Vacío/ausente = todas las de fijos. */ coveredStationIds?:
    | string[]
    | null;
  /** Sacafranco: la CADENCIA de su ronda, `{estación: días}`. El orden lo pone
   *  `coveredStationIds`. Sin esto no hay ronda: la lista sola es permiso de
   *  fichaje, no rotación. */
  coveredStationDays?: Record<string, number> | null;
  status: string;
  /** 'holder' | 'shadow' — un aprendiz acompaña y NO cuenta como cobertura. */ role?: string;
  shadowOfAssignmentId?: string | null;
  guard?: GuardRef;
  position?: StationPosition;
  rotationStyle?: RotationStyle;
}
export interface ShiftRecord {
  id: string;
  guardId: string;
  stationId: string;
  positionId?: string;
  startTime: string;
  endTime: string;
  /**
   * planned | covered | reinforcement | extension | absent | transferred_out |
   * cancelled. El tablero lo usa para distinguir una cobertura normal de una
   * EXTENSIÓN (alguien doblando porque su relevo no llegó), que se pinta en
   * ámbar y no en verde.
   */
  status?: string;
  /** Hay un fichaje de este turno (lo pone `/scheduler/overview`). */
  clockedIn?: boolean;
  /** Cómo fue ese fichaje: 'ok' a tiempo, 'incidencia' tarde / sin salida… */
  asistencia?: "ok" | "incidencia";
  /** Con incidencia: por qué (códigos de attendanceException.type). */
  motivos?: string[];
  guard?: Pick<GuardRef, "id" | "firstName" | "lastName">;
}
export interface ScheduleOverride {
  id: string;
  guardId: string;
  assignmentId?: string;
  date: string;
  type: string;
  note?: string;
}
export interface GuardOption {
  id: string;
  label: string;
}

/** Aviso por puesto: plazas fijas sin cubrir y días de descanso sin sacafranco. */
export interface StationAlert {
  stationId: string;
  stationName: string;
  nickname?: string | null;
  missingFijoCount: number;
  /** Días del mes en que al puesto le faltó gente en algún tramo. */
  uncoveredDays: number;
  /** @deprecated Nombre viejo: nunca midió al sacafranco, mide el hueco. */
  sfUncoveredDays?: number;
}
