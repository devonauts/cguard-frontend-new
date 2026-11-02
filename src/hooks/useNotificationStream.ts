/**
 * useNotificationStream
 *
 * Connects to the backend over **websockets** (socket.io) and stores incoming
 * notifications. On connect it seeds the recent backlog from the REST
 * `/:tenantId/events` endpoint (the websocket only pushes events emitted after
 * connection). socket.io handles auto-reconnect.
 * Returns the list of recent notifications and the live unread count.
 */

import { cerrarSesionDeCodigo } from "@/lib/sesionDeCodigo";
import { useEffect, useRef, useState, useCallback } from "react";
import { type Socket } from "socket.io-client";

import { notifyMessagesChanged } from "./useMessagesUnread";

import { idiomaElegido } from "@/lib/idiomaElegido";
import { getAuthToken } from "@/lib/api";
import { playNotificationChime } from "@/lib/notificationSound";
import {
  notifyNative,
  setAppBadge,
  ensureNotificationPermission,
} from "@/lib/desktop";
import { crearSocket, cerrarSocket } from "@/lib/socket";
import {
  crearLecturaCompartida,
  type LectorCompartido,
} from "@/lib/lecturaCompartida";
import { resolveApiBase } from "@/lib/apiBase";
import { alRecibirSesionBloqueada } from "@/lib/accesoBloqueado";
import { prioridadDe } from "@/components/notifications/catalogoDeAvisos";
import { crearRafaga, type Rafaga } from "@/lib/rafaga";
import i18n from "@/i18n";

const API_URL = (resolveApiBase() as string | undefined) || "";

/**
 * The server sends each live event in all eight languages (`i18n`); show the
 * one the person chose. Without it the toast came in the company's language.
 */
function enMiIdioma(n: PlatformNotification): PlatformNotification {
  const variantes = (n as any)?.i18n as
    | Record<string, { title?: string; body?: string }>
    | undefined;

  if (!variantes) return n;
  const elegido = idiomaElegido();
  const base = elegido.split("-")[0].toLowerCase();
  const v = variantes[elegido] || variantes[base === "pt" ? "pt-BR" : base];

  return v && v.title ? { ...n, title: v.title, body: v.body ?? n.body } : n;
}

export interface PlatformNotification {
  id: string;
  eventType: string;
  title: string;
  body: string;
  payload?: any;
  sourceEntityType?: string;
  sourceEntityId?: string;
  /** Cuándo LLEGÓ el aviso (cuándo lo detectó el sistema). Ordena la bandeja. */
  createdAt: string;
  /** Cuándo PASÓ lo que avisa. Una falta se detecta a la media hora de empezar
   *  el turno: llega «ahora», pero pasó a las 07:00. Sin él, igual a createdAt. */
  occurredAt?: string;
  read?: boolean;
}

/**
 * ── UNA RÁFAGA ES UN SOLO AVISO ───────────────────────────────────────────────
 * Los barridos del servidor escriben todo lo que encuentran en el mismo tic:
 * a las 07:00 caían diecisiete a la vez y salían diecisiete tarjetas, diecisiete
 * campanadas. Lo que llega dentro de esta ventana se junta: uno solo sale como
 * siempre; varios, como UN resumen («12 avisos nuevos») con UNA campanada.
 * Las emergencias no esperan: salen en el acto y solas.
 */
const VENTANA_DE_RAFAGA_MS = 1_200;

function esEmergencia(n: PlatformNotification): boolean {
  return (
    n.eventType === "panic.alert" || prioridadDe(n.eventType) === "emergency"
  );
}

