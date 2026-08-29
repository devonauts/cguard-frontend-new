import { useEffect, useState } from "react";
import { useTranslation } from 'react-i18next';
import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import attendanceService from "@/lib/api/attendanceService";
import { Section, FadeIn, SkeletonCards } from "@/components/kit";
import {
  Loader2,
  SlidersHorizontal,
  Timer,
  MapPinned,
  BellRing,
  CheckSquare,
  CalendarRange,
} from "lucide-react";


interface NominaSettings {
  general?: {
    timeClockEnabled?: boolean;
    requireSelfie?: boolean;
    requireNotesOnException?: boolean;
  };
  windows?: {
    earlyClockInMin?: number;
    lateGraceMin?: number;
    earlyClockoutThresholdMin?: number;
    missedClockoutThresholdMin?: number;
    noShowThresholdMin?: number;
  };
  geofence?: {
    defaultRadiusM?: number;
    requireValidation?: boolean;
    allowOutsideWithApproval?: boolean;
  };
  notifications?: {
    assignedSupervisorsOnly?: boolean;
    customEmails?: string[];
  };
  approval?: {
    autoApproveNormal?: boolean;
    requireApprovalForExceptions?: boolean;
    lockAfterPayrollClose?: boolean;
  };
  payroll?: {
    periodType?: string;
    startDayOfWeek?: number;
    currency?: string;
    defaultHourlyRate?: number;
    overtimeMultiplier?: number;
    nightSurchargePct?: number;
    nightStartHour?: number;
    nightEndHour?: number;
    overtimeThresholdHours?: number;
    roundingMinutes?: number;
  };
}

// The Num/Toggle inputs address nested settings by a dotted string path, so a
// record view is used for the dynamic index (the typed interface can't be
// indexed by an arbitrary string).
type SettingsRecord = Record<string, Record<string, unknown> | undefined>;

function set<T extends object>(obj: T, path: string, value: unknown): T {
  const next = { ...obj } as Record<string, Record<string, unknown>>;
  const [a, b] = path.split(".");
  next[a] = { ...(next[a] || {}), [b]: value };
  return next as unknown as T;
}

