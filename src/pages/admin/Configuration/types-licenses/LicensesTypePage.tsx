import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { IdCard, Plus } from "lucide-react";

import SettingsPageShell from "../components/SettingsPageShell";

import LicenseTypesTable, { LicenseTypeRow } from "./LicensesTypeTable";
import LicenseTypeDialog, {
  LicenseTypeDialogValues,
} from "./LicensesTypeDialog";

import licenseTypeService from "@/lib/api/licenseTypeService";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/kit";

export default function LicenseTypePage() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<LicenseTypeRow | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [rows, setRows] = useState<LicenseTypeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        limit: String(pageSize),
        offset: String((page - 1) * pageSize),
      };

      if (query) params["filter[name]"] = query;
      const resp: {
        rows?: Array<{ id: string; name: string; status?: string }>;
        count?: number;
      } = await licenseTypeService.list(params);
      const mapped: LicenseTypeRow[] = (resp?.rows || []).map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status === "inactive" ? "inactive" : "active",
      }));

      setRows(mapped);
      setTotal(resp?.count || 0);
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("licenseTypes.loadError", "Error al cargar tipos de licencia"),
      );
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [query, page, pageSize]);

  return (
    <SettingsPageShell
      actions={
        <Button
          variant="brand"
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("licenseTypes.table.create", {
            defaultValue: "Nuevo Tipo de Licencia",
          })}
        </Button>
      }
      badges={
        !loading && total > 0 ? (
          <StatusBadge tone="neutral">
            {t("ui.IncidentTypePage.nTipos", {
              defaultValue: "{{count}} tipos",
              count: total,
            })}
          </StatusBadge>
        ) : undefined
      }
      icon={<IdCard />}
      kind="table"
      subtitle={t("ui.LicensesTypePage.losPermisosYLicenciasQue")}
      title={t("licenseTypes.page.title", {
        defaultValue: "Tipos de Licencia",
      })}
    >
      <LicenseTypesTable
        loading={loading}
        page={page}
        pageSize={pageSize}
        query={query}
        rows={rows}
        total={total}
        onBulkDelete={async (ids: string[]) => {
          if (!ids?.length) return;
          try {
            await licenseTypeService.destroy(ids);
            toast.success(t("ui.LicensesTypePage.tipoSDeLicenciaEliminado"));
            await fetchData();
          } catch (e: any) {
            toast.error(
              e?.message || t("clients.errorDelete", "Error al eliminar"),
            );
          }
        }}
        onEdit={(r: LicenseTypeRow) => {
          setEdit(r);
          setOpen(true);
        }}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onQueryChange={setQuery}
        onToggleStatus={async (row: LicenseTypeRow) => {
          try {
            await licenseTypeService.update(row.id, {
              status: row.status === "active" ? "inactive" : "active",
            });
            toast.success(t("comun.estadoActualizado"));
            await fetchData();
          } catch (e: any) {
            toast.error(
              e?.message ||
                t(
                  "settings.incidentTypes.statusUpdateError",
                  "Error al actualizar estado",
                ),
            );
          }
        }}
      />
      <LicenseTypeDialog
        defaultValues={edit ? { name: edit.name } : null}
        open={open}
        title={
          edit
            ? t("licenseTypes.dialog.title.edit", {
                defaultValue: "Editar Tipo de Licencia",
              })
            : t("licenseTypes.dialog.title.create", {
                defaultValue: "Nuevo Tipo de Licencia",
              })
        }
        onOpenChange={setOpen}
        onSubmit={async (values: LicenseTypeDialogValues) => {
          try {
            if (edit) {
              await licenseTypeService.update(edit.id, { name: values.name });
              toast.success(t("ui.LicensesTypePage.tipoDeLicenciaActualizado"));
            } else {
              await licenseTypeService.create({ name: values.name });
              toast.success(t("ui.LicensesTypePage.tipoDeLicenciaCreado"));
            }
            setOpen(false);
            setEdit(null);
            await fetchData();
          } catch (e: any) {
            toast.error(
              e?.message || t("settings.rondas.saveError", "Error al guardar"),
            );
          }
        }}
      />
    </SettingsPageShell>
  );
}
