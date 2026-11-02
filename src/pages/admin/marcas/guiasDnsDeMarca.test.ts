import { describe, expect, it } from "vitest";

import { guiasDns, IDIOMAS_DE_GUIAS, rellenarDominio } from "./guiasDnsDeMarca";

describe("Multimarca phase 5 · DNS guides of the brand's client-portal domain", () => {
  it("exist in the eight CRM languages with the same providers and steps", () => {
    expect(IDIOMAS_DE_GUIAS.sort()).toEqual(["de", "en", "es", "fr", "it", "nl", "pl", "pt"]);
    const shape = (l: string) => guiasDns(l).map((g) => [g.id, g.pasos.length, (g.ojo || []).length]);

    for (const l of IDIOMAS_DE_GUIAS) expect(shape(l)).toEqual(shape("es"));
  });

  it("every guide names the two values to type and nothing else to fill", () => {
    for (const l of IDIOMAS_DE_GUIAS) {
      for (const g of guiasDns(l)) {
        const all = g.pasos.join("\n");

        expect(all).toContain("{host}");
        expect(all).toContain("{destino}");
        expect(all.replace(/\{(host|destino|dominio)\}/g, "")).not.toMatch(/\{[a-z]+\}/);
      }
    }
  });

  it("an unknown language falls back to Spanish; the domain is filled in", () => {
    expect(guiasDns("xx")).toEqual(guiasDns("es"));
    expect(guiasDns("pt-BR")[0].pasos).toEqual(guiasDns("pt")[0].pasos);
    expect(rellenarDominio("Elige {dominio}.", "marcab.com")).toBe("Elige marcab.com.");
  });
});
