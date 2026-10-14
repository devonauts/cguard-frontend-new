/**
 * ════════════════════════════════════════════════════════════════════════════
 * EVENTOS = SEDES DE TIPO «EVENTO»
 *
 * Un evento no es un módulo aparte: es una sede (`businessInfo`) con
 * `serviceType = 'event'` y dos columnas más, `vigenteDesde` / `vigenteHasta`
 * (instantes ISO). Todo lo demás —puestos, plazas, asignaciones, turnos,
 * fichaje— es lo de siempre. Lo que cambia es QUÉ se pregunta:
 *
 *   - en el asistente de la sede, las fechas del evento y su briefing;
 *   - en el puesto, sin rotación (no hay ciclo que repetir);
 *   - al asignar, sin fechas ni ciclo: las pone el servidor con la vigencia.
 *
 * Aquí vive la aritmética, sin React, para que la usen igual el asistente, la
 * ficha y los diálogos de asignación.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { esEvento } from "@/lib/serviceTypes";
import {
  diaDeLaEmpresa,
  fechaYHora,
  horaDeLaEmpresa,
  instanteEnLaEmpresa,
  sumaDias,
} from "@/lib/horaDeLaEmpresa";

export { esEvento };

/** Lo más largo que puede durar un evento (lo mismo que exige el servidor). */
export const EVENTO_MAX_DIAS = 31;

/** Las claves del briefing, PLANAS en `serviceConfig`. Todas texto y opcionales. */
export const CLAVES_BRIEFING = [
  "encuentro",
  "uniforme",
  "responsable",
  "telefonoResponsable",
  "instrucciones",
] as const;
export type ClaveBriefing = (typeof CLAVES_BRIEFING)[number];

export interface SedeConVigencia {
  serviceType?: string | null;
  vigenteDesde?: string | null;
  vigenteHasta?: string | null;
}

const aFecha = (v?: string | Date | null): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);

  return Number.isNaN(d.getTime()) ? null : d;
};

/** La vigencia de la sede como instantes (o null si falta). */
export function vigenciaDe(sede?: SedeConVigencia | null): {
  desde: Date | null;
  hasta: Date | null;
} {
  return {
    desde: aFecha(sede?.vigenteDesde),
    hasta: aFecha(sede?.vigenteHasta),
  };
}

export type ErrorVigencia =
  | "faltaInicio"
  | "faltaFin"
  | "finAntesDeInicio"
  | "demasiadoLargo"
  | null;

/** Las mismas reglas que el servidor: las dos fechas, fin > inicio, ≤ 31 días. */
export function validarVigencia(
  desde?: string | Date | null,
  hasta?: string | Date | null,
): ErrorVigencia {
  const a = aFecha(desde);
  const b = aFecha(hasta);

  if (!a) return "faltaInicio";
  if (!b) return "faltaFin";
  if (b.getTime() <= a.getTime()) return "finAntesDeInicio";
  if (b.getTime() - a.getTime() > EVENTO_MAX_DIAS * 24 * 3600 * 1000)
    return "demasiadoLargo";

  return null;
}

/** ¿El evento ya terminó? (Sólo para sedes-evento con fecha de fin.) */
export function eventoTerminado(
  sede?: SedeConVigencia | null,
  ahora: Date = new Date(),
): boolean {
  if (!esEvento(sede)) return false;
  const { hasta } = vigenciaDe(sede);

  return !!hasta && hasta.getTime() < ahora.getTime();
}

/**
 * ¿Guardar estas fechas MUEVE el evento al pasado? Sí si antes no había
 * terminado (o no tenía fin) y con el fin nuevo ya terminó. Corregir la hora
 * de un evento que ya había acabado no lo es. Mismo criterio que el servidor
 * (`pasaAlPasado` en `eventosDeSede`): un evento así queda sólo como historial.
 */
export function pasaAlPasado(
  antesHasta?: string | Date | null,
  nuevoHasta?: string | Date | null,
  ahora: Date = new Date(),
): boolean {
  const nuevo = aFecha(nuevoHasta);

  if (!nuevo || nuevo.getTime() > ahora.getTime()) return false;
  const antes = aFecha(antesHasta);

  return !antes || antes.getTime() > ahora.getTime();
}

