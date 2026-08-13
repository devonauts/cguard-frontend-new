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

const columns: CatalogColumn<IncidentTypeRow>[] = [
  { key: "name", header: "Tipo de incidente", className: "w-[60%]" },
  {
    key: "status",
    header: "Estado",
    // Activo/Inactivo es disponibilidad del catálogo, no gravedad: va en
    // «ok»/neutro, nunca en el rojo de alarma.
    render: (v) => <ActiveBadge active={v === "active"} />,
  },
];

export default function IncidentTypesTable({
  rows, total, page, pageSize, loading, query = "",
  onQueryChange, onPageChange, onPageSizeChange,
  onEdit, onToggleStatus, onBulkDelete,
}: Props) {
  return (
    <CatalogTable<IncidentTypeRow>
      rows={rows}
      columns={columns}
      loading={loading}
      query={query}
      onQueryChange={onQueryChange}
      searchPlaceholder="Buscar tipo de incidente"
      page={page}
      pageSize={pageSize}
      total={total}
      onPageChange={(p) => onPageChange?.(p)}
      onPageSizeChange={(n) => onPageSizeChange?.(n)}
      rowActions={(r) => [
        { label: "Editar", onClick: () => onEdit?.(r) },
        { label: r.status === "active" ? "Desactivar" : "Activar", onClick: () => onToggleStatus?.(r.id) },
      ]}
      bulkActions={[{ label: "Eliminar", destructive: true, onRun: (ids) => onBulkDelete?.(ids) }]}
      empty={{
        title: "No se encontraron resultados",
        description: "No hay tipos de incidente que coincidan con tu búsqueda.",
      }}
    />
  );
}
