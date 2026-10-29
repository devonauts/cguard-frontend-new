/**
 * ════════════════════════════════════════════════════════════════════════════
 * LA SECUENCIA LIBRE DE UN CICLO (espejo de `lib/secuenciaDeRotacion` del
 * servidor: la misma cuenta aquí y allí, o la vista previa mentiría).
 *
 * Un patrón de tres números —tantos en el tramo propio, tantos en el otro,
 * tantos libres— describe UN bloque de trabajo y UN descanso. Un 1-2-2-2
 * («lunes 24 h; martes y miércoles libres; jueves y viernes 24 h; sábado y
 * domingo libres») tiene dos bloques de trabajo y no cabe. La secuencia lo
 * escribe letra a letra, una por día del ciclo:
 *
 *   D = trabaja en su tramo   N = trabaja en el otro tramo   L = libra
 *
 * «1-2-2-2» es `DLLDDLL`. El día 1 de la secuencia es la fecha de inicio del
 * vigilante, igual que con los tres números.
 * ════════════════════════════════════════════════════════════════════════════
 */

export const SECUENCIA_MAX = 60;

export interface PatronDeCiclo {
  dayShifts?: number | null;
  nightShifts?: number | null;
  restDays?: number | null;
  sequence?: string | null;
  /** Weekly style: `sequence` is 7 letters anchored to the calendar (0 = Monday). */
  weekly?: boolean | null;
}

export interface CicloLeido {
  largo: number;
  trabajo: number;
  dias: number;
  noches: number;
  libres: number;
  secuencia: string | null;
}

/** Sólo D/N/L, entre 2 y 60 días y con al menos un día de trabajo; si no, null. */
export function secuenciaLimpia(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v)
    .toUpperCase()
    .replace(/[^DNL]/g, "");

  if (s.length < 2 || s.length > SECUENCIA_MAX) return null;
  if (!/[DN]/.test(s)) return null;

  return s;
}

/** «1-2-2-2» → `DLLDDLL` (bloques alternos trabajo/libre, empezando por trabajo). */
export function secuenciaDeBloques(texto: unknown): string | null {
  const partes = String(texto ?? "")
    .trim()
    .split(/[-–—x×\s]+/)
    .filter(Boolean);

  if (partes.length < 2) return null;
  if (!partes.every((p) => /^\d{1,2}$/.test(p))) return null;
  let out = "";

  partes.forEach((p, i) => {
    out += (i % 2 === 0 ? "D" : "L").repeat(Number(p));
  });

  return secuenciaLimpia(out);
}

/** Lo que escriba la persona, en cualquiera de las dos formas. */
export function secuenciaDeTexto(texto: unknown): string | null {
  // «F» (día completo) es el tramo propio: se escribe F y se guarda D.
  const t = String(texto ?? "")
    .trim()
    .replace(/[fF]/g, "D");

  if (!t) return null;

  return /^[dnlDNL\s]+$/.test(t) ? secuenciaLimpia(t) : secuenciaDeBloques(t);
}

/** «1-2-2-2» cuando sólo alterna trabajo y libre; con dos tramos, «2D 2N 3L». */
export function nombreDeSecuencia(seq: string): string {
  const s = secuenciaLimpia(seq);

  if (!s) return "";
  const grupos: { letra: string; n: number }[] = [];

  for (const ch of s) {
    const ultimo = grupos[grupos.length - 1];

    if (ultimo && ultimo.letra === ch) ultimo.n += 1;
    else grupos.push({ letra: ch, n: 1 });
  }
  if (!s.includes("N") && s.startsWith("D"))
    return grupos.map((g) => String(g.n)).join("-");

  return grupos.map((g) => `${g.n}${g.letra}`).join(" ");
}

export function cicloDe(rot: PatronDeCiclo | null | undefined): CicloLeido {
  const secuencia = secuenciaLimpia(rot?.sequence);

  if (secuencia) {
    let dias = 0;
    let noches = 0;
    let libres = 0;

    for (const ch of secuencia) {
      if (ch === "D") dias++;
      else if (ch === "N") noches++;
      else libres++;
    }

    return {
      largo: secuencia.length,
      trabajo: dias + noches,
      dias,
      noches,
      libres,
      secuencia,
    };
  }
  const dias = Math.max(0, Math.floor(Number(rot?.dayShifts) || 0));
  const noches = Math.max(0, Math.floor(Number(rot?.nightShifts) || 0));
  const libres = Math.max(0, Math.floor(Number(rot?.restDays) || 0));

  return {
    largo: dias + noches + libres,
    trabajo: dias + noches,
    dias,
    noches,
    libres,
    secuencia: null,
  };
}