/**
 * ¿Guardar estas fechas DEVUELVE AL FUTURO un evento que ya había terminado?
 * («me equivoqué de fecha»). El servidor reabre lo que cerró el paso a
 * historial y reactiva a quien se archivó por él (`devolverAlFuturo` en
 * `eventosDeSede`); el asistente lo avisa antes de guardar y lo cuenta después.
 */
export function vuelveAlFuturo(
  antesHasta?: string | Date | null,
  nuevoHasta?: string | Date | null,
  ahora: Date = new Date(),
): boolean {
  const antes = aFecha(antesHasta);
  const nuevo = aFecha(nuevoHasta);

  return (
    !!antes &&
    !!nuevo &&
    antes.getTime() <= ahora.getTime() &&
    nuevo.getTime() > ahora.getTime()
  );
}

/**
 * Claves de `serviceConfig` que escribe SÓLO el servidor: el rastro del paso a
 * historial y del archivado, y la tarifa del evento (se fija desde su nómina).
 * El servidor guarda `serviceConfig` ENTERO con lo que manda el asistente, así
 * que una copia vieja de estas claves —la que se cargó al abrirlo— borraría lo
 * que el servidor apuntó después (p. ej. pasar a historial y, en la misma
 * sesión, devolverlo al futuro: sin `cerradasAlPasarAHistorial` no se reabría
 * nada).
 */
export const CLAVES_DEL_SERVIDOR = [
  "archivadoAlTerminarEn",
  "archivadosAlTerminar",
  "cerradasAlPasarAHistorial",
  "devueltoAlFuturoEn",
  "tarifaHora",
] as const;

const comoObjeto = (v: unknown): Record<string, unknown> | null => {
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }

  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
};

/**
 * El `serviceConfig` que se guarda: lo último que tiene el servidor, con lo
 * del formulario encima — nunca SÓLO lo del formulario, para no perder claves
 * que el asistente no conoce—. Las claves del servidor (`CLAVES_DEL_SERVIDOR`)
 * mandan siempre desde su copia: si el servidor ya no la tiene, tampoco viaja.
 * Sin copia del servidor (sede nueva), lo del formulario tal cual.
 */
export function configParaGuardar(
  delServidor: unknown,
  delFormulario: Record<string, unknown>,
): Record<string, unknown> {
  const base = comoObjeto(delServidor);

  if (!base) return { ...delFormulario };
  const out: Record<string, unknown> = { ...base, ...delFormulario };

  for (const k of CLAVES_DEL_SERVIDOR) {
    if (k in base) out[k] = base[k];
    else delete out[k];
  }

  return out;
}

/** Lo que devuelve el servidor cuando un evento pasado vuelve al futuro. */
export interface VueltaAlFuturo {
  reabiertas?: number;
  reactivados?: Array<{ userId?: string; nombre?: string }>;
  sinRecuperar?: number;
}

type Traductor = (clave: string, opciones: Record<string, unknown>) => string;

/**
 * Los avisos tras devolver un evento al futuro: qué se recuperó (info) y, si
 * algo no se pudo, qué hay que reasignar (aviso). Recibe `t` para poder
 * probarse sin i18n.
 */
export function avisosDeVueltaAlFuturo(
  v: VueltaAlFuturo | null | undefined,
  t: Traductor,
): { info: string; aviso: string | null } | null {
  if (!v) return null;
  const reabiertas = Math.max(0, Number(v.reabiertas) || 0);
  const reactivados = (v.reactivados || []).filter(Boolean);
  const sinRecuperar = Math.max(0, Number(v.sinRecuperar) || 0);
  const lista = reactivados.map((r) => r.nombre || "—").join(", ");

  const info = !reabiertas
    ? t("ui.PostSiteWizard.evento.vueltaActivo", {
        defaultValue: "El evento vuelve a estar activo.",
      })
    : reactivados.length
      ? t("ui.PostSiteWizard.evento.vueltaReabiertasYVolvieron", {
          defaultValue:
            "El evento vuelve a estar activo: {{reabiertas}} y {{volvieron}} ({{lista}}).",
          // Dos cantidades en una frase: cada pieza lleva su plural (y su
          // verbo, que también concuerda).
          reabiertas: t("ui.eventos.seReabrieron", {
            defaultValue: "se reabrieron {{count}} asignaciones",
            count: reabiertas,
          }),
          volvieron: t("ui.eventos.volvieronVigilantes", {
            defaultValue: "volvieron {{count}} vigilantes",
            count: reactivados.length,
          }),
          lista,
        })
      : t("ui.PostSiteWizard.evento.vueltaReabiertas", {
          defaultValue:
            "El evento vuelve a estar activo: se reabrieron {{count}} asignaciones.",
          count: reabiertas,
        });
  const aviso = sinRecuperar
    ? t("ui.PostSiteWizard.evento.vueltaSinRecuperar", {
        defaultValue:
          "{{count}} asignaciones no se pudieron recuperar: vuelve a asignarlas.",
        count: sinRecuperar,
      })
    : null;

  return { info, aviso };
}

