/**
 * WHICH EXISTING PLAZA BECOMES WHICH NEW ONE when a station's requirement is
 * edited (Estación › Requisito → `auto-positions` with `franjas`).
 *
 * Pairing by `sortOrder` alone moved people: removing the 07:00 window of a
 * station with 07:00 / 15:00 / 23:00 slid the 15:00 guard into 07:00's row and
 * the 23:00 guard into 15:00's, and the last one lost the post — when the one
 * who should have left was whoever held 07:00. The rules now:
 *
 *   1. Same window, same plaza. A new seat with the same hours takes an old
 *      plaza with those hours, occupied ones first.
 *   2. Fewer seats than plazas: the EMPTY plazas go first. Only when every
 *      remaining plaza is occupied does someone leave — the last one in order.
 *   3. What is left pairs in order, so changing the hours of a station keeps
 *      the day guard on the day seat and the night guard on the night seat.
 *
 * Mirror of the backend `src/lib/emparejarPlazas.ts` (the server is the one
 * that pairs on save): the station sheet runs it to say who moves and who
 * leaves BEFORE saving. Keep both in step.
 */
export interface PlazaVieja {
  id: string;
  startTime: string;
  endTime: string;
  sortOrder?: number | null;
}

export interface PlazaNueva {
  startTime: string;
  endTime: string;
}

export interface Emparejamiento {
  /** For each new seat (same order), the old plaza id it keeps, or null = created. */
  nuevas: Array<string | null>;
  /** Old plazas left over: deleted, their occupants leave the post. */
  sobrantes: string[];
}

const hhmm = (s: string) => String(s || "").slice(0, 5);

export function emparejarPlazas(
  viejas: PlazaVieja[],
  nuevas: PlazaNueva[],
  ocupadas: Set<string>,
): Emparejamiento {
  const orden = [...viejas].sort(
    (a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0),
  );
  const libres = new Set(orden.map((v) => String(v.id)));
  const out: Array<string | null> = nuevas.map(() => null);

  // 1. Same window.
  nuevas.forEach((n, i) => {
    const mismas = orden.filter(
      (v) =>
        libres.has(String(v.id)) &&
        hhmm(v.startTime) === hhmm(n.startTime) &&
        hhmm(v.endTime) === hhmm(n.endTime),
    );
    if (!mismas.length) return;
    const elegida = mismas.find((v) => ocupadas.has(String(v.id))) || mismas[0];
    out[i] = String(elegida.id);
    libres.delete(String(elegida.id));
  });

  // 2. Too many plazas for the seats still open: drop the empty ones first,
  //    then the last occupied ones.
  const huecos = out.filter((x) => x === null).length;
  let resto = orden.filter((v) => libres.has(String(v.id)));
  const sobrantes: string[] = [];
  if (resto.length > huecos) {
    let quitar = resto.length - huecos;
    for (const v of [...resto].reverse()) {
      if (quitar <= 0) break;
      if (!ocupadas.has(String(v.id))) {
        sobrantes.push(String(v.id));
        quitar--;
      }
    }
    for (const v of [...resto].reverse()) {
      if (quitar <= 0) break;
      if (!sobrantes.includes(String(v.id))) {
        sobrantes.push(String(v.id));
        quitar--;
      }
    }
    resto = resto.filter((v) => !sobrantes.includes(String(v.id)));
  }

  // 3. The rest, in order.
  let k = 0;
  for (let i = 0; i < out.length && k < resto.length; i++) {
    if (out[i] === null) out[i] = String(resto[k++].id);
  }
  return { nuevas: out, sobrantes };
}
