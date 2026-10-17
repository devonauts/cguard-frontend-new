import { describe, expect, it } from "vitest";

import { correoVisible, esCorreoSinBuzon } from "./correoVisible";

describe("correoVisible · los correos inventados no se enseñan", () => {
  it("oculta los de las cuentas sin buzón, por teléfono y de baja", () => {
    expect(correoVisible("u-3f9a1c2e@sin-correo.local")).toBeNull();
    expect(correoVisible("593987654321@phone.local")).toBeNull();
    expect(correoVisible("baja-12@cguardpro.invalid")).toBeNull();
    expect(esCorreoSinBuzon("X@SIN-CORREO.LOCAL")).toBe(true);
  });

  it("deja pasar los de verdad, recortados", () => {
    expect(correoVisible("  ana@empresa.com ")).toBe("ana@empresa.com");
    expect(correoVisible("jose@local.com")).toBe("jose@local.com");
    expect(esCorreoSinBuzon("ana@empresa.com")).toBe(false);
  });

  it("vacío o nulo → null", () => {
    expect(correoVisible("")).toBeNull();
    expect(correoVisible(null)).toBeNull();
    expect(correoVisible(undefined)).toBeNull();
  });
});
