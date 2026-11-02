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
import { useTranslation } from "react-i18next";
import { ShieldCheck, KeyRound, TimerOff, ToggleLeft } from "lucide-react";

import SettingsPageShell from "../components/SettingsPageShell";
import { SaveBar, ToggleRow } from "../components/SettingsForm";

import { SkeletonCards, StatusBadge } from "@/components/kit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/hooks/usePermissions";
import api from "@/lib/api";
import { useWhiteLabel } from "@/contexts/WhiteLabelContext";

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
type PlatformSwitch = {
  clave: string;
  nombre: string;
  descripcion: string;
  activo: boolean;
};

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
  const { t } = useTranslation();
  /* El nombre del anfitrión: «C-Guard Pro» en el de la plataforma, el del
     socio en el suyo. Por eso estos textos ya no lo llevan escrito. */
  const { platformName: nombreDeMarca } = useWhiteLabel();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("settingsEdit");
  const [password, setPassword] = useState<PasswordPolicy | null>(null);
  const [session, setSession] = useState<SessionPolicy | null>(null);
  const [platform, setPlatform] = useState<PlatformSwitch[]>([]);
  const [limites, setLimites] = useState<any>({});
  // What the platform already requires and the company cannot loosen (GET …/settings/security `suelo`).
  const [suelo, setSuelo] = useState<Partial<PasswordPolicy>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(
          `/tenant/${tenantId()}/settings/security`,
        );

        setPassword(data.password);
        setSession(data.session);
        setPlatform(data.platform || []);
        setLimites(data.limites || {});
        setSuelo(data.suelo || {});
      } catch {
        toast.error(
          t("settings.security.loadError", {
            defaultValue: "No se pudo cargar la política de seguridad.",
          }),
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const minFloor = Number(limites.passwordMinLength ?? 8);
  const minCeiling = Number(limites.passwordMaxLength ?? 128);
  const minLengthValid =
    !!password &&
    Number.isInteger(password.minLength) &&
    password.minLength >= minFloor &&
    password.minLength <= minCeiling;

  const save = async () => {
    // The server clamps an out-of-range length (5 → 8, 200 → 128) and answers
    // «Política guardada»: say it here instead of saving something else.
    if (!minLengthValid) {
      toast.error(
        t("settings.security.minLengthOutOfRange", {
          defaultValue:
            "La longitud mínima tiene que ser un número entre {{min}} y {{max}}.",
          min: minFloor,
          max: minCeiling,
        }),
      );

      return;
    }
    setSaving(true);
    try {
      const { data } = await api.put(
        `/tenant/${tenantId()}/settings/security`,
        { password, session },
      );

      if (data?.password) setPassword(data.password);
      if (data?.session) setSession(data.session);
      // The server keeps the platform floor whatever is sent: say so instead
      // of «Política guardada» over a value that did not stick.
      const sent = password as Record<string, unknown> | null;
      const kept = (data?.password || {}) as Record<string, unknown>;
      const corrected =
        !!sent &&
        !!data?.password &&
        Object.keys(sent).some((k) => k in kept && kept[k] !== sent[k]);

      if (corrected) {
        toast.warning(
          t("settings.security.savedCorrected", {
            defaultValue:
              "Política guardada, pero lo que la plataforma exige se quedó como estaba. Revisa los valores en pantalla.",
          }),
        );
      } else {
        toast.success(
          t("settings.security.savedOk", {
            defaultValue:
              "Política guardada. Las contraseñas nuevas ya la exigen; la sesión aplica al recargar.",
          }),
        );
      }
    } catch (e: any) {
      toast.error(
        e?.response?.data?.message ||
          t("settings.security.saveError", {
            defaultValue: "No se pudo guardar.",
          }),
      );
    } finally {
      setSaving(false);
    }
  };

  const disabled = !canEdit || loading;
  const requiredByPlatform = t("settings.security.requiredByPlatform", {
    defaultValue: "Lo exige la plataforma: no se puede apagar.",
  });

  return (
    <SettingsPageShell
      icon={<ShieldCheck />}
      subtitle={t("settings.security.pageSubtitle", {
        defaultValue:
          "Contraseñas, cierre por inactividad y las protecciones de la plataforma.",
      })}
      title={t("settings.security.pageTitle", { defaultValue: "Seguridad" })}
    >
      {loading || !password || !session ? (
        <SkeletonCards className="sm:grid-cols-1" count={3} />
      ) : (
        <div className="space-y-6">
          <section className="glass-flat rounded-2xl p-5">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <KeyRound size={15} />{" "}
              {t("settings.security.passwordsHeading", {
                defaultValue: "Contraseñas",
              })}
            </h3>
            <p className="mb-3 text-xs" style={{ color: "var(--ink-soft)" }}>
              {t("settings.security.passwordsHint", {
                defaultValue:
                  "Aplica a contraseñas nuevas y cambios. La plataforma ya exige un mínimo que no se puede aflojar — aquí solo se puede endurecer.",
              })}
            </p>
            <div className="mb-3 max-w-xs">
              <Label className="text-xs">
                {t("settings.security.minLengthLabel", {
                  defaultValue: "Longitud mínima (piso: {{floor}})",
                  floor: limites.passwordMinLength ?? 8,
                })}
              </Label>
              <Input
                aria-invalid={!minLengthValid}
                disabled={disabled}
                max={minCeiling}
                min={minFloor}
                step={1}
                type="number"
                value={password.minLength}
                onChange={(e) =>
                  setPassword(
                    (p) => p && { ...p, minLength: Number(e.target.value) },
                  )
                }
              />
              {!minLengthValid && (
                <p className="mt-1 text-xs" style={{ color: "var(--bad-text)" }}>
                  {t("settings.security.minLengthOutOfRange", {
                    defaultValue:
                      "La longitud mínima tiene que ser un número entre {{min}} y {{max}}.",
                    min: minFloor,
                    max: minCeiling,
                  })}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <ToggleRow
                checked={password.requireUppercase}
                disabled={disabled || !!suelo.requireUppercase}
                hint={suelo.requireUppercase ? requiredByPlatform : undefined}
                label={t("settings.security.requireUppercase", {
                  defaultValue: "Exigir mayúsculas",
                })}
                onCheckedChange={(v: boolean) =>
                  setPassword((p) => p && { ...p, requireUppercase: v })
                }
              />
              <ToggleRow
                checked={password.requireLowercase}
                disabled={disabled || !!suelo.requireLowercase}
                hint={suelo.requireLowercase ? requiredByPlatform : undefined}
                label={t("settings.security.requireLowercase", {
                  defaultValue: "Exigir minúsculas",
                })}
                onCheckedChange={(v: boolean) =>
                  setPassword((p) => p && { ...p, requireLowercase: v })
                }
              />
              <ToggleRow
                checked={password.requireNumber}
                disabled={disabled || !!suelo.requireNumber}
                hint={suelo.requireNumber ? requiredByPlatform : undefined}
                label={t("settings.security.requireNumber", {
                  defaultValue: "Exigir números",
                })}
                onCheckedChange={(v: boolean) =>
                  setPassword((p) => p && { ...p, requireNumber: v })
                }
              />
              <ToggleRow
                checked={password.requireSymbol}
                disabled={disabled || !!suelo.requireSymbol}
                hint={suelo.requireSymbol ? requiredByPlatform : undefined}
                label={t("settings.security.requireSymbol", {
                  defaultValue: "Exigir símbolos",
                })}
                onCheckedChange={(v: boolean) =>
                  setPassword((p) => p && { ...p, requireSymbol: v })
                }
              />
            </div>
          </section>

          <section className="glass-flat rounded-2xl p-5">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <TimerOff size={15} />{" "}
              {t("settings.security.idleHeading", {
                defaultValue: "Cierre por inactividad",
              })}
            </h3>
            <p className="mb-3 text-xs" style={{ color: "var(--ink-soft)" }}>
              {t("settings.security.idleHint", {
                defaultValue:
                  "Cierra la sesión del CRM cuando nadie lo usa — el navegador de una recepción no se queda abierto un mes. Las apps de los vigilantes no se ven afectadas.",
              })}
            </p>
            <div className="mb-2 max-w-xs">
              <Label className="text-xs">
                {t("settings.security.closeAfterLabel", {
                  defaultValue: "Cerrar tras",
                })}
              </Label>
              <select
                className="cg-input w-full"
                disabled={disabled}
                value={session.idleTimeoutMinutes}
                onChange={(e) =>
                  setSession(
                    (s) =>
                      s && { ...s, idleTimeoutMinutes: Number(e.target.value) },
                  )
                }
              >
                {IDLE_OPCIONES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {t(`settings.security.idleOption_${v}`, {
                      defaultValue: l,
                    })}
                  </option>
                ))}
              </select>
            </div>
            <ToggleRow
              checked={session.warnBeforeLogout}
              disabled={disabled || session.idleTimeoutMinutes === 0}
              label={t("settings.security.warnBeforeLogout", {
                defaultValue: "Avisar 2 minutos antes de cerrar",
              })}
              onCheckedChange={(v: boolean) =>
                setSession((s) => s && { ...s, warnBeforeLogout: v })
              }
            />
          </section>

          <section className="glass-flat rounded-2xl p-5">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <ToggleLeft size={15} />{" "}
              {t("settings.security.platformHeading", {
                defaultValue: "Protecciones de la plataforma",
              })}
            </h3>
            <p className="mb-3 text-xs" style={{ color: "var(--ink-soft)" }}>
              {t("settings.security.platformHint", {
                defaultValue:
                  "Las administra {{marca}} para todas las empresas. Aquí puedes ver si están activas.",
                marca: nombreDeMarca,
              })}
            </p>
            <div className="space-y-3">
              {platform.map((sw) => (
                <div
                  key={sw.clave}
                  className="flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{sw.nombre}</p>
                    <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                      {sw.descripcion}
                    </p>
                  </div>
                  <StatusBadge tone={sw.activo ? "ok" : "neutral"}>
                    {sw.activo
                      ? t("settings.security.statusActive", {
                          defaultValue: "Activa",
                        })
                      : t("settings.security.statusInactive", {
                          defaultValue: "Inactiva",
                        })}
                  </StatusBadge>
                </div>
              ))}
            </div>
          </section>

          <SaveBar disabled={disabled} saving={saving} onSave={save} />
        </div>
      )}
    </SettingsPageShell>
  );
}
