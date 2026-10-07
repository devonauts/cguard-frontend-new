/**
 * DEL HORARIO REAL AL PLANIFICADOR.
 *
 * Convierte lo que devuelve `scheduler/overview` (estaciones, plazas,
 * asignaciones, turnos ya generados) en un `Plan` del motor, para que el
 * Planificador abra con la operación de verdad y no con un lienzo en blanco.
 *
 * Es una LECTURA. Nada de lo que se haga después en el Planificador vuelve al
 * servidor: es un borrador.
 *
 * ── POR QUÉ LA FASE SE SACA DE LOS TURNOS Y NO DEL `platoonOffset` ──────────
 * El arranque de cada rotación lo calcula el generador del servidor con su
 * propia época y sus escalonados. Reimplementar esa cuenta aquí sería tener dos
 * motores que pueden discrepar. En su lugar se mira lo que el generador YA
 * escribió: se prueba cada arranque posible y se queda el que más días acierta
 * contra los turnos reales. `coincidencia` dice cuánto acertó, y la pantalla lo
 * enseña — si es bajo, el borrador no se parece al horario real y hay que
 * saberlo antes de fiarse.
 */
import {
  FRANCO,
  LIBRE,
  REGLAS_POR_DEFECTO,
  clave,
  falta,
  poner,
  sanear,
  type Franja,
  type Persona,
  type Plan,
  type Puesto,
} from "./motor";

export interface HorarioReal {
  /** Sedes vivas con su cliente: `{ id, nombre, clienteId, cliente }`. */
  postSites?: any[];
  /** Vigilantes activos SIN asignación: la bolsa de disponibles `{ id, fullName }`. */
  guards?: any[];
  /** Novedades de cobertura abiertas (faltas sin cubrir) en la ventana. */
  coverageEvents?: any[];
  stations?: any[];
  positions?: any[];
  assignments?: any[];
  shifts?: any[];
  overrides?: any[];
}

/**
 * De qué fila real sale cada pieza del plan. Lo necesita «Publicar» para
 * volver a escribir en el servidor por los mismos caminos que usa el Horario.
 */
export interface Enlace {
  personas: Record<
    string,
    {
      guardId: string;
      stationId: string;
      assignmentId: string;
      relevo: boolean;
      rotationStyleId: string | null;
      /** Tiene plaza: el generador real sólo rota a quien la tiene. */ conPlaza?: boolean;
    }
  >;
  puestos: Record<
    string,
    { postSiteId: string | null; scheduleType: string | null }
  >;
  /** Turnos reales de cada asignación por día: id del turno y estación. */
  turnos: Record<string, Record<number, { id: string; stationId: string }>>;
  /** Novedad de cobertura abierta por `puesto|día`: cubrirla cierra la novedad. */
  eventos: Record<string, string>;
  /** Coberturas del plan que vienen de un turno real (`persona|día`): sólo ésas se pueden retirar. */
  cargadas: Record<string, string>;
  /** Novedades reales por persona y día. */
  novedades: Record<string, Record<number, { id: string; type: string }>>;
}

export interface PlanReal {
  plan: Plan;
  enlace: Enlace;
  /** De 0 a 1: cuántos días de titular coinciden con los turnos reales. */
  coincidencia: number;
  /** Días comparados para esa cuenta. */
  comparados: number;
}

const minutos = (hhmm?: string | null): number => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ""));

  return m ? (Number(m[1]) * 60 + Number(m[2])) % 1440 : 0;
};
const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Una franja por ventana horaria; las dos de siempre conservan su nombre. */
const TODOS = [1, 1, 1, 1, 1, 1, 1];
const DIA_IDX: Record<string, number> = {
  lun: 0,
  mon: 0,
  mar: 1,
  tue: 1,
  mie: 2,
  mié: 2,
  wed: 2,
  jue: 3,
  thu: 3,
  vie: 4,
  fri: 4,
  sab: 5,
  sáb: 5,
  sat: 5,
  dom: 6,
  sun: 6,
};

