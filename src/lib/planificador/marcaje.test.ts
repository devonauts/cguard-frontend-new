/**
 * QA 2026-11-02 (turnos N2): after «rotación −1 día» the draft proposed
 * «Uno ya no cubre el 1 nov», a shift he had already clocked into. The server
 * refuses to delete it (it is the proof of pay) and the whole publish failed.
 * A clocked-in shift is never withdrawn by the draft.
 */
import { describe, expect, it } from "vitest";

import { copiar, falta, limpiar, quitar } from "./motor";
import { planificarPublicacion } from "./publicar";
import { planDesdeHorarioReal } from "./real";

const BASE = "2026-10-05"; // lunes
const DIA = 6;
const iso = (d: number, h: number) =>
  new Date(Date.UTC(2026, 9, 5 + d, h, 0, 0)).toISOString();
const turno = (id: string, guardId: string, d: number, h: number, extra: any = {}) => ({
  id, guardId, stationId: "imp", startTime: iso(d, h), endTime: iso(d, h + 12), status: "planned", ...extra,
});

/** Mathias (day) doubles the night Israel missed — and clocked in to it. */
function overview() {
  const shifts: any[] = [];

  for (let d = 0; d < 14; d++) {
    shifts.push(turno(`m-${d}`, "mathias", d, 7));
    shifts.push(turno(`i-${d}`, "israel", d, 19, d === DIA ? { status: "absent" } : {}));
  }
  shifts.push(turno("ext", "mathias", DIA, 19, { status: "extension", clockedIn: true }));

  return {
    stations: [{ id: "imp", stationName: "IMPERIA", scheduleType: "custom" }],
    positions: [
      { id: "pd", stationId: "imp", type: "fijo", startTime: "07:00", endTime: "19:00" },
      { id: "pn", stationId: "imp", type: "fijo", startTime: "19:00", endTime: "07:00" },
    ],
    assignments: [
      { id: "am", guardId: "mathias", stationId: "imp", status: "active", guard: { fullName: "Mathias" } },
      { id: "ai", guardId: "israel", stationId: "imp", status: "active", guard: { fullName: "Israel" } },
    ],
    shifts,
  };
}

const ctx = {
  tenantId: "T",
  base: BASE,
  hoy: 1,
  dias: 13,
  fechaDe: (d: number) => new Date(Date.UTC(2026, 9, 5 + d)).toISOString().slice(0, 10),
  instanteDe: (d: number, min: number) =>
    new Date(Date.UTC(2026, 9, 5 + d, Math.floor(min / 60), min % 60)).toISOString(),
};
const leer = () => {
  const r = planDesdeHorarioReal(overview(), [], BASE, "UTC", 14);

  limpiar(r.plan, -7, 21);

  return r;
};
const borrados = (pub: ReturnType<typeof planificarPublicacion>) =>
  pub.cambios.flatMap((c) => c.llamadas).filter((l) => l.metodo === "delete").map((l) => l.ruta);

describe("borrador · un turno con marcaje se queda", () => {
  it("the read marks the clocked-in shift", () => {
    const { enlace } = leer();

    expect(enlace.marcados?.ext).toBe(1);
  });

  it("over-covering the post (the absence is undone) keeps it in the draft and never deletes it", () => {
    const { plan, enlace } = leer();
    const b = copiar(plan);
    const israel = b.personas.find((p) => p.nombre === "Israel")!;

    israel.ausencias = [];
    limpiar(b, -7, 21);
    const noche = b.puestos[0].franjas.find((f) => b.franjas[f].ini === 19 * 60)!;

    expect(falta(b, b.puestos[0], noche, DIA)).toBe(-1);
    expect(borrados(planificarPublicacion(plan, b, enlace, ctx))).not.toContain("/tenant/T/shift/ext");
  });

  it("taking it out by hand is not published either: it says why", () => {
    const { plan, enlace } = leer();
    const b = copiar(plan);
    const k = Object.keys(b.cubre).find((x) => x.endsWith(`|${DIA}`))!;

    quitar(b, k, b.cubre[k][0]);
    limpiar(b, -7, 21);
    const pub = planificarPublicacion(plan, b, enlace, ctx);

    expect(borrados(pub)).not.toContain("/tenant/T/shift/ext");
    expect(pub.noPublicables.join(" ")).toMatch(/ya tiene marcaje/);
  });
});
