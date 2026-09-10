import { useEffect, useState } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";

import PostSiteWizard from "./PostSiteWizard";

type Client = { id: string; name: string; lastName?: string };
import { clientService } from "@/lib/api/clientService";

import { MapPin, Pencil } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import Breadcrumb from "@/components/ui/breadcrumb";

import { useTranslation } from "react-i18next";

import { PageContainer, PageHeader, SkeletonCards } from "@/components/kit";

export default function NewOrEditPostSitePage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  // Se entró desde la ficha de un cliente (/post-sites/new?clientId=…): la
  // sede es de ese cliente, así que no hay nada que preguntar. El nombre
  // viaja en el state de navegación para pintarlo sin esperar a la red.
  const presetClientId = id
    ? undefined
    : searchParams.get("clientId") || undefined;
  const presetClientName = (location.state as { clientName?: string } | null)
    ?.clientName;

  useEffect(() => {
    // Con el cliente ya fijado la lista completa no se usa: no se pide.
    if (presetClientId) {
      setLoading(false);

      return;
    }
    (async () => {
      try {
        const data = await clientService.getClients({});
        const rows = Array.isArray(data?.rows) ? data.rows : [];

        setClients(
          rows.map(
            (c: {
              id: string;
              commercialName?: string;
              name?: string;
              lastName?: string;
            }) => ({
              id: c.id,
              name:
                c.commercialName ||
                [c.name, c.lastName].filter(Boolean).join(" "),
            }),
          ),
        );
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [presetClientId]);

  return (
    <AppLayout>
      <Breadcrumb
        items={[
          {
            label: t("postSites.postsitdash", "Panel de control"),
            path: "/dashboard",
          },
          {
            label: id
              ? t("postSites.editPostSite", "Editar Puesto de seguridad")
              : t("postSites.newPostSite", "Nuevo Puesto de seguridad"),
          },
        ]}
      />
      <section className="p-4">
        <PageContainer width="narrow">
          <PageHeader
            icon={id ? <Pencil /> : <MapPin />}
            subtitle={
              presetClientName
                ? t(
                    "postSites.wizardSubtitleForClient",
                    "Nueva sede para {{client}}: ubicación, servicio y estaciones paso a paso.",
                    { client: presetClientName },
                  )
                : t(
                    "postSites.wizardSubtitle",
                    "Configura el sitio, su ubicación, servicio y estaciones paso a paso.",
                  )
            }
            title={
              id
                ? t("postSites.editPostSite", "Editar Puesto de seguridad")
                : t("postSites.newPostSite", "Nuevo Puesto de seguridad")
            }
          />
          {loading ? (
            <SkeletonCards count={4} />
          ) : (
            <PostSiteWizard
              clients={clients}
              id={id}
              mode={id ? "edit" : "create"}
              presetClientId={presetClientId}
              presetClientName={presetClientName}
            />
          )}
        </PageContainer>
      </section>
    </AppLayout>
  );
}
