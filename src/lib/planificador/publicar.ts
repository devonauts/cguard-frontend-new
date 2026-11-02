/**
 * PUBLICAR: del borrador al horario real.
 *
 * Compara el borrador con lo que se leyó del servidor y lo convierte en las
 * MISMAS llamadas que ya hace la pantalla Horario: un turno suelto para una
 * cobertura, una novedad (V / PM / F) para una ausencia o un día cambiado, un
 * ciclo + fecha de inicio para una rotación, la cobertura de la estación para
 * un puesto que cambia de tipo. No hay un endpoint nuevo: todo lo que se
 * publica desde aquí se vería igual si se hubiera hecho desde Horario.
 *
 * Lo que el motor real no sabe representar (una rotación que no es «tantos de
 * día, tantos de noche, tantos de franco», una cobertura con dos de día, un
 * sacafranco que aún no está contratado) NO se publica: se dice, con su motivo,
 * y se queda en el borrador. Antes que escribir algo parecido, es mejor avisar.
 *
 * Es cálculo puro hasta `ejecutar`: la lista de cambios se puede enseñar, probar
 * y rechazar sin tocar el servidor.
 */
import { nombreDeSecuencia, secuenciaLimpia } from "@/lib/secuenciaDeRotacion";
import {
  FRANCO,
  clave,
  duracion,
  propio,
  proximoArranque,
  esSacafranco,
  type Persona,
  type Plan,
  type Puesto,
} from "./motor";
import type { Enlace } from "./real";

export interface Api {
  post(ruta: string, cuerpo: any): Promise<any>;
  put(ruta: string, cuerpo: any): Promise<any>;
  del(ruta: string): Promise<any>;
}

export interface Cambio {
  tipo:
    | "turno"
    | "quitarTurno"
    | "novedad"
    | "quitarNovedad"
    | "rotacion"
    | "puestosFijos"
    | "cobertura";
  /** Lo que se le dice a quien publica, en sus palabras. */
  texto: string;
  /** De quién es el cambio (persona o puesto), para agrupar la lista. */
  quien?: string;
  /** Para probarlo sin red: qué llamada(s) hará. */
  llamadas: Array<{
    metodo: "post" | "put" | "delete";
    ruta: string;
    cuerpo?: any;
  }>;
  ejecutar(api: Api): Promise<void>;
}

export interface Publicacion {
  cambios: Cambio[];
  /** Cosas del borrador que no se pueden llevar al horario real, con el motivo. */
  noPublicables: string[];
}

export interface Contexto {
  tenantId: string;
  /** El lunes que es el día 0. */
  base: string;
  /** El día de hoy, como índice. */
  hoy: number;
  /** Cuántos días hacia adelante se publican (desde hoy). */
  dias?: number;
  /** `YYYY-MM-DD` de un día, y el instante ISO de una hora de ese día en la zona de la empresa. */
  fechaDe(d: number): string;
  instanteDe(d: number, minuto: number): string;
}

