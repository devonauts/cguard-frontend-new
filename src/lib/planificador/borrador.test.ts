import { describe, expect, it } from "vitest";

import {
  claveDelBorrador,
  estadoDelBorrador,
  firmaDe,
  guardarBorrador,
  leerBorrador,
  olvidarBorrador,
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

class Memoria {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
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

describe("Borrador · guardado en el navegador", () => {
  it("se devuelve si el horario real es el mismo", () => {
    const { plan } = sinohydro();
    const mem = new Memoria();
    const b = copiar(plan);

    b.personas[0].desfase = 1;
    expect(guardarBorrador(mem, "T", { base: "2026-10-05", firma: firmaDe(plan), toques: 1, plan: b }, 1000)).toBe(true);
    const r = leerBorrador(mem, "T", "2026-10-05", firmaDe(copiar(plan)), 2000);

    expect(r.tipo).toBe("ok");
    expect(r.tipo === "ok" && r.plan.personas[0].desfase).toBe(1);
  });

  it("no se devuelve sobre un horario real que cambió, ni en otra semana, ni a otra empresa", () => {
    const { plan } = sinohydro();
    const mem = new Memoria();
    const otro = copiar(plan);

    otro.personas[0].patron = ["N", F];
    guardarBorrador(mem, "T", { base: "2026-10-05", firma: firmaDe(plan), toques: 1, plan }, 1000);
    expect(leerBorrador(mem, "T", "2026-10-05", firmaDe(otro), 2000).tipo).toBe("caducado");
    expect(leerBorrador(mem, "T", "2026-10-12", firmaDe(plan), 2000).tipo).toBe("caducado");
    expect(leerBorrador(mem, "OTRA", "2026-10-05", firmaDe(plan), 2000).tipo).toBe("ninguno");
    expect(leerBorrador(mem, "T", "2026-10-05", firmaDe(plan), 1000 + 8 * 86_400_000).tipo).toBe("caducado");
  });

  it("descartar lo borra; un almacén roto o ausente no rompe nada", () => {
    const { plan } = sinohydro();
    const mem = new Memoria();

    guardarBorrador(mem, "T", { base: "b", firma: "f", toques: 1, plan });
    olvidarBorrador(mem, "T");
    expect(mem.getItem(claveDelBorrador("T"))).toBeNull();

    const roto = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("lleno"); }, removeItem: () => { throw new Error("x"); } };

    expect(guardarBorrador(roto, "T", { base: "b", firma: "f", toques: 1, plan })).toBe(false);
    expect(leerBorrador(roto, "T", "b", "f").tipo).toBe("ninguno");
    expect(() => olvidarBorrador(roto, "T")).not.toThrow();
    expect(leerBorrador(null, "T", "b", "f").tipo).toBe("ninguno");
    mem.setItem(claveDelBorrador("T"), "{no es json");
    expect(leerBorrador(mem, "T", "b", "f").tipo).toBe("ninguno");
  });
});
