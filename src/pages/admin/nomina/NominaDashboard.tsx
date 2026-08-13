import { useEffect, useState } from "react";
import AppLayout from "@/layouts/app-layout";
import attendanceService from "@/lib/api/attendanceService";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader, StatCard, Stagger } from "@/components/kit";
import {
  CalendarCheck,
  UserCheck,
  Clock,
  AlertTriangle,
  LogOut,
  Timer,
  CheckSquare,
  Percent,
  RefreshCw,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";

interface Summary {
  scheduledToday: number;
  clockedInNow: number;
  lateToday: number;
  noShowsToday: number;
  missedClockouts: number;
  overtimeToday: number;
  pendingApprovals: number;
  attendancePct: number | null;
}

type Accent = "primary" | "green" | "blue" | "red" | "orange" | "slate";

const CARDS: { key: keyof Summary; label: string; icon: LucideIcon; accent: Accent }[] = [
  { key: "scheduledToday", label: "Programados hoy", icon: CalendarCheck, accent: "primary" },
  { key: "clockedInNow", label: "En servicio ahora", icon: UserCheck, accent: "green" },
  { key: "lateToday", label: "Llegadas tarde", icon: Clock, accent: "orange" },
  { key: "noShowsToday", label: "Inasistencias", icon: AlertTriangle, accent: "red" },
  { key: "missedClockouts", label: "Sin marcar salida", icon: LogOut, accent: "orange" },
  { key: "overtimeToday", label: "Tiempo extra", icon: Timer, accent: "blue" },
  { key: "pendingApprovals", label: "Aprobaciones pendientes", icon: CheckSquare, accent: "primary" },
  { key: "attendancePct", label: "Asistencia", icon: Percent, accent: "green" },
];

export default function NominaDashboard() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    attendanceService
      .dashboard()
      .then((d) => setData(d))
      .catch((e) => setError(e?.message || "Error al cargar el panel"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <AppLayout>
      <PageContainer width="wide" className="p-4 sm:p-6">
        <PageHeader
          icon={<ClipboardList />}
          title="Asistencia"
          subtitle="Resumen de asistencia de hoy"
          actions={
            <Button variant="brand" onClick={load} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : ""} />
              Actualizar
            </Button>
          }
        />

        {error && (
          <div
            className="rounded-2xl px-4 py-3 text-sm font-medium"
            style={{ background: "color-mix(in oklab, var(--bad) 12%, transparent)", color: "var(--bad-text)" }}
          >
            {error}
          </div>
        )}

        <Stagger className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {CARDS.map((c) => {
            const Icon = c.icon;
            const raw = data ? (data[c.key] as number | null) : null;
            const value =
              c.key === "attendancePct" ? (raw == null ? "—" : `${raw}%`) : raw == null ? "—" : raw;
            return (
              <StatCard
                key={c.key}
                icon={<Icon />}
                accent={c.accent}
                label={c.label}
                value={loading ? "…" : value}
              />
            );
          })}
        </Stagger>

        <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
          Las excepciones (tarde, inasistencia, sin marcar salida) se detectan automáticamente cada
          pocos minutos y aparecen en <strong>Excepciones</strong> y <strong>Aprobaciones</strong>.
        </p>
      </PageContainer>
    </AppLayout>
  );
}
