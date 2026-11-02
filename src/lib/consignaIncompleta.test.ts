import { describe, expect, it } from "vitest";
import { consignaIncompleta } from "./consignaIncompleta";

describe("consignaIncompleta", () => {
  it("weekly needs at least one day", () => {
    expect(consignaIncompleta({ recurrence: "weekly", days: [] })?.key).toBe(
      "station.orders.needDays",
    );
    expect(consignaIncompleta({ recurrence: "weekly", days: [1] })).toBeNull();
  });

  it("monthly needs a day 1-31, once needs a date", () => {
    expect(consignaIncompleta({ recurrence: "monthly", dayOfMonth: null })?.key).toBe(
      "station.orders.needDayOfMonth",
    );
    expect(consignaIncompleta({ recurrence: "monthly", dayOfMonth: 15 })).toBeNull();
    expect(consignaIncompleta({ recurrence: "once", date: "" })?.key).toBe(
      "station.orders.needDate",
    );
    expect(consignaIncompleta({ recurrence: "once", date: "2026-11-02" })).toBeNull();
  });

  it("daily, weekdays and weekend need nothing else", () => {
    for (const recurrence of ["daily", "weekdays", "weekend"])
      expect(consignaIncompleta({ recurrence })).toBeNull();
  });
});
