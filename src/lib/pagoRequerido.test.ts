import { beforeEach, describe, expect, it, vi } from "vitest";

const avisos: string[] = [];

vi.mock("sonner", () => ({
  toast: { error: (m: string) => void avisos.push(m) },
}));

import { manejarPagoRequerido, olvidarUltimoAviso } from "./pagoRequerido";

/**
 * Los 402 del cobro del socio: la empresa que puede arreglarlo va a
 * Facturación; la que no (quien no paga es su socio) sólo recibe el aviso. Y
 * en la propia Facturación, ni salto ni aviso repetido.
 */

let saltos: string[] = [];

function navegador(ruta: string) {
  saltos = [];
  (globalThis as any).CustomEvent = class {
    defaultPrevented = false;
    constructor(public type: string) {}
  };
  (globalThis as any).window = {
    location: { pathname: ruta, assign: (u: string) => void saltos.push(u) },
    dispatchEvent: () => true,
  };
}

beforeEach(() => {
  avisos.length = 0;
  olvidarUltimoAviso();
});

describe("402 del cobro del socio", () => {
  it("empresa pausada: avisa y manda a Facturación", () => {
    navegador("/dashboard");
    expect(
      manejarPagoRequerido(402, "company_payment_required", "Pausada"),
    ).toBe(true);
    expect(avisos).toEqual(["Pausada"]);
    expect(saltos).toEqual(["/setting/billing"]);
  });

  it("en Facturación: ni salto ni aviso (sin bucles)", () => {
    navegador("/setting/billing");
    expect(
      manejarPagoRequerido(402, "company_payment_required", "Pausada"),
    ).toBe(true);
    expect(avisos).toEqual([]);
    expect(saltos).toEqual([]);
  });

  it("el socio no paga: sólo el aviso, sin salto", () => {
    navegador("/dashboard");
    expect(
      manejarPagoRequerido(402, "reseller_payment_required", "Proveedor"),
    ).toBe(true);
    expect(avisos).toEqual(["Proveedor"]);
    expect(saltos).toEqual([]);
  });

  it("no repite el mismo aviso en ráfaga", () => {
    navegador("/dashboard");
    manejarPagoRequerido(402, "reseller_payment_required", "Proveedor");
    manejarPagoRequerido(402, "reseller_payment_required", "Proveedor");
    expect(avisos).toEqual(["Proveedor"]);
  });

  it("petición de fondo: nada", () => {
    navegador("/dashboard");
    expect(
      manejarPagoRequerido(402, "company_payment_required", "Pausada", {
        silencioso: true,
      }),
    ).toBe(true);
    expect(avisos).toEqual([]);
    expect(saltos).toEqual([]);
  });

  it("otros códigos no son suyos", () => {
    navegador("/dashboard");
    expect(manejarPagoRequerido(402, "subscription_required", "x")).toBe(false);
    expect(manejarPagoRequerido(403, "company_payment_required", "x")).toBe(
      false,
    );
  });
});
