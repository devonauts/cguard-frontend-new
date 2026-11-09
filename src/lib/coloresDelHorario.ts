import type React from "react";
import type { TFunction } from "i18next";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL PASADO DEL HORARIO, EN COLORES (Mike, 2026-11-08).
 *
 * «Todo lo que en el horario ya fue pasado o completado le asignamos un color:
 * gris si se completó sin problema, rojizo si hubo conflicto; café si se
 * completó con doblaje; otro color si lo completó otro trabajador. Y una
 * configuración donde, dependiendo del evento, asignamos un color.»
 *
 * Un turno que ya TERMINÓ deja de ser plan: la celda dice lo que pasó.
 * Espejo de `backend/src/services/schedulingSettingsService.ts`
 * (`settings.schedulingSettings.coloresDelHorario`).
 * ════════════════════════════════════════════════════════════════════════════
 */

export type EventoDelHorario =
  | "completado"
  | "incumplido"
  | "conIncidencia"
  | "doblaje"
  | "cubiertoPorOtro";

export const EVENTOS_DEL_HORARIO: EventoDelHorario[] = [
  "completado",
  "incumplido",
  "conIncidencia",
  "doblaje",
  "cubiertoPorOtro",
];

export interface ColoresDelHorario extends Record<EventoDelHorario, string> {
  activo: boolean;
}

/** Iguales a COLORES_DEL_HORARIO_DEFAULTS del backend. */
export const COLORES_DEL_HORARIO_DEFAULTS: ColoresDelHorario = {
  activo: true,
  completado: "#9ca3af",
  incumplido: "#e5484d",
  conIncidencia: "#f97316",
  doblaje: "#8b5a2b",
  cubiertoPorOtro: "#8b5cf6",
};

const HEX = /^#[0-9a-f]{6}$/i;

export function resolverColores(raw: unknown): ColoresDelHorario {
  const v: any = raw && typeof raw === "object" ? raw : {};
  const r: ColoresDelHorario = {
    ...COLORES_DEL_HORARIO_DEFAULTS,
    activo:
      typeof v.activo === "boolean"
        ? v.activo
        : COLORES_DEL_HORARIO_DEFAULTS.activo,
  };

  for (const k of EVENTOS_DEL_HORARIO) {
    const c = typeof v[k] === "string" ? v[k].trim() : "";

    if (HEX.test(c)) r[k] = c.toLowerCase();
  }

  return r;
}

export interface TurnoParaColor {
  status?: string | null;
  endTime?: string | Date | null;
  /** El servidor lo pone cuando hay un fichaje de ese turno. */
  clockedIn?: boolean;
  /** 'ok' = entró y salió a tiempo; 'incidencia' = tarde, salió antes, sin salida… */
  asistencia?: "ok" | "incidencia" | null;
  /** Por qué fue incidencia: códigos de `attendanceException.type`. */
  motivos?: string[] | null;
}

/**
 * Lo que dice el título de una celda pasada: «Con incidencia (…): Llegada
 * tarde, Fuera de geocerca». Los motivos usan los MISMOS textos que Nómina
 * (`nomina.excepcion.<tipo>`), así una incidencia se llama igual en las dos
 * pantallas. Sólo la incidencia lleva motivos: el resto ya se explica solo.
 */
export function textoDelPasado(
  t: TFunction,
  ev: EventoDelHorario,
  motivos?: string[] | null,
): string {
  const base = t(ETIQUETA_DE_EVENTO[ev][0], ETIQUETA_DE_EVENTO[ev][1]);
  const lista =
    ev === "conIncidencia" && motivos?.length
      ? motivos.map((m) => t(`nomina.excepcion.${m}`, m)).join(", ")
      : "";

  return lista ? `${base}: ${lista}` : base;
}

/**
 * Qué pasó con un turno que ya terminó. `null` = todavía no terminó, o no es
 * algo que se pinte así (anulado, trasladado, o una novedad V/PM/F, que ya
 * tiene su propio color).
 *
 * El orden importa: no fichar es lo más grave (rojo) aunque fuera un doblaje
 * o una cobertura; después, fichar con incidencia; y sólo con un fichaje en
 * orden se dice CÓMO se completó (doblaje, otro trabajador o normal).
 */
export function resultadoDelTurno(
  turno: TurnoParaColor | null | undefined,
  ahora: number,
): EventoDelHorario | null {
  if (!turno?.endTime) return null;
  const fin = new Date(turno.endTime).getTime();

  if (!Number.isFinite(fin) || fin > ahora) return null;
  const estado = String(turno.status || "planned");

  if (["cancelled", "transferred_out", "absent", "training"].includes(estado))
    return null;
  if (!turno.clockedIn) return "incumplido";
  if (turno.asistencia === "incidencia") return "conIncidencia";
  if (estado === "extension") return "doblaje";
  if (estado === "covered" || estado === "reinforcement")
    return "cubiertoPorOtro";

  return "completado";
}

/** La píldora de una celda pasada: el color del evento, tinta legible. */
export function estiloDeResultado(color: string): React.CSSProperties {
  return {
    background: `color-mix(in oklab, ${color} 30%, transparent)`,
    color: "var(--ink)",
    boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 55%, transparent)`,
  };
}

/** [clave i18n, texto por defecto] de cada evento. */
export const ETIQUETA_DE_EVENTO: Record<EventoDelHorario, [string, string]> = {
  completado: ["ui.ColoresDelHorario.completado", "Completado sin problema"],
  incumplido: ["ui.ColoresDelHorario.incumplido", "No se cumplió (sin fichaje)"],
  conIncidencia: [
    "ui.ColoresDelHorario.conIncidencia",
    "Con incidencia (tarde, salió antes o sin salida)",
  ],
  doblaje: ["ui.ColoresDelHorario.doblaje", "Completado con doblaje"],
  cubiertoPorOtro: [
    "ui.ColoresDelHorario.cubiertoPorOtro",
    "Completado por otro trabajador",
  ],
};
