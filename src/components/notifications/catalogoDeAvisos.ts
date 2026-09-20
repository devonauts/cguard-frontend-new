/**
 * ════════════════════════════════════════════════════════════════════════════
 * LOS 101 TIPOS DE AVISO, Y A QUÉ FAMILIA PERTENECE CADA UNO
 *
 * Espejo de `backend/src/lib/notify/catalog.ts`, que es donde el servidor decide
 * la familia y la prioridad de cada evento. Aquí se usa para DOS cosas:
 *
 *   1. Agrupar la bandeja de la campana. Sin esto, 101 tipos distintos caían en
 *      una lista plana ordenada sólo por hora, y encontrar el pánico entre
 *      catorce fichajes era cuestión de suerte.
 *   2. La prueba `destinoDelAviso.test.ts`, que comprueba que los 101 llevan a
 *      una pantalla que existe de verdad en el router.
 *
 * Los marcados `catalogado: false` son los que el backend EMITE pero no tiene
 * en su tabla: caen en `FALLBACK_DEF` (genérico, prioridad normal) y en Android
 * en el canal de reserva. Están aquí para que se vean y para que la bandeja los
 * clasifique igual; el arreglo de verdad es darles su entrada en el servidor.
 *
 * Si se toca el catálogo del backend, se toca ESTO.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Las catorce familias del catálogo, más el cajón de los que no tienen. */
export type FamiliaDeAviso =
  | "sos"
  | "dispatch"
  | "incident"
  | "coverage"
  | "attendance"
  | "shift"
  | "patrol"
  | "checkpoint"
  | "task"
  | "radio_report"
  | "memo"
  | "announcement"
  | "message"
  | "visitor"
  | "generic";

export type PrioridadDeAviso =
  | "emergency"
  | "urgent"
  | "important"
  | "normal"
  | "low";

export interface EventoDeAviso {
  evento: string;
  familia: FamiliaDeAviso;
  prioridad: PrioridadDeAviso;
  /** ¿Tiene entrada propia en el catálogo del servidor? */
  catalogado: boolean;
}

