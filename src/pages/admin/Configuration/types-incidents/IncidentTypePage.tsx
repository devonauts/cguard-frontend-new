import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      title={t('settings.incidentTypes.pageTitle', { defaultValue: 'Tipos de Incidentes' })}
      subtitle={t('settings.incidentTypes.pageSubtitle', { defaultValue: 'El catálogo con el que tu equipo clasifica lo que ocurre en cada puesto.' })}
      badges={
        !loading && total > 0 ? (
          <StatusBadge tone="neutral">{total} {total === 1 ? t('settings.incidentTypes.typeSingular', { defaultValue: 'tipo' }) : t('settings.incidentTypes.typePlural', { defaultValue: 'tipos' })}</StatusBadge>
        ) : undefined
      }
      actions={
        <Button variant="brand" onClick={() => { setEdit(null); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          {t('settings.incidentTypes.newTypeBtn', { defaultValue: 'Nuevo tipo' })}
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
              toast.success(t('settings.incidentTypes.statusUpdated', { defaultValue: 'Estado actualizado' }));
              await fetchData();
            } catch (e: any) {
              toast.error(e?.message || t('settings.incidentTypes.statusUpdateError', { defaultValue: 'Error al actualizar estado' }));
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
          title={edit ? t('settings.incidentTypes.dialogEditTitle', { defaultValue: 'Editar Tipo de Incidente' }) : t('settings.incidentTypes.dialogNewTitle', { defaultValue: 'Nuevo Tipo de Incidente' })}
          defaultValues={edit ? { name: edit.name } : null}
          onSubmit={async (values: IncidentTypeDialogValues) => {
            try {
              if (edit) {
                await IncidentTypesService.update(edit.id, { name: values.name });
                toast.success(t('settings.incidentTypes.typeUpdated', { defaultValue: 'Tipo de incidente actualizado' }));
              } else {
                await IncidentTypesService.create({ name: values.name });
                toast.success(t('settings.incidentTypes.typeCreated', { defaultValue: 'Tipo de incidente creado' }));
              }
              await fetchData();
            } catch (e: any) {
              const msg = e?.message || t('settings.incidentTypes.saveError', { defaultValue: 'Error al guardar' });
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
          title={t('settings.incidentTypes.confirmDeleteTitle', { defaultValue: 'Confirmar eliminación' })}
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>{t('settings.incidentTypes.cancelBtn', { defaultValue: 'Cancelar' })}</Button>
              <Button variant="destructive" onClick={async () => {
                try {
                  await IncidentTypesService.destroyAll(deleteIds);
                  toast.success(t('settings.incidentTypes.typesDeleted', { defaultValue: 'Tipos de incidente eliminados' }));
                  await fetchData();
                } catch (e: any) {
                  toast.error(e?.message || t('settings.incidentTypes.deleteError', { defaultValue: 'Error al eliminar' }));
                } finally {
                  setConfirmOpen(false);
                  setDeleteIds([]);
                }
              }}>{t('settings.incidentTypes.deleteAction', { defaultValue: 'Eliminar' })}</Button>
            </>
          }
        >
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            {t('settings.incidentTypes.confirmDeleteText', { defaultValue: '¿Estás seguro que deseas eliminar {{count}} tipo(s) de incidente? Esta acción no se puede deshacer.', count: deleteIds.length })}
          </p>
        </Modal>
    </SettingsPageShell>
  );
}