/**
 * Zonas con EXACTAMENTE el mismo punto (se crearon sin mover el pin): en el
 * mapa una tapaba a la otra y sólo se podía pulsar la de arriba. Las que
 * coinciden se reparten en un círculo pequeño (≈ 9 m) alrededor del punto,
 * siempre igual para el mismo orden: las dos se ven y se pueden pulsar. Las
 * que no coinciden no se tocan.
 */
export function separarCoincidentes<T extends { lat: number; lng: number }>(
  xs: T[],
  radio = 0.00008,
): T[] {
  const grupos = new Map<string, number[]>();

  xs.forEach((x, i) => {
    const k = `${x.lat.toFixed(6)},${x.lng.toFixed(6)}`;

    grupos.set(k, [...(grupos.get(k) || []), i]);
  });
  const out = xs.slice();

  for (const idx of grupos.values()) {
    if (idx.length < 2) continue;
    idx.forEach((i, k) => {
      const a = (2 * Math.PI * k) / idx.length - Math.PI / 2;
      const x = xs[i];
      // Un grado de longitud se encoge con la latitud: se compensa.
      const cos = Math.max(0.2, Math.cos((x.lat * Math.PI) / 180));

      out[i] = {
        ...x,
        lat: x.lat + radio * Math.sin(-a),
        lng: x.lng + (radio * Math.cos(a)) / cos,
      };
    });
  }

  return out;
}

/** Una zona del historial de un evento terminado (`GET …/historial-del-evento`). */
export interface ZonaDelHistorial {
  estacionId: string;
  nombre: string;
  plazas: number;
  personas: Array<{
    userId: string;
    nombre: string;
    archivado: boolean;
    turnos: Array<{
      programadoInicio: string | null;
      programadoFin: string | null;
      entrada: string | null;
      salida: string | null;
      horas: number;
      estado: "cumplido" | "sinSalida" | "noFicho" | "pendiente" | "sinResolver";
    }>;
    horas: number;
  }>;
  turnos: number;
  cumplidos: number;
  sinSalida: number;
  noFicho: number;
  horas: number;
}

/**
 * El tono de una zona en el mapa de un evento TERMINADO: ya no se mide contra
 * el cupo (las asignaciones se cerraron y todo saldría «0 de N» en rojo). Sin
 * gente, apagada; con gente sin fichar o sin salida, aviso; si no, neutro —el
 * mapa entero va en gris: es referencia, no alarma—.
 */
export function tonoDeZonaPasada(
  z?: Pick<ZonaDelHistorial, "personas" | "noFicho" | "sinSalida"> | null,
): "neutral" | "warn" {
  if (!z || !z.personas.length) return "neutral";

  return z.noFicho > 0 || z.sinSalida > 0 ? "warn" : "neutral";
}

/** ¿El evento está en marcha ahora mismo? */
export function eventoEnCurso(
  sede?: SedeConVigencia | null,
  ahora: Date = new Date(),
): boolean {
  if (!esEvento(sede)) return false;
  const { desde, hasta } = vigenciaDe(sede);

  return (
    !!desde &&
    !!hasta &&
    desde.getTime() <= ahora.getTime() &&
    ahora.getTime() <= hasta.getTime()
  );
}

