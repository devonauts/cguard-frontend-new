/**
 * Detalle de usuario administrativo — mismo lenguaje visual que el detalle de
 * cliente/vigilante: breadcrumb + header card (identidad) + pestañas horizontales.
 * Pestañas: Perfil (vista + Editar) y Permisos (rol + resumen de overrides +
 * gestionar). La edición real (datos y overrides) vive en el formulario de
 * edición existente para no duplicar lógica sensible.
 */
import type { LucideIcon } from "lucide-react";
import type { AdminUser, TenantUser } from "./adminUserTypes";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ChevronRight,
  Clock,
  Pencil,
  Mail,
  Phone,
  MapPin,
  ShieldCheck,
  IdCard,
  UserCog,
  KeyRound,
  CheckCircle2,
  XCircle,
  ShieldX,
} from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import userService from "@/lib/api/userService";
import { Button } from "@/components/ui/button";
import {
  Section,
  EmptyState,
  Field,
  GlassPanel,
  StatusBadge,
  SkeletonCards,
  SmartImage,
} from "@/components/kit";
import RegistroDeIntentos from "@/components/RegistroDeIntentos";
import HorarioDeOficina from "./HorarioDeOficina";
import { nombreDeRolRef } from "./nombreDeRol";
import { UsuarioDeAccesoEditable } from "@/components/usuarioDeAcceso/UsuarioDeAccesoEditable";
import { usePermissions } from "@/hooks/usePermissions";
import { localeActual } from "@/lib/localeActual";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";
const photoOf = (u: AdminUser | null): string | null => {
  const a = u?.avatars ?? u?.avatar ?? u?.profileImage;
  const f = Array.isArray(a) ? a[0] : a;

  return (
    f?.downloadUrl ||
    f?.publicUrl ||
    (typeof f === "string" ? f : null) ||
    u?.photoUrl ||
    null
  );
};

// `labelKey` viaja en la constante y se traduce al pintar: un t() aquí se
// evaluaría al cargar el módulo y dejaría el texto congelado.
const STATUS_META: Record<
  string,
  { label: string; labelKey: string; tone: "ok" | "warn" | "neutral" }
> = {
  active: {
    label: "Activo",
    labelKey: "adminOfficeUsers.statuses.active",
    tone: "ok",
  },
  invited: {
    label: "Invitación pendiente",
    labelKey: "guards.profile.access.statusPending",
    tone: "warn",
  },
  pending: {
    label: "Invitación pendiente",
    labelKey: "guards.profile.access.statusPending",
    tone: "warn",
  },
  archived: {
    label: "Archivado",
    labelKey: "adminOfficeUsers.statuses.archived",
    tone: "neutral",
  },
};

