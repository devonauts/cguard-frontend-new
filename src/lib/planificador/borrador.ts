/**
 * EL BORRADOR SIN PUBLICAR.
 *
 * Incidente 2026-10-11 (B.A.S., CASA SINOHYDRO): se corrió un día el ciclo de un
 * vigilante en el Planificador, nunca se pulsó «Publicar», y la pantalla lo
 * enseñaba libre mientras el horario real —y VigIA— lo tenían trabajando. Lo
 * único que lo decía era una pastilla gris en la cabecera.
 *
 * Aquí vive la parte pura de que eso no vuelva a pasar:
 *  - cuándo el borrador difiere del horario real (lo dice la lista de cambios
 *    de «Publicar», no el contador de toques) y cuándo hay que frenar a quien
 *    se va;
 *  - cuándo un borrador guardado es demasiado viejo para devolverlo.
 *
 * Desde la fase 2 (2026-10-31) el borrador vive en el SERVIDOR, compartido por
 * quienes editan ese horario (`servidor.ts`), y cuando el horario real cambia
 * debajo se combina en vez de tirarse (`rebase.ts`).
 */
import type { Plan } from "./motor";

export interface EstadoBorrador {
  /** Cuántos cambios irían al horario real al publicar ahora. */
  pendientes: number;
  /** Hay algo en pantalla que NO está en el horario real. */
  sinPublicar: boolean;
  /**
   * Frenar al salir. Sólo si alguien tocó el borrador: los sacafrancos fijos
   * cubren huecos solos al cargar y eso también cuenta como «sin publicar»,
   * pero preguntar «¿salir sin publicar?» a quien sólo vino a mirar enseña a
   * pulsar «Salir» sin leer.
   */
  avisarAlSalir: boolean;
}

export function estadoDelBorrador(
  pendientes: number | null | undefined,
  toques: number,
): EstadoBorrador {
  const n = Math.max(0, pendientes ?? 0);

  return {
    pendientes: n,
    sinPublicar: n > 0,
    avisarAlSalir: n > 0 && toques > 0,
  };
}

/** Huella corta de lo leído del servidor (djb2 sobre el JSON). */
export function firmaDe(plan: Plan): string {
  const s = JSON.stringify(plan);
  let h = 5381;

  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;

  return `${s.length}.${(h >>> 0).toString(36)}`;
}

/** Where older versions kept the draft in the browser: removed on sight. */
export const claveDelBorrador = (tenantId: string) =>
  `planificador.borrador.${tenantId}`;

/** Borradores sin tocar en más de una semana no se devuelven: nadie se acuerda de ellos. */
export const VIDA_DEL_BORRADOR_MS = 7 * 86_400_000;

export function borradorCaducado(
  updatedAt: string | null | undefined,
  ahora = Date.now(),
): boolean {
  const t = Date.parse(String(updatedAt || ""));

  return Number.isFinite(t) && ahora - t > VIDA_DEL_BORRADOR_MS;
}

/**
 * The draft's day 0 is the Monday it was made on. While it lives (a week at
 * most) the editor opens on THAT Monday so the plan's day indexes still mean
 * the same dates; an older or missing base falls back to this week.
 */
export function baseParaAbrir(
  baseDelBorrador: string | null | undefined,
  lunesDeHoy: string,
): string {
  if (!baseDelBorrador || !/^\d{4}-\d{2}-\d{2}$/.test(baseDelBorrador))
    return lunesDeHoy;
  const dias =
    (Date.parse(`${lunesDeHoy}T00:00:00Z`) -
      Date.parse(`${baseDelBorrador}T00:00:00Z`)) /
    86_400_000;

  return dias >= 0 && dias <= 14 && dias % 7 === 0 ? baseDelBorrador : lunesDeHoy;
}
