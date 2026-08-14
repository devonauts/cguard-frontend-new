import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Clock, ShieldCheck, Bell, Info } from "lucide-react";

import { Section, Stagger, SkeletonCards } from "@/components/kit";
import { ToggleRow, NumberRow, SaveBar } from "../components/SettingsForm";
import { rondaSettingsService, RondaSettings } from "@/lib/api/rondaSettingsService";

const DEFAULTS: RondaSettings = {
  frequencyMinutes: 60,
  roundsPerShift: null,
  graceMinutes: 10,
  maxDurationMinutes: 60,
  requirePhoto: true,
  requireGeofence: true,
  geofenceRadius: 50,
  requireNote: false,
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
        setInherited(Boolean(postSiteId) && (res.isDefault === true || !res.postSiteId));
      })
      .catch(() => toast.error("No se pudieron cargar las configuraciones"))
      .finally(() => setLoading(false));
  }, [postSiteId]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await rondaSettingsService.update({ ...s, postSiteId: postSiteId ?? null });
      setS({ ...DEFAULTS, ...res });
      setInherited(false);
      toast.success("Configuraciones de rondas guardadas");
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <SkeletonCards count={3} className="sm:grid-cols-1" />;
  }

  return (
    <div className="space-y-6">
      {postSiteId && inherited && (
        <div
          className="glass-flat flex items-start gap-3 p-4"
          style={{ borderColor: 'var(--brand-line)', background: 'var(--brand-wash)' }}
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--brand-text)' }} />
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            Este puesto usa las reglas generales de la empresa. Al guardar, se creará una
            configuración propia sólo para este puesto.
          </p>
        </div>
      )}

      <Stagger className="grid gap-6">
        <Section title="Cadencia de la ronda" icon={<Clock />}>
          <div className="divide-y">
            <NumberRow label="Frecuencia" hint="Cada cuánto debe realizarse una ronda." value={s.frequencyMinutes} onChange={(v) => set("frequencyMinutes", (v ?? 0) as number)} min={1} suffix="minutos" />
            <NumberRow label="Rondas por turno" hint="Sólo informativo por ahora: queda anotado como expectativa del puesto, pero todavía no genera avisos por sí solo. Quien vigila el cumplimiento es la Frecuencia." value={s.roundsPerShift} onChange={(v) => set("roundsPerShift", v)} min={1} suffix="rondas" />
            <NumberRow label="Tolerancia" hint="Margen antes de marcar una ronda como tarde." value={s.graceMinutes} onChange={(v) => set("graceMinutes", (v ?? 0) as number)} suffix="minutos" />
            <NumberRow label="Duración máxima" hint="Tiempo máximo para completar una ronda entera." value={s.maxDurationMinutes} onChange={(v) => set("maxDurationMinutes", (v ?? 0) as number)} min={1} suffix="minutos" />
          </div>
        </Section>

        <Section title="Validación de los puntos" icon={<ShieldCheck />}>
          <div className="divide-y">
            <ToggleRow label="Exigir foto" hint="El vigilante debe tomar una foto con fecha y hora en cada punto." checked={s.requirePhoto} onCheckedChange={(b) => set("requirePhoto", b)} />
            <ToggleRow label="Exigir ubicación" hint="Se comprueba dónde está el vigilante al marcar cada punto." checked={s.requireGeofence} onCheckedChange={(b) => set("requireGeofence", b)} />
            <NumberRow label="Radio permitido" hint="Distancia máxima desde el punto para que el escaneo cuente." value={s.geofenceRadius} onChange={(v) => set("geofenceRadius", (v ?? 0) as number)} suffix="metros" />
            <ToggleRow label="Exigir observación" hint="El vigilante debe dejar una nota escrita en cada punto." checked={s.requireNote} onCheckedChange={(b) => set("requireNote", b)} />
          </div>
        </Section>

        <Section title="Avisos" icon={<Bell />}>
          <div className="divide-y">
            <ToggleRow label="Avisar al iniciar" hint="Cuando un vigilante empieza una ronda." checked={s.notifyTenantOnStart} onCheckedChange={(b) => set("notifyTenantOnStart", b)} />
            <ToggleRow label="Avisar al completar" hint="Cuando una ronda termina correctamente." checked={s.notifyTenantOnComplete} onCheckedChange={(b) => set("notifyTenantOnComplete", b)} />
            <ToggleRow label="Enviar correo al completar" hint="Además del aviso, envía un correo a administradores y supervisores (requiere el correo configurado)." checked={s.emailOnComplete} onCheckedChange={(b) => set("emailOnComplete", b)} />
            <ToggleRow label="Avisar rondas perdidas o tarde" hint="Cuando una ronda no se hace o se hace fuera de tiempo." checked={s.notifyTenantOnMissed} onCheckedChange={(b) => set("notifyTenantOnMissed", b)} />
            <ToggleRow label="Avisar también al cliente" hint="El cliente del puesto recibe un aviso cuando la ronda se COMPLETA. Los inicios y las rondas perdidas son internos: nunca se le muestran." checked={s.notifyClient} onCheckedChange={(b) => set("notifyClient", b)} />
          </div>
        </Section>
      </Stagger>

      <SaveBar onSave={save} saving={saving} />
    </div>
  );
}
