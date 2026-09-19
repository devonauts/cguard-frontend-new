import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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

import AppLayout from "@/layouts/app-layout";
import attendanceService from "@/lib/api/attendanceService";
import { Button } from "@/components/ui/button";
import {
  PageContainer,
  PageHeader,
  StatCard,
  StatsStrip,
} from "@/components/kit";

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

// `labelKey` viaja en la constante y se traduce al pintar: llamar a t() aquí
// congelaría el idioma de arranque para toda la sesión.
const CARDS: {
  key: keyof Summary;
  label: string;
  labelKey: string;
  icon: LucideIcon;
  accent: Accent;
}[] = [
  {
    key: "scheduledToday",
    label: "Programados hoy",
    labelKey: "nomina.dashboard.cards.scheduledToday",
    icon: CalendarCheck,
    accent: "primary",
  },
  {
    key: "clockedInNow",
    label: "En servicio ahora",
    labelKey: "nomina.dashboard.cards.clockedInNow",
    icon: UserCheck,
    accent: "green",
  },
  {
    key: "lateToday",
    label: "Llegadas tarde",
    labelKey: "nomina.dashboard.cards.lateToday",
    icon: Clock,
    accent: "orange",
  },
  {
    key: "noShowsToday",
    label: "Inasistencias",
    labelKey: "nomina.dashboard.cards.noShowsToday",
    icon: AlertTriangle,
    accent: "red",
  },
  {
    key: "missedClockouts",
    label: "Sin marcar salida",
    labelKey: "nomina.excepcion.missed_clockout",
    icon: LogOut,
    accent: "orange",
  },
  {
    key: "overtimeToday",
    label: "Tiempo extra",
    labelKey: "nomina.dashboard.cards.overtimeToday",
    icon: Timer,
    accent: "blue",
  },
  {
    key: "pendingApprovals",
    label: "Aprobaciones pendientes",
    labelKey: "nomina.dashboard.cards.pendingApprovals",
    icon: CheckSquare,
    accent: "primary",
  },
  {
    key: "attendancePct",
    label: "Asistencia",
    labelKey: "nomina.dashboard.cards.attendancePct",
    icon: Percent,
    accent: "green",
  },
];

export default function NominaDashboard() {
  const { t } = useTranslation();
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
      <PageContainer width="wide">
        <PageHeader
          actions={
            <Button disabled={loading} variant="brand" onClick={load}>
              <RefreshCw className={loading ? "animate-spin" : ""} />
              Actualizar
            </Button>
          }
          icon={<ClipboardList />}
          subtitle="Resumen de asistencia de hoy"
          title="Asistencia"
        />

        {error && (
          <div
            className="rounded-2xl px-4 py-3 text-sm font-medium"
            style={{
              background: "color-mix(in oklab, var(--bad) 12%, transparent)",
              color: "var(--bad-text)",
            }}
          >
            {error}
          </div>
        )}

        <StatsStrip className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {CARDS.map((c) => {
            const Icon = c.icon;
            const raw = data ? (data[c.key] as number | null) : null;
            const value =
              c.key === "attendancePct"
                ? raw == null
                  ? "—"
                  : `${raw}%`
                : raw == null
                  ? "—"
                  : raw;

            return (
              <StatCard
                key={c.key}
                accent={c.accent}
                icon={<Icon />}
                label={t(c.labelKey, c.label)}
                value={loading ? "…" : value}
              />
            );
          })}
        </StatsStrip>

        <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
          Las excepciones (tarde, inasistencia, sin marcar salida) se detectan
          automáticamente cada pocos minutos y aparecen en{" "}
          <strong>Excepciones</strong> y <strong>Aprobaciones</strong>.
        </p>
      </PageContainer>
    </AppLayout>
  );
}
