import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Gift } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import {
  extractOnboardingTenant,
  trialDaysLeft,
  isTrialing,
  esFacturadaPorProveedor,
} from "@/components/onboarding/onboardingUtils";

/**
 * Small persistent header pill showing "Prueba: N días" while the tenant's
 * billingStatus === 'trialing'. Hidden once the subscription is active.
 */
export default function TrialDaysBadge() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const tenant = useMemo(() => extractOnboardingTenant(user), [user]);

  if (!tenant || !isTrialing(tenant.billingStatus)) return null;
  // Free tier («Plan gratis»): no trial to count down, nothing to pay.
  if (tenant.freeTier) return null;
  /* A una empresa que factura su distribuidor no se le enseña el aviso de
     prueba de CGuard Pro: esa prueba es de una relación de cobro que no tiene
     con nosotros, y el aviso lleva a una pantalla de pago que no le sirve.
     Puede pasar en una empresa que ya existía y se pasó a un distribuidor con
     la prueba todavía corriendo. */
  if (esFacturadaPorProveedor(tenant.billingOwnership)) return null;

  const days = trialDaysLeft(tenant.trialEndsAt);

  if (days == null) return null;

  const urgent = days <= 3;
  const label =
    days > 0
      ? t("billing.trialBadge", {
          defaultValue: "Prueba: {{n}} día(s)",
          n: days,
        })
      : t("billing.trialBadgeToday", { defaultValue: "Prueba: termina hoy" });

  return (
    <button
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
        urgent
          ? "border-red-300 bg-red-500/10 text-red-600 hover:bg-red-500/15 dark:border-red-900"
          : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15",
      ].join(" ")}
      title={t("billing.trialBadgeTitle", {
        defaultValue: "Ver detalles de tu prueba y suscripción",
      })}
      type="button"
      onClick={() => navigate("/setting/billing")}
    >
      <Gift className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">
        {days > 0
          ? `${days}d`
          : t("billing.trialBadgeShortToday", { defaultValue: "hoy" })}
      </span>
    </button>
  );
}
