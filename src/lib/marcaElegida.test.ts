import { beforeEach, describe, expect, it } from "vitest";

import {
  cabeceraDeMarca,
  elegirMarca,
  hayQuePreguntarLaMarca,
  marcaActual,
  marcaElegida,
  marcarQueHayQuePreguntarLaMarca,
  yaSePreguntoLaMarca,
} from "./marcaElegida";

/**
 * The brand chosen in the top bar travels as `x-cguard-brand`. It is PER
 * COMPANY: switching company never carries the other company's brand.
 */
const memoria = new Map<string, string>();

(globalThis as any).localStorage = {
  getItem: (k: string) => (memoria.has(k) ? memoria.get(k)! : null),
  setItem: (k: string, v: string) => void memoria.set(k, String(v)),
  removeItem: (k: string) => void memoria.delete(k),
  clear: () => memoria.clear(),
};

describe("brand chosen in the top bar", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("tenantId", "t1");
  });

  it("sends no header when nothing is chosen", () => {
    expect(cabeceraDeMarca()).toEqual({});
    expect(marcaActual()).toBe("all");
  });

  it("a chosen brand travels in the header; «all» removes it", () => {
    elegirMarca("brand-a");
    expect(cabeceraDeMarca()).toEqual({ "x-cguard-brand": "brand-a" });
    expect(marcaActual()).toBe("brand-a");
    elegirMarca("all");
    expect(marcaElegida()).toBeNull();
    expect(cabeceraDeMarca()).toEqual({});
    elegirMarca("brand-b");
    elegirMarca(null);
    expect(marcaActual()).toBe("all");
  });

  it("is per company", () => {
    elegirMarca("brand-a");
    localStorage.setItem("tenantId", "t2");
    expect(marcaElegida()).toBeNull();
    expect(cabeceraDeMarca()).toEqual({});
  });

  it("never sends a header without a company", () => {
    localStorage.removeItem("tenantId");
    elegirMarca("brand-a");
    expect(cabeceraDeMarca()).toEqual({});
  });

  it("the sign-in flags the question, and asking clears it", () => {
    expect(hayQuePreguntarLaMarca()).toBe(false);
    marcarQueHayQuePreguntarLaMarca();
    expect(hayQuePreguntarLaMarca()).toBe(true);
    yaSePreguntoLaMarca();
    expect(hayQuePreguntarLaMarca()).toBe(false);
  });
});
