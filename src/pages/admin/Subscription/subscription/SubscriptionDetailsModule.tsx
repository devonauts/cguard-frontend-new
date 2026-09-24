import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Sparkles, CreditCard, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { localeActual } from "@/lib/localeActual";
import {
  PageContainer,
  PageHeader,
  Section,
  Field,
  StatusBadge,
  GlassPanel,
  IconTile,
  Segmented,
  SkeletonBlock,
} from "@/components/kit";
import {
  subscriptionBillingService,
  BillingSummary,
  claveDelPlan,
  nombreDelPlan,
} from "@/lib/api/subscriptionBillingService";
import ProviderManagedBilling from "@/components/ProviderManagedBilling";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";

type BillingPeriod = "monthly" | "annual";
type PlanKey = "essential" | "advance" | "professional";

const PLAN_LABEL: Record<PlanKey, string> = {
  essential: "Essential",
  advance: "Advance",
  professional: "Professional",
};

const MONTHLY_PRICE: Record<PlanKey, number> = {
  essential: 5,
  advance: 8,
  professional: 10,
};

const ANNUAL_PRICE: Record<PlanKey, number> = {
  essential: 4.25,
  advance: 6.8,
  professional: 8.5,
};

/**
 * Tonos SEMÁNTICOS, no nombres de color. `StatusBadge` todavía acepta
 * «blue»/«green»/«red» por compatibilidad y los remapea, pero escribirlos aquí
 * hace creer que el estado de una suscripción elige un color cuando lo que
 * elige es un SIGNIFICADO: «pago vencido» es malo, y tiene que seguir siendo
 * rojo aunque la empresa ponga el acento en rojo.
 */
