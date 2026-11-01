import { describe, expect, it } from "vitest";

import { FRANCO as F, LIBRE as L, REGLAS_POR_DEFECTO, copiar, poner, clave, type Plan } from "./motor";
import { formaDeCiclo, planificarPublicacion, publicar, type Api } from "./publicar";
import type { Enlace } from "./real";

const rep = (c: string, n: number) => Array<string>(n).fill(c);
const ctx = {
  tenantId: "T", base: "2026-10-05", hoy: 2, dias: 14,
  fechaDe: (d: number) => { const x = new Date(Date.UTC(2026, 9, 5 + d)); return x.toISOString().slice(0, 10); },
  instanteDe: (d: number, min: number) => new Date(Date.UTC(2026, 9, 5 + d, Math.floor(min / 60), min % 60)).toISOString(),
};
function base(): { plan: Plan; enlace: Enlace } {
  const plan: Plan = {
    franjas: { D: { id: "D", nombre: "Diurna", ini: 420, fin: 1140 }, N: { id: "N", nombre: "Nocturna", ini: 1140, fin: 420 } },
    puestos: [{ id: "st1", nombre: "Garita", franjas: ["D", "N"], pide: { D: [1, 1, 1, 1, 1, 1, 1], N: [1, 1, 1, 1, 1, 1, 1] } }],
    personas: [
      { id: "a1", nombre: "Ana Pérez", puesto: "st1", patron: [...rep("D", 5), F, F], desfase: 0, manual: {}, ausencias: [] },
      { id: "a2", nombre: "Beto Ruiz", puesto: "st1", patron: [...rep("N", 5), F, F], desfase: 0, manual: {}, ausencias: [] },
      { id: "s1", nombre: "Saca Franco", puesto: null, patron: [...rep(L, 6), F], desfase: 0, manual: {}, fijos: ["st1"], ausencias: [] },
    ],
    cubre: {}, auto: {}, no: {}, reglas: { ...REGLAS_POR_DEFECTO },
  };
  const enlace: Enlace = {
    personas: { a1: { guardId: "g1", stationId: "st1", assignmentId: "a1", relevo: false, rotationStyleId: "r52" }, a2: { guardId: "g2", stationId: "st1", assignmentId: "a2", relevo: false, rotationStyleId: "r52" }, s1: { guardId: "g3", stationId: "st1", assignmentId: "s1", relevo: true, rotationStyleId: null } },
    puestos: { st1: { postSiteId: "site1", scheduleType: "24h" } },
    turnos: { a1: {}, a2: {}, s1: { 5: { id: "sh-real", stationId: "st1" } } },
    cargadas: { "s1|5": "sh-real" },
    novedades: {},
    eventos: {},
    turnosTodos: { s1: { 5: [{ id: "sh-real", stationId: "st1", min: 420 }] } },
  };

  poner(plan, clave("st1", "D", 5), "s1", false);

  return { plan, enlace };
}

describe("Publicar · la forma del ciclo", () => {
  it("reconoce tantos de día, tantos de noche, tantos de franco, empiece por donde empiece", () => {
    expect(formaDeCiclo([...rep("D", 5), F, F])).toMatchObject({ a: "D", b: null, x: 5, y: 0, z: 2, giro: 0 });
    expect(formaDeCiclo([F, F, ...rep("D", 5)])).toMatchObject({ a: "D", x: 5, z: 2, giro: 2 });
    expect(formaDeCiclo(["D", "D", "N", "N", F, F])).toMatchObject({ a: "D", b: "N", x: 2, y: 2, z: 2 });
    expect(formaDeCiclo(["D"])).toMatchObject({ x: 1, z: 0 });
  });
  it("rechaza lo que el horario real no genera", () => {
    expect(formaDeCiclo(["D", F, "D", "D", F])).toBeNull();
    expect(formaDeCiclo([F, F])).toBeNull();
    expect(formaDeCiclo(["D", "N", "D", F])).toBeNull();
    expect(formaDeCiclo([])).toBeNull();
  });
});

