import { describe, expect, it } from "vitest";

import { organizarBandeja, pasoAntesDeLlegar } from "./organizarBandeja";

/**
 * La bandeja como iOS. Lo que defienden estas pruebas es lo que el dueño vio
 * roto el 2026-09-27: horas saltando («hace 4 h, ahora, hace 1 h, hace 4 h»).
 */

const ZONA = "America/Guayaquil"; // UTC-5, sin horario de verano
// 2026-09-27 15:00 en Guayaquil
const AHORA = Date.parse("2026-09-27T20:00:00Z");
const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();

const aviso = (id: string, eventType: string, min: number, pasoMin?: number) => ({
  id,
  eventType,
  createdAt: hace(min),
  occurredAt: pasoMin === undefined ? undefined : hace(pasoMin),
});

describe("organizarBandeja", () => {
  const lista = [
    aviso("a", "attendance.late", 240), // hace 4 h
    aviso("b", "incident.created", 1), // ahora
    aviso("c", "attendance.no_show", 60), // hace 1 h
    aviso("d", "coverage.post_uncovered", 245),
    aviso("e", "panic.alert", 90), // emergencia, hace 1,5 h
    aviso("f", "attendance.late", 60 * 22), // ayer
  ];
  const r = organizarBandeja(lista, { ahora: AHORA, zona: ZONA });

  it("la emergencia va aparte, arriba, aunque sea de hace hora y media", () => {
    expect(r.atencion.map((x) => x.id)).toEqual(["e"]);
  });

  it("las horas NUNCA suben al bajar: cada pila empieza más antigua que la anterior", () => {
    const tops = r.secciones.flatMap((s) => s.pilas.map((p) => Date.parse(p.avisos[0].createdAt)));

    for (let i = 1; i < tops.length; i++) expect(tops[i]).toBeLessThanOrEqual(tops[i - 1]);
  });

  it("dentro de una pila, de lo más reciente a lo más antiguo", () => {
    const asistencia = r.secciones[0].pilas.find((p) => p.familia === "attendance")!;

    expect(asistencia.avisos.map((x) => x.id)).toEqual(["c", "a"]);
  });

  it("hoy y ayer en la zona de la EMPRESA", () => {
    expect(r.secciones.map((s) => s.tipo)).toEqual(["hoy", "ayer"]);
    expect(r.secciones[0].dia).toBe("2026-09-27");
  });

  it("de madrugada en UTC sigue siendo «hoy» en Guayaquil", () => {
    // 2026-09-28 02:00 UTC = 27 a las 21:00 en Guayaquil
    const tarde = Date.parse("2026-09-28T02:00:00Z");
    const x = organizarBandeja([{ id: "z", eventType: "task.assigned", createdAt: new Date(tarde - 60_000).toISOString() }], {
      ahora: tarde,
      zona: ZONA,
    });

    expect(x.secciones[0]).toMatchObject({ tipo: "hoy", dia: "2026-09-27" });
  });

  it("«pasó a las…» sólo cuando se detectó bastante después", () => {
    expect(pasoAntesDeLlegar(aviso("x", "attendance.no_show", 1, 40))).toBe(true);
    expect(pasoAntesDeLlegar(aviso("y", "attendance.no_show", 1, 3))).toBe(false);
    expect(pasoAntesDeLlegar(aviso("w", "attendance.no_show", 1))).toBe(false);
  });
});
