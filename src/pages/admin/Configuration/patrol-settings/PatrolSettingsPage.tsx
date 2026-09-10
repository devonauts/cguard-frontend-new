import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Car, MapPin, Camera, Bell, Users2, Clock } from "lucide-react";

import {
  SettingRow,
  ToggleRow,
  NumberRow,
  SaveBar,
} from "../components/SettingsForm";
import SettingsPageShell from "../components/SettingsPageShell";

import { Section, Stagger, SkeletonCards } from "@/components/kit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import patrolSettingsService, {
  PATROL_DEFAULTS,
  type PatrolSettings,
} from "@/lib/api/patrolSettingsService";

/**
 * POLÍTICA DE PATRULLAJE DE SUPERVISIÓN. Lo que la app del supervisor
 * obedece en cada ruta: cómo se verifica la llegada (geocerca), qué se exige
 * para cerrar una parada, qué se permite (omitir, reordenar), cuándo una ruta
 * cuenta como retrasada, y a quién se avisa. Se guarda en `settings.patrol`.
 *
 * Misma forma que Rondas: grupos en `Section`, una fila por ajuste separada
 * por un filo (`divide-y`), y los ajustes de opciones cerradas en un
 * `SettingRow` con el `Select` del sistema a la derecha — no un campo de
 * formulario suelto en medio de las filas.
 */
