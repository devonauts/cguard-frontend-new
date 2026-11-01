/**
 * Asistencia › Resumen de hoy — the company's day, counted by the schedule.
 *
 * The server counts (services/asistencia/resumenDeHoy): today is the company
 * day 00:00→00:00 in its zone, an overnight shift belongs to the day it starts,
 * a cover is one seat, leave comes from Ausencias y permisos. Every card opens
 * the list behind its number. If the summary does not load, the page says so
 * — it never shows zeros as if the day were quiet.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  AlarmClock,
  AlertTriangle,
  CalendarCheck,
  CheckSquare,
  ClipboardList,
  Clock,
  Hourglass,
  LogOut,
  Palmtree,
  Percent,
  RefreshCw,
  Timer,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import attendanceService from "@/lib/api/attendanceService";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader, StatCard, StatsStrip } from "@/components/kit";
import { enlaceDeTarjeta, valorDe, type ResumenDelDia } from "@/lib/asistenciaVistas";

type Accent = "primary" | "green" | "blue" | "red" | "orange" | "slate";

interface Tarjeta {
  key: keyof ResumenDelDia;
  label: string;
  labelKey: string;
  icon: LucideIcon;
  accent: Accent;
}

// `labelKey` viaja en la constante y se traduce al pintar.
const TARJETAS: Tarjeta[] = [
  { key: "scheduledToday", label: "Programados hoy", labelKey: "nomina.dashboard.cards.scheduledToday", icon: CalendarCheck, accent: "primary" },
  { key: "presentToday", label: "Llegaron", labelKey: "ui.Asistencia.llegaron", icon: Users, accent: "green" },
  { key: "lateToday", label: "Llegadas tarde", labelKey: "nomina.dashboard.cards.lateToday", icon: Clock, accent: "orange" },
  { key: "noShowsToday", label: "Inasistencias", labelKey: "nomina.dashboard.cards.noShowsToday", icon: AlertTriangle, accent: "red" },
  { key: "onLeaveToday", label: "De permiso o vacaciones", labelKey: "ui.Asistencia.dePermiso", icon: Palmtree, accent: "blue" },
  { key: "notYetDue", label: "Aún por llegar", labelKey: "ui.Asistencia.aunPorLlegar", icon: Hourglass, accent: "slate" },
  { key: "clockedInNow", label: "En servicio ahora", labelKey: "nomina.dashboard.cards.clockedInNow", icon: UserCheck, accent: "green" },
  { key: "missedClockouts", label: "Sin marcar salida", labelKey: "nomina.excepcion.missed_clockout", icon: LogOut, accent: "orange" },
  { key: "overtimeToday", label: "Tiempo extra", labelKey: "nomina.dashboard.cards.overtimeToday", icon: Timer, accent: "blue" },
  { key: "pendingApprovals", label: "Aprobaciones pendientes", labelKey: "nomina.dashboard.cards.pendingApprovals", icon: CheckSquare, accent: "primary" },
  { key: "attendancePct", label: "Asistencia", labelKey: "nomina.dashboard.cards.attendancePct", icon: Percent, accent: "green" },
];

export default function NominaDashboard() {
  const { t } = useTranslation();
  const [data, setData] = useState<ResumenDelDia | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    attendanceService
      .dashboard()
      .then((d) => setData(d))
      .catch((e) => {
        // Old numbers would read as today's: clear them.
        setData(null);
        setError(e?.message || t("ui.NominaDashboard.errorAlCargarElPanel", "Error al cargar el panel"));
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline">
                <Link to="/nomina/atrasos">
                  <AlarmClock /> {t("sidebar.asistencia.atrasos", "Atrasos de la semana")}
                </Link>
              </Button>
              <Button disabled={loading} variant="brand" onClick={load}>
                <RefreshCw className={loading ? "animate-spin" : ""} />
                {t("dashboard.refresh", "Actualizar")}
              </Button>
            </div>
          }
          icon={<ClipboardList />}
          subtitle={t("ui.NominaDashboard.resumenDeAsistenciaDeHoy", "Resumen de asistencia de hoy")}
          title={t("sidebar.asistencia.resumen-hoy", "Resumen de hoy")}
        />

        {error && (
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm font-medium"
            role="alert"
            style={{
              background: "color-mix(in oklab, var(--bad) 12%, transparent)",
              color: "var(--bad-text)",
            }}
          >
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={load}>
              {t("ui.Asistencia.reintentar", "Reintentar")}
            </Button>
          </div>
        )}

        <StatsStrip className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {TARJETAS.map((c) => {
            const Icon = c.icon;
            const tarjeta = (
              <StatCard
                accent={c.accent}
                icon={<Icon />}
                label={t(c.labelKey, c.label)}
                value={loading ? "…" : valorDe(data, c.key)}
              />
            );

            return data ? (
              <Link key={c.key} className="cg-focus block rounded-2xl" to={enlaceDeTarjeta(c.key, data.day)}>
                {tarjeta}
              </Link>
            ) : (
              <div key={c.key}>{tarjeta}</div>
            );
          })}
        </StatsStrip>

        <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {t(
            "ui.Asistencia.comoSeCuenta",
            "Se cuenta el día de la empresa, en su hora. Un turno de noche cuenta el día en que empieza; quien cubre a otro ocupa un solo puesto; quien no marcó a los 20 minutos del inicio cuenta como inasistencia.",
          )}
        </p>
      </PageContainer>
    </AppLayout>
  );
}