const FMT_DIA_HORA: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: undefined,
  hour: "2-digit",
  minute: "2-digit",
  // 24 h, como los relevos y las plazas: «06:00 p. m.» al lado de
  // «15:00–19:00» obligaba a convertir de cabeza.
  hourCycle: "h23",
};

/** Sin las comas que mete el formateador («sáb, 15 nov, 14:00»). */
const limpio = (s: string) => s.replace(/,/g, "").replace(/\s+/g, " ").trim();

/**
 * «sáb 15 nov 14:00 → dom 16 nov 03:00», en la hora de la EMPRESA. Si empieza y
 * acaba el mismo día, el fin sólo lleva la hora: «sáb 15 nov 14:00 → 23:00».
 */
export function rangoDelEvento(
  desde?: string | Date | null,
  hasta?: string | Date | null,
): string {
  const a = aFecha(desde);
  const b = aFecha(hasta);

  if (!a || !b) return "";
  const ini = limpio(fechaYHora(a, FMT_DIA_HORA));
  const mismoDia = diaDeLaEmpresa(a) === diaDeLaEmpresa(b);
  const fin = mismoDia
    ? limpio(
        fechaYHora(b, {
          day: undefined,
          month: undefined,
          year: undefined,
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }),
      )
    : limpio(fechaYHora(b, FMT_DIA_HORA));

  return `${ini} → ${fin}`;
}

/**
 * La ventana que trabaja una plaza el PRIMER día del evento, recortada a la
 * vigencia. Sin plaza (o sin horas), la vigencia entera. Sirve para preguntar
 * quién está libre (`/coverage/candidates`).
 */
export function ventanaDeLaPlaza(
  sede: SedeConVigencia | null | undefined,
  plaza?: { startTime?: string | null; endTime?: string | null } | null,
): { start: Date; end: Date } | null {
  const { desde, hasta } = vigenciaDe(sede);

  if (!desde || !hasta) return null;
  const hm = (v?: string | null) => {
    const m = String(v || "").match(/^(\d{1,2}):(\d{2})/);

    return m ? [Number(m[1]), Number(m[2])] : null;
  };
  const ini = hm(plaza?.startTime);
  const fin = hm(plaza?.endTime);

  if (!ini || !fin) return { start: desde, end: hasta };

  let dia = diaDeLaEmpresa(desde);
  let start = instanteEnLaEmpresa(dia, ini[0], ini[1]);
  let end = instanteEnLaEmpresa(dia, fin[0], fin[1]);

  if (end.getTime() <= start.getTime())
    end = instanteEnLaEmpresa(sumaDias(dia, 1), fin[0], fin[1]);
  // El bloque de ese día acabó antes de que empezara el evento: el primero
  // que de verdad trabaja es el del día siguiente.
  if (end.getTime() <= desde.getTime()) {
    dia = sumaDias(dia, 1);
    start = instanteEnLaEmpresa(dia, ini[0], ini[1]);
    end = instanteEnLaEmpresa(dia, fin[0], fin[1]);
    if (end.getTime() <= start.getTime())
      end = instanteEnLaEmpresa(sumaDias(dia, 1), fin[0], fin[1]);
  }
  const s = new Date(Math.max(start.getTime(), desde.getTime()));
  const e = new Date(Math.min(end.getTime(), hasta.getTime()));

  return e.getTime() > s.getTime()
    ? { start: s, end: e }
    : { start: desde, end: hasta };
}

/** Un RELEVO de una estación de evento: una ventana y sus plazas. */
export interface RelevoDeEvento {
  inicio: string;
  fin: string;
  plazas: number;
  positionIds: string[];
}

/**
 * Las plazas de una estación de evento agrupadas en RELEVOS (misma hora de
 * entrada y de salida), en orden de reloj. Un evento «todo el horario» tiene un
 * relevo; uno partido en turnos de 4 h, dos o más. Es la única lectura que
 * necesitan las pantallas del evento: nada de rotación ni de «12h diurno».
 */
