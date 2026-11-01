import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  MAX_TRASPASOS,
  VENTANA_TRASPASOS_MS,
  destinoSeguro,
  entregarAlEscritorio,
  guardarDestino,
  olvidarSesionLocal,
  puedoTraspasar,
  tomarDestino,
  type Almacen,
} from "./traspaso";

const almacen = (): Almacen & { datos: Map<string, string> } => {
  const datos = new Map<string, string>();

  return {
    datos,
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => void datos.set(k, v),
    removeItem: (k) => void datos.delete(k),
  };
};

describe("traspaso a la sesión del código", () => {
  it("sólo acepta destinos del mismo origen y del CRM", () => {
    expect(destinoSeguro("/clients/7?tab=a#b")).toBe("/clients/7?tab=a#b");
    expect(destinoSeguro("//evil.example/x")).toBeNull();
    expect(destinoSeguro("/\\evil.example")).toBeNull();
    expect(destinoSeguro("https://evil.example")).toBeNull();
    expect(destinoSeguro("/p/assets/x.js")).toBeNull();
    expect(destinoSeguro("/p")).toBeNull();
    expect(destinoSeguro("/__sesion")).toBeNull();
    expect(destinoSeguro(null)).toBeNull();
    expect(destinoSeguro("/payroll")).toBe("/payroll");
  });

  it("el destino guardado se consume al leerlo", () => {
    const a = almacen();

    guardarDestino("/clients", a);
    expect(tomarDestino(a)).toBe("/clients");
    expect(tomarDestino(a)).toBeNull();
    guardarDestino("//evil", a);
    expect(tomarDestino(a)).toBeNull();
  });

  it("corta el bucle al tercer traspaso dentro de la ventana", () => {
    const a = almacen();
    const t0 = 1_000_000;

    for (let i = 0; i < MAX_TRASPASOS; i += 1)
      expect(puedoTraspasar(a, t0 + i)).toBe(true);
    expect(puedoTraspasar(a, t0 + 10)).toBe(false);
    // Pasada la ventana, vuelve a dejar.
    expect(puedoTraspasar(a, t0 + VENTANA_TRASPASOS_MS + 100)).toBe(true);
  });

  it("publico.html es el index.html del CRM con otro punto de entrada", () => {
    const raiz = resolve(__dirname, "../..");
    const index = readFileSync(resolve(raiz, "index.html"), "utf8");
    const publico = readFileSync(resolve(raiz, "publico.html"), "utf8");

    expect(publico).toBe(
      index.replace('src="/src/main.tsx"', 'src="/src/publico/main.tsx"'),
    );
  });
});

describe("traspaso en la app de escritorio", () => {
  it("entrega el token al escritorio (signedIn) y lo quita de esta página", async () => {
    const a = almacen();

    a.setItem("authToken", "tok-pending");
    a.setItem("authUserCache", "{}");
    const entregar = vi.fn(async () => true);

    expect(await entregarAlEscritorio(a, entregar)).toBe(true);
    expect(entregar).toHaveBeenCalledWith("tok-pending");
    expect(a.datos.has("authToken")).toBe(false);
    expect(a.datos.has("authUserCache")).toBe(false);
  });

  it("si el escritorio lo rechaza, el token se queda (para reintentar) y avisa", async () => {
    const a = almacen();

    a.setItem("authToken", "tok-x");
    expect(await entregarAlEscritorio(a, async () => false)).toBe(false);
    expect(a.getItem("authToken")).toBe("tok-x");
  });

  it("sin token no entrega nada", async () => {
    const entregar = vi.fn(async () => true);

    expect(await entregarAlEscritorio(almacen(), entregar)).toBe(false);
    expect(entregar).not.toHaveBeenCalled();
  });

  it("olvidarSesionLocal borra sólo las claves de sesión", () => {
    const a = almacen();

    a.setItem("authToken", "t");
    a.setItem("app_language", "es");
    olvidarSesionLocal(a);
    expect([...a.datos.keys()]).toEqual(["app_language"]);
  });

  it("el traspaso usa el escritorio ANTES de la cookie, y la mini-app olvida tokens heredados", () => {
    const raiz = resolve(__dirname, "../..");
    const traspaso = readFileSync(
      resolve(raiz, "src/publico/Traspaso.tsx"),
      "utf8",
    );
    const main = readFileSync(resolve(raiz, "src/publico/main.tsx"), "utf8");
    const escritorio = traspaso.indexOf("if (isDesktop())");
    const cookie = traspaso.indexOf("await abrirSesionDeCodigoConMotivo()");

    expect(escritorio).toBeGreaterThan(0);
    expect(cookie).toBeGreaterThan(escritorio);
    expect(traspaso.slice(escritorio, cookie)).toContain(
      "entregarAlEscritorio(localStorage)",
    );
    expect(main).toMatch(
      /if \(isDesktop\(\)\) olvidarSesionLocal\(localStorage\)/,
    );
  });
});