/** Días (lunes = 0) en que opera una plaza; sin `days` = todos. */
function diasDePlaza(days: unknown): number[] {
  if (!Array.isArray(days) || !days.length) return [0, 1, 2, 3, 4, 5, 6];
  const out = new Set<number>();

  for (const d of days) {
    const k = DIA_IDX[String(d).toLowerCase().slice(0, 3)];

    if (k !== undefined) out.add(k);
  }

  return out.size ? [...out] : [0, 1, 2, 3, 4, 5, 6];
}
const unoDonde = (dias: number[]) => dias.map((x) => (x > 0 ? 1 : 0));

/** El tramo de una franja por su hora de entrada, como en el formulario del
    puesto: D entre las 5 y las 12, T entre las 12 y las 18, N el resto. */
export function tramoDeHora(ini: number): "D" | "T" | "N" {
  const h = Math.floor(ini / 60);

  if (h >= 5 && h < 12) return "D";
  if (h >= 12 && h < 18) return "T";

  return "N";
}
const NOMBRE_TRAMO: Record<string, string> = {
  D: "Mañana",
  T: "Tarde",
  N: "Noche",
};

function franjaDe(ini: number, fin: number): Franja {
  if (ini === 420 && fin === 1140)
    return { id: "D", nombre: "Diurna", ini, fin, tramo: "D" };
  if (ini === 1140 && fin === 420)
    return { id: "N", nombre: "Nocturna", ini, fin, tramo: "N" };
  if (ini === fin)
    return {
      id: `24-${hhmm(ini)}`.replace(/:/g, ""),
      nombre: "24 horas",
      ini,
      fin,
      tramo: "24",
    };
  // Cualquier otra ventana (BIOMAR: 07–15 y 15–23) lleva su tramo por la hora
  // de entrada; antes la hoja la rotulaba con la primera letra de «07:00», un «0».
  const tramo = tramoDeHora(ini);

  return {
    id: `${hhmm(ini)}-${hhmm(fin)}`.replace(/:/g, ""),
    nombre: `${NOMBRE_TRAMO[tramo]} ${hhmm(ini)}–${hhmm(fin)}`,
    ini,
    fin,
    tramo,
  };
}

/**
 * Un formateador por zona, no uno por turno: crearlo es lo caro, y una lectura
 * trae cientos de turnos. `null` si la zona no existe.
 */
const FORMATOS = new Map<string, Intl.DateTimeFormat | null>();

function formato(tz: string): Intl.DateTimeFormat | null {
  if (!FORMATOS.has(tz)) {
    let f: Intl.DateTimeFormat | null = null;

    try {
      f = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      });
    } catch {
      f = null;
    }
    FORMATOS.set(tz, f);
  }

  return FORMATOS.get(tz) ?? null;
}

/** Día (entero, 0 = `base`) y minuto local de un instante, en la zona de la empresa. */
function diaYMinuto(
  iso: string,
  base: string,
  tz: string,
): { d: number; min: number } | null {
  const t = new Date(iso);

  if (Number.isNaN(t.getTime())) return null;
  const partes: Record<string, string> = {};
  const fmt = formato(tz);

  if (!fmt) return null;
  for (const p of fmt.formatToParts(t)) partes[p.type] = p.value;
  const dia = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
  );
  const [by, bm, bd] = base.split("-").map(Number);

  return {
    d: Math.round((dia - Date.UTC(by, bm - 1, bd)) / 86_400_000),
    min: Number(partes.hour) * 60 + Number(partes.minute),
  };
}

const diasEntre = (base: string, fecha: string) => {
  const [by, bm, bd] = base.split("-").map(Number);
  const [y, m, d] = String(fecha).slice(0, 10).split("-").map(Number);

  return Math.round(
    (Date.UTC(y, m - 1, d) - Date.UTC(by, bm - 1, bd)) / 86_400_000,
  );
};

/** Un número de días de ciclo que se pueda usar: entero, ni negativo ni enorme. */
const diasDeCiclo = (x: unknown): number => {
  const n = Math.round(Number(x));

  return Number.isFinite(n) ? Math.min(60, Math.max(0, n)) : 0;
};
/** El motor usa `|` para separar sus claves: un id no puede llevarlo. */
const idLimpio = (x: unknown): string => String(x ?? "").replace(/\|/g, "¦");