export function relevosDeLaEstacion(
  positions?: Array<{
    id?: string;
    startTime?: string | null;
    endTime?: string | null;
    sortOrder?: number | null;
    type?: string | null;
  }> | null,
): RelevoDeEvento[] {
  const out: RelevoDeEvento[] = [];
  const hm = (v?: string | null) => String(v || "").slice(0, 5);
  const orden = [...(positions || [])]
    .filter((p) => hm(p.startTime) && hm(p.endTime))
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));

  for (const p of orden) {
    const inicio = hm(p.startTime);
    const fin = hm(p.endTime);
    let r = out.find((x) => x.inicio === inicio && x.fin === fin);

    if (!r) {
      r = { inicio, fin, plazas: 0, positionIds: [] };
      out.push(r);
    }
    r.plazas += 1;
    if (p.id) r.positionIds.push(String(p.id));
  }

  return enOrdenDeReloj(out);
}

/* Los relevos en el orden en que se suceden. Las plazas no siempre vienen en
   ese orden (las que crea el asistente pueden llegar del segundo relevo
   primero) y ordenar por la hora suelta pondría «02:00» antes de «22:00» en un
   evento que cruza la medianoche: se encadenan (el que empieza cuando otro
   termina va detrás) y lo que no encadena, por hora. */
function enOrdenDeReloj(rs: RelevoDeEvento[]): RelevoDeEvento[] {
  if (rs.length < 2) return rs;
  const porHora = [...rs].sort((a, b) => a.inicio.localeCompare(b.inicio));
  /* En un CICLO (24 h: 18→06→18) todos tienen predecesor: manda el orden en
     que se crearon las plazas (`rs` viene por sortOrder), que empieza por el
     relevo con el que arranca el puesto. Por hora suelta saldría 06:00 primero
     en un evento que abre a las 18:00. */
  const primero =
    porHora.find((r) => !rs.some((x) => x !== r && x.fin === r.inicio)) ||
    rs[0];
  const out: RelevoDeEvento[] = [primero];

  while (out.length < rs.length) {
    const ultimo = out[out.length - 1];
    const sig =
      rs.find((x) => !out.includes(x) && x.inicio === ultimo.fin) ||
      porHora.find((x) => !out.includes(x))!;

    out.push(sig);
  }

  return out;
}

/** La ventana entera de la estación del evento: del primer relevo al último. */
export function ventanaDeRelevos(
  relevos: RelevoDeEvento[],
  station?: {
    startingTimeInDay?: string | null;
    finishTimeInDay?: string | null;
  } | null,
): string {
  if (relevos.length)
    return `${relevos[0].inicio}–${relevos[relevos.length - 1].fin}`;
  const a = String(station?.startingTimeInDay || "").slice(0, 5);
  const b = String(station?.finishTimeInDay || "").slice(0, 5);

  return a && b ? `${a}–${b}` : "";
}

/**
 * TODAS las ventanas que trabaja una plaza durante el evento —una por día—,
 * recortadas a la vigencia. `ventanaDeLaPlaza` sólo da la primera; para saber
 * si alguien está libre en un evento de dos días hay que mirar los dos (el que
 * está libre el viernes puede tener turno el sábado).
 */
export function ventanasDeLaPlaza(
  sede: SedeConVigencia | null | undefined,
  plaza?: { startTime?: string | null; endTime?: string | null } | null,
): Array<{ start: Date; end: Date }> {
  const { desde, hasta } = vigenciaDe(sede);

  if (!desde || !hasta) return [];
  const hm = (v?: string | null) => {
    const m = String(v || "").match(/^(\d{1,2}):(\d{2})/);

    return m ? [Number(m[1]), Number(m[2])] : null;
  };
  const ini = hm(plaza?.startTime);
  const fin = hm(plaza?.endTime);

  if (!ini || !fin) return [{ start: desde, end: hasta }];
  const out: Array<{ start: Date; end: Date }> = [];
  const ultimo = diaDeLaEmpresa(hasta);

  for (
    let dia = sumaDias(diaDeLaEmpresa(desde), -1), i = 0;
    dia <= ultimo && i < EVENTO_MAX_DIAS + 3;
    dia = sumaDias(dia, 1), i++
  ) {
    const start = instanteEnLaEmpresa(dia, ini[0], ini[1]);
    let end = instanteEnLaEmpresa(dia, fin[0], fin[1]);

    if (end.getTime() <= start.getTime())
      end = instanteEnLaEmpresa(sumaDias(dia, 1), fin[0], fin[1]);
    const s = new Date(Math.max(start.getTime(), desde.getTime()));
    const e = new Date(Math.min(end.getTime(), hasta.getTime()));

    if (e.getTime() > s.getTime()) out.push({ start: s, end: e });
  }

  return out;
}

