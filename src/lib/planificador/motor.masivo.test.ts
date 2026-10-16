/**
 * OTROS CINCO MIL CASOS PARA EL PLANIFICADOR.
 *
 * `motor.test.ts` afirma que el motor no deja nada imposible… preguntándoselo
 * al propio motor. Aquí la comprobación es INDEPENDIENTE: se vuelve a contar a
 * mano, sin llamar a `impedimento` ni a `resumen`, que nadie cubre ausente, en
 * su franco o sin aptitud, que lo que el motor colocó solo respeta los límites
 * de la empresa (descanso, días seguidos, horas), y que las cuentas de turnos
 * cubiertos son las que son. Si el motor y esta cuenta discrepan, uno de los
 * dos está mal.
 *
 * Cuatro familias, cada una ataca una cosa:
 *   A · 2000 secuencias sobre la operación REAL de la demo, ahora moviéndose
 *       entre semanas y deshaciendo.
 *   B · 1500 empresas INVENTADAS: de un puesto a decenas, con todas las mezclas
 *       de cobertura y rotación, y casos donde se sabe de antemano que acomodar
 *       tiene que dejarlo todo cubierto.
 *   C · 1000 lecturas del horario real con los datos ESTROPEADOS a propósito:
 *       campos vacíos, horas absurdas, registros huérfanos, ids repetidos.
 *   D · 500 borradores CORRUPTOS: lo que saldría de un guardado a medias o de
 *       una versión vieja. Nada de esto puede tumbar la pantalla.
 */
import { describe, expect, it } from "vitest";

import demo from "./__fixtures__/demo.json";
import {
  FRANCO as F,
  LIBRE as L,
  REGLAS_POR_DEFECTO,
  acomodar,
  candidatos,
  clave,
  copiar,
  cubrirTodo,
  esSacafranco,
  falta,
  fijosDe,
  impedimento,
  incoherencias,
  limpiar,
  poner,
  quitar,
  resumen,
  sanear,
  turnoDe,
  type Franja,
  type Persona,
  type Plan,
  type Puesto,
} from "./motor";
import { planDesdeHorarioReal } from "./real";

/* ------------------------------------------------------------------ */
/* Piezas                                                              */
/* ------------------------------------------------------------------ */

const FR: Record<string, Franja> = {
  D: { id: "D", nombre: "Diurna", ini: 420, fin: 1140 },
  N: { id: "N", nombre: "Nocturna", ini: 1140, fin: 420 },
  M8: { id: "M8", nombre: "Mañana", ini: 360, fin: 840 },
  T8: { id: "T8", nombre: "Tarde", ini: 840, fin: 1320 },
  N8: { id: "N8", nombre: "Noche", ini: 1320, fin: 360 },
  X24: { id: "X24", nombre: "24 horas", ini: 420, fin: 420 },
  // Franjas incómodas a propósito: un 24 h que empieza de noche, una madrugada,
  // un medio turno y uno partido por la medianoche.
  L24: { id: "L24", nombre: "24 h desde las 20", ini: 1200, fin: 1200 },
  MAD: { id: "MAD", nombre: "Madrugada", ini: 0, fin: 480 },
  MED: { id: "MED", nombre: "Medio turno", ini: 480, fin: 780 },
  TAR: { id: "TAR", nombre: "Tarde-noche", ini: 960, fin: 60 },
};
const rep = (c: string, n: number) => Array<string>(n).fill(c);
const siete = (n: number) => [n, n, n, n, n, n, n];

const COBERTURAS: Array<{ franjas: string[]; pide: Record<string, number[]> }> = [
  { franjas: ["D", "N"], pide: { D: siete(1), N: siete(1) } },
  { franjas: ["D", "N"], pide: { D: siete(2), N: siete(1) } },
  { franjas: ["D"], pide: { D: siete(1) } },
  { franjas: ["N"], pide: { N: siete(1) } },
  { franjas: ["D"], pide: { D: [1, 1, 1, 1, 1, 0, 0] } },
  { franjas: ["M8", "T8", "N8"], pide: { M8: siete(1), T8: siete(1), N8: siete(1) } },
  { franjas: ["X24"], pide: { X24: siete(1) } },
  { franjas: ["L24"], pide: { L24: siete(1) } },
  { franjas: ["MAD", "MED", "TAR"], pide: { MAD: siete(1), MED: [1, 1, 1, 1, 1, 1, 0], TAR: siete(1) } },
  { franjas: ["D", "N"], pide: { D: [1, 1, 1, 1, 1, 2, 2], N: [1, 1, 1, 1, 1, 1, 0] } },
  { franjas: ["D"], pide: { D: [0, 0, 0, 0, 0, 3, 3] } }, // sólo fin de semana, con tres
];

/** Azar con semilla (mulberry32). */
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
type Azar = ReturnType<typeof azar>;
const ent = (r: Azar, n: number) => Math.floor(r() * n);
const uno = <T,>(r: Azar, l: T[]): T => l[ent(r, l.length)];

