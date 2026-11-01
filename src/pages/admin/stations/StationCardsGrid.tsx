import { EstadoVacio } from "@/components/EstadoVacio";
/**
 * Vista de tarjetas de ESTACIONES (como la de clientes). Cada tarjeta:
 * el LOGO del cliente dueño, el «nominativo» (nickname) como título, el nombre
 * del puesto, el cliente y cuántos vigilantes tiene asignados — con clic directo
 * al detalle de la estación. Los datos llegan en lote desde /station/cards.
 */
import type { JSX } from "react";
import type { StationCard } from "@/lib/api/stationService";

import { useTranslation } from "react-i18next";
import {
  RadioTower,
  Plus,
  Building2,
  Users,
  MapPin,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Moon,
  Clock,
  Route,
  QrCode,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import EtiquetaDeSucursal from "@/components/sucursales/EtiquetaDeSucursal";
import { useEtiquetasDeSucursal } from "@/hooks/useEtiquetasDeSucursal";
import {
  StatusBadge,
  SkeletonCards,
  EmptyState,
  GlassPanel,
  SmartImage,
} from "@/components/kit";
import { getTenantTimezone } from "@/utils/tenantLocation";
import { localeActual } from "@/lib/localeActual";
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
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      ...(tz ? { timeZone: tz } : {}),
    });
  } catch {
    return null;
  }
}

type Insignia = {
  tone: "ok" | "warn" | "bad" | "neutral";
  icon: JSX.Element;
  label: string;
  hint?: string | null;
};

/**
 * El nombre que se enseña en la insignia verde.
 *
 * SE ACORTA A NOMBRE + PRIMER APELLIDO. La insignia mide lo que mide, y
 * «Rubén Castillo Hernández» la desborda o la trunca a mitad de palabra, que
 * es peor que acortar bien. Dos palabras es además como se refiere a alguien
 * quien mira el tablero.
 *
 * Devuelve `null` si no hay nombre, para que quien llama elija el texto de
 * reserva en vez de pintar una insignia vacía.
 */
function nombreEnPuesto(s: StationCard): string | null {
  const nombres = Array.isArray(s.onDutyNames)
    ? s.onDutyNames.filter(Boolean)
    : [];

  if (!nombres.length) return null;
  const corto = nombres[0].trim().split(/\s+/).slice(0, 2).join(" ");

  if (!corto) return null;

  return nombres.length > 1 ? `${corto} +${nombres.length - 1}` : corto;
}

function insigniaDeCobertura(
  s: StationCard,
  t: (k: string, o?: any) => string,
): Insignia | null {
  // Sin estado calculado no se inventa nada: antes que una insignia falsa,
  // ninguna.
  if (!s.coverageStatus) return null;
  const entra = horaCorta(s.nextShiftStart);

  switch (s.coverageStatus) {
    case "covered":
      return {
        tone: "ok",
        icon: <ShieldCheck className="h-3 w-3" />,
        // EL NOMBRE, no «Vigilante en puesto». Que hay alguien ya lo dice el
        // verde; la pregunta que sigue —y la única que importa a esa hora— es
        // quién. Con dos o más se enseña el primero y «+N»: dos nombres
        // completos no caben en la insignia y la tarjeta se rompe. Sin nombre
        // resuelto se vuelve al texto de siempre; una insignia en blanco se
        // lee como que el puesto está vacío.
        label:
          nombreEnPuesto(s) ??
          (s.onDutyCount > 1
            ? t("stations.coverage.onDutyN", {
                count: s.onDutyCount,
                defaultValue: "{{count}} en puesto",
              })
            : t("stations.coverage.onDuty", {
                defaultValue: "Vigilante en puesto",
              })),
      };
    case "at_risk":
      return {
        tone: "warn",
        icon: <ShieldAlert className="h-3 w-3" />,
        // Con alguien dentro pero incompleto, el problema es otro: falta parte
        // del relevo, no el relevo entero.
        label:
          s.onDutyCount > 0
            ? t("stations.coverage.partial", {
                on: s.onDutyCount,
                exp: s.expectedCount,
                defaultValue: "Relevo incompleto ({{on}}/{{exp}})",
              })
            : t("stations.coverage.awaiting", {
                defaultValue: "Esperando vigilante",
              }),
      };
    case "uncovered":
      return {
        tone: "bad",
        icon: <ShieldX className="h-3 w-3" />,
        label:
          s.openGaps > 0
            ? t("stations.coverage.gapDeclared", {
                defaultValue: "Hueco declarado",
              })
            : t("stations.coverage.uncovered", {
                defaultValue: "Puesto sin cubrir",
              }),
      };
    default:
      // Fuera de turno. Y si el puesto NO tiene turnos hoy, eso es otra cosa —
      // decir «fuera de turno» de un puesto que nadie ha programado sugiere un
      // horario que no existe.
      return s.shiftsToday > 0
        ? {
            tone: "neutral",
            icon: <Moon className="h-3 w-3" />,
            label: t("stations.coverage.offHours", {
              defaultValue: "Fuera de turno",
            }),
            hint: entra
              ? t("stations.coverage.nextAt", {
                  time: entra,
                  defaultValue: "Entra {{time}}",
                })
              : null,
          }
        : {
            tone: "neutral",
            icon: <Clock className="h-3 w-3" />,
            label: t("stations.coverage.noShifts", {
              defaultValue: "Sin turnos hoy",
            }),
            hint: entra
              ? t("stations.coverage.nextAt", {
                  time: entra,
                  defaultValue: "Entra {{time}}",
                })
              : null,
          };
  }
}

