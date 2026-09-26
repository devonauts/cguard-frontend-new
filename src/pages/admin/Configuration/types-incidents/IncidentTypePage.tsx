import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { toast } from "sonner";
import { AlertTriangle, Plus, Siren } from "lucide-react";

import SettingsPageShell from "../components/SettingsPageShell";

import IncidentTypesTable, { IncidentTypeRow } from "./IncidentTypesTable";
import IncidentTypeDialog, {
  IncidentTypeDialogValues,
} from "./IncidentTypeDialog";

import IncidentTypesService from "@/services/incident-types.service";
import { Button } from "@/components/ui/button";
import { Modal, StatusBadge } from "@/components/kit";

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
      const resp: {
        rows?: Array<{ id: string; name: string; active?: boolean | number }>;
        count?: number;
      } = await IncidentTypesService.list(query, page, pageSize);
      const mapped = (resp.rows || []).map((r) => ({
        id: r.id,
        name: r.name,
        status: (r.active === true || r.active === 1
          ? "active"
          : "inactive") as "active" | "inactive",
      }));

      setRows(mapped);
      setTotal(resp.count || 0);
    } catch (e) {
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
          {t("settings.incidentTypes.newTypeBtn", {
            defaultValue: "Nuevo tipo",
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
      icon={<Siren />}
      kind="table"
      subtitle={t("settings.incidentTypes.pageSubtitle", {
        defaultValue:
          "El catálogo con el que tu equipo clasifica lo que ocurre en cada puesto.",
      })}
      title={t("settings.incidentTypes.pageTitle", {
        defaultValue: "Tipos de Incidentes",
      })}
    >
      <IncidentTypesTable
        loading={loading}
        page={page}
        pageSize={pageSize}
        query={query}
        rows={rows}
        total={total}
        onBulkDelete={(ids: string[]) => {
          setDeleteIds(ids || []);
          setConfirmOpen(true);
        }}
        onEdit={(r) => {
          setEdit(r);
          setOpen(true);
        }}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onQueryChange={setQuery}
        onToggleStatus={async (id: string) => {
          try {
            await IncidentTypesService.toggle(id);
            toast.success(
              t("settings.incidentTypes.statusUpdated", {
                defaultValue: "Estado actualizado",
              }),
            );
            await fetchData();
          } catch (e: any) {
            toast.error(
              e?.message ||
                t("settings.incidentTypes.statusUpdateError", {
                  defaultValue: "Error al actualizar estado",
                }),
            );
          }
        }}
      />
      <IncidentTypeDialog
        defaultValues={edit ? { name: edit.name } : null}
        open={open}
        title={
          edit
            ? t("settings.incidentTypes.dialogEditTitle", {
                defaultValue: "Editar Tipo de Incidente",
              })
            : t("settings.incidentTypes.dialogNewTitle", {
                defaultValue: "Nuevo Tipo de Incidente",
              })
        }
        onOpenChange={setOpen}
        onSubmit={async (values: IncidentTypeDialogValues) => {
          try {
            if (edit) {
              await IncidentTypesService.update(edit.id, { name: values.name });
              toast.success(
                t("settings.incidentTypes.typeUpdated", {
                  defaultValue: "Tipo de incidente actualizado",
                }),
              );
            } else {
              await IncidentTypesService.create({ name: values.name });
              toast.success(
                t("settings.incidentTypes.typeCreated", {
                  defaultValue: "Tipo de incidente creado",
                }),
              );
            }
            await fetchData();
          } catch (e: any) {
            const msg =
              e?.message ||
              t("settings.incidentTypes.saveError", {
                defaultValue: "Error al guardar",
              });

            try {
              toast.error(msg);
            } catch {}
          } finally {
            setOpen(false);
            setEdit(null);
          }
        }}
      />
      <Modal
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t("settings.incidentTypes.cancelBtn", {
                defaultValue: "Cancelar",
              })}
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await IncidentTypesService.destroyAll(deleteIds);
                  toast.success(
                    t("settings.incidentTypes.typesDeleted", {
                      defaultValue: "Tipos de incidente eliminados",
                    }),
                  );
                  await fetchData();
                } catch (e: any) {
                  toast.error(
                    e?.message ||
                      t("settings.incidentTypes.deleteError", {
                        defaultValue: "Error al eliminar",
                      }),
                  );
                } finally {
                  setConfirmOpen(false);
                  setDeleteIds([]);
                }
              }}
            >
              {t("settings.incidentTypes.deleteAction", {
                defaultValue: "Eliminar",
              })}
            </Button>
          </>
        }
        icon={<AlertTriangle />}
        open={confirmOpen}
        size="sm"
        title={t("settings.incidentTypes.confirmDeleteTitle", {
          defaultValue: "Confirmar eliminación",
        })}
        onOpenChange={setConfirmOpen}
      >
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          {t("settings.incidentTypes.confirmDeleteText", {
            defaultValue:
              "¿Estás seguro que deseas eliminar {{count}} tipo(s) de incidente? Esta acción no se puede deshacer.",
            count: deleteIds.length,
          })}
        </p>
      </Modal>
    </SettingsPageShell>
  );
}
