"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  UserCog,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  MapPin,
} from "lucide-react";

import UserPermissionOverrides, { Overrides } from "./UserPermissionOverrides";

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
import { clientService } from "@/lib/api/clientService";
import { postSiteService } from "@/lib/api/postSiteService";
import { ApiService } from "@/services/api/apiService";
import userService from "@/lib/api/userService";
import { MultiSelectDeSedes } from "@/components/MultiSelectDeSedes";
import {
  newAdminUserSchema,
  type NewAdminUserValues,
} from "@/lib/validators/new-admin-user.schema";
import { usePermissions } from "@/hooks/usePermissions";
import {
  PageContainer,
  PageHeader,
  Section,
  GlassPanel,
  IconTile,
} from "@/components/kit";
import { roleDisplayDescription, roleDisplayName } from "@/config/roleLabels";
import { UsuarioDeAccesoEditable } from "@/components/usuarioDeAcceso/UsuarioDeAccesoEditable";

const CLIENT_OPTIONS_PLACEHOLDER: Array<{ id: string; name: string }> = [];

export default function EditAdminUserPage() {
  const { t } = useTranslation();
  const params = useParams();
  const id = params.id;

  const form = useForm<NewAdminUserValues>({
    resolver: zodResolver(newAdminUserSchema),
    defaultValues: {
      name: "",
      email: "",
      accessLevel: undefined as unknown as NewAdminUserValues["accessLevel"],
      clientIds: [],
      postSiteIds: [],
    },
    mode: "onTouched",
  });

  const { handleSubmit, control, formState, setValue, setError } = form;

  /** Ver todo (por defecto) o acotar a unas sedes. El servidor entiende «sin
   *  sedes = sin restricción», y eso no se veía en ningún sitio. */
  const [acotado, setAcotado] = useState(false);
  const [clientOptions, setClientOptions] = useState<
    Array<{ id: string; name: string }>
  >(CLIENT_OPTIONS_PLACEHOLDER);
  const [siteOptions, setSiteOptions] = useState<
    Array<{ id: string; name: string; clientIds?: string[] }>
  >([]);
  const [roleOptions, setRoleOptions] = useState<
    Array<{ id: string; name?: string; label?: string; slug?: string }>
  >([]);
  const [fetchedRoleCandidate, setFetchedRoleCandidate] = useState<any>(null);

  // Per-user permission overrides (PR-4). Only editable by admins (settingsEdit).
  const { hasPermission } = usePermissions();
  const canEditPerms = hasPermission("settingsEdit");
  const [overrides, setOverrides] = useState<Overrides>({
    grant: [],
    deny: [],
  });
  // Optional office location for administrative self-attendance (web time clock).
  const [office, setOffice] = useState<{
    address: string;
    lat: string;
    lng: string;
    radius: string;
  }>({ address: "", lat: "", lng: "", radius: "150" });
  const [officeSaving, setOfficeSaving] = useState(false);
  const [officeOpen, setOfficeOpen] = useState(false);
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [permsOpen, setPermsOpen] = useState(false);
  const [permQuery, setPermQuery] = useState("");
  const watchedAccessLevel = useWatch({
    control: form.control,
    name: "accessLevel",
  }) as string | undefined;

  /** Admin y Gerente de Operaciones ignoran el alcance (lib/postSiteScope):
   *  enseñarles los selectores era pedirles configurar algo que se descarta. */
  const veTodoPorRol = ["admin", "operationsmanager"].includes(
    String(watchedAccessLevel || "").toLowerCase(),
  );
  const selectedRoleSlug = (
    roleOptions.find((r) => String(r.id) === String(watchedAccessLevel))
      ?.slug || ""
  ).toLowerCase();

  // Load the inherited permissions of the selected role so the override panel can
  // show what is granted by the role vs by an explicit override.
  useEffect(() => {
    if (!canEditPerms || !watchedAccessLevel) {
      setRolePermissions([]);

      return;
    }
    let mounted = true;

    (async () => {
      try {
        const tenantId = localStorage.getItem("tenantId") || "";

        if (!tenantId) return;
        const res = await ApiService.get(
          `/tenant/${tenantId}/role/${watchedAccessLevel}`,
        );
        const data = res && (res.data || res) ? res.data || res : {};

        if (mounted)
          setRolePermissions(
            Array.isArray(data.permissions) ? data.permissions : [],
          );
      } catch (e) {
        if (mounted) setRolePermissions([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [canEditPerms, watchedAccessLevel]);

  const getRoleDisplayName = useCallback(
    (role: { id?: string; name?: string; slug?: string }) => {
      const id = (role.id || "").toString().toLowerCase();
      const name = (role.name || "").toString();
      const slug = (role.slug || "").toString().toLowerCase();

      if (
        id === "administrativesupervisor" ||
        slug === "administrativesupervisor"
      ) {
        return t("adminOfficeUsers.roleNames.administrativeSupervisor", {
          defaultValue: "Supervisor Administrativo",
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
  const prevClientIdsRef = useRef<string[] | undefined>(undefined);

  const watchedClientIds = useWatch({
    control: form.control,
    name: "clientIds",
  }) as string[] | undefined;
  const watchedPostSiteIds = useWatch({
    control: form.control,
    name: "postSiteIds",
  }) as string[] | undefined;

  useEffect(() => {
    (async () => {
      try {
        const clients = await clientService.getClients({});

        setClientOptions((clients as any).rows || []);
      } catch (err) {
        setClientOptions([]);
        toast.error(
          t("adminOfficeUsers.editUser.errors.loadClientsError", {
            defaultValue: "No se pudieron cargar los clientes",
          }),
        );
      }
    })();

    (async () => {
      try {
        const tenantId = localStorage.getItem("tenantId") || "";

        if (!tenantId) return;
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
        const opts = rows.map((r: any) => ({
          id: r.id ?? r._id ?? String(r.id),
          name: r.name ?? r.label ?? "",
          slug: r.slug ?? r.name ?? undefined,
        }));

        setRoleOptions(opts);
      } catch (e) {
        setRoleOptions([]);
      }
    })();
  }, []);

  // try to resolve a fetched simple role candidate once roleOptions are available
  useEffect(() => {
    if (!fetchedRoleCandidate || roleOptions.length === 0) return;
    const candidate = fetchedRoleCandidate;

    const normalize = (s: any) => {
      if (!s && s !== 0) return "";
      try {
        return String(s)
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .toLowerCase()
          .replace(/[_\-\s]+/g, "");
      } catch (e) {
        return String(s).toLowerCase();
      }
    };

    const candNorm = normalize(
      typeof candidate === "object"
        ? (candidate.name ?? candidate.role ?? candidate)
        : candidate,
    );

    const found = roleOptions.find((o) => {
      if (!o) return false;
      const nameNorm = normalize(o.name ?? o.label ?? o.id);

      // exact id match
      if (o.id === candidate) return true;
      // exact normalized match
      if (candNorm && nameNorm === candNorm) return true;
      // contains or partial match (e.g., 'gerente-general' vs 'Gerente General')
      if (candNorm && nameNorm.includes(candNorm)) return true;
      if (candNorm && candNorm.includes(nameNorm)) return true;

      return false;
    });

    if (found) setValue("accessLevel", String(found.id));
    setFetchedRoleCandidate(null);
  }, [fetchedRoleCandidate, roleOptions, setValue]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const tenantId = localStorage.getItem("tenantId") || "";

        if (!tenantId) return;
        const res = await userService.fetchUser(id as string);
        const user = res?.data || res || null;

        if (!user) return;

        // map backend user to form fields as best-effort
        setValue(
          "name",
          user.fullName ||
            user.name ||
            [user.firstName, user.lastName].filter(Boolean).join(" ") ||
            "",
        );
        // Nombres y apellidos por SEPARADO: con un solo campo, «Pablo Andrés
        // Osorio García» se guardaba con «Andrés» dentro de los apellidos.
        const [n0, ...a0] = String(user.fullName || "")
          .trim()
          .split(/\s+/);

        setNombres(user.firstName ?? n0 ?? "");
        setApellidos(user.lastName ?? a0.join(" ") ?? "");
        setNombreOriginal({
          first: user.firstName ?? "",
          last: user.lastName ?? "",
        });
        setValue("email", user.email || "");
        setAlias(user.username || null);
        // Prefill the optional office location (self-attendance geofence).
        setOffice({
          address: user.officeAddress || "",
          lat: user.officeLatitude != null ? String(user.officeLatitude) : "",
          lng: user.officeLongitude != null ? String(user.officeLongitude) : "",
          radius:
            user.officeGeofenceRadiusM != null
              ? String(user.officeGeofenceRadiusM)
              : "150",
        });
        // Try to resolve accessLevel from several shapes, prefer tenant-scoped roles
        let roleCandidate: any = null;

        try {
          const tenantId = localStorage.getItem("tenantId");

          if (Array.isArray(user.tenants) && user.tenants.length > 0) {
            const tenantEntry = tenantId
              ? user.tenants.find(
                  (t: any) =>
                    t.tenantId === tenantId ||
                    (t.tenant &&
                      (t.tenant.id === tenantId ||
                        t.tenant.tenantId === tenantId)),
                )
              : user.tenants[0];

            if (tenantEntry) {
              // tenantEntry.roles might be array or single value
              if (
                Array.isArray(tenantEntry.roles) &&
                tenantEntry.roles.length > 0
              )
                roleCandidate = tenantEntry.roles[0];
              else if (tenantEntry.role) roleCandidate = tenantEntry.role;
              // Load existing per-user permission overrides.
              const ov = tenantEntry.permissionOverrides;

              if (ov && (Array.isArray(ov.grant) || Array.isArray(ov.deny))) {
                setOverrides({
                  grant: Array.isArray(ov.grant) ? ov.grant : [],
                  deny: Array.isArray(ov.deny) ? ov.deny : [],
                });
              }
            }
          }
        } catch (e) {
          // ignore and fallback below
        }
        if (!roleCandidate) {
          roleCandidate =
            user.role ||
            (Array.isArray(user.roles) && user.roles[0]) ||
            user.roles?.[0];
        }
        // if candidate is an object with id, use it; otherwise keep candidate to resolve after roleOptions load
        const roleId =
          roleCandidate && (roleCandidate.id ?? roleCandidate._id ?? null);

        if (roleId) {
          setValue("accessLevel", String(roleId));
        } else if (roleCandidate) {
          // store simple candidate (e.g. "supervisor") to resolve once role options are loaded
          setFetchedRoleCandidate(roleCandidate);
        }

        // clients and post sites (backend may return different property names)
        const clientSource =
          user.clientIds ?? user.clients ?? user.assignedClients ?? [];
        const clientIds = Array.isArray(clientSource)
          ? clientSource
              .map((c: any) => (c && (c.id || c)) || c)
              .filter(Boolean)
          : [];

        const postSiteSource =
          user.postSiteIds ?? user.postSites ?? user.assignedPostSites ?? [];
        const postSiteIds = Array.isArray(postSiteSource)
          ? postSiteSource
              .map((p: any) => (p && (p.id || p)) || p)
              .filter(Boolean)
          : [];

        // SECURITY: seed prevClientIdsRef with the user's SAVED clientIds *before* they hydrate
        // the form. The watchedClientIds effect diffs current vs prev to decide which sites to
        // auto-add; if prev is empty on load, every saved client counts as "newly added" and its
        // sites get unioned onto postSiteIds — silently over-granting access the admin never chose.
        // Seeding prev = saved clientIds makes `added` empty on hydration, preserving saved postSiteIds.
        if (clientIds && clientIds.length) {
          prevClientIdsRef.current = clientIds;
          setValue("clientIds", clientIds);
        }
        if (postSiteIds && postSiteIds.length) {
          setValue("postSiteIds", postSiteIds);
          // Ya venía acotado: la pantalla abre en ese modo en vez de decirle
          // «ve todo» a alguien que lleva meses restringido.
          setAcotado(true);
        }
      } catch (err) {
        toast.error(
          t("adminOfficeUsers.editUser.errors.loadError", {
            defaultValue: "No se pudo cargar la información del usuario",
          }),
        );
      }
    })();
  }, [id, setValue]);

  useEffect(() => {
    let mounted = true;
    const prev = prevClientIdsRef.current || [];
    const current = watchedClientIds || [];

    if (!current || current.length === 0) {
      setSiteOptions([]);
      setValue("postSiteIds", []);
      prevClientIdsRef.current = current;

      return;
    }

    (async () => {
      try {
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
              const filtered = rows.filter((r: any) => {
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

        const added = current.filter((c) => !prev.includes(c));
        const currentSelected = watchedPostSiteIds || [];
        const selectedSet = new Set(currentSelected);

        if (added.length > 0) {
          for (const s of uniqueSites) {
            if (s.clientIds && s.clientIds.some((cid) => added.includes(cid)))
              selectedSet.add(s.id);
          }
        }

        const allowedIds = new Set(uniqueSites.map((s) => s.id));

        for (const sid of Array.from(selectedSet)) {
          if (!allowedIds.has(sid)) selectedSet.delete(sid);
        }

        const newSelected = Array.from(selectedSet);

        setValue("postSiteIds", newSelected);
      } catch (err) {
        setSiteOptions([]);
      }
    })();

    prevClientIdsRef.current = current;

    return () => {
      mounted = false;
    };
  }, [watchedClientIds]);

  const navigate = useNavigate();

  const saveOfficeLocation = async (clear = false) => {
    if (!id) return;
    const tenantId = localStorage.getItem("tenantId") || "";

    if (!tenantId) return;
    setOfficeSaving(true);
    try {
      const data = clear
        ? {
            officeLatitude: null,
            officeLongitude: null,
            officeGeofenceRadiusM: null,
            officeAddress: null,
          }
        : {
            officeLatitude:
              office.lat.trim() === "" ? null : Number(office.lat),
            officeLongitude:
              office.lng.trim() === "" ? null : Number(office.lng),
            officeGeofenceRadiusM:
              office.radius.trim() === "" ? null : Number(office.radius),
            officeAddress: office.address.trim() || null,
          };

      await ApiService.patch(`/tenant/${tenantId}/user/${id}`, { data });
      if (clear) setOffice({ address: "", lat: "", lng: "", radius: "150" });
      toast.success(
        clear
          ? t(
              "ui.EditAdminUser.ubicacionEliminada",
              "Ubicación de oficina eliminada",
            )
          : t(
              "ui.EditAdminUser.ubicacionGuardada",
              "Ubicación de oficina guardada",
            ),
      );
    } catch (e: any) {
      toast.error(
        e?.message ||
          t(
            "ui.EditAdminUser.noSePudoGuardarUbicacion",
            "No se pudo guardar la ubicación",
          ),
      );
    } finally {
      setOfficeSaving(false);
    }
  };

  const useCurrentLocationAsOffice = () => {
    if (!navigator.geolocation)
      return toast.error(t("ui.EditAdminUserPage.geolocalizacionNoDisponible"));
    navigator.geolocation.getCurrentPosition(
      (p) =>
        setOffice((o) => ({
          ...o,
          lat: String(p.coords.latitude),
          lng: String(p.coords.longitude),
        })),
      (e) =>
        toast.error(
          e.message ||
            t(
              "ui.EditAdminUser.noSePudoObtenerUbicacion",
              "No se pudo obtener la ubicación",
            ),
        ),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // El usuario para entrar (alias): se cambia aparte, con efecto inmediato.
  const [alias, setAlias] = useState<string | null>(null);
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [nombreOriginal, setNombreOriginal] = useState<{
    first: string;
    last: string;
  } | null>(null);
  const cambiarNombreDelFormulario = (n: string, a: string) => {
    setNombres(n);
    setApellidos(a);
    setValue("name", [n.trim(), a.trim()].filter(Boolean).join(" "), {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

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

      const payload = {
        name: values.name,
        email: values.email,
        role: values.accessLevel,
        clientIds: values.clientIds,
        postSiteIds: values.postSiteIds || [],
      } as any;

      // Only admins send per-user overrides; the backend additionally requires
      // settingsEdit and enforces the admin-floor lockout guard.
      if (canEditPerms && id) {
        payload.permissionOverrides = {
          grant: overrides.grant,
          deny: overrides.deny,
        };
      }
      if (id) {
        // prefer PUT
        try {
          await userService.updateUser(id, payload);
        } catch (e: any) {
          const status = e?.response?.status;

          // Only fallback to create if the user was not found (legacy behavior)
          if (status === 404) {
            await userService.createUser({ ...payload, id } as any);
          } else {
            // rethrow to be handled by outer catch which maps validation errors
            throw e;
          }
        }
        /* El PUT sólo sabe del nombre COMPLETO y lo parte por el primer espacio;
           aquí se deja con nombres y apellidos tal cual se escribieron. */
        if (
          nombres.trim() &&
          (!nombreOriginal ||
            nombres.trim() !== nombreOriginal.first ||
            apellidos.trim() !== nombreOriginal.last)
        ) {
          await userService.cambiarNombre(id, nombres.trim(), apellidos.trim());
          setNombreOriginal({ first: nombres.trim(), last: apellidos.trim() });
        }
        toast.success(
          t("adminOfficeUsers.editUser.toasts.updated", {
            defaultValue: "Usuario actualizado correctamente",
          }),
        );
      } else {
        await userService.createUser({
          ...payload,
          invited: true,
          pending: true,
        } as any);
        toast.success(
          t("adminOfficeUsers.editUser.toasts.created", {
            defaultValue: "Usuario creado correctamente",
          }),
        );
      }

      navigate("/back-office");
    } catch (err: any) {
      try {
        const { applyValidationErrorsToForm } =
          await import("@/lib/utils/formErrorMapper");
        const result = applyValidationErrorsToForm(err, setError as any);
        const msgs = Array.isArray(result) ? result : result.messages;

        if (msgs && msgs.length > 0) msgs.forEach((m) => toast.error(m));
        else {
          const msg =
            err?.response?.data?.message ||
            err?.message ||
            (typeof err === "string"
              ? err
              : t(
                  "adminOfficeUsers.newUser.errors.unknown",
                  "Error desconocido",
                ));

          toast.error(`${msg}`);
        }
      } catch (ex) {
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          (typeof err === "string"
            ? err
            : t(
                "adminOfficeUsers.newUser.errors.unknown",
                "Error desconocido",
              ));

        toast.error(`${msg}`);
      }
    }
  };

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          actions={
            id && selectedRoleSlug === "securitysupervisor" ? (
              <Button
                variant="outline"
                onClick={() => navigate(`/supervisors/${id}`)}
              >
                {t("adminOfficeUsers.editUser.viewSupervisorProfile", {
                  defaultValue: "Ver perfil de supervisor",
                })}
              </Button>
            ) : undefined
          }
          icon={<UserCog />}
          subtitle={t("adminOfficeUsers.editUser.subtitle", {
            defaultValue:
              "Actualiza la identidad, el nivel de acceso y los permisos del usuario",
          })}
          title={
            id
              ? t("adminOfficeUsers.editUser.breadcrumb.edit", {
                  defaultValue: "Editar Usuario",
                })
              : t("adminOfficeUsers.editUser.breadcrumb.new", {
                  defaultValue: "Nuevo Usuario",
                })
          }
        />

        <Section
          icon={<UserCog />}
          title={t("adminOfficeUsers.editUser.sectionTitle", {
            defaultValue: "Datos del usuario",
          })}
        >
          <Form {...form}>
            <form className="grid gap-6" onSubmit={handleSubmit(onSubmit)}>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Nombres y apellidos separados. `name` (el nombre completo que
                    valida el formulario) se mantiene a partir de los dos. */}
                <FormField
                  control={control}
                  name="name"
                  render={() => (
                    <FormItem>
                      <FormLabel>
                        {t("ui.EditAdminUser.nombres", {
                          defaultValue: "Nombres*",
                        })}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("ui.EditAdminUser.nombresEj", {
                            defaultValue: "Ej.: Pablo Andrés",
                          })}
                          value={nombres}
                          onChange={(e) =>
                            cambiarNombreDelFormulario(
                              e.target.value,
                              apellidos,
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* Fuera de <FormField> a propósito: no es un campo del esquema,
                    y `FormLabel` sin su FormField revienta en tiempo de ejecución. */}
                <div className="grid gap-2">
                  <label
                    className="text-sm font-medium leading-none"
                    htmlFor="apellidos-usuario"
                  >
                    {t("ui.EditAdminUser.apellidos", {
                      defaultValue: "Apellidos",
                    })}
                  </label>
                  <Input
                    id="apellidos-usuario"
                    placeholder={t("ui.EditAdminUser.apellidosEj", {
                      defaultValue: "Ej.: Osorio García",
                    })}
                    value={apellidos}
                    onChange={(e) =>
                      cambiarNombreDelFormulario(nombres, e.target.value)
                    }
                  />
                </div>

                <FormField
                  control={control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("adminOfficeUsers.editUser.form.emailLabel", {
                          defaultValue: "Correo Electrónico*",
                        })}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t(
                            "adminOfficeUsers.editUser.form.emailPlaceholder",
                            { defaultValue: "Correo Electrónico*" },
                          )}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {id && (
                  <UsuarioDeAccesoEditable
                    userId={String(id)}
                    username={alias}
                    onCambiado={setAlias}
                  />
                )}
              </div>

              {/* ── QUÉ PUEDE HACER ──────────────────────────────────── */}
              <div>
                <p className="cg-eyebrow mb-2">
                  {t("ui.EditAdminUser.quePuedeHacer", "Qué puede hacer")}
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
                        {field.value && (
                          <p
                            className="text-xs"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {roleDisplayDescription(field.value)}
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
                  {t("ui.EditAdminUser.quePuedeVer", "Qué puede ver")}
                </p>
                {veTodoPorRol ? (
                  <div
                    className="rounded-xl border px-4 py-3 text-sm"
                    style={{
                      borderColor: "var(--hairline)",
                      background: "var(--float)",
                    }}
                  >
                    {t("ui.EditAdminUser.esteRolVe", "Este rol ve")}{" "}
                    <strong>
                      {t(
                        "ui.EditAdminUser.todaLaOperacion",
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
                            "ui.EditAdminUser.todaLaOperacion2",
                            "Toda la operación",
                          )}
                        </span>
                        <span
                          className="block text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {t(
                            "ui.EditAdminUser.todosLosClientesYTodas",
                            "Todos los clientes y todas las sedes.",
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
                            "ui.EditAdminUser.paraQuienLlevaUnasCuentas",
                            "Para quien lleva unas cuentas concretas.",
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
                                  "ui.EditAdminUser.elAlcanceDeVerdad",
                                  "El alcance de verdad: limita turnos, nómina, cobertura, visitas y puestos.",
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
                                  style={{ color: "var(--ink-soft)" }}
                                >
                                  {t(
                                    "ui.EditAdminUser.sinSedeMarcadaVeTodo",
                                    "Sin ninguna sede marcada seguirá viendo TODO.",
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

              {canEditPerms && id && (
                <GlassPanel flat className="p-4">
                  <button
                    className="flex w-full items-center justify-between text-left"
                    type="button"
                    onClick={() => setPermsOpen((v) => !v)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <IconTile size="sm">
                        <ShieldCheck />
                      </IconTile>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">
                          {t(
                            "ui.EditAdminUser.permisosIndividuales",
                            "Permisos individuales",
                          )}
                        </div>
                        <div
                          className="text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {t(
                            "ui.EditAdminUser.concedeORevoca",
                            "Concede o revoca permisos específicos para este usuario, además de su rol.",
                          )}
                        </div>
                      </div>
                    </div>
                    <span
                      className="[&_svg]:size-4"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      {permsOpen ? <ChevronDown /> : <ChevronRight />}
                    </span>
                  </button>
                  {permsOpen && (
                    <div className="mt-4 space-y-3">
                      <Input
                        placeholder={t("ui.EditAdminUserPage.buscarPermisos")}
                        value={permQuery}
                        onChange={(e) => setPermQuery(e.target.value)}
                      />
                      {selectedRoleSlug === "admin" && (
                        <div
                          className="rounded-xl border p-3 text-sm"
                          style={{
                            background:
                              "color-mix(in oklab, var(--warn) 12%, transparent)",
                            borderColor:
                              "color-mix(in oklab, var(--warn) 28%, transparent)",
                            color: "var(--warn-text)",
                          }}
                        >
                          {t(
                            "ui.EditAdminUser.esteUsuarioEsAdministrador",
                            "Este usuario es administrador. Los permisos esenciales de administración no se pueden denegar.",
                          )}
                        </div>
                      )}
                      <UserPermissionOverrides
                        deny={overrides.deny}
                        grant={overrides.grant}
                        query={permQuery}
                        rolePermissions={rolePermissions}
                        roleSlug={selectedRoleSlug}
                        onChange={setOverrides}
                      />
                    </div>
                  )}
                </GlassPanel>
              )}

              {id && (
                <GlassPanel flat className="p-4">
                  <button
                    className="flex w-full items-center justify-between text-left"
                    type="button"
                    onClick={() => setOfficeOpen((v) => !v)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <IconTile size="sm">
                        <MapPin />
                      </IconTile>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">
                          {t(
                            "ui.EditAdminUser.ubicacionDeOficinaAsistencia",
                            "Ubicación de oficina (asistencia)",
                          )}
                        </div>
                        <div
                          className="text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {t(
                            "ui.EditAdminUser.opcionalSiLaDefines",
                            "Opcional. Si la defines, el reloj de asistencia valida que el usuario marque desde su oficina.",
                          )}
                        </div>
                      </div>
                    </div>
                    <span
                      className="[&_svg]:size-4"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      {officeOpen ? <ChevronDown /> : <ChevronRight />}
                    </span>
                  </button>
                  {officeOpen && (
                    <div className="mt-4 space-y-3">
                      <div>
                        <label className="cg-eyebrow">
                          {t(
                            "ui.EditAdminUser.direccionReferencia",
                            "Dirección (referencia)",
                          )}
                        </label>
                        <Input
                          placeholder={t(
                            "ui.EditAdminUser.ejOficinaCentral",
                            "Ej. Oficina central, Av. Amazonas 123",
                          )}
                          value={office.address}
                          onChange={(e) =>
                            setOffice((o) => ({
                              ...o,
                              address: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <div>
                          <label className="cg-eyebrow">
                            {t("ui.EditAdminUser.latitud", "Latitud")}
                          </label>
                          <Input
                            placeholder="-0.1807"
                            value={office.lat}
                            onChange={(e) =>
                              setOffice((o) => ({ ...o, lat: e.target.value }))
                            }
                          />
                        </div>
                        <div>
                          <label className="cg-eyebrow">
                            {t("ui.EditAdminUser.longitud", "Longitud")}
                          </label>
                          <Input
                            placeholder="-78.4678"
                            value={office.lng}
                            onChange={(e) =>
                              setOffice((o) => ({ ...o, lng: e.target.value }))
                            }
                          />
                        </div>
                        <div>
                          <label className="cg-eyebrow">
                            {t("ui.EditAdminUser.radioM", "Radio (m)")}
                          </label>
                          <Input
                            placeholder="150"
                            value={office.radius}
                            onChange={(e) =>
                              setOffice((o) => ({
                                ...o,
                                radius: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          type="button"
                          variant="outline"
                          onClick={useCurrentLocationAsOffice}
                        >
                          {t(
                            "ui.EditAdminUser.usarMiUbicacionActual",
                            "Usar mi ubicación actual",
                          )}
                        </Button>
                        <Button
                          disabled={officeSaving}
                          size="sm"
                          type="button"
                          variant="brand"
                          onClick={() => saveOfficeLocation(false)}
                        >
                          {officeSaving
                            ? t(
                                "adminOfficeUsers.editUser.form.savingEdit",
                                "Guardando...",
                              )
                            : t(
                                "ui.EditAdminUser.guardarUbicacion",
                                "Guardar ubicación",
                              )}
                        </Button>
                        <Button
                          disabled={officeSaving}
                          size="sm"
                          type="button"
                          variant="ghost"
                          onClick={() => saveOfficeLocation(true)}
                        >
                          {t("ui.EditAdminUser.quitar", "Quitar")}
                        </Button>
                      </div>
                      <p
                        className="text-[11px]"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        {t(
                          "ui.EditAdminUser.dejalaVacia",
                          "Déjala vacía para permitir el marcaje sin geocerca. Puedes copiar las coordenadas desde Google Maps.",
                        )}
                      </p>
                    </div>
                  )}
                </GlassPanel>
              )}

              <div className="flex justify-end">
                <Button
                  disabled={formState.isSubmitting}
                  type="submit"
                  variant="brand"
                >
                  {formState.isSubmitting
                    ? id
                      ? t("adminOfficeUsers.editUser.form.savingEdit", {
                          defaultValue: "Guardando...",
                        })
                      : t("adminOfficeUsers.editUser.form.savingNew", {
                          defaultValue: "Enviando...",
                        })
                    : id
                      ? t("adminOfficeUsers.editUser.form.save", {
                          defaultValue: "Guardar",
                        })
                      : t("adminOfficeUsers.editUser.form.send", {
                          defaultValue: "Enviar",
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
