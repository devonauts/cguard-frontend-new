/**
 * ════════════════════════════════════════════════════════════════════════════
 * HASTA DÓNDE ATRÁS SE TOCA EL HORARIO — ESPEJO DEL SERVIDOR
 *
 * Copia de `backend/src/lib/ventanaDeEdicion`. Existe para que el Programador
 * no deje hacer clic en una casilla que el servidor va a rechazar: el tope lo
 * impone el backend —ahí está la verdad—, pero enterarse después de abrir el
 * diálogo y elegir un código es una forma fea de decir que no.
 *
 * Regla del dueño, literal: «Nunca cambiamos el pasado. Toda actualización se
 * hace desde una fecha de partida máximo 1 semana atrás y no cambia marcajes
 * hechos ni pagables de atrás».
 *
 * Si se toca el servidor, se toca ESTO.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Días hacia atrás que se pueden tocar, contando hoy como 0. */
export const DIAS_HACIA_ATRAS = 7;

/** `YYYY-MM-DD` de un instante en una zona horaria. */
function ymd(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/**
 * La fecha más antigua que se puede marcar, en la zona de la empresa. Sin zona
 * se usa la del navegador, que para este aviso es suficiente: el servidor
 * vuelve a comprobarlo con la de la empresa.
 */
export function fechaMinimaEditable(
  tz?: string | null,
  ahora: Date = new Date(),
): string {
  const atras = new Date(
    ahora.getTime() - DIAS_HACIA_ATRAS * 24 * 60 * 60 * 1000,
  );
  return ymd(
    atras,
    tz || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
}

/** ¿Se puede marcar una novedad en `fecha`? Hoy, el futuro y una semana atrás. */
export function sePuedeMarcar(
  fecha: string,
  tz?: string | null,
  ahora: Date = new Date(),
): boolean {
  const dia = String(fecha || "").slice(0, 10);
  return !!dia && dia >= fechaMinimaEditable(tz, ahora);
}
