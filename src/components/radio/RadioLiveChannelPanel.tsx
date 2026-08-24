import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from 'react-i18next';
import { Mic, Loader2, Users, Radio, LogOut, Volume2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  subscribeRadio,
  getRadioSnapshot,
  setRadioSelf,
  setRadioOn,
  radioStartTalk,
  radioStopTalk,
  radioResume,
} from "@/lib/radioVoiceManager";

/**
 * Dispatcher side of the open live channel (Canal abierto). This is a VIEW over
 * the shared radioVoiceManager singleton — the SAME connection the floating
 * widget uses. It must NOT open its own VoiceChannel: two LiveKit connections
 * with the same identity (userId) kick each other and cause an endless
 * connect→disconnect loop (the widget could never stay connected / talk). One
 * connection, two views — like the worker app's RadioContext model.
 */
export default function RadioLiveChannelPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const myId = (user as any)?.id || (user as any)?._id;

  const snap = useSyncExternalStore(subscribeRadio, getRadioSnapshot);
  const { state, joined, roster, speaker, talking, hint } = snap;
  const busy = state === "connecting" && !joined;
  const [localHint, setLocalHint] = useState<string | null>(null);
  const pressedRef = useRef(false);

  useEffect(() => { setRadioSelf(myId); }, [myId]);

  const join = () => { setRadioSelf(myId); radioResume(); setRadioOn(true); };
  const leave = () => { setRadioOn(false); };

  const someoneElseTalking = !!speaker && speaker.userId !== myId;

  const beginTalk = async () => {
    const r = await radioStartTalk();
    if (!pressedRef.current) { radioStopTalk(); return; } // released mid-acquire
    if (!r?.ok && r?.error && r.error !== "off") setLocalHint(r.error);
  };
  const onPttDown = (e: React.PointerEvent) => {
    try { (e.currentTarget as any).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    pressedRef.current = true;
    setLocalHint(null);
    radioResume();
    void beginTalk();
  };
  const onPttUp = (e: React.PointerEvent) => {
    try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
    pressedRef.current = false;
    radioStopTalk();
  };

  const shownHint = hint || localHint;

  return (
    // Mismo lenguaje de color que `RadioVoiceWidget` — es el MISMO canal visto
    // desde otro sitio: acento para «en marcha», `--bad` fijo para «al aire».
    <div className="glass p-4">
      <div className="mb-3 flex items-center gap-2">
        <Radio size={16} style={{ color: "var(--brand-text)" }} />
        <h2 className="flex-1 text-sm font-semibold">Canal abierto (voz en vivo)</h2>
        {joined && (
          <span
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
            style={{ background: "var(--glass-sunken)", color: "var(--ink-soft)" }}
          ><Users size={12} /> {roster.length}</span>
        )}
      </div>

      {!joined ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Volume2 size={28} style={{ color: "var(--ink-faint)" }} />
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>{t("ui.RadioLiveChannelPanel.uneteParaEscucharYHablar", "Únete para escuchar y hablar con los vigilantes en tiempo real (push-to-talk).")}</p>
          <button
            onClick={join}
            disabled={busy}
            className="cg-btn-brand cg-focus flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-[filter] hover:brightness-105 disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Radio size={15} />} Unirse al canal
          </button>
          {shownHint && <p className="text-[11px]" style={{ color: "var(--bad-text)" }}>{shownHint}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <div
            className="rounded-lg px-3 py-2 text-center text-sm font-semibold"
            style={speaker
              ? { background: "var(--brand-wash)", color: "var(--brand-text)", boxShadow: "inset 0 0 0 1px var(--brand-line)" }
              : { background: "var(--glass-sunken)", color: "var(--ink-soft)" }}
          >
            {speaker ? `${speaker.userId === myId ? "Estás hablando" : `${speaker.name} está hablando`}…` : (state === "connected" ? "Canal libre" : "Conectando…")}
          </div>

          <div className="flex items-center justify-center gap-3 py-1">
            <button
              onPointerDown={onPttDown}
              onPointerUp={onPttUp}
              onPointerCancel={onPttUp}
              onContextMenu={(e) => e.preventDefault()}
              style={{
                touchAction: "none",
                WebkitUserSelect: "none",
                userSelect: "none",
                ...(talking
                  ? { background: "var(--bad)", color: "oklch(1 0 0)", boxShadow: "0 0 26px -6px color-mix(in oklab, var(--bad) 55%, transparent)" }
                  : { background: "var(--brand)", color: "var(--brand-ink)", boxShadow: "0 6px 20px -8px var(--brand-glow)" }),
              } as any}
              className="cg-focus flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold transition-[filter] hover:brightness-105"
            >
              <Mic size={18} /> {talking ? "Transmitiendo…" : "Mantén para hablar"}
            </button>
            <button
              onClick={leave}
              className="cg-btn-glass cg-focus rounded-lg p-2.5"
              title="Salir del canal"
            ><LogOut size={16} /></button>
          </div>

          {roster.length > 0 && (
            <div className="divide-y rounded-lg border" style={{ borderColor: "var(--hairline)" }}>
              {roster.map((m) => (
                <div key={m.userId} className="flex items-center gap-2 px-3 py-2 text-sm" style={{ borderColor: "var(--hairline)" }}>
                  <span
                    className={speaker?.userId === m.userId ? "cc-dot" : "h-2 w-2 rounded-full"}
                    style={{ background: speaker?.userId === m.userId ? "var(--brand)" : "var(--ok)" }}
                  />
                  <span className="flex-1 truncate">{m.name}{m.userId === myId ? " (tú)" : ""}</span>
                  {speaker?.userId === m.userId && <Mic size={13} style={{ color: "var(--brand-text)" }} />}
                </div>
              ))}
            </div>
          )}
          {someoneElseTalking && <p className="text-center text-[11px]" style={{ color: "var(--ink-soft)" }}>Puedes hablar cuando quieras — el canal permite hablar encima.</p>}
          {shownHint && <p className="text-[11px]" style={{ color: "var(--bad-text)" }}>{shownHint}</p>}
        </div>
      )}
    </div>
  );
}