export const EVENTOS_DE_AVISO: EventoDeAviso[] = [
  {
    evento: "alarm.case.closed",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "alarm.case.escalated",
    familia: "sos",
    prioridad: "emergency",
    catalogado: true,
  },
  {
    evento: "alarm.case.new",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "alarm.case.updated",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "alarm.case_create_failed",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "alarm.escalated",
    familia: "sos",
    prioridad: "emergency",
    catalogado: true,
  },
  {
    evento: "announcement.published",
    familia: "announcement",
    prioridad: "normal",
    catalogado: true,
  },
  {
    evento: "attendance.approval_required",
    familia: "attendance",
    prioridad: "important",
    catalogado: true,
  },
  {
    evento: "attendance.clockin_approved",
    familia: "attendance",
    prioridad: "normal",
    catalogado: true,
  },
  {
    evento: "attendance.clockin_rejected",
    familia: "attendance",
    prioridad: "normal",
    catalogado: true,
  },
  {
    evento: "attendance.clockin_requested",
    familia: "attendance",
    prioridad: "important",
    catalogado: true,
  },
  {
    evento: "attendance.clockout_approved",
    familia: "attendance",
    prioridad: "normal",
    catalogado: true,
  },
  {
    evento: "attendance.clockout_rejected",
    familia: "attendance",
    prioridad: "normal",
    catalogado: true,
  },
  {
    evento: "attendance.clockout_requested",
    familia: "attendance",
    prioridad: "important",
    catalogado: true,
  },
  {
    evento: "attendance.correction_submitted",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "attendance.geofence_exit",
    familia: "attendance",
    prioridad: "urgent",
    catalogado: true,
  },
  {
    evento: "attendance.geofence_return",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "attendance.late",
    familia: "attendance",
    prioridad: "important",
    catalogado: true,
  },
  {
    evento: "attendance.late_self",
    familia: "attendance",
    prioridad: "important",
    catalogado: true,
  },
  {
    evento: "attendance.missed_clockout",
    familia: "attendance",
    prioridad: "important",
    catalogado: true,
  },
  {
    evento: "attendance.no_show",
    familia: "attendance",
    prioridad: "urgent",
    catalogado: true,
  },
  {
    evento: "attendance.no_show_self",
    familia: "attendance",
    prioridad: "urgent",
    catalogado: true,
  },
  {
    evento: "attendance.outside_geofence",
    familia: "attendance",
    prioridad: "important",
    catalogado: true,
  },
  {
    evento: "checkpoint.overdue",
    familia: "checkpoint",
    prioridad: "important",
    catalogado: true,
  },
  {
    evento: "consigna.completed",
    familia: "patrol",
    prioridad: "low",
    catalogado: true,
  },
  {
    evento: "consigna.due",
    familia: "patrol",
    prioridad: "normal",
    catalogado: true,
  },
  {
    evento: "coverage",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "coverage.assigned",
    familia: "coverage",
    prioridad: "important",
    catalogado: true,
  },
  {
    evento: "coverage.post_uncovered",
    familia: "coverage",
    prioridad: "urgent",
    catalogado: true,
  },
  {
    evento: "coverage.transferred",
    familia: "coverage",
    prioridad: "important",
    catalogado: true,
  },
  {
    evento: "digest.summary",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "dispatch.created",
    familia: "dispatch",
    prioridad: "urgent",
    catalogado: true,
  },
  {
    evento: "document.expiring",
    familia: "announcement",
    prioridad: "normal",
    catalogado: true,
  },
  {
    evento: "document_packet_shared",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "guard.checkin",
    familia: "attendance",
    prioridad: "low",
    catalogado: true,
  },
  {
    evento: "guard.checkout",
    familia: "attendance",
    prioridad: "low",
    catalogado: true,
  },
  {
    evento: "guard.forced_clockout",
    familia: "shift",
    prioridad: "important",
    catalogado: true,
  },
  {
    evento: "guard.inactive",
    familia: "attendance",
    prioridad: "urgent",
    catalogado: true,
  },
  {
    evento: "guard.license_expiring",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "guard.rated",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "guard.shiftchange",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "incident.created",
    familia: "incident",
    prioridad: "important",
    catalogado: true,
  },
  {
    evento: "incident.dispatched",
    familia: "dispatch",
    prioridad: "urgent",
    catalogado: true,
  },
  {
    evento: "incident.unattended",
    familia: "incident",
    prioridad: "urgent",
    catalogado: true,
  },
  {
    evento: "incident.updated",
    familia: "incident",
    prioridad: "normal",
    catalogado: true,
  },
  {
    evento: "memo.accepted",
    familia: "memo",
    prioridad: "low",
    catalogado: true,
  },
  {
    evento: "memo.created",
    familia: "memo",
    prioridad: "important",
    catalogado: true,
  },
  {
    evento: "message.new",
    familia: "message",
    prioridad: "normal",
    catalogado: true,
  },
  {
    evento: "notify.test",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "panic.alert",
    familia: "sos",
    prioridad: "emergency",
    catalogado: true,
  },
  {
    evento: "panic.resolved",
    familia: "sos",
    prioridad: "important",
    catalogado: true,
  },
  {
    evento: "passdown.created",
    familia: "announcement",
    prioridad: "important",
    catalogado: true,
  },
  {
    evento: "patrol.completed",
    familia: "patrol",
    prioridad: "low",
    catalogado: true,
  },
  {
    evento: "patrol.missed",
    familia: "checkpoint",
    prioridad: "important",
    catalogado: true,
  },
  {
    evento: "patrol.started",
    familia: "patrol",
    prioridad: "low",
    catalogado: true,
  },
  {
    evento: "patrol.vehicle_started",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "patrol_missed",
    familia: "checkpoint",
    prioridad: "important",
    catalogado: true,
  },
  {
    evento: "radio.check_request",
    familia: "radio_report",
    prioridad: "urgent",
    catalogado: true,
  },
  {
    evento: "radio.no_response",
    familia: "radio_report",
    prioridad: "important",
    catalogado: true,
  },
  {
    evento: "radio.reply",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "radio.session_completed",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "radio.session_started",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "radio.station_notified",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "radio.transmission",
    familia: "radio_report",
    prioridad: "normal",
    catalogado: true,
  },
  {
    evento: "radio.voice",
    familia: "radio_report",
    prioridad: "important",
    catalogado: true,
  },
  {
    evento: "radio.voice_message",
    familia: "radio_report",
    prioridad: "important",
    catalogado: true,
  },
  {
    evento: "request.created",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "ronda.late",
    familia: "checkpoint",
    prioridad: "important",
    catalogado: true,
  },
  {
    evento: "ronda.reminder",
    familia: "patrol",
    prioridad: "normal",
    catalogado: true,
  },
  {
    evento: "schedule.published",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "shift.reminder",
    familia: "shift",
    prioridad: "important",
    catalogado: true,
  },
  {
    evento: "shift.unassigned",
    familia: "shift",
    prioridad: "normal",
    catalogado: true,
  },
  { evento: "sos", familia: "sos", prioridad: "emergency", catalogado: true },
  {
    evento: "staff.forced_checkout",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "supervisor.eta",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "supervisor.forced_checkout",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "supervisor.incident.assigned",
    familia: "dispatch",
    prioridad: "urgent",
    catalogado: true,
  },
  {
    evento: "supervisor.incident.dispatchResponse",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "supervisor.incident.escalated",
    familia: "incident",
    prioridad: "urgent",
    catalogado: true,
  },
  {
    evento: "supervisor.incident.note",
    familia: "incident",
    prioridad: "normal",
    catalogado: true,
  },
  {
    evento: "supervisor.incident.status",
    familia: "incident",
    prioridad: "normal",
    catalogado: true,
  },
  {
    evento: "supervisor.route.eta",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "supervisor.route.updated",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "supervisor.visit.completed",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "support.ticket.created",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "support.ticket.reply",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "task.approved",
    familia: "task",
    prioridad: "normal",
    catalogado: true,
  },
  {
    evento: "task.assigned",
    familia: "task",
    prioridad: "normal",
    catalogado: true,
  },
  {
    evento: "task.completed",
    familia: "task",
    prioridad: "low",
    catalogado: true,
  },
  {
    evento: "task.overdue",
    familia: "task",
    prioridad: "important",
    catalogado: true,
  },
  {
    evento: "task.pending_approval",
    familia: "task",
    prioridad: "normal",
    catalogado: true,
  },
  {
    evento: "task.rejected",
    familia: "task",
    prioridad: "normal",
    catalogado: true,
  },
  {
    evento: "timeoff.requested",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "vehicle.overstay",
    familia: "visitor",
    prioridad: "important",
    catalogado: true,
  },
  {
    evento: "video.dispatch",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "vigia.nightly",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "vigia.weekly",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "visitor.arrival",
    familia: "visitor",
    prioridad: "normal",
    catalogado: true,
  },
  {
    evento: "visitor.departure",
    familia: "visitor",
    prioridad: "low",
    catalogado: true,
  },
  {
    evento: "visitor.exited",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
  {
    evento: "visitor.registered",
    familia: "generic",
    prioridad: "normal",
    catalogado: false,
  },
];

/**
 * La familia de un evento; `generic` sólo si de verdad no se sabe.
 *
 * Ojo al orden: la entrada exacta manda, PERO sólo si dice algo. Los 35 eventos
 * que el servidor emite sin catalogar figuran aquí como `generic`, y respetar
 * ese `generic` mandaba `alarm.case.new` —una emergencia— al cajón de «Otros»,
 * junto al resumen nocturno de VigIA. Cuando la entrada no clasifica, se cae a
 * las reglas por prefijo, que sí saben qué es un `alarm.*`.
 */
export function familiaDe(eventType: string): FamiliaDeAviso {
  const e = String(eventType || "").toLowerCase();
  const exacto = EVENTOS_DE_AVISO.find((x) => x.evento === e);

  if (exacto && exacto.familia !== "generic") return exacto.familia;

  /* Un evento que el servidor estrene mañana no puede caer en «otros» sin más:
     se deduce por su prefijo, que es como se nombran todos.

     Los `supervisor.*` van los PRIMEROS porque su segundo tramo es el que dice
     qué son: `supervisor.incident.*` es un incidente y `supervisor.route.*` un
     recorrido, y cualquier regla más general se los llevaría antes. */
  if (e.startsWith("supervisor.incident")) return "incident";
  if (
    e.startsWith("supervisor.route") ||
    e.startsWith("supervisor.stop") ||
    e.startsWith("supervisor.visit") ||
    e.startsWith("supervisor.finding") ||
    e === "supervisor.eta"
  )
    return "patrol";
  if (e.endsWith("forced_checkout") || e.endsWith("forced_clockout"))
    return "attendance";

  if (e.startsWith("panic") || e.startsWith("sos") || e.startsWith("alarm"))
    return "sos";
  if (e.startsWith("dispatch")) return "dispatch";
  if (e.startsWith("incident")) return "incident";
  if (e.startsWith("coverage")) return "coverage";
  if (e.startsWith("attendance") || e.startsWith("guard.check"))
    return "attendance";
  if (
    e.startsWith("shift") ||
    e.startsWith("schedule") ||
    e.startsWith("timeoff") ||
    e === "guard.shiftchange"
  )
    return "shift";
  if (
    e.startsWith("ronda") ||
    e.startsWith("patrol") ||
    e.startsWith("consigna")
  )
    return "patrol";
  if (e.startsWith("checkpoint")) return "checkpoint";
  if (e.startsWith("task")) return "task";
  if (e.startsWith("radio")) return "radio_report";
  if (e.startsWith("memo")) return "memo";
  /* Los resúmenes (VigIA, el digest) y los vencimientos son comunicados: se
     leen cuando hay tiempo, no interrumpen. Estaban en «Otros», junto al
     `notify.test`, que es donde va lo que de verdad no se sabe qué es. */
  if (
    e.startsWith("announcement") ||
    e.startsWith("passdown") ||
    e.startsWith("document") ||
    e.startsWith("vigia.") ||
    e.startsWith("digest.") ||
    e.endsWith("_expiring") ||
    e.endsWith(".expiring")
  )
    return "announcement";
  if (e.startsWith("message")) return "message";
  if (e.startsWith("visitor") || e.startsWith("vehicle")) return "visitor";

  return "generic";
}

/* ══════════════════════════════════════════════════════════════════════════
 * LOS GRUPOS DE LA BANDEJA
 *
 * Catorce familias son catorce pestañas, y una bandeja con catorce pestañas no
 * la usa nadie. Se agrupan como piensa quien está de guardia a las tres de la
 * mañana: primero lo que exige salir corriendo, luego lo que pasa en el puesto,
 * luego la gente, y al final lo que se lee cuando hay tiempo.
 *
 * El orden de este array ES el orden de la bandeja: un pánico sale arriba
 * aunque haya llegado hace una hora y el último fichaje hace un minuto. Ordenar
 * sólo por hora era lo que hacía antes, y enterraba la emergencia bajo catorce
 * entradas y salidas.
 * ══════════════════════════════════════════════════════════════════════════ */

export type GrupoDeBandeja =
  | "emergencia"
  | "operacion"
  | "personal"
  | "tareas"
  | "comunicacion"
  | "otros";

export interface DefinicionDeGrupo {
  id: GrupoDeBandeja;
  /** Texto por defecto; la interfaz lo pasa por `t()`. */
  etiqueta: string;
  claveI18n: string;
  familias: FamiliaDeAviso[];
}

export const GRUPOS_DE_BANDEJA: DefinicionDeGrupo[] = [
  {
    id: "emergencia",
    etiqueta: "Emergencias",
    claveI18n: "ui.avisos.grupo.emergencia",
    // Un incidente DESPACHADO lleva tu nombre encima: es una orden, no una
    // noticia. Por eso viaja con el pánico y no con los incidentes normales.
    familias: ["sos", "dispatch"],
  },
  {
    id: "operacion",
    etiqueta: "Operación",
    claveI18n: "ui.avisos.grupo.operacion",
    familias: ["incident", "patrol", "checkpoint", "visitor"],
  },
  {
    id: "personal",
    etiqueta: "Personal",
    claveI18n: "ui.avisos.grupo.personal",
    familias: ["attendance", "shift", "coverage"],
  },
  {
    id: "tareas",
    etiqueta: "Tareas y avisos",
    claveI18n: "ui.avisos.grupo.tareas",
    familias: ["task", "memo", "announcement"],
  },
  {
    id: "comunicacion",
    etiqueta: "Comunicación",
    claveI18n: "ui.avisos.grupo.comunicacion",
    familias: ["message", "radio_report"],
  },
  {
    id: "otros",
    etiqueta: "Otros",
    claveI18n: "ui.avisos.grupo.otros",
    familias: ["generic"],
  },
];

const GRUPO_POR_FAMILIA = new Map<FamiliaDeAviso, GrupoDeBandeja>(
  GRUPOS_DE_BANDEJA.flatMap((g) => g.familias.map((f) => [f, g.id] as const)),
);

/** El grupo de bandeja al que pertenece un evento. */
export function grupoDe(eventType: string): GrupoDeBandeja {
  return GRUPO_POR_FAMILIA.get(familiaDe(eventType)) || "otros";
}

/** Peso de una prioridad, para ordenar dentro de un grupo. */
export const PESO_DE_PRIORIDAD: Record<PrioridadDeAviso, number> = {
  emergency: 4,
  urgent: 3,
  important: 2,
  normal: 1,
  low: 0,
};

/** La prioridad declarada de un evento; `normal` si no se conoce. */
export function prioridadDe(eventType: string): PrioridadDeAviso {
  const e = String(eventType || "").toLowerCase();

  return EVENTOS_DE_AVISO.find((x) => x.evento === e)?.prioridad || "normal";
}
