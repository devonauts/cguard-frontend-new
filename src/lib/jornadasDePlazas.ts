import { esSemanal, personasQueSeTurnanCon } from "@/lib/secuenciaDeRotacion";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LAS JORNADAS DE UN PUESTO, SACADAS DE SUS PLAZAS — ESPEJO DEL SERVIDOR
 *
 * Copia fiel de `bloquesDesdePlazas` (backend `services/postOperatingHours`).
 * Existe por la misma razón que `estadoDeRotacionCliente`: el CRM pinta el
 * horario de un puesto con las plazas ya en la mano y no va a pedir al servidor
 * que se lo vuelva a decir.
 *
 * Lo que NO puede haber es una cuarta versión. Esta aritmética llegó a estar
 * escrita en cuatro sitios —el servidor, la lista de estaciones, la vista de
 * Turnos de la ficha y el asistente de la sede— y cada copia que no se
 * actualizó fue una pantalla que mentía: la vista de Turnos perdía la fila de
 * la noche de los puestos de 24 h, y la lista enseñaba «Diurna ×2».
 *
 * Si se toca el servidor, se toca ESTO.
 * ════════════════════════════════════════════════════════════════════════════
 */

export interface PlazaDeHorario {
  type?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  guardsNeeded?: number | string | null;
  /** Días que opera la plaza; vacío/nulo = todos. */
  days?: string[] | null;
}

export interface JornadaDePuesto {
  tipo: string;
  startTime: string;
  endTime: string;
  guardsCount: number;
  days: string[];
}

const TODOS_LOS_DIAS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];

