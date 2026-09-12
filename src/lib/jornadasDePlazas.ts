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
export function jornadasDePlazas(
  plazas: PlazaDeHorario[] | null | undefined,
  scheduleType?: string | null,
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
      jornadas.push({
        tipo: b.tipo === "Nocturno" ? "Diurno" : "Nocturno",
        startTime: b.endTime,
        endTime: b.startTime,
        guardsCount: b.guardsCount,
        // La otra mitad opera los MISMOS días: es el mismo puesto partido por
        // la rotación, no otro horario.
        days: b.days,
      });
    }
  }

  return jornadas.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/**
 * Las jornadas que un puesto SIN plazas debería tener, según su tipo de
 * horario. Para que una estación recién creada enseñe su cobertura prevista en
 * vez de un hueco.
 */
export function jornadasPorTipo(
  scheduleType?: string | null,
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
  if (scheduleType === "24h")
    return [j("Diurno", "07:00", "19:00"), j("Nocturno", "19:00", "07:00")];
  if (scheduleType === "12h-day") return [j("Diurno", "07:00", "19:00")];
  if (scheduleType === "12h-night") return [j("Nocturno", "19:00", "07:00")];
  return [];
}
