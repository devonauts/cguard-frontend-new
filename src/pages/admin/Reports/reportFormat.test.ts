import { describe, expect, it } from "vitest";

import { rangoValido } from "./reportFormat";

describe("rangoValido", () => {
  it("accepts a complete range in order", () => {
    expect(rangoValido("2026-10-18", "2026-10-19")).toBe(true);
    expect(rangoValido("2026-10-19", "2026-10-19")).toBe(true);
  });

  it("rejects half-typed years, inverted ranges and empty dates", () => {
    expect(rangoValido("0202-10-18", "2026-10-19")).toBe(false);
    expect(rangoValido("1902-10-18", "2026-10-19")).toBe(false);
    expect(rangoValido("2026-10-20", "2026-10-19")).toBe(false);
    expect(rangoValido("", "2026-10-19")).toBe(false);
  });
});
