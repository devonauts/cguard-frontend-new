import { describe, expect, it } from "vitest";

import { hechos, normalizarPrimerosPasos } from "./primerosPasos";

const respuesta = (done: Record<string, boolean>, extra: any = {}) => ({
  data: {
    steps: ["station", "requirement", "guards", "schedule", "publish", "clockIn"].map((key) => ({ key, done: !!done[key], path: `/x/${key}` })),
    show: true,
    established: false,
    dismissedAt: null,
    ...extra,
  },
});

describe("primeros pasos · respuesta del servidor", () => {
  it("keeps the order, finds the next step and counts what is done", () => {
    const p = normalizarPrimerosPasos(respuesta({ station: true, requirement: true }))!;
    expect(p.steps.map((s) => s.key)).toEqual(["station", "requirement", "guards", "schedule", "publish", "clockIn"]);
    expect(p.next).toBe("guards");
    expect(hechos(p)).toBe(2);
    expect(p.show).toBe(true);
  });

  it("all done never shows, whatever the server says", () => {
    const todo = Object.fromEntries(["station", "requirement", "guards", "schedule", "publish", "clockIn"].map((k) => [k, true]));
    const p = normalizarPrimerosPasos(respuesta(todo, { show: true }))!;
    expect(p.next).toBeNull();
    expect(p.show).toBe(false);
  });

  it("unknown steps are dropped, a bad path falls back, junk is null", () => {
    const p = normalizarPrimerosPasos({ steps: [{ key: "guards", done: false, path: "javascript:alert(1)" }, { key: "zzz", done: true }], show: true })!;
    expect(p.steps).toEqual([{ key: "guards", done: false, path: "/personal/nueva?tipo=vigilante" }]);
    expect(normalizarPrimerosPasos(null)).toBeNull();
    expect(normalizarPrimerosPasos({ data: "nope" })).toBeNull();
  });
});
