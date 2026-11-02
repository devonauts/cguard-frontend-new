import { describe, expect, it } from "vitest";
import {
  radioEnMetros,
  radioParaMostrar,
  radioValido,
  RADIO_MAX_M,
} from "./radioDeGeocerca";

describe("geofence radius", () => {
  it("parses meters and converts feet", () => {
    expect(radioEnMetros("150", false)).toBe(150);
    expect(radioEnMetros("330", true)).toBe(101);
    expect(radioEnMetros("12,5", false)).toBe(13);
    expect(radioEnMetros("", false)).toBeNull();
    expect(radioEnMetros("abc", false)).toBeNull();
  });

  it("shows meters in the company unit", () => {
    expect(radioParaMostrar(100, false)).toBe(100);
    expect(radioParaMostrar(100, true)).toBe(328);
  });

  it("accepts only 10-5000 m", () => {
    expect(radioValido(10)).toBe(true);
    expect(radioValido(RADIO_MAX_M)).toBe(true);
    expect(radioValido(6000)).toBe(false);
    expect(radioValido(100150)).toBe(false);
    expect(radioValido(5)).toBe(false);
    expect(radioValido(null)).toBe(false);
  });
});
