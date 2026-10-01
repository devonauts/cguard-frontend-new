import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El ejemplo de teléfono sale del país de la EMPRESA, no de Ecuador escrito a
 * mano (queja de clientes de México y EE. UU., 2026-09-30).
 */
const almacen = new Map<string, string>();

beforeEach(() => {
  almacen.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (almacen.has(k) ? almacen.get(k)! : null),
    setItem: (k: string, v: string) => void almacen.set(k, String(v)),
    removeItem: (k: string) => void almacen.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("teléfono de la empresa", () => {
  it("una empresa de México escribe con +52", async () => {
    almacen.set("tenantCountry", "MX");
    const t = await import("./telefonoDeLaEmpresa");

    expect(t.paisDeLaEmpresa()).toBe("MX");
    expect(t.prefijoDeLaEmpresa()).toBe("+52");
    expect(t.ejemploDeTelefono()).toMatch(/^\+52 /);
  });

  it("una de EE. UU. con +1, y nunca con el +593 de Ecuador", async () => {
    almacen.set("tenantCountry", "US");
    const t = await import("./telefonoDeLaEmpresa");

    expect(t.ejemploDeTelefono()).toMatch(/^\+1 /);
    expect(t.ejemploDeTelefono()).not.toContain("593");
  });

  it("el país pedido manda sobre el de la empresa", async () => {
    almacen.set("tenantCountry", "MX");
    const t = await import("./telefonoDeLaEmpresa");

    expect(t.ejemploDeTelefono("CO")).toMatch(/^\+57 /);
  });

  it("un país guardado basura no rompe: cae a lo que se sepa", async () => {
    almacen.set("tenantCountry", "zz");
    const t = await import("./telefonoDeLaEmpresa");

    expect(t.prefijoDeLaEmpresa()).toMatch(/^\+\d+$/);
  });
});