const fmtDate = (v: string | number | Date | null | undefined) =>
  v
    ? new Date(v).toLocaleDateString(localeActual(), {
        timeZone: zonaDeLaEmpresa(),
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

export default function AdminUserDetailPage() {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"perfil" | "horario" | "permisos" | "logs">("perfil");

  useEffect(() => {
    if (!id) return;
    let mounted = true;

    setLoading(true);
    userService
      .fetchUser(id)
      .then((res: (AdminUser & { data?: AdminUser }) | null) => {
        if (mounted) setUser((res?.data ?? res) || null);
      })
      .catch(() => {
        if (mounted) setUser(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id]);

  const tenantId =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("tenantId")
      : null;
  const tenantEntry = useMemo(() => {
    if (!Array.isArray(user?.tenants)) return null;

    return (
      user.tenants.find(
        (t: TenantUser) =>
          t.tenantId === tenantId || (t.tenant && t.tenant.id === tenantId),
      ) ||
      user.tenants[0] ||
      null
    );
  }, [user, tenantId]);

  const name =
    user?.fullName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.name ||
    user?.email ||
    t("ui.AdminUserDetailPage.usuario", "Usuario");
  const photo = photoOf(user);
  const nm = String(name || "?");
  const statusKey = String(user?.status || "active").toLowerCase();
  const status = STATUS_META[statusKey] || STATUS_META.active;

  const roleRef = (() => {
    const r = tenantEntry?.roles;
    const first = Array.isArray(r)
      ? r[0]
      : r ||
        tenantEntry?.role ||
        user?.role ||
        (Array.isArray(user?.roles) ? user.roles[0] : user?.roles);

    return first || null;
  })();
  const roleName = nombreDeRolRef(roleRef, t);

  const overrides = (() => {
    const ov = tenantEntry?.permissionOverrides;

    return {
      grant: Array.isArray(ov?.grant) ? ov.grant : [],
      deny: Array.isArray(ov?.deny) ? ov.deny : [],
    };
  })();

  const isSupervisor = String(
    (roleRef && typeof roleRef === "object"
      ? roleRef.slug || roleRef.name || roleRef.id
      : roleRef) || "",
  )
    .toLowerCase()
    .includes("supervisor");

  const TABS: Array<{
    id: "perfil" | "horario" | "permisos" | "logs";
    label: string;
    icon: LucideIcon;
  }> = [
    {
      id: "perfil",
      label: t("ui.AdminUserDetailPage.perfil", "Perfil"),
      icon: IdCard,
    },
    /* Su horario de oficina vive en SU ficha (fase 2): antes sólo se veía y
       se cambiaba desde Programador › Horario › «Todo el personal». */
    {
      id: "horario",
      label: t("ui.HorarioDeOficina.pestana", "Horario"),
      icon: Clock,
    },
    {
      id: "permisos",
      label: t("ui.AdminUserDetailPage.permisos", "Permisos"),
      icon: KeyRound,
    },
    /* Los fichajes que el reloj le RECHAZÓ. El personal de oficina también
       ficha (`staffShifts`), así que también se le puede quedar en la puerta.
       Misma pantalla que en la ficha del vigilante y en la del supervisor:
       esta ficha no usa rutas, pero el componente es el mismo. */
    {
      id: "logs",
      label: t("logs.tab", { defaultValue: "Registros" }),
      icon: ShieldX,
    },
  ];

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-[1440px] space-y-4 px-4 py-4">
        {/* Breadcrumb */}
        <div
          className="flex min-w-0 items-center gap-1.5 text-sm"
          style={{ color: "var(--ink-soft)" }}
        >
          <Link className="shrink-0 hover:underline" to="/back-office">
            {t(
              "ui.AdminUserDetailPage.usuariosAdministrativos",
              "Usuarios administrativos",
            )}
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          <Link
            className="max-w-[180px] truncate hover:underline sm:max-w-[240px]"
            title={name}
            to={`/back-office/${id}`}
          >
            {name}
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          <span className="shrink-0 font-medium text-foreground">
            {TABS.find((x) => x.id === tab)?.label ??
              t("ui.AdminUserDetailPage.perfil", "Perfil")}
          </span>
        </div>

        {/* Header card */}
        <GlassPanel className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <SmartImage
                alt=""
                className="h-16 w-16 shrink-0 border"
                fallback={
                  <span
                    className="grid h-full w-full place-items-center text-2xl font-bold"
                    style={{
                      background: "var(--brand-wash)",
                      color: "var(--brand-text)",
                    }}
                  >
                    {nm.charAt(0).toUpperCase()}
                  </span>
                }
                rounded="rounded-2xl"
                src={photo}
                style={{ borderColor: "var(--hairline)" }}
              />
              <div className="min-w-0">
                <h1 className="font-display truncate text-2xl font-bold tracking-tight text-foreground">
                  {name}
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <StatusBadge dot={false} tone={status.tone}>
                    <ShieldCheck className="h-3 w-3" />{" "}
                    {t(status.labelKey, status.label)}
                  </StatusBadge>
                  {roleName && (
                    <StatusBadge dot={false} tone="brand">
                      {roleName}
                    </StatusBadge>
                  )}
                </div>
                <div
                  className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {user?.email && (
                    <span className="inline-flex items-center gap-1.5 truncate">
                      <Mail className="h-3.5 w-3.5" /> {user.email}
                    </span>
                  )}
                  {(user?.phoneNumber || user?.phone) && (
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />{" "}
                      {user.phoneNumber || user.phone}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {id && (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {isSupervisor && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/supervisors/${id}`)}
                  >
                    <UserCog className="mr-1 h-4 w-4" />{" "}
                    {t(
                      "adminOfficeUsers.rowActions.supervisorProfile",
                      "Perfil de supervisor",
                    )}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="brand"
                  onClick={() => navigate(`/back-office/edit/${id}`)}
                >
                  <Pencil className="mr-1 h-4 w-4" />{" "}
                  {t("actions.edit", "Editar")}
                </Button>
              </div>
            )}
          </div>
        </GlassPanel>

        {/* Pestañas */}
        <div className="overflow-x-auto">
          <nav
            className="flex min-w-max items-center gap-1 border-b"
            style={{ borderColor: "var(--hairline)" }}
          >
            {TABS.map((it) => {
              const active = tab === it.id;
              const Icon = it.icon;

              return (
                <button
                  key={it.id}
                  className="cg-focus relative flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2.5 text-sm font-semibold transition-colors"
                  style={{
                    color: active ? "var(--brand-text)" : "var(--ink-soft)",
                  }}
                  onClick={() => setTab(it.id)}
                >
                  <Icon className="h-4 w-4" /> {it.label}
                  {active && (
                    <span
                      className="absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                      style={{
                        background: "var(--brand)",
                        boxShadow: "0 0 12px 0 var(--brand-glow)",
                      }}
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        {loading ? (
          <SkeletonCards count={2} />
        ) : !user ? (
          <EmptyState
            description={t("ui.AdminUserDetailPage.noSePudoCargarEste")}
            icon={<UserCog />}
            title={t("ui.AdminUserDetailPage.usuarioNoEncontrado")}
          />
        ) : tab === "horario" ? (
          <HorarioDeOficina name={name} userId={String(user.id)} />
        ) : tab === "logs" ? (
          <RegistroDeIntentos userId={user?.id ? String(user.id) : null} />
        ) : tab === "perfil" ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Section
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/back-office/edit/${id}`)}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />{" "}
                    {t(
                      "ui.AdminUserDetail.editarInformacion",
                      "Editar información",
                    )}
                  </Button>
                }
                icon={<IdCard />}
                title={t(
                  "ui.AdminUserDetail.informacionGeneral",
                  "Información general",
                )}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={t("comun.nombreCompleto")} value={name} />
                  <Field
                    label={t(
                      "ui.AdminUserDetail.correoElectronico",
                      "Correo electrónico",
                    )}
                    value={user.email}
                  />
                  {/* Se cambia aparte (efecto inmediato); el correo sigue
                      siendo obligatorio para el personal de oficina. */}
                  <UsuarioDeAccesoEditable
                    puedeEditar={hasPermission("userEdit")}
                    userId={user.id ? String(user.id) : null}
                    username={user.username}
                    onCambiado={(username) =>
                      setUser((prev) => (prev ? { ...prev, username } : prev))
                    }
                  />
                  <Field
                    label={t("ui.AdminUserDetail.telefono", "Teléfono")}
                    value={user.phoneNumber || user.phone}
                  />
                  <Field
                    label={t("ui.AdminUserDetail.rolDeAcceso", "Rol de acceso")}
                    value={roleName}
                  />
                  <Field
                    label={t("ui.AdminUserDetailPage.miembroDesde")}
                    value={fmtDate(user.createdAt)}
                  />
                  <Field
                    label={t("comun.estado")}
                    value={t(status.labelKey, status.label)}
                  />
                </div>
              </Section>
            </div>
            <div>
              <Section
                icon={<MapPin />}
                title={t(
                  "ui.AdminUserDetail.ubicacionDeOficina",
                  "Ubicación de oficina",
                )}
              >
                {user.officeAddress ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-1.5">
                      <MapPin
                        className="mt-0.5 h-3.5 w-3.5"
                        style={{ color: "var(--brand-text)" }}
                      />{" "}
                      <span>{user.officeAddress}</span>
                    </div>
                    {user.officeGeofenceRadiusM != null && (
                      <div
                        className="text-xs"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {t("ui.AdminUserDetailPage.geocercaM", {
                          defaultValue: "Geocerca: {{m}} m",
                          m: user.officeGeofenceRadiusM,
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                    {t(
                      "ui.AdminUserDetail.sinUbicacionDeOficinaConfigurada",
                      "Sin ubicación de oficina configurada.",
                    )}
                  </p>
                )}
              </Section>
            </div>
          </div>
        ) : (
          <Section
            action={
              <Button
                size="sm"
                variant="brand"
                onClick={() => navigate(`/back-office/edit/${id}`)}
              >
                <KeyRound className="mr-1.5 h-3.5 w-3.5" />{" "}
                {t(
                  "ui.AdminUserDetailPage.gestionarPermisos",
                  "Gestionar permisos",
                )}
              </Button>
            }
            icon={<KeyRound />}
            title={t("ui.AdminUserDetailPage.permisos", "Permisos")}
          >
            <div className="space-y-4">
              <div className="glass-sunken px-3 py-2.5 text-sm">
                {t("ui.AdminUserDetailPage.rolBase", "Rol base:")}{" "}
                <span className="font-semibold text-foreground">
                  {roleName || "—"}
                </span>
                .{" "}
                {t(
                  "ui.AdminUserDetailPage.permisosSeHeredan",
                  "Los permisos se heredan del rol y pueden ajustarse por usuario.",
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <GlassPanel flat className="p-4">
                  <div
                    className="flex items-center gap-2 text-sm font-semibold"
                    style={{ color: "var(--ok-text)" }}
                  >
                    <CheckCircle2 className="h-4 w-4" />{" "}
                    {t("ui.AdminUserDetailPage.concedidosN", {
                      defaultValue: "Concedidos ({{n}})",
                      n: overrides.grant.length,
                    })}
                  </div>
                  {overrides.grant.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {overrides.grant.slice(0, 12).map((p: string) => (
                        <span
                          key={p}
                          className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                          style={{
                            background:
                              "color-mix(in oklab, var(--ok) 14%, transparent)",
                            color: "var(--ok-text)",
                          }}
                        >
                          {p}
                        </span>
                      ))}
                      {overrides.grant.length > 12 && (
                        <span
                          className="text-[11px]"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          {t("ui.AdminUserDetailPage.masN", {
                            defaultValue: "+{{n}} más",
                            n: overrides.grant.length - 12,
                          })}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p
                      className="mt-1 text-xs"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {t("ui.AdminUserDetailPage.sinPermisosAdicionalesAlRol")}
                    </p>
                  )}
                </GlassPanel>
                <GlassPanel flat className="p-4">
                  <div
                    className="flex items-center gap-2 text-sm font-semibold"
                    style={{ color: "var(--bad-text)" }}
                  >
                    <XCircle className="h-4 w-4" />{" "}
                    {t("ui.AdminUserDetailPage.denegadosN", {
                      defaultValue: "Denegados ({{n}})",
                      n: overrides.deny.length,
                    })}
                  </div>
                  {overrides.deny.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {overrides.deny.slice(0, 12).map((p: string) => (
                        <span
                          key={p}
                          className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                          style={{
                            background:
                              "color-mix(in oklab, var(--bad) 14%, transparent)",
                            color: "var(--bad-text)",
                          }}
                        >
                          {p}
                        </span>
                      ))}
                      {overrides.deny.length > 12 && (
                        <span
                          className="text-[11px]"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          {t("ui.AdminUserDetailPage.masN", {
                            defaultValue: "+{{n}} más",
                            n: overrides.deny.length - 12,
                          })}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p
                      className="mt-1 text-xs"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {t(
                        "ui.AdminUserDetail.ningunPermisoDelRolFue",
                        "Ningún permiso del rol fue restringido.",
                      )}
                    </p>
                  )}
                </GlassPanel>
              </div>
            </div>
          </Section>
        )}
      </div>
    </AppLayout>
  );
}
