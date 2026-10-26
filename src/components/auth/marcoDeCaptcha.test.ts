import { describe, expect, it } from "vitest";

import {
  leerMensajeDelMarco,
  urlDelMarco,
  usarMarcoDeCaptcha,
} from "./marcoDeCaptcha";

describe("usarMarcoDeCaptcha", () => {
  it("our own domain renders the widget directly", () => {
    for (const h of [
      "cguardpro.com",
      "app.cguardpro.com",
      "andina.cguardpro.com",
      "APP.CGUARDPRO.COM.",
    ])
      expect(usarMarcoDeCaptcha(h, false)).toBe(false);
  });

  it("dev and test hosts render it directly", () => {
    expect(usarMarcoDeCaptcha("admin.empresa.com", true)).toBe(false);
    for (const h of [
      "localhost",
      "crm.localhost",
      "127.0.0.1",
      "192.168.86.48",
      "10.0.0.5",
      "172.20.1.1",
      "[::1]",
    ])
      expect(usarMarcoDeCaptcha(h, false)).toBe(false);
  });

  it("a partner's own domain uses the frame", () => {
    for (const h of [
      "admin.empresa.com",
      "partners.mainconnector.com",
      "cguardpro.com.evil.io",
      "notcguardpro.com",
      "8.8.8.8",
      "172.32.0.1",
    ])
      expect(usarMarcoDeCaptcha(h, false)).toBe(true);
  });
});

describe("urlDelMarco", () => {
  it("carries origin, action, language and theme", () => {
    const u = new URL(
      urlDelMarco({
        origen: "https://admin.empresa.com",
        accion: "login",
        idioma: "de",
        tema: "dark",
      }),
    );

    expect(u.origin + u.pathname).toBe(
      "https://app.cguardpro.com/captcha-marco",
    );
    expect(u.searchParams.get("origen")).toBe("https://admin.empresa.com");
    expect(u.searchParams.get("accion")).toBe("login");
    expect(u.searchParams.get("idioma")).toBe("de");
    expect(u.searchParams.get("tema")).toBe("dark");
  });

  it("honours another base", () => {
    expect(
      urlDelMarco({
        base: "http://192.168.86.48:5290/captcha-marco",
        origen: "x",
      }),
    ).toMatch(
      /^http:\/\/192\.168\.86\.48:5290\/captcha-marco\?origen=x&tema=auto$/,
    );
  });
});

describe("leerMensajeDelMarco", () => {
  const ventana = {};
  const ORIGEN = "https://app.cguardpro.com";
  const msg = (data: unknown, origin = ORIGEN, source: unknown = ventana) => ({
    origin,
    source,
    data,
  });

  it("accepts the frame's messages", () => {
    expect(
      leerMensajeDelMarco(
        msg({ fuente: "cg-captcha", tipo: "token", token: "abc" }),
        ORIGEN,
        ventana,
      ),
    ).toEqual({ tipo: "token", token: "abc" });
    expect(
      leerMensajeDelMarco(
        msg({ fuente: "cg-captcha", tipo: "expirado" }),
        ORIGEN,
        ventana,
      ),
    ).toEqual({ tipo: "expirado" });
    expect(
      leerMensajeDelMarco(
        msg({ fuente: "cg-captcha", tipo: "error", codigo: "carga" }),
        ORIGEN,
        ventana,
      ),
    ).toEqual({ tipo: "error", codigo: "carga" });
    expect(
      leerMensajeDelMarco(
        msg({ fuente: "cg-captcha", tipo: "alto", alto: 5000 }),
        ORIGEN,
        ventana,
      ),
    ).toEqual({ tipo: "alto", alto: 600 });
  });

  it("ignores another origin, another window, or someone else's message", () => {
    const data = { fuente: "cg-captcha", tipo: "token", token: "abc" };

    expect(
      leerMensajeDelMarco(msg(data, "https://evil.io"), ORIGEN, ventana),
    ).toBeNull();
    expect(
      leerMensajeDelMarco(msg(data, ORIGEN, {}), ORIGEN, ventana),
    ).toBeNull();
    expect(leerMensajeDelMarco(msg(data), ORIGEN, null)).toBeNull();
    expect(
      leerMensajeDelMarco(msg({ ...data, fuente: "otro" }), ORIGEN, ventana),
    ).toBeNull();
    expect(
      leerMensajeDelMarco(
        msg({ fuente: "cg-captcha", tipo: "token", token: "" }),
        ORIGEN,
        ventana,
      ),
    ).toBeNull();
    expect(leerMensajeDelMarco(msg("cg-captcha"), ORIGEN, ventana)).toBeNull();
  });
});
