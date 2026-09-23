import { describe, expect, it } from "vitest";

import { hasFeature, MODULE_KEYS, FEATURE_KEYS } from "./entitlements";

/**
 * Los MÓDULOS ADICIONALES se pagan: en el CRM fallan CERRADO, al revés que las
 * funciones de siempre. Sin esto, una sesión vieja sin `planFeatures` (o una
 * lista vacía) enseñaría Sucursales a quien no lo ha comprado.
 */
const conFunciones = (planFeatures: unknown) => ({
  tenants: [{ tenantId: "t-1", planFeatures }],
});

describe("entitlements · módulos adicionales", () => {
  it("un módulo no está entre las funciones de siempre", () => {
    for (const k of MODULE_KEYS) {
      expect((FEATURE_KEYS as readonly string[]).includes(k)).toBe(false);
    }
  });

  it("sin lista, o con la lista vacía, NO se tiene el módulo", () => {
    expect(hasFeature(conFunciones(undefined), "sucursales")).toBe(false);
    expect(hasFeature(conFunciones([]), "sucursales")).toBe(false);
    expect(hasFeature(null, "sucursales")).toBe(false);
  });

  it("sólo se tiene si el servidor lo manda", () => {
    expect(hasFeature(conFunciones(["rondas", "sucursales"]), "sucursales")).toBe(true);
    expect(hasFeature(conFunciones(["rondas"]), "sucursales")).toBe(false);
  });

  it("las funciones de siempre siguen fallando abierto", () => {
    expect(hasFeature(conFunciones(undefined), "rondas")).toBe(true);
    expect(hasFeature(conFunciones([]), "radio")).toBe(true);
  });
});
