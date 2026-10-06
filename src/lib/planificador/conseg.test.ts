/**
 * EL CASO CONSEG (Perú): 7 de día, franco, 7 de noche, franco… y si el franco
 * cae en domingo, el lunes también. Las filas esperadas son las REALES del rol
 * de agosto de 2026 (las mismas que fijan el motor del servidor en
 * `backend/tests/unit/schedule-horizon/descansoDominical.test.ts`).
 */
import { describe, expect, it } from "vitest";

import { FRANCO as F, LIBRE as L, REGLAS_POR_DEFECTO, aplicarFijos, diaDeSemana, propio, proximoArranque, resumen, type Persona, type Plan } from "./motor";
import { formaDeCiclo, planificarPublicacion } from "./publicar";
import type { Enlace } from "./real";

const rep = (c: string, n: number) => Array<string>(n).fill(c);
/** Día 0 = lunes 27 de julio de 2026; el 1 de agosto (sábado) es el día 5. */
const AGO = (dia: number) => 5 + (dia - 1);
const persona = (over: Partial<Persona> = {}): Persona => ({
  id: "medina", nombre: "Medina Rodríguez", puesto: "bausate", patron: [...rep("D", 7), F, ...rep("N", 7), F],
  desfase: -AGO(1), manual: {}, ausencias: [], francoDobleDomingo: true, ...over,
});
const mes = (p: Persona, desde: number, hasta: number) =>
  Array.from({ length: hasta - desde + 1 }, (_, i) => { const c = propio(p, AGO(desde + i)); return c === F ? "S" : c; }).join("");

describe("CONSEG · el rol peruano", () => {
  it("el 1 de agosto de 2026 fue sábado y el 2, 9 y 16 domingos", () => {
    expect(diaDeSemana(AGO(1))).toBe(5);
    expect([2, 9, 16].map((d) => diaDeSemana(AGO(d)))).toEqual([6, 6, 6]);
  });

  it("MEDINA RODRÍGUEZ (Transmar Bausate): 7 días · S · 7 noches · S+S · 7 días · S", () => {
    // Su fila real del 1 al 25 de agosto: 1-7 D · 8 S · 9-15 N · 16-17 S S · 18-24 D · 25 S
    expect(mes(persona(), 1, 25)).toBe("DDDDDDD" + "S" + "NNNNNNN" + "SS" + "DDDDDDD" + "S");
  });

  it("el franco dobla SÓLO cuando cae en domingo, y corre el ciclo dos días", () => {
    const m = mes(persona(), 1, 31);
    const francos = [...m].map((c, i) => (c === "S" ? i + 1 : 0)).filter(Boolean);

    expect(francos).toEqual([8, 16, 17, 25]);
    expect(diaDeSemana(AGO(25))).toBe(1); // martes: tras el doble se corrió dos días de la semana
  });

  it("la vuelta completa dura 49 días: 6 francos, 7 días libres, uno por semana", () => {
    const p = persona();
    let libres = 0;
    let bloques = 0;
    let previo = false;

    for (let i = 0; i < 49; i++) {
      const s = propio(p, AGO(1) + i) === F;

      if (s) { libres++; if (!previo) bloques++; }
      previo = s;
    }
    expect(libres).toBe(7);
    expect(bloques).toBe(6);
  });

  it("sin el franco doble, el 7-1 desnudo NO da un día libre por semana", () => {
    const p = persona({ francoDobleDomingo: false });
    let libres = 0;

    for (let i = 0; i < 49; i++) if (propio(p, AGO(1) + i) === F) libres++;
    expect(libres).toBe(6);
  });

  it("un día cambiado a mano sigue mandando sobre la regla", () => {
    const p = persona();

    p.manual[AGO(16)] = "D";
    expect(mes(p, 15, 18)).toBe("NDSD");
  });

  it("la fecha de inicio que entiende el horario real es el primer día del bloque de día", () => {
    const p = persona();

    expect(proximoArranque(p, AGO(10))).toBe(AGO(18)); // tras el franco doble del 16-17
    expect(proximoArranque(p, AGO(1))).toBe(AGO(1));
  });
});

