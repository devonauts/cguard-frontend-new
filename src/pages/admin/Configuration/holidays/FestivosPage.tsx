/**
 * Configuración › Operación › Festivos
 *
 * NO EXISTÍA NADA. Sin calendario de festivos no hay recargo dominical ni de
 * feriado en ningún país, el generador programa el 1 de enero como un martes
 * cualquiera, la hoja de horas no distingue un turno de Navidad de uno normal, y
 * las metas de cobertura no descuentan el día.
 *
 * Desde la fase 3 el calendario OFICIAL del país se calcula solo (backend
 * lib/payroll/feriadosPorPais): aquí se enciende, se quitan los días que la
 * empresa no guarda y se agregan los locales y los propios.
 *
 * «Se repite cada año» es la casilla que más ahorra: sin ella habría que teclear
 * Navidad cada enero — el trabajo manual que hundió al motor de nómina anterior,
 * con sus tablas de constantes por año editadas a mano en el repositorio.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CalendarDays, Plus, Trash2, Loader2, Info, Undo2, Landmark, ChevronLeft, ChevronRight } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import {
  PageContainer,
  PageHeader,
  Section,
  SkeletonCards,
  EmptyState,
  InfoNote,
  StatusBadge,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import api from "@/lib/api";
import { localeActual } from "@/lib/localeActual";
import { hoyEnLaEmpresa } from "@/lib/horaDeLaEmpresa";
import { confirmDialog } from "@/components/ui/confirmDialog";

type Festivo = {
  id: string;
  date: string;
  name: string;
  kind: "national" | "company";
  recurring: boolean;
  payMultiplier: number | null;
  /** «country» = computed from the company's country; «company» = typed here. */
  source?: "country" | "company";
  movedFrom?: string | null;
};

type Calendario = {
  pais: string | null;
  activo: boolean;
  fuente: string | null;
  nota: string | null;
  quitados: { id: string; date: string; name: string }[];
};

/** «9 ago» — a short civil day, in UTC because the string IS the day. */
function corto(ymd: string) {
  const [a, m, d] = ymd.split("-").map(Number);

  return new Date(Date.UTC(a || 2000, (m || 1) - 1, d || 1)).toLocaleDateString(localeActual(), {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  });
}

