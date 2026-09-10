import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Building2, UserPlus } from "lucide-react";

import ClientForm, { Category } from "./ClientForm";

import AppLayout from "@/layouts/app-layout";
import Breadcrumb from "@/components/ui/breadcrumb";
import { usePermissions } from "@/hooks/usePermissions";
import { PageContainer, PageHeader } from "@/components/kit";

export default function NewOrEditClientPage() {
  const { id } = useParams<{ id: string }>();
  const [cats, setCats] = useState<Category[]>([]);
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const { t } = useTranslation();

  useEffect(() => {
    // If creating, require create permission. If editing, require edit permission.
    if (!id && !hasPermission("clientAccountCreate")) {
      // Frontend won't display error toast - backend handles error messages.
      console.warn("No tienes permiso para crear clientes");
      navigate("/clients");
    }
    if (id && !hasPermission("clientAccountEdit")) {
      // Frontend won't display error toast - backend handles error messages.
      console.warn("No tienes permiso para editar clientes");
      navigate("/clients");
    }
  }, [id, hasPermission, navigate]);

  // Categories are loaded directly inside ClientForm via categoryService
  // (the /api/categories endpoint does not exist; no-op here)

  return (
    <AppLayout>
      <Breadcrumb
        items={[
          { label: t("clients.breadcrumb.dashboard"), path: "/dashboard" },
          { label: id ? t("clients.editClient") : t("clients.newClient") },
        ]}
      />
      <PageContainer>
        <PageHeader
          icon={id ? <Building2 /> : <UserPlus />}
          subtitle={
            id
              ? t("clients.editClientSubtitle", {
                  defaultValue: "Actualiza la información del cliente.",
                })
              : t("clients.newClientSubtitle", {
                  defaultValue: "Registra un nuevo cliente en la plataforma.",
                })
          }
          title={id ? t("clients.editClient") : t("clients.newClient")}
        />
        <ClientForm categories={cats} id={id} mode={id ? "edit" : "create"} />
      </PageContainer>
    </AppLayout>
  );
}
