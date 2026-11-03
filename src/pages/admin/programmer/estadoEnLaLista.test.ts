import { describe, expect, it } from "vitest";

import { estadoEnLaLista } from "./estadoEnLaLista";

const fila = (extra: Record<string, unknown>) => ({
  guardId: "g1",
  startTime: "2026-11-10T12:00:00.000Z",
  endTime: "2026-11-11T00:00:00.000Z",
  ...extra,
});
const AHORA = new Date("2026-11-02T15:00:00.000Z");

describe("Estado de turnos · a shift that left its post", () => {
  it("a shift handed over in an approved swap is «Trasladado» (N8)", () => {
    expect(
      estadoEnLaLista(fila({ status: "transferred_out", shiftExchangeRequestId: "x1" }), AHORA),
    ).toBe("transferred");
  });

  it("a guard pulled to another post leaves his origin without him: still counted there (R7)", () => {
    expect(
      estadoEnLaLista(fila({ status: "transferred_out", coverageEventId: "ev1" }), AHORA),
    ).toBe("cancelled");
    expect(estadoEnLaLista(fila({ status: "transferred_out" }), AHORA)).toBe("cancelled");
  });

  it("the other states are unchanged", () => {
    expect(estadoEnLaLista(fila({ status: "absent" }), AHORA)).toBe("cancelled");
    expect(estadoEnLaLista(fila({ status: "planned" }), AHORA)).toBe("pending");
    expect(estadoEnLaLista(fila({ status: "planned", guardId: null }), AHORA)).toBe("pending");
    expect(
      estadoEnLaLista(fila({ status: "planned", startTime: "2026-11-02T12:00:00.000Z" }), AHORA),
    ).toBe("in-progress");
    expect(
      estadoEnLaLista(
        fila({ startTime: "2026-11-01T12:00:00.000Z", endTime: "2026-11-02T00:00:00.000Z" }),
        AHORA,
      ),
    ).toBe("completed");
  });
});
