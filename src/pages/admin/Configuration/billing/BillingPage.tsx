import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Loader2,
  CreditCard,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Sparkles,
  Wallet,
  Download,
  ExternalLink,
  FileText,
  Receipt,
} from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import {
  PageContainer,
  PageHeader,
  Section,
  StatCard,
  Stagger,
  StatusBadge,
  EmptyState,
  SkeletonCards,
} from "@/components/kit";
import {
  subscriptionBillingService,
  BillingSummary,
  BillableUser,
  PlatformInvoice,
} from "@/lib/api/subscriptionBillingService";

function money(cents: number, currency = "USD") {
  // en-US → dot as decimal separator (e.g. $12.50), comma as thousands.
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    (cents || 0) / 100,
  );
}

/* Los estados de la suscripción y de las facturas usan los tonos SEMÁNTICOS del
   sistema, no el acento: «pago vencido» tiene que verse rojo aunque la empresa
   haya elegido el rojo como color de marca. */
type BadgeTone = "info" | "ok" | "bad" | "warn" | "neutral";
const STATUS_TONE: Record<string, BadgeTone> = {
  trialing: "info",
  active: "ok",
  past_due: "bad",
  trial_expired: "warn",
  canceled: "neutral",
};

const INVOICE_TONE: Record<string, BadgeTone> = {
  paid: "ok",
  open: "warn",
  draft: "neutral",
  void: "neutral",
  uncollectible: "bad",
};

/** Punto de estado de un usuario facturable. */
const SEAT_DOT: Record<string, string> = {
  active: "var(--ok)",
  invited: "var(--warn)",
  pending: "var(--warn)",
};

