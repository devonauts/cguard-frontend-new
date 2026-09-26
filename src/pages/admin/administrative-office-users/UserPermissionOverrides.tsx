import React from "react";
import { useTranslation } from "react-i18next";

import {
  PERMISSIONS,
  groupPermissions,
  ADMIN_FLOOR_PERMISSIONS,
} from "@/config/permissions";
import {
  formatPermissionLabel,
  getResourceLabel,
} from "@/config/permissionLabels";
import { GlassPanel, EmptyState } from "@/components/kit";

export type Overrides = { grant: string[]; deny: string[] };

type Props = {
  // Permissions the user inherits from their selected role(s).
  rolePermissions: string[];
  // Slug of the selected role — used to lock the admin floor.
  roleSlug?: string;
  grant: string[];
  deny: string[];
  onChange: (next: Overrides) => void;
  query?: string;
  disabled?: boolean;
};

const HIDDEN_GROUPS = new Set(["tenant", "plan"]);

export default function UserPermissionOverrides({
  rolePermissions,
  roleSlug,
  grant,
  deny,
  onChange,
  query = "",
  disabled = false,
}: Props) {
  const { t } = useTranslation();
  const inherited = React.useMemo(
    () => new Set(rolePermissions),
    [rolePermissions],
  );
  const grantSet = React.useMemo(() => new Set(grant), [grant]);
  const denySet = React.useMemo(() => new Set(deny), [deny]);
  const isAdmin = String(roleSlug || "").toLowerCase() === "admin";
  const isFloor = (p: string) => isAdmin && ADMIN_FLOOR_PERMISSIONS.includes(p);

  const grouped = React.useMemo(() => groupPermissions(PERMISSIONS), []);
  const filtered = React.useMemo(() => {
    if (!query) return grouped;
    const q = query.toLowerCase();
    const out: Record<string, string[]> = {};

    for (const k of Object.keys(grouped)) {
      const items = grouped[k].filter((p) => {
        const label = formatPermissionLabel(p).toLowerCase();
        const groupLabel = getResourceLabel(k).toLowerCase();

        return (
          p.toLowerCase().includes(q) ||
          label.includes(q) ||
          groupLabel.includes(q)
        );
      });

      if (items.length) out[k] = items;
    }

    return out;
  }, [grouped, query]);

  // Cycle: inherited → grant → deny → inherited. Floor perms can't be denied.
  const cycle = (p: string) => {
    if (disabled) return;
    const nextGrant = new Set(grantSet);
    const nextDeny = new Set(denySet);

    if (grantSet.has(p)) {
      nextGrant.delete(p);
      if (!isFloor(p)) nextDeny.add(p); // grant → deny (skip for floor)
    } else if (denySet.has(p)) {
      nextDeny.delete(p); // deny → inherited
    } else {
      nextGrant.add(p); // inherited → grant
    }
    onChange({ grant: Array.from(nextGrant), deny: Array.from(nextDeny) });
  };

  /** El tono sale de los semánticos del sistema: nunca de un color escrito a mano. */
  const stateOf = (
    p: string,
  ): { label: string; style: React.CSSProperties } => {
    const tint = (token: string) => ({
      background: `color-mix(in oklab, var(--${token}) 14%, transparent)`,
      borderColor: `color-mix(in oklab, var(--${token}) 32%, transparent)`,
      color: `var(--${token}-text)`,
    });

    if (denySet.has(p))
      return { label: t("ui.UserPermissionOverrides.denegado", "Denegado"), style: tint("bad") };
    if (grantSet.has(p))
      return { label: t("ui.UserPermissionOverrides.concedido", "Concedido"), style: tint("ok") };
    if (isFloor(p))
      return { label: t("ui.UserPermissionOverrides.obligatorio", "Obligatorio"), style: tint("warn") };

    return inherited.has(p)
      ? {
          label: t("ui.UserPermissionOverrides.heredadoSi", "Heredado ✓"),
          style: {
            background: "var(--glass-sunken)",
            borderColor: "var(--hairline)",
            color: "var(--ink-soft)",
          },
        }
      : {
          label: t("ui.UserPermissionOverrides.heredadoNo", "Heredado ✗"),
          style: {
            background: "transparent",
            borderColor: "var(--hairline)",
            color: "var(--ink-faint)",
          },
        };
  };

  return (
    <div className="space-y-4">
      <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
        {t(
          "ui.UserPermissionOverrides.hazClicEnUnPermiso",
          "Haz clic en un permiso para alternar entre heredado del rol, concedido (+) y denegado (−). Lo denegado tiene prioridad sobre el rol.",
        )}
      </p>
      {Object.keys(filtered).length === 0 ? (
        <EmptyState
          description={t(
            "ui.UserPermissionOverrides.pruebaConOtroTextoDe",
            "Prueba con otro texto de búsqueda.",
          )}
          title={t(
            "ui.PermissionsEditor.noSeEncontraronPermisos",
            "No se encontraron permisos",
          )}
        />
      ) : (
        Object.keys(filtered)
          .filter((g) => !HIDDEN_GROUPS.has(g))
          .map((group) => (
            <GlassPanel key={group} flat className="p-4">
              <div className="mb-3 text-sm font-semibold tracking-tight">
                {getResourceLabel(group)}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {filtered[group].map((p) => {
                  const st = stateOf(p);

                  return (
                    <button
                      key={p}
                      className={
                        "cg-focus flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors " +
                        (disabled ? "cursor-not-allowed opacity-60" : "")
                      }
                      disabled={disabled}
                      style={{
                        borderColor: "var(--hairline)",
                        background: "transparent",
                      }}
                      title={
                        isFloor(p)
                          ? t(
                              "ui.UserPermissionOverrides.requeridoAdmin",
                              "Requerido para el acceso de administrador (no se puede denegar)",
                            )
                          : p
                      }
                      type="button"
                      onClick={() => cycle(p)}
                      onMouseEnter={(e) => {
                        if (disabled) return;
                        e.currentTarget.style.background = "var(--brand-wash)";
                        e.currentTarget.style.borderColor = "var(--brand-line)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.borderColor = "var(--hairline)";
                      }}
                    >
                      <span className="min-w-0 truncate text-sm">
                        {formatPermissionLabel(p)}
                      </span>
                      <span
                        className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                        style={st.style}
                      >
                        {st.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </GlassPanel>
          ))
      )}
    </div>
  );
}