const titular = (id: string, pu: string, patron: string[], desfase = 0): Persona => ({
  id, nombre: id, puesto: pu, patron, desfase, manual: {}, ausencias: [],
});
const saca = (id: string, fijos: string[], patron: string[] = [L], desfase = 0): Persona => ({
  id, nombre: id, puesto: null, patron, desfase, manual: {}, fijos, ausencias: [],
});
const vacio = (): Plan => ({ franjas: JSON.parse(JSON.stringify(FR)), puestos: [], personas: [], cubre: {}, auto: {}, no: {}, reglas: { ...REGLAS_POR_DEFECTO } });

/* ------------------------------------------------------------------ */
/* La comprobación independiente                                       */
/* ------------------------------------------------------------------ */

const dur = (f: Franja) => (f.fin - f.ini + 1440) % 1440 || 1440;
const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * Todo lo que tiene que ser cierto, contado SIN el motor. Sólo lee el plan.
 */
function independiente(pl: Plan, d0: number, d1: number, donde: string) {
  const persona = new Map(pl.personas.map((p) => [p.id, p]));
  const puesto = new Map(pl.puestos.map((p) => [p.id, p]));
  // persona → día → lo que cubre
  const cubre = new Map<string, Map<number, { puesto: string; franja: string }>>();

  for (const k of Object.keys(pl.cubre)) {
    const [pu, fr, ds] = k.split("|");
    const d = Number(ds);

    expect(puesto.has(pu), `${donde}: ${k} cubre un puesto que no existe`).toBe(true);
    expect(puesto.get(pu)!.franjas.includes(fr), `${donde}: ${k} cubre una franja que el puesto no tiene`).toBe(true);
    expect(pl.cubre[k].length, `${donde}: ${k} vacía`).toBeGreaterThan(0);
    for (const id of pl.cubre[k]) {
      expect(persona.has(id), `${donde}: ${k} lo cubre alguien que no existe`).toBe(true);
      if (!cubre.has(id)) cubre.set(id, new Map());
      expect(cubre.get(id)!.has(d), `${donde}: ${id} cubre dos cosas el día ${d}`).toBe(false);
      cubre.get(id)!.set(d, { puesto: pu, franja: fr });
    }
  }
  const ausente = (p: Persona, d: number) => (p.ausencias || []).some((a) => d >= a.desde && d <= a.hasta);
  const codigo = (p: Persona, d: number) => p.manual[d] ?? (p.patron.length ? p.patron[mod(d + p.desfase, p.patron.length)] : F);
  /** El turno de esa persona ese día: [franja, esCobertura] o null. */
  const turno = (p: Persona, d: number): [string, boolean] | null => {
    if (ausente(p, d)) return null;
    const c = codigo(p, d);

    if (p.puesto && c !== F && c !== L) return [c, false];
    const x = cubre.get(p.id)?.get(d);

    return x ? [x.franja, true] : null;
  };
  const tramo = (fr: string, d: number): [number, number] => {
    const f = pl.franjas[fr];
    const ini = d * 1440 + f.ini;

    return [ini, ini + dur(f)];
  };

  // 1) Cada cobertura, contra cada regla.
  for (const [id, dias] of cubre) {
    const p = persona.get(id)!;

    for (const [d, c] of dias) {
      const pu = puesto.get(c.puesto)!;
      const quien = `${donde}: ${p.nombre} cubriendo ${pu.nombre} (${c.franja}) el día ${d}`;

      expect(ausente(p, d), `${quien} estando ausente`).toBe(false);
      const propio = codigo(p, d);

      if (p.puesto !== null) expect(propio, `${quien} sin estar en franco`).toBe(F);
      else expect(propio, `${quien} en su propio franco`).not.toBe(F);
      for (const req of pu.requiere || []) expect((p.aptitudes || []).includes(req), `${quien} sin ${req}`).toBe(true);

      // Los límites de la empresa (descanso, días seguidos, horas) sólo atan a
      // lo que el motor puso solo; lo que viene del horario real o puso alguien
      // a mano es decisión suya y sólo lo saca un bloqueo (lo de arriba).
      if (!(pl.auto && typeof pl.auto === "object" && pl.auto[`${c.puesto}|${c.franja}|${d}|${id}`])) continue;
      const [ini, fin] = tramo(c.franja, d);

      for (const dd of [d - 2, d - 1, d + 1, d + 2]) {
        const t = turno(p, dd);

        if (!t) continue;
        const [i2, f2] = tramo(t[0], dd);
        const hueco = dd < d ? ini - f2 : i2 - fin;

        expect(hueco, `${quien}: sólo ${hueco} min de descanso con el día ${dd}`).toBeGreaterThanOrEqual(pl.reglas.descansoMin);
      }
      let racha = 1;

      for (let i = d - 1; turno(p, i) && racha < 100; i--) racha++;
      for (let i = d + 1; turno(p, i) && racha < 100; i++) racha++;
      expect(racha, `${quien}: ${racha} días seguidos`).toBeLessThanOrEqual(pl.reglas.maxSeguidos);
      const lunes = d - mod(d, 7);
      let horas = 0;

      for (let i = lunes; i < lunes + 7; i++) {
        const t = turno(p, i);

        if (t) horas += dur(pl.franjas[t[0]]) / 60;
      }
      expect(horas, `${quien}: ${horas} h esa semana`).toBeLessThanOrEqual(pl.reglas.maxHorasSemana);
    }
  }

  // 2) Las cuentas, hechas a mano, contra las del motor.
  let total = 0;
  let sin = 0;
  let sobran = 0;

  for (let d = d0; d < d1; d++)
    for (const pu of pl.puestos)
      for (const fr of pu.franjas) {
        const n = pu.pide[fr]?.[mod(d, 7)] ?? 0;
        let hay = (pl.cubre[clave(pu.id, fr, d)] || []).length;

        for (const p of pl.personas) if (p.puesto === pu.id && !ausente(p, d) && codigo(p, d) === fr) hay++;
        total += n;
        if (hay < n) sin += n - hay;
        else sobran += hay - n;
        // Nunca se cubre de más: si sobra, es por titulares, no por coberturas.
        if (hay > n) expect((pl.cubre[clave(pu.id, fr, d)] || []).length, `${donde}: ${pu.nombre} ${fr} día ${d} cubierto de más`).toBe(0);
      }
  const r = resumen(pl, d0, d1);

  expect({ total: r.total, sin: r.sin, sobran: r.sobran }, `${donde}: las cuentas no cuadran`).toEqual({ total, sin, sobran });
  expect(r.porDia.reduce((a, b) => a + b, 0), donde).toBe(sin);

  // 3) Lo que el motor dice que hace cada quien, contra lo contado.
  for (const p of pl.personas)
    for (let d = d0; d < d1; d++) {
      const t = turno(p, d);
      const m = turnoDe(pl, p, d);

      expect(m ? m.franja : null, `${donde}: ${p.nombre} día ${d}`).toBe(t ? t[0] : null);
    }
}

