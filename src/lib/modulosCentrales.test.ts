import { afterEach, describe, expect, it, vi } from "vitest";

import menu from "../data/sidebar-menu.json";

import {
  ADDON_REQUIRED_EVENT,
  addonKeyOfRefusal,
  announceAddonRequired,
} from "./addonRequired";
import { MODULE_KEYS } from "./entitlements";

/**
 * Monitoring Center and Video Surveillance are paid modules, but the
 * Emergency Center (panic buttons, SOS and their cases) is for every company.
 */
const item = (id: string) => (menu as any[]).find((i) => i.id === id);

describe("center modules · side menu", () => {
  it("the Monitoring Center group needs monitoring_center", () => {
    expect(item("monitoreo-alarmas")?.modulo).toBe("monitoring_center");
  });

  it("the Video Surveillance group needs video_surveillance", () => {
    expect(item("videovigilancia")?.modulo).toBe("video_surveillance");
  });

  it("the Emergency Center never needs a module", () => {
    const e = item("emergencias");

    expect(e?.path).toBe("/alarm/queue");
    expect(e?.modulo).toBeUndefined();
  });

  it("every modulo in the menu is a known module key", () => {
    for (const i of menu as any[]) {
      for (const e of [i, ...(i.subItems ?? [])]) {
        if (e.modulo !== undefined) expect(MODULE_KEYS).toContain(e.modulo);
      }
    }
  });
});

describe("center modules · 402 addon_required", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the module key only from a 402 addon_required", () => {
    expect(
      addonKeyOfRefusal(402, {
        code: "addon_required",
        addonKey: "video_surveillance",
      }),
    ).toBe("video_surveillance");
    expect(
      addonKeyOfRefusal(402, { code: "subscription_required" }),
    ).toBeNull();
    expect(
      addonKeyOfRefusal(403, { code: "addon_required", addonKey: "x" }),
    ).toBeNull();
    expect(addonKeyOfRefusal(402, null)).toBeNull();
    expect(addonKeyOfRefusal(402, "Payment required")).toBeNull();
  });

  it("announces the refused module to the open screens", () => {
    const seen: string[] = [];
    const on = (ev: Event) => seen.push((ev as CustomEvent).detail.addonKey);

    // Tests run in node: a bare EventTarget stands in for the browser window.
    vi.stubGlobal("window", new EventTarget());
    window.addEventListener(ADDON_REQUIRED_EVENT, on);
    announceAddonRequired(402, {
      code: "addon_required",
      addonKey: "monitoring_center",
    });
    announceAddonRequired(402, { code: "payment_past_due" });
    window.removeEventListener(ADDON_REQUIRED_EVENT, on);

    expect(seen).toEqual(["monitoring_center"]);
  });
});
