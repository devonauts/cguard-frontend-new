import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  Wallet,
  MessageCircle,
  Smartphone,
  AlertTriangle,
  Save,
  ListFilter,
  Plus,
  Mail,
  BellRing,
} from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PageContainer, PageHeader, Section, MetricTile, StatusBadge, Segmented,
  SkeletonCards, EmptyState, IconTile,
} from "@/components/kit";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  communicationService,
  CommunicationSettings,
  WalletSnapshot,
  CommunicationLog,
  LogsFilters,
  LogsResult,
} from "@/lib/api/communicationService";
import WhatsAppBusinessCard from "./WhatsAppBusinessCard";

import { localeActual } from '@/lib/localeActual'
const RECHARGE_PRESETS = [10, 25, 50, 100];
const CHANNEL_OPTIONS = ["push", "whatsapp", "sms", "email"];
const PROVIDER_OPTIONS = ["fcm", "meta", "twilio", "smtp"];
const STATUS_OPTIONS = ["queued", "sent", "delivered", "read", "failed", "skipped"];
const TYPE_OPTIONS = [
  "otp",
  "shift_reminder",
  "incident_alert",
  "visitor_alert",
  "ronda_alert",
  "task_alert",
  "no_show",
  "panic",
  "new_assignment",
  "escalation",
  "generic",
];

function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat(localeActual(), { style: "currency", currency }).format(
    (cents || 0) / 100,
  );
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

/** Estado de un envío → tono del sistema. La severidad nunca es el acento. */
const STATUS_TONE: Record<string, string> = {
  delivered: "ok",
  read: "ok",
  sent: "info",
  queued: "neutral",
  failed: "bad",
  skipped: "warn",
};

const STATUS_LABELS: Record<string, string> = {
  delivered: "Entregado",
  read: "Leído",
  sent: "Enviado",
  queued: "En cola",
  failed: "Fallido",
  skipped: "Omitido",
};

const CHANNEL_LABELS: Record<string, string> = {
  push: "Aviso al móvil",
  whatsapp: "WhatsApp",
  sms: "SMS",
  email: "Correo",
  wallet: "Recarga",
};

const TYPE_LABELS: Record<string, string> = {
  otp: "Código de acceso",
  shift_reminder: "Recordatorio de turno",
  incident_alert: "Incidente",
  visitor_alert: "Visita",
  ronda_alert: "Ronda",
  task_alert: "Tarea",
  no_show: "Ausencia",
  panic: "Pánico",
  new_assignment: "Nueva asignación",
  escalation: "Escalamiento",
  generic: "General",
};

