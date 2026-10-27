import { describe, expect, it } from "vitest";

import {
  etiquetaDeHorario,
  jornadasPorTipo,
  resumenDeHorario,
} from "./jornadasDePlazas";

// Un `t` mínimo: devuelve el texto de respaldo con {{h}} interpolado.
const t = (_k: string, d: string, o?: any) =>
  o && typeof o.h !== "undefined" ? d.replace("{{h}}", String(o.h)) : d;

describe("el horario del puesto sale de su ventana, no del molde de 12 h", () => {
  it("un «12h-day» de 09:00 a 17:00 es «8h Diurno · 09:00–17:00»", () => {
    const v = { startingTimeInDay: "09:00", finishTimeInDay: "17:00" };
    const r = resumenDeHorario("12h-day", v);

    expect(r).toEqual({ clave: "diurno", horas: 8, ventana: "09:00–17:00" });
    expect(etiquetaDeHorario(t, r)).toBe("8h Diurno");
    expect(jornadasPorTipo("12h-day", v)).toEqual([
      expect.objectContaining({ tipo: "Diurno", startTime: "09:00", endTime: "17:00" }),
    ]);
  });

  it("sin ventana propia conserva el molde de 12 h", () => {
    expect(resumenDeHorario("12h-day", null)).toEqual({ clave: "diurno", horas: 12, ventana: null });
    expect(etiquetaDeHorario(t, resumenDeHorario("12h-day", {}))).toBe("12h Diurno");
    expect(jornadasPorTipo("12h-day")).toEqual([
      expect.objectContaining({ tipo: "Diurno", startTime: "07:00", endTime: "19:00" }),
    ]);
  });

  it("acepta horas con segundos y las normaliza", () => {
    const r = resumenDeHorario("12h-day", { startingTimeInDay: "9:00:00", finishTimeInDay: "17:30:00" });

    expect(r).toEqual({ clave: "diurno", horas: 8.5, ventana: "09:00–17:30" });
    expect(etiquetaDeHorario(t, r)).toBe("8.5h Diurno");
  });

  it("una ventana nocturna de 19:00 a 07:00 es «12h Nocturno»", () => {
    const v = { startingTimeInDay: "19:00", finishTimeInDay: "07:00" };

    expect(resumenDeHorario("12h-night", v)).toEqual({ clave: "nocturno", horas: 12, ventana: "19:00–07:00" });
    expect(jornadasPorTipo("12h-night", v)).toEqual([
      expect.objectContaining({ tipo: "Nocturno", startTime: "19:00", endTime: "07:00" }),
    ]);
  });

  it("un 24 h con ventana de medio día son sus dos mitades", () => {
    const v = { startingTimeInDay: "06:00", finishTimeInDay: "18:00" };

    expect(jornadasPorTipo("24h", v)).toEqual([
      expect.objectContaining({ tipo: "Diurno", startTime: "06:00", endTime: "18:00" }),
      expect.objectContaining({ tipo: "Nocturno", startTime: "18:00", endTime: "06:00" }),
    ]);
    expect(resumenDeHorario("24h", v)).toEqual({
      clave: "24h",
      horas: 24,
      ventana: "06:00–18:00 · 18:00–06:00",
    });
    expect(etiquetaDeHorario(t, resumenDeHorario("24h", v))).toBe("24 Horas");
  });

  it("sin tipo de horario no inventa jornadas", () => {
    expect(jornadasPorTipo(null, { startingTimeInDay: "09:00", finishTimeInDay: "17:00" })).toEqual([]);
    expect(resumenDeHorario(undefined, null).clave).toBeNull();
  });
});
