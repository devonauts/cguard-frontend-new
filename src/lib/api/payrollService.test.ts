import { describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({ default: {} }));
vi.mock("@/i18n", () => ({ default: { t: (_k: string, d: string) => d } }));
vi.mock("@/lib/export/reportExport", () => ({ downloadBlob: vi.fn() }));
vi.mock("@/lib/export/serverDownload", () => ({ nombreDeContentDisposition: () => null }));

import { resultadoDeExportacion } from "./payrollService";

/** «Enviar a pago»: what stayed out of the file travels in its headers (QA 2026-11-01). */
describe("payroll export · resultadoDeExportacion", () => {
  it("reads the rejected count and the reasons (axios lowercases header names)", () => {
    const motivos = ["Patricia Salazar tiene 40 h trabajadas y no tiene tarifa"];
    const r = resultadoDeExportacion({
      "x-payroll-included": "3",
      "x-payroll-rejected": "1",
      "x-payroll-rejected-reasons": encodeURIComponent(JSON.stringify(motivos)),
    });

    expect(r).toEqual({ incluidas: 3, rechazadas: 1, motivos });
  });

  it("an older server without the headers: nothing rejected, nothing to warn", () => {
    expect(resultadoDeExportacion({})).toEqual({ incluidas: null, rechazadas: 0, motivos: [] });
    expect(resultadoDeExportacion(undefined)).toEqual({ incluidas: null, rechazadas: 0, motivos: [] });
  });

  it("a malformed reasons header never breaks the download", () => {
    expect(resultadoDeExportacion({ "x-payroll-rejected": "2", "x-payroll-rejected-reasons": "%E0%A4%A" }).motivos).toEqual([]);
  });
});