/** La comprobación completa: la independiente, más lo que sólo el motor sabe. */
function comprobar(pl: Plan, d0: number, d1: number, donde: string) {
  expect(incoherencias(pl), donde).toEqual([]);
  independiente(pl, d0, d1, donde);
  // Si un puesto tiene sacafranco fijo y aun así falta gente, es que no puede.
  for (let d = d0; d < d1; d++)
    for (const pu of pl.puestos)
      for (const f of pu.franjas) {
        if (pl.no[clave(pu.id, f, d)] || falta(pl, pu, f, d) <= 0) continue;
        for (const s of fijosDe(pl, pu.id))
          expect(impedimento(pl, s, pu, f, d), `${donde}: ${s.nombre} podía cubrir ${pu.nombre} el día ${d}`).not.toBeNull();
      }
}

/* ------------------------------------------------------------------ */
/* Los cambios que puede hacer alguien armando un horario              */
/* ------------------------------------------------------------------ */

/** Aplica un cambio al azar. Devuelve su nombre, o "" si no había a quién aplicarlo. */
function cambio(pl: Plan, r: Azar, d0: number, sello: string): string {
  const d1 = d0 + 7;
  const titulares = pl.personas.filter((p) => !esSacafranco(p));
  const sacas = pl.personas.filter(esSacafranco);
  const franjasDe = (p: Persona) => pl.puestos.find((x) => x.id === p.puesto)?.franjas || [];

  switch (ent(r, 17)) {
    case 0: {
      const p = titulares.length ? uno(r, titulares) : null;
      const fr = p ? franjasDe(p) : [];

      if (!p || !fr.length) return "";
      const a = fr[0];
      const b = fr[fr.length - 1];

      p.patron = uno(r, [
        [...rep(a, 5), F, F], [...rep(a, 6), F], [...rep(a, 4), ...rep(F, 4)], [a, a, b, b, F, F],
        [...rep(a, 4), ...rep(b, 4), F, F], [a, F], [a], [a, F, F], [...rep(a, 5), F, F, ...rep(b, 5), F, F],
        Array.from({ length: 1 + ent(r, 28) }, () => uno(r, [...fr, F])),
      ]);
      p.desfase = ent(r, 40) - 10;
      p.manual = {};

      return "otra rotación";
    }
    case 1:
      if (!pl.personas.length) return "";
      uno(r, pl.personas).desfase += uno(r, [-30, -3, -1, 1, 2, 9, 100]);

      return "correr la rotación";
    case 2: {
      const p = titulares.length ? uno(r, titulares) : null;

      if (!p) return "";
      p.manual[d0 + ent(r, 7)] = uno(r, [...franjasDe(p), F]);

      return "cambiar un día suelto";
    }
    case 3: {
      if (!pl.puestos.length) return "";
      const pu = uno(r, pl.puestos);
      const c = uno(r, COBERTURAS);
      const antes = pu.franjas;

      pu.franjas = [...c.franjas];
      pu.pide = JSON.parse(JSON.stringify(c.pide));
      // Igual que la pantalla: la rotación de su gente se traduce a las franjas nuevas.
      for (const p of pl.personas) {
        if (p.puesto !== pu.id) continue;
        p.patron = p.patron.map((cod) => { const i = antes.indexOf(cod); return i < 0 ? cod : c.franjas[Math.min(i, c.franjas.length - 1)]; });
        p.manual = {};
      }

      return "otra cobertura";
    }
    case 4: {
      if (!pl.personas.length) return "";
      const p = uno(r, pl.personas);
      const desde = d0 - 3 + ent(r, 12);

      (p.ausencias = p.ausencias || []).push({ desde, hasta: desde + ent(r, 15), tipo: uno(r, ["vacaciones", "permiso", "incapacidad"]) });

      return "una ausencia";
    }
    case 5: {
      if (!sacas.length || !pl.puestos.length) return "";
      const s = uno(r, sacas);
      const id = uno(r, pl.puestos).id;

      s.fijos = (s.fijos || []).includes(id) ? s.fijos!.filter((x) => x !== id) : [...(s.fijos || []), id];

      return "puestos fijos";
    }
    case 6: {
      const huecos: Array<[Puesto, string, number]> = [];

      for (let d = d0; d < d1; d++)
        for (const pu of pl.puestos) for (const f of pu.franjas) if (falta(pl, pu, f, d) > 0) huecos.push([pu, f, d]);
      if (!huecos.length) return "";
      const [pu, f, d] = uno(r, huecos);
      const c = candidatos(pl, pu, f, d).filter((x) => !x.impedimento);

      if (!c.length) return "";
      delete pl.no[clave(pu.id, f, d)];
      poner(pl, clave(pu.id, f, d), uno(r, c).persona.id);

      return "cubrir a mano";
    }
    case 7: {
      const ks = Object.keys(pl.cubre);

      if (!ks.length) return "";
      const k = uno(r, ks);

      quitar(pl, k, pl.cubre[k][0]);
      pl.no[k] = 1;

      return "quitar una cobertura";
    }
    case 8: {
      const antes = resumen(pl, d0, d1).sin;
      const res = cubrirTodo(pl, d0, d1);

      expect(resumen(pl, d0, d1).sin, `${sello}: cubrir lo que falta dejó más huecos`).toBe(antes - res.hechos);
      for (let d = d0; d < d1; d++)
        for (const pu of pl.puestos)
          for (const f of pu.franjas)
            if (falta(pl, pu, f, d) > 0)
              expect(candidatos(pl, pu, f, d).some((c) => !c.impedimento && !c.extra), `${sello}: quedó un hueco con gente libre`).toBe(false);

      return "cubrir lo que falta";
    }
    case 9:
      pl.reglas = { descansoMin: uno(r, [0, 480, 600, 720, 1440]), maxSeguidos: uno(r, [1, 3, 5, 6, 7, 12]), maxHorasSemana: uno(r, [24, 48, 60, 72, 168]) };

      return "otras reglas";
    case 10: {
      if (!pl.puestos.length) return "";
      const pu = uno(r, pl.puestos);

      pu.requiere = pu.requiere?.length ? [] : [uno(r, ["arma", "canino", "curso"])];
      for (const p of pl.personas) if (r() < 0.4) p.aptitudes = [uno(r, ["arma", "canino", "curso"])];

      return "un puesto exige algo";
    }
    case 11:
      pl.personas.push(saca(`nuevo-${sello}-${pl.personas.length}`, pl.puestos.length ? [uno(r, pl.puestos).id] : [], uno(r, [[...rep(L, 6), F], [...rep(L, 5), F, F], [L], [L, F]]), ent(r, 7)));

      return "un sacafranco nuevo";
    case 12: {
      if (pl.personas.length < 3) return "";
      const fuera = uno(r, pl.personas).id;

      pl.personas = pl.personas.filter((p) => p.id !== fuera);

      return "una baja";
    }
    case 13: {
      const c = uno(r, COBERTURAS);
      const id = `puesto-${sello}-${pl.puestos.length}`;

      pl.puestos.push({ id, nombre: id, franjas: [...c.franjas], pide: JSON.parse(JSON.stringify(c.pide)) });
      if (r() < 0.6) pl.personas.push(titular(`t-${id}`, id, uno(r, [[...rep(c.franjas[0], 5), F, F], [c.franjas[0]], [c.franjas[0], F]]), ent(r, 7)));

      return "un puesto nuevo";
    }
    case 14: {
      if (pl.puestos.length < 3) return "";
      const fuera = uno(r, pl.puestos).id;

      pl.puestos = pl.puestos.filter((p) => p.id !== fuera);
      for (const p of pl.personas) {
        // Quien estaba en el puesto cerrado pasa a otro, con una rotación de ése.
        if (p.puesto === fuera) { const n = uno(r, pl.puestos); p.puesto = n.id; p.patron = n.franjas.length ? [...rep(n.franjas[0], 5), F, F] : [F]; p.manual = {}; }
      }

      return "cerrar un puesto";
    }
    case 15: {
      // Un titular pasa a ser sacafranco, o al revés: un traslado.
      if (!pl.personas.length || !pl.puestos.length) return "";
      const p = uno(r, pl.personas);

      if (esSacafranco(p)) { const n = uno(r, pl.puestos); p.puesto = n.id; p.fijos = undefined; p.patron = n.franjas.length ? [...rep(n.franjas[0], 5), F, F] : [F]; }
      else { p.puesto = null; p.fijos = [uno(r, pl.puestos).id]; p.patron = [...rep(L, 6), F]; }
      p.manual = {};

      return "un traslado";
    }
    default: {
      const s = sacas.length ? uno(r, sacas) : null;

      if (!s) return "";
      s.manual[d0 + ent(r, 7)] = uno(r, [L, F]);

      return "el sacafranco cambia un día";
    }
  }
}

