import { useTranslation } from "react-i18next";

import { CatalogTable, type CatalogColumn } from "../components/CatalogTable";

import { StatusBadge } from "@/components/kit";

export type LicenseTypeRow = {
  id: string;
  name: string;
  status: "active" | "inactive";
  createdAt?: string;
};

type Props = {
  rows: LicenseTypeRow[];
  total: number;
  page: number;
  pageSize: number;
  loading?: boolean;
  query: string;
  onQueryChange: (v: string) => void;
  onPageChange: (v: number) => void;
  onPageSizeChange: (v: number) => void;
  onEdit: (row: LicenseTypeRow) => void;
  onToggleStatus: (row: LicenseTypeRow) => void;
  onBulkDelete: (ids: string[]) => void;
};

export default function LicenseTypesTable({
  rows,
  total,
  page,
  pageSize,
  loading,
  query,
  onQueryChange,
  onPageChange,
  onPageSizeChange,
  onEdit,
  onToggleStatus,
  onBulkDelete,
}: Props) {
  const { t } = useTranslation();

  // Las columnas se arman dentro porque sus cabeceras están traducidas.
  const columns: CatalogColumn<LicenseTypeRow>[] = [
    {
      key: "name",
      header: t("licenseTypes.table.column.name", {
        defaultValue: "Tipo de licencia",
      }),
    },
    {
      key: "status",
      header: t("licenseTypes.table.column.status", { defaultValue: "Estado" }),
      render: (v) => (
        <StatusBadge tone={v === "active" ? "ok" : "neutral"}>
          {v === "active"
            ? t("licenseTypes.table.status.active", { defaultValue: "Activo" })
            : t("licenseTypes.table.status.inactive", {
                defaultValue: "Inactivo",
              })}
        </StatusBadge>
      ),
    },
  ];

  return (
    <CatalogTable<LicenseTypeRow>
      bulkActions={[
        {
          label: t("licenseTypes.table.bulkDelete", {
            defaultValue: "Eliminar",
          }),
          destructive: true,
          onRun: onBulkDelete,
        },
      ]}
      columns={columns}
      empty={{
        title: t("licenseTypes.table.noResults", {
          defaultValue: "No se encontraron resultados",
        }),
      }}
      loading={loading}
      page={page}
      pageSize={pageSize}
      query={query}
      rowActions={(r) => [
        {
          label: t("licenseTypes.table.actions.edit", {
            defaultValue: "Editar",
          }),
          onClick: () => onEdit(r),
        },
        {
          label:
            r.status === "active"
              ? t("licenseTypes.table.actions.deactivate", {
                  defaultValue: "Desactivar",
                })
              : t("licenseTypes.table.actions.activate", {
                  defaultValue: "Activar",
                }),
          onClick: () => onToggleStatus(r),
        },
      ]}
      rows={rows}
      searchPlaceholder={t("licenseTypes.table.searchPlaceholder", {
        defaultValue: "Buscar tipo de licencia",
      })}
      total={total}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      onQueryChange={onQueryChange}
    />
  );
}
