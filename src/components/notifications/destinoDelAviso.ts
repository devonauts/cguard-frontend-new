/**
 * ════════════════════════════════════════════════════════════════════════════
 * A DÓNDE LLEVA CADA AVISO
 *
 * Vivía dentro de `notificationToast.tsx`, entre iconos y colores. Separarlo no
 * es orden por el orden: esto es lógica PURA —de un evento sale una ruta— y al
 * estar mezclada con la interfaz arrastraba `SmartImage`, `useFileUrl` y con
 * ellos el cliente de API, así que no se podía probar sin un navegador. Ahora
 * `destinoDelAviso.test.ts` recorre los 101 tipos de evento del catálogo y
 * comprueba que ninguno cae fuera del router.
 *
 * La regla de fondo: TODO aviso resuelve a un destino. Nunca se deja al usuario
 * sin sitio al que ir, y nunca se le manda a una pantalla de sólo lectura
 * cuando lo que el aviso pide es una decisión.
 * ════════════════════════════════════════════════════════════════════════════
 */
import type { PlatformNotification } from "@/hooks/useNotificationStream";

function localDay(dateStr: string): string {
  const d = new Date(dateStr);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");

  return `${d.getFullYear()}-${mo}-${da}`;
}

/**
 * Where clicking a notification should take you. Every event resolves to a
 * destination so the alert (and the panel) is always actionable; the Actividad
 * feed is the catch-all, focused on the event.
 */