/** Una sesión de alguien armando el horario: cambios, semanas y deshacer. */
function sesion(pl: Plan, r: Azar, sello: string, pasos: number, conAcomodo: boolean) {
  let semana = ent(r, 9) - 4;
  const ventana = () => [semana * 7 - 7, semana * 7 + 14] as const;
  const arreglar = () => limpiar(pl, ...ventana());

  arreglar();
  comprobar(pl, semana * 7, semana * 7 + 7, `${sello} al empezar`);

  for (let i = 0; i < pasos; i++) {
    const antes = JSON.stringify(pl);
    const que = r();
    let nombre: string;

    if (que < 0.1) {
      semana += uno(r, [-3, -1, 1, 1, 2, 6]);
      nombre = "cambiar de semana";
    } else if (que < 0.14 && conAcomodo) {
      const patrones = JSON.stringify(pl.personas.map((p) => p.patron));
      // Como en la pantalla, pero con un grupo acotado para que la prueba no tarde.
      const mueve = pl.personas.filter((p) => (esSacafranco(p) ? (p.fijos || []).length > 0 : fijosDe(pl, p.puesto || "").length > 0)).slice(0, 6).map((p) => p.id);
      const res = acomodar(pl, semana * 7, semana * 7 + 14, mueve);

      expect(res.despues, `${sello}: acomodar empeoró`).toBeLessThanOrEqual(res.antes);
      expect(JSON.stringify(pl.personas.map((p) => p.patron)), `${sello}: acomodar le cambió la rotación a alguien`).toBe(patrones);
      nombre = "acomodar";
    } else {
      nombre = cambio(pl, r, semana * 7, sello);
      if (!nombre) continue;
    }
    arreglar();
    const donde = `${sello} paso ${i} (${nombre})`;

    comprobar(pl, semana * 7, semana * 7 + 7, donde);
    // Limpiar dos veces es lo mismo que una.
    const limpio = JSON.stringify(pl);

    arreglar();
    expect(JSON.stringify(pl), `${donde}: limpiar otra vez cambió algo`).toBe(limpio);
    // Deshacer: la copia de antes sigue siendo un plan válido tal cual.
    if (r() < 0.08) {
      const atras: Plan = JSON.parse(antes);

      limpiar(atras, ...ventana());
      comprobar(atras, semana * 7, semana * 7 + 7, `${donde}, deshecho`);
    }
  }
}

