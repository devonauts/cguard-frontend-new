import { describe, expect, it } from "vitest";

import { diasCompactos, diasDeLasPlazas } from "./diasDeLaSemana";

describe("weekdays in one short text", () => {
  it("compacts runs and lists the rest", () => {
    expect(diasCompactos(["lun", "mar", "mie", "jue", "vie"], "es")).toBe("lun–vie");
    expect(diasCompactos(["lun", "mié", "vie"], "es")).toBe("lun, mié, vie");
    expect(diasCompactos(["lun", "mar", "mie", "jue", "vie"], "en")).toBe("Mon–Fri");
    expect(diasCompactos([], "es")).toBeNull();
    expect(diasCompactos(["lun", "mar", "mie", "jue", "vie", "sab", "dom"], "es")).toBeNull();
  });
  it("a post open every day wins over the others", () => {
    expect(diasDeLasPlazas([{ type: "fijo", days: ["lun"] }, { type: "fijo", days: [] }])).toEqual([]);
    expect(diasDeLasPlazas([{ type: "fijo", days: ["lun", "mar"] }, { type: "sacafranco", days: [] }])).toEqual(["lun", "mar"]);
  });
});
