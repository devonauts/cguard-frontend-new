import { useMemo, useState } from "react";
import { Clock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/kit";
import { CatalogTable, type CatalogColumn } from "../components/CatalogTable";
import PolicyDialog, { PolicyForm } from "./PolicyDialog";

type Policy = {
  id: string;
  title: string;
  createdAt: string;
  status: "published" | "draft";
};

// Guard against missing/invalid createdAt so real API rows don't render "Invalid Date".
const formatPolicyDate = (value?: string) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
};

// NOTE: there is no backend policies endpoint yet. Rather than show fake rows or
// fake "saves", this screen is gated as "Próximamente" (see FEATURE_AVAILABLE).
const FEATURE_AVAILABLE = false;
const POLICIES: Policy[] = [];

const columns: CatalogColumn<Policy>[] = [
  { key: "title", header: "Título" },
  { key: "createdAt", header: "Hora", align: "right", render: (v) => formatPolicyDate(v) },
];

export default function CompanyPoliciesTable() {
  const [query, setQuery] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [pageSize, setPageSize] = useState(25);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return POLICIES;
    return POLICIES.filter((p) => p.title.toLowerCase().includes(q));
  }, [query]);

  // No backend endpoint yet — these are intentionally no-ops and the entry points
  // that would call them are disabled while FEATURE_AVAILABLE is false.
  const handleCreate = (_data: PolicyForm) => setOpenNew(false);
  const handleDraft = (_data: PolicyForm) => setOpenNew(false);

  return (
    <>
      <CatalogTable<Policy>
        rows={filtered}
        columns={columns}
        canEdit={FEATURE_AVAILABLE}
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Buscar política de empresa"
        page={1}
        pageSize={pageSize}
        total={filtered.length}
        onPageChange={() => {}}
        onPageSizeChange={setPageSize}
        bulkActions={[
          { label: "Eliminar", destructive: true, onRun: () => {} },
          { label: "Publicar", onRun: () => {} },
          { label: "Mover a borrador", onRun: () => {} },
        ]}
        toolbarExtra={
          <Button
            onClick={() => setOpenNew(true)}
            disabled={!FEATURE_AVAILABLE}
            variant="brand"
            className="whitespace-nowrap"
            title={!FEATURE_AVAILABLE ? "Próximamente" : undefined}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nueva política
          </Button>
        }
        notice={
          !FEATURE_AVAILABLE ? (
            <div
              className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm"
              style={{ borderColor: "var(--hairline)", background: "var(--glass-sunken)", color: "var(--ink-soft)" }}
            >
              <StatusBadge tone="info" dot={false}>
                <Clock className="h-3 w-3" />
                Próximamente
              </StatusBadge>
              <span>La gestión de políticas de empresa aún no está disponible.</span>
            </div>
          ) : null
        }
        empty={{
          title: query.trim() ? "No se encontraron resultados" : "Aún no hay políticas",
          description: query.trim()
            ? "No pudimos encontrar ningún elemento que coincida con tu búsqueda."
            : "La gestión de políticas de empresa estará disponible próximamente.",
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
