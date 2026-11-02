import { describe, expect, it } from "vitest";

import { plantillaDeVigilantes, resumenDeImportacion } from "./guardImport";

// i18next-like: the default text with its {{placeholders}} filled.
const t = ((_k: string, o: any) =>
  String(o?.defaultValue ?? "").replace(/{{(\w+)}}/g, (_m, k) =>
    String(o?.[k] ?? ""),
  )) as any;

describe("guard import · template", () => {
  it("starts with the UTF-8 mark and carries no real address", () => {
    const csv = plantillaDeVigilantes();

    expect(csv.startsWith("﻿Nombre,Correo,Teléfono")).toBe(true);
    expect(csv).not.toMatch(/gmail|hotmail|yahoo/i);
    expect(csv).toContain("@example.com");
    // the example dates are day first, like the importer reads them
    expect(csv).toContain("30/11/2025");
  });
});

describe("guard import · summary", () => {
  it("all rows in: counts them and says nobody was invited", () => {
    const r = resumenDeImportacion({ success: 3, failed: 0, errors: [] }, t);

    expect(r.tipo).toBe("ok");
    expect(r.titulo).toBe("3 vigilantes importados");
    expect(r.detalle).toMatch(/invitación/);
  });

  it("failed and skipped rows are counted and the first ones explained", () => {
    const r = resumenDeImportacion(
      {
        success: 1,
        failed: 3,
        skipped: 1,
        errors: [
          { row: 2, name: "Ana", error: "Cédula repetida" },
          { row: 3, name: "Luis", error: "Sin correo" },
          { row: 4, name: "", error: "Menor de edad" },
          { row: 5, name: "Eva", error: "Ya importada" },
        ],
      },
      t,
    );

    expect(r.tipo).toBe("aviso");
    expect(r.titulo).toBe("Importados: 1 · Sin importar: 4");
    expect(r.detalle.split("\n")).toEqual([
      "Fila 2 (Ana): Cédula repetida",
      "Fila 3 (Luis): Sin correo",
      "Fila 4 (—): Menor de edad",
      "No se envió ninguna invitación: envíalas desde la lista cuando quieras.",
    ]);
  });

  it("an old server answering `true` reads as nothing imported, without crashing", () => {
    const r = resumenDeImportacion(true as any, t);

    expect(r.titulo).toBe("0 vigilantes importados");
  });
});
