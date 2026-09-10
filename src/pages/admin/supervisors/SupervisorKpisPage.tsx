import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import AppLayout from "@/layouts/app-layout";
import GuardsLayout from "@/layouts/GuardsLayout";
import GuardPerformancePanel from "@/pages/admin/security-guards/components/GuardKPIs/GuardPerformancePanel";

/**
 * Supervisor "Indicadores" tab — reuses the guard performance panel, which is
 * already supervisor-aware (it scores a supervisor user id via
 * PerformanceService.getSupervisor). The route :id is the supervisor's user id.
 */
export default function SupervisorKpisPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();

  return (
    <AppLayout>
      <GuardsLayout
        navKey="supervisors"
        title={t(
          "ui.SupervisorKpisPage.indicadoresDelSupervisor",
          "Indicadores del supervisor",
        )}
      >
        <div className="mx-auto max-w-5xl pb-24">
          <GuardPerformancePanel supervisorUserId={id} />
        </div>
      </GuardsLayout>
    </AppLayout>
  );
}
