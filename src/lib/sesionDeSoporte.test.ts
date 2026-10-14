import { describe, expect, it } from "vitest";

import es from "../locales/es.json";
import en from "../locales/en.json";
import {
  esSoporteDeLaPlataforma,
  esSoportePlataformaPorSocio,
  type SesionDeSoporte,
} from "./sesionDeSoporte";

/**
 * Platform support that enters a company's CRM through the partner panel acts
 * as the partner's admin, but the bar must say «CGuard Pro support», not
 * «<partner> support» (owner decision 2026-10-14).
 */
const base: SesionDeSoporte = {
  resellerName: "Andina Seguridad",
  tenantName: "Norte",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

describe("support session · who is really inside", () => {
  it("a partner pass opened by platform support is platform support", () => {
    expect(esSoportePlataformaPorSocio({ ...base, soportePlataforma: true })).toBe(true);
  });

  it("the partner's own support is not", () => {
    expect(esSoportePlataformaPorSocio(base)).toBe(false);
    expect(esSoportePlataformaPorSocio(null)).toBe(false);
  });

  it("the SuperAdmin frame keeps its own rule", () => {
    expect(esSoporteDeLaPlataforma({ ...base, nombreDelSoporte: "Andina Seguridad" })).toBe(true);
    expect(esSoporteDeLaPlataforma({ ...base, soportePlataforma: true })).toBe(false);
  });

  it("the bar text names the platform through a placeholder, never hard-coded", () => {
    for (const cat of [es, en] as any[]) {
      const s = cat.soporte.barraPlataformaPorSocio as string;

      expect(s).toContain("{{plataforma}}");
      expect(s).toContain("{{socio}}");
      expect(s).not.toMatch(/CGuard/i);
    }
  });
});
