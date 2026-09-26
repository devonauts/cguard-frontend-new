import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Shield, User, Sun, Moon } from "lucide-react";

import { getTenantTimezone } from "@/utils/tenantLocation";
import { localeActual } from "@/lib/localeActual";
import { hoyEnLaEmpresa, sumaDias, zonaDeLaEmpresa} from "@/lib/horaDeLaEmpresa";
/** Tenant-tz date key + hour of a shift start. */
function localParts(iso: string | Date): { dateKey: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: getTenantTimezone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value || "";
  let h = parseInt(g("hour"), 10);

  if (h === 24) h = 0; // some engines render midnight as 24

  return { dateKey: `${g("year")}-${g("month")}-${g("day")}`, hour: h };
}

interface RosterCard {
  id: string;
  name: string;
  pattern: Record<string, "day" | "night">;
  role?: { label: string; isRelief: boolean };
}

/** Shape of the shift "events" this roster consumes (subset produced by StationShifts). */
interface RosterEvent {
  guardId?: string;
  guardName?: string;
  start: string | Date;
}

/**
 * "Equipo del puesto" — a card per assigned vigilante (fijos + sacafranco) showing
 * their role and their actual turno/horario as a 14-day día/noche/descanso strip,
 * derived from the generated shifts. Sacafrancos are flagged + sorted last.
 */
