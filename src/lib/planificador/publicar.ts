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
import {
  FRANCO,
  duracion,
  propio,
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
  tipo: "turno" | "quitarTurno" | "novedad" | "quitarNovedad" | "rotacion" | "puestosFijos" | "cobertura";
  /** Lo que se le dice a quien publica, en sus palabras. */
  texto: string;
  /** Para probarlo sin red: qué llamada(s) hará. */
  llamadas: Array<{ metodo: "post" | "put" | "delete"; ruta: string; cuerpo?: any }>;
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

const CODIGO_NOVEDAD: Record<string, string> = { vacaciones: "V", permiso: "PM", incapacidad: "PM" };

/** [a×x, b×y, F×z] con a el primer trabajo: lo único que el motor real sabe generar. */
export function formaDeCiclo(patron: string[]): { a: string; b: string | null; x: number; y: number; z: number; giro: number } | null {
  const n = patron.length;

  if (!n || patron.every((c) => c === FRANCO)) return null;
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

    if (p.slice(i).every((c) => c === FRANCO) && (b === null || b !== a)) return { a, b, x, y, z, giro };
  }

  return null;
}

const franjaBase = (plan: Plan, pu: Puesto, codigo: string) => plan.franjas[codigo] || plan.franjas[pu.franjas[0]];
const nombreDe = (p: Persona) => p.nombre.trim();

/**
 * Qué cambió entre lo leído y el borrador, y cómo se publica cada cosa.
 * Sólo mira de hoy en adelante: el pasado no se reescribe desde aquí.
 */
