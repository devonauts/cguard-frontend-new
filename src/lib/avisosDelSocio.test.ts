import type { CobroDelSocio } from "./api/partnerBillingService";

import { describe, expect, it } from "vitest";

import { MARCA_DE_PLATAFORMA } from "../contexts/WhiteLabelContext";

import { enlaceDeAyuda, finDePruebaDelSocio } from "./avisosDelSocio";

const socio = (support: { email?: string; url?: string; phone?: string }) => ({
  scope: "reseller" as const,
  support: { email: null, url: null, phone: null, ...support },
});

describe("DemoDataBanner help link", () => {
  it("the platform keeps its own WhatsApp line", () => {
    expect(enlaceDeAyuda(MARCA_DE_PLATAFORMA, "hola")).toBe(
      "https://wa.me/593995914128?text=hola",
    );
  });

  it("a partner's company goes to the partner's phone, never ours", () => {
    const url = enlaceDeAyuda(socio({ phone: "+57 (300) 123-4567" }), "hola");

    expect(url).toBe("https://wa.me/573001234567?text=hola");
  });

  it("falls back to the partner's support URL", () => {
    expect(enlaceDeAyuda(socio({ url: "https://ayuda.socio.com" }), "x")).toBe(
      "https://ayuda.socio.com",
    );
  });

  it("with no published support the button is hidden", () => {
    expect(enlaceDeAyuda(socio({}), "x")).toBeNull();
    expect(
      enlaceDeAyuda(socio({ url: "javascript:alert(1)" }), "x"),
    ).toBeNull();
  });
});

describe("partner trial banner", () => {
  const ahora = Date.parse("2026-09-23T12:00:00Z");
  const cobro = (over: Record<string, unknown>) =>
    ({
      enabled: true,
      status: "trialing",
      trialEndsAt: "2026-09-26T12:00:00Z",
      card: null,
      ...over,
    }) as unknown as CobroDelSocio;

  it("warns when the trial ends soon and there is no card", () => {
    expect(finDePruebaDelSocio(cobro({}), ahora)).toBe("2026-09-26T12:00:00Z");
  });

  it("stays quiet otherwise", () => {
    expect(finDePruebaDelSocio(null, ahora)).toBeNull();
    expect(finDePruebaDelSocio({ enabled: false }, ahora)).toBeNull();
    expect(
      finDePruebaDelSocio(cobro({ card: { last4: "4242" } }), ahora),
    ).toBeNull();
    expect(finDePruebaDelSocio(cobro({ status: "active" }), ahora)).toBeNull();
    expect(
      finDePruebaDelSocio(
        cobro({ trialEndsAt: "2026-11-01T00:00:00Z" }),
        ahora,
      ),
    ).toBeNull();
    expect(
      finDePruebaDelSocio(
        cobro({ trialEndsAt: "2026-09-01T00:00:00Z" }),
        ahora,
      ),
    ).toBeNull();
  });
});
