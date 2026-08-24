import React from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, ChevronRight, Lock, Minus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { PERMISSIONS, groupPermissions } from "@/config/permissions";
import { formatPermissionLabel, getResourceLabel } from "@/config/permissionLabels";

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  query?: string;
  readOnly?: boolean;
  // Permissions that must stay enabled and cannot be toggled off (e.g. the admin
  // floor). Rendered as checked + disabled even when the editor is editable.
  lockedPermissions?: string[];
};

// Los tres estados del permiso no se distinguen SÓLO por color: cada uno lleva
// su propio icono y su propia etiqueta, para que se lean igual en escala de
// grises o con daltonismo.
const ESTADOS = {
  concedido: {
    icon: Check,
    etiqueta: "Concedido",
    fondo: "color-mix(in oklab, var(--ok) 10%, transparent)",
    borde: "color-mix(in oklab, var(--ok) 28%, transparent)",
    tinta: "var(--ok-text)",
  },
  obligatorio: {
    icon: Lock,
    etiqueta: "Obligatorio",
    fondo: "color-mix(in oklab, var(--warn) 12%, transparent)",
    borde: "color-mix(in oklab, var(--warn) 30%, transparent)",
    tinta: "var(--warn-text)",
  },
  heredado: {
    icon: Minus,
    etiqueta: "Sin conceder",
    fondo: "transparent",
    borde: "var(--hairline)",
    tinta: "var(--ink-faint)",
  },
} as const;

export default function PermissionsEditor({ value, onChange, query = "", readOnly = false, lockedPermissions = [] }: Props) {
  // Re-render (and re-filter) when the chosen language changes: labels come
  // from locale-aware helpers, not static maps.
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const lockedSet = React.useMemo(() => new Set(lockedPermissions), [lockedPermissions]);
  const isLocked = (p: string) => lockedSet.has(p);
  const grouped = React.useMemo(() => groupPermissions(PERMISSIONS), []);
  const filteredGrouped = React.useMemo(() => {
    if (!query) return grouped;
    const q = query.toLowerCase();
    const out: Record<string, string[]> = {};
    for (const k of Object.keys(grouped)) {
      const items = grouped[k].filter((p) => {
        const key = p.toLowerCase();
        const label = formatPermissionLabel(p).toLowerCase();
        const groupLabel = getResourceLabel(k).toLowerCase();
        return key.includes(q) || label.includes(q) || groupLabel.includes(q);
      });
      if (items.length) out[k] = items;
    }
    return out;
  }, [grouped, query, lang]);

  // ocultar grupos específicos (no mostrar en la UI)
  const HIDDEN_GROUPS = React.useMemo(() => new Set(["tenant", "plan"]), [] as unknown as string[]);

  const toggle = (p: string, checked: boolean) => {
    if (readOnly || isLocked(p)) return;
    if (checked) onChange(Array.from(new Set([...value, p])));
    else onChange(value.filter((x) => x !== p));
  };

  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const toggleCollapse = (g: string) => setCollapsed((s) => ({ ...s, [g]: !s[g] }));

  return (
    <div className="space-y-4">
      {readOnly && (
        <div
          className="flex items-start gap-2 rounded-xl border p-3 text-sm"
          style={{
            borderColor: "color-mix(in oklab, var(--warn) 30%, transparent)",
            background: "color-mix(in oklab, var(--warn) 12%, transparent)",
            color: "var(--warn-text)",
          }}
        >
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t("ui.PermissionsEditor.esteRolEstaBloqueadoNo", "Este rol está bloqueado. No se pueden modificar los permisos predeterminados.")}</span>
        </div>
      )}

      {/* Leyenda: los tres estados, con su icono, antes de la rejilla. */}
      <div className="flex flex-wrap items-center gap-4 text-xs" style={{ color: "var(--ink-soft)" }}>
        {(Object.keys(ESTADOS) as Array<keyof typeof ESTADOS>).map((k) => {
          const e = ESTADOS[k];
          const Icono = e.icon;
          return (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span
                className="flex h-4 w-4 items-center justify-center rounded-full border [&_svg]:size-2.5"
                style={{ background: e.fondo, borderColor: e.borde, color: e.tinta }}
              >
                <Icono />
              </span>
              {e.etiqueta}
            </span>
          );
        })}
      </div>

      {Object.keys(filteredGrouped).length === 0 ? (
        <div className="text-sm" style={{ color: "var(--ink-soft)" }}>No se encontraron permisos</div>
      ) : (
        Object.keys(filteredGrouped)
          .filter((g) => !HIDDEN_GROUPS.has(g))
          .map((group) => {
          const items = filteredGrouped[group];
          const allSelected = items.every((p) => value.includes(p));
          const concedidos = items.filter((p) => value.includes(p) || isLocked(p)).length;
          const abierto = !collapsed[group];
          return (
            /* En un map(): panel PLANO, sin desenfoque. */
            <div key={group} className="glass-flat p-4">
              <div className="flex items-center justify-between gap-3">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleCollapse(group)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleCollapse(group);
                    }
                  }}
                  className="cg-focus min-w-0 cursor-pointer rounded-lg"
                  aria-expanded={abierto}
                >
                  <div className="flex items-center gap-2">
                    {abierto ? (
                      <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "var(--brand-text)" }} />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--ink-faint)" }} />
                    )}
                    <div className="truncate text-sm font-semibold">{getResourceLabel(group)}</div>
                    <div className="shrink-0 text-xs tabular-nums" style={{ color: "var(--ink-faint)" }}>
                      {concedidos} de {items.length}
                    </div>
                  </div>
                </div>

                <label className="flex shrink-0 items-center gap-2 text-sm">
                  <span className="text-sm" style={{ color: "var(--ink-soft)" }}>Seleccionar todo</span>
                  <Checkbox
                    checked={allSelected}
                    disabled={readOnly}
                    onCheckedChange={(v) => {
                      if (readOnly) return;
                      if (v) onChange(Array.from(new Set([...value, ...items])));
                      // keep locked permissions selected when deselecting a group
                      else onChange(value.filter((x) => !items.includes(x) || isLocked(x)));
                    }}
                  />
                </label>
              </div>
              {abierto && (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((p) => {
                    const bloqueado = isLocked(p);
                    const concedido = value.includes(p) || bloqueado;
                    const estado = bloqueado ? ESTADOS.obligatorio : concedido ? ESTADOS.concedido : ESTADOS.heredado;
                    const Icono = estado.icon;
                    return (
                      <div
                        key={p}
                        className="flex items-start gap-3 rounded-xl border p-2.5 transition-colors"
                        style={{ background: estado.fondo, borderColor: estado.borde }}
                        title={bloqueado ? "Requerido para el acceso de administrador" : undefined}
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={concedido}
                          disabled={readOnly || bloqueado}
                          onCheckedChange={(v) => toggle(p, Boolean(v))}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-sm">
                            <Icono className="h-3.5 w-3.5 shrink-0" style={{ color: estado.tinta }} />
                            <span className="truncate">{formatPermissionLabel(p)}</span>
                          </div>
                          <div className="truncate text-xs" style={{ color: "var(--ink-faint)" }}>{p}</div>
                          {bloqueado && (
                            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: estado.tinta }}>
                              Obligatorio
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
