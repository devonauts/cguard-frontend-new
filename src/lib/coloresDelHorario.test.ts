import { describe, expect, it } from "vitest";

import {
  COLORES_DEL_HORARIO_DEFAULTS,
  resolverColores,
  resultadoDelTurno,
  textoDelPasado,
} from "./coloresDelHorario";

const AHORA = Date.parse("2026-11-08T12:00:00Z");
const ayer = "2026-11-07T19:00:00Z";
const manana = "2026-11-09T07:00:00Z";

describe("resultadoDelTurno — qué color lleva un turno pasado", () => {
  it("un turno que no terminó no se pinta como pasado", () => {
    expect(resultadoDelTurno({ endTime: manana, clockedIn: true }, AHORA)).toBeNull();
  });

  it("gris si fichó a tiempo; rojo si no fichó", () => {
    expect(resultadoDelTurno({ endTime: ayer, clockedIn: true, asistencia: "ok" }, AHORA)).toBe("completado");
    expect(resultadoDelTurno({ endTime: ayer }, AHORA)).toBe("incumplido");
  });

  it("con incidencia si fichó tarde o sin salida", () => {
    expect(
      resultadoDelTurno({ endTime: ayer, clockedIn: true, asistencia: "incidencia" }, AHORA),
    ).toBe("conIncidencia");
  });

  it("café si fue un doblaje; otro color si lo cubrió otro trabajador", () => {
    expect(resultadoDelTurno({ endTime: ayer, clockedIn: true, status: "extension" }, AHORA)).toBe("doblaje");
    expect(resultadoDelTurno({ endTime: ayer, clockedIn: true, status: "covered" }, AHORA)).toBe("cubiertoPorOtro");
    expect(resultadoDelTurno({ endTime: ayer, clockedIn: true, status: "reinforcement" }, AHORA)).toBe("cubiertoPorOtro");
  });

  it("no fichar pesa más que cómo se iba a cubrir", () => {
    expect(resultadoDelTurno({ endTime: ayer, status: "extension" }, AHORA)).toBe("incumplido");
  });

  it("anulados, trasladados, ausencias y aprendices: no se pintan así", () => {
    for (const status of ["cancelled", "transferred_out", "absent", "training"])
      expect(resultadoDelTurno({ endTime: ayer, status, clockedIn: true }, AHORA)).toBeNull();
  });
});

describe("resolverColores", () => {
  it("rellena lo que falta y rechaza lo que no es #rrggbb", () => {
    const c = resolverColores({ activo: false, doblaje: "#AA5500", incumplido: "rojo" });

    expect(c.activo).toBe(false);
    expect(c.doblaje).toBe("#aa5500");
    expect(c.incumplido).toBe(COLORES_DEL_HORARIO_DEFAULTS.incumplido);
    expect(resolverColores(null)).toEqual(COLORES_DEL_HORARIO_DEFAULTS);
  });
});

describe("textoDelPasado — el título de una celda pasada", () => {
  const t = ((k: string, d?: string) =>
    ({
      "nomina.excepcion.late_arrival": "Llegada tarde",
      "nomina.excepcion.outside_geofence": "Fuera de geocerca",
    })[k] ?? d ?? k) as any;

  it("la incidencia dice el motivo, con los textos de Nómina", () => {
    expect(textoDelPasado(t, "conIncidencia", ["late_arrival", "outside_geofence"])).toBe(
      "Con incidencia (tarde, salió antes o sin salida): Llegada tarde, Fuera de geocerca",
    );
  });

  it("sin motivos, o en otro evento, sólo la etiqueta", () => {
    expect(textoDelPasado(t, "conIncidencia", [])).toBe(
      "Con incidencia (tarde, salió antes o sin salida)",
    );
    expect(textoDelPasado(t, "completado", ["late_arrival"])).toBe("Completado sin problema");
  });
});
