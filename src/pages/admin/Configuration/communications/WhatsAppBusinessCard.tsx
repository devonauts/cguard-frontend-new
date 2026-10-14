import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Loader2,
  MessageCircle,
  Unplug,
  RefreshCw,
  KeyRound,
  FileText,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Section,
  StatusBadge,
  Field,
  Modal,
  SkeletonBlock,
} from "@/components/kit";
import i18n from "@/i18n";
import GuiaConectarWhatsApp from "@/components/vigia/GuiaConectarWhatsApp";
import { localeActual } from "@/lib/localeActual";
import {
  communicationService,
  WhatsAppStatus,
} from "@/lib/api/communicationService";

/**
 * Per-tenant WhatsApp Business connection via Meta Embedded Signup.
 * One button — no tokens, no IDs. The browser only sees the public app id +
 * config id; the one-time auth code is exchanged server-side.
 */

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

const FB_SDK_ID = "facebook-jssdk";
const FB_SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";
const FB_ORIGINS = ["https://www.facebook.com", "https://web.facebook.com"];

let fbSdkPromise: Promise<void> | null = null;

/** Inject the Facebook JS SDK once, then (re)init with the platform app. */
async function loadFacebookSdk(appId: string, graphVersion: string) {
  if (!window.FB) {
    if (!fbSdkPromise) {
      fbSdkPromise = new Promise<void>((resolve, reject) => {
        window.fbAsyncInit = () => resolve();
        if (document.getElementById(FB_SDK_ID)) {
          // Script tag already present (e.g. previous failed init) — wait for it.
          if (window.FB) resolve();

          return;
        }
        const script = document.createElement("script");

        script.id = FB_SDK_ID;
        script.src = FB_SDK_SRC;
        script.async = true;
        script.defer = true;
        script.crossOrigin = "anonymous";
        script.onerror = () => {
          fbSdkPromise = null;
          script.remove();
          reject(
            new Error(
              i18n.t("ui.WhatsAppBusinessCard.noSePudoCargarElSdkDeMeta", {
                defaultValue:
                  "No se pudo cargar el SDK de Meta. Revisa tu conexión o bloqueadores de anuncios.",
              }),
            ),
          );
        };
        document.head.appendChild(script);
      });
    }
    await fbSdkPromise;
  }
  // Safe to call repeatedly; keeps appId/version fresh on reconnect.
  window.FB.init({
    appId,
    autoLogAppEvents: true,
    xfbml: false,
    version: graphVersion || "v21.0",
  });

  return window.FB;
}

/** Humanize Meta messaging limit tiers. */
function messagingLimitLabel(limit?: string | null): string {
  if (!limit) return "—";
  const tiers: Record<string, number> = {
    TIER_50: 50,
    TIER_250: 250,
    TIER_1K: 1000,
    TIER_10K: 10000,
    TIER_100K: 100000,
  };
  const key = limit.toUpperCase();

  if (key === "TIER_UNLIMITED" || key === "UNLIMITED")
    return i18n.t("ui.WhatsAppBusinessCard.ilimitado", {
      defaultValue: "Ilimitado",
    });
  const n = tiers[key];

  if (n == null) return limit;

  return i18n.t("ui.WhatsAppBusinessCard.nPorDia", {
    defaultValue: "{{n}}/día",
    n: new Intl.NumberFormat(localeActual()).format(n),
  });
}

