import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * «Usuarios: 8 de 10» — the seat maximum a partner set for its company
 * (2026-10-16). Rendered on the server like the other billing views (the CRM
 * does not use jsdom), with the real Spanish catalog.
 */

type Props = { seats: number; seatCap: number; partnerName?: string | null };
let paint: (p: Props) => string;

beforeAll(async () => {
  const mem = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
  };
  await import("../i18n");
  const { default: PartnerSeatLimit } = await import("./PartnerSeatLimit");
  paint = (p) => renderToStaticMarkup(<PartnerSeatLimit {...p} />);
});

describe("PartnerSeatLimit", () => {
  it("shows usage against the maximum and names who to ask", () => {
    const html = paint({ seats: 8, seatCap: 10, partnerName: "Andina Seguridad" });
    expect(html).toContain("Usuarios: 8 de 10");
    expect(html).toContain("Andina Seguridad fija cuántos usuarios puede tener tu empresa");
  });

  it("at the maximum: says it is reached and who to ask for more", () => {
    const html = paint({ seats: 10, seatCap: 10, partnerName: "Andina Seguridad" });
    expect(html).toContain("Llegaste a tu máximo");
    expect(html).toContain("pídeselo a Andina Seguridad");
  });

  it("without the partner's name it still reads right", () => {
    const html = paint({ seats: 2, seatCap: 10, partnerName: null });
    expect(html).toContain("Tu proveedor fija cuántos usuarios");
  });

  it("the billing page shows it only for partner-billed companies with a maximum", () => {
    const page = readFileSync(resolve(__dirname, "../pages/admin/Configuration/billing/BillingPage.tsx"), "utf8");
    expect(page).toContain("{!loading && esDeProveedor && data?.seatCap != null && (");
  });
});
