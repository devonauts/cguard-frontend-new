import { afterEach, describe, expect, it, vi } from "vitest";
import { esAnfitrionDePlataforma, resolveApiBase } from "./apiBase";

const API = "https://api.cguardpro.com/api";

describe("which hosts keep our API and which go same-origin", () => {
  it("our planes and development keep the configured API", () => {
    for (const h of [
      "app.cguardpro.com",
      "cguardpro.com",
      "localhost",
      "uniformar.localhost",
    ]) {
      expect(esAnfitrionDePlataforma(h, API)).toBe(true);
    }
  });
  it("partner subdomains and custom domains go same-origin", () => {
    for (const h of ["demo-x.cguardpro.com", "admin.vanderbluedesign.com"]) {
      expect(esAnfitrionDePlataforma(h, API)).toBe(false);
    }
  });
  it("with the API on the neutral domain, our planes are still ours", () => {
    const NEUTRA = "https://api.mainconnector.com/api";

    expect(esAnfitrionDePlataforma("app.cguardpro.com", NEUTRA)).toBe(true);
    expect(esAnfitrionDePlataforma("demo-x.cguardpro.com", NEUTRA)).toBe(false);
    expect(esAnfitrionDePlataforma("admin.vanderbluedesign.com", NEUTRA)).toBe(
      false,
    );
  });
  it("a relative base is already same-origin", () => {
    expect(esAnfitrionDePlataforma("admin.vanderbluedesign.com", "/api")).toBe(
      true,
    );
  });
});

describe("a bundle without VITE_API_URL still reaches the API", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const en = (hostname: string) =>
    vi.stubGlobal("window", {
      location: { protocol: "https:", hostname, origin: `https://${hostname}` },
    });

  it("falls back to same-origin /api on our planes (the 2026-10-19 outage)", () => {
    vi.stubEnv("VITE_API_URL", "");
    en("app.cguardpro.com");
    expect(resolveApiBase()).toBe("https://app.cguardpro.com/api");
  });
  it("and on a partner domain", () => {
    vi.stubEnv("VITE_API_URL", "");
    en("portal.entecdigital.mx");
    expect(resolveApiBase()).toBe("https://portal.entecdigital.mx/api");
  });
  it("keeps the configured API on our planes when there is one", () => {
    vi.stubEnv("VITE_API_URL", "https://api.mainconnector.com/api");
    en("app.cguardpro.com");
    expect(resolveApiBase()).toBe("https://api.mainconnector.com/api");
    en("portal.entecdigital.mx");
    expect(resolveApiBase()).toBe("https://portal.entecdigital.mx/api");
  });
});