type BadgeTone = "info" | "ok" | "bad" | "warn" | "neutral";
const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  trialing: { label: "Prueba gratuita", tone: "info" },
  active: { label: "Activo", tone: "ok" },
  past_due: { label: "Pago vencido", tone: "bad" },
  trial_expired: { label: "Prueba expirada", tone: "warn" },
  canceled: { label: "Cancelado", tone: "neutral" },
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);

  if (isNaN(d.getTime())) return "—";

  return d.toLocaleDateString(localeActual(), { timeZone: zonaDeLaEmpresa(),
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function SubscriptionDetailsModule() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [data, setData] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const summary = await subscriptionBillingService.summary();

        if (active) setData(summary);
      } catch {
        if (active)
          toast.error(t("ui.SubscriptionDetailsModule.noSePudoCargarLa"));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const isAnnual = period === "annual";
  const priceByPeriod = useMemo(
    () => (isAnnual ? ANNUAL_PRICE : MONTHLY_PRICE),
    [isAnnual],
  );

  // The real backend uses a per-seat pricing model, not the tiered
  // essential/advance/professional plans shown below — so plan purchases
  // are NOT wired here. Highlight the current tier only if it maps.
  const currentPlan: PlanKey | null = useMemo(() => {
    const key = claveDelPlan(data?.plan)?.toLowerCase();

    if (key && key in PLAN_LABEL) return key as PlanKey;

    return null;
  }, [data]);

  const status = data?.status || "trialing";
  const meta = STATUS_META[status] || STATUS_META.trialing;
  const goToBilling = () => navigate("/setting/billing");

  /* A las empresas que trae un distribuidor las factura ÉL. Nada de lo que hay
     debajo —la oferta, el precio por usuario, los planes por niveles, el
     periodo de prueba, «gestionar suscripción»— significa nada para ellas: son
     condiciones de una relación comercial que no tienen con nosotros. */
  const esDeProveedor =
    data?.billingOwnership === "reseller" || status === "reseller_managed";

  if (!loading && esDeProveedor) {
    return (
      <PageContainer width="wide">
        <PageHeader
          icon={<CreditCard />}
          subtitle={t("billing.managedByProvider.subtitle", {
            defaultValue: "Tu proveedor gestiona tu plan y tu facturación",
          })}
          title={t("ui.SubscriptionDetailsModule.suscripcion", "Suscripción")}
        />
        <ProviderManagedBilling
          managedBy={data?.managedBy}
          plan={nombreDelPlan(data?.plan)}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="wide">
      <PageHeader
        icon={<CreditCard />}
        subtitle={t("ui.SubscriptionDetailsModule.gestionaTuPlanPeriodoDe")}
        title={t("ui.SubscriptionDetailsModule.suscripcion", "Suscripción")}
      />

      {/* Banner */}
      <GlassPanel brand className="p-4">
        <div className="flex items-start gap-3">
          <IconTile size="sm">
            <Sparkles />
          </IconTile>
          <p className="text-sm leading-relaxed">
            <span className="font-semibold">Oferta especial.</span> Mejora tu
            plan ahora y obtén un 15 % de descuento durante los próximos 3
            meses. El cobro se calcula sobre el número de usuarios activos.{" "}
            <button
              className="font-medium underline-offset-2 hover:underline"
              style={{ color: "var(--brand-text)" }}
              onClick={goToBilling}
            >
              Ver detalles
            </button>
          </p>
        </div>
      </GlassPanel>

      {/* Información de suscripción */}
      <Section
        action={
          <Button variant="outline" onClick={goToBilling}>
            {t(
              "ui.SubscriptionDetailsModule.gestionarSuscripcion",
              "Gestionar Suscripción",
            )}
          </Button>
        }
        icon={<CreditCard />}
        title={t(
          "ui.SubscriptionDetailsModule.informacionDeSuscripcion",
          "Información de suscripción",
        )}
      >
        {loading ? (
          // Barras fantasma con la forma de los cuatro campos, no una ruleta:
          // el bloque no salta de altura cuando llegan los datos.
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <SkeletonBlock className="h-2.5 w-20" />
                <SkeletonBlock className="h-4 w-32" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
            <Field
              label="Plan"
              value={
                nombreDelPlan(data?.plan) ||
                (currentPlan ? PLAN_LABEL[currentPlan] : "—")
              }
            />
            <Field
              label={t(
                "ui.SubscriptionDetailsModule.periodoDePrueba",
                "Periodo de prueba",
              )}
              value={
                data?.trial?.endsAt
                  ? `Termina el ${fmtDate(data.trial.endsAt)}`
                  : "—"
              }
            />
            <div className="min-w-0">
              <div className="cg-eyebrow mb-0.5">
                {t(
                  "ui.SubscriptionDetailsModule.estadoDeLaSuscripcion",
                  "Estado de la Suscripción",
                )}
              </div>
              <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
            </div>
            <Field
              label="Usuarios facturables"
              value={String(data?.seats ?? "—")}
            />
          </div>
        )}

        <Separator className="my-6" />

        {/* Selector Mensual / Anual */}
        <div className="flex justify-center">
          <Segmented<BillingPeriod>
            options={[
              { value: "monthly", label: "Mensual" },
              { value: "annual", label: "Anual" },
            ]}
            value={period}
            onChange={setPeriod}
          />
        </div>

        {/* Nota: la contratación real de la suscripción se gestiona en la
            página de Suscripción (facturación por usuario con Stripe). Los
            planes por niveles de abajo son referenciales y no se pueden
            comprar desde aquí. */}
        <p
          className="mt-4 rounded-lg border border-dashed px-3 py-2 text-center text-xs"
          style={{
            borderColor: "var(--hairline)",
            background: "var(--glass-sunken)",
            color: "var(--ink-soft)",
          }}
        >
          Los cambios de plan y pagos se gestionan en{" "}
          <button
            className="font-medium underline-offset-2 hover:underline"
            style={{ color: "var(--brand-text)" }}
            onClick={goToBilling}
          >
            {t(
              "ui.SubscriptionDetailsModule.suscripcionFacturacion",
              "Suscripción / Facturación",
            )}
          </button>
          .
        </p>

        {/* Planes (referenciales) */}
        <div className="mt-6 grid md:grid-cols-3 gap-6">
          {(["essential", "advance", "professional"] as PlanKey[]).map(
            (plan) => {
              const price = priceByPeriod[plan];
              const isCurrent = plan === currentPlan;
              const isPopular = plan === "professional";

              return (
                // `GlassPanel flat` y no `Card`. `Card` trae `.glass` cosido
                // dentro, y `.glass` lleva `backdrop-filter`: dentro de este
                // `map()` eso son tres superficies desenfocadas —una por plan—
                // y el desenfoque no se veía en el JSX, que es justo lo que lo
                // hacía fácil de pasar por alto. `flat` deja el mismo aspecto
                // sin rasterizar el fondo en cada fotograma.
                <GlassPanel
                  key={plan}
                  flat
                  hover
                  brand={isPopular}
                  className="flex flex-col gap-4 p-6"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{PLAN_LABEL[plan]}</h3>
                    {isPopular && (
                      <StatusBadge dot={false} tone="brand">
                        POPULAR
                      </StatusBadge>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="font-display text-3xl font-bold">
                      {isAnnual ? `$${price.toFixed(2)}` : `$${price}`}
                      <span className="text-base font-normal text-muted-foreground">
                        {" "}
                        / mes / usuario
                      </span>
                    </div>
                    {isAnnual && (
                      <div className="text-xs text-muted-foreground">
                        + 15% Descuento en todos los complementos
                      </div>
                    )}
                  </div>

                  <div className="mt-auto">
                    {isCurrent ? (
                      <Button disabled className="w-full" variant="brand">
                        <Check className="h-4 w-4 mr-1.5" /> Plan Actual
                      </Button>
                    ) : (
                      <Button
                        disabled
                        className="w-full"
                        title={t(
                          "ui.SubscriptionDetailsModule.gestionaTuPlanEnSuscripcion",
                          "Gestiona tu plan en Suscripción / Facturación",
                        )}
                        variant={isPopular ? "brand" : "outline"}
                      >
                        {t("ui.Reports.proximamente", "Próximamente")}
                      </Button>
                    )}
                  </div>
                </GlassPanel>
              );
            },
          )}
        </div>
      </Section>
    </PageContainer>
  );
}
