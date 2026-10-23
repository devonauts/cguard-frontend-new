import type { Client } from "@/types/client";
import type { ReactNode } from "react";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Globe,
  Mail,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Smartphone,
  Users,
  ShieldCheck,
  KeyRound,
  ArrowRight,
  Building2,
  AlertTriangle,
  FileBarChart,
  ClipboardList,
  MapPin,
  Bell,
  Receipt,
} from "lucide-react";

import { clientDisplayName } from "@/lib/clientName";
import useScrollToTopOnMount from "@/hooks/useScrollToTopOnMount";
import { clientService } from "@/lib/api/clientService";
import { useAppInviteEnabled } from "@/hooks/useAppInviteEnabled";
import {
  Section,
  StatusBadge,
  Modal,
  EmptyState,
  GlassPanel,
  IconTile,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type Props = {
  client?: Client & {
    contactEmail?: string;
    contactName?: string;
    userId?: string;
  };
};
type Kind = "portal" | "app";

// Row from GET /client-account/:id/access-users (clientAccountAccessUsers.ts).
interface AccessUser {
  id: string;
  pivotId: string | null;
  userId: string | null;
  isTitular: boolean;
  name: string;
  email: string | null;
  role: string;
  status?: string;
}

/**
 * Los módulos que este cliente ve en su app.
 *
 * ANTES ERA UNA LISTA ESCRITA A MANO, sin un solo interruptor detrás: la
 * pestaña presentaba «¿Qué puede ver el cliente?» como si fuera configurable y
 * no lo era. Invitar a un cliente le abría de golpe la ubicación en vivo, las
 * fotos, las rondas, el inventario y la analítica — un condominio y un banco
 * recibían lo mismo.
 *
 * Las claves coinciden con las del backend (clientPortalSettingsService.ts).
 * El SOS no está aquí a propósito: es un botón de emergencia y no se apaga.
 */
const MODULOS: {
  key: string;
  icon: any;
  labelKey: string;
  label: string;
  descKey: string;
  desc: string;
}[] = [
  {
    key: "liveLocation",
    icon: MapPin,
    labelKey: "clients.portal.modules.liveLocation.label",
    label: "Ubicación en vivo",
    descKey: "clients.portal.modules.liveLocation.desc",
    desc: "Ver dónde están los vigilantes ahora, en el mapa",
  },
  {
    key: "attendance",
    icon: Users,
    labelKey: "clients.portal.modules.attendance.label",
    label: "Entradas y salidas",
    descKey: "clients.portal.modules.attendance.desc",
    desc: "Quién fichó en cada puesto y a qué hora",
  },
  {
    key: "incidents",
    icon: AlertTriangle,
    labelKey: "clients.portal.modules.incidents.label",
    label: "Incidentes",
    descKey: "clients.portal.modules.incidents.desc",
    desc: "Novedades reportadas en sus sedes",
  },
  {
    key: "rondas",
    icon: ClipboardList,
    labelKey: "clients.portal.modules.rondas.label",
    label: "Rondas",
    descKey: "clients.portal.modules.rondas.desc",
    desc: "Recorridos y puntos de control",
  },
  {
    key: "photos",
    icon: FileBarChart,
    labelKey: "clients.portal.modules.photos.label",
    label: "Fotos",
    descKey: "clients.portal.modules.photos.desc",
    desc: "Imágenes adjuntas a incidentes y rondas",
  },
  {
    key: "inventory",
    icon: ShieldCheck,
    labelKey: "clients.portal.modules.inventory.label",
    label: "Inventario",
    descKey: "clients.portal.modules.inventory.desc",
    desc: "Equipo asignado a sus puestos",
  },
  {
    key: "analytics",
    icon: FileBarChart,
    labelKey: "clients.portal.modules.analytics.label",
    label: "Analítica",
    descKey: "clients.portal.modules.analytics.desc",
    desc: "Panel de indicadores del servicio",
  },
  {
    key: "visitors",
    icon: Bell,
    labelKey: "clients.portal.modules.visitors.label",
    label: "Visitas",
    descKey: "clients.portal.modules.visitors.desc",
    desc: "Registro y pre-autorización de visitantes",
  },
  {
    key: "invoices",
    icon: Receipt,
    labelKey: "clients.portal.modules.invoices.label",
    label: "Facturas",
    descKey: "clients.portal.modules.invoices.desc",
    desc: "Facturas, estados de cuenta y revisión de horas. Requiere el módulo Facturación a clientes.",
  },
];

type Tono = "brand" | "neutral" | "ok" | "warn" | "bad" | "info";
const KPI_TONE: Record<string, Tono> = {
  primary: "brand",
  green: "ok",
  orange: "warn",
  blue: "info",
  slate: "neutral",
};

function Kpi({
  icon,
  value,
  label,
  accent = "primary",
}: {
  icon: ReactNode;
  value: ReactNode;
  label: string;
  accent?: string;
}) {
  return (
    <GlassPanel flat className="p-4">
      <IconTile className="mb-2" size="sm" tone={KPI_TONE[accent] ?? "brand"}>
        {icon}
      </IconTile>
      <div className="font-display truncate text-xl font-bold leading-tight">
        {value}
      </div>
      <div className="truncate text-xs" style={{ color: "var(--ink-soft)" }}>
        {label}
      </div>
    </GlassPanel>
  );
}

export default function ClientPortal({ client }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useScrollToTopOnMount(containerRef);

  const email = client?.email || client?.contactEmail || "";
  const name = clientDisplayName(
    client,
    client?.contactName || t("ui.ClientPortal.esteCliente", "este cliente"),
  );
  const linked = !!client?.userId;
  // Real access roster from /access-users (client.portalUsers never existed in
  // the backend — this card always said 0/1 while Accesos showed the truth).
  const [accessUsers, setAccessUsers] = useState<AccessUser[]>([]);

  useEffect(() => {
    let alive = true;

    if (!client?.id) return;
    clientService
      .getClientAccessUsers(client.id)
      .then((r) => {
        if (alive) setAccessUsers(Array.isArray(r) ? r : (r?.rows ?? []));
      })
      .catch(() => {
        /* keep empty */
      });

    return () => {
      alive = false;
    };
  }, [client?.id]);
  const accessCount = accessUsers.length || (linked ? 1 : 0);

  const [confirm, setConfirm] = useState<Kind | null>(null);
  const [sending, setSending] = useState(false);
  const appInviteEnabled = useAppInviteEnabled();
  const [result, setResult] = useState<{
    kind: Kind;
    recipient: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // ── Qué ve este cliente en su app ──────────────────────────────────────
  // Ausente = encendido, igual que en el backend: publicar esta pantalla no
  // puede apagarle a nadie algo que ya venía usando.
  const [portal, setPortal] = useState<Record<string, boolean>>(
    (client as any)?.portalSettings || {},
  );
  const [guardandoPortal, setGuardandoPortal] = useState(false);

  useEffect(() => {
    setPortal((client as any)?.portalSettings || {});
  }, [client]);

  /**
   * Se guarda al instante, sin botón. Son casillas independientes: un
   * «Guardar» aparte sólo añade la posibilidad de tocarlas y salirse sin
   * aplicarlas — y el fallo se nota enseguida, porque el cliente llama.
   */
  const togglePortal = async (key: string) => {
    if (!client?.id) return;
    const siguiente = { ...portal, [key]: portal[key] === false };

    setPortal(siguiente);
    setGuardandoPortal(true);
    try {
      // `updateClient` reenvía el input tal cual, así que un parcial basta: el
      // backend sanea `portalSettings` y no toca el resto de la ficha.
      await clientService.updateClient(String(client.id), {
        portalSettings: siguiente,
      } as any);
    } catch {
      setPortal(portal); // se revierte: la casilla no puede mentir sobre lo guardado
      toast.error(t("ui.ClientPortal.noSePudoGuardarIntentalo"));
    } finally {
      setGuardandoPortal(false);
    }
  };

  const send = async (kind: Kind) => {
    setSending(true);
    setErrorMsg("");
    try {
      const res =
        kind === "portal"
          ? await clientService.sendClientPortalInvitation(
              client?.id ?? "",
              email || undefined,
            )
          : await clientService.sendClientAppInvitation(
              client?.id ?? "",
              email || undefined,
            );

      setResult({ kind, recipient: res?.recipient || email });
      setConfirm(null);
      toast.success(
        kind === "portal"
          ? t(
              "ui.ClientPortal.invitacionPortalEnviada",
              "Invitación al portal enviada",
            )
          : t(
              "ui.ClientPortal.invitacionAppEnviada",
              "Invitación a la app enviada",
            ),
      );
    } catch (err: any) {
      setErrorMsg(
        err?.response?.data?.message ||
          err?.message ||
          t(
            "ui.ClientPortal.inviteSendError",
            "No se pudo enviar la invitación. Intenta de nuevo.",
          ),
      );
      setConfirm(null);
    } finally {
      setSending(false);
    }
  };

  const initial = (name || "?").charAt(0).toUpperCase();
  const kindLabel = useMemo(
    () =>
      confirm === "app"
        ? t("ui.ClientPortal.aLaAppMiSeguridad", "a la app Mi Seguridad")
        : t("ui.ClientPortal.alPortalDelCliente", "al portal del cliente"),
    [confirm, t],
  );

  return (
    <div ref={containerRef} className="space-y-4">
      {/* Status KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          accent={linked ? "green" : "slate"}
          icon={<Globe />}
          label={t("ui.ClientPortal.accesoAlPortal", "Acceso al portal")}
          value={
            linked
              ? t("ui.ClientPortal.vinculado", "Vinculado")
              : t("ui.ClientPortal.sinUsuario", "Sin usuario")
          }
        />
        <Kpi
          accent="blue"
          icon={<Users />}
          label={t("comun.usuariosConAcceso")}
          value={accessCount}
        />
        <Kpi
          accent="primary"
          icon={<Smartphone />}
          label={t(
            "ui.ClientPortal.appMovilDelCliente",
            "App móvil del cliente",
          )}
          value="Mi Seguridad"
        />
        <Kpi
          accent={email ? "green" : "orange"}
          icon={<Mail />}
          label={
            email ||
            t("ui.ClientPortal.agregaUnCorreo", "Agrega un correo al cliente")
          }
          value={
            email
              ? t("ui.ClientPortal.withEmail", "Con correo")
              : t("ui.ClientPortal.withoutEmail", "Sin correo")
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
        {/* LEFT — access + actions */}
        <div className="space-y-4">
          <Section
            icon={<KeyRound />}
            title={t("ui.ClientPortal.accesoAlPortalDelCliente")}
          >
            {/* Titular */}
            <div className="glass-sunken flex items-center gap-3 p-3">
              <div
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full border"
                style={{
                  background: "var(--brand)",
                  borderColor: "transparent",
                  color: "var(--brand-ink)",
                  boxShadow: "0 0 18px -6px var(--brand-glow)",
                }}
              >
                <span className="text-base font-semibold">{initial}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{name}</p>
                <p
                  className="truncate text-xs"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {email ||
                    t(
                      "ui.ClientPortal.noEmailAddress",
                      "Sin correo electrónico",
                    )}
                </p>
              </div>
              <StatusBadge tone={linked ? "ok" : "neutral"}>
                {linked
                  ? t("ui.ClientPortal.usuarioVinculado", "Usuario vinculado")
                  : t("ui.ClientPortal.sinUsuario", "Sin usuario")}
              </StatusBadge>
            </div>

            {/* Result / error banners */}
            {result && (
              <div
                className="mt-3 flex items-start gap-3 rounded-xl border p-3"
                style={{
                  background: "color-mix(in oklab, var(--ok) 12%, transparent)",
                  borderColor:
                    "color-mix(in oklab, var(--ok) 28%, transparent)",
                  color: "var(--ok-text)",
                }}
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="flex-1 text-sm">
                  <p className="font-semibold">
                    {t(
                      "ui.ClientPortal.invitacionEnviada",
                      "¡Invitación enviada!",
                    )}
                  </p>
                  <p>
                    {result.kind === "app"
                      ? t("ui.ClientPortal.seEnvioInvitacionApp", {
                          defaultValue:
                            "Se envió la invitación a la app a {{to}}",
                          to: result.recipient,
                        })
                      : t("ui.ClientPortal.seEnvioInvitacionPortal", {
                          defaultValue:
                            "Se envió la invitación al portal a {{to}}",
                          to: result.recipient,
                        })}
                    {t("ui.ClientPortal.elClienteDebeRevisarSu")}
                  </p>
                </div>
                <button
                  className="cg-focus rounded text-xs underline"
                  onClick={() => setResult(null)}
                >
                  {t("actions.close")}
                </button>
              </div>
            )}
            {errorMsg && (
              <div
                className="mt-3 flex items-start gap-3 rounded-xl border p-3"
                style={{
                  background:
                    "color-mix(in oklab, var(--bad) 12%, transparent)",
                  borderColor:
                    "color-mix(in oklab, var(--bad) 28%, transparent)",
                  color: "var(--bad-text)",
                }}
              >
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="flex-1 text-sm">
                  <p className="font-semibold">
                    {t("ui.ClientPortal.errorAlEnviar")}
                  </p>
                  <p>{errorMsg}</p>
                </div>
                <button
                  className="cg-focus rounded text-xs underline"
                  onClick={() => setErrorMsg("")}
                >
                  {t("actions.close")}
                </button>
              </div>
            )}

            {/* Actions */}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                disabled={!email && !linked}
                variant="brand"
                onClick={() => setConfirm("portal")}
              >
                <Mail className="mr-1.5 h-4 w-4" />{" "}
                {linked
                  ? t(
                      "ui.ClientPortal.resendPortalInvite",
                      "Reenviar invitación al portal",
                    )
                  : t(
                      "ui.ClientPortal.sendPortalInvite",
                      "Enviar invitación al portal",
                    )}
              </Button>
              {appInviteEnabled && (
                <Button
                  disabled={!email && !linked}
                  variant="outline"
                  onClick={() => setConfirm("app")}
                >
                  <Smartphone className="mr-1.5 h-4 w-4" />{" "}
                  {t("ui.ClientPortal.invitarALaAppMi")}
                </Button>
              )}
            </div>
            {!email && !linked && (
              <p className="mt-2 text-xs" style={{ color: "var(--warn-text)" }}>
                {t("ui.ClientPortal.esteClienteNoTieneCorreo")}
              </p>
            )}
          </Section>

          <Section
            action={
              <button
                className="cg-focus inline-flex items-center gap-1 rounded-md text-xs font-semibold hover:underline"
                style={{ color: "var(--brand-text)" }}
                onClick={() => navigate(`/clients/${client?.id}/user-access`)}
              >
                {t("ui.ClientPortal.gestionarAccesos", "Gestionar accesos")}{" "}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            }
            icon={<Users />}
            title={t("comun.usuariosConAcceso")}
          >
            {accessCount === 0 ? (
              <EmptyState
                description={t("ui.ClientPortal.invitaAlTitularOAgrega")}
                icon={<Users />}
                title={t("comun.sinUsuariosConAcceso")}
              />
            ) : (
              <div
                className="divide-y"
                style={{ borderColor: "var(--hairline)" }}
              >
                {/* /access-users already includes the titular — only fall back
                    to the linked-user row when the fetch returned nothing. */}
                {linked && accessUsers.length === 0 && (
                  <div className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-semibold"
                        style={{
                          background: "var(--brand-wash)",
                          borderColor: "var(--brand-line)",
                          color: "var(--brand-text)",
                        }}
                      >
                        {initial}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {name}
                        </div>
                        <div
                          className="truncate text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {email || "—"}
                        </div>
                      </div>
                    </div>
                    <StatusBadge className="shrink-0" dot={false} tone="ok">
                      {t("ui.ClientPortal.titular", "Titular")}
                    </StatusBadge>
                  </div>
                )}
                {accessUsers.map((u, i) => (
                  <div
                    key={u.id || i}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-semibold"
                        style={{
                          background: "var(--glass-sunken)",
                          borderColor: "var(--hairline)",
                        }}
                      >
                        {(u.name || u.email || "?").charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {u.name || u.email}
                        </div>
                        <div
                          className="truncate text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {u.email || ""}
                        </div>
                      </div>
                    </div>
                    <StatusBadge
                      className="shrink-0"
                      dot={false}
                      tone={
                        (u.status || "").toLowerCase().includes("activ")
                          ? "ok"
                          : "neutral"
                      }
                    >
                      {u.role ||
                        u.status ||
                        t("ui.ClientPortal.acceso", "Acceso")}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* RIGHT — what the client sees + how it works */}
        <div className="space-y-4">
          <Section
            icon={<Smartphone />}
            title={t(
              "ui.ClientPortal.quePuedeVerElCliente",
              "¿Qué puede ver el cliente?",
            )}
          >
            <div className="space-y-2.5">
              {MODULOS.map((f) => {
                const on = portal[f.key] !== false;
                const fLabel = t(f.labelKey, f.label);

                return (
                  <label
                    key={f.key}
                    className="flex cursor-pointer items-start gap-3"
                  >
                    <Checkbox
                      aria-label={fLabel}
                      checked={on}
                      className="mt-0.5"
                      disabled={guardandoPortal}
                      onCheckedChange={() => togglePortal(f.key)}
                    />
                    <IconTile size="sm">
                      <f.icon />
                    </IconTile>
                    <div>
                      <div className="text-sm font-medium">{fLabel}</div>
                      <div
                        className="text-xs"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {t(f.descKey, f.desc)}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </Section>

          <Section
            icon={<ShieldCheck />}
            title={t("ui.ClientPortal.comoFunciona", "¿Cómo funciona?")}
          >
            <ol className="space-y-2.5">
              {[
                t(
                  "ui.ClientPortal.paso1",
                  "Se envía un correo de invitación al cliente.",
                ),
                t(
                  "ui.ClientPortal.paso2",
                  "El cliente abre el enlace y crea su contraseña.",
                ),
                t(
                  "ui.ClientPortal.paso3",
                  "Inicia sesión en el portal web o en la app Mi Seguridad.",
                ),
                t(
                  "ui.ClientPortal.paso4",
                  "Accede en tiempo real a su operación de seguridad.",
                ),
              ].map((s, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold"
                    style={{
                      background: "var(--brand)",
                      color: "var(--brand-ink)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ color: "var(--ink-soft)" }}>{s}</span>
                </li>
              ))}
            </ol>
            <div
              className="glass-sunken mt-3 flex items-start gap-2 p-2.5 text-xs"
              style={{ color: "var(--ink-soft)" }}
            >
              <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />{" "}
              {t(
                "ui.ClientPortal.elAccesoMuestraUnicamente",
                "El acceso muestra únicamente la información de este cliente; nunca datos de otros clientes.",
              )}
            </div>
          </Section>
        </div>
      </div>

      {/* Confirm modal */}
      <Modal
        footer={
          <>
            <Button
              disabled={sending}
              variant="outline"
              onClick={() => setConfirm(null)}
            >
              {t("actions.cancel")}
            </Button>
            <Button
              disabled={sending}
              variant="brand"
              onClick={() => confirm && send(confirm)}
            >
              {sending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />{" "}
                  {t("ui.ClientPortal.enviando", "Enviando…")}
                </>
              ) : (
                t("ui.RouteForm.enviar", "Enviar")
              )}
            </Button>
          </>
        }
        icon={<Mail className="h-5 w-5" />}
        open={!!confirm}
        size="sm"
        title={t("ui.ClientPortal.enviarInvitacion", "Enviar invitación")}
        onOpenChange={(o) => {
          if (!o && !sending) setConfirm(null);
        }}
      >
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          {t(
            "ui.ClientPortal.seEnviaraUnaInvitacion",
            "Se enviará una invitación",
          )}{" "}
          <b>{kindLabel}</b> {t("ui.ClientPortal.aDosPuntos", "a:")}
        </p>
        <div className="glass-sunken mt-3 px-4 py-3 text-center">
          <p className="text-sm font-semibold">{name}</p>
          <p
            className="text-sm font-semibold"
            style={{ color: "var(--brand-text)" }}
          >
            {email ||
              t(
                "ui.ClientPortal.sinCorreoRegistrado",
                "(sin correo registrado)",
              )}
          </p>
        </div>
        <p className="mt-3 text-xs" style={{ color: "var(--ink-faint)" }}>
          {t(
            "ui.ClientPortal.elClienteRecibiraUnEnlace",
            "El cliente recibirá un enlace para crear su contraseña y acceder.",
          )}
        </p>
      </Modal>
    </div>
  );
}
