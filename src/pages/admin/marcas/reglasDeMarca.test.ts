import { describe, expect, it } from "vitest";

import { revisarMarca } from "./reglasDeMarca";

const completa = {
  name: "Andina Seguridad",
  legalName: "Andina Seguridad Cía. Ltda.",
  taxId: "1792146739001",
  country: "EC",
};

describe("a brand's required legal identity", () => {
  it("a complete brand passes", () => {
    expect(revisarMarca(completa)).toEqual({});
  });

  it("name, legal name, tax id and country are required", () => {
    expect(
      revisarMarca({ name: " ", legalName: "", taxId: "", country: "" }),
    ).toEqual({
      name: "falta",
      legalName: "falta",
      taxId: "falta",
      country: "falta",
    });
  });

  it("the tax id follows the rule of the brand's own country", () => {
    expect(revisarMarca({ ...completa, taxId: "123" }).taxId).toBe("malo");
    // A Mexican RFC is fine for a Mexican brand, wrong for an Ecuadorian one.
    expect(
      revisarMarca({ ...completa, country: "MX", taxId: "ABC010203XY1" }),
    ).toEqual({});
    expect(revisarMarca({ ...completa, taxId: "ABC010203XY1" }).taxId).toBe(
      "malo",
    );
  });
});
