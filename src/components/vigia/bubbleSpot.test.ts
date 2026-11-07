import { describe, expect, it } from "vitest";

import {
  canBeHiddenBy,
  liftClearOf,
  overlaps,
  pointerNear,
  STEP_GAP,
  type Box,
} from "./bubbleSpot";

// The bubble at 1440×900: 74×83, bottom-right.
const BUBBLE: Box = { left: 1338, right: 1412, top: 741, bottom: 824 };
const VIEWPORT_H = 900;

/** Controls that `liftClearOf` sees: the ones that overlap the probe box. */
const under = (controls: Box[]) => (box: Box) =>
  controls.filter((c) => overlaps(box, c));
const btn = (top: number, h = 34, left = 1370, w = 32): Box => ({
  left,
  right: left + w,
  top,
  bottom: top + h,
});

describe("liftClearOf", () => {
  it("stays put when nothing is under the bubble", () => {
    expect(liftClearOf(BUBBLE, under([btn(300)]), VIEWPORT_H)).toBe(0);
  });

  it("lifts just above a single control", () => {
    const save = btn(780, 40, 1200, 200);

    expect(liftClearOf(BUBBLE, under([save]), VIEWPORT_H)).toBe(
      BUBBLE.bottom - save.top + STEP_GAP,
    );
  });

  it("hides over a long column of row-menu buttons (one ⋮ every 55 px)", () => {
    // A long table: rows from y=239 down to y=734.
    const rows = Array.from({ length: 10 }, (_, i) => btn(239 + i * 55));

    expect(liftClearOf(BUBBLE, under(rows), VIEWPORT_H)).toBe("hide");
  });

  it("hides when the clear spot is higher than the allowed share of the window", () => {
    const tall = { left: 1300, right: 1440, top: 400, bottom: 830 };

    expect(liftClearOf(BUBBLE, under([tall]), VIEWPORT_H)).toBe("hide");
  });

  it("clears every control of a superset, so it is clear of each subset too", () => {
    // Row ⋮ buttons plus the controls of a menu open on top of them.
    const page = [btn(679), btn(734)];
    const menu = [btn(560, 30, 1250, 180), btn(600, 30, 1250, 180)];
    const lift = liftClearOf(BUBBLE, under([...page, ...menu]), VIEWPORT_H);

    expect(lift).not.toBe("hide");
    const at = {
      ...BUBBLE,
      top: BUBBLE.top - (lift as number),
      bottom: BUBBLE.bottom - (lift as number),
    };

    expect(page.some((c) => overlaps(at, c))).toBe(false);
  });
});

describe("pointerNear", () => {
  it("is true on the bubble and within the margin", () => {
    expect(pointerNear(1370, 780, BUBBLE, 16)).toBe(true);
    expect(pointerNear(1330, 730, BUBBLE, 16)).toBe(true);
  });

  it("is false farther away", () => {
    expect(pointerNear(1300, 780, BUBBLE, 16)).toBe(false);
    expect(pointerNear(1370, 700, BUBBLE, 16)).toBe(false);
  });
});

describe("which controls the bubble may not cover", () => {
  it("a button, a row ⋮ or a wide row still count", () => {
    expect(canBeHiddenBy({ left: 1300, right: 1420, top: 780, bottom: 820 }, BUBBLE)).toBe(true);
    expect(canBeHiddenBy({ left: 1380, right: 1412, top: 790, bottom: 822 }, BUBBLE)).toBe(true);
    expect(canBeHiddenBy({ left: 260, right: 1420, top: 790, bottom: 838 }, BUBBLE)).toBe(true);
  });

  it("a whole clickable card or panel does not (it can be clicked elsewhere)", () => {
    expect(canBeHiddenBy({ left: 1000, right: 1420, top: 560, bottom: 860 }, BUBBLE)).toBe(false);
  });
});
