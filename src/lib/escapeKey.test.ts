import { describe, expect, it } from "vitest";

import { isPlainEscape } from "./escapeKey";

const key = (over: Partial<KeyboardEvent> = {}) => ({
  key: "Escape",
  defaultPrevented: false,
  isComposing: false,
  ...over,
});

describe("isPlainEscape", () => {
  it("accepts a plain Esc press", () => {
    expect(isPlainEscape(key())).toBe(true);
  });

  it("ignores other keys", () => {
    expect(isPlainEscape(key({ key: "Enter" }))).toBe(false);
    expect(isPlainEscape(key({ key: "Esc" }))).toBe(false);
  });

  it("ignores an Esc that another layer already handled", () => {
    expect(isPlainEscape(key({ defaultPrevented: true }))).toBe(false);
  });

  it("ignores Esc while an IME is composing text", () => {
    expect(isPlainEscape(key({ isComposing: true }))).toBe(false);
  });
});
