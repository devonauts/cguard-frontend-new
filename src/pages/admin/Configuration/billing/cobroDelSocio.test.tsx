import type { CobroDelSocioActivo } from "../../../../lib/api/partnerBillingService";

import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  accionDeTarjeta,
  desgloseDelPlan,
  esDiaCivil,
  puedePagarAhora,
  resumenDelCobro,
} from "./cobroDelSocio";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LA FACTURACIÓN DE UNA EMPRESA DE SOCIO
 *
 * Tres estados que no pueden confundirse: en prueba, pausada por impago y sin
 * tarjeta. Primero las decisiones (qué botón, si se ofrece pagar) y luego la
 * vista pintada en el servidor — sin jsdom, que el CRM no usa: sólo se simula
 * el `localStorage` que lee la zona horaria de la empresa.
 * ════════════════════════════════════════════════════════════════════════════
 */

function base(extra: Partial<CobroDelSocioActivo> = {}): CobroDelSocioActivo {
  return {
    enabled: true,
    gateway: { provider: "stripe", name: "Stripe", publicKey: "pk_test_x" },
    status: "active",
    trialEndsAt: null,
    anchorAt: "2026-09-01",
    cycle: { start: "2026-09-01", end: "2026-10-01", seatsPaid: 5 },
    price: {
      currency: "USD",
      setupFeeCents: 10000,
      monthlyFeeCents: 2000,
      perUserCents: 500,
      graceDays: 7,
    },
    setupFeePending: false,
    seatsNow: 5,
    nextChargeCents: 4500,
    card: { brand: "visa", last4: "4242", expMonth: 4, expYear: 2028 },
    amountDueCents: 0,
    invoices: [],
    ...extra,
  };
}

describe("decisiones de la vista", () => {
  it("desglosa el plan: usuarios × precio + cuota", () => {
    expect(desgloseDelPlan(base())).toEqual({
      porUsuarios: 2500,
      cuotaMensual: 2000,
      totalMensual: 4500,
    });
  });

  it("tarjeta: añadir sin ella, cambiar con ella, no disponible fuera de Stripe", () => {
    expect(accionDeTarjeta(base({ card: null }))).toBe("add");
    expect(accionDeTarjeta(base())).toBe("replace");
    expect(
      accionDeTarjeta(
        base({
          gateway: {
            provider: "mercadopago",
            name: "Mercado Pago",
            publicKey: "x",
          },
        }),
      ),
    ).toBe("unsupported");
  });

  it("«Pagar ahora» sólo con deuda Y tarjeta", () => {
    expect(puedePagarAhora(base({ amountDueCents: 0 }))).toBe(false);
    expect(puedePagarAhora(base({ amountDueCents: 4500 }))).toBe(true);
    // Sin tarjeta, el botón de añadirla ya cobra lo pendiente al guardarla.
    expect(puedePagarAhora(base({ amountDueCents: 4500, card: null }))).toBe(
      false,
    );
    expect(
      puedePagarAhora(base({ amountDueCents: 4500, status: "exempt" })),
    ).toBe(false);
  });

  it("distingue día civil de instante", () => {
    expect(esDiaCivil("2026-10-01")).toBe(true);
    expect(esDiaCivil("2026-10-01T05:00:00.000Z")).toBe(false);
    expect(esDiaCivil(null)).toBe(false);
  });

  it("resume el resultado de un cobro", () => {
    expect(
      resumenDelCobro({
        estado: "past_due",
        cobradas: ["R-1"],
        fallidas: [{ number: "R-2", motivo: "Fondos insuficientes" }],
        requiereAccion: null,
      }),
    ).toEqual({
      cobradas: 1,
      motivos: ["R-2: Fondos insuficientes"],
      requiereAccion: false,
    });
  });
});

describe("la vista pintada", () => {
  let pintar: (d: CobroDelSocioActivo) => string;

  beforeAll(async () => {
    const mem = new Map<string, string>();

    (globalThis as any).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, String(v)),
      removeItem: (k: string) => void mem.delete(k),
    };
    await import("../../../../i18n");
    const { default: PartnerBillingView } = await import(
      "./PartnerBillingView"
    );

    pintar = (d) =>
      renderToStaticMarkup(
        <PartnerBillingView data={d} onRefresh={() => {}} />,
      );
  });

  it("en prueba y sin tarjeta: fecha de fin, aviso de añadirla y botón de añadir", () => {
    const html = pintar(
      base({
        status: "trialing",
        trialEndsAt: "2026-10-15T12:00:00.000Z",
        cycle: null,
        card: null,
      }),
    );

    expect(html).toContain("Periodo de prueba");
    expect(html).toContain("Tu periodo de prueba termina el");
    expect(html).toContain("Añade una tarjeta antes de esa fecha");
    expect(html).toContain("Aún no has añadido una tarjeta.");
    expect(html).toContain("Añadir tarjeta");
    expect(html).not.toContain("Pagar ahora");
  });

  it("pausada: explica que las apps de campo siguen y ofrece pagar", () => {
    const html = pintar(
      base({
        status: "paused",
        amountDueCents: 4500,
        invoices: [
          {
            id: "1",
            number: "R-0007",
            kind: "renovacion",
            status: "open",
            currency: "USD",
            totalCents: 4500,
            amountPaidCents: 0,
            issuedAt: "2026-09-01T12:00:00.000Z",
            paidAt: null,
            lastError: "Fondos insuficientes",
            lines: [],
          },
        ],
      }),
    );

    expect(html).toContain("El sistema está en pausa por falta de pago");
    expect(html).toContain("las apps de campo");
    expect(html).toContain("$45.00");
    expect(html).toContain("Pagar ahora");
    expect(html).toContain("R-0007");
    expect(html).toContain("Renovación mensual");
    expect(html).toContain("Fondos insuficientes");
    expect(html).toContain("visa");
    expect(html).toContain("4242");
  });

  it("sin tarjeta y con deuda: «Añadir tarjeta y pagar», no un segundo botón", () => {
    const html = pintar(
      base({ status: "past_due", amountDueCents: 4500, card: null }),
    );

    expect(html).toContain("Añadir tarjeta y pagar");
    expect(html).not.toContain("Pagar ahora");
  });

  it("otra pasarela: lo dice con su nombre", () => {
    const html = pintar(
      base({
        gateway: { provider: "kushki", name: "Kushki", publicKey: "k" },
      }),
    );

    expect(html).toContain("todavía no está disponible para Kushki");
    expect(html).not.toContain("Cambiar tarjeta");
  });

  it("marca blanca: nunca nombra la plataforma", () => {
    const html = pintar(base({ status: "paused", amountDueCents: 100 }));

    expect(html).not.toMatch(/CGUARD|C-Guard|cguardpro/i);
  });
});
