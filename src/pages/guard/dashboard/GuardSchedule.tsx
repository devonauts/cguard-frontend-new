import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Calendar, Loader2, Clock, CalendarCheck, Plane } from "lucide-react";

import guardMeService from "@/lib/api/guardMeService";
import {
  PageContainer,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/kit";
import { localeActual } from "@/lib/localeActual";
export default function GuardSchedule() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await guardMeService.schedule();

        setData(res);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  const shifts = data?.shifts || [];
  const freeDays = data?.freeDays || [];
  const timeOff = data?.timeOff || [];

  const fmtDate = (v: any) => {
    if (!v) return "-";
    try {
      return new Intl.DateTimeFormat(localeActual(), {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(v));
    } catch {
      return String(v);
    }
  };

  const fmtDay = (v: any) => {
    if (!v) return "-";
    try {
      return new Intl.DateTimeFormat(localeActual(), {
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(new Date(v));
    } catch {
      return String(v);
    }
  };

  const now = Date.now();

  return (
    <PageContainer className="px-4 pt-4 sm:px-6 sm:pt-6" width="narrow">
      <PageHeader
        icon={<Calendar />}
        subtitle={t("guard.schedule.upcoming", "Próximos turnos")}
        title={t("guard.schedule.title", "Mi Horario")}
      />

      {/* Upcoming Shifts */}
      <Section
        icon={<Clock />}
        title={t("guard.schedule.upcoming", "Próximos turnos")}
      >
        {shifts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("comun.sinTurnosProgramados")}
          </p>
        ) : (
          <div className="space-y-2.5">
            {shifts.map((s: any) => {
              const isActive =
                new Date(s.startTime).getTime() <= now &&
                new Date(s.endTime).getTime() >= now;

              return (
                <div
                  key={s.id}
                  className="rounded-xl border p-3.5"
                  style={
                    isActive
                      ? {
                          borderColor:
                            "color-mix(in oklab, var(--ok) 45%, transparent)",
                          background:
                            "color-mix(in oklab, var(--ok) 6%, transparent)",
                        }
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">
                      {s.station?.stationName || "Puesto"}
                    </p>
                    {isActive && <StatusBadge tone="green">AHORA</StatusBadge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {fmtDate(s.startTime)} — {fmtDate(s.endTime)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Free Days */}
      <Section
        icon={<CalendarCheck />}
        title={t("guard.schedule.freeDays", "Días libres")}
      >
        {freeDays.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t(
              "ui.GuardSchedule.noTienesDiasLibresAprobados",
              "No tienes días libres aprobados próximos.",
            )}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {freeDays.slice(0, 30).map((d: string) => (
              <StatusBadge key={d} dot={false} tone="green">
                {fmtDay(d + "T12:00:00")}
              </StatusBadge>
            ))}
          </div>
        )}
      </Section>

      {/* Approved Time Off */}
      {timeOff.length > 0 && (
        <Section
          icon={<Plane />}
          title={t("guard.schedule.approvedTimeOff", "Permisos aprobados")}
        >
          <div className="space-y-2.5">
            {timeOff.map((to: any) => (
              <div key={to.id} className="rounded-xl border p-3.5">
                <p className="text-sm font-semibold text-foreground capitalize">
                  {to.type}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {fmtDay(to.startDate)} — {fmtDay(to.endDate)}
                </p>
                {to.reason && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {to.reason}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
    </PageContainer>
  );
}
