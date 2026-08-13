import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Radio, Mic, Users, X, Loader2, Volume2, Megaphone, Square } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { radioCheckService } from "@/lib/api/radioCheckService";
import {
  subscribeRadio,
  getRadioSnapshot,
  setRadioOn,
  setRadioSelf,
  setWidgetOpen,
  restoreRadio,
  radioResume,
  radioStartTalk,
  radioStopTalk,
} from "@/lib/radioVoiceManager";

/**
 * Floating radio panel, opened from the header radio icon. One general channel
 * with an on/off switch — when on, the dispatcher listens and can push-to-talk,
 * and the channel keeps running (in the module singleton) across navigation even
 * after this panel is closed.
 */
export default function RadioVoiceWidget() {
  const { user } = useAuth();
  const myId = (user as any)?.id || (user as any)?._id;
  const snap = useSyncExternalStore(subscribeRadio, getRadioSnapshot);
  const pressedRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Pase de novedades (roll call) — started from this same widget.
  const [paseBusy, setPaseBusy] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [pasePermitted, setPasePermitted] = useState<boolean | null>(null);

  const refreshPase = async () => {
    try {
      const c: any = await radioCheckService.getConsole();
      if (!mountedRef.current) return;
      setPasePermitted(true);
      setRunningId(c?.runningSessionId || null);
    } catch (e: any) {
      if (!mountedRef.current) return;
      if (e?.response?.status === 403 || e?.response?.status === 401) setPasePermitted(false);
    }
  };
  useEffect(() => { if (snap.open) refreshPase(); }, [snap.open]);

  const startPase = async () => {
    setPaseBusy(true);
    try {
      await radioCheckService.start("all");
      toast.success("Pase de novedades iniciado");
      await refreshPase();
    } catch { toast.error("No se pudo iniciar el pase"); }
    finally { setPaseBusy(false); }
  };
  const endPase = async () => {
    if (!runningId) return;
    setPaseBusy(true);
    try { await radioCheckService.cancelSession(runningId); setRunningId(null); }
    catch { toast.error("No se pudo finalizar el pase"); }
    finally { setPaseBusy(false); }
  };

  useEffect(() => {
    setRadioSelf(myId);
    restoreRadio();
    // Open the panel once so the on/off switch is discoverable. After the user
    // sees/closes it, they reopen via the header radio icon.
    try {
      if (localStorage.getItem("radioWidgetSeen") !== "1") {
        setWidgetOpen(true);
        localStorage.setItem("radioWidgetSeen", "1");
      }
    } catch { /* ignore */ }
  }, [myId]);

  const someoneElseTalking = !!snap.speaker && snap.speaker.userId !== myId;
  const connecting = snap.on && snap.state === "connecting";
  const live = snap.on && snap.joined;

  const toggleOn = () => {
    radioResume();
    setRadioOn(!snap.on);
  };

  const onPttDown = async (e: React.PointerEvent) => {
    if (!live) return;
    try { (e.currentTarget as any).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    pressedRef.current = true;
    radioResume();
    const r = await radioStartTalk();
    if (!pressedRef.current) { radioStopTalk(); return; }
    void r;
  };
  const onPttUp = (e: React.PointerEvent) => {
    try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
    pressedRef.current = false;
    radioStopTalk();
  };

  if (!snap.open) return null;

  return (
    // `position: fixed` en línea: `.glass-raised` fija `relative` y glass.css va
    // sin `@layer`, así que gana a la utilidad `fixed` (ver su cabecera).
    <div
      onPointerDown={() => radioResume()}
      className="glass-raised fixed right-3 top-16 z-[80] w-80 max-w-[calc(100vw-1.5rem)]"
      style={{ position: "fixed" }}
    >
      {/* Header + on/off switch */}
      <div className="flex items-center gap-2 border-b px-3 py-2.5" style={{ borderColor: "var(--hairline)" }}>
        {/* El icono en marcha lleva el ACENTO: «el canal está encendido» es un
            estado de la aplicación, no un semáforo — el ámbar suelto de antes no
            se enteraba del tono elegido. */}
        <Radio size={16} style={{ color: snap.on ? "var(--brand-text)" : "var(--ink-faint)" }} />
        <div className="flex-1">
          <p className="text-sm font-semibold leading-tight">Canal general</p>
          <p className="text-[11px] leading-tight" style={{ color: "var(--ink-soft)" }}>
            {snap.on ? (live ? "En vivo · todos pueden hablar" : connecting ? "Conectando…" : "Sin conexión") : "Apagado"}
          </p>
        </div>
        {/* On/off switch */}
        <button
          role="switch"
          aria-checked={snap.on}
          onClick={toggleOn}
          title={snap.on ? "Apagar canal" : "Encender canal"}
          className="cg-focus relative h-6 w-11 shrink-0 rounded-full transition-colors"
          style={{ background: snap.on ? "var(--ok)" : "var(--glass-sunken)", border: "1px solid var(--hairline)" }}
        >
          {/* La perilla es blanca a propósito: se desliza entre un verde de
              «encendido» y un hueco oscuro, y tiene que verse sobre los dos. */}
          <span
            className={`absolute top-0.5 rounded-full transition-all ${snap.on ? "left-[23px]" : "left-0.5"}`}
            style={{ height: 18, width: 18, background: "oklch(1 0 0)", boxShadow: "var(--lift-1)" }}
          />
        </button>
        <button
          onClick={() => setWidgetOpen(false)}
          title="Cerrar"
          className="cg-focus grid h-7 w-7 place-items-center rounded-full transition-colors"
          style={{ color: "var(--ink-faint)" }}
        >
          <X size={16} />
        </button>
      </div>

      {!snap.on ? (
        <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
          <Volume2 size={26} style={{ color: "var(--ink-faint)" }} />
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            Enciende el canal general para escuchar y hablar con los vigilantes en tiempo real. Sigue activo aunque cierres esta ventana.
          </p>
        </div>
      ) : (
        <div className="space-y-3 p-3">
          {/* Who's talking */}
          <div
            className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold"
            style={snap.speaker
              ? { background: "var(--brand-wash)", color: "var(--brand-text)", boxShadow: "inset 0 0 0 1px var(--brand-line)" }
              : { background: "var(--glass-sunken)", color: "var(--ink-soft)" }}
          >
            <span>
              {snap.speaker
                ? `${snap.speaker.userId === myId ? "Estás hablando" : `${snap.speaker.name} está hablando`}…`
                : live ? "Canal libre" : "Conectando…"}
            </span>
            <span className="flex items-center gap-1 text-[11px] font-normal">
              {connecting ? <Loader2 size={12} className="animate-spin" /> : <Users size={12} />} {snap.roster.length}
            </span>
          </div>

          {/* PTT — el rojo de «al aire» es `--bad`, fijo: transmitir en abierto es
              un estado que tiene que leerse igual con cualquier acento. */}
          <button
            onPointerDown={onPttDown}
            onPointerUp={onPttUp}
            onPointerCancel={onPttUp}
            onContextMenu={(e) => e.preventDefault()}
            disabled={!live}
            style={{
              touchAction: "none",
              WebkitUserSelect: "none",
              userSelect: "none",
              ...(snap.talking
                ? { background: "var(--bad)", color: "oklch(1 0 0)", boxShadow: "0 0 26px -6px color-mix(in oklab, var(--bad) 55%, transparent)" }
                : { background: "var(--brand)", color: "var(--brand-ink)", boxShadow: "0 6px 20px -8px var(--brand-glow)" }),
            } as any}
            className="cg-focus flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-[filter] hover:brightness-105 disabled:opacity-40"
          >
            <Mic size={18} /> {snap.talking ? "Transmitiendo…" : "Mantén para hablar"}
          </button>

          {snap.hint && <p className="text-center text-[11px]" style={{ color: "var(--bad-text)" }}>{snap.hint}</p>}

          {/* Roster */}
          {snap.roster.length > 0 && (
            <div className="max-h-40 divide-y overflow-y-auto rounded-lg border" style={{ borderColor: "var(--hairline)" }}>
              {snap.roster.map((m) => (
                <div key={m.userId} className="flex items-center gap-2 px-3 py-1.5 text-xs" style={{ borderColor: "var(--hairline)" }}>
                  <span
                    className={snap.speaker?.userId === m.userId ? "cc-dot" : "h-2 w-2 rounded-full"}
                    style={{ background: snap.speaker?.userId === m.userId ? "var(--brand)" : "var(--ok)" }}
                  />
                  <span className="flex-1 truncate">{m.name}{m.userId === myId ? " (tú)" : ""}</span>
                  {snap.speaker?.userId === m.userId && <Mic size={12} style={{ color: "var(--brand-text)" }} />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pase de novedades (roll call) — started from this same widget. */}
      {pasePermitted !== false && (
        <div className="border-t p-3" style={{ borderColor: "var(--hairline)" }}>
          {runningId ? (
            <button
              onClick={endPase}
              disabled={paseBusy}
              className="cg-focus flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold disabled:opacity-50"
              style={{
                borderColor: "color-mix(in oklab, var(--bad) 40%, transparent)",
                background: "color-mix(in oklab, var(--bad) 8%, transparent)",
                color: "var(--bad-text)",
              }}
            >
              {paseBusy ? <Loader2 size={16} className="animate-spin" /> : <Square size={16} />} Finalizar pase de novedades
            </button>
          ) : (
            <button
              onClick={startPase}
              disabled={paseBusy}
              className="cg-btn-glass cg-focus flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {paseBusy ? <Loader2 size={16} className="animate-spin" /> : <Megaphone size={16} />} Iniciar pase de novedades
            </button>
          )}
        </div>
      )}
    </div>
  );
}
