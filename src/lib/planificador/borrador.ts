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
 *  - guardarlo por empresa en el navegador para que cerrar la pestaña no lo
 *    pierda en silencio, y sólo devolverlo si el horario real sigue siendo el
 *    mismo contra el que se hizo: un borrador viejo sobre un horario que cambió
 *    publicaría la vuelta atrás de lo que otro hizo entretanto.
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

export interface BorradorGuardado {
  v: 1;
  /** El lunes que es el día 0: otro lunes, otros índices. */
  base: string;
  /** `firmaDe` del horario real contra el que se hizo. */
  firma: string;
  toques: number;
  guardado: number;
  plan: Plan;
}

type Almacen = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const claveDelBorrador = (tenantId: string) =>
  `planificador.borrador.${tenantId}`;

export function guardarBorrador(
  almacen: Almacen | null | undefined,
  tenantId: string,
  b: Omit<BorradorGuardado, "v" | "guardado">,
  ahora = Date.now(),
): boolean {
  if (!almacen || !tenantId) return false;
  try {
    const g: BorradorGuardado = { v: 1, guardado: ahora, ...b };

    almacen.setItem(claveDelBorrador(tenantId), JSON.stringify(g));

    return true;
  } catch {
    // Lleno, bloqueado o en una ventana privada: el borrador sigue en memoria.
    return false;
  }
}

export function olvidarBorrador(
  almacen: Almacen | null | undefined,
  tenantId: string,
) {
  if (!almacen || !tenantId) return;
  try {
    almacen.removeItem(claveDelBorrador(tenantId));
  } catch {
    /* nada que hacer */
  }
}

export type Recuperado =
  | { tipo: "ninguno" }
  /** El horario real cambió (o es otra semana): ese borrador ya no aplica. */
  | { tipo: "caducado"; guardado: number }
  | { tipo: "ok"; plan: Plan; toques: number; guardado: number };

/** Borradores de más de una semana no se devuelven: nadie se acuerda de ellos. */
const VIDA_MS = 7 * 86_400_000;

export function leerBorrador(
  almacen: Almacen | null | undefined,
  tenantId: string,
  base: string,
  firma: string,
  ahora = Date.now(),
): Recuperado {
  if (!almacen || !tenantId) return { tipo: "ninguno" };
  let g: BorradorGuardado | null = null;

  try {
    const s = almacen.getItem(claveDelBorrador(tenantId));

    g = s ? (JSON.parse(s) as BorradorGuardado) : null;
  } catch {
    g = null;
  }
  if (!g || g.v !== 1 || !g.plan || !Array.isArray(g.plan.personas))
    return { tipo: "ninguno" };
  if (g.base !== base || g.firma !== firma || ahora - g.guardado > VIDA_MS)
    return { tipo: "caducado", guardado: g.guardado };

  return {
    tipo: "ok",
    plan: g.plan,
    toques: g.toques || 1,
    guardado: g.guardado,
  };
}
