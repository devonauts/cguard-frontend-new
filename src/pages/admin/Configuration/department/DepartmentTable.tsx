import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  CatalogTable,
  ActiveBadge,
  type CatalogColumn,
} from "../components/CatalogTable";

export type DepartmentRow = {
  id: string;
  name: string;
  description?: string | null;
  managerName?: string | null;
  managerId?: string | null;
  members?: number;
  status?: "active" | "inactive";
  createdAt?: string;
};

type Props = {
  rows: DepartmentRow[];
  total: number;
  page: number;
  pageSize: number;
  loading?: boolean;
  query: string;
  onQueryChange: (v: string) => void;
  onPageChange: (v: number) => void;
  onPageSizeChange: (v: number) => void;
  onEdit: (row: DepartmentRow) => void;
  onToggleStatus: (row: DepartmentRow) => void;
  onDelete: (row: DepartmentRow) => void;
  onBulkDelete: (ids: string[]) => void;
  canEdit?: boolean;
};


export default function DepartmentsTable({
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
  onDelete,
  onBulkDelete,
  canEdit = true,
}: Props) {
  const { t } = useTranslation();
  // Built inside the component so the headers follow the current language.
  const columns: CatalogColumn<DepartmentRow>[] = [
    {
      key: "name",
      header: t("guards.department.title", "Departamento"),
      // Nombre y descripción en la misma celda: la descripción es el subtítulo
      // del departamento, no un dato aparte que merezca su propia columna.
      render: (_v, r) => (
        <>
          <div className="font-medium">{r.name}</div>
          {r.description ? (
            <div
              className="line-clamp-1 text-xs"
              style={{ color: "var(--ink-soft)" }}
            >
              {r.description}
            </div>
          ) : null}
        </>
      ),
    },
    { key: "managerName", header: t("ui.DepartmentTable.responsable", "Responsable"), render: (v) => v ?? "—" },
    {
      key: "members",
      header: t("ui.DepartmentTable.miembros", "Miembros"),
      render: (v) => (
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <Users className="h-3.5 w-3.5" style={{ color: "var(--ink-faint)" }} />
          {v ?? 0}
        </span>
      ),
    },
    {
      key: "status",
      header: t("clients.columns.status", "Estado"),
      render: (v) => <ActiveBadge active={v !== "inactive"} />,
    },
  ];

  return (
    <CatalogTable<DepartmentRow>
      bulkActions={[
        {
          label: t("actions.delete", "Eliminar"),
          destructive: true,
          onRun: onBulkDelete,
        },
      ]}
      canEdit={canEdit}
      columns={columns}
      empty={{
        title: t("settings.departments.emptyTitle", "Sin departamentos"),
        description: t(
          "settings.departments.emptyDesc",
          'Crea el primero con "Nuevo Departamento" — por ejemplo Operaciones, Talento Humano o Nómina.',
        ),
      }}
      loading={loading}
      page={page}
      pageSize={pageSize}
      query={query}
      rowActions={(r) => [
        { label: t("actions.edit", "Editar"), onClick: () => onEdit(r) },
        {
          label:
            r.status === "inactive"
              ? t("actions.activate", "Activar")
              : t("actions.desactivate", "Desactivar"),
          onClick: () => onToggleStatus(r),
        },
        {
          label: t("actions.delete", "Eliminar"),
          destructive: true,
          onClick: () => onDelete(r),
        },
      ]}
      rows={rows}
      searchPlaceholder={t(
        "ui.DepartmentTable.buscarDepartamento",
        "Buscar departamento",
      )}
      total={total}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      onQueryChange={onQueryChange}
    />
  );
}
