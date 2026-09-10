import type { GuardDetail } from "../../guardDetailTypes";

import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import GuardsLayout from "@/layouts/GuardsLayout";
import AppLayout from "@/layouts/app-layout";
import TimeInput from "@/components/TimeInput";
import MobileCardList from "@/components/responsive/MobileCardList";
import securityGuardService from "@/lib/api/securityGuardService";

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
  const [fetchedGuard, setFetchedGuard] = useState<GuardDetail | null>(null);

  useEffect(() => {
    if (guard || !routeId) return;
    let alive = true;

    securityGuardService
      .get(routeId)
      .then((g) => {
        if (alive) setFetchedGuard((g?.guard ?? g) as GuardDetail);
      })
      .catch(() => {
        /* keep defaults */
      });

    return () => {
      alive = false;
    };
  }, [guard, routeId]);
  const effGuard = guard ?? fetchedGuard ?? undefined;
  const [availability, setAvailability] = useState<Av[]>(() => {
    const base = [
      { day: "Monday", available: true, start: "00:00", end: "23:59" },
      { day: "Tuesday", available: true, start: "00:00", end: "23:59" },
      { day: "Wednesday", available: true, start: "00:00", end: "23:59" },
      { day: "Thursday", available: true, start: "00:00", end: "23:59" },
      { day: "Friday", available: true, start: "00:00", end: "23:59" },
      { day: "Saturday", available: true, start: "00:00", end: "23:59" },
      { day: "Sunday", available: true, start: "00:00", end: "23:59" },
    ];

    if (!guard) return base;

    return base.map((b) => {
      const gDay = (guard.availability || []).find((x) => x.day === b.day);

      if (!gDay) return b;

      return {
        day: b.day,
        available: !!gDay.available,
        start: gDay.start ?? b.start,
        end: gDay.end ?? b.end,
      };
    });
  });

  useEffect(() => {
    // Recompute availability whenever the guard prop changes
    const base = [
      { day: "Monday", available: true, start: "00:00", end: "23:59" },
      { day: "Tuesday", available: true, start: "00:00", end: "23:59" },
      { day: "Wednesday", available: true, start: "00:00", end: "23:59" },
      { day: "Thursday", available: true, start: "00:00", end: "23:59" },
      { day: "Friday", available: true, start: "00:00", end: "23:59" },
      { day: "Saturday", available: true, start: "00:00", end: "23:59" },
      { day: "Sunday", available: true, start: "00:00", end: "23:59" },
    ];

    if (!effGuard) {
      setAvailability(base);

      return;
    }
    setAvailability(
      base.map((b) => {
        const gDay = (effGuard.availability || []).find((x) => x.day === b.day);

        if (!gDay) return b;

        return {
          day: b.day,
          available: !!gDay.available,
          start: gDay.start ?? b.start,
          end: gDay.end ?? b.end,
        };
      }),
    );
  }, [effGuard]);

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
        const saveId = effGuard?.id || routeId;

        if (!saveId) {
          toast.error(t("guards.availability.toasts.saveError", "No guard id"));

          return;
        }
        await securityGuardService.update(saveId, { availability });
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
                            checked={a.available}
                            className="ml-6"
                            type="checkbox"
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
                  emptyMessage={
                    t("guards.availability.empty", {
                      defaultValue: "No availability",
                    }) as string
                  }
                  items={availability || []}
                  loading={false}
                  renderCard={(a: Av) => (
                    <div className="glass-flat p-4">
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
                    </div>
                  )}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                className="cg-btn-brand cg-focus rounded-full px-4 py-2 text-sm font-semibold"
                onClick={handleSaveAvailability}
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
