import { describe, expect, it } from "vitest";

import { EMAIL_PATTERN, phoneForServer } from "./contactFields";

describe("phoneForServer", () => {
  it("sends a valid number in E.164, as the profile stores it", () => {
    expect(phoneForServer("+593", "99 123 4567")).toBe("+593991234567");
  });

  it("keeps an unparseable number as typed", () => {
    expect(phoneForServer("", "123")).toBe("123");
  });
});

describe("EMAIL_PATTERN", () => {
  it("accepts a normal address and rejects malformed ones", () => {
    expect(EMAIL_PATTERN.test("ana@empresa.com")).toBe(true);
    expect(EMAIL_PATTERN.test("ana@empresa")).toBe(false);
    expect(EMAIL_PATTERN.test("ana empresa.com")).toBe(false);
    expect(EMAIL_PATTERN.test("@empresa.com")).toBe(false);
  });
});
