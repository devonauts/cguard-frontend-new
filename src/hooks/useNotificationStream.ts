/**
 * useNotificationStream
 *
 * Connects to the backend over **websockets** (socket.io) and stores incoming
 * notifications. On connect it seeds the recent backlog from the REST
 * `/:tenantId/events` endpoint (the websocket only pushes events emitted after
 * connection). socket.io handles auto-reconnect.
 * Returns the list of recent notifications and the live unread count.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { type Socket } from 'socket.io-client';
import { getAuthToken } from '@/lib/api';
import { playNotificationChime } from '@/lib/notificationSound';
import { notifyNative, setAppBadge, ensureNotificationPermission } from '@/lib/desktop';
import { crearSocket, cerrarSocket } from '@/lib/socket';
import { notifyMessagesChanged } from './useMessagesUnread';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || '';

export interface PlatformNotification {
  id: string;
  eventType: string;
  title: string;
  body: string;
  payload?: any;
  sourceEntityType?: string;
  sourceEntityId?: string;
  createdAt: string;
  read?: boolean;
}

interface UseNotificationStreamResult {
  notifications: PlatformNotification[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  connected: boolean;
}

const MAX_STORED = 50;

// Sonido + aviso del SISTEMA deduplicados a nivel de MÓDULO: el hook se monta
// en más de un consumidor a la vez (la campana del header y RadioRealtimeProvider)
// y cada instancia mantenía su propio "ya alertado" — resultado: chime doble y
// dos avisos nativos por el mismo evento (auditoría 2026-08-18). El callback
// onLive de cada consumidor sigue siendo por-instancia (cada uno necesita su
// propia reacción); lo global es solo lo que el USUARIO oye/ve una vez.
const globallyAlerted = new Set<string>();

export function useNotificationStream(
  tenantId: string | null | undefined,
  onLive?: (n: PlatformNotification) => void,
): UseNotificationStreamResult {
  const [notifications, setNotifications] = useState<PlatformNotification[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  // Keep the latest callback in a ref so changing it doesn't re-create the
  // socket connection (the effect depends only on tenantId).
  const onLiveRef = useRef(onLive);
  onLiveRef.current = onLive;
  // Event ids already alerted in this session. The backend emits one event to
  // several rooms the socket belongs to (tenant `:all` + each target role room
  // in separate io.to().emit() calls — see backend lib/realtime.ts), so the same
  // notification can arrive 2-3× over one connection. We coalesce by id here so
  // each unique event fires exactly one chime + one toast.
  const alertedRef = useRef<Set<string>>(new Set());

  const addNotification = useCallback((n: PlatformNotification, read = false) => {
    setNotifications((prev) => {
      if (prev.some((x) => x.id === n.id)) return prev;
      // Always keep the list sorted NEWEST-FIRST by createdAt. Insertion order can't be
      // trusted: the REST backlog is seeded one-by-one (each prepended) from an API that
      // already returns newest-first, which would otherwise REVERSE it to oldest-first.
      return [{ ...n, read }, ...prev]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, MAX_STORED);
    });
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    if (!tenantId) return;
    const token = getAuthToken();
    fetch(`${API_URL}/${tenantId}/events/${id}/read`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).catch(() => {});
  }, [tenantId]);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    if (!tenantId) return;
    const token = getAuthToken();
    // Persist to the DB so cleared notifications don't reappear on refresh.
    fetch(`${API_URL}/${tenantId}/events/read-all`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).catch(() => {});
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const token = getAuthToken();
    if (!token) return;

    let destroyed = false;

    // Seed the recent backlog (websocket only delivers new events post-connect).
    fetch(`${API_URL}/${tenantId}/events?limit=30`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((data) => {
        if (destroyed) return;
        const rows: any[] = data?.rows || [];
        for (const ev of rows) {
          addNotification(
            {
              id: ev.id,
              eventType: ev.eventType,
              title: ev.title,
              body: ev.body,
              payload: ev.payload,
              sourceEntityType: ev.sourceEntityType,
              sourceEntityId: ev.sourceEntityId,
              createdAt: ev.createdAt,
            },
            ev.deliveryStatus === 'read',
          );
        }
      })
      .catch(() => {});

    const socket = crearSocket(token, tenantId);
    socketRef.current = socket;

    socket.on('connect', () => {
      if (!destroyed) setConnected(true);
    });
    socket.on('disconnect', () => {
      if (!destroyed) setConnected(false);
    });
    socket.on('connect_error', () => {
      if (!destroyed) setConnected(false);
    });
    // Single active session: a newer WEB sign-in on this account supersedes
    // this browser. Verify against the server (never trust the event alone):
    // an authenticated fetch with the superseded token returns 401
    // auth.sessionSuperseded → clear token + land on /login immediately,
    // instead of waiting for the user's next click. A same-tab/new-tab login
    // shares localStorage, so the fetch succeeds there and nothing happens.
    socket.on('session:superseded', (p: { channel?: string } | undefined) => {
      if (destroyed || !p || p.channel !== 'web') return;
      const tok = getAuthToken();
      if (!tok) return;
      fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${tok}` } })
        .then((r) => {
          if (r.status === 401 && !window.location.pathname.startsWith('/login')) {
            try { window.localStorage.removeItem('authToken'); } catch { /* ignore */ }
            try { window.location.replace('/login'); } catch { /* ignore */ }
          }
        })
        .catch(() => { /* transient network error — the 401-on-next-request path still applies */ });
    });

    socket.on('notification', (n: PlatformNotification) => {
      if (destroyed || !n || !n.id) return;
      addNotification(n, false); // list dedups by id internally

      // Un mensaje nuevo cambia el contador del buzón: se avisa al menú lateral
      // para que el punto aparezca en el momento, sin esperar a su intervalo.
      // Va ANTES del corte por duplicados de abajo a propósito: es idempotente
      // (sólo provoca una relectura del contador) y así también reacciona en
      // pestañas donde nadie escucha `onLive`.
      if (n.eventType === 'message.new') notifyMessagesChanged();

      // Only the first delivery of a given event id raises an alert; duplicate
      // room copies from the backend are ignored. The chime + toast fire only
      // for consumers that opted in via onLive (the header) — a data-only mount
      // (e.g. the Activities page) passes no callback and stays silent.
      if (alertedRef.current.has(n.id) || !onLiveRef.current) return;
      alertedRef.current.add(n.id);
      if (alertedRef.current.size > 1000) {
        alertedRef.current = new Set(Array.from(alertedRef.current).slice(-500));
      }
      // Chime + aviso nativo UNA sola vez por evento en toda la app (ver
      // globallyAlerted arriba) — sin importar cuántos consumidores del stream
      // estén montados.
      if (!globallyAlerted.has(n.id)) {
        globallyAlerted.add(n.id);
        if (globallyAlerted.size > 1000) {
          const keep = Array.from(globallyAlerted).slice(-500);
          globallyAlerted.clear();
          keep.forEach((id) => globallyAlerted.add(id));
        }
        // Audible cue for live events only — the REST backlog seed above stays
        // silent so we don't chime on every page load.
        try {
          playNotificationChime();
        } catch {
          /* best-effort */
        }
        // Aviso NATIVO del sistema cuando el CRM no está a la vista (minimizado /
        // otra pestaña / app de escritorio en segundo plano). notifyNative ya se
        // auto-silencia con la ventana visible, así que nunca duplica el toast.
        try {
          notifyNative(n.title, n.body, undefined, n.id);
        } catch {
          /* best-effort */
        }
      }
      // Fire the in-CRM custom alert for the live arrival.
      try {
        onLiveRef.current(n);
      } catch {
        /* best-effort */
      }
    });

    return () => {
      destroyed = true;
      setConnected(false);
      cerrarSocket(socket);
      socketRef.current = null;
    };
  }, [tenantId, addNotification]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Contador en el icono (dock / barra de tareas / PWA). Solo el consumidor
  // "vivo" (la campana del header, el que pasa onLive) lo publica — los montajes
  // de solo-datos no compiten por el badge. Idempotente y best-effort.
  useEffect(() => {
    if (!onLiveRef.current) return;
    try { setAppBadge(unreadCount); } catch { /* ignore */ }
  }, [unreadCount]);

  // El permiso de avisos se pide una vez, desde un montaje real del stream
  // (hay sesión y hay interfaz) — no en frío al cargar la página de login.
  useEffect(() => {
    if (!tenantId || !onLiveRef.current) return;
    ensureNotificationPermission();
  }, [tenantId]);

  return { notifications, unreadCount, markRead, markAllRead, connected };
}
