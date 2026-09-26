import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Mic,
  Loader2,
  Users,
  Radio,
  LogOut,
  Volume2,
  RefreshCw,
} from "lucide-react";

import { radioDenied, playTalkPermit, playRoger } from "@/lib/radioTones";
import { useAuth } from "@/contexts/AuthContext";
import {
  subscribeRadio,
  getRadioSnapshot,
  setRadioSelf,
  setRadioOn,
  setRadioChannel,
  radioStartTalk,
  radioStopTalk,
  radioResume,
} from "@/lib/radioVoiceManager";
import {
  radioChannelService,
  type MiCanal,
} from "@/lib/api/radioChannelService";

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
  const {
    state,
    joined,
    roster,
    speaker,
    talking,
    hint,
    channel,
    channelName,
  } = snap;

  /* MIS canales, no todos. El backend ya filtra por pertenencia, así que esta
     lista es exactamente aquello a lo que este usuario puede entrar. */
  const [canales, setCanales] = useState<MiCanal[]>([]);

  const cargarCanales = useCallback(async () => {
    try {
      const r = await radioChannelService.mine();

      setCanales(r.rows);
      // Si el canal recordado ya no existe (lo borraron, o se le quitó el
      // acceso), se cae al predeterminado en vez de fallar al conectar.
      const sigue = r.rows.some((c) => c.key === channel);

      if (!sigue) {
        const destino =
          r.rows.find((c) => c.key === r.defaultChannel) || r.rows[0];

        if (destino) setRadioChannel(destino.key, destino.name);
      } else {
        const actual = r.rows.find((c) => c.key === channel);

        if (actual && actual.name !== channelName)
          setRadioChannel(actual.key, actual.name);
      }
    } catch {
      /* sin lista se sigue con el canal recordado: la radio no puede caerse
         porque el catálogo no cargue */
    }
    // `channel`/`channelName` se leen dentro a propósito y NO van en las
    // dependencias: incluirlos re-dispararía la carga en cada cambio de canal.
  }, []);

  useEffect(() => {
    cargarCanales();
  }, [cargarCanales]);
  const busy = state === "connecting" && !joined;
  const [localHint, setLocalHint] = useState<string | null>(null);
  const pressedRef = useRef(false);

  useEffect(() => {
    setRadioSelf(myId);
  }, [myId]);

  const join = () => {
    setRadioSelf(myId);
    radioResume();
    setRadioOn(true);
  };
  const leave = () => {
    setRadioOn(false);
  };

  const someoneElseTalking = !!speaker && speaker.userId !== myId;

  /** ¿La pulsación que se está soltando llegó a abrir el micrófono? */
  const transmitiRef = useRef(false);

  const beginTalk = async () => {
    const r = await radioStartTalk();

    if (!pressedRef.current) {
      radioStopTalk();

      return;
    } // released mid-acquire
    if (r?.ok) {
      transmitiRef.current = true;
      playTalkPermit();

      return;
    }
    transmitiRef.current = false;
    radioDenied();
    if (r?.error && r.error !== "off") setLocalHint(r.error);
  };
  // ── EL CANAL ES DE UNO SOLO ──────────────────────────────────────────────
  // Con alguien en el aire el botón REBOTA (zumbido grave) y no se transmite,
  // como en un equipo de mano. Antes se hablaba encima: LiveKit mezcla el
  // audio, así que salían dos voces a la vez y no se entendía ninguna.
  // El seguro contra un hablante ATASCADO —el fallo por el que esto se quitó en
  // su día— vive en el motor, que revalida contra la sala cada 2 s.
  const onPttDown = (e: React.PointerEvent) => {
    if (someoneElseTalking) {
      radioDenied();
      setLocalHint(
        `${speaker?.name || t("ui.radio.alguien", "Alguien")} ${t("ui.radio.estaHablando", "está hablando")}`,
      );

      return;
    }
    try {
      (e.currentTarget as any).setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    pressedRef.current = true;
    setLocalHint(null);
    radioResume();
    void beginTalk();
  };
  const onPttUp = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as any).releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    pressedRef.current = false;
    radioStopTalk();
    // El «terminé» sólo si de verdad se transmitió: sonarlo tras un rebote
    // diría que se envió algo que nadie oyó.
    if (transmitiRef.current) {
      transmitiRef.current = false;
      playRoger();
    }
  };

  const shownHint = hint || localHint;

  return (
    // Mismo lenguaje de color que `RadioVoiceWidget` — es el MISMO canal visto
    // desde otro sitio: acento para «en marcha», `--bad` fijo para «al aire».
    <div className="glass p-4">
      <div className="mb-3 flex items-center gap-2">
        <Radio size={16} style={{ color: "var(--brand-text)" }} />
        <h2 className="flex-1 text-sm font-semibold">
          {t("ui.RadioLiveChannelPanel.canalAbiertoVozEnVivo")}
        </h2>
        {joined && (
          <span
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
            style={{
              background: "var(--glass-sunken)",
              color: "var(--ink-soft)",
            }}
          >
            <Users size={12} /> {roster.length}
          </span>
        )}
      </div>

      {/* ── EL CANAL ─────────────────────────────────────────────────────────
          Con un solo canal esto no aparece: sería un desplegable de una opción
          en la pantalla más ocupada del despacho. En cuanto hay dos, cambiar de
          canal RECONECTA (una conexión de LiveKit vive en una sola sala), y por
          eso se avisa con el punto de estado en vez de fingir que es instantáneo. */}
      {canales.length > 1 && (
        <div className="mb-3 flex items-center gap-2">
          <select
            className="cg-input h-9 min-w-0 flex-1 px-2 text-sm"
            value={channel}
            onChange={(e) => {
              const c = canales.find((x) => x.key === e.target.value);

              if (c) setRadioChannel(c.key, c.name);
            }}
          >
            {canales.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
                {c.online
                  ? ` · ${t("ui.RadioLiveChannelPanel.nEnLinea", {
                      defaultValue: "{{count}} en línea",
                      count: c.online,
                    })}`
                  : ""}
                {c.isDefault
                  ? ` · ${t("ui.RadioLiveChannelPanel.predeterminado", "predeterminado")}`
                  : ""}
              </option>
            ))}
          </select>
          <button
            className="cg-btn-glass cg-focus rounded-lg px-2.5 py-2 text-[11px]"
            title={t(
              "ui.RadioLiveChannelPanel.actualizarCanales",
              "Actualizar canales",
            )}
            type="button"
            onClick={cargarCanales}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      )}
      {canales.length === 1 && (
        <p className="mb-3 text-[11px]" style={{ color: "var(--ink-soft)" }}>
          {channelName}
        </p>
      )}

      {!joined ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Volume2 size={28} style={{ color: "var(--ink-faint)" }} />
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            {t(
              "ui.RadioLiveChannelPanel.uneteParaEscucharYHablar",
              "Únete para escuchar y hablar con los vigilantes en tiempo real (push-to-talk).",
            )}
          </p>
          <button
            className="cg-btn-brand cg-focus flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-[filter] hover:brightness-105 disabled:opacity-50"
            disabled={busy}
            onClick={join}
          >
            {busy ? (
              <Loader2 className="animate-spin" size={15} />
            ) : (
              <Radio size={15} />
            )}{" "}
            {t("ui.RadioLiveChannelPanel.unirseAlCanal", "Unirse al canal")}
          </button>
          {shownHint && (
            <p className="text-[11px]" style={{ color: "var(--bad-text)" }}>
              {shownHint}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div
            className="rounded-lg px-3 py-2 text-center text-sm font-semibold"
            style={
              speaker
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
            {speaker
              ? speaker.userId === myId
                ? t("ui.RadioLiveChannelPanel.estasHablando", "Estás hablando…")
                : t("ui.RadioLiveChannelPanel.nombreEstaHablando", {
                    defaultValue: "{{name}} está hablando…",
                    name: speaker.name,
                  })
              : state === "connected"
                ? t("ui.RadioLiveChannelPanel.canalLibre", "Canal libre")
                : t("ui.RadioLiveChannelPanel.conectando", "Conectando…")}
          </div>

          <div className="flex items-center justify-center gap-3 py-1">
            <button
              className="cg-focus flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold transition-[filter] hover:brightness-105"
              style={
                {
                  touchAction: "none",
                  WebkitUserSelect: "none",
                  userSelect: "none",
                  ...(talking
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
              {talking
                ? t("ui.RadioLiveChannelPanel.transmitiendo", "Transmitiendo…")
                : t("ui.RadioLiveChannelPanel.mantenParaHablar", "Mantén para hablar")}
            </button>
            <button
              className="cg-btn-glass cg-focus rounded-lg p-2.5"
              title={t("ui.RadioLiveChannelPanel.salirDelCanal")}
              onClick={leave}
            >
              <LogOut size={16} />
            </button>
          </div>

          {roster.length > 0 && (
            <div
              className="divide-y rounded-lg border"
              style={{ borderColor: "var(--hairline)" }}
            >
              {roster.map((m) => (
                <div
                  key={m.userId}
                  className="flex items-center gap-2 px-3 py-2 text-sm"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  <span
                    className={
                      speaker?.userId === m.userId
                        ? "cc-dot"
                        : "h-2 w-2 rounded-full"
                    }
                    style={{
                      background:
                        speaker?.userId === m.userId
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
                  {speaker?.userId === m.userId && (
                    <Mic size={13} style={{ color: "var(--brand-text)" }} />
                  )}
                </div>
              ))}
            </div>
          )}
          {someoneElseTalking && (
            <p
              className="text-center text-[11px]"
              style={{ color: "var(--ink-soft)" }}
            >
              {t("ui.RadioLiveChannelPanel.puedesHablarCuandoQuierasEl")}
            </p>
          )}
          {shownHint && (
            <p className="text-[11px]" style={{ color: "var(--bad-text)" }}>
              {shownHint}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
