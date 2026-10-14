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
    ).toEqual({ enElPuesto: 12, descansoMinutos: 45, netas: 11.25 });
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
