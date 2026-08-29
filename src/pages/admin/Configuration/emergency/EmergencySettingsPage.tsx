/**
 * Emergencias y pánico — la página que la auditoría del 15-ago señaló que no
 * existía: «no se puede decir a quién llega un pánico».
 *
 * Todo lo de aquí tiene motor real en el servidor (settings.panicSettings,
 * saneado por resolvePanicSettings):
 *  - roles         → destinatarios del push/campana/overlay/correo del pánico
 *                    Y del fan-out del escalado. Admite roles PROPIOS del
 *                    tenant (una central de monitoreo 24/7).
 *  - extraEmails   → destinos explícitos (la central externa). No se filtran
 *                    por «Mis avisos»: son configuración, no preferencia.
 *  - escalateAfterMin / repeatEveryMin / stopAfterMin → la cadencia del
 *    escalado; repetir=0 apaga la repetición.
 *
 * Una lista de roles VACÍA no se guarda como vacía: el backend la rellena con
 * los de siempre — una emergencia sin destino no es una configuración.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Siren, Mail, RotateCw } from "lucide-react";
import { SkeletonCards } from "@/components/kit";
import SettingsPageShell from "../components/SettingsPageShell";
import { SaveBar } from "../components/SettingsForm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { usePermissions } from "@/hooks/usePermissions";
import api from "@/lib/api";
import { tablaDeEtiquetas } from "@/lib/i18nLabel";

const tenantId = () => localStorage.getItem("tenantId") || "";

type PanicCfg = {
  roles: string[];
  extraEmails: string[];
  escalateAfterMin: number;
  repeatEveryMin: number;
  stopAfterMin: number;
};

const DEFAULTS: PanicCfg = {
  roles: ["admin", "operationsManager", "securitySupervisor", "dispatcher"],
  extraEmails: [],
  escalateAfterMin: 2,
  repeatEveryMin: 10,
  stopAfterMin: 60,
};

/**
 * Etiquetas de los roles del sistema; los propios muestran su nombre.
 * Se resuelven AL LEERLAS (`tablaDeEtiquetas`): esta tabla se evalúa al
 * importar el módulo, antes de que el usuario haya elegido idioma.
 */
const ETIQUETA_ROL: Record<string, string> = tablaDeEtiquetas({
  admin: "settings.emergency.role_admin",
  operationsManager: "settings.emergency.role_operationsManager",
  securitySupervisor: "settings.emergency.role_securitySupervisor",
  dispatcher: "settings.emergency.role_dispatcher",
  hrManager: "settings.emergency.role_hrManager",
  officeStaff: "settings.emergency.role_officeStaff",
});

