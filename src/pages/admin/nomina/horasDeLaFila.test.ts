import { describe, expect, it } from "vitest";

import { fmtDescanso, horasDeLaFila } from "./shared";

/**
 * Las horas de una fila de asistencia las calcula el servidor con la regla de
 * la nómina (en el puesto − descanso = netas). La pantalla sólo las lee; el
 * respaldo es para una respuesta vieja sin esos campos.
 */
describe("horas de una fila de asistencia", () => {
  it("usa lo que manda el servidor", () => {
    expect(
      horasDeLaFila({ hoursWorked: 12, breakMinutes: 45, horasEnElPuesto: 12, descansoMinutos: 45, horasNetas: 11.25 }),
    ).toEqual({ enElPuesto: 12, descansoMinutos: 45, netas: 11.25, cubreElTurno: false });
  });

  it("descanso que cubre todo el turno: «sin resolver», no un 0.00 callado", () => {
    expect(
      horasDeLaFila({ horasEnElPuesto: 0.5, descansoMinutos: 30, horasNetas: 0, descansoCubreElTurno: true }).cubreElTurno,
    ).toBe(true);
    // Sin la marca del servidor (respuesta vieja), se deduce igual.
    expect(horasDeLaFila({ horasEnElPuesto: 0.5, descansoMinutos: 45, horasNetas: 0 }).cubreElTurno).toBe(true);
    expect(horasDeLaFila({ hoursWorked: 0.5, breakMinutes: 30 }).cubreElTurno).toBe(true);
    // Fichaje de cero minutos sin descanso, o abierto: no es eso.
    expect(horasDeLaFila({ horasEnElPuesto: 0, descansoMinutos: 0, horasNetas: 0 }).cubreElTurno).toBe(false);
    expect(horasDeLaFila({ horasEnElPuesto: null, descansoMinutos: null, horasNetas: null }).cubreElTurno).toBe(false);
  });

  it("fila abierta: sin horas todavía", () => {
    expect(horasDeLaFila({ hoursWorked: null, horasEnElPuesto: null, descansoMinutos: null, horasNetas: null }).netas).toBeNull();
  });

  it("respaldo: vigilante resta el descanso; supervisión y oficina ya vienen netas", () => {
    expect(horasDeLaFila({ hoursWorked: 12, breakMinutes: 45 }).netas).toBe(11.25);
    expect(horasDeLaFila({ hoursWorked: 7.25, breakMinutes: 45, role: "supervisor" }).netas).toBe(7.25);
  });

  it("el descanso del día se lee de un vistazo", () => {
    expect([fmtDescanso(0), fmtDescanso(45), fmtDescanso(90), fmtDescanso(120)]).toEqual(["—", "45 min", "1 h 30 min", "2 h"]);
  });
});
