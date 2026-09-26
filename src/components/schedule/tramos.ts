import i18n from "@/i18n";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * CÓMO SE LLAMA CADA TRAMO DE UNA ESTACIÓN
 *
 * El motor de rotación guarda un ciclo con DOS tramos de trabajo y unos libres
 * (`dayShifts` / `nightShifts` / `restDays`). En un puesto de 24 h esos dos
 * tramos son literalmente el día y la noche, y así se llamaron siempre.
 *
 * En una estación PERSONALIZADA partida en bloques no lo son. BIOMAR BAHIA
 * cubre 07:00–23:00 en dos tramos —07:00–15:00 y 15:00–23:00—: el segundo es la
 * TARDE. Llamarlo «noche» hacía que el operador no reconociera lo que acababa
 * de configurar, y el único formulario que ofrecía ese segundo campo era el de
 * 24 h, así que un ciclo «2 mañanas, 2 tardes, 2 libres» no había forma de
 * escribirlo aunque el generador lleve haciéndolo desde siempre.
 *
 * Un solo sitio decide el nombre para que la ficha de la estación, el
 * programador y el modal de asignación digan todos lo mismo.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Minutos desde medianoche de un "HH:MM" (0 si no se puede leer). */
export function aMinutos(hhmm: string): number {
  const [h, m] = String(hhmm || "")
    .split(":")
    .map((n) => parseInt(n, 10));

  if (!Number.isFinite(h)) return 0;

  return ((h % 24) * 60 + ((Number.isFinite(m) ? m : 0) % 60) + 1440) % 1440;
}

/** "HH:MM" a partir de minutos desde medianoche (envuelve a las 24 h). */
export function aHHMM(min: number): string {
  const v = ((Math.round(min) % 1440) + 1440) % 1440;

  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
}

/** Cómo llama la gente al tramo que EMPIEZA a esa hora. */
export function nombreDeTramo(hhmm: string): string {
  const h = Math.floor(aMinutos(hhmm) / 60);

  if (h >= 18 || h < 6) return etiquetaNoche();

  return h >= 12
    ? i18n.t("ui.tramos.tarde", "tarde")
    : i18n.t("ui.tramos.manana", "mañana");
}

/** Translated display label for the night segment. */
function etiquetaNoche(): string {
  return i18n.t("ui.tramos.noche", "noche");
}

/** Translated display label for the day segment. */
function etiquetaDia(): string {
  return i18n.t("ui.tramos.dia", "día");
}

/** Las ventanas de los `bloques` tramos en que se parte una cobertura. */
export function ventanasDeBloques(
  inicio: string,
  minutosPorBloque: number,
  bloques: number,
): { start: string; end: string; nombre: string }[] {
  if (!inicio || minutosPorBloque <= 0 || bloques <= 0) return [];
  const base = aMinutos(inicio);

  return Array.from({ length: bloques }, (_, i) => {
    const start = aHHMM(base + i * minutosPorBloque);

    return {
      start,
      end: aHHMM(base + (i + 1) * minutosPorBloque),
      nombre: nombreDeTramo(start),
    };
  });
}

/**
 * El nombre del SEGUNDO tramo del ciclo de una estación partida en bloques.
 *
 * El ciclo alterna entre el bloque propio y el SIGUIENTE (así lo genera
 * `shiftGenerationService`: `bloques[(propio + 1) % bloques.length]`), por eso
 * se mira el bloque 2 y no el último. Con un solo bloque no hay segundo tramo y
 * el nombre de siempre —«noche»— es el correcto.
 */
export function etiquetaSegundoTramo(
  inicio: string,
  minutosPorBloque: number,
  bloques: number,
): string {
  if (bloques < 2) return etiquetaNoche();
  const vs = ventanasDeBloques(inicio, minutosPorBloque, bloques);

  return vs[1]?.nombre || etiquetaNoche();
}

/** El nombre del PRIMER tramo. Con un solo bloque no hay tramos que nombrar. */
export function etiquetaPrimerTramo(
  inicio: string,
  minutosPorBloque: number,
  bloques: number,
): string {
  if (bloques < 2) return etiquetaDia();

  return (
    ventanasDeBloques(inicio, minutosPorBloque, bloques)[0]?.nombre ||
    etiquetaDia()
  );
}
