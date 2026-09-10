import { FileX, Boxes } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Section, StatusBadge, EmptyState } from "@/components/kit";
import { DataTable, type Column } from "@/components/table/DataTable";

export type ModuleRow = {
  id: string;
  name: string; // "Gestión de Visitantes"
  description?: string; // "Gestiona los visitantes..."
  price: string; // "$1 / Month / User"
  status: "Activo" | "Inactivo";
};

const columns: Column<ModuleRow>[] = [
  {
    key: "name",
    header: "Módulo",
    className: "w-[45%]",
    render: (_v, m) => (
      <>
        <div className="font-semibold">{m.name}</div>
        {m.description && (
          <div className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {m.description}
          </div>
        )}
      </>
    ),
  },
  { key: "price", header: "Precio", className: "w-[25%]" },
  {
    key: "status",
    header: "Estado",
    className: "w-[20%]",
    render: (v) => (
      <StatusBadge tone={v === "Activo" ? "ok" : "neutral"}>{v}</StatusBadge>
    ),
  },
];

export default function ModulesTable({
  modules = [],
  onDisable,
}: {
  modules?: ModuleRow[];
  onDisable?: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    // `contentClassName` a secas: la tabla ya trae su propia superficie
    // (`glass-flat`) y su radio. El `border` suelto de antes heredaba el color
    // ambiente de Tailwind en vez de `--hairline`, así que este marco no
    // coincidía con el de ninguna otra tabla del CRM.
    <Section
      contentClassName="overflow-hidden"
      icon={<Boxes />}
      title={t("ui.ModulesTable.modulosContratados", "Módulos contratados")}
    >
      <DataTable<ModuleRow>
        columns={columns}
        data={modules}
        emptyState={
          <EmptyState
            className="border-0"
            description={t("ui.ModulesTable.todaviaNoHasActivadoNingun")}
            icon={<FileX />}
            title={t(
              "ui.ModulesTable.sinModulosContratados",
              "Sin módulos contratados",
            )}
          />
        }
        rowActions={(m) => [
          { label: "Deshabilitar", onClick: () => onDisable?.(m.id) },
        ]}
      />
    </Section>
  );
}
