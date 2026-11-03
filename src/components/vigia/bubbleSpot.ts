/**
 * Geometry for the floating VigIA bubble: where it can sit without covering a
 * control. Pure functions, so they can be tested without a DOM.
 */

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Gap kept between the bubble and a control it steps away from. */
export const STEP_GAP = 12;
/** Never lift the bubble higher than this share of the window. */
export const MAX_LIFT_SHARE = 0.45;

export function overlaps(a: Box, b: Box): boolean {
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  );
}

/**
 * How many px to lift the bubble from `base` (its spot with no lift) so that
 * `controlsAt` finds nothing under it, or "hide" when no clear spot exists
 * within reach. Each round moves it just above the highest control it hits.
 */
export function liftClearOf(
  base: Box,
  controlsAt: (box: Box) => Box[],
  viewportHeight: number,
): number | "hide" {
  let lift = 0;

  for (let i = 0; i < 6; i++) {
    const box = {
      ...base,
      top: base.top - lift - STEP_GAP / 2,
      bottom: base.bottom - lift + STEP_GAP / 2,
    };
    const hits = controlsAt(box);

    if (!hits.length) return lift;
    const highest = Math.min(...hits.map((r) => r.top));

    lift = Math.ceil(base.bottom - highest + STEP_GAP);
    if (lift > viewportHeight * MAX_LIFT_SHARE || base.top - lift < 8)
      return "hide";
  }

  return "hide";
}

/** Whether a pointer at (x, y) is on `box` or within `margin` px of it. */
export function pointerNear(
  x: number,
  y: number,
  box: Box,
  margin: number,
): boolean {
  return (
    x >= box.left - margin &&
    x <= box.right + margin &&
    y >= box.top - margin &&
    y <= box.bottom + margin
  );
}