/** La secuencia que trabaja donde ésta libra (sólo con un tramo); null si no hay. */
export function complementoDeSecuencia(seq: string): string | null {
  const s = secuenciaLimpia(seq);

  if (!s || s.includes("N")) return null;

  return secuenciaLimpia(
    s
      .split("")
      .map((ch) => (ch === "D" ? "L" : "D"))
      .join(""),
  );
}

/**
 * Cuántas personas cubren UN asiento: k = largo ÷ trabajo si divide exacto
 * (tope 4); dos si es una secuencia de un tramo que no tesela (ella y su
 * complemento); si no, un fijo y el sacafranco tapa sus libres.
 */
export function personasQueSeTurnanCon(
  rot: PatronDeCiclo | null | undefined,
): number {
  const c = cicloDe(rot);

  // A weekly style has no phases to tile: the post opens only on those
  // weekdays, so one person covers each seat.
  if (esSemanal(rot)) return 1;
  if (c.trabajo <= 0 || c.largo <= 0) return 1;
  if (c.largo % c.trabajo === 0) return Math.min(4, c.largo / c.trabajo);
  if (c.secuencia && complementoDeSecuencia(c.secuencia)) return 2;

  return 1;
}

/** ¿Una secuencia de un tramo que necesita a su complemento (no tesela)? */
export function necesitaComplemento(
  rot: PatronDeCiclo | null | undefined,
): string | null {
  const c = cicloDe(rot);

  if (esSemanal(rot)) return null;
  if (!c.secuencia || c.trabajo <= 0 || c.largo % c.trabajo === 0) return null;

  return complementoDeSecuencia(c.secuencia);
}

/* ════════════════════════════════════════════════════════════════════════════
   WEEKLY STYLES («Por días de la semana»).

   A weekly rotation style is a `sequence` of exactly 7 letters anchored to the
   CALENDAR: index 0 = Monday … 6 = Sunday. The guard works those weekdays no
   matter the start date, so there is no phase to pick and nothing to «run»
   (the server refuses «Correr ciclo» for these). Office hours read the same way:
   «Lunes a viernes».
   ════════════════════════════════════════════════════════════════════════ */

/** Weekday keys of the API, Monday first. */
export const DIAS_ISO = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DiaIso = (typeof DIAS_ISO)[number];

/** The station form's weekday keys, Monday first (same order as `DIAS_ISO`). */
const DIAS_FORMULARIO = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];

/** Long and short i18n keys of each weekday, Monday first. */
const CLAVES_DIA = [
  ["lunes", "lun"],
  ["martes", "mar"],
  ["miercoles", "mie"],
  ["jueves", "jue"],
  ["viernes", "vie"],
  ["sabado", "sab"],
  ["domingo", "dom"],
] as const;
const LARGO_ES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const CORTO_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Monday-first index (0 = Monday … 6 = Sunday) of a weekday key ('mon' or 'lun'), or -1. */
export function indiceDeDia(d: unknown): number {
  const k = String(d ?? "").toLowerCase();
  const a = (DIAS_ISO as readonly string[]).indexOf(k);

  return a >= 0 ? a : DIAS_FORMULARIO.indexOf(k);
}

/** Monday-first weekday index of a local date. */
export const diaLunesPrimero = (d: Date): number => (d.getDay() + 6) % 7;

/** Weekdays ('mon'… or 'lun'…) → the 7-letter weekly sequence, or null when none is picked. */
export function secuenciaSemanal(dias: readonly unknown[]): string | null {
  const on = new Set(
    (Array.isArray(dias) ? dias : []).map(indiceDeDia).filter((i) => i >= 0),
  );

  if (!on.size) return null;

  return Array.from({ length: 7 }, (_, i) => (on.has(i) ? "D" : "L")).join("");
}

/** A clean weekly sequence (7 letters D/N/L with at least one working day) or null. */
export function secuenciaSemanalLimpia(v: unknown): string | null {
  const s = secuenciaLimpia(v);

  return s && s.length === 7 ? s : null;
}

