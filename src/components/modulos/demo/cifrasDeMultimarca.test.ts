import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  FACTURA,
  HORAS,
  IMPUESTO,
  NETO,
  PARES,
  SEMANA,
  SUBTOTAL,
  TOTAL,
  TURNO_H,
  tarifaDe,
} from "./cifrasDeMultimarca";

describe("Multimarca store demo · the figures add up", () => {
  it("every figure is a whole number", () => {
    const todas = [
      ...HORAS.map((r) => r.h),
      ...PARES.flatMap((p) => [p.h, p.importe]),
      NETO,
      SUBTOTAL,
      IMPUESTO,
      TOTAL,
      ...FACTURA.map((l) => l.v),
    ];

    for (const n of todas) expect(Number.isInteger(n)).toBe(true);
  });

  it("each pair sums its people, and hours × rate = amount", () => {
    for (const p of PARES) {
      const filas = HORAS.filter((r) => r.de === p.de && r.en === p.en);

      expect(p.h).toBe(filas.reduce((a, r) => a + r.h, 0));
      expect(p.importe).toBe(
        filas.reduce((a, r) => a + r.h * tarifaDe(r.de, r.en), 0),
      );
    }
    expect(PARES.map((p) => [p.h, p.importe])).toEqual([
      [72, 864],
      [36, 396],
    ]);
  });

  it("only cross pairs: nobody works for their own brand here", () => {
    for (const r of HORAS) expect(r.de).not.toBe(r.en);
  });

  it("the net balance is the difference of the two pairs", () => {
    expect(NETO).toBe(864 - 396);
    expect(NETO).toBe(468);
  });

  it("the invoice: lines → subtotal → 15 % tax → total", () => {
    expect(SUBTOTAL).toBe(4800);
    expect(IMPUESTO).toBe(720);
    expect(TOTAL).toBe(5520);
  });

  it("the guard's week: 3 Andes shifts + 2 Costa shifts of 12 h", () => {
    expect(SEMANA).toHaveLength(7);
    expect(SEMANA.filter((m) => m === "a").length * TURNO_H).toBe(36);
    expect(SEMANA.filter((m) => m === "b").length * TURNO_H).toBe(24);
  });
});

/* The demo asks for its texts with template keys (`T(\`marcas.${m}.nombre\`)`),
   which the global key guard cannot see: every language must carry exactly
   the Spanish set of keys, with the same {{placeholders}}. */
describe("Multimarca store demo · texts in the 8 languages", () => {
  const raiz = path.resolve(__dirname, "../../../locales");
  const leer = (idioma: string) =>
    JSON.parse(fs.readFileSync(path.join(raiz, `${idioma}.json`), "utf8"))
      .modulosAdicionales.demos.multimarca as Record<string, unknown>;
  const aplanar = (d: unknown, p = "", o = new Map<string, string>()) => {
    for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
      const kk = p ? `${p}.${k}` : k;

      if (v && typeof v === "object") aplanar(v, kk, o);
      else o.set(kk, String(v));
    }

    return o;
  };
  const marcadores = (s: string) =>
    [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
  const es = aplanar(leer("es"));

  it("Spanish has every key the demo uses", () => {
    const fuente = fs.readFileSync(
      path.join(__dirname, "DemoMultimarca.tsx"),
      "utf8",
    );
    const literales = [...fuente.matchAll(/\bT\(\s*"([\w.]+)"/g)].map(
      (m) => m[1],
    );
    const pasos = [...fuente.matchAll(/"((?:pasos|resultado)\.\w+)"/g)].map(
      (m) => m[1],
    );

    for (const k of [...literales, ...pasos]) expect(es.has(k), k).toBe(true);
    for (const e of ["marcas", "guardia", "factura", "admin", "horas"]) {
      expect(es.has(`escenas.${e}`)).toBe(true);
    }
  });

  for (const idioma of ["en", "pt", "fr", "de", "it", "nl", "pl"]) {
    it(idioma, () => {
      const otro = aplanar(leer(idioma));

      expect([...otro.keys()].sort()).toEqual([...es.keys()].sort());
      for (const [k, v] of es)
        expect(marcadores(otro.get(k)!), k).toEqual(marcadores(v));
    });
  }
});
