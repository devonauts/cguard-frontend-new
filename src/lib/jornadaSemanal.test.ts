import { describe, expect, it } from "vitest";

import {
  copiarLunesATodos,
  cuerpoDeJornada,
  cuerpoSinJornada,
  horaLimpia,
  jornadaDesdeDias,
  jornadaDesdeServidor,
  jornadaVacia,
  presetConSabadoMedio,
  presetLunesAViernes,
  validarJornada,
} from "./jornadaSemanal";

describe("office hours · presets", () => {
  it("Monday to Friday 08:00–17:00", () => {
    const j = presetLunesAViernes();

    expect(j.map((d) => d.dia)).toEqual(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
    expect(j.filter((d) => d.activo).map((d) => d.dia)).toEqual(["mon", "tue", "wed", "thu", "fri"]);
    expect(j[0]).toMatchObject({ start: "08:00", end: "17:00" });
  });

  it("plus Saturday half day", () => {
    const j = presetConSabadoMedio();

    expect(j[5]).toMatchObject({ dia: "sat", activo: true, start: "08:00", end: "12:00" });
    expect(j[6].activo).toBe(false);
  });

  it("«Copiar el lunes» copies Monday's hours to every day that is on", () => {
    const j = presetConSabadoMedio();

    j[0] = { ...j[0], start: "09:00", end: "18:00" };
    const c = copiarLunesATodos(j);

    expect(c.slice(0, 6).every((d) => d.start === "09:00" && d.end === "18:00")).toBe(true);
    expect(c[6]).toEqual(j[6]); // Sunday stays off and untouched
  });
});

describe("office hours · validation", () => {
  it("a normal week is valid", () => {
    expect(validarJornada(presetLunesAViernes()).ok).toBe(true);
  });

  it("flags a bad time and a zero-length day on THAT day", () => {
    const j = presetLunesAViernes();

    j[1] = { ...j[1], start: "" };
    j[2] = { ...j[2], start: "10:00", end: "10:00" };
    const v = validarJornada(j);

    expect(v.ok).toBe(false);
    expect(v.porDia.tue).toBe("horaInvalida");
    expect(v.porDia.wed).toBe("mismaHora");
    expect(v.porDia.mon).toBeNull();
  });

  it("overnight is allowed; a day off is never validated", () => {
    const j = jornadaVacia();

    j[4] = { ...j[4], activo: true, start: "22:00", end: "06:00" };
    j[5] = { ...j[5], start: "garbage" };
    expect(validarJornada(j).ok).toBe(true);
  });

  it("no day on is not a schedule; a bad «Desde» is refused", () => {
    expect(validarJornada(jornadaVacia())).toMatchObject({ ok: false, ningunDia: true });
    expect(validarJornada(presetLunesAViernes(), "28/10/2026")).toMatchObject({
      ok: false,
      fechaInvalida: true,
    });
  });
});

describe("office hours · payload", () => {
  it("only the days that are on, keyed mon…sun, with an optional effectiveFrom", () => {
    expect(cuerpoDeJornada(presetConSabadoMedio(), "2026-11-02")).toEqual({
      schedule: {
        mon: { start: "08:00", end: "17:00" },
        tue: { start: "08:00", end: "17:00" },
        wed: { start: "08:00", end: "17:00" },
        thu: { start: "08:00", end: "17:00" },
        fri: { start: "08:00", end: "17:00" },
        sat: { start: "08:00", end: "12:00" },
      },
      effectiveFrom: "2026-11-02",
    });
    expect(cuerpoDeJornada(presetLunesAViernes(), "")).not.toHaveProperty("effectiveFrom");
    expect(cuerpoSinJornada()).toEqual({ schedule: null });
  });

  it("normalizes times", () => {
    expect(horaLimpia("8:05")).toBe("08:05");
    expect(horaLimpia("17:00:00")).toBe("17:00");
    expect(horaLimpia("25:00")).toBe("");
  });
});

describe("office hours · pre-fill", () => {
  it("from the attendance days: the first worked date of each weekday", () => {
    const j = jornadaDesdeDias([
      { date: "2026-10-26", status: "work", start: "08:00", end: "17:00" }, // Monday
      { date: "2026-10-31", status: "work", start: "08:00", end: "12:00" }, // Saturday
      { date: "2026-11-01", status: "off", start: null, end: null }, // Sunday
      { date: "2026-11-02", status: "work", start: "09:00", end: "18:00" }, // next Monday: ignored
    ])!;

    expect(j[0]).toMatchObject({ activo: true, start: "08:00", end: "17:00" });
    expect(j[5]).toMatchObject({ activo: true, start: "08:00", end: "12:00" });
    expect(j[6].activo).toBe(false);
    expect(jornadaDesdeDias([{ date: "2026-10-26", status: "none" }])).toBeNull();
  });

  it("from the server shape", () => {
    const j = jornadaDesdeServidor({ mon: { start: "08:00", end: "17:00" }, sat: null })!;

    expect(j[0].activo).toBe(true);
    expect(j[5].activo).toBe(false);
    expect(jornadaDesdeServidor(null)).toBeNull();
  });
});
