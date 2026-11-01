import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Phase 3 · errors are visible: a list that did not load says so (with a
 * retry), and a list that keeps a cap on purpose says how much it shows.
 */
let pintar: (el: any) => string;
let Error: any;
let Tope: any;

beforeAll(async () => {
  const mem = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
  };
  await import("../../i18n");
  const m = await import("./ErrorDeCarga");
  Error = m.ErrorDeCarga;
  Tope = m.AvisoDeTope;
  pintar = (el) => renderToStaticMarkup(el);
});

describe("ErrorDeCarga", () => {
  it("is an alert that says it did not load and offers to retry", () => {
    const html = pintar(<Error onRetry={() => undefined} />);

    expect(html).toContain('role="alert"');
    expect(html).toContain("No se pudo cargar");
    expect(html).toContain("Reintentar");
    expect(html).not.toContain("No hay");
  });

  it("without a retry handler there is no button", () => {
    expect(pintar(<Error />)).not.toContain("<button");
  });

  it("AvisoDeTope tells «N de M» only when something is left out", () => {
    expect(pintar(<Tope mostrados={200} total={1240} pista="filtra por estación" />)).toMatch(/Mostrando 200 de 1.?240 — filtra por estación/);
    expect(pintar(<Tope mostrados={50} total={50} />)).toBe("");
  });
});
