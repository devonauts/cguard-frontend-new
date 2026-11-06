import { describe, it, expect, vi } from "vitest";

import { crearContador, SKU_MAPA } from "./consumoGoogle";

const T = "11111111-1111-1111-1111-111111111111";

function dobles(over: Record<string, any> = {}) {
  const fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ guardadas: 1, pase: "PASE" }),
  }));
  const beacon = vi.fn(() => true);

  return {
    fetch,
    beacon,
    deps: {
      fetch: fetch as any,
      beacon,
      token: () => "TOKEN",
      tenantId: () => T,
      base: () => "https://api.x/api/",
      keepaliveDisponible: () => true,
      ...over,
    },
  };
}

describe("contador del consumo de Google", () => {
  it("junta por (sku, área): cargas y reutilizaciones", () => {
    const c = crearContador(dobles().deps);

    c.anotar(SKU_MAPA, "trail", 1, 0);
    c.anotar(SKU_MAPA, "trail", 0, 1);
    c.anotar(SKU_MAPA, "TRAIL", 1, 0);
    c.anotar("geocoding", "incident", 1, 0);
    expect(c.pendientes()).toEqual([
      { sku: SKU_MAPA, area: "trail", count: 2, reused: 1 },
      { sku: "geocoding", area: "incident", count: 1, reused: 0 },
    ]);
  });

  it("sin área es «otro»; sin sku no se apunta", () => {
    const c = crearContador(dobles().deps);

    c.anotar(SKU_MAPA, undefined as any, 1, 0);
    c.anotar(undefined as any, "x", 1, 0);
    expect(c.pendientes()).toEqual([
      { sku: SKU_MAPA, area: "otro", count: 1, reused: 0 },
    ]);
  });

  it("acota los pares distintos (no crece sin fin)", () => {
    const c = crearContador(dobles().deps);

    for (let i = 0; i < 200; i++) c.anotar("geocoding", `a${i}`, 1, 0);
    expect(c.pendientes().length).toBe(50);
  });

  it("envía con keepalive y la sesión, vacía lo pendiente y guarda el pase", async () => {
    const d = dobles();
    const c = crearContador(d.deps);

    c.anotar(SKU_MAPA, "trail", 1, 0);
    c.enviar(false);
    expect(c.pendientes()).toEqual([]);
    expect(d.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (d.fetch.mock.calls[0] as any[]) || [];

    expect(url).toBe(`https://api.x/api/tenant/${T}/consumo-google`);
    expect(init.keepalive).toBe(true);
    expect(init.headers.Authorization).toBe("Bearer TOKEN");
    expect(JSON.parse(init.body)).toEqual({
      app: "crm",
      items: [{ sku: SKU_MAPA, area: "trail", count: 1, reused: 0 }],
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(c.pase()).toBe("PASE");
  });

  it("nada pendiente = ningún envío", () => {
    const d = dobles();

    crearContador(d.deps).enviar(true);
    expect(d.fetch).not.toHaveBeenCalled();
    expect(d.beacon).not.toHaveBeenCalled();
  });

  it("sin keepalive, al cerrar usa la baliza con el pase (nunca con el token)", async () => {
    let keepalive = true;
    const d = dobles({ keepaliveDisponible: () => keepalive });
    const c = crearContador(d.deps);

    c.anotar("geocoding", "a", 1, 0);
    c.enviar(false);
    await new Promise((r) => setTimeout(r, 0));
    keepalive = false;
    c.anotar("geocoding", "a", 1, 0);
    c.enviar(true);
    expect(d.beacon).toHaveBeenCalledTimes(1);
    const [url, blob] = d.beacon.mock.calls[0] as any[];

    expect(url).toBe("https://api.x/api/consumo-google/baliza");
    const cuerpo = JSON.parse(await (blob as Blob).text());

    expect(cuerpo.pase).toBe("PASE");
    expect(JSON.stringify(cuerpo)).not.toContain("TOKEN");
  });

  it("un fallo de red no lanza ni reintenta (se pierde ese minuto)", async () => {
    const d = dobles({
      fetch: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    const c = crearContador(d.deps);

    c.anotar("geocoding", "a", 1, 0);
    expect(() => c.enviar(false)).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(c.pendientes()).toEqual([]);
  });

  it("sin empresa no se manda nada", () => {
    const d = dobles({ tenantId: () => null });
    const c = crearContador(d.deps);

    c.anotar("geocoding", "a", 1, 0);
    c.enviar(false);
    expect(d.fetch).not.toHaveBeenCalled();
  });
});

describe("contador del consumo de Google · sesión rechazada", () => {
  it("tras un 401 no vuelve a enviar con ese token; con un token nuevo sí", async () => {
    let token = "VIEJO";
    const fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    const c = crearContador(dobles({ fetch, token: () => token }).deps);

    c.anotar(SKU_MAPA, "mapa", 1, 0);
    c.enviar(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(fetch).toHaveBeenCalledTimes(1);

    // Pestaña oculta con un mapa vivo: sigue anotando cada minuto.
    for (let i = 0; i < 5; i++) {
      c.anotar(SKU_MAPA, "mapa", 0, 1);
      c.enviar(false);
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(c.pendientes()).toEqual([]);

    // Vuelve a entrar: token nuevo, se envía otra vez.
    token = "NUEVO";
    c.anotar(SKU_MAPA, "mapa", 1, 0);
    c.enviar(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("otros errores (500, red) no bloquean el token", async () => {
    const fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    const c = crearContador(dobles({ fetch }).deps);

    for (let i = 0; i < 3; i++) {
      c.anotar(SKU_MAPA, "mapa", 1, 0);
      c.enviar(false);
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
