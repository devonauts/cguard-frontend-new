import { describe, expect, it } from "vitest";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";

import { DropdownMenu } from "./dropdown-menu";

/**
 * A modal Radix menu sets `pointer-events: none` on the body while open, so a
 * press on another row's trigger only closed the open menu. The shared menu
 * is non-modal unless a caller asks for modal.
 */
describe("DropdownMenu", () => {
  it("is non-modal by default", () => {
    const el = DropdownMenu({ children: null });
    expect(el.type).toBe(DropdownMenuPrimitive.Root);
    expect(el.props.modal).toBe(false);
  });

  it("keeps modal when a caller asks for it", () => {
    expect(DropdownMenu({ modal: true, children: null }).props.modal).toBe(
      true,
    );
  });

  it("passes the other props through", () => {
    const onOpenChange = () => undefined;
    const el = DropdownMenu({ open: true, onOpenChange, children: null });
    expect(el.props.open).toBe(true);
    expect(el.props.onOpenChange).toBe(onOpenChange);
  });
});
