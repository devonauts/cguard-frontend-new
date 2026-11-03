import { describe, expect, it, vi } from "vitest";

import { confirmThenDelete } from "./confirmDelete";

describe("confirmThenDelete", () => {
  it("does not delete when the question is answered no", async () => {
    const remove = vi.fn(async () => undefined);

    expect(await confirmThenDelete(async () => false, remove)).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });

  it("deletes once after a yes", async () => {
    const remove = vi.fn(async () => undefined);

    expect(await confirmThenDelete(async () => true, remove)).toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("asks before it deletes", async () => {
    const order: string[] = [];

    await confirmThenDelete(
      async () => {
        order.push("ask");

        return true;
      },
      async () => {
        order.push("remove");
      },
    );
    expect(order).toEqual(["ask", "remove"]);
  });
});
