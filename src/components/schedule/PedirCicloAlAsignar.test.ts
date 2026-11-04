import { describe, expect, it } from "vitest";

import { CODIGO_SIN_CICLO, esFaltaDeCiclo } from "./PedirCicloAlAsignar";

describe("esFaltaDeCiclo", () => {
  it("recognises the refusal from ApiService (body in `data`)", () => {
    expect(esFaltaDeCiclo({ status: 400, data: { messageCode: CODIGO_SIN_CICLO } })).toBe(true);
  });

  it("recognises the refusal from the axios client (body in `details`)", () => {
    expect(esFaltaDeCiclo({ status: 400, details: { messageCode: CODIGO_SIN_CICLO } })).toBe(true);
  });

  it("recognises a raw axios error", () => {
    expect(esFaltaDeCiclo({ response: { data: { messageCode: CODIGO_SIN_CICLO } } })).toBe(true);
  });

  it("ignores every other refusal", () => {
    expect(esFaltaDeCiclo({ data: { messageCode: "server.assignment.alreadyAssigned" } })).toBe(false);
    expect(esFaltaDeCiclo({ status: 409, data: { code: "station_full" } })).toBe(false);
    expect(esFaltaDeCiclo(null)).toBe(false);
    expect(esFaltaDeCiclo(new Error("boom"))).toBe(false);
  });
});
