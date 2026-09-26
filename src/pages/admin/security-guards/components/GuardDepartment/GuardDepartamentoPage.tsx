import type { GuardDetail } from "../../guardDetailTypes";

import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { Building2, UserCircle2, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import AppLayout from "@/layouts/app-layout";
import GuardsLayout from "@/layouts/GuardsLayout";
import { useRegistroDeFicha } from "@/layouts/FichaPersona";
import departmentService, { Department } from "@/lib/api/departmentService";
import {
  PageContainer,
  PageHeader,
  Section,
  EmptyState,
  SkeletonCards,
  StatusBadge,
  IconTile,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";

export default function GuardDepartamentoPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("settingsEdit");

  const [guard, setGuard] = useState<GuardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [current, setCurrent] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [pendingId, setPendingId] = useState<string>("");

  // securityGuard.guardId is the USER id — department membership hangs off tenantUsers.
  const userId: string | undefined = guard?.guardId;

  // El registro del vigilante lo trae la ruta padre; aquí sólo queda pedir el
  // catálogo de departamentos, que es lo propio de esta pestaña.
  const { registro } = useRegistroDeFicha(id);

  useEffect(() => {
    if (!id) return;
    // La lectura de arriba falló: hay que soltar el giro o la pestaña se queda
    // cargando para siempre (`loading` arranca en true).
    if (registro === null) {
      setLoading(false);

      return;
    }
    if (!registro) return;
    let mounted = true;

    setLoading(true);
    Promise.all([
      Promise.resolve(registro as GuardDetail & { guard?: GuardDetail }).then(
        (data) => {
          const g = data.guard ?? data;

          return {
            ...g,
            fullName:
              g.fullName ?? `${g.firstName ?? ""} ${g.lastName ?? ""}`.trim(),
          };
        },
      ),
      departmentService
        .list()
        .then((r) => r.rows)
        .catch(() => [] as Department[]),
    ])
      .then(async ([g, depts]) => {
        if (!mounted) return;
        setGuard(g);
        setDepartments(depts);
        if (g?.guardId) {
          try {
            const m = await departmentService.getMemberDepartment(g.guardId);

            if (!mounted) return;
            setCurrent(
              m.department
                ? { id: m.department.id, name: m.department.name }
                : null,
            );
          } catch {
            /* member row may not exist yet */
          }
        }
      })
      .catch((err: any) => {
        console.error("Error cargando vigilante:", err);
        toast.error(t("ui.GuardDepartamentoPage.noSePudoCargarEl"));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id, registro]);

  const assign = async (departmentId: string | null) => {
    if (!userId) return;
    try {
      setSaving(true);
      await departmentService.assignMember(userId, departmentId);
      const dept = departmentId
        ? departments.find((d) => d.id === departmentId)
        : null;

      setCurrent(dept ? { id: dept.id, name: dept.name } : null);
      setPendingId("");
      toast.success(
        departmentId
          ? t("ui.GuardDepartamentoPage.departamentoAsignado", "Departamento asignado")
          : t("ui.GuardDepartamentoPage.departamentoQuitado", "Departamento quitado"),
      );
    } catch (e: any) {
      toast.error(
        e?.response?.data?.message ||
          e?.response?.data ||
          t(
            "guards.department.updateError",
            "No se pudo actualizar el departamento",
          ),
      );
    } finally {
      setSaving(false);
    }
  };

  const activeDepts = departments.filter(
    (d) => d.active && d.id !== current?.id,
  );

  return (
    <AppLayout>
      <GuardsLayout navKey="keep-safe" title="guards.nav.departamento">
        <PageContainer>
          <PageHeader
            icon={<Building2 />}
            subtitle={
              guard?.fullName
                ? t("ui.GuardDepartamentoPage.subtituloNombre", {
                    defaultValue: "Departamento interno al que pertenece · {{name}}",
                    name: guard.fullName,
                  })
                : t(
                    "ui.GuardDepartamentoPage.subtitulo",
                    "Departamento interno al que pertenece el vigilante.",
                  )
            }
            title={t("guards.department.title", {
              defaultValue: "Departamento",
            })}
          />

          {loading ? (
            <SkeletonCards count={2} />
          ) : guard ? (
            <Section
              icon={<Building2 />}
              title={t("ui.GuardDepartamentoPage.departamentoAsignado", "Departamento asignado")}
            >
              <div className="space-y-6">
                {current ? (
                  <div className="flex items-center justify-between glass-flat px-4 py-3">
                    <div className="flex items-center gap-3">
                      <IconTile>
                        <Building2 />
                      </IconTile>
                      <div>
                        <div className="font-medium">{current.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {t("ui.GuardDepartamentoPage.departamentoActual", "Departamento actual")}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge tone="green">
                        {t("ui.GuardDepartamentoPage.asignado", "Asignado")}
                      </StatusBadge>
                      {canEdit && (
                        <Button
                          disabled={saving}
                          size="sm"
                          variant="ghost"
                          onClick={() => assign(null)}
                        >
                          <X className="mr-1 h-4 w-4" />
                          {t("ui.ExtremoRutaField.quitar", "Quitar")}
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    description={t(
                      "ui.GuardDepartamentoPage.esteVigilanteAunNoPertenece",
                    )}
                    icon={<UserCircle2 />}
                    title={t("comun.sinDepartamento")}
                  />
                )}

                {canEdit && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">
                      {current
                        ? t(
                            "guards.department.changeLabel",
                            "Cambiar de departamento",
                          )
                        : t(
                            "guards.department.assignLabel",
                            "Asignar a un departamento",
                          )}
                    </div>
                    {departments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t(
                          "ui.GuardDepartamentoPage.noHayDepartamentos",
                          "No hay departamentos creados. Créalos en Configuración › Departamentos.",
                        )}
                      </p>
                    ) : (
                      <div className="flex items-center gap-2 max-w-md">
                        <Select value={pendingId} onValueChange={setPendingId}>
                          <SelectTrigger className="flex-1">
                            <SelectValue
                              placeholder={t(
                                "ui.GuardDepartamentoPage.seleccionaUnDepartamento",
                              )}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {activeDepts.map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          disabled={!pendingId || saving}
                          variant="brand"
                          onClick={() => assign(pendingId)}
                        >
                          {saving
                            ? t("common.saving", "Guardando…")
                            : t("ui.SecurityGuardsPage.asignar", "Asignar")}
                        </Button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "ui.GuardDepartamentoPage.unSoloDepartamento",
                        "Cada persona pertenece a un solo departamento; asignar uno nuevo reemplaza el actual.",
                      )}
                    </p>
                  </div>
                )}
              </div>
            </Section>
          ) : (
            <EmptyState
              icon={<Building2 />}
              title={t("ui.GuardDepartamentoPage.noSePudoCargarEl")}
            />
          )}
        </PageContainer>
      </GuardsLayout>
    </AppLayout>
  );
}