export default function PatrolSettingsPage() {
  const { t } = useTranslation();
  const [row, setRow] = useState<any>(null);
  const [s, setS] = useState<PatrolSettings>(PATROL_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof PatrolSettings>(k: K, v: PatrolSettings[K]) =>
    setS((p) => ({ ...p, [k]: v }));
  const setOps = (k: keyof PatrolSettings["notifyOps"], v: boolean) =>
    setS((p) => ({ ...p, notifyOps: { ...p.notifyOps, [k]: v } }));

  useEffect(() => {
    patrolSettingsService
      .get()
      .then((r) => {
        setRow(r.row);
        setS(r.patrol);
      })
      .catch(() =>
        toast.error(
          t("settings.patrol.loadError", {
            defaultValue: "No se pudo cargar la política de patrullaje.",
          }),
        ),
      )
      .finally(() => setLoading(false));
  }, [t]);

  const save = async () => {
    setSaving(true);
    try {
      await patrolSettingsService.save(row, s);
      toast.success(
        t("settings.patrol.saved", {
          defaultValue: "Guardado. Aplica a la próxima ruta que se empiece.",
        }),
      );
    } catch (e: any) {
      toast.error(
        e?.response?.data?.message ||
          t("settings.patrol.saveError", {
            defaultValue: "No se pudo guardar.",
          }),
      );
    } finally {
      setSaving(false);
    }
  };

  const metros = t("settings.patrol.suffixMetros", { defaultValue: "metros" });
  const minutos = t("settings.patrol.suffixMinutos", {
    defaultValue: "minutos",
  });

  return (
    <SettingsPageShell
      icon={<Car />}
      subtitle={t("settings.patrol.pageSubtitle", {
        defaultValue:
          "Cómo se verifica la llegada, qué exige cada parada, qué se permite al supervisor y a quién se avisa.",
      })}
      title={t("settings.patrol.pageTitle", {
        defaultValue: "Rutas de supervisión",
      })}
    >
      {loading ? (
        <SkeletonCards className="sm:grid-cols-1" count={3} />
      ) : (
        <div className="space-y-6">
          <Stagger className="grid gap-6">
            <Section
              contentClassName="divide-y"
              icon={<MapPin />}
              title={t("settings.patrol.geofence", {
                defaultValue: "Llegada y geocerca",
              })}
            >
              <SettingRow
                control={
                  <Select
                    value={s.geofenceEnforcement}
                    onValueChange={(v) =>
                      set(
                        "geofenceEnforcement",
                        v as PatrolSettings["geofenceEnforcement"],
                      )
                    }
                  >
                    <SelectTrigger
                      aria-label={t("settings.patrol.enforcement", {
                        defaultValue: "Verificación de la llegada",
                      })}
                      className="w-44"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="strict">
                        {t("settings.patrol.strict", {
                          defaultValue: "Estricta",
                        })}
                      </SelectItem>
                      <SelectItem value="warning">
                        {t("settings.patrol.warning", {
                          defaultValue: "Aviso (se marca)",
                        })}
                      </SelectItem>
                      <SelectItem value="disabled">
                        {t("settings.patrol.disabled", {
                          defaultValue: "Sin verificar",
                        })}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                }
                hint={t("settings.patrol.enforcementHint", {
                  defaultValue:
                    "Estricta: fuera del radio no se registra. Aviso: se registra y queda marcada. Sin verificar: no se mide.",
                })}
                label={t("settings.patrol.enforcement", {
                  defaultValue: "Verificación de la llegada",
                })}
              />
              <NumberRow
                hint={t("settings.patrol.arrivalRadiusHint", {
                  defaultValue:
                    "Si la parada no define el suyo. Los puestos con geocerca propia usan la suya.",
                })}
                label={t("settings.patrol.arrivalRadius", {
                  defaultValue: "Radio de llegada",
                })}
                max={5000}
                min={20}
                suffix={metros}
                value={s.arrivalRadiusM}
                onChange={(n) => set("arrivalRadiusM", n ?? 250)}
              />
              <NumberRow
                hint={t("settings.patrol.approachRadiusHint", {
                  defaultValue:
                    "Desde esta distancia la app avisa al supervisor de que está llegando.",
                })}
                label={t("settings.patrol.approachRadius", {
                  defaultValue: "Radio de aproximación",
                })}
                max={10000}
                min={50}
                suffix={metros}
                value={s.approachingRadiusM}
                onChange={(n) => set("approachingRadiusM", n ?? 500)}
              />
              <ToggleRow
                checked={s.allowGeofenceOverride}
                hint={t("settings.patrol.allowOverrideHint", {
                  defaultValue:
                    "Sólo aplica en modo estricto. La visita queda marcada y el motivo, en el registro.",
                })}
                label={t("settings.patrol.allowOverride", {
                  defaultValue:
                    "Permitir registrar la llegada fuera del radio con motivo",
                })}
                onCheckedChange={(v) => set("allowGeofenceOverride", v)}
              />
              <ToggleRow
                checked={s.requireOverrideReason}
                disabled={!s.allowGeofenceOverride}
                label={t("settings.patrol.requireOverrideReason", {
                  defaultValue: "Exigir motivo en ese caso",
                })}
                onCheckedChange={(v) => set("requireOverrideReason", v)}
              />
            </Section>

            <Section
              contentClassName="divide-y"
              icon={<Camera />}
              title={t("settings.patrol.visit", {
                defaultValue: "Cada parada",
              })}
            >
              <NumberRow
                hint={t("settings.patrol.minPhotosHint", {
                  defaultValue:
                    "La plantilla o la parada pueden exigir más; nunca menos.",
                })}
                label={t("settings.patrol.minPhotos", {
                  defaultValue: "Fotos mínimas por visita",
                })}
                max={20}
                min={0}
                suffix={t("settings.patrol.suffixFotos", {
                  defaultValue: "fotos",
                })}
                value={s.minPhotosPerVisit}
                onChange={(n) => set("minPhotosPerVisit", n ?? 0)}
              />
              <ToggleRow
                checked={s.allowGalleryPhotos}
                hint={t("settings.patrol.allowGalleryHint", {
                  defaultValue: "Apagado: sólo cámara, tomadas en el momento.",
                })}
                label={t("settings.patrol.allowGallery", {
                  defaultValue: "Permitir fotos de la galería",
                })}
                onCheckedChange={(v) => set("allowGalleryPhotos", v)}
              />
              <ToggleRow
                checked={s.allowSkip}
                label={t("settings.patrol.allowSkip", {
                  defaultValue: "Permitir omitir paradas desde la app",
                })}
                onCheckedChange={(v) => set("allowSkip", v)}
              />
              <ToggleRow
                checked={s.requireSkipReason}
                disabled={!s.allowSkip}
                label={t("settings.patrol.requireSkipReason", {
                  defaultValue: "Exigir motivo al omitir",
                })}
                onCheckedChange={(v) => set("requireSkipReason", v)}
              />
              <ToggleRow
                checked={s.allowSupervisorReorder}
                label={t("settings.patrol.allowReorder", {
                  defaultValue: "Permitir al supervisor reordenar su ruta",
                })}
                onCheckedChange={(v) => set("allowSupervisorReorder", v)}
              />
              <ToggleRow
                checked={s.requireClockInToStart}
                label={t("settings.patrol.requireClockIn", {
                  defaultValue: "Exigir turno abierto para empezar una ruta",
                })}
                onCheckedChange={(v) => set("requireClockInToStart", v)}
              />
            </Section>

            <Section
              contentClassName="divide-y"
              icon={<Clock />}
              title={t("settings.patrol.schedule", {
                defaultValue: "Retrasos",
              })}
            >
              <NumberRow
                hint={t("settings.patrol.lateHint", {
                  defaultValue:
                    "Minutos de desvío frente a la salida prevista.",
                })}
                label={t("settings.patrol.late", {
                  defaultValue: "Retrasada a partir de",
                })}
                max={240}
                min={1}
                suffix={minutos}
                value={s.lateThresholdMin}
                onChange={(n) => set("lateThresholdMin", n ?? 15)}
              />
              <NumberRow
                label={t("settings.patrol.critical", {
                  defaultValue: "En riesgo a partir de",
                })}
                max={480}
                min={2}
                suffix={minutos}
                value={s.criticalDelayMin}
                onChange={(n) => set("criticalDelayMin", n ?? 45)}
              />
            </Section>

            <Section
              contentClassName="divide-y"
              icon={<Bell />}
              title={t("settings.patrol.notify", {
                defaultValue: "Avisos a la central",
              })}
            >
              <ToggleRow
                checked={s.notifyOps.routeStart}
                label={t("settings.patrol.n.routeStart", {
                  defaultValue: "Ruta iniciada",
                })}
                onCheckedChange={(v) => setOps("routeStart", v)}
              />
              <ToggleRow
                checked={s.notifyOps.routeCompletion}
                label={t("settings.patrol.n.routeCompletion", {
                  defaultValue: "Ruta finalizada",
                })}
                onCheckedChange={(v) => setOps("routeCompletion", v)}
              />
              <ToggleRow
                checked={s.notifyOps.stopSkipped}
                label={t("settings.patrol.n.stopSkipped", {
                  defaultValue: "Parada omitida",
                })}
                onCheckedChange={(v) => setOps("stopSkipped", v)}
              />
              <ToggleRow
                checked={s.notifyOps.missedStop}
                label={t("settings.patrol.n.missedStop", {
                  defaultValue: "Parada no visitada",
                })}
                onCheckedChange={(v) => setOps("missedStop", v)}
              />
              <ToggleRow
                checked={s.notifyOps.criticalFinding}
                label={t("settings.patrol.n.criticalFinding", {
                  defaultValue: "Hallazgo crítico",
                })}
                onCheckedChange={(v) => setOps("criticalFinding", v)}
              />
              <ToggleRow
                checked={s.notifyOps.lateRoute}
                label={t("settings.patrol.n.lateRoute", {
                  defaultValue: "Ruta retrasada o en riesgo",
                })}
                onCheckedChange={(v) => setOps("lateRoute", v)}
              />
              <ToggleRow
                checked={s.notifyOps.routeAborted}
                label={t("settings.patrol.n.routeAborted", {
                  defaultValue: "Ruta abortada",
                })}
                onCheckedChange={(v) => setOps("routeAborted", v)}
              />
            </Section>

            <Section
              contentClassName="divide-y"
              icon={<Users2 />}
              title={t("settings.patrol.client", {
                defaultValue: "El cliente",
              })}
            >
              <SettingRow
                control={
                  <Select
                    value={s.clientNotify}
                    onValueChange={(v) =>
                      set("clientNotify", v as PatrolSettings["clientNotify"])
                    }
                  >
                    <SelectTrigger
                      aria-label={t("settings.patrol.clientNotify", {
                        defaultValue:
                          "Avisar al cliente de las visitas de supervisión",
                      })}
                      className="w-44"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_visit">
                        {t("settings.patrol.cn.perVisit", {
                          defaultValue: "En cada visita",
                        })}
                      </SelectItem>
                      <SelectItem value="route_completion">
                        {t("settings.patrol.cn.routeCompletion", {
                          defaultValue: "Al terminar la ruta",
                        })}
                      </SelectItem>
                      <SelectItem value="daily">
                        {t("settings.patrol.cn.daily", {
                          defaultValue: "Resumen diario",
                        })}
                      </SelectItem>
                      <SelectItem value="never">
                        {t("settings.patrol.cn.never", {
                          defaultValue: "Nunca",
                        })}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                }
                hint={t("settings.patrol.clientNotifyHint", {
                  defaultValue:
                    "Cuándo recibe el cliente el aviso de que su puesto fue visitado.",
                })}
                label={t("settings.patrol.clientNotify", {
                  defaultValue:
                    "Avisar al cliente de las visitas de supervisión",
                })}
              />
              <ToggleRow
                checked={s.clientVisiblePhotosDefault}
                label={t("settings.patrol.clientPhotos", {
                  defaultValue: "Fotos visibles al cliente por defecto",
                })}
                onCheckedChange={(v) => set("clientVisiblePhotosDefault", v)}
              />
              <ToggleRow
                checked={s.clientVisibleInspectionDefault}
                hint={t("settings.patrol.clientInspectionHint", {
                  defaultValue:
                    "Sólo los ítems marcados como visibles en la plantilla. Las novedades internas nunca se muestran.",
                })}
                label={t("settings.patrol.clientInspection", {
                  defaultValue:
                    "Resultado de la inspección visible al cliente por defecto",
                })}
                onCheckedChange={(v) =>
                  set("clientVisibleInspectionDefault", v)
                }
              />
            </Section>
          </Stagger>

          <SaveBar saving={saving} onSave={save} />
        </div>
      )}
    </SettingsPageShell>
  );
}
