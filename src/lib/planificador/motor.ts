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
  /** El tramo por la hora de entrada: D (5–12 h), T (12–18 h), N el resto; «24» día entero. */
  tramo?: "D" | "T" | "N" | "24";
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
  /** De quién es: sede y cliente (sólo para agrupar en pantalla; el motor no los mira). */
  sedeId?: string;
  sede?: string;
  clienteId?: string;
  cliente?: string;
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
  /** Sin asignación en ningún puesto: la bolsa de disponibles. Nunca se coloca sola. */
  sinPuesto?: boolean;
  ausencias?: Ausencia[];
  aptitudes?: string[];
  /**
   * Si el franco cae en domingo, el lunes también descansa (el rol peruano).
   * El ciclo se corre un día cada vez que pasa: por eso «el libre se va
   * moviendo» y la vuelta completa no es el largo de la rotación.
   */
  francoDobleDomingo?: boolean;
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
  /** Por qué no puede, o `null` si puede (bloqueo o aviso, lo primero que haya). */
  impedimento: string | null;
  /** Lo que de verdad lo impide: ausente, ya trabaja, le falta aptitud. */
  bloqueo: string | null;
  /** Lo que sólo avisa (descanso corto, días seguidos, horas): la empresa decide. */
  aviso: string | null;
  /** Sin puesto: está en la bolsa de disponibles. */
  sinPuesto: boolean;
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
export function etiqueta(
  patron: Codigo[],
  nombres?: Record<string, string>,
): string {
  const partes: string[] = [];
  let i = 0;

  while (i < patron.length) {
    let j = i;

    while (j < patron.length && patron[j] === patron[i]) j++;
    const c = patron[i];
    const n = c === FRANCO ? "F" : c === LIBRE ? " disp." : (nombres?.[c] ?? c);

    partes.push(`${j - i}${n}`);
    i = j;
  }

  return partes.join(" ");
}

const puestoDe = (plan: Plan, id: string) =>
  plan.puestos.find((p) => p.id === id);
const personaDe = (plan: Plan, id: string) =>
  plan.personas.find((p) => p.id === id);

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

      for (const id of plan.cubre[k])
        idx[`${id}|${d}`] = { puesto, franja, tipo: "cubre", k };
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

const ciclico = (p: Persona, d: number): Codigo => {
  const n = p.patron.length;

  if (!n) return FRANCO;

  return p.patron[(((d + p.desfase) % n) + n) % n];
};

/**
 * Con franco doble en domingo la rotación deja de ser una cuenta cerrada: hay
 * que CAMINAR los días acumulando cada domingo de franco. Se camina una vez
 * por persona (dos años atrás, cuatro adelante) y se guarda; si cambia su
 * rotación o su arranque, se vuelve a caminar.
 */
const TIRAS = new WeakMap<
  Persona,
  { firma: string; ancla: number; estados: Codigo[] }
>();
const TIRA_HASTA = 1460;

function conDomingo(p: Persona, d: number): Codigo {
  const n = p.patron.length;

  if (!n) return FRANCO;
  // El ancla es el día 0 de la rotación (su fecha de inicio): antes de él no
  // hay domingos que contar, igual que en el horario real. Si queda muy atrás
  // se toma el día 0 equivalente más cercano a dos años atrás.
  let ancla = -p.desfase;

  if (ancla < -730) ancla += Math.ceil((-730 - ancla) / n) * n;
  if (d < ancla || d >= TIRA_HASTA) return ciclico(p, d);
  const firma = `${p.patron.join(",")}|${p.desfase}`;
  let t = TIRAS.get(p);

  if (!t || t.firma !== firma) {
    const estados: Codigo[] = new Array(TIRA_HASTA - ancla);
    let corrimiento = 0;

    for (let i = ancla; i < TIRA_HASTA; i++) {
      const c = p.patron[(((i - corrimiento + p.desfase) % n) + n) % n];

      // Un franco en domingo se estira: el lunes repite el mismo día del ciclo.
      if (c === FRANCO && diaDeSemana(i) === 6) corrimiento++;
      estados[i - ancla] = c;
    }
    t = { firma, ancla, estados };
    TIRAS.set(p, t);
  }

  return t.estados[d - ancla];
}

