import type { RoleRef } from "./adminUserTypes";

import { useEffect, useMemo, useState } from "react";
import {
  EllipsisVertical,
  Filter,
  FileDown,
  FileSpreadsheet,
  ArrowDownUp,
  Search,
  Send,
  Archive,
  Users,
  LayoutGrid,
  List as ListIcon,
  Pencil,
  RotateCw,
  Trash,
  UserCog,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import { nombreDeRol as nombreDeRolBase } from "./nombreDeRol";
import AdminUserCardsGrid, {
  type AdminUserCardAction,
  type AdminUserRow,
} from "./AdminUserCardsGrid";

import { clientDisplayName } from "@/lib/clientName";
import { ApiService } from "@/services/api/apiService";
import userService from "@/lib/api/userService";
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  PageContainer,
  PageHeader,
  StatusBadge,
  Segmented,
  Toolbar,
  GlassPanel,
} from "@/components/kit";
import { usePermissions } from "@/hooks/usePermissions";
import { EstadoVacio } from "@/components/EstadoVacio";
import { PermissionedButton } from "@/components/permissions/Permissioned";
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
import MobileCardList from "@/components/responsive/MobileCardList";
import { localeActual } from "@/lib/localeActual";
import { hoyEnLaEmpresa, zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";
import { useVistaGuardada } from "@/hooks/useVistaGuardada";
import EtiquetaDeMarca from "@/components/multimarca/EtiquetaDeMarca";
import { useEtiquetasDeMarca } from "@/hooks/useMarcas";
import { confirmDialog } from "@/components/ui/confirmDialog";
/* Debounce helper */

function useDebounced<T>(value: T, delay = 400) {
  const [deb, setDeb] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDeb(value), delay);

    return () => clearTimeout(id);
  }, [value, delay]);

  return deb;
}

