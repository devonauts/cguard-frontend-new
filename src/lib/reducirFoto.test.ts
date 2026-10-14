import { describe, expect, it } from "vitest";

import { medidaReducida } from "./reducirFoto";

describe("reducirFoto · medidaReducida", () => {
  it("una foto de móvil baja a 1024 por el lado largo, sin deformarse", () => {
    expect(medidaReducida(4032, 3024, 1024)).toEqual({
      ancho: 1024,
      alto: 768,
    });
    expect(medidaReducida(3024, 4032, 1024)).toEqual({
      ancho: 768,
      alto: 1024,
    });
  });
  it("una pequeña no se agranda", () => {
    expect(medidaReducida(640, 480, 1024)).toEqual({ ancho: 640, alto: 480 });
  });
});