const TIPOS: Record<string, string> = {
  V: "vacaciones",
  P: "permiso",
  I: "incapacidad",
  M: "incapacidad",
};

/**
 * @param base  El lunes que será el día 0 (`YYYY-MM-DD`).
 * @param dias  Cuántos días de turnos reales se comparan para sacar la fase.
 */
export function planDesdeHorarioReal(
  ov: HorarioReal,
  rotaciones: any[],
  base: string,
  tz: string,
  dias = 28,
): PlanReal {
  // Lo que llega del servidor se toma con pinzas: una lista que no es lista, o
  // un elemento nulo dentro, no puede tumbar la pantalla.
  const lista = (x: unknown): any[] =>
    Array.isArray(x) ? x.filter((o) => o && typeof o === "object") : [];

  ov = {
    postSites: lista(ov?.postSites),
    guards: lista(ov?.guards),
    coverageEvents: lista(ov?.coverageEvents),
    stations: lista(ov?.stations),
    positions: lista(ov?.positions),
    assignments: lista(ov?.assignments),
    shifts: lista(ov?.shifts),
    overrides: lista(ov?.overrides),
  };
  const sedePorId = new Map<string, any>(
    (ov.postSites || []).map((s) => [String(s.id), s]),
  );
  rotaciones = lista(rotaciones);
  dias = Math.min(60, Math.max(1, Math.round(Number(dias)) || 28));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(base))) base = "1970-01-05";
  const rotPorId = new Map<string, any>(
    (rotaciones || []).map((r) => [String(r.id), r]),
  );
  const franjas: Record<string, Franja> = {};
  const puestos: Puesto[] = [];
  const puestoPorId = new Map<string, Puesto>();
  const plazasDe = new Map<string, any[]>();

  for (const p of ov.positions || []) {
    if (p.deletedAt) continue;
    const l = plazasDe.get(idLimpio(p.stationId)) || [];

    l.push(p);
    plazasDe.set(idLimpio(p.stationId), l);
  }

  for (const st of ov.stations || []) {
    const plazas = (plazasDe.get(idLimpio(st.id)) || []).filter(
      (p) => p.type !== "sacafranco",
    );
    // `dias`: cuántas plazas operan cada día de la semana (lunes = 0). Una
    // plaza sin `days` opera todos; con `days` (['lun','mar',…]) sólo esos.
    const ventanas = new Map<
      string,
      { f: Franja; n: number; dias: number[] }
    >();

    for (const p of plazas) {
      const f = franjaDe(minutos(p.startTime), minutos(p.endTime));
      const v = ventanas.get(f.id) || { f, n: 0, dias: [0, 0, 0, 0, 0, 0, 0] };

      v.n++;
      for (const d of diasDePlaza(p.days)) v.dias[d]++;
      ventanas.set(f.id, v);
    }
    let lista = [...ventanas.values()];

    // 24 h: las dos plazas se guardan con LA MISMA ventana (la diurna), así que
    // la mitad de noche hay que reponerla — leídas tal cual dan «Diurna ×2» y el
    // puesto parece cerrado de noche.
    if (
      st.scheduleType === "24h" &&
      lista.length === 1 &&
      lista[0].f.ini !== lista[0].f.fin
    ) {
      const d = lista[0].f;

      lista = [
        { f: d, n: 1, dias: TODOS },
        { f: franjaDe(d.fin, d.ini), n: 1, dias: TODOS },
      ];
    }
    // Los que SE TURNAN no son gente a la vez. Un 24×24 (1 trabaja, 1 libra),
    // un 12×36 o un 2-2 TESELAN: los días de trabajo dividen exacto el ciclo y
    // cada asiento lo cubren k = largo ÷ trabajo plazas que se alternan. El
    // puesto pide n ÷ k, no n.
    const rotSt = rotPorId.get(String(st.rotationStyleId || ""));
    const trabajo = rotSt
      ? diasDeCiclo(rotSt.dayShifts) + diasDeCiclo(rotSt.nightShifts)
      : 0;
    const largo = trabajo + (rotSt ? diasDeCiclo(rotSt.restDays) : 0);
    const k = trabajo > 0 && largo % trabajo === 0 ? largo / trabajo : 1;

    if (k > 1)
      lista = lista.map((v) =>
        v.n % k === 0
          ? { ...v, n: v.n / k, dias: v.dias.map((x) => Math.ceil(x / k)) }
          : v,
      );
    // Turno de día entero sin ciclo que lo explique (los 24×24 de antes, con
    // dos plazas y sin patrón): las plazas son las personas que se alternan.
    if (k === 1)
      lista = lista.map((v) =>
        v.f.ini === v.f.fin ? { ...v, n: 1, dias: unoDonde(v.dias) } : v,
      );
    if (!lista.length) {
      const d = franjaDe(420, 1140);

      lista =
        st.scheduleType === "24h"
          ? [
              { f: d, n: 1, dias: TODOS },
              { f: franjaDe(1140, 420), n: 1, dias: TODOS },
            ]
          : st.scheduleType === "12h-night"
            ? [{ f: franjaDe(1140, 420), n: 1, dias: TODOS }]
            : [{ f: d, n: 1, dias: TODOS }];
    }
    const sede = st.postSiteId ? sedePorId.get(String(st.postSiteId)) : null;
    const pu: Puesto = {
      id: idLimpio(st.id),
      nombre: st.stationName || "Puesto",
      detalle: st.nickname || undefined,
      franjas: lista.map((v) => v.f.id),
      pide: {},
      // De quién es el puesto, para el acordeón Cliente → Sede → Estación.
      sedeId: st.postSiteId ? String(st.postSiteId) : undefined,
      sede: sede?.nombre || undefined,
      clienteId: sede?.clienteId ? String(sede.clienteId) : undefined,
      cliente: sede?.cliente || undefined,
    };

    for (const v of lista) {
      franjas[v.f.id] = v.f;
      // Lo que pide cada día: las plazas que operan ese día (todas, si ninguna
      // tiene días; si no, tope en `n` por si una plaza quedó mal contada).
      pu.pide[v.f.id] = v.dias.some((x) => x > 0)
        ? v.dias.map((x) => Math.min(x, v.n))
        : [v.n, v.n, v.n, v.n, v.n, v.n, v.n];
    }
    puestos.push(pu);
    puestoPorId.set(pu.id, pu);
  }

  // Lo que cada vigilante hizo de verdad: guardId → día → { estación, minuto de entrada }.
  const real = new Map<string, Map<number, { st: string; min: number }>>();
  /* Un turno en `absent`/`no_show` NO es un día trabajado: es una FALTA. Se
     aparta para marcarla como ausencia de ese día (el hueco queda abierto y
     la hoja ofrece reemplazo), en vez de leerla como si hubiera ido. */
  const faltas = new Map<string, Map<number, string>>();
  const ES_FALTA = new Set(["absent", "no_show", "no_call_no_show"]);

  for (const s of ov.shifts || []) {
    const dm = diaYMinuto(s.startTime, base, tz);

    if (!dm || dm.d < 0 || dm.d >= dias) continue;
    const g = String(s.guardId);
    const estado = String(s.status || "").toLowerCase();

    if (ES_FALTA.has(estado)) {
      if (!faltas.has(g)) faltas.set(g, new Map());
      faltas.get(g)!.set(dm.d, String(s.id ?? ""));
      continue;
    }
    if (estado === "cancelled" || estado === "canceled") continue;
    if (!real.has(g)) real.set(g, new Map());
    real.get(g)!.set(dm.d, { st: idLimpio(s.stationId), min: dm.min });
  }
  /** La franja del puesto cuya entrada queda más cerca de esa hora. */
  const franjaMasCercana = (pu: Puesto, min: number) => {
    let mejor = pu.franjas[0];
    let dist = Infinity;

    for (const id of pu.franjas) {
      const raw = Math.abs(franjas[id].ini - min);
      const dd = Math.min(raw, 1440 - raw);

      if (dd < dist) {
        dist = dd;
        mejor = id;
      }
    }

    return mejor;
  };

  // Hasta dónde llegan los turnos generados: comparar más allá contaría como
  // «franco» días que simplemente aún no existen.
  let horizonte = 0;

  for (const m of real.values())
    for (const d of m.keys()) horizonte = Math.max(horizonte, d + 1);
  horizonte = Math.min(dias, horizonte || dias);

  const personas: Persona[] = [];
  const enlace: Enlace = {
    personas: {},
    puestos: {},
    turnos: {},
    cargadas: {},
    novedades: {},
    eventos: {},
  };

  for (const st of ov.stations || [])
    enlace.puestos[idLimpio(st.id)] = {
      postSiteId: st.postSiteId ? String(st.postSiteId) : null,
      scheduleType: st.scheduleType ?? null,
    };
  let aciertos = 0;
  let comparados = 0;

  for (const a of ov.assignments || []) {
    if (a.deletedAt || (a.status && a.status !== "active")) continue;
    const st = (ov.stations || []).find(
      (s) => idLimpio(s.id) === idLimpio(a.stationId),
    );
    const pu = puestoPorId.get(idLimpio(a.stationId));

    if (!st || !pu) continue;
    const rot = rotPorId.get(
      String(a.rotationStyleId || st.rotationStyleId || ""),
    );
    const guardId = String(a.guardId);
    const nombre =
      a.guard?.fullName ||
      [a.guard?.firstName, a.guard?.lastName].filter(Boolean).join(" ") ||
      "Vigilante";
    const hechos =
      real.get(guardId) || new Map<number, { st: string; min: number }>();
    const relevo = !!a.isRelief;
    const d1 = pu.franjas[0];
    const d2 = pu.franjas[1] || pu.franjas[0];
    // Lo que hizo cada día, en el idioma del motor.
    const visto: string[] = [];

    for (let d = 0; d < horizonte; d++) {
      const h = hechos.get(d);

      visto.push(
        !h
          ? FRANCO
          : relevo
            ? LIBRE
            : h.st === pu.id
              ? franjaMasCercana(pu, h.min)
              : FRANCO,
      );
    }
    // Antes de su fecha de inicio no hay nada que comparar: la ventana empieza
    // diez días antes del lunes activo, y para quien entró después esos días
    // eran «francos» falsos que torcían la fase. Medido 2026-10-06: fijos de
    // 4-4-2 que entraron el 2 de octubre salían con la N en el día equivocado
    // y el borrador «se parecía al real en un 89 %».
    const desdeInicio =
      a.startDate && /^\d{4}-\d{2}-\d{2}/.test(String(a.startDate))
        ? Math.min(horizonte, Math.max(0, diasEntre(base, String(a.startDate))))
        : 0;
    // …y tampoco antes de su PRIMER turno real: el generador escribe desde
    // hoy, así que entre el lunes de la ventana y hoy no hay nada, y ese
    // «franco» falso impedía reconocer el patrón corto (un 4-4-2 del motor es
    // DDDD FF NNNN, que el ciclo declarado DDDD NNNN FF no reproduce girándolo).
    const desde = hechos.size
      ? Math.min(horizonte, Math.max(desdeInicio, Math.min(...hechos.keys())))
      : desdeInicio;
    const comparables = horizonte - desde;
    const fallos = (pat: string[], o: number) => {
      let n = 0;

      for (let d = desde; d < horizonte; d++)
        if (pat[(d + o) % pat.length] !== visto[d]) n++;

      return n;
    };
    let patron: string[] | null = null;
    let desfase = 0;
    let errores = comparables;

    // 1) La rotación que de verdad lleva: el tramo más corto que, repetido
    //    desde su primer día, reproduce sus turnos (se le perdonan dos días
    //    sueltos: un cambio, una falta). Manda sobre el ciclo declarado, porque
    //    es lo que pasa en el puesto.
    if (hechos.size)
      for (let n = 1; n <= 14 && !patron; n++) {
        const pat = visto.slice(desde, desde + n);
        const o = (n - (desde % n)) % n;
        const e = fallos(pat, o);

        if (pat.length === n && e <= 2 && pat.some((c) => c !== FRANCO)) {
          patron = pat;
          errores = e;
          desfase = o;
        }
      }
    // 2) Si no hay patrón claro, el ciclo declarado, arrancando donde más acierta.
    if (!patron) {
      if (
        rot &&
        diasDeCiclo(rot.dayShifts) + diasDeCiclo(rot.nightShifts) > 0
      ) {
        patron = [
          ...Array(diasDeCiclo(rot.dayShifts)).fill(relevo ? LIBRE : d1),
          ...Array(diasDeCiclo(rot.nightShifts)).fill(relevo ? LIBRE : d2),
          ...Array(diasDeCiclo(rot.restDays)).fill(FRANCO),
        ];
      } else {
        patron = Array.from({ length: 7 }, (_, d) => visto[d] ?? FRANCO);
        if (!patron.some((c) => c !== FRANCO))
          patron = [
            relevo ? LIBRE : d1,
            relevo ? LIBRE : d1,
            relevo ? LIBRE : d1,
            relevo ? LIBRE : d1,
            relevo ? LIBRE : d1,
            FRANCO,
            FRANCO,
          ];
      }
      for (let o = 0; o < patron.length; o++) {
        const e = fallos(patron, o);

        if (e < errores) {
          errores = e;
          desfase = o;
        }
      }
      // Un sacafranco casi no tiene turnos reales con los que leer su fase, así
      // que «donde más acierta» los dejaba a todos en la fase 0: tres
      // sacafrancos de un condominio librando los mismos dos días y nadie
      // cubriendo esos huecos. Su fase es su FECHA DE INICIO, como en el motor.
      if (
        relevo &&
        a.startDate &&
        /^\d{4}-\d{2}-\d{2}/.test(String(a.startDate))
      ) {
        const L = patron.length;
        const ini = ((diasEntre(base, String(a.startDate)) % L) + L) % L;

        desfase = (L - ini) % L;
      }
      // 3) ¿Y si el ciclo declarado no es lo que hace? (Pasa: ciclos con
      //    variantes que esta lectura no interpreta, o un vigilante al que se
      //    le cambió el turno a mano.) Entonces, lo que MÁS hace cada día de la
      //    semana — y se queda lo que más se parezca a sus turnos reales.
      if (hechos.size && errores > comparables * 0.15) {
        const semanal = Array.from({ length: 7 }, (_, w) => {
          const cuenta: Record<string, number> = {};

          for (let d = w; d < horizonte; d += 7)
            if (d >= desde) cuenta[visto[d]] = (cuenta[visto[d]] || 0) + 1;

          return (
            Object.keys(cuenta).sort(
              (x, y) => cuenta[y] - cuenta[x] || x.localeCompare(y),
            )[0] ?? FRANCO
          );
        });
        const e = fallos(semanal, 0);

        if (e < errores && semanal.some((c) => c !== FRANCO)) {
          patron = semanal;
          desfase = 0;
          errores = e;
        }
      }
    }
    if (!relevo && hechos.size && comparables > 0) {
      aciertos += comparables - errores;
      comparados += comparables;
    }

    const pid = idLimpio(a.id);

    enlace.personas[pid] = {
      guardId,
      stationId: pu.id,
      assignmentId: String(a.id ?? ""),
      relevo,
      rotationStyleId: a.rotationStyleId ? String(a.rotationStyleId) : null,
      conPlaza: !!a.positionId && a.kind !== "adhoc",
    };
    enlace.turnos[pid] = {};
    for (const s of ov.shifts || []) {
      if (String(s.guardId) !== guardId || !s.id) continue;
      const dm = diaYMinuto(s.startTime, base, tz);

      if (dm)
        enlace.turnos[pid][dm.d] = {
          id: String(s.id),
          stationId: idLimpio(s.stationId),
        };
    }
    const persona: Persona = {
      id: pid,
      nombre,
      puesto: relevo ? null : pu.id,
      patron,
      desfase,
      manual: {},
      ausencias: [],
    };

    if (relevo) {
      const cubiertos: string[] = (
        Array.isArray(a.coveredStationIds) ? a.coveredStationIds : []
      )
        .map(idLimpio)
        .filter((id: string) => puestoPorId.has(id));

      // Sin lista propia cubre las estaciones de su misma sede, que es como
      // encadena el generador a un sacafranco.
      persona.fijos = cubiertos.length
        ? cubiertos
        : (ov.stations || [])
            .filter((s) => s.postSiteId && s.postSiteId === st.postSiteId)
            .map((s) => idLimpio(s.id));
    }
    for (const o of ov.overrides || []) {
      if (String(o.guardId) !== guardId) continue;
      const d = diasEntre(base, o.date);

      if (!Number.isFinite(d)) continue;
      (enlace.novedades[pid] = enlace.novedades[pid] || {})[d] = {
        id: String(o.id ?? ""),
        type: String(o.type ?? ""),
      };
      // Sólo las ausencias: un «F» o un «D/N» suelto son cambios de un día, no una ausencia.
      if (TIPOS[String(o.type)])
        persona.ausencias!.push({
          desde: d,
          hasta: d,
          tipo: TIPOS[String(o.type)],
        });
    }
    // Las faltas del horario real (turno `absent`): ausencia de un día.
    for (const [d, shiftId] of faltas.get(guardId) || []) {
      if (persona.ausencias!.some((x) => d >= x.desde && d <= x.hasta))
        continue;
      persona.ausencias!.push({ desde: d, hasta: d, tipo: "falta" });
      (enlace.novedades[pid] = enlace.novedades[pid] || {})[d] = {
        id: shiftId,
        type: "FALTA",
      };
    }
    personas.push(persona);
  }

  /* ── LA BOLSA DE DISPONIBLES ───────────────────────────────────────────
     Quien está activo y sin asignación también puede cubrir: TrackTik lo
     llama «available staff». Entra como persona sin puesto, siempre libre,
     y NUNCA se coloca sola (el acomodo automático sólo usa sacafrancos). */
  const asignados = new Set(
    Object.values(enlace.personas).map((e) => e.guardId),
  );

  for (const g of ov.guards || []) {
    const guardId = String(g.id ?? g.guardId ?? "");

    if (!guardId || asignados.has(guardId)) continue;
    const pid = `bolsa-${idLimpio(guardId)}`;
    const nombre =
      g.fullName ||
      [g.firstName, g.lastName].filter(Boolean).join(" ") ||
      "Vigilante";

    enlace.personas[pid] = {
      guardId,
      stationId: "",
      assignmentId: "",
      relevo: true,
      rotationStyleId: null,
      conPlaza: false,
    };
    const persona: Persona = {
      id: pid,
      nombre,
      puesto: null,
      patron: [LIBRE],
      desfase: 0,
      manual: {},
      fijos: [],
      ausencias: [],
      sinPuesto: true,
    };

    for (const [d] of faltas.get(guardId) || [])
      persona.ausencias!.push({ desde: d, hasta: d, tipo: "falta" });
    personas.push(persona);
  }

  // Novedades de cobertura abiertas: cubrir ese hueco cierra la novedad.
  for (const ev of ov.coverageEvents || []) {
    const st = ev.originStationId ? idLimpio(ev.originStationId) : "";
    const d = ev.date ? diasEntre(base, String(ev.date).slice(0, 10)) : NaN;

    if (st && Number.isFinite(d) && ev.id)
      enlace.eventos[`${st}|${d}`] = String(ev.id);
  }

  const plan: Plan = {
    franjas,
    puestos,
    personas,
    cubre: {},
    auto: {},
    no: {},
    reglas: { ...REGLAS_POR_DEFECTO },
  };

  sanear(plan);
  // Lo que los sacafrancos YA cubren de verdad entra como cobertura puesta a
  // mano (no automática): así el borrador abre igual que el horario y
  // «Publicar» sabe qué turnos existen ya y cuáles son nuevos.
  for (const p of plan.personas) {
    if (p.puesto !== null) continue;
    for (const [ds, t] of Object.entries(enlace.turnos[p.id] || {})) {
      const d = Number(ds);
      const pu = puestoPorId.get(t.stationId);

      if (!pu || d < 0 || d >= dias) continue;
      const h = real.get(enlace.personas[p.id].guardId)?.get(d);
      const fr = h ? franjaMasCercana(pu, h.min) : pu.franjas[0];

      if (fr && falta(plan, pu, fr, d) > 0) {
        poner(plan, clave(pu.id, fr, d), p.id, false);
        enlace.cargadas[`${p.id}|${d}`] = t.id;
      }
    }
  }

  return {
    plan,
    enlace,
    coincidencia: comparados
      ? Math.min(1, Math.max(0, aciertos / comparados))
      : 1,
    comparados,
  };
}
