import { describe, expect, it } from "vitest";

import {
  incidentPriorityForForm,
  incidentPriorityKey,
  mergeByIncidentPriority,
} from "./incidentPriority";

describe("incident priority", () => {
  it("reads the English and Spanish spellings as one priority", () => {
    expect(incidentPriorityKey("high")).toBe("high");
    expect(incidentPriorityKey("Alta")).toBe("high");
    expect(incidentPriorityKey("crítica")).toBe("critical");
    expect(incidentPriorityKey("baja")).toBe("low");
    expect(incidentPriorityKey("otra")).toBeNull();
  });

  it("counts «alta» and «high» in a single bar", () => {
    const merged = mergeByIncidentPriority([
      { label: "alta", count: 3 },
      { label: "high", count: 3 },
      { label: "medium", count: 1 },
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0].count).toBe(6);
    expect(merged[1].count).toBe(1);
  });

  it("opens every stored spelling in the edit form's alta / media / baja", () => {
    expect(incidentPriorityForForm("critical")).toBe("alta");
    expect(incidentPriorityForForm("critica")).toBe("alta");
    expect(incidentPriorityForForm("high")).toBe("alta");
    expect(incidentPriorityForForm("medium")).toBe("media");
    expect(incidentPriorityForForm("low")).toBe("baja");
    expect(incidentPriorityForForm("alta")).toBe("alta");
    expect(incidentPriorityForForm(null)).toBeNull();
    expect(incidentPriorityForForm("otra")).toBeNull();
  });
});