describe("Publicar · del borrador a llamadas", () => {
  it("sin cambios no hay nada que publicar", () => {
    const { plan, enlace } = base();
    const pub = planificarPublicacion(plan, copiar(plan), enlace, ctx);

    expect(pub.cambios).toEqual([]);
    expect(pub.noPublicables).toEqual([]);
  });

  it("una cobertura nueva es un turno; quitar una que existía borra ese turno", () => {
    const { plan, enlace } = base();
    const b = copiar(plan);

    poner(b, clave("st1", "D", 6), "s1", false);
    delete b.cubre[clave("st1", "D", 5)];
    const pub = planificarPublicacion(plan, b, enlace, ctx);

    expect(pub.cambios.map((c) => c.tipo)).toEqual(["quitarTurno", "turno"]);
    expect(pub.cambios[0].llamadas[0]).toEqual({ metodo: "delete", ruta: "/tenant/T/shift/sh-real" });
    expect(pub.cambios[1].llamadas[0].cuerpo.data).toMatchObject({ station: "st1", guard: "g3", postSiteId: "site1", startTime: "2026-10-11T07:00:00.000Z", endTime: "2026-10-11T19:00:00.000Z" });
  });

  it("una ausencia es una novedad por día, sólo de hoy en adelante", () => {
    const { plan, enlace } = base();
    const b = copiar(plan);

    b.personas[0].ausencias = [{ desde: 0, hasta: 4, tipo: "vacaciones" }];
    const pub = planificarPublicacion(plan, b, enlace, ctx);
    const novedades = pub.cambios.filter((c) => c.tipo === "novedad");

    expect(novedades).toHaveLength(3); // días 2, 3 y 4
    expect(novedades[0].llamadas[0].cuerpo.data).toMatchObject({ guardId: "g1", assignmentId: "a1", date: "2026-10-07", type: "V" });
  });

  it("un franco suelto es una novedad F; trabajar en un franco es un turno", () => {
    const { plan, enlace } = base();
    const b = copiar(plan);

    b.personas[0].manual[3] = F;
    b.personas[0].manual[5] = "D";
    const pub = planificarPublicacion(plan, b, enlace, ctx);

    // «L» es libre; «F» en el Horario es FALTA (y abría una novedad disciplinaria).
    expect(pub.cambios.find((c) => c.tipo === "novedad")?.llamadas[0].cuerpo.data).toMatchObject({ date: "2026-10-08", type: "L" });
    expect(pub.cambios.find((c) => c.tipo === "turno" && c.texto.startsWith("Ana"))?.llamadas[0].cuerpo.data).toMatchObject({ guard: "g1", startTime: "2026-10-10T07:00:00.000Z" });
  });

  it("una rotación nueva crea (o reutiliza) el ciclo y lo enlaza con fecha de inicio", async () => {
    const { plan, enlace } = base();
    const b = copiar(plan);

    b.personas[0].patron = ["D", "D", "N", "N", F, F];
    b.personas[0].desfase = 0;
    const pub = planificarPublicacion(plan, b, enlace, ctx);
    const rot = pub.cambios.find((c) => c.tipo === "rotacion")!;

    expect(rot.llamadas[0].cuerpo.data).toMatchObject({ dayShifts: 2, nightShifts: 2, restDays: 2, reuseIfExists: true });
    // El día 0 del ciclo cae en el primer día ≥ hoy donde el patrón empieza: el 6 (índice 6 % 6 = 0).
    expect(rot.llamadas[1].cuerpo.data.startDate).toBe("2026-10-11");
    const hechas: any[] = [];
    const api: Api = {
      post: async (r, c) => { hechas.push(["post", r, c]); return r.endsWith("rotation-style") ? { id: "rot-nuevo" } : {}; },
      put: async (r, c) => { hechas.push(["put", r, c]); },
      del: async (r) => { hechas.push(["delete", r]); },
    };
    const fallos = await publicar(pub, api);

    expect(fallos).toEqual([]);
    expect(hechas[1][2].data).toMatchObject({ rotationStyleId: "rot-nuevo", startDate: "2026-10-11" });
  });

  it("a quien está sin plaza (ad hoc) no se le publica una rotación: el generador no la usaría", () => {
    const { plan, enlace } = base();
    const b = copiar(plan);

    enlace.personas.a1.conPlaza = false;
    b.personas[0].patron = ["D", "D", "N", "N", F, F];
    const pub = planificarPublicacion(plan, b, enlace, ctx);

    expect(pub.cambios.filter((c) => c.tipo === "rotacion")).toEqual([]);
    expect(pub.noPublicables.join("\n")).toMatch(/sin puesto/);
  });

  it("un ciclo con dos bloques de trabajo (1-2-2-2) se publica como secuencia libre", () => {
    const { plan, enlace } = base();
    const b = copiar(plan);

    // Lunes 24 h, dos libres, dos días, dos libres: no cabe en tres números.
    b.personas[0].patron = ["D", F, F, "D", "D", F, F];
    b.personas[0].desfase = 0;
    const pub = planificarPublicacion(plan, b, enlace, ctx);
    const rot = pub.cambios.find((c) => c.tipo === "rotacion")!;

    expect(pub.noPublicables).toEqual([]);
    expect(rot.llamadas[0].cuerpo.data).toMatchObject({ sequence: "DLLDDLL", name: "1-2-2-2", reuseIfExists: true });
    expect(rot.llamadas[0].cuerpo.data.dayShifts).toBeUndefined();
    // El día 0 de la secuencia: el primer día ≥ hoy donde el patrón arranca (índice 7 % 7 = 0).
    expect(rot.llamadas[1].cuerpo.data).toMatchObject({ rotationStyleId: "$ROTACION", startDate: "2026-10-12" });
  });

  it("lo que el horario real no sabe hacer se dice, no se escribe", () => {
    const { plan, enlace } = base();
    const b = copiar(plan);

    // Un tercer código que no es franja del puesto: ni tres números ni secuencia.
    b.personas[0].patron = ["D", F, "X", "D", F];
    b.puestos[0].pide.D = [2, 2, 2, 2, 2, 2, 2];
    b.personas.push({ id: "nuevo-1", nombre: "Nuevo", puesto: null, patron: [L], desfase: 0, manual: {}, fijos: ["st1"], ausencias: [] });
    const pub = planificarPublicacion(plan, b, enlace, ctx);

    expect(pub.cambios).toEqual([]);
    expect(pub.noPublicables).toHaveLength(3);
    expect(pub.noPublicables.join("\n")).toMatch(/más de dos tramos/);
    expect(pub.noPublicables.join("\n")).toMatch(/una persona por turno/);
    expect(pub.noPublicables.join("\n")).toMatch(/persona nueva/);
  });

  it("una falta con reemplazo en el borrador viaja en UNA llamada, sin turno aparte", () => {
    const { plan, enlace } = base();

    enlace.turnos.a1 = { 2: { id: "sh-a1-2", stationId: "st1" } };
    enlace.turnosTodos.a1 = { 2: [{ id: "sh-a1-2", stationId: "st1", min: 420 }] };
    const b = copiar(plan);

    b.personas[0].ausencias = [{ desde: 2, hasta: 2, tipo: "falta" }];
    poner(b, clave("st1", "D", 2), "s1", false);
    const pub = planificarPublicacion(plan, b, enlace, ctx);
    const novedad = pub.cambios.find((c) => c.tipo === "novedad")!;

    expect(novedad.llamadas[0].cuerpo).toMatchObject({ guardId: "g1", shiftId: "sh-a1-2", reason: "no_call_no_show", coveringGuardId: "g3", allowRestDay: true });
    expect(novedad.texto).toMatch(/cubre Saca/);
    expect(novedad.quien).toBe("Ana Pérez");
    // El turno de cobertura NO va aparte: lo abre el servidor con la falta.
    expect(pub.cambios.filter((c) => c.tipo === "turno")).toHaveLength(0);
  });

  it("unas vacaciones con turno real llevan el reemplazo; sin turno real, la cobertura va como turno", () => {
    const { plan, enlace } = base();

    enlace.turnos.a1 = { 2: { id: "sh-a1-2", stationId: "st1" } };
    const b = copiar(plan);

    b.personas[0].ausencias = [{ desde: 2, hasta: 3, tipo: "vacaciones" }];
    poner(b, clave("st1", "D", 2), "s1", false);
    poner(b, clave("st1", "D", 3), "s1", false);
    const pub = planificarPublicacion(plan, b, enlace, ctx);
    const novedades = pub.cambios.filter((c) => c.tipo === "novedad");

    expect(novedades[0].llamadas[0].cuerpo.data).toMatchObject({ date: "2026-10-07", type: "V", coveringGuardId: "g3" });
    expect(novedades[1].llamadas[0].cuerpo.data).not.toHaveProperty("coveringGuardId");
    const turnos = pub.cambios.filter((c) => c.tipo === "turno");

    expect(turnos).toHaveLength(1);
    expect(turnos[0].llamadas[0].cuerpo.data).toMatchObject({ guard: "g3", startTime: "2026-10-08T07:00:00.000Z" });
  });

  it("cubrir una falta con novedad abierta va por la novedad y deja pasar el franco", () => {
    const { plan, enlace } = base();

    enlace.eventos["st1|2"] = "ev-1";
    const b = copiar(plan);

    poner(b, clave("st1", "D", 2), "s1", false);
    const pub = planificarPublicacion(plan, b, enlace, ctx);
    const turno = pub.cambios.find((c) => c.tipo === "turno")!;

    expect(turno.llamadas[0]).toEqual({ metodo: "post", ruta: "/tenant/T/coverage/events/ev-1/cover", cuerpo: { coveringGuardId: "g3", allowRestDay: true } });
  });

  it("publica las tandas independientes de a varios y lo estructural de uno en uno", async () => {
    const { plan, enlace } = base();
    const b = copiar(plan);

    for (let d = 6; d < 13; d++) poner(b, clave("st1", "D", d), "s1", false);
    const pub = planificarPublicacion(plan, b, enlace, ctx);
    let enVuelo = 0;
    let pico = 0;
    const api: Api = {
      post: async () => { pico = Math.max(pico, ++enVuelo); await new Promise((r) => setTimeout(r, 2)); enVuelo--; return {}; },
      put: async () => {},
      del: async () => {},
    };
    const avisos: number[] = [];
    const fallos = await publicar(pub, api, (h) => avisos.push(h));

    expect(fallos).toEqual([]);
    expect(pub.cambios.length).toBeGreaterThanOrEqual(7);
    expect(pico).toBeGreaterThan(1);
    expect(pico).toBeLessThanOrEqual(4);
    expect(avisos.at(-1)).toBe(pub.cambios.length);
  });

  it("un fallo del servidor no para el resto y se cuenta", async () => {
    const { plan, enlace } = base();
    const b = copiar(plan);

    poner(b, clave("st1", "D", 6), "s1", false);
    poner(b, clave("st1", "N", 7), "s1", false);
    const pub = planificarPublicacion(plan, b, enlace, ctx);
    let n = 0;
    const api: Api = { post: async () => { if (++n === 1) throw new Error("solapa"); return {}; }, put: async () => {}, del: async () => {} };
    const fallos = await publicar(pub, api);

    expect(fallos).toHaveLength(1);
    expect(fallos[0]).toMatch(/solapa/);
    expect(n).toBe(2);
  });
});
