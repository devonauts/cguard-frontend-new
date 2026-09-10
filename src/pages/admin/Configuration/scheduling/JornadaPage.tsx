/**
 * Configuración › Operación › Jornada y descanso
 *
 * EL HUECO QUE LLENA: de las 27 páginas de Configuración, NINGUNA cubría la
 * programación de turnos — el corazón del negocio. Las reglas laborales vivían
 * como constantes en el código: el máximo de días consecutivos era un «7»
 * escrito a mano en dos archivos, el descanso mínimo entre turnos no existía, y
 * el tope semanal sólo aparecía como TEXTO dentro del prompt de la IA, sin que
 * nadie lo aplicara.
 *
 * Todo lo de esta pantalla se LEE de verdad: los dos primeros bloques alimentan
 * los avisos del planificador antes de publicar el horario, y los dos
 * interruptores bloquean tanto al TRASLADAR como al CUBRIR un puesto.
 *
 * (Hasta la auditoría del 2026-08-15 sólo bloqueaban al trasladar, que es el
 * camino menos usado: el 90 % de las asignaciones de emergencia entran por
 * «cubrir».)
 *
 * ── LO QUE SE QUITÓ, Y POR QUÉ ────────────────────────────────────────────
 * «La noche empieza a las» estaba aquí y NO LO LEÍA NADIE: el planificador usa
 * un 18 escrito a mano en cuatro archivos. Cablearlo obligaría a pasar el ajuste
 * por todo el motor de horarios y CAMBIARÍA la matemática de cobertura de quien
 * ya opera —cuántos puestos de día y de noche necesita una estación—, así que no
 * es un arreglo de última hora: merece su propio cambio y sus propias pruebas.
 *
 * Mientras tanto se retira, porque un mando desconectado en una pantalla que
 * dice «esto se aplica» enseña a desconfiar de los seis ajustes que sí
 * funcionan. Y además duplicaba un concepto: la hora que de verdad decide
 * dinero es la del recargo nocturno, en Turnos y marcaciones.
 *
 * Los valores por defecto reproducen el comportamiento anterior (7 días; sin
 * límite de descanso ni de horas; doblar y asignar en descanso permitidos), a
 * propósito: publicar esta pantalla no puede encenderle una regla nueva a diez
 * empresas a la vez.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CalendarClock, BedDouble, Ban, Loader2, Save } from "lucide-react";

import { ToggleRow } from "../components/SettingsForm";

import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import {
  PageContainer,
  PageHeader,
  Section,
  SkeletonCards,
  InfoNote,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import api from "@/lib/api";

type Jornada = {
  maxConsecutiveDays: number;
  minRestHoursBetweenShifts: number;
  maxWeeklyHours: number;
  allowDoubleShift: boolean;
  allowRestDayAssignment: boolean;
};

/** Iguales a SCHEDULING_DEFAULTS del backend. Si divergen, la pantalla miente. */
const DEFAULTS: Jornada = {
  maxConsecutiveDays: 7,
  minRestHoursBetweenShifts: 0,
  maxWeeklyHours: 0,
  allowDoubleShift: true,
  allowRestDayAssignment: true,
};

const tenantId = () => localStorage.getItem("tenantId") || "";

/** Campo numérico con su unidad y su explicación. */
function NumRow({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  suffix,
  disabled,
  apagadoEn0,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  suffix: string;
  disabled?: boolean;
  apagadoEn0?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <label className="block py-3.5">
      <span className="text-sm font-medium">{label}</span>
      <p className="mt-0.5 text-xs" style={{ color: "var(--ink-faint)" }}>
        {hint}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <input
          className="cg-input cg-focus w-28 px-3 py-2 text-sm"
          disabled={disabled}
          max={max}
          min={min}
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="text-sm" style={{ color: "var(--ink-soft)" }}>
          {suffix}
        </span>
        {apagadoEn0 && value === 0 && (
          <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
            {t("settings.jornada.reglaDesactivada", {
              defaultValue: "· regla desactivada",
            })}
          </span>
        )}
      </div>
    </label>
  );
}

