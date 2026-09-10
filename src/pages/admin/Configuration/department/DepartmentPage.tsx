import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Plus } from "lucide-react";
import { toast } from "sonner";

import DepartmentsTable, { DepartmentRow } from "./DepartmentTable";
import DepartmentDialog, { DepartmentDialogValues } from "./DepartmentDialog";

import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader, StatusBadge } from "@/components/kit";
import { usePermissions } from "@/hooks/usePermissions";
import departmentService, { Department } from "@/lib/api/departmentService";
import { userService } from "@/lib/api/userService";
import { confirmDialog } from "@/components/ui/confirmDialog";

const errMsg = (e: unknown, fallback: string): string => {
  const err = e as
    | { response?: { data?: { message?: string } | string }; message?: string }
    | undefined;
  const data = err?.response?.data;

  return (
    (data && typeof data === "object" ? data.message : undefined) ||
    (typeof data === "string" ? data : undefined) ||
    err?.message ||
    fallback
  );
};

export default function DepartmentPage() {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("settingsEdit");

  const [all, setAll] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<DepartmentRow | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { rows } = await departmentService.list();

      setAll(rows);
    } catch (e: any) {
      toast.error(
        errMsg(
          e,
          t(
            "settings.departments.errors.load",
            "No se pudieron cargar los departamentos",
          ),
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    userService
      .listUsers({ limit: 300, offset: 0 })
      .then((users) => {
        setManagers(
          users
            .map((u) => ({
              id: u.id ?? "",
              name:
                u.fullName ||
                [u.firstName, u.lastName].filter(Boolean).join(" ") ||
                u.email ||
                "—",
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      })
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) return all;

    return all.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.description || "").toLowerCase().includes(q) ||
        (d.manager?.name || "").toLowerCase().includes(q),
    );
  }, [all, query]);

  const rows: DepartmentRow[] = useMemo(
    () =>
      filtered.slice((page - 1) * pageSize, page * pageSize).map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        managerName: d.manager?.name ?? null,
        managerId: d.manager?.id ?? null,
        members: d.members,
        status: d.active ? "active" : "inactive",
        createdAt: d.createdAt,
      })),
    [filtered, page, pageSize],
  );

  const handleSubmit = async (values: DepartmentDialogValues) => {
    try {
      setSaving(true);
      const payload = {
        name: values.name.trim(),
        description: values.description?.trim() || null,
        managerId: values.managerId || null,
      };

      if (edit) {
        await departmentService.update(edit.id, payload);
        toast.success("Departamento actualizado");
      } else {
        await departmentService.create(payload);
        toast.success("Departamento creado");
      }
      setOpen(false);
      setEdit(null);
      await load();
    } catch (e: any) {
      toast.error(
        errMsg(
          e,
          t(
            "settings.departments.errors.save",
            "No se pudo guardar el departamento",
          ),
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (row: DepartmentRow) => {
    try {
      await departmentService.update(row.id, {
        active: row.status === "inactive",
      });
      toast.success(
        row.status === "inactive"
          ? "Departamento activado"
          : "Departamento desactivado",
      );
      await load();
    } catch (e: any) {
      toast.error(
        errMsg(
          e,
          t(
            "settings.departments.errors.toggle",
            "No se pudo cambiar el estado",
          ),
        ),
      );
    }
  };

  const handleDelete = async (row: DepartmentRow) => {
    if (
      !(await confirmDialog({
        message: `¿Eliminar el departamento "${row.name}"?`,
        tone: "danger",
      }))
    )
      return;
    try {
      await departmentService.destroy(row.id);
      toast.success("Departamento eliminado");
      await load();
    } catch (e: any) {
      // Backend blocks deletion while the department still has members.
      toast.error(
        errMsg(
          e,
          t(
            "settings.departments.errors.delete",
            "No se pudo eliminar el departamento",
          ),
        ),
      );
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (
      !(await confirmDialog({
        message: `¿Eliminar ${ids.length} departamento(s)?`,
        tone: "danger",
      }))
    )
      return;
    let ok = 0;

    for (const id of ids) {
      try {
        await departmentService.destroy(id);
        ok++;
      } catch (e: any) {
        toast.error(
          errMsg(
            e,
            t(
              "settings.departments.errors.deleteOne",
              "No se pudo eliminar un departamento",
            ),
          ),
        );
      }
    }
    if (ok > 0) toast.success(`${ok} departamento(s) eliminado(s)`);
    await load();
  };

  return (
    <AppLayout>
      <SettingsLayout navKey="configuracion" title="Departamentos">
        <PageContainer width="wide">
          <PageHeader
            actions={
              <Button
                disabled={!canEdit}
                variant="brand"
                onClick={() => {
                  setEdit(null);
                  setOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Nuevo departamento
              </Button>
            }
            badges={
              !loading && all.length > 0 ? (
                <StatusBadge tone="neutral">
                  {all.length}{" "}
                  {all.length === 1 ? "departamento" : "departamentos"}
                </StatusBadge>
              ) : undefined
            }
            icon={<Building2 />}
            subtitle="Organiza tu equipo interno en departamentos (Operaciones, Talento Humano, Nómina…) y asigna un responsable a cada uno."
            title="Departamentos"
          />
          <DepartmentsTable
            canEdit={canEdit}
            loading={loading}
            page={page}
            pageSize={pageSize}
            query={query}
            rows={rows}
            total={filtered.length}
            onBulkDelete={handleBulkDelete}
            onDelete={handleDelete}
            onEdit={(r) => {
              setEdit(r);
              setOpen(true);
            }}
            onPageChange={setPage}
            onPageSizeChange={(v) => {
              setPageSize(v);
              setPage(1);
            }}
            onQueryChange={(v) => {
              setQuery(v);
              setPage(1);
            }}
            onToggleStatus={handleToggle}
          />
          <DepartmentDialog
            defaultValues={
              edit
                ? {
                    name: edit.name,
                    description: edit.description ?? "",
                    managerId: edit.managerId ?? null,
                  }
                : null
            }
            managers={managers}
            open={open}
            saving={saving}
            title={edit ? "Editar Departamento" : "Nuevo Departamento"}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) setEdit(null);
            }}
            onSubmit={handleSubmit}
          />
        </PageContainer>
      </SettingsLayout>
    </AppLayout>
  );
}
