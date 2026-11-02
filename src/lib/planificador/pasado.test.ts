/**
 * QA 2026-11-02 (turnos N7): «Empezar la rotación un día después» on Uno, at
 * 22:20 of Sunday 1 Nov (Ecuador). The draft drew his worked, clocked-in day
 * shift of 1 Nov as «Franco» and proposed «Tres cubre … el 2026-11-01
 * (Diurna)», a shift that had ended at 19:00. Publishing it would have
 * double-covered — and maybe double-paid — a past day.
 *
 * Rule: what already happened is drawn as it happened, and nothing is
 * published for a shift or a day that is over.
 */
import { describe, expect, it } from "vitest";

import { clave, copiar, limpiar, poner, propio, FRANCO } from "./motor";
import { contextoEnLaEmpresa, planificarPublicacion } from "./publicar";
import { planDesdeHorarioReal } from "./real";

const TZ = "America/Guayaquil"; // UTC-5
const BASE = "2026-10-26"; // Monday; day 6 = Sunday 1 Nov
const HOY = 6;
const AHORA = Date.parse("2026-11-02T03:20:00Z"); // 22:20 on 1 Nov in Ecuador
/** `h` o'clock in Ecuador on day `d`, as an ISO instant. */
const iso = (d: number, h: number) => new Date(Date.UTC(2026, 9, 26 + d, h + 5)).toISOString();
const turno = (id: string, guardId: string, d: number, h: number, extra: any = {}) => ({
  id, guardId, stationId: "qata", startTime: iso(d, h), endTime: iso(d, h + 12), status: "planned", ...extra,
});

function overview() {
  const shifts: any[] = [];

  // Uno: 5-2 by day from Sunday 1 Nov (Sun–Thu), clocked in on the 1st.
  for (const d of [6, 7, 8, 9, 10, 13, 14, 15, 16, 17])
    shifts.push(turno(`u-${d}`, "uno", d, 7, d === HOY ? { clockedIn: true } : {}));
  // Dos: every night.
  for (let d = 0; d < 21; d++) shifts.push(turno(`d-${d}`, "dos", d, 19));

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
  contextoEnLaEmpresa("T", BASE, HOY, 14, (dia, h, m) => {
    const [y, mo, d] = dia.split("-").map(Number);

    return new Date(Date.UTC(y, mo - 1, d, h + 5, m));
  }, AHORA);

const leer = () => {
  const r = planDesdeHorarioReal(overview(), [], BASE, TZ, 21, AHORA);

  limpiar(r.plan, -7, 21);

  return r;
};
const uno = (plan: any) => plan.personas.find((p: any) => p.nombre === "Uno");

describe("borrador · lo que ya pasó se queda como fue", () => {
  it("moving Uno's rotation one day later keeps his worked 1 Nov as a day shift", () => {
    const { plan } = leer();
    const b = copiar(plan);
    const u = uno(b);
    const dia = b.puestos[0].franjas[0];

    expect(propio(u, HOY)).toBe(dia);
    // What the «one day later» button does.
    u.desfase -= 1;
    u.manual = {};
    limpiar(b, -7, 21);

    expect(propio(u, HOY)).toBe(dia);
    // The future did move: Friday 6 Nov was his rest day and now he works it.
    expect(propio(uno(plan), HOY + 5)).toBe(FRANCO);
    expect(propio(u, HOY + 5)).toBe(dia);
  });

  it("a cover of a shift that already ended is never published", () => {
    const { plan, enlace } = leer();
    const b = copiar(plan);
    const pu = b.puestos[0];
    const tres = b.personas.find((p: any) => p.nombre === "Tres")!;

    uno(b).pasado = undefined; // as if the draft dropped him that day
    uno(b).manual[HOY] = FRANCO;
    poner(b, clave(pu.id, pu.franjas[0], HOY), tres.id, true);
    const pub = planificarPublicacion(plan, b, enlace, ctx());

    expect(pub.cambios.map((c) => c.texto).join(" | ")).not.toMatch(/2026-11-01/);
    expect(pub.noPublicables.join(" ")).toMatch(/ya terminó|ya pasó/);
  });

  it("a day that is over is not changed, even edited by hand", () => {
    const { plan, enlace } = leer();
    const b = copiar(plan);

    uno(b).manual[HOY] = FRANCO;
    const pub = planificarPublicacion(plan, b, enlace, ctx());

    expect(pub.cambios.flatMap((c) => c.llamadas).some((l) => JSON.stringify(l).includes("2026-11-01"))).toBe(false);
  });

  it("tomorrow can still be changed", () => {
    const { plan, enlace } = leer();
    const b = copiar(plan);

    uno(b).manual[HOY + 1] = FRANCO;
    const pub = planificarPublicacion(plan, b, enlace, ctx());

    expect(pub.cambios.map((c) => c.texto).join(" | ")).toMatch(/franco el 2026-11-02/);
  });
});
