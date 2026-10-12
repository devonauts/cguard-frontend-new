/**
 * ════════════════════════════════════════════════════════════════════════════
 * EVENTOS = SEDES DE TIPO «EVENTO»
 *
 * Un evento no es un módulo aparte: es una sede (`businessInfo`) con
 * `serviceType = 'event'` y dos columnas más, `vigenteDesde` / `vigenteHasta`
 * (instantes ISO). Todo lo demás —puestos, plazas, asignaciones, turnos,
 * fichaje— es lo de siempre. Lo que cambia es QUÉ se pregunta:
 *
 *   - en el asistente de la sede, las fechas del evento y su briefing;
 *   - en el puesto, sin rotación (no hay ciclo que repetir);
 *   - al asignar, sin fechas ni ciclo: las pone el servidor con la vigencia.
 *
 * Aquí vive la aritmética, sin React, para que la usen igual el asistente, la
 * ficha y los diálogos de asignación.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { esEvento } from "@/lib/serviceTypes";
import {
  diaDeLaEmpresa,
  fechaYHora,
  instanteEnLaEmpresa,
  sumaDias,
} from "@/lib/horaDeLaEmpresa";

export { esEvento };

/** Lo más largo que puede durar un evento (lo mismo que exige el servidor). */
export const EVENTO_MAX_DIAS = 31;

/** Las claves del briefing, PLANAS en `serviceConfig`. Todas texto y opcionales. */
export const CLAVES_BRIEFING = [
  "encuentro",
  "uniforme",
  "responsable",
  "telefonoResponsable",
  "instrucciones",
] as const;
export type ClaveBriefing = (typeof CLAVES_BRIEFING)[number];

export interface SedeConVigencia {
  serviceType?: string | null;
  vigenteDesde?: string | null;
  vigenteHasta?: string | null;
}

const aFecha = (v?: string | Date | null): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);

  return Number.isNaN(d.getTime()) ? null : d;
};

/** La vigencia de la sede como instantes (o null si falta). */
export function vigenciaDe(sede?: SedeConVigencia | null): {
  desde: Date | null;
  hasta: Date | null;
} {
  return {
    desde: aFecha(sede?.vigenteDesde),
    hasta: aFecha(sede?.vigenteHasta),
  };
}

export type ErrorVigencia =
  | "faltaInicio"
  | "faltaFin"
  | "finAntesDeInicio"
  | "demasiadoLargo"
  | null;

/** Las mismas reglas que el servidor: las dos fechas, fin > inicio, ≤ 31 días. */
export function validarVigencia(
  desde?: string | Date | null,
  hasta?: string | Date | null,
): ErrorVigencia {
  const a = aFecha(desde);
  const b = aFecha(hasta);

  if (!a) return "faltaInicio";
  if (!b) return "faltaFin";
  if (b.getTime() <= a.getTime()) return "finAntesDeInicio";
  if (b.getTime() - a.getTime() > EVENTO_MAX_DIAS * 24 * 3600 * 1000)
    return "demasiadoLargo";

  return null;
}

/** ¿El evento ya terminó? (Sólo para sedes-evento con fecha de fin.) */
export function eventoTerminado(
  sede?: SedeConVigencia | null,
  ahora: Date = new Date(),
): boolean {
  if (!esEvento(sede)) return false;
  const { hasta } = vigenciaDe(sede);

  return !!hasta && hasta.getTime() < ahora.getTime();
}

/** ¿El evento está en marcha ahora mismo? */
export function eventoEnCurso(
  sede?: SedeConVigencia | null,
  ahora: Date = new Date(),
): boolean {
  if (!esEvento(sede)) return false;
  const { desde, hasta } = vigenciaDe(sede);

  return (
    !!desde &&
    !!hasta &&
    desde.getTime() <= ahora.getTime() &&
    ahora.getTime() <= hasta.getTime()
  );
}

const FMT_DIA_HORA: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: undefined,
  hour: "2-digit",
  minute: "2-digit",
};

/** Sin las comas que mete el formateador («sáb, 15 nov, 14:00»). */
const limpio = (s: string) => s.replace(/,/g, "").replace(/\s+/g, " ").trim();

/**
 * «sáb 15 nov 14:00 → dom 16 nov 03:00», en la hora de la EMPRESA. Si empieza y
 * acaba el mismo día, el fin sólo lleva la hora: «sáb 15 nov 14:00 → 23:00».
 */
export function rangoDelEvento(
  desde?: string | Date | null,
  hasta?: string | Date | null,
): string {
  const a = aFecha(desde);
  const b = aFecha(hasta);

  if (!a || !b) return "";
  const ini = limpio(fechaYHora(a, FMT_DIA_HORA));
  const mismoDia = diaDeLaEmpresa(a) === diaDeLaEmpresa(b);
  const fin = mismoDia
    ? limpio(
        fechaYHora(b, {
          day: undefined,
          month: undefined,
          year: undefined,
          hour: "2-digit",
          minute: "2-digit",
        }),
      )
    : limpio(fechaYHora(b, FMT_DIA_HORA));

  return `${ini} → ${fin}`;
}

/**
 * La ventana que trabaja una plaza el PRIMER día del evento, recortada a la
 * vigencia. Sin plaza (o sin horas), la vigencia entera. Sirve para preguntar
 * quién está libre (`/coverage/candidates`).
 */
export function ventanaDeLaPlaza(
  sede: SedeConVigencia | null | undefined,
  plaza?: { startTime?: string | null; endTime?: string | null } | null,
): { start: Date; end: Date } | null {
  const { desde, hasta } = vigenciaDe(sede);

  if (!desde || !hasta) return null;
  const hm = (v?: string | null) => {
    const m = String(v || "").match(/^(\d{1,2}):(\d{2})/);

    return m ? [Number(m[1]), Number(m[2])] : null;
  };
  const ini = hm(plaza?.startTime);
  const fin = hm(plaza?.endTime);

  if (!ini || !fin) return { start: desde, end: hasta };

  let dia = diaDeLaEmpresa(desde);
  let start = instanteEnLaEmpresa(dia, ini[0], ini[1]);
  let end = instanteEnLaEmpresa(dia, fin[0], fin[1]);

  if (end.getTime() <= start.getTime())
    end = instanteEnLaEmpresa(sumaDias(dia, 1), fin[0], fin[1]);
  // El bloque de ese día acabó antes de que empezara el evento: el primero
  // que de verdad trabaja es el del día siguiente.
  if (end.getTime() <= desde.getTime()) {
    dia = sumaDias(dia, 1);
    start = instanteEnLaEmpresa(dia, ini[0], ini[1]);
    end = instanteEnLaEmpresa(dia, fin[0], fin[1]);
    if (end.getTime() <= start.getTime())
      end = instanteEnLaEmpresa(sumaDias(dia, 1), fin[0], fin[1]);
  }
  const s = new Date(Math.max(start.getTime(), desde.getTime()));
  const e = new Date(Math.min(end.getTime(), hasta.getTime()));

  return e.getTime() > s.getTime()
    ? { start: s, end: e }
    : { start: desde, end: hasta };
}