export function planificarPublicacion(original: Plan, plan: Plan, enlace: Enlace, ctx: Contexto): Publicacion {
  const cambios: Cambio[] = [];
  const no: string[] = [];
  const t = `/tenant/${ctx.tenantId}`;
  const d0 = ctx.hoy;
  const d1 = ctx.hoy + (ctx.dias ?? 28);
  const ori = new Map(original.personas.map((p) => [p.id, p]));
  const puestoOri = new Map(original.puestos.map((p) => [p.id, p]));
  const llamada = (tipo: Cambio["tipo"], texto: string, llamadas: Cambio["llamadas"]): Cambio => ({
    tipo,
    texto,
    llamadas,
    async ejecutar(api) {
      for (const l of llamadas) {
        if (l.metodo === "post") await api.post(l.ruta, l.cuerpo);
        else if (l.metodo === "put") await api.put(l.ruta, l.cuerpo);
        else await api.del(l.ruta);
      }
    },
  });

  // 1) Puestos: la cobertura.
  for (const pu of plan.puestos) {
    const antes = puestoOri.get(pu.id);

    if (!antes) {
      no.push(`${pu.nombre}: es un puesto nuevo del borrador. Los puestos se crean en Estaciones.`);
      continue;
    }
    if (antes.franjas.join() === pu.franjas.join() && JSON.stringify(antes.pide) === JSON.stringify(pu.pide)) continue;
    const todoUno = pu.franjas.every((f) => pu.pide[f].every((n) => n === 1));
    const forma = pu.franjas.join();
    const tipo = todoUno ? (forma === "D" ? "12h-day" : forma === "N" ? "12h-night" : forma === "D,N" ? "24h" : null) : null;

    if (!tipo) {
      no.push(`${pu.nombre}: el horario real sólo sabe de puestos de 24 horas, sólo de día o sólo de noche, con una persona por turno. Esta cobertura se queda en el borrador.`);
      continue;
    }
    cambios.push(
      llamada("cobertura", `${pu.nombre} pasa a ${tipo === "24h" ? "24 horas" : tipo === "12h-day" ? "sólo de día" : "sólo de noche"}`, [
        { metodo: "post", ruta: `${t}/station/${pu.id}/auto-positions`, cuerpo: { data: { scheduleType: tipo, startTime: tipo === "12h-night" ? "19:00" : "07:00", endTime: tipo === "12h-night" ? "07:00" : "19:00" } } },
      ]),
    );
  }

  // 2) Personas: rotación, puestos fijos, ausencias, días sueltos.
  for (const p of plan.personas) {
    const antes = ori.get(p.id);
    const en = enlace.personas[p.id];

    if (!antes || !en) {
      no.push(`${nombreDe(p)}: es una persona nueva del borrador. Las personas se dan de alta en Equipo de seguridad y se asignan desde Horario.`);
      continue;
    }
    const pu = plan.puestos.find((x) => x.id === p.puesto);

    // 2a) Rotación.
    if (antes.patron.join() !== p.patron.join() || antes.desfase !== p.desfase) {
      if (esSacafranco(p)) no.push(`${nombreDe(p)}: la disponibilidad del sacafranco no se guarda en el horario real; sus coberturas sí.`);
      else if (!pu) no.push(`${nombreDe(p)}: su puesto ya no existe en el borrador.`);
      else {
        const f = formaDeCiclo(p.patron);
        const franjas = pu.franjas;
        const esDia = (c: string) => franjas.indexOf(c) === 0;

        if (!f) no.push(`${nombreDe(p)}: su rotación no es «tantos de día, tantos de noche, tantos de franco», y el horario real sólo genera ésas. Se queda en el borrador.`);
        else {
          // El motor real cuenta «día» como la primera franja del puesto y «noche» como la segunda.
          const dia = esDia(f.a) ? f.x : f.b && esDia(f.b) ? f.y : 0;
          const noche = esDia(f.a) ? f.y : f.x;
          // Si empieza por noches, se gira para que el día 0 del ciclo sea el primer día de día.
          const giro = esDia(f.a) || !f.b ? f.giro : (f.giro + f.x) % p.patron.length;
          const n = p.patron.length;
          let inicio = d0;

          while ((((inicio + p.desfase + giro) % n) + n) % n !== 0) inicio++;
          const nombre = `${dia}-${noche ? `${noche}-` : ""}${f.z}`;

          cambios.push(
            llamada("rotacion", `${nombreDe(p)}: rotación ${nombre} desde el ${ctx.fechaDe(inicio)}`, [
              { metodo: "post", ruta: `${t}/rotation-style`, cuerpo: { data: { name: nombre, dayShifts: dia, nightShifts: noche, restDays: f.z, reuseIfExists: true } } },
              { metodo: "put", ruta: `${t}/guard-assignment/${en.assignmentId}`, cuerpo: { data: { rotationStyleId: "$ROTACION", startDate: ctx.fechaDe(inicio) } } },
            ]),
          );
        }
      }
    }

    // 2b) Puestos fijos del sacafranco.
    if (esSacafranco(p) && (antes.fijos || []).slice().sort().join() !== (p.fijos || []).slice().sort().join())
      cambios.push(
        llamada("puestosFijos", `${nombreDe(p)}: cubre ${p.fijos?.length || 0} puestos fijos`, [
          { metodo: "put", ruta: `${t}/guard-assignment/${en.assignmentId}`, cuerpo: { data: { coveredStationIds: p.fijos || [] } } },
        ]),
      );

    // 2c) Ausencias y días sueltos, día a día.
    for (let d = Math.max(d0, ctx.hoy - 7); d < d1; d++) {
      const aAhora = (p.ausencias || []).find((a) => d >= a.desde && d <= a.hasta);
      const aAntes = (antes.ausencias || []).find((a) => d >= a.desde && d <= a.hasta);
      const novedad = enlace.novedades[p.id]?.[d];

      if (aAhora && !aAntes) {
        cambios.push(
          llamada("novedad", `${nombreDe(p)}: ${aAhora.tipo} el ${ctx.fechaDe(d)}`, [
            { metodo: "post", ruta: `${t}/schedule-overrides`, cuerpo: { data: { guardId: en.guardId, assignmentId: en.assignmentId, date: ctx.fechaDe(d), type: CODIGO_NOVEDAD[aAhora.tipo] || "PM", note: aAhora.tipo } } },
          ]),
        );
        continue;
      }
      if (!aAhora && aAntes) {
        if (novedad?.id) cambios.push(llamada("quitarNovedad", `${nombreDe(p)}: ya no está de ${aAntes.tipo} el ${ctx.fechaDe(d)}`, [{ metodo: "delete", ruta: `${t}/schedule-overrides/${novedad.id}` }]));
        continue;
      }
      if (esSacafranco(p) || !pu || aAhora) continue;
      // Sólo los días tocados a mano: lo que cambia por la rotación ya viaja
      // con la rotación (o se quedó en el borrador, si no se pudo).
      if ((p.manual[d] ?? null) === (antes.manual[d] ?? null)) continue;
      const ahora = propio(p, d);
      const previo = propio(antes, d);

      if (ahora === previo) continue;
      if (previo === FRANCO && antes.manual[d] === FRANCO && novedad?.type === "F") {
        // Se deshace un franco suelto: la novedad se borra y el generador repone el turno.
        cambios.push(llamada("quitarNovedad", `${nombreDe(p)}: vuelve a trabajar el ${ctx.fechaDe(d)}`, [{ metodo: "delete", ruta: `${t}/schedule-overrides/${novedad.id}` }]));
        continue;
      }
      if (ahora === FRANCO) {
        cambios.push(
          llamada("novedad", `${nombreDe(p)}: franco el ${ctx.fechaDe(d)}`, [
            { metodo: "post", ruta: `${t}/schedule-overrides`, cuerpo: { data: { guardId: en.guardId, assignmentId: en.assignmentId, date: ctx.fechaDe(d), type: "F" } } },
          ]),
        );
      } else if (previo === FRANCO) {
        const fr = franjaBase(plan, pu, ahora);

        if (!fr) continue;
        cambios.push(
          llamada("turno", `${nombreDe(p)}: trabaja el ${ctx.fechaDe(d)} (${fr.nombre})`, [
            { metodo: "post", ruta: `${t}/shift`, cuerpo: { data: { startTime: ctx.instanteDe(d, fr.ini), endTime: ctx.instanteDe(d, fr.ini + duracion(fr)), station: pu.id, guard: en.guardId, postSiteId: enlace.puestos[pu.id]?.postSiteId || undefined } } },
          ]),
        );
      } else no.push(`${nombreDe(p)}: el ${ctx.fechaDe(d)} cambia de un turno a otro; eso se hace desde Horario moviendo el turno.`);
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
        if (p) no.push(`${nombreDe(p)} cubriendo ${pu.nombre} el ${ctx.fechaDe(d)}: es una persona nueva del borrador; hay que darla de alta antes.`);
        continue;
      }
      const real = enlace.turnos[id]?.[d];

      if (real && real.stationId === pu.id) continue; // ya existe
      cambios.push(
        llamada("turno", `${nombreDe(p)} cubre ${pu.nombre} el ${ctx.fechaDe(d)} (${fr.nombre})`, [
          ...(real ? [{ metodo: "delete" as const, ruta: `${t}/shift/${real.id}` }] : []),
          { metodo: "post", ruta: `${t}/shift`, cuerpo: { data: { startTime: ctx.instanteDe(d, fr.ini), endTime: ctx.instanteDe(d, fr.ini + duracion(fr)), station: pu.id, guard: en.guardId, postSiteId: enlace.puestos[pu.id]?.postSiteId || undefined } } },
        ]),
      );
    }
  }
  for (const [pd, shiftId] of Object.entries(enlace.cargadas)) {
    const [id, ds] = pd.split("|");
    const d = Number(ds);

    if (d < d0 || d >= d1 || cubiertos.has(pd)) continue;
    const p = plan.personas.find((x) => x.id === id);

    if (!p) continue;
    cambios.push(llamada("quitarTurno", `${nombreDe(p)}: ya no cubre el ${ctx.fechaDe(d)}`, [{ metodo: "delete", ruta: `${t}/shift/${shiftId}` }]));
  }

  // Orden: primero lo estructural (cobertura, rotación, puestos fijos), luego
  // novedades, luego retirar turnos y por último crear turnos — un turno nuevo
  // sobre una plaza que se está reconfigurando se perdería.
  const peso: Record<Cambio["tipo"], number> = { cobertura: 0, rotacion: 1, puestosFijos: 2, quitarNovedad: 3, novedad: 4, quitarTurno: 5, turno: 6 };

  cambios.sort((a, b) => peso[a.tipo] - peso[b.tipo]);

  return { cambios, noPublicables: no };
}

