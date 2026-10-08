import { describe, expect, it } from "vitest";

import { marcaDeLaEmpresa, personalizar } from "./marcaDelAviso";

const NUESTRA = "CGuard Pro";

describe("aviso de recarga · quién firma", () => {
  it("una empresa directa ve la nuestra", () => {
    expect(marcaDeLaEmpresa({ billingOwnership: "direct", resellerPublicId: null }, NUESTRA)).toBe(NUESTRA);
  });

  it("la de un socio ve a SU socio, entre por donde entre", () => {
    expect(
      marcaDeLaEmpresa(
        { billingOwnership: "reseller", resellerPublicId: "RSL-F6LK", resellerBrandName: "ENTEC DIGITAL" },
        NUESTRA,
      ),
    ).toBe("ENTEC DIGITAL");
  });

  it("colgar de un socio basta, aunque la factura diga «direct»", () => {
    expect(
      marcaDeLaEmpresa({ billingOwnership: "direct", resellerPublicId: "RSL-HN7M", resellerBrandName: "AndinaSeg" }, NUESTRA),
    ).toBe("AndinaSeg");
  });

  it("un socio sin nombre NUNCA cae a la nuestra: sale sin nombre", () => {
    expect(marcaDeLaEmpresa({ billingOwnership: "reseller", resellerPublicId: "RSL-X" }, NUESTRA)).toBe("");
    expect(marcaDeLaEmpresa({ resellerPublicId: "RSL-X", resellerBrandName: "   " }, NUESTRA)).toBe("");
  });

  it("sin empresa resuelta, nadie", () => {
    expect(marcaDeLaEmpresa(null, NUESTRA)).toBe("");
  });
});

describe("aviso de recarga · la etiqueta {{marca}} del SuperAdmin", () => {
  it("se sustituye en cada empresa", () => {
    expect(personalizar("Publicamos mejoras en {{marca}}.", "ENTEC DIGITAL")).toBe("Publicamos mejoras en ENTEC DIGITAL.");
    expect(personalizar("{{ MARCA }} estrena horario. Gracias por usar {{marca}}!", NUESTRA)).toBe(
      "CGuard Pro estrena horario. Gracias por usar CGuard Pro!",
    );
  });

  it("sin nombre, el aviso pasa «la plataforma» y la frase sigue leyéndose", () => {
    expect(personalizar("Novedades de {{marca}} en el Horario.", "la plataforma")).toBe(
      "Novedades de la plataforma en el Horario.",
    );
  });

  it("un mensaje sin etiqueta queda igual", () => {
    expect(personalizar("Publicamos mejoras en el Horario.", "ENTEC DIGITAL")).toBe("Publicamos mejoras en el Horario.");
  });
});
