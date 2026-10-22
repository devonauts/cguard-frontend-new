import { beforeEach, describe, expect, it } from "vitest";

import { cabeceraDeSucursal, elegirSucursal, sucursalElegida } from "./sucursalElegida";

/**
 * La sucursal elegida en la barra viaja como `x-cguard-branch`. Es POR
 * EMPRESA: cambiar de empresa no puede arrastrar la sucursal de la otra.
 */
// Las pruebas corren sin navegador: un almacenamiento en memoria basta.
const memoria = new Map<string, string>();

(globalThis as any).localStorage = {
  getItem: (k: string) => (memoria.has(k) ? memoria.get(k)! : null),
  setItem: (k: string, v: string) => void memoria.set(k, String(v)),
  removeItem: (k: string) => void memoria.delete(k),
  clear: () => memoria.clear(),
};

describe("sucursal elegida en la barra", () => {
  beforeEach(() => localStorage.clear());

  it("sin elegir, no manda cabecera", () => {
    localStorage.setItem("tenantId", "t1");
    expect(cabeceraDeSucursal()).toEqual({});
  });

  it("elegida, viaja en la cabecera; «todas» la quita", () => {
    localStorage.setItem("tenantId", "t1");
    elegirSucursal("b-norte");
    expect(cabeceraDeSucursal()).toEqual({ "x-cguard-branch": "b-norte" });
    elegirSucursal(null);
    expect(sucursalElegida()).toBeNull();
  });

  it("es por empresa", () => {
    localStorage.setItem("tenantId", "t1");
    elegirSucursal("b-norte");
    localStorage.setItem("tenantId", "t2");
    expect(sucursalElegida()).toBeNull();
  });
});

describe("el espacio de trabajo (Sucursales 2.0, fase 2)", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("tenantId", "t1");
  });

  it("sin sucursal elegida, el espacio es la vista global", async () => {
    const { espacioActual } = await import("./sucursalElegida");

    expect(espacioActual()).toBe("global");
    elegirSucursal("b-gye");
    expect(espacioActual()).toBe("b-gye");
  });

  it("el inicio de sesión marca que hay que preguntar, y preguntar lo desmarca", async () => {
    const m = await import("./sucursalElegida");

    expect(m.hayQuePreguntarElEspacio()).toBe(false);
    m.marcarQueHayQuePreguntarElEspacio();
    expect(m.hayQuePreguntarElEspacio()).toBe(true);
    m.yaSePreguntoElEspacio();
    expect(m.hayQuePreguntarElEspacio()).toBe(false);
  });
});
