import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { Link2, Settings2, Users } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { EmptyState, PageContainer, PageHeader, SkeletonCards } from "@/components/kit";
import { useGusto } from "@/hooks/useGusto";
import HorasGusto from "@/pages/admin/Configuration/integrations/HorasGusto";

/**
 * NÓMINA › GUSTO — donde se mandan las horas aprobadas a la nómina de Gusto.
 *
 * Conectar la cuenta y emparejar a las personas vive en Ajustes › Conexiones
 * (se hace una vez); esto es lo de cada periodo, junto al resto de la nómina.
 */
export default function NominaGusto() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoading, disponible, conectado } = useGusto();
  const ajustes = "/setting/integraciones/gusto";

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          actions={
            conectado && (
              <Button asChild variant="outline">
                <Link to={ajustes}>
                  <Users /> {t("ui.NominaGusto.empleados", "Empleados vinculados")}
                </Link>
              </Button>
            )
          }
          icon={<Link2 />}
          subtitle={t(
            "ui.GustoEmpleados.subtituloHoras",
            "Envía a Gusto las horas aprobadas en Nómina, ya separadas en ordinarias y extra.",
          )}
          title="Gusto"
        />

        {isLoading ? (
          <SkeletonCards count={3} />
        ) : conectado ? (
          <HorasGusto alIrAEmpleados={() => navigate(ajustes)} />
        ) : (
          <EmptyState
            action={
              disponible && (
                <Button asChild>
                  <Link to="/setting/integraciones">
                    <Settings2 /> {t("ui.NominaGusto.conectar", "Conectar Gusto")}
                  </Link>
                </Button>
              )
            }
            description={
              disponible
                ? t(
                    "ui.NominaGusto.sinConectarTexto",
                    "Conecta tu cuenta de Gusto en Ajustes › Conexiones y API y vincula a tu personal. Después, las horas aprobadas se envían desde aquí.",
                  )
                : t("ui.NominaGusto.noDisponible", "Gusto sólo está disponible para empresas de Estados Unidos.")
            }
            icon={<Link2 />}
            title={t("ui.NominaGusto.sinConectar", "Gusto no está conectado")}
          />
        )}
      </PageContainer>
    </AppLayout>
  );
}
