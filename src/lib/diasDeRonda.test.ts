import { describe, expect, it } from "vitest";
import { DIAS_CORTOS, leerDias, ordenLunesPrimero } from "./diasDeRonda";

describe("leerDias", () => {
  it("reads numbers, as the station wizard writes them", () => {
    expect(leerDias([1, 2, 3])).toEqual([1, 2, 3]);
    expect(leerDias("[0,6]")).toEqual([0, 6]);
  });

  it("reads English and Spanish names, as the post-site form writes them", () => {
    expect(leerDias(["monday", "Friday"])).toEqual([1, 5]);
    expect(leerDias('["lunes","miércoles","sábado"]')).toEqual([1, 3, 6]);
    expect(leerDias("lunes,martes")).toEqual([1, 2]);
  });

  it("ignores blanks, junk and repeats", () => {
    expect(leerDias(["", " ", "x", 9, "monday", 1])).toEqual([1]);
    expect(leerDias(null)).toEqual([]);
    expect(leerDias("")).toEqual([]);
  });
});

describe("weekday order shared by Rondas and Consignas", () => {
  it("lists Monday first and Sunday last", () => {
    expect(DIAS_CORTOS.map((d) => d.corta).join(" ")).toBe("L M X J V S D");
    expect([0, 3, 1, 6].sort((a, b) => ordenLunesPrimero(a) - ordenLunesPrimero(b))).toEqual([1, 3, 6, 0]);
  });
});
