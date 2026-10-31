import { describe, expect, it } from "vitest";

import {
  baseParaAbrir,
  borradorCaducado,
  estadoDelBorrador,
} from "./borrador";
import { FRANCO as F, REGLAS_POR_DEFECTO, copiar, type Plan } from "./motor";
import { planificarPublicacion } from "./publicar";
import type { Enlace } from "./real";

const rep = (c: string, n: number) => Array<string>(n).fill(c);
const ctx = {
  tenantId: "T", base: "2026-10-05", hoy: 2, dias: 14,
  fechaDe: (d: number) => new Date(Date.UTC(2026, 9, 5 + d)).toISOString().slice(0, 10),
  instanteDe: (d: number, min: number) => new Date(Date.UTC(2026, 9, 5 + d, Math.floor(min / 60), min % 60)).toISOString(),
};

/** CASA SINOHYDRO en pequeño: una garita, un vigilante en 22-8. */
function sinohydro(): { plan: Plan; enlace: Enlace } {
  const plan: Plan = {
    franjas: { N: { id: "N", nombre: "Nocturna", ini: 1200, fin: 480 } },
    puestos: [{ id: "st1", nombre: "BRAVO 6", franjas: ["N"], pide: { N: [1, 1, 1, 1, 1, 1, 1] } }],
    personas: [
      { id: "a1", nombre: "Juan Rodriguez Flores", puesto: "st1", patron: [...rep("N", 22), ...rep(F, 8)], desfase: 0, manual: {}, ausencias: [] },
    ],
    cubre: {}, auto: {}, no: {}, reglas: { ...REGLAS_POR_DEFECTO },
  };
  const enlace: Enlace = {
    personas: { a1: { guardId: "g1", stationId: "st1", assignmentId: "a1", relevo: false, rotationStyleId: "r228" } },
    puestos: { st1: { postSiteId: "site1", scheduleType: "12h" } },
    turnos: { a1: {} },
    cargadas: {},
    novedades: {},
    eventos: {},
    turnosTodos: {},
  };

  return { plan, enlace };
}

describe("Borrador · ¿está publicado?", () => {
  it("recién cargado no hay nada pendiente ni nada que avisar", () => {
    const { plan, enlace } = sinohydro();
    const pub = planificarPublicacion(plan, copiar(plan), enlace, ctx);

    expect(estadoDelBorrador(pub.cambios.length, 0)).toEqual({ pendientes: 0, sinPublicar: false, avisarAlSalir: false });
  });

  it("correr el ciclo un día deja un cambio sin publicar y frena al salir", () => {
    const { plan, enlace } = sinohydro();
    const b = copiar(plan);

    b.personas[0].desfase = 1;
    const pub = planificarPublicacion(plan, b, enlace, ctx);
    const e = estadoDelBorrador(pub.cambios.length, 1);

    expect(pub.cambios.map((c) => c.tipo)).toContain("rotacion");
    expect(e.sinPublicar).toBe(true);
    expect(e.pendientes).toBe(pub.cambios.length);
    expect(e.avisarAlSalir).toBe(true);
  });

  it("lo que los sacafrancos cubren solos al cargar se enseña, pero no frena a quien sólo mira", () => {
    expect(estadoDelBorrador(3, 0)).toEqual({ pendientes: 3, sinPublicar: true, avisarAlSalir: false });
  });

  it("tocar y deshacer hasta quedar igual que el real ya no avisa", () => {
    expect(estadoDelBorrador(0, 2).avisarAlSalir).toBe(false);
    expect(estadoDelBorrador(null, 2).sinPublicar).toBe(false);
  });
});

describe("Borrador · cuándo se devuelve (ahora vive en el servidor)", () => {
  it("un borrador sin tocar en más de una semana caduca", () => {
    const ahora = Date.parse("2026-10-31T12:00:00Z");

    expect(borradorCaducado("2026-10-30T12:00:00Z", ahora)).toBe(false);
    expect(borradorCaducado("2026-10-23T11:00:00Z", ahora)).toBe(true);
    expect(borradorCaducado(null, ahora)).toBe(false);
  });

  it("abre en el lunes del borrador mientras sus días sigan alineados; si no, en el de hoy", () => {
    expect(baseParaAbrir("2026-10-26", "2026-10-26")).toBe("2026-10-26");
    expect(baseParaAbrir("2026-10-19", "2026-10-26")).toBe("2026-10-19");
    expect(baseParaAbrir("2026-10-12", "2026-10-26")).toBe("2026-10-12");
    // Tres semanas atrás, un lunes «del futuro» o un día que no es lunes: el de hoy.
    expect(baseParaAbrir("2026-10-05", "2026-10-26")).toBe("2026-10-26");
    expect(baseParaAbrir("2026-11-02", "2026-10-26")).toBe("2026-10-26");
    expect(baseParaAbrir("2026-10-21", "2026-10-26")).toBe("2026-10-26");
    expect(baseParaAbrir(null, "2026-10-26")).toBe("2026-10-26");
  });
});
