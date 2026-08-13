import { useState } from "react";
import IncidentTypesTable, { IncidentTypeRow } from "./IncidentTypesTable";
import IncidentTypeDialog, { IncidentTypeDialogValues } from "./IncidentTypeDialog";
import IncidentTypesService from "@/services/incident-types.service";
import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal, StatusBadge } from "@/components/kit";
import SettingsPageShell from "../components/SettingsPageShell";
import { AlertTriangle, Plus, Siren } from "lucide-react";

export default function IncidentTypePage() {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<IncidentTypeRow | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [rows, setRows] = useState<IncidentTypeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const resp: { rows?: Array<{ id: string; name: string; active?: boolean | number }>; count?: number } = await IncidentTypesService.list(query, page, pageSize);
      const mapped = (resp.rows || []).map((r) => ({ id: r.id, name: r.name, status: (r.active === true || r.active === 1 ? 'active' : 'inactive') as 'active' | 'inactive' }));
      setRows(mapped);
      setTotal(resp.count || 0);
    } catch (e) {
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [query, page, pageSize]);

  return (
    <SettingsPageShell
      kind="table"
      icon={<Siren />}
      title="Tipos de Incidentes"
      subtitle="El catálogo con el que tu equipo clasifica lo que ocurre en cada puesto."
      badges={
        !loading && total > 0 ? (
          <StatusBadge tone="neutral">{total} {total === 1 ? "tipo" : "tipos"}</StatusBadge>
        ) : undefined
      }
      actions={
        <Button variant="brand" onClick={() => { setEdit(null); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo tipo
        </Button>
      }
    >
        <IncidentTypesTable
          rows={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          loading={loading}
          query={query}
          onQueryChange={setQuery}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          onEdit={(r) => { setEdit(r); setOpen(true); }}
          onToggleStatus={async (id: string) => {
            try {
              await IncidentTypesService.toggle(id);
              toast.success('Estado actualizado');
              await fetchData();
            } catch (e: any) {
              toast.error(e?.message || 'Error al actualizar estado');
            }
          }}
          onBulkDelete={(ids: string[]) => {
            setDeleteIds(ids || []);
            setConfirmOpen(true);
          }}
        />
        <IncidentTypeDialog
          open={open}
          onOpenChange={setOpen}
          title={edit ? "Editar Tipo de Incidente" : "Nuevo Tipo de Incidente"}
          defaultValues={edit ? { name: edit.name } : null}
          onSubmit={async (values: IncidentTypeDialogValues) => {
            try {
              if (edit) {
                await IncidentTypesService.update(edit.id, { name: values.name });
                toast.success("Tipo de incidente actualizado");
              } else {
                await IncidentTypesService.create({ name: values.name });
                toast.success("Tipo de incidente creado");
              }
              await fetchData();
            } catch (e: any) {
              const msg = e?.message || "Error al guardar";
              try { toast.error(msg); } catch {}
            } finally {
              setOpen(false);
              setEdit(null);
            }
          }}
        />
        <Modal
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          size="sm"
          icon={<AlertTriangle />}
          title="Confirmar eliminación"
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={async () => {
                try {
                  await IncidentTypesService.destroyAll(deleteIds);
                  toast.success('Tipos de incidente eliminados');
                  await fetchData();
                } catch (e: any) {
                  toast.error(e?.message || 'Error al eliminar');
                } finally {
                  setConfirmOpen(false);
                  setDeleteIds([]);
                }
              }}>Eliminar</Button>
            </>
          }
        >
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            ¿Estás seguro que deseas eliminar {deleteIds.length} tipo(s) de incidente? Esta acción no se puede deshacer.
          </p>
        </Modal>
    </SettingsPageShell>
  );
}