export default function AdminOfficeUsersPage() {
  const { t } = useTranslation();
  // Multimarca («Todas las marcas»): the brand each person is registered in.
  const marcas = useEtiquetasDeMarca({ personas: true });
  /** A role slug in the reader's language («dispatcher» → «Despachador»); custom roles keep their name. */
  const nombreDeRol = (slug: string) => nombreDeRolBase(slug, t);
  const [openFilter, setOpenFilter] = useState(false);
  // Vista Tarjetas ⇄ Lista (persistida). Tarjetas por defecto, como en Clientes/Vigilantes.
  const [viewMode, setViewMode] = useVistaGuardada<"cards" | "list">(
    "adminUsers.viewMode",
    "cards",
  );
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterClient, setFilterClient] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [clientOptions, setClientOptions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkAction, setBulkAction] = useState<string | null>(null);
  const [selectKey, setSelectKey] = useState(0);

  const debouncedQuery = useDebounced(query, 450);

  // filas desde API
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  /* La lista NUNCA mostraba esqueleto: `loading` estaba clavado a `false` en
     los dos renderizadores, así que mientras cargaba se veía el estado VACÍO
     («No se encontraron resultados») y parecía que no había usuarios. */
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const { hasPermission, hasAny } = usePermissions();
  const canManageUsers = hasAny([
    "userEdit",
    "userDestroy",
    "userImport",
    "userCreate",
    "userExport",
  ]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [resendDialogOpen, setResendDialogOpen] = useState(false);
  const [selectedUserToAct, setSelectedUserToAct] =
    useState<AdminUserRow | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const formatUserDisplay = (u: AdminUserRow | null) => {
    if (!u) return "";

    return (
      u.fullName ||
      [u.firstName, u.lastName].filter(Boolean).join(" ") ||
      u.name ||
      u.email ||
      ""
    );
  };

  const normalizeRolesForUser = (roles: any): string[] => {
    if (!roles) return [];
    if (Array.isArray(roles))
      return roles
        .map((x) => (typeof x === "string" ? x : x.name || x.role || ""))
        .filter(Boolean)
        .map((s) => String(s).toLowerCase().trim());
    if (typeof roles === "string") return [roles.toLowerCase().trim()];

    return [(roles.name || roles.role || "").toString().toLowerCase().trim()];
  };

  // UX-ONLY guard. This role-string check prevents the suspend/delete UI from
  // targeting admins, but it is NOT authorization: roles may arrive in an
  // unrecognized shape (normalizeRolesForUser handles only a few), so the real
  // protection MUST be enforced server-side (the backend must reject suspend/
  // delete of admin users regardless of this client check).
  const isUserAdmin = (u: AdminUserRow | null | undefined) => {
    if (!u) return false;
    const r = normalizeRolesForUser(
      u.roles || u.role || u.rolesList || u._rolesDisplay,
    );

    return (
      r.includes("admin") ||
      r.includes("super admin") ||
      r.includes("superadmin")
    );
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const usersResp = await userService.listUsers();
      let users: AdminUserRow[] = usersResp || [];

      const normalizeRoles = (roles: any): string[] => {
        if (!roles) return [];
        if (Array.isArray(roles)) {
          return roles
            .map((r) =>
              typeof r === "string"
                ? r
                : r && (r.name || r.role)
                  ? r.name || r.role
                  : "",
            )
            .filter(Boolean)
            .map((s) => String(s).toLowerCase().trim());
        }
        if (typeof roles === "string") return [roles.toLowerCase().trim()];
        if (typeof roles === "object") {
          const candidate = roles.name || roles.role || roles.type || "";

          return candidate ? [String(candidate).toLowerCase().trim()] : [];
        }

        return [];
      };

      // Mostrar todos los usuarios (incluye vigilantes). Normalizar roles para mostrar.
      // SIN supervisores de seguridad: viven en Equipo de seguridad › Supervisores.
      const filtered = (users || [])
        .map((u) => ({
          ...u,
          _rolesDisplay: (
            normalizeRoles(u.roles || u.role || u.rolesList) || []
          )
            .map(nombreDeRol)
            .join(", "),
        }))
        .filter((u) => {
          const roles = normalizeRoles(
            u.roles ||
              u.role ||
              (u as { rolesList?: unknown }).rolesList ||
              u._rolesDisplay,
          );

          return (
            !roles.includes("customer") && !roles.includes("securitysupervisor")
          );
        });

      setRows(filtered);
    } catch (err) {
      console.error("Error cargando usuarios:", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadClients = async () => {
    try {
      const tenantId = localStorage.getItem("tenantId") || "";

      if (!tenantId) return;
      const resp = await ApiService.get(`/tenant/${tenantId}/client-account`);
      const rows = Array.isArray(resp)
        ? resp
        : resp && resp.rows
          ? resp.rows
          : [];
      const mapped = (rows || []).map((c: any) => {
        // Este selector asigna clientes a un usuario: debe listar EMPRESAS.
        const display = clientDisplayName(
          c,
          c.label || c.clientAccountName || "",
        );

        return { id: c.id ?? c._id ?? String(c.id), name: display };
      });

      setClientOptions(mapped);
    } catch (e) {
      console.error("Error cargando clientes para filtros", e);
    }
  };

  const loadCurrentUser = async () => {
    try {
      const me = await userService.fetchCurrentUser();

      const extractRoles = (obj: any): string[] => {
        if (!obj) return [];
        // common shapes
        if (Array.isArray(obj))
          return obj
            .map((x) => (typeof x === "string" ? x : x.name || x.role || ""))
            .filter(Boolean)
            .map((s) => String(s).toLowerCase().trim());
        if (typeof obj === "string") return [obj.toLowerCase().trim()];
        if (typeof obj === "object") {
          // role may be a string or object
          if (obj.name || obj.role)
            return [
              String(obj.name || obj.role)
                .toLowerCase()
                .trim(),
            ];
        }

        return [];
      };

      // try multiple locations where backend may put tenant-role info
      let rolesCollected: string[] = [];

      rolesCollected = rolesCollected.concat(
        extractRoles(me?.roles || me?.role || me?.rolesList),
      );
      // tenant-level roles: me.tenant.roles or me.tenantUser.roles
      rolesCollected = rolesCollected.concat(extractRoles(me?.tenant?.roles));
      rolesCollected = rolesCollected.concat(
        extractRoles(me?.tenantUser?.roles),
      );
      // some backends return tenants array with tenantUser per tenant
      if (Array.isArray(me?.tenants)) {
        for (const t of me.tenants) {
          rolesCollected = rolesCollected.concat(extractRoles(t?.roles));
          rolesCollected = rolesCollected.concat(
            extractRoles(t?.tenantUser?.roles),
          );
        }
      }

      // normalize set
      const rset = Array.from(
        new Set(
          (rolesCollected || [])
            .filter(Boolean)
            .map((s) => String(s).toLowerCase().trim()),
        ),
      );

      setIsAdminUser(
        rset.includes("admin") ||
          rset.includes("super admin") ||
          rset.includes("superadmin"),
      );
    } catch (e) {
      console.warn("No se pudo obtener usuario actual", e);
      setIsAdminUser(false);
    }
  };

  useEffect(() => {
    loadUsers();
    loadCurrentUser();
    loadClients();
  }, []);

  const navigate = useNavigate();

  const exportUsersFile = async (format: "excel" | "pdf" | "csv") => {
    try {
      const blob = await userService.exportFile(format);
      const ext =
        format === "excel" ? "xlsx" : format === "csv" ? "csv" : "pdf";
      const filename = `usuarios_${hoyEnLaEmpresa()}.${ext}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error exportando usuarios:", err);
      toast.error(
        t("adminOfficeUsers.toasts.exportError", {
          defaultValue: "No se pudo exportar usuarios",
        }),
      );
    }
  };

  const handleSuspendUser = async (user: AdminUserRow) => {
    if (!user) return;
    if (isUserAdmin(user)) {
      toast.error(
        t("adminOfficeUsers.toasts.cannotSuspendAdmin", {
          defaultValue: "No se puede suspender a un usuario administrador",
        }),
      );

      return;
    }
    if (!user.id) return;
    const seguro = await confirmDialog({
      title: t("adminOfficeUsers.dialogs.suspend.title", {
        defaultValue: "Suspender usuario",
      }),
      message: t("adminOfficeUsers.dialogs.suspend.description", {
        defaultValue:
          "{{user}} dejará de poder entrar y pasará a Archivados. Puedes restaurarlo después.",
        user: formatUserDisplay(user),
      }),
      confirmText: t("adminOfficeUsers.dialogs.suspend.confirm", {
        defaultValue: "Suspender",
      }),
      tone: "danger",
    });

    if (!seguro) {
      setSelectedUserToAct(null);

      return;
    }
    try {
      setActionLoading(true);
      await userService.suspendUser(user.id);
      setRows((prev) =>
        prev.map((g) =>
          g.id === user.id
            ? {
                ...g,
                status: "Archivado",
                active: false,
                raw: { ...(g.raw || {}), status: "archived" },
              }
            : g,
        ),
      );
      toast.success(
        t("adminOfficeUsers.toasts.suspendedArchivedSuccess", {
          defaultValue: "Usuario suspendido y archivado",
        }),
      );
    } catch (err: any) {
      console.error(err);
      const serverMsg =
        err?.response?.data?.message ||
        err?.message ||
        (typeof err === "string" ? err : null);

      toast.error(
        serverMsg ||
          t("adminOfficeUsers.toasts.errorSuspendingUser", {
            defaultValue: "Error suspendiendo usuario",
          }),
      );
    } finally {
      setActionLoading(false);
      setSelectedUserToAct(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!userId) return;
    const row = rows.find(
      (r) => String(r.id || r._id || r.raw?.id) === String(userId),
    );

    if (isUserAdmin(row)) {
      toast.error(
        t("adminOfficeUsers.toasts.cannotDeleteAdmin", {
          defaultValue: "No se puede eliminar a un usuario administrador",
        }),
      );

      return;
    }
    try {
      setActionLoading(true);
      await userService.deleteUser(userId);
      setRows((prev) => prev.filter((g) => g.id !== userId));
      toast.success(
        t("adminOfficeUsers.toasts.deletedSuccess", {
          defaultValue: "Usuario eliminado",
        }),
      );
      setDeleteDialogOpen(false);
    } catch (err) {
      console.error(err);
      toast.error(
        t("adminOfficeUsers.toasts.deleteError", {
          defaultValue: "Error eliminando usuario",
        }),
      );
    } finally {
      setActionLoading(false);
      setSelectedUserToAct(null);
    }
  };

  const filteredRows = useMemo(() => {
    let out = rows || [];

    // Apply search query
    if (debouncedQuery) {
      const q = debouncedQuery.toLowerCase();

      out = out.filter((r) => {
        const name = (r.firstName || r.name || "").toString().toLowerCase();
        const email = (r.email || "").toString().toLowerCase();
        // También por su usuario para entrar (alias).
        const alias = (r.username || "").toString().toLowerCase();

        return name.includes(q) || email.includes(q) || alias.includes(q);
      });
    }

    // Apply client filter: be permissive to many possible shapes returned by backend
    if (filterClient && filterClient !== "all") {
      const clientIdStr = String(filterClient);
      const userHasClient = (u: AdminUserRow) => {
        // direct fields
        const candidates = [
          u.clientId,
          u.clientAccountId,
          u.clientIds,
          u.assignedClients,
          u.clients,
          u.client,
        ];

        for (const cand of candidates) {
          if (!cand) continue;
          if (Array.isArray(cand)) {
            if (cand.map(String).includes(clientIdStr)) return true;
          } else if (typeof cand === "object") {
            // object or nested shape
            const co = cand as { id?: unknown; _id?: unknown };

            if (
              (co.id && String(co.id) === clientIdStr) ||
              (co._id && String(co._id) === clientIdStr)
            )
              return true;
            // sometimes it's an array under object
            const vals = Object.values(cand).flat
              ? Object.values(cand).flat()
              : Object.values(cand);

            if (Array.isArray(vals) && vals.map(String).includes(clientIdStr))
              return true;
          } else if (String(cand) === clientIdStr) {
            return true;
          }
        }

        // tenant-scoped assignments: check tenants array for assignedClients/postSiteIds
        if (Array.isArray(u.tenants)) {
          for (const t of u.tenants) {
            const asg =
              t.assignedClients ||
              t.clientIds ||
              t.clientIds ||
              t.assignedClientIds ||
              null;

            if (!asg) continue;
            if (Array.isArray(asg) && asg.map(String).includes(clientIdStr))
              return true;
            if (String(asg) === clientIdStr) return true;
          }
        }

        return false;
      };

      out = out.filter((r) => userHasClient(r));
    }

    // Apply status filter
    if (filterStatus && filterStatus !== "all") {
      out = out.filter((r) => {
        const status = (r.status || "").toString().toLowerCase();

        if (filterStatus === "Activo") {
          // Exclude archived and invitation/pending statuses
          if (status === "archived" || status === "archivado") return false;
          if (status === "invited" || status === "pending") return false;
          if (r.active === false) return false;

          return true;
        }
        if (filterStatus === "Inactivo") {
          return r.active === false;
        }
        if (filterStatus === "Suspendido") {
          return (
            status === "archived" ||
            status === "archivado" ||
            (r.active === false &&
              (status === "archived" || status === "archivado"))
          );
        }

        return true;
      });
    }

    return out;
  }, [rows, debouncedQuery, filterClient, filterStatus]);

  // Client-side pagination: slice the filtered list by the selected pageSize.
  // (Server-side paging in userService.listUsers would be the ideal next step.)
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));

  // Keep the current page within range when the result set or pageSize changes.
  useEffect(() => {
    setCurrentPage((p) => Math.min(Math.max(1, p), pageCount));
  }, [pageCount]);

  const pageStartIndex = (currentPage - 1) * pageSize;
  const pagedRows = useMemo(
    () => filteredRows.slice(pageStartIndex, pageStartIndex + pageSize),
    [filteredRows, pageStartIndex, pageSize],
  );

  const rangeStart = filteredRows.length === 0 ? 0 : pageStartIndex + 1;
  const rangeEnd = Math.min(pageStartIndex + pageSize, filteredRows.length);

  const handleSelectUser = (userId: string, checked: boolean) => {
    setSelectedUsers((prev) => {
      if (checked) {
        if (prev.includes(userId)) return prev;

        return [...prev, userId];
      } else {
        return prev.filter((id) => id !== userId);
      }
    });
  };

  const handleSelectAllUsers = (checked: boolean) => {
    if (!checked) {
      setSelectedUsers([]);

      return;
    }
    // do not include admin users when selecting all
    const idsOnPage = filteredRows
      .filter((r) => !isUserAdmin(r))
      .map((r) => r.id || r._id || r.raw?.id)
      .filter(Boolean)
      .map(String);
    const merged = Array.from(new Set([...selectedUsers, ...idsOnPage]));

    setSelectedUsers(merged);
  };

  const allOnPageSelected =
    filteredRows.length > 0 &&
    filteredRows.every((r) =>
      selectedUsers.includes(String(r.id || r._id || r.raw?.id)),
    );

  const handleBulkSuspend = async (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    try {
      setActionLoading(true);
      // filter out any admin ids so admins cannot be suspended in bulk
      const idsToSuspend = ids.filter((id) => {
        const r = rows.find(
          (rr) => String(rr.id || rr._id || rr.raw?.id) === String(id),
        );

        return !isUserAdmin(r);
      });

      if (idsToSuspend.length === 0) {
        toast.error(
          t("adminOfficeUsers.toasts.noValidUsersToSuspend", {
            defaultValue:
              "Ningún usuario válido para suspender (los administradores no pueden suspenderse)",
          }),
        );

        return;
      }
      if (idsToSuspend.length < ids.length) {
        toast.warning(
          t("adminOfficeUsers.toasts.skippedAdminsWarning", {
            defaultValue:
              "Se omitieron administradores del proceso de suspensión",
          }),
        );
      }
      await userService.suspendUsers(idsToSuspend);
      // update local rows to reflect archived status
      setRows((prev) =>
        prev.map((r) => {
          const key = String(r.id || r._id || r.raw?.id);

          if (idsToSuspend.includes(key)) {
            return {
              ...r,
              status: "Archivado",
              active: false,
              raw: { ...(r.raw || {}), status: "archived" },
            };
          }

          return r;
        }),
      );
      toast.success(
        t("adminOfficeUsers.toasts.suspendedCount", {
          defaultValue: "Suspendidos {{count}} usuario(s)",
          count: idsToSuspend.length,
        }),
      );
      setSelectedUsers([]);
    } catch (err) {
      console.error("Error al suspender en bloque:", err);
      toast.error(
        t("adminOfficeUsers.toasts.suspendAllError", {
          defaultValue: "No se pudo suspender a todos los usuarios",
        }),
      );
    } finally {
      setActionLoading(false);
      // force Select to remount so it resets its internal selection state
      setSelectKey((k) => k + 1);
    }
  };

  const handleBulkActivate = async (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    try {
      setActionLoading(true);
      await userService.restoreUsers(ids);
      setRows((prev) =>
        prev.map((r) => {
          const key = String(r.id || r._id || r.raw?.id);

          if (ids.includes(key)) {
            return {
              ...r,
              status: "Active",
              active: true,
              raw: { ...(r.raw || {}), status: "active" },
            };
          }

          return r;
        }),
      );
      toast.success(
        t("adminOfficeUsers.toasts.activatedCount", {
          defaultValue: "Activados {{count}} usuario(s)",
          count: ids.length,
        }),
      );
      setSelectedUsers([]);
    } catch (err) {
      console.error("Error al activar en bloque:", err);
      toast.error(
        t("adminOfficeUsers.toasts.activateAllError", {
          defaultValue: "No se pudo activar a todos los usuarios",
        }),
      );
    } finally {
      setActionLoading(false);
      setSelectKey((k) => k + 1);
    }
  };

  // Acciones del menú de cada tarjeta (mismos handlers/estados que la tabla).
  const userCardActions = (u: AdminUserRow): AdminUserCardAction[] => {
    const status = (u.status || "").toString().toLowerCase();
    const acts: AdminUserCardAction[] = [];

    if (status === "invited" || status === "pending") {
      acts.push({
        label: t(
          "adminOfficeUsers.rowActions.resendInvitation",
          "Reenviar Invitación",
        ),
        icon: <Send className="h-4 w-4" />,
        disabled: !hasPermission("userEdit"),
        onClick: () => {
          setSelectedUserToAct(u);
          setResendDialogOpen(true);
        },
      });
      acts.push({
        label: t("adminOfficeUsers.rowActions.suspend", "Suspender"),
        icon: <Archive className="h-4 w-4" />,
        disabled: !hasPermission("userEdit"),
        onClick: () => {
          setSelectedUserToAct(u);
          handleSuspendUser(u);
        },
      });
    } else if (status === "archived" || status === "archivado") {
      acts.push({
        label: t("adminOfficeUsers.rowActions.restore", "Restaurar"),
        icon: <RotateCw className="h-4 w-4" />,
        disabled: !hasPermission("userEdit"),
        onClick: () => {
          setSelectedUserToAct(u);
          setRestoreDialogOpen(true);
        },
      });
      acts.push({
        label: t("adminOfficeUsers.rowActions.delete", "Eliminar"),
        icon: <Trash className="h-4 w-4" />,
        destructive: true,
        disabled: !hasPermission("userDestroy"),
        onClick: () => {
          setSelectedUserToAct(u);
          setDeleteDialogOpen(true);
        },
      });
    } else {
      acts.push({
        label: t("adminOfficeUsers.rowActions.edit", "Editar"),
        icon: <Pencil className="h-4 w-4" />,
        disabled: !hasPermission("userEdit"),
        onClick: () => navigate(`/back-office/edit/${u.id}`),
      });
      if (
        normalizeRolesForUser(
          u.roles || u.role || u.rolesList || u._rolesDisplay,
        ).includes("securitysupervisor")
      ) {
        acts.push({
          label: t(
            "adminOfficeUsers.rowActions.supervisorProfile",
            "Perfil de supervisor",
          ),
          icon: <UserCog className="h-4 w-4" />,
          onClick: () => navigate(`/supervisors/${u.id}`),
        });
      }
      if (!isUserAdmin(u)) {
        acts.push({
          label: t("adminOfficeUsers.rowActions.suspend", "Suspender"),
          icon: <Archive className="h-4 w-4" />,
          disabled: !hasPermission("userEdit"),
          onClick: () => {
            setSelectedUserToAct(u);
            handleSuspendUser(u);
          },
        });
      }
    }

    return acts;
  };

  const openUser = (u: AdminUserRow) => {
    if (
      normalizeRolesForUser(
        u.roles || u.role || u.rolesList || u._rolesDisplay,
      ).includes("securitysupervisor")
    ) {
      navigate(`/supervisors/${u.id}`);

      return;
    }
    navigate(`/back-office/${u.id}`);
  };

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          actions={
            <>
              <PermissionedButton
                asChild
                permission="userCreate"
                variant="outline"
              >
                <Link to="/personal/varias">
                  {t("agregarVarias.boton", "Agregar varias")}
                </Link>
              </PermissionedButton>
              <PermissionedButton
                asChild
                permission="userCreate"
                variant="brand"
              >
                <Link to="/personal/nueva?tipo=oficina">
                  {t("adminOfficeUsers.newUser.breadcrumb.new", {
                    defaultValue: "Nuevo Usuario",
                  })}
                </Link>
              </PermissionedButton>
            </>
          }
          icon={<Users />}
          subtitle={t("adminOfficeUsers.subtitle", {
            defaultValue:
              "Administra el acceso, los roles y los permisos del personal de oficina",
          })}
          title={t("adminOfficeUsers.title", {
            defaultValue: "Usuarios de Oficina Administrativa",
          })}
        />

        <GlassPanel className="p-5">
          {/* Acciones superiores */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {/* Bulk action: show Suspender and conditionally Activar if any selected is archived */}
              <Select
                key={selectKey}
                value={bulkAction ?? undefined}
                onValueChange={(v) => {
                  const action = v;

                  setBulkAction(null);
                  (async () => {
                    if (!selectedUsers || selectedUsers.length === 0) {
                      toast.error(
                        t("adminOfficeUsers.toasts.selectAtLeastOne", {
                          defaultValue: "Selecciona al menos un usuario",
                        }),
                      );

                      return;
                    }

                    if (action === "suspender") {
                      await handleBulkSuspend(selectedUsers);

                      return;
                    }

                    if (action === "activar") {
                      await handleBulkActivate(selectedUsers);

                      return;
                    }
                  })();
                }}
              >
                <SelectTrigger
                  className="w-40"
                  disabled={selectedUsers.length === 0 || !canManageUsers}
                >
                  <SelectValue
                    placeholder={t("adminOfficeUsers.bulkAction.placeholder", {
                      defaultValue: "Acción",
                    })}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="suspender">
                    {t("adminOfficeUsers.bulkAction.suspend", {
                      defaultValue: "Suspender",
                    })}
                  </SelectItem>
                  {/** show activate if any selected user is archived */}
                  {selectedUsers.length > 0 &&
                    (() => {
                      const selectedSet = new Set(selectedUsers.map(String));
                      const anyArchived = rows.some(
                        (r) =>
                          selectedSet.has(String(r.id || r._id || r.raw?.id)) &&
                          (String(r.status || "").toLowerCase() ===
                            "archived" ||
                            String(r.status || "").toLowerCase() ===
                              "archivado" ||
                            r.active === false),
                      );

                      if (anyArchived)
                        return (
                          <SelectItem value="activar">
                            {t("adminOfficeUsers.bulkAction.activate", {
                              defaultValue: "Activar",
                            })}
                          </SelectItem>
                        );

                      return null;
                    })()}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Toolbar className="p-1">
                <Search
                  className="ml-1.5 h-4 w-4 shrink-0"
                  style={{ color: "var(--ink-faint)" }}
                />
                <Input
                  aria-label={t("adminOfficeUsers.searchPlaceholder", {
                    defaultValue: "Buscar usuario",
                  })}
                  className="h-8 w-56 border-0 bg-transparent px-1 shadow-none"
                  placeholder={t("adminOfficeUsers.searchPlaceholder", {
                    defaultValue: "Buscar usuario",
                  })}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </Toolbar>

              {/* Filtros */}
              <Sheet open={openFilter} onOpenChange={setOpenFilter}>
                <SheetTrigger asChild>
                  <Button variant="outline">
                    <Filter className="mr-2 h-4 w-4" />
                    {t("adminOfficeUsers.filters.title", {
                      defaultValue: "Filtros",
                    })}
                  </Button>
                </SheetTrigger>
                <SheetContent
                  className="w-full max-w-full sm:w-[460px] overflow-y-auto"
                  side="right"
                >
                  <SheetHeader>
                    <SheetTitle>
                      {t("adminOfficeUsers.filters.title", {
                        defaultValue: "Filtros",
                      })}
                    </SheetTitle>
                  </SheetHeader>

                  <div className="mt-6 space-y-4">
                    <div className="space-y-2">
                      <Label>
                        {t("adminOfficeUsers.filters.categories", {
                          defaultValue: "Sectores",
                        })}
                      </Label>
                      <Select
                        value={filterCategory ?? "all"}
                        onValueChange={(v) =>
                          setFilterCategory(v === "all" ? null : v)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t(
                              "adminOfficeUsers.filters.categories",
                              { defaultValue: "Sectores" },
                            )}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">
                            {t("adminOfficeUsers.filters.categoriesAll", {
                              defaultValue: "Todas",
                            })}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>
                        {t("adminOfficeUsers.filters.client", {
                          defaultValue: "Cliente",
                        })}
                      </Label>
                      <Select
                        value={filterClient ?? "all"}
                        onValueChange={(v) =>
                          setFilterClient(v === "all" ? null : v)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t("adminOfficeUsers.filters.client", {
                              defaultValue: "Cliente",
                            })}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">
                            {t("adminOfficeUsers.filters.clientAll", {
                              defaultValue: "Todos",
                            })}
                          </SelectItem>
                          {clientOptions.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>
                        {t("adminOfficeUsers.filters.status", {
                          defaultValue: "Estado",
                        })}
                      </Label>
                      <Select
                        value={filterStatus ?? "all"}
                        onValueChange={(v) =>
                          setFilterStatus(v === "all" ? null : v)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t(
                              "adminOfficeUsers.filters.statusAllLabel",
                              { defaultValue: "Todos los Usuarios" },
                            )}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">
                            {t("adminOfficeUsers.filters.statusAll", {
                              defaultValue: "Todos los Usuarios",
                            })}
                          </SelectItem>
                          <SelectItem value="Activo">
                            {t("adminOfficeUsers.filters.statusActive", {
                              defaultValue: "Activo",
                            })}
                          </SelectItem>
                          <SelectItem value="Inactivo">
                            {t("adminOfficeUsers.filters.statusInactive", {
                              defaultValue: "Inactivo",
                            })}
                          </SelectItem>
                          <SelectItem value="Suspendido">
                            {t("adminOfficeUsers.filters.statusSuspended", {
                              defaultValue: "Suspendido",
                            })}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      className="w-full"
                      variant="brand"
                      onClick={() => {
                        // aplica filtros y cierra
                        setOpenFilter(false);
                      }}
                    >
                      {t("adminOfficeUsers.filters.apply", {
                        defaultValue: "Filtro",
                      })}
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>

              {/* Toggle vista Tarjetas / Lista (desktop) */}
              <Segmented
                className="hidden md:inline-flex"
                options={[
                  {
                    value: "cards",
                    label: (
                      <span className="flex items-center gap-1.5">
                        <LayoutGrid className="h-3.5 w-3.5" />{" "}
                        {t("ui.AdminOfficeUsersPage.tarjetas", "Tarjetas")}
                      </span>
                    ),
                  },
                  {
                    value: "list",
                    label: (
                      <span className="flex items-center gap-1.5">
                        <ListIcon className="h-3.5 w-3.5" /> {t("comun.lista")}
                      </span>
                    ),
                  },
                ]}
                value={viewMode}
                onChange={setViewMode}
              />

              {/* Menú superior (export/import) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label={t(
                      "ui.AdminOfficeUsers.masAcciones",
                      "Más acciones",
                    )}
                    size="icon"
                    variant="ghost"
                  >
                    <EllipsisVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    disabled={!hasPermission("userExport")}
                    onClick={async () => {
                      if (!hasPermission("userExport")) return;
                      await exportUsersFile("pdf");
                    }}
                  >
                    <FileDown className="mr-2 h-4 w-4" />{" "}
                    {t("adminOfficeUsers.actions.exportPdf", {
                      defaultValue: "Exportar como PDF",
                    })}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!hasPermission("userExport")}
                    onClick={async () => {
                      if (!hasPermission("userExport")) return;
                      await exportUsersFile("excel");
                    }}
                  >
                    <FileSpreadsheet className="mr-2 h-4 w-4" />{" "}
                    {t("adminOfficeUsers.actions.exportExcel", {
                      defaultValue: "Exportar como Excel",
                    })}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!hasPermission("userImport")}
                    onClick={() => {
                      if (!hasPermission("userImport")) return;
                      // There is no office-only importer: «Agregar varias»
                      // takes a pasted or uploaded sheet with office rows.
                      navigate("/personal/varias");
                    }}
                  >
                    <ArrowDownUp className="mr-2 h-4 w-4" />{" "}
                    {t("adminOfficeUsers.actions.import", {
                      defaultValue: "Importar",
                    })}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Tabla */}
          <GlassPanel flat className="cg-marco-tabla mt-4 overflow-hidden p-0">
            <div className="md:block hidden overflow-x-auto">
              {viewMode === "cards" ? (
                <AdminUserCardsGrid
                  actions={userCardActions}
                  canSelect={(u) => canManageUsers && !isUserAdmin(u)}
                  loading={loadingUsers}
                  selectedIds={selectedUsers}
                  users={pagedRows}
                  onOpen={openUser}
                  onSelect={handleSelectUser}
                />
              ) : (
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead style={{ background: "var(--glass-sunken)" }}>
                    <tr
                      className="border-b"
                      style={{ borderColor: "var(--hairline)" }}
                    >
                      <th className="px-4 py-3">
                        <Checkbox
                          aria-label={t("comun.seleccionarTodos")}
                          checked={allOnPageSelected}
                          disabled={!canManageUsers}
                          onCheckedChange={(v) =>
                            handleSelectAllUsers(Boolean(v))
                          }
                        />
                      </th>
                      <th className="px-4 py-3 font-semibold">
                        {t("adminOfficeUsers.table.headers.contactName", {
                          defaultValue: "Nombre de Contacto",
                        })}
                      </th>
                      <th className="px-4 py-3 font-semibold">
                        {t("adminOfficeUsers.table.headers.email", {
                          defaultValue: "Correo Electrónico",
                        })}
                      </th>
                      <th className="px-4 py-3 font-semibold">
                        {t("adminOfficeUsers.table.headers.accessLevel", {
                          defaultValue: "Nivel de Acceso",
                        })}
                      </th>
                      <th className="px-4 py-3 font-semibold">
                        {t("adminOfficeUsers.table.headers.lastLogin", {
                          defaultValue: "Último Inicio de Sesión",
                        })}
                      </th>
                      <th className="px-4 py-3 font-semibold">
                        {t("adminOfficeUsers.table.headers.status", {
                          defaultValue: "Estado",
                        })}
                      </th>
                      <th />
                    </tr>
                  </thead>

                  <tbody>
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td className="py-12" colSpan={7}>
                          <EstadoVacio
                            className="border-0"
                            description={t(
                              "ui.AdminOfficeUsers.vacioAyuda",
                              "Quien trabaja en la oficina: despacho, recursos humanos, gerencia. Cada uno entra al CRM con su rol.",
                            )}
                            filtrado={(rows || []).length > 0}
                            icon={<Users />}
                            paso={{
                              label: t(
                                "ui.AdminOfficeUsers.agregarPrimera",
                                "Agregar a alguien de la oficina",
                              ),
                              to: "/personal/nueva?tipo=oficina",
                              puede: hasPermission("userCreate"),
                            }}
                            title={t(
                              "ui.AdminOfficeUsers.vacioTitulo",
                              "Todavía no hay personal de oficina",
                            )}
                            variant="inline"
                            onLimpiarFiltro={() => setQuery("")}
                          />
                        </td>
                      </tr>
                    ) : (
                      pagedRows.map((u, i) => (
                        <tr
                          key={
                            u.id || u._id || u.raw?.id || `${currentPage}-${i}`
                          }
                          className={`border-b transition-colors ${normalizeRolesForUser(u.roles || u.role || u.rolesList || u._rolesDisplay).includes("securitysupervisor") ? "cursor-pointer" : ""}`}
                          style={{ borderColor: "var(--hairline)" }}
                          onClick={() => {
                            if (
                              normalizeRolesForUser(
                                u.roles ||
                                  u.role ||
                                  u.rolesList ||
                                  u._rolesDisplay,
                              ).includes("securitysupervisor")
                            ) {
                              navigate(
                                `/supervisors/${u.id || u._id || u.raw?.id}`,
                              );
                            }
                          }}
                        >
                          <td
                            className="px-4 py-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Checkbox
                              checked={selectedUsers.includes(
                                String(u.id || u._id || u.raw?.id),
                              )}
                              disabled={!canManageUsers || isUserAdmin(u)}
                              onCheckedChange={(v) =>
                                handleSelectUser(
                                  String(u.id || u._id || u.raw?.id),
                                  Boolean(v),
                                )
                              }
                            />
                          </td>
                          <td className="px-4 py-3">
                            {[u.firstName, u.lastName]
                              .filter(Boolean)
                              .join(" ") ||
                              u.name ||
                              "-"}
                            <EtiquetaDeMarca
                              className="ml-1.5"
                              marca={marcas.dePersona(
                                String(u.id || u._id || u.raw?.id || ""),
                              )}
                            />
                          </td>
                          <td className="px-4 py-3">
                            {u.email || "-"}
                            {u.username && (
                              <div
                                className="font-mono text-xs"
                                style={{ color: "var(--ink-soft)" }}
                                title={t(
                                  "usuarioDeAcceso.etiqueta",
                                  "Usuario para entrar",
                                )}
                              >
                                {u.username}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {(() => {
                              if (u._rolesDisplay) return u._rolesDisplay;
                              const roles = u.roles ?? u.role ?? [];

                              if (Array.isArray(roles)) {
                                return roles
                                  .map((r: RoleRef) =>
                                    typeof r === "string"
                                      ? r
                                      : r && (r.name || r.role)
                                        ? r.name || r.role
                                        : "",
                                  )
                                  .filter(Boolean)
                                  .join(", ");
                              }
                              if (typeof roles === "string") return roles;
                              if (roles && typeof roles === "object")
                                return roles.name || roles.role || "";

                              return "-";
                            })()}
                          </td>
                          <td className="px-4 py-3">
                            {u.lastLoginAt
                              ? new Date(
                                  u.lastLoginAt as string,
                                ).toLocaleString(localeActual(), {
                                  timeZone: zonaDeLaEmpresa(),
                                })
                              : "-"}
                          </td>
                          <td className="px-4 py-3">
                            {(() => {
                              const status = (u.status || "")
                                .toString()
                                .toLowerCase();

                              // archived (backend) or archivado (spanish) => show red Archivado
                              if (
                                status === "archived" ||
                                status === "archivado"
                              ) {
                                return (
                                  <StatusBadge tone="bad">
                                    {t("adminOfficeUsers.statuses.archived", {
                                      defaultValue: "Archivado",
                                    })}
                                  </StatusBadge>
                                );
                              }

                              if (
                                status === "invited" ||
                                status === "pending"
                              ) {
                                return (
                                  <StatusBadge tone="warn">
                                    {t("adminOfficeUsers.statuses.pending", {
                                      defaultValue: "Pendiente",
                                    })}
                                  </StatusBadge>
                                );
                              }

                              if (u.active === false) {
                                return (
                                  <StatusBadge tone="neutral">
                                    {t("adminOfficeUsers.statuses.inactive", {
                                      defaultValue: "Inactivo",
                                    })}
                                  </StatusBadge>
                                );
                              }

                              return (
                                <StatusBadge tone="ok">
                                  {t("adminOfficeUsers.statuses.active", {
                                    defaultValue: "Activo",
                                  })}
                                </StatusBadge>
                              );
                            })()}
                          </td>
                          <td
                            className="px-4 py-3 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost">
                                  <EllipsisVertical className="h-5 w-5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {(() => {
                                  const status = (u.status || "")
                                    .toString()
                                    .toLowerCase();

                                  if (
                                    status === "invited" ||
                                    status === "pending"
                                  ) {
                                    return (
                                      <>
                                        <DropdownMenuItem
                                          disabled={!hasPermission("userEdit")}
                                          onClick={() => {
                                            if (!hasPermission("userEdit"))
                                              return;
                                            setSelectedUserToAct(u);
                                            setResendDialogOpen(true);
                                          }}
                                        >
                                          <Send className="mr-2 h-4 w-4" />{" "}
                                          {t(
                                            "adminOfficeUsers.rowActions.resendInvitation",
                                            {
                                              defaultValue:
                                                "Reenviar Invitación",
                                            },
                                          )}
                                        </DropdownMenuItem>

                                        <DropdownMenuItem
                                          disabled={!hasPermission("userEdit")}
                                          onClick={() => {
                                            if (!hasPermission("userEdit"))
                                              return;
                                            setSelectedUserToAct(u);
                                            handleSuspendUser(u);
                                          }}
                                        >
                                          <Archive className="mr-2 h-4 w-4" />{" "}
                                          {t(
                                            "adminOfficeUsers.rowActions.suspend",
                                            { defaultValue: "Suspender" },
                                          )}
                                        </DropdownMenuItem>
                                      </>
                                    );
                                  }

                                  if (
                                    status === "archived" ||
                                    status === "archivado"
                                  ) {
                                    return (
                                      <>
                                        <DropdownMenuItem
                                          disabled={!hasPermission("userEdit")}
                                          onClick={() => {
                                            if (!hasPermission("userEdit"))
                                              return;
                                            setSelectedUserToAct(u);
                                            setRestoreDialogOpen(true);
                                          }}
                                        >
                                          {t(
                                            "adminOfficeUsers.rowActions.restore",
                                            { defaultValue: "Restaurar" },
                                          )}
                                        </DropdownMenuItem>

                                        <DropdownMenuItem
                                          disabled={
                                            !hasPermission("userDestroy")
                                          }
                                          onClick={() => {
                                            if (!hasPermission("userDestroy"))
                                              return;
                                            setSelectedUserToAct(u);
                                            setDeleteDialogOpen(true);
                                          }}
                                        >
                                          {t(
                                            "adminOfficeUsers.rowActions.delete",
                                            { defaultValue: "Eliminar" },
                                          )}
                                        </DropdownMenuItem>
                                      </>
                                    );
                                  }

                                  return (
                                    <>
                                      <DropdownMenuItem
                                        disabled={!hasPermission("userEdit")}
                                        onClick={() => {
                                          if (!hasPermission("userEdit"))
                                            return;
                                          navigate(`/back-office/edit/${u.id}`);
                                        }}
                                      >
                                        {t("adminOfficeUsers.rowActions.edit", {
                                          defaultValue: "Editar",
                                        })}
                                      </DropdownMenuItem>
                                      {normalizeRolesForUser(
                                        u.roles ||
                                          u.role ||
                                          u.rolesList ||
                                          u._rolesDisplay,
                                      ).includes("securitysupervisor") && (
                                        <DropdownMenuItem
                                          onClick={() =>
                                            navigate(`/supervisors/${u.id}`)
                                          }
                                        >
                                          {t(
                                            "adminOfficeUsers.rowActions.supervisorProfile",
                                            {
                                              defaultValue:
                                                "Perfil de supervisor",
                                            },
                                          )}
                                        </DropdownMenuItem>
                                      )}
                                      {/* «Me robaron el teléfono» sin archivar a la
                                      persona: mata el token en todos los canales
                                      (≤20 s en todo el clúster) y que vuelva a
                                      entrar con su contraseña. */}
                                      <DropdownMenuItem
                                        disabled={!hasPermission("userEdit")}
                                        onClick={async () => {
                                          if (
                                            !hasPermission("userEdit") ||
                                            !u.id
                                          )
                                            return;
                                          const seguro = await confirmDialog({
                                            title: t(
                                              "adminOfficeUsers.dialogs.closeSessions.title",
                                              {
                                                defaultValue:
                                                  "Cerrar sesiones",
                                              },
                                            ),
                                            message: t(
                                              "adminOfficeUsers.dialogs.closeSessions.description",
                                              {
                                                defaultValue:
                                                  "{{user}} saldrá de la web y de las apps en todos sus dispositivos y tendrá que volver a iniciar sesión.",
                                                user: formatUserDisplay(u),
                                              },
                                            ),
                                            confirmText: t(
                                              "adminOfficeUsers.dialogs.closeSessions.confirm",
                                              {
                                                defaultValue:
                                                  "Cerrar sesiones",
                                              },
                                            ),
                                            tone: "danger",
                                          });

                                          if (!seguro) return;
                                          try {
                                            await userService.closeSessions(
                                              u.id,
                                            );
                                            toast.success(
                                              t(
                                                "adminOfficeUsers.toasts.sessionsClosed",
                                                {
                                                  defaultValue:
                                                    "Sesiones cerradas. Tendrá que iniciar sesión de nuevo.",
                                                },
                                              ),
                                            );
                                          } catch (err: any) {
                                            toast.error(
                                              err?.response?.data?.message ||
                                                t(
                                                  "adminOfficeUsers.toasts.sessionsCloseError",
                                                  {
                                                    defaultValue:
                                                      "No se pudieron cerrar las sesiones.",
                                                  },
                                                ),
                                            );
                                          }
                                        }}
                                      >
                                        {t(
                                          "adminOfficeUsers.rowActions.closeSessions",
                                          { defaultValue: "Cerrar sesiones" },
                                        )}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        disabled={!hasPermission("userEdit")}
                                        onClick={() => {
                                          if (!hasPermission("userEdit"))
                                            return;
                                          setSelectedUserToAct(u);
                                          handleSuspendUser(u);
                                        }}
                                      >
                                        {t(
                                          "adminOfficeUsers.rowActions.suspend",
                                          { defaultValue: "Suspender" },
                                        )}
                                      </DropdownMenuItem>
                                    </>
                                  );
                                })()}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>

            <div className="md:hidden">
              <MobileCardList
                emptyMessage={
                  t("adminOfficeUsers.noData.title", {
                    defaultValue: "No se encontraron resultados",
                  }) as string
                }
                items={pagedRows || []}
                loading={loadingUsers}
                renderCard={(u: AdminUserRow) => (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="text-sm font-semibold">
                          {[u.firstName, u.lastName]
                            .filter(Boolean)
                            .join(" ") ||
                            u.name ||
                            u.email ||
                            "-"}
                          <EtiquetaDeMarca
                            className="ml-1.5"
                            marca={marcas.dePersona(
                              String(u.id || u._id || u.raw?.id || ""),
                            )}
                          />
                        </div>
                        <div
                          className="text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {u.email || "-"}
                          {u.username && (
                            <span className="ml-1.5 font-mono">
                              · {u.username}
                            </span>
                          )}
                        </div>
                        <div
                          className="mt-1 text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {u._rolesDisplay ||
                            (Array.isArray(u.roles)
                              ? u.roles
                                  .map((r) =>
                                    typeof r === "string"
                                      ? r
                                      : r?.name || r?.role || "",
                                  )
                                  .join(", ")
                              : typeof u.roles === "string"
                                ? u.roles
                                : typeof u.role === "string"
                                  ? u.role
                                  : "-")}
                        </div>
                      </div>
                      <div className="flex min-w-0 flex-col items-end gap-1 text-right sm:shrink-0">
                        {(() => {
                          const status = (u.status || "")
                            .toString()
                            .toLowerCase();

                          if (status === "archived" || status === "archivado")
                            return (
                              <StatusBadge tone="neutral">
                                {t("adminOfficeUsers.statuses.archived", {
                                  defaultValue: "Archivado",
                                })}
                              </StatusBadge>
                            );
                          if (status === "invited" || status === "pending")
                            return (
                              <StatusBadge tone="warn">
                                {t("adminOfficeUsers.statuses.pending", {
                                  defaultValue: "Pendiente",
                                })}
                              </StatusBadge>
                            );
                          if (u.active === false)
                            return (
                              <StatusBadge tone="bad">
                                {t("adminOfficeUsers.statuses.inactive", {
                                  defaultValue: "Inactivo",
                                })}
                              </StatusBadge>
                            );

                          return (
                            <StatusBadge tone="ok">
                              {t("adminOfficeUsers.statuses.active", {
                                defaultValue: "Activo",
                              })}
                            </StatusBadge>
                          );
                        })()}
                        <div
                          /* La fecha completa con segundos mide 149 px y no
                           parte: en un teléfono empujaba la tarjeta 19 px
                           fuera de la pantalla. Que se parta en dos líneas. */
                          className="break-words text-xs tabular-nums"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {u.lastLoginAt
                            ? new Date(u.lastLoginAt as string).toLocaleString(
                                localeActual(),
                                { timeZone: zonaDeLaEmpresa() },
                              )
                            : "—"}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              />
            </div>
          </GlassPanel>
          {/* Footer de tabla */}
          <div
            className="glass-sunken mt-2 flex flex-col gap-3 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
            style={{ color: "var(--ink-soft)" }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span>
                {t("adminOfficeUsers.footer.itemsPerPage", {
                  defaultValue: "Elementos por página",
                })}
              </span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-20">
                  <SelectValue placeholder="25" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end sm:gap-4">
              <div className="tabular-nums">
                {filteredRows.length === 0
                  ? t("adminOfficeUsers.pagination.zero", {
                      defaultValue: "0 – 0 de 0",
                    })
                  : t("adminOfficeUsers.pagination.range", {
                      defaultValue: "{{start}} – {{end}} de {{total}}",
                      start: rangeStart,
                      end: rangeEnd,
                      total: filteredRows.length,
                    })}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  aria-label={
                    t("clients.pagination.prev", {
                      defaultValue: "Anterior",
                    }) as string
                  }
                  disabled={currentPage <= 1}
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs tabular-nums">
                  {currentPage} / {pageCount}
                </span>
                <Button
                  aria-label={
                    t("clients.pagination.next", {
                      defaultValue: "Siguiente",
                    }) as string
                  }
                  disabled={currentPage >= pageCount}
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(pageCount, p + 1))
                  }
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </GlassPanel>

        {/* Confirm dialogs for resend and suspend */}
        <AlertDialog open={resendDialogOpen} onOpenChange={setResendDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("adminOfficeUsers.dialogs.resend.title", {
                  defaultValue: "Reenviar invitación",
                })}
              </AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogDescription>
              {t("adminOfficeUsers.dialogs.resend.description", {
                defaultValue: "¿Deseas reenviar la invitación a {{user}}?",
                user: formatUserDisplay(selectedUserToAct),
              })}
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setSelectedUserToAct(null)}>
                {t("adminOfficeUsers.dialogs.common.cancel", {
                  defaultValue: "Cancelar",
                })}
              </AlertDialogCancel>
              <AlertDialogAction
                className="cg-btn-brand"
                onClick={async () => {
                  if (!selectedUserToAct?.id) return;
                  try {
                    setActionLoading(true);
                    await userService.resendInvitation(selectedUserToAct.id);
                    toast.success(
                      t("adminOfficeUsers.dialogs.resend.success", {
                        defaultValue: "Invitación reenviada",
                      }),
                    );
                    setResendDialogOpen(false);
                  } catch (err) {
                    console.error(err);
                    toast.error(
                      t("adminOfficeUsers.dialogs.resend.error", {
                        defaultValue: "Error reenviando invitación",
                      }),
                    );
                  } finally {
                    setActionLoading(false);
                    setSelectedUserToAct(null);
                  }
                }}
              >
                {actionLoading
                  ? t("adminOfficeUsers.dialogs.common.sending", {
                      defaultValue: "Enviando…",
                    })
                  : t("adminOfficeUsers.dialogs.resend.confirm", {
                      defaultValue: "Reenviar",
                    })}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Suspend confirmation removed: suspender ahora actúa de inmediato desde el menú */}
        <AlertDialog
          open={restoreDialogOpen}
          onOpenChange={setRestoreDialogOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("adminOfficeUsers.dialogs.restore.title", {
                  defaultValue: "Restaurar usuario",
                })}
              </AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogDescription>
              {t("adminOfficeUsers.dialogs.restore.description", {
                defaultValue:
                  "¿Deseas restaurar al usuario {{user}}? Esto devolverá el usuario a estado activo.",
                user: formatUserDisplay(selectedUserToAct),
              })}
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setSelectedUserToAct(null)}>
                {t("adminOfficeUsers.dialogs.common.cancel", {
                  defaultValue: "Cancelar",
                })}
              </AlertDialogCancel>
              <AlertDialogAction
                className="cg-btn-brand"
                onClick={async () => {
                  if (!selectedUserToAct?.id) return;
                  try {
                    setActionLoading(true);
                    try {
                      await userService.restoreUser(selectedUserToAct.id);
                    } catch (e) {
                      console.warn("Restore endpoint failed", e);
                    }

                    // refresh list to keep UI in sync
                    await loadUsers();

                    toast.success(
                      t("adminOfficeUsers.dialogs.restore.success", {
                        defaultValue: "Usuario restaurado",
                      }),
                    );
                    setRestoreDialogOpen(false);
                  } catch (err) {
                    console.error(err);
                    toast.error(
                      t("adminOfficeUsers.dialogs.restore.error", {
                        defaultValue: "Error restaurando usuario",
                      }),
                    );
                  } finally {
                    setActionLoading(false);
                    setSelectedUserToAct(null);
                  }
                }}
              >
                {actionLoading
                  ? t("adminOfficeUsers.dialogs.common.processing", {
                      defaultValue: "Restaurando…",
                    })
                  : t("adminOfficeUsers.dialogs.restore.confirm", {
                      defaultValue: "Restaurar",
                    })}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("adminOfficeUsers.dialogs.delete.title", {
                  defaultValue: "Eliminar usuario",
                })}
              </AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogDescription>
              {t("adminOfficeUsers.dialogs.delete.description", {
                defaultValue:
                  "¿Estás seguro que deseas eliminar permanentemente a {{user}}? Esta acción no se puede deshacer.",
                user: formatUserDisplay(selectedUserToAct),
              })}
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setSelectedUserToAct(null)}>
                {t("adminOfficeUsers.dialogs.common.cancel", {
                  defaultValue: "Cancelar",
                })}
              </AlertDialogCancel>
              <AlertDialogAction
                className="cg-btn-bad"
                onClick={async () => {
                  if (!selectedUserToAct?.id) return;
                  await handleDeleteUser(selectedUserToAct.id);
                }}
              >
                {actionLoading
                  ? t("adminOfficeUsers.dialogs.common.processingDelete", {
                      defaultValue: "Eliminando…",
                    })
                  : t("adminOfficeUsers.dialogs.delete.confirm", {
                      defaultValue: "Eliminar",
                    })}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageContainer>
    </AppLayout>
  );
}
