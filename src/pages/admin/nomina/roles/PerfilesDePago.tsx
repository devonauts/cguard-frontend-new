/**
 * ROLES DE PAGO — los perfiles de pago de toda la empresa (vigilantes,
 * supervisores y oficina) en una sola tabla, con el sueldo en la fila y la
 * ficha completa en un modal.
 */
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { PageContainer, PageHeader, SkeletonCards } from "@/components/kit";
import { usePermissions } from "@/hooks/usePermissions";
import payrollSlipsService from "@/lib/api/payrollSlipsService";
import { PresentacionDelModulo, useModuloRoles } from "./comun";
import { TablaDePerfiles } from "./TablaDePerfiles";

export default function PerfilesDePago() {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("payrollProfileEdit");
  const vista = useQuery({ queryKey: ["payroll-slips", "settings"], queryFn: () => payrollSlipsService.settings(), retry: false });
  const { sinModulo } = useModuloRoles(vista.error);

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          icon={<Users />}
          title={t("ui.RolesDePago.perfiles.titulo", "Perfiles de pago")}
          subtitle={t("ui.RolesDePago.perfiles.subtitulo", "Sueldo, vínculo y datos legales de cada persona. Quien no tenga sueldo propio cobra el sueldo base de la empresa.")}
        />
        {sinModulo ? (
          <PresentacionDelModulo />
        ) : vista.isLoading || !vista.data ? (
          <SkeletonCards count={3} />
        ) : (
          <TablaDePerfiles canEdit={canEdit} settings={vista.data.settings} />
        )}
      </PageContainer>
    </AppLayout>
  );
}
