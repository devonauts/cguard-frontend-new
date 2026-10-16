import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

/**
 * The CRM's 404 in the CRM's own style (2026-10-16). Rendered on the server
 * with the real Spanish catalog, like the other CRM views (no jsdom).
 */

type Props = { signedIn: boolean; path: string; canGoBack: boolean };
let paint: (p: Props) => string;

beforeAll(async () => {
  const mem = new Map<string, string>();

  (globalThis as any).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
  };
  await import("../../i18n");
  const { NotFoundCard } = await import("../NotFound");

  paint = (p) =>
    renderToStaticMarkup(
      <MemoryRouter>
        <NotFoundCard {...p} onBack={() => {}} />
      </MemoryRouter>,
    );
});

describe("NotFound", () => {
  it("speaks the CRM's language: glass card, brand tile, brand button", () => {
    const html = paint({ signedIn: true, path: "/no-existe", canGoBack: true });

    expect(html).toContain("glass");
    expect(html).toContain("var(--brand-wash)");
    expect(html).toContain("cg-btn-brand");
    expect(html).toContain("cg-btn-glass");
    expect(html).toContain("No encontramos esta página");
  });

  it("signed in: goes to the dashboard inside the app, and shows the missing address", () => {
    const html = paint({
      signedIn: true,
      path: "/reportes/viejo?x=1",
      canGoBack: false,
    });

    expect(html).toContain('href="/dashboard"');
    expect(html).toContain("Ir al panel");
    expect(html).toContain("/reportes/viejo?x=1");
    expect(html).not.toContain("Volver");
  });

  it("signed out: offers the login instead", () => {
    const html = paint({ signedIn: false, path: "/algo", canGoBack: false });

    expect(html).toContain('href="/login"');
    expect(html).toContain("Iniciar sesión");
    expect(html).not.toContain('href="/dashboard"');
  });

  it("no hard-coded colors left, and App routes * to this page", () => {
    const src = readFileSync(resolve(__dirname, "../NotFound.tsx"), "utf8");

    expect(src).not.toMatch(/emerald|text-green|bg-green/);
    const app = readFileSync(resolve(__dirname, "../../App.tsx"), "utf8");

    expect(app).toContain('import NotFound from "./pages/NotFound";');
    expect(app).toContain('<Route element={<NotFound />} path="*" />');
    expect(app).not.toContain("function NotFound()");
  });
});
