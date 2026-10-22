import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { EmptyState, PageContainer } from "@/components/kit";

/**
 * Lo que ve un GERENTE DE SUCURSAL donde se paga o se contrata: un aviso
 * claro en vez de botones que el servidor rechazaría. Lo hace un administrador
 * de la principal.
 */
export default function AvisoSoloPrincipal() {
  const { t } = useTranslation();

  return (
    <AppLayout>
      <PageContainer width="narrow">
        <EmptyState
          description={t("sucursales.gerente.soloPrincipalDesc")}
          icon={<Lock />}
          title={t("sucursales.gerente.soloPrincipalTitulo")}
        />
      </PageContainer>
    </AppLayout>
  );
}
