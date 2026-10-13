/**
 * Unit tests — LA HORA ES LA DE LA EMPRESA.
 *
 * Los casos no son inventados: son los tres fallos que se encontraron en el
 * CRM. La ronda de las 21:09 en México que se leía como las 03:09 del día
 * siguiente; el vigilante que nacía un día antes de lo que decía su cédula; y
 * el informe de «hoy» que a partir de las seis de la tarde ya miraba mañana.
 *
 * Se fija una zona explícita en cada caso para no depender de la del dispositivo
 * donde corran las pruebas.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

import {
  diaDeLaEmpresa,
  hoyEnLaEmpresa,
  horaDeLaEmpresa,
  soloFechaCivil,
  instanteEnLaEmpresa,
  limitesDelDia,
  paraInputFechaHora,
  desdeInputFechaHora,
} from "./horaDeLaEmpresa";

const MEX = "America/Mexico_City"; // UTC-6
const QUITO = "America/Guayaquil"; // UTC-5, sin horario de verano
const MADRID = "Europe/Madrid"; // UTC+1 / +2
const CHICAGO = "America/Chicago"; // UTC-6 / -5

afterEach(() => vi.useRealTimers());

describe("diaDeLaEmpresa", () => {
  it("la ronda de las 21:09 en México es del día 19, no del 20", () => {
    // 2026-09-20T03:09Z es 2026-09-19 21:09 en México.
    expect(diaDeLaEmpresa("2026-09-20T03:09:00Z", MEX)).toBe("2026-09-19");
  });

  it("el mismo instante cae en otro día según la zona", () => {
    expect(diaDeLaEmpresa("2026-09-20T03:09:00Z", MADRID)).toBe("2026-09-20");
  });

  it("devuelve cadena vacía con basura", () => {
    expect(diaDeLaEmpresa("no soy una fecha", MEX)).toBe("");
  });
});

describe("hoyEnLaEmpresa", () => {
  it("a las 19:00 de México todavía es hoy, aunque en UTC sea mañana", () => {
    vi.useFakeTimers();
    // 2026-09-20T01:00Z → 19:00 del 19 en México.
    vi.setSystemTime(new Date("2026-09-20T01:00:00Z"));
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-09-20"); // lo viejo
    expect(hoyEnLaEmpresa(MEX)).toBe("2026-09-19"); // lo correcto
  });
});

describe("horaDeLaEmpresa", () => {
  it("da la hora de pared en 24 h", () => {
    expect(horaDeLaEmpresa("2026-09-20T03:09:00Z", MEX)).toBe("21:09");
    expect(horaDeLaEmpresa("2026-09-20T03:09:00Z", QUITO)).toBe("22:09");
  });
});

describe("soloFechaCivil", () => {
  it("no mueve el día de nacimiento", () => {
    // Con `new Date("1992-04-11").toLocaleDateString()` en México salía el 10.
    expect(soloFechaCivil("1992-04-11")).toBe("11/04/1992");
  });

  it("ignora la hora pegada que a veces trae el backend", () => {
    expect(soloFechaCivil("1992-04-11T00:00:00.000Z")).toBe("11/04/1992");
  });

  it("devuelve el hueco con valores vacíos o inválidos", () => {
    expect(soloFechaCivil(null)).toBe("—");
    expect(soloFechaCivil("")).toBe("—");
    expect(soloFechaCivil("mañana")).toBe("—");
  });
});

describe("instanteEnLaEmpresa", () => {
  it("las 18:00 del puesto son las 00:00Z del día siguiente en México", () => {
    expect(instanteEnLaEmpresa("2026-09-21", 18, 0, 0, 0, MEX).toISOString()).toBe(
      "2026-09-22T00:00:00.000Z",
    );
  });

  it("aplica el horario de verano del día consultado, no el de hoy", () => {
    // Madrid: +02:00 en julio, +01:00 en enero.
    expect(instanteEnLaEmpresa("2026-07-15", 12, 0, 0, 0, MADRID).toISOString()).toBe(
      "2026-07-15T10:00:00.000Z",
    );
    expect(instanteEnLaEmpresa("2026-01-15", 12, 0, 0, 0, MADRID).toISOString()).toBe(
      "2026-01-15T11:00:00.000Z",
    );
  });

  /* El día del cambio de hora. Antes el desfase se medía sobre la hora de
     pared leída como UTC, que cae al otro lado de la frontera: las 03:00 de
     Chicago del 1-nov salían como las 02:00 y cada editar→guardar corría el
     turno otra hora. */
  it("Chicago al atrasar el reloj (1-nov-2026): las 03:00 son las 09:00Z", () => {
    expect(instanteEnLaEmpresa("2026-11-01", 3, 0, 0, 0, CHICAGO).toISOString()).toBe(
      "2026-11-01T09:00:00.000Z",
    );
    // 01:30 existe dos veces: gana la primera (todavía en horario de verano).
    expect(instanteEnLaEmpresa("2026-11-01", 1, 30, 0, 0, CHICAGO).toISOString()).toBe(
      "2026-11-01T06:30:00.000Z",
    );
  });

  it("Chicago al adelantar el reloj (8-mar-2026): 02:30 no existe y pasa a las 03:30", () => {
    expect(instanteEnLaEmpresa("2026-03-08", 2, 30, 0, 0, CHICAGO).toISOString()).toBe(
      "2026-03-08T08:30:00.000Z",
    );
    expect(instanteEnLaEmpresa("2026-03-08", 3, 30, 0, 0, CHICAGO).toISOString()).toBe(
      "2026-03-08T08:30:00.000Z",
    );
    expect(instanteEnLaEmpresa("2026-03-08", 4, 0, 0, 0, CHICAGO).toISOString()).toBe(
      "2026-03-08T09:00:00.000Z",
    );
  });

  it("Madrid el día del cambio (29-mar y 25-oct-2026)", () => {
    expect(instanteEnLaEmpresa("2026-03-29", 3, 0, 0, 0, MADRID).toISOString()).toBe(
      "2026-03-29T01:00:00.000Z",
    );
    expect(instanteEnLaEmpresa("2026-03-29", 2, 30, 0, 0, MADRID).toISOString()).toBe(
      "2026-03-29T01:30:00.000Z",
    );
    expect(instanteEnLaEmpresa("2026-10-25", 2, 30, 0, 0, MADRID).toISOString()).toBe(
      "2026-10-25T00:30:00.000Z",
    );
    expect(instanteEnLaEmpresa("2026-10-25", 3, 0, 0, 0, MADRID).toISOString()).toBe(
      "2026-10-25T02:00:00.000Z",
    );
  });

  it("zonas sin cambio de hora no se mueven esos días", () => {
    expect(instanteEnLaEmpresa("2026-11-01", 3, 0, 0, 0, QUITO).toISOString()).toBe(
      "2026-11-01T08:00:00.000Z",
    );
    expect(instanteEnLaEmpresa("2026-10-25", 3, 0, 0, 0, MEX).toISOString()).toBe(
      "2026-10-25T09:00:00.000Z",
    );
  });

  it("editar → guardar en el día del cambio no corre la hora", () => {
    for (const iso of [
      "2026-11-01T09:00:00.000Z",
      "2026-11-01T06:30:00.000Z",
      "2026-11-01T08:00:00.000Z",
      "2026-03-08T09:00:00.000Z",
    ]) {
      expect(desdeInputFechaHora(paraInputFechaHora(iso, CHICAGO), CHICAGO)).toBe(iso);
    }
  });
});

describe("limitesDelDia", () => {
  it("el día de la empresa empieza y acaba donde ella dice", () => {
    const { start, end } = limitesDelDia("2026-09-19", "2026-09-19", MEX);

    expect(start).toBe("2026-09-19T06:00:00.000Z");
    expect(end).toBe("2026-09-20T05:59:59.999Z");
  });

  it("la ronda de las 21:09 entra en el día que le toca", () => {
    const { start, end } = limitesDelDia("2026-09-19", "2026-09-19", MEX);
    const ronda = "2026-09-20T03:09:00.000Z";

    expect(ronda >= start && ronda <= end).toBe(true);
  });
});

describe("ida y vuelta de un campo datetime-local", () => {
  it("lo que se pinta es lo que se vuelve a guardar", () => {
    const iso = "2026-09-22T00:00:00.000Z";
    const enPantalla = paraInputFechaHora(iso, MEX);

    expect(enPantalla).toBe("2026-09-21T18:00");
    expect(desdeInputFechaHora(enPantalla, MEX)).toBe(iso);
  });

  it("aguanta el vacío", () => {
    expect(paraInputFechaHora(null, MEX)).toBe("");
    expect(desdeInputFechaHora("", MEX)).toBe("");
  });
});
