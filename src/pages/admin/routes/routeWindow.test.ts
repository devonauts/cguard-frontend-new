import { describe, expect, it } from "vitest";

import { routeWindowForForm } from "./routeWindow";

import { desdeInputFechaHora } from "../../../lib/horaDeLaEmpresa";

const GYE = "America/Guayaquil";

describe("routeWindowForForm", () => {
  it("shows the window in the company's zone, not the browser's", () => {
    // 00:00–23:59, 1–30 Nov in Guayaquil (UTC-5), as the form saved it.
    const v = routeWindowForForm(
      "2026-11-01T05:00:00.000Z",
      "2026-12-01T04:59:00.000Z",
      GYE,
    );

    expect(v).toEqual({
      dateFrom: "2026-11-01",
      startTime: "00:00",
      dateTo: "2026-11-30",
      endTime: "23:59",
    });
  });

  it("saving without changes gives back the same instants", () => {
    const start = desdeInputFechaHora("2026-11-01T00:00", GYE);
    const end = desdeInputFechaHora("2026-11-30T23:59", GYE);
    const v = routeWindowForForm(start, end, GYE);

    expect(desdeInputFechaHora(`${v.dateFrom}T${v.startTime}`, GYE)).toBe(start);
    expect(desdeInputFechaHora(`${v.dateTo}T${v.endTime}`, GYE)).toBe(end);
  });

  it("defaults to a full day when the route has no window", () => {
    expect(routeWindowForForm(null, undefined, GYE)).toEqual({
      dateFrom: "",
      startTime: "00:00",
      dateTo: "",
      endTime: "23:59",
    });
  });
});