interface ToggleRowProps {
  title: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

/** Fila de conmutador. Plana: se repite dentro de un `map()`/lista. */
function ToggleRow({ title, desc, checked, onChange, disabled }: ToggleRowProps) {
  return (
    <div className="glass-flat flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {desc && <p className="mt-0.5 text-xs" style={{ color: "var(--ink-soft)" }}>{desc}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

/** Aviso en línea con tono semántico. */
function Aviso({ tone, icon, children }: {
  tone: "warn" | "info" | "bad" | "ok"; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-start gap-2 rounded-xl border p-3 text-xs"
      style={{
        background: `color-mix(in oklab, var(--${tone}) 10%, transparent)`,
        borderColor: `color-mix(in oklab, var(--${tone}) 28%, transparent)`,
        color: `var(--${tone}-text)`,
      }}
    >
      <span className="mt-0.5 shrink-0 [&_svg]:size-3.5">{icon}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** Cifra compacta del resumen de uso. Plana: van cuatro en rejilla. */
function ResumenTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="glass-flat p-3">
      <p className="cg-eyebrow">{label}</p>
      <p className="font-display mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

export default function CommunicationsPage() {
  const { t } = useTranslation();

  const [settings, setSettings] = useState<CommunicationSettings | null>(null);
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // La pestaña activa: ?tab=saldo es la puerta directa a la recarga (VigIA,
  // avisos de saldo bajo y el retorno de Stripe aterrizan aquí).
  const [tab, setTab] = useState<string>(() => {
    try {
      const p = new URLSearchParams(window.location.search).get("tab") || "";
      return ["whatsapp", "sms", "saldo", "preferencias", "historial"].includes(p) ? p : "whatsapp";
    } catch { return "whatsapp"; }
  });

  // Wallet recharge (Stripe Checkout)
  const [rechargeAmount, setRechargeAmount] = useState<number>(25);
  const [recharging, setRecharging] = useState(false);

  // Logs
  const [logsResult, setLogsResult] = useState<LogsResult | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [filters, setFilters] = useState<LogsFilters>({ page: 1, limit: 25 });

  const loadConfig = async () => {
    setLoading(true);
    try {
      const [s, w] = await Promise.all([
        communicationService.getSettings(),
        communicationService.getWallet(),
      ]);
      setSettings(s);
      setWallet(w);
      setDirty(false);
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("comms.loadError", { defaultValue: "No se pudo cargar la configuración de comunicaciones" }),
      );
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async (f: LogsFilters = filters) => {
    setLogsLoading(true);
    try {
      const res = await communicationService.getLogs(f);
      setLogsResult(res);
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("comms.logsError", { defaultValue: "No se pudo cargar el historial" }),
      );
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
    loadLogs();
    // Returning from Stripe Checkout: the webhook credits the wallet, so
    // refresh shortly after landing back here.
    const params = new URLSearchParams(window.location.search);
    if (params.get("recharge") === "success") {
      toast.success(
        t("comms.rechargeSuccess", {
          defaultValue: "Pago recibido. Tu saldo se actualizará en unos segundos.",
        }),
      );
      setTimeout(() => {
        communicationService.getWallet().then(setWallet).catch(() => undefined);
        loadLogs();
      }, 4000);
    } else if (params.get("recharge") === "cancel") {
      toast.info(t("comms.rechargeCancel", { defaultValue: "Recarga cancelada" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRecharge = async () => {
    const cents = Math.round(Number(rechargeAmount) * 100);
    if (!Number.isFinite(cents) || cents < 500 || cents > 100000) {
      toast.error(t("comms.amountError", { defaultValue: "Ingresa un monto entre $5 y $1000" }));
      return;
    }
    setRecharging(true);
    try {
      const res = await communicationService.rechargeWallet(cents);
      if (res?.url) {
        window.location.href = res.url; // redirect to Stripe Checkout
      } else {
        toast.error(t("comms.rechargeError", { defaultValue: "No se pudo iniciar la recarga" }));
      }
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("comms.rechargeError", { defaultValue: "No se pudo iniciar la recarga" }),
      );
    } finally {
      setRecharging(false);
    }
  };

  const patch = (key: keyof CommunicationSettings, value: any) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirty(true);
  };

  const onSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const payload: Partial<CommunicationSettings> = {
        whatsapp_enabled: settings.whatsapp_enabled,
        sms_enabled: settings.sms_enabled,
        critical_alert_sms_fallback: settings.critical_alert_sms_fallback,
        whatsapp_shift_reminders: settings.whatsapp_shift_reminders,
        whatsapp_incidents: settings.whatsapp_incidents,
        sms_critical: settings.sms_critical,
        otp_preferred_channel: settings.otp_preferred_channel,
        default_country_code: settings.default_country_code,
        wallet_required_for_paid_channels: settings.wallet_required_for_paid_channels,
        low_balance_threshold: Number(settings.low_balance_threshold) || 0,
        // meta_* identifiers are no longer managed here: tenants connect their
        // own WhatsApp Business via the Embedded Signup card above.
      };
      const updated = await communicationService.updateSettings(payload);
      setSettings(updated);
      setDirty(false);
      toast.success(t("comms.saved", { defaultValue: "Configuración guardada" }));
      // Threshold may affect the wallet snapshot view.
      communicationService.getWallet().then(setWallet).catch(() => undefined);
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("comms.saveError", { defaultValue: "No se pudo guardar la configuración" }),
      );
    } finally {
      setSaving(false);
    }
  };

  const setFilter = (key: keyof LogsFilters, value: any) => {
    const next = { ...filters, [key]: value || undefined, page: 1 };
    setFilters(next);
  };

  const applyFilters = () => loadLogs({ ...filters, page: 1 });
  const clearFilters = () => {
    const reset: LogsFilters = { page: 1, limit: 25 };
    setFilters(reset);
    loadLogs(reset);
  };

  const goPage = (page: number) => {
    const next = { ...filters, page };
    setFilters(next);
    loadLogs(next);
  };

  // Cost summary across the currently loaded page of logs.
  const costSummary = useMemo(() => {
    const rows = logsResult?.rows || [];
    let estimate = 0;
    let billed = 0;
    let paid = 0;
    let failed = 0;
    let currency = wallet?.currency || "USD";
    rows.forEach((r) => {
      estimate += r.costEstimateCents || 0;
      billed += r.billedAmountCents || 0;
      if (r.channel === "whatsapp" || r.channel === "sms") paid += 1;
      if (r.status === "failed") failed += 1;
      if (r.currency) currency = r.currency;
    });
    return { estimate, billed, paid, failed, currency, count: rows.length };
  }, [logsResult, wallet]);

  const currency = wallet?.currency || "USD";

  // Shared save bar — rendered at the bottom of every settings tab.
  const saveBar = settings ? (
    <div className="flex items-center justify-end gap-3">
      {dirty && (
        <StatusBadge tone="warn">
          {t("comms.unsaved", { defaultValue: "Cambios sin guardar" })}
        </StatusBadge>
      )}
      <Button variant="brand" onClick={onSave} disabled={saving || !dirty}>
        {saving ? (
          <Loader2 className="mr-2 animate-spin" size={16} />
        ) : (
          <Save className="mr-2" size={16} />
        )}
        {t("comms.save", { defaultValue: "Guardar cambios" })}
      </Button>
    </div>
  ) : null;

  return (
    <AppLayout>
      <SettingsLayout
        navKey="configuracion"
        title={t("settings.configuracion.comunicaciones", { defaultValue: "Comunicaciones" })}
      >
        <PageContainer width="wide">
          <PageHeader
            icon={<MessageCircle />}
            title={t("settings.configuracion.comunicaciones", { defaultValue: "Comunicaciones" })}
            subtitle={t("comms.walletHint", { defaultValue: "Saldo prepago para SMS. WhatsApp se factura directo a tu cuenta de Meta al conectarla." })}
            badges={
              !loading && wallet ? (
                <StatusBadge tone={wallet.balanceCents <= 0 ? "bad" : wallet.belowThreshold ? "warn" : "ok"}>
                  {t("comms.walletBadge", { defaultValue: "Saldo" })} {money(wallet.balanceCents || 0, currency)}
                </StatusBadge>
              ) : undefined
            }
            actions={
              !loading ? (
                <Button variant="outline" size="sm" onClick={loadConfig}>
                  <RefreshCw size={14} className="mr-1.5" />
                  {t("comms.refresh", { defaultValue: "Actualizar" })}
                </Button>
              ) : undefined
            }
          />
          {loading ? (
            <SkeletonCards count={4} />
          ) : (
            <Tabs value={tab} onValueChange={setTab} className="space-y-6">
              <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <TabsList className="w-max min-w-full justify-start">
                  <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
                  <TabsTrigger value="sms">SMS</TabsTrigger>
                  <TabsTrigger value="saldo">
                    {t("comms.tabWallet", { defaultValue: "Saldo y recargas" })}
                  </TabsTrigger>
                  <TabsTrigger value="preferencias">
                    {t("comms.tabPrefs", { defaultValue: "Preferencias" })}
                  </TabsTrigger>
                  <TabsTrigger value="historial">
                    {t("comms.tabHistory", { defaultValue: "Historial" })}
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* ── Saldo: el monedero que paga SMS, plantillas de WhatsApp y VigIA ── */}
              <TabsContent value="saldo" className="space-y-6">
              <MetricTile
                label={t("comms.walletTitle2", { defaultValue: "Saldo de comunicaciones e IA" })}
                value={money(wallet?.balanceCents || 0, currency)}
                icon={<Wallet />}
                hint={t("comms.walletHint2", {
                  defaultValue: "Un solo saldo prepago para SMS (Twilio), plantillas de WhatsApp y el asistente VigIA.",
                })}
              />
              {wallet?.belowThreshold && (
                <Aviso tone={wallet.balanceCents <= 0 ? "bad" : "warn"} icon={<AlertTriangle />}>
                  {wallet.balanceCents <= 0
                    ? t("comms.noBalance", {
                        defaultValue: "Te has quedado sin saldo. Los mensajes con costo no saldrán hasta que recargues.",
                      })
                    : t("comms.lowBalance", {
                        defaultValue:
                          "Saldo bajo: por debajo del umbral configurado. Los canales con costo podrían bloquearse.",
                      })}{" "}
                  ({money(wallet.lowBalanceThresholdCents, currency)})
                </Aviso>
              )}

              <Section title={t("comms.rechargeTitle", { defaultValue: "Recargar saldo" })} icon={<Wallet />}>
                <div className="space-y-4">
                  <Segmented
                    value={RECHARGE_PRESETS.includes(rechargeAmount) ? String(rechargeAmount) : ""}
                    onChange={(v) => setRechargeAmount(Number(v))}
                    options={RECHARGE_PRESETS.map((p) => ({ value: String(p), label: `$${p}` }))}
                  />
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="w-full max-w-40">
                      <Label className="text-xs">{t("comms.customAmount", { defaultValue: "Monto (USD)" })}</Label>
                      <Input
                        type="number"
                        min={5}
                        max={1000}
                        value={rechargeAmount}
                        onChange={(e) => setRechargeAmount(Number(e.target.value))}
                      />
                    </div>
                    <Button variant="brand" onClick={onRecharge} disabled={recharging}>
                      {recharging ? <Loader2 className="mr-2 animate-spin" size={16} /> : <Plus className="mr-2" size={16} />}
                      {t("comms.recharge", { defaultValue: "Recargar" })}
                    </Button>
                  </div>
                  <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                    {t("comms.rechargeHint", {
                      defaultValue:
                        "Pago seguro con tarjeta vía Stripe. El saldo se acredita automáticamente al confirmarse el pago y cubre los SMS enviados por la plataforma.",
                    })}
                  </p>
                </div>
              </Section>
              </TabsContent>

              {/* ── SMS: Twilio + alertas (el saldo vive en su pestaña) ───── */}
              <TabsContent value="sms" className="space-y-6">

              {/* SMS toggles */}
              {settings && (
                <Section title={t("comms.smsTitle", { defaultValue: "SMS (Twilio)" })} icon={<Smartphone />}>
                  <div className="space-y-2">
                    <ToggleRow
                      title={t("comms.smsFallback", { defaultValue: "SMS como respaldo" })}
                      desc={t("comms.smsFallbackDesc", {
                        defaultValue: "Usa SMS (Twilio) cuando push y WhatsApp no estén disponibles.",
                      })}
                      checked={!!settings.sms_enabled}
                      onChange={(v) => patch("sms_enabled", v)}
                    />
                    <ToggleRow
                      title={t("comms.smsCritical", {
                        defaultValue: "SMS para alertas críticas",
                      })}
                      desc={t("comms.smsCriticalDesc", {
                        // Decía «Envía SMS inmediato en pánico/emergencias» y era
                        // FALSO: el enrutador nunca consulta este ajuste para un
                        // pánico ni para un escalado — ésos mandan SMS siempre, y
                        // así se queda, porque un pánico sin SMS no es una opción.
                        // Lo que este interruptor gobierna de verdad son los
                        // avisos de visita y de ronda.
                        defaultValue: "Envía SMS en avisos de visitas y rondas. El botón de pánico manda SMS siempre, no depende de esto.",
                      })}
                      checked={!!settings.sms_critical}
                      onChange={(v) => patch("sms_critical", v)}
                      disabled={!settings.sms_enabled}
                    />
                    <ToggleRow
                      title={t("comms.criticalSmsFallback", {
                        defaultValue: "Respaldo SMS en alertas críticas",
                      })}
                      desc={t("comms.criticalSmsFallbackDesc", {
                        defaultValue: "Permite SMS de respaldo cuando una alerta crítica no se entrega.",
                      })}
                      checked={!!settings.critical_alert_sms_fallback}
                      onChange={(v) => patch("critical_alert_sms_fallback", v)}
                      disabled={!settings.sms_enabled}
                    />
                    <ToggleRow
                      title={t("comms.walletRequired", {
                        defaultValue: "Requerir saldo para canales con costo",
                      })}
                      desc={t("comms.walletRequiredDesc", {
                        defaultValue: "Bloquea el envío de SMS cuando no hay saldo suficiente.",
                      })}
                      checked={!!settings.wallet_required_for_paid_channels}
                      onChange={(v) => patch("wallet_required_for_paid_channels", v)}
                    />
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">
                        {t("comms.lowThreshold", { defaultValue: "Umbral de saldo bajo (USD)" })}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={
                          settings.low_balance_threshold != null
                            ? settings.low_balance_threshold / 100
                            : 0
                        }
                        onChange={(e) =>
                          patch(
                            "low_balance_threshold",
                            Math.round(Number(e.target.value) * 100) || 0,
                          )
                        }
                      />
                    </div>
                  </div>
                </Section>
              )}
              {saveBar}
              </TabsContent>

              {/* ── WhatsApp: cuenta propia del tenant + alertas ─────────── */}
              <TabsContent value="whatsapp" className="space-y-6">
              {/* WhatsApp Business (Meta Embedded Signup) */}
              <WhatsAppBusinessCard />

              {settings && (
                <Section title={t("comms.waTogglesTitle", { defaultValue: "Alertas por WhatsApp" })} icon={<MessageCircle />}>
                  <div className="space-y-2">
                    <ToggleRow
                      title={t("comms.whatsappEnabled", { defaultValue: "Habilitar WhatsApp" })}
                      desc={t("comms.whatsappEnabledDesc", {
                        defaultValue: "Envía mensajes desde tu propio WhatsApp Business (facturado por Meta a tu empresa).",
                      })}
                      checked={!!settings.whatsapp_enabled}
                      onChange={(v) => patch("whatsapp_enabled", v)}
                    />
                    <ToggleRow
                      title={t("comms.whatsappShiftReminders", {
                        defaultValue: "Recordatorios de turno por WhatsApp",
                      })}
                      desc={t("comms.whatsappShiftRemindersDesc", {
                        defaultValue: "Notifica turnos por WhatsApp si el vigilante no tiene push.",
                      })}
                      checked={!!settings.whatsapp_shift_reminders}
                      onChange={(v) => patch("whatsapp_shift_reminders", v)}
                      disabled={!settings.whatsapp_enabled}
                    />
                    <ToggleRow
                      title={t("comms.whatsappIncidents", {
                        defaultValue: "Incidentes por WhatsApp",
                      })}
                      desc={t("comms.whatsappIncidentsDesc", {
                        defaultValue: "Alerta a supervisores y administradores por WhatsApp.",
                      })}
                      checked={!!settings.whatsapp_incidents}
                      onChange={(v) => patch("whatsapp_incidents", v)}
                      disabled={!settings.whatsapp_enabled}
                    />
                  </div>
                </Section>
              )}
              {saveBar}
              </TabsContent>

              {/* ── Preferencias de enrutamiento ─────────────────────────── */}
              <TabsContent value="preferencias" className="space-y-6">
              {/* Orden en que se intenta cada canal */}
              <Section title={t("comms.orderTitle", { defaultValue: "Orden de aviso" })} icon={<MessageCircle />}>
                <p className="mb-3 text-sm" style={{ color: "var(--ink-soft)" }}>
                  {t("comms.orderHint", {
                    defaultValue: "Cada aviso intenta el canal más barato primero y sólo baja al siguiente si no llega.",
                  })}
                </p>
                <div className="grid gap-2 sm:grid-cols-4">
                  {[
                    { icon: <BellRing />, label: CHANNEL_LABELS.push, hint: t("comms.orderPush", { defaultValue: "Sin costo" }) },
                    { icon: <MessageCircle />, label: CHANNEL_LABELS.whatsapp, hint: t("comms.orderWa", { defaultValue: "Lo factura Meta" }) },
                    { icon: <Smartphone />, label: CHANNEL_LABELS.sms, hint: t("comms.orderSms", { defaultValue: "Consume saldo" }) },
                    { icon: <Mail />, label: CHANNEL_LABELS.email, hint: t("comms.orderMail", { defaultValue: "Sin costo" }) },
                  ].map((c, i) => (
                    <div key={c.label} className="glass-flat flex items-center gap-3 p-3">
                      <IconTile tone={i === 0 ? "brand" : "neutral"} size="sm">{c.icon}</IconTile>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{c.label}</p>
                        <p className="truncate text-xs" style={{ color: "var(--ink-faint)" }}>{c.hint}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* OTP / routing preferences */}
              {settings && (
                <Section title={t("comms.routingTitle", { defaultValue: "Preferencias de enrutamiento" })} icon={<Smartphone />}>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">
                          {t("comms.otpChannel", { defaultValue: "Canal preferido para el código de acceso" })}
                        </Label>
                        <select
                          value={settings.otp_preferred_channel}
                          onChange={(e) => patch("otp_preferred_channel", e.target.value)}
                          className="cg-input cg-focus mt-1 h-9 w-full px-3 text-sm"
                        >
                          <option value="whatsapp">WhatsApp</option>
                          <option value="sms">SMS</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs">
                          {t("comms.defaultCountry", { defaultValue: "Código de país por defecto" })}
                        </Label>
                        <Input
                          value={settings.default_country_code || ""}
                          onChange={(e) => patch("default_country_code", e.target.value)}
                          placeholder="+593"
                        />
                      </div>
                    </div>
                  </div>
                </Section>
              )}
              {saveBar}
              </TabsContent>

              {/* ── Historial de uso ─────────────────────────────────────── */}
              <TabsContent value="historial" className="space-y-6">
              {/* Usage / logs */}
              <Section title={t("comms.usageTitle", { defaultValue: "Historial de uso" })} icon={<ListFilter />}>
                <div className="space-y-4">
                  {/* Cost summary */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <ResumenTile
                      label={t("comms.sumMessages", { defaultValue: "Mensajes (página)" })}
                      value={costSummary.count}
                    />
                    <ResumenTile
                      label={t("comms.sumPaid", { defaultValue: "Con costo" })}
                      value={costSummary.paid}
                    />
                    <ResumenTile
                      label={t("comms.sumBilled", { defaultValue: "Facturado" })}
                      value={money(costSummary.billed || costSummary.estimate, costSummary.currency)}
                    />
                    <ResumenTile
                      label={t("comms.sumFailed", { defaultValue: "Fallidos" })}
                      value={
                        <span style={costSummary.failed ? { color: "var(--bad-text)" } : undefined}>
                          {costSummary.failed}
                        </span>
                      }
                    />
                  </div>

                  {/* Filters */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <div>
                      <Label className="text-xs">{t("comms.fChannel", { defaultValue: "Canal" })}</Label>
                      <select
                        value={filters.channel || ""}
                        onChange={(e) => setFilter("channel", e.target.value)}
                        className="cg-input cg-focus mt-1 h-9 w-full px-2 text-sm"
                      >
                        <option value="">{t("comms.all", { defaultValue: "Todos" })}</option>
                        {CHANNEL_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {CHANNEL_LABELS[c] || c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">{t("comms.fProvider", { defaultValue: "Proveedor" })}</Label>
                      <select
                        value={filters.provider || ""}
                        onChange={(e) => setFilter("provider", e.target.value)}
                        className="cg-input cg-focus mt-1 h-9 w-full px-2 text-sm"
                      >
                        <option value="">{t("comms.all", { defaultValue: "Todos" })}</option>
                        {PROVIDER_OPTIONS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">{t("comms.fStatus", { defaultValue: "Estado" })}</Label>
                      <select
                        value={filters.status || ""}
                        onChange={(e) => setFilter("status", e.target.value)}
                        className="cg-input cg-focus mt-1 h-9 w-full px-2 text-sm"
                      >
                        <option value="">{t("comms.all", { defaultValue: "Todos" })}</option>
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABELS[s] || s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">{t("comms.fType", { defaultValue: "Tipo" })}</Label>
                      <select
                        value={filters.type || ""}
                        onChange={(e) => setFilter("type", e.target.value)}
                        className="cg-input cg-focus mt-1 h-9 w-full px-2 text-sm"
                      >
                        <option value="">{t("comms.all", { defaultValue: "Todos" })}</option>
                        {TYPE_OPTIONS.map((ty) => (
                          <option key={ty} value={ty}>
                            {TYPE_LABELS[ty] || ty}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">{t("comms.fFrom", { defaultValue: "Desde" })}</Label>
                      <Input
                        type="date"
                        value={filters.from || ""}
                        onChange={(e) => setFilter("from", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t("comms.fTo", { defaultValue: "Hasta" })}</Label>
                      <Input
                        type="date"
                        value={filters.to || ""}
                        onChange={(e) => setFilter("to", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="brand" onClick={applyFilters}>
                      <ListFilter size={14} className="mr-1.5" />
                      {t("comms.applyFilters", { defaultValue: "Filtrar" })}
                    </Button>
                    <Button size="sm" variant="outline" onClick={clearFilters}>
                      {t("comms.clearFilters", { defaultValue: "Limpiar" })}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => loadLogs()}>
                      <RefreshCw size={14} className="mr-1.5" />
                      {t("comms.refresh", { defaultValue: "Actualizar" })}
                    </Button>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    {logsLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} className="cg-skeleton h-12 w-full" />
                        ))}
                      </div>
                    ) : !logsResult || logsResult.rows.length === 0 ? (
                      <EmptyState
                        icon={<ListFilter />}
                        title={t("comms.noLogs", { defaultValue: "Sin registros para los filtros aplicados." })}
                        description={t("comms.noLogsDesc", { defaultValue: "Cambia o limpia los filtros para ver más envíos." })}
                      />
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("comms.colDate", { defaultValue: "Fecha" })}</TableHead>
                            <TableHead>{t("comms.colChannel", { defaultValue: "Canal" })}</TableHead>
                            <TableHead>{t("comms.colType", { defaultValue: "Tipo" })}</TableHead>
                            <TableHead>{t("comms.colRecipient", { defaultValue: "Destinatario" })}</TableHead>
                            <TableHead>{t("comms.colStatus", { defaultValue: "Estado" })}</TableHead>
                            <TableHead className="text-right">
                              {t("comms.colCost", { defaultValue: "Costo" })}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {logsResult.rows.map((row: CommunicationLog) => (
                            <TableRow key={row.id}>
                              <TableCell className="whitespace-nowrap text-xs" style={{ color: "var(--ink-soft)" }}>
                                {fmtDate(row.createdAt)}
                              </TableCell>
                              <TableCell className="text-sm">
                                {CHANNEL_LABELS[row.channel] || row.channel}
                                <span className="ml-1 text-xs" style={{ color: "var(--ink-faint)" }}>{row.provider}</span>
                              </TableCell>
                              <TableCell className="text-xs">
                                {TYPE_LABELS[row.messageType] || row.messageType}
                              </TableCell>
                              <TableCell className="max-w-[160px] truncate text-xs" title={row.recipient}>
                                {row.recipient}
                              </TableCell>
                              <TableCell>
                                <span title={row.errorMessage || undefined}>
                                  <StatusBadge tone={STATUS_TONE[row.status] || "neutral"}>
                                    {STATUS_LABELS[row.status] || row.status}
                                  </StatusBadge>
                                </span>
                              </TableCell>
                              <TableCell className="text-right text-xs tabular-nums">
                                {row.billedAmountCents != null
                                  ? money(row.billedAmountCents, row.currency || currency)
                                  : row.costEstimateCents != null
                                  ? money(row.costEstimateCents, row.currency || currency)
                                  : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>

                  {/* Pagination */}
                  {logsResult && logsResult.totalPages > 1 && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs tabular-nums" style={{ color: "var(--ink-soft)" }}>
                        {t("comms.pageOf", {
                          defaultValue: "Página {{page}} de {{total}} · {{count}} registros",
                          page: logsResult.page,
                          total: logsResult.totalPages,
                          count: logsResult.count,
                        })}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={logsResult.page <= 1 || logsLoading}
                          onClick={() => goPage(logsResult.page - 1)}
                        >
                          {t("comms.prev", { defaultValue: "Anterior" })}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={logsResult.page >= logsResult.totalPages || logsLoading}
                          onClick={() => goPage(logsResult.page + 1)}
                        >
                          {t("comms.next", { defaultValue: "Siguiente" })}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </Section>
              </TabsContent>
            </Tabs>
          )}
        </PageContainer>
      </SettingsLayout>
    </AppLayout>
  );
}
