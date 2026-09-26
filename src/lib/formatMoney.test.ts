import { describe, expect, it } from "vitest";

import { formatMoney } from "./formatMoney";

describe("formatMoney: each currency written as in its country", () => {
  it.each([
    [150000, "USD", "$1,500.00 USD"],
    [150050, "MXN", "$1,500.50 MXN"],
    [150050, "ARS", "$ 1.500,50 ARS"],
    [150000, "PEN", "S/ 1,500.00 PEN"],
    [150000, "PAB", "B/. 1,500.00 PAB"],
  ])("%i %s → %s", (cents, code, text) => {
    expect(formatMoney(cents, code)).toBe(text);
  });
});
