import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import {
  Radio,
  Mic,
  Users,
  X,
  Loader2,
  Volume2,
  Megaphone,
  Square,
} from "lucide-react";
import { toast } from "sonner";

import { radioDenied, playTalkPermit, playRoger } from "@/lib/radioTones";
import { usePuede } from "@/hooks/usePuede";
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
  encenderRadioYEsperar,
} from "@/lib/radioVoiceManager";
import {
  abrirPase,
  cerrarPase,
  subscribePase,
  getPaseSnapshot,
} from "@/lib/pasePopup";
import { useRadioRealtime } from "@/components/radio/RadioRealtimeProvider";

/**
 * Floating radio panel, opened from the header radio icon. One general channel
 * with an on/off switch — when on, the dispatcher listens and can push-to-talk,
 * and the channel keeps running (in the module singleton) across navigation even
 * after this panel is closed.
 */
export default function RadioVoiceWidget() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const myId = (user as any)?.id || (user as any)?._id;
  const snap = useSyncExternalStore(subscribeRadio, getRadioSnapshot);
  const pressedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Pase de novedades (roll call) — started from this same widget.
  const [paseBusy, setPaseBusy] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [pasePermitted, setPasePermitted] = useState<boolean | null>(null);
  const { puede: puedeVerConsola } = usePuede("radio.verConsola");

  const refreshPase = async () => {
    // A role without radio permission cannot run roll calls: say so without asking.
    if (!puedeVerConsola) {
      setPasePermitted(false);

      return;
    }
    try {
      // Silent: a 403 here only means «this role cannot run roll calls» (handled below).
      const c: any = await radioCheckService.getConsole({ silent: true });

      if (!mountedRef.current) return;
      setPasePermitted(true);
      setRunningId(c?.runningSessionId || null);
    } catch (e: any) {
      if (!mountedRef.current) return;
      if (e?.response?.status === 403 || e?.response?.status === 401)
        setPasePermitted(false);
    }
  };

  // El botón «Iniciar / Finalizar» tiene que decir la verdad EN VIVO. Sólo se
  // consultaba al abrir el panel: un pase terminado desde el panel en vivo, por
  // otro operador o por el servidor dejaba aquí «Finalizar pase» para siempre.
  // Ahora se vuelve a mirar con cada evento de radio y cuando el panel del pase
  // cambia de pase (o lo suelta).
  const { version: radioVersion } = useRadioRealtime();
  const paseSeguido = useSyncExternalStore(subscribePase, getPaseSnapshot);

  useEffect(() => {
    if (snap.open) refreshPase();
  }, [snap.open, radioVersion, paseSeguido.sessionId, puedeVerConsola]);

  const startPase = async () => {
    setPaseBusy(true);
    try {
      // Dentro del canal ANTES de iniciar: la central habla nada más arrancar.
      await encenderRadioYEsperar();
      const s: any = await radioCheckService.start("all");

      if (s?.id) abrirPase(s.id, { oculto: false });
      await refreshPase();
    } catch {
      toast.error(t("radio.paseStartError", "No se pudo iniciar el pase"));
    } finally {
      setPaseBusy(false);
    }
  };
  const endPase = async () => {
    if (!runningId) return;
    setPaseBusy(true);
    try {
      // Terminar, no cancelar: quien no contestó queda «sin respuesta» y el
      // reporte se escribe en el historial.
      await radioCheckService.finishSession(runningId);
      setRunningId(null);
      cerrarPase();
    } catch {
      toast.error(t("radio.paseEndError", "No se pudo finalizar el pase"));
    } finally {
      setPaseBusy(false);
    }
  };

  useEffect(() => {
    setRadioSelf(myId);
    restoreRadio();
    // The panel opens only from the header radio icon. It used to open by
    // itself on a browser's first visit, covering the header search and taking
    // the keystrokes meant for ⌘K.
  }, [myId]);

  const someoneElseTalking = !!snap.speaker && snap.speaker.userId !== myId;
  /** ¿La pulsación que se está soltando llegó a abrir el micrófono? */
  const transmitiRef = useRef(false);
  const connecting = snap.on && snap.state === "connecting";
  const live = snap.on && snap.joined;

  const toggleOn = () => {
    radioResume();
    setRadioOn(!snap.on);
  };

  // ── EL CANAL ES DE UNO SOLO ──────────────────────────────────────────────
  // Como en un equipo de mano: si ya hay alguien en el aire, el botón REBOTA
  // con el zumbido grave y no se transmite. Antes el CRM dejaba hablar encima
  // — LiveKit mezcla el audio, así que se oían dos voces a la vez y no se
  // entendía ninguna, y quien hablaba encima no tenía forma de saberlo.
  //
  // El seguro contra el fallo por el que esto se quitó en su día (un hablante
  // ATASCADO dejaba a todos sin transmitir) está en el motor: revalida al
  // hablante contra la sala cada 2 s y libera el canal solo.
  const onPttDown = async (e: React.PointerEvent) => {
    if (!live) return;
    if (someoneElseTalking) {
      radioDenied();
      toast.error(
        `${snap.speaker?.name || t("ui.radio.alguien", "Alguien")} ${t("ui.radio.estaHablando", "está hablando")}`,
      );

      return;
    }
    try {
      (e.currentTarget as any).setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    pressedRef.current = true;
    radioResume();
    const r = await radioStartTalk();

    if (!pressedRef.current) {
      radioStopTalk();

      return;
    }
    if (r?.ok) {
      transmitiRef.current = true;
      playTalkPermit();
    } else {
      transmitiRef.current = false;
      radioDenied();
    }
  };
  const onPttUp = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as any).releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    pressedRef.current = false;
    radioStopTalk();
    // El «terminé» sólo si de verdad se llegó a transmitir: sonarlo tras un
    // rebote diría que se envió algo que nadie oyó.
    if (transmitiRef.current) {
      transmitiRef.current = false;
      playRoger();
    }
  };

  if (!snap.open) return null;

  return (
    // `position: fixed` en línea: `.glass-raised` fija `relative` y glass.css va
    // sin `@layer`, así que gana a la utilidad `fixed` (ver su cabecera).
    <div
      data-flotante
      className="glass-raised fixed right-3 top-16 z-[80] max-h-[calc(100dvh-5rem)] w-80 max-w-[calc(100vw-1.5rem)] overflow-y-auto"
      style={{ position: "fixed" }}
      onPointerDown={() => radioResume()}
    >
      {/* Header + on/off switch */}
      <div
        className="flex items-center gap-2 border-b px-3 py-2.5"
        style={{ borderColor: "var(--hairline)" }}
      >
        {/* El icono en marcha lleva el ACENTO: «el canal está encendido» es un
            estado de la aplicación, no un semáforo — el ámbar suelto de antes no
            se enteraba del tono elegido. */}
        <Radio
          size={16}
          style={{ color: snap.on ? "var(--brand-text)" : "var(--ink-faint)" }}
        />
        <div className="min-w-0 flex-1">
          {/* El NOMBRE del canal en el que se está, no un rótulo fijo: desde
              que la empresa puede tener varios, «Canal general» mentía en
              cuanto el despachador cambiaba de canal en la pantalla de Radio. */}
          <p className="truncate text-sm font-semibold leading-tight">
            {snap.channelName ||
              t("ui.RadioVoiceWidget.canalGeneral", "Canal general")}
          </p>
          <p
            className="text-[11px] leading-tight"
            style={{ color: "var(--ink-soft)" }}
          >
            {snap.on
              ? live
                ? t(
                    "ui.RadioVoiceWidget.enVivoTodosPuedenHablar",
                    "En vivo · todos pueden hablar",
                  )
                : connecting
                  ? t("ui.RadioLiveChannelPanel.conectando", "Conectando…")
                  : t("ui.RadioVoiceWidget.sinConexion", "Sin conexión")
              : t("ui.RadioVoiceWidget.apagado", "Apagado")}
          </p>
        </div>
        {/* On/off switch */}
        <button
          aria-checked={snap.on}
          className="cg-focus relative h-6 w-11 shrink-0 rounded-full transition-colors"
          role="switch"
          style={{
            background: snap.on ? "var(--ok)" : "var(--glass-sunken)",
            border: "1px solid var(--hairline)",
          }}
          title={
            snap.on
              ? t("ui.RadioVoiceWidget.apagarCanal", "Apagar canal")
              : t("ui.RadioVoiceWidget.encenderCanal", "Encender canal")
          }
          onClick={toggleOn}
        >
          {/* La perilla es blanca a propósito: se desliza entre un verde de
              «encendido» y un hueco oscuro, y tiene que verse sobre los dos. */}
          <span
            className={`absolute top-0.5 rounded-full transition-all ${snap.on ? "left-[23px]" : "left-0.5"}`}
            style={{
              height: 18,
              width: 18,
              background: "oklch(1 0 0)",
              boxShadow: "var(--lift-1)",
            }}
          />
        </button>
        <button
          className="cg-focus grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors"
          style={{ color: "var(--ink-faint)" }}
          title={t("ui.MapPopup.cerrar", "Cerrar")}
          onClick={() => setWidgetOpen(false)}
        >
          <X size={16} />
        </button>
      </div>

      {!snap.on ? (
        <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
          <Volume2 size={26} style={{ color: "var(--ink-faint)" }} />
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            {t(
              "ui.RadioVoiceWidget.enciendeElCanalGeneral",
              "Enciende el canal general para escuchar y hablar con los vigilantes en tiempo real. Sigue activo aunque cierres esta ventana.",
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-3 p-3">
          {/* Who's talking */}
          <div
            className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold"
            style={
              snap.speaker
                ? {
                    background: "var(--brand-wash)",
                    color: "var(--brand-text)",
                    boxShadow: "inset 0 0 0 1px var(--brand-line)",
                  }
                : {
                    background: "var(--glass-sunken)",
                    color: "var(--ink-soft)",
                  }
            }
          >
            <span>
              {snap.speaker
                ? snap.speaker.userId === myId
                  ? t("ui.RadioLiveChannelPanel.estasHablando", "Estás hablando…")
                  : t("ui.RadioLiveChannelPanel.nombreEstaHablando", {
                      defaultValue: "{{name}} está hablando…",
                      name: snap.speaker.name,
                    })
                : live
                  ? t("ui.RadioLiveChannelPanel.canalLibre", "Canal libre")
                  : t("ui.RadioLiveChannelPanel.conectando", "Conectando…")}
            </span>
            <span className="flex items-center gap-1 text-[11px] font-normal">
              {connecting ? (
                <Loader2 className="animate-spin" size={12} />
              ) : (
                <Users size={12} />
              )}{" "}
              {snap.roster.length}
            </span>
          </div>

          {/* PTT — el rojo de «al aire» es `--bad`, fijo: transmitir en abierto es
              un estado que tiene que leerse igual con cualquier acento. */}
          <button
            className="cg-focus flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-[filter] hover:brightness-105 disabled:opacity-40"
            disabled={!live}
            style={
              {
                touchAction: "none",
                WebkitUserSelect: "none",
                userSelect: "none",
                ...(snap.talking
                  ? {
                      background: "var(--bad)",
                      color: "oklch(1 0 0)",
                      boxShadow:
                        "0 0 26px -6px color-mix(in oklab, var(--bad) 55%, transparent)",
                    }
                  : {
                      background: "var(--brand)",
                      color: "var(--brand-ink)",
                      boxShadow: "0 6px 20px -8px var(--brand-glow)",
                    }),
              } as any
            }
            onContextMenu={(e) => e.preventDefault()}
            onPointerCancel={onPttUp}
            onPointerDown={onPttDown}
            onPointerUp={onPttUp}
          >
            <Mic size={18} />{" "}
            {snap.talking
              ? t("ui.RadioLiveChannelPanel.transmitiendo", "Transmitiendo…")
              : t("ui.RadioLiveChannelPanel.mantenParaHablar", "Mantén para hablar")}
          </button>

          {snap.hint && (
            <p
              className="text-center text-[11px]"
              style={{ color: "var(--bad-text)" }}
            >
              {snap.hint}
            </p>
          )}

          {/* Roster */}
          {snap.roster.length > 0 && (
            <div
              className="max-h-40 divide-y overflow-y-auto rounded-lg border"
              style={{ borderColor: "var(--hairline)" }}
            >
              {snap.roster.map((m) => (
                <div
                  key={m.userId}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  <span
                    className={
                      snap.speaker?.userId === m.userId
                        ? "cc-dot"
                        : "h-2 w-2 rounded-full"
                    }
                    style={{
                      background:
                        snap.speaker?.userId === m.userId
                          ? "var(--brand)"
                          : "var(--ok)",
                    }}
                  />
                  <span className="flex-1 truncate">
                    {m.name}
                    {m.userId === myId
                      ? ` ${t("ui.RadioLiveChannelPanel.tu", "(tú)")}`
                      : ""}
                  </span>
                  {snap.speaker?.userId === m.userId && (
                    <Mic size={12} style={{ color: "var(--brand-text)" }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pase de novedades (roll call) — started from this same widget. */}
      {pasePermitted !== false && (
        <div
          className="border-t p-3"
          style={{ borderColor: "var(--hairline)" }}
        >
          {runningId ? (
            <button
              className="cg-focus flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold disabled:opacity-50"
              disabled={paseBusy}
              style={{
                borderColor: "color-mix(in oklab, var(--bad) 40%, transparent)",
                background: "color-mix(in oklab, var(--bad) 8%, transparent)",
                color: "var(--bad-text)",
              }}
              onClick={endPase}
            >
              {paseBusy ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Square size={16} />
              )}{" "}
              {t("ui.RadioVoiceWidget.finalizarPase", "Finalizar pase de novedades")}
            </button>
          ) : (
            <button
              className="cg-btn-glass cg-focus flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
              disabled={paseBusy}
              onClick={startPase}
            >
              {paseBusy ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Megaphone size={16} />
              )}{" "}
              {t("ui.RadioVoiceWidget.iniciarPase", "Iniciar pase de novedades")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
