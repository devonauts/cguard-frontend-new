/**
 * Vista de tarjetas de usuarios administrativos (toggle Cards ⇄ Lista), al mismo
 * estilo que Clientes/Vigilantes. Cada tarjeta: avatar (inicial con color estable),
 * nombre → detalle, estado, correo y sus roles. El menú de acciones se inyecta
 * desde la página (mismos handlers que la tabla) según el estado del usuario.
 */
import { useTranslation } from "react-i18next";
import {
  EllipsisVertical,
  LogIn,
  Mail,
  ShieldCheck,
  UserCog,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  StatusBadge,
  SkeletonCards,
  EmptyState,
  GlassPanel,
  SmartImage,
} from "@/components/kit";

export type AdminUserCardAction = {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

type RoleLike = string | { name?: string; role?: string };
type PhotoLike = string | { downloadUrl?: string; publicUrl?: string };

/** Loose administrative-user row as returned by the tenant-user list endpoint. */
export interface AdminUserRow {
  id?: string;
  _id?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  /** Usuario para entrar (alias). */
  username?: string;
  avatars?: PhotoLike | PhotoLike[];
  avatar?: PhotoLike | PhotoLike[];
  profileImage?: PhotoLike | PhotoLike[];
  photoUrl?: string;
  roles?: RoleLike | RoleLike[];
  role?: RoleLike | RoleLike[];
  _rolesDisplay?: string;
  status?: string;
  active?: boolean;
  raw?: { id?: string; [key: string]: unknown };
  [key: string]: unknown;
}

function nameOf(u: AdminUserRow): string {
  return (
    u.fullName ||
    [u.firstName, u.lastName].filter(Boolean).join(" ") ||
    u.name ||
    u.email ||
    "—"
  );
}
function photoOf(u: AdminUserRow): string | null {
  const a = u.avatars ?? u.avatar ?? u.profileImage;
  const f = Array.isArray(a) ? a[0] : a;
  const fromFile =
    typeof f === "string" ? f : f?.downloadUrl || f?.publicUrl || null;

  return fromFile || u.photoUrl || null;
}
function rolesOf(u: AdminUserRow): string {
  if (u._rolesDisplay) return u._rolesDisplay;
  const roles = u.roles ?? u.role ?? [];

  if (Array.isArray(roles))
    return roles
      .map((r: RoleLike) =>
        typeof r === "string" ? r : (r && (r.name || r.role)) || "",
      )
      .filter(Boolean)
      .join(", ");
  if (typeof roles === "string") return roles;
  if (roles && typeof roles === "object") return roles.name || roles.role || "";

  return "";
}
function statusOf(u: AdminUserRow): {
  label: string;
  labelKey: string;
  tone: "ok" | "warn" | "bad" | "neutral";
} {
  const s = (u.status || "").toString().toLowerCase();

  if (s === "archived" || s === "archivado")
    return { label: "Archivado", labelKey: "adminOfficeUsers.statuses.archived", tone: "bad" };
  if (s === "invited" || s === "pending")
    return { label: "Pendiente", labelKey: "adminOfficeUsers.statuses.pending", tone: "warn" };
  if (u.active === false)
    return { label: "Inactivo", labelKey: "adminOfficeUsers.statuses.inactive", tone: "neutral" };

  return { label: "Activo", labelKey: "adminOfficeUsers.statuses.active", tone: "ok" };
}

export default function AdminUserCardsGrid({
  users,
  loading,
  selectedIds,
  canSelect,
  onSelect,
  onOpen,
  actions,
}: {
  users: AdminUserRow[];
  loading: boolean;
  selectedIds: string[];
  canSelect: (u: AdminUserRow) => boolean;
  onSelect: (id: string, checked: boolean) => void;
  onOpen: (u: AdminUserRow) => void;
  actions: (u: AdminUserRow) => AdminUserCardAction[];
}) {
  const { t } = useTranslation();

  if (loading)
    return (
      <SkeletonCards
        className="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        count={8}
      />
    );
  if (!users.length) {
    return (
      <EmptyState
        description={t("ui.AdminUserCardsGrid.daDeAltaAlPrimerUsuario", "Da de alta al primer usuario de oficina con «Nuevo usuario».")}
        icon={<UserCog />}
        title={t("billing.noUsers", "Sin usuarios")}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {users.map((u, i) => {
        const id = String(u.id || u._id || u.raw?.id || "");
        const name = nameOf(u);
        const st = statusOf(u);
        const roles = rolesOf(u);
        const photo = photoOf(u);
        const acts = actions(u).filter((a) => !a.disabled);

        return (
          <GlassPanel
            key={id || i}
            flat
            hover
            className="cg-focus group relative flex cursor-pointer flex-col p-4 animate-in fade-in slide-in-from-bottom-2"
            role="button"
            style={{
              animationDelay: `${Math.min(i, 12) * 30}ms`,
              animationFillMode: "backwards",
            }}
            tabIndex={0}
            onClick={() => onOpen(u)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onOpen(u);
            }}
          >
            <div className="flex items-start gap-3">
              <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  aria-label={t("ui.AdminUserCardsGrid.seleccionarNombre", { defaultValue: "Seleccionar {{name}}", name })}
                  checked={selectedIds.includes(id)}
                  disabled={!canSelect(u)}
                  onCheckedChange={(v) => onSelect(id, Boolean(v))}
                />
              </div>
              <SmartImage
                alt={name}
                className="h-12 w-12 shrink-0 border"
                fallback={
                  <span
                    className="grid h-full w-full place-items-center text-lg font-bold"
                    style={{
                      background: "var(--brand-wash)",
                      color: "var(--brand-text)",
                    }}
                  >
                    {name.charAt(0).toUpperCase()}
                  </span>
                }
                rounded="rounded-full"
                src={photo}
                style={{ borderColor: "var(--hairline)" }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold leading-tight">{name}</p>
                <div className="mt-1">
                  <StatusBadge tone={st.tone}>{t(st.labelKey, st.label)}</StatusBadge>
                </div>
              </div>
              {acts.length > 0 && (
                <div onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        className="h-8 w-8 shrink-0"
                        size="icon"
                        variant="ghost"
                      >
                        <EllipsisVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      {acts.map((a) => (
                        <DropdownMenuItem
                          key={a.label}
                          style={
                            a.destructive
                              ? { color: "var(--bad-text)" }
                              : undefined
                          }
                          onClick={a.onClick}
                        >
                          {a.icon}
                          <span className={a.icon ? "ml-2" : undefined}>
                            {a.label}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>

            <div
              className="mt-3 space-y-1 text-sm"
              style={{ color: "var(--ink-soft)" }}
            >
              {u.email && (
                <p className="flex items-center gap-1.5 truncate">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{u.email}</span>
                </p>
              )}
              {u.username && (
                <p
                  className="flex items-center gap-1.5 truncate"
                  title={t("usuarioDeAcceso.etiqueta", "Usuario para entrar")}
                >
                  <LogIn className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate font-mono">{u.username}</span>
                </p>
              )}
            </div>

            <div
              className="mt-3 flex items-center gap-1.5 border-t pt-3 text-sm"
              style={{
                borderColor: "var(--hairline)",
                color: "var(--ink-soft)",
              }}
            >
              <ShieldCheck
                className="h-4 w-4 shrink-0"
                style={{ color: "var(--brand-text)" }}
              />
              {roles ? (
                <span className="truncate capitalize text-foreground">
                  {roles}
                </span>
              ) : (
                <span>{t("ui.AdminUserCardsGrid.sinRol", "Sin rol")}</span>
              )}
            </div>
          </GlassPanel>
        );
      })}
    </div>
  );
}
