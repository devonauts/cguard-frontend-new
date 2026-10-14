import { describe, expect, it } from "vitest";

import { chipDeEstado, chipFacial, faltaElModulo, modoFacial, porcentajeFacial } from "./rostro";

describe("rostro · chip del resultado", () => {
  it("coincide es verde", () => {
    expect(chipFacial("coincide")?.tono).toBe("ok");
  });

  it("dudoso es ámbar", () => {
    expect(chipFacial("dudoso")?.tono).toBe("warn");
  });

  it("no coincide, sin gesto y sin cara son rojos", () => {
    for (const r of ["no_coincide", "reto_fallido", "sin_cara"]) {
      expect(chipFacial(r)?.tono).toBe("bad");
    }
    expect(chipFacial("reto_fallido")?.respaldo).toBe("Sin gesto");
  });

  it("sin registro y sin verificar son neutros", () => {
    expect(chipFacial("sin_registro")?.tono).toBe("neutral");
    expect(chipFacial("no_verificado")?.tono).toBe("neutral");
    expect(chipFacial("no_verificado")?.respaldo).toBe("Sin verificar");
  });

  it("sin resultado no hay chip", () => {
    expect(chipFacial(null)).toBeNull();
    expect(chipFacial(undefined)).toBeNull();
    expect(chipFacial("")).toBeNull();
  });

  it("un resultado desconocido sale neutro con su nombre", () => {
    expect(chipFacial("algo_nuevo")).toEqual({
      tono: "neutral",
      clave: "rostros.resultado.algo_nuevo",
      respaldo: "algo_nuevo",
    });
  });

  it("cada clave cuelga de rostros.resultado", () => {
    for (const r of ["coincide", "dudoso", "no_coincide", "reto_fallido", "sin_cara", "sin_registro", "no_verificado"]) {
      expect(chipFacial(r)?.clave).toBe(`rostros.resultado.${r}`);
    }
  });
});

describe("rostro · modo y puntuación", () => {
  it("cualquier modo raro cuenta como apagado", () => {
    expect(modoFacial("flag")).toBe("flag");
    expect(modoFacial("enforce")).toBe("enforce");
    expect(modoFacial("on")).toBe("off");
    expect(modoFacial(undefined)).toBe("off");
  });

  it("la puntuación sale en porcentaje entero, acotada", () => {
    expect(porcentajeFacial(0.8234)).toBe(82);
    expect(porcentajeFacial("0.5")).toBe(50);
    expect(porcentajeFacial(1.4)).toBe(100);
    expect(porcentajeFacial(null)).toBeNull();
    expect(porcentajeFacial("x")).toBeNull();
  });

  it("reconoce el 402 de módulo no contratado", () => {
    expect(faltaElModulo({ status: 402, data: { code: "addon_required" } })).toBe(true);
    expect(faltaElModulo({ status: 404, data: null })).toBe(false);
    expect(faltaElModulo(null)).toBe(false);
  });
});

describe("rostro · estado del registro", () => {
  it("pendiente ámbar, aprobado verde, rechazado rojo", () => {
    expect(chipDeEstado("pendiente").tono).toBe("warn");
    expect(chipDeEstado("aprobado").tono).toBe("ok");
    expect(chipDeEstado("rechazado").tono).toBe("bad");
  });

  it("sin estado o desconocido cuenta como sin registrar", () => {
    expect(chipDeEstado(null).clave).toBe("rostros.estado.sin_registro");
    expect(chipDeEstado("raro").clave).toBe("rostros.estado.sin_registro");
  });
});
