/**
 * Quien DOBLA en su propio puesto (extensión porque el compañero faltó) cubre
 * la franja del que faltó. Caso real: B.A.S., EDIFICIO IMPERIA HORIZONTE,
 * 11 oct 2026 — Israel faltó a la noche y Mathias se quedó; el Planificador
 * seguía cantando «N falta 1».
 */
import { describe, expect, it } from "vitest";

import { falta } from "./motor";
import { planDesdeHorarioReal } from "./real";

const BASE = "2026-10-05"; // lunes
const DIA_FALTA = 6;
const iso = (d: number, h: number) =>
  new Date(Date.UTC(2026, 9, 5 + d, h, 0, 0)).toISOString();
const turno = (id: string, guardId: string, d: number, h: number, status = "planned") => ({
  id, guardId, stationId: "imp", startTime: iso(d, h), endTime: iso(d, h + 12), status,
});

function overview(conExtension: boolean) {
  const shifts: any[] = [];

  for (let d = 0; d < 14; d++) {
    shifts.push(turno(`m-${d}`, "mathias", d, 7));
    shifts.push(turno(`i-${d}`, "israel", d, 19, d === DIA_FALTA ? "absent" : "planned"));
  }
  if (conExtension) shifts.push(turno("ext", "mathias", DIA_FALTA, 19, "extension"));

  return {
    stations: [{ id: "imp", stationName: "EDIFICIO IMPERIA HORIZONTE", scheduleType: "custom" }],
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

const nocheSinCubrir = (conExtension: boolean) => {
  const { plan } = planDesdeHorarioReal(overview(conExtension), [], BASE, "UTC", 14);
  const pu = plan.puestos[0];
  const noche = pu.franjas.find((f) => plan.franjas[f].ini === 19 * 60)!;

  return falta(plan, pu, noche, DIA_FALTA);
};

describe("lector · doblar en el propio puesto", () => {
  it("sin nadie que se quede, la noche del que faltó queda sin cubrir", () => {
    expect(nocheSinCubrir(false)).toBe(1);
  });

  it("la extensión del compañero cubre esa noche", () => {
    expect(nocheSinCubrir(true)).toBe(0);
  });
});
