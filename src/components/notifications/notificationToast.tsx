import { toast } from 'sonner';
import { LogIn, LogOut, AlertTriangle, Route, CalendarClock, UserCheck, Siren, Bell, X, MessageSquare, ClipboardList } from 'lucide-react';
import { fileUrlFromPrivate } from '@/lib/fileUrl';
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
  // site tour), which lives on the rondas report — NOT the vehicle-patrol board.
  if (type.startsWith('patrol')) {
    return type.startsWith('patrol.vehicle') ? '/vehicle-patrol' : '/reports/site-tour';
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
  // NOTE (token migration): this is a plain imperative function (not a React
  // component), so the `useFileUrl` hook can't be used here, and the live
  // notification payload carries only a raw `photoUrl` privateUrl string (no
  // companion `downloadUrl`). Left on `fileUrlFromPrivate` as a documented
  // transitional fallback. If FILE_DOWNLOAD_REQUIRE_TOKEN is enabled, the
  // backend should start emitting a token `downloadUrl` in the notification
  // payload instead — switch to that field here when it's available.
  const photoUrl = fileUrlFromPrivate(n.payload?.photoUrl);
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
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            className="h-12 w-12 shrink-0 rounded-lg border object-cover"
            style={{ borderColor: 'var(--hairline)' }}
            onError={(e) => ((e.currentTarget.style.display = 'none'))}
          />
        ) : (
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border"
            style={{
              background: `color-mix(in oklab, ${fill} 14%, transparent)`,
              borderColor: `color-mix(in oklab, ${fill} 30%, transparent)`,
              color: ink,
            }}
          >
            <Icon size={20} />
          </span>
        )}
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
          className="cg-focus shrink-0 rounded-full p-0.5 transition-colors"
          style={{ color: 'var(--ink-faint)' }}
        >
          <X size={16} />
        </button>
      </div>
    ),
    { duration: 8000 },
  );
}
