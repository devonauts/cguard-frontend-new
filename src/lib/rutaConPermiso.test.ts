import { describe, expect, it } from "vitest";

import { puedeVerLaRuta } from "./rutaConPermiso";

describe("RutaConPermiso · the menu's gate for a page opened by URL", () => {
  const p = ["attendanceRead"];

  it("without the permission the page is not mounted", () => {
    expect(puedeVerLaRuta({ user: { id: "u" }, loading: false, hasAny: () => false }, p)).toBe(false);
  });

  it("with the permission, or as superadmin, it is", () => {
    expect(puedeVerLaRuta({ user: { id: "u" }, hasAny: (x) => x.includes("attendanceRead") }, p)).toBe(true);
    expect(puedeVerLaRuta({ user: { id: "u", isSuperadmin: true }, hasAny: () => false }, p)).toBe(true);
  });

  it("while the session loads it does not decide", () => {
    expect(puedeVerLaRuta({ user: null, loading: true, hasAny: () => false }, p)).toBe(true);
  });
});
