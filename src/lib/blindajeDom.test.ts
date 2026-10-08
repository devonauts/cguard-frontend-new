import { describe, it, expect, vi, beforeAll } from "vitest";

// Minimal DOM-like Node (the test suite runs in node, without jsdom): enough to
// reproduce what a browser translator does — a child moved under another parent.
class FakeNode {
  parentNode: FakeNode | null = null;
  childNodes: FakeNode[] = [];
  removeChild(c: FakeNode) {
    const i = this.childNodes.indexOf(c);
    if (i < 0) throw new Error("Failed to execute 'removeChild' on 'Node'");
    this.childNodes.splice(i, 1); c.parentNode = null; return c;
  }
  insertBefore(n: FakeNode, ref: FakeNode | null) {
    if (ref && ref.parentNode !== this) throw new Error("Failed to execute 'insertBefore' on 'Node'");
    if (n.parentNode) n.parentNode.removeChild(n);
    const i = ref ? this.childNodes.indexOf(ref) : this.childNodes.length;
    this.childNodes.splice(i, 0, n); n.parentNode = this; return n;
  }
}

beforeAll(async () => {
  (globalThis as any).Node = FakeNode;
  const { instalarBlindajeDom } = await import("./blindajeDom");
  instalarBlindajeDom();
});

describe("blindajeDom", () => {
  it("no lanza cuando un traductor movió el nodo (removeChild/insertBefore ajenos)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const padre = new FakeNode(), otro = new FakeNode(), hijo = new FakeNode();
    otro.insertBefore(hijo, null);                 // the "translator" moved it out of `padre`
    expect(() => padre.removeChild(hijo)).not.toThrow();
    const nuevo = new FakeNode();
    expect(() => padre.insertBefore(nuevo, hijo)).not.toThrow();
    expect(nuevo.parentNode).toBe(padre);          // appended instead of crashing
    warn.mockRestore();
  });
  it("sigue funcionando normal con nodos propios", () => {
    const padre = new FakeNode(), a = new FakeNode(), b = new FakeNode();
    padre.insertBefore(a, null); padre.insertBefore(b, a);
    expect(padre.childNodes[0]).toBe(b);
    padre.removeChild(a);
    expect(padre.childNodes.length).toBe(1);
  });
});
