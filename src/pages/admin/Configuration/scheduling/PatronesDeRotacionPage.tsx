import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  Check,
  Loader2,
  Pencil,
  Repeat,
  Trash2,
  X,
} from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import {
  PageContainer,
  PageHeader,
  Section,
  StatusBadge,
  EmptyState,
  SkeletonCards,
  Modal,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { ApiService } from "@/services/api/apiService";

interface Patron {
  id: string;
  name: string;
  description?: string | null;
  dayShifts: number;
  nightShifts: number;
  restDays: number;
  sequence?: string | null;
  weekly?: boolean;
  isSystem?: boolean;
  tenantId?: string | null;
  archivedAt?: string | null;
  usage?: { stations: number; positions: number; assignments: number };
}

interface Uso {
  stations: Array<{ id: string; name: string }>;
  positions: Array<{ id: string; name: string; stationName: string }>;
  activeAssignments: Array<{
    id: string;
    guardName: string;
    stationName: string;
  }>;
  endedAssignments: number;
}

const tenant = () => localStorage.getItem("tenantId") || "";

/** «4-4-2», or the letters of a free sequence. */
export function formaDelPatron(
  p: Pick<Patron, "dayShifts" | "nightShifts" | "restDays" | "sequence">,
): string {
  if (p.sequence) return String(p.sequence);

  return [p.dayShifts, p.nightShifts, p.restDays]
    .filter((n, i) => i !== 1 || n > 0)
    .join("-");
}

export function enUso(p: Pick<Patron, "usage">): number {
  const u = p.usage;

  return u ? u.stations + u.positions + u.assignments : 0;
}

/**
 * Configuración › Patrones de rotación (phase 2). Patterns were only created
 * inline from station and assignment dialogs; here they can be renamed,
 * archived (no longer offered, still read by whoever uses it) and deleted when
 * nothing points at them. System patterns are shared and read-only.
 */
export default function PatronesDeRotacionPage() {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const puede = hasPermission("stationEdit");
  const [filas, setFilas] = useState<Patron[] | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [uso, setUso] = useState<{ patron: Patron; uso: Uso | null } | null>(
    null,
  );

  const cargar = useCallback(async () => {
    try {
      const r: any = await ApiService.get(
        `/tenant/${tenant()}/rotation-styles?includeArchived=1&withUsage=1`,
      );

      setFilas(Array.isArray(r) ? r : (r?.rows ?? []));
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || "Error");
      setFilas([]);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const accion = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setTrabajando(id);
    try {
      await fn();
      toast.success(ok);
      await cargar();
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || "Error");
    } finally {
      setTrabajando(null);
    }
  };

  const verUso = async (p: Patron) => {
    setUso({ patron: p, uso: null });
    try {
      const r: any = await ApiService.get(
        `/tenant/${tenant()}/rotation-style/${p.id}/usage`,
      );

      setUso({ patron: p, uso: r });
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || "Error");
      setUso(null);
    }
  };

  const propios = (filas || []).filter((p) => !p.isSystem && p.tenantId);
  const sistema = (filas || []).filter((p) => p.isSystem || !p.tenantId);

  const fila = (p: Patron) => {
    const usado = enUso(p);
    const archivado = !!p.archivedAt;
    const propio = !p.isSystem && !!p.tenantId;

    return (
      <li
        key={p.id}
        className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5"
      >
        <div className="min-w-0 flex-1">
          {editando === p.id ? (
            <input
              autoFocus
              className="cg-input cg-focus w-full max-w-xs px-2 py-1 text-sm"
              maxLength={100}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          ) : (
            <span className="text-sm font-semibold">{p.name}</span>
          )}
          <span
            className="ml-2 font-mono text-xs"
            style={{ color: "var(--ink-soft)" }}
          >
            {formaDelPatron(p)}
          </span>
          {archivado && (
            <span className="ml-2">
              <StatusBadge tone="neutral">
                {t("ui.Patrones.archivado", "Archivado")}
              </StatusBadge>
            </span>
          )}
        </div>
        <button
          className="cg-focus text-xs hover:underline"
          style={{ color: usado ? "var(--brand-text)" : "var(--ink-faint)" }}
          type="button"
          onClick={() => verUso(p)}
        >
          {usado
            ? t("ui.Patrones.enUso", {
                defaultValue:
                  "{{estaciones}} estaciones · {{plazas}} plazas · {{personas}} personas",
                estaciones: p.usage?.stations ?? 0,
                plazas: p.usage?.positions ?? 0,
                personas: p.usage?.assignments ?? 0,
              })
            : t("ui.Patrones.sinUso", "Sin uso")}
        </button>
        {propio && puede && (
          <div className="flex gap-1">
            {editando === p.id ? (
              <>
                <Button
                  disabled={!nombre.trim() || trabajando === p.id}
                  size="sm"
                  variant="brand"
                  onClick={() =>
                    accion(
                      p.id,
                      () =>
                        ApiService.put(
                          `/tenant/${tenant()}/rotation-style/${p.id}`,
                          { data: { name: nombre.trim() } },
                        ),
                      t("ui.Patrones.renombrado", "Patrón renombrado"),
                    ).then(() => setEditando(null))
                  }
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditando(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  aria-label={t("ui.Patrones.renombrar", "Renombrar")}
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditando(p.id);
                    setNombre(p.name);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  aria-label={
                    archivado
                      ? t("ui.Patrones.restaurar", "Volver a ofrecer")
                      : t("ui.Patrones.archivar", "Archivar")
                  }
                  disabled={trabajando === p.id}
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    accion(
                      p.id,
                      () =>
                        ApiService.post(
                          `/tenant/${tenant()}/rotation-style/${p.id}/archive`,
                          { data: { archived: !archivado } },
                        ),
                      archivado
                        ? t(
                            "ui.Patrones.restaurado",
                            "El patrón se vuelve a ofrecer",
                          )
                        : t(
                            "ui.Patrones.archivadoOk",
                            "Archivado: ya no se ofrece, y quien lo usa lo conserva",
                          ),
                    )
                  }
                >
                  {archivado ? (
                    <ArchiveRestore className="h-4 w-4" />
                  ) : (
                    <Archive className="h-4 w-4" />
                  )}
                </Button>
                {!usado && (
                  <Button
                    aria-label={t("ui.Patrones.borrar", "Borrar")}
                    disabled={trabajando === p.id}
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      accion(
                        p.id,
                        () =>
                          ApiService.delete(
                            `/tenant/${tenant()}/rotation-style/${p.id}`,
                          ),
                        t("ui.Patrones.borrado", "Patrón borrado"),
                      )
                    }
                  >
                    {trabajando === p.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <AppLayout>
      <SettingsLayout
        navKey="configuracion"
        title={t("ui.Patrones.titulo", "Patrones de rotación")}
      >
        <PageContainer width="narrow">
          <PageHeader
            icon={<Repeat />}
            subtitle={t(
              "ui.Patrones.subtitulo",
              "Los ciclos de trabajo y descanso. Archivar uno deja de ofrecerlo; quien ya lo usa lo conserva. Solo se borra el que nadie usa.",
            )}
            title={t("ui.Patrones.titulo", "Patrones de rotación")}
          />
          {!filas ? (
            <SkeletonCards count={2} />
          ) : (
            <>
              <Section
                icon={<Repeat />}
                title={t("ui.Patrones.deLaEmpresa", "De la empresa")}
              >
                {propios.length ? (
                  <ul
                    className="divide-y"
                    style={{ borderColor: "var(--hairline)" }}
                  >
                    {propios.map(fila)}
                  </ul>
                ) : (
                  <EmptyState
                    className="border-0 py-2"
                    description={t(
                      "ui.Patrones.vacio",
                      "Se crean al configurar el ciclo de una estación o de un vigilante.",
                    )}
                    icon={<Repeat />}
                    title={t(
                      "ui.Patrones.vacioTitulo",
                      "Aún no hay patrones propios",
                    )}
                  />
                )}
              </Section>
              {sistema.length > 0 && (
                <Section
                  icon={<Repeat />}
                  title={t(
                    "ui.Patrones.delSistema",
                    "Del sistema (compartidos)",
                  )}
                >
                  <ul
                    className="divide-y"
                    style={{ borderColor: "var(--hairline)" }}
                  >
                    {sistema.map(fila)}
                  </ul>
                </Section>
              )}
            </>
          )}
        </PageContainer>
      </SettingsLayout>
      {uso && (
        <Modal
          open
          icon={<Repeat />}
          title={uso.patron.name}
          onOpenChange={(o) => !o && setUso(null)}
        >
          {!uso.uso ? (
            <Loader2 className="animate-spin" />
          ) : (
            <div className="space-y-3 text-sm">
              {uso.uso.stations.length > 0 && (
                <div>
                  <p className="font-semibold">
                    {t("ui.Patrones.estaciones", "Estaciones")}
                  </p>
                  <p style={{ color: "var(--ink-soft)" }}>
                    {uso.uso.stations.map((s) => s.name).join(" · ")}
                  </p>
                </div>
              )}
              {uso.uso.positions.length > 0 && (
                <div>
                  <p className="font-semibold">
                    {t("ui.Patrones.plazas", "Plazas con este ciclo")}
                  </p>
                  <p style={{ color: "var(--ink-soft)" }}>
                    {uso.uso.positions
                      .map((p) => `${p.stationName} › ${p.name}`)
                      .join(" · ")}
                  </p>
                </div>
              )}
              {uso.uso.activeAssignments.length > 0 && (
                <div>
                  <p className="font-semibold">
                    {t("ui.Patrones.personas", "Personas")}
                  </p>
                  <p style={{ color: "var(--ink-soft)" }}>
                    {uso.uso.activeAssignments
                      .map((a) => `${a.guardName} (${a.stationName})`)
                      .join(" · ")}
                  </p>
                </div>
              )}
              {uso.uso.endedAssignments > 0 && (
                <p style={{ color: "var(--ink-faint)" }}>
                  {t("ui.Patrones.historial", {
                    defaultValue:
                      "Y {{count}} asignaciones terminadas que lo conservan en su historial.",
                    count: uso.uso.endedAssignments,
                  })}
                </p>
              )}
              {!uso.uso.stations.length &&
                !uso.uso.positions.length &&
                !uso.uso.activeAssignments.length &&
                !uso.uso.endedAssignments && (
                  <p>{t("ui.Patrones.sinUso", "Sin uso")}</p>
                )}
            </div>
          )}
        </Modal>
      )}
    </AppLayout>
  );
}
