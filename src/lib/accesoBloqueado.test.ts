import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «ACCESO BLOQUEADO» — el empujón del socket y el 401 con código
 *
 * Lo que se fija:
 *   1. `session:blocked` cierra la sesión con el cierre NORMAL registrado por
 *      `AuthProvider` y termina en /acceso-bloqueado, con la referencia que
 *      mandó el servidor.
 *   2. Sin proveedor, lo mínimo: quita el token y navega.
 *   3. Una sola vez aunque el aviso y el 401 lleguen juntos.
 *   4. El hook del socket escucha `session:blocked` con ESTE manejador, y el
 *      cliente de API manda el 401 `auth.accessBlocked` aquí, no al login.
 *
 * Sin jsdom (como sus vecinas): `localStorage` y `window` son dobles mínimos.
 * ════════════════════════════════════════════════════════════════════════════
 */

let mod: typeof import("./accesoBloqueado");
let almacen: Map<string, string>;
let navegaciones: string[];

beforeEach(async () => {
  almacen = new Map([["authToken", "tok"], ["authUserCache", "{}"]]);
  navegaciones = [];
  (globalThis as any).localStorage = {
    getItem: (k: string) => (almacen.has(k) ? almacen.get(k)! : null),
    setItem: (k: string, v: string) => void almacen.set(k, String(v)),
    removeItem: (k: string) => void almacen.delete(k),
    clear: () => almacen.clear(),
  };
  (globalThis as any).window = { location: { replace: (u: string) => navegaciones.push(u) } };
  mod = await import("./accesoBloqueado");
  mod._reiniciarParaPruebas();
});

afterEach(() => {
  delete (globalThis as any).window;
});

describe("session:blocked", () => {
  it("1. cierra con el cierre normal y va a /acceso-bloqueado con la referencia", async () => {
    const cierre = vi.fn(async () => {});

    mod.registrarCierreDeSesion(cierre);
    await mod.alRecibirSesionBloqueada({ codigo: "bloqueado", referencia: "ABC-7K9" });

    expect(cierre).toHaveBeenCalledTimes(1);
    const destino = new URL(cierre.mock.calls[0][0] as string, "https://x.test");

    expect(destino.pathname).toBe("/acceso-bloqueado");
    expect(destino.searchParams.get("ref")).toBe("ABC-7K9");
    expect(destino.searchParams.get("motivo")).toBeNull();
    expect(Number(destino.searchParams.get("en"))).toBeGreaterThan(0);
    // El cierre registrado es quien borra; aquí no se navegó por otro lado.
    expect(navegaciones).toEqual([]);
  });

  it("una expulsión sin bloqueo lleva a la variante «sesión cerrada»", async () => {
    const cierre = vi.fn(async () => {});

    mod.registrarCierreDeSesion(cierre);
    await mod.alRecibirSesionBloqueada({ codigo: "actividad_sospechosa" });
    expect(String(cierre.mock.calls[0][0])).toContain("motivo=sesion");
  });

  it("2. sin proveedor: quita el token y navega igual", async () => {
    await mod.alRecibirSesionBloqueada({ codigo: "bloqueado" });
    expect(almacen.has("authToken")).toBe(false);
    expect(almacen.has("authUserCache")).toBe(false);
    expect(navegaciones).toHaveLength(1);
    expect(navegaciones[0].startsWith("/acceso-bloqueado?")).toBe(true);
  });

  it("3. una sola vez aunque lleguen el aviso y el 401 a la vez", async () => {
    const cierre = vi.fn(async () => {});

    mod.registrarCierreDeSesion(cierre);
    await Promise.all([
      mod.alRecibirSesionBloqueada({ codigo: "bloqueado" }),
      mod.sacarDeLaSesion({ motivo: "bloqueo" }),
    ]);
    expect(cierre).toHaveBeenCalledTimes(1);
  });

  it("una referencia con otra forma no se pinta (no se refleja lo que llegue)", () => {
    expect(mod.referenciaValida("<script>")).toBeNull();
    expect(mod.referenciaValida("abc-7k9")).toBe("ABC-7K9");
    expect(mod.nuevaReferencia()).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
  });

  it("esAccesoBloqueado mira el código, no el texto", () => {
    expect(mod.esAccesoBloqueado({ messageCode: "auth.accessBlocked" })).toBe(true);
    expect(mod.esAccesoBloqueado({ message: "auth.accessBlocked" })).toBe(false);
    expect(mod.esAccesoBloqueado(null)).toBe(false);
  });
});

describe("4. el cableado", () => {
  const leer = (r: string) => fs.readFileSync(path.resolve(__dirname, "..", r), "utf8");

  it("el hook del socket escucha session:blocked con este manejador", () => {
    const src = leer("hooks/useNotificationStream.ts");

    expect(src).toMatch(/socket\.on\(\s*"session:blocked"/);
    expect(src).toContain("alRecibirSesionBloqueada(");
  });

  it("el cliente de API manda el 401 auth.accessBlocked a la página, no al login", () => {
    const src = leer("services/api/apiService.ts");

    expect(src).toContain("esAccesoBloqueado(data)");
    expect(src).toContain('sacarDeLaSesion({ motivo: "bloqueo" })');
  });

  it("AuthProvider registra su signOut sin avisar al servidor", () => {
    const src = leer("contexts/AuthContext.tsx");

    expect(src).toContain("registrarCierreDeSesion(");
    expect(src).toMatch(/avisarAlServidor:\s*false/);
  });
});
