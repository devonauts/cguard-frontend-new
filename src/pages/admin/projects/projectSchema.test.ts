import type { TFunction } from "i18next";

import { describe, expect, it } from "vitest";

import { makeSchema } from "./projectSchema";

// The schema only needs t() for its messages: echo the Spanish default.
const t = ((_k: string, d?: string) => d ?? _k) as unknown as TFunction;

const base = {
  name: "Evento",
  type: "event" as const,
  clientAccountId: "cli-1",
  status: "active" as const,
};

describe("ProjectForm · dates (QA 2026-11-01, M5)", () => {
  it("rejects an end date before the start date", () => {
    const r = makeSchema(t).safeParse({
      ...base,
      startDate: "2026-12-05",
      endDate: "2026-12-04",
    });

    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["endDate"]);
  });

  it("accepts the same day, a later day, or a missing date", () => {
    const s = makeSchema(t);

    expect(s.safeParse({ ...base, startDate: "2026-12-05", endDate: "2026-12-05" }).success).toBe(true);
    expect(s.safeParse({ ...base, startDate: "2026-12-05", endDate: "2027-01-02" }).success).toBe(true);
    expect(s.safeParse({ ...base, startDate: "2026-12-05", endDate: "" }).success).toBe(true);
    expect(s.safeParse({ ...base, startDate: "", endDate: "2026-12-04" }).success).toBe(true);
  });
});