/** Is this rotation style a weekly («por días de la semana») one? */
export function esSemanal(
  rot: (PatronDeCiclo & { weekly?: boolean | null }) | null | undefined,
): boolean {
  return !!rot?.weekly && !!secuenciaSemanalLimpia(rot.sequence);
}

/** Monday-first indices the weekly sequence works. */
export function diasDeSecuenciaSemanal(seq: unknown): number[] {
  const s = secuenciaSemanalLimpia(seq);

  if (!s) return [];

  return s
    .split("")
    .map((ch, i) => (ch === "L" ? -1 : i))
    .filter((i) => i >= 0);
}

/** Monday-first indices → API weekday keys ('mon'…). */
export const diasIsoDe = (indices: number[]): DiaIso[] =>
  [...new Set(indices)]
    .filter((i) => i >= 0 && i < 7)
    .sort((a, b) => a - b)
    .map((i) => DIAS_ISO[i]);

/** The letter a weekly sequence gives a calendar date (anchored to Monday). */
export function letraSemanalDe(seq: string, fecha: Date): string {
  const s = secuenciaSemanalLimpia(seq);

  return s ? s.charAt(diaLunesPrimero(fecha)) : "L";
}

/**
 * The real calendar of a weekly sequence: `semanas` weeks starting on the
 * MONDAY of the week of `desde`. Unlike the cyclic preview, the start day never
 * matters — a weekly style has no phase.
 */
export function previaSemanal(
  seq: string,
  desde: Date,
  semanas = 2,
): { fecha: Date; letra: string }[] {
  const s = secuenciaSemanalLimpia(seq);

  if (!s) return [];
  const lunes = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());

  lunes.setDate(lunes.getDate() - diaLunesPrimero(lunes));

  return Array.from({ length: Math.max(1, semanas) * 7 }, (_, i) => {
    const fecha = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i);

    return { fecha, letra: s.charAt(i % 7) };
  });
}

/** Minimal translator signature (i18next's `t` fits). */
export type Traductor = (clave: string, opciones?: any) => string;

const capital = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Long localized weekday name (0 = Monday). */
export function nombreDeDia(i: number, t: Traductor): string {
  return t(`ui.RotationStyleSelect.${CLAVES_DIA[i][0]}`, {
    defaultValue: LARGO_ES[i],
  });
}

/** Short localized weekday name (0 = Monday): «Lun», «Mon». */
export function nombreCortoDeDia(i: number, t: Traductor): string {
  return t(`ui.semana.${CLAVES_DIA[i][1]}`, { defaultValue: CORTO_ES[i] });
}

/**
 * The name of a set of weekdays, localized: «Todos los días», «Lunes a
 * viernes» (a run of three or more), or «Lun, Mié, Vie».
 */
export function nombreDeDias(indices: number[], t: Traductor): string {
  const on = [...new Set(indices)].filter((i) => i >= 0 && i < 7).sort((a, b) => a - b);

  if (!on.length) return t("ui.semana.ningunDia", { defaultValue: "Ningún día" });
  if (on.length === 7)
    return t("ui.semana.todosLosDias", { defaultValue: "Todos los días" });
  const seguidos = on[on.length - 1] - on[0] === on.length - 1;

  if (seguidos && on.length >= 3)
    return capital(
      t("ui.semana.rango", {
        defaultValue: "{{desde}} a {{hasta}}",
        desde: nombreDeDia(on[0], t),
        hasta: nombreDeDia(on[on.length - 1], t),
      }),
    );
  if (on.length === 1) return capital(nombreDeDia(on[0], t));

  return on.map((i) => nombreCortoDeDia(i, t)).join(", ");
}

/** The name of a weekly sequence: «Lunes a viernes», «Lun, Mié, Vie». */
export function nombreSemanal(seq: unknown, t: Traductor): string {
  return nombreDeDias(diasDeSecuenciaSemanal(seq), t);
}

/**
 * The name to SHOW for a rotation style. A weekly style is named from its
 * letters in the viewer's language («Monday to Friday»), never from the name
 * stored on creation (Spanish, from whoever created it).
 */
export function nombreDeEstilo(
  s: (PatronDeCiclo & { weekly?: boolean | null; name?: string | null }) | null | undefined,
  t: Traductor,
): string {
  if (!s) return "";

  return esSemanal(s) ? nombreSemanal(s.sequence, t) : String(s.name || "");
}