/**
 * Los cinco mil tardan unos seis minutos. En la pasada normal (`npm test`) corre
 * uno de cada diez; los cinco mil enteros, con `npm run test:planificador`.
 */
const COMPLETO = !!process.env.PLANIFICADOR_COMPLETO;
const casos = (n: number, desde: number) =>
  Array.from({ length: n }, (_, i) => desde + i).filter((_, i) => COMPLETO || i % 10 === 0);

/* ------------------------------------------------------------------ */
/* A · 2000 secuencias sobre la operación real                         */
/* ------------------------------------------------------------------ */

const REAL = planDesdeHorarioReal(demo as any, (demo as any).rotations, demo.base, demo.tz);

/* Vitest 3+ also fails a SYNCHRONOUS test that outlives `testTimeout` (5 s);
   Vitest 2 only timed out async tests. The heaviest seeds take 4-10 s on a
   loaded machine, so this CPU-bound property suite gets its own ceiling. */
describe("Planificador · A · 2000 sesiones sobre la operación real de la demo", { timeout: 60_000 }, () => {
  it.each(casos(2000, 10_000))("sesión real %i", (semilla) => {
    const r = azar(semilla);
    const pl = copiar(REAL.plan);

    for (const id of Object.keys(FR)) pl.franjas[id] = pl.franjas[id] || { ...FR[id] };
    sesion(pl, r, `A${semilla}`, 5 + ent(r, 6), semilla % 10 === 0);
  });
});

/* ------------------------------------------------------------------ */
/* B · 1500 empresas inventadas                                        */
/* ------------------------------------------------------------------ */

