import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { EmptyState, PageContainer } from "@/components/kit";
import { useEsGerenteDeSucursal } from "@/hooks/useGerenteDeSucursal";

/**
 * Lo que ve un GERENTE DE SUCURSAL donde se paga o se contrata: un aviso
 * claro en vez de botones que el servidor rechazaría. Lo hace un administrador
 * de la principal.
 */
export default function AvisoSoloPrincipal() {
  const { t } = useTranslation();
  // Multimarca phase 2: a brand admin gets the same notice in their words.
  const gerente = useEsGerenteDeSucursal();

  return (
    <AppLayout>
      <PageContainer width="narrow">
        <EmptyState
          description={
            gerente
              ? t("sucursales.gerente.soloPrincipalDesc")
              : t(
                  "ui.AccesoDeMarca.soloEmpresaDesc",
                  "Como administrador de marca gestionas tus marcas, pero los pagos, los módulos y la cuenta los gestiona un administrador de la empresa.",
                )
          }
          icon={<Lock />}
          title={
            gerente
              ? t("sucursales.gerente.soloPrincipalTitulo")
              : t("ui.AccesoDeMarca.soloEmpresaTitulo", "Esto lo hace la administración de la empresa")
          }
        />
      </PageContainer>
    </AppLayout>
  );
}
