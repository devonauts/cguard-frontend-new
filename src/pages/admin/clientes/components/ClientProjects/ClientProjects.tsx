import type { Client } from "@/types/client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  EllipsisVertical,
} from "lucide-react";
import { toast } from "sonner";
import { FolderKanban } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { projectService, type ClientProject } from "@/lib/api/projectService";
import {
  ProjectTypeBadge,
  ProjectStatusBadge,
} from "@/components/projects/ProjectBadge";
import ProjectForm from "@/pages/admin/projects/ProjectForm";
import { Section, EmptyState, SkeletonCards } from "@/components/kit";

interface Props {
  client: Client;
}

export default function ClientProjects({ client }: Props) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<ClientProject[]>([]);
  const [loading, setLoading] = useState(false);

  // Create / Edit dialog
  const [openForm, setOpenForm] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);

  // Delete dialog
  const [deleteTargetId, setDeleteTargetId] = useState<string | undefined>(
    undefined,
  );

  const loadProjects = async () => {
    if (!client?.id) return;
    setLoading(true);
    try {
      const { rows } = await projectService.listByClient(client.id);

      setProjects(rows);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, [client?.id]);

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await projectService.delete([deleteTargetId]);
      toast.success(
        t("ui.ClientProjects.proyectoEliminado", "Proyecto eliminado"),
      );
      setDeleteTargetId(undefined);
      loadProjects();
    } catch {
      toast.error(t("ui.ClientProjects.errorAlEliminar"));
    }
  };

  const handleMarkComplete = async (id: string) => {
    try {
      await projectService.update(id, { status: "completed" });
      toast.success(
        t(
          "ui.ClientProjects.proyectoCompletado",
          "Proyecto marcado como completado",
        ),
      );
      loadProjects();
    } catch {
      toast.error(
        t("ui.ClientProjects.errorAlActualizar", "Error al actualizar"),
      );
    }
  };

  return (
    <div className="p-4">
      <Section
        action={
          <Button
            size="sm"
            variant="brand"
            onClick={() => {
              setEditingId(undefined);
              setOpenForm(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            {t("ui.ClientProjects.nuevoProyecto", "Nuevo proyecto")}
          </Button>
        }
        contentClassName="-mx-1"
        icon={<FolderKanban />}
        title={t("ui.ClientProjects.proyectos", "Proyectos")}
      >
        {/* List */}
        {loading ? (
          <SkeletonCards count={4} />
        ) : projects.length === 0 ? (
          <EmptyState
            action={
              <Button
                size="sm"
                variant="brand"
                onClick={() => {
                  setEditingId(undefined);
                  setOpenForm(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />{" "}
                {t("ui.ClientProjects.nuevoProyecto", "Nuevo proyecto")}
              </Button>
            }
            description={t("ui.ClientProjects.noHayProyectosParaEste")}
            icon={<FolderKanban />}
            title={t("ui.ClientProjects.sinProyectos")}
          />
        ) : (
          <div className="border rounded-xl overflow-x-auto">
            <table className="min-w-[640px] w-full text-sm text-left">
              <thead>
                <tr className="border-b">
                  <th className="cg-eyebrow px-2 py-2">
                    {t("ui.ClientProjects.proyecto", "Proyecto")}
                  </th>
                  <th className="cg-eyebrow px-2 py-2">{t("comun.tipo")}</th>
                  <th className="cg-eyebrow px-2 py-2">
                    {t("ui.ClientProjects.inicio", "Inicio")}
                  </th>
                  <th className="cg-eyebrow px-2 py-2">
                    {t("ui.ClientProjects.fin", "Fin")}
                  </th>
                  <th className="cg-eyebrow px-2 py-2">{t("comun.estado")}</th>
                  <th className="cg-eyebrow px-2 py-2 text-right">
                    {t("ui.RouteForm.acciones", "Acciones")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-2 py-2.5 font-medium">
                      <div>{p.name}</div>
                      {p.location && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {p.location}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      <ProjectTypeBadge value={p.type} />
                    </td>
                    <td className="px-2 py-2.5 text-foreground/70">
                      {p.startDate ?? "-"}
                    </td>
                    <td className="px-2 py-2.5 text-foreground/70">
                      {p.endDate ?? "-"}
                    </td>
                    <td className="px-2 py-2.5">
                      <ProjectStatusBadge value={p.status} />
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                            <EllipsisVertical className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            onClick={() => {
                              setEditingId(p.id);
                              setOpenForm(true);
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />{" "}
                            {t("actions.edit", "Editar")}
                          </DropdownMenuItem>
                          {p.status !== "completed" && (
                            <DropdownMenuItem
                              onClick={() => handleMarkComplete(p.id)}
                            >
                              <CheckCircle2
                                className="mr-2 h-4 w-4"
                                style={{ color: "var(--ok-text)" }}
                              />{" "}
                              {t(
                                "ui.ClientProjects.marcarCompletado",
                                "Marcar completado",
                              )}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            style={{ color: "var(--bad-text)" }}
                            onClick={() => setDeleteTargetId(p.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />{" "}
                            {t("actions.delete", "Eliminar")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Create / Edit Dialog */}
      <Dialog open={openForm} onOpenChange={setOpenForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? t("ui.ClientProjects.editarProyecto", "Editar proyecto")
                : t("ui.ClientProjects.nuevoProyecto", "Nuevo proyecto")}
            </DialogTitle>
          </DialogHeader>
          <ProjectForm
            defaultClientId={client?.id}
            mode={editingId ? "edit" : "create"}
            projectId={editingId}
            onCancel={() => setOpenForm(false)}
            onSaved={() => {
              setOpenForm(false);
              loadProjects();
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTargetId}
        onOpenChange={(open) => !open && setDeleteTargetId(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(
                "ui.ClientProjects.eliminarEsteProyecto",
                "¿Eliminar este proyecto?",
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "ui.ClientProjects.estaAccionNoSePuede",
                "Esta acción no se puede deshacer.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="cg-btn-bad" onClick={handleDelete}>
              {t("actions.delete", "Eliminar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
