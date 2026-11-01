import { describe, expect, it } from "vitest";

import {
  centavosDeMarcaExtra,
  precioDeMultimarca,
} from "./precioDeMultimarca";

describe("Multimarca price on the store card", () => {
  it("a direct company reads both figures in USD", () => {
    expect(precioDeMultimarca({ priceCents: 45000, currency: "USD" })).toEqual({
      precio: "$450 USD",
      extra: "$50 USD",
    });
  });

  it("a partner's company reads the extra brand in its currency, with the same rate", () => {
    // 18.5 MXN per USD: 450 USD → 8,325 MXN; 50 USD → 925 MXN.
    const m = {
      priceCents: 832500,
      currency: "MXN",
      chargePriceCents: 45000,
      chargeCurrency: "USD",
    };

    expect(centavosDeMarcaExtra(m)).toBe(92500);
    expect(precioDeMultimarca(m)?.extra).toBe("$925 MXN");
  });

  it("rounds the converted extra brand to whole units, like the server", () => {
    // 3.7 PEN per USD (rounded): 50 USD → 185 PEN.
    expect(
      centavosDeMarcaExtra({
        priceCents: 166500,
        currency: "PEN",
        chargePriceCents: 45000,
        chargeCurrency: "USD",
      }),
    ).toBe(18500);
  });

  it("an amount sent by the server wins", () => {
    expect(
      centavosDeMarcaExtra({
        priceCents: 45000,
        currency: "USD",
        extraBrandPriceCents: 4000,
      }),
    ).toBe(4000);
  });

  it("shows nothing for a module that is already switched on", () => {
    expect(precioDeMultimarca({ priceCents: null, currency: "USD" })).toBeNull();
    expect(
      precioDeMultimarca({ priceCents: 45000, currency: "USD", priceHidden: true }),
    ).toBeNull();
  });

  it("without the charged USD, a foreign currency gets no extra figure", () => {
    expect(
      precioDeMultimarca({ priceCents: 832500, currency: "MXN" })?.extra,
    ).toBeNull();
  });
});
