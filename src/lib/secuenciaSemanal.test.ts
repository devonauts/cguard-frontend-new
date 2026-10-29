/**
 * Weekly rotation styles («Por días de la semana»): 7 letters, index 0 =
 * Monday, anchored to the calendar. Names and previews must read as weekdays,
 * never as a cycle with a start day.
 */
import { describe, expect, it } from "vitest";

import i18n from "../i18n";
import en from "../locales/en.json";
import {
  diasDeSecuenciaSemanal,
  diasIsoDe,
  esSemanal,
  indiceDeDia,
  letraSemanalDe,
  necesitaComplemento,
  nombreDeDias,
  nombreSemanal,
  personasQueSeTurnanCon,
  previaSemanal,
  secuenciaSemanal,
} from "./secuenciaDeRotacion";
import { estadoDeRotacionCliente, rotationDseOf } from "./utils";
import { aLaVezSegunLaRotacion } from "./jornadasDePlazas";

const t = i18n.t.bind(i18n);

describe("weekly sequence · building it", () => {
  it("weekdays in either alphabet → 7 letters, Monday first", () => {
    expect(secuenciaSemanal(["mon", "tue", "wed", "thu", "fri"])).toBe("DDDDDLL");
    expect(secuenciaSemanal(["lun", "mie", "vie"])).toBe("DLDLDLL");
    expect(secuenciaSemanal(["sun", "sat"])).toBe("LLLLLDD");
    expect(secuenciaSemanal([])).toBeNull();
    expect(secuenciaSemanal(["nope"])).toBeNull();
  });

  it("indices and API keys", () => {
    expect(indiceDeDia("mon")).toBe(0);
    expect(indiceDeDia("dom")).toBe(6);
    expect(indiceDeDia("x")).toBe(-1);
    expect(diasDeSecuenciaSemanal("DLDLDLL")).toEqual([0, 2, 4]);
    expect(diasIsoDe([4, 0, 0, 2])).toEqual(["mon", "wed", "fri"]);
  });

  it("only a 7-letter sequence flagged weekly is weekly", () => {
    expect(esSemanal({ weekly: true, sequence: "DDDDDLL" })).toBe(true);
    expect(esSemanal({ weekly: false, sequence: "DDDDDLL" })).toBe(false);
    expect(esSemanal({ weekly: true, sequence: "DDLL" })).toBe(false);
    expect(esSemanal(null)).toBe(false);
  });
});

describe("weekly sequence · names", () => {
  it("Spanish: a run reads «Lunes a viernes», gaps read as a list", () => {
    expect(nombreSemanal("DDDDDLL", t)).toBe("Lunes a viernes");
    expect(nombreSemanal("DDDDDDL", t)).toBe("Lunes a sábado");
    expect(nombreSemanal("DLDLDLL", t)).toBe("Lun, Mié, Vie");
    expect(nombreSemanal("DDDDDDD", t)).toBe("Todos los días");
    expect(nombreSemanal("LLLLLLD", t)).toBe("Domingo");
    expect(nombreDeDias([], t)).toBe("Ningún día");
  });

  it("English follows the catalog", async () => {
    i18n.addResourceBundle("en", "translation", en, true, true);
    const tEn = i18n.getFixedT("en");

    expect(nombreSemanal("DDDDDLL", tEn)).toBe("Monday to Friday");
    expect(nombreSemanal("DLDLDLL", tEn)).toBe("Mon, Wed, Fri");
  });
});

describe("weekly sequence · preview anchored to Monday", () => {
  it("starts on the Monday of the week, whatever the day passed", () => {
    // Wednesday 2026-10-28.
    const p = previaSemanal("DDDDDLL", new Date(2026, 9, 28), 2);

    expect(p).toHaveLength(14);
    expect(p[0].fecha.getDay()).toBe(1);
    expect(p[0].fecha.getDate()).toBe(26);
    expect(p.map((x) => x.letra).join("")).toBe("DDDDDLLDDDDDLL");
  });

  it("the letter of a date is its weekday's", () => {
    expect(letraSemanalDe("DDDDDLL", new Date(2026, 9, 31))).toBe("L"); // Saturday
    expect(letraSemanalDe("DDDDDLL", new Date(2026, 10, 2))).toBe("D"); // Monday
  });
});

describe("weekly sequence · coverage arithmetic", () => {
  it("one guard per seat, no complement, every seat at once", () => {
    const rot = { weekly: true, sequence: "DDDDDLL" };

    expect(personasQueSeTurnanCon(rot)).toBe(1);
    expect(necesitaComplemento(rot)).toBeNull();
    expect(aLaVezSegunLaRotacion(2, rot)).toBe(2);
    // The same letters as a free cycle still need the complement.
    expect(personasQueSeTurnanCon({ sequence: "DDDDDLL" })).toBe(2);
  });

  it("the client mirror reads a weekly style by weekday, ignoring the offset", () => {
    const sabado = rotationDseOf(new Date(2026, 9, 31));
    const lunes = rotationDseOf(new Date(2026, 10, 2));
    const reglas = { secuencia: "DDDDDLL", semanal: true };

    expect(estadoDeRotacionCliente(sabado, sabado, 3, 5, 0, 2, reglas)).toBe("rest");
    expect(estadoDeRotacionCliente(lunes, lunes, 3, 5, 0, 2, reglas)).toBe("day");
  });
});