/** Una empresa: sedes, puestos de todo tipo, titulares con rotaciones verosímiles y sacafrancos por sede. */
function empresa(r: Azar, tamano: number): Plan {
  const pl = vacio();
  const sedes = 1 + ent(r, tamano);

  for (let s = 0; s < sedes; s++) {
    const ids: string[] = [];

    for (let i = 0, n = 1 + ent(r, 5); i < n; i++) {
      const c = uno(r, COBERTURAS);
      const id = `s${s}p${i}`;

      ids.push(id);
      pl.puestos.push({ id, nombre: `Sede ${s} · Puesto ${i}`, franjas: [...c.franjas], pide: JSON.parse(JSON.stringify(c.pide)) });
      const modo = ent(r, 5);
      const [a, b] = [c.franjas[0], c.franjas[c.franjas.length - 1]];

      if (modo === 0) continue; // puesto recién abierto: nadie asignado
      if (modo === 1 && a !== b) {
        // rotativo: tres personas en 2-2-2 escalonadas
        for (let k = 0; k < 3; k++) pl.personas.push(titular(`${id}r${k}`, id, [a, a, b, b, F, F], k * 2));
      } else if (modo === 2 && pl.franjas[a].ini === pl.franjas[a].fin) {
        for (let k = 0; k < 2; k++) pl.personas.push(titular(`${id}x${k}`, id, [a, F], k)); // 24×24
      } else {
        // un titular por franja y por persona que pide
        for (const f of c.franjas)
          for (let k = 0, m = Math.max(...c.pide[f]); k < m; k++)
            if (r() < 0.9) pl.personas.push(titular(`${id}${f}${k}`, id, uno(r, [[...rep(f, 5), F, F], [...rep(f, 6), F], [f], [...rep(f, 4), ...rep(F, 4)], [f, F]]), ent(r, 14)));
      }
    }
    for (let k = 0, n = ent(r, 3); k < n; k++)
      pl.personas.push(saca(`s${s}saca${k}`, ids.filter(() => r() < 0.7), uno(r, [[...rep(L, 6), F], [...rep(L, 5), F, F], [L]]), ent(r, 7)));
  }
  for (const p of pl.personas) if (r() < 0.08) p.ausencias = [{ desde: ent(r, 20) - 5, hasta: ent(r, 20) + 5, tipo: "vacaciones" }];

  return pl;
}

describe("Planificador · B · 1500 empresas inventadas", () => {
  it.each(casos(1500, 20_000))("empresa %i", (semilla) => {
    const r = azar(semilla);

    if (semilla % 5 === 0) {
      // SE SABE LA RESPUESTA: k puestos de día con titulares en 5×2 (k ≤ 3) y un
      // sacafranco 6×1 que los tiene todos. Dos francos por puesto y semana son
      // 2k ≤ 6 días: caben. Acomodar tiene que encontrarlo, arranquen como arranquen.
      const k = 1 + ent(r, 3);
      const pl = vacio();

      for (let i = 0; i < k; i++) {
        pl.puestos.push({ id: `p${i}`, nombre: `p${i}`, franjas: ["D"], pide: { D: siete(1) } });
        pl.personas.push(titular(`t${i}`, `p${i}`, [...rep("D", 5), F, F], ent(r, 7)));
      }
      pl.personas.push(saca("s", pl.puestos.map((p) => p.id), [...rep(L, 6), F], ent(r, 7)));
      const res = acomodar(pl, 0, 28);

      expect(res.despues, `B${semilla}: con ${k} puestos en 5×2 tenía que quedar completo`).toBe(0);
      comprobar(pl, 0, 28, `B${semilla} acomodado`);

      return;
    }
    if (semilla % 5 === 1) {
      // Y con 6×1: un franco por puesto y semana, así que caben hasta seis.
      const k = 1 + ent(r, 6);
      const pl = vacio();

      for (let i = 0; i < k; i++) {
        pl.puestos.push({ id: `p${i}`, nombre: `p${i}`, franjas: ["D"], pide: { D: siete(1) } });
        pl.personas.push(titular(`t${i}`, `p${i}`, [...rep("D", 6), F], ent(r, 7)));
      }
      pl.personas.push(saca("s", pl.puestos.map((p) => p.id), [...rep(L, 6), F], ent(r, 7)));
      const res = acomodar(pl, 0, 28);

      expect(res.despues, `B${semilla}: con ${k} puestos en 6×1 tenía que quedar completo`).toBe(0);
      comprobar(pl, 0, 28, `B${semilla} acomodado`);

      return;
    }
    const pl = empresa(r, semilla % 97 === 0 ? 40 : 5);

    sesion(pl, r, `B${semilla}`, 4 + ent(r, 5), semilla % 4 === 2);
  });
});

/* ------------------------------------------------------------------ */
/* C · 1000 lecturas del horario real con los datos estropeados        */
/* ------------------------------------------------------------------ */

const BASURA = [null, undefined, "", "x", 0, -1, 1e9, NaN, {}, [], true, "24:00", "7:5", "25:99", "2026-13-40", "a|b"];

