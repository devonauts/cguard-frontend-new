import { describe, expect, it, vi } from "vitest";

// The socket client reads the session token at import time.
vi.hoisted(() => {
  const m = new Map<string, string>();

  (globalThis as any).localStorage ??= {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
  };
});

vi.mock("@/lib/socket", () => ({
  crearSocket: vi.fn(),
  cerrarSocket: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ getAuthToken: () => "" }));
vi.mock("@/lib/localeActual", () => ({ localeActual: () => "es" }));

import {
  indiceDeMarcas,
  juntarCambios,
  queCambio,
  textoDeBorrador,
  textoEnVivo,
  type CambioEnVivo,
} from "./avisoEnVivo";

/** A `t` that fills the Spanish default, like i18next with no catalog. */
const t = (_k: string, o: any = {}) =>
  String(o.defaultValue ?? _k).replace(/\{\{(\w+)\}\}/g, (_m, k) =>
    String(o[k] ?? ""),
  );

const c = (over: Partial<CambioEnVivo> = {}): CambioEnVivo => ({
  kind: "shift",
  guardId: "g1",
  stationId: "s1",
  day: "2026-11-05",
  guard: "Carlos Mendoza",
  station: "Bravo 4",
  by: "Beto Jefe",
  at: "2026-11-01T10:00:00.000Z",
  ...over,
});

describe("live edits vs the open draft · CRM side", () => {
  it("marks the person's cell that day, an assignment on every day, and a station when no guard of the draft is involved", () => {
    const personas = {
      p1: { guardId: "g1", stationId: "s1" },
      p2: { guardId: "g2", stationId: "s1" },
    };
    const i = indiceDeMarcas(
      [
        c(),
        c({
          kind: "assignment",
          guardId: "g2",
          day: null,
          at: "2026-11-01T09:00:00.000Z",
        }),
        c({ guardId: "g9", stationId: "s1", day: "2026-11-06" }),
      ],
      personas,
    );

    expect(i.persona("p1", "2026-11-05")).toHaveLength(1);
    expect(i.persona("p1", "2026-11-06")).toHaveLength(0);
    expect(i.persona("p2", "2026-12-24")).toHaveLength(1);
    expect(i.puesto("s1", "2026-11-06")).toHaveLength(1);
    expect(i.vacio).toBe(false);
    expect(indiceDeMarcas([], personas).vacio).toBe(true);
  });

  it("keeps one entry per cell, newest first", () => {
    const viejo = c({ by: "A" });
    const nuevo = c({ by: "B", at: "2026-11-01T11:00:00.000Z" });

    expect(juntarCambios([viejo], [nuevo]).map((x) => x.by)).toEqual(["B"]);
    expect(juntarCambios([viejo], [c({ day: "2026-11-07" })])).toHaveLength(2);
  });

  it("says who, where and when — and only what the server let through", () => {
    expect(queCambio(t, c())).toMatch(/^Carlos Mendoza \(Bravo 4, .+\)$/);
    expect(queCambio(t, c({ station: null, stationId: null }))).toMatch(
      /^Carlos Mendoza \(.+\)$/,
    );
    expect(
      textoEnVivo(t, {
        side: "live",
        draftId: "d",
        owners: ["Ana Admin"],
        editing: true,
        draftSavedAt: null,
        at: "",
        items: [c()],
        total: 1,
      }),
    ).toMatch(
      /^Ana Admin está editando un borrador que también cambia Carlos Mendoza/,
    );
    expect(
      textoDeBorrador(t, { by: "Beto Jefe", items: [c()], total: 1 }),
    ).toMatch(/^Beto Jefe acaba de cambiar en vivo Carlos Mendoza/);
    expect(
      textoDeBorrador(t, {
        by: "Beto Jefe",
        items: [c(), c({ day: "2026-11-06" }), c({ day: "2026-11-07" })],
        total: 5,
      }),
    ).toContain("y 2 más");
  });
});
