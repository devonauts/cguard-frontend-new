import { describe, expect, it } from "vitest";

import { esEmpresaBloqueada } from "./entitlements";

/**
 * Empresa suspendida o cancelada: el armazón (menú, barra) no se monta
 * alrededor de la pantalla de bloqueo. Misma regla que ProtectedRoute.
 */
const conEstado = (
  billingStatus: string | null,
  suspendedAt: string | null = null,
  extra: any = {},
) => ({
  tenants: [{ tenantId: "t1", billingStatus, suspendedAt, status: "active" }],
  tenantId: "t1",
  ...extra,
});

describe("esEmpresaBloqueada", () => {
  it("activa o en prueba: se monta el armazón", () => {
    expect(esEmpresaBloqueada(conEstado("active"), "/dashboard")).toBe(false);
    expect(esEmpresaBloqueada(conEstado("trialing"), "/dashboard")).toBe(false);
  });
  it("suspendida: sin armazón en cualquier ruta", () => {
    expect(
      esEmpresaBloqueada(conEstado("active", "2026-10-01"), "/setting/billing"),
    ).toBe(true);
  });
  it("cancelada: sin armazón, salvo en Facturación (para reactivar)", () => {
    expect(esEmpresaBloqueada(conEstado("canceled"), "/dashboard")).toBe(true);
    expect(esEmpresaBloqueada(conEstado("canceled"), "/setting/billing")).toBe(
      false,
    );
  });
  it("superadmin nunca", () => {
    expect(
      esEmpresaBloqueada(
        conEstado("canceled", null, { isSuperadmin: true }),
        "/dashboard",
      ),
    ).toBe(false);
    expect(
      esEmpresaBloqueada(
        conEstado("canceled", null, { roles: ["superadmin"] }),
        "/dashboard",
      ),
    ).toBe(false);
  });
});