/** Country name in the UI language («Ecuador», «Colombia»). */
function nombreDelPais(code: string | null) {
  if (!code) return "";
  try {
    return new Intl.DisplayNames([localeActual()], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

const tenantId = () => localStorage.getItem("tenantId") || "";

/** 'YYYY-MM-DD' → «25 de diciembre de 2026». Formatted in UTC: the string IS
 *  the calendar day, and a local-time conversion would drag the time zone in. */
function legible(
  ymd: string,
  recurrente: boolean,
  t: (k: string, o: Record<string, unknown>) => string,
) {
  const [a, m, d] = ymd.split("-").map(Number);
  const fechaUtc = new Date(Date.UTC(a || 2000, (m || 1) - 1, d || 1));

  if (recurrente) {
    return t("ui.FestivosPage.cadaAnio", {
      defaultValue: "{{date}}, cada año",
      date: fechaUtc.toLocaleDateString(localeActual(), {
        timeZone: "UTC",
        day: "numeric",
        month: "long",
      }),
    });
  }

  return fechaUtc.toLocaleDateString(localeActual(), {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function FestivosPage() {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("settingsEdit");

  const [lista, setLista] = useState<Festivo[]>([]);
  const [cal, setCal] = useState<Calendario | null>(null);
  const [anio, setAnio] = useState(() => Number(hoyEnLaEmpresa().slice(0, 4)));
  const [cambiando, setCambiando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [nuevo, setNuevo] = useState({
    date: "",
    name: "",
    kind: "national",
    recurring: true,
  });

  const cargar = async () => {
    try {
      const { data } = await api.get(`/tenant/${tenantId()}/holiday`, {
        params: { desdeAnio: anio, hastaAnio: anio },
      });
      const filas: Festivo[] = data?.rows || [];

      // This year's days, plus the yearly ones (they hold every year).
      setLista(filas.filter((f) => f.recurring || f.date.startsWith(`${anio}-`)));
      setCal(data?.calendario || null);
    } catch {
      toast.error(
        t("settings.festivos.loadError", {
          defaultValue: "No se pudieron cargar los festivos.",
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anio]);

  const cambiarCalendario = async (activo: boolean) => {
    setCambiando(true);
    try {
      await api.put(`/tenant/${tenantId()}/holiday-calendar`, {
        data: { usarCalendarioDelPais: activo },
      });
      await cargar();
    } catch {
      toast.error(t("settings.festivos.calendarError", { defaultValue: "No se pudo cambiar el calendario." }));
    } finally {
      setCambiando(false);
    }
  };

  /** A national day of the country the company does not observe. */
  const quitar = async (f: Festivo) => {
    try {
      await api.post(`/tenant/${tenantId()}/holiday/quitar`, {
        data: { date: f.date, name: f.name },
      });
      await cargar();
    } catch {
      toast.error(t("settings.festivos.deleteError", { defaultValue: "No se pudo borrar." }));
    }
  };

  const devolver = async (id: string) => {
    try {
      await api.delete(`/tenant/${tenantId()}/holiday/${id}`);
      await cargar();
    } catch {
      toast.error(t("settings.festivos.restoreError", { defaultValue: "No se pudo volver a poner." }));
    }
  };

  const agregar = async () => {
    if (!nuevo.date || !nuevo.name.trim()) {
      toast.error(
        t("settings.festivos.missingFieldsError", {
          defaultValue: "Pon la fecha y el nombre del festivo.",
        }),
      );

      return;
    }
    setGuardando(true);
    try {
      await api.post(`/tenant/${tenantId()}/holiday`, {
        data: { ...nuevo },
      });
      setNuevo({
        date: "",
        name: "",
        kind: "national",
        recurring: true,
      });
      await cargar();
      toast.success(
        t("settings.festivos.addSuccess", {
          defaultValue: "Festivo agregado.",
        }),
      );
    } catch (e: any) {
      // El índice único por (tenant, fecha) es lo que impide contar el recargo
      // dos veces; el mensaje del servidor no lo explicaría.
      const msg =
        e?.response?.status === 500 || e?.response?.status === 409
          ? t("settings.festivos.duplicateError", {
              defaultValue: "Ya hay un festivo en esa fecha.",
            })
          : e?.response?.data?.message ||
            t("settings.festivos.addError", {
              defaultValue: "No se pudo agregar.",
            });

      toast.error(msg);
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (id: string, name: string) => {
    if (
      !(await confirmDialog({
        message: t("settings.festivos.deleteConfirm", {
          defaultValue: "¿Borrar el festivo «{{name}}»?",
          name,
        }),
        confirmText: t("actions.delete", "Eliminar"),
        tone: "danger",
      }))
    )
      return;
    try {
      await api.delete(`/tenant/${tenantId()}/holiday/${id}`);
      await cargar();
    } catch {
      toast.error(
        t("settings.festivos.deleteError", {
          defaultValue: "No se pudo borrar.",
        }),
      );
    }
  };

  return (
    <AppLayout>
      <SettingsLayout
        navKey="configuracion"
        title={t("settings.festivos.pageTitle", { defaultValue: "Festivos" })}
      >
        <PageContainer width="narrow">
          <PageHeader
            icon={<CalendarDays />}
            subtitle={t("settings.festivos.pageSubtitle", {
              defaultValue:
                "Los días que tu empresa trata distinto: feriados de ley y días propios.",
            })}
            title={t("settings.festivos.pageTitle", {
              defaultValue: "Festivos",
            })}
          />

          <InfoNote className="mb-5" icon={<Info />} tone="info">
            {t("settings.festivos.infoNote", {
              defaultValue:
                "El calendario decide qué turnos caen en feriado. Sin él, el 1 de enero se programa y se cuenta como un martes cualquiera.",
            })}
          </InfoNote>

          {cal && (
            <Section
              className="mb-5"
              icon={<Landmark />}
              title={
                cal.fuente
                  ? t("settings.festivos.paisTitle", {
                      defaultValue: "Calendario oficial de {{pais}}",
                      pais: nombreDelPais(cal.pais),
                    })
                  : t("settings.festivos.paisSinCalendarioTitle", { defaultValue: "Calendario oficial" })
              }
            >
              {cal.fuente ? (
                <div className="space-y-2 text-sm">
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      checked={cal.activo}
                      className="mt-0.5"
                      disabled={!canEdit || cambiando}
                      type="checkbox"
                      onChange={(e) => cambiarCalendario(e.target.checked)}
                    />
                    <span>
                      {t("settings.festivos.paisSwitch", {
                        defaultValue: "Usar los feriados nacionales de {{pais}} (se calculan solos cada año)",
                        pais: nombreDelPais(cal.pais),
                      })}
                      <span className="mt-0.5 block text-xs" style={{ color: "var(--ink-soft)" }}>
                        {t("settings.festivos.paisAyuda", {
                          defaultValue:
                            "Cambia qué turnos se pagan como feriado. Puedes quitar los días que tu empresa no guarda y agregar los locales.",
                        })}
                      </span>
                    </span>
                  </label>
                  <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                    {t("settings.festivos.paisFuente", { defaultValue: "Según: {{fuente}}", fuente: cal.fuente })}
                  </p>
                  {cal.nota && (
                    <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                      {cal.nota}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                  {t("settings.festivos.paisSinCalendario", {
                    defaultValue:
                      "Todavía no calculamos los feriados de tu país. Agrégalos aquí abajo y marca «Se repite cada año» para los fijos.",
                  })}
                </p>
              )}
            </Section>
          )}

          {canEdit && (
            <Section
              className="mb-5"
              icon={<Plus />}
              title={t("settings.festivos.addSectionTitle", {
                defaultValue: "Agregar un festivo",
              })}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="cg-eyebrow">
                    {t("settings.festivos.dateLabel", {
                      defaultValue: "Fecha",
                    })}
                  </span>
                  <input
                    className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm"
                    type="date"
                    value={nuevo.date}
                    onChange={(e) =>
                      setNuevo((n) => ({ ...n, date: e.target.value }))
                    }
                  />
                </label>
                <label className="block">
                  <span className="cg-eyebrow">
                    {t("settings.festivos.nameLabel", {
                      defaultValue: "Nombre",
                    })}
                  </span>
                  <input
                    className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm"
                    maxLength={120}
                    placeholder={t("settings.festivos.namePlaceholder", {
                      defaultValue: "Navidad, Día del Trabajo…",
                    })}
                    type="text"
                    value={nuevo.name}
                    onChange={(e) =>
                      setNuevo((n) => ({ ...n, name: e.target.value }))
                    }
                  />
                </label>
                <label className="block">
                  <span className="cg-eyebrow">
                    {t("settings.festivos.typeLabel", { defaultValue: "Tipo" })}
                  </span>
                  <select
                    className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm"
                    value={nuevo.kind}
                    onChange={(e) =>
                      setNuevo((n) => ({ ...n, kind: e.target.value }))
                    }
                  >
                    <option value="national">
                      {t("settings.festivos.typeNationalOption", {
                        defaultValue: "Feriado de ley",
                      })}
                    </option>
                    <option value="company">
                      {t("settings.festivos.typeCompanyOption", {
                        defaultValue: "Día propio de la empresa",
                      })}
                    </option>
                  </select>
                </label>
                {/* ONE holiday rate for the company (fase 0, 2026-10-30): the
                    pay rules. A rate per holiday here was read by the estimate
                    and the Horario, and never by the payroll. */}
                <div className="block text-xs" style={{ color: "var(--ink-soft)" }}>
                  <span className="cg-eyebrow">
                    {t("settings.festivos.recargoUnico", { defaultValue: "Recargo" })}
                  </span>
                  <p className="mt-1.5">
                    {t("settings.festivos.recargoUnicoAyuda", {
                      defaultValue: "Es el mismo para todos los feriados y se define en las reglas de pago.",
                    })}{" "}
                    <a className="underline" href="/nomina/settings">
                      {t("ui.ReglasDePago.reglasDePago", "Reglas de pago")} →
                    </a>
                  </p>
                </div>
              </div>

              <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
                <input
                  checked={nuevo.recurring}
                  type="checkbox"
                  onChange={(e) =>
                    setNuevo((n) => ({ ...n, recurring: e.target.checked }))
                  }
                />
                {t("settings.festivos.recurringLabel", {
                  defaultValue: "Se repite cada año",
                })}
                <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
                  {t("settings.festivos.recurringHint", {
                    defaultValue:
                      "— para Navidad o Año Nuevo, así no hay que volver a teclearlos",
                  })}
                </span>
              </label>

              <div className="mt-4 flex justify-end">
                <Button disabled={guardando} variant="brand" onClick={agregar}>
                  {guardando ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  {t("settings.festivos.addBtn", { defaultValue: "Agregar" })}
                </Button>
              </div>
            </Section>
          )}

          <Section
            icon={<CalendarDays />}
            title={t("settings.festivos.calendarSectionTitle", {
              defaultValue: "Calendario ({{count}})",
              count: lista.length,
            })}
          >
            <div className="mb-2 flex items-center gap-2 text-sm">
              <button
                aria-label={t("settings.festivos.anioAnterior", { defaultValue: "Año anterior" })}
                className="cg-focus rounded-lg p-1.5"
                type="button"
                onClick={() => setAnio((a) => a - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[3.5rem] text-center font-semibold tabular-nums">{anio}</span>
              <button
                aria-label={t("settings.festivos.anioSiguiente", { defaultValue: "Año siguiente" })}
                className="cg-focus rounded-lg p-1.5"
                type="button"
                onClick={() => setAnio((a) => a + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            {loading ? (
              <SkeletonCards count={3} />
            ) : lista.length === 0 ? (
              <EmptyState
                description={t("settings.festivos.emptyDescription", {
                  defaultValue:
                    "Agrega los feriados de tu país y los días propios de tu empresa.",
                })}
                icon={<CalendarDays />}
                title={t("settings.festivos.emptyTitle", {
                  defaultValue: "Todavía no hay festivos",
                })}
              />
            ) : (
              <div
                className="divide-y"
                style={{ borderColor: "var(--hairline)" }}
              >
                {lista.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{f.name}</span>
                        <StatusBadge
                          className="px-2 py-0.5 text-[10px]"
                          dot={false}
                          tone={f.kind === "national" ? "info" : "neutral"}
                        >
                          {f.source === "country"
                            ? t("settings.festivos.kindCountryBadge", {
                                defaultValue: "Del país",
                              })
                            : f.kind === "national"
                              ? t("settings.festivos.kindNationalBadge", {
                                  defaultValue: "De ley",
                                })
                              : t("settings.festivos.kindCompanyBadge", {
                                  defaultValue: "De la empresa",
                                })}
                        </StatusBadge>
                        {f.movedFrom && (
                          <StatusBadge className="px-2 py-0.5 text-[10px]" dot={false} tone="neutral">
                            {t("settings.festivos.movidoDesde", {
                              defaultValue: "Movido desde el {{fecha}}",
                              fecha: corto(f.movedFrom),
                            })}
                          </StatusBadge>
                        )}
                        {f.payMultiplier ? (
                          <StatusBadge
                            className="px-2 py-0.5 text-[10px]"
                            dot={false}
                            tone="warn"
                          >
                            ×{f.payMultiplier}
                          </StatusBadge>
                        ) : null}
                      </div>
                      <p
                        className="mt-0.5 text-xs"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {legible(f.date, f.recurring, t as any)}
                      </p>
                    </div>
                    {canEdit && (
                      <button
                        aria-label={
                          f.source === "country"
                            ? t("settings.festivos.quitarAriaLabel", {
                                defaultValue: "No guardamos {{name}}",
                                name: f.name,
                              })
                            : t("settings.festivos.deleteAriaLabel", {
                                defaultValue: "Borrar {{name}}",
                                name: f.name,
                              })
                        }
                        className="cg-focus rounded-lg p-2 transition-colors"
                        style={{ color: "var(--ink-faint)" }}
                        title={
                          f.source === "country"
                            ? t("settings.festivos.quitarTitle", {
                                defaultValue: "Tu empresa no guarda este feriado",
                              })
                            : undefined
                        }
                        type="button"
                        onClick={() => (f.source === "country" ? quitar(f) : borrar(f.id, f.name))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!!cal?.quitados?.filter((q) => q.date.startsWith(`${anio}-`)).length && (
              <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
                <p className="cg-eyebrow mb-1.5">
                  {t("settings.festivos.quitadosTitle", { defaultValue: "Feriados del país que no guardan" })}
                </p>
                {cal.quitados
                  .filter((q) => q.date.startsWith(`${anio}-`))
                  .map((q) => (
                    <div key={q.id} className="flex items-center gap-2 py-1.5 text-sm" style={{ color: "var(--ink-soft)" }}>
                      <span className="flex-1 line-through">
                        {q.name} · {corto(q.date)}
                      </span>
                      {canEdit && (
                        <Button size="sm" variant="ghost" onClick={() => devolver(q.id)}>
                          <Undo2 className="mr-1 h-3.5 w-3.5" />
                          {t("settings.festivos.devolver", { defaultValue: "Volver a guardarlo" })}
                        </Button>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </Section>
        </PageContainer>
      </SettingsLayout>
    </AppLayout>
  );
}
