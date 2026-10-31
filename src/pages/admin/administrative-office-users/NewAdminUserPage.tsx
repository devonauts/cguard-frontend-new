"use client";

import type { AdminUser, TenantUser } from "./adminUserTypes";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Copy, UserPlus, Ticket } from "lucide-react";

import { clientDisplayName } from "@/lib/clientName";
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { postSiteService } from "@/lib/api/postSiteService";
import { ApiService } from "@/services/api/apiService";
import userService from "@/lib/api/userService";
import { MultiSelectDeSedes } from "@/components/MultiSelectDeSedes";
import {
  newAdminUserSchema,
  type NewAdminUserValues,
} from "@/lib/validators/new-admin-user.schema";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { PageContainer, PageHeader, Section } from "@/components/kit";
import { roleDisplayDescription, roleDisplayName } from "@/config/roleLabels";

/* dynamic options loaded from API */
const CLIENT_OPTIONS_PLACEHOLDER: Array<{ id: string; name: string }> = [];

export default function NewAdminUserPage() {
  const { t } = useTranslation();
  const form = useForm<NewAdminUserValues>({
    resolver: zodResolver(newAdminUserSchema),
    // cast defaultValues as any so we can add extra fields (stationIds) without changing the shared type
    defaultValues: {
      name: "",
      email: "",
      accessLevel: "",
      clientIds: [],
      postSiteIds: [],
      stationIds: [],
    },
    mode: "onTouched",
  });

  const {
    handleSubmit,
    control,
    formState,
    setValue,
    setError,
    getValues,
    reset,
  } = form;

  type RoleOption = { id: string; name: string; slug?: string; permissionCount?: number };

  const [clientOptions, setClientOptions] = useState<
    Array<{ id: string; name: string }>
  >(CLIENT_OPTIONS_PLACEHOLDER);
  const [siteOptions, setSiteOptions] = useState<
    Array<{ id: string; name: string; clientIds?: string[] }>
  >([]);
  const [stationOptions, setStationOptions] = useState<
    Array<{ id: string; name: string; postSiteId?: string }>
  >([]);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const accessLevelValue = useWatch({ control, name: "accessLevel" }) as
    string | undefined;
  const [aclAllowedStationIds, setAclAllowedStationIds] = useState<
    string[] | null
  >(null);

  const getRoleDisplayName = useCallback(
    (role: RoleOption) => {
      const id = (role.id || "").toString().toLowerCase();
      const name = (role.name || "").toString();
      const slug = (role.slug || "").toString().toLowerCase();

      // Office roles seeded from DB have proper Spanish names — use them directly
      if (
        id === "administrativesupervisor" ||
        slug === "administrativesupervisor"
      ) {
        return t("adminOfficeUsers.roleNames.administrativeSupervisor", {
          defaultValue: "Supervisor de oficina",
        });
      }
      if (
        id === "administrativeassistant" ||
        slug === "administrativeassistant"
      ) {
        return t("adminOfficeUsers.roleNames.administrativeAssistant", {
          defaultValue: "Asistente Administrativo",
        });
      }
      if (id === "secretary" || slug === "secretary") {
        return t("adminOfficeUsers.roleNames.secretary", {
          defaultValue: "Secretaria / Recepcionista",
        });
      }
      if (
        id.includes("supervisor") ||
        slug.includes("supervisor") ||
        name.toLowerCase().includes("supervisor")
      ) {
        return t("adminOfficeUsers.roleNames.supervisor", {
          defaultValue: "Supervisor de Seguridad",
        });
      }
      if (id === "admin" || slug === "admin")
        return t("adminOfficeUsers.roleNames.admin", {
          defaultValue: "Administrador",
        });
      if (id === "hrmanager" || slug === "hrmanager")
        return t("adminOfficeUsers.roleNames.hrManager", {
          defaultValue: "Gerente de RRHH",
        });
      if (id === "branchmanager" || slug === "branchmanager")
        return roleDisplayName("branchManager");
      if (id === "operationsmanager" || slug === "operationsmanager")
        return t("adminOfficeUsers.roleNames.operationsManager", {
          defaultValue: "Gerente de Operaciones",
        });
      if (id === "dispatcher" || slug === "dispatcher")
        return t("adminOfficeUsers.roleNames.dispatcher", {
          defaultValue: "Despachador",
        });
      if (id === "clientaccountmanager" || slug === "clientaccountmanager")
        return t("adminOfficeUsers.roleNames.clientAccountManager", {
          defaultValue: "Gestor de Cuentas",
        });

      return name || id || "";
    },
    [t],
  );

  const DEFAULT_ADMIN_ROLE: RoleOption = {
    id: "admin",
    name: "admin",
    slug: "admin",
  };

  // Los supervisores de seguridad NO se crean desde oficina administrativa —
  // tienen su propia página (Equipo de seguridad › Supervisores). Tampoco los
  // roles que no son de oficina: vigilante y cliente tienen su propia alta, y
  // el operador de central nunca se asigna a mano (sale de tener la central
  // asignada). Ofrecerlos creaba «usuarios de oficina» con rol de cliente o de
  // vigilante, y el de central salía con su clave cruda (QA-138).
  const NON_OFFICE_ROLES = new Set([
    "securitysupervisor",
    "securityguard",
    "customer",
    "centraloperator",
    "superadmin",
  ]);
  const isNonOfficeRole = (role: RoleOption) => {
    const norm = (v: any) => (v || "").toString().toLowerCase();

    return (
      NON_OFFICE_ROLES.has(norm(role.id)) ||
      NON_OFFICE_ROLES.has(norm(role.slug)) ||
      NON_OFFICE_ROLES.has(norm(role.name))
    );
  };

  const findAdminRole = useCallback((roles: RoleOption[]) => {
    return roles.find((role) => {
      const id = (role.id || "").toString().toLowerCase();
      const name = (role.name || "").toString().toLowerCase();
      const slug = (role.slug || "").toString().toLowerCase();

      return id === "admin" || slug === "admin" || name === "admin";
    });
  }, []);
  const [loading, setLoading] = useState(false);
  /**
   * ¿Se le acota lo que ve, o ve toda la operación?
   *
   * El contrato del servidor (lib/postSiteScope) es «sin sedes asignadas = sin
   * restricción», y eso era invisible: la pantalla enseñaba dos multiselectores
   * vacíos sin decir que dejarlos vacíos significa VER TODO. Ahora es una
   * elección explícita, y «toda la operación» es lo que sale marcado.
   */
  const [acotado, setAcotado] = useState(false);
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [aclAllowedClientIds, setAclAllowedClientIds] = useState<
    string[] | null
  >(null);
  const [aclAllowedPostSiteIds, setAclAllowedPostSiteIds] = useState<
    string[] | null
  >(null);
  const prevClientIdsRef = useRef<string[] | undefined>(undefined);
  const params = useParams();
  const editUserId = params.userId;

  // watch selected clients to load sites
  const watchedClientIds = useWatch({
    control: form.control,
    name: "clientIds",
  }) as string[] | undefined;
  const watchedPostSiteIds = useWatch({
    control: form.control,
    name: "postSiteIds",
  }) as string[] | undefined;
  const watchedStationIds = useWatch({
    control: form.control,
    name: "stationIds",
  }) as string[] | undefined;

  /**
   * Admin y Gerente de Operaciones IGNORAN el alcance: el servidor devuelve
   * «sin restricción» para ellos pase lo que pase (lib/postSiteScope). Pedir
   * que se acoten era pedirle al usuario que configurara algo que se descarta.
   */
  const veTodoPorRol = ["admin", "operationsmanager"].includes(
    String(accessLevelValue || "").toLowerCase(),
  );

  // Si la persona ya venía acotada (edición), la pantalla abre en ese modo.
  useEffect(() => {
    const conSedes =
      (watchedPostSiteIds || []).length > 0 ||
      (watchedClientIds || []).length > 0;

    if (conSedes) setAcotado(true);
  }, [watchedPostSiteIds, watchedClientIds]);

  useEffect(() => {
    // load clients and sites via the tenant endpoints requested
    (async () => {
      try {
        const tenantId = localStorage.getItem("tenantId") || "";

        if (!tenantId) return;

        // Try to load current user for ACL first
        try {
          const me = await userService.fetchCurrentUser();

          setCurrentUser(me);
        } catch (e) {
          // ignore, we'll try tenant user later if needed
        }

        const clientsResp = await ApiService.get(
          `/tenant/${tenantId}/client-account`,
        );
        const clientsRows = Array.isArray(clientsResp)
          ? clientsResp
          : clientsResp && clientsResp.rows
            ? clientsResp.rows
            : [];
        const mappedClients = (clientsRows || []).map((c: any) => ({
          id: c.id ?? c._id ?? String(c.id),
          name: clientDisplayName(c, c.label ?? c.clientAccountName ?? ""),
        }));

        setClientOptions(mappedClients);

        const sitesResp = await ApiService.get(
          `/tenant/${tenantId}/business-info`,
        );
        const sitesRows = Array.isArray(sitesResp)
          ? sitesResp
          : sitesResp && sitesResp.rows
            ? sitesResp.rows
            : [];
        const mappedSites = (sitesRows || []).map((s: any) => ({
          id: s.id ?? s._id ?? String(s.id),
          name: s.companyName ?? s.name ?? s.label ?? "",
          clientIds:
            s.clientIds || (s.clientAccountId ? [s.clientAccountId] : []),
        }));

        setSiteOptions(mappedSites);

        // preload stations for these sites (optional): attempt to fetch stations endpoint and map them
        try {
          const tenantId = localStorage.getItem("tenantId") || "";

          if (tenantId) {
            const stationsResp: any = await ApiService.get(
              `/tenant/${tenantId}/station`,
            );
            const stationsRows = Array.isArray(stationsResp)
              ? stationsResp
              : stationsResp && stationsResp.rows
                ? stationsResp.rows
                : [];
            const mappedStations = (stationsRows || []).map((st: any) => ({
              id: st.id ?? st._id ?? String(st.id),
              name: st.name ?? st.label ?? st.label ?? st.stationName ?? "",
              postSiteId:
                st.postSiteId ?? st.businessInfoId ?? st.businessInfo ?? null,
            }));

            setStationOptions(mappedStations);
          }
        } catch (e) {
          // ignore station pre-load errors
        }

        // load roles for access level select
        const res = await ApiService.get(`/tenant/${tenantId}/role`);
        const rows = Array.isArray(res)
          ? res
          : res?.rows
            ? res.rows
            : Array.isArray(res?.data)
              ? res.data
              : res?.data?.rows
                ? res.data.rows
                : [];
        const mappedRoles: RoleOption[] = rows.map((r: any) => {
          if (typeof r === "string") {
            return { id: r, name: r, slug: r };
          }
          const id = String(
            r.id ??
              r._id ??
              r.slug ??
              r.value ??
              r.role ??
              r.name ??
              r.label ??
              "",
          );
          const name = r.name ?? r.label ?? r.slug ?? r.value ?? r.role ?? "";
          const slug = r.slug ?? r.role ?? r.value ?? r.name ?? undefined;

          return {
            id: id || name || slug || "",
            name: name || slug || id || "",
            slug,
            permissionCount: Array.isArray(r.permissions)
              ? r.permissions.length
              : undefined,
          };
        });

        const withoutSecuritySupervisor = mappedRoles.filter(
          (r: RoleOption) => !isNonOfficeRole(r),
        );
        const adminRole =
          findAdminRole(withoutSecuritySupervisor) ?? DEFAULT_ADMIN_ROLE;
        const mappedRolesWithAdmin = findAdminRole(withoutSecuritySupervisor)
          ? withoutSecuritySupervisor
          : [adminRole, ...withoutSecuritySupervisor];

        // Least power first, and nothing preselected (audit 2026-10-31): a new
        // office person used to start as «Administrador», the role that can do
        // everything, unless someone noticed and changed it.
        setRoleOptions(
          [...mappedRolesWithAdmin].sort(
            (a, b) =>
              (a.permissionCount ?? Number.MAX_SAFE_INTEGER) -
                (b.permissionCount ?? Number.MAX_SAFE_INTEGER) ||
              getRoleDisplayName(a).localeCompare(getRoleDisplayName(b)),
          ),
        );
      } catch (err) {
        console.error("Error cargando datos iniciales", err);
      }
    })();
  }, [accessLevelValue, setValue]);

  // load sites whenever selected clients change
  useEffect(() => {
    let mounted = true;
    const prev = prevClientIdsRef.current || [];
    const current = watchedClientIds || [];

    // if no clients selected, clear sites and selected site ids
    if (!current || current.length === 0) {
      setSiteOptions([]);
      setValue("postSiteIds", []);
      prevClientIdsRef.current = current;

      return;
    }

    (async () => {
      try {
        // fetch sites for each selected client and annotate with clientId
        const allWithClient: Array<
          Array<{ id: string; name: string; clientId: string }>
        > = await Promise.all(
          current.map(async (cid) => {
            try {
              const res = await postSiteService.list(
                { clientId: cid },
                { limit: 1000, offset: 0 },
              );
              const rows = (res as any).rows || [];
              // defensively filter returned rows by client id fields in case backend ignores the filter
              const filtered = rows.filter((r: any) => {
                // possible client identifiers in backend payload
                const rowClientId =
                  r.client?.id ??
                  r.clientAccount?.id ??
                  r.clientAccountId ??
                  r.clientId ??
                  null;

                return rowClientId === cid;
              });

              return filtered.map((r: any) => ({
                id: r.id,
                name: r.companyName ?? r.name ?? "",
                clientId: cid,
              }));
            } catch (e) {
              console.error("Error cargando sitios para cliente", cid, e);

              return [] as Array<{
                id: string;
                name: string;
                clientId: string;
              }>;
            }
          }),
        );

        if (!mounted) return;

        const merged = allWithClient.flat();
        // build map of siteId -> { id, name, clientIds:Set }
        const map = merged.reduce<
          Record<string, { id: string; name: string; clientIds: Set<string> }>
        >(
          (acc, cur) => {
            if (!acc[cur.id])
              acc[cur.id] = {
                id: cur.id,
                name: cur.name,
                clientIds: new Set<string>(),
              };
            acc[cur.id].clientIds.add(cur.clientId);

            return acc;
          },
          {} as Record<
            string,
            { id: string; name: string; clientIds: Set<string> }
          >,
        );

        const uniqueSites = Object.values(map).map((v) => ({
          id: v.id,
          name: v.name,
          clientIds: Array.from(v.clientIds),
        }));

        setSiteOptions(uniqueSites);

        // now update selected postSiteIds so they always belong to currently selected clients
        const added = current.filter((c) => !prev.includes(c));
        const currentSelected = watchedPostSiteIds || [];
        const selectedSet = new Set(currentSelected);

        // for added clients, add their sites
        if (added.length > 0) {
          for (const s of uniqueSites) {
            if (s.clientIds && s.clientIds.some((cid) => added.includes(cid)))
              selectedSet.add(s.id);
          }
        }

        // ensure final selected sites are subset of available uniqueSites
        const allowedIds = new Set(uniqueSites.map((s) => s.id));

        for (const sid of Array.from(selectedSet)) {
          if (!allowedIds.has(sid)) selectedSet.delete(sid);
        }

        const newSelected = Array.from(selectedSet);

        setValue("postSiteIds", newSelected);
      } catch (err) {
        console.error("Error cargando sitios para clientes seleccionados", err);
        setSiteOptions([]);
      }
    })();

    prevClientIdsRef.current = current;

    return () => {
      mounted = false;
    };
  }, [watchedClientIds]);

  // Load stations when selected postSiteIds change (filter stations by postSiteId)
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const tenantId = localStorage.getItem("tenantId") || "";

        if (!tenantId) return;

        // try server-side filtered call first
        let rows: any[] = [];

        try {
          if (watchedPostSiteIds && watchedPostSiteIds.length === 1) {
            const resp = await ApiService.get(`/tenant/${tenantId}/station`, {
              postSiteId: watchedPostSiteIds[0],
            } as any);

            rows = Array.isArray(resp)
              ? resp
              : resp && resp.rows
                ? resp.rows
                : [];
          } else {
            const resp = await ApiService.get(`/tenant/${tenantId}/station`);

            rows = Array.isArray(resp)
              ? resp
              : resp && resp.rows
                ? resp.rows
                : [];
          }
        } catch (e) {
          // fallback: empty
          rows = [];
        }

        if (!mounted) return;

        // Map and filter by selected postSiteIds if provided
        const mapped = (rows || []).map((st: any) => ({
          id: st.id ?? st._id ?? String(st.id),
          name: st.name ?? st.label ?? st.stationName ?? "",
          postSiteId:
            st.postSiteId ?? st.businessInfoId ?? st.businessInfo ?? null,
        }));
        const filtered =
          watchedPostSiteIds && watchedPostSiteIds.length > 0
            ? mapped.filter((m: any) =>
                watchedPostSiteIds.includes(String(m.postSiteId)),
              )
            : mapped;

        setStationOptions(filtered);
      } catch (e) {
        console.error("Error cargando estaciones", e);
        setStationOptions([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [watchedPostSiteIds]);

  // ACL: Filter available options for non-admins
  useEffect(() => {
    (async () => {
      try {
        const tenantId = localStorage.getItem("tenantId") || "";

        if (!tenantId) return;

        let me = currentUser;

        if (!me) {
          try {
            me = await ApiService.get(`/auth/me`);
            setCurrentUser(me);
          } catch (e) {
            // fallback
          }
        }

        let tenantUser = null;

        if (me && me.tenants) {
          tenantUser = Array.isArray(me.tenants)
            ? me.tenants.find(
                (t: TenantUser) =>
                  (t.tenant?.id ?? t.tenantId ?? t.tenant) === tenantId,
              )
            : null;
        }

        if (!tenantUser) {
          // attempt tenant user endpoint (may return assignedClients)
          try {
            const curId = me?.id || me?._id || null;

            if (curId) {
              const tu = await userService.fetchUser(curId);

              tenantUser = tu;
            }
          } catch (e) {
            // ignore
          }
        }

        const roles = tenantUser?.roles || tenantUser?.role || [];
        const isAdmin = Array.isArray(roles)
          ? roles.includes("admin") || roles.includes("Admin")
          : String(roles).toLowerCase().includes("admin");

        if (isAdmin) {
          setAclAllowedClientIds(null);
          setAclAllowedPostSiteIds(null);
          setAclAllowedStationIds(null);

          return;
        }

        // if not admin, restrict to assigned arrays
        const assignedClients =
          tenantUser?.assignedClients || tenantUser?.clientIds || [];
        const assignedSites =
          tenantUser?.assignedPostSites || tenantUser?.postSiteIds || [];
        const assignedStations =
          tenantUser?.assignedStations || tenantUser?.stationIds || [];

        setAclAllowedClientIds(
          Array.isArray(assignedClients) ? assignedClients : [],
        );
        setAclAllowedPostSiteIds(
          Array.isArray(assignedSites) ? assignedSites : [],
        );
        setAclAllowedStationIds(
          Array.isArray(assignedStations) ? assignedStations : [],
        );

        // filter clientOptions, siteOptions and stationOptions accordingly
        if (
          assignedClients &&
          Array.isArray(assignedClients) &&
          assignedClients.length > 0
        ) {
          setClientOptions((prev) =>
            prev.filter((c) => assignedClients.includes(c.id)),
          );
        }
        if (
          assignedSites &&
          Array.isArray(assignedSites) &&
          assignedSites.length > 0
        ) {
          setSiteOptions((prev) =>
            prev.filter((s) => assignedSites.includes(s.id)),
          );
        }
        if (
          assignedStations &&
          Array.isArray(assignedStations) &&
          assignedStations.length > 0
        ) {
          setStationOptions((prev) =>
            prev.filter((s) => assignedStations.includes(s.id)),
          );
        }
      } catch (e) {
        console.error("Error evaluando ACL", e);
      }
    })();
  }, [currentUser]);

  // If editing an existing user, fetch and prefill
  useEffect(() => {
    if (!editUserId) return;
    (async () => {
      setLoading(true);
      try {
        const tenantId = localStorage.getItem("tenantId") || "";

        if (!tenantId)
          throw new Error(
            t("ui.NewAdminUser.tenantNoConfigurado", "Tenant no configurado"),
          );
        const resp = await userService.fetchUser(editUserId);
        // resp may include tenants array, search by tenant
        const tenantObj = resp?.tenants
          ? resp.tenants.find(
              (t: TenantUser) =>
                (t.tenant?.id ?? t.tenantId ?? t.tenant) === tenantId,
            )
          : null;
        const assignedClients =
          tenantObj?.assignedClients ||
          resp?.assignedClients ||
          tenantObj?.clientIds ||
          resp?.clientIds ||
          [];
        const assignedSites =
          tenantObj?.assignedPostSites ||
          resp?.assignedPostSites ||
          tenantObj?.postSiteIds ||
          resp?.postSiteIds ||
          [];
        const assignedStations =
          tenantObj?.assignedStations ||
          resp?.assignedStations ||
          tenantObj?.stationIds ||
          resp?.stationIds ||
          [];

        if (resp?.name) setValue("name", resp.name);
        if (resp?.email) setValue("email", resp.email);
        if (resp?.role) setValue("accessLevel", resp.role);
        if (Array.isArray(assignedClients))
          setValue("clientIds", assignedClients);
        if (Array.isArray(assignedSites))
          setValue("postSiteIds", assignedSites);
        if (Array.isArray(assignedStations))
          setValue("stationIds", assignedStations);
      } catch (e) {
        console.error("Error cargando usuario para edición", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [editUserId]);

  const navigate = useNavigate();

  // Invitation modal state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [generatedExpiresAt, setGeneratedExpiresAt] = useState<string | null>(
    null,
  );

  const onSubmit = async (values: NewAdminUserValues) => {
    try {
      const tenantId = localStorage.getItem("tenantId") || "";

      if (!tenantId)
        throw new Error(
          t(
            "ui.EditAdminUser.noPudimosIdentificarTuEmpresa",
            "No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.",
          ),
        );

      // local validation for UUIDs
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const invalidClient = (values.clientIds || []).find(
        (id) => !uuidRegex.test(id),
      );
      const invalidSite = (values.postSiteIds || []).find(
        (id) => !uuidRegex.test(id),
      );
      const invalidStation = (values.stationIds || []).find(
        (id: string) => !uuidRegex.test(id),
      );

      if (invalidClient || invalidSite) {
        toast.error(
          t("adminOfficeUsers.newUser.errors.invalidIds", {
            defaultValue: "IDs inválidos detectados en asignaciones",
          }),
        );

        return;
      }
      if (invalidStation) {
        toast.error(
          t("adminOfficeUsers.newUser.errors.invalidIds", {
            defaultValue: "IDs inválidos detectados en asignaciones",
          }),
        );

        return;
      }

      const invitedPending = true; // user hasn't signed in yet
      const payload = {
        name: values.name,
        email: values.email,
        role: values.accessLevel,
        clientIds: values.clientIds,
        postSiteIds: values.postSiteIds || [],
        // `stationIds` NO se manda: escribía en `tenant_user_post_sites.station_id`,
        // una columna que ya no existe (el propio código la esquivaba con un
        // `hasStationColumn`). Era un selector que no restringía nada y hacía
        // creer lo contrario. El alcance real son las SEDES.
        invited: invitedPending,
        pending: invitedPending,
      } as any;

      let resp: any;

      if (editUserId) {
        resp = await userService.updateUser(editUserId, payload);
      } else {
        resp = await userService.createUser(payload);
      }

      toast.success(
        editUserId
          ? t("adminOfficeUsers.newUser.toasts.updated", {
              defaultValue: "Usuario actualizado correctamente",
            })
          : t("adminOfficeUsers.newUser.toasts.created", {
              defaultValue: "Usuario creado correctamente",
            }),
      );
      navigate("/back-office");
    } catch (err) {
      const e = err as any;

      // use helper to map backend validation errors to form fields
      try {
        // lazy import to avoid cycles
        const { applyValidationErrorsToForm } =
          await import("@/lib/utils/formErrorMapper");
        const result = applyValidationErrorsToForm(e, setError as any);
        const msgs = Array.isArray(result) ? result : result.messages;

        if (msgs && msgs.length > 0) msgs.forEach((m) => toast.error(m));
        else {
          const backendErrors =
            e?.response?.data?.errors ||
            e?.response?.data?.user?.errors ||
            e?.response?.data ||
            null;

          if (backendErrors?.message) toast.error(backendErrors.message);
          else
            toast.error(
              e?.message ||
                t("adminOfficeUsers.newUser.errors.unknown", {
                  defaultValue: "Error desconocido",
                }),
            );
        }
      } catch (ex) {
        const msg =
          e?.message ||
          e?.toString() ||
          t("adminOfficeUsers.newUser.errors.unknown", {
            defaultValue: "Error desconocido",
          });

        toast.error(`${msg}`);
      }
    }
  };

  const createInvitationToken = async () => {
    try {
      const tenantId = localStorage.getItem("tenantId") || "";

      if (!tenantId)
        throw new Error(
          t(
            "ui.EditAdminUser.noPudimosIdentificarTuEmpresa",
            "No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.",
          ),
        );
      setInviteLoading(true);
      setGeneratedToken(null);

      // Only the backend can issue a valid invitation code. Never fall back to a
      // locally-generated code: it would be server-unknown (the backend would reject
      // it) and a Math.random 6-digit value is not cryptographically strong. On any
      // failure, surface an error and do not display a fake code.
      const payload = {
        email: inviteEmail || undefined,
        expiresInSeconds: 3600,
      };
      const resp: any = await ApiService.post(
        `/tenant/${tenantId}/tenant-user/invitation-token`,
        payload,
      );
      const token =
        resp?.token ||
        resp?.invitationToken ||
        resp?.data?.token ||
        resp?.data?.invitationToken;
      const expiresAt =
        resp?.expiresAt ||
        resp?.invitationTokenExpiresAt ||
        resp?.data?.expiresAt ||
        null;

      if (!token) {
        throw new Error(
          t("adminOfficeUsers.newUser.errors.createCode", {
            defaultValue: "Error creando código",
          }),
        );
      }
      setGeneratedToken(String(token));
      setGeneratedExpiresAt(
        expiresAt
          ? String(expiresAt)
          : new Date(Date.now() + 3600 * 1000).toISOString(),
      );
      toast.success(
        t("adminOfficeUsers.newUser.toasts.inviteCreated", {
          defaultValue: "Código de invitación creado",
        }),
      );
    } catch (err: any) {
      setGeneratedToken(null);
      setGeneratedExpiresAt(null);
      toast.error(
        err?.message ||
          t("adminOfficeUsers.newUser.errors.createCode", {
            defaultValue: "Error creando código",
          }),
      );
    } finally {
      setInviteLoading(false);
    }
  };

  const regenCode = async () => {
    // Always request a fresh code from the backend; never surface a local code.
    setGeneratedToken(null);
    setGeneratedExpiresAt(null);
    try {
      await createInvitationToken();
    } catch (e) {
      // ignore — createInvitationToken handles errors and toasts
    }
  };

  // Auto-generate when modal opens (call backend)
  useEffect(() => {
    if (inviteOpen && !generatedToken) {
      // fire and forget
      createInvitationToken();
    }
  }, [inviteOpen]);

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          icon={<UserPlus />}
          subtitle={t("adminOfficeUsers.newUser.subtitle", {
            defaultValue:
              "Define la identidad, el nivel de acceso y las asignaciones del usuario",
          })}
          title={
            editUserId
              ? t("adminOfficeUsers.editUser.breadcrumb.edit", {
                  defaultValue: "Editar Usuario",
                })
              : t("adminOfficeUsers.newUser.breadcrumb.new", {
                  defaultValue: "Nuevo Usuario",
                })
          }
        />

        <Section
          icon={<UserPlus />}
          title={t("adminOfficeUsers.newUser.sectionTitle", {
            defaultValue: "Datos del usuario",
          })}
        >
          <Form {...form}>
            <form className="grid gap-6" onSubmit={handleSubmit(onSubmit)}>
              {/* ── QUIÉN ES ─────────────────────────────────────────── */}
              <div>
                <p className="cg-eyebrow mb-2">
                  {t("ui.NewAdminUser.1QuienEs", "1 · Quién es")}
                </p>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <FormField
                    control={control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t("adminOfficeUsers.newUser.form.nameLabel", {
                            defaultValue: "Nombre*",
                          })}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t(
                              "ui.NewAdminUserPage.nombreYApellido",
                            )}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t("adminOfficeUsers.newUser.form.emailLabel", {
                            defaultValue: "Correo Electrónico*",
                          })}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t(
                              "ui.NewAdminUserPage.nombreEmpresaCom",
                            )}
                            {...field}
                          />
                        </FormControl>
                        <p
                          className="text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {t(
                            "ui.NewAdminUser.aquiLeLlegaLaInvitacionParaCrearSuContrasena",
                            "Aquí le llega la invitación para crear su contraseña.",
                          )}
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* ── QUÉ PUEDE HACER ──────────────────────────────────── */}
              <div>
                <p className="cg-eyebrow mb-2">
                  {t("ui.NewAdminUser.2QuePuedeHacer", "2 · Qué puede hacer")}
                </p>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <FormField
                    control={control}
                    name="accessLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t("ui.EditAdminUser.rolReq", "Rol*")}
                        </FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue
                                placeholder={t("comun.eligeUnRol")}
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {roleOptions.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {getRoleDisplayName(r)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {/* El rol decide lo que puede HACER. Antes se llamaba
                          «Nivel de Acceso», que sugería una escalera de
                          privilegios que no existe, y no explicaba nada. */}
                        {field.value && (
                          <p
                            className="text-xs"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {(() => {
                              const elegido = roleOptions.find(
                                (r) => r.id === field.value,
                              );

                              return roleDisplayDescription(
                                elegido?.slug || elegido?.name || field.value,
                              );
                            })()}
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* ── QUÉ PUEDE VER ────────────────────────────────────── */}
              <div>
                <p className="cg-eyebrow mb-2">
                  {t("ui.NewAdminUser.3QuePuedeVer", "3 · Qué puede ver")}
                </p>

                {veTodoPorRol ? (
                  /* Admin y Gerente de Operaciones ignoran el alcance por diseño
                   (lib/postSiteScope): enseñar los selectores aquí era pedirle
                   al usuario que configurara algo que el servidor descarta. */
                  <div
                    className="rounded-xl border px-4 py-3 text-sm"
                    style={{
                      borderColor: "var(--hairline)",
                      background: "var(--float)",
                    }}
                  >
                    {t("ui.NewAdminUser.esteRolVe", "Este rol ve")}{" "}
                    <strong>
                      {t(
                        "ui.NewAdminUser.todaLaOperacion",
                        "toda la operación",
                      )}
                    </strong>{" "}
                    {t(
                      "ui.EditAdminUser.porDefinicionNoSePuedeAcotar",
                      "por definición: no se puede acotar.",
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        className="cg-focus rounded-xl border px-4 py-3 text-left transition"
                        style={{
                          borderColor: !acotado
                            ? "var(--brand)"
                            : "var(--hairline)",
                          background: !acotado
                            ? "color-mix(in oklab, var(--brand) 8%, transparent)"
                            : "transparent",
                        }}
                        type="button"
                        onClick={() => {
                          setAcotado(false);
                          setValue("clientIds", []);
                          setValue("postSiteIds", []);
                        }}
                      >
                        <span className="block text-sm font-semibold">
                          {t(
                            "ui.NewAdminUser.todaLaOperacion2",
                            "Toda la operación",
                          )}
                        </span>
                        <span
                          className="block text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {t(
                            "ui.NewAdminUser.veTodosLosClientes",
                            "Ve todos los clientes y todas las sedes. Es lo normal para la oficina.",
                          )}
                        </span>
                      </button>
                      <button
                        className="cg-focus rounded-xl border px-4 py-3 text-left transition"
                        style={{
                          borderColor: acotado
                            ? "var(--brand)"
                            : "var(--hairline)",
                          background: acotado
                            ? "color-mix(in oklab, var(--brand) 8%, transparent)"
                            : "transparent",
                        }}
                        type="button"
                        onClick={() => setAcotado(true)}
                      >
                        <span className="block text-sm font-semibold">
                          {t("comun.soloLoQueYoElija")}
                        </span>
                        <span
                          className="block text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {t(
                            "ui.NewAdminUser.paraQuienLlevaUnasCuentas",
                            "Para quien lleva unas cuentas concretas y no debe ver el resto.",
                          )}
                        </span>
                      </button>
                    </div>

                    {acotado && (
                      <div
                        className="space-y-5 rounded-xl border p-4"
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        <FormField
                          control={control}
                          name="postSiteIds"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                {t("ui.EditAdminUser.sedes", "Sedes")}
                              </FormLabel>
                              <p
                                className="mb-1.5 text-xs"
                                style={{ color: "var(--ink-soft)" }}
                              >
                                {t(
                                  "ui.NewAdminUser.esElAlcanceDeVerdad",
                                  "Es el alcance de verdad: limita los turnos, la nómina, la cobertura, las visitas y los puestos que esta persona puede ver y tocar.",
                                )}
                              </p>
                              <FormControl>
                                <MultiSelectDeSedes
                                  options={siteOptions}
                                  placeholder={t("comun.elegirSedes")}
                                  value={(field.value as string[]) || []}
                                  onChange={(ids: string[]) =>
                                    field.onChange(ids)
                                  }
                                />
                              </FormControl>
                              {(!field.value ||
                                (field.value as string[]).length === 0) && (
                                <p
                                  className="text-xs"
                                  style={{
                                    color: "var(--warn-text, var(--ink-soft))",
                                  }}
                                >
                                  {t(
                                    "ui.NewAdminUser.sinSedeMarcaAlMenosUna",
                                    "Sin ninguna sede marcada seguirá viendo TODO. Marca al menos una.",
                                  )}
                                </p>
                              )}
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={control}
                          name="clientIds"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                {t("ui.EditAdminUser.clientes", "Clientes")}{" "}
                                <span
                                  className="font-normal"
                                  style={{ color: "var(--ink-soft)" }}
                                >
                                  {t(
                                    "ui.EditAdminUser.opcionalParentesis",
                                    "(opcional)",
                                  )}
                                </span>
                              </FormLabel>
                              <p
                                className="mb-1.5 text-xs"
                                style={{ color: "var(--ink-soft)" }}
                              >
                                {t(
                                  "ui.EditAdminUser.atajoClientes",
                                  "Atajo: al elegir un cliente se marcan sus sedes. Por sí solo, hoy únicamente limita qué incidentes ve.",
                                )}
                              </p>
                              <FormControl>
                                <MultiSelectDeSedes
                                  options={clientOptions}
                                  placeholder={t("comun.elegirClientes")}
                                  value={(field.value as string[]) || []}
                                  onChange={(ids: string[]) =>
                                    field.onChange(ids)
                                  }
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center">
                <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                  <DialogTrigger asChild>
                    <Button
                      style={{
                        borderColor: "var(--brand-line)",
                        color: "var(--brand-text)",
                      }}
                      variant="outline"
                    >
                      <Ticket className="mr-2 h-4 w-4" />
                      {t("adminOfficeUsers.newUser.invite.createTrigger", {
                        defaultValue: "Crear código de invitación",
                      })}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="textalign-center ">
                        {t("adminOfficeUsers.newUser.invite.title", {
                          defaultValue: "Generar código de invitación",
                        })}
                      </DialogTitle>
                      <DialogDescription>
                        {t("adminOfficeUsers.newUser.invite.description", {
                          defaultValue:
                            "Cree un código temporal para invitar a un usuario (expira en 1 hora).",
                        })}
                      </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4">
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex items-center gap-3">
                          <div className="border-2 border-dashed border-muted px-6 py-3 rounded text-2xl font-mono tracking-wider">
                            {generatedToken ||
                              t(
                                "adminOfficeUsers.newUser.invite.placeholderToken",
                                { defaultValue: "------" },
                              )}
                          </div>
                          <div className="flex flex-col gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={async () => {
                                if (generatedToken) {
                                  await navigator.clipboard.writeText(
                                    generatedToken,
                                  );
                                  toast.success(
                                    t(
                                      "adminOfficeUsers.newUser.toasts.codeCopied",
                                      { defaultValue: "Código copiado" },
                                    ),
                                  );
                                }
                              }}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {generatedExpiresAt && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {t("adminOfficeUsers.newUser.invite.expiresLabel", {
                              defaultValue: "Expira:",
                            })}{" "}
                            {generatedExpiresAt}
                          </div>
                        )}
                      </div>
                    </div>

                    <DialogFooter>
                      <Button
                        disabled={inviteLoading}
                        variant="brand"
                        onClick={createInvitationToken}
                      >
                        {inviteLoading
                          ? t("adminOfficeUsers.newUser.invite.generating", {
                              defaultValue: "Generando...",
                            })
                          : generatedToken
                            ? t("adminOfficeUsers.newUser.invite.regen", {
                                defaultValue: "Regenerar",
                              })
                            : t("adminOfficeUsers.newUser.invite.generate", {
                                defaultValue: "Generar código",
                              })}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Button
                  disabled={formState.isSubmitting || !accessLevelValue}
                  type="submit"
                  variant="brand"
                >
                  {formState.isSubmitting
                    ? t("adminOfficeUsers.newUser.form.creating", {
                        defaultValue: "Creando...",
                      })
                    : t("adminOfficeUsers.newUser.form.create", {
                        defaultValue: "Crear",
                      })}
                </Button>
              </div>
            </form>
          </Form>
        </Section>
      </PageContainer>
    </AppLayout>
  );
}
