import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MARCA_DE_PLATAFORMA,
  MARCA_NEUTRA,
  REINTENTOS_DE_MARCA_MS,
  esMarcaNeutra,
  pedirContexto,
  puedeUsarArteDePlataforma,
  respaldoSinRed,
} from "./WhiteLabelContext";

/**
 * ENTEC, 2026-10-30: «cuando se presenta algún error, durante unos segundos
 * aparece el nombre y logotipo de CGUARDPRO». A deploy or a restart answered
 * 502 for a few seconds and two fallbacks painted our brand on their domain.
 */

const IE = fs.readFileSync(path.resolve(__dirname, "./IdentidadEfectiva.tsx"), "utf8");
const WL = fs.readFileSync(path.resolve(__dirname, "./WhiteLabelContext.tsx"), "utf8");

const conVeredicto = (ours: boolean) => vi.stubGlobal("window", {
  __cgMarca: { ours, cached: null, request: null },
  location: { hostname: ours ? "app.cguardpro.com" : "portal.socio.test", search: "", protocol: "https:" },
});

afterEach(() => vi.unstubAllGlobals());

describe("the neutral identity", () => {
  it("names nobody and carries none of our art", () => {
    expect(MARCA_NEUTRA.platformName).toBe("");
    expect(MARCA_NEUTRA.showPlatformAttribution).toBe(false);
    expect(MARCA_NEUTRA.logoUrl).toBeNull();
    expect(puedeUsarArteDePlataforma(MARCA_NEUTRA)).toBe(false);
    expect(esMarcaNeutra(MARCA_NEUTRA)).toBe(true);
  });

  it("is told apart from a real partner and from the platform", () => {
    expect(esMarcaNeutra(MARCA_DE_PLATAFORMA)).toBe(false);
    expect(esMarcaNeutra({ scope: "reseller", resellerPublicId: "RSL-AAAA" })).toBe(false);
  });
});

describe("no network on a partner's host", () => {
  it("with nothing saved → neutral, never CGuard Pro", () => {
    conVeredicto(false);
    expect(respaldoSinRed()).toEqual(MARCA_NEUTRA);
  });

  it("on our own host → still ours", () => {
    conVeredicto(true);
    expect(respaldoSinRed()).toEqual(MARCA_DE_PLATAFORMA);
  });

  it("a 502 during a deploy is neutral on a partner's host", async () => {
    conVeredicto(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    const r = await pedirContexto();
    expect(r.degradado).toBe(true);
    expect(r.ctx).toEqual(MARCA_NEUTRA);
  });
});

describe("the session layer", () => {
  it("a session whose company could not be read is neutral, not ours", () => {
    expect(IE).toMatch(/const empresa = empresaActiva\(user, tenantId\);\s*if \(!empresa\) return MARCA_NEUTRA;/);
  });

  it("a partner's host that fell back to neutral is not turned into ours", () => {
    expect(IE).toMatch(/esMarcaNeutra\(anfitrion\) \? MARCA_NEUTRA : MARCA_DE_PLATAFORMA/);
  });
});

describe("the brand comes back by itself", () => {
  it("the provider retries while degraded, and when the network returns", () => {
    expect(REINTENTOS_DE_MARCA_MS.length).toBeGreaterThan(0);
    expect(WL).toMatch(/reloj = setTimeout\(\(\) => \{ void leer\(\); \}, espera\)/);
    expect(WL).toMatch(/addEventListener\("online", alVolverLaRed\)/);
  });
});
