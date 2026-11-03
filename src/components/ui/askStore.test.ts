import { describe, expect, it, vi } from "vitest";

import { createAskStore } from "./askStore";

describe("createAskStore", () => {
  it("answers the open question once", async () => {
    const store = createAskStore<string, boolean>(false);
    const p = store.ask("¿Eliminar?");
    const id = store.current()!.id;

    store.answer(id, true);
    store.answer(id, false);
    expect(await p).toBe(true);
    expect(store.current()).toBeNull();
  });

  it("a second question answers the first as dismissed instead of leaving it waiting", async () => {
    const store = createAskStore<string, string | null>(null);
    const first = store.ask("uno");
    const second = store.ask("dos");

    expect(await first).toBeNull();
    expect(store.current()!.options).toBe("dos");
    store.answer(store.current()!.id, "texto");
    expect(await second).toBe("texto");
  });

  it("ignores a late answer for a question that is no longer open", async () => {
    const store = createAskStore<string, boolean>(false);
    const first = store.ask("uno");
    const oldId = store.current()!.id;
    const second = store.ask("dos");

    store.answer(oldId, true);
    expect(await first).toBe(false);
    expect(store.current()!.options).toBe("dos");
    store.answer(store.current()!.id, true);
    expect(await second).toBe(true);
  });

  it("tells the host what is open, and when it closes", () => {
    const store = createAskStore<string, boolean>(false);
    const seen = vi.fn();
    const off = store.subscribe(seen);

    void store.ask("¿Seguro?");
    store.answer(store.current()!.id, false);
    off();
    expect(seen.mock.calls.map(([p]) => (p ? p.options : null))).toEqual([null, "¿Seguro?", null]);
  });
});
