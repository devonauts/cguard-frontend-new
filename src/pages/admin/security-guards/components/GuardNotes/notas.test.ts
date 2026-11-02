import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/horaDeLaEmpresa", async (orig) => {
  const real = await orig<typeof import("@/lib/horaDeLaEmpresa")>();

  // A company west of UTC: the case that showed 31 oct for a 1 nov note.
  return { ...real, zonaDeLaEmpresa: () => "America/Guayaquil" };
});

import { fechaDeNota, notaIncompleta } from "./notas";

describe("fechaDeNota", () => {
  it("prints the calendar day written, not the day before", () => {
    const txt = fechaDeNota({ noteDate: "2026-11-01" });

    expect(txt).toMatch(/01/);
    expect(txt).not.toMatch(/31/);
  });

  it("falls back to the creation instant without a note date", () => {
    expect(fechaDeNota({ createdAt: "2026-11-01T15:00:00.000Z" })).toMatch(
      /01/,
    );
  });

  it("is empty without any date", () => {
    expect(fechaDeNota({})).toBe("");
  });
});

describe("notaIncompleta", () => {
  it("refuses an empty note", () => {
    expect(notaIncompleta({ title: " ", description: "", date: "2026-11-01" })).toBe(
      "title",
    );
  });

  it("asks for the description, then the date", () => {
    expect(notaIncompleta({ title: "A", description: "", date: "x" })).toBe(
      "description",
    );
    expect(notaIncompleta({ title: "A", description: "B", date: "" })).toBe(
      "date",
    );
  });

  it("accepts a complete note", () => {
    expect(
      notaIncompleta({ title: "A", description: "B", date: "2026-11-01" }),
    ).toBeNull();
  });
});
