/**
 * Vista de tarjetas de ESTACIONES (como la de clientes). Cada tarjeta:
 * el LOGO del cliente dueño, el «nominativo» (nickname) como título, el nombre
 * del puesto, el cliente y cuántos vigilantes tiene asignados — con clic directo
 * al detalle de la estación. Los datos llegan en lote desde /station/cards.
 */
import { useTranslation } from "react-i18next";
import { RadioTower, Building2, Users, MapPin, ShieldCheck, ShieldAlert, ShieldX, Moon, Clock } from "lucide-react";
import { StatusBadge, SkeletonCards, EmptyState, GlassPanel, SmartImage } from "@/components/kit";
import type { StationCard } from "@/lib/api/stationService";
import { getTenantTimezone } from "@/utils/tenantLocation";

import { localeActual } from '@/lib/localeActual'
/**
 * ════════════════════════════════════════════════════════════════════════════
 * «CON COBERTURA» NO QUERÍA DECIR LO QUE PARECÍA
 *
 * La insignia se encendía en verde con `guardCount > 0`, y ese número es la
 * PLANTILLA del contrato: cuántos vigilantes tiene asignados el puesto. Un
 * puesto con dos asignados y nadie fichado a las tres de la mañana salía en
 * verde igual que uno atendido. Quien lo leía entendía «hay alguien ahí»,
 * entraba, y se encontraba lo contrario — que es peor que no tener insignia.
 *
 * Ahora la insignia dice lo que pasa AHORA, en cuatro estados que no se
 * confunden entre sí:
 *
 *   Vigilante en puesto   verde     alguien fichado
 *   Esperando relevo      ámbar     se le espera y aún no llega (o falta uno)
 *   Puesto sin cubrir     rojo      se le espera, no está, y ya pasó la hora
 *   Fuera de turno        neutro    no toca nadie ahora — no es un problema
 *
 * El neutro es deliberado: un puesto que cierra a las once no es una alarma a
 * medianoche, y pintarlo en rojo enseña a ignorar los rojos de verdad.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Hora corta EN LA ZONA DE LA EMPRESA — «Entra 19:00». */
function horaCorta(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    const tz = getTenantTimezone();
    return new Date(iso).toLocaleTimeString(localeActual(), {
      hour: "2-digit", minute: "2-digit", hour12: false,
      ...(tz ? { timeZone: tz } : {}),
    });
  } catch { return null; }
}

type Insignia = { tone: "ok" | "warn" | "bad" | "neutral"; icon: JSX.Element; label: string; hint?: string | null };

function insigniaDeCobertura(s: StationCard, t: (k: string, o?: any) => string): Insignia | null {
  // Sin estado calculado no se inventa nada: antes que una insignia falsa,
  // ninguna.
  if (!s.coverageStatus) return null;
  const entra = horaCorta(s.nextShiftStart);

  switch (s.coverageStatus) {
    case "covered":
      return {
        tone: "ok",
        icon: <ShieldCheck className="h-3 w-3" />,
        // El número importa: un puesto de dos con dos no es lo mismo que con uno.
        label: s.onDutyCount > 1
          ? t("stations.coverage.onDutyN", { count: s.onDutyCount, defaultValue: "{{count}} en puesto" })
          : t("stations.coverage.onDuty", { defaultValue: "Vigilante en puesto" }),
      };
    case "at_risk":
      return {
        tone: "warn",
        icon: <ShieldAlert className="h-3 w-3" />,
        // Con alguien dentro pero incompleto, el problema es otro: falta parte
        // del relevo, no el relevo entero.
        label: s.onDutyCount > 0
          ? t("stations.coverage.partial", {
              on: s.onDutyCount, exp: s.expectedCount,
              defaultValue: "Relevo incompleto ({{on}}/{{exp}})",
            })
          : t("stations.coverage.awaiting", { defaultValue: "Esperando vigilante" }),
      };
    case "uncovered":
      return {
        tone: "bad",
        icon: <ShieldX className="h-3 w-3" />,
        label: s.openGaps > 0
          ? t("stations.coverage.gapDeclared", { defaultValue: "Hueco declarado" })
          : t("stations.coverage.uncovered", { defaultValue: "Puesto sin cubrir" }),
      };
    default:
      // Fuera de turno. Y si el puesto NO tiene turnos hoy, eso es otra cosa —
      // decir «fuera de turno» de un puesto que nadie ha programado sugiere un
      // horario que no existe.
      return s.shiftsToday > 0
        ? {
            tone: "neutral",
            icon: <Moon className="h-3 w-3" />,
            label: t("stations.coverage.offHours", { defaultValue: "Fuera de turno" }),
            hint: entra ? t("stations.coverage.nextAt", { time: entra, defaultValue: "Entra {{time}}" }) : null,
          }
        : {
            tone: "neutral",
            icon: <Clock className="h-3 w-3" />,
            label: t("stations.coverage.noShifts", { defaultValue: "Sin turnos hoy" }),
            hint: entra ? t("stations.coverage.nextAt", { time: entra, defaultValue: "Entra {{time}}" }) : null,
          };
  }
}

