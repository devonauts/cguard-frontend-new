/**
 * MIL CASOS PARA EL MOTOR DEL PLANIFICADOR.
 *
 *  · 44 CON NOMBRE: una situación real de una empresa de seguridad cada uno
 *    (francos encimados, salir de noche y entrar de día, vacaciones, puesto
 *    armado, tres turnos de 8 horas, 24×24…), sobre planes pequeños donde el
 *    resultado se puede contar a mano.
 *  · 955 SECUENCIAS: parten de la operación REAL de la empresa de demo
 *    (`__fixtures__/demo.json`: 27 puestos, 39 personas, 987 turnos) y le
 *    aplican entre 6 y 12 cambios al azar — otra rotación, otra cobertura,
 *    vacaciones, una baja, un puesto nuevo, reglas más duras. Tras CADA cambio
 *    se comprueba que el motor no dejó nada imposible.
 *
 * El azar lleva semilla: el caso 517 es siempre el mismo caso 517.
 */
import { describe, expect, it } from "vitest";

import demo from "./__fixtures__/demo.json";
import {
  FRANCO as F,
  LIBRE as L,
  REGLAS_POR_DEFECTO,
  acomodar,
  aplicarFijos,
  candidatos,
  clave,
  copiar,
  costo,
  cubrirTodo,
  duracion,
  esSacafranco,
  etiqueta,
  falta,
  fijosDe,
  impedimento,
  incoherencias,
  limpiar,
  pide,
  poner,
  propio,
  quitar,
  resumen,
  turnoDe,
  type Franja,
  type Persona,
  type Plan,
  type Puesto,
  type Reglas,
} from "./motor";
import { planDesdeHorarioReal } from "./real";

/* ------------------------------------------------------------------ */
/* Piezas para armar planes pequeños                                   */
/* ------------------------------------------------------------------ */

const FR: Record<string, Franja> = {
  D: { id: "D", nombre: "Diurna", ini: 420, fin: 1140 },
  N: { id: "N", nombre: "Nocturna", ini: 1140, fin: 420 },
  M8: { id: "M8", nombre: "Mañana", ini: 360, fin: 840 },
  T8: { id: "T8", nombre: "Tarde", ini: 840, fin: 1320 },
  N8: { id: "N8", nombre: "Noche", ini: 1320, fin: 360 },
  X24: { id: "X24", nombre: "24 horas", ini: 420, fin: 420 },
};
const rep = (c: string, n: number) => Array<string>(n).fill(c);
const CINCO_DOS = [...rep("D", 5), F, F];
const SEIS_UNO_DISP = [...rep(L, 6), F];

function puesto(id: string, franjas: string[], n = 1, dias = [0, 1, 2, 3, 4, 5, 6]): Puesto {
  const pide: Record<string, number[]> = {};

  for (const f of franjas) pide[f] = [0, 1, 2, 3, 4, 5, 6].map((d) => (dias.includes(d) ? n : 0));

  return { id, nombre: id, franjas, pide };
}
const titular = (id: string, pu: string, patron: string[], desfase = 0): Persona => ({
  id, nombre: id, puesto: pu, patron, desfase, manual: {}, ausencias: [],
});
const saca = (id: string, fijos: string[], patron: string[] = [L], desfase = 0): Persona => ({
  id, nombre: id, puesto: null, patron, desfase, manual: {}, fijos, ausencias: [],
});
function plan(puestos: Puesto[], personas: Persona[], reglas: Partial<Reglas> = {}): Plan {
  return {
    franjas: { ...FR }, puestos, personas, cubre: {}, auto: {}, no: {},
    reglas: { ...REGLAS_POR_DEFECTO, ...reglas },
  };
}
const P = (pl: Plan, id: string) => pl.puestos.find((x) => x.id === id)!;
const H = (pl: Plan, id: string) => pl.personas.find((x) => x.id === id)!;
const sinCubrir = (pl: Plan, d0 = 0, d1 = 7) => resumen(pl, d0, d1).sin;

/* ------------------------------------------------------------------ */
/* Casos con nombre                                                    */
/* ------------------------------------------------------------------ */