export default function NominaSettings() {
  const { t } = useTranslation();
  const [s, setS] = useState<NominaSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    attendanceService
      .getSettings()
      .then((d) => setS(d))
      .catch((e) => toast.error(e?.message || "Error al cargar"))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await attendanceService.saveSettings((s ?? {}) as Record<string, unknown>);
      setS(saved);
      toast.success(t('comun.configuracionGuardada'));
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const Num = ({ label, path }: { label: string; path: string }) => {
    const [a, b] = path.split(".");
    return (
      <label className="block">
        <span className="cg-eyebrow">{label}</span>
        <input
          type="number"
          value={((s as unknown as SettingsRecord | null)?.[a]?.[b] as number | undefined) ?? 0}
          onChange={(e) => setS((prev) => set(prev as NominaSettings, path, Number(e.target.value)))}
          className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm tabular-nums"
        />
      </label>
    );
  };

  const Toggle = ({ label, path }: { label: string; path: string }) => {
    const [a, b] = path.split(".");
    return (
      <label className="glass-flat glass-hover flex cursor-pointer items-center gap-2.5 px-3 py-2.5">
        <input
          type="checkbox"
          checked={!!(s as unknown as SettingsRecord | null)?.[a]?.[b]}
          onChange={(e) => setS((prev) => set(prev as NominaSettings, path, e.target.checked))}
          className="cg-focus size-4"
          style={{ accentColor: "var(--brand)" }}
        />
        <span className="text-sm">{label}</span>
      </label>
    );
  };

  const SettingsSection = ({
    title,
    icon,
    children,
  }: {
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <Section title={title} icon={icon}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </Section>
  );

  return (
    <AppLayout>
      <SettingsLayout navKey="configuracion" title={t('ui.NominaSettings.asistenciaTimeAttendance')}>
        {loading || !s ? (
          <SkeletonCards count={4} />
        ) : (
          <FadeIn className="space-y-4 pb-28">
            <SettingsSection title="General" icon={<SlidersHorizontal />}>
              <Toggle label={t('ui.NominaSettings.relojDeAsistenciaHabilitado')} path="general.timeClockEnabled" />
              <Toggle label="Requerir selfie al marcar" path="general.requireSelfie" />
              <Toggle label={t('ui.NominaSettings.requerirNotasEnExcepciones')} path="general.requireNotesOnException" />
            </SettingsSection>

            <SettingsSection title={t('ui.NominaSettings.ventanasDeTiempoMinutos', 'Ventanas de tiempo (minutos)')} icon={<Timer />}>
              <Num label="Entrada anticipada permitida" path="windows.earlyClockInMin" />
              <Num label={t('ui.NominaSettings.toleranciaDeRetrasoGracia', 'Tolerancia de retraso (gracia)')} path="windows.lateGraceMin" />
              <Num label={t('ui.NominaSettings.umbralDeSalidaAnticipada', 'Umbral de salida anticipada')} path="windows.earlyClockoutThresholdMin" />
              <Num label={t('ui.NominaSettings.umbralSinMarcarSalida')} path="windows.missedClockoutThresholdMin" />
              <Num label={t('ui.NominaSettings.umbralInasistenciaNoShow', 'Umbral inasistencia (no-show)')} path="windows.noShowThresholdMin" />
            </SettingsSection>

            <SettingsSection title="Geocerca" icon={<MapPinned />}>
              <Num label={t('ui.NominaSettings.radioPorDefectoM')} path="geofence.defaultRadiusM" />
              <Toggle label={t("ui.NominaSettings.requerirValidacionDeGeocerca", "Requerir validación de geocerca")} path="geofence.requireValidation" />
              <Toggle label={t("ui.NominaSettings.permitirFueraDeGeocercaCon", "Permitir fuera de geocerca (con aprobación)")} path="geofence.allowOutsideWithApproval" />
            </SettingsSection>

            <SettingsSection title="Notificaciones" icon={<BellRing />}>
              <Toggle label={t('ui.NominaSettings.notificarSoloAlSupervisorAsignado')} path="notifications.assignedSupervisorsOnly" />
              {/* El backend YA enviaba a estos correos (attendanceService y el
                  barrido nocturno los leen); lo que faltaba era el campo para
                  escribirlos. Un ajuste funcional e inalcanzable es el problema
                  inverso al del interruptor muerto, y se nota igual de poco. */}
              <label className="block">
                <span className="cg-eyebrow">{t("ui.NominaSettings.avisarAdemasAEstosCorreos", "Avisar además a estos correos")}</span>
                <input
                  type="text"
                  value={(s.notifications?.customEmails || []).join(", ")}
                  onChange={(e) =>
                    setS((p) =>
                      set(
                        p as NominaSettings,
                        "notifications.customEmails",
                        e.target.value
                          .split(",")
                          .map((x) => x.trim())
                          .filter(Boolean),
                      ),
                    )
                  }
                  placeholder={t('ui.NominaSettings.operacionesEmpresaComRrhhEmpresa')}
                  className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs" style={{ color: "var(--ink-faint)" }}>
                  Separados por comas. Reciben las novedades de asistencia además de los supervisores.
                </span>
              </label>
            </SettingsSection>

            <SettingsSection title="Aprobaciones" icon={<CheckSquare />}>
              <Toggle label="Auto-aprobar marcaciones normales" path="approval.autoApproveNormal" />
              <Toggle label={t("ui.NominaSettings.requerirAprobacionParaExcepciones", "Requerir aprobación para excepciones")} path="approval.requireApprovalForExceptions" />
              <Toggle label={t("ui.NominaSettings.bloquearRegistrosAlCerrarLa", "Bloquear registros al cerrar la nómina")} path="approval.lockAfterPayrollClose" />
            </SettingsSection>

            <SettingsSection title="Periodo y horas extra" icon={<CalendarRange />}>
              <label className="block">
                <span className="cg-eyebrow">{t('ui.NominaSettings.periodoDelTimesheet')}</span>
                <select
                  value={s.payroll?.periodType || "biweekly"}
                  onChange={(e) => setS((p) => set(p as NominaSettings, "payroll.periodType", e.target.value))}
                  className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm"
                >
                  <option value="weekly">Semanal</option>
                  <option value="biweekly">Quincenal</option>
                  <option value="semimonthly">Bimensual</option>
                  <option value="monthly">Mensual</option>
                </select>
              </label>
              {/* Sólo tiene sentido con periodo semanal: es donde empieza a
                  contar la semana. Lo lee `periodoVigente` en el backend. */}
              {(s.payroll?.periodType || "biweekly") === "weekly" && (
                <label className="block">
                  <span className="cg-eyebrow">{t('ui.NominaSettings.laSemanaEmpiezaEl')}</span>
                  <select
                    value={String(s.payroll?.startDayOfWeek ?? 1)}
                    onChange={(e) =>
                      setS((p) => set(p as NominaSettings, "payroll.startDayOfWeek", Number(e.target.value)))
                    }
                    className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm"
                  >
                    <option value="0">{t('ui.NominaSettings.domingo')}</option>
                    <option value="1">{t('ui.NominaSettings.lunes')}</option>
                    <option value="2">{t('ui.NominaSettings.martes')}</option>
                    <option value="3">{t("ui.NominaSettings.miercoles", "Miércoles")}</option>
                    <option value="4">{t('ui.NominaSettings.jueves')}</option>
                    <option value="5">{t('ui.NominaSettings.viernes')}</option>
                    <option value="6">{t("ui.NominaSettings.sabado", "Sábado")}</option>
                  </select>
                </label>
              )}
              <Num label={t('ui.NominaSettings.umbralDeHorasExtraH')} path="payroll.overtimeThresholdHours" />
              {/* No existía: se acumulaban segundos exactos y un informe de
                  quince días daba cifras como 172,37 h, que hay que redondear a
                  mano en una hoja de cálculo — donde se pierde el rastro de
                  quién ajustó qué. */}
              <label className="block">
                <span className="text-sm font-medium">{t('ui.NominaSettings.redondearLasHorasDelInforme')}</span>
                <p className="mt-0.5 text-xs" style={{ color: "var(--ink-faint)" }}>
                  Se aplica al total de cada persona, no a cada marcación: así el redondeo no
                  se acumula turno a turno. Déjalo en «Sin redondear» para conservar los
                  minutos exactos.
                </p>
                <select
                  className="cg-input cg-focus mt-1.5 w-56 px-3 py-2 text-sm"
                  value={String(s.payroll?.roundingMinutes ?? 0)}
                  onChange={(e) =>
                    setS((p) => set(p as NominaSettings, "payroll.roundingMinutes", Number(e.target.value)))
                  }
                >
                  <option value="0">{t('ui.NominaSettings.sinRedondear')}</option>
                  <option value="5">{t("ui.NominaSettings.alMultiploDe5Minutos", "Al múltiplo de 5 minutos")}</option>
                  <option value="15">{t('ui.NominaSettings.alCuartoDeHora')}</option>
                  <option value="30">{t('ui.NominaSettings.aLaMediaHora')}</option>
                  <option value="60">{t('ui.NominaSettings.aLaHora')}</option>
                </select>
              </label>
            </SettingsSection>

            {/* ── COSTOS DEL HORARIO ────────────────────────────────────────────
                El motor de costos (scheduleCostService) lee estos siete valores
                y NINGUNO tenía campo: todo tenant corría con tarifa 0, así que
                el panel «Impacto en costo» del Horario mostraba $0 a todo el
                mundo — la función más vendible del planificador, apagada por no
                tener dónde escribir un número.

                NO es nómina: el motor de rol de pagos se retiró el 2026-08-06
                hasta rehacerlo pensando en cualquier país. Esto es la
                ESTIMACIÓN del planificador, y la pantalla lo dice para que nadie
                crea que de aquí sale una liquidación. */}
            <SettingsSection title={t('ui.NominaSettings.costosDelHorario')} icon={<CalendarRange />}>
              <p className="mb-3 text-xs" style={{ color: "var(--ink-faint)" }}>
                Sirven para estimar el costo de un horario ANTES de publicarlo. Sin una
                tarifa, ese panel muestra cero. No se usan para liquidar sueldos.
              </p>
              <label className="block">
                <span className="cg-eyebrow">Moneda</span>
                <input
                  type="text"
                  maxLength={3}
                  value={s.payroll?.currency ?? "USD"}
                  onChange={(e) => setS((p) => set(p as NominaSettings, "payroll.currency", e.target.value.toUpperCase()))}
                  className="cg-input cg-focus mt-1.5 w-28 px-3 py-2 text-sm uppercase"
                />
                <span className="mt-1 block text-xs" style={{ color: "var(--ink-faint)" }}>
                  Código de tres letras: USD, MXN, COP…
                </span>
              </label>
              <Num label={t('ui.NominaSettings.tarifaPorHoraPorDefecto')} path="payroll.defaultHourlyRate" />
              <Num label={t('ui.NominaSettings.multiplicadorDeHoraExtra')} path="payroll.overtimeMultiplier" />
              <Num label="Recargo nocturno (0.25 = 25 %)" path="payroll.nightSurchargePct" />
              <Num label={t('ui.NominaSettings.laNocheEmpiezaALas')} path="payroll.nightStartHour" />
              <Num label={t('ui.NominaSettings.laNocheTerminaALas')} path="payroll.nightEndHour" />
            </SettingsSection>

            <div className="fixed bottom-6 right-6 z-10">
              <Button variant="brand" size="lg" onClick={save} disabled={saving} className="brand-glow">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar configuración
              </Button>
            </div>
          </FadeIn>
        )}
      </SettingsLayout>
    </AppLayout>
  );
}