/** Calidad de la cuenta según Meta → tono del sistema (nunca el acento). */
function qualityTone(
  rating?: string | null,
): "ok" | "warn" | "bad" | "neutral" {
  const r = (rating || "").toUpperCase();

  if (r === "GREEN" || r === "HIGH") return "ok";
  if (r === "YELLOW" || r === "MEDIUM") return "warn";
  if (r === "RED" || r === "LOW") return "bad";

  return "neutral";
}

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return String(value);

  return d.toLocaleString(localeActual(), {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function WhatsAppBusinessCard() {
  const { t } = useTranslation();

  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [activando, setActivando] = useState(false);
  const [plantillasOcupado, setPlantillasOcupado] = useState<
    "" | "crear" | "actualizar"
  >("");

  // waba/phone ids captured from the Embedded Signup postMessage session info.
  const sessionInfoRef = useRef<{ wabaId?: string; phoneNumberId?: string }>(
    {},
  );
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    communicationService
      .whatsappStatus()
      .then((s) => {
        if (mountedRef.current) setStatus(s);
      })
      .catch((e: any) => {
        toast.error(
          e?.data?.message ||
            e?.message ||
            t("comms.wa.statusError", {
              defaultValue: "No se pudo cargar el estado de WhatsApp Business",
            }),
        );
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const qualityLabels: Record<string, string> = {
    ok: t("comms.wa.qualityHigh", { defaultValue: "Alta" }),
    warn: t("comms.wa.qualityMedium", { defaultValue: "Media" }),
    bad: t("comms.wa.qualityLow", { defaultValue: "Baja" }),
  };

  const onConnect = async () => {
    const embedded = status?.embedded;

    if (!embedded?.configured || !embedded.appId || !embedded.configId) {
      toast.error(
        t("comms.wa.notConfigured", {
          defaultValue:
            "La plataforma aún no tiene configurada la app de Meta (contacta a soporte).",
        }),
      );

      return;
    }
    setConnecting(true);
    sessionInfoRef.current = {};

    // Listen for the Embedded Signup session info BEFORE opening the popup.
    const onMessage = (event: MessageEvent) => {
      if (!FB_ORIGINS.includes(event.origin)) return;
      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;

        if (!data || data.type !== "WA_EMBEDDED_SIGNUP") return;
        if (data.event === "FINISH" || data.event === "FINISH_ONLY_WABA") {
          sessionInfoRef.current = {
            wabaId: data.data?.waba_id || undefined,
            phoneNumberId: data.data?.phone_number_id || undefined,
          };
        }
      } catch {
        // Non-JSON messages from facebook.com are irrelevant — ignore.
      }
    };

    window.addEventListener("message", onMessage);

    try {
      const FB = await loadFacebookSdk(embedded.appId, embedded.graphVersion);

      const response: any = await new Promise((resolve) => {
        FB.login((res: any) => resolve(res), {
          config_id: embedded.configId,
          response_type: "code",
          override_default_response_type: true,
          extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
        });
      });

      const code = response?.authResponse?.code;

      if (!code) {
        // Popup closed, login cancelled, or popup blocked by the browser.
        toast.info(
          t("comms.wa.cancelled", {
            defaultValue:
              "Conexión cancelada. Si no viste la ventana de Meta, permite ventanas emergentes para este sitio.",
          }),
        );

        return;
      }

      const fresh = await communicationService.whatsappCallback({
        code,
        wabaId: sessionInfoRef.current.wabaId ?? null,
        phoneNumberId: sessionInfoRef.current.phoneNumberId ?? null,
      });

      if (mountedRef.current) setStatus(fresh);
      toast.success(
        t("comms.wa.connected", { defaultValue: "WhatsApp conectado" }),
      );
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("comms.wa.connectError", {
            defaultValue: "No se pudo conectar WhatsApp. Inténtalo de nuevo.",
          }),
      );
    } finally {
      window.removeEventListener("message", onMessage);
      if (mountedRef.current) setConnecting(false);
    }
  };

  const onDisconnect = async () => {
    setDisconnecting(true);
    try {
      const fresh = await communicationService.whatsappDisconnect();

      if (mountedRef.current) setStatus(fresh);
      setConfirmOpen(false);
      toast.success(
        t("comms.wa.disconnected", { defaultValue: "WhatsApp desconectado" }),
      );
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("comms.wa.disconnectError", {
            defaultValue: "No se pudo desconectar WhatsApp",
          }),
      );
    } finally {
      if (mountedRef.current) setDisconnecting(false);
    }
  };

  const recargarEstado = async () => {
    const fresh = await communicationService.whatsappStatus();

    if (mountedRef.current) setStatus(fresh);

    return fresh;
  };

  /* Último paso de Meta: registrar el número con el PIN de la verificación en
     dos pasos. Sin él, el número sale «conectado» pero ni envía ni recibe. */
  const onActivar = async () => {
    const limpio = pin.replace(/\D/g, "");

    if (limpio.length !== 6) {
      toast.error(
        t("comms.wa.pinSeisDigitos", {
          defaultValue: "El PIN tiene 6 dígitos.",
        }),
      );

      return;
    }
    setActivando(true);
    try {
      await communicationService.whatsappRegister(limpio);
      setPin("");
      await recargarEstado();
      toast.success(
        t("comms.wa.numeroActivado", {
          defaultValue: "Número activado: ya envía y recibe mensajes.",
        }),
      );
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("comms.wa.activarError", {
            defaultValue:
              "No se pudo activar el número. Revisa el PIN en el Administrador de WhatsApp de Meta.",
          }),
      );
    } finally {
      if (mountedRef.current) setActivando(false);
    }
  };

  const onCrearPlantillas = async () => {
    setPlantillasOcupado("crear");
    try {
      const r = await communicationService.whatsappDefaultTemplates();
      const fallidas = (r?.creadas || []).filter((x) => !x.ok);

      await recargarEstado();
      if (fallidas.length) {
        toast.warning(
          t("comms.wa.plantillasConFallos", {
            count: fallidas.length,
            nombres: fallidas.map((x) => x.nombre).join(", "),
            defaultValue:
              "Meta no dejó crear {{count}} plantilla(s): {{nombres}}. Las demás quedaron en revisión.",
          }),
        );
      } else {
        toast.success(
          t("comms.wa.plantillasCreadas", {
            defaultValue:
              "Plantillas enviadas a Meta. Suelen aprobarse en minutos; a veces tarda hasta un día.",
          }),
        );
      }
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("comms.wa.plantillasError", {
            defaultValue: "No se pudieron crear las plantillas.",
          }),
      );
    } finally {
      if (mountedRef.current) setPlantillasOcupado("");
    }
  };

  const onActualizarPlantillas = async () => {
    setPlantillasOcupado("actualizar");
    try {
      await communicationService.whatsappSyncTemplates();
      await recargarEstado();
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("comms.wa.plantillasError", {
            defaultValue: "No se pudieron crear las plantillas.",
          }),
      );
    } finally {
      if (mountedRef.current) setPlantillasOcupado("");
    }
  };

  const etiquetaPlantilla = (estado: string | null) => {
    const e = String(estado || "").toUpperCase();

    if (e === "APPROVED")
      return {
        tono: "ok" as const,
        texto: t("comms.wa.plantillaAprobada", { defaultValue: "Aprobada" }),
      };
    if (e === "PENDING" || e === "IN_APPEAL")
      return {
        tono: "warn" as const,
        texto: t("comms.wa.plantillaEnRevision", {
          defaultValue: "En revisión",
        }),
      };
    if (e === "REJECTED" || e === "DISABLED" || e === "PAUSED")
      return {
        tono: "bad" as const,
        texto: t("comms.wa.plantillaRechazada", {
          defaultValue: "No aprobada",
        }),
      };

    return { tono: "neutral" as const, texto: e || "—" };
  };

  const configured = !!status?.embedded?.configured;
  const faltaActivar = !!status?.connected && !!status?.needsRegistration;
  const plantillas = status?.plantillas || [];
  const plantillasQueFaltan = status?.plantillasQueFaltan || [];
  const connected = !!status?.connected;
  const qTone = qualityTone(status?.qualityRating);

  return (
    <>
      <Section
        action={
          connected ? (
            <StatusBadge
              tone={
                status?.status === "error" ? "bad" : faltaActivar ? "warn" : "ok"
              }
            >
              {status?.status === "error"
                ? t("comms.wa.error", { defaultValue: "Con problemas" })
                : faltaActivar
                  ? t("comms.wa.faltaActivar", {
                      defaultValue: "Falta activar el número",
                    })
                  : t("comms.wa.connectedBadge", { defaultValue: "Conectado" })}
            </StatusBadge>
          ) : (
            <StatusBadge tone={configured ? "neutral" : "warn"}>
              {configured
                ? t("comms.wa.notConnectedBadge", {
                    defaultValue: "Sin conectar",
                  })
                : t("comms.wa.pendingBadge", {
                    defaultValue: "Pendiente de habilitar",
                  })}
            </StatusBadge>
          )
        }
        icon={<MessageCircle />}
        title={t("comms.wa.title", { defaultValue: "WhatsApp Business" })}
      >
        <div className="space-y-4">
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            {t("comms.wa.subtitle", {
              defaultValue: "Integración oficial de Meta",
            })}
          </p>

          {loading ? (
            <div className="space-y-3">
              <SkeletonBlock className="h-4 w-2/3" />
              <SkeletonBlock className="h-4 w-1/2" />
              <SkeletonBlock className="h-9 w-48" />
            </div>
          ) : !connected ? (
            <div className="space-y-4">
              <p className="text-sm">
                {t("comms.wa.pitch", {
                  defaultValue:
                    "Conecta el WhatsApp de tu empresa. Tus clientes siguen escribiendo a tu número actual — no hay que cambiar de número.",
                })}
              </p>
              <div className="flex flex-col items-start gap-2">
                <Button
                  disabled={connecting || !configured}
                  variant="brand"
                  onClick={onConnect}
                >
                  {connecting ? (
                    <Loader2 className="mr-2 animate-spin" size={16} />
                  ) : (
                    <MessageCircle className="mr-2" size={16} />
                  )}
                  {connecting
                    ? t("comms.wa.connecting", { defaultValue: "Conectando…" })
                    : t("comms.wa.connect", {
                        defaultValue: "Conectar WhatsApp",
                      })}
                </Button>
                {!configured && (
                  <p className="text-xs" style={{ color: "var(--warn-text)" }}>
                    {t("comms.wa.notConfigured", {
                      defaultValue:
                        "La plataforma aún no tiene configurada la app de Meta (contacta a soporte).",
                    })}
                  </p>
                )}
              </div>
              {/* Qué hace falta y qué pasa al pulsar: los requisitos y los pasos de Meta. */}
              <details className="glass-flat rounded-xl p-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  {t("vigiaPro.guiaWhatsApp.titulo")}
                </summary>
                <div className="mt-3">
                  <GuiaConectarWhatsApp />
                </div>
              </details>
            </div>
          ) : (
            <div className="space-y-5">
              {faltaActivar && (
                <div
                  className="glass-flat space-y-3 rounded-xl p-4"
                  style={{ borderLeft: "3px solid var(--warn)" }}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <KeyRound size={16} />
                    {t("comms.wa.activarTitulo", {
                      defaultValue: "Falta un paso: activar el número",
                    })}
                  </div>
                  <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                    {t("comms.wa.activarTexto", {
                      defaultValue:
                        "Meta tiene el número conectado pero todavía no activo: hasta activarlo no envía ni recibe mensajes. Escribe el PIN de 6 dígitos de la verificación en dos pasos (si el número no tenía uno, este quedará como su PIN). Al activarlo, el número deja de funcionar en la app de WhatsApp del teléfono.",
                    })}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      aria-label={t("comms.wa.pin", { defaultValue: "PIN" })}
                      autoComplete="one-time-code"
                      className="w-36 tracking-[0.3em]"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="••••••"
                      type="password"
                      value={pin}
                      onChange={(e) =>
                        setPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onActivar();
                      }}
                    />
                    <Button
                      disabled={activando || pin.length !== 6}
                      size="sm"
                      variant="brand"
                      onClick={onActivar}
                    >
                      {activando ? (
                        <Loader2 className="mr-1.5 animate-spin" size={14} />
                      ) : (
                        <KeyRound className="mr-1.5" size={14} />
                      )}
                      {t("comms.wa.activar", { defaultValue: "Activar número" })}
                    </Button>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="glass-flat min-w-0 p-3">
                  <div className="cg-eyebrow mb-1.5">
                    {t("comms.wa.state", { defaultValue: "Estado" })}
                  </div>
                  <StatusBadge
                    tone={
                      status?.status === "error"
                        ? "bad"
                        : faltaActivar
                          ? "warn"
                          : "ok"
                    }
                  >
                    {status?.status === "error"
                      ? t("comms.wa.error", { defaultValue: "Con problemas" })
                      : faltaActivar
                        ? t("comms.wa.faltaActivar", {
                            defaultValue: "Falta activar el número",
                          })
                        : t("comms.wa.connectedBadge", {
                            defaultValue: "Conectado",
                          })}
                  </StatusBadge>
                </div>
                <Field
                  className="glass-flat p-3"
                  label={t("comms.wa.business", { defaultValue: "Empresa" })}
                  value={status?.businessName || status?.displayName || "—"}
                />
                <Field
                  className="glass-flat p-3"
                  label={t("comms.wa.phone", { defaultValue: "Teléfono" })}
                  value={status?.displayPhoneNumber || "—"}
                />
                <div className="glass-flat min-w-0 p-3">
                  <div className="cg-eyebrow mb-1.5">
                    {t("comms.wa.quality", { defaultValue: "Calidad" })}
                  </div>
                  <StatusBadge tone={qTone}>
                    {qualityLabels[qTone] || status?.qualityRating || "—"}
                  </StatusBadge>
                </div>
                <Field
                  className="glass-flat p-3"
                  label={t("comms.wa.messagingLimit", {
                    defaultValue: "Mensajes por día",
                  })}
                  value={messagingLimitLabel(status?.messagingLimit)}
                />
                <Field
                  className="glass-flat p-3"
                  label={t("comms.wa.connectedAt", {
                    defaultValue: "Conectado el",
                  })}
                  value={fmtDate(status?.connectedAt)}
                />
              </div>

              {/* Las plantillas: sin ellas aprobadas en SU cuenta, Meta no deja
                  que la plataforma inicie una conversación (avisos, alertas). */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <FileText size={16} />
                    {t("comms.wa.plantillasTitulo", {
                      defaultValue: "Plantillas de mensajes",
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {plantillasQueFaltan.length > 0 && (
                      <Button
                        disabled={!!plantillasOcupado}
                        size="sm"
                        variant="brand"
                        onClick={onCrearPlantillas}
                      >
                        {plantillasOcupado === "crear" && (
                          <Loader2 className="mr-1.5 animate-spin" size={14} />
                        )}
                        {t("comms.wa.crearPlantillas", {
                          count: plantillasQueFaltan.length,
                          defaultValue: "Crear plantillas ({{count}})",
                        })}
                      </Button>
                    )}
                    <Button
                      disabled={!!plantillasOcupado}
                      size="sm"
                      variant="outline"
                      onClick={onActualizarPlantillas}
                    >
                      {plantillasOcupado === "actualizar" ? (
                        <Loader2 className="mr-1.5 animate-spin" size={14} />
                      ) : (
                        <RefreshCw className="mr-1.5" size={14} />
                      )}
                      {t("comms.wa.actualizarPlantillas", {
                        defaultValue: "Actualizar estado",
                      })}
                    </Button>
                  </div>
                </div>
                <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                  {t("comms.wa.plantillasTexto", {
                    defaultValue:
                      "Meta sólo deja que la plataforma inicie una conversación (alertas de incidente, pánico, rondas, recordatorios) con plantillas aprobadas en tu cuenta. Las respuestas a quien te escribe no las necesitan durante 24 horas.",
                  })}
                </p>
                {plantillas.length ? (
                  <ul className="glass-flat divide-y rounded-xl" style={{ borderColor: "var(--hairline)" }}>
                    {plantillas.map((p) => {
                      const e = etiquetaPlantilla(p.estado);

                      return (
                        <li
                          key={`${p.nombre}-${p.idioma}`}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <span className="min-w-0 truncate font-mono text-xs">
                            {p.nombre}
                            <span style={{ color: "var(--ink-soft)" }}>
                              {" "}
                              · {p.idioma}
                            </span>
                          </span>
                          <StatusBadge tone={e.tono}>{e.texto}</StatusBadge>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm" style={{ color: "var(--warn-text)" }}>
                    {t("comms.wa.sinPlantillas", {
                      defaultValue:
                        "Tu cuenta aún no tiene plantillas: la plataforma no puede enviar avisos por WhatsApp hasta crearlas.",
                    })}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={connecting || disconnecting || !configured}
                  size="sm"
                  variant="outline"
                  onClick={onConnect}
                >
                  {connecting ? (
                    <Loader2 className="mr-1.5 animate-spin" size={14} />
                  ) : (
                    <RefreshCw className="mr-1.5" size={14} />
                  )}
                  {connecting
                    ? t("comms.wa.connecting", { defaultValue: "Conectando…" })
                    : t("comms.wa.reconnect", { defaultValue: "Reconectar" })}
                </Button>
                <Button
                  disabled={connecting || disconnecting}
                  size="sm"
                  style={{ color: "var(--bad-text)" }}
                  variant="ghost"
                  onClick={() => setConfirmOpen(true)}
                >
                  <Unplug className="mr-1.5" size={14} />
                  {t("comms.wa.disconnect", { defaultValue: "Desconectar" })}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Section>

      <Modal
        footer={
          <>
            <Button
              disabled={disconnecting}
              variant="outline"
              onClick={() => setConfirmOpen(false)}
            >
              {t("comms.wa.cancel", { defaultValue: "Cancelar" })}
            </Button>
            <Button
              disabled={disconnecting}
              variant="destructive"
              onClick={onDisconnect}
            >
              {disconnecting && (
                <Loader2 className="mr-2 animate-spin" size={16} />
              )}
              {t("comms.wa.disconnectConfirm", { defaultValue: "Desconectar" })}
            </Button>
          </>
        }
        icon={<Unplug />}
        open={confirmOpen}
        size="sm"
        title={t("comms.wa.disconnectTitle", {
          defaultValue: "¿Desconectar WhatsApp Business?",
        })}
        onOpenChange={(o) => !disconnecting && setConfirmOpen(o)}
      >
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          {t("comms.wa.disconnectDesc", {
            defaultValue:
              "La plataforma dejará de enviar mensajes de WhatsApp con tu número. Puedes volver a conectarlo cuando quieras — tu número y tu cuenta de Meta no se ven afectados.",
          })}
        </p>
      </Modal>
    </>
  );
}
