import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import AppLayout from "@/layouts/app-layout";
import GuardsLayout from "@/layouts/GuardsLayout";
import GuardPerformancePanel from "@/pages/admin/security-guards/components/GuardKPIs/GuardPerformancePanel";

/**
 * Desempeño — surfaces the real 8-factor performance panel for the guard.
 * The panel fetches GET /security-guard/:id/performance and renders the score,
 * tier and factor bars; it also carries its own period. :id = securityGuard id.
 */
export default function GuardDesempenoPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();

  return (
    <AppLayout>
      <GuardsLayout navKey="keep-safe" title="guards.nav.desempeno">
        <div className="mx-auto max-w-5xl space-y-3 pb-24">
          <p className="text-sm text-muted-foreground">
            {t(
              "ui.GuardDesempenoPage.descripcion",
              "Indicador de desempeño del vigilante — puntaje, nivel y los factores que lo componen (puntualidad, uniforme, inventario, consignas, rondas, evaluaciones y capacitación).",
            )}
          </p>
          <GuardPerformancePanel securityGuardId={id} />
        </div>
      </GuardsLayout>
    </AppLayout>
  );
}
