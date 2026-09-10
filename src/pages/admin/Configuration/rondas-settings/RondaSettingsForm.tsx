import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Clock, ShieldCheck, Bell, Info } from "lucide-react";

import { ToggleRow, NumberRow, SaveBar } from "../components/SettingsForm";

import { Section, Stagger, SkeletonCards } from "@/components/kit";
import {
  rondaSettingsService,
  RondaSettings,
} from "@/lib/api/rondaSettingsService";

const DEFAULTS: RondaSettings = {
  frequencyMinutes: 60,
  roundsPerShift: null,
  graceMinutes: 10,
  maxDurationMinutes: 60,
  requirePhoto: true,
  requireGeofence: true,
  geofenceRadius: 50,
  requireNote: false,
  requireCheckpointOrder: false,
  notifyTenantOnStart: true,
  notifyTenantOnComplete: true,
  notifyTenantOnMissed: true,
  notifyClient: false,
  emailOnComplete: false,
  active: true,
};

/**
 * Reusable patrol-settings form. With no `postSiteId` it edits the tenant default;
 * with a `postSiteId` it edits that post site's override (falling back to the default).
 */
export default function RondaSettingsForm({
  postSiteId,
  onSaved,
}: {
  postSiteId?: string;
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const [s, setS] = useState<RondaSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inherited, setInherited] = useState(false);
  const set = <K extends keyof RondaSettings>(k: K, v: RondaSettings[K]) =>
    setS((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    setLoading(true);
    rondaSettingsService
      .get(postSiteId)
      .then((res) => {
        setS({ ...DEFAULTS, ...res });
        // If we asked for a post-site but got the tenant default, it's inherited.
        setInherited(
          Boolean(postSiteId) && (res.isDefault === true || !res.postSiteId),
        );
      })
      .catch(() =>
        toast.error(
          t("settings.rondas.loadError", {
            defaultValue: "No se pudieron cargar las configuraciones",
          }),
        ),
      )
      .finally(() => setLoading(false));
  }, [postSiteId]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await rondaSettingsService.update({
        ...s,
        postSiteId: postSiteId ?? null,
      });

      setS({ ...DEFAULTS, ...res });
      setInherited(false);
      toast.success(
        t("settings.rondas.saveSuccess", {
          defaultValue: "Configuraciones de rondas guardadas",
        }),
      );
      onSaved?.();
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("settings.rondas.saveError", { defaultValue: "Error al guardar" }),
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <SkeletonCards className="sm:grid-cols-1" count={3} />;
  }

  return (
    <div className="space-y-6">
      {postSiteId && inherited && (
        <div
          className="glass-flat flex items-start gap-3 p-4"
          style={{
            borderColor: "var(--brand-line)",
            background: "var(--brand-wash)",
          }}
        >
          <Info
            className="mt-0.5 h-4 w-4 shrink-0"
            style={{ color: "var(--brand-text)" }}
          />
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {t("settings.rondas.inheritedNote", {
              defaultValue:
                "Este puesto usa las reglas generales de la empresa. Al guardar, se creará una configuración propia sólo para este puesto.",
            })}
          </p>
        </div>
      )}

      <Stagger className="grid gap-6">
        <Section
          icon={<Clock />}
          title={t("settings.rondas.sectionCadencia", {
            defaultValue: "Cadencia de la ronda",
          })}
        >
          <div className="divide-y">
            <NumberRow
              hint={t("settings.rondas.frequencyHint", {
                defaultValue: "Cada cuánto debe realizarse una ronda.",
              })}
              label={t("settings.rondas.frequencyLabel", {
                defaultValue: "Frecuencia",
              })}
              min={1}
              suffix={t("settings.rondas.suffixMinutos", {
                defaultValue: "minutos",
              })}
              value={s.frequencyMinutes}
              onChange={(v) => set("frequencyMinutes", (v ?? 0) as number)}
            />
            <NumberRow
              hint={t("settings.rondas.roundsPerShiftHint", {
                defaultValue:
                  "Sólo informativo por ahora: queda anotado como expectativa del puesto, pero todavía no genera avisos por sí solo. Quien vigila el cumplimiento es la Frecuencia.",
              })}
              label={t("settings.rondas.roundsPerShiftLabel", {
                defaultValue: "Rondas por turno",
              })}
              min={1}
              suffix={t("settings.rondas.suffixRondas", {
                defaultValue: "rondas",
              })}
              value={s.roundsPerShift}
              onChange={(v) => set("roundsPerShift", v)}
            />
            <NumberRow
              hint={t("settings.rondas.graceHint", {
                defaultValue: "Margen antes de marcar una ronda como tarde.",
              })}
              label={t("settings.rondas.graceLabel", {
                defaultValue: "Tolerancia",
              })}
              suffix={t("settings.rondas.suffixMinutos", {
                defaultValue: "minutos",
              })}
              value={s.graceMinutes}
              onChange={(v) => set("graceMinutes", (v ?? 0) as number)}
            />
            <NumberRow
              hint={t("settings.rondas.maxDurationHint", {
                defaultValue: "Tiempo máximo para completar una ronda entera.",
              })}
              label={t("settings.rondas.maxDurationLabel", {
                defaultValue: "Duración máxima",
              })}
              min={1}
              suffix={t("settings.rondas.suffixMinutos", {
                defaultValue: "minutos",
              })}
              value={s.maxDurationMinutes}
              onChange={(v) => set("maxDurationMinutes", (v ?? 0) as number)}
            />
          </div>
        </Section>

        <Section
          icon={<ShieldCheck />}
          title={t("settings.rondas.sectionValidacion", {
            defaultValue: "Validación de los puntos",
          })}
        >
          <div className="divide-y">
            <ToggleRow
              checked={s.requirePhoto}
              hint={t("settings.rondas.requirePhotoHint", {
                defaultValue:
                  "El vigilante debe tomar una foto con fecha y hora en cada punto.",
              })}
              label={t("settings.rondas.requirePhotoLabel", {
                defaultValue: "Exigir foto",
              })}
              onCheckedChange={(b) => set("requirePhoto", b)}
            />
            <ToggleRow
              checked={s.requireGeofence}
              hint={t("settings.rondas.requireGeofenceHint", {
                defaultValue:
                  "Se comprueba dónde está el vigilante al marcar cada punto.",
              })}
              label={t("settings.rondas.requireGeofenceLabel", {
                defaultValue: "Exigir ubicación",
              })}
              onCheckedChange={(b) => set("requireGeofence", b)}
            />
            <NumberRow
              hint={t("settings.rondas.geofenceRadiusHint", {
                defaultValue:
                  "Distancia máxima desde el punto para que el escaneo cuente.",
              })}
              label={t("settings.rondas.geofenceRadiusLabel", {
                defaultValue: "Radio permitido",
              })}
              suffix={t("settings.rondas.suffixMetros", {
                defaultValue: "metros",
              })}
              value={s.geofenceRadius}
              onChange={(v) => set("geofenceRadius", (v ?? 0) as number)}
            />
            <ToggleRow
              checked={s.requireNote}
              hint={t("settings.rondas.requireNoteHint", {
                defaultValue:
                  "El vigilante debe dejar una nota escrita en cada punto.",
              })}
              label={t("settings.rondas.requireNoteLabel", {
                defaultValue: "Exigir observación",
              })}
              onCheckedChange={(b) => set("requireNote", b)}
            />
            <ToggleRow
              checked={s.requireCheckpointOrder}
              hint={t("settings.rondas.requireOrderHint", {
                defaultValue:
                  "El vigilante debe marcar los puntos en el orden que definiste, no en el que le convenga. Revisa antes ese orden en Puestos › Rondas: hasta ahora no existía, y los puntos se numeraron por la fecha en que se crearon.",
              })}
              label={t("settings.rondas.requireOrderLabel", {
                defaultValue: "Exigir el orden del recorrido",
              })}
              onCheckedChange={(b) => set("requireCheckpointOrder", b)}
            />
          </div>
        </Section>

        <Section
          icon={<Bell />}
          title={t("settings.rondas.sectionAvisos", { defaultValue: "Avisos" })}
        >
          <div className="divide-y">
            <ToggleRow
              checked={s.notifyTenantOnStart}
              hint={t("settings.rondas.notifyStartHint", {
                defaultValue: "Cuando un vigilante empieza una ronda.",
              })}
              label={t("settings.rondas.notifyStartLabel", {
                defaultValue: "Avisar al iniciar",
              })}
              onCheckedChange={(b) => set("notifyTenantOnStart", b)}
            />
            <ToggleRow
              checked={s.notifyTenantOnComplete}
              hint={t("settings.rondas.notifyCompleteHint", {
                defaultValue: "Cuando una ronda termina correctamente.",
              })}
              label={t("settings.rondas.notifyCompleteLabel", {
                defaultValue: "Avisar al completar",
              })}
              onCheckedChange={(b) => set("notifyTenantOnComplete", b)}
            />
            <ToggleRow
              checked={s.emailOnComplete}
              hint={t("settings.rondas.emailOnCompleteHint", {
                defaultValue:
                  "Además del aviso, envía un correo a administradores y supervisores (requiere el correo configurado).",
              })}
              label={t("settings.rondas.emailOnCompleteLabel", {
                defaultValue: "Enviar correo al completar",
              })}
              onCheckedChange={(b) => set("emailOnComplete", b)}
            />
            <ToggleRow
              checked={s.notifyTenantOnMissed}
              hint={t("settings.rondas.notifyMissedHint", {
                defaultValue:
                  "Cuando una ronda no se hace o se hace fuera de tiempo.",
              })}
              label={t("settings.rondas.notifyMissedLabel", {
                defaultValue: "Avisar rondas perdidas o tarde",
              })}
              onCheckedChange={(b) => set("notifyTenantOnMissed", b)}
            />
            <ToggleRow
              checked={s.notifyClient}
              hint={t("settings.rondas.notifyClientHint", {
                defaultValue:
                  "El cliente del puesto recibe un aviso cuando la ronda se COMPLETA. Los inicios y las rondas perdidas son internos: nunca se le muestran.",
              })}
              label={t("settings.rondas.notifyClientLabel", {
                defaultValue: "Avisar también al cliente",
              })}
              onCheckedChange={(b) => set("notifyClient", b)}
            />
          </div>
        </Section>
      </Stagger>

      <SaveBar saving={saving} onSave={save} />
    </div>
  );
}
