/**
 * CoBrowseAgent — runs in the TENANT's CRM. It sits idle until a superadmin
 * starts watching this user's session (backend emits `cobrowse:start`). Then it
 * records the page with rrweb (DOM + cursor/clicks/scroll), streams the events
 * over socket.io, and shows a visible "Soporte está viendo tu sesión" banner so
 * the user always knows they're being observed (consent-by-transparency).
 *
 * rrweb is dynamically imported: it only loads when a support session actually
 * starts, so it costs nothing to normal users. Inputs are masked by default so
 * typed values (passwords, personal data) are never streamed.
 *
 * Mounted once at the app root; no-op when unauthenticated.
 */
import { useEffect, useRef, useState } from "react";
import { type Socket } from "socket.io-client";
import { Eye, MousePointer2, Hand } from "lucide-react";

import { crearSocket, cerrarSocket } from "@/lib/socket";
import { getAuthToken } from "@/lib/api";
import { resolveApiBase } from "@/lib/apiBase";

const API_URL = (resolveApiBase() as string | undefined) || "";

export default function CoBrowseAgent() {
  const [watchedBy, setWatchedBy] = useState<string | null>(null);
  // Shared control: who currently drives (null = the tenant), and the support
  // agent's live cursor position so the tenant sees where they're pointing.
  const [controller, setController] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{
    x: number;
    y: number;
    visible: boolean;
  }>({ x: 0, y: 0, visible: false });
  const turnRef = useRef<"tenant" | "support">("tenant");
  const socketRef = useRef<Socket | null>(null);
  const stopRecordRef = useRef<null | (() => void)>(null);
  const bufferRef = useRef<any[]>([]);
  const flushTimerRef = useRef<any>(null);

  // Tenant reclaims control from support.
  const reclaimControl = () => {
    turnRef.current = "tenant";
    setController(null);
    socketRef.current?.emit("cobrowse:turn", { holder: "tenant" });
  };

  useEffect(() => {
    let disposed = false;
    let pollTimer: any = null;

    const flush = () => {
      const socket = socketRef.current;

      if (!socket || !bufferRef.current.length || !socket.connected) return;
      const batch = bufferRef.current;

      bufferRef.current = [];
      socket.emit("cobrowse:event", { events: batch });
    };

    const stopRecording = () => {
      try {
        stopRecordRef.current?.();
      } catch {
        /* ignore */
      }
      stopRecordRef.current = null;
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      bufferRef.current = [];
    };

    // Support's cursor / click / scroll, relayed from the superadmin viewer.
    // Coordinates are normalized (0..1) against the viewport so they map across
    // the different window sizes. The cursor always shows; clicks/scrolls only
    // take effect while support holds the turn (turnRef === 'support').
    const executeControl = (payload: { by?: string; event?: any } = {}) => {
      const ev = payload.event;

      if (!ev) return;
      const x = Math.round((ev.nx ?? 0) * window.innerWidth);
      const y = Math.round((ev.ny ?? 0) * window.innerHeight);

      if (ev.kind === "cursor") {
        setCursor({ x, y, visible: true });

        return;
      }
      if (turnRef.current !== "support") return;
      if (ev.kind === "scroll") {
        try {
          window.scrollBy({ top: ev.dy || 0, left: ev.dx || 0 });
        } catch {
          /* ignore */
        }

        return;
      }
      if (ev.kind === "click") {
        setCursor({ x, y, visible: true });
        try {
          const el = document.elementFromPoint(x, y) as HTMLElement | null;

          if (el) {
            el.focus?.();
            const opts: any = {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: x,
              clientY: y,
            };

            el.dispatchEvent(new MouseEvent("mousedown", opts));
            el.dispatchEvent(new MouseEvent("mouseup", opts));
            el.dispatchEvent(new MouseEvent("click", opts));
            el.click?.();
          }
        } catch {
          /* ignore */
        }
      }
    };

    const startRecording = async (fresh: boolean) => {
      const socket = socketRef.current;

      if (!socket) return;
      // A late-joining watcher needs a Meta(4) + FullSnapshot(2) to boot the
      // Replayer. `record.takeFullSnapshot()` on an already-running recorder is
      // unreliable across rrweb builds (often a no-op), leaving the viewer blank
      // ("keeps connecting, nothing renders"). So on every FRESH watch we tear the
      // recorder down and start it clean — a fresh record() always re-emits the
      // Meta + FullSnapshot the viewer needs.
      if (stopRecordRef.current) {
        if (!fresh) return; // already recording and no new watcher — nothing to do
        stopRecording(); // restart clean below so a full snapshot is guaranteed
      }
      try {
        const rr: any = await import("rrweb");
        const rec = rr?.record || rr?.default?.record || rr?.default;

        // eslint-disable-next-line no-console
        console.log("[cobrowse] rrweb loaded, record is", typeof rec);
        if (typeof rec !== "function") {
          socket.emit("cobrowse:ack", { stage: "no-record-export" });

          return;
        }
        const stop = rec({
          emit(event: any) {
            bufferRef.current.push(event);
            if (bufferRef.current.length >= 40) flush();
          },
          sampling: { mousemove: 40, scroll: 150, input: "last" },
          maskAllInputs: true, // never stream typed values
          recordCanvas: false,
          collectFonts: false,
        });

        stopRecordRef.current = typeof stop === "function" ? stop : null;
        flushTimerRef.current = setInterval(flush, 250);
        socket.emit("cobrowse:ack", { stage: "recording" });
        // eslint-disable-next-line no-console
        console.log("[cobrowse] recording started");
      } catch (e) {
        // rrweb failed to load — fail closed (no stream), never break the CRM.
        // eslint-disable-next-line no-console
        console.warn("[cobrowse] recorder unavailable", e);
        socketRef.current?.emit("cobrowse:ack", { stage: "error" });
      }
    };

    // Connect only once BOTH the auth token and tenantId are available. The agent
    // mounts at the app root (even on the login page), so at first mount there is
    // usually no token yet — we must retry after the user logs in, otherwise the
    // recorder never connects and a watched session renders nothing.
    const connect = (): boolean => {
      const token = getAuthToken();
      const tenantId = (() => {
        try {
          return localStorage.getItem("tenantId") || "";
        } catch {
          return "";
        }
      })();

      if (!token || !tenantId) return false;
      const socket = crearSocket(token, tenantId);

      socketRef.current = socket;
      socket.on(
        "cobrowse:start",
        (p: { by?: string; fresh?: boolean } = {}) => {
          // eslint-disable-next-line no-console
          console.log("[cobrowse] start received from", p.by);
          socket.emit("cobrowse:ack", { stage: "received" });
          setWatchedBy(p.by || "Soporte");
          startRecording(!!p.fresh);
        },
      );
      socket.on("cobrowse:stop", () => {
        setWatchedBy(null);
        stopRecording();
        turnRef.current = "tenant";
        setController(null);
        setCursor((c) => ({ ...c, visible: false }));
      });
      // Shared-control channel from the superadmin.
      socket.on("cobrowse:control", executeControl);
      socket.on("cobrowse:turn", (p: { holder?: string; by?: string } = {}) => {
        const holder = p.holder === "support" ? "support" : "tenant";

        turnRef.current = holder;
        setController(holder === "support" ? p.by || "Soporte" : null);
      });

      return true;
    };

    if (!connect()) {
      pollTimer = setInterval(() => {
        if (disposed) return;
        if (connect()) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      }, 2000);
    }

    return () => {
      disposed = true;
      if (pollTimer) clearInterval(pollTimer);
      stopRecording();
      const socket = socketRef.current;

      cerrarSocket(socket);
      socketRef.current = null;
    };
  }, []);

  if (!watchedBy) return null;

  const controlling = !!controller;

  /**
   * Los dos estados de este aviso son SEMÁNTICOS, no de marca: «te están
   * mirando» es una advertencia y «te están controlando» es grave. Salen de
   * `--warn` y `--bad`, que en tokens.css son fijos — si el acento de la empresa
   * fuera ámbar, un banner de marca dejaría de leerse como aviso.
   *
   * `--bad` vale 0.55 en claro y 0.70 en oscuro, y a 0.70 el blanco encima cae a
   * ~2,5:1: se rebaja con `color-mix` para que la tinta blanca pase en los dos
   * temas con una sola declaración (mismo criterio que el overlay de pánico).
   * Sobre el ámbar la tinta correcta es la oscura, que es lo que `--brand-ink`
   * es: negro acromático a 0.16, no un color de marca pese al nombre.
   */
  const fondo = controlling
    ? "color-mix(in oklab, var(--bad) 72%, black)"
    : "var(--warn)";
  const tinta = controlling ? "oklch(1 0 0)" : "var(--brand-ink)";

  return (
    <>
      {/* Awareness banner — amber while watched, red while support is controlling. */}
      <div
        className="fixed inset-x-0 top-0 z-[100000] flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-3 py-1.5 text-center text-xs font-semibold"
        role="status"
        style={{
          paddingTop: "max(6px, env(safe-area-inset-top))",
          background: fondo,
          color: tinta,
          boxShadow: "var(--lift-2)",
        }}
      >
        {/* El punto va del color de la TINTA, no blanco: sobre el ámbar un punto
            blanco casi desaparece. */}
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
            style={{ background: tinta }}
          />
          <span
            className="relative inline-flex h-2.5 w-2.5 rounded-full"
            style={{ background: tinta }}
          />
        </span>
        {controlling ? (
          <Hand className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Eye className="h-3.5 w-3.5 shrink-0" />
        )}
        {controlling
          ? `Soporte (${controller}) está controlando tu pantalla.`
          : `Soporte (${watchedBy}) está viendo tu sesión en vivo para ayudarte.`}
        {controlling && (
          <button
            className="cg-focus ml-2 inline-flex min-h-8 shrink-0 items-center rounded-full px-3 py-0.5 text-[11px] font-bold transition-[filter] hover:brightness-95"
            style={{ background: tinta, color: fondo }}
            onClick={reclaimControl}
          >
            Recuperar control
          </button>
        )}
      </div>

      {/* Support's live cursor. */}
      {cursor.visible && (
        <div
          className="pointer-events-none fixed z-[100001] flex items-center gap-1"
          style={{
            left: cursor.x,
            top: cursor.y,
            transform: "translate(-2px, -2px)",
          }}
        >
          <MousePointer2
            className="h-5 w-5 drop-shadow"
            style={{ fill: "var(--warn)", color: "var(--warn-text)" }}
          />
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-bold"
            style={{
              background: "var(--warn)",
              color: "var(--brand-ink)",
              boxShadow: "var(--lift-2)",
            }}
          >
            Soporte
          </span>
        </div>
      )}
    </>
  );
}
