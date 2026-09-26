/**
 * Configuración Global de Vigilantes — REAL rules only.
 *
 * Guarda settings.guardSettings vía el PUT /settings existente (saneado en el
 * backend por guardSettingsService). Cada control tiene motor de verdad:
 *  - inactivityAlert/-ThresholdMin → barrido cada 5 min (guard.inactive)
 *  - shiftRemindersEnabled + shiftReminderOffsets → recordatorios de turno
 *  - licenseExpiryAlert/-Days → barrido diario de credenciales (aviso a RRHH)
 *  - relevoEnabled + relevoAuto* + relevoSupervisorAlertMin → cambio de turno
 *    (entrega y aceptación del puesto, marcaje por ubicación, avisos después
 *    de la hora de entrada)
 * Lo que vive en otras páginas se enlaza, no se duplica. Reemplaza el clon
 * de 25 toggles falsos (4 tabs, botón Guardar sin handler).
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ShieldCheck,
  SatelliteDish,
  BellRing,
  IdCard,
  MapPin,
  Route as RouteIcon,
  Smartphone,
  Wallet,
  CalendarClock,
  Gauge,
  Repeat,
} from "lucide-react";
import { Section, Stagger, SkeletonCards } from "@/components/kit";
import SettingsPageShell from "../components/SettingsPageShell";
import {
  ToggleRow,
  NumberRow,
  SettingDetail,
  SaveBar,
} from "../components/SettingsForm";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";
import api from "@/lib/api";

type Offset = "2d" | "1d" | "12h" | "1h" | "10m";

/** Los cinco avisos, en orden. Igual que REMINDER_OFFSETS del backend. */
const AVISOS: { key: Offset; label: string; hint: string }[] = [
  { key: "2d", label: "2 días antes", hint: "Llega durante el descanso." },
  { key: "1d", label: "1 día antes", hint: "Para organizar el día siguiente." },
  { key: "12h", label: "12 horas antes", hint: "" },
  {
    key: "1h",
    label: "1 hora antes",
    hint: "Suele ser el único que hace falta.",
  },
  {
    key: "10m",
    label: "10 minutos antes",
    hint: "Justo antes de marcar entrada.",
  },
];

type GuardSettings = {
  inactivityAlert: boolean;
  inactivityThresholdMin: number;
  shiftRemindersEnabled: boolean;
  shiftRemindersAdaptive: boolean;
  shiftReminderOffsets: Offset[];
  licenseExpiryAlert: boolean;
  licenseExpiryDays: number;
  blockClockInOnExpiredLicense: boolean;
  performanceScoringEnabled: boolean;
  relevoEnabled: boolean;
  relevoAutoClockIn: boolean;
  relevoAutoClockOut: boolean;
  /** Null mientras se borra el campo para escribir otro número; se sanea al guardar. */
  relevoSupervisorAlertMin: number | null;
};

/** Límites del aviso al supervisor; los mismos que sanea el backend. */
const RELEVO_ALERT_MIN = 5;
const RELEVO_ALERT_MAX = 120;
const RELEVO_ALERT_DEFAULT = 20;

function minutosDeAviso(v: number | null | undefined): number {
  const n = Math.round(Number(v));

  if (!Number.isFinite(n) || n <= 0) return RELEVO_ALERT_DEFAULT;

  return Math.min(RELEVO_ALERT_MAX, Math.max(RELEVO_ALERT_MIN, n));
}

const DEFAULTS: GuardSettings = {
  inactivityAlert: false,
  inactivityThresholdMin: 20,
  shiftRemindersEnabled: true,
  shiftRemindersAdaptive: false,
  // Los cinco, como hasta hoy. Poner aquí un defecto «sensato» cambiaría de
  // golpe lo que recibe gente que no lo pidió.
  shiftReminderOffsets: ["2d", "1d", "12h", "1h", "10m"],
  licenseExpiryAlert: true,
  licenseExpiryDays: 30,
  // Apagado, igual que en el backend: encenderlo de oficio dejaría sin fichar
  // a toda plantilla con las fechas de credencial mal cargadas.
  blockClockInOnExpiredLicense: false,
  // Encendido, igual que en el backend: es como se ha comportado siempre.
  performanceScoringEnabled: true,
  // Apagado, igual que en el backend: con él apagado nadie nota nada. Los
  // tres de abajo sólo cuentan cuando la empresa lo enciende.
  relevoEnabled: false,
  relevoAutoClockIn: true,
  relevoAutoClockOut: true,
  relevoSupervisorAlertMin: RELEVO_ALERT_DEFAULT,
};

