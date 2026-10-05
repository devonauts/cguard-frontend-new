/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL MOTOR DEL PLANIFICADOR
 *
 * Programador › Planificador es una hoja donde se arma un horario como BORRADOR:
 * qué pide cada puesto, qué rotación lleva cada persona y quién cubre lo que
 * falta. Este módulo es toda su lógica, sin pantalla y sin red, para que se
 * pueda probar con miles de casos (ver `motor.test.ts`).
 *
 * ── EL MODELO, EN CUATRO IDEAS ──────────────────────────────────────────────
 *  · FRANJA: un tramo del día con hora de entrada y de salida («Diurna
 *    07:00–19:00»). No hay «día» y «noche» cableados: un puesto de tres turnos
 *    de 8 horas, o uno de 24, son sólo otras franjas.
 *  · El PUESTO dice qué PIDE: cuánta gente en cada franja, según el día de la
 *    semana. Cerrar sábado y domingo es pedir cero esos días.
 *  · La PERSONA lleva una ROTACIÓN: una tira de días que se repite (franja,
 *    franco, o «disponible» para quien cubre). `desfase` dice por dónde empieza.
 *  · El HUECO es del PUESTO, no de una persona: lo que pide menos lo que hay.
 *    Lo cubre su sacafranco fijo solo, o alguien a mano.
 *
 * Los días son enteros: el 0 es un LUNES, y eso es lo único que el motor sabe
 * del calendario. Qué fecha es el día 0 lo decide quien lo usa.
 *
 * Las funciones MUTAN el plan que reciben. Quien necesite deshacer guarda antes
 * una copia (`copiar`), que es lo que hace la pantalla.
 */

/** Código de un día en una rotación: el id de una franja, `F` franco, `L` disponible. */
export type Codigo = string;
export const FRANCO = "F";
export const LIBRE = "L";

export interface Franja {
  id: string;
  nombre: string;
  /** Minutos desde medianoche. Si `fin <= ini` la franja cruza la medianoche. */
  ini: number;
  fin: number;
}

export interface Puesto {
  id: string;
  nombre: string;
  detalle?: string;
  /** Ids de las franjas que este puesto usa, en orden (la primera es «la de día»). */
  franjas: string[];
  /** Cuánta gente pide: por franja, siete números (lunes…domingo). */
  pide: Record<string, number[]>;
  /** Lo que hay que tener para trabajar aquí (arma, curso, licencia…). */
  requiere?: string[];
}

export interface Ausencia {
  desde: number;
  hasta: number;
  /** `vacaciones`, `permiso`, `incapacidad`… Sólo se usa para explicarlo. */
  tipo: string;
}

export interface Persona {
  id: string;
  nombre: string;
  /** Su puesto. `null` = sacafranco: no tiene puesto propio, cubre los de otros. */
  puesto: string | null;
  patron: Codigo[];
  desfase: number;
  /** Cambios de un día suelto, por encima de la rotación. */
  manual: Record<number, Codigo>;
  /** Sacafranco: los puestos cuyos huecos cubre solo. */
  fijos?: string[];
  ausencias?: Ausencia[];
  aptitudes?: string[];
}

export interface Reglas {
  /** Descanso mínimo entre dos turnos, en minutos. */
  descansoMin: number;
  /** Máximo de días seguidos trabajando. */
  maxSeguidos: number;
  /** Tope de horas por semana (lunes a domingo). */
  maxHorasSemana: number;
}

export interface Plan {
  franjas: Record<string, Franja>;
  puestos: Puesto[];
  personas: Persona[];
  /** `puesto|franja|día` → quién cubre (además de los titulares). */
  cubre: Record<string, string[]>;
  /** `puesto|franja|día|persona`: esa cobertura la puso solo el sacafranco fijo. */
  auto: Record<string, 1>;
  /** `puesto|franja|día`: la central dejó ese hueco sin cubrir a propósito. */
  no: Record<string, 1>;
  reglas: Reglas;
}