/**
 * La insignia del TURNO: la letra manda (D/T/N) y el color es el del relevo,
 * que es lo que se viene a mirar — verde corre normal, ámbar termina en menos
 * de una hora, rojo venció y nadie relevó, neutro no hay nadie fichado.
 */
function insigniaDeTurno(
  s: StationCard,
  t: (k: string, o?: any) => string,
): Insignia | null {
  const sh = s.shift;

  if (!sh) return null;
  const letra = t(`stations.shift.${sh.code}`, { defaultValue: sh.code });
  let hint: string | null = null;

  if (sh.vacant)
    hint = t("stations.shift.vacant", { defaultValue: "sin vigilante" });
  else if (sh.overdue)
    hint = t("stations.shift.overdue", {
      time: sh.end ?? "",
      defaultValue: "sin relevo desde {{time}}",
    });
  else if (sh.endsSoon)
    hint = t("stations.shift.reliefSoon", {
      time: sh.end ?? "",
      defaultValue: "relevo {{time}}",
    });
  else if (sh.end)
    hint = t("stations.shift.until", {
      time: sh.end,
      defaultValue: "hasta {{time}}",
    });
  const tone: Insignia["tone"] = sh.vacant
    ? "neutral"
    : sh.overdue
      ? "bad"
      : sh.endsSoon
        ? "warn"
        : "ok";

  return {
    tone,
    icon: <Clock className="h-3 w-3" />,
    label: t("stations.shift.label", {
      code: letra,
      defaultValue: "Turno {{code}}",
    }),
    hint,
  };
}

