import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Loader2,
  SlidersHorizontal,
  Timer,
  MapPinned,
  BellRing,
  CheckSquare,
  CalendarRange,
  Palmtree,
} from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import { Button } from "@/components/ui/button";
import attendanceService from "@/lib/api/attendanceService";
import { Section, FadeIn, SkeletonCards } from "@/components/kit";

interface NominaSettings {
  general?: {
    timeClockEnabled?: boolean;
    requireSelfie?: boolean;
    requireNotesOnException?: boolean;
    /** ¿Comprobar que en la selfie se vea una cara? (el servidor sólo DETECTA una cara, no reconoce). */
    selfieFaceCheck?: "off" | "flag" | "enforce";
    /** Reconocimiento facial (módulo de pago): ¿es la cara REGISTRADA del vigilante? Sin el módulo cuenta como off. */
    faceRecognition?: "off" | "flag" | "enforce";
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
    /** La política de pago, sin país. Ver `backend/lib/politicaDeNomina`. */
    politica?: {
      moneda?: string;
      horasOrdinariasDia?: number;
      horasOrdinariasSemana?: number;
      tramosExtra?: Array<{ desdeHora: number; recargoPct: number }>;
      nocturno?: { desdeHora?: number; hastaHora?: number; recargoPct?: number };
      domingoRecargoPct?: number;
      descansoRecargoPct?: number;
      feriadoRecargoPct?: number;
      acumulacionDeRecargos?: "suma" | "mayor";
    };
    periodType?: string;
    startDayOfWeek?: number;
    currency?: string;
    defaultHourlyRate?: number;
    overtimeMultiplier?: number;
    nightSurchargePct?: number;
    nightStartHour?: number;
    nightEndHour?: number;
    overtimeThresholdHours?: number;
    /** Vacío = lo de la ley del país, por antigüedad. */
    vacaciones?: { diasPorAnio: number | null; unidad: "naturales" | "laborables" };
    /** Vacío = lo del país (UE 11 h de descanso; resto 8 h) y 16 h seguidas. */
    descanso?: { minimoHoras: number | null; maxHorasSeguidas: number | null };
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

/**
 * LOS ESCALONES DE HORAS EXTRA, LOS QUE HAGAN FALTA.
 *
 * La versión anterior tenía DOS clavados —«las 2 primeras al 25 %, el resto al
 * 35 %»— porque estaban escritos para un país. Hay convenios de uno solo
 * (todo al +50 %) y de tres o más, así que la lista se edita.
 *
 * Vacía significa algo concreto y correcto: las horas extra se pagan a tarifa
 * simple. Es lo único que se puede suponer sin conocer el convenio.
 */
function TramosExtra({
  tramos,
  onChange,
}: {
  tramos: Array<{ desdeHora: number; recargoPct: number }>;
  onChange: (t: Array<{ desdeHora: number; recargoPct: number }>) => void;
}) {
  const { t } = useTranslation();
  const set = (i: number, campo: "desdeHora" | "recargoPct", v: number) =>
    onChange(tramos.map((tr, k) => (k === i ? { ...tr, [campo]: v } : tr)));

  return (
    <div>
      <span className="text-sm font-medium">
        {t("ui.NominaSettings.escalonesDeHorasExtra", "Escalones de horas extra")}
      </span>
      <p className="mt-0.5 text-xs" style={{ color: "var(--ink-faint)" }}>
        {t(
          "ui.NominaSettings.aPartirDeCuantasHorasExtra",
          "A partir de cuántas horas extra acumuladas en el día aplica cada recargo. Sin escalones, las extra se pagan a tarifa simple.",
        )}
      </p>

      <div className="mt-2 space-y-2">
        {tramos.map((tramo, i) => (
          <div key={i} className="flex items-end gap-2">
            <label className="block">
              <span className="cg-eyebrow">
                {t("ui.NominaSettings.desdeLaHoraExtra", "Desde la hora extra")}
              </span>
              <input
                className="cg-input cg-focus mt-1 w-32 px-3 py-2 text-sm tabular-nums"
                type="number"
                min={0}
                value={tramo.desdeHora}
                onChange={(e) => set(i, "desdeHora", Number(e.target.value))}
              />
            </label>
            <label className="block">
              <span className="cg-eyebrow">
                {t("ui.NominaSettings.recargoPct", "Recargo (%)")}
              </span>
              <input
                className="cg-input cg-focus mt-1 w-32 px-3 py-2 text-sm tabular-nums"
                type="number"
                min={0}
                value={tramo.recargoPct}
                onChange={(e) => set(i, "recargoPct", Number(e.target.value))}
              />
            </label>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onChange(tramos.filter((_, k) => k !== i))}
            >
              {t("ui.NominaSettings.quitar", "Quitar")}
            </Button>
          </div>
        ))}
      </div>

      <Button
        className="mt-2"
        size="sm"
        variant="outline"
        onClick={() =>
          onChange([
            ...tramos,
            {
              desdeHora: tramos.length
                ? tramos[tramos.length - 1].desdeHora + 2
                : 0,
              recargoPct: 25,
            },
          ])
        }
      >
        {t("ui.NominaSettings.anadirEscalon", "Añadir escalón")}
      </Button>
    </div>
  );
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
      .catch((e) => toast.error(e?.message || t("ui.NominaSettings.errorAlCargar", "Error al cargar")))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await attendanceService.saveSettings(
        (s ?? {}) as Record<string, unknown>,
      );

      setS(saved);
      toast.success(t("comun.configuracionGuardada"));
    } catch (e) {
      toast.error(
        (e as { message?: string })?.message || t("ui.NominaSettings.errorAlGuardar", "Error al guardar"),
      );
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
          className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm tabular-nums"
          type="number"
          value={
            ((s as unknown as SettingsRecord | null)?.[a]?.[b] as
              | number
              | undefined) ?? 0
          }
          onChange={(e) =>
            setS((prev) =>
              set(prev as NominaSettings, path, Number(e.target.value)),
            )
          }
        />
      </label>
    );
  };

  const Toggle = ({ label, path }: { label: string; path: string }) => {
    const [a, b] = path.split(".");

    return (
      <label className="glass-flat glass-hover flex cursor-pointer items-center gap-2.5 px-3 py-2.5">
        <input
          checked={!!(s as unknown as SettingsRecord | null)?.[a]?.[b]}
          className="cg-focus size-4"
          style={{ accentColor: "var(--brand)" }}
          type="checkbox"
          onChange={(e) =>
            setS((prev) => set(prev as NominaSettings, path, e.target.checked))
          }
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
    <Section icon={icon} title={title}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </Section>
  );

  return (
    <AppLayout>
      <SettingsLayout
        navKey="configuracion"
        title={t("ui.NominaSettings.asistenciaTimeAttendance")}
      >
        {loading || !s ? (
          <SkeletonCards count={4} />
        ) : (
          <FadeIn className="space-y-4 pb-28">
            <SettingsSection icon={<SlidersHorizontal />} title={t("ui.NominaSettings.general", "General")}>
              <Toggle
                label={t("ui.NominaSettings.relojDeAsistenciaHabilitado")}
                path="general.timeClockEnabled"
              />
              <Toggle
                label={t("ui.NominaSettings.requerirNotasEnExcepciones")}
                path="general.requireNotesOnException"
              />
              {/* Selfie y rostro: se configuran en las apps (Mike 2026-10-09). */}
              <p className="glass-flat px-3 py-2.5 text-sm sm:col-span-2">
                {t("ui.NominaSettings.selfieMovido", "La selfie y el rostro al fichar ahora se configuran en Ajustes › App del equipo o App del supervisor.")}{" "}
                <a className="underline" href="/setting/mobile-hub">{t("ui.SelfieRostro.titulo", "Selfie y rostro al fichar")} →</a>
              </p>
            </SettingsSection>

            <SettingsSection
              icon={<Timer />}
              title={t(
                "ui.NominaSettings.ventanasDeTiempoMinutos",
                "Ventanas de tiempo (minutos)",
              )}
            >
              <Num
                label={t("ui.NominaSettings.entradaAnticipadaPermitida", "Entrada anticipada permitida")}
                path="windows.earlyClockInMin"
              />
              <Num
                label={t(
                  "ui.NominaSettings.toleranciaDeRetrasoGracia",
                  "Tolerancia de retraso (gracia)",
                )}
                path="windows.lateGraceMin"
              />
              <Num
                label={t(
                  "ui.NominaSettings.umbralDeSalidaAnticipada",
                  "Umbral de salida anticipada",
                )}
                path="windows.earlyClockoutThresholdMin"
              />
              <Num
                label={t("ui.NominaSettings.umbralSinMarcarSalida")}
                path="windows.missedClockoutThresholdMin"
              />
              <Num
                label={t(
                  "ui.NominaSettings.umbralInasistenciaNoShow",
                  "Umbral inasistencia (no-show)",
                )}
                path="windows.noShowThresholdMin"
              />
            </SettingsSection>

            <SettingsSection icon={<MapPinned />} title={t("ui.NominaSettings.geocerca", "Geocerca")}>
              <Num
                label={t("ui.NominaSettings.radioPorDefectoM")}
                path="geofence.defaultRadiusM"
              />
              <Toggle
                label={t(
                  "ui.NominaSettings.requerirValidacionDeGeocerca",
                  "Requerir validación de geocerca",
                )}
                path="geofence.requireValidation"
              />
              <Toggle
                label={t(
                  "ui.NominaSettings.permitirFueraDeGeocercaCon",
                  "Permitir fuera de geocerca (con aprobación)",
                )}
                path="geofence.allowOutsideWithApproval"
              />
            </SettingsSection>

            <SettingsSection icon={<BellRing />} title={t("ui.NominaSettings.notificaciones", "Notificaciones")}>
              <Toggle
                label={t("ui.NominaSettings.notificarSoloAlSupervisorAsignado")}
                path="notifications.assignedSupervisorsOnly"
              />
              {/* El backend YA enviaba a estos correos (attendanceService y el
                  barrido nocturno los leen); lo que faltaba era el campo para
                  escribirlos. Un ajuste funcional e inalcanzable es el problema
                  inverso al del interruptor muerto, y se nota igual de poco. */}
              <label className="block">
                <span className="cg-eyebrow">
                  {t(
                    "ui.NominaSettings.avisarAdemasAEstosCorreos",
                    "Avisar además a estos correos",
                  )}
                </span>
                <input
                  className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm"
                  placeholder={t(
                    "ui.NominaSettings.operacionesEmpresaComRrhhEmpresa",
                  )}
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
                />
                <span
                  className="mt-1 block text-xs"
                  style={{ color: "var(--ink-faint)" }}
                >
                  {t(
                    "ui.NominaSettings.separadosPorComasReciben",
                    "Separados por comas. Reciben las novedades de asistencia además de los supervisores.",
                  )}
                </span>
              </label>
            </SettingsSection>

            <SettingsSection icon={<CheckSquare />} title={t("sidebar.nomina.nomina-approvals", "Aprobaciones")}>
              <Toggle
                label={t("ui.NominaSettings.autoAprobarMarcacionesNormales", "Auto-aprobar marcaciones normales")}
                path="approval.autoApproveNormal"
              />
              <Toggle
                label={t(
                  "ui.NominaSettings.requerirAprobacionParaExcepciones",
                  "Requerir aprobación para excepciones",
                )}
                path="approval.requireApprovalForExceptions"
              />
              <Toggle
                label={t(
                  "ui.NominaSettings.bloquearRegistrosAlCerrarLa",
                  "Bloquear registros al cerrar la nómina",
                )}
                path="approval.lockAfterPayrollClose"
              />
            </SettingsSection>

            <SettingsSection
              icon={<CalendarRange />}
              title={t("ui.NominaSettings.periodoYHorasExtra", "Periodo y horas extra")}
            >
              <label className="block">
                <span className="cg-eyebrow">
                  {t("ui.NominaSettings.periodoDelTimesheet")}
                </span>
                <select
                  className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm"
                  value={s.payroll?.periodType || "biweekly"}
                  onChange={(e) =>
                    setS((p) =>
                      set(
                        p as NominaSettings,
                        "payroll.periodType",
                        e.target.value,
                      ),
                    )
                  }
                >
                  <option value="weekly">{t("ui.NominaSettings.semanal", "Semanal")}</option>
                  <option value="biweekly">{t("ui.NominaSettings.quincenal", "Quincenal")}</option>
                  <option value="semimonthly">{t("ui.NominaSettings.bimensual", "Bimensual")}</option>
                  <option value="monthly">{t("ui.NominaSettings.mensual", "Mensual")}</option>
                </select>
              </label>
              {/* Sólo tiene sentido con periodo semanal: es donde empieza a
                  contar la semana. Lo lee `periodoVigente` en el backend. */}
              {(s.payroll?.periodType || "biweekly") === "weekly" && (
                <label className="block">
                  <span className="cg-eyebrow">
                    {t("ui.NominaSettings.laSemanaEmpiezaEl")}
                  </span>
                  <select
                    className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm"
                    value={String(s.payroll?.startDayOfWeek ?? 1)}
                    onChange={(e) =>
                      setS((p) =>
                        set(
                          p as NominaSettings,
                          "payroll.startDayOfWeek",
                          Number(e.target.value),
                        ),
                      )
                    }
                  >
                    <option value="0">{t("ui.NominaSettings.domingo")}</option>
                    <option value="1">{t("ui.NominaSettings.lunes")}</option>
                    <option value="2">{t("ui.NominaSettings.martes")}</option>
                    <option value="3">
                      {t("ui.NominaSettings.miercoles", "Miércoles")}
                    </option>
                    <option value="4">{t("ui.NominaSettings.jueves")}</option>
                    <option value="5">{t("ui.NominaSettings.viernes")}</option>
                    <option value="6">
                      {t("ui.NominaSettings.sabado", "Sábado")}
                    </option>
                  </select>
                </label>
              )}
              <Num
                label={t("ui.NominaSettings.umbralDeHorasExtraH")}
                path="payroll.overtimeThresholdHours"
              />
            </SettingsSection>

            {/* ── POLÍTICA DE PAGO ──────────────────────────────────────────────
                Las reglas de pago NO tienen país. Esto sustituye a lo que estaba
                escrito para uno: horas extra «las 2 primeras al 25 %, el resto al
                35 %», noche de 22:00 a 06:00 y recargo dominical siempre puesto.
                El recargo dominical no existe en casi toda Europa y el umbral de
                horas extra es semanal en Estados Unidos, así que por defecto NO
                se recarga nada: cada empresa declara su convenio. */}
            <SettingsSection
              icon={<SlidersHorizontal />}
              title={t("ui.NominaSettings.politicaDePago", "Política de pago")}
            >
              <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                {t(
                  "ui.NominaSettings.conEstoSeCalculanLasHorasExtra",
                  "Con esto se calculan las horas extra y los recargos de las tarjetas de nómina. Por defecto no se recarga nada: declara aquí lo que diga tu convenio. Si el pago lo calcula otro sistema, puedes dejarlo como está — las horas y los días se exportan igual.",
                )}
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="cg-eyebrow">
                    {t("ui.NominaSettings.monedaIso4217", "Moneda (ISO 4217)")}
                  </span>
                  <input
                    className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm uppercase"
                    maxLength={8}
                    value={s.payroll?.politica?.moneda ?? "USD"}
                    onChange={(e) =>
                      setS((p) =>
                        set(
                          p as NominaSettings,
                          "payroll.politica.moneda",
                          e.target.value.toUpperCase(),
                        ),
                      )
                    }
                  />
                </label>
                <Num
                  label={t("ui.NominaSettings.jornadaOrdinariaDiariaH", "Jornada ordinaria diaria (h)")}
                  path="payroll.politica.horasOrdinariasDia"
                />
              </div>

              <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                {t(
                  "ui.NominaSettings.loQuePaseDeLaJornadaOrdinaria",
                  "Lo que pase de la jornada ordinaria es hora extra —aunque nadie se quede más allá de su relevo—. En una empresa de turnos de 12 h con jornada legal de 8, cada turno trae 4 horas extra.",
                )}
              </p>

              <div className="grid gap-3 sm:grid-cols-3">
                <Num
                  label={t("ui.NominaSettings.nocturnoDesdeHora", "Nocturno: desde (hora)")}
                  path="payroll.politica.nocturno.desdeHora"
                />
                <Num
                  label={t("ui.NominaSettings.nocturnoHastaHora", "Nocturno: hasta (hora)")}
                  path="payroll.politica.nocturno.hastaHora"
                />
                <Num
                  label={t("ui.NominaSettings.recargoNocturnoPct", "Recargo nocturno (%)")}
                  path="payroll.politica.nocturno.recargoPct"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Num
                  label={t("ui.NominaSettings.recargoDominicalPct", "Recargo dominical (%)")}
                  path="payroll.politica.domingoRecargoPct"
                />
                <Num
                  label={t("ui.NominaSettings.recargoEnDiaDeDescansoPct", "Recargo en día de descanso (%)")}
                  path="payroll.politica.descansoRecargoPct"
                />
                <Num
                  label={t("ui.NominaSettings.recargoEnFeriadoPct", "Recargo en feriado (%)")}
                  path="payroll.politica.feriadoRecargoPct"
                />
              </div>

              <label className="block">
                <span className="text-sm font-medium">
                  {t(
                    "ui.NominaSettings.cuandoVariosRecargosCaen",
                    "Cuando varios recargos caen sobre la misma hora",
                  )}
                </span>
                <p className="mt-0.5 text-xs" style={{ color: "var(--ink-faint)" }}>
                  {t(
                    "ui.NominaSettings.unDomingoPorLaNoche",
                    "Un domingo por la noche que además es feriado. Hay países donde los recargos se SUMAN y países donde gana sólo el mayor: dan importes muy distintos.",
                  )}
                </p>
                <select
                  className="cg-input cg-focus mt-1.5 w-72 px-3 py-2 text-sm"
                  value={s.payroll?.politica?.acumulacionDeRecargos ?? "suma"}
                  onChange={(e) =>
                    setS((p) =>
                      set(
                        p as NominaSettings,
                        "payroll.politica.acumulacionDeRecargos",
                        e.target.value,
                      ),
                    )
                  }
                >
                  <option value="suma">{t("ui.NominaSettings.seSuman", "Se suman")}</option>
                  <option value="mayor">{t("ui.NominaSettings.ganaElMayor", "Gana el mayor")}</option>
                </select>
              </label>

              <TramosExtra
                tramos={s.payroll?.politica?.tramosExtra ?? []}
                onChange={(t2) =>
                  setS((p) =>
                    set(p as NominaSettings, "payroll.politica.tramosExtra", t2),
                  )
                }
              />
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
            <SettingsSection
              icon={<CalendarRange />}
              title={t("ui.NominaSettings.costosDelHorario")}
            >
              <p className="mb-3 text-xs" style={{ color: "var(--ink-faint)" }}>
                {t(
                  "ui.NominaSettings.sirvenParaEstimarElCosto",
                  "Sirven para estimar el costo de un horario ANTES de publicarlo. Sin una tarifa, ese panel muestra cero. No se usan para liquidar sueldos.",
                )}
              </p>
              <label className="block">
                <span className="cg-eyebrow">{t("ui.NominaSettings.moneda", "Moneda")}</span>
                <input
                  className="cg-input cg-focus mt-1.5 w-28 px-3 py-2 text-sm uppercase"
                  maxLength={3}
                  type="text"
                  value={s.payroll?.currency ?? "USD"}
                  onChange={(e) =>
                    setS((p) =>
                      set(
                        p as NominaSettings,
                        "payroll.currency",
                        e.target.value.toUpperCase(),
                      ),
                    )
                  }
                />
                <span
                  className="mt-1 block text-xs"
                  style={{ color: "var(--ink-faint)" }}
                >
                  {t(
                    "ui.NominaSettings.codigoDeTresLetras",
                    "Código de tres letras: USD, MXN, COP…",
                  )}
                </span>
              </label>
              <Num
                label={t("ui.NominaSettings.tarifaPorHoraPorDefecto")}
                path="payroll.defaultHourlyRate"
              />
              <Num
                label={t("ui.NominaSettings.multiplicadorDeHoraExtra")}
                path="payroll.overtimeMultiplier"
              />
              <Num
                label={t("ui.NominaSettings.recargoNocturnoDecimal", "Recargo nocturno (0.25 = 25 %)")}
                path="payroll.nightSurchargePct"
              />
              <Num
                label={t("ui.NominaSettings.laNocheEmpiezaALas")}
                path="payroll.nightStartHour"
              />
              <Num
                label={t("ui.NominaSettings.laNocheTerminaALas")}
                path="payroll.nightEndHour"
              />
            </SettingsSection>

            {/* ── VACACIONES Y DESCANSO: LO DE LA EMPRESA, O LO DE SU PAÍS ──────
                VigIA calcula cuántos días le tocan a cada uno y avisa cuando un
                reemplazo se queda sin descanso. Vacío NO es cero: es «lo que
                diga la ley del país de la empresa» (vacaciones por antigüedad;
                11 h de descanso en la UE, 8 h en el resto). Lo que se escriba
                aquí manda: convenio, contrato o política propia. */}
            <SettingsSection
              icon={<Palmtree />}
              title={t("ui.NominaSettings.vacacionesYDescanso", "Vacaciones y descanso")}
            >
              <p className="mb-3 text-xs sm:col-span-2" style={{ color: "var(--ink-faint)" }}>
                {t(
                  "ui.NominaSettings.vacacionesYDescansoAyuda",
                  "Déjalo vacío para usar lo que dice la ley de tu país (por antigüedad). Escribe un número si tu empresa da otra cosa por convenio o contrato.",
                )}
              </p>
              {(
                [
                  ["vacaciones", "diasPorAnio", t("ui.NominaSettings.diasDeVacacionesPorAnio", "Días de vacaciones por año")],
                  ["descanso", "minimoHoras", t("ui.NominaSettings.descansoMinimoEntreTurnos", "Descanso mínimo entre turnos (horas)")],
                  ["descanso", "maxHorasSeguidas", t("ui.NominaSettings.maximoDeHorasSeguidas", "Máximo de horas seguidas")],
                ] as const
              ).map(([grupo, campo, etiqueta]) => (
                <label key={`${grupo}.${campo}`} className="block">
                  <span className="cg-eyebrow">{etiqueta}</span>
                  <input
                    className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm tabular-nums"
                    min={0}
                    placeholder={t("ui.NominaSettings.segunLaLey", "Según la ley")}
                    type="number"
                    value={
                      ((s.payroll as any)?.[grupo]?.[campo] ?? "") as number | string
                    }
                    onChange={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value);

                      setS((prev) => {
                        const p = (prev ?? {}) as NominaSettings;
                        const payroll: any = { ...(p.payroll || {}) };

                        payroll[grupo] = { ...(payroll[grupo] || {}), [campo]: v };

                        return { ...p, payroll };
                      });
                    }}
                  />
                </label>
              ))}
              <label className="block">
                <span className="cg-eyebrow">
                  {t("ui.NominaSettings.losDiasDeVacacionesSon", "Los días de vacaciones son")}
                </span>
                <select
                  className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm"
                  value={s.payroll?.vacaciones?.unidad ?? "naturales"}
                  onChange={(e) =>
                    setS((prev) => {
                      const p = (prev ?? {}) as NominaSettings;

                      return {
                        ...p,
                        payroll: {
                          ...(p.payroll || {}),
                          vacaciones: {
                            diasPorAnio: p.payroll?.vacaciones?.diasPorAnio ?? null,
                            unidad: e.target.value as "naturales" | "laborables",
                          },
                        },
                      };
                    })
                  }
                >
                  <option value="naturales">
                    {t("ui.NominaSettings.diasNaturales", "Días naturales (de calendario)")}
                  </option>
                  <option value="laborables">
                    {t("ui.NominaSettings.diasLaborables", "Días laborables")}
                  </option>
                </select>
              </label>
            </SettingsSection>

            <div className="fixed bottom-6 right-6 z-10">
              <Button
                className="brand-glow"
                disabled={saving}
                size="lg"
                variant="brand"
                onClick={save}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("ui.NominaSettings.guardarConfiguracion", "Guardar configuración")}
              </Button>
            </div>
          </FadeIn>
        )}
      </SettingsLayout>
    </AppLayout>
  );
}