interface UseNotificationStreamResult {
  notifications: PlatformNotification[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  /** Quitar de la bandeja PARA ESTA PERSONA (deslizar a la izquierda). */
  dismiss: (ids: string[]) => void;
  connected: boolean;
  /** true mientras se lee el historial inicial (para pintar el esqueleto). */
  seeding: boolean;
  /** el historial inicial no se pudo leer. Los eventos en vivo siguen llegando. */
  seedError: boolean;
  /** Relee el historial y lo funde con lo que ya hay. Para el botón «Actualizar». */
  refresh: () => Promise<void>;
}

const MAX_STORED = 50;

/** Reproduce la campanada sin romper nada si el navegador la bloquea. */
function campanada(): void {
  try {
    playNotificationChime();
  } catch {
    /* best-effort */
  }
}

// Sonido + aviso del SISTEMA deduplicados a nivel de MÓDULO: el hook se monta
// en más de un consumidor a la vez (la campana del header y RadioRealtimeProvider)
// y cada instancia mantenía su propio "ya alertado" — resultado: chime doble y
// dos avisos nativos por el mismo evento (auditoría 2026-08-18). El callback
// onLive de cada consumidor sigue siendo por-instancia (cada uno necesita su
// propia reacción); lo global es solo lo que el USUARIO oye/ve una vez.
const globallyAlerted = new Set<string>();

/**
 * LA SIEMBRA DEL HISTORIAL, COMPARTIDA ENTRE INSTANCIAS.
 *
 * Este hook lo montan a la vez la campana del header, `RadioRealtimeProvider` y
 * la pantalla de Actividad. Cada instancia pedía su propio
 * `GET /:tenantId/events`, así que al abrir sesión salían dos y al entrar en
 * Actividad otra más.
 *
 * Compartir la promesa mientras la petición está VIVA junta a las instancias
 * que montan a la vez, y quien monte MÁS TARDE vuelve a pedir — que es lo que
 * se espera de un historial.
 *
 * El problema es qué cuenta como «más tarde». Medido en un build de producción:
 * la campana y `RadioRealtimeProvider` montan con 91 ms de diferencia, o sea
 * dentro del MISMO arranque, y la segunda se perdía la ventana por milésimas y
 * pedía el histórico otra vez. Tres instancias, tres peticiones.
 *
 * Con una ventana de frescura corta se conservan las dos intenciones: el
 * arranque entero se sirve de una sola respuesta, y abrir Actividad un minuto
 * después sí vuelve a leer. Cinco segundos es de sobra para lo primero y muy
 * poco para lo segundo.
 */
const SIEMBRA_FRESCA_MS = 5_000;
const siembraPorEmpresa = new Map<string, LectorCompartido<any[]>>();

function leerHistorial(
  tenantId: string,
  token: string,
  /** El botón «Actualizar» de Actividad. Una orden explícita de la persona NO
   *  se puede servir de la ventana de frescura: pulsar y que no pase nada se
   *  lee como que el botón está roto. */
  forzar = false,
): Promise<any[]> {
  let lector = siembraPorEmpresa.get(tenantId);

  if (!lector) {
    lector = crearLecturaCompartida<any[]>(
      () =>
        fetch(`${API_URL}/${tenantId}/events?limit=${MAX_STORED}`, {
          // The server re-renders each stored event in the request's language.
          // A bare fetch sent the BROWSER's Accept-Language, so with the CRM in
          // Spanish on an English browser the dashboard's «Parte de novedades»
          // came in English («… asks to approve a computer»).
          headers: {
            "Accept-Language": idiomaElegido(),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
          .then((r) => (r.ok ? r.json() : { rows: [] }))
          .then((data) => (data?.rows || []) as any[]),
      SIEMBRA_FRESCA_MS,
    );
    siembraPorEmpresa.set(tenantId, lector);
  }
  if (forzar) lector.olvidar();

  return lector.leer();
}

/**
 * El historial reciente para quien NO es este hook (la «Actividad reciente»
 * del dashboard pedía `GET /:tenantId/events` por su cuenta, un segundo
 * después de que la campana ya lo hubiera traído).
 */
export function leerHistorialDeAvisos(tenantId: string): Promise<any[]> {
  return leerHistorial(tenantId, getAuthToken() || "");
}

/** Al cerrar sesión o cambiar de empresa: que la siguiente no herede nada. */
export function olvidarSiembraDeAvisos(): void {
  siembraPorEmpresa.clear();
}

export function useNotificationStream(
  tenantId: string | null | undefined,
  onLive?: (n: PlatformNotification) => void,
  /** Varios avisos en la misma ráfaga: un solo resumen en vez de N tarjetas.
   *  Sin él, cada uno pasa por `onLive` como siempre. */
  onBurst?: (ns: PlatformNotification[]) => void,
): UseNotificationStreamResult {
  const [notifications, setNotifications] = useState<PlatformNotification[]>(
    [],
  );
  const [connected, setConnected] = useState(false);
  // Estado del historial inicial, para que quien pinte una lista completa
  // (la pantalla de Actividad) sepa si está esperando o si falló.
  const [seeding, setSeeding] = useState(true);
  const [seedError, setSeedError] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  // Keep the latest callback in a ref so changing it doesn't re-create the
  // socket connection (the effect depends only on tenantId).
  const onLiveRef = useRef(onLive);

  onLiveRef.current = onLive;
  const onBurstRef = useRef(onBurst);

  onBurstRef.current = onBurst;
  // La ráfaga en curso (se crea con el socket, se cancela al desmontar).
  const rafagaRef = useRef<Rafaga<PlatformNotification> | null>(null);
  // Event ids already alerted in this session. The backend emits one event to
  // several rooms the socket belongs to (tenant `:all` + each target role room
  // in separate io.to().emit() calls — see backend lib/realtime.ts), so the same
  // notification can arrive 2-3× over one connection. We coalesce by id here so
  // each unique event fires exactly one chime + one toast.
  const alertedRef = useRef<Set<string>>(new Set());

  const addNotification = useCallback(
    (n: PlatformNotification, read = false) => {
      setNotifications((prev) => {
        if (prev.some((x) => x.id === n.id)) return prev;

        // Always keep the list sorted NEWEST-FIRST by createdAt. Insertion order can't be
        // trusted: the REST backlog is seeded one-by-one (each prepended) from an API that
        // already returns newest-first, which would otherwise REVERSE it to oldest-first.
        return [{ ...n, read }, ...prev]
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )
          .slice(0, MAX_STORED);
      });
    },
    [],
  );

  /** Vuelca las filas del historial en la lista (dedup por id lo hace addNotification). */
  const sembrar = useCallback(
    (rows: any[]) => {
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
            occurredAt: ev.occurredAt || ev.createdAt,
          },
          ev.deliveryStatus === "read",
        );
      }
    },
    [addNotification],
  );