export default function JornadaPage() {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("settingsEdit");

  const [j, setJ] = useState<Jornada>(DEFAULTS);
  const [row, setRow] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/tenant/${tenantId()}/settings`);

        setRow(data || {});
        setJ({ ...DEFAULTS, ...((data && data.schedulingSettings) || {}) });
      } catch {
        toast.error(
          t("settings.jornada.loadError", {
            defaultValue: "No se pudo cargar la política de jornada.",
          }),
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = <K extends keyof Jornada>(k: K, v: Jornada[K]) =>
    setJ((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/tenant/${tenantId()}/settings`, {
        settings: {
          theme: row?.theme || "default",
          // Se reenvían las relaciones de archivo intactas: el backend recalcula
          // logoUrl desde logos[0], así que omitirlas BORRARÍA el logotipo.
          logos: row?.logos || [],
          backgroundImages: row?.backgroundImages || [],
          schedulingSettings: j,
        },
      });
      toast.success(
        t("settings.jornada.saveSuccess", {
          defaultValue: "Política de jornada guardada.",
        }),
      );
    } catch (e: any) {
      toast.error(
        e?.response?.data?.message ||
          t("settings.jornada.saveError", {
            defaultValue: "No se pudo guardar.",
          }),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <SettingsLayout
        navKey="configuracion"
        title={t("settings.jornada.navTitle", {
          defaultValue: "Jornada y descanso",
        })}
      >
        <PageContainer width="narrow">
          <PageHeader
            icon={<CalendarClock />}
            subtitle={t("settings.jornada.pageSubtitle", {
              defaultValue:
                "Las reglas laborales que el planificador comprueba antes de que publiques un horario.",
            })}
            title={t("settings.jornada.pageTitle", {
              defaultValue: "Jornada y descanso",
            })}
          />

          {loading ? (
            <SkeletonCards count={3} />
          ) : (
            <div className="space-y-5">
              <InfoNote tone="info">
                {t("settings.jornada.infoNote1", {
                  defaultValue: "Estas reglas ",
                })}
                <strong>
                  {t("settings.jornada.infoNoteAvisan", {
                    defaultValue: "avisan",
                  })}
                </strong>
                {t("settings.jornada.infoNote2", {
                  defaultValue:
                    " al publicar el horario; los dos interruptores de abajo sí ",
                })}
                <strong>
                  {t("settings.jornada.infoNoteBloquean", {
                    defaultValue: "bloquean",
                  })}
                </strong>
                {t("settings.jornada.infoNote3", {
                  defaultValue:
                    " al cubrir un puesto. Cambian por país y por contrato colectivo, así que aquí no hay un valor «correcto»: pon el de tu convenio.",
                })}
              </InfoNote>

              <Section
                icon={<BedDouble />}
                title={t("settings.jornada.sectionDescanso", {
                  defaultValue: "Descanso",
                })}
              >
                <div
                  className="divide-y"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  <NumRow
                    disabled={!canEdit}
                    hint={t("settings.jornada.maxConsecutiveDaysHint", {
                      defaultValue:
                        "Pasado ese número sin un día libre, el planificador lo señala antes de publicar.",
                    })}
                    label={t("settings.jornada.maxConsecutiveDaysLabel", {
                      defaultValue: "Máximo de días seguidos de trabajo",
                    })}
                    max={31}
                    min={1}
                    suffix={t("settings.jornada.suffixDias", {
                      defaultValue: "días",
                    })}
                    value={j.maxConsecutiveDays}
                    onChange={(v) => set("maxConsecutiveDays", v)}
                  />
                  <NumRow
                    apagadoEn0
                    disabled={!canEdit}
                    hint={t("settings.jornada.minRestHint", {
                      defaultValue:
                        "Horas que deben pasar entre la salida de un turno y la entrada al siguiente. Sin esto, un vigilante puede salir a las 07:00 y entrar a las 08:00 sin que nada lo señale.",
                    })}
                    label={t("settings.jornada.minRestLabel", {
                      defaultValue: "Descanso mínimo entre turnos",
                    })}
                    max={24}
                    min={0}
                    suffix={t("settings.jornada.suffixHoras", {
                      defaultValue: "horas",
                    })}
                    value={j.minRestHoursBetweenShifts}
                    onChange={(v) => set("minRestHoursBetweenShifts", v)}
                  />
                  <NumRow
                    apagadoEn0
                    disabled={!canEdit}
                    hint={t("settings.jornada.maxWeeklyHint", {
                      defaultValue:
                        "Tope por vigilante. Se cuenta de lunes a domingo.",
                    })}
                    label={t("settings.jornada.maxWeeklyLabel", {
                      defaultValue: "Máximo de horas por semana",
                    })}
                    max={168}
                    min={0}
                    suffix={t("settings.jornada.suffixHoras", {
                      defaultValue: "horas",
                    })}
                    value={j.maxWeeklyHours}
                    onChange={(v) => set("maxWeeklyHours", v)}
                  />
                </div>
              </Section>

              <Section
                icon={<Ban />}
                title={t("settings.jornada.sectionCubrir", {
                  defaultValue: "Qué se puede hacer al cubrir un puesto",
                })}
              >
                <div
                  className="divide-y"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  <ToggleRow
                    checked={j.allowDoubleShift}
                    disabled={!canEdit}
                    hint={t("settings.jornada.allowDoubleHint", {
                      defaultValue:
                        "Asignar a alguien que ya tiene otro turno cruzado en ese horario. Si lo apagas, deja de ser posible aunque se confirme.",
                    })}
                    label={t("settings.jornada.allowDoubleLabel", {
                      defaultValue: "Permitir doblar turno",
                    })}
                    onCheckedChange={(v) => set("allowDoubleShift", v)}
                  />
                  <ToggleRow
                    checked={j.allowRestDayAssignment}
                    disabled={!canEdit}
                    hint={t("settings.jornada.allowRestHint", {
                      defaultValue:
                        "Cubrir un hueco con alguien que ese día libra. Si lo apagas, deja de ser posible aunque se confirme.",
                    })}
                    label={t("settings.jornada.allowRestLabel", {
                      defaultValue: "Permitir asignar en día de descanso",
                    })}
                    onCheckedChange={(v) => set("allowRestDayAssignment", v)}
                  />
                </div>
              </Section>

              <div className="flex justify-end">
                <Button
                  disabled={!canEdit || saving}
                  variant="brand"
                  onClick={save}
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {t("settings.jornada.saveBtn", {
                    defaultValue: "Guardar política",
                  })}
                </Button>
              </div>
            </div>
          )}
        </PageContainer>
      </SettingsLayout>
    </AppLayout>
  );
}
