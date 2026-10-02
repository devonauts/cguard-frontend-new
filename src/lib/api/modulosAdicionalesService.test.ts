import { describe, expect, it } from "vitest";

import { tiendaVisible, type Tienda } from "./modulosAdicionalesService";

/**
 * «Módulos adicionales» en el menú: sólo cuando hay algo que enseñar y la
 * empresa puede comprar (implementación pagada y suscripción al día), o la
 * factura su distribuidor, o ya tiene algo. Una empresa en prueba no ve una
 * tienda en la que no puede comprar.
 */
const modulo = (extra: Partial<Tienda["modules"][number]> = {}) => ({
  key: "sucursales", name: "Sucursales", description: "", priceCents: 10000,
  currency: "USD", status: null, source: null, purchasedAt: null, owned: false, ...extra,
});

describe("módulos adicionales · cuándo se ve la tienda", () => {
  it("sin módulos a la venta, no se ve", () => {
    expect(tiendaVisible({ canPurchase: true, reason: null, modules: [] })).toBe(false);
    expect(tiendaVisible(undefined)).toBe(false);
  });

  it("con módulos y pudiendo comprar, se ve", () => {
    expect(tiendaVisible({ canPurchase: true, reason: null, modules: [modulo()] })).toBe(true);
  });

  it("en prueba o sin implementación pagada, NO se ve", () => {
    expect(tiendaVisible({ canPurchase: false, reason: "implementacion_sin_pagar", modules: [modulo()] })).toBe(false);
    expect(tiendaVisible({ canPurchase: false, reason: "suscripcion_no_activa", modules: [modulo()] })).toBe(false);
  });

  it("la de un distribuidor se ve (para pedírselo a él)", () => {
    expect(tiendaVisible({ canPurchase: false, reason: "la_factura_el_socio", modules: [modulo()] })).toBe(true);
  });

  it("si ya tiene un módulo o un pago pendiente, se ve aunque ahora no pueda comprar", () => {
    expect(tiendaVisible({ canPurchase: false, reason: "suscripcion_no_activa", modules: [modulo({ owned: true, status: "comp" })] })).toBe(true);
    expect(tiendaVisible({ canPurchase: false, reason: "suscripcion_no_activa", modules: [modulo({ status: "pending_payment" })] })).toBe(true);
  });

  it("con una PRUEBA gratis disponible (VigIA Pro) se ve aunque la empresa esté en su prueba", () => {
    const pro = modulo({ key: "vigia_pro", billingType: "monthly_tiers", canStartTrial: true });
    expect(tiendaVisible({ canPurchase: false, reason: "implementacion_sin_pagar", modules: [pro] })).toBe(true);
    const enPrueba = modulo({ key: "vigia_pro", billingType: "monthly_tiers", status: "trial", canStartTrial: false });
    expect(tiendaVisible({ canPurchase: false, reason: "implementacion_sin_pagar", modules: [enPrueba] })).toBe(true);
  });
});
