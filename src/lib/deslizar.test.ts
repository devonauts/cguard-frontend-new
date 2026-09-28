import { describe, expect, it } from "vitest";

import { alSoltar, desplazamiento, ejeDelGesto } from "./deslizar";

describe("deslizar para quitar", () => {
  it("hasta 8 px no se sabe; luego manda el eje dominante", () => {
    expect(ejeDelGesto(5, 3)).toBeNull();
    expect(ejeDelGesto(-20, 4)).toBe("horizontal");
    expect(ejeDelGesto(-6, 30)).toBe("vertical");
  });

  it("sólo se mueve hacia la izquierda", () => {
    expect(desplazamiento(40)).toBe(0);
    expect(desplazamiento(-40)).toBe(-40);
  });

  it("más del 40 % del ancho: se quita; menos, vuelve", () => {
    expect(alSoltar(-170, 400, 800)).toBe("quitar");
    expect(alSoltar(-100, 400, 800)).toBe("volver");
    expect(alSoltar(30, 400, 50)).toBe("volver");
  });

  it("un golpe rápido a la izquierda quita aunque sea corto", () => {
    expect(alSoltar(-80, 400, 90)).toBe("quitar");
    expect(alSoltar(-20, 400, 10)).toBe("volver");
  });
});