/** Aviso en línea con tono semántico. */
function Aviso({
  tone,
  icon,
  children,
}: {
  tone: "warn" | "info" | "bad" | "ok";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-start gap-2 rounded-xl border p-3 text-sm"
      style={{
        background: `color-mix(in oklab, var(--${tone}) 10%, transparent)`,
        borderColor: `color-mix(in oklab, var(--${tone}) 28%, transparent)`,
        color: `var(--${tone}-text)`,
      }}
    >
      <span className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export default function BillingPage() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<BillingSummary | null>(null);
  const [users, setUsers] = useState<BillableUser[]>([]);
  const [invoices, setInvoices] = useState<PlatformInvoice[]>([]);
  const [showUsers, setShowUsers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const dateLocale = i18n.language?.startsWith("en") ? "en-US" : "es-ES";
  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(dateLocale, {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : "—";

  const load = async () => {
    setLoading(true);
    try {
      setData(await subscriptionBillingService.summary());
    } catch {
      toast.error(
        t("billing.loadError", {
          defaultValue: "No se pudo cargar la facturación",
        }),
      );
    } finally {
      setLoading(false);
    }
    // Non-blocking: the seat list and invoice history are supplementary.
    try {
      setUsers(await subscriptionBillingService.users());
    } catch {
      /* ignore — summary already shows the seat count */
    }
    try {
      setInvoices(await subscriptionBillingService.invoices());
    } catch {
      /* ignore — the section shows its empty state */
    }
  };

  useEffect(() => {
    load();
    const p = new URLSearchParams(window.location.search);

    if (p.get("activated") === "success") {
      toast.success(
        t("billing.activated", {
          defaultValue: "¡Suscripción activada! Gracias.",
        }),
      );
      setTimeout(load, 3000);
    } else if (p.get("activated") === "cancel") {
      toast.info(
        t("billing.activateCancel", { defaultValue: "Activación cancelada" }),
      );
    }
    // Drop the param so a refresh doesn't re-fire the toast.
    if (p.has("activated")) {
      p.delete("activated");
      const qs = p.toString();

      window.history.replaceState(
        {},
        "",
        window.location.pathname + (qs ? `?${qs}` : ""),
      );
    }
  }, []);

  const activate = async () => {
    setActivating(true);
    try {
      const res = await subscriptionBillingService.checkout();

      if (res?.url) window.location.href = res.url;
      else
        toast.error(
          t("billing.checkoutError", {
            defaultValue: "No se pudo iniciar el pago",
          }),
        );
    } catch (e: any) {
      toast.error(
        e?.response?.data?.message ||
          e?.message ||
          t("billing.checkoutError", {
            defaultValue: "No se pudo iniciar el pago",
          }),
      );
    } finally {
      setActivating(false);
    }
  };

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const res = await subscriptionBillingService.portal();

      if (res?.url) window.location.href = res.url;
      else
        toast.error(
          t("billing.portalError", {
            defaultValue: "No se pudo abrir el portal de pagos",
          }),
        );
    } catch (e: any) {
      toast.error(
        e?.response?.data?.message ||
          e?.message ||
          t("billing.portalError", {
            defaultValue: "No se pudo abrir el portal de pagos",
          }),
      );
    } finally {
      setPortalLoading(false);
    }
  };

  const status = data?.status || "trialing";
  const statusLabels: Record<string, string> = {
    trialing: t("billing.statusTrialing", { defaultValue: "Prueba gratuita" }),
    active: t("billing.statusActive", { defaultValue: "Activo" }),
    past_due: t("billing.statusPastDue", { defaultValue: "Pago vencido" }),
    trial_expired: t("billing.statusTrialExpired", {
      defaultValue: "Prueba expirada",
    }),
    canceled: t("billing.statusCanceled", { defaultValue: "Cancelado" }),
  };
  const invoiceStatusLabels: Record<string, string> = {
    paid: t("billing.invStatusPaid", { defaultValue: "Pagada" }),
    open: t("billing.invStatusOpen", { defaultValue: "Pendiente" }),
    draft: t("billing.invStatusDraft", { defaultValue: "Borrador" }),
    void: t("billing.invStatusVoid", { defaultValue: "Anulada" }),
    uncollectible: t("billing.invStatusUncollectible", {
      defaultValue: "Incobrable",
    }),
  };
  const meta = {
    label: statusLabels[status] || statusLabels.trialing,
    tone: STATUS_TONE[status] || STATUS_TONE.trialing,
  };
  const q = data?.quote;
  const currency = q?.currency || "USD";
  const isActive = status === "active";
  const visibleInvoices = invoices.filter((inv) => inv.status !== "draft");

  return (
    <AppLayout>
      <PageContainer className="p-4 sm:p-6" width="narrow">
        <PageHeader
          badges={
            !loading && data ? (
              <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
            ) : undefined
          }
          icon={<CreditCard />}
          subtitle={t("billing.title", {
            defaultValue: "Estado de la suscripción",
          })}
          title={t("settings.configuracion.billing", {
            defaultValue: "Suscripción",
          })}
        />
        {loading || !data || !q ? (
          <SkeletonCards count={4} />
        ) : (
          <div className="space-y-6">
            {/* KPIs */}
            <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <StatCard
                accent="primary"
                icon={<Users />}
                label={t("billing.seats", {
                  defaultValue: "Usuarios facturables",
                })}
                value={data.seats}
              />
              <StatCard
                accent={isActive ? "ok" : "brand"}
                hint={t("billing.monthlyHint", {
                  defaultValue: "Facturación mensual",
                })}
                icon={<Wallet />}
                label={t("billing.monthly", { defaultValue: "Total mensual" })}
                value={`${money(q!.monthlyCents, currency)}`}
              />
            </Stagger>

            {/* Status */}
            <Section
              icon={<CreditCard />}
              title={t("billing.title", {
                defaultValue: "Estado de la suscripción",
              })}
            >
              <div className="space-y-3">
                {status === "trialing" && (
                  <Aviso icon={<Clock />} tone="info">
                    {data.trial.daysLeft > 0
                      ? t("billing.trialLeft", {
                          defaultValue:
                            "Te quedan {{n}} día(s) de prueba gratuita.",
                          n: data.trial.daysLeft,
                        })
                      : t("billing.trialEndsToday", {
                          defaultValue: "Tu prueba gratuita termina hoy.",
                        })}
                    {data.trial.endsAt && ` (${fmtDate(data.trial.endsAt)})`}
                  </Aviso>
                )}
                {status === "trial_expired" && (
                  <Aviso icon={<AlertTriangle />} tone="warn">
                    {t("billing.expired", {
                      defaultValue:
                        "Tu prueba gratuita terminó. Activa tu suscripción para seguir usando la plataforma.",
                    })}
                  </Aviso>
                )}
                {status === "past_due" && (
                  <Aviso icon={<AlertTriangle />} tone="bad">
                    {t("billing.pastDue", {
                      defaultValue:
                        "Tu último pago falló. Actualiza tu método de pago para mantener el servicio.",
                    })}
                  </Aviso>
                )}
                {isActive && (
                  <div
                    className="flex items-center gap-2 text-sm"
                    style={{ color: "var(--ok-text)" }}
                  >
                    <CheckCircle2 size={16} />{" "}
                    {t("billing.activeMsg", {
                      defaultValue: "Tu suscripción está activa.",
                    })}
                  </div>
                )}

                <button
                  className="cg-focus flex w-full items-center justify-between border-t pt-3 text-sm"
                  style={{ borderColor: "var(--hairline)" }}
                  type="button"
                  onClick={() => setShowUsers((v) => !v)}
                >
                  <span
                    className="flex items-center gap-2"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    <Users size={15} />{" "}
                    {t("billing.seats", {
                      defaultValue: "Usuarios facturables",
                    })}
                  </span>
                  <span className="flex items-center gap-1.5 font-semibold tabular-nums">
                    {data.seats}
                    <span
                      className="text-xs font-normal"
                      style={{ color: "var(--brand-text)" }}
                    >
                      {showUsers
                        ? t("billing.hideUsers", { defaultValue: "ocultar" })
                        : t("billing.viewUsers", { defaultValue: "ver" })}
                    </span>
                  </span>
                </button>

                {showUsers && (
                  <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
                    {users.length === 0 ? (
                      <EmptyState
                        icon={<Users />}
                        title={t("billing.noUsers", {
                          defaultValue: "Sin usuarios",
                        })}
                      />
                    ) : (
                      users.map((u) => (
                        <div
                          key={u.id}
                          className="glass-flat flex items-center justify-between gap-3 px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {u.name}
                            </div>
                            {u.email && (
                              <div
                                className="truncate text-xs"
                                style={{ color: "var(--ink-soft)" }}
                              >
                                {u.email}
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {u.roles[0] && (
                              <span
                                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                                style={{
                                  background: "var(--glass-sunken)",
                                  color: "var(--ink-soft)",
                                }}
                              >
                                {u.roles[0]}
                              </span>
                            )}
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{
                                background:
                                  SEAT_DOT[u.status || ""] ||
                                  "var(--ink-faint)",
                              }}
                              title={u.status || ""}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </Section>

            {/* Price breakdown */}
            <Section
              action={<StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>}
              icon={<Wallet />}
              title={t("billing.costTitle", { defaultValue: "Tu plan" })}
            >
              {/* El plan vigente es lo importante de la página: va sobre el
                    realce del acento, y el desglose por debajo en plano. */}
              <div className="glass-flat glass-brand space-y-3 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: "var(--ink-soft)" }}>
                    {money(q!.perUserCents, currency)} × {data.seats}{" "}
                    {t("billing.users", { defaultValue: "usuarios" })}
                  </span>
                  <span className="tabular-nums">
                    {money(q!.perUserCents * data.seats, currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: "var(--ink-soft)" }}>
                    {t("billing.processing", {
                      defaultValue: "Procesamiento de pago",
                    })}
                  </span>
                  <span className="tabular-nums">
                    {money(q!.platformFeeCents, currency)}
                  </span>
                </div>
                <div
                  className="flex items-center justify-between border-t pt-3 text-base font-semibold"
                  style={{ borderColor: "var(--brand-line)" }}
                >
                  <span>
                    {t("billing.monthly", { defaultValue: "Total mensual" })}
                  </span>
                  <span className="font-display tabular-nums">
                    {money(q!.monthlyCents, currency)}/mes
                  </span>
                </div>
              </div>

              {!data.implementationPaid && (
                <div className="glass-flat mt-3 flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span
                    className="flex items-center gap-2"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    <Sparkles size={15} />{" "}
                    {t("billing.implementation", {
                      defaultValue: "Puesta en marcha (pago único)",
                    })}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {money(q!.implementationCents, currency)}
                  </span>
                </div>
              )}

              {!isActive && (
                <div className="glass-flat mt-3 flex items-center justify-between gap-3 px-4 py-3">
                  <div className="text-sm">
                    <div className="font-semibold">
                      {t("billing.firstCharge", {
                        defaultValue: "Primer cargo hoy",
                      })}
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {t("billing.thenMonthly", {
                        defaultValue: "Luego {{m}}/mes",
                        m: `${money(q!.monthlyCents, currency)}`,
                      })}
                    </div>
                  </div>
                  <div
                    className="font-display text-lg font-bold tabular-nums"
                    style={{ color: "var(--brand-text)" }}
                  >
                    {money(q!.firstChargeCents, currency)}
                  </div>
                </div>
              )}

              <p className="pt-3 text-xs" style={{ color: "var(--ink-faint)" }}>
                {t("billing.feeNote", {
                  defaultValue:
                    "Los precios incluyen las comisiones de procesamiento de Stripe. Facturación mensual; el número de usuarios se ajusta automáticamente.",
                })}
              </p>
            </Section>

            {/* Invoice history */}
            <Section
              icon={<Receipt />}
              title={t("billing.invoicesTitle", {
                defaultValue: "Historial de facturas",
              })}
            >
              {visibleInvoices.length === 0 ? (
                <EmptyState
                  description={t("billing.invoicesEmptyDesc", {
                    defaultValue:
                      "Cuando actives tu suscripción, tus facturas aparecerán aquí y podrás descargarlas en PDF.",
                  })}
                  icon={<FileText />}
                  title={t("billing.invoicesEmptyTitle", {
                    defaultValue: "Aún no hay facturas",
                  })}
                />
              ) : (
                <div className="space-y-2">
                  {visibleInvoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="glass-flat flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">
                            {inv.number || inv.stripeInvoiceId}
                          </span>
                          <StatusBadge
                            tone={INVOICE_TONE[inv.status] || "neutral"}
                          >
                            {invoiceStatusLabels[inv.status] || inv.status}
                          </StatusBadge>
                        </div>
                        <div
                          className="mt-0.5 text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {fmtDate(inv.paidAt || inv.issuedAt)}
                          {inv.linesSummary ? ` · ${inv.linesSummary}` : ""}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums">
                          {money(
                            inv.status === "paid"
                              ? inv.amountPaidCents
                              : inv.amountDueCents,
                            (inv.currency || "usd").toUpperCase(),
                          )}
                        </span>
                        {inv.hostedInvoiceUrl && (
                          <Button
                            asChild
                            className="h-8 px-2"
                            size="sm"
                            variant="ghost"
                          >
                            <a
                              href={inv.hostedInvoiceUrl}
                              rel="noopener noreferrer"
                              target="_blank"
                              title={t("billing.invoiceView", {
                                defaultValue: "Ver factura",
                              })}
                            >
                              <ExternalLink size={15} />
                            </a>
                          </Button>
                        )}
                        {inv.invoicePdfUrl && (
                          <Button
                            asChild
                            className="h-8"
                            size="sm"
                            variant="outline"
                          >
                            <a
                              href={inv.invoicePdfUrl}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              <Download className="mr-1.5" size={14} />
                              {t("billing.invoiceDownload", {
                                defaultValue: "PDF",
                              })}
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* CTA */}
            {!isActive ? (
              <div className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    disabled={portalLoading}
                    variant="outline"
                    onClick={openPortal}
                  >
                    {portalLoading ? (
                      <Loader2 className="mr-2 animate-spin" size={16} />
                    ) : (
                      <CreditCard className="mr-2" size={16} />
                    )}
                    {t("billing.manageCard", {
                      defaultValue: "Agregar / administrar tarjeta",
                    })}
                  </Button>
                  <Button
                    disabled={activating}
                    variant="brand"
                    onClick={activate}
                  >
                    {activating ? (
                      <Loader2 className="mr-2 animate-spin" size={16} />
                    ) : (
                      <CreditCard className="mr-2" size={16} />
                    )}
                    {t("billing.activate", {
                      defaultValue: "Activar suscripción",
                    })}
                  </Button>
                </div>
                <p
                  className="text-right text-xs"
                  style={{ color: "var(--ink-faint)" }}
                >
                  {t("billing.autopayNote", {
                    defaultValue:
                      "Tu tarjeta se guarda de forma segura en Stripe y se cobra automáticamente cada mes.",
                  })}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p
                  className="flex items-center gap-1.5 text-xs"
                  style={{ color: "var(--ink-soft)" }}
                >
                  <CheckCircle2 size={14} style={{ color: "var(--ok)" }} />
                  {t("billing.autopayOn", {
                    defaultValue:
                      "Autopago activo — se cobra automáticamente cada mes.",
                  })}
                </p>
                <Button
                  disabled={portalLoading}
                  variant="outline"
                  onClick={openPortal}
                >
                  {portalLoading ? (
                    <Loader2 className="mr-2 animate-spin" size={16} />
                  ) : (
                    <CreditCard className="mr-2" size={16} />
                  )}
                  {t("billing.managePayment", {
                    defaultValue: "Administrar método de pago",
                  })}
                </Button>
              </div>
            )}
          </div>
        )}
      </PageContainer>
    </AppLayout>
  );
}
