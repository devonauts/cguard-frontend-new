import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Radio,
  Mic,
  Volume2,
  VolumeX,
  Loader2,
  CheckCircle2,
  Timer,
  Minimize2,
} from "lucide-react";
import { toast } from "sonner";

import MeterBar from "@/components/charts/MeterBar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { radioCheckService } from "@/lib/api/radioCheckService";
import { useFileUrl } from "@/lib/fileUrl";
import { radioDenied, playTalkPermit, playRoger } from "@/lib/radioTones";
import {
  subscribeRadio,
  getRadioSnapshot,
  setRadioSelf,
  setRadioVolume,
  encenderRadioYEsperar,
  radioResume,
  radioStartTalk,
  radioStopTalk,
} from "@/lib/radioVoiceManager";
import {
  subscribePase,
  getPaseSnapshot,
  abrirPase,
  ocultarPase,
  mostrarPase,
  cerrarPase,
  yaSeComprobo,
} from "@/lib/pasePopup";
import { useRadioRealtime } from "@/components/radio/RadioRealtimeProvider";

/**
 * EL PASE DE NOVEDADES, EN VIVO.
 *
 * Al iniciar un pase la central habla por el canal y los puestos tienen un
 * minuto para reportar. Este panel es lo que el operador mira mientras tanto:
 * oye lo mismo que oyen los puestos (es el canal en vivo, no una copia), ve la
 * cuenta atrás, ve entrar cada reporte según llega, contesta por radio a quien
 * reportó por voz y da el pase por terminado cuando ha acabado.
 *
 * Se monta en el layout, no en la página de Radio: el pase se puede iniciar
 * desde el widget flotante estando en cualquier pantalla. Qué pase se sigue
 * vive en `lib/pasePopup` (fuera de React) porque el layout se remonta al
 * navegar.
 */
export default function RadioPasePopup() {
  const pase = useSyncExternalStore(subscribePase, getPaseSnapshot);
  const { lastEvent } = useRadioRealtime();

  // Una vez por carga: ¿hay un pase en curso que este operador pueda seguir?
  // Cubre la recarga de la pestaña y al compañero que abre el CRM a mitad de
  // pase. Sin permiso de radio la consola responde 403 y no se enseña nada.
  useEffect(() => {
    if (yaSeComprobo()) return;
    radioCheckService
      .getConsole()
      .then((c: any) => {
        if (c?.runningSessionId)
          abrirPase(c.runningSessionId, { oculto: true });
        else cerrarPase();
      })
      .catch(() => {
        /* sin permiso o sin red: no hay panel */
      });
  }, []);

  // Un pase que arranca otro (el automático, o un compañero) entra recogido.
  useEffect(() => {
    if (lastEvent?.eventType !== "radio.session_started") return;
    const sid = lastEvent.payload?.sessionId;

    if (sid) abrirPase(sid, { oculto: true });
  }, [lastEvent]);

  if (!pase.sessionId) return null;

  return (
    <PaseEnCurso
      key={pase.sessionId}
      oculto={pase.oculto}
      sessionId={pase.sessionId}
    />
  );
}

const mmss = (seg: number) =>
  `${String(Math.floor(seg / 60)).padStart(2, "0")}:${String(seg % 60).padStart(2, "0")}`;

