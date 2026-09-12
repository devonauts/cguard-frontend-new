import { describe, it, expect } from "vitest";
import {
  rotationStatusOn,
  nextRestDates,
  weeklyRestWeekday,
  rotationDseOf,
  estadoDeRotacionCliente,
} from "./utils";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LA VISTA PREVIA DE DESCANSOS TIENE QUE PROMETER EL CUADRANTE DE VERDAD
 *
 * Los modales de asignación enseñan «libra el lunes 27» antes de guardar, con
 * el comentario «mira el MISMO ciclo que va a generar el backend». No lo
 * miraba: era aritmética desnuda `dse % ciclo`, y su firma —tres números— hacía
 * estructuralmente imposible pasarle `alternatesDayNight` / `sundayDoubleRest`.
 *
 * Con descanso dominical el ciclo se CORRE un día cada vez que el franco cae en
 * domingo, así que la promesa se apartaba del cuadrante ya al segundo o tercer
 * franco. Ver `horario-una-sola-verdad`: es la regla del rol peruano de CONSEG.
 * ════════════════════════════════════════════════════════════════════════════
 */
const SEIS_UNO = { dayShifts: 6, nightShifts: 0, restDays: 1 };
const dia = (iso: string) => new Date(`${iso}T12:00:00`);

describe("vista previa de descansos · sin reglas se comporta como siempre", () => {
  it("un 6-1 libra cada séptimo día", () => {
    const inicio = dia("2026-09-14"); // lunes
    const fase = rotationDseOf(inicio) % 7;
    const francos = nextRestDates(SEIS_UNO, fase, inicio, 3);

    expect(francos).toHaveLength(3);
    // Siete días entre uno y el siguiente.
    const dif = francos.map((d) => rotationDseOf(d));
    expect(dif[1] - dif[0]).toBe(7);
    expect(dif[2] - dif[1]).toBe(7);
  });
});

describe("vista previa de descansos · con descanso dominical", () => {
  const reglas = { sundayDoubleRest: true, alternatesDayNight: false };

  it("los francos NO caen cada siete días: el ciclo se corre", () => {
    const inicio = dia("2026-09-14");
    const ancla = rotationDseOf(inicio);
    const fase = ancla % 7;

    const sinReglas = nextRestDates(SEIS_UNO, fase, inicio, 4).map(rotationDseOf);
    const conReglas = nextRestDates(SEIS_UNO, fase, inicio, 4, 45, reglas, ancla).map(rotationDseOf);

    expect(conReglas).not.toEqual(sinReglas);
  });

  it("coincide con el espejo que pinta la rejilla del Programador", () => {
    // Es la comprobación que importa: la promesa del modal y el cuadrante
    // dibujado tienen que salir de la misma función.
    const inicio = dia("2026-09-14");
    const ancla = rotationDseOf(inicio);
    const fase = ancla % 7;

    for (let i = 0; i < 40; i++) {
      const d = new Date(inicio);
      d.setDate(d.getDate() + i);
      const porLaVistaPrevia = rotationStatusOn(SEIS_UNO, fase, d, reglas, ancla);
      const porLaRejilla = estadoDeRotacionCliente(
        rotationDseOf(d), ancla, fase, 6, 0, 1, reglas,
      );
      expect(porLaVistaPrevia).toBe(porLaRejilla);
    }
  });

  it("no promete un día fijo de la semana, porque no lo hay", () => {
    const fase = rotationDseOf(dia("2026-09-14")) % 7;

    // Un 6-1 es múltiplo de 7, así que SIN la regla sí hay día fijo…
    expect(weeklyRestWeekday(SEIS_UNO, fase)).not.toBeNull();
    // …y con ella, no: el franco se corre dos días de la semana por vuelta.
    expect(weeklyRestWeekday(SEIS_UNO, fase, reglas)).toBeNull();
  });
});

describe("vista previa de descansos · con alternancia día/noche", () => {
  it("el fijo cambia de mitad tras cada franco", () => {
    const reglas = { alternatesDayNight: true, sundayDoubleRest: false };
    const inicio = dia("2026-09-14");
    const ancla = rotationDseOf(inicio);
    const fase = ancla % 8;
    const siete = { dayShifts: 7, nightShifts: 0, restDays: 1 };

    const estados: string[] = [];
    for (let i = 0; i < 20; i++) {
      const d = new Date(inicio);
      d.setDate(d.getDate() + i);
      estados.push(rotationStatusOn(siete, fase, d, reglas, ancla));
    }
    // Hay días de NOCHE, que la aritmética desnuda nunca produciría con
    // nightShifts = 0.
    expect(estados).toContain("night");
    expect(estados).toContain("day");
  });
});
