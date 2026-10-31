import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import menu from "../data/sidebar-menu.json";

/**
 * Phase 1 menu (Mike, 2026-10-31): the five questions in order —
 * Estaciones → Personal → Turnos → Asistencia → Nómina. These tests pin what
 * the operator relies on: every entry has its name in every language, payroll
 * only shows with a payroll module, and no page address changed.
 */
type Sub = { id: string; path: string; modulo?: string; gusto?: boolean; permission?: string[] };
type Item = { id: string; path?: string; modulo?: string; subItems?: Sub[] };
const ITEMS = menu as Item[];
const IDIOMAS = ["es", "en", "pt", "fr", "de", "it", "nl", "pl"];
const locale = (l: string) =>
  JSON.parse(fs.readFileSync(path.resolve(__dirname, `../locales/${l}.json`), "utf8"));
const get = (d: any, k: string) =>
  k.split(".").reduce((c, p) => (c && typeof c === "object" ? c[p] : undefined), d);
const item = (id: string) => ITEMS.find((i) => i.id === id)!;

describe("menu · fase 1", () => {
  it("groups the shift work in the order an operator asks", () => {
    const ids = ITEMS.map((i) => i.id);
    const order = ["estaciones", "personal", "turnos", "asistencia", "nomina"].map((id) => ids.indexOf(id));

    expect(order.every((n) => n >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const gone of ["equipo", "programador", "pases-de-turno"]) expect(ids).not.toContain(gone);
  });

  it("every entry has its name in every language", () => {
    for (const l of IDIOMAS) {
      const sb = locale(l).sidebar;

      for (const it of ITEMS) {
        const label = get(sb, `${it.id}.label`) ?? get(sb, it.id);

        expect(typeof label, `${l} sidebar.${it.id}`).toBe("string");
        for (const s of it.subItems ?? []) {
          const sl = get(sb, `${it.id}.${s.id}`) ?? get(sb, s.id);

          expect(typeof sl, `${l} sidebar.${it.id}.${s.id}`).toBe("string");
        }
      }
    }
  });

  it("Nómina only appears with Roles de pago or Gusto", () => {
    const nomina = item("nomina");

    expect(nomina.modulo).toBeUndefined();
    for (const s of nomina.subItems ?? []) expect(Boolean(s.modulo === "payroll_slips" || s.gusto), s.id).toBe(true);
  });

  it("Asistencia is for every company: no module on it", () => {
    const a = item("asistencia");

    expect(a.modulo).toBeUndefined();
    for (const s of a.subItems ?? []) expect(s.modulo, s.id).toBeUndefined();
    expect((a.subItems ?? []).map((s) => s.path)).toContain("/nomina/timecards");
  });

  it("shift status and the personal clock left the side menu", () => {
    const paths = ITEMS.flatMap((i) => [i.path, ...(i.subItems ?? []).map((s) => s.path)]);

    expect(paths).not.toContain("/shift-status");
    expect(paths).not.toContain("/nomina/time-clock");
  });

  it("Pases de turno follows the stations permission", () => {
    const pases = item("estaciones").subItems!.find((s) => s.path === "/passdowns")!;

    expect(pases.permission).toEqual(["stationRead"]);
  });

  it("no page address changed: every menu path is still a route", () => {
    const app = fs.readFileSync(path.resolve(__dirname, "../App.tsx"), "utf8");

    for (const it of ITEMS)
      for (const p of [it.path, ...(it.subItems ?? []).map((s) => s.path)].filter(Boolean) as string[])
        expect(app.includes(`path="${p}"`), p).toBe(true);
  });
});
