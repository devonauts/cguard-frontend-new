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
 * interruptores bloquean de verdad en el tablero de cobertura.
 *
 * Los valores por defecto reproducen el comportamiento anterior (7 días; sin
 * límite de descanso ni de horas; doblar y asignar en descanso permitidos), a
 * propósito: publicar esta pantalla no puede encenderle una regla nueva a diez
 * empresas a la vez.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, BedDouble, Ban, Loader2, Save } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import { PageContainer, PageHeader, Section, SkeletonCards, InfoNote } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { ToggleRow } from "../components/SettingsForm";
import { usePermissions } from "@/hooks/usePermissions";
import api from "@/lib/api";

type Jornada = {
  maxConsecutiveDays: number;
  minRestHoursBetweenShifts: number;
  maxWeeklyHours: number;
  allowDoubleShift: boolean;
  allowRestDayAssignment: boolean;
  nightBoundaryHour: number;
};

/** Iguales a SCHEDULING_DEFAULTS del backend. Si divergen, la pantalla miente. */
const DEFAULTS: Jornada = {
  maxConsecutiveDays: 7,
  minRestHoursBetweenShifts: 0,
  maxWeeklyHours: 0,
  allowDoubleShift: true,
  allowRestDayAssignment: true,
  nightBoundaryHour: 18,
};

const tenantId = () => localStorage.getItem("tenantId") || "";

/** Campo numérico con su unidad y su explicación. */
function NumRow({
  label, hint, value, onChange, min, max, suffix, disabled, apagadoEn0,
}: {
  label: string; hint: string; value: number; onChange: (v: number) => void;
  min: number; max: number; suffix: string; disabled?: boolean; apagadoEn0?: boolean;
}) {
  return (
    <label className="block py-3.5">
      <span className="text-sm font-medium">{label}</span>
      <p className="mt-0.5 text-xs" style={{ color: "var(--ink-faint)" }}>{hint}</p>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="cg-input cg-focus w-28 px-3 py-2 text-sm"
        />
        <span className="text-sm" style={{ color: "var(--ink-soft)" }}>{suffix}</span>
        {apagadoEn0 && value === 0 && (
          <span className="text-xs" style={{ color: "var(--ink-faint)" }}>· regla desactivada</span>
        )}
      </div>
    </label>
  );
}

export default function JornadaPage() {
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
        toast.error("No se pudo cargar la política de jornada.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = <K extends keyof Jornada>(k: K, v: Jornada[K]) => setJ((p) => ({ ...p, [k]: v }));

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
      toast.success("Política de jornada guardada.");
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <SettingsLayout navKey="configuracion" title="Jornada y descanso">
        <PageContainer width="narrow">
          <PageHeader
            icon={<CalendarClock />}
            title="Jornada y descanso"
            subtitle="Las reglas laborales que el planificador comprueba antes de que publiques un horario."
          />

          {loading ? (
            <SkeletonCards count={3} />
          ) : (
            <div className="space-y-5">
              <InfoNote tone="info">
                Estas reglas <strong>avisan</strong> al publicar el horario; los dos
                interruptores de abajo sí <strong>bloquean</strong> al cubrir un puesto.
                Cambian por país y por contrato colectivo, así que aquí no hay un valor
                «correcto»: pon el de tu convenio.
              </InfoNote>

              <Section title="Descanso" icon={<BedDouble />}>
                <div className="divide-y" style={{ borderColor: "var(--hairline)" }}>
                  <NumRow
                    label="Máximo de días seguidos de trabajo"
                    hint="Pasado ese número sin un día libre, el planificador lo señala antes de publicar."
                    value={j.maxConsecutiveDays}
                    onChange={(v) => set("maxConsecutiveDays", v)}
                    min={1} max={31} suffix="días" disabled={!canEdit}
                  />
                  <NumRow
                    label="Descanso mínimo entre turnos"
                    hint="Horas que deben pasar entre la salida de un turno y la entrada al siguiente. Sin esto, un vigilante puede salir a las 07:00 y entrar a las 08:00 sin que nada lo señale."
                    value={j.minRestHoursBetweenShifts}
                    onChange={(v) => set("minRestHoursBetweenShifts", v)}
                    min={0} max={24} suffix="horas" disabled={!canEdit} apagadoEn0
                  />
                  <NumRow
                    label="Máximo de horas por semana"
                    hint="Tope por vigilante. Se cuenta de lunes a domingo."
                    value={j.maxWeeklyHours}
                    onChange={(v) => set("maxWeeklyHours", v)}
                    min={0} max={168} suffix="horas" disabled={!canEdit} apagadoEn0
                  />
                </div>
              </Section>

              <Section title="Qué se puede hacer al cubrir un puesto" icon={<Ban />}>
                <div className="divide-y" style={{ borderColor: "var(--hairline)" }}>
                  <ToggleRow
                    label="Permitir doblar turno"
                    hint="Asignar a alguien que ya tiene otro turno cruzado en ese horario. Si lo apagas, deja de ser posible aunque se confirme."
                    checked={j.allowDoubleShift}
                    onCheckedChange={(v) => set("allowDoubleShift", v)}
                    disabled={!canEdit}
                  />
                  <ToggleRow
                    label="Permitir asignar en día de descanso"
                    hint="Cubrir un hueco con alguien que ese día libra. Si lo apagas, deja de ser posible aunque se confirme."
                    checked={j.allowRestDayAssignment}
                    onCheckedChange={(v) => set("allowRestDayAssignment", v)}
                    disabled={!canEdit}
                  />
                </div>
              </Section>

              <Section title="Frontera día / noche" icon={<CalendarClock />}>
                <div className="divide-y" style={{ borderColor: "var(--hairline)" }}>
                  <NumRow
                    label="La noche empieza a las"
                    hint="Con esta hora el planificador clasifica un turno como diurno o nocturno."
                    value={j.nightBoundaryHour}
                    onChange={(v) => set("nightBoundaryHour", v)}
                    min={0} max={23} suffix="h" disabled={!canEdit}
                  />
                </div>
                <InfoNote tone="warn" className="mt-3">
                  El recargo nocturno de la nómina usa su propia hora, en
                  Turnos y marcaciones. Si no coinciden, un mismo turno puede
                  clasificarse como diurno y pagarse con recargo de noche.
                </InfoNote>
              </Section>

              <div className="flex justify-end">
                <Button variant="brand" onClick={save} disabled={!canEdit || saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Guardar política
                </Button>
              </div>
            </div>
          )}
        </PageContainer>
      </SettingsLayout>
    </AppLayout>
  );
}