/** `YYYY-MM-DD` + n days, calendar arithmetic (no zone involved). */
function masDias(dia: string, n: number): string {
  const [y, m, d] = dia.split("-").map(Number);

  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * The publishing context for a company: dates by calendar, and every hour as
 * the WALL CLOCK of the company's zone (`instante`). A 19:00–07:00 shift on
 * the night the US falls back (1 Nov 2026) ends at 07:00 local, 13 hours
 * later; in Ecuador (no DST) it is always 12.
 */
export function contextoEnLaEmpresa(
  tenantId: string,
  base: string,
  hoy: number,
  dias: number,
  instante: (dia: string, hora: number, minuto: number) => Date,
): Contexto {
  return {
    tenantId,
    base,
    hoy,
    dias,
    fechaDe: (d) => masDias(base, d),
    instanteDe: (d, min) =>
      instante(
        masDias(base, d + Math.floor(min / 1440)),
        Math.floor((min % 1440) / 60),
        min % 60,
      ).toISOString(),
  };
}

const CODIGO_NOVEDAD: Record<string, string> = {
  vacaciones: "V",
  permiso: "PM",
  incapacidad: "PM",
};

/**
 * Lo que el motor real sabe generar: [a×x, b×y, F×z] (tantos de día, tantos de
 * noche, tantos de franco), o el que ALTERNA: [a×x, F×z, b×x, F×z] — el mismo
 * bloque de día y de noche, con su franco en medio, como el 7-1 peruano.
 */
export function formaDeCiclo(patron: string[]): {
  a: string;
  b: string | null;
  x: number;
  y: number;
  z: number;
  giro: number;
  alterna?: boolean;
} | null {
  const n = patron.length;

  if (!n || patron.every((c) => c === FRANCO)) return null;
  // ¿Alterna? Dos mitades iguales salvo el código de trabajo.
  if (n % 2 === 0) {
    for (let giro = 0; giro < n; giro++) {
      const p = patron.map((_, i) => patron[(i + giro) % n]);
      const m = n / 2;
      const a = p[0];
      const b = p[m];

      if (a === FRANCO || b === FRANCO || a === b) continue;
      let x = 0;

      while (x < m && p[x] === a) x++;
      const z = m - x;

      if (z < 1) continue;
      const vale =
        p.slice(x, m).every((c) => c === FRANCO) &&
        p.slice(m, m + x).every((c) => c === b) &&
        p.slice(m + x).every((c) => c === FRANCO);

      if (vale) return { a, b, x, y: 0, z, giro, alterna: true };
    }
  }
  for (let giro = 0; giro < n; giro++) {
    const p = patron.map((_, i) => patron[(i + giro) % n]);

    if (p[0] === FRANCO) continue;
    let i = 0;
    const a = p[0];

    while (i < n && p[i] === a) i++;
    const x = i;
    let b: string | null = null;
    let y = 0;

    if (i < n && p[i] !== FRANCO) {
      b = p[i];
      while (i < n && p[i] === b) i++;
      y = i - x;
    }
    const z = n - i;

    if (p.slice(i).every((c) => c === FRANCO) && (b === null || b !== a))
      return { a, b, x, y, z, giro };
  }

  return null;
}

const franjaBase = (plan: Plan, pu: Puesto, codigo: string) =>
  plan.franjas[codigo] || plan.franjas[pu.franjas[0]];
const nombreDe = (p: Persona) => p.nombre.trim();

/**
 * Qué cambió entre lo leído y el borrador, y cómo se publica cada cosa.
 * Sólo mira de hoy en adelante: el pasado no se reescribe desde aquí.
 */
export function planificarPublicacion(
  original: Plan,
  plan: Plan,
  enlace: Enlace,
  ctx: Contexto,
): Publicacion {
  const cambios: Cambio[] = [];
  const no: string[] = [];
  const t = `/tenant/${ctx.tenantId}`;
  const d0 = ctx.hoy;
  const d1 = ctx.hoy + (ctx.dias ?? 28);
  const ori = new Map(original.personas.map((p) => [p.id, p]));
  const puestoOri = new Map(original.puestos.map((p) => [p.id, p]));
  const llamada = (
    tipo: Cambio["tipo"],
    texto: string,
    llamadas: Cambio["llamadas"],
    quien?: string,
  ): Cambio => ({
    tipo,
    texto,
    quien,
    llamadas,
    async ejecutar(api) {
      for (const l of llamadas) {
        if (l.metodo === "post") await api.post(l.ruta, l.cuerpo);
        else if (l.metodo === "put") await api.put(l.ruta, l.cuerpo);
        else await api.del(l.ruta);
      }
    },
  });
  /* Coberturas que ya viajan DENTRO de otra llamada (la ausencia con su
     reemplazo): `puesto|franja|día|persona`, para no crearlas dos veces. */
  const encadenadas = new Set<string>();
  /** Quién cubre en el borrador el turno propio de `p` el día `d`, si hay alguien publicable. */
  const reemplazoDe = (
    p: Persona,
    pu: Puesto,
    d: number,
  ): { persona: Persona; guardId: string; franja: string } | null => {
    const antes = ori.get(p.id);
    const franja = antes ? propio(antes, d) : null;

    if (!franja || !pu.franjas.includes(franja)) return null;
    for (const id of plan.cubre[clave(pu.id, franja, d)] || []) {
      const q = plan.personas.find((x) => x.id === id);
      const en = enlace.personas[id];

      if (!q || !en || id === p.id) continue;
      const yaReal = (enlace.turnosTodos?.[id]?.[d] || []).some(
        (x) => x.stationId === pu.id,
      );

      if (yaReal) continue;

      return { persona: q, guardId: en.guardId, franja };
    }

    return null;
  };

  // 1) Puestos: la cobertura.
  for (const pu of plan.puestos) {
    const antes = puestoOri.get(pu.id);

    if (!antes) {
      no.push(
        `${pu.nombre}: es un puesto nuevo del borrador. Los puestos se crean en Estaciones.`,
      );
      continue;
    }
    if (
      antes.franjas.join() === pu.franjas.join() &&
      JSON.stringify(antes.pide) === JSON.stringify(pu.pide)
    )
      continue;
    const todoUno = pu.franjas.every((f) => pu.pide[f].every((n) => n === 1));
    const forma = pu.franjas.join();
    const tipo = todoUno
      ? forma === "D"
        ? "12h-day"
        : forma === "N"
          ? "12h-night"
          : forma === "D,N"
            ? "24h"
            : null
      : null;

    if (!tipo) {
      no.push(
        `${pu.nombre}: el horario real sólo sabe de puestos de 24 horas, sólo de día o sólo de noche, con una persona por turno. Esta cobertura se queda en el borrador.`,
      );
      continue;
    }
    cambios.push(
      llamada(
        "cobertura",
        `${pu.nombre} pasa a ${tipo === "24h" ? "24 horas" : tipo === "12h-day" ? "sólo de día" : "sólo de noche"}`,
        [
          {
            metodo: "post",
            ruta: `${t}/station/${pu.id}/auto-positions`,
            cuerpo: {
              data: {
                scheduleType: tipo,
                startTime: tipo === "12h-night" ? "19:00" : "07:00",
                endTime: tipo === "12h-night" ? "07:00" : "19:00",
                // The draft already decided how many guards: one per shift.
                keepHeadcount: false,
              },
            },
          },
        ],
        pu.nombre,
      ),
    );
  }

  // 2) Personas: rotación, puestos fijos, ausencias, días sueltos.
  for (const p of plan.personas) {
    const antes = ori.get(p.id);
    const en = enlace.personas[p.id];

    if (!antes || !en) {
      no.push(
        `${nombreDe(p)}: es una persona nueva del borrador. Las personas se dan de alta en Equipo de seguridad y se asignan desde Horario.`,
      );
      continue;
    }
    const pu = plan.puestos.find((x) => x.id === p.puesto);

    // 2a) Rotación.
    if (
      antes.patron.join() !== p.patron.join() ||
      antes.desfase !== p.desfase ||
      !!antes.francoDobleDomingo !== !!p.francoDobleDomingo
    ) {
      if (esSacafranco(p))
        no.push(
          `${nombreDe(p)}: la disponibilidad del sacafranco no se guarda en el horario real; sus coberturas sí.`,
        );
      else if (!pu)
        no.push(`${nombreDe(p)}: su puesto ya no existe en el borrador.`);
      // A weekly style is anchored to the calendar: there is no cycle to run
      // and the server refuses it. Its days change in the post, not here.
      else if (en.semanal || p.semanal)
        no.push(
          `${nombreDe(p)}: trabaja por días de la semana; su horario no se corre. Cambia sus días en la configuración de la estación.`,
        );
      // Sin plaza el generador real no rota: le escribiría un ciclo que nunca
      // usa y lo dejaría con un turno suelto (pasó en local). Mejor decirlo.
      else if (en.conPlaza === false)
        no.push(
          `${nombreDe(p)}: está en la estación sin puesto (horario fijo de ${pu.nombre}). Para darle una rotación hay que asignarlo a un puesto desde Horario.`,
        );
      else {
        const f = formaDeCiclo(p.patron);
        const franjas = pu.franjas;
        const esDia = (c: string) => franjas.indexOf(c) === 0;

        /* Lo que no es «tantos de día, tantos de noche, tantos de franco» se
           publica como SECUENCIA LIBRE: una letra por día (D primera franja,
           N segunda, L franco). El día 0 de la secuencia es el primer día del
           patrón del borrador. */
        const secuencia = f
          ? null
          : secuenciaLimpia(
              p.patron
                .map((c) =>
                  c === FRANCO
                    ? "L"
                    : c === franjas[0]
                      ? "D"
                      : c === franjas[1]
                        ? "N"
                        : "?",
                )
                .join(""),
            );

        if (!f && secuencia && !p.patron.some((c) => c !== FRANCO && c !== franjas[0] && c !== franjas[1])) {
          const inicio = proximoArranque(p, d0);
          const nombre = `${nombreDeSecuencia(secuencia)}${p.francoDobleDomingo ? " · dom" : ""}`;

          cambios.push(
            llamada(
              "rotacion",
              `${nombreDe(p)}: secuencia ${nombre} desde el ${ctx.fechaDe(inicio)}`,
              [
                {
                  metodo: "post",
                  ruta: `${t}/rotation-style`,
                  cuerpo: {
                    data: {
                      name: nombre,
                      sequence: secuencia,
                      sundayDoubleRest: !!p.francoDobleDomingo,
                      reuseIfExists: true,
                    },
                  },
                },
                {
                  metodo: "put",
                  ruta: `${t}/guard-assignment/${en.assignmentId}`,
                  cuerpo: {
                    data: {
                      rotationStyleId: "$ROTACION",
                      startDate: ctx.fechaDe(inicio),
                    },
                  },
                },
              ],
              nombreDe(p),
            ),
          );
        } else if (!f)
          no.push(
            `${nombreDe(p)}: su rotación mezcla más de dos tramos, y el horario real sólo genera hasta dos. Se queda en el borrador.`,
          );
        else {
          // El motor real cuenta «día» como la primera franja del puesto y «noche» como la segunda.
          // En el que alterna, los dos bloques son el mismo número: van como «día» y la alternancia los invierte.
          const dia = f.alterna
            ? f.x
            : esDia(f.a)
              ? f.x
              : f.b && esDia(f.b)
                ? f.y
                : 0;
          const noche = f.alterna ? 0 : esDia(f.a) ? f.y : f.x;
          // El día 0 del ciclo es el primer día del bloque de DÍA: si el patrón
          // empieza por noches se gira media vuelta (o el bloque de noche).
          const n = p.patron.length;
          const giro = f.alterna
            ? esDia(f.a)
              ? f.giro
              : (f.giro + n / 2) % n
            : esDia(f.a) || !f.b
              ? f.giro
              : (f.giro + f.x) % n;
          const girada = {
            ...p,
            patron: p.patron.map((_, i) => p.patron[(i + giro) % n]),
            desfase: p.desfase - giro,
            manual: {},
          };
          const inicio = proximoArranque(girada, d0);
          const nombre = `${dia}-${noche ? `${noche}-` : ""}${f.z}${f.alterna ? " · D/N" : ""}${p.francoDobleDomingo ? " · dom" : ""}`;

          cambios.push(
            llamada(
              "rotacion",
              `${nombreDe(p)}: rotación ${nombre} desde el ${ctx.fechaDe(inicio)}`,
              [
                {
                  metodo: "post",
                  ruta: `${t}/rotation-style`,
                  cuerpo: {
                    data: {
                      name: nombre,
                      dayShifts: dia,
                      nightShifts: noche,
                      restDays: f.z,
                      alternatesDayNight: !!f.alterna,
                      sundayDoubleRest: !!p.francoDobleDomingo,
                      reuseIfExists: true,
                    },
                  },
                },
                {
                  metodo: "put",
                  ruta: `${t}/guard-assignment/${en.assignmentId}`,
                  cuerpo: {
                    data: {
                      rotationStyleId: "$ROTACION",
                      startDate: ctx.fechaDe(inicio),
                    },
                  },
                },
              ],
              nombreDe(p),
            ),
          );
        }
      }
    }

    // 2b) Puestos fijos del sacafranco.
    if (
      esSacafranco(p) &&
      (antes.fijos || []).slice().sort().join() !==
        (p.fijos || []).slice().sort().join()
    )
      cambios.push(
        llamada(
          "puestosFijos",
          `${nombreDe(p)}: cubre ${p.fijos?.length || 0} puestos fijos`,
          [
            {
              metodo: "put",
              ruta: `${t}/guard-assignment/${en.assignmentId}`,
              cuerpo: { data: { coveredStationIds: p.fijos || [] } },
            },
          ],
          nombreDe(p),
        ),
      );

    // 2c) Ausencias y días sueltos, día a día.
    for (let d = Math.max(d0, ctx.hoy - 7); d < d1; d++) {
      const aAhora = (p.ausencias || []).find(
        (a) => d >= a.desde && d <= a.hasta,
      );
      const aAntes = (antes.ausencias || []).find(
        (a) => d >= a.desde && d <= a.hasta,
      );
      const novedad = enlace.novedades[p.id]?.[d];

      if (aAhora && !aAntes) {
        if (aAhora.tipo === "falta") {
          /* Una FALTA no es una ausencia planificada: es la novedad de Cobertura
             en vivo (turno `absent`, evento de cobertura, récord del vigilante).
             Va por el mismo camino que allí, para que asistencia y nómina la
             vean igual. Sin turno real ese día no hay nada que marcar. */
          const turno = enlace.turnos[p.id]?.[d];

          if (turno && pu) {
            /* La falta y su reemplazo van en UNA llamada: el servidor abre la
               novedad y la cubre sin gritar «puesto sin cubrir» en medio. */
            const r = reemplazoDe(p, pu, d);

            if (r)
              encadenadas.add(`${pu.id}|${r.franja}|${d}|${r.persona.id}`);
            cambios.push(
              llamada(
                "novedad",
                `${nombreDe(p)}: falta (no se presentó) el ${ctx.fechaDe(d)}${r ? ` · cubre ${nombreDe(r.persona)}` : ""}`,
                [
                  {
                    metodo: "post",
                    ruta: `${t}/coverage/absence`,
                    cuerpo: {
                      guardId: en.guardId,
                      shiftId: turno.id,
                      stationId: pu.id,
                      reason: "no_call_no_show",
                      ...(r
                        ? { coveringGuardId: r.guardId, allowRestDay: true }
                        : {}),
                    },
                  },
                ],
                nombreDe(p),
              ),
            );
          } else
            no.push(
              `${nombreDe(p)}: el ${ctx.fechaDe(d)} no tiene turno real que marcar como falta.`,
            );
          continue;
        }
        // Con turno real ese día el servidor abre una novedad de cobertura; el
        // reemplazo del borrador viaja con ella. Sin turno real no hay novedad
        // que cubrir y la cobertura va aparte, como un turno más.
        const r = enlace.turnos[p.id]?.[d] && pu ? reemplazoDe(p, pu, d) : null;

        if (r && pu)
          encadenadas.add(`${pu.id}|${r.franja}|${d}|${r.persona.id}`);
        cambios.push(
          llamada(
            "novedad",
            `${nombreDe(p)}: ${aAhora.tipo} el ${ctx.fechaDe(d)}${r ? ` · cubre ${nombreDe(r.persona)}` : ""}`,
            [
              {
                metodo: "post",
                ruta: `${t}/schedule-overrides`,
                cuerpo: {
                  data: {
                    guardId: en.guardId,
                    assignmentId: en.assignmentId,
                    date: ctx.fechaDe(d),
                    type: CODIGO_NOVEDAD[aAhora.tipo] || "PM",
                    note: aAhora.tipo,
                    ...(r
                      ? { coveringGuardId: r.guardId, allowRestDay: true }
                      : {}),
                  },
                },
              },
            ],
            nombreDe(p),
          ),
        );
        continue;
      }
      if (!aAhora && aAntes) {
        if (aAntes.tipo === "falta") {
          const ev = pu ? enlace.eventos[`${pu.id}|${d}`] : undefined;

          if (ev)
            cambios.push(
              llamada(
                "quitarNovedad",
                `${nombreDe(p)}: se anula la falta del ${ctx.fechaDe(d)}`,
                [
                  {
                    metodo: "post",
                    ruta: `${t}/coverage/events/${ev}/cancel`,
                    cuerpo: {},
                  },
                ],
                nombreDe(p),
              ),
            );
          else
            no.push(
              `${nombreDe(p)}: la falta del ${ctx.fechaDe(d)} ya está cerrada; se anula desde Cobertura en vivo.`,
            );
          continue;
        }
        if (novedad?.id)
          cambios.push(
            llamada(
              "quitarNovedad",
              `${nombreDe(p)}: ya no está de ${aAntes.tipo} el ${ctx.fechaDe(d)}`,
              [
                {
                  metodo: "delete",
                  ruta: `${t}/schedule-overrides/${novedad.id}`,
                },
              ],
              nombreDe(p),
            ),
          );
        continue;
      }
      if (esSacafranco(p) || !pu || aAhora) continue;
      // Sólo los días tocados a mano: lo que cambia por la rotación ya viaja
      // con la rotación (o se quedó en el borrador, si no se pudo).
      if ((p.manual[d] ?? null) === (antes.manual[d] ?? null)) continue;
      const ahora = propio(p, d);
      const previo = propio(antes, d);

      if (ahora === previo) continue;
      if (
        previo === FRANCO &&
        antes.manual[d] === FRANCO &&
        novedad?.type === "L"
      ) {
        // Se deshace un franco suelto: la novedad se borra y el generador repone el turno.
        cambios.push(
          llamada(
            "quitarNovedad",
            `${nombreDe(p)}: vuelve a trabajar el ${ctx.fechaDe(d)}`,
            [
              {
                metodo: "delete",
                ruta: `${t}/schedule-overrides/${novedad.id}`,
              },
            ],
            nombreDe(p),
          ),
        );
        continue;
      }
      if (ahora === FRANCO) {
        /* En el Horario un franco suelto es «L» (libre). «F» es FALTA: iba así
           y cada franco publicado nacía como falta disciplinaria con novedad
           «no se presentó ni avisó». */
        cambios.push(
          llamada(
            "novedad",
            `${nombreDe(p)}: franco el ${ctx.fechaDe(d)}`,
            [
              {
                metodo: "post",
                ruta: `${t}/schedule-overrides`,
                cuerpo: {
                  data: {
                    guardId: en.guardId,
                    assignmentId: en.assignmentId,
                    date: ctx.fechaDe(d),
                    type: "L",
                  },
                },
              },
            ],
            nombreDe(p),
          ),
        );
      } else if (previo === FRANCO) {
        const fr = franjaBase(plan, pu, ahora);

        if (!fr) continue;
        cambios.push(
          llamada(
            "turno",
            `${nombreDe(p)}: trabaja el ${ctx.fechaDe(d)} (${fr.nombre})`,
            [
              {
                metodo: "post",
                ruta: `${t}/shift`,
                cuerpo: {
                  data: {
                    startTime: ctx.instanteDe(d, fr.ini),
                    endTime: ctx.instanteDe(d, fr.ini + duracion(fr)),
                    station: pu.id,
                    guard: en.guardId,
                    postSiteId: enlace.puestos[pu.id]?.postSiteId || undefined,
                  },
                },
              },
            ],
            nombreDe(p),
          ),
        );
      } else
        no.push(
          `${nombreDe(p)}: el ${ctx.fechaDe(d)} cambia de un turno a otro; eso se hace desde Horario moviendo el turno.`,
        );
    }
  }

  // 3) Coberturas: turnos nuevos y turnos que se retiran.
  const cubiertos = new Set<string>();

  for (const k of Object.keys(plan.cubre)) {
    const [puestoId, franja, ds] = k.split("|");
    const d = Number(ds);

    if (d < d0 || d >= d1) continue;
    const pu = plan.puestos.find((x) => x.id === puestoId);
    const fr = plan.franjas[franja];

    if (!pu || !fr) continue;
    for (const id of plan.cubre[k]) {
      const p = plan.personas.find((x) => x.id === id);
      const en = enlace.personas[id];

      cubiertos.add(`${id}|${d}`);
      if (!p || !en) {
        if (p)
          no.push(
            `${nombreDe(p)} cubriendo ${pu.nombre} el ${ctx.fechaDe(d)}: es una persona nueva del borrador; hay que darla de alta antes.`,
          );
        continue;
      }
      const real = enlace.turnos[id]?.[d];
      // Ya existe un turno real suyo en ese puesto ese día (aunque además tenga otro en otro puesto).
      const yaReal = (
        enlace.turnosTodos?.[id]?.[d] || (real ? [real] : [])
      ).some((x) => x.stationId === pu.id);

      if (yaReal || encadenadas.has(`${pu.id}|${franja}|${d}|${id}`)) continue;
      /* Si el hueco viene de una FALTA con novedad abierta, cubrirlo por la
         novedad (como en Cobertura en vivo): crea el turno de cobertura y
         cierra la novedad a la vez, en vez de dejar la alerta viva. Quien lo
         eligió ya vio que ese día está libre: `allowRestDay`. */
      const ev = enlace.eventos[`${pu.id}|${d}`];

      cambios.push(
        llamada(
          "turno",
          `${nombreDe(p)} cubre ${pu.nombre} el ${ctx.fechaDe(d)} (${fr.nombre})`,
          [
            ...(real
              ? [{ metodo: "delete" as const, ruta: `${t}/shift/${real.id}` }]
              : []),
            ev
              ? {
                  metodo: "post",
                  ruta: `${t}/coverage/events/${ev}/cover`,
                  cuerpo: { coveringGuardId: en.guardId, allowRestDay: true },
                }
              : {
                  metodo: "post",
                  ruta: `${t}/shift`,
                  cuerpo: {
                    data: {
                      startTime: ctx.instanteDe(d, fr.ini),
                      endTime: ctx.instanteDe(d, fr.ini + duracion(fr)),
                      station: pu.id,
                      guard: en.guardId,
                      postSiteId:
                        enlace.puestos[pu.id]?.postSiteId || undefined,
                    },
                  },
                },
          ],
          nombreDe(p),
        ),
      );
    }
  }
  /* A live cover shift is withdrawn only when the person editing took it out
     of the draft: it was in the plan as read and is not in the draft now. One
     that never made it into the plan as read is not a change of theirs, and
     deleting it left the night of an extension with nobody (QA 2026-11-01). */
  const cubiertosAntes = new Set<string>();

  for (const k of Object.keys(original.cubre)) {
    const ds = k.split("|")[2];

    for (const id of original.cubre[k]) cubiertosAntes.add(`${id}|${ds}`);
  }
  for (const [pd, shiftId] of Object.entries(enlace.cargadas)) {
    const [id, ds] = pd.split("|");
    const d = Number(ds);

    if (d < d0 || d >= d1 || cubiertos.has(pd) || !cubiertosAntes.has(pd))
      continue;
    const p = plan.personas.find((x) => x.id === id);

    if (!p) continue;
    cambios.push(
      llamada(
        "quitarTurno",
        `${nombreDe(p)}: ya no cubre el ${ctx.fechaDe(d)}`,
        [{ metodo: "delete", ruta: `${t}/shift/${shiftId}` }],
        nombreDe(p),
      ),
    );
  }

  // Orden: primero lo estructural (cobertura, rotación, puestos fijos), luego
  // novedades, luego retirar turnos y por último crear turnos — un turno nuevo
  // sobre una plaza que se está reconfigurando se perdería.
  const peso: Record<Cambio["tipo"], number> = {
    cobertura: 0,
    rotacion: 1,
    puestosFijos: 2,
    quitarNovedad: 3,
    novedad: 4,
    quitarTurno: 5,
    turno: 6,
  };

  cambios.sort((a, b) => peso[a.tipo] - peso[b.tipo]);

  return { cambios, noPublicables: no };
}

/**
 * Ejecuta los cambios en orden. Un ciclo recién creado se enlaza a la
 * asignación que lo necesita (`$ROTACION`). Devuelve lo que falló, con el
 * texto del cambio, para que la pantalla lo diga; lo demás ya quedó escrito.
 */
export async function publicar(
  pub: Publicacion,
  api: Api,
  avisar?: (hecho: number, total: number) => void,
): Promise<string[]> {
  const fallos: string[] = [];
  let hecho = 0;
  const uno = async (c: Cambio) => {
    try {
      let rotacionId: string | null = null;

      for (const l of c.llamadas) {
        const cuerpo =
          l.cuerpo && rotacionId
            ? JSON.parse(
                JSON.stringify(l.cuerpo).replace(
                  /"\$ROTACION"/g,
                  JSON.stringify(rotacionId),
                ),
              )
            : l.cuerpo;

        if (l.metodo === "post") {
          const r = await api.post(l.ruta, cuerpo);

          if (l.ruta.endsWith("/rotation-style"))
            rotacionId = String(
              r?.id || r?.data?.id || r?.rotationStyle?.id || "",
            );
        } else if (l.metodo === "put") await api.put(l.ruta, cuerpo);
        else await api.del(l.ruta);
      }
    } catch (e: any) {
      fallos.push(
        `${c.texto}: ${e?.data?.message || e?.message || "no se pudo"}`,
      );
    }
    avisar?.(++hecho, pub.cambios.length);
  };

  /* Los cambios van por tandas en el orden en que `planificarPublicacion` los
     dejó (lo estructural primero). Lo estructural, uno a uno: un ciclo nuevo
     se enlaza a la asignación que lo pidió. Las novedades y los turnos son
     independientes entre sí —cada uno es un día de alguien— y van de a
     varios a la vez: 87 cambios tardaban 40 s de uno en uno. */
  const A_LA_VEZ = 4;
  const paralelos = new Set<Cambio["tipo"]>([
    "novedad",
    "quitarNovedad",
    "quitarTurno",
    "turno",
  ]);
  let i = 0;

  while (i < pub.cambios.length) {
    const tipo = pub.cambios[i].tipo;
    let j = i;

    while (j < pub.cambios.length && pub.cambios[j].tipo === tipo) j++;
    const tanda = pub.cambios.slice(i, j);

    if (!paralelos.has(tipo)) for (const c of tanda) await uno(c);
    else {
      let k = 0;
      const obrero = async () => {
        while (k < tanda.length) await uno(tanda[k++]);
      };

      await Promise.all(
        Array.from({ length: Math.min(A_LA_VEZ, tanda.length) }, obrero),
      );
    }
    i = j;
  }

  return fallos;
}
