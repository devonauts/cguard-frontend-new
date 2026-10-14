import type { Stripe, StripeCardElement } from "@stripe/stripe-js";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Loader2,
  PauseCircle,
  Receipt,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";

import {
  TONO_DEL_ESTADO,
  TONO_DEL_RECIBO,
  accionDeTarjeta,
  desgloseDelPlan,
  esDiaCivil,
  puedePagarAhora,
  resumenDelCobro,
} from "./cobroDelSocio";

import { Button } from "@/components/ui/button";
import {
  EmptyState,
  InfoNote,
  Modal,
  Section,
  StatusBadge,
} from "@/components/kit";
import { soloFecha, soloFechaCivil } from "@/lib/horaDeLaEmpresa";
import {
  partnerBillingService,
  type CobroDelSocioActivo,
  type ResultadoDelCobro,
} from "@/lib/api/partnerBillingService";
import { formatMoney } from "@/lib/formatMoney";
import type { PreparacionDeTarjeta } from "@/lib/api/partnerBillingService";
import FormularioMercadoPago from "./FormularioMercadoPago";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «LE PAGO A MI PROVEEDOR» — la Facturación de una empresa de socio que cobra
 * en línea
 *
 * El socio de marca blanca cobra a sus empresas con SU pasarela (hoy Stripe).
 * Esta vista es lo que ve la oficina: estado, plan, tarjeta, pagar y recibos.
 *
 * ── MARCA BLANCA ──────────────────────────────────────────────────────────
 * Aquí no se nombra la plataforma en ningún texto: la empresa le compró el
 * producto a su proveedor y es a él a quien paga. Se dice «tu proveedor».
 *
 * ── STRIPE SE CARGA SÓLO AQUÍ ─────────────────────────────────────────────
 * `@stripe/stripe-js` entra con `import()` al abrir el formulario de tarjeta
 * o al confirmar un 3-D Secure, no en el paquete principal. Y la clave pública
 * es la de la cuenta DEL SOCIO, que llega del servidor.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Amounts in the partner's currency, punctuated as in its country (lib/formatMoney). */
function dinero(cents: number, currency = "USD") {
  return formatMoney(cents || 0, currency);
}

/** Un día civil (`YYYY-MM-DD`) o un instante, cada uno con su función. */
function fecha(v: string | null | undefined) {
  if (!v) return "—";

  return esDiaCivil(v)
    ? soloFechaCivil(v, { month: "long" })
    : soloFecha(v, { month: "long" });
}

async function cargarStripe(publicKey: string): Promise<Stripe> {
  const { loadStripe } = await import("@stripe/stripe-js");
  const stripe = await loadStripe(publicKey);

  if (!stripe) throw new Error("stripe-unavailable");

  return stripe;
}

/** El motivo de un cobro fallido, en el idioma de la persona. */
function motivoDelFallo(t: (k: string, o?: any) => string, kind?: string | null, code?: string | null): string {
  const c = String(code || "");
  if (c === "gateway_unavailable" || kind === "temporal") {
    return t("billing.partner.failTemporary", { defaultValue: "El sistema de pagos no respondió. Se reintentará automáticamente." });
  }
  if (kind === "configuracion" || c.startsWith("gateway_")) {
    return t("billing.partner.failProvider", {
      defaultValue: "No se pudo procesar el cobro por un problema del sistema de pagos de tu proveedor. No es tu tarjeta: ya le avisamos y se reintentará.",
    });
  }
  const porCodigo: Record<string, [string, string]> = {
    insufficient_funds: ["billing.partner.failFunds", "Tu tarjeta no tiene fondos suficientes."],
    expired_card: ["billing.partner.failExpired", "Tu tarjeta está vencida. Añade otra para pagar."],
    incorrect_details: ["billing.partner.failDetails", "Los datos de tu tarjeta no son correctos. Vuelve a añadirla."],
    card_blocked: ["billing.partner.failBlocked", "Tu banco bloqueó la tarjeta. Añade otra para pagar."],
    card_missing: ["billing.partner.failMissing", "Tu tarjeta guardada ya no está disponible. Vuelve a añadirla."],
    authentication_required: ["billing.partner.failAuth", "Tu banco pide confirmar el pago. Pulsa «Pagar ahora» para confirmarlo."],
  };
  const [clave, texto] = porCodigo[c] || ["billing.partner.failCard", "Tu banco rechazó la tarjeta. Paga o actualiza tu tarjeta."];
  return t(clave, { defaultValue: texto });
}