/** Minutos desde medianoche de un `HH:MM`, o null si no lo es. */
export function minutosDeHora(hhmm: unknown): number | null {
  if (typeof hhmm !== "string") return null;
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Minutos que cubre una ventana, cruzando la medianoche si hace falta. */
export function minutosDeVentana(inicio: string, fin: string): number {
  const a = minutosDeHora(inicio);
  const b = minutosDeHora(fin);
  if (a == null || b == null) return 0;
  const w = (b - a + 1440) % 1440;
  return w === 0 ? 1440 : w;
}

/**
 * Las jornadas del puesto. Devuelve `[]` cuando las plazas no dicen nada
 * legible — un puesto sin plazas, o con sólo sacafrancos.
 *
 * Un SACAFRANCO no declara jornada: tapa descansos ajenos. Por eso sólo cuentan
 * los fijos.
 */
/** La rotación del puesto, para saber cuántas de sus plazas están a la vez. */
export interface RotacionDelPuesto {
  dayShifts?: number | null;
  nightShifts?: number | null;
  restDays?: number | null;
  sequence?: string | null;
  weekly?: boolean | null;
}

/**
 * CUÁNTAS DE ESAS N PLAZAS ESTÁN A LA VEZ — espejo de `aLaVezSegunLaRotacion`
 * del servidor. Dos plazas con la misma ventana no son dos personas a la vez
 * en cuanto hay rotación: son dos FASES de un mismo asiento (un 1-1, o una
 * secuencia y su complemento). a la vez = plazas × díasDeTrabajo ÷ ciclo.
 * Sin rotación conocida se deja la suma tal cual, como siempre.
 */
export function aLaVezSegunLaRotacion(
  plazas: number,
  rot?: RotacionDelPuesto | null,
): number {
  if (!rot) return plazas;
  // Weekly: every seat works the same weekdays, so they are all on at once.
  if (esSemanal(rot)) return plazas;
  // Only a cycle that tiles shares a seat (1-1, 4x4…): the server writes one
  // plaza per person who takes turns on it. A 5-2 is one fijo per seat plus
  // the sacafranco, so its plazas ARE the people at once. Mirror of the
  // backend `postOperatingHours`.
  const k = personasQueSeTurnanCon(rot);

  return k > 1 ? Math.max(1, Math.round(plazas / k)) : plazas;
}

export function jornadasDePlazas(
  plazas: PlazaDeHorario[] | null | undefined,
  scheduleType?: string | null,
  rotacion?: RotacionDelPuesto | null,
): JornadaDePuesto[] {
  if (!Array.isArray(plazas) || !plazas.length) return [];

  const porVentana = new Map<string, JornadaDePuesto>();

  for (const p of plazas) {
    if ((p?.type || "fijo") === "sacafranco") continue;
    const ini = minutosDeHora(p?.startTime);
    if (ini == null || minutosDeHora(p?.endTime) == null) continue;

    const clave = `${p.startTime}|${p.endTime}`;
    const cuantos = Number(p?.guardsNeeded);
    const suma =
      Number.isFinite(cuantos) && cuantos > 0 ? Math.floor(cuantos) : 1;
    const suyos = Array.isArray(p?.days) && p.days.length ? p.days : [];
    const ya = porVentana.get(clave);

    if (ya) {
      // Dos plazas en la MISMA ventana son dos personas a la vez, no dos
      // jornadas distintas.
      ya.guardsCount += suma;
      // El puesto abre el día que lo abra CUALQUIERA de sus plazas; una sin
      // días declarados (= todos) se lleva por delante la restricción de su
      // compañera.
      ya.days =
        !suyos.length || ya.days.length === TODOS_LOS_DIAS.length
          ? TODOS_LOS_DIAS
          : [...new Set([...ya.days, ...suyos])];
      continue;
    }

    const hora = Math.floor(ini / 60);
    const largo = minutosDeVentana(String(p.startTime), String(p.endTime));

    porVentana.set(clave, {
      // La etiqueta sale de la HORA, no del nombre de la plaza («Fijo 1» no le
      // dice nada a nadie). Mismo umbral 18/6 que usa el resto del sistema.
      tipo:
        largo >= 23 * 60
          ? "24 horas"
          : hora >= 18 || hora < 6
            ? "Nocturno"
            : "Diurno",
      startTime: String(p.startTime),
      endTime: String(p.endTime),
      guardsCount: suma,
      days: suyos.length ? suyos : TODOS_LOS_DIAS,
    });
  }

  const jornadas = Array.from(porVentana.values());

  // Con rotación, las plazas que comparten ventana se reparten el ciclo.
  if (rotacion) {
    for (const j of jornadas)
      j.guardsCount = aLaVezSegunLaRotacion(j.guardsCount, rotacion);
  }

  /* ── UN PUESTO DE 24 H SIEMPRE TIENE DOS MITADES ────────────────────────
     Cuando el patrón ALTERNA día y noche, las dos plazas de un 24 h comparten
     ventana (07:00–19:00) y lo que lleva a uno a la noche es la ROTACIÓN. Sin
     esto, el puesto sale cubierto sólo de día y la noche ni figura, aunque los
     turnos estén generados y el vigilante vaya a ir.

     Un bloque de 24 h de verdad (una persona el día entero) NO se parte: ahí
     dos mitades serían una cobertura inventada. */
  if (scheduleType === "24h" && jornadas.length === 1) {
    const b = jornadas[0];
    if (minutosDeVentana(b.startTime, b.endTime) < 23 * 60) {
      /* LA DOTACIÓN SE REPARTE, NO SE DUPLICA. Las plazas que comparten
         ventana en un 24 h no son gente a la vez: son las dos mitades del
         puesto, y la rotación lleva a cada una a la suya. Copiar el total
         exigía el DOBLE de gente de la que el puesto tiene, y la ficha pintaba
         «1/2» —en rojo— todos los días. Impar: el día se queda con el de más. */
      const total = Number(b.guardsCount) || 1;
      const deDia = Math.max(1, Math.ceil(total / 2));
      const deNoche = Math.max(1, total - deDia);
      const esNocturnaLaPrimera = b.tipo === "Nocturno";

      b.guardsCount = esNocturnaLaPrimera ? deNoche : deDia;
      jornadas.push({
        tipo: esNocturnaLaPrimera ? "Diurno" : "Nocturno",
        startTime: b.endTime,
        endTime: b.startTime,
        guardsCount: esNocturnaLaPrimera ? deDia : deNoche,
        // La otra mitad opera los MISMOS días: es el mismo puesto partido por
        // la rotación, no otro horario.
        days: b.days,
      });
    }
  }

  return jornadas.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/** La ventana propia del puesto (`startingTimeInDay` / `finishTimeInDay`). */
export interface VentanaDePuesto {
  startingTimeInDay?: string | null;
  finishTimeInDay?: string | null;
}

/** `HH:MM` normalizado (acepta `9:00` y `09:00:00`), o null si no es una hora. */
function horaCorta(hhmm: unknown): string | null {
  if (typeof hhmm !== "string") return null;
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** La ventana del puesto si trae dos horas legibles y distintas; si no, null. */
export function ventanaDelPuesto(
  v?: VentanaDePuesto | null,
): { inicio: string; fin: string } | null {
  const inicio = horaCorta(v?.startingTimeInDay);
  const fin = horaCorta(v?.finishTimeInDay);
  if (!inicio || !fin || inicio === fin) return null;
  return { inicio, fin };
}

/** Etiqueta de una ventana por su HORA de inicio: mismo umbral 18/6 que el resto. */
function tipoDeVentana(inicio: string, fin: string): string {
  const largo = minutosDeVentana(inicio, fin);
  const hora = Math.floor((minutosDeHora(inicio) ?? 0) / 60);
  return largo >= 23 * 60
    ? "24 horas"
    : hora >= 18 || hora < 6
      ? "Nocturno"
      : "Diurno";
}

/**
 * Las jornadas que un puesto SIN plazas debería tener, según su tipo de
 * horario. Para que una estación recién creada enseñe su cobertura prevista en
 * vez de un hueco.
 *
 * ── LA HORA LA PONE LA EMPRESA ──────────────────────────────────────────────
 * Si el puesto tiene su propia ventana (`startingTimeInDay`/`finishTimeInDay`),
 * ésa es la jornada: un «12h-day» de 09:00 a 17:00 es una jornada diurna de
 * 09:00 a 17:00, no «07:00–19:00». El molde de las 07:00 sólo vale cuando el
 * puesto no dice nada (GTR, 2026-10-27: la ficha de «Oficina GTR» decía
 * «12h Diurno 07:00–19:00» encima de su propio 09:00–17:00).
 */
export function jornadasPorTipo(
  scheduleType?: string | null,
  ventana?: VentanaDePuesto | null,
): JornadaDePuesto[] {
  const j = (
    tipo: string,
    startTime: string,
    endTime: string,
  ): JornadaDePuesto => ({
    tipo,
    startTime,
    endTime,
    guardsCount: 1,
    days: TODOS_LOS_DIAS,
  });
  const propia = scheduleType ? ventanaDelPuesto(ventana) : null;

  if (propia) {
    const tipo = tipoDeVentana(propia.inicio, propia.fin);

    // Un 24 h con ventana de medio día son sus dos mitades: la ventana y su
    // complemento (la rotación lleva a cada plaza a la suya).
    if (
      scheduleType === "24h" &&
      minutosDeVentana(propia.inicio, propia.fin) < 23 * 60
    ) {
      return [
        j(tipo, propia.inicio, propia.fin),
        j(
          tipo === "Nocturno" ? "Diurno" : "Nocturno",
          propia.fin,
          propia.inicio,
        ),
      ].sort((a, b) => a.startTime.localeCompare(b.startTime));
    }

    return [j(tipo, propia.inicio, propia.fin)];
  }
  if (scheduleType === "24h")
    return [j("Diurno", "07:00", "19:00"), j("Nocturno", "19:00", "07:00")];
  if (scheduleType === "12h-day") return [j("Diurno", "07:00", "19:00")];
  if (scheduleType === "12h-night") return [j("Nocturno", "19:00", "07:00")];
  return [];
}

/* ── EL RESUMEN QUE PINTAN LOS BADGES ──────────────────────────────────────
   «8h Diurno · 09:00–17:00»: la clave (día/noche/24h/a medida), las horas que
   dura y la ventana. Las horas y la ventana salen del puesto; sólo sin ventana
   se cae al molde de 12 h del tipo. Una sola función para la ficha, la lista
   de estaciones y cualquier otro sitio: ésta era la aritmética que se repetía. */
export interface ResumenDeHorario {
  clave: "diurno" | "nocturno" | "24h" | "custom" | null;
  /** Horas de la jornada (a media hora); null si no se saben. */
  horas: number | null;
  /** «09:00–17:00», o null sin ventana propia. */
  ventana: string | null;
}

export function resumenDeHorario(
  scheduleType?: string | null,
  ventana?: VentanaDePuesto | null,
): ResumenDeHorario {
  const base: ResumenDeHorario["clave"] =
    scheduleType === "12h-day"
      ? "diurno"
      : scheduleType === "12h-night"
        ? "nocturno"
        : scheduleType === "24h"
          ? "24h"
          : scheduleType === "custom"
            ? "custom"
            : null;

  if (!base) return { clave: null, horas: null, ventana: null };
  const propia = ventanaDelPuesto(ventana);

  if (!propia) {
    return {
      clave: base,
      horas: base === "24h" ? 24 : base === "custom" ? null : 12,
      ventana: null,
    };
  }
  const largo = minutosDeVentana(propia.inicio, propia.fin);
  const texto = `${propia.inicio}–${propia.fin}`;

  if (base === "24h") {
    // Dos mitades: se enseñan las dos ventanas; la jornada del puesto son 24 h.
    return {
      clave: "24h",
      horas: 24,
      ventana:
        largo >= 23 * 60 ? texto : `${texto} · ${propia.fin}–${propia.inicio}`,
    };
  }
  const horas = Math.round((largo / 60) * 2) / 2;

  if (base === "custom") return { clave: "custom", horas, ventana: texto };
  const tipo = tipoDeVentana(propia.inicio, propia.fin);

  return {
    clave:
      tipo === "Nocturno" ? "nocturno" : tipo === "24 horas" ? "24h" : "diurno",
    horas,
    ventana: texto,
  };
}

/** El texto del badge: «8h Diurno», «12h Nocturno», «24 Horas», «Personalizado». */
export function etiquetaDeHorario(
  t: (k: string, d: string, o?: any) => unknown,
  r: ResumenDeHorario,
): string {
  const h =
    r.horas == null
      ? null
      : Number.isInteger(r.horas)
        ? String(r.horas)
        : String(r.horas);

  if (r.clave === "24h")
    return String(t("ui.StationOverview.turno.24h", "24 Horas"));
  if (r.clave === "diurno") {
    return String(
      h
        ? t("ui.horario.hDiurno", "{{h}}h Diurno", { h })
        : t("ui.StationOverview.turno.diurno", "12h Diurno"),
    );
  }
  if (r.clave === "nocturno") {
    return String(
      h
        ? t("ui.horario.hNocturno", "{{h}}h Nocturno", { h })
        : t("ui.StationOverview.turno.nocturno", "12h Nocturno"),
    );
  }
  if (r.clave === "custom") {
    return String(
      h
        ? t("ui.horario.hPersonalizado", "{{h}}h Personalizado", { h })
        : t("ui.StationOverview.turno.custom", "Personalizado"),
    );
  }

  return "";
}