export default function StationCardsGrid({
  stations,
  loading,
  onOpen,
}: {
  stations: StationCard[];
  loading: boolean;
  onOpen: (s: StationCard) => void;
}) {
  const { t } = useTranslation();

  if (loading) return <SkeletonCards count={8} className="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" />;
  if (!stations.length) {
    return (
      <EmptyState
        icon={<RadioTower />}
        title={t("stations.empty.title", { defaultValue: "Sin estaciones" })}
        description={t("stations.empty.description", { defaultValue: "Las estaciones se crean dentro de cada puesto." })}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {stations.map((s, i) => {
        // El nominativo (nickname) manda como título; si no hay, el nombre del puesto.
        const title = s.nickname || s.stationName || "?";
        const subtitle = s.nickname ? s.stationName : null;
        const initial = (s.clientName || title || "?").charAt(0).toUpperCase();
        return (
          <GlassPanel
            key={s.id}
            flat
            hover
            role="button"
            tabIndex={0}
            onClick={() => onOpen(s)}
            onKeyDown={(e) => { if (e.key === "Enter") onOpen(s); }}
            className="cg-focus group flex cursor-pointer flex-col p-4 animate-in fade-in slide-in-from-bottom-2"
            style={{ animationDelay: `${Math.min(i, 12) * 30}ms`, animationFillMode: "backwards" }}
          >
            <div className="flex items-start gap-3">
              <SmartImage
                src={s.clientLogoUrl}
                alt=""
                rounded="rounded-xl"
                fit="contain"
                className="h-12 w-12 shrink-0 border"
                style={{ background: "oklch(1 0 0)", borderColor: "var(--hairline)" }}
                fallback={
                  <span
                    className="grid h-full w-full place-items-center text-lg font-bold"
                    style={{ background: "var(--brand-wash)", color: "var(--brand-text)" }}
                  >
                    {initial}
                  </span>
                }
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold leading-tight" title={title}>{title}</p>
                {subtitle && (
                  <p className="truncate text-sm leading-tight" style={{ color: "var(--ink-soft)" }} title={subtitle}>{subtitle}</p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {(() => {
                    const ins = insigniaDeCobertura(s, t);
                    if (!ins) return null;
                    return (
                      <>
                        <StatusBadge tone={ins.tone} dot={false}>
                          {ins.icon} {ins.label}
                        </StatusBadge>
                        {ins.hint && (
                          <span className="text-xs" style={{ color: "var(--ink-faint)" }}>{ins.hint}</span>
                        )}
                      </>
                    );
                  })()}
                  {/* Un puesto sin NADIE asignado en el contrato es un problema
                      distinto —y previo— al de la cobertura de esta noche. */}
                  {s.guardCount === 0 && (
                    <StatusBadge tone="warn" dot={false}>
                      {t("stations.noGuardsAssigned", { defaultValue: "Sin vigilantes asignados" })}
                    </StatusBadge>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 space-y-1 text-sm" style={{ color: "var(--ink-soft)" }}>
              {s.clientName && (
                <p className="flex items-center gap-1.5 truncate">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{s.clientName}</span>
                </p>
              )}
              {s.postSiteName && (
                <p className="flex items-center gap-1.5 truncate">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{s.postSiteName}</span>
                </p>
              )}
            </div>

            <div
              className="mt-3 flex items-center gap-4 border-t pt-3 text-sm"
              style={{ borderColor: "var(--hairline)", color: "var(--ink-soft)" }}
            >
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" style={{ color: "var(--brand-text)" }} />
                <span className="font-semibold text-foreground">{s.guardCount}</span>{" "}
                {t("stations.guardsAssignedLabel", { defaultValue: "asignado(s)" })}
              </span>
            </div>
          </GlassPanel>
        );
      })}
    </div>
  );
}
