import { describe, it, expect } from "vitest";

import {
  fmtDate,
  addDays,
  tzOffsetMs,
  dateToWall,
  wallToDate,
  minLabel,
  segmentize,
  minutosArrastrados,
} from "./scheduleTime";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LAS PRIMERAS PRUEBAS DEL FRONTEND
 *
 * Este proyecto no tenía NINGUNA: ni corredor, ni un solo archivo de prueba. Lo
 * único que verificaba la interfaz era que TypeScript compilara, que dice que
 * los tipos encajan y no dice nada de si la hora sale bien.
 *
 * Se empieza por aquí porque es donde un fallo cuesta caro y no se ve: un turno
 * pintado en el día equivocado, o una hora corrida, no revienta nada — sólo hace
 * que alguien vaya al puesto cuando no toca.
 *
 * Zona de referencia: America/Guayaquil (UTC-5, SIN horario de verano) porque es
 * la de los tenants reales, y Europe/Madrid para lo que sí cambia de hora.
 * ════════════════════════════════════════════════════════════════════════════
 */

const GYE = "America/Guayaquil";
const MAD = "Europe/Madrid";

describe("fecha local, no UTC", () => {
  it("fmtDate usa el día LOCAL — `toISOString` correría el día al oeste de Greenwich", () => {
    // 23:30 local del 29: en UTC ya es el 30 para cualquiera al oeste.
    const d = new Date(2026, 7, 29, 23, 30);

    expect(fmtDate(d)).toBe("2026-08-29");
  });

  it("addDays no arrastra la hora", () => {
    const d = new Date(2026, 7, 29, 7, 0);

    expect(fmtDate(addDays(d, 1))).toBe("2026-08-30");
    expect(fmtDate(addDays(d, -1))).toBe("2026-08-28");
  });

  it("addDays cruza el fin de mes y el fin de año", () => {
    expect(fmtDate(addDays(new Date(2026, 7, 31), 1))).toBe("2026-09-01");
    expect(fmtDate(addDays(new Date(2026, 11, 31), 1))).toBe("2027-01-01");
  });
});

describe("la zona del TENANT manda, no la del navegador", () => {
  it("Guayaquil va cinco horas por detrás de UTC", () => {
    expect(tzOffsetMs(new Date("2026-08-29T12:00:00Z"), GYE)).toBe(
      -5 * 3600000,
    );
  });

  it("un turno guardado a las 00:00 UTC es la NOCHE ANTERIOR en Guayaquil", () => {
    // Es exactamente el caso del turno de EDGARDO: 2026-08-30T00:00Z = 29 a las 19:00.
    const w = dateToWall(new Date("2026-08-30T00:00:00Z"), GYE);

    expect(w.dateStr).toBe("2026-08-29");
    expect(w.minutes).toBe(19 * 60);
  });

  it("ida y vuelta: hora de pared → instante → hora de pared", () => {
    const inst = wallToDate(2026, 8, 29, 19 * 60, GYE);
    const w = dateToWall(inst, GYE);

    expect(w.dateStr).toBe("2026-08-29");
    expect(w.minutes).toBe(19 * 60);
  });

  it("IDA Y VUELTA SIN ZONA: `dateToWall` y `wallToDate` son inversas", () => {
    // La regresión que introduje al extraer: sin zona, `dateToWall` leía LOCAL y
    // `wallToDate` escribía UTC. Un turno de las 08:00 se reescribía como 08:00Z
    // y reaparecía tres horas antes. En producción no se ve —la zona del tenant
    // siempre llega— y por eso hace falta fijarlo aquí.
    const original = new Date(2026, 7, 30, 8, 0);
    const w = dateToWall(original); // sin tz
    const vuelta = wallToDate(2026, 8, 30, w.minutes); // sin tz

    expect(vuelta.getTime()).toBe(original.getTime());
    expect(w.minutes).toBe(8 * 60);
  });

  it("mover +2 h sin zona da exactamente +2 h", () => {
    const original = new Date(2026, 7, 30, 8, 0);
    const w = dateToWall(original);
    const movido = wallToDate(2026, 8, 30, w.minutes + 120);

    expect((movido.getTime() - original.getTime()) / 60000).toBe(120);
  });

  it("sobrevive al cambio de horario de verano (la corrección de dos pasadas)", () => {
    // En Madrid, el 29-mar-2026 los relojes saltan de 02:00 a 03:00.
    const antes = wallToDate(2026, 3, 28, 12 * 60, MAD);
    const despues = wallToDate(2026, 3, 30, 12 * 60, MAD);

    expect(dateToWall(antes, MAD).minutes).toBe(12 * 60);
    expect(dateToWall(despues, MAD).minutes).toBe(12 * 60);
  });
});

describe("minLabel", () => {
  it("formatea minutos absolutos como HH:mm dentro de su día", () => {
    expect(minLabel(0)).toBe("00:00");
    expect(minLabel(7 * 60)).toBe("07:00");
    expect(minLabel(19 * 60 + 30)).toBe("19:30");
  });

  it("un minuto del día siguiente vuelve a empezar en 00:00", () => {
    expect(minLabel(1440)).toBe("00:00");
    expect(minLabel(1440 + 7 * 60)).toBe("07:00");
  });
});

