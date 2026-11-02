import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { sheetName } from "./reportExport";

describe("sheetName", () => {
  it("turns «Informe de Entrada/Salida» into a name SheetJS accepts", () => {
    const name = sheetName("Informe de Entrada/Salida");

    expect(name).toBe("Informe de Entrada-Salida");
    const wb = XLSX.utils.book_new();

    expect(() => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[1]]), name)).not.toThrow();
  });

  it("removes every forbidden character, trims apostrophes and caps at 31", () => {
    expect(sheetName("a:b\\c/d?e*f[g]h")).toBe("a-b-c-d-e-f-g-h");
    expect(sheetName("'Informe'")).toBe("Informe");
    expect(sheetName("x".repeat(40))).toHaveLength(31);
    expect(sheetName("", "Informe")).toBe("Informe");
  });
});
