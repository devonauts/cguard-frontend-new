import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";

import { EmptyState, PageContainer } from "@/components/kit";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/layouts/app-layout";
import { puedeVerLaRuta } from "@/lib/rutaConPermiso";

/**
 * The same gate as the menu, for a page opened by its URL: without one of
 * `permisos` the page is not mounted at all (no request, no «Prohibido» toast),
 * and the person reads a plain no-access page instead.
 */
export default function RutaConPermiso({
  permisos,
  children,
}: {
  permisos: string[];
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const auth = useAuth() as any;

  if (puedeVerLaRuta(auth, permisos)) return <>{children}</>;

  return (
    <AppLayout>
      <PageContainer width="wide">
        <EmptyState
          description={t(
            "ui.RutaConPermiso.descripcion",
            "Tu rol no puede ver esta página. Si la necesitas, pídesela a un administrador.",
          )}
          icon={<Lock />}
          title={t("ui.RutaConPermiso.titulo", "Sin acceso a esta página")}
        />
      </PageContainer>
    </AppLayout>
  );
}
