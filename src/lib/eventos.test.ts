/**
 * Unit tests — RELEVOS QUE SE SALEN DEL EVENTO (`avisosDeRelevos`).
 *
 * El servidor recorta cada turno al evento; el formulario lo avisa antes de
 * guardar para que nadie crea que un relevo 13:00–17:00 en un concierto que
 * abre a las 15:00 son cuatro horas. Zona fija para no depender del equipo.
 */
import { describe, it, expect } from "vitest";

import { avisosDeRelevos, pasaAlPasado, tonoDeZonaPasada } from "./eventos";

const MEX = "America/Mexico_City"; // UTC-6, sin horario de verano
// Concierto sáb 21 nov 2026, 15:00 → 23:00 en México.
const concierto = {
  serviceType: "event",
  vigenteDesde: "2026-11-21T21:00:00.000Z",
  vigenteHasta: "2026-11-22T05:00:00.000Z",
};
// Feria vie 4 dic 08:00 → dom 6 dic 18:00 en México.
const feria = {
  serviceType: "event",
  vigenteDesde: "2026-12-04T14:00:00.000Z",
  vigenteHasta: "2026-12-07T00:00:00.000Z",
};

const r = (start: string, end: string) => ({ start, end });

describe("avisosDeRelevos", () => {
  it("relevos dentro del evento: sin avisos", () => {
    expect(
      avisosDeRelevos(concierto, [r("15:00", "19:00"), r("19:00", "23:00")], MEX),
    ).toEqual([]);
  });

  it("empieza antes de que abra: dice el relevo y la hora de apertura", () => {
    expect(avisosDeRelevos(concierto, [r("13:00", "17:00")], MEX)).toEqual([
      {
        relevo: "13:00–17:00",
        tipo: "empiezaAntes",
        hora: "15:00",
        variosDias: false,
      },
    ]);
  });

  it("termina después de que cierre (cruzando la medianoche)", () => {
    expect(avisosDeRelevos(concierto, [r("21:00", "01:00")], MEX)).toEqual([
      {
        relevo: "21:00–01:00",
        tipo: "terminaDespues",
        hora: "23:00",
        variosDias: false,
      },
    ]);
  });

  it("un relevo que no toca el evento ningún día se avisa como fuera", () => {
    const a = avisosDeRelevos(concierto, [r("08:00", "12:00")], MEX);

    expect(a.map((x) => x.tipo)).toEqual(["fuera"]);
  });

  it("antes y después a la vez: dos avisos del mismo relevo", () => {
    expect(
      avisosDeRelevos(concierto, [r("12:00", "23:30")], MEX).map((x) => x.tipo),
    ).toEqual(["empiezaAntes", "terminaDespues"]);
  });

  it("evento de varios días: el recorte es del primer o del último día", () => {
    const a = avisosDeRelevos(
      feria,
      [r("06:00", "10:00"), r("16:00", "20:00"), r("10:00", "16:00")],
      MEX,
    );

    expect(a).toEqual([
      {
        relevo: "06:00–10:00",
        tipo: "empiezaAntes",
        hora: "08:00",
        variosDias: true,
      },
      {
        relevo: "16:00–20:00",
        tipo: "terminaDespues",
        hora: "18:00",
        variosDias: true,
      },
    ]);
  });

  it("24 h que arrancan a la hora del evento no se avisan; un relevo repetido, una vez", () => {
    expect(
      avisosDeRelevos(feria, [r("08:00", "20:00"), r("20:00", "08:00")], MEX)
        .length,
    ).toBe(1); // el 08:00–20:00 del domingo termina después de las 18:00
    expect(
      avisosDeRelevos(concierto, [r("13:00", "17:00"), r("13:00", "17:00")], MEX)
        .length,
    ).toBe(1);
  });

  it("sin fechas, nada que avisar", () => {
    expect(avisosDeRelevos({ serviceType: "event" }, [r("13:00", "17:00")])).toEqual(
      [],
    );
  });
});

/* Evento movido al pasado = historial (decisión del dueño, 2026-10-14): el
   asistente lo avisa antes de guardar con el mismo criterio que el servidor. */
describe("pasaAlPasado / tonoDeZonaPasada", () => {
  const ahora = new Date("2026-10-14T18:00:00Z");

  it("de futuro (o en curso) a terminado avisa; corregir uno ya terminado no", () => {
    expect(pasaAlPasado(concierto.vigenteHasta, "2026-09-20T04:00:00Z", ahora)).toBe(true);
    expect(pasaAlPasado(null, "2026-09-20T04:00:00Z", ahora)).toBe(true);
    expect(pasaAlPasado("2026-10-14T20:00:00Z", "2026-10-14T17:00:00Z", ahora)).toBe(true);
    expect(pasaAlPasado("2026-09-20T04:00:00Z", "2026-09-20T06:00:00Z", ahora)).toBe(false);
    expect(pasaAlPasado(concierto.vigenteHasta, feria.vigenteHasta, ahora)).toBe(false);
    expect(pasaAlPasado(concierto.vigenteHasta, "", ahora)).toBe(false);
  });

  it("una zona pasada no sale en rojo: sin gente o en orden, neutra; con faltas, aviso", () => {
    expect(tonoDeZonaPasada(null)).toBe("neutral");
    expect(tonoDeZonaPasada({ personas: [], noFicho: 0, sinSalida: 0 })).toBe("neutral");
    const uno = [{ userId: "a", nombre: "Ana", archivado: false, turnos: [], horas: 0 }];

    expect(tonoDeZonaPasada({ personas: uno, noFicho: 0, sinSalida: 0 })).toBe("neutral");
    expect(tonoDeZonaPasada({ personas: uno, noFicho: 1, sinSalida: 0 })).toBe("warn");
    expect(tonoDeZonaPasada({ personas: uno, noFicho: 0, sinSalida: 2 })).toBe("warn");
  });
});