// Partial view of the tenant settings blob (GET/PUT /settings). Only the fields
// this page round-trips are named; the backend recomputes logoUrl from logos[0].
type SettingsRow = {
  theme?: string;
  logos?: unknown[];
  backgroundImages?: unknown[];
  guardSettings?: Partial<GuardSettings>;
};

const tenantId = () => localStorage.getItem("tenantId") || "";

export default function GuardsGlobalSettingsPage() {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("settingsEdit");

  const [cfg, setCfg] = useState<GuardSettings>(DEFAULTS);
  const [row, setRow] = useState<SettingsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/tenant/${tenantId()}/settings`);
        setRow(data || {});
        setCfg({ ...DEFAULTS, ...((data && data.guardSettings) || {}) });
      } catch {
        toast.error(
          t("settings.guardsGlobal.loadError", {
            defaultValue: "No se pudo cargar la configuración.",
          }),
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = <K extends keyof GuardSettings>(k: K, v: GuardSettings[K]) =>
    setCfg((c) => ({ ...c, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/tenant/${tenantId()}/settings`, {
        settings: {
          theme: row?.theme || "default",
          // Round-trip file relations untouched — the backend recomputes
          // logoUrl from logos[0], so omitting them would ERASE the logo.
          logos: row?.logos || [],
          backgroundImages: row?.backgroundImages || [],
          guardSettings: {
            ...cfg,
            relevoSupervisorAlertMin: minutosDeAviso(
              cfg.relevoSupervisorAlertMin,
            ),
          },
        },
      });
      toast.success(
        t("settings.guardsGlobal.saveSuccess", {
          defaultValue:
            "Configuración de vigilantes guardada. Aplica de inmediato.",
        }),
      );
    } catch (e: any) {
      toast.error(
        e?.response?.data?.message ||
          t("settings.guardsGlobal.saveError", {
            defaultValue: "No se pudo guardar.",
          }),
      );
    } finally {
      setSaving(false);
    }
  };

  const disabled = !canEdit || loading;

  return (
    <SettingsPageShell
      icon={<ShieldCheck />}
      title={t("settings.guardsGlobal.pageTitle", {
        defaultValue: "Configuración Global de Vigilantes",
      })}
      subtitle={t("settings.guardsGlobal.pageSubtitle", {
        defaultValue:
          "Estas preferencias aplican a todos los vigilantes de tu empresa.",
      })}
    >
      {loading ? (
        <SkeletonCards count={4} className="sm:grid-cols-1" />
      ) : (
        <Stagger className="space-y-6">
          <Section
            title={t("settings.guardsGlobal.sectionSupervision", {
              defaultValue: "Supervisión en tiempo real",
            })}
            icon={<SatelliteDish />}
            contentClassName="divide-y"
          >
            <ToggleRow
              label={t("settings.guardsGlobal.inactivityLabel", {
                defaultValue: "Alerta de inactividad en turno",
              })}
              hint={t("settings.guardsGlobal.inactivityHint", {
                defaultValue:
                  "Avisa a los supervisores cuando un vigilante o supervisor de servicio deja de reportar ubicación (teléfono apagado, sin señal o app cerrada). La alerta llega al panel, a las apps y por correo/SMS según tus canales de notificación.",
              })}
              checked={cfg.inactivityAlert}
              onCheckedChange={(v) => set("inactivityAlert", v)}
              disabled={disabled}
            >
              {cfg.inactivityAlert && (
                <SettingDetail>
                  <span
                    className="text-sm"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {t("settings.guardsGlobal.alertAfter", {
                      defaultValue: "Alertar tras",
                    })}
                  </span>
                  <Select
                    value={String(cfg.inactivityThresholdMin)}
                    onValueChange={(v) =>
                      set("inactivityThresholdMin", Number(v))
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">
                        {t("settings.guardsGlobal.min10", {
                          defaultValue: "10 minutos",
                        })}
                      </SelectItem>
                      <SelectItem value="15">
                        {t("settings.guardsGlobal.min15", {
                          defaultValue: "15 minutos",
                        })}
                      </SelectItem>
                      <SelectItem value="20">
                        {t("settings.guardsGlobal.min20", {
                          defaultValue: "20 minutos",
                        })}
                      </SelectItem>
                      <SelectItem value="30">
                        {t("settings.guardsGlobal.min30", {
                          defaultValue: "30 minutos",
                        })}
                      </SelectItem>
                      <SelectItem value="60">
                        {t("settings.guardsGlobal.hour1", {
                          defaultValue: "1 hora",
                        })}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <span
                    className="text-sm"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {t("settings.guardsGlobal.noSignal", {
                      defaultValue: "sin señal",
                    })}
                  </span>
                </SettingDetail>
              )}
            </ToggleRow>
          </Section>

          <Section
            title={t("settings.guardsGlobal.sectionReminders", {
              defaultValue: "Recordatorios de turno",
            })}
            icon={<CalendarClock />}
            contentClassName="divide-y"
          >
            <ToggleRow
              label={t("settings.guardsGlobal.remindersLabel", {
                defaultValue: "Recordar a los vigilantes sus próximos turnos",
              })}
              hint={t("settings.guardsGlobal.remindersHint", {
                defaultValue:
                  "Avisos automáticos antes de cada turno, para que nadie falte después de sus días de descanso.",
              })}
              checked={cfg.shiftRemindersEnabled}
              onCheckedChange={(v) => set("shiftRemindersEnabled", v)}
              disabled={disabled}
            >
              {cfg.shiftRemindersEnabled && (
                <SettingDetail className="flex-col items-stretch gap-0">
                  <p className="mb-1 text-sm font-medium">
                    {t("settings.guardsGlobal.whichSent", {
                      defaultValue: "¿Cuáles se envían?",
                    })}
                  </p>
                  <p
                    className="mb-2 text-xs"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {t("settings.guardsGlobal.remindersExplain", {
                      defaultValue:
                        "Cada uno marcado es un mensaje por turno y por vigilante. Con veinte turnos al mes, los cinco son cien mensajes a cada persona.",
                    })}
                  </p>
                  <div className="flex flex-col gap-1">
                    {AVISOS.map((a) => {
                      const on = cfg.shiftReminderOffsets.includes(a.key);
                      return (
                        <label
                          key={a.key}
                          className="flex cursor-pointer items-center gap-2.5 py-1.5"
                        >
                          <input
                            type="checkbox"
                            className="cg-focus h-4 w-4"
                            checked={on}
                            disabled={disabled}
                            onChange={() =>
                              set(
                                "shiftReminderOffsets",
                                on
                                  ? cfg.shiftReminderOffsets.filter(
                                      (k) => k !== a.key,
                                    )
                                  : AVISOS.map((x) => x.key).filter(
                                      (k) =>
                                        k === a.key ||
                                        cfg.shiftReminderOffsets.includes(k),
                                    ),
                              )
                            }
                          />
                          <span className="text-sm">
                            {t(`settings.guardsGlobal.aviso_${a.key}_label`, {
                              defaultValue: a.label,
                            })}
                          </span>
                          {a.hint && (
                            <span
                              className="text-xs"
                              style={{ color: "var(--ink-faint)" }}
                            >
                              {t(`settings.guardsGlobal.aviso_${a.key}_hint`, {
                                defaultValue: a.hint,
                              })}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                  <p
                    className="mt-2 text-xs"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {cfg.shiftReminderOffsets.length === 0
                      ? t("settings.guardsGlobal.noneSelected", {
                          defaultValue:
                            "Sin ninguno marcado no se envía ningún recordatorio.",
                        })
                      : t("settings.guardsGlobal.messagesPerShift", {
                          defaultValue:
                            "{{count}} mensaje por turno y por vigilante.",
                          defaultValue_other:
                            "{{count}} mensajes por turno y por vigilante.",
                          count: cfg.shiftReminderOffsets.length,
                          n: cfg.shiftReminderOffsets.length,
                          plural:
                            cfg.shiftReminderOffsets.length === 1 ? "" : "s",
                        })}
                  </p>
                </SettingDetail>
              )}
            </ToggleRow>
            <ToggleRow
              label={t("settings.guardsGlobal.adaptiveLabel", {
                defaultValue: "Recordatorios adaptativos según puntualidad",
              })}
              hint={t("settings.guardsGlobal.adaptiveHint", {
                defaultValue:
                  "El vigilante sin tardanzas ni inasistencias en 30 días recibe solo «1 día antes» y «1 hora antes»; el reincidente, todos los activos. Menos ruido para quien no lo necesita — y los avisos vuelven a significar algo.",
              })}
              checked={cfg.shiftRemindersAdaptive}
              onCheckedChange={(v) => set("shiftRemindersAdaptive", v)}
              disabled={disabled || !cfg.shiftRemindersEnabled}
            />
          </Section>

          <Section
            title={t("settings.guardsGlobal.sectionRelevo", {
              defaultValue: "Cambio de turno",
            })}
            icon={<Repeat />}
            contentClassName="divide-y"
          >
            <ToggleRow
              label={t("settings.guardsGlobal.relevoLabel", {
                defaultValue: "Entrega y aceptación del puesto",
              })}
              hint={t("settings.guardsGlobal.relevoHint", {
                defaultValue:
                  "El vigilante que sale entrega el puesto desde su teléfono y el que entra lo acepta: aceptar es su marca de entrada. Si nadie marca, la app le insiste y avisa al supervisor.",
              })}
              checked={cfg.relevoEnabled}
              onCheckedChange={(v) => set("relevoEnabled", v)}
              disabled={disabled}
            />
            <ToggleRow
              label={t("settings.guardsGlobal.relevoAutoInLabel", {
                defaultValue: "Marcar la entrada sola al llegar al puesto",
              })}
              hint={t("settings.guardsGlobal.relevoAutoInHint", {
                defaultValue:
                  "Si el vigilante llega a su puesto y a los 15 minutos todavía no ha marcado, se registra su entrada a la hora en que llegó.",
              })}
              checked={cfg.relevoAutoClockIn}
              onCheckedChange={(v) => set("relevoAutoClockIn", v)}
              disabled={disabled || !cfg.relevoEnabled}
            />
            <ToggleRow
              label={t("settings.guardsGlobal.relevoAutoOutLabel", {
                defaultValue: "Marcar la salida sola al irse del puesto",
              })}
              hint={t("settings.guardsGlobal.relevoAutoOutHint", {
                defaultValue:
                  "Cuando el vigilante se va del puesto al final de su turno, se registra su salida a la hora en que se fue. Si se va antes de hora y no vuelve en 15 minutos, queda como salida anticipada.",
              })}
              checked={cfg.relevoAutoClockOut}
              onCheckedChange={(v) => set("relevoAutoClockOut", v)}
              disabled={disabled || !cfg.relevoEnabled}
            />
            <NumberRow
              label={t("settings.guardsGlobal.relevoAlertLabel", {
                defaultValue:
                  "Avisar al supervisor si el vigilante no marca en",
              })}
              hint={t("settings.guardsGlobal.relevoAlertHint", {
                defaultValue:
                  "Minutos desde la hora de entrada. Entre 5 y 120.",
              })}
              value={cfg.relevoSupervisorAlertMin}
              onChange={(n) => set("relevoSupervisorAlertMin", n)}
              min={RELEVO_ALERT_MIN}
              max={RELEVO_ALERT_MAX}
              suffix={t("settings.guardsGlobal.relevoAlertSuffix", {
                defaultValue: "minutos",
              })}
              disabled={disabled || !cfg.relevoEnabled}
            />
          </Section>

          <Section
            title={t("settings.guardsGlobal.sectionDesempeno", {
              defaultValue: "Medición de desempeño",
            })}
            icon={<Gauge />}
            contentClassName="divide-y"
          >
            <ToggleRow
              label={t("settings.guardsGlobal.performanceLabel", {
                defaultValue: "Medir el desempeño del personal",
              })}
              hint={t("settings.guardsGlobal.performanceHint", {
                defaultValue:
                  "Todo el personal arranca en 100 y sólo baja por lo que se mide: puntualidad, uniforme, inventario, consignas, rondas, evaluaciones, capacitación y la valoración del cliente, más las faltas. Apagado, nadie ve puntaje —ni tú en las fichas, ni el vigilante en su aplicación—; no se pone a cero, deja de existir. Para dejar de medir a UNA persona en concreto, usa el interruptor de su ficha, en Desempeño.",
              })}
              checked={cfg.performanceScoringEnabled}
              onCheckedChange={(v) => set("performanceScoringEnabled", v)}
              disabled={disabled}
            />
          </Section>

          <Section
            title={t("settings.guardsGlobal.sectionCredenciales", {
              defaultValue: "Credenciales y licencias",
            })}
            icon={<IdCard />}
            contentClassName="divide-y"
          >
            <ToggleRow
              label={t("settings.guardsGlobal.licenseAlertLabel", {
                defaultValue: "Avisar cuando una credencial esté por vencer",
              })}
              hint={t("settings.guardsGlobal.licenseAlertHint", {
                defaultValue:
                  "RR.HH. recibe un aviso semanal por cada credencial o licencia próxima a vencer (o ya vencida) hasta que se renueve. Las credenciales se registran en el perfil de cada vigilante.",
              })}
              checked={cfg.licenseExpiryAlert}
              onCheckedChange={(v) => set("licenseExpiryAlert", v)}
              disabled={disabled}
            >
              {cfg.licenseExpiryAlert && (
                <SettingDetail>
                  <span
                    className="text-sm"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {t("settings.guardsGlobal.startWarning", {
                      defaultValue: "Empezar a avisar",
                    })}
                  </span>
                  <Input
                    type="number"
                    min={7}
                    max={120}
                    className="w-24"
                    value={cfg.licenseExpiryDays}
                    onChange={(e) =>
                      set("licenseExpiryDays", Number(e.target.value) || 30)
                    }
                    disabled={disabled}
                  />
                  <span
                    className="text-sm"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {t("settings.guardsGlobal.daysBeforeExpiry", {
                      defaultValue: "días antes del vencimiento",
                    })}
                  </span>
                </SettingDetail>
              )}
            </ToggleRow>
            <ToggleRow
              label={t("settings.guardsGlobal.blockClockInLabel", {
                defaultValue:
                  "Impedir marcar entrada con la credencial vencida",
              })}
              hint={t("settings.guardsGlobal.blockClockInHint", {
                defaultValue:
                  "Hasta ahora una credencial caducada sólo generaba un aviso: el vigilante fichaba igual, se le asignaba un puesto y salía en el informe al cliente. Actívalo sólo cuando las fechas de tus credenciales estén al día — si no, alguien puede quedarse sin poder empezar su turno.",
              })}
              checked={cfg.blockClockInOnExpiredLicense}
              onCheckedChange={(v) => set("blockClockInOnExpiredLicense", v)}
              disabled={disabled}
            />
          </Section>

          {/* Aquí había una rejilla de tarjetas-enlace a otras
                            páginas de ajustes. Era el índice de Configuración
                            redibujado a mano, porque no existía navegación
                            lateral: en esta página había 5 ajustes y 6 enlaces,
                            más señalización que producto. Se quitó al devolver
                            la columna de índice en SettingsLayout. */}

          <SaveBar onSave={save} saving={saving} disabled={disabled} />
        </Stagger>
      )}
    </SettingsPageShell>
  );
}
