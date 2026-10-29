import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * «Plan gratis» on the billing screen (2026-10-28). Rendered on the server like
 * the other billing views (the CRM does not use jsdom), with the real Spanish
 * catalog.
 */

let paint: (platformName?: string) => string;

beforeAll(async () => {
  const mem = new Map<string, string>();

  (globalThis as any).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
  };
  await import("../i18n");
  const { default: FreePlanBilling } = await import("./FreePlanBilling");
  const { ContextoDeMarcaReact, MARCA_DE_PLATAFORMA } =
    await import("../contexts/WhiteLabelContext");

  paint = (platformName) =>
    renderToStaticMarkup(
      platformName ? (
        <ContextoDeMarcaReact.Provider
          value={
            {
              ...MARCA_DE_PLATAFORMA,
              scope: "reseller",
              platformName,
              logo: null,
              puedeUsarArteDePlataforma: false,
              cargando: false,
              degradado: false,
            } as any
          }
        >
          <FreePlanBilling />
        </ContextoDeMarcaReact.Provider>
      ) : (
        <FreePlanBilling />
      ),
    );
});

describe("FreePlanBilling", () => {
  it("says the company is on the free plan, with the platform's name", () => {
    const html = paint();

    expect(html).toContain("Plan gratis");
    expect(html).toContain(
      "CGuard Pro le da el servicio sin costo a tu empresa.",
    );
  });

  it("on a partner's host it names the host, never us", () => {
    const html = paint("Andina Seguridad");

    expect(html).toContain("Andina Seguridad le da el servicio sin costo");
    expect(html).not.toMatch(/CGuard/i);
  });

  it("no price, trial or payment prompt", () => {
    const html = paint();

    expect(html).not.toMatch(/prueba|activar|pagar|tarjeta|\$/i);
  });

  it("the billing page puts it before every trial / payment branch", () => {
    const page = readFileSync(
      resolve(
        __dirname,
        "../pages/admin/Configuration/billing/BillingPage.tsx",
      ),
      "utf8",
    );

    expect(page.indexOf("<FreePlanBilling />")).toBeGreaterThan(0);
    expect(page.indexOf("<FreePlanBilling />")).toBeLessThan(
      page.indexOf("<PartnerBillingView"),
    );
  });
});
