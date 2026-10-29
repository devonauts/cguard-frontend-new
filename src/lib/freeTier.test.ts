import { beforeEach, describe, expect, it } from "vitest";

import {
  FREE_TIER_STORE_REASON,
  isFreeTierPartnerBilling,
  isFreeTierSession,
  isFreeTierSummary,
  isFreeTierTenant,
  isFreeTierUser,
  storeReasonForCompany,
} from "./freeTier";

/* No jsdom (like its neighbours): a minimal `localStorage` double. */
let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
  };
});

const user = (entries: any[], extra: any = {}) => ({
  tenants: entries,
  ...extra,
});

describe("isFreeTierTenant", () => {
  it("direct company: billingStatus 'free' and/or the flag", () => {
    expect(isFreeTierTenant({ tenantId: "t1", billingStatus: "free" })).toBe(
      true,
    );
    expect(
      isFreeTierTenant({
        tenantId: "t1",
        billingStatus: "free",
        freeTier: true,
      }),
    ).toBe(true);
  });

  it("partner company: only the flag (its billingStatus is the partner's)", () => {
    expect(
      isFreeTierTenant({
        tenantId: "t1",
        billingStatus: "trialing",
        freeTier: true,
      }),
    ).toBe(true);
    expect(isFreeTierTenant({ tenantId: "t1", freeTier: 1 })).toBe(true);
  });

  it("reads the nested tenant relation too", () => {
    expect(
      isFreeTierTenant({ tenantId: "t1", tenant: { freeTier: true } }),
    ).toBe(true);
    expect(
      isFreeTierTenant({ tenantId: "t1", tenant: { billingStatus: "free" } }),
    ).toBe(true);
  });

  it("paying, trialing or unknown companies are not free", () => {
    expect(isFreeTierTenant({ billingStatus: "active", freeTier: false })).toBe(
      false,
    );
    expect(isFreeTierTenant({ billingStatus: "trialing" })).toBe(false);
    expect(isFreeTierTenant({})).toBe(false);
    expect(isFreeTierTenant(null)).toBe(false);
    expect(isFreeTierTenant(undefined)).toBe(false);
  });
});

describe("isFreeTierUser", () => {
  it("looks at the CURRENT company (persisted tenantId)", () => {
    const u = user([
      { tenantId: "a", billingStatus: "active" },
      { tenantId: "b", billingStatus: "free", freeTier: true },
    ]);

    expect(isFreeTierUser(u)).toBe(false); // no tenantId → first entry
    store.set("tenantId", "b");
    expect(isFreeTierUser(u)).toBe(true);
    store.set("tenantId", "a");
    expect(isFreeTierUser(u)).toBe(false);
  });

  it("never for a superadmin or without a session", () => {
    expect(
      isFreeTierUser(
        user([{ tenantId: "a", freeTier: true }], { isSuperadmin: true }),
      ),
    ).toBe(false);
    expect(isFreeTierUser(null)).toBe(false);
  });
});

describe("isFreeTierSession", () => {
  it("reads the cached session the HTTP clients can reach", () => {
    expect(isFreeTierSession()).toBe(false);
    store.set(
      "authUserCache",
      JSON.stringify({
        at: 1,
        user: user([{ tenantId: "a", freeTier: true }]),
      }),
    );
    expect(isFreeTierSession()).toBe(true);
  });

  it("a broken cache is simply 'not free'", () => {
    store.set("authUserCache", "{not json");
    expect(isFreeTierSession()).toBe(false);
  });
});

describe("billing summaries", () => {
  it("direct summary: status 'free'", () => {
    expect(isFreeTierSummary({ status: "free" })).toBe(true);
    expect(isFreeTierSummary({ status: "trialing" })).toBe(false);
    expect(isFreeTierSummary(null)).toBe(false);
  });

  it("partner billing summary: freeTier flag or status 'free'", () => {
    expect(
      isFreeTierPartnerBilling({
        enabled: false,
        status: "free",
        freeTier: true,
      } as any),
    ).toBe(true);
    expect(isFreeTierPartnerBilling({ status: "free" })).toBe(true);
    expect(isFreeTierPartnerBilling({ status: "paused" })).toBe(false);
    expect(isFreeTierPartnerBilling(null)).toBe(false);
  });
});

describe("storeReasonForCompany", () => {
  it("a free company is never sent to pay for its subscription", () => {
    for (const r of [
      "suscripcion_no_activa",
      "implementacion_sin_pagar",
      "sin_suscripcion",
      "sin_cliente_stripe",
    ]) {
      expect(storeReasonForCompany(r, true)).toBe(FREE_TIER_STORE_REASON);
      expect(storeReasonForCompany(r, false)).toBe(r);
    }
  });

  it("other reasons stay as they are", () => {
    expect(storeReasonForCompany("suspendida", true)).toBe("suspendida");
    expect(storeReasonForCompany("la_factura_el_socio", true)).toBe(
      "la_factura_el_socio",
    );
    expect(storeReasonForCompany(null, true)).toBe(null);
  });
});
