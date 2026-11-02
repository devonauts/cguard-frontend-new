/**
 * True for an Esc press that nothing else has handled yet. Radix layers
 * (dialogs, dropdowns) call preventDefault when Esc closes them, so a custom
 * popover that checks this does not close together with a dialog on top of it.
 */
export function isPlainEscape(
  e: Pick<KeyboardEvent, "key" | "defaultPrevented" | "isComposing">,
): boolean {
  return e.key === "Escape" && !e.defaultPrevented && !e.isComposing;
}