function estropear(r: Azar): { ov: any; rot: any; base: any; tz: any; dias: any } {
  const ov: any = JSON.parse(JSON.stringify({ stations: demo.stations, positions: demo.positions, assignments: demo.assignments, shifts: demo.shifts, overrides: demo.overrides }));
  let rot: any = JSON.parse(JSON.stringify((demo as any).rotations));
  const golpes = 1 + ent(r, 12);
  /** Las filas que son objetos de verdad (las que ya se estropearon antes no se pueden tocar). */
  const objs = (x: unknown): any[] => (Array.isArray(x) ? x.filter((o) => o && typeof o === "object") : []);

  for (let g = 0; g < golpes; g++) {
    const tabla = uno(r, ["stations", "positions", "assignments", "shifts", "overrides"]);
    const filas: any[] = Array.isArray(ov[tabla]) ? ov[tabla] : [];

    switch (ent(r, 12)) {
      case 0: ov[tabla] = uno(r, [null, undefined, "x", 7, {}, []]); break;
      case 1: if (filas.length) filas.splice(ent(r, filas.length), 1 + ent(r, 10)); break;
      case 2: if (filas.length) filas[ent(r, filas.length)] = uno(r, BASURA); break;
      case 3: if (filas.length) { const f = filas[ent(r, filas.length)]; if (f && typeof f === "object") f[uno(r, Object.keys(f))] = uno(r, BASURA); } break;
      case 4: if (filas.length) filas.push(JSON.parse(JSON.stringify(filas[ent(r, filas.length)] ?? null))); break; // repetido
      case 5: for (const s of objs(ov.stations)) if (s && r() < 0.3) s.scheduleType = uno(r, ["24h", "12h-day", "12h-night", "custom", "raro", null]); break;
      case 6: for (const p of objs(ov.positions)) if (p && r() < 0.3) { p.startTime = uno(r, ["00:00", "06:00", "22:00", "07:00", "23:59", null, "x"]); p.endTime = uno(r, ["00:00", "06:00", "14:00", "07:00", "08:30", undefined]); } break;
      case 7: for (const x of objs(rot)) if (x && r() < 0.4) { x.dayShifts = uno(r, [0, 1, 5, -3, 400, NaN, null, "5", 2.5]); x.nightShifts = uno(r, [0, 2, -1, 1e6, undefined]); x.restDays = uno(r, [0, 1, 2, -2, 99, "x"]); } break;
      case 8: for (const a of objs(ov.assignments)) if (a && r() < 0.2) { a.stationId = uno(r, ["no-existe", null, a.stationId]); a.isRelief = uno(r, [true, false, null, "sí"]); a.coveredStationIds = uno(r, [null, "x", ["no-existe"], [], undefined]); } break;
      case 9: for (const s of objs(ov.shifts)) if (s && r() < 0.05) s.startTime = uno(r, ["ayer", null, 5, "2026-10-07T25:00:00Z", "1970-01-01T00:00:00Z", "2099-01-01T00:00:00Z"]); break;
      case 10: rot = uno(r, [null, [], "x", [null, {}, { id: 3 }]]); break;
      default: for (const s of objs(ov.stations)) if (s && r() < 0.1) s.id = uno(r, ["a|b", "", null, s.id]); break;
    }
  }

  return {
    ov: r() < 0.03 ? uno(r, [null, undefined, "x", []]) : ov,
    rot,
    base: r() < 0.9 ? demo.base : uno(r, ["", null, "ayer", "2026-10-06", "1999-12-31"]),
    tz: r() < 0.85 ? demo.tz : uno(r, ["", "Marte/Olympus", null, "UTC", "Asia/Kolkata", "Pacific/Kiritimati"]),
    dias: r() < 0.8 ? 28 : uno(r, [0, -5, 1, 7, 1000, NaN, "28", null]),
  };
}

describe("Planificador · C · 1000 lecturas con los datos estropeados", () => {
  it.each(casos(1000, 30_000))("lectura estropeada %i", (semilla) => {
    const r = azar(semilla);
    const e = estropear(r);
    const leido = planDesdeHorarioReal(e.ov, e.rot, e.base, e.tz, e.dias);
    const pl = leido.plan;

    expect(leido.coincidencia).toBeGreaterThanOrEqual(0);
    expect(leido.coincidencia).toBeLessThanOrEqual(1);
    // Lo leído es un plan que el motor puede manejar sin más.
    const ids = new Set(pl.puestos.map((p) => p.id));

    for (const pu of pl.puestos) {
      expect(pu.id.includes("|")).toBe(false);
      for (const f of pu.franjas) {
        expect(pl.franjas[f], `puesto con franja ${f} que no existe`).toBeTruthy();
        expect(pu.pide[f]).toHaveLength(7);
        for (const n of pu.pide[f]) expect(Number.isInteger(n) && n >= 0 && n <= 20).toBe(true);
      }
    }
    for (const p of pl.personas) {
      expect(p.patron.length).toBeLessThanOrEqual(366);
      expect(Number.isFinite(p.desfase)).toBe(true);
      if (p.puesto !== null) for (const c of p.patron) expect(c === F || (ids.has(p.puesto) && pl.puestos.find((x) => x.id === p.puesto)!.franjas.includes(c))).toBe(true);
      for (const f of p.fijos || []) expect(ids.has(f)).toBe(true);
    }
    expect(new Set(pl.personas.map((p) => p.id)).size).toBe(pl.personas.length);
    // Y se puede trabajar con él.
    sesion(pl, r, `C${semilla}`, 3, false);
  });
});

/* ------------------------------------------------------------------ */
/* D · 500 borradores corruptos                                        */
/* ------------------------------------------------------------------ */

