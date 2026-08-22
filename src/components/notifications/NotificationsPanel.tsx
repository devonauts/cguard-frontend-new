import { useState } from 'react';
import { Bell, BellOff, Trash2, Wifi, WifiOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFileUrl } from '@/lib/fileUrl';
import { SmartImage } from '@/components/kit';
import type { PlatformNotification } from '@/hooks/useNotificationStream';
import { targetForNotification } from './notificationToast';

interface NotificationsPanelProps {
  notifications: PlatformNotification[];
  unreadCount: number;
  connected: boolean;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'Ahora';
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h}h`;
  return `Hace ${Math.floor(h / 24)}d`;
}

export function NotificationsPanel({
  notifications,
  unreadCount,
  connected,
  onMarkRead,
  onMarkAllRead,
}: NotificationsPanelProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // The bell is an UNREAD inbox: reading or clearing removes items from here
  // (they remain in the Actividad history). "Clear all" persists to the DB.
  const visible = notifications.filter((n) => !n.read);

  const handleOpen = (n: PlatformNotification) => {
    if (!n.read) onMarkRead(n.id);
    setOpen(false);
    navigate(targetForNotification(n));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* Botón circular de cristal, igual que el resto de la cabecera. El
            contador cuelga del canto y late con `.cc-dot` mientras haya algo sin
            leer — el mismo latido que usan los estados del sistema. */}
        <button
          type="button"
          className="cg-focus cg-btn-glass relative grid h-9 w-9 shrink-0 place-items-center transition-all duration-200 active:scale-95"
          style={{ borderRadius: 9999, color: 'var(--ink-soft)' }}
          aria-label={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ''}`}
          title={connected ? 'Notificaciones' : 'Notificaciones — reconectando'}
        >
          {connected ? (
            <Bell className="h-[18px] w-[18px]" style={unreadCount > 0 ? { color: 'var(--ink)' } : undefined} />
          ) : (
            <BellOff className="h-[18px] w-[18px]" style={{ color: 'var(--ink-faint)' }} />
          )}
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center">
              {/* El latido va DETRÁS del contador: llama la atención sin tapar
                  el número. `.cc-dot` vive en una hoja sin capa y fija su propia
                  posición, por eso se envuelve en vez de colocarse suelto. */}
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="cc-dot" style={{ background: 'var(--bad)' }} />
              </span>
              <span
                className="relative grid h-[18px] min-w-[18px] place-items-center px-1 text-[10px] font-bold"
                style={{
                  borderRadius: 9999,
                  background: 'var(--bad)',
                  color: 'oklch(1 0 0)',
                  boxShadow: '0 0 0 2px var(--glass-solid)',
                }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-96 p-0"
        align="end"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--hairline)' }}>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">Notificaciones</span>
            <span
              className="flex items-center gap-1 text-xs"
              style={{ color: connected ? 'var(--ok-text)' : 'var(--ink-soft)' }}
            >
              {connected ? (
                <Wifi className="h-3 w-3" />
              ) : (
                <WifiOff className="h-3 w-3" />
              )}
              {connected ? 'En vivo' : 'Reconectando…'}
            </span>
          </div>
          {visible.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
              onClick={onMarkAllRead}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpiar todo
            </Button>
          )}
        </div>

        {/* Notification list */}
        <ScrollArea className="h-[420px]">
          {visible.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm" style={{ color: 'var(--ink-faint)' }}>
              <Bell className="h-8 w-8 opacity-40" />
              <span>Sin notificaciones</span>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
              {visible.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onOpen={handleOpen}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function NotificationItem({
  notification: n,
  onOpen,
}: {
  notification: PlatformNotification;
  onOpen: (n: PlatformNotification) => void;
}) {
  // Migrated to token URLs: NotificationItem is a component, so a hook is safe.
  // payload carries only a raw privateUrl string, so useFileUrl fetches a token.
  const photoUrl = useFileUrl(n.payload?.photoUrl);
  return (
    // Fila de lista: SIN desenfoque. Se dibuja una por notificación y el panel
    // se desplaza; un `backdrop-filter` aquí se rasterizaría por fila.
    <div
      className={cn(
        'cursor-pointer px-4 py-3 transition-colors',
        n.read && 'hover:bg-[var(--glass-sunken)]',
        !n.read && 'brand-rail',
      )}
      style={!n.read ? { background: 'var(--brand-wash)' } : undefined}
      onClick={() => onOpen(n)}
    >
      <div className="flex items-start justify-between gap-2">
        {photoUrl && (
          <SmartImage
            src={photoUrl}
            alt=""
            rounded="rounded-md"
            className="h-11 w-11 shrink-0 border border-[color:var(--hairline)]"
          />
        )}
        <div className="flex-1 min-w-0">
          <p
            className={cn('truncate text-sm leading-snug', !n.read ? 'font-semibold' : 'font-normal')}
            style={{ color: 'var(--ink)' }}
          >
            {n.title}
          </p>
          {["coverage.post_uncovered", "coverage.uncovered", "attendance.no_show", "guard.inactive"].includes(String(n.eventType || "")) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                try {
                  window.dispatchEvent(new CustomEvent("vigia:abrir", { detail: {
                    mensaje: `Aviso recibido: ${n.title}. Puedo mostrarte la cobertura en vivo y sugerir reemplazos — dime «muéstrame» y lo hago.`,
                    escribir: "Muéstrame la cobertura y sugiere reemplazos para lo que esté sin cubrir",
                  } }));
                } catch { /* sin widget */ }
              }}
              className="cg-focus mb-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
              style={{ background: "color-mix(in oklab, var(--brand) 15%, transparent)", color: "var(--brand-text)" }}
            >
              Resolver con VigIA
            </button>
          )}
          {n.body && (
            <p className="mt-0.5 line-clamp-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
              {n.body}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="whitespace-nowrap text-[10px] tabular-nums" style={{ color: 'var(--ink-faint)' }}>
            {timeAgo(n.createdAt)}
          </span>
          {!n.read && (
            <span className="h-2 w-2 rounded-full" style={{ background: 'var(--brand)' }} />
          )}
        </div>
      </div>
    </div>
  );
}
