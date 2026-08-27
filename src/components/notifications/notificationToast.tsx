import { toast } from 'sonner';
import { LogIn, LogOut, AlertTriangle, Route, CalendarClock, UserCheck, Siren, Bell, X, MessageSquare, ClipboardList } from 'lucide-react';
import { useFileUrl } from '@/lib/fileUrl';
import { SmartImage } from '@/components/kit';
import type { PlatformNotification } from '@/hooks/useNotificationStream';

/**
 * Tono del aviso. Eran diez hexadecimales sueltos (verde, ámbar, morado, rosa…):
 * diez colores que ignoraban el acento elegido y chocaban con la mitad de los
 * tonos posibles. Ahora cada familia de evento cae en uno de los seis tonos del
 * sistema. Se repiten a propósito —hay más familias que tonos— porque el tono
 * dice QUÉ CLASE de aviso es (bueno / atención / grave / neutro), no cuál de las
 * diez familias: para eso ya está el icono.
 *
 * `fill` es el color del lavado de fondo; `ink` la tinta del icono encima, que
 * es una variable distinta porque el color de relleno usado como tinta no
 * contrasta (ver la medición en la cabecera de tokens.css).
 */
type ToastTone = 'brand' | 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

const TONE_INK: Record<ToastTone, { fill: string; ink: string }> = {
  brand:   { fill: 'var(--brand)',     ink: 'var(--brand-text)' },
  ok:      { fill: 'var(--ok)',        ink: 'var(--ok-text)' },
  warn:    { fill: 'var(--warn)',      ink: 'var(--warn-text)' },
  bad:     { fill: 'var(--bad)',       ink: 'var(--bad-text)' },
  info:    { fill: 'var(--info)',      ink: 'var(--info-text)' },
  neutral: { fill: 'var(--ink-faint)', ink: 'var(--ink-soft)' },
};

function iconFor(eventType: string): { Icon: typeof Bell; tone: ToastTone } {
  const t = (eventType || '').toLowerCase();
  if (t === 'guard.checkin') return { Icon: LogIn, tone: 'ok' };
  if (t === 'guard.checkout') return { Icon: LogOut, tone: 'neutral' };
  if (t === 'attendance.clockout_requested') return { Icon: LogOut, tone: 'warn' };
  // Incidentes y despachos son SIEMPRE rojos, pase lo que pase con el acento:
  // `--bad` es fijo en tokens.css justamente por esto.
  if (t.startsWith('incident')) return { Icon: AlertTriangle, tone: 'bad' };
  if (t.startsWith('dispatch')) return { Icon: Siren, tone: 'bad' };
  if (t.startsWith('patrol')) return { Icon: Route, tone: 'info' };
  if (t.startsWith('shift') || t.startsWith('timeoff')) return { Icon: CalendarClock, tone: 'brand' };
  if (t.startsWith('visitor')) return { Icon: UserCheck, tone: 'info' };
  if (t.startsWith('message')) return { Icon: MessageSquare, tone: 'brand' };
  if (t.startsWith('task')) return { Icon: ClipboardList, tone: 'warn' };
  return { Icon: Bell, tone: 'info' };
}

