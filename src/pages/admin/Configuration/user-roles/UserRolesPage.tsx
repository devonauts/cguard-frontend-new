import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ApiService, ApiError } from "@/services/api/apiService";
import { roleDisplayName, roleDisplayDescription, uiLang } from "@/config/roleLabels";

import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ShieldCheck, Search, Plus, Lock } from "lucide-react";

import UserRolesTable, { UserRoleRow } from "./UserRolesTable";
import UserRoleDialog, { UserRoleDialogValues } from "./UserRoleDialog";
import PermissionsEditor from "./PermissionsEditor";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PermissionedButton } from "@/components/permissions/Permissioned";
import { ADMIN_FLOOR_PERMISSIONS } from "@/config/permissions";
import { PageContainer, PageHeader, StatusBadge } from "@/components/kit";

// Roles whose permissions are NEVER tenant-editable (global / external).
const FULLY_LOCKED_ROLE_SLUGS = ['superadmin', 'customer'];

const slugOf = (role: { slug?: string; name?: string; id?: string }) =>
  String(role.slug ?? role.name ?? role.id ?? '').toLowerCase();

// A role record as returned by the API, tolerating legacy id/label field names.
type RawRole = {
  id?: string;
  _id?: string;
  name?: string;
  label?: string;
  description?: string;
  desc?: string;
  isSystem?: boolean;
  slug?: string;
};

