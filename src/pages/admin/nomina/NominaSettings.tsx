import { useEffect, useState } from "react";
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
  };
  approval?: {
    autoApproveNormal?: boolean;
    requireApprovalForExceptions?: boolean;
    lockAfterPayrollClose?: boolean;
  };
  payroll?: {
    periodType?: string;
    overtimeThresholdHours?: number;
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
      toast.success("Configuración guardada");
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
      <SettingsLayout navKey="configuracion" title="Asistencia / Time & Attendance">
        {loading || !s ? (
          <SkeletonCards count={4} />
        ) : (
          <FadeIn className="space-y-4 pb-28">
            <SettingsSection title="General" icon={<SlidersHorizontal />}>
              <Toggle label="Reloj de asistencia habilitado" path="general.timeClockEnabled" />
              <Toggle label="Requerir selfie al marcar" path="general.requireSelfie" />
              <Toggle label="Requerir notas en excepciones" path="general.requireNotesOnException" />
            </SettingsSection>

            <SettingsSection title="Ventanas de tiempo (minutos)" icon={<Timer />}>
              <Num label="Entrada anticipada permitida" path="windows.earlyClockInMin" />
              <Num label="Tolerancia de retraso (gracia)" path="windows.lateGraceMin" />
              <Num label="Umbral de salida anticipada" path="windows.earlyClockoutThresholdMin" />
              <Num label="Umbral sin marcar salida" path="windows.missedClockoutThresholdMin" />
              <Num label="Umbral inasistencia (no-show)" path="windows.noShowThresholdMin" />
            </SettingsSection>

            <SettingsSection title="Geocerca" icon={<MapPinned />}>
              <Num label="Radio por defecto (m)" path="geofence.defaultRadiusM" />
              <Toggle label="Requerir validación de geocerca" path="geofence.requireValidation" />
              <Toggle label="Permitir fuera de geocerca (con aprobación)" path="geofence.allowOutsideWithApproval" />
            </SettingsSection>

            <SettingsSection title="Notificaciones" icon={<BellRing />}>
              <Toggle label="Notificar solo al supervisor asignado al puesto" path="notifications.assignedSupervisorsOnly" />
            </SettingsSection>

            <SettingsSection title="Aprobaciones" icon={<CheckSquare />}>
              <Toggle label="Auto-aprobar marcaciones normales" path="approval.autoApproveNormal" />
              <Toggle label="Requerir aprobación para excepciones" path="approval.requireApprovalForExceptions" />
              <Toggle label="Bloquear registros al cerrar la nómina" path="approval.lockAfterPayrollClose" />
            </SettingsSection>

            <SettingsSection title="Periodo y horas extra" icon={<CalendarRange />}>
              <label className="block">
                <span className="cg-eyebrow">Periodo del timesheet</span>
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
              <Num label="Umbral de horas extra (h/turno)" path="payroll.overtimeThresholdHours" />
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