export default function EmergencySettingsPage() {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("settingsEdit");
  const [row, setRow] = useState<any>(null);
  const [cfg, setCfg] = useState<PanicCfg>(DEFAULTS);
  const [emailsTexto, setEmailsTexto] = useState("");
  const [rolesDisponibles, setRolesDisponibles] = useState<Array<{ slug: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [{ data }, resRoles] = await Promise.all([
          api.get(`/tenant/${tenantId()}/settings`),
          api.get(`/tenant/${tenantId()}/role`).catch(() => null),
        ]);
        setRow(data || {});
        const p = { ...DEFAULTS, ...((data && data.panicSettings) || {}) };
        setCfg(p);
        setEmailsTexto((p.extraEmails || []).join(", "));

        // Roles del tenant (sistema + propios). Se excluyen los de campo puro:
        // un pánico no se enruta a otros vigilantes.
        const crudo: any = resRoles?.data ?? resRoles ?? [];
        const filas = Array.isArray(crudo) ? crudo : crudo?.rows || crudo?.data?.rows || [];
        const vistos = new Set<string>();
        const lista: Array<{ slug: string; label: string }> = [];
        for (const r of filas) {
          const slug = String(r.slug || r.name || r.id || "").trim();
          if (!slug || vistos.has(slug)) continue;
          if (["securityGuard", "customer", "superadmin"].includes(slug)) continue;
          vistos.add(slug);
          lista.push({ slug, label: ETIQUETA_ROL[slug] || r.label || r.name || slug });
        }
        // Si el endpoint de roles falla, al menos los del sistema.
        if (!lista.length) {
          for (const slug of Object.keys(ETIQUETA_ROL)) lista.push({ slug, label: ETIQUETA_ROL[slug] });
        }
        setRolesDisponibles(lista);
      } catch {
        toast.error(t('settings.emergency.loadError', { defaultValue: 'No se pudo cargar la configuración de emergencias.' }));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleRol = (slug: string, on: boolean) =>
    setCfg((c) => ({ ...c, roles: on ? [...new Set([...c.roles, slug])] : c.roles.filter((r) => r !== slug) }));

  const save = async () => {
    setSaving(true);
    try {
      const extraEmails = emailsTexto
        .split(/[,;\s]+/)
        .map((e) => e.trim())
        .filter(Boolean);
      await api.put(`/tenant/${tenantId()}/settings`, {
        settings: {
          theme: row?.theme || "default",
          logos: row?.logos || [],
          backgroundImages: row?.backgroundImages || [],
          panicSettings: { ...cfg, extraEmails },
        },
      });
      toast.success(t('settings.emergency.saveSuccess', { defaultValue: 'Guardado. Aplica al próximo pánico, sin reiniciar nada.' }));
    } catch (e: any) {
      toast.error(e?.response?.data?.message || t('settings.emergency.saveError', { defaultValue: 'No se pudo guardar.' }));
    } finally {
      setSaving(false);
    }
  };

  const disabled = !canEdit || loading;

  return (
    <SettingsPageShell
      icon={<Siren />}
      title={t('settings.emergency.pageTitle', { defaultValue: 'Emergencias y pánico' })}
      subtitle={t('settings.emergency.pageSubtitle', { defaultValue: 'A quién le llega un pánico y con qué insistencia escala.' })}
    >
      {loading ? (
        <SkeletonCards count={3} className="sm:grid-cols-1" />
      ) : (
        <div className="space-y-6">
          <section className="glass-flat rounded-2xl p-5">
            <h3 className="mb-1 text-sm font-semibold">{t('settings.emergency.whoReceivesTitle', { defaultValue: 'Quién recibe un pánico' })}</h3>
            <p className="mb-3 text-xs" style={{ color: "var(--ink-soft)" }}>
              {t('settings.emergency.whoReceivesDesc', { defaultValue: 'Push, campana, alerta a pantalla completa y correo. La misma lista gobierna el escalado. Incluye tus roles propios — una central de monitoreo puede recibirlo todo.' })}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {rolesDisponibles.map((r) => (
                <label key={r.slug} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={cfg.roles.includes(r.slug)}
                    onCheckedChange={(v) => toggleRol(r.slug, v === true)}
                    disabled={disabled}
                  />
                  {t(`settings.emergency.role_${r.slug}`, { defaultValue: r.label })}
                </label>
              ))}
            </div>
          </section>

          <section className="glass-flat rounded-2xl p-5">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Mail size={15} /> {t('settings.emergency.extraEmailsTitle', { defaultValue: 'Correos adicionales' })}</h3>
            <p className="mb-3 text-xs" style={{ color: "var(--ink-soft)" }}>
              {t('settings.emergency.extraEmailsDesc', { defaultValue: 'Destinos fijos fuera de la plantilla (tu central externa, un contratista). Separados por coma.' })}
            </p>
            <Input
              value={emailsTexto}
              onChange={(e) => setEmailsTexto(e.target.value)}
              placeholder={t('settings.emergency.emailsPlaceholder', { defaultValue: 'central@tuempresa.com, monitoreo@externo.com' })}
              disabled={disabled}
            />
          </section>

          <section className="glass-flat rounded-2xl p-5">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><RotateCw size={15} /> {t('settings.emergency.escaladoTitle', { defaultValue: 'Escalado' })}</h3>
            <p className="mb-3 text-xs" style={{ color: "var(--ink-soft)" }}>
              {t('settings.emergency.escaladoDesc', { defaultValue: 'Un pánico que nadie reconoce vuelve a avisar hasta que alguien lo atienda o se agote el plazo.' })}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label className="text-xs">{t('settings.emergency.escalateAfterLabel', { defaultValue: 'Escalar a los (min)' })}</Label>
                <Input type="number" min={1} max={60} value={cfg.escalateAfterMin}
                  onChange={(e) => setCfg((c) => ({ ...c, escalateAfterMin: Number(e.target.value) }))} disabled={disabled} />
              </div>
              <div>
                <Label className="text-xs">{t('settings.emergency.repeatEveryLabel', { defaultValue: 'Repetir cada (min, 0 = no repetir)' })}</Label>
                <Input type="number" min={0} max={60} value={cfg.repeatEveryMin}
                  onChange={(e) => setCfg((c) => ({ ...c, repeatEveryMin: Number(e.target.value) }))} disabled={disabled} />
              </div>
              <div>
                <Label className="text-xs">{t('settings.emergency.stopAfterLabel', { defaultValue: 'Dejar de insistir a los (min)' })}</Label>
                <Input type="number" min={5} max={720} value={cfg.stopAfterMin}
                  onChange={(e) => setCfg((c) => ({ ...c, stopAfterMin: Number(e.target.value) }))} disabled={disabled} />
              </div>
            </div>
          </section>

          <SaveBar saving={saving} disabled={disabled} onSave={save} />
        </div>
      )}
    </SettingsPageShell>
  );
}