const MARCAS: Record<string, string> = {
  visa: "Visa", mastercard: "Mastercard", amex: "American Express", discover: "Discover",
  diners: "Diners Club", jcb: "JCB", unionpay: "UnionPay",
};
const marcaDeTarjeta = (b: string | null) => MARCAS[String(b || "").toLowerCase()] || b || "";

async function descargarRecibo(id: string, numero: string | null) {
  try {
    await partnerBillingService.descargarRecibo(id, numero);
  } catch {
    /* el apiService ya enseña el aviso de error */
  }
}

export default function PartnerBillingView({
  data,
  onRefresh,
}: {
  data: CobroDelSocioActivo;
  onRefresh: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [pagando, setPagando] = useState(false);

  const moneda = data.price?.currency || "USD";
  const plan = desgloseDelPlan(data);
  const accion = accionDeTarjeta(data);
  const status = data.status;

  const etiquetas: Record<string, string> = {
    trialing: t("billing.partner.status.trialing", {
      defaultValue: "Periodo de prueba",
    }),
    active: t("billing.partner.status.active", { defaultValue: "Al día" }),
    past_due: t("billing.partner.status.past_due", {
      defaultValue: "Pago pendiente",
    }),
    paused: t("billing.partner.status.paused", { defaultValue: "En pausa" }),
    exempt: t("billing.partner.status.exempt", {
      defaultValue: "Sin cobro en línea",
    }),
  };
  const conceptos: Record<string, string> = {
    inicio: t("billing.partner.kind.inicio", {
      defaultValue: "Alta y primer mes",
    }),
    renovacion: t("billing.partner.kind.renovacion", {
      defaultValue: "Renovación mensual",
    }),
    asientos: t("billing.partner.kind.asientos", {
      defaultValue: "Usuarios añadidos",
    }),
  };
  const estadosDeRecibo: Record<string, string> = {
    paid: t("billing.invStatusPaid", { defaultValue: "Pagada" }),
    open: t("billing.invStatusOpen", { defaultValue: "Pendiente" }),
    void: t("billing.invStatusVoid", { defaultValue: "Anulada" }),
    // The provider refunded it in its own gateway.
    refunded: t("billing.invStatusRefunded", { defaultValue: "Reembolsada" }),
  };

  /**
   * Guardar la tarjeta y pagar devuelven lo mismo: el servidor intenta cobrar
   * lo pendiente en el acto. Si el banco pide 3-D Secure, el titular lo
   * confirma aquí mismo y se avisa al servidor con el id del cargo.
   */
  const atenderResultado = async (r: ResultadoDelCobro) => {
    const resumen = resumenDelCobro(r);

    if (resumen.cobradas > 0)
      toast.success(
        t("billing.partner.paidOk", {
          defaultValue: "Pago realizado. ¡Gracias!",
        }),
      );

    if (r.requiereAccion?.clientSecret) {
      try {
        const stripe = await cargarStripe(
          r.requiereAccion.publicKey || data.gateway.publicKey,
        );
        const res = await stripe.confirmCardPayment(
          r.requiereAccion.clientSecret,
        );

        if (res.error || !res.paymentIntent) {
          toast.error(
            res.error?.message ||
              t("billing.partner.authFailed", {
                defaultValue:
                  "Tu banco no confirmó el pago. Inténtalo de nuevo o usa otra tarjeta.",
              }),
          );
        } else {
          const c = await partnerBillingService.confirmarPago(
            r.requiereAccion.invoiceId,
            res.paymentIntent.id,
          );

          if (c.estado === "pagada")
            toast.success(
              t("billing.partner.paidOk", {
                defaultValue: "Pago realizado. ¡Gracias!",
              }),
            );
          else
            toast.error(
              t("billing.partner.declined", {
                defaultValue:
                  "El pago fue rechazado. Prueba con otra tarjeta o contacta a tu banco.",
              }),
            );
        }
      } catch (e: any) {
        toast.error(
          e?.message && e.message !== "stripe-unavailable"
            ? e.message
            : t("billing.partner.stripeLoadError", {
                defaultValue:
                  "No se pudo cargar el formulario de pago. Revisa tu conexión y vuelve a intentarlo.",
              }),
        );
      }
    } else if (resumen.motivos.length > 0) {
      toast.error(
        t("billing.partner.chargeFailed", {
          defaultValue: "No se pudo cobrar: {{motivo}}",
          motivo: resumen.motivos.join(" · "),
        }),
      );
    } else if (resumen.cobradas === 0 && data.amountDueCents === 0) {
      // Tarjeta guardada sin nada pendiente: sólo confirmar que quedó puesta.
      toast.success(
        t("billing.partner.cardSaved", {
          defaultValue: "Tarjeta guardada.",
        }),
      );
    }

    await onRefresh();
  };

  const pagarAhora = async () => {
    setPagando(true);
    try {
      await atenderResultado(await partnerBillingService.pagar());
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("billing.partner.payError", {
            defaultValue: "No se pudo procesar el pago",
          }),
      );
    } finally {
      setPagando(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="partner-billing">
      {/* ── Estado ───────────────────────────────────────────────────── */}
      <Section
        action={
          <StatusBadge tone={TONO_DEL_ESTADO[status] || "neutral"}>
            {etiquetas[status] || status}
          </StatusBadge>
        }
        icon={<ShieldCheck />}
        title={t("billing.partner.title", {
          defaultValue: "Tu suscripción con tu proveedor",
        })}
      >
        {status === "trialing" && (
          <InfoNote icon={<Clock />} tone="info">
            {data.trialEndsAt
              ? t("billing.partner.trialUntil", {
                  defaultValue: "Tu periodo de prueba termina el {{fecha}}.",
                  fecha: fecha(data.trialEndsAt),
                })
              : t("billing.partner.trial", {
                  defaultValue: "Estás en periodo de prueba.",
                })}{" "}
            {!data.card &&
              t("billing.partner.trialAddCard", {
                defaultValue:
                  "Añade una tarjeta antes de esa fecha para que el servicio siga sin cortes.",
              })}
          </InfoNote>
        )}
        {status === "active" && (
          <InfoNote icon={<CheckCircle2 />} tone="ok">
            {t("billing.partner.activeMsg", {
              defaultValue:
                "Tu suscripción está al día. Se cobra automáticamente cada mes.",
            })}
          </InfoNote>
        )}
        {status === "past_due" && (
          <InfoNote icon={<AlertTriangle />} tone="warn">
            {t("billing.partner.pastDueMsg", {
              defaultValue:
                "Tienes un pago pendiente de {{importe}}. Si no se paga en {{dias}} días, el sistema se pausará.",
              importe: dinero(data.amountDueCents, moneda),
              dias: data.price?.graceDays ?? 0,
            })}
          </InfoNote>
        )}
        {/* PAUSADA SIN DEUDA: se acabó la prueba y no había tarjeta. Decir
            «por falta de pago… hay $0.00 pendientes» confundía (E2E de
            facturas del socio, 2026-09-29): no debe nada, le falta la tarjeta. */}
        {status === "paused" && !(data.amountDueCents > 0) && (
          <InfoNote
            icon={<PauseCircle />}
            title={t("billing.partner.pausedTrialTitle", {
              defaultValue: "Tu periodo de prueba terminó",
            })}
            tone="bad"
          >
            {t("billing.partner.pausedTrialMsg", {
              defaultValue:
                "Para seguir usando este panel, añade una tarjeta. Mientras tanto las apps de campo (vigilantes, supervisores y clientes) siguen funcionando con normalidad. En cuanto la pongas, se reactiva al momento.",
            })}
          </InfoNote>
        )}
        {status === "paused" && data.amountDueCents > 0 && (
          <InfoNote
            icon={<PauseCircle />}
            title={t("billing.partner.pausedTitle", {
              defaultValue: "El sistema está en pausa por falta de pago",
            })}
            tone="bad"
          >
            {t("billing.partner.pausedMsg", {
              defaultValue:
                "Hay {{importe}} pendientes. Mientras tanto no se puede usar este panel, pero las apps de campo (vigilantes, supervisores y clientes) siguen funcionando con normalidad. Paga o actualiza tu tarjeta para reactivarlo al momento.",
              importe: dinero(data.amountDueCents, moneda),
            })}
          </InfoNote>
        )}
        {status === "exempt" && (
          <InfoNote icon={<CheckCircle2 />} tone="neutral">
            {t("billing.partner.exemptMsg", {
              defaultValue:
                "Tu proveedor no te cobra en línea por ahora. Si tienes dudas sobre tu plan, escríbele directamente.",
            })}
          </InfoNote>
        )}

        {puedePagarAhora(data) && (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <div className="font-semibold">
                {t("billing.partner.amountDue", {
                  defaultValue: "Pendiente de pago",
                })}
              </div>
              <div
                className="font-display text-lg font-bold tabular-nums"
                style={{ color: "var(--brand-text)" }}
              >
                {dinero(data.amountDueCents, moneda)}
              </div>
            </div>
            <Button disabled={pagando} variant="brand" onClick={pagarAhora}>
              {pagando ? (
                <Loader2 className="mr-2 animate-spin" size={16} />
              ) : (
                <Wallet className="mr-2" size={16} />
              )}
              {t("billing.partner.payNow", { defaultValue: "Pagar ahora" })}
            </Button>
          </div>
        )}
      </Section>

      {/* ── Tu plan ──────────────────────────────────────────────────── */}
      <Section
        icon={<Wallet />}
        title={t("billing.costTitle", { defaultValue: "Tu plan" })}
      >
        <div className="glass-flat glass-brand space-y-3 p-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span style={{ color: "var(--ink-soft)" }}>
              {dinero(data.price?.perUserCents || 0, moneda)} ×{" "}
              {t("ui.BillingPage.nUsuarios", {
                defaultValue: "{{count}} usuarios",
                count: data.seatsNow || 0,
              })}
            </span>
            <span className="tabular-nums">
              {dinero(plan.porUsuarios, moneda)}
            </span>
          </div>
          {plan.cuotaMensual > 0 && (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span style={{ color: "var(--ink-soft)" }}>
                {t("billing.partner.monthlyFee", {
                  defaultValue: "Cuota mensual",
                })}
              </span>
              <span className="tabular-nums">
                {dinero(plan.cuotaMensual, moneda)}
              </span>
            </div>
          )}
          <div
            className="flex items-center justify-between gap-3 border-t pt-3 text-base font-semibold"
            style={{ borderColor: "var(--brand-line)" }}
          >
            <span>
              {t("billing.partner.nextCharge", {
                defaultValue: "Próximo cobro estimado",
              })}
            </span>
            <span className="font-display tabular-nums">
              {dinero(data.nextChargeCents, moneda)}
            </span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="glass-flat flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span
              className="flex items-center gap-2"
              style={{ color: "var(--ink-soft)" }}
            >
              <Clock size={15} />{" "}
              {t("billing.partner.renewal", { defaultValue: "Renovación" })}
            </span>
            <span className="font-semibold tabular-nums">
              {data.cycle?.end
                ? fecha(data.cycle.end)
                : status === "trialing" && data.trialEndsAt
                  ? fecha(data.trialEndsAt)
                  : "—"}
            </span>
          </div>
          {data.price?.setupFeeCents > 0 && (
            <div className="glass-flat flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span
                className="flex items-center gap-2"
                style={{ color: "var(--ink-soft)" }}
              >
                <Sparkles size={15} />{" "}
                {t("billing.implementation", {
                  defaultValue: "Puesta en marcha (pago único)",
                })}
              </span>
              <span className="flex items-center gap-2 font-semibold tabular-nums">
                {dinero(data.price.setupFeeCents, moneda)}
                <StatusBadge tone={data.setupFeePending ? "warn" : "ok"}>
                  {data.setupFeePending
                    ? t("billing.invStatusOpen", { defaultValue: "Pendiente" })
                    : t("billing.invStatusPaid", { defaultValue: "Pagada" })}
                </StatusBadge>
              </span>
            </div>
          )}
        </div>

        <p className="pt-3 text-xs" style={{ color: "var(--ink-faint)" }}>
          {t("billing.partner.planNote", {
            defaultValue:
              "Se cobra cada mes por los usuarios activos. Si añades usuarios a mitad de mes, se cobra la parte proporcional.",
          })}
        </p>
      </Section>

      {/* ── Tarjeta ──────────────────────────────────────────────────── */}
      <Section
        icon={<CreditCard />}
        title={t("billing.partner.cardTitle", {
          defaultValue: "Método de pago",
        })}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {data.card ? (
            <div className="min-w-0 text-sm">
              <div className="font-semibold capitalize">
                {data.card.brand ||
                  t("billing.partner.card", { defaultValue: "Tarjeta" })}{" "}
                <span className="tabular-nums">•••• {data.card.last4}</span>
              </div>
              {data.card.expMonth && data.card.expYear && (
                <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
                  {t("billing.partner.cardExpires", {
                    defaultValue: "Vence {{mm}}/{{aa}}",
                    mm: String(data.card.expMonth).padStart(2, "0"),
                    aa: String(data.card.expYear).slice(-2),
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm" style={{ color: "var(--ink-soft)" }}>
              {t("billing.partner.noCard", {
                defaultValue: "Aún no has añadido una tarjeta.",
              })}
            </div>
          )}

          {accion !== "unsupported" && (
            <Button
              variant={data.card ? "outline" : "brand"}
              onClick={() => setFormularioAbierto(true)}
            >
              <CreditCard className="mr-2" size={16} />
              {accion === "replace"
                ? t("billing.partner.replaceCard", {
                    defaultValue: "Cambiar tarjeta",
                  })
                : data.amountDueCents > 0
                  ? t("billing.partner.addCardAndPay", {
                      defaultValue: "Añadir tarjeta y pagar",
                    })
                  : t("billing.partner.addCard", {
                      defaultValue: "Añadir tarjeta",
                    })}
            </Button>
          )}
        </div>

        {accion === "unsupported" && (
          <InfoNote className="mt-3" icon={<AlertTriangle />} tone="neutral">
            {t("billing.partner.gatewayUnsupported", {
              defaultValue:
                "El formulario de tarjeta todavía no está disponible para {{pasarela}}. Tu proveedor te indicará cómo pagar.",
              pasarela: data.gateway?.name || data.gateway?.provider,
            })}
          </InfoNote>
        )}

        <p className="pt-3 text-xs" style={{ color: "var(--ink-faint)" }}>
          {t("billing.partner.cardNote", {
            defaultValue:
              "Tu tarjeta la guarda de forma segura la pasarela de pago de tu proveedor; aquí nunca se almacena el número.",
          })}
        </p>
      </Section>

      {/* ── Recibos ──────────────────────────────────────────────────── */}
      <Section
        icon={<Receipt />}
        title={t("billing.partner.receiptsTitle", {
          defaultValue: "Recibos",
        })}
      >
        {data.invoices.length === 0 ? (
          <EmptyState
            description={t("billing.partner.receiptsEmptyDesc", {
              defaultValue: "Cuando se genere tu primer cobro aparecerá aquí.",
            })}
            icon={<FileText />}
            title={t("billing.partner.receiptsEmpty", {
              defaultValue: "Aún no hay recibos",
            })}
          />
        ) : (
          <div className="space-y-2">
            {data.invoices.map((inv) => (
              <div
                key={inv.id}
                className="glass-flat flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {inv.number || "—"}
                    </span>
                    <StatusBadge
                      tone={TONO_DEL_RECIBO[inv.status] || "neutral"}
                    >
                      {estadosDeRecibo[inv.status] || inv.status}
                    </StatusBadge>
                  </div>
                  <div
                    className="mt-0.5 text-xs"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {fecha(inv.paidAt || inv.issuedAt)} ·{" "}
                    {conceptos[inv.kind] || inv.kind}
                  </div>
                  {/* El motivo en palabras de persona, NUNCA el texto de la
                      pasarela («Invalid API Key provided…» llegaba tal cual). */}
                  {inv.status === "open" && (inv.lastErrorKind || inv.lastErrorCode) && (
                    <div
                      className="mt-1 text-xs"
                      style={{ color: inv.lastErrorKind === "configuracion" ? "var(--ink-soft)" : "var(--bad-text)" }}
                    >
                      {motivoDelFallo(t, inv.lastErrorKind, inv.lastErrorCode)}
                    </div>
                  )}
                  {inv.status === "paid" && inv.paidCard && (
                    <div className="mt-1 text-xs" style={{ color: "var(--ink-soft)" }}>
                      {t("billing.partner.paidWith", {
                        defaultValue: "Pagado con {{marca}} ···· {{ultimos}}",
                        marca: marcaDeTarjeta(inv.paidCard.brand),
                        ultimos: inv.paidCard.last4,
                      })}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {dinero(
                    inv.status === "paid" || inv.status === "refunded"
                      ? inv.amountPaidCents || inv.totalCents
                      : inv.totalCents - (inv.amountPaidCents || 0),
                    inv.currency || moneda,
                  )}
                </span>
                  <button
                    type="button"
                    className="rounded-md border px-2 py-1 text-xs font-semibold"
                    style={{ borderColor: "var(--line)", color: "var(--ink-soft)" }}
                    onClick={() => void descargarRecibo(inv.id, inv.number)}
                    aria-label={t("billing.partner.downloadReceipt", { defaultValue: "Descargar la factura en PDF" })}
                  >
                    PDF
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Modal
        description={t("billing.partner.cardModalDesc", {
          defaultValue:
            "Se usará para los cobros mensuales. Si tienes algo pendiente, se cobra al guardarla.",
        })}
        icon={<CreditCard />}
        open={formularioAbierto}
        title={
          accion === "replace"
            ? t("billing.partner.replaceCard", {
                defaultValue: "Cambiar tarjeta",
              })
            : t("billing.partner.addCard", { defaultValue: "Añadir tarjeta" })
        }
        onOpenChange={setFormularioAbierto}
      >
        {formularioAbierto && (
          <FormularioDeTarjeta
            onCancel={() => setFormularioAbierto(false)}
            onSaved={async (r) => {
              setFormularioAbierto(false);
              await atenderResultado(r);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

/**
 * El campo de tarjeta de Stripe (Elements), montado con la clave pública DEL
 * SOCIO que devuelve `card/setup` junto al SetupIntent. El número nunca pasa
 * por nuestro servidor: Stripe devuelve un `pm_…` y eso es lo que se guarda.
 */
function FormularioDeTarjeta({
  onSaved,
  onCancel,
}: {
  onSaved: (r: ResultadoDelCobro) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const hueco = useRef<HTMLDivElement>(null);
  const [listo, setListo] = useState<{
    stripe: Stripe;
    card: StripeCardElement;
    clientSecret: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // El socio cobra con Mercado Pago: otro formulario, mismo camino al servidor.
  const [mp, setMp] = useState<PreparacionDeTarjeta | null>(null);

  useEffect(() => {
    let vivo = true;
    let card: StripeCardElement | null = null;

    (async () => {
      try {
        const prep = await partnerBillingService.prepararTarjeta();

        if (prep.provider === "mercadopago") {
          if (vivo) setMp(prep);

          return;
        }
        const stripe = await cargarStripe(prep.publicKey);

        if (!vivo || !hueco.current) return;
        // El campo vive en un iframe de Stripe: no hereda nuestras variables
        // CSS, así que se le pasa el color ya resuelto del contenedor.
        const estilo = getComputedStyle(hueco.current);

        card = stripe.elements().create("card", {
          style: {
            base: {
              color: estilo.color,
              fontSize: "15px",
              fontFamily: "Inter, system-ui, -apple-system, sans-serif",
              "::placeholder": { color: estilo.color, opacity: "0.45" } as any,
            },
          },
        });
        card.mount(hueco.current);
        card.on("change", (e) => setError(e.error?.message ?? null));
        setListo({ stripe, card, clientSecret: prep.clientSecret });
      } catch (e: any) {
        if (!vivo) return;
        /* Un fallo del SERVIDOR al preparar la tarjeta (la pasarela del
           proveedor no acepta sus claves, o no responde) se dice en palabras
           de persona; su texto técnico no le sirve a nadie aquí. */
        const delServidor = !!(e?.response || e?.status);
        setError(
          delServidor
            ? t("billing.partner.cardProviderNotReady", {
                defaultValue:
                  "Ahora mismo no se puede añadir una tarjeta: el sistema de pagos de tu proveedor no está disponible. Ya le avisamos; vuelve a intentarlo más tarde.",
              })
            : e?.message && e.message !== "stripe-unavailable"
            ? e.message
            : t("billing.partner.stripeLoadError", {
                defaultValue:
                  "No se pudo cargar el formulario de pago. Revisa tu conexión y vuelve a intentarlo.",
              }),
        );
      }
    })();

    return () => {
      vivo = false;
      try {
        card?.destroy();
      } catch {
        /* ya desmontado */
      }
    };
  }, []);

  const guardar = async () => {
    if (!listo) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await listo.stripe.confirmCardSetup(listo.clientSecret, {
        payment_method: { card: listo.card },
      });

      if (r.error) {
        setError(r.error.message || null);

        return;
      }
      const pm = r.setupIntent?.payment_method;
      const token = typeof pm === "string" ? pm : pm?.id;

      if (!token) throw new Error();
      await onSaved(await partnerBillingService.confirmarTarjeta(token));
    } catch (e: any) {
      setError(
        e?.message ||
          t("billing.partner.cardError", {
            defaultValue: "No se pudo guardar la tarjeta. Revisa los datos.",
          }),
      );
    } finally {
      setGuardando(false);
    }
  };

  if (mp)
    return <FormularioMercadoPago prep={mp} onCancel={onCancel} onSaved={onSaved} />;

  return (
    <div className="space-y-4">
      <div
        ref={hueco}
        className="cg-input min-h-[42px] w-full px-3 py-3 text-sm"
        style={{ color: "var(--ink)" }}
      />
      {!listo && !error && (
        <div
          className="flex items-center gap-2 text-xs"
          style={{ color: "var(--ink-soft)" }}
        >
          <Loader2 className="animate-spin" size={14} />
          {t("billing.partner.loadingForm", {
            defaultValue: "Cargando el formulario seguro…",
          })}
        </div>
      )}
      {error && (
        <InfoNote icon={<AlertTriangle />} tone="bad">
          {error}
        </InfoNote>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button disabled={guardando} variant="outline" onClick={onCancel}>
          {t("common.cancel", { defaultValue: "Cancelar" })}
        </Button>
        <Button
          disabled={!listo || guardando}
          variant="brand"
          onClick={guardar}
        >
          {guardando ? (
            <Loader2 className="mr-2 animate-spin" size={16} />
          ) : (
            <ShieldCheck className="mr-2" size={16} />
          )}
          {t("billing.partner.saveCard", { defaultValue: "Guardar tarjeta" })}
        </Button>
      </div>
    </div>
  );
}
