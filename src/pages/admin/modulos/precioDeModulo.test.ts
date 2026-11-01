import { describe, expect, it } from "vitest";

import { precioACobrar, precioDeModulo } from "./precioDeModulo";

describe("module amounts as the company reads them", () => {
  it("writes the company's currency with its code, whole amounts without decimals", () => {
    expect(precioDeModulo(92500, "MXN")).toBe("$925 MXN");
    expect(precioDeModulo(5000, "USD")).toBe("$50 USD");
    expect(precioDeModulo(1999, "USD")).toBe("$19.99 USD");
  });

  it("writes nothing when there is no amount (a module switched on)", () => {
    expect(precioDeModulo(null, "MXN")).toBe("");
  });

  it("a confirmation adds the USD the card is charged when it differs", () => {
    expect(precioACobrar(92500, "MXN", 5000, "USD")).toBe("$925 MXN ($50 USD)");
    expect(precioACobrar(5000, "USD", 5000, "USD")).toBe("$50 USD");
  });
});