export default function StationRoster({
  asignaciones,
  events,
  guardColorMap,
}: {
  /* Las filas de `guard-assignments` que YA leyó `StationShifts`. Antes esto
     las pedía por su cuenta con la misma url que el padre, así que la pestaña
     de turnos salía con dos peticiones idénticas separadas por 2 ms.
     `null` = todavía cargando. */
  asignaciones: any[] | null;
  events: RosterEvent[];
  guardColorMap: Record<string, { accent: string; bg: string; text: string }>;
}) {
  const { t } = useTranslation();
  const [roles, setRoles] = useState<
    Record<string, { label: string; isRelief: boolean }>
  >({});

  useEffect(() => {
    if (!asignaciones) return;
    const m: Record<string, { label: string; isRelief: boolean }> = {};

    for (const a of asignaciones) {
      const gid = String(a.guardId || a.guard?.id || "");

      if (!gid) continue;
      const isRelief = !!a.isRelief || a.position?.type === "sacafranco";

      m[gid] = {
        label:
          a.position?.name ||
          (isRelief
            ? t("clients.assignGuards.roleSf", "Sacafranco")
            : t("ui.StationGuards.fijo", "Fijo")),
        isRelief,
      };
    }
    setRoles(m);
  }, [asignaciones, t]);

  const days = useMemo(() => {
    // Se cuenta en días de calendario desde HOY EN LA EMPRESA. Antes se partía
    // de la medianoche local y se pasaba a UTC: al este de Greenwich (Madrid)
    // esa medianoche son las 22:00Z del día ANTERIOR, así que el cuadrante
    // empezaba ayer.
    const out: string[] = [];
    const hoy = hoyEnLaEmpresa();

    for (let i = 0; i < 14; i++) out.push(sumaDias(hoy, i));

    return out;
  }, []);

  const roster = useMemo<RosterCard[]>(() => {
    const byGuard: Record<string, RosterCard> = {};

    for (const ev of events) {
      const gid = String(ev.guardId || "");

      if (!gid || gid === "unknown") continue;
      const { dateKey, hour } = localParts(ev.start);
      const kind: "day" | "night" = hour >= 6 && hour < 18 ? "day" : "night";

      (byGuard[gid] = byGuard[gid] || {
        id: gid,
        name: ev.guardName || t("guard.roleLabel", "Vigilante"),
        pattern: {},
      }).pattern[dateKey] = kind;
    }

    return Object.values(byGuard)
      .map((v) => ({ ...v, role: roles[v.id] }))
      .sort(
        (a, b) =>
          (a.role?.isRelief ? 1 : 0) - (b.role?.isRelief ? 1 : 0) ||
          a.name.localeCompare(b.name),
      );
  }, [events, roles, t]);

  if (roster.length === 0) return null;

  return (
    <div className="mb-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <h4 className="cg-eyebrow">{t("ui.StationRoster.equipoDelPuesto")}</h4>
        <div
          className="flex items-center gap-2.5 text-[9px]"
          style={{ color: "var(--ink-soft)" }}
        >
          <span className="inline-flex items-center gap-0.5">
            <Sun size={9} style={{ color: "var(--warn-text)" }} />{" "}
            {t("ui.StationRoster.dia", "Día")}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Moon size={9} style={{ color: "var(--info-text)" }} />{" "}
            {t("clients.coverage.cell.night.legend", "Noche")}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ background: "var(--glass-sunken)" }}
            />{" "}
            {t("ui.ClientStaff.descanso", "Descanso")}
          </span>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {roster.map((g) => {
          const color = guardColorMap[g.id] || {
            accent: "var(--brand)",
            bg: "color-mix(in oklab, var(--brand) 12%, transparent)",
            text: "var(--brand-text)",
          };
          const isSf = g.role?.isRelief;
          // El sacafranco (relevo) se distingue siempre en verde: es un papel
          // operativo, no una serie de datos, y no debe moverse con el acento.
          const accent = isSf ? "var(--ok)" : color.accent;
          const accentInk = isSf ? "var(--ok-text)" : color.text;
          // Rest weekday(s) straight from the REAL generated schedule: days in the
          // window with no shift = descanso. Makes the libre day visible at a glance
          // (a fijo's rest should be a consistent weekday when the cycle is weekly).
          const restWeekdays = Array.from(
            new Set(
              days
                .filter((d) => !g.pattern[d])
                .map((d) =>
                  new Date(d + "T12:00:00").toLocaleDateString(localeActual(), { timeZone: zonaDeLaEmpresa(),
                    weekday: "long",
                  }),
                ),
            ),
          );
          const restLabel =
            restWeekdays.length === 1
              ? restWeekdays[0]
              : restWeekdays.slice(0, 2).join(", ");

          return (
            <div key={g.id} className="glass-flat w-[228px] shrink-0 p-3">
              <div className="flex items-center gap-2">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                  style={{
                    background: isSf
                      ? "color-mix(in oklab, var(--ok) 15%, transparent)"
                      : color.bg,
                    color: accentInk,
                  }}
                >
                  {g.name
                    .split(" ")
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join("")}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{g.name}</p>
                  <p
                    className="flex items-center gap-1 text-[10px] font-medium"
                    style={{ color: accentInk }}
                  >
                    {isSf ? <Shield size={10} /> : <User size={10} />}
                    {g.role?.label ||
                      (isSf
                        ? t("clients.assignGuards.roleSf", "Sacafranco")
                        : t("ui.StationGuards.fijo", "Fijo"))}
                  </p>
                  {!isSf && restLabel && (
                    <p
                      className="mt-0.5 flex items-center gap-1 truncate text-[10px] capitalize"
                      style={{ color: "var(--ink-soft)" }}
                      title={`${t("ui.AsignacionEditModal.descansa", "Descansa:")} ${restLabel}`}
                    >
                      <Moon
                        className="shrink-0"
                        size={9}
                        style={{ color: "var(--info-text)" }}
                      />{" "}
                      {t("ui.AsignacionEditModal.descansa", "Descansa:")}{" "}
                      {restLabel}
                    </p>
                  )}
                </div>
              </div>
              {/* 14-day turno strip */}
              <div className="mt-2.5 flex gap-0.5">
                {days.map((d) => {
                  const k = g.pattern[d];
                  const fondo =
                    k === "day"
                      ? "var(--warn)"
                      : k === "night"
                        ? "var(--info)"
                        : "var(--glass-sunken)";
                  const lab =
                    k === "day"
                      ? t("ui.StationRoster.letraDia", "D")
                      : k === "night"
                        ? t("ui.StationRoster.letraNoche", "N")
                        : t("ui.StationRoster.letraLibre", "L");

                  return (
                    <div
                      key={d}
                      className="flex h-5 flex-1 items-center justify-center rounded-sm text-[8px] font-bold"
                      style={{
                        background: fondo,
                        color: k ? "var(--brand-ink)" : "var(--ink-faint)",
                      }}
                      title={`${d}: ${
                        k === "day"
                          ? t("ui.StationRoster.dia", "Día")
                          : k === "night"
                            ? t("clients.coverage.cell.night.legend", "Noche")
                            : t("ui.ClientStaff.descanso", "Descanso")
                      }`}
                    >
                      {lab}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