export function targetForNotification(n: PlatformNotification): string {
  const type = (n.eventType || "").toLowerCase();
  const id = n.sourceEntityId;
  const p: any = n.payload || {};

  // ── SOS / panic / alarm-case → the alarm case (acknowledge / action plan /
  // dispatch / resolve). Falls back to the linked incident, then the queue.
  /**
   * ── UNA EMERGENCIA LLEVA AL CENTRO DE EMERGENCIAS. PUNTO. ────────────────
   * Aquí había un respaldo a `/reports/incident/:id` — la ficha de INFORME,
   * que es de sólo lectura. Quien pulsaba el aviso de un pánico podía acabar
   * en una pantalla donde se lee lo que pasó y no se puede reconocer, ni
   * despachar, ni cerrar. En mitad de una emergencia, eso es un callejón sin
   * salida disfrazado de destino.
   *
   * El informe se elimina del camino. Si el aviso trae el caso, se abre el
   * caso; si no lo trae —un aviso viejo, o uno cuyo caso no se llegó a crear—
   * se abre el Centro de Emergencias, donde el caso está y donde SÍ se puede
   * actuar. Nunca un informe.
   */
  if (
    type === "panic.alert" ||
    type.startsWith("alarm") ||
    type.startsWith("sos")
  ) {
    return p.caseId ? `/alarm/case/${p.caseId}` : "/alarm/queue";
  }

  // ── Un módulo cuya prueba termina: a la tienda, donde se elige seguir o no.
  if (type === "addon.trial_ending") return "/modulos-adicionales";

  // ── VigIA Pro: el caso, con su conversación.
  if (type === "vigia.caso_escalado") {
    return p.casoId ? `/vigia-pro?caso=${p.casoId}` : "/vigia-pro";
  }
  // ── VigIA Pro: el tope de mensajes del día se cambia en su pantalla.
  if (type === "vigia.tope_diario") return "/vigia-pro";

  // ── Gusto (fase 4): la conexión, a Ajustes; el resto, a Nómina › Gusto.
  if (type === "gusto.disconnected") return "/setting/integraciones";
  if (type === "gusto.employee_terminated") return "/setting/integraciones/gusto";
  if (type.startsWith("gusto.")) return "/nomina/gusto";

  // ── Things that need a supervisor DECISION → the right approvals queue, focused.
  if (
    type === "attendance.clockin_requested" ||
    type === "attendance.clockout_requested" ||
    type === "attendance.approval_required" ||
    type === "attendance.correction_submitted"
  ) {
    return id ? `/nomina/approvals?focus=${id}` : "/nomina/approvals";
  }
  if (type === "task.pending_approval") {
    return id ? `/tasks/approvals?focus=${id}` : "/tasks/approvals";
  }

  // ── Rutas de supervisión (ejecución guiada) → la ejecución en el CRM, que
  // es el puesto de mando si sigue abierta y la reconstrucción si ya cerró.
  // Si el aviso no trae la ejecución, el tablero de patrulla.
  if (
    type.startsWith("supervisor.route") ||
    type.startsWith("supervisor.stop") ||
    type.startsWith("supervisor.finding")
  ) {
    const runId =
      p.runId ||
      p.routeRunId ||
      (String((n as any).sourceEntityType || "").toLowerCase() === "routerun"
        ? id
        : null);

    return runId ? `/vehicle-patrol/runs/${runId}` : "/vehicle-patrol";
  }

  // ── Incidents → the incident report detail.
  if (type.startsWith("incident"))
    return id ? `/reports/incident/${id}` : "/activities";

  // ── Clock-in/out + every attendance event (late, no-show, geofence, etc.) → the
  // Nómina attendance records, focused on that day's row.
  //
  // ── LA SALIDA FORZADA IBA A LA LISTA DE VIGILANTES ────────────────────────
  // `guard.forced_clockout` caía en el cajón de sastre `guard*` y llevaba a
  // /security-guards: la plantilla entera, que no dice absolutamente nada de la
  // salida que se acaba de forzar. El sitio al que hay que ir es el registro de
  // asistencia de ESE turno — donde se corrige la hora de salida y se anota lo
  // que pasó — y el identificador del turno ya viajaba en el aviso.
  if (
    type === "guard.checkin" ||
    type === "guard.checkout" ||
    type === "guard.forced_clockout" ||
    type === "guard.late" ||
    // El relevo que no marca, el saliente que no estaba, el puesto vacío: todo
    // se corrige en el registro de asistencia de ese turno.
    type.startsWith("relevo.") ||
    type.startsWith("attendance")
  ) {
    // El día del TURNO, no el del aviso: un turno nocturno que empieza el 26 a
    // las 19:00 se cierra a la fuerza el 27 a las 07:00, y su fila vive en el
    // 26. Abrir el 27 dejaría la lista sin la fila que se venía a ver. El
    // servidor lo manda ya resuelto en la zona de la empresa; si no viene (un
    // aviso anterior a esto), se cae al día del aviso, que es lo de siempre.
    const dia =
      typeof p.shiftDay === "string" && p.shiftDay
        ? p.shiftDay
        : localDay(n.createdAt);
    const params = new URLSearchParams({ date: dia });
    /**
     * ── `sourceEntityId` NO SIEMPRE ES UN REGISTRO DE ASISTENCIA ────────────
     * Cada aviso trae el id de LO SUYO: «Sin marcar salida» trae el de la
     * excepción, no el del turno. Usarlo como `focus` hacía que la pantalla
     * pidiera `/attendance/<id de excepción>` y saliera un «Extraviado» a
     * pantalla completa — un 404 para decir «este aviso no apuntaba a una
     * ficha», que no es un error de nadie. Visto el 2026-08-27.
     *
     * El turno se coge de donde de verdad está: `payload.guardShiftId`. Sólo se
     * usa `sourceEntityId` cuando el propio evento dice que ES un turno.
     */
    const esTurno =
      String(n.sourceEntityType || "").toLowerCase() === "guardshift";
    const filaDelTurno = p.guardShiftId || (esTurno ? id : null);

    if (filaDelTurno) params.set("focus", String(filaDelTurno));

    return `/nomina/records?${params.toString()}`;
  }

  // ── Sin señal → la ficha de la persona, donde está su conexión, sus cortes
  // y lo que no entró. Vigilante: su pestaña Dispositivo; supervisor: su ficha.
  if (type === "app.sin_conexion" || type === "app.conexion_recuperada") {
    const gid = p.securityGuardId || p.guardId;

    if (gid) return `/guards/${gid}/dispositivo`;
    if (p.canal === "supervisor" && p.userId) return `/supervisors/${p.userId}`;

    return "/dashboard";
  }

  // ── Messages → the conversation.
  if (type.startsWith("message")) {
    return p.conversationId
      ? `/messenger?conversation=${p.conversationId}`
      : "/messenger";
  }

  // ── Guard-centric (ratings, device mismatch, profile) → the guard's profile.
  // These carry the guard id in the payload (sourceEntityId is the rating/device id).
  if (
    type === "guard.rated" ||
    type.startsWith("device") ||
    type === "profile.updated"
  ) {
    const gid = p.guardId || p.securityGuardId;

    return gid ? `/guards/${gid}/perfil` : "/security-guards";
  }
  if (type.startsWith("guard")) return "/security-guards";

  // ── Visitors.
  if (type.startsWith("visitor")) return "/visitors";

  // ── Patrols / rounds. VEHICLE patrols are namespaced `patrol.vehicle_*`; every
  // other patrol.* event (started/completed/missed) is a guard FOOT round (ronda /
  // site tour) — y ésa vive DENTRO DE SU ESTACIÓN, no en un tablero aparte.
  //
  // ── POR QUÉ ESTO NO LLEVABA A NINGÚN SITIO ────────────────────────────────
  // Antes, cualquier aviso de ronda soltaba al usuario en el informe general de
  // recorridos: 30 días de escaneos de TODA la empresa, sin filtrar, para
  // buscar a mano la vuelta de la que le acababan de avisar. No era una
  // decisión de diseño — era el único destino posible, porque el evento no
  // llevaba dentro QUÉ ronda era.
  //
  // Ahora el evento trae la vuelta y su estación (ver `rondaNotify`), así que
  // el aviso lleva al Historial de rondas de esa estación con esa vuelta
  // abierta: la foto, el mapa y los botones de aceptar o rechazar, en un clic.
  // El informe sigue existiendo para lo que sólo él puede hacer —cruzar
  // puestos y fechas, y exportar— y es el respaldo de los avisos viejos, que no
  // llevan estos campos.
  if (type.startsWith("patrol")) {
    if (type.startsWith("patrol.vehicle")) return "/vehicle-patrol";
    const puesto = p.postSiteId;
    const estacion = p.stationId;

    if (puesto && estacion) {
      const qs = p.assignmentId
        ? `?ronda=${encodeURIComponent(p.assignmentId)}`
        : "";

      return `/post-sites/${puesto}/stations/${estacion}/tag-scans${qs}`;
    }

    return "/reports/site-tour";
  }

  // ── Shifts / scheduling. Exchange requests → the exchange board; unassigned/open
  // shifts → the open-shifts board; anything else → the schedule.
  if (type.startsWith("shift.exchange")) return "/shift-exchange";
  if (type === "shift.unassigned") return "/open-shifts";
  if (type.startsWith("shift")) return "/schedule";

  // ── Time-off (requests + decisions) → the time-off board.
  if (type.startsWith("timeoff")) return "/time-off";

  // ── Memos → the memos board.
  if (type.startsWith("memo")) return "/memos";

  // ── Dispatch tickets → the ticket detail.
  if (type.startsWith("dispatch"))
    return id ? `/dispatch-tickets/${id}` : "/dispatch-tickets";

  // ── Soporte: la respuesta a un ticket de la empresa → «Mis tickets», con ese
  // ticket abierto (el id del ticket viaja como sourceEntityId).
  if (type.startsWith("support.")) {
    const ticket = p.ticketId || id;

    return ticket
      ? `/mis-tickets?ticket=${encodeURIComponent(String(ticket))}`
      : "/mis-tickets";
  }

  // ── Tasks (non-approval) → the tracking list, focused.
  if (type.startsWith("task")) return id ? `/tasks?focus=${id}` : "/tasks";

  // ── Fallback → the Actividad feed, focused on this event.
  const params = new URLSearchParams();

  if (id) params.set("focus", id);
  const qs = params.toString();

  return qs ? `/activities?${qs}` : "/activities";
}