export default function StationCardsGrid({
  stations,
  loading,
  onOpen,
  onOpenTab,
  onAdd,
  consulta,
  onLimpiarConsulta,
  porQueNoPuedeCrear,
}: {
  stations: StationCard[];
  loading: boolean;
  onOpen: (s: StationCard) => void;
  /** Abrir la estación DIRECTAMENTE en una pestaña (rondas, códigos QR…). */
  onOpenTab?: (s: StationCard, tab: string) => void;
  /** Empty company: the empty state offers the same «Agregar estación». */
  onAdd?: () => void;
  /** The search typed above the grid: an empty result then says «nothing matches». */
  consulta?: string;
  onLimpiarConsulta?: () => void;
  /** Set when the user can't create stations: the empty state says why. */
  porQueNoPuedeCrear?: string;
}) {
  // Módulo Sucursales (vista global): la etiqueta de sucursal de cada fila.
  const suc = useEtiquetasDeSucursal();
  const { t } = useTranslation();

  if (loading)
    return (
      <SkeletonCards
        className="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        count={8}
      />
    );
  if (!stations.length) {
    return (
      <EstadoVacio
        description={t("ui.StationsPage.vacioAyuda", {
          defaultValue:
            "Una estación es el puesto que tu empresa cubre: una garita, una recepción, una ronda. Elige el cliente y la sede, y luego cuántos vigilantes pide.",
        })}
        filtrado={!!consulta?.trim()}
        icon={<RadioTower />}
        paso={
          onAdd
            ? {
                label: t("ui.StationsPage.crearLaPrimera", "Crear la primera estación"),
                onClick: onAdd,
                puede: porQueNoPuedeCrear === undefined,
                porQueNo: porQueNoPuedeCrear || undefined,
              }
            : null
        }
        title={t("ui.StationsPage.vacioTitulo", "Todavía no hay estaciones")}
        onLimpiarFiltro={onLimpiarConsulta}
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
            className="cg-focus group flex cursor-pointer flex-col p-4 animate-in fade-in slide-in-from-bottom-2"
            role="button"
            style={{
              animationDelay: `${Math.min(i, 12) * 30}ms`,
              animationFillMode: "backwards",
            }}
            tabIndex={0}
            onClick={() => onOpen(s)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onOpen(s);
            }}
          >
            <div className="flex items-start gap-3">
              <SmartImage
                alt=""
                className="h-12 w-12 shrink-0 border"
                fallback={
                  <span
                    className="grid h-full w-full place-items-center text-lg font-bold"
                    style={{
                      background: "var(--brand-wash)",
                      color: "var(--brand-text)",
                    }}
                  >
                    {initial}
                  </span>
                }
                fit="contain"
                rounded="rounded-xl"
                src={s.clientLogoUrl}
                style={{
                  background: "oklch(1 0 0)",
                  borderColor: "var(--hairline)",
                }}
              />
              <div className="min-w-0 flex-1">
                <p
                  className="flex min-w-0 items-center gap-1.5 font-semibold leading-tight"
                  title={title}
                >
                  <span className="truncate">{title}</span>
                  <EtiquetaDeSucursal sucursal={suc.deSede(s.postSiteId)} />
                </p>
                {subtitle && (
                  <p
                    className="truncate text-sm leading-tight"
                    style={{ color: "var(--ink-soft)" }}
                    title={subtitle}
                  >
                    {subtitle}
                  </p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {(() => {
                    const ins = insigniaDeCobertura(s, t);

                    if (!ins) return null;

                    return (
                      <>
                        <StatusBadge dot={false} tone={ins.tone}>
                          {ins.icon} {ins.label}
                        </StatusBadge>
                        {ins.hint && (
                          <span
                            className="text-xs"
                            style={{ color: "var(--ink-faint)" }}
                          >
                            {ins.hint}
                          </span>
                        )}
                      </>
                    );
                  })()}
                  {(() => {
                    const turno = insigniaDeTurno(s, t);

                    if (!turno) return null;

                    return (
                      <>
                        <StatusBadge dot={false} tone={turno.tone}>
                          {turno.icon} <strong>{turno.label}</strong>
                        </StatusBadge>
                        {turno.hint && (
                          <span
                            className="text-xs"
                            style={{ color: "var(--ink-faint)" }}
                          >
                            {turno.hint}
                          </span>
                        )}
                      </>
                    );
                  })()}
                  {/* Un puesto sin NADIE asignado en el contrato es un problema
                      distinto —y previo— al de la cobertura de esta noche. */}
                  {s.guardCount === 0 && (
                    <StatusBadge dot={false} tone="warn">
                      {t("stations.noGuardsAssigned", {
                        defaultValue: "Sin vigilantes asignados",
                      })}
                    </StatusBadge>
                  )}
                </div>
              </div>
            </div>

            <div
              className="mt-3 space-y-1 text-sm"
              style={{ color: "var(--ink-soft)" }}
            >
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
              style={{
                borderColor: "var(--hairline)",
                color: "var(--ink-soft)",
              }}
            >
              <span className="flex items-center gap-1.5">
                <Users
                  className="h-4 w-4"
                  style={{ color: "var(--brand-text)" }}
                />
                <span className="font-semibold text-foreground">
                  {s.guardCount}
                </span>{" "}
                {t("ui.StationCardsGrid.asignados", {
                  defaultValue: "asignados",
                  count: Number(s.guardCount) || 0,
                })}
              </span>

              {/* ── ATAJOS AL TRABAJO REAL DEL PUESTO ────────────────────────
                  Dar de alta una estación y montar sus rondas es la MISMA
                  tarea, y estaban a cuatro clics de distancia: abrir la
                  tarjeta caía en el resumen y había que encontrar la pestaña.
                  `stopPropagation` porque la tarjeta entera ya es un botón. */}
              {onOpenTab && (
                <span className="ml-auto flex items-center gap-1">
                  <button
                    aria-label={
                      t("stations.openRondas", {
                        defaultValue: "Rondas del puesto",
                      }) as string
                    }
                    className="cg-focus cg-btn-glass grid h-10 w-10 place-items-center rounded-md sm:h-7 sm:w-7"
                    title={
                      t("stations.openRondas", {
                        defaultValue: "Rondas del puesto",
                      }) as string
                    }
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenTab(s, "site-tours");
                    }}
                  >
                    <Route className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                  </button>
                  <button
                    aria-label={
                      t("stations.openQr", {
                        defaultValue: "Códigos QR",
                      }) as string
                    }
                    className="cg-focus cg-btn-glass grid h-10 w-10 place-items-center rounded-md sm:h-7 sm:w-7"
                    title={
                      t("stations.openQr", {
                        defaultValue: "Códigos QR",
                      }) as string
                    }
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenTab(s, "etiquetas");
                    }}
                  >
                    <QrCode className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                  </button>
                </span>
              )}
            </div>
          </GlassPanel>
        );
      })}
    </div>
  );
}
