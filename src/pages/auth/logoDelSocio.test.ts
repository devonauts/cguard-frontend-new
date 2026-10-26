import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A partner's logo on the sign-in screens must not be capped at a small fixed
 * size. It was 40 px tall (h-10, at most 200 px wide), so a wide logo such as
 * ENTEC's (512x102) showed as a thin strip, and the partner could not make it
 * bigger from Brand (ticket 80f60511, 2026-10-24).
 */
const read = (rel: string) =>
  fs.readFileSync(path.resolve(__dirname, rel), "utf8");

/** Pixel height of a Tailwind height class: h-10 -> 40, h-[88px] -> 88. */
function heightPx(cls: string): number {
  const arbitrary = /^h-\[(\d+)px\]$/.exec(cls);
  if (arbitrary) return Number(arbitrary[1]);
  const scale = /^h-(\d+)$/.exec(cls);
  return scale ? Number(scale[1]) * 4 : 0;
}

function logoClasses(source: string, anchor: RegExp): string[] {
  const i = source.search(anchor);
  expect(i, "logo <img> not found").toBeGreaterThan(-1);
  const m = /className="([^"]+)"/.exec(source.slice(i, i + 400));
  expect(m, "logo className not found").not.toBeNull();
  return m![1].split(/\s+/);
}

describe("partner logo size on the sign-in screens", () => {
  const cases: Array<[string, string, RegExp]> = [
    ["sign-in (Boveda)", "./Boveda.tsx", /\{marca\.logo \? \(\s*<img/],
    ["invitation / reset (AuthShell)", "./AuthShell.tsx", /\{logoUrl \? \(\s*<img/],
    ["loading screen", "../../components/ProtectedRoute.tsx", /\{tenantLogo && \(\s*<img/],
  ];

  for (const [name, file, anchor] of cases) {
    it(`${name}: at least 64 px tall, width follows the logo`, () => {
      const classes = logoClasses(read(file), anchor);
      const heights = classes
        .filter((c) => /^(sm:)?h-/.test(c))
        .map((c) => heightPx(c.replace(/^sm:/, "")));
      expect(heights.length).toBeGreaterThan(0);
      expect(Math.min(...heights)).toBeGreaterThanOrEqual(64);
      expect(classes).toContain("w-auto");
      expect(classes).toContain("object-contain");
      expect(classes.some((c) => /^max-w-\[min\(\d{3}px,85vw\)\]$/.test(c))).toBe(true);
    });
  }
});
