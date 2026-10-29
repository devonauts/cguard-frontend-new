import { useTranslation } from "react-i18next";
import { Gift } from "lucide-react";

import { GlassPanel, IconTile, Section } from "@/components/kit";
import { useWhiteLabel } from "@/contexts/WhiteLabelContext";

/**
 * «Plan gratis» — what the billing screen shows to a company CGuard Pro gives
 * the service to at no cost (set by a platform superadmin only).
 *
 * Deliberately short: no seats, no prices, no trial, no card, no «activate»
 * button and no reason — there is nothing to pay and nothing to manage here.
 * The product name comes from the host (`{{marca}}`): on a partner's host the
 * partner's name is shown, never ours.
 */
export default function FreePlanBilling() {
  const { t } = useTranslation();
  const { platformName } = useWhiteLabel();

  return (
    <Section
      icon={<Gift />}
      title={t("billing.free.title", { defaultValue: "Plan gratis" })}
    >
      <GlassPanel brand className="p-4" data-testid="free-plan">
        <div className="flex items-start gap-3">
          <IconTile size="sm">
            <Gift />
          </IconTile>
          <p className="text-sm leading-relaxed">
            <span className="font-semibold">
              {t("billing.free.title", { defaultValue: "Plan gratis" })}
            </span>{" "}
            —{" "}
            {t("billing.free.body", {
              defaultValue:
                "{{marca}} le da el servicio sin costo a tu empresa.",
              marca: platformName,
            })}
          </p>
        </div>
      </GlassPanel>
    </Section>
  );
}
