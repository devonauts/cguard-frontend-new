/**
 * Unit tests — RELEVOS QUE SE SALEN DEL EVENTO (`avisosDeRelevos`).
 *
 * El servidor recorta cada turno al evento; el formulario lo avisa antes de
 * guardar para que nadie crea que un relevo 13:00–17:00 en un concierto que
 * abre a las 15:00 son cuatro horas. Zona fija para no depender del equipo.
 */
import { describe, it, expect } from "vitest";

import {
  avisosDeRelevos,
  avisosDeVueltaAlFuturo,
  configParaGuardar,
  pasaAlPasado,
  separarCoincidentes,
  tonoDeZonaPasada,
  vuelveAlFuturo,
} from "./eventos";

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

/* Un evento pasado que vuelve al futuro («me equivoqué de fecha»): el servidor
   reabre lo que cerró el paso a historial; el asistente lo cuenta. */
describe("vuelveAlFuturo / avisosDeVueltaAlFuturo", () => {
  const ahora = new Date("2026-10-14T18:00:00Z");
  // Un `t` de mentira: interpola el texto por defecto, como i18next sin claves.
  const t = (_k: string, o: Record<string, unknown>) =>
    String(o.defaultValue).replace(/{{(\w+)}}/g, (_, n) => String(o[n]));

  it("sólo de terminado a futuro", () => {
    expect(vuelveAlFuturo("2026-09-20T04:00:00Z", "2026-11-22T05:00:00Z", ahora)).toBe(true);
    expect(vuelveAlFuturo("2026-10-14T18:00:00Z", "2026-10-14T19:00:00Z", ahora)).toBe(true);
    expect(vuelveAlFuturo("2026-11-01T04:00:00Z", "2026-11-22T05:00:00Z", ahora)).toBe(false);
    expect(vuelveAlFuturo("2026-09-20T04:00:00Z", "2026-09-21T04:00:00Z", ahora)).toBe(false);
    expect(vuelveAlFuturo(null, "2026-11-22T05:00:00Z", ahora)).toBe(false);
  });

  it("cuenta lo que se reabrió, quién volvió y lo que hay que reasignar", () => {
    expect(
      avisosDeVueltaAlFuturo(
        { reabiertas: 3, reactivados: [{ userId: "a", nombre: "Ana" }, { userId: "b", nombre: "Luis" }], sinRecuperar: 1 },
        t,
      ),
    ).toEqual({
      info: "El evento vuelve a estar activo: se reabrieron 3 asignaciones y volvieron 2 vigilantes (Ana, Luis).",
      aviso: "1 asignaciones no se pudieron recuperar: vuelve a asignarlas.",
    });
    expect(avisosDeVueltaAlFuturo({ reabiertas: 2, reactivados: [], sinRecuperar: 0 }, t)).toEqual({
      info: "El evento vuelve a estar activo: se reabrieron 2 asignaciones.",
      aviso: null,
    });
    expect(avisosDeVueltaAlFuturo({ reabiertas: 0, reactivados: [], sinRecuperar: 4 }, t)?.info).toBe(
      "El evento vuelve a estar activo.",
    );
    expect(avisosDeVueltaAlFuturo(undefined, t)).toBeNull();
  });
});

/* El servidor guarda `serviceConfig` entero: el asistente no puede mandar sólo
   lo de su formulario ni una copia vieja de lo que apunta el servidor. */
describe("configParaGuardar", () => {
  it("conserva las claves que el formulario no conoce y pone encima lo editado", () => {
    expect(
      configParaGuardar(
        { riskLevel: "alto", claveRara: 7, archivarAlTerminar: true },
        { riskLevel: "bajo", archivarAlTerminar: false, uniforme: "negro" },
      ),
    ).toEqual({ riskLevel: "bajo", claveRara: 7, archivarAlTerminar: false, uniforme: "negro" });
  });

  it("las claves del servidor mandan desde su copia, aunque el formulario traiga otra", () => {
    const servidor = {
      cerradasAlPasarAHistorial: ["a1", "a2"],
      archivadoAlTerminarEn: "2026-10-14T18:00:00Z",
      tarifaHora: 22.5,
    };
    // El formulario se cargó antes de pasar a historial: no traía el rastro,
    // y sí una marca de vuelta al futuro que el servidor ya no tiene.
    const formulario = { devueltoAlFuturoEn: "2026-10-01T00:00:00Z", tarifaHora: 18, instrucciones: "x" };

    expect(configParaGuardar(servidor, formulario)).toEqual({
      cerradasAlPasarAHistorial: ["a1", "a2"],
      archivadoAlTerminarEn: "2026-10-14T18:00:00Z",
      tarifaHora: 22.5,
      instrucciones: "x",
    });
  });

  it("sin copia del servidor (sede nueva) va lo del formulario; acepta JSON en texto", () => {
    expect(configParaGuardar(null, { a: 1 })).toEqual({ a: 1 });
    expect(configParaGuardar('{"b":2,"tarifaHora":10}', { a: 1 })).toEqual({ a: 1, b: 2, tarifaHora: 10 });
  });
});

describe("separarCoincidentes", () => {
  it("separa las zonas en el mismo punto y deja las demás donde están", () => {
    const zs = [
      { id: "a", lat: 19.4, lng: -99.1 },
      { id: "b", lat: 19.4, lng: -99.1 },
      { id: "c", lat: 19.5, lng: -99.2 },
    ];
    const r = separarCoincidentes(zs);

    expect(r[2]).toEqual(zs[2]);
    expect(r[0].id).toBe("a");
    expect(`${r[0].lat},${r[0].lng}`).not.toBe(`${r[1].lat},${r[1].lng}`);
    // Cerca del punto original (menos de ~15 m) y siempre igual.
    for (const x of r.slice(0, 2)) {
      expect(Math.abs(x.lat - 19.4)).toBeLessThan(0.00015);
      expect(Math.abs(x.lng + 99.1)).toBeLessThan(0.00015);
    }
    expect(separarCoincidentes(zs)).toEqual(r);
  });
});