describe("Planificador · casos con nombre", () => {
  it("un 5×2 en un puesto de día deja exactamente 2 turnos sin cubrir por semana", () => {
    const pl = plan([puesto("p", ["D"])], [titular("a", "p", CINCO_DOS)]);

    expect(resumen(pl, 0, 7)).toMatchObject({ total: 7, sin: 2, sobran: 0, porDia: [0, 0, 0, 0, 0, 1, 1] });
  });

  it("el sacafranco fijo del puesto cubre esos dos francos solo", () => {
    const pl = plan([puesto("p", ["D"])], [titular("a", "p", CINCO_DOS), saca("s", ["p"])]);

    aplicarFijos(pl, 0, 7);
    expect(sinCubrir(pl)).toBe(0);
    expect(pl.cubre[clave("p", "D", 5)]).toEqual(["s"]);
    expect(pl.auto[`${clave("p", "D", 6)}|s`]).toBe(1);
  });

  it("tres puestos con el franco el mismo día: el sacafranco sólo puede estar en uno", () => {
    const pl = plan(
      ["p1", "p2", "p3"].map((id) => puesto(id, ["D"])),
      [titular("a", "p1", CINCO_DOS), titular("b", "p2", CINCO_DOS), titular("c", "p3", CINCO_DOS), saca("s", ["p1", "p2", "p3"])],
    );

    aplicarFijos(pl, 0, 7);
    expect(sinCubrir(pl)).toBe(4); // dos días × (3 huecos − 1 cubierto)
  });

  it("acomodar reparte los francos de tres puestos: 6 días de trabajo y 1 de descanso", () => {
    const pl = plan(
      ["p1", "p2", "p3"].map((id) => puesto(id, ["D"])),
      [titular("a", "p1", CINCO_DOS), titular("b", "p2", CINCO_DOS), titular("c", "p3", CINCO_DOS), saca("s", ["p1", "p2", "p3"], SEIS_UNO_DISP)],
    );
    const r = acomodar(pl, 0, 28);

    expect(r.despues).toBe(0);
    expect(sinCubrir(pl, 0, 28)).toBe(0);
    expect(incoherencias(pl)).toEqual([]);
  });

  it("cuatro puestos en 5×2 no caben en un sacafranco: quedan huecos y acomodar lo dice", () => {
    const ids = ["p1", "p2", "p3", "p4"];
    const pl = plan(
      ids.map((id) => puesto(id, ["D"])),
      [...ids.map((id, i) => titular(`t${i}`, id, CINCO_DOS)), saca("s", ids, SEIS_UNO_DISP)],
    );
    const r = acomodar(pl, 0, 28);

    expect(r.despues).toBeLessThanOrEqual(r.antes);
    // 8 francos por semana contra 6 días de sacafranco: faltan al menos 2 por semana.
    expect(sinCubrir(pl, 0, 28)).toBeGreaterThanOrEqual(8);
  });

  it("quien sale de noche no entra de día esa misma mañana", () => {
    const pl = plan([puesto("pn", ["N"]), puesto("pd", ["D"])], [saca("s", [])]);

    poner(pl, clave("pn", "N", 0), "s");
    expect(impedimento(pl, H(pl, "s"), P(pl, "pd"), "D", 1)).toMatch(/sin descanso/);
  });

  it("de día hoy y de noche mañana sí se puede: hay 24 horas entre medias", () => {
    const pl = plan([puesto("pn", ["N"]), puesto("pd", ["D"])], [saca("s", [])]);

    poner(pl, clave("pd", "D", 0), "s");
    expect(impedimento(pl, H(pl, "s"), P(pl, "pn"), "N", 1)).toBeNull();
  });

  it("el séptimo día seguido se rechaza; el sexto no", () => {
    const pl = plan([puesto("p", ["D"])], [saca("s", [])]);

    for (let d = 0; d < 5; d++) poner(pl, clave("p", "D", d), "s");
    expect(impedimento(pl, H(pl, "s"), P(pl, "p"), "D", 5)).toBeNull();
    poner(pl, clave("p", "D", 5), "s");
    expect(impedimento(pl, H(pl, "s"), P(pl, "p"), "D", 6)).toMatch(/7 días seguidos/);
  });

  it("el tope de horas de la semana se respeta", () => {
    const pl = plan([puesto("p", ["D"])], [saca("s", [])], { maxHorasSemana: 48 });

    for (let d = 0; d < 4; d++) poner(pl, clave("p", "D", d), "s");
    expect(impedimento(pl, H(pl, "s"), P(pl, "p"), "D", 4)).toMatch(/48 h/);
  });

  it("el sacafranco no cubre en su propio franco", () => {
    const pl = plan([puesto("p", ["D"])], [saca("s", ["p"], SEIS_UNO_DISP)]);

    expect(impedimento(pl, H(pl, "s"), P(pl, "p"), "D", 6)).toBe("Es su franco");
    expect(impedimento(pl, H(pl, "s"), P(pl, "p"), "D", 5)).toBeNull();
  });

  it("las vacaciones del titular abren un hueco cada día que dura", () => {
    const a = titular("a", "p", ["D"]);

    a.ausencias = [{ desde: 2, hasta: 5, tipo: "vacaciones" }];
    const pl = plan([puesto("p", ["D"])], [a]);

    expect(resumen(pl, 0, 7).porDia).toEqual([0, 0, 1, 1, 1, 1, 0]);
  });

  it("si el sacafranco está de vacaciones, el franco queda sin cubrir", () => {
    const s = saca("s", ["p"]);

    s.ausencias = [{ desde: 5, hasta: 6, tipo: "vacaciones" }];
    const pl = plan([puesto("p", ["D"])], [titular("a", "p", CINCO_DOS), s]);

    aplicarFijos(pl, 0, 7);
    expect(sinCubrir(pl)).toBe(2);
    expect(pl.cubre).toEqual({});
  });

  it("quien está de vacaciones sale en la lista, con el motivo, y no se le puede elegir", () => {
    const s = saca("s", ["p"]);

    s.ausencias = [{ desde: 5, hasta: 5, tipo: "vacaciones" }];
    const pl = plan([puesto("p", ["D"])], [titular("a", "p", CINCO_DOS), s]);
    const c = candidatos(pl, P(pl, "p"), "D", 5);

    expect(c.find((x) => x.persona.id === "s")?.impedimento).toBe("Está de vacaciones");
  });

  it("un puesto de lunes a viernes no pide a nadie el fin de semana", () => {
    const pl = plan([puesto("p", ["D"], 1, [0, 1, 2, 3, 4])], [titular("a", "p", CINCO_DOS)]);

    expect(resumen(pl, 0, 28)).toMatchObject({ total: 20, sin: 0, sobran: 0 });
  });

  it("quien trabaja el sábado en un puesto que cierra el sábado, sobra", () => {
    const pl = plan([puesto("p", ["D"], 1, [0, 1, 2, 3, 4])], [titular("a", "p", ["D"])]);

    expect(resumen(pl, 0, 7)).toMatchObject({ sin: 0, sobran: 2 });
  });

  it("un puesto reforzado con un solo titular: falta uno todos los días", () => {
    const pl = plan([puesto("p", ["D"], 2)], [titular("a", "p", ["D"])]);

    expect(resumen(pl, 0, 7)).toMatchObject({ total: 14, sin: 7 });
  });

  it("dos personas cubren el mismo turno reforzado, pero nunca la misma dos veces", () => {
    const pl = plan([puesto("p", ["D"], 2)], [saca("s1", ["p"]), saca("s2", ["p"])], { maxSeguidos: 9, maxHorasSemana: 200 });

    aplicarFijos(pl, 0, 7);
    expect(sinCubrir(pl)).toBe(0);
    for (let d = 0; d < 7; d++) expect(new Set(pl.cubre[clave("p", "D", d)]).size).toBe(2);
    expect(incoherencias(pl)).toEqual([]);
  });

  it("tres turnos de 8 horas con tres titulares cubren las 24 horas", () => {
    const pl = plan(
      [puesto("p", ["M8", "T8", "N8"])],
      [titular("a", "p", ["M8"]), titular("b", "p", ["T8"]), titular("c", "p", ["N8"])],
    );

    expect(resumen(pl, 0, 7)).toMatchObject({ total: 21, sin: 0, sobran: 0 });
  });

  it("turnos de 8 h: tras la noche no entra de mañana; de tarde sólo si el descanso mínimo es de 8 h", () => {
    const base = () => {
      const pl = plan([puesto("p", ["M8", "T8", "N8"])], [saca("s", [])], { descansoMin: 480 });

      poner(pl, clave("p", "N8", 0), "s");

      return pl;
    };
    const ocho = base();

    expect(impedimento(ocho, H(ocho, "s"), P(ocho, "p"), "M8", 1)).toMatch(/sin descanso/);
    expect(impedimento(ocho, H(ocho, "s"), P(ocho, "p"), "T8", 1)).toBeNull();
    const diez = base();

    diez.reglas.descansoMin = 600;
    expect(impedimento(diez, H(diez, "s"), P(diez, "p"), "T8", 1)).toMatch(/sin descanso/);
  });

  it("24×24: dos titulares alternos cubren todos los días sin sacafranco", () => {
    const pl = plan([puesto("p", ["X24"])], [titular("a", "p", ["X24", F], 0), titular("b", "p", ["X24", F], 1)]);

    expect(resumen(pl, 0, 14)).toMatchObject({ total: 14, sin: 0, sobran: 0 });
  });

  it("tras un turno de 24 horas no se cubre el día siguiente, pero sí el otro", () => {
    const pl = plan([puesto("p", ["X24"])], [saca("s", [])]);

    poner(pl, clave("p", "X24", 0), "s");
    expect(impedimento(pl, H(pl, "s"), P(pl, "p"), "X24", 1)).toMatch(/sin descanso/);
    expect(impedimento(pl, H(pl, "s"), P(pl, "p"), "X24", 2)).toBeNull();
  });

  it("2-2-2 rotativo: tres titulares cubren día y noche sin que sobre ni falte nadie", () => {
    const r = ["D", "D", "N", "N", F, F];
    const pl = plan([puesto("p", ["D", "N"])], [titular("a", "p", r, 0), titular("b", "p", r, 2), titular("c", "p", r, 4)]);

    expect(resumen(pl, 0, 12)).toMatchObject({ total: 24, sin: 0, sobran: 0 });
  });

  it("un puesto armado sólo lo cubre quien tiene arma", () => {
    const armado = puesto("p", ["D"]);

    armado.requiere = ["arma"];
    const con = saca("con", []);

    con.aptitudes = ["arma"];
    const pl = plan([armado], [saca("sin", []), con]);

    expect(impedimento(pl, H(pl, "sin"), armado, "D", 0)).toBe("No tiene: arma");
    expect(impedimento(pl, H(pl, "con"), armado, "D", 0)).toBeNull();
  });

  it("un titular en franco puede cubrir como hora extra, pero va detrás del sacafranco", () => {
    const pl = plan(
      [puesto("p1", ["D"]), puesto("p2", ["D"])],
      [titular("a", "p1", CINCO_DOS), titular("b", "p2", CINCO_DOS), saca("s", [])],
    );
    // Día 5: «a» y «b» están en franco. El hueco de p1 lo puede tomar cualquiera de los tres.
    const c = candidatos(pl, P(pl, "p1"), "D", 5);

    expect(c[0].persona.id).toBe("s");
    expect(c[0].extra).toBe(false);
    expect(c.find((x) => x.persona.id === "b")).toMatchObject({ extra: true, impedimento: null });
    // Quien trabaja ese día ni siquiera sale en la lista.
    expect(candidatos(pl, P(pl, "p1"), "D", 2).map((x) => x.persona.id)).toEqual(["s"]);
  });

  it("«cubrir lo que falta» no usa hora extra: eso se decide a mano", () => {
    const pl = plan(
      [puesto("p1", ["D"]), puesto("p2", ["D"])],
      [titular("a", "p1", CINCO_DOS), titular("b", "p2", CINCO_DOS, 3)],
    );
    const r = cubrirTodo(pl, 0, 7);

    expect(r.hechos).toBe(0);
    expect(r.quedan).toBe(4);
  });

  it("tras «cubrir lo que falta» sólo quedan huecos que nadie libre puede tomar", () => {
    const ids = ["p1", "p2", "p3", "p4"];
    const pl = plan(
      ids.map((id) => puesto(id, ["D"])),
      [...ids.map((id, i) => titular(`t${i}`, id, CINCO_DOS)), saca("s1", [], SEIS_UNO_DISP), saca("s2", [], SEIS_UNO_DISP, 3)],
    );

    cubrirTodo(pl, 0, 7);
    for (let d = 0; d < 7; d++)
      for (const pu of pl.puestos)
        if (falta(pl, pu, "D", d) > 0)
          expect(candidatos(pl, pu, "D", d).some((c) => !c.impedimento && !c.extra)).toBe(false);
    expect(incoherencias(pl)).toEqual([]);
  });

  it("un hueco que la central dejó vacío a propósito no lo rellena el fijo; «cubrir lo que falta» sí", () => {
    const pl = plan([puesto("p", ["D"])], [titular("a", "p", CINCO_DOS), saca("s", ["p"])]);

    pl.no[clave("p", "D", 5)] = 1;
    aplicarFijos(pl, 0, 7);
    expect(pl.cubre[clave("p", "D", 5)]).toBeUndefined();
    expect(pl.cubre[clave("p", "D", 6)]).toEqual(["s"]);
    cubrirTodo(pl, 0, 7);
    expect(pl.cubre[clave("p", "D", 5)]).toEqual(["s"]);
    expect(pl.no).toEqual({});
  });

  it("si el titular deja de tener franco, la cobertura que ya no hace falta se va sola", () => {
    const pl = plan([puesto("p", ["D"])], [titular("a", "p", CINCO_DOS), saca("s", ["p"])]);

    aplicarFijos(pl, 0, 7);
    H(pl, "a").patron = ["D"];
    limpiar(pl, 0, 7);
    expect(pl.cubre).toEqual({});
    expect(pl.auto).toEqual({});
  });

  it("cambiar un solo día de franco a trabajo quita la cobertura de ese día y deja la del otro", () => {
    const pl = plan([puesto("p", ["D"])], [titular("a", "p", CINCO_DOS), saca("s", ["p"])]);

    aplicarFijos(pl, 0, 7);
    H(pl, "a").manual[5] = "D";
    limpiar(pl, 0, 7);
    expect(pl.cubre[clave("p", "D", 5)]).toBeUndefined();
    expect(pl.cubre[clave("p", "D", 6)]).toEqual(["s"]);
  });

  it("quien cubría como hora extra y ahora trabaja en su puesto ese día, deja de cubrir", () => {
    const pl = plan(
      [puesto("p1", ["D"]), puesto("p2", ["D"])],
      [titular("a", "p1", CINCO_DOS), titular("b", "p2", CINCO_DOS, 3)],
    );

    poner(pl, clave("p1", "D", 5), "b"); // «b» trabaja el día 5… ¿o no?
    limpiar(pl, 0, 7);
    // «b» trabaja en su puesto el día 5 (su franco cae los días 2 y 3): no puede cubrir.
    expect(pl.cubre).toEqual({});
  });

  it("quitarle un puesto fijo al sacafranco retira lo que cubría ahí solo", () => {
    const pl = plan([puesto("p", ["D"])], [titular("a", "p", CINCO_DOS), saca("s", ["p"])]);

    aplicarFijos(pl, 0, 7);
    H(pl, "s").fijos = [];
    limpiar(pl, 0, 7);
    expect(pl.cubre).toEqual({});
    expect(sinCubrir(pl)).toBe(2);
  });

  it("dar de baja al sacafranco no deja coberturas de alguien que ya no existe", () => {
    const pl = plan([puesto("p", ["D"])], [titular("a", "p", CINCO_DOS), saca("s", ["p"])]);

    aplicarFijos(pl, 0, 7);
    poner(pl, clave("p", "D", 12), "s");
    pl.personas = pl.personas.filter((x) => x.id !== "s");
    limpiar(pl, 0, 14);
    expect(pl.cubre).toEqual({});
    expect(incoherencias(pl)).toEqual([]);
  });

  it("si un puesto de 24 horas pasa a ser sólo de día, lo cubierto de noche desaparece", () => {
    const pl = plan([puesto("p", ["D", "N"])], [titular("a", "p", ["D"]), saca("s", ["p"])], { maxSeguidos: 30, maxHorasSemana: 200 });

    aplicarFijos(pl, 0, 7);
    expect(pl.cubre[clave("p", "N", 0)]).toEqual(["s"]);
    const pu = P(pl, "p");

    pu.franjas = ["D"];
    delete pu.pide.N;
    limpiar(pl, 0, 7);
    expect(Object.keys(pl.cubre)).toEqual([]);
    expect(resumen(pl, 0, 7)).toMatchObject({ total: 7, sin: 0 });
  });

  it("una rotación de 28 días se repite exacta cada 28", () => {
    const r = [...rep("D", 10), F, ...rep("N", 10), ...rep(F, 7)];
    const a = titular("a", "p", r, 5);

    expect(r).toHaveLength(28);
    for (let d = -30; d < 30; d++) expect(propio(a, d)).toBe(propio(a, d + 28));
  });

  it("las semanas hacia atrás se calculan igual que hacia adelante", () => {
    const pl = plan([puesto("p", ["D"])], [titular("a", "p", CINCO_DOS)]);

    expect(resumen(pl, -14, -7)).toEqual(resumen(pl, 0, 7));
    expect(propio(H(pl, "a"), -1)).toBe(F);
    expect(pide(P(pl, "p"), "D", -3)).toBe(1);
  });

  it("alguien sin rotación está siempre en franco y no rompe nada", () => {
    const pl = plan([puesto("p", ["D"])], [titular("a", "p", [])]);

    expect(turnoDe(pl, H(pl, "a"), 3)).toBeNull();
    expect(sinCubrir(pl)).toBe(7);
    expect(acomodar(pl, 0, 7)).toEqual({ antes: 7, despues: 7 });
  });

  it("la duración sabe cruzar la medianoche y sabe lo que son 24 horas", () => {
    expect(duracion(FR.D)).toBe(720);
    expect(duracion(FR.N)).toBe(720);
    expect(duracion(FR.N8)).toBe(480);
    expect(duracion(FR.X24)).toBe(1440);
  });

  it("la rotación se dice en corto", () => {
    expect(etiqueta(CINCO_DOS)).toBe("5D 2F");
    expect(etiqueta(["D", "D", "N", "N", F, F])).toBe("2D 2N 2F");
    expect(etiqueta(SEIS_UNO_DISP)).toBe("6 disp. 1F");
  });

  it("poner y quitar una cobertura deja el plan como estaba", () => {
    const pl = plan([puesto("p", ["D"])], [saca("s", [])]);
    const antes = JSON.stringify(pl);

    poner(pl, clave("p", "D", 3), "s", true);
    expect(turnoDe(pl, H(pl, "s"), 3)).toMatchObject({ puesto: "p", franja: "D", tipo: "cubre" });
    quitar(pl, clave("p", "D", 3), "s");
    expect(JSON.stringify(pl)).toBe(antes);
    expect(turnoDe(pl, H(pl, "s"), 3)).toBeNull();
  });

  it("una copia del plan es independiente y recuerda quién cubre qué", () => {
    const pl = plan([puesto("p", ["D"])], [titular("a", "p", CINCO_DOS), saca("s", ["p"])]);

    aplicarFijos(pl, 0, 7);
    const c = copiar(pl);

    quitar(pl, clave("p", "D", 5), "s");
    expect(turnoDe(c, H(c, "s"), 5)).toMatchObject({ puesto: "p" });
    expect(turnoDe(pl, H(pl, "s"), 5)).toBeNull();
  });

  it("el sacafranco fijo de un puesto se sabe preguntando por el puesto", () => {
    const pl = plan([puesto("p1", ["D"]), puesto("p2", ["D"])], [saca("s", ["p1"]), titular("a", "p2", ["D"])]);

    expect(fijosDe(pl, "p1").map((x) => x.id)).toEqual(["s"]);
    expect(fijosDe(pl, "p2")).toEqual([]);
    expect(esSacafranco(H(pl, "a"))).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* La operación real de la demo                                        */
/* ------------------------------------------------------------------ */

const REAL = planDesdeHorarioReal(demo as any, (demo as any).rotations, demo.base, demo.tz);
const real = () => copiar(REAL.plan);

describe("Planificador · la operación real de la demo", () => {
  it("se carga entera y se parece al horario de verdad", () => {
    expect(REAL.plan.puestos).toHaveLength(27);
    expect(REAL.plan.personas).toHaveLength(39);
    expect(REAL.plan.personas.filter(esSacafranco)).toHaveLength(2);
    expect(REAL.coincidencia).toBeGreaterThan(0.9);
  });

  it("al poner a los sacafrancos fijos no queda nada imposible", () => {
    const pl = real();

    aplicarFijos(pl, -7, 35);
    expect(incoherencias(pl)).toEqual([]);
    const r = resumen(pl, 0, 28);

    expect(r.porDia.reduce((a, b) => a + b, 0)).toBe(r.sin);
    expect(r.sin).toBeLessThan(r.total);
  });

  it("acomodar nunca la empeora, y hacerlo dos veces no cambia nada", () => {
    const pl = real();
    const uno = acomodar(pl, 0, 28);

    expect(uno.despues).toBeLessThanOrEqual(uno.antes);
    const dos = acomodar(pl, 0, 28);

    expect(dos.despues).toBe(uno.despues);
    expect(incoherencias(pl)).toEqual([]);
  });

  it("«cubrir lo que falta» no deja a nadie libre mirando un hueco", () => {
    const pl = real();

    aplicarFijos(pl, -7, 14);
    cubrirTodo(pl, 0, 7);
    expect(incoherencias(pl)).toEqual([]);
    for (let d = 0; d < 7; d++)
      for (const pu of pl.puestos)
        for (const f of pu.franjas)
          if (falta(pl, pu, f, d) > 0)
            expect(candidatos(pl, pu, f, d).some((c) => !c.impedimento && !c.extra)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* 955 secuencias de cambios sobre la operación real                   */
/* ------------------------------------------------------------------ */

/** Azar con semilla (mulberry32): el mismo número da siempre la misma secuencia. */
function azar(semilla: number) {
  let a = semilla >>> 0;

  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COBERTURAS: Array<(pu: Puesto) => void> = [
  (pu) => { pu.franjas = ["D", "N"]; pu.pide = { D: rep7(1), N: rep7(1) }; },
  (pu) => { pu.franjas = ["D", "N"]; pu.pide = { D: rep7(2), N: rep7(1) }; },
  (pu) => { pu.franjas = ["D"]; pu.pide = { D: rep7(1) }; },
  (pu) => { pu.franjas = ["N"]; pu.pide = { N: rep7(1) }; },
  (pu) => { pu.franjas = ["D"]; pu.pide = { D: [1, 1, 1, 1, 1, 0, 0] }; },
  (pu) => { pu.franjas = ["M8", "T8", "N8"]; pu.pide = { M8: rep7(1), T8: rep7(1), N8: rep7(1) }; },
  (pu) => { pu.franjas = ["X24"]; pu.pide = { X24: rep7(1) }; },
  (pu) => { pu.franjas = ["D", "N"]; pu.pide = { D: [1, 1, 1, 1, 1, 2, 2], N: [1, 1, 1, 1, 1, 1, 0] }; },
];

function rep7(n: number) {
  return [n, n, n, n, n, n, n];
}

/** Todo lo que tiene que ser cierto tras cualquier cambio. */
function comprobar(pl: Plan, d0: number, d1: number, donde: string) {
  expect(incoherencias(pl), donde).toEqual([]);
  // Nadie cubre dos veces el mismo día.
  const visto = new Set<string>();

  for (const k of Object.keys(pl.cubre))
    for (const id of pl.cubre[k]) {
      const x = `${id}|${k.split("|")[2]}`;

      expect(visto.has(x), `${donde}: ${x} cubre dos veces el mismo día`).toBe(false);
      visto.add(x);
    }
  const r = resumen(pl, d0, d1);

  expect(r.sin, donde).toBeGreaterThanOrEqual(0);
  expect(r.sin, donde).toBeLessThanOrEqual(r.total);
  expect(r.porDia.reduce((a, b) => a + b, 0), donde).toBe(r.sin);
  // Si un puesto tiene sacafranco fijo y aun así hay hueco, es que no puede.
  for (let d = d0; d < d1; d++)
    for (const pu of pl.puestos)
      for (const f of pu.franjas) {
        if (pl.no[clave(pu.id, f, d)] || falta(pl, pu, f, d) <= 0) continue;
        for (const s of fijosDe(pl, pu.id))
          expect(impedimento(pl, s, pu, f, d), `${donde}: ${s.nombre} podía cubrir ${pu.nombre} el día ${d}`).not.toBeNull();
      }
}

function secuencia(semilla: number): Plan {
  const r = azar(semilla);
  const pl = real();
  const ent = (n: number) => Math.floor(r() * n);
  const uno = <T,>(l: T[]): T => l[ent(l.length)];
  const d0 = ent(5) * 7 - 7; // también semanas hacia atrás
  const d1 = d0 + 7;
  const arreglar = () => limpiar(pl, d0 - 7, d1 + 7);
  const pasos = 6 + ent(7);

  arreglar();
  comprobar(pl, d0, d1, `#${semilla} al cargar`);

  for (let i = 0; i < pasos; i++) {
    const op = ent(16);
    const titulares = pl.personas.filter((p) => !esSacafranco(p));
    const sacas = pl.personas.filter(esSacafranco);
    let nombre = "";

    if (op === 0 && titulares.length) {
      // Otra rotación, con las franjas de su puesto.
      nombre = "otra rotación";
      const p = uno(titulares);
      const fr = pl.puestos.find((x) => x.id === p.puesto)!.franjas;
      const a = fr[0];
      const b = fr[1] || fr[0];

      p.patron = uno([
        [...rep(a, 5), F, F], [...rep(a, 6), F], [...rep(a, 4), ...rep(F, 4)], [a, a, b, b, F, F],
        [...rep(a, 4), ...rep(b, 4), F, F], [a, F], [a], [...rep(a, 5), F, F, ...rep(b, 5), F, F],
        Array.from({ length: 2 + ent(13) }, () => uno([a, b, F])),
      ]);
      p.desfase = ent(p.patron.length);
      p.manual = {};
    } else if (op === 1 && pl.personas.length) {
      nombre = "correr la rotación";
      uno(pl.personas).desfase += uno([-3, -1, 1, 2, 9]);
    } else if (op === 2 && titulares.length) {
      nombre = "cambiar un día suelto";
      const p = uno(titulares);
      const fr = pl.puestos.find((x) => x.id === p.puesto)!.franjas;

      p.manual[d0 + ent(7)] = uno([...fr, F]);
    } else if (op === 3 && pl.puestos.length) {
      nombre = "otra cobertura";
      uno(COBERTURAS)(uno(pl.puestos));
    } else if (op === 4 && pl.personas.length) {
      nombre = "una ausencia";
      const p = uno(pl.personas);
      const desde = d0 - 2 + ent(9);

      (p.ausencias = p.ausencias || []).push({ desde, hasta: desde + ent(10), tipo: uno(["vacaciones", "permiso", "incapacidad"]) });
    } else if (op === 5 && sacas.length && pl.puestos.length) {
      nombre = "puestos fijos";
      const s = uno(sacas);
      const id = uno(pl.puestos).id;

      s.fijos = (s.fijos || []).includes(id) ? s.fijos!.filter((x) => x !== id) : [...(s.fijos || []), id];
    } else if (op === 6) {
      nombre = "cubrir un hueco a mano";
      const huecos: Array<[Puesto, string, number]> = [];

      for (let d = d0; d < d1; d++)
        for (const pu of pl.puestos) for (const f of pu.franjas) if (falta(pl, pu, f, d) > 0) huecos.push([pu, f, d]);
      if (huecos.length) {
        const [pu, f, d] = uno(huecos);
        const c = candidatos(pl, pu, f, d).filter((x) => !x.impedimento);

        if (c.length) {
          delete pl.no[clave(pu.id, f, d)];
          poner(pl, clave(pu.id, f, d), uno(c).persona.id);
        }
      }
    } else if (op === 7) {
      nombre = "quitar una cobertura";
      const ks = Object.keys(pl.cubre);

      if (ks.length) {
        const k = uno(ks);

        quitar(pl, k, pl.cubre[k][0]);
        pl.no[k] = 1;
      }
    } else if (op === 8) {
      nombre = "cubrir lo que falta";
      cubrirTodo(pl, d0, d1);
      for (let d = d0; d < d1; d++)
        for (const pu of pl.puestos)
          for (const f of pu.franjas)
            if (falta(pl, pu, f, d) > 0)
              expect(candidatos(pl, pu, f, d).some((c) => !c.impedimento && !c.extra), `#${semilla}: quedó un hueco con gente libre`).toBe(false);
    } else if (op === 9 && semilla % 6 === 0) {
      nombre = "acomodar";
      const ids = [...sacas.filter((s) => (s.fijos || []).length), ...titulares.filter((p) => sacas.some((s) => (s.fijos || []).includes(p.puesto!)))]
        .slice(0, 8).map((p) => p.id);
      const res = acomodar(pl, d0, d1 + 7, ids);

      expect(res.despues, `#${semilla}: acomodar empeoró`).toBeLessThanOrEqual(res.antes);
    } else if (op === 10) {
      nombre = "otras reglas";
      pl.reglas = { descansoMin: uno([480, 600, 720]), maxSeguidos: uno([5, 6, 7]), maxHorasSemana: uno([48, 60, 72]) };
    } else if (op === 11 && pl.puestos.length) {
      nombre = "un puesto pide arma";
      const pu = uno(pl.puestos);

      pu.requiere = pu.requiere?.length ? [] : ["arma"];
      for (const p of pl.personas) if (r() < 0.4) p.aptitudes = ["arma"];
    } else if (op === 12) {
      nombre = "un sacafranco nuevo";
      pl.personas.push(saca(`nuevo-${semilla}-${i}`, pl.puestos.length ? [uno(pl.puestos).id] : [], uno([SEIS_UNO_DISP, [...rep(L, 5), F, F], [L]]), ent(7)));
    } else if (op === 13 && pl.personas.length > 4) {
      nombre = "una baja";
      const fuera = uno(pl.personas).id;

      pl.personas = pl.personas.filter((p) => p.id !== fuera);
    } else if (op === 14) {
      nombre = "un puesto nuevo";
      const pu = puesto(`puesto-${semilla}-${i}`, ["D"]);

      uno(COBERTURAS)(pu);
      pl.puestos.push(pu);
    } else if (op === 15 && pl.puestos.length > 3) {
      nombre = "cerrar un puesto";
      const fuera = uno(pl.puestos).id;

      pl.puestos = pl.puestos.filter((p) => p.id !== fuera);
      for (const p of pl.personas) {
        if (p.puesto === fuera) { p.puesto = uno(pl.puestos).id; p.patron = [...rep(pl.puestos.find((x) => x.id === p.puesto)!.franjas[0], 5), F, F]; p.manual = {}; }
        if (p.fijos) p.fijos = p.fijos.filter((x) => x !== fuera);
      }
    } else continue;

    arreglar();
    comprobar(pl, d0, d1, `#${semilla} paso ${i} (${nombre})`);
  }

  return pl;
}

/* Vitest 3+ also fails a SYNCHRONOUS test that outlives `testTimeout` (5 s);
   Vitest 2 only timed out async tests. The heaviest seeds take 4-10 s on a
   loaded machine, so this CPU-bound property suite gets its own ceiling. */
describe("Planificador · 955 secuencias de cambios sobre la operación real", { timeout: 60_000 }, () => {
  const semillas = Array.from({ length: 955 }, (_, i) => i + 1);

  it.each(semillas)("secuencia %i: tras cada cambio no queda nada imposible", (semilla) => {
    const pl = secuencia(semilla);

    // Cada 25, además: los mismos pasos dan EXACTAMENTE el mismo plan.
    if (semilla % 25 === 0) expect(JSON.stringify(secuencia(semilla))).toBe(JSON.stringify(pl));
    expect(costo(pl, 0, 7)).toBeGreaterThanOrEqual(0);
  });
});