function localDay(dateStr: string): string {
  const d = new Date(dateStr);
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mo}-${da}`;
}

/**
 * Where clicking a notification should take you. Every event resolves to a
 * destination so the alert (and the panel) is always actionable; the Actividad
 * feed is the catch-all, focused on the event.
 */
export function targetForNotification(n: PlatformNotification): string {
  const type = (n.eventType || '').toLowerCase();
  const id = n.sourceEntityId;
  const p: any = n.payload || {};

  // ── SOS / panic / alarm-case → the alarm case (acknowledge / action plan /
  // dispatch / resolve). Falls back to the linked incident, then the queue.
  if (type === 'panic.alert' || type.startsWith('alarm')) {
    if (p.caseId) return `/alarm/case/${p.caseId}`;
    if (id) return `/reports/incident/${id}`;
    return '/alarm/queue';
  }

  // ── Things that need a supervisor DECISION → the right approvals queue, focused.
  if (
    type === 'attendance.clockin_requested' ||
    type === 'attendance.clockout_requested' ||
    type === 'attendance.approval_required' ||
    type === 'attendance.correction_submitted'
  ) {
    return id ? `/nomina/approvals?focus=${id}` : '/nomina/approvals';
  }
  if (type === 'task.pending_approval') {
    return id ? `/tasks/approvals?focus=${id}` : '/tasks/approvals';
  }

  // ── Incidents → the incident report detail.
  if (type.startsWith('incident')) return id ? `/reports/incident/${id}` : '/activities';

  // ── Clock-in/out + every attendance event (late, no-show, geofence, etc.) → the
  // Nómina attendance records, focused on that day's row.
  if (
    type === 'guard.checkin' ||
    type === 'guard.checkout' ||
    type === 'guard.late' ||
    type.startsWith('attendance')
  ) {
    const params = new URLSearchParams({ date: localDay(n.createdAt) });
    if (id) params.set('focus', id);
    return `/nomina/records?${params.toString()}`;
  }

  // ── Messages → the conversation.
  if (type.startsWith('message')) {
    return p.conversationId ? `/messenger?conversation=${p.conversationId}` : '/messenger';
  }

  // ── Guard-centric (ratings, device mismatch, profile) → the guard's profile.
  // These carry the guard id in the payload (sourceEntityId is the rating/device id).
  if (type === 'guard.rated' || type.startsWith('device') || type === 'profile.updated') {
    const gid = p.guardId || p.securityGuardId;
    return gid ? `/guards/${gid}/perfil` : '/security-guards';
  }
  if (type.startsWith('guard')) return '/security-guards';

  // ── Visitors.
  if (type.startsWith('visitor')) return '/visitors';

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
  if (type.startsWith('patrol')) {
    if (type.startsWith('patrol.vehicle')) return '/vehicle-patrol';
    const puesto = p.postSiteId;
    const estacion = p.stationId;
    if (puesto && estacion) {
      const qs = p.assignmentId ? `?ronda=${encodeURIComponent(p.assignmentId)}` : '';
      return `/post-sites/${puesto}/stations/${estacion}/tag-scans${qs}`;
    }
    return '/reports/site-tour';
  }

  // ── Shifts / scheduling. Exchange requests → the exchange board; unassigned/open
  // shifts → the open-shifts board; anything else → the schedule.
  if (type.startsWith('shift.exchange')) return '/shift-exchange';
  if (type === 'shift.unassigned') return '/open-shifts';
  if (type.startsWith('shift')) return '/schedule';

  // ── Time-off (requests + decisions) → the time-off board.
  if (type.startsWith('timeoff')) return '/time-off';

  // ── Memos → the memos board.
  if (type.startsWith('memo')) return '/memos';

  // ── Dispatch tickets → the ticket detail.
  if (type.startsWith('dispatch')) return id ? `/dispatch-tickets/${id}` : '/dispatch-tickets';

  // ── Tasks (non-approval) → the tracking list, focused.
  if (type.startsWith('task')) return id ? `/tasks?focus=${id}` : '/tasks';

  // ── Fallback → the Actividad feed, focused on this event.
  const params = new URLSearchParams();
  if (id) params.set('focus', id);
  const qs = params.toString();
  return qs ? `/activities?${qs}` : '/activities';
}

/**
 * Fire a custom in-CRM alert when a live notification arrives. Shows the full
 * details (icon/photo, title, body) and navigates to the event on click.
 */
export function showNotificationToast(
  n: PlatformNotification,
  navigate?: (to: string) => void,
) {
  const { Icon, tone } = iconFor(n.eventType);
  const { fill, ink } = TONE_INK[tone];
  const target = targetForNotification(n);

  toast.custom(
    (id) => (
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (target && navigate) navigate(target);
          toast.dismiss(id);
        }}
        className="glass-raised glass-hover flex w-[360px] max-w-[88vw] cursor-pointer items-start gap-3 p-3"
      >
        <NotifPhoto n={n} fill={fill} ink={ink} Icon={Icon} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--ink)' }}>{n.title}</p>
          {n.body && (
            <p className="mt-0.5 line-clamp-3 text-xs" style={{ color: 'var(--ink-soft)' }}>{n.body}</p>
          )}
          <p className="cg-eyebrow mt-1.5">Ahora</p>
        </div>
        <button
          aria-label="Cerrar"
          onClick={(e) => {
            e.stopPropagation();
            toast.dismiss(id);
          }}
          className="cg-focus -m-1 grid size-9 shrink-0 place-items-center rounded-full transition-colors"
          style={{ color: 'var(--ink-faint)' }}
        >
          <X size={16} />
        </button>
      </div>
    ),
    { duration: 8000 },
  );
}

/**
 * La foto del aviso (el selfie del fichaje, la del incidente…).
 *
 * Va en un componente propio porque `showNotificationToast` es una función
 * imperativa y `useFileUrl` es un hook. Y hace falta el hook: la notificación
 * trae una `privateUrl` cruda, y un `<img>` pidiéndola sin sesión recibe un 403
 * desde el blindaje del IDOR — se veía el aviso, pero nunca la cara. El hook la
 * canjea por un enlace con testigo firmado; mientras tanto manda el icono.
 */
function NotifPhoto({
  n,
  fill,
  ink,
  Icon,
}: {
  n: PlatformNotification;
  fill: string;
  ink: string;
  Icon: typeof Bell;
}) {
  const photoUrl = useFileUrl(n.payload?.photoUrl || n.payload?.selfieUrl || '');
  return (
    <SmartImage
      src={photoUrl}
      alt=""
      rounded="rounded-lg"
      className="h-12 w-12 shrink-0 border border-[color:var(--hairline)]"
      fallback={
        <span
          className="grid h-full w-full place-items-center"
          style={{
            background: `color-mix(in oklab, ${fill} 14%, transparent)`,
            color: ink,
          }}
        >
          <Icon size={20} />
        </span>
      }
    />
  );
}
