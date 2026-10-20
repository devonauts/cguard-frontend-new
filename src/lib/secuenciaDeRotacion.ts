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
  const t = String(texto ?? "").trim();

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

  if (!c.secuencia || c.trabajo <= 0 || c.largo % c.trabajo === 0) return null;

  return complementoDeSecuencia(c.secuencia);
}