describe("CONSEG · el puesto CONDOR, tal como está en producción (7-7-1, dos fijos corridos 7 días)", () => {
  const condor = (saca: boolean): Plan => ({
    franjas: { D: { id: "D", nombre: "Diurna", ini: 420, fin: 1140 }, N: { id: "N", nombre: "Nocturna", ini: 1140, fin: 420 } },
    puestos: [{ id: "condor", nombre: "Control de Acceso · CONDOR", franjas: ["D", "N"], pide: { D: rep(1, 7) as any, N: rep(1, 7) as any } }],
    personas: [
      { id: "g", nombre: "Gamonal", puesto: "condor", patron: [...rep("D", 7), ...rep("N", 7), F], desfase: 3, manual: {}, ausencias: [] },
      { id: "r", nombre: "Álvarez", puesto: "condor", patron: [...rep("D", 7), ...rep("N", 7), F], desfase: 10, manual: {}, ausencias: [] },
      ...(saca ? [{ id: "s", nombre: "Sacafranco", puesto: null, patron: [L], desfase: 0, manual: {}, fijos: ["condor"], ausencias: [] } as Persona] : []),
    ],
    cubre: {}, auto: {}, no: {}, reglas: { ...REGLAS_POR_DEFECTO },
  });

  it("cada 15 días quedan dos medios turnos sin cubrir: el franco de cada uno", () => {
    expect(resumen(condor(false), 0, 105)).toMatchObject({ total: 210, sin: 14, sobran: 0 });
  });

  it("el libre se va moviendo un día de la semana por vuelta, y vuelve al mismo día a las 15 semanas", () => {
    const g = condor(false).personas[0];
    const francos: number[] = [];

    for (let d = 0; d < 120; d++) if (propio(g, d) === F) francos.push(d);
    expect(francos.map((d) => diaDeSemana(d)).slice(0, 8)).toEqual([4, 5, 6, 0, 1, 2, 3, 4]);
    expect(francos[7] - francos[0]).toBe(105);
  });

  it("con un sacafranco fijo del puesto no queda ni un hueco, y trabaja 16 días en 15 semanas", () => {
    const pl = condor(true);

    aplicarFijos(pl, -7, 112);
    expect(resumen(pl, 0, 105).sin).toBe(0);
    expect(Object.keys(pl.cubre)).toHaveLength(16);
  });
});

describe("CONSEG · publicar la rotación que alterna", () => {
  it("formaDeCiclo reconoce 7 D · franco · 7 N · franco como un 7-1 que alterna", () => {
    expect(formaDeCiclo([...rep("D", 7), F, ...rep("N", 7), F])).toMatchObject({ a: "D", b: "N", x: 7, z: 1, alterna: true });
    expect(formaDeCiclo([...rep("N", 7), F, ...rep("D", 7), F])).toMatchObject({ x: 7, z: 1, alterna: true });
    expect(formaDeCiclo([...rep("D", 7), F, F, ...rep("N", 7), F, F])).toMatchObject({ x: 7, z: 2, alterna: true });
    expect(formaDeCiclo([...rep("D", 7), F, ...rep("N", 6), F, F])).toBeNull();
  });

  it("se publica como ciclo 7-1 que alterna, con franco doble en domingo, y la fecha de inicio cae en un bloque de día", () => {
    const plan: Plan = {
      franjas: { D: { id: "D", nombre: "Diurna", ini: 420, fin: 1140 }, N: { id: "N", nombre: "Nocturna", ini: 1140, fin: 420 } },
      puestos: [{ id: "bausate", nombre: "Bausate", franjas: ["D", "N"], pide: { D: rep(1, 7) as any, N: rep(1, 7) as any } }],
      personas: [persona({ patron: [...rep("D", 7), ...rep("N", 7), F], desfase: 0, francoDobleDomingo: false })],
      cubre: {}, auto: {}, no: {}, reglas: { ...REGLAS_POR_DEFECTO },
    };
    const borrador: Plan = JSON.parse(JSON.stringify(plan));

    borrador.personas[0] = persona();
    const enlace: Enlace = { personas: { medina: { guardId: "g", stationId: "bausate", assignmentId: "a-medina", relevo: false, rotationStyleId: "x" } }, puestos: { bausate: { postSiteId: null, scheduleType: "24h" } }, turnos: {}, cargadas: {}, novedades: {} };
    const pub = planificarPublicacion(plan, borrador, enlace, { tenantId: "T", base: "2026-07-27", hoy: AGO(10), dias: 28, fechaDe: (d) => `d${d}`, instanteDe: () => "" });
    const rot = pub.cambios.find((c) => c.tipo === "rotacion")!;

    expect(rot.llamadas[0].cuerpo.data).toMatchObject({ dayShifts: 7, nightShifts: 0, restDays: 1, alternatesDayNight: true, sundayDoubleRest: true });
    expect(rot.llamadas[1].cuerpo.data.startDate).toBe(`d${AGO(18)}`);
    expect(pub.noPublicables).toEqual([]);
  });
});