/** Lo que dice su rotación ese día (o el cambio suelto que la pisa). */
export function propio(p: Persona, d: number): Codigo {
  const m = p.manual[d];

  if (m) return m;

  return p.francoDobleDomingo ? conDomingo(p, d) : ciclico(p, d);
}

/**
 * El primer día desde `desde` en que la rotación está en su día 0 (empieza el
 * primer bloque). Es la fecha de inicio que entiende el horario real.
 */
export function proximoArranque(p: Persona, desde: number): number {
  const n = p.patron.length;

  if (n < 2) return desde;
  for (let d = desde; d < desde + n * 3 + 7; d++) {
    if (p.francoDobleDomingo) {
      if (
        propio(p, d) === p.patron[0] &&
        propio(p, d - 1) === p.patron[n - 1] &&
        p.patron[n - 1] !== p.patron[0]
      )
        return d;
    } else if ((((d + p.desfase) % n) + n) % n === 0) return d;
  }

  return desde;
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
export function propios(
  plan: Plan,
  pu: Puesto,
  franja: string,
  d: number,
): number {
  let n = 0;

  for (const p of plan.personas)
    if (p.puesto === pu.id && !ausencia(p, d) && propio(p, d) === franja) n++;

  return n;
}

/** Positivo: falta gente. Cero: completo. Negativo: sobra. */
export function falta(
  plan: Plan,
  pu: Puesto,
  franja: string,
  d: number,
): number {
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

export function diasTrabajados(
  plan: Plan,
  p: Persona,
  d0: number,
  d1: number,
): number {
  let n = 0;

  for (let i = d0; i < d1; i++) if (turnoDe(plan, p, i)) n++;

  return n;
}

/**
 * ¿Puede esta persona cubrir esa franja de ese puesto ese día?
 * Devuelve el motivo si NO puede, en palabras de quien arma el horario, o
 * `null` si puede. El orden importa: se dice lo más evidente primero.
 */
/**
 * LO QUE DE VERDAD IMPIDE cubrir: está ausente, ya trabaja ese día, no tiene
 * la aptitud que pide el puesto, o es un sacafranco en su franco. Esto no se
 * negocia.
 */
export function bloqueo(
  plan: Plan,
  p: Persona,
  pu: Puesto,
  _franja: string,
  d: number,
): string | null {
  const a = ausencia(p, d);

  if (a) return `Está de ${a.tipo}`;
  const leFalta = (pu.requiere || []).filter(
    (r) => !(p.aptitudes || []).includes(r),
  );

  if (leFalta.length) return `No tiene: ${leFalta.join(", ")}`;
  if (turnoDe(plan, p, d)) return "Ya trabaja ese día";
  if (esSacafranco(p) && !p.sinPuesto && propio(p, d) === FRANCO)
    return "Es su franco";

  return null;
}

/**
 * LO QUE SÓLO AVISA: descanso corto entre turnos, días seguidos, horas de la
 * semana. Son las «reglas» de la hoja, y la hoja no se las impone a nadie: la
 * empresa tiene su horario y decide. Sirven para que el ACOMODO AUTOMÁTICO no
 * haga barbaridades y para avisar a quien coloca a mano; nunca para prohibir.
 */
export function aviso(
  plan: Plan,
  p: Persona,
  _pu: Puesto,
  franja: string,
  d: number,
): string | null {
  const [ini, fin] = intervalo(plan, franja, d);
  const min = plan.reglas.descansoMin;

  // Dos días a cada lado, no uno: un turno de 24 horas que empieza a las 20:00
  // de anteayer acaba a las 20:00 de ayer, y contra uno de madrugada de hoy sólo
  // deja cuatro horas — con ayer «libre» en el calendario.
  for (const dd of [d - 2, d - 1, d + 1, d + 2]) {
    const t = turnoDe(plan, p, dd);

    if (!t) continue;
    const [i2, f2] = intervalo(plan, t.franja, dd);

    if (dd < d && ini - f2 < min)
      return "Sale de otro turno sin descanso suficiente";
    if (dd > d && i2 - fin < min)
      return "Entra a otro turno sin descanso suficiente";
  }
  if (seguidos(plan, p, d) > plan.reglas.maxSeguidos)
    return `Serían ${plan.reglas.maxSeguidos + 1} días seguidos`;
  if (
    horasSemana(plan, p, d) + horasDe(plan, franja) >
    plan.reglas.maxHorasSemana
  )
    return `Pasaría de ${plan.reglas.maxHorasSemana} h esa semana`;

  return null;
}

/** Bloqueo o aviso, lo primero que haya: lo que mira el acomodo automático. */
export function impedimento(
  plan: Plan,
  p: Persona,
  pu: Puesto,
  franja: string,
  d: number,
): string | null {
  return bloqueo(plan, p, pu, franja, d) ?? aviso(plan, p, pu, franja, d);
}

/** Sólo los bloqueos, para alguien que YA cubre: lo que de verdad lo saca. */
export function bloqueoSinContar(
  plan: Plan,
  p: Persona,
  pu: Puesto,
  franja: string,
  d: number,
): string | null {
  const idx = indice(plan);
  const ik = `${p.id}|${d}`;
  const suya = idx[ik];

  delete idx[ik];
  try {
    return bloqueo(plan, p, pu, franja, d);
  } finally {
    if (suya) idx[ik] = suya;
  }
}

/** Lo mismo, para alguien que YA cubre ese turno: se juzga sin contar esa cobertura. */
export function impedimentoSinContar(
  plan: Plan,
  p: Persona,
  pu: Puesto,
  franja: string,
  d: number,
): string | null {
  const idx = indice(plan);
  const ik = `${p.id}|${d}`;
  const suya = idx[ik];

  delete idx[ik];
  try {
    return impedimento(plan, p, pu, franja, d);
  } finally {
    if (suya) idx[ik] = suya;
  }
}

/** Los sacafrancos que tienen ese puesto como fijo. */
export function fijosDe(plan: Plan, puestoId: string): Persona[] {
  return plan.personas.filter(
    (p) => esSacafranco(p) && (p.fijos || []).includes(puestoId),
  );
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
    const blo = bloqueo(plan, p, pu, franja, d);
    const avi = blo ? null : aviso(plan, p, pu, franja, d);
    const dias = diasTrabajados(plan, p, lunes, lunes + 7);
    const suyo = saca && (p.fijos || []).includes(pu.id);
    const bolsa = !!p.sinPuesto;

    lista.push({
      persona: p,
      impedimento: blo ?? avi,
      bloqueo: blo,
      aviso: avi,
      sinPuesto: bolsa,
      extra: !saca,
      suyo,
      dias,
      // Orden: quien puede sin pegas, luego con aviso, luego bloqueados; dentro
      // de cada grupo, el sacafranco fijo del puesto, los sacafrancos, la
      // bolsa de disponibles y por último los titulares en franco (hora extra).
      puntos:
        (blo ? -1000 : avi ? -300 : 0) +
        (saca && !bolsa ? 0 : bolsa ? -50 : -100) +
        (suyo ? 30 : 0) -
        dias,
    });
  }

  // El orden tiene que ser el MISMO siempre: a igualdad de puntos, por id.
  return lista.sort(
    (a, b) => b.puntos - a.puntos || a.persona.id.localeCompare(b.persona.id),
  );
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

const entero = (
  x: unknown,
  min: number,
  max: number,
  defecto: number,
): number => {
  const n = Math.round(Number(x));

  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defecto;
};

/**
 * SANEAR: deja cualquier plan en un estado que el motor puede manejar, venga
 * de donde venga — una lectura del servidor con datos raros, un borrador
 * guardado por una versión anterior, o un `JSON.parse` de algo a medias.
 *
 * No «arregla» el horario: sólo quita lo que no puede significar nada (una
 * cobertura de alguien que no existe, un día de rotación en una franja que no
 * existe, un «pide −3») para que el resto de funciones no tengan que
 * defenderse una por una. Nunca lanza.
 */
export function sanear(plan: Plan): void {
  const obj = (x: any) =>
    x && typeof x === "object" && !Array.isArray(x) ? x : {};

  plan.franjas = obj(plan.franjas);
  plan.puestos = Array.isArray(plan.puestos)
    ? plan.puestos.filter(
        (p) => p && typeof p.id === "string" && p.id && !p.id.includes("|"),
      )
    : [];
  plan.personas = Array.isArray(plan.personas)
    ? plan.personas.filter(
        (p) => p && typeof p.id === "string" && p.id && !p.id.includes("|"),
      )
    : [];
  plan.cubre = obj(plan.cubre);
  plan.auto = obj(plan.auto);
  plan.no = obj(plan.no);
  const r = obj(plan.reglas);

  plan.reglas = {
    descansoMin: entero(r.descansoMin, 0, 2880, REGLAS_POR_DEFECTO.descansoMin),
    maxSeguidos: entero(r.maxSeguidos, 1, 60, REGLAS_POR_DEFECTO.maxSeguidos),
    maxHorasSemana: entero(
      r.maxHorasSemana,
      1,
      168,
      REGLAS_POR_DEFECTO.maxHorasSemana,
    ),
  };
  for (const id of Object.keys(plan.franjas)) {
    const f = plan.franjas[id];

    if (!f || id.includes("|") || id === FRANCO || id === LIBRE) {
      delete plan.franjas[id];
      continue;
    }
    f.id = id;
    f.nombre = typeof f.nombre === "string" && f.nombre ? f.nombre : id;
    f.ini = entero(f.ini, 0, 1439, 420);
    f.fin = entero(f.fin, 0, 1439, 1140);
  }
  // Ids repetidos: se queda el primero. Dos personas con el mismo id serían la
  // misma para el índice de coberturas, y una taparía a la otra.
  const vistos = new Set<string>();

  plan.puestos = plan.puestos.filter((p) =>
    vistos.has(p.id) ? false : (vistos.add(p.id), true),
  );
  vistos.clear();
  plan.personas = plan.personas.filter((p) =>
    vistos.has(p.id) ? false : (vistos.add(p.id), true),
  );

  const puestos = new Map<string, Puesto>();

  for (const pu of plan.puestos) {
    pu.nombre =
      typeof pu.nombre === "string" && pu.nombre ? pu.nombre : "Puesto";
    pu.franjas = [
      ...new Set(
        (Array.isArray(pu.franjas) ? pu.franjas : []).filter(
          (f) => typeof f === "string" && plan.franjas[f],
        ),
      ),
    ];
    const pedido = obj(pu.pide);

    pu.pide = {};
    for (const f of pu.franjas) {
      const v = Array.isArray(pedido[f]) ? pedido[f] : [];

      pu.pide[f] = [0, 1, 2, 3, 4, 5, 6].map((i) => entero(v[i], 0, 20, 0));
    }
    pu.requiere = Array.isArray(pu.requiere)
      ? pu.requiere.filter((x) => typeof x === "string" && x)
      : undefined;
    puestos.set(pu.id, pu);
  }
  for (const p of plan.personas) {
    p.nombre =
      typeof p.nombre === "string" && p.nombre ? p.nombre : "Vigilante";
    if (p.puesto !== null && typeof p.puesto !== "string") p.puesto = null;
    const pu = p.puesto ? puestos.get(p.puesto) : undefined;
    // Sin puesto que exista, no puede trabajar en él: se queda sin turnos (no se
    // convierte en sacafranco por su cuenta, que sería inventarle un papel).
    const vale = (c: unknown) =>
      c === FRANCO ||
      (p.puesto === null
        ? c === LIBRE
        : !!pu && typeof c === "string" && pu.franjas.includes(c));

    p.patron = (Array.isArray(p.patron) ? p.patron : [])
      .slice(0, 366)
      .map((c) => (vale(c) ? c : FRANCO));
    p.desfase = entero(p.desfase, -1e6, 1e6, 0);
    const manual = obj(p.manual);

    p.manual = {};
    for (const k of Object.keys(manual))
      if (Number.isInteger(Number(k)) && vale(manual[k]))
        p.manual[Number(k)] = manual[k];
    p.fijos =
      p.puesto === null
        ? [
            ...new Set(
              (Array.isArray(p.fijos) ? p.fijos : []).filter((f) =>
                puestos.has(f),
              ),
            ),
          ]
        : undefined;
    p.ausencias = (Array.isArray(p.ausencias) ? p.ausencias : [])
      .map((a) => {
        const x = Number(a?.desde);
        const y = Number(a?.hasta);

        return {
          desde: Math.round(Math.min(x, y)),
          hasta: Math.round(Math.max(x, y)),
          tipo: typeof a?.tipo === "string" && a.tipo ? a.tipo : "permiso",
        };
      })
      .filter((a) => Number.isFinite(a.desde) && Number.isFinite(a.hasta));
    p.aptitudes = Array.isArray(p.aptitudes)
      ? p.aptitudes.filter((x) => typeof x === "string" && x)
      : undefined;
    p.francoDobleDomingo = p.francoDobleDomingo ? true : undefined;
  }
  const personas = new Set(plan.personas.map((p) => p.id));
  const claveBuena = (k: string) => {
    const a = k.split("|");
    const pu = puestos.get(a[0]);

    return (
      a.length === 3 &&
      !!pu &&
      pu.franjas.includes(a[1]) &&
      /^-?\d+$/.test(a[2])
    );
  };

  for (const k of Object.keys(plan.cubre)) {
    const lista = Array.isArray(plan.cubre[k])
      ? [...new Set(plan.cubre[k].filter((id) => personas.has(id)))]
      : [];

    if (!claveBuena(k) || !lista.length) delete plan.cubre[k];
    else plan.cubre[k] = lista;
  }
  for (const x of Object.keys(plan.auto)) {
    const i = x.lastIndexOf("|");
    const k = x.slice(0, i);

    if (i < 0 || !(plan.cubre[k] || []).includes(x.slice(i + 1)))
      delete plan.auto[x];
  }
  for (const k of Object.keys(plan.no)) if (!claveBuena(k)) delete plan.no[k];
  // Las coberturas pudieron cambiar por debajo: el índice se rehace.
  INDICES.delete(plan);
  // Y una persona no puede cubrir dos cosas el mismo día: se queda la primera.
  const dia = new Set<string>();

  for (const k of Object.keys(plan.cubre)) {
    const d = k.split("|")[2];

    for (const id of [...plan.cubre[k]]) {
      if (dia.has(`${id}|${d}`)) quitar(plan, k, id);
      else dia.add(`${id}|${d}`);
    }
  }
}

/**
 * Deja el plan coherente tras un cambio: quita la cobertura que ya no hace
 * falta y la de quien ya no puede hacerla, y vuelve a poner a los fijos.
 */
export function limpiar(plan: Plan, d0: number, d1: number): void {
  sanear(plan);
  // En orden fijo (por clave), no en el que estén guardadas: así el resultado no
  // depende de por dónde se llegó a este plan.
  for (const k of Object.keys(plan.cubre).sort()) {
    const { puesto, franja, d } = partir(k);
    const pu = puestoDe(plan, puesto);

    for (const id of [...(plan.cubre[k] || [])].reverse()) {
      const p = personaDe(plan, id);

      if (
        !pu ||
        !p ||
        !pu.franjas.includes(franja) ||
        falta(plan, pu, franja, d) < 0
      ) {
        quitar(plan, k, id);
        continue;
      }
      // ¿Sigue pudiendo? Se mira SIN su propia cobertura, que si no siempre
      // diría «ya trabaja ese día». Sólo se aparta del índice un momento: quitarla
      // y volverla a poner la cambiaría de sitio, y limpiar dos veces dejaría de
      // dar lo mismo que limpiar una.
      //
      // Sólo los BLOQUEOS podan. Un aviso (descanso corto, días seguidos…) no
      // borra una cobertura que ya existe en el horario real o que alguien puso
      // a mano: aquí se podaba la noche real de un sacafranco porque al día
      // siguiente tenía su día en otra caseta, y la hoja proponía a otro.
      if (bloqueoSinContar(plan, p, pu, franja, d)) quitar(plan, k, id);
    }
  }
  aplicarFijos(plan, d0, d1);
}

/** Llena lo que falte con sacafrancos libres. No usa hora extra: eso se decide a mano. */
export function cubrirTodo(
  plan: Plan,
  d0: number,
  d1: number,
): { hechos: number; quedan: number } {
  let hechos = 0;
  let quedan = 0;

  for (let d = d0; d < d1; d++)
    for (const pu of plan.puestos)
      for (const franja of pu.franjas) {
        const k = clave(pu.id, franja, d);

        while (falta(plan, pu, franja, d) > 0) {
          const c = candidatos(plan, pu, franja, d).find(
            (x) => !x.impedimento && !x.extra,
          );

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

  for (const p of plan.personas)
    if (esSacafranco(p)) for (const f of p.fijos || []) conFijo.add(f);
  const mover = plan.personas.filter((p) =>
    ids
      ? ids.includes(p.id)
      : esSacafranco(p)
        ? (p.fijos || []).length > 0
        : !!p.puesto && conFijo.has(p.puesto),
  );
  const antes = costo(plan, d0, d1);
  let actual = antes;

  const norm = (x: number, n: number) => ((x % n) + n) % n;
  /** Una pasada persona a persona. Devuelve si algo mejoró. */
  const pasada = (): boolean => {
    let mejoro = false;

    for (const p of mover) {
      const n = p.patron.length;

      if (n < 2) continue;
      let mejor = p.desfase;

      for (let o = 0; o < n; o++) {
        if (o === norm(mejor, n)) continue;
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

    return mejoro;
  };
  /**
   * De dos en dos. Persona a persona se atasca cuando hay que mover a DOS a la
   * vez para mejorar (tres francos repartidos «casi bien»: mover a cualquiera
   * solo empeora). Sólo con grupos pequeños: son n² arranques por pareja.
   */
  const porParejas = (): boolean => {
    const g = mover.filter(
      (p) => p.patron.length >= 2 && p.patron.length <= 14,
    );

    // Tope de trabajo: cada pareja prueba (largo × largo) arranques, y cada
    // prueba recalcula el plan. Pasado el tope no se intenta — el botón tiene
    // que contestar en un par de segundos, no «pensar» medio minuto.
    let pruebas = 0;

    for (let i = 0; i < g.length; i++)
      for (let j = i + 1; j < g.length; j++)
        pruebas += g[i].patron.length * g[j].patron.length;
    if (g.length > 8 || pruebas > 1500) return false;
    for (let i = 0; i < g.length; i++)
      for (let j = i + 1; j < g.length; j++) {
        const [a, b] = [g[i], g[j]];
        const [a0, b0] = [a.desfase, b.desfase];
        let mejor: [number, number] | null = null;

        for (let x = 0; x < a.patron.length; x++)
          for (let y = 0; y < b.patron.length; y++) {
            a.desfase = x;
            b.desfase = y;
            const c = costo(plan, d0, d1);

            if (c < actual - 1e-9) {
              actual = c;
              mejor = [x, y];
            }
          }
        [a.desfase, b.desfase] = mejor || [a0, b0];
        if (mejor) return true;
      }

    return false;
  };

  for (let vuelta = 0, parejas = 0; vuelta < 10 && actual > 0; vuelta++) {
    if (pasada()) continue;
    if (parejas++ >= 3 || !porParejas()) break;
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
    if (!pu.franjas.includes(franja))
      mal.push(`${k}: el puesto no tiene esa franja`);
    if (falta(plan, pu, franja, d) < 0)
      mal.push(`${k}: cubre más de lo que el puesto pide`);
    if (new Set(lista).size !== lista.length)
      mal.push(`${k}: la misma persona dos veces`);
    for (const id of lista) {
      const p = personaDe(plan, id);

      if (!p) {
        mal.push(`${k}: cubre alguien que no existe (${id})`);
        continue;
      }
      const imp = impedimentoSinContar(plan, p, pu, franja, d);

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
