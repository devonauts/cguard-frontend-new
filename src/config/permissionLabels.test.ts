import { afterAll, describe, expect, it } from "vitest";

import i18n from "../i18n";

import { formatPermissionLabel, getResourceLabel } from "./permissionLabels";
import { groupPermissions } from "./permissions";

/**
 * The role editor showed raw ids («assistantUse», «Ver performanceSettings»,
 * «Agregar invoice», group «billing»). QA re-test 2026-11-01, N5.
 */
const RAW = [
  "assistantUse",
  "routeDispatch",
  "routeOverrideGeofence",
  "coverageTransfer",
  "estimateConvert",
  "estimateDownload",
  "performanceSettingsRead",
  "routeExecutionRead",
  "routeTemplateRead",
  "coverageRead",
  "invoiceCreate",
  "estimateSend",
  "billingRead",
  "taxEdit",
  "planRead",
  "tenantEdit",
];

afterAll(async () => {
  await i18n.changeLanguage("es");
});

describe("permission labels", () => {
  it("no raw id is left in Spanish", () => {
    for (const p of RAW) {
      const label = formatPermissionLabel(p);

      expect(label).not.toBe(p);
      expect(label).not.toMatch(/[a-z][A-Z]|invoice|estimate|billing|tax\b/);
    }
    expect(formatPermissionLabel("estimateRead")).toBe("Ver Cotizaciones");
    expect(formatPermissionLabel("assistantUse")).toBe("Usar el asistente de IA");
    expect(getResourceLabel("billing")).toBe("Facturación de la cuenta");
  });

  it("dispatch tickets are not a second «Incidentes» group", () => {
    expect(getResourceLabel("dispatch")).not.toBe(getResourceLabel("incident"));
    expect(formatPermissionLabel("dispatchRead")).not.toBe(formatPermissionLabel("incidentRead"));
  });

  it("odd permissions join their resource's group", () => {
    const g = groupPermissions(["estimateConvert", "estimateRead", "coverageTransfer", "assistantUse", "routeDispatch"]);

    expect(Object.keys(g).sort()).toEqual(["assistant", "coverage", "estimate", "route"]);
  });

  it("German does not mix English action words into a German resource", async () => {
    await i18n.changeLanguage("de");
    expect(formatPermissionLabel("invoiceRead")).toBe("Ansehen: Kundenrechnungen");
    expect(formatPermissionLabel("assistantUse")).toBe("Den KI-Assistenten nutzen");
    expect(getResourceLabel("tax")).toBe("Steuern");
  });
});
