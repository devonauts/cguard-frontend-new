import { describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({ default: {} }));
vi.mock("@/i18n", () => ({ default: { t: (_k: string, d: string) => d } }));
vi.mock("@/lib/export/serverDownload", () => ({ descargarInforme: vi.fn() }));

import { quoteLineTotals, quoteTotalsPreview, taxRatesForAddress, type TaxRate } from "./clientBillingService";

/**
 * The quote editor previews the same numbers the server will store
 * (`backend/services/clientBilling/quoteMath.ts`): if these drift, the
 * prospect signs a total the screen never showed.
 */
describe("quote arithmetic mirrors the server", () => {
  it("hourly: hours/week × rate × 52 / 12", () => {
    // A 24/7 post (168 h/week) at $25.00/h → 168 × 25 × 52 / 12 = $18,200.00 a month.
    expect(quoteLineTotals({ kind: "hourly", quantityHundredths: 16800, unitCents: 2500 })).toEqual({ monthlyCents: 1_820_000, oneTimeCents: 0 });
    // 40 h/week at $18.75 → 3,250.00
    expect(quoteLineTotals({ kind: "hourly", quantityHundredths: 4000, unitCents: 1875 })).toEqual({ monthlyCents: 325_000, oneTimeCents: 0 });
  });

  it("monthly kinds are units × price, oneTime is kept apart", () => {
    expect(quoteLineTotals({ kind: "patrol", quantityHundredths: 3000, unitCents: 4500 })).toEqual({ monthlyCents: 135_000, oneTimeCents: 0 });
    expect(quoteLineTotals({ kind: "fixed", quantityHundredths: 100, unitCents: 99_900 })).toEqual({ monthlyCents: 99_900, oneTimeCents: 0 });
    expect(quoteLineTotals({ kind: "oneTime", quantityHundredths: 200, unitCents: 50_000 })).toEqual({ monthlyCents: 0, oneTimeCents: 100_000 });
  });

  it("taxes the monthly taxable base with the rates that match the prospect's address", () => {
    const rates: TaxRate[] = [
      { id: "tx", name: "Texas", jurisdiction: "state", state: "TX", postalCodePrefix: null, rateBps: 625, active: true, notes: null },
      { id: "aus", name: "Austin", jurisdiction: "postal", state: "TX", postalCodePrefix: "787", rateBps: 200, active: true, notes: null },
      { id: "fl", name: "Florida", jurisdiction: "state", state: "FL", postalCodePrefix: null, rateBps: 600, active: true, notes: null },
    ];

    expect(taxRatesForAddress(rates, { state: "tx", postalCode: "78701" }).map((r) => r.id)).toEqual(["tx", "aus"]);
    const totals = quoteTotalsPreview(
      [
        { kind: "hourly", quantityHundredths: 16800, unitCents: 2500, taxable: true },
        { kind: "fixed", quantityHundredths: 100, unitCents: 10_000, taxable: false },
        { kind: "oneTime", quantityHundredths: 100, unitCents: 50_000, taxable: true },
      ],
      rates,
      { state: "TX", postalCode: "78701" },
    );

    expect(totals.monthlySubtotalCents).toBe(1_830_000);
    expect(totals.oneTimeCents).toBe(50_000);
    // 18,200.00 × 6.25 % = 1,137.50 and × 2 % = 364.00
    expect(totals.taxCents).toBe(113_750 + 36_400);
    expect(totals.monthlyTotalCents).toBe(1_830_000 + 150_150);
    expect(quoteTotalsPreview([{ kind: "fixed", quantityHundredths: 100, unitCents: 10_000 }], rates, { state: "TX" }, true).taxCents).toBe(0);
  });
});