export default function UserRolesPage() {
  // Built-in role names/descriptions come from the backend as raw English
  // identifiers; render them via roleLabels in the chosen language and
  // re-render when it changes.
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState("25");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<UserRoleRow | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [dialogDefaults, setDialogDefaults] = useState<UserRoleDialogValues | null>(null);
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);
  const [expandedRolePerms, setExpandedRolePerms] = useState<string[]>([]);
  const [permQuery, setPermQuery] = useState("");

  const [rows, setRows] = useState<UserRoleRow[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // SECURITY: tenantId is client-supplied (localStorage) and used only as a
        // path segment. The backend MUST authorize the authenticated user against
        // this tenant for every /tenant/:id/role route; isolation cannot rely on
        // this client value. (Frontend contract left intact intentionally.)
        const tenantId = localStorage.getItem("tenantId") || "";
        if (!tenantId) return;
        const res = await ApiService.get(`/tenant/${tenantId}/role`);
        if (import.meta.env.DEV) console.debug('[UserRolesPage] GET /role response ->', res);
        // Support several possible shapes returned by the API
        //  - an array of roles
        //  - { rows: [...], count }
        //  - { data: { rows: [...] } }
        const data = Array.isArray(res)
          ? res
          : (res && res.rows)
          ? res.rows
          : (res && (res.data && Array.isArray(res.data.rows)))
          ? res.data.rows
          : [];
        if (!mounted) return;
        // map to UserRoleRow shape, tolerate different id fields
        const mapped: UserRoleRow[] = data.map((r: RawRole) => {
          const slug = slugOf(r);
          const fullyLocked = FULLY_LOCKED_ROLE_SLUGS.includes(slug);
          // A built-in/system role (per the API flag, falling back to the
          // presence of a known slug). System roles can't be deleted or renamed
          // via the dialog, but their permissions ARE editable (unless fully
          // locked) through the expand panel.
          const isSystem = typeof r.isSystem === 'boolean' ? r.isSystem : fullyLocked;
          return {
            id: r.id ?? r._id ?? String(r.id),
            name: r.name ?? r.label ?? "",
            slug,
            description: r.description ?? r.desc ?? "",
            isSystem,
            fullyLocked,
            isDefault: isSystem,
          };
        });
        setRows(mapped);
      } catch (err) {
        console.error('Error cargando roles:', err);
        toast.error('No se pudieron cargar los roles');
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Localized presentation of the rows. roleDisplayName/Description translate
  // any name matching a known built-in slug (some tenants carry duplicate
  // built-in rows without the isSystem flag) and pass custom names through.
  const displayRows = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        name: roleDisplayName(r.slug || r.name) || r.name,
        description: roleDisplayDescription(r.slug || r.name, r.description),
      })),
    [rows, lang],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return displayRows;
    return displayRows.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.slug || "").toLowerCase().includes(q),
    );
  }, [displayRows, query]);

  // Cap the rendered rows to the selected page size so the per-page control
  // is functional (this screen has no page navigation, so we show page 1).
  const paged = useMemo(() => {
    const size = Number(pageSize) || filtered.length;
    return filtered.slice(0, size);
  }, [filtered, pageSize]);

  const expandedRole = expandedRoleId ? rows.find((r) => r.id === expandedRoleId) : null;
  // Only superadmin/customer are read-only; all other roles (incl. built-ins) are editable.
  const expandedRoleIsLocked = expandedRole ? !!expandedRole.fullyLocked : false;
  // The admin role keeps its floor permissions locked-on (can't be removed).
  const expandedLockedPerms = expandedRole && expandedRole.slug === 'admin' ? ADMIN_FLOOR_PERMISSIONS : [];

  const onCheckAll = (v: boolean) => {
    const next: Record<string, boolean> = {};
    if (v) paged.forEach((r) => {
      if (!r.isDefault) next[r.id] = true;
    });
    setChecked(next);
  };

  const onCheckRow = (id: string, v: boolean) => {
    setChecked((s) => ({ ...s, [id]: v }));
  };

  const onNew = () => {
    setEdit(null);
    setDialogDefaults(null);
    setOpen(true);
  };

  const onEdit = async (r: UserRoleRow) => {
    if (import.meta.env.DEV) console.debug('[UserRolesPage] onEdit clicked for role', r.id, r.name);
    setEdit(r);
    setDialogDefaults(null);
    try {
      const tenantId = localStorage.getItem("tenantId") || "";
      if (!tenantId) throw new Error('Tenant no configurado');
      const res = await ApiService.get(`/tenant/${tenantId}/role/${r.id}`);
      // support nested shapes
      const data = res && (res.data || res) ? (res.data || res) : {};
      setDialogDefaults({
        name: data.name ?? r.name,
        description: data.description ?? r.description ?? "",
        permissions: Array.isArray(data.permissions) ? data.permissions : [],
      });
    } catch (err) {
      // fallback to basic values
      setDialogDefaults({ name: r.name, description: r.description ?? "", permissions: [] });
    }
    setOpen(true);
  };

  const toggleExpand = async (r: UserRoleRow) => {
    if (expandedRoleId === r.id) {
      setExpandedRoleId(null);
      setExpandedRolePerms([]);
      setPermQuery("");
      return;
    }

    // expand: fetch role details to get permissions
    try {
      const tenantId = localStorage.getItem("tenantId") || "";
      if (!tenantId) throw new Error('Tenant no configurado');
      const res = await ApiService.get(`/tenant/${tenantId}/role/${r.id}`);
      const data = res && (res.data || res) ? (res.data || res) : {};
      const perms = Array.isArray(data.permissions) ? data.permissions : [];
      setExpandedRolePerms(perms);
    } catch (err) {
      // fallback: empty perms
      setExpandedRolePerms([]);
    }
    setExpandedRoleId(r.id);
  };

  const saveExpandedPermissions = async (id: string, perms: string[]) => {
    try {
      const role = rows.find((r) => r.id === id);
      if (role && role.fullyLocked) {
        toast.error('Los permisos de este rol no se pueden modificar');
        return;
      }
      const tenantId = localStorage.getItem("tenantId") || "";
      if (!tenantId) throw new Error('Tenant no configurado');
      // Always keep the admin floor in the saved set (defense in depth; the
      // backend also force-unions it).
      let toSave = perms;
      if (role && role.slug === 'admin') {
        toSave = Array.from(new Set([...perms, ...ADMIN_FLOOR_PERMISSIONS]));
      }
      await ApiService.put(`/tenant/${tenantId}/role/${id}`, { permissions: toSave });
      toast.success('Permisos actualizados');
      // close expanded
      setExpandedRoleId(null);
      setExpandedRolePerms([]);
    } catch (err) {
      toast.error('Error guardando permisos');
    }
  };

  const resetRoleToDefault = async (id: string) => {
    try {
      const tenantId = localStorage.getItem("tenantId") || "";
      if (!tenantId) throw new Error('Tenant no configurado');
      const res = await ApiService.post(`/tenant/${tenantId}/role/${id}/reset`, {});
      const perms = res && Array.isArray(res.permissions) ? res.permissions : (res?.data?.permissions ?? []);
      setExpandedRolePerms(perms);
      toast.success('Rol restablecido a sus valores predeterminados');
    } catch (err) {
      toast.error('Error al restablecer el rol');
    }
  };

 

  const pageLabel = `${paged.length === 0 ? 0 : 1} – ${paged.length} ${uiLang() === "en" ? "of" : "de"} ${filtered.length}`;

  const submit = async (data: UserRoleDialogValues) => {
    try {
      const tenantId = localStorage.getItem("tenantId") || "";
      if (!tenantId) throw new Error('Tenant no configurado');

      if (edit) {
        // update
        const res = await ApiService.put(`/tenant/${tenantId}/role/${edit.id}`, data);
        setRows((s) => s.map((r) => (r.id === edit.id ? { ...r, name: res.name ?? data.name, description: res.description ?? data.description } : r)));
        toast.success('Rol actualizado');
      } else {
        // create
        const res = await ApiService.post(`/tenant/${tenantId}/role`, data);
        const newRow: UserRoleRow = { id: res.id || String(Math.random()), name: res.name ?? data.name, description: res.description ?? data.description };
        setRows((s) => [newRow, ...s]);
        toast.success('Rol creado');
      }

      setOpen(false);
      setEdit(null);
      setDialogDefaults(null);
    } catch (err) {
      toast.error('Error guardando rol');
    }
  };

  const onBulkDelete = async () => {
    const ids = Object.keys(checked).filter((id) => checked[id]);
    if (ids.length === 0) return;
    // open confirmation dialog
    setPendingDeleteIds(ids);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteIds || pendingDeleteIds.length === 0) return;
    const idsToDelete = pendingDeleteIds.filter((id) => {
      const role = rows.find((r) => r.id === id);
      return role ? !role.isDefault : true;
    });
    if (idsToDelete.length === 0) {
      toast.error('No se pueden eliminar roles bloqueados');
      setDeleteDialogOpen(false);
      setPendingDeleteIds([]);
      return;
    }
    try {
      const tenantId = localStorage.getItem("tenantId") || "";
      if (!tenantId) throw new Error('Tenant no configurado');
      for (const id of idsToDelete) {
        await ApiService.delete(`/tenant/${tenantId}/role/${id}`);
      }
      setRows((s) => s.filter((r) => !idsToDelete.includes(r.id)));
      setChecked({});
      toast.success('Roles eliminados');
    } catch (err: any) {
      let message = 'Error eliminando roles';
      if (err instanceof ApiError) {
        // Prefer the ApiError.message, otherwise try structured data
        message = err.message || message;
        if (!message && err.data) {
          if (typeof err.data === 'string') message = err.data;
          else if (err.data.message) message = err.data.message;
          else if (err.data.error) message = err.data.error;
          else message = JSON.stringify(err.data);
        }
      } else if (err && err.message) {
        message = err.message;
      }
      toast.error(message);
    } finally {
      setDeleteDialogOpen(false);
      setPendingDeleteIds([]);
    }
  };

  return (
    <AppLayout>
      <SettingsLayout navKey="configuracion" title="Roles y permisos">
        <PageContainer width="wide">
          <PageHeader
            icon={<ShieldCheck />}
            title="Roles de Usuario"
            subtitle="Define roles y administra los permisos de acceso para cada uno."
            badges={
              rows.length > 0 ? (
                <StatusBadge tone="neutral">{rows.length} {rows.length === 1 ? "rol" : "roles"}</StatusBadge>
              ) : undefined
            }
            actions={
              <PermissionedButton permission="settingsEdit" variant="brand" onClick={onNew}>
                <Plus className="mr-2 h-4 w-4" />
                Nuevo rol
              </PermissionedButton>
            }
          />
        <UserRolesTable
          rows={paged}
          checked={checked}
          onCheckAll={onCheckAll}
          onCheckRow={onCheckRow}
          query={query}
          onQueryChange={setQuery}
          onToggleExpand={toggleExpand}
          onEdit={onEdit}
          onDelete={(r) => {
            if (r.isDefault) return;
            setPendingDeleteIds([r.id]);
            setDeleteDialogOpen(true);
          }}
          onBulkDelete={onBulkDelete}
          expandedRoleId={expandedRoleId}
          expandedContent={
            expandedRoleId ? (
              <div>
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--ink-faint)' }} />
                  <Input className="pl-9" placeholder="Buscar permisos…" value={permQuery} onChange={(e) => setPermQuery(e.target.value)} />
                </div>
                <PermissionsEditor value={expandedRolePerms} onChange={setExpandedRolePerms} query={permQuery} readOnly={expandedRoleIsLocked} lockedPermissions={expandedLockedPerms} />
                {expandedRoleIsLocked ? (
                  <div
                    className="mt-3 flex items-start gap-2 rounded-xl border p-3 text-sm"
                    style={{
                      borderColor: 'color-mix(in oklab, var(--warn) 30%, transparent)',
                      background: 'color-mix(in oklab, var(--warn) 12%, transparent)',
                      color: 'var(--warn-text)',
                    }}
                  >
                    <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Este rol está bloqueado. No se pueden modificar los permisos predeterminados.</span>
                  </div>
                ) : (
                  <div className="flex gap-2 justify-end mt-3">
                    {expandedRole?.isSystem && (
                      <Button variant="outline" className="mr-auto" onClick={() => resetRoleToDefault(expandedRoleId as string)}>
                        Restaurar valores predeterminados
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => { setExpandedRoleId(null); setExpandedRolePerms([]); setPermQuery(""); }}>Cancelar</Button>
                    <Button variant="brand" onClick={() => saveExpandedPermissions(expandedRoleId as string, expandedRolePerms)}>Guardar</Button>
                  </div>
                )}
              </div>
            ) : null
          }
          pageSize={pageSize}
          onPageSize={setPageSize}
          pageLabel={pageLabel}
        />

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar roles</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogDescription>
              ¿Estás seguro que deseas eliminar {pendingDeleteIds.length} rol(es)? Esta acción no se puede deshacer.
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => { setDeleteDialogOpen(false); setPendingDeleteIds([]); }}>Cancelar</AlertDialogCancel>
              <AlertDialogAction className="cg-btn-bad" onClick={handleConfirmDelete}>
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <UserRoleDialog
          open={open}
          onOpenChange={setOpen}
          title={edit ? "Editar Rol" : "Nuevo Rol"}
          defaultValues={dialogDefaults}
          onSubmit={submit}
        />
        </PageContainer>
      </SettingsLayout>
    </AppLayout>
  );
}
