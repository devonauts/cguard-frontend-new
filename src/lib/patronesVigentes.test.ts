import { describe, expect, it } from "vitest";

import { esArchivado, urlDePatrones, vigentesYElegidos } from "./patronesVigentes";

describe("archived rotation patterns in pickers", () => {
  const rows = [
    { id: "a", name: "4-4-2" },
    { id: "b", name: "2-2-2", archivedAt: "2026-10-30T00:00:00Z" },
    { id: "c", name: "8-2", archivedAt: "2026-10-30T00:00:00Z" },
  ];

  it("offers only active patterns as new choices", () => {
    expect(vigentesYElegidos(rows, []).map((r) => r.id)).toEqual(["a"]);
  });

  it("keeps the archived pattern already chosen, so the selection is never empty", () => {
    expect(vigentesYElegidos(rows, ["b", null]).map((r) => r.id)).toEqual(["a", "b"]);
    expect(esArchivado(rows[1])).toBe(true);
    expect(esArchivado(rows[0])).toBe(false);
  });

  it("asks the server for archived rows too", () => {
    expect(urlDePatrones("t1")).toBe("/tenant/t1/rotation-styles?includeArchived=1");
  });
});
