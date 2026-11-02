/**
 * Quien DOBLA en su propio puesto (extensión porque el compañero faltó) cubre
 * la franja del que faltó. Caso real: B.A.S., EDIFICIO IMPERIA HORIZONTE,
 * 11 oct 2026 — Israel faltó a la noche y Mathias se quedó; el Planificador
 * seguía cantando «N falta 1».
 */
import { describe, expect, it } from "vitest";

import { copiar, falta, limpiar, quitar } from "./motor";
import { planificarPublicacion } from "./publicar";
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

/* QA 2026-11-01 (G1): the screen runs `limpiar` on every read and every edit.
   It pruned the extension («Mathias already works that day») and «Publicar»
   then deleted the real extension shift, leaving the night with nobody. */
describe("borrador · una extensión real no se pierde al publicar", () => {
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
    const r = planDesdeHorarioReal(overview(true), [], BASE, "UTC", 14);

    limpiar(r.plan, -7, 21);

    return r;
  };
  const noche = (plan: any) => plan.puestos[0].franjas.find((f: string) => plan.franjas[f].ini === 19 * 60)!;

  it("la noche sigue cubierta tras limpiar, como la abre la pantalla", () => {
    const { plan } = leer();

    expect(falta(plan, plan.puestos[0], noche(plan), DIA_FALTA)).toBe(0);
  });

  it("recién abierto no hay nada que publicar", () => {
    const { plan, enlace } = leer();
    const pub = planificarPublicacion(plan, copiar(plan), enlace, ctx);

    expect(pub.cambios.map((c) => c.texto)).toEqual([]);
  });

  it("otro cambio del borrador no borra el turno de la extensión", () => {
    const { plan, enlace } = leer();
    const b = copiar(plan);

    b.personas.find((p) => p.nombre === "Israel")!.manual[10] = "F";
    limpiar(b, -7, 21);
    const pub = planificarPublicacion(plan, b, enlace, ctx);
    const borrados = pub.cambios.flatMap((c) => c.llamadas).filter((l) => l.metodo === "delete");

    expect(borrados.map((l) => l.ruta)).not.toContain("/tenant/T/shift/ext");
  });

  it("quitarla a mano en el borrador sí la retira", () => {
    const { plan, enlace } = leer();
    const b = copiar(plan);
    const k = `${b.puestos[0].id}|${noche(b)}|${DIA_FALTA}`;

    quitar(b, k, b.cubre[k][0]);
    limpiar(b, -7, 21);
    const pub = planificarPublicacion(plan, b, enlace, ctx);

    expect(pub.cambios.flatMap((c) => c.llamadas).map((l) => l.ruta)).toContain("/tenant/T/shift/ext");
  });
});
