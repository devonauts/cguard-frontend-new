import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  SlidersHorizontal,
  Timer,
  MapPinned,
  BellRing,
  CheckSquare,
  CalendarRange,
  Palmtree, EyeOff } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import attendanceService from "@/lib/api/attendanceService";
import { Section, FadeIn, SkeletonCards } from "@/components/kit";
import { SaveBar } from "@/pages/admin/Configuration/components/SettingsForm";
import ReglasDePago, { type PayrollDeAjustes, type Politica } from "./ReglasDePago";

interface NominaSettings {
  /** Who reads the reason of a leave request (backend timeOff/reasonVisibility). */
  privacy?: {
    leaveReasonVisibleTo?: "approvers" | "hr" | "office";
  };
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
  /** The law's dated changes: follow them, or skip some (backend lib/payroll/legalCalendar). */
  leyes?: { seguirCambios?: boolean; omitidos?: string[] };
  payroll?: {
    /** La política de pago de la empresa. Ver `ReglasDePago` y `backend/lib/politicaDeNomina`. */
    politica?: Politica;
    periodType?: string;
    startDayOfWeek?: number;
    periodAnchor?: string | null;
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


/**
 * Writes `value` at a dotted path, copying every level on the way. It used to
 * handle TWO levels only, so `payroll.politica.horasOrdinariasDia` replaced the
 * whole pay policy with a number and no company could configure its rules.
 */
function set<T extends object>(obj: T, path: string, value: unknown): T {
  const partes = path.split(".");
  const raiz = { ...(obj as Record<string, unknown>) };
  let cursor: Record<string, unknown> = raiz;

  partes.forEach((k, i) => {
    if (i === partes.length - 1) {
      cursor[k] = value;
    } else {
      const sig = cursor[k];

      cursor[k] = sig && typeof sig === "object" && !Array.isArray(sig) ? { ...(sig as Record<string, unknown>) } : {};
      cursor = cursor[k] as Record<string, unknown>;
    }
  });

  return raiz as T;
}

/** Reads a dotted path. */
function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

export default function NominaSettings() {
  const { t } = useTranslation();
  const [s, setS] = useState<NominaSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // The US state this tab LOADED: the server keeps the stored state when the
  // body still carries this value (nobody picked a state here), so an older
  // tab never undoes a state saved elsewhere.
  const [regionCargada, setRegionCargada] = useState<string | null>(null);

  useEffect(() => {
    attendanceService
      .getSettings()
      .then((d) => {
        setS(d);
        setRegionCargada(((d as NominaSettings)?.payroll as { regionDeReglas?: string | null } | undefined)?.regionDeReglas ?? null);
      })
      .catch((e) => toast.error(e?.message || t("ui.NominaSettings.errorAlCargar", "Error al cargar")))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const cuerpo = s
        ? { ...s, payroll: { ...(s.payroll || {}), regionDeReglasCargada: regionCargada } }
        : {};
      const saved = await attendanceService.saveSettings(cuerpo as Record<string, unknown>);

      setS(saved);
      setRegionCargada(((saved as NominaSettings)?.payroll as { regionDeReglas?: string | null } | undefined)?.regionDeReglas ?? null);
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
    return (
      <label className="block">
        <span className="cg-eyebrow">{label}</span>
        <input
          className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm tabular-nums"
          type="number"
          value={(get(s, path) as number | undefined) ?? 0}
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
    return (
      <label className="glass-flat glass-hover flex cursor-pointer items-center gap-2.5 px-3 py-2.5">
        <input
          checked={!!get(s, path)}
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

            <SettingsSection icon={<CheckSquare />} title={t("sidebar.asistencia.aprobaciones", "Aprobaciones")}>
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

            {/* ── PRIVACY: who reads the reason of a leave request ── */}
            <SettingsSection icon={<EyeOff />} title={t("ui.NominaSettings.privacidad", "Privacidad de los permisos")}>
              <label className="block">
                <span className="cg-eyebrow">
                  {t("ui.NominaSettings.quienVeElMotivo", "Quién ve el motivo de un permiso")}
                </span>
                <select
                  className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm"
                  value={s?.privacy?.leaveReasonVisibleTo ?? "approvers"}
                  onChange={(e) =>
                    setS((prev) =>
                      set(prev as NominaSettings, "privacy.leaveReasonVisibleTo", e.target.value),
                    )
                  }
                >
                  <option value="approvers">
                    {t("ui.NominaSettings.motivoAprobadores", "Solo quien aprueba permisos (y quien lo pidió)")}
                  </option>
                  <option value="hr">
                    {t("ui.NominaSettings.motivoRrhh", "Recursos humanos y niveles superiores (y quien lo pidió)")}
                  </option>
                  <option value="office">
                    {t("ui.NominaSettings.motivoOficina", "Todo el personal de oficina")}
                  </option>
                </select>
                <p className="mt-1.5 text-xs" style={{ color: "var(--ink-soft)" }}>
                  {t(
                    "ui.NominaSettings.motivoAyuda",
                    "El motivo suele ser médico. Los demás ven la solicitud (quién, fechas, estado) sin el motivo.",
                  )}
                </p>
              </label>
            </SettingsSection>

            {/* ── PERIODO Y REGLAS DE PAGO ─────────────────────────────────────
                One component (`ReglasDePago`): fixed pay periods, the pay rules
                of the company with its country as a starting point, and the
                rules in force written in plain words. */}
            <ReglasDePago
              payroll={(s.payroll || {}) as PayrollDeAjustes}
              onChange={(payroll) => setS((p) => ({ ...(p as NominaSettings), payroll: payroll as NominaSettings["payroll"] }))}
              leyes={s.leyes}
              onLeyesChange={(leyes) => setS((p) => ({ ...(p as NominaSettings), leyes }))}
            />

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
                  )}{" "}
                  {t(
                    "ui.NominaSettings.monedaUnica",
                    "Es la moneda de toda la empresa: también la de los roles de pago.",
                  )}
                </span>
              </label>
              <Num
                label={t("ui.NominaSettings.tarifaPorHoraPorDefecto")}
                path="payroll.defaultHourlyRate"
              />
              <Num
                label={t("ui.NominaSettings.umbralDeHorasExtraH")}
                path="payroll.overtimeThresholdHours"
              />
              <Num
                label={t("ui.NominaSettings.multiplicadorDeHoraExtra")}
                path="payroll.overtimeMultiplier"
              />
              {/* ONE night surcharge (phase 3): the estimate uses the pay
                  rule's window and rate, the same ones that are paid. */}
              <p className="text-xs sm:col-span-2" style={{ color: "var(--ink-faint)" }}>
                {t(
                  "ui.NominaSettings.nocheSegunReglas",
                  "La noche y su recargo salen de las reglas de pago de arriba: la estimación usa lo mismo que se paga.",
                )}
              </p>
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
              {/* ONE rest rule (phase 3): Configuración › Jornada y descanso. */}
              <p className="text-xs sm:col-span-2" style={{ color: "var(--ink-soft)" }}>
                {t(
                  "ui.NominaSettings.descansoEnJornada",
                  "El descanso entre turnos y las horas seguidas se definen en Jornada y descanso.",
                )}{" "}
                <a className="underline" href="/setting/jornada">
                  {t("ui.NominaSettings.irAJornada", "Jornada y descanso")} →
                </a>
              </p>
            </SettingsSection>

            {/* In the page flow like every other settings page: a fixed button
                at bottom-6 sat under the phone's bottom bar and under the VigIA
                bubble (QA-96). */}
            <SaveBar
              label={t("ui.NominaSettings.guardarConfiguracion", "Guardar configuración")}
              saving={saving}
              onSave={save}
            />
          </FadeIn>
        )}
      </SettingsLayout>
    </AppLayout>
  );
}
