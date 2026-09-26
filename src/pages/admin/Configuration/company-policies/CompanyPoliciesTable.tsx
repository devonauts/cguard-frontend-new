import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/kit";
import { ApiService } from "@/services/api/apiService";
import { CatalogTable, type CatalogColumn } from "../components/CatalogTable";
import PolicyDialog, { PolicyForm } from "./PolicyDialog";
import { localeActual } from "@/lib/localeActual";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";

type Policy = {
  id: string;
  title: string;
  createdAt: string;
  status: "published" | "draft";
  version?: number;
  kindLabel?: string;
  /** Del endpoint de cumplimiento: quién falta por firmar. */
  firmadas?: number;
  obligadas?: number;
};

// Guard against missing/invalid createdAt so real API rows don't render "Invalid Date".
const formatPolicyDate = (value?: string) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(localeActual(), { timeZone: zonaDeLaEmpresa() });
};

// La pantalla estuvo marcada «Próximamente» —honestamente: no fingía guardar—
// hasta que existió el servidor. Ya existe: /tenant/:id/company-policy.
const tenantId = () => localStorage.getItem("tenantId");

export default function CompanyPoliciesTable() {
  const { t } = useTranslation();
  // Las cabeceras se arman DENTRO del componente: fuera se evaluarían al cargar
  // el módulo, antes de que el idioma esté listo, y el texto quedaría congelado.
  const columns: CatalogColumn<Policy>[] = useMemo(
    () => [
      { key: "title", header: t("settings.policies.colTitle", "Título") },
      {
        key: "kindLabel",
        header: t("dashboard.table.headers.type", "Tipo"),
        render: (v) =>
          String(v || t("ui.CompanyPoliciesTable.reglamento", "Reglamento")),
      },
      {
        // El dato por el que existe la pantalla: un reglamento publicado que nadie
        // ha firmado es un PDF en una carpeta.
        key: "firmadas",
        header: t("ui.CompanyPoliciesTable.firmadoPor", "Firmado por"),
        render: (_v, row) =>
          row.obligadas
            ? t("ui.CompanyPoliciesTable.firmadasDeObligadas", {
                defaultValue: "{{firmadas}} de {{obligadas}}",
                firmadas: row.firmadas ?? 0,
                obligadas: row.obligadas,
              })
            : "—",
      },
      {
        key: "createdAt",
        header: t("ui.CompanyPoliciesTable.creado", "Creado"),
        align: "right",
        render: (v) => formatPolicyDate(v),
      },
    ],
    [t],
  );
  const [query, setQuery] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [pageSize, setPageSize] = useState(25);
  const [policies, setPolicies] = useState<Policy[]>([]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return policies;
    return policies.filter((p) => p.title.toLowerCase().includes(q));
  }, [query, policies]);

  const cargar = useCallback(async () => {
    try {
      const [lista, cumpl]: any = await Promise.all([
        ApiService.get(`/tenant/${tenantId()}/company-policy`),
        ApiService.get(`/tenant/${tenantId()}/company-policy/compliance`).catch(
          () => null,
        ),
      ]);
      const filas: Policy[] = lista?.rows || lista?.data?.rows || [];
      const porId = new Map<string, any>(
        ((cumpl?.rows || cumpl?.data?.rows || []) as any[]).map((c) => [
          c.policyId,
          c,
        ]),
      );
      setPolicies(
        filas.map((p) => ({
          ...p,
          firmadas: porId.get(p.id)?.firmadas,
          obligadas: porId.get(p.id)?.obligadas,
        })),
      );
    } catch {
      // Una lista que no carga se queda vacía y lo dice el estado vacío; no se
      // inventan filas.
      setPolicies([]);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = async (data: PolicyForm, status: "published" | "draft") => {
    try {
      await ApiService.post(`/tenant/${tenantId()}/company-policy`, {
        ...data,
        status,
      });
      toast.success(
        status === "published"
          ? t("ui.CompanyPoliciesTable.documentoPublicado", "Documento publicado")
          : t("ui.CompanyPoliciesTable.borradorGuardado", "Borrador guardado"),
      );
      setOpenNew(false);
      await cargar();
    } catch (e: any) {
      // Se dice QUÉ falló y el diálogo se queda abierto con lo escrito dentro:
      // cerrar y perder el texto es lo que hace que nadie vuelva a intentarlo.
      toast.error(
        e?.response?.data?.message ||
          t(
            "ui.CompanyPoliciesTable.noPudimosGuardarElDocumento",
            "No pudimos guardar el documento.",
          ),
      );
    }
  };

  const handleCreate = (data: PolicyForm) => void guardar(data, "published");
  const handleDraft = (data: PolicyForm) => void guardar(data, "draft");

  return (
    <>
      <CatalogTable<Policy>
        rows={filtered}
        columns={columns}
        canEdit
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder={t(
          "ui.CompanyPoliciesTable.buscarPoliticaDeEmpresa",
          "Buscar política de empresa",
        )}
        page={1}
        pageSize={pageSize}
        total={filtered.length}
        onPageChange={() => {}}
        onPageSizeChange={setPageSize}
        bulkActions={[
          {
            label: t("actions.delete", "Eliminar"),
            destructive: true,
            onRun: () => {},
          },
          { label: t("ui.CompanyPoliciesTable.publicar", "Publicar"), onRun: () => {} },
          {
            label: t("ui.CompanyPoliciesTable.moverABorrador", "Mover a borrador"),
            onRun: () => {},
          },
        ]}
        toolbarExtra={
          <Button
            onClick={() => setOpenNew(true)}
            variant="brand"
            className="whitespace-nowrap"
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("ui.CompanyPoliciesTable.nuevaPolitica", "Nueva política")}
          </Button>
        }
        empty={{
          title: query.trim()
            ? t("clients.empty.title", "No se encontraron resultados")
            : t("ui.CompanyPoliciesTable.aunNoHayPoliticas", "Aún no hay políticas"),
          description: query.trim()
            ? t(
                "ui.CompanyPoliciesTable.noPudimosEncontrarNingunElemento",
                "No pudimos encontrar ningún elemento que coincida con tu búsqueda.",
              )
            : t(
                "ui.CompanyPoliciesTable.publicaElReglamentoInterno",
                "Publica el reglamento interno y sabrás quién lo ha firmado.",
              ),
        }}
      />

      <PolicyDialog
        open={openNew}
        onOpenChange={setOpenNew}
        onSubmit={handleCreate}
        onDraft={handleDraft}
      />
    </>
  );
}