  /** Relectura a petición del usuario (botón «Actualizar» de Actividad). */
  const refresh = useCallback(async () => {
    if (!tenantId) return;
    const token = getAuthToken();

    if (!token) return;
    setSeeding(true);
    setSeedError(false);
    try {
      sembrar(await leerHistorial(tenantId, token, true));
    } catch {
      setSeedError(true);
    } finally {
      setSeeding(false);
    }
  }, [tenantId, sembrar]);

  const markRead = useCallback(
    (id: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      if (!tenantId) return;
      const token = getAuthToken();

      fetch(`${API_URL}/${tenantId}/events/${id}/read`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).catch(() => {});
    },
    [tenantId],
  );

  const dismiss = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      const quitar = new Set(ids);

      setNotifications((prev) => prev.filter((n) => !quitar.has(n.id)));
      if (!tenantId) return;
      const token = getAuthToken();

      // Por persona (`platform_event_dismissals`): a los compañeros no se les
      // quita nada. Una petición por aviso; una pila son pocas.
      for (const id of ids) {
        fetch(`${API_URL}/${tenantId}/events/${id}`, {
          method: "DELETE",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).catch(() => {});
      }
    },
    [tenantId],
  );

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    if (!tenantId) return;
    const token = getAuthToken();

    // Persist to the DB so cleared notifications don't reappear on refresh.
    fetch(`${API_URL}/${tenantId}/events/read-all`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).catch(() => {});
  }, [tenantId]);

  useEffect(() => {
    // Sin empresa o sin sesión no hay historial que leer, pero el consumidor
    // tiene que dejar de esperar: si `seeding` se queda en true, la pantalla de
    // Actividad muestra el esqueleto para siempre.
    if (!tenantId) {
      setSeeding(false);

      return;
    }
    const token = getAuthToken();

    if (!token) {
      setSeeding(false);

      return;
    }

    let destroyed = false;

    // Seed the recent backlog (websocket only delivers new events post-connect).
    // La petición se comparte con las otras instancias del hook que monten a la
    // vez (ver `leerHistorial`).
    setSeeding(true);
    setSeedError(false);
    leerHistorial(tenantId, token)
      .then((rows) => {
        if (destroyed) return;
        sembrar(rows);
        setSeeding(false);
      })
      .catch(() => {
        if (destroyed) return;
        setSeedError(true);
        setSeeding(false);
      });

    const socket = crearSocket(token, tenantId);

    socketRef.current = socket;

    /* ── AL RECONECTAR, SE RECUPERA LO PERDIDO ─────────────────────────────
       El servidor se reinicia varias veces al día y cada reinicio corta el
       socket. Lo que se emitió en ese hueco no llega nunca en vivo: antes
       aparecía de golpe en la siguiente carga de página, con horas viejas y
       sin avisar. Ahora cada reconexión vuelve a leer el historial y lo funde
       (sin sonar: son avisos que ya pasaron). */
    /* The socket is SHARED: when this hook mounts on a socket that is already
       connected, its `connect` will not fire until the NEXT connection — which
       is a reconnection (events were missed), not the first one. */
    let yaConecto = socket.connected;

    if (socket.connected) setConnected(true);

    rafagaRef.current = crearRafaga<PlatformNotification>(
      VENTANA_DE_RAFAGA_MS,
      (lote) => {
        if (destroyed) return;
        // Audible cue for live events only — the REST backlog seed above stays
        // silent so we don't chime on every page load. UNA por ráfaga.
        campanada();
        // Aviso NATIVO del sistema cuando el CRM no está a la vista (minimizado /
        // otra pestaña / app de escritorio en segundo plano). notifyNative ya se
        // auto-silencia con la ventana visible, así que nunca duplica el toast.
        try {
          if (lote.length === 1) {
            notifyNative(lote[0].title, lote[0].body, undefined, lote[0].id);
          } else {
            notifyNative(
              i18n.t("ui.NotificationsPanel.nuevosAvisos", {
                defaultValue: "{{n}} avisos nuevos",
                n: lote.length,
              }),
              lote
                .slice(0, 3)
                .map((x) => x.title)
                .join(" · "),
              undefined,
              `rafaga-${lote[0].id}`,
            );
          }
        } catch {
          /* best-effort */
        }
        try {
          if (lote.length > 1 && onBurstRef.current) {
            onBurstRef.current(lote);
          } else {
            lote.forEach((x) => onLiveRef.current?.(x));
          }
        } catch {
          /* best-effort */
        }
      },
    );

    socket.on("connect", () => {
      if (destroyed) return;
      setConnected(true);
      if (yaConecto) {
        leerHistorial(tenantId, getAuthToken() || token, true)
          .then((rows) => {
            if (!destroyed) sembrar(rows);
          })
          .catch(() => {
            /* la próxima reconexión lo vuelve a intentar */
          });
      }
      yaConecto = true;
    });
    socket.on("disconnect", () => {
      if (!destroyed) setConnected(false);
    });
    socket.on("connect_error", () => {
      if (!destroyed) setConnected(false);
    });
    // Single active session: a newer WEB sign-in on this account supersedes
    // this browser. Verify against the server (never trust the event alone):
    // an authenticated fetch with the superseded token returns 401
    // auth.sessionSuperseded → clear token + land on /login immediately,
    // instead of waiting for the user's next click. A same-tab/new-tab login
    // shares localStorage, so the fetch succeeds there and nothing happens.
    socket.on("session:superseded", (p: { channel?: string } | undefined) => {
      if (destroyed || !p || p.channel !== "web") return;
      const tok = getAuthToken();

      if (!tok) return;
      fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${tok}` },
      })
        .then((r) => {
          if (
            r.status === 401 &&
            !window.location.pathname.startsWith("/login")
          ) {
            try {
              window.localStorage.removeItem("authToken");
            } catch {
              /* ignore */
            }
            void cerrarSesionDeCodigo();
            try {
              window.location.replace("/login");
            } catch {
              /* ignore */
            }
          }
        })
        .catch(() => {
          /* transient network error — the 401-on-next-request path still applies */
        });
    });

    // BLOQUEO: el servidor ya invalidó el token y avisa a TODAS las pantallas
    // de esta persona. No hace falta preguntarle a /auth/me —sólo el servidor
    // emite a esta sala—: se cierra la sesión con el cierre NORMAL y se va a
    // «Acceso bloqueado». El servidor corta el socket un instante después.
    socket.on("session:blocked", (p: { codigo?: string; referencia?: string } | undefined) => {
      if (destroyed) return;
      void alRecibirSesionBloqueada(p);
    });

    socket.on("notification", (entrante: PlatformNotification) => {
      if (destroyed || !entrante || !entrante.id) return;
      const n = enMiIdioma(entrante);

      addNotification(n, false); // list dedups by id internally

      // Un mensaje nuevo cambia el contador del buzón: se avisa al menú lateral
      // para que el punto aparezca en el momento, sin esperar a su intervalo.
      // Va ANTES del corte por duplicados de abajo a propósito: es idempotente
      // (sólo provoca una relectura del contador) y así también reacciona en
      // pestañas donde nadie escucha `onLive`.
      if (n.eventType === "message.new") notifyMessagesChanged();

      // Only the first delivery of a given event id raises an alert; duplicate
      // room copies from the backend are ignored. The chime + toast fire only
      // for consumers that opted in via onLive (the header) — a data-only mount
      // (e.g. the Activities page) passes no callback and stays silent.
      if (alertedRef.current.has(n.id) || !onLiveRef.current) return;
      alertedRef.current.add(n.id);
      if (alertedRef.current.size > 1000) {
        alertedRef.current = new Set(
          Array.from(alertedRef.current).slice(-500),
        );
      }
      // Un consumidor de sólo-datos con reacción propia (la radio) recibe cada
      // evento al momento y en silencio: sonar y resumir es cosa de la campana,
      // que es la que pasa `onBurst`.
      if (!onBurstRef.current) {
        try {
          onLiveRef.current(n);
        } catch {
          /* best-effort */
        }

        return;
      }

      // Chime + aviso nativo UNA sola vez por evento en toda la app (ver
      // globallyAlerted arriba) — sin importar cuántos consumidores del stream
      // estén montados.
      if (globallyAlerted.has(n.id)) return;
      globallyAlerted.add(n.id);
      if (globallyAlerted.size > 1000) {
        const keep = Array.from(globallyAlerted).slice(-500);

        globallyAlerted.clear();
        keep.forEach((id) => globallyAlerted.add(id));
      }

      // Emergencia: en el acto, sola, con su campanada y su aviso nativo.
      if (esEmergencia(n)) {
        campanada();
        try {
          notifyNative(n.title, n.body, undefined, n.id);
        } catch {
          /* best-effort */
        }
        try {
          onLiveRef.current(n);
        } catch {
          /* best-effort */
        }

        return;
      }

      // Lo demás se junta con lo que llegue en el mismo instante.
      rafagaRef.current?.meter(n);
    });

    return () => {
      destroyed = true;
      rafagaRef.current?.cancelar();
      rafagaRef.current = null;
      setConnected(false);
      cerrarSocket(socket);
      socketRef.current = null;
    };
  }, [tenantId, addNotification, sembrar]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Contador en el icono (dock / barra de tareas / PWA). Solo el consumidor
  // "vivo" (la campana del header, el que pasa onLive) lo publica — los montajes
  // de solo-datos no compiten por el badge. Idempotente y best-effort.
  useEffect(() => {
    if (!onLiveRef.current) return;
    try {
      setAppBadge(unreadCount);
    } catch {
      /* ignore */
    }
  }, [unreadCount]);

  // El permiso de avisos se pide una vez, desde un montaje real del stream
  // (hay sesión y hay interfaz) — no en frío al cargar la página de login.
  useEffect(() => {
    if (!tenantId || !onLiveRef.current) return;
    ensureNotificationPermission();
  }, [tenantId]);

  return {
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    dismiss,
    connected,
    seeding,
    seedError,
    refresh,
  };
}
