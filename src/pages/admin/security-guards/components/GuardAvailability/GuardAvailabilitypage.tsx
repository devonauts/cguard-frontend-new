import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Clock } from "lucide-react";
import GuardsLayout from "@/layouts/GuardsLayout";
import AppLayout from "@/layouts/app-layout";
import TimeInput from "@/components/TimeInput";
import MobileCardList from "@/components/responsive/MobileCardList";
import availabilityService, {
  type WeeklyAvailability,
} from "@/lib/api/availabilityService";
import { useRegistroDeFicha } from "@/layouts/FichaPersona";
import type { GuardDetail } from "../../guardDetailTypes";

type Av = { day: string; available: boolean; start: string; end: string };

type Props = {
  guard?: GuardDetail;
};

// TimeInput extracted to shared component: src/components/TimeInput.tsx

export default function GuardAvailability({ guard }: Props) {
  const { t } = useTranslation();
  // The /guards/:id/availability route renders this WITHOUT a `guard` prop, so
  // fetch the guard by route id to load its saved availability and get the id
  // needed to persist changes (the backend stores `availability` as JSON).
  const { id: routeId } = useParams();
  // El registro lo trae la ruta padre (`FichaPersonaProvider`); esta pestaña ya
  // no lo pide por su cuenta. Si se monta con `guard` por prop, ese manda.
  const { registro } = useRegistroDeFicha(guard ? undefined : routeId);
  const fetchedGuard = registro
    ? ((registro.guard ?? registro) as GuardDetail)
    : null;
  const effGuard = guard ?? fetchedGuard ?? undefined;
  /* The ONE availability per person (services/availability on the server):
     the same rows the guard app and Dobletes edit. A person who never said
     anything is available any time — the table shows every day all day and a
     note, and saving it like that keeps it «not said». */
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const ORDER = [1, 2, 3, 4, 5, 6, 0];
  const allDay = (): Av[] =>
    ORDER.map((wd) => ({ day: DAYS[wd], available: true, start: "00:00", end: "23:59" }));
  const userId: string | undefined =
    (effGuard as any)?.guardId || (effGuard as any)?.guard?.id || undefined;
  const [availability, setAvailability] = useState<Av[]>(allDay);
  const [configured, setConfigured] = useState(false);
  const [original, setOriginal] = useState<Map<number, WeeklyAvailability>>(new Map());
  const [fechasSueltas, setFechasSueltas] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let vivo = true;

    availabilityService
      .get(userId)
      .then((r) => {
        if (!vivo) return;
        const byDay = new Map<number, WeeklyAvailability>();

        for (const w of r.weekly || []) byDay.set(Number(w.weekday), w);
        setOriginal(byDay);
        setConfigured(!!(r.weekly || []).length);
        setFechasSueltas((r.dates || []).length);
        setAvailability(
          (r.weekly || []).length
            ? ORDER.map((wd) => {
                const w = byDay.get(wd);

                return {
                  day: DAYS[wd],
                  available: !!w,
                  start: w?.startTime || "00:00",
                  end: w?.endTime || "23:59",
                };
              })
            : allDay(),
        );
      })
      .catch(() => vivo && setAvailability(allDay()));

    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const updateAvailability = (index: number, v: Av) => {
    setAvailability((prev) => {
      const copy = [...prev];
      copy[index] = v;
      return copy;
    });
  };

  const handleSaveAvailability = () => {
    (async () => {
      try {
        if (!userId) {
          toast.error(t("guards.availability.toasts.saveError", "No guard id"));

          return;
        }
        const everyDayAllDay = availability.every(
          (a) => a.available && a.start === "00:00" && a.end === "23:59",
        );
        // Every day all day and nothing said before: stays «not said».
        const weekly =
          everyDayAllDay && !configured
            ? []
            : availability
                .filter((a) => a.available)
                .map((a) => {
                  const wd = DAYS.indexOf(a.day);
                  const prev = original.get(wd);
                  const window = a.start === "00:00" && a.end === "23:59"
                    ? { startTime: null, endTime: null }
                    : { startTime: a.start, endTime: a.end };
                  const unchanged =
                    prev &&
                    (prev.startTime || null) === window.startTime &&
                    (prev.endTime || null) === window.endTime;

                  // An unchanged day keeps its bands (set in the app or in Dobletes).
                  return { weekday: wd, ...window, ...(unchanged ? { slots: prev!.slots } : {}) };
                });
        const r = await availabilityService.setWeekly(userId, weekly);

        setConfigured(!!(r.weekly || []).length);
        const byDay = new Map<number, WeeklyAvailability>();

        for (const w of r.weekly || []) byDay.set(Number(w.weekday), w);
        setOriginal(byDay);
        toast.success(t("guards.availability.toasts.saved"));
      } catch (e) {
        console.error("Failed saving availability", e);
        toast.error(
          t(
            "guards.availability.toasts.saveError",
            "Error saving availability",
          ),
        );
      }
    })();
  };

  return (
    <AppLayout>
      <GuardsLayout navKey="keep-safe" title="guards.nav.disponibilidad">
        <div>
          <div className="glass p-6">
            <h3 className="font-display text-base font-semibold tracking-tight mb-4">
              {t("guards.availability.title", {
                defaultValue: "Disponibilidad",
              })}
            </h3>
            <p className="mb-4 text-sm" style={{ color: "var(--ink-soft)" }}>
              {configured
                ? t(
                    "guards.availability.usedBy",
                    "La misma disponibilidad que la persona ve en su app. El horario avisa al asignarle fuera de ella, Cobertura la pone al final y Dobletes no le ofrece esos turnos.",
                  )
                : t(
                    "guards.availability.notSaid",
                    "Todavía no ha indicado su disponibilidad: se considera disponible siempre.",
                  )}
              {fechasSueltas > 0 &&
                ` ${t("guards.availability.datedDays", {
                  n: fechasSueltas,
                  defaultValue: "Además marcó {{n}} día(s) sueltos desde la app.",
                })}`}
            </p>
            <div>
              <div className="md:block hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="p-2">
                        {t("guards.availability.table.day", {
                          defaultValue: "Day",
                        })}
                      </th>
                      <th className="p-2">
                        {t("guards.availability.table.available", {
                          defaultValue: "Available",
                        })}
                      </th>
                      <th className="p-2">
                        {t("guards.availability.table.from", {
                          defaultValue: "From",
                        })}
                      </th>
                      <th className="p-2">
                        {t("guards.availability.table.to", {
                          defaultValue: "To",
                        })}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {availability.map((a, i) => (
                      <tr key={a.day} className="border-t">
                        <td className="p-2">
                          {t(`guards.availability.days.${a.day}`, {
                            defaultValue: a.day,
                          })}
                        </td>
                        <td className="p-2">
                          <input
                            className="ml-6"
                            type="checkbox"
                            checked={a.available}
                            onChange={(e) =>
                              updateAvailability(i, {
                                ...a,
                                available: e.target.checked,
                              })
                            }
                          />
                        </td>
                        <td className="p-2">
                          <div
                            className={`${!a.available ? "opacity-60" : ""}`}
                          >
                            <TimeInput
                              disabled={!a.available}
                              value={a.start}
                              onChange={(val) =>
                                updateAvailability(i, { ...a, start: val })
                              }
                            />
                          </div>
                        </td>
                        <td className="p-2">
                          <div
                            className={`${!a.available ? "opacity-60" : ""}`}
                          >
                            <TimeInput
                              disabled={!a.available}
                              value={a.end}
                              onChange={(val) =>
                                updateAvailability(i, { ...a, end: val })
                              }
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden">
                <MobileCardList
                  items={availability || []}
                  loading={false}
                  emptyMessage={
                    t("guards.availability.empty", {
                      defaultValue: "No availability",
                    }) as string
                  }
                  renderCard={(a: Av) => (
                    <>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">
                        {t(`guards.availability.days.${a.day}`, {
                          defaultValue: a.day,
                        })}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {a.available
                          ? `${a.start} — ${a.end}`
                          : t("guards.availability.notAvailable", {
                              defaultValue: "Not available",
                            })}
                      </div>
                    </div>
                    </>
                  )}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleSaveAvailability}
                className="cg-btn-brand cg-focus rounded-full px-4 py-2 text-sm font-semibold"
              >
                {t("guards.availability.save", { defaultValue: "Save" })}
              </button>
            </div>
          </div>
        </div>
      </GuardsLayout>
    </AppLayout>
  );
}
