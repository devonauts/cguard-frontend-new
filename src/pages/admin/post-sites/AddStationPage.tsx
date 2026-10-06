import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChevronLeft, Loader2, ShieldPlus } from "lucide-react";

import OperationSetupAlert, {
  needsOperationSetup,
} from "./components/OperationSetup/OperationSetupAlert";

import PostSiteLayout from "@/layouts/PostSiteLayout";
import {
  postSiteService,
  setTenantId as setGlobalTenantId,
} from "@/lib/api/postSiteService";
import { PageContainer, PageHeader } from "@/components/kit";
import StationCreateForm from "@/components/stations/StationCreateForm";

/**
 * Página «Crear estación» (/post-sites/:id/stations/new). El formulario vive
 * en `StationCreateForm`, el mismo que usa el asistente de la sede.
 */
export default function AddStationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [site, setSite] = useState<any | null>(null);
  const [loadingSite, setLoadingSite] = useState(false);
  const stationsUrl = `/post-sites/${id}/stations`;

  useEffect(() => {
    if (!id) return;
    let mounted = true;

    (async () => {
      setLoadingSite(true);
      try {
        const data = await postSiteService.get(id);

        if (!mounted) return;
        setSite(data);
        const tid =
          data?.tenantId ||
          (data?.tenant &&
            typeof data.tenant === "object" &&
            (data.tenant.id || data.tenant.tenantId));

        if (tid) setGlobalTenantId(tid);
      } catch (e) {
        console.error(e);
        toast.error(
          t("postsite.Details.unexpected", "Unexpected error occurred"),
        );
      } finally {
        if (mounted) setLoadingSite(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  return (
    <PostSiteLayout
      site={site}
      title={
        site?.businessName ||
        site?.companyName ||
        site?.name ||
        t("postSites.postsite", "Post Site")
      }
    >
      <div>
        <PageContainer width="narrow">
          <Link
            className="cg-focus inline-flex items-center gap-1 rounded text-sm"
            style={{ color: "var(--ink-soft)" }}
            to={stationsUrl}
          >
            <ChevronLeft className="h-4 w-4" />
            {t("postSites.stations.backToStations", "Estaciones")}
          </Link>
          <PageHeader
            icon={<ShieldPlus />}
            subtitle={t(
              "postSites.stations.createSubtitle",
              "Define el turno, horario y la geocerca del puesto.",
            )}
            title={t("postSites.stations.createTitle", "Crear estación")}
          />

          {/* Sede sin tipo de servicio: se CIERRA. El formulario no se enseña y
              el servidor rechazaría igual (`exigirSedeConfigurada`). */}
          <OperationSetupAlert
            className="mb-4"
            context="station"
            site={site}
            siteId={id}
          />

          {loadingSite && !site ? (
            <div className="flex items-center justify-center py-16">
              <Loader2
                className="h-6 w-6 animate-spin"
                style={{ color: "var(--brand-text)" }}
              />
            </div>
          ) : needsOperationSetup(site) ? null : (
            <StationCreateForm
              site={site}
              siteId={id || ""}
              onCancel={() => navigate(stationsUrl)}
              onCreated={() => navigate(stationsUrl)}
            />
          )}
        </PageContainer>
      </div>
    </PostSiteLayout>
  );
}