/**
 * Ejecuta los cambios en orden. Un ciclo recién creado se enlaza a la
 * asignación que lo necesita (`$ROTACION`). Devuelve lo que falló, con el
 * texto del cambio, para que la pantalla lo diga; lo demás ya quedó escrito.
 */
export async function publicar(pub: Publicacion, api: Api, avisar?: (hecho: number, total: number) => void): Promise<string[]> {
  const fallos: string[] = [];
  let hecho = 0;

  for (const c of pub.cambios) {
    try {
      let rotacionId: string | null = null;

      for (const l of c.llamadas) {
        const cuerpo = l.cuerpo && rotacionId ? JSON.parse(JSON.stringify(l.cuerpo).replace(/"\$ROTACION"/g, JSON.stringify(rotacionId))) : l.cuerpo;

        if (l.metodo === "post") {
          const r = await api.post(l.ruta, cuerpo);

          if (l.ruta.endsWith("/rotation-style")) rotacionId = String(r?.id || r?.data?.id || r?.rotationStyle?.id || "");
        } else if (l.metodo === "put") await api.put(l.ruta, cuerpo);
        else await api.del(l.ruta);
      }
    } catch (e: any) {
      fallos.push(`${c.texto}: ${e?.data?.message || e?.message || "no se pudo"}`);
    }
    avisar?.(++hecho, pub.cambios.length);
  }

  return fallos;
}