function corromper(pl: any, r: Azar) {
  const golpes = 1 + ent(r, 10);
  const raro = () => uno(r, [null, undefined, "", "x", -1, 1e12, NaN, {}, [], true, 2.5, "a|b"]);

  for (let g = 0; g < golpes; g++) {
    const vivos = (x: unknown): any[] => (Array.isArray(x) ? x.filter((o) => o && typeof o === "object") : []);
    const p = vivos(pl.personas).length ? uno(r, vivos(pl.personas)) : null;
    const pu = vivos(pl.puestos).length ? uno(r, vivos(pl.puestos)) : null;

    switch (ent(r, 20)) {
      case 0: if (p) p.puesto = uno(r, ["no-existe", "", 7, undefined, null]); break;
      case 1: if (p) p.patron = uno(r, [null, "DDDDDFF", [], ["ZZ", "D", null, 3], Array(5000).fill("D"), [F, L, "N8"]]); break;
      case 2: if (p) p.desfase = raro(); break;
      case 3: if (p) p.manual = uno(r, [null, [], { x: "D", 3: "ZZ", "2.5": "D", 4: null, 5: F }, "x"]); break;
      case 4: if (p) p.fijos = uno(r, [null, "x", ["no-existe", pu?.id, pu?.id], [null, 3]]); break;
      case 5: if (p) p.ausencias = uno(r, [null, "x", [{ desde: 9, hasta: 2, tipo: "" }, { desde: NaN, hasta: 3 }, null, { desde: "1", hasta: "4", tipo: 7 }]]); break;
      case 6: if (p) p.id = uno(r, ["", "a|b", null, pl.personas[0]?.id]); break;
      case 7: if (pu) pu.pide = uno(r, [null, "x", { D: [1, -4, NaN, "2", 99, null], N: "x", ZZ: siete(1) }, []]); break;
      case 8: if (pu) pu.franjas = uno(r, [null, "D", ["D", "D", "ZZ", null, "N"], []]); break;
      case 9: if (pu) pu.id = uno(r, ["", "a|b", null, pl.puestos[0]?.id]); break;
      case 10: if (pu) pu.requiere = uno(r, [null, "arma", [null, 3, "arma", ""]]); break;
      case 11: pl.franjas = uno(r, [null, [], { D: null, N: { ini: "x", fin: -5 }, F: FR.D, "a|b": FR.D, M8: { ini: 2.7, fin: 9e9, nombre: 3 } }]); break;
      case 12: pl.cubre = uno(r, [null, [], "x", { "a|b": ["x"], [`${pu?.id}|D|NaN`]: [p?.id], [`${pu?.id}|D|3`]: [p?.id, p?.id, "no-existe"], [`${pu?.id}|D|4`]: "x", [`${pu?.id}|ZZ|1`]: [p?.id], [`${pu?.id}|D|2.5`]: [p?.id] }]); break;
      case 13: if (p && pu) { pl.cubre = pl.cubre && typeof pl.cubre === "object" ? pl.cubre : {}; for (const f of pu.franjas || []) for (let d = 0; d < 5; d++) pl.cubre[`${pu.id}|${f}|${d}`] = [p.id]; } break; // la misma persona en todo
      case 14: pl.auto = uno(r, [null, "x", { basura: 1, [`${pu?.id}|D|3|no-existe`]: 1, "||": 1 }]); break;
      case 15: pl.no = uno(r, [null, 3, { basura: 1, "a|b|c": 1, [`${pu?.id}|D|x`]: 1 }]); break;
      case 16: pl.reglas = uno(r, [null, "x", { descansoMin: -9, maxSeguidos: 0, maxHorasSemana: NaN }, { descansoMin: 1e9, maxSeguidos: 1e9, maxHorasSemana: 1e9 }, {}]); break;
      case 17: pl.personas = uno(r, [null, "x", [null, 3, "x", ...(Array.isArray(pl.personas) ? pl.personas.slice(0, 5) : [])]]); break;
      case 18: pl.puestos = uno(r, [null, {}, [null, "x", ...(Array.isArray(pl.puestos) ? pl.puestos.slice(0, 5) : [])]]); break;
      default: if (Array.isArray(pl.personas) && pl.personas.length) pl.personas.push(JSON.parse(JSON.stringify(pl.personas[0]))); break; // gemelo con el mismo id
    }
  }
}

describe("Planificador · D · 500 borradores corruptos", () => {
  it.each(casos(500, 40_000))("borrador corrupto %i", (semilla) => {
    const r = azar(semilla);
    const pl: any = semilla % 2 ? copiar(REAL.plan) : empresa(r, 3);

    if (semilla % 3 === 0) { limpiar(pl, 0, 14); cubrirTodo(pl, 0, 7); } // que haya coberturas que corromper
    corromper(pl, r);
    // Sanear nunca lanza, y lo que deja es un plan con el que se puede trabajar.
    expect(() => sanear(pl)).not.toThrow();
    const saneado = JSON.stringify(pl);

    sanear(pl);
    expect(JSON.stringify(pl), `D${semilla}: sanear dos veces no es lo mismo que una`).toBe(saneado);
    sesion(pl, r, `D${semilla}`, 3, false);
  });
});
