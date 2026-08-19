/**
 * Configuración › Seguridad — la pantalla que la API llevaba esperando.
 *
 * `GET/PUT /tenant/:id/settings/security` existía completo (política de
 * contraseñas, política de sesión, interruptores de plataforma) con CERO
 * consumidores — el archivo del backend se titula «La pantalla de Seguridad
 * que no existía» y seguía sin existir. Ésta es.
 *
 * Todo aquí tiene motor:
 *  - Contraseñas → passwordPolicyService, aplicado en los 3 validadores reales.
 *  - Sesión → lib/idleLogout.ts en este mismo CRM (aviso 2 min antes).
 *  - Interruptores de plataforma → SOLO LECTURA a propósito: no son del
 *    tenant; lo que faltaba era poder VER si están puestos.
 *
 * El servidor es quien sanea (resolvePasswordPolicy/resolveSessionPolicy): la
 * pantalla no lleva su propia copia de los topes, los muestra desde `limites`.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, KeyRound, TimerOff, ToggleLeft } from "lucide-react";
import { SkeletonCards, StatusBadge } from "@/components/kit";
import SettingsPageShell from "../components/SettingsPageShell";
import { SaveBar, ToggleRow } from "../components/SettingsForm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/hooks/usePermissions";
import api from "@/lib/api";

const tenantId = () => localStorage.getItem("tenantId") || "";

type PasswordPolicy = {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  expiresDays?: number;
};
type SessionPolicy = { idleTimeoutMinutes: number; warnBeforeLogout: boolean };
type PlatformSwitch = { clave: string; nombre: string; descripcion: string; activo: boolean };

/** Opciones de inactividad: pocas y con sentido. 0 = nunca (lo de siempre). */
const IDLE_OPCIONES: Array<[number, string]> = [
  [0, "Nunca (comportamiento actual)"],
  [15, "15 minutos"],
  [30, "30 minutos"],
  [60, "1 hora"],
  [240, "4 horas"],
  [480, "8 horas (una jornada)"],
];

export default function SecurityPolicyPage() {
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("settingsEdit");
  const [password, setPassword] = useState<PasswordPolicy | null>(null);
  const [session, setSession] = useState<SessionPolicy | null>(null);
  const [platform, setPlatform] = useState<PlatformSwitch[]>([]);
  const [limites, setLimites] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/tenant/${tenantId()}/settings/security`);
        setPassword(data.password);
        setSession(data.session);
        setPlatform(data.platform || []);
        setLimites(data.limites || {});
      } catch {
        toast.error("No se pudo cargar la política de seguridad.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put(`/tenant/${tenantId()}/settings/security`, { password, session });
      if (data?.password) setPassword(data.password);
      if (data?.session) setSession(data.session);
      toast.success("Política guardada. Las contraseñas nuevas ya la exigen; la sesión aplica al recargar.");
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const disabled = !canEdit || loading;

  return (
    <SettingsPageShell
      icon={<ShieldCheck />}
      title="Seguridad"
      subtitle="Contraseñas, cierre por inactividad y las protecciones de la plataforma."
    >
      {loading || !password || !session ? (
        <SkeletonCards count={3} className="sm:grid-cols-1" />
      ) : (
        <div className="space-y-6">
          <section className="glass-flat rounded-2xl p-5">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><KeyRound size={15} /> Contraseñas</h3>
            <p className="mb-3 text-xs" style={{ color: "var(--ink-soft)" }}>
              Aplica a contraseñas nuevas y cambios. La plataforma ya exige un mínimo que no se puede aflojar
              — aquí solo se puede endurecer.
            </p>
            <div className="mb-3 max-w-xs">
              <Label className="text-xs">Longitud mínima (piso: {limites.passwordMinLength ?? 8})</Label>
              <Input
                type="number"
                min={limites.passwordMinLength ?? 8}
                max={limites.passwordMaxLength ?? 128}
                value={password.minLength}
                onChange={(e) => setPassword((p) => p && { ...p, minLength: Number(e.target.value) })}
                disabled={disabled}
              />
            </div>
            <div className="space-y-1">
              <ToggleRow label="Exigir mayúsculas" checked={password.requireUppercase} disabled={disabled}
                onCheckedChange={(v: boolean) => setPassword((p) => p && { ...p, requireUppercase: v })} />
              <ToggleRow label="Exigir minúsculas" checked={password.requireLowercase} disabled={disabled}
                onCheckedChange={(v: boolean) => setPassword((p) => p && { ...p, requireLowercase: v })} />
              <ToggleRow label="Exigir números" checked={password.requireNumber} disabled={disabled}
                onCheckedChange={(v: boolean) => setPassword((p) => p && { ...p, requireNumber: v })} />
              <ToggleRow label="Exigir símbolos" checked={password.requireSymbol} disabled={disabled}
                onCheckedChange={(v: boolean) => setPassword((p) => p && { ...p, requireSymbol: v })} />
            </div>
          </section>

          <section className="glass-flat rounded-2xl p-5">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><TimerOff size={15} /> Cierre por inactividad</h3>
            <p className="mb-3 text-xs" style={{ color: "var(--ink-soft)" }}>
              Cierra la sesión del CRM cuando nadie lo usa — el navegador de una recepción no se queda
              abierto un mes. Las apps de los vigilantes no se ven afectadas.
            </p>
            <div className="mb-2 max-w-xs">
              <Label className="text-xs">Cerrar tras</Label>
              <select
                className="cg-input w-full"
                value={session.idleTimeoutMinutes}
                onChange={(e) => setSession((s) => s && { ...s, idleTimeoutMinutes: Number(e.target.value) })}
                disabled={disabled}
              >
                {IDLE_OPCIONES.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <ToggleRow label="Avisar 2 minutos antes de cerrar" checked={session.warnBeforeLogout} disabled={disabled || session.idleTimeoutMinutes === 0}
              onCheckedChange={(v: boolean) => setSession((s) => s && { ...s, warnBeforeLogout: v })} />
          </section>

          <section className="glass-flat rounded-2xl p-5">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><ToggleLeft size={15} /> Protecciones de la plataforma</h3>
            <p className="mb-3 text-xs" style={{ color: "var(--ink-soft)" }}>
              Las administra CGuardPro para todas las empresas. Aquí puedes ver si están activas.
            </p>
            <div className="space-y-3">
              {platform.map((sw) => (
                <div key={sw.clave} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{sw.nombre}</p>
                    <p className="text-xs" style={{ color: "var(--ink-soft)" }}>{sw.descripcion}</p>
                  </div>
                  <StatusBadge tone={sw.activo ? "ok" : "neutral"}>{sw.activo ? "Activa" : "Inactiva"}</StatusBadge>
                </div>
              ))}
            </div>
          </section>

          <SaveBar saving={saving} disabled={disabled} onSave={save} />
        </div>
      )}
    </SettingsPageShell>
  );
}