export const REGLAS_POR_DEFECTO: Reglas = {
  descansoMin: 10 * 60,
  maxSeguidos: 6,
  maxHorasSemana: 72,
};

export interface Turno {
  puesto: string;
  franja: string;
  tipo: "propio" | "cubre";
  /** La clave de la cobertura, cuando es una. */
  k?: string;
}

export interface Candidato {
  persona: Persona;
  /** Por qué no puede, o `null` si puede. */
  impedimento: string | null;
  /** Es un titular en franco: cubrir le cuenta como hora extra. */
  extra: boolean;
  /** Es el sacafranco fijo de ese puesto. */
  suyo: boolean;
  dias: number;
  puntos: number;
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

export const clave = (puesto: string, franja: string, d: number) =>
  `${puesto}|${franja}|${d}`;
export const partir = (k: string) => {
  const a = k.split("|");

  return { puesto: a[0], franja: a[1], d: Number(a[2]) };
};
export const diaDeSemana = (d: number) => ((d % 7) + 7) % 7;
export const copiar = (plan: Plan): Plan => JSON.parse(JSON.stringify(plan));
export const esSacafranco = (p: Persona) => p.puesto === null;

/** Duración de una franja en minutos. Entrada y salida iguales son 24 horas. */
export function duracion(f: Franja): number {
  return (f.fin - f.ini + 1440) % 1440 || 1440;
}

/** «5D 2F»: la rotación dicha en corto, para el botón. */
export function etiqueta(patron: Codigo[], nombres?: Record<string, string>): string {
  const partes: string[] = [];
  let i = 0;

  while (i < patron.length) {
    let j = i;

    while (j < patron.length && patron[j] === patron[i]) j++;
    const c = patron[i];
    const n =
      c === FRANCO ? "F" : c === LIBRE ? " disp." : (nombres?.[c] ?? c);

    partes.push(`${j - i}${n}`);
    i = j;
  }

  return partes.join(" ");
}

const puestoDe = (plan: Plan, id: string) => plan.puestos.find((p) => p.id === id);
const personaDe = (plan: Plan, id: string) => plan.personas.find((p) => p.id === id);

export { puestoDe, personaDe };

/* ------------------------------------------------------------------ */
/* El índice de coberturas                                             */
/* ------------------------------------------------------------------ */

/**
 * `persona|día` → la cobertura que hace ese día. Se guarda FUERA del plan (no
 * viaja en las copias) y se rehace solo la primera vez que se pregunta por un
 * plan nuevo. Sin él, saber qué hace alguien un día recorría todas las
 * coberturas, y el acomodo lo pregunta decenas de miles de veces.
 */
const INDICES = new WeakMap<Plan, Record<string, Turno>>();

function indice(plan: Plan): Record<string, Turno> {
  let idx = INDICES.get(plan);

  if (!idx) {
    idx = {};
    for (const k of Object.keys(plan.cubre)) {
      const { puesto, franja, d } = partir(k);

      for (const id of plan.cubre[k]) idx[`${id}|${d}`] = { puesto, franja, tipo: "cubre", k };
    }
    INDICES.set(plan, idx);
  }

  return idx;
}

export function poner(plan: Plan, k: string, id: string, auto = false): void {
  const { puesto, franja, d } = partir(k);

  (plan.cubre[k] = plan.cubre[k] || []).push(id);
  if (auto) plan.auto[`${k}|${id}`] = 1;
  indice(plan)[`${id}|${d}`] = { puesto, franja, tipo: "cubre", k };
}

export function quitar(plan: Plan, k: string, id: string): void {
  const lista = plan.cubre[k] || [];
  const i = lista.indexOf(id);

  if (i >= 0) lista.splice(i, 1);
  if (!lista.length) delete plan.cubre[k];
  delete plan.auto[`${k}|${id}`];
  delete indice(plan)[`${id}|${partir(k).d}`];
}

/* ------------------------------------------------------------------ */
/* Qué hace cada quien                                                 */
/* ------------------------------------------------------------------ */

export function ausencia(p: Persona, d: number): Ausencia | null {
  if (!p.ausencias) return null;
  for (const a of p.ausencias) if (d >= a.desde && d <= a.hasta) return a;

  return null;
}

/** Lo que dice su rotación ese día (o el cambio suelto que la pisa). */
export function propio(p: Persona, d: number): Codigo {
  const m = p.manual[d];

  if (m) return m;
  const n = p.patron.length;

  if (!n) return FRANCO;

  return p.patron[(((d + p.desfase) % n) + n) % n];
}

/** El turno que hace esa persona ese día, propio o cubriendo; `null` si no trabaja. */
export function turnoDe(plan: Plan, p: Persona, d: number): Turno | null {
  if (ausencia(p, d)) return null;
  const c = propio(p, d);

  if (p.puesto && c !== FRANCO && c !== LIBRE)
    return { puesto: p.puesto, franja: c, tipo: "propio" };

  return indice(plan)[`${p.id}|${d}`] || null;
}

/** [entrada, salida] en minutos absolutos desde el día 0. */
function intervalo(plan: Plan, franja: string, d: number): [number, number] {
  const f = plan.franjas[franja];

  if (!f) return [d * 1440, d * 1440 + 720];
  const ini = d * 1440 + f.ini;

  return [ini, ini + duracion(f)];
}

export function horasDe(plan: Plan, franja: string): number {
  const f = plan.franjas[franja];

  return f ? duracion(f) / 60 : 12;
}

/* ------------------------------------------------------------------ */
/* Lo que pide el puesto y lo que hay                                  */
/* ------------------------------------------------------------------ */

export function pide(pu: Puesto, franja: string, d: number): number {
  return pu.pide[franja]?.[diaDeSemana(d)] ?? 0;
}

/** Cuántos titulares del puesto trabajan esa franja ese día. */
export function propios(plan: Plan, pu: Puesto, franja: string, d: number): number {
  let n = 0;

  for (const p of plan.personas)
    if (p.puesto === pu.id && !ausencia(p, d) && propio(p, d) === franja) n++;

  return n;
}

/** Positivo: falta gente. Cero: completo. Negativo: sobra. */
export function falta(plan: Plan, pu: Puesto, franja: string, d: number): number {
  return (
    pide(pu, franja, d) -
    propios(plan, pu, franja, d) -
    (plan.cubre[clave(pu.id, franja, d)]?.length ?? 0)
  );
}

/* ------------------------------------------------------------------ */
/* Las reglas                                                          */
/* ------------------------------------------------------------------ */

/** Días seguidos que llevaría trabajando si además trabajara el día `d`. */
export function seguidos(plan: Plan, p: Persona, d: number): number {
  let n = 1;
  const tope = plan.reglas.maxSeguidos + 3;

  for (let i = d - 1; i > d - tope && turnoDe(plan, p, i); i--) n++;
  for (let i = d + 1; i < d + tope && turnoDe(plan, p, i); i++) n++;

  return n;
}

/** Horas que lleva en la semana (lunes a domingo) del día `d`. */
export function horasSemana(plan: Plan, p: Persona, d: number): number {
  const lunes = d - diaDeSemana(d);
  let h = 0;

  for (let i = lunes; i < lunes + 7; i++) {
    const t = turnoDe(plan, p, i);

    if (t) h += horasDe(plan, t.franja);
  }

  return h;
}

export function diasTrabajados(plan: Plan, p: Persona, d0: number, d1: number): number {
  let n = 0;

  for (let i = d0; i < d1; i++) if (turnoDe(plan, p, i)) n++;

  return n;
}

/**
 * ¿Puede esta persona cubrir esa franja de ese puesto ese día?
 * Devuelve el motivo si NO puede, en palabras de quien arma el horario, o
 * `null` si puede. El orden importa: se dice lo más evidente primero.
 */
export function impedimento(
  plan: Plan,
  p: Persona,
  pu: Puesto,
  franja: string,
  d: number,
): string | null {
  const a = ausencia(p, d);

  if (a) return `Está de ${a.tipo}`;
  const leFalta = (pu.requiere || []).filter((r) => !(p.aptitudes || []).includes(r));

  if (leFalta.length) return `No tiene: ${leFalta.join(", ")}`;
  if (turnoDe(plan, p, d)) return "Ya trabaja ese día";
  if (esSacafranco(p) && propio(p, d) === FRANCO) return "Es su franco";

  const [ini, fin] = intervalo(plan, franja, d);
  const min = plan.reglas.descansoMin;

  for (const dd of [d - 1, d + 1]) {
    const t = turnoDe(plan, p, dd);

    if (!t) continue;
    const [i2, f2] = intervalo(plan, t.franja, dd);

    if (dd < d && ini - f2 < min) return "Sale de otro turno sin descanso suficiente";
    if (dd > d && i2 - fin < min) return "Entra a otro turno sin descanso suficiente";
  }
  if (seguidos(plan, p, d) > plan.reglas.maxSeguidos)
    return `Serían ${plan.reglas.maxSeguidos + 1} días seguidos`;
  if (horasSemana(plan, p, d) + horasDe(plan, franja) > plan.reglas.maxHorasSemana)
    return `Pasaría de ${plan.reglas.maxHorasSemana} h esa semana`;

  return null;
}

/** Los sacafrancos que tienen ese puesto como fijo. */
export function fijosDe(plan: Plan, puestoId: string): Persona[] {
  return plan.personas.filter((p) => esSacafranco(p) && (p.fijos || []).includes(puestoId));
}

/**
 * Quién puede cubrir, del mejor al peor. Primero el sacafranco fijo del puesto,
 * luego quien menos días lleva; los titulares en franco van al final porque
 * cuestan hora extra. Quien no puede sale igual, con su motivo: ver por qué
 * alguien NO está disponible ahorra la llamada para preguntárselo.
 */
export function candidatos(
  plan: Plan,
  pu: Puesto,
  franja: string,
  d: number,
): Candidato[] {
  const ya = plan.cubre[clave(pu.id, franja, d)] || [];
  const lunes = d - diaDeSemana(d);
  const lista: Candidato[] = [];

  for (const p of plan.personas) {
    if (ya.includes(p.id)) continue;
    const saca = esSacafranco(p);

    // Un titular sólo es candidato en su franco; si trabaja, ya está ocupado.
    if (!saca && propio(p, d) !== FRANCO) continue;
    const imp = impedimento(plan, p, pu, franja, d);
    const dias = diasTrabajados(plan, p, lunes, lunes + 7);
    const suyo = saca && (p.fijos || []).includes(pu.id);

    lista.push({
      persona: p,
      impedimento: imp,
      extra: !saca,
      suyo,
      dias,
      puntos: (imp ? -1000 : 0) + (saca ? 0 : -100) + (suyo ? 30 : 0) - dias,
    });
  }

  // El orden tiene que ser el MISMO siempre: a igualdad de puntos, por id.
  return lista.sort((a, b) => b.puntos - a.puntos || a.persona.id.localeCompare(b.persona.id));
}

/* ------------------------------------------------------------------ */
/* Cubrir                                                              */
/* ------------------------------------------------------------------ */

/**
 * El sacafranco FIJO de un puesto cubre sus huecos solo. Se rehace entero cada
 * vez: lo que puso antes se quita y se vuelve a calcular con el plan de ahora,
 * así un cambio de rotación no deja coberturas viejas colgando.
 */
export function aplicarFijos(plan: Plan, d0: number, d1: number): void {
  for (const x of Object.keys(plan.auto)) {
    const a = x.split("|");

    quitar(plan, clave(a[0], a[1], Number(a[2])), a[3]);
  }
  plan.auto = {};
  for (let d = d0; d < d1; d++)
    for (const pu of plan.puestos) {
      const sacas = fijosDe(plan, pu.id);

      if (!sacas.length) continue;
      for (const franja of pu.franjas) {
        const k = clave(pu.id, franja, d);

        if (plan.no[k]) continue;
        while (falta(plan, pu, franja, d) > 0) {
          const s = sacas.find((x) => !impedimento(plan, x, pu, franja, d));

          if (!s) break;
          poner(plan, k, s.id, true);
        }
      }
    }
}

/**
 * Deja el plan coherente tras un cambio: quita la cobertura que ya no hace
 * falta y la de quien ya no puede hacerla, y vuelve a poner a los fijos.
 */
export function limpiar(plan: Plan, d0: number, d1: number): void {
  for (const k of Object.keys(plan.cubre)) {
    const { puesto, franja, d } = partir(k);
    const pu = puestoDe(plan, puesto);

    for (const id of [...(plan.cubre[k] || [])].reverse()) {
      const p = personaDe(plan, id);

      if (!pu || !p || !pu.franjas.includes(franja) || falta(plan, pu, franja, d) < 0) {
        quitar(plan, k, id);
        continue;
      }
      // ¿Sigue pudiendo? Se mira SIN su propia cobertura, que si no siempre
      // diría «ya trabaja ese día».
      const eraAuto = !!plan.auto[`${k}|${id}`];

      quitar(plan, k, id);
      if (!impedimento(plan, p, pu, franja, d)) poner(plan, k, id, eraAuto);
    }
  }
  aplicarFijos(plan, d0, d1);
}

/** Llena lo que falte con sacafrancos libres. No usa hora extra: eso se decide a mano. */
export function cubrirTodo(plan: Plan, d0: number, d1: number): { hechos: number; quedan: number } {
  let hechos = 0;
  let quedan = 0;

  for (let d = d0; d < d1; d++)
    for (const pu of plan.puestos)
      for (const franja of pu.franjas) {
        const k = clave(pu.id, franja, d);

        while (falta(plan, pu, franja, d) > 0) {
          const c = candidatos(plan, pu, franja, d).find((x) => !x.impedimento && !x.extra);

          if (!c) {
            quedan += falta(plan, pu, franja, d);
            break;
          }
          delete plan.no[k];
          poner(plan, k, c.persona.id, false);
          hechos++;
        }
      }

  return { hechos, quedan };
}

/* ------------------------------------------------------------------ */
/* Medir y acomodar                                                    */
/* ------------------------------------------------------------------ */

export interface Resumen {
  /** Turnos que piden los puestos en el rango. */
  total: number;
  /** De ésos, los que nadie cubre. */
  sin: number;
  /** Gente de más: titulares donde el puesto no pide a nadie. */
  sobran: number;
  /** Huecos por día, en el orden del rango. */
  porDia: number[];
}

export function resumen(plan: Plan, d0: number, d1: number): Resumen {
  const r: Resumen = { total: 0, sin: 0, sobran: 0, porDia: [] };

  for (let d = d0; d < d1; d++) {
    let hoy = 0;

    for (const pu of plan.puestos)
      for (const franja of pu.franjas) {
        const f = falta(plan, pu, franja, d);

        r.total += pide(pu, franja, d);
        if (f > 0) hoy += f;
        else if (f < 0) r.sobran += -f;
      }
    r.sin += hoy;
    r.porDia.push(hoy);
  }

  return r;
}

/** Lo que se quiere pequeño: huecos, y en menor medida gente de sobra. */
export function costo(plan: Plan, d0: number, d1: number): number {
  aplicarFijos(plan, d0 - 7, d1);
  const r = resumen(plan, d0, d1);

  return r.sin + r.sobran * 0.5;
}

/**
 * ACOMODAR: prueba por dónde empieza la rotación de cada persona y se queda con
 * la combinación que deja menos huecos. No le cambia la rotación a nadie, sólo
 * el día en que arranca — que es justo lo que se mueve a mano cuando dos francos
 * del mismo sacafranco caen el mismo día.
 *
 * Es un descenso por coordenadas: persona a persona, se prueba cada arranque y
 * se queda el mejor. No garantiza el óptimo, pero NUNCA empeora: si ningún
 * arranque mejora, la persona se queda como estaba.
 *
 * `ids` acota a quién se puede mover (por defecto, los sacafrancos y los
 * titulares de sus puestos fijos: mover a alguien sin sacafranco no arregla nada).
 */
export function acomodar(
  plan: Plan,
  d0: number,
  d1: number,
  ids?: string[],
): { antes: number; despues: number } {
  const conFijo = new Set<string>();

  for (const p of plan.personas) if (esSacafranco(p)) for (const f of p.fijos || []) conFijo.add(f);
  const mover = plan.personas.filter((p) =>
    ids
      ? ids.includes(p.id)
      : esSacafranco(p)
        ? (p.fijos || []).length > 0
        : !!p.puesto && conFijo.has(p.puesto),
  );
  const antes = costo(plan, d0, d1);
  let actual = antes;

  for (let pasada = 0; pasada < 2 && actual > 0; pasada++) {
    let mejoro = false;

    for (const p of mover) {
      const n = p.patron.length;

      if (n < 2) continue;
      const norm = (x: number) => ((x % n) + n) % n;
      let mejor = p.desfase;

      for (let o = 0; o < n; o++) {
        if (o === norm(mejor)) continue;
        p.desfase = o;
        const c = costo(plan, d0, d1);

        if (c < actual - 1e-9) {
          actual = c;
          mejor = o;
          mejoro = true;
        }
      }
      p.desfase = mejor;
    }
    if (!mejoro) break;
  }
  const despues = costo(plan, d0, d1);

  return { antes, despues };
}

/* ------------------------------------------------------------------ */
/* Comprobar                                                           */
/* ------------------------------------------------------------------ */

/**
 * Lo que NUNCA debería ser cierto en un plan ya limpio. La pantalla no lo usa
 * para pintar: existe para que las pruebas puedan afirmar, tras cualquier
 * secuencia de cambios, que el motor no dejó nada imposible.
 */
export function incoherencias(plan: Plan): string[] {
  const mal: string[] = [];

  for (const k of Object.keys(plan.cubre)) {
    const { puesto, franja, d } = partir(k);
    const pu = puestoDe(plan, puesto);
    const lista = plan.cubre[k];

    if (!lista.length) mal.push(`${k}: cobertura vacía`);
    if (!pu) {
      mal.push(`${k}: el puesto no existe`);
      continue;
    }
    if (!pu.franjas.includes(franja)) mal.push(`${k}: el puesto no tiene esa franja`);
    if (falta(plan, pu, franja, d) < 0) mal.push(`${k}: cubre más de lo que el puesto pide`);
    if (new Set(lista).size !== lista.length) mal.push(`${k}: la misma persona dos veces`);
    for (const id of lista) {
      const p = personaDe(plan, id);

      if (!p) {
        mal.push(`${k}: cubre alguien que no existe (${id})`);
        continue;
      }
      const eraAuto = !!plan.auto[`${k}|${id}`];

      quitar(plan, k, id);
      const imp = impedimento(plan, p, pu, franja, d);

      poner(plan, k, id, eraAuto);
      if (imp) mal.push(`${k}: ${p.nombre} no puede (${imp})`);
    }
  }
  for (const x of Object.keys(plan.auto)) {
    const a = x.split("|");

    if (!(plan.cubre[clave(a[0], a[1], Number(a[2]))] || []).includes(a[3]))
      mal.push(`${x}: marcada como automática una cobertura que no existe`);
  }

  return mal;
}
