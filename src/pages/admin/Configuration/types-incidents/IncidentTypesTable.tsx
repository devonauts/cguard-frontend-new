import { useTranslation } from "react-i18next";
import { CatalogTable, ActiveBadge, type CatalogColumn } from "../components/CatalogTable";

export type IncidentTypeRow = { id: string; name: string; status: "active" | "inactive" };

type Props = {
  rows: IncidentTypeRow[];
  total: number;
  page: number;
  pageSize: number;
  loading?: boolean;
  query?: string;
  onQueryChange?: (q: string) => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  onEdit?: (row: IncidentTypeRow) => void;
  onToggleStatus?: (id: string) => void;
  onBulkDelete?: (ids: string[]) => void;
};

export default function IncidentTypesTable({
  rows, total, page, pageSize, loading, query = "",
  onQueryChange, onPageChange, onPageSizeChange,
  onEdit, onToggleStatus, onBulkDelete,
}: Props) {
  const { t } = useTranslation();

  const columns: CatalogColumn<IncidentTypeRow>[] = [
    { key: "name", header: t('settings.incidentTypes.colName', { defaultValue: 'Tipo de incidente' }), className: "w-[60%]" },
    {
      key: "status",
      header: t('settings.incidentTypes.colStatus', { defaultValue: 'Estado' }),
      // Activo/Inactivo es disponibilidad del catálogo, no gravedad: va en
      // «ok»/neutro, nunca en el rojo de alarma.
      render: (v) => <ActiveBadge active={v === "active"} />,
    },
  ];

  return (
    <CatalogTable<IncidentTypeRow>
      rows={rows}
      columns={columns}
      loading={loading}
      query={query}
      onQueryChange={onQueryChange}
      searchPlaceholder={t('settings.incidentTypes.searchPlaceholder', { defaultValue: 'Buscar tipo de incidente' })}
      page={page}
      pageSize={pageSize}
      total={total}
      onPageChange={(p) => onPageChange?.(p)}
      onPageSizeChange={(n) => onPageSizeChange?.(n)}
      rowActions={(r) => [
        { label: t('settings.incidentTypes.editAction', { defaultValue: 'Editar' }), onClick: () => onEdit?.(r) },
        { label: r.status === "active" ? t('settings.incidentTypes.deactivateAction', { defaultValue: 'Desactivar' }) : t('settings.incidentTypes.activateAction', { defaultValue: 'Activar' }), onClick: () => onToggleStatus?.(r.id) },
      ]}
      bulkActions={[{ label: t('settings.incidentTypes.deleteAction', { defaultValue: 'Eliminar' }), destructive: true, onRun: (ids) => onBulkDelete?.(ids) }]}
      empty={{
        title: t('settings.incidentTypes.emptyTitle', { defaultValue: 'No se encontraron resultados' }),
        description: t('settings.incidentTypes.emptyDescription', { defaultValue: 'No hay tipos de incidente que coincidan con tu búsqueda.' }),
      }}
    />
  );
}
