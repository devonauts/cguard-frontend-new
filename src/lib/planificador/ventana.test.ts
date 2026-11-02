/**
 * QA 2026-11-02 (turnos N10, N11).
 *
 * N10: the same draft (Uno's rotation one day later) showed «Publicar 12»
 * from the weeks of 2 or 9 Nov but «Publicar 11» from 26 Oct–1 Nov: the
 * fixed sacafranco's cover of Sunday 13 Dec was only computed for the sheet
 * on screen, so publishing from an earlier week left that Sunday uncovered.
 *
 * N11: a click on a day that already happened changed nothing on screen but
 * was still saved and counted as an edit.
 */
import { describe, expect, it } from "vitest";

import { FRANCO, copiar, diaPasado, limpiar, ventanaDelMotor } from "./motor";
import { contextoEnLaEmpresa, planificarPublicacion } from "./publicar";
import { planDesdeHorarioReal } from "./real";

const TZ = "America/Guayaquil"; // UTC-5
const BASE = "2026-11-02"; // Monday = day 0 = today
const HOY = 0;
const AHORA = Date.parse("2026-11-02T05:30:00Z"); // 00:30 on Monday 2 Nov in Ecuador
// The screen's sheet: ten days back, six weeks ahead; publish = six weeks from today.
const ANTES = 10;
const DESPUES = 42;
const iso = (d: number, h: number) =>
  new Date(Date.UTC(2026, 10, 2 + d, h + 5)).toISOString();
const turno = (id: string, guardId: string, d: number, h: number) => ({
  id, guardId, stationId: "qata", startTime: iso(d, h), endTime: iso(d, h + 12), status: "planned",
});

function overview() {
  const shifts: any[] = [];

  // Uno: 5-2 by day from Sunday 1 Nov (works Sun–Thu, rests Fri–Sat).
  for (let d = -1; d < 60; d++)
    if ((((d + 1) % 7) + 7) % 7 < 5) shifts.push(turno(`u-${d}`, "uno", d, 7));
  // Dos: every night.
  for (let d = -10; d < 60; d++) shifts.push(turno(`d-${d}`, "dos", d, 19));

  return {
    stations: [{ id: "qata", stationName: "QA turnos Estación A", scheduleType: "24h" }],
    positions: [
      { id: "p1", stationId: "qata", type: "fijo", startTime: "07:00", endTime: "19:00" },
      { id: "p2", stationId: "qata", type: "fijo", startTime: "19:00", endTime: "07:00" },
    ],
    assignments: [
      { id: "a-uno", guardId: "uno", stationId: "qata", positionId: "p1", status: "active", startDate: "2026-11-01", guard: { fullName: "Uno" } },
      { id: "a-dos", guardId: "dos", stationId: "qata", positionId: "p2", status: "active", startDate: "2026-10-01", guard: { fullName: "Dos" } },
      { id: "a-tres", guardId: "tres", stationId: "qata", status: "active", isRelief: true, startDate: "2026-10-01", coveredStationIds: ["qata"], guard: { fullName: "Tres" } },
    ],
    shifts,
  };
}

const ctx = () =>
  contextoEnLaEmpresa("T", BASE, HOY, DESPUES, (dia, h, m) => {
    const [y, mo, d] = dia.split("-").map(Number);

    return new Date(Date.UTC(y, mo - 1, d, h + 5, m));
  }, AHORA);

const leer = () => {
  const r = planDesdeHorarioReal(overview(), [], BASE, TZ, 60, AHORA);

  limpiar(r.plan, ...ventanaDelMotor(0, HOY, ANTES, DESPUES));

  return r;
};
const uno = (plan: any) => plan.personas.find((p: any) => p.nombre === "Uno");
/** Uno › «Empezar la rotación un día después». */
const unDiaDespues = (plan: any) => {
  const b = copiar(plan);

  uno(b).desfase -= 1;
  uno(b).manual = {};

  return b;
};
/** What «Publicar» lists with the week starting on day `vista` on screen. */
const publicarDesde = (
  leido: ReturnType<typeof leer>,
  borrador: any,
  ventana: [number, number],
) => {
  const b = copiar(borrador);

  limpiar(b, ...ventana);

  return planificarPublicacion(leido.plan, b, leido.enlace, ctx())
    .cambios.map((c) => c.texto)
    .sort();
};

describe("borrador · lo que se publica no depende de la semana a la vista", () => {
  it("lists the same changes from any week on screen, the last Sunday included", () => {
    const leido = leer();
    const b = unDiaDespues(leido.plan);
    const desdeHoy = publicarDesde(leido, b, ventanaDelMotor(0, HOY, ANTES, DESPUES));

    // The edge the QA saw: a cover on Sunday 13 Dec (day 41), the last published day.
    expect(desdeHoy.some((x) => /Tres cubre .*2026-12-13/.test(x))).toBe(true);
    for (const vista of [-14, -7, 7, 14, 35])
      expect(publicarDesde(leido, b, ventanaDelMotor(vista, HOY, ANTES, DESPUES))).toEqual(desdeHoy);
  });

  it("the old sheet-only window lost that Sunday (the fixture catches the bug)", () => {
    const leido = leer();
    const b = unDiaDespues(leido.plan);
    const desdeHoy = publicarDesde(leido, b, ventanaDelMotor(0, HOY, ANTES, DESPUES));
    const semanaAnterior = publicarDesde(leido, b, [-7 - ANTES, -7 + DESPUES]);

    expect(semanaAnterior.length).toBeLessThan(desdeHoy.length);
    expect(semanaAnterior.some((x) => /2026-12-13/.test(x))).toBe(false);
  });

  it("a hand edit after the publish horizon is not dropped silently", () => {
    const leido = leer();
    const b = copiar(leido.plan);

    uno(b).manual[45] = FRANCO; // Thursday 17 Dec
    limpiar(b, ...ventanaDelMotor(42, HOY, ANTES, DESPUES));
    const pub = planificarPublicacion(leido.plan, b, leido.enlace, ctx());

    expect(pub.cambios.map((c) => c.texto).join(" | ")).not.toMatch(/2026-12-17/);
    expect(pub.noPublicables.join(" | ")).toMatch(
      /Uno: lo cambiado desde el 2026-12-17 se queda en el borrador; se publica hasta el 2026-12-13/,
    );
  });

  it("the engine's own covers after the horizon are not reported as edits", () => {
    const leido = leer();
    const b = copiar(leido.plan);

    limpiar(b, ...ventanaDelMotor(42, HOY, ANTES, DESPUES));
    const pub = planificarPublicacion(leido.plan, b, leido.enlace, ctx());

    expect(pub.noPublicables.join(" | ")).not.toMatch(/se queda en el borrador; se publica hasta/);
  });
});

describe("borrador · un día pasado no se edita (N11)", () => {
  it("before today is past; today only once that person's shifts ended", () => {
    const { plan } = leer();
    const u = uno(plan);

    expect(diaPasado(plan, u.id, -1, HOY)).toBe(true);
    expect(diaPasado(plan, u.id, HOY, HOY)).toBe(false);
    expect(diaPasado(plan, u.id, HOY + 1, HOY)).toBe(false);
    u.pasado = { ...(u.pasado || {}), [HOY]: FRANCO };
    expect(diaPasado(plan, u.id, HOY, HOY)).toBe(true);
  });
});
