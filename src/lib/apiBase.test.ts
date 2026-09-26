import { describe, expect, it } from "vitest";
import { esAnfitrionDePlataforma } from "./apiBase";

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