/** Un relevo que no cabe entero en el evento, para avisarlo en el formulario. */
export interface AvisoDeRelevo {
  /** «15:00–19:00». */
  relevo: string;
  /**
   * `empiezaAntes`: arranca antes de que abra el evento; `terminaDespues`:
   * acaba después de que cierre; `fuera`: no toca el evento en ningún día.
   */
  tipo: "empiezaAntes" | "terminaDespues" | "fuera";
  /** La hora de apertura (o de cierre) del evento, «HH:mm». */
  hora: string;
  /** El evento dura más de un día: el recorte sólo afecta al primero (o al último). */
  variosDias: boolean;
}

/**
 * RELEVOS QUE SE SALEN DEL EVENTO (aviso, no error).
 *
 * El servidor recorta cada turno al evento (nadie trabaja fuera de él), así
 * que un relevo 13:00–17:00 en un concierto que abre a las 15:00 se queda en
 * dos horas — y quien lo configuró cree que son cuatro. Aquí se dice antes de
 * guardar: qué relevo, y desde (o hasta) qué hora se trabaja de verdad. Un
 * relevo que no toca el evento ningún día no tendría turnos: también se dice.
 *
 * Mismo criterio que el servidor (`bloqueDelEvento`): el bloque de cada día
 * que se cruza con el evento, en la hora de la EMPRESA.
 */
export function avisosDeRelevos(
  sede: SedeConVigencia | null | undefined,
  relevos: Array<{ start: string; end: string }>,
  zona?: string,
): AvisoDeRelevo[] {
  const { desde, hasta } = vigenciaDe(sede);

  if (!desde || !hasta || hasta.getTime() <= desde.getTime()) return [];
  const hm = (v?: string | null) => {
    const m = String(v || "").match(/^(\d{1,2}):(\d{2})/);

    return m ? [Number(m[1]), Number(m[2])] : null;
  };
  // `zona` sin decir = la de la empresa (el valor por defecto de cada función).
  const hora = (d: Date) => horaDeLaEmpresa(d, zona);
  const dia = (d: Date) => diaDeLaEmpresa(d, zona);
  const instante = (d: string, h: number, m: number) =>
    instanteEnLaEmpresa(d, h, m, 0, 0, zona);
  const variosDias = dia(desde) !== dia(hasta);
  const out: AvisoDeRelevo[] = [];
  const vistos = new Set<string>();

  for (const r of relevos) {
    const ini = hm(r.start);
    const fin = hm(r.end);

    if (!ini || !fin) continue;
    const relevo = `${r.start.slice(0, 5)}–${r.end.slice(0, 5)}`;

    if (vistos.has(relevo)) continue;
    vistos.add(relevo);
    let toca = false;
    let antes = false;
    let despues = false;

    for (
      let d = sumaDias(dia(desde), -1), i = 0;
      d <= dia(hasta) && i < EVENTO_MAX_DIAS + 3;
      d = sumaDias(d, 1), i++
    ) {
      const s = instante(d, ini[0], ini[1]);
      let e = instante(d, fin[0], fin[1]);

      // Misma hora de entrada y salida = 24 h; si no, cruza la medianoche.
      if (e.getTime() <= s.getTime()) e = instante(sumaDias(d, 1), fin[0], fin[1]);
      if (e.getTime() <= desde.getTime() || s.getTime() >= hasta.getTime())
        continue;
      toca = true;
      if (s.getTime() < desde.getTime()) antes = true;
      if (e.getTime() > hasta.getTime()) despues = true;
    }
    if (!toca) out.push({ relevo, tipo: "fuera", hora: "", variosDias });
    if (antes)
      out.push({ relevo, tipo: "empiezaAntes", hora: hora(desde), variosDias });
    if (despues)
      out.push({
        relevo,
        tipo: "terminaDespues",
        hora: hora(hasta),
        variosDias,
      });
  }

  return out;
}