function PaseEnCurso({
  sessionId,
  oculto,
}: {
  sessionId: string;
  oculto: boolean;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const myId = (user as any)?.id || (user as any)?._id;
  const { version } = useRadioRealtime();
  const radio = useSyncExternalStore(subscribeRadio, getRadioSnapshot);

  const [session, setSession] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [openingText, setOpeningText] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [terminando, setTerminando] = useState(false);
  const [uniendo, setUniendo] = useState(false);

  // ── Los reportes de voz suenan SOLOS, de uno en uno ──────────────────────
  // `vistos` arranca con lo que ya había al abrir: recargar la pestaña no debe
  // volver a reproducir los audios de hace un minuto. Lo que llegue después
  // entra en la cola y suena en orden — dos puestos a la vez no se entienden.
  const vistos = useRef<Set<string> | null>(null);
  const [cola, setCola] = useState<string[]>([]);

  const cargar = useCallback(async () => {
    try {
      const d: any = await radioCheckService.getSession(sessionId);

      if (!d?.session) return;
      if (d.session.status !== "running") {
        // Lo terminó otro operador, se canceló, o venció el tope del servidor.
        cerrarPase();

        return;
      }
      const lista: any[] = d.entries || [];
      const conVoz = lista
        .filter((e) => e.status === "responded" && e.audioUrl)
        .map((e) => String(e.id));

      if (!vistos.current) vistos.current = new Set(conVoz);
      else {
        const nuevos = conVoz.filter((id) => !vistos.current!.has(id));

        if (nuevos.length) {
          nuevos.forEach((id) => vistos.current!.add(id));
          setCola((c) => [...c, ...nuevos]);
        }
      }
      setSession(d.session);
      setEntries(lista);
      setOpeningText(d.openingText || null);
    } catch (e: any) {
      if (e?.response?.status === 403 || e?.response?.status === 404)
        cerrarPase();
    }
  }, [sessionId]);

  // El websocket empuja cada reporte (`version` sube con cualquier `radio.*`);
  // el sondeo es sólo la red de seguridad por si el socket se cae a mitad.
  useEffect(() => {
    void cargar();
  }, [cargar, version]);
  useEffect(() => {
    const id = setInterval(() => void cargar(), oculto ? 15_000 : 5_000);

    return () => clearInterval(id);
  }, [cargar, oculto]);
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);

    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setRadioSelf(myId);
  }, [myId]);

  // Todos los puestos comparten el mismo plazo. Se toma de CUALQUIER entrada,
  // no sólo de las que siguen «llamando»: al vencer pasan a «sin respuesta» y
  // la cuenta debe quedarse en cero, no desaparecer.
  const deadlineMs = useMemo(
    () =>
      entries.reduce((max, e) => {
        const ms = e?.timeoutAt ? new Date(e.timeoutAt).getTime() : 0;

        return ms > max ? ms : max;
      }, 0),
    [entries],
  );
  const restante = deadlineMs
    ? Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000))
    : null;
  const enPlazo = (restante ?? 0) > 0;

  const llamados = entries.filter((e) => e.status !== "skipped");
  const total = llamados.length;
  const recibidos = llamados.filter((e) => e.status === "responded").length;
  const esperando = llamados.filter(
    (e) => e.status === "notified" || e.status === "pending",
  ).length;
  const sinRespuesta = llamados.filter(
    (e) => e.status === "no_response",
  ).length;

  // Primero lo que pide atención (voz e incidentes), luego el resto de
  // recibidos por orden de llegada, y al final quien aún no contesta.
  const ordenadas = useMemo(() => {
    const peso = (e: any) =>
      e.status === "responded"
        ? e.classification === "incident"
          ? 0
          : e.audioUrl
            ? 1
            : 2
        : e.status === "notified" || e.status === "pending"
          ? 3
          : 4;

    return [...llamados].sort(
      (a, b) =>
        peso(a) - peso(b) ||
        new Date(b.respondedAt || 0).getTime() -
          new Date(a.respondedAt || 0).getTime() ||
        (a.seq ?? 0) - (b.seq ?? 0),
    );
  }, [entries]);

  // ── Radio ────────────────────────────────────────────────────────────────
  const enCanal = radio.on && radio.joined;
  const hablante = radio.speaker;
  const otroHablando = !!hablante && hablante.userId !== myId;
  const pressedRef = useRef(false);
  const transmitiRef = useRef(false);

  const unirse = async () => {
    setUniendo(true);
    await encenderRadioYEsperar();
    setUniendo(false);
  };
  const onPttDown = async (e: React.PointerEvent) => {
    if (!enCanal) return;
    // El canal es de uno solo: con alguien en el aire el botón rebota.
    if (otroHablando) {
      radioDenied();

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
    if (!pressedRef.current) return;
    pressedRef.current = false;
    radioStopTalk();
    if (transmitiRef.current) {
      transmitiRef.current = false;
      playRoger();
    }
  };
  // Soltar el micrófono si el panel se recoge o se desmonta a media pulsación:
  // un canal de uno solo con el micro abierto deja mudo a todo el mundo.
  useEffect(() => {
    if (oculto && pressedRef.current) {
      pressedRef.current = false;
      radioStopTalk();
    }
  }, [oculto]);
  useEffect(
    () => () => {
      if (pressedRef.current) radioStopTalk();
    },
    [],
  );

  const terminar = async () => {
    setTerminando(true);
    try {
      await radioCheckService.finishSession(sessionId);
      toast.success(
        t(
          "ui.RadioPasePopup.paseTerminado",
          "Pase terminado. El reporte queda en «Pases recientes».",
        ),
      );
      cerrarPase();
    } catch (e: any) {
      toast.error(
        e?.response?.status === 403
          ? t(
              "ui.RadioPasePopup.sinPermisoParaTerminar",
              "No tienes permiso para terminar el pase.",
            )
          : t(
              "ui.RadioPasePopup.noSePudoTerminar",
              "No se pudo terminar el pase.",
            ),
      );
    } finally {
      setTerminando(false);
    }
  };

  if (!session) return null;

  const reloj =
    restante == null
      ? null
      : enPlazo
        ? mmss(restante)
        : t("ui.RadioPasePopup.tiempoAgotado", "Tiempo agotado");

  // ── Recogido: una pastilla que no estorba ────────────────────────────────
  if (oculto) {
    return (
      <button
        className="glass-raised cg-focus fixed left-1/2 top-16 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold shadow-lg"
        style={{ position: "fixed" }}
        type="button"
        onClick={mostrarPase}
      >
        <span className="cc-dot" style={{ background: "var(--brand)" }} />
        <Radio size={14} style={{ color: "var(--brand-text)" }} />
        {t("ui.RadioPasePopup.paseEnCurso", "Pase en curso")}
        {reloj && <span className="font-mono tabular-nums">· {reloj}</span>}
        <span style={{ color: "var(--ink-soft)" }}>
          · {recibidos}/{total}
        </span>
      </button>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto) ocultarPase();
      }}
    >
      <DialogContent
        className="max-w-2xl gap-4"
        showCloseButton={false}
        // Un clic fuera NO recoge el panel: a mitad de pase se pulsa de todo.
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDown={() => radioResume()}
      >
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex items-center gap-2">
                <Radio size={18} style={{ color: "var(--brand-text)" }} />
                {t("ui.RadioPasePopup.titulo", "Pase de novedades en curso")}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {restante == null
                  ? t(
                      "ui.RadioPasePopup.nadieEnTurno",
                      "No hay puestos con vigilante en turno en este pase.",
                    )
                  : enPlazo
                    ? t(
                        "ui.RadioPasePopup.subtituloEnPlazo",
                        "Los puestos tienen este tiempo para reportar.",
                      )
                    : t(
                        "ui.RadioPasePopup.subtituloFueraDePlazo",
                        "El tiempo de reporte terminó. Responde por radio lo que haga falta y termina el pase.",
                      )}
              </DialogDescription>
            </div>
            {reloj && (
              <span
                className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono text-xl font-bold tabular-nums"
                style={
                  enPlazo
                    ? {
                        background: "var(--brand-wash)",
                        color: "var(--brand-text)",
                        boxShadow: "inset 0 0 0 1px var(--brand-line)",
                      }
                    : {
                        background: "var(--glass-sunken)",
                        color: "var(--bad-text)",
                      }
                }
              >
                <Timer size={18} /> {reloj}
              </span>
            )}
          </div>
        </DialogHeader>

        {/* ── LO QUE SE OYE ─────────────────────────────────────────────── */}
        <div
          className="rounded-xl p-3.5"
          style={{ background: "var(--glass-sunken)" }}
        >
          <div className="flex items-center gap-3">
            <Ondas activo={enCanal && !!hablante} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {!enCanal
                  ? t(
                      "ui.RadioPasePopup.noEstasEscuchando",
                      "No estás escuchando el canal",
                    )
                  : hablante
                    ? hablante.userId === myId
                      ? t(
                          "ui.RadioPasePopup.estasTransmitiendo",
                          "Estás transmitiendo…",
                        )
                      : t("ui.RadioPasePopup.nombreAlAire", {
                          defaultValue: "{{name}} · al aire",
                          name: hablante.name,
                        })
                    : t("ui.RadioPasePopup.canalLibre", "Canal libre")}
              </p>
              <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                {t(
                  "ui.RadioPasePopup.asiLoReciben",
                  "Así lo están recibiendo los puestos: oyes el mismo canal que ellos.",
                )}
              </p>
            </div>
            {!enCanal && (
              <Button
                disabled={uniendo}
                size="sm"
                variant="brand"
                onClick={unirse}
              >
                {uniendo ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <Volume2 size={14} />
                )}{" "}
                {t("ui.RadioPasePopup.escucharElCanal", "Escuchar el canal")}
              </Button>
            )}
          </div>

          {openingText && (
            <p
              className="mt-3 border-l-2 pl-3 text-xs italic"
              style={{
                borderColor: "var(--brand-line)",
                color: "var(--ink-soft)",
              }}
            >
              «{openingText}»
            </p>
          )}

          <label className="mt-3 flex items-center gap-2.5 text-xs">
            {radio.volume === 0 ? (
              <VolumeX size={16} style={{ color: "var(--ink-soft)" }} />
            ) : (
              <Volume2 size={16} style={{ color: "var(--ink-soft)" }} />
            )}
            <span className="shrink-0" style={{ color: "var(--ink-soft)" }}>
              {t("ui.RadioPasePopup.volumen", "Volumen de lo que escuchas")}
            </span>
            <input
              className="h-1.5 min-w-0 flex-1 cursor-pointer"
              max={100}
              min={0}
              style={{ accentColor: "var(--brand)" }}
              type="range"
              value={Math.round(radio.volume * 100)}
              onChange={(e) => setRadioVolume(Number(e.target.value) / 100)}
            />
            <span className="w-9 text-right font-mono tabular-nums">
              {Math.round(radio.volume * 100)}%
            </span>
          </label>
        </div>

        {/* ── LOS REPORTES, SEGÚN LLEGAN ────────────────────────────────── */}
        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-semibold">
              {t("ui.RadioPasePopup.recibidos", {
                defaultValue: "{{n}} de {{total}} reportes recibidos",
                n: recibidos,
                total,
              })}
            </span>
            <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
              {t("ui.RadioPasePopup.esperandoYSinRespuesta", {
                defaultValue:
                  "{{esperando}} por reportar · {{sinRespuesta}} sin respuesta",
                esperando,
                sinRespuesta,
              })}
            </span>
          </div>
          <MeterBar
            height={8}
            pct={
              total ? Math.round(((recibidos + sinRespuesta) / total) * 100) : 0
            }
            tone={sinRespuesta ? "warn" : "brand"}
          />
          <div
            className="mt-3 max-h-[34dvh] divide-y overflow-y-auto rounded-xl border"
            style={{ borderColor: "var(--hairline)" }}
          >
            {ordenadas.map((e) => (
              <FilaDeReporte
                key={e.id}
                entrada={e}
                sonar={cola[0] === String(e.id)}
                volumen={radio.volume}
                onFinDeAudio={() =>
                  setCola((c) => c.filter((id) => id !== String(e.id)))
                }
              />
            ))}
            {!ordenadas.length && (
              <p
                className="p-4 text-center text-xs"
                style={{ color: "var(--ink-soft)" }}
              >
                {t(
                  "ui.RadioPasePopup.nadieEnTurno",
                  "No hay puestos con vigilante en turno en este pase.",
                )}
              </p>
            )}
          </div>
        </div>

        {/* ── RESPONDER POR RADIO Y TERMINAR ────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            className="cg-focus flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition-[filter] hover:brightness-105 disabled:opacity-50"
            disabled={!enCanal}
            style={
              {
                touchAction: "none",
                WebkitUserSelect: "none",
                userSelect: "none",
                ...(radio.talking
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
            title={
              enCanal
                ? undefined
                : t(
                    "ui.RadioPasePopup.uneteParaHablar",
                    "Escucha el canal para poder hablar",
                  )
            }
            type="button"
            onContextMenu={(e) => e.preventDefault()}
            onPointerCancel={onPttUp}
            onPointerDown={onPttDown}
            onPointerUp={onPttUp}
          >
            <Mic size={18} />
            {radio.talking
              ? t("ui.RadioPasePopup.transmitiendo", "Transmitiendo…")
              : otroHablando
                ? t("ui.RadioPasePopup.canalOcupado", "Canal ocupado")
                : t(
                    "ui.RadioPasePopup.mantenParaResponder",
                    "Mantén para responder por radio",
                  )}
          </button>
          <Button
            title={t(
              "ui.RadioPasePopup.ocultarTitulo",
              "Recoger el panel. El pase sigue en curso.",
            )}
            variant="outline"
            onClick={ocultarPase}
          >
            <Minimize2 size={15} /> {t("ui.RadioPasePopup.ocultar", "Ocultar")}
          </Button>
          <Button disabled={terminando} variant="brand" onClick={terminar}>
            {terminando ? (
              <Loader2 className="animate-spin" size={15} />
            ) : (
              <CheckCircle2 size={15} />
            )}{" "}
            {t("ui.RadioPasePopup.terminarPase", "Terminar pase")}
          </Button>
        </div>
        {enPlazo && esperando > 0 && (
          <p className="-mt-2 text-[11px]" style={{ color: "var(--ink-soft)" }}>
            {t(
              "ui.RadioPasePopup.avisoTerminarAntes",
              "Si terminas ahora, quien aún no reportó quedará como «sin respuesta».",
            )}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Barras que se mueven mientras hay alguien al aire. Decorativas. */
function Ondas({ activo }: { activo: boolean }) {
  return (
    <span
      aria-hidden
      className="flex h-9 w-11 shrink-0 items-center justify-center gap-[3px]"
    >
      {[0.55, 0.9, 0.7, 1, 0.6].map((alto, i) => (
        <span
          key={i}
          className={activo ? "cg-onda" : ""}
          style={{
            width: 4,
            height: `${Math.round(alto * 100)}%`,
            borderRadius: 9999,
            background: activo ? "var(--brand)" : "var(--ink-faint)",
            transform: activo ? undefined : "scaleY(0.25)",
            animationDelay: `${i * 110}ms`,
          }}
        />
      ))}
    </span>
  );
}

function FilaDeReporte({
  entrada: e,
  sonar,
  volumen,
  onFinDeAudio,
}: {
  entrada: any;
  sonar: boolean;
  volumen: number;
  onFinDeAudio: () => void;
}) {
  const { t } = useTranslation();
  const src = useFileUrl(e.audioUrl ?? null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volumen;
  }, [volumen, src]);
  // Suena sola cuando le toca. Si el navegador no deja (sin gesto previo), se
  // suelta el turno: el reproductor queda ahí para darle a mano.
  useEffect(() => {
    if (!sonar || !src || !audioRef.current) return;
    audioRef.current.play().catch(() => onFinDeAudio());
  }, [sonar, src]);

  const respondio = e.status === "responded";
  const esVoz = respondio && !!e.audioUrl;
  const estado = respondio
    ? e.classification === "incident"
      ? {
          txt: t("ui.RadioDispatch.class.incident", "Incidente"),
          bg: "color-mix(in oklab, var(--bad) 16%, transparent)",
          fg: "var(--bad-text)",
        }
      : esVoz
        ? {
            txt: t("ui.RadioPasePopup.reportoPorVoz", "Reportó por voz"),
            bg: "var(--brand-wash)",
            fg: "var(--brand-text)",
          }
        : e.classification === "novedad"
          ? {
              txt: t("ui.RadioDispatch.class.novedad", "Novedad"),
              bg: "color-mix(in oklab, var(--warn) 18%, transparent)",
              fg: "var(--warn-text, var(--ink))",
            }
          : {
              txt: t("ui.RadioDispatch.class.sin_novedad", "Sin novedad"),
              bg: "color-mix(in oklab, var(--ok) 16%, transparent)",
              fg: "var(--ok-text, var(--ok))",
            }
    : e.status === "no_response"
      ? {
          txt: t("ui.RadioDispatch.status.no_response", "Sin respuesta"),
          bg: "color-mix(in oklab, var(--bad) 12%, transparent)",
          fg: "var(--bad-text)",
        }
      : {
          txt: t("ui.RadioPasePopup.porReportar", "Por reportar…"),
          bg: "var(--glass-sunken)",
          fg: "var(--ink-soft)",
        };

  return (
    <div className="px-3 py-2.5" style={{ borderColor: "var(--hairline)" }}>
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {e.stationName || t("ui.RadioPasePopup.puesto", "Puesto")}
          </p>
          {e.guardName && (
            <p
              className="truncate text-xs"
              style={{ color: "var(--ink-soft)" }}
            >
              {e.guardName}
            </p>
          )}
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: estado.bg, color: estado.fg }}
        >
          {estado.txt}
        </span>
      </div>
      {esVoz && (
        <div className="mt-2 space-y-1.5">
          <audio
            ref={audioRef}
            controls
            className="h-8 w-full"
            preload="none"
            src={src || undefined}
            onEnded={onFinDeAudio}
            onError={onFinDeAudio}
          />
          {e.transcript ? (
            <p className="text-sm">{e.transcript}</p>
          ) : e.transcriptStatus === "pending" ? (
            <p className="text-xs italic" style={{ color: "var(--ink-soft)" }}>
              {t("ui.RadioDispatch.transcribiendo", "Transcribiendo…")}
            </p>
          ) : null}
        </div>
      )}
      {respondio &&
        !esVoz &&
        e.transcript &&
        e.classification !== "sin_novedad" && (
          <p className="mt-1.5 text-sm">{e.transcript}</p>
        )}
    </div>
  );
}
