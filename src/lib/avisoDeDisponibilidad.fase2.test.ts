import { beforeEach, describe, expect, it, vi } from "vitest";

const warning = vi.fn();

vi.mock("sonner", () => ({ toast: { warning: (...a: any[]) => warning(...a) } }));
vi.mock("@/i18n", () => ({ default: { t: (_k: string, o: any) => `fuera ${o.n} ${o.dias}` } }));

import { avisarSiFueraDeDisponibilidad } from "./avisoDeDisponibilidad";

describe("availability warning after a publish or a drag-to-move", () => {
  beforeEach(() => warning.mockReset());

  it("a schedule publish that placed shifts outside availability warns once", () => {
    avisarSiFueraDeDisponibilidad("POST", "/tenant/t1/schedule-draft/publish", {
      applied: 3,
      availabilityWarning: { count: 2, dates: ["2026-11-03", "2026-11-05"] },
    });
    expect(warning).toHaveBeenCalledTimes(1);
    expect(String(warning.mock.calls[0][0])).toContain("2026-11-03");
  });

  it("a drag-to-move batch warns too; a batch without warning says nothing", () => {
    avisarSiFueraDeDisponibilidad("POST", "/tenant/t1/schedule/batch", {
      data: { availabilityWarning: { count: 1, dates: ["2026-11-04"] } },
    });
    avisarSiFueraDeDisponibilidad("POST", "/tenant/t1/schedule/batch", { applied: 1 });
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it("other routes never warn", () => {
    avisarSiFueraDeDisponibilidad("POST", "/tenant/t1/shift", { availabilityWarning: { count: 1, dates: [] } });
    expect(warning).not.toHaveBeenCalled();
  });
});