describe("segmentize · el turno que cruza la medianoche", () => {
  it("un diurno cabe en un solo trozo", () => {
    const s = segmentize(7 * 60, 19 * 60, 7);

    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({
      dayIdx: 0,
      top: 420,
      bottom: 1140,
      first: true,
      last: true,
    });
  });

  it("un nocturno 19:00→07:00 se parte en DOS, uno por día", () => {
    const s = segmentize(19 * 60, 24 * 60 + 7 * 60, 7);

    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({
      dayIdx: 0,
      top: 1140,
      bottom: 1440,
      first: true,
      last: false,
    });
    expect(s[1]).toMatchObject({
      dayIdx: 1,
      top: 0,
      bottom: 420,
      first: false,
      last: true,
    });
  });

  it("un 24 h exacto NO genera un tercer trozo vacío al día siguiente", () => {
    // El error clásico: `Math.floor(bAbs / 1440)` en vez de `(bAbs - 1)` mete un
    // trozo de altura cero en el día de después.
    const s = segmentize(0, 1440, 7);

    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ dayIdx: 0, top: 0, bottom: 1440, last: true });
  });

  it("recorta al lienzo: `first`/`last` marcan los extremos VISIBLES", () => {
    // Un nocturno del último día de la semana: su cola cae fuera del lienzo, y
    // el trozo que SÍ se ve cierra la caja. Si `last` fuera false, la esquina
    // quedaría abierta contra el borde. Conducta deliberada, no un descuido.
    const s = segmentize(6 * 1440 + 19 * 60, 7 * 1440 + 7 * 60, 7);

    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({
      dayIdx: 6,
      top: 1140,
      bottom: 1440,
      first: true,
      last: true,
    });
  });

  it("recorta también por la izquierda", () => {
    // La cola de un nocturno que empezó ANTES de la primera columna.
    const s = segmentize(-300, 420, 7);

    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({
      dayIdx: 0,
      top: 0,
      bottom: 420,
      first: true,
      last: true,
    });
  });

  it("un rango vacío o invertido no dibuja nada", () => {
    expect(segmentize(600, 600, 7)).toHaveLength(0);
    expect(segmentize(900, 600, 7)).toHaveLength(0);
  });

  it("sólo el primero lleva `first` y sólo el último `last`", () => {
    const s = segmentize(19 * 60, 2 * 1440 + 60, 7);

    expect(s.map((x) => x.first)).toEqual([true, false, false]);
    expect(s.map((x) => x.last)).toEqual([false, false, true]);
  });
});

describe("minutosArrastrados · el desplazamiento de un arrastre", () => {
  // 36 px por hora = 0,6 px por minuto, que es lo que usa la línea de tiempo.
  const PX = 36 / 60;
  const PASO = 30;

  it("ARRASTRAR HACIA ABAJO RETRASA el turno (el signo que salió al revés)", () => {
    // Ésta es la prueba que faltaba: en producción, arrastrar 72 px hacia abajo
    // ADELANTÓ el turno 3,5 h. Hacia abajo es más tarde. Siempre.
    expect(minutosArrastrados(400, 472, PX, PASO)).toBe(120);
    expect(minutosArrastrados(400, 472, PX, PASO)).toBeGreaterThan(0);
  });

  it("arrastrar hacia arriba adelanta", () => {
    expect(minutosArrastrados(472, 400, PX, PASO)).toBe(-120);
  });

  it("redondea al paso de la rejilla, sin quedarse a medias", () => {
    expect(minutosArrastrados(400, 400 + 5 * PX, PX, PASO)).toBe(0); // 5 min → nada
    expect(minutosArrastrados(400, 400 + 20 * PX, PX, PASO)).toBe(30); // 20 min → 30
    expect(minutosArrastrados(400, 400 + 44 * PX, PX, PASO)).toBe(30); // 44 min → 30
    expect(minutosArrastrados(400, 400 + 46 * PX, PX, PASO)).toBe(60); // 46 min → 60
  });

  it("sin movimiento no hay desplazamiento", () => {
    expect(minutosArrastrados(400, 400, PX, PASO)).toBe(0);
  });

  it("NO se acota a un día: un turno puede moverse más allá de la medianoche", () => {
    // `pointTo` acotaba a [0,1440] y por eso no servía para un desplazamiento.
    // Redondea al MÁS CERCANO, no trunca: 2000 → 2010, no 1980.
    expect(minutosArrastrados(0, 2000 * PX, PX, PASO)).toBe(2010);
    expect(minutosArrastrados(2000 * PX, 0, PX, PASO)).toBeLessThan(-1400);
  });

  it("no revienta con valores imposibles", () => {
    expect(minutosArrastrados(400, 500, 0, PASO)).toBe(0);
    expect(minutosArrastrados(400, 500, PX, 0)).toBe(0);
  });
});
