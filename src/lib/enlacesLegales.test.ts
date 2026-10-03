import { describe, expect, it } from "vitest";

import { enlaceLegal } from "./enlacesLegales";

describe("enlaceLegal", () => {
  it("español va a la raíz de la web", () => {
    expect(enlaceLegal("privacy", "es")).toBe("https://cguardpro.com/privacy/");
    expect(enlaceLegal("terms", "es-MX")).toBe("https://cguardpro.com/terms/");
  });
  it("cada idioma con página va a la suya", () => {
    for (const l of ["en", "pt", "fr", "de", "it", "nl", "pl"])
      expect(enlaceLegal("terms", l)).toBe(`https://cguardpro.com/${l}/terms/`);
  });
  it("un idioma sin página cae al inglés", () => {
    expect(enlaceLegal("privacy", "ja")).toBe("https://cguardpro.com/en/privacy/");
    expect(enlaceLegal("privacy")).toBe("https://cguardpro.com/en/privacy/");
  });
});
