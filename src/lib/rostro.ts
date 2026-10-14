/**
 * RECONOCIMIENTO FACIAL — las piezas puras que comparten la lista de caras, la
 * ficha del vigilante y los registros de asistencia.
 *
 * Devuelven CLAVES de traducción con su respaldo en español, nunca texto ya
 * traducido: quien pinta decide el idioma.
 */

/** La clave del módulo de pago (`platformAddons`). */
export const MODULO_RECONOCIMIENTO_FACIAL = "reconocimiento_facial";

/** Nómina › Ajustes › `general.faceRecognition`. */
export type ModoFacial = "off" | "flag" | "enforce";

export const MODOS_FACIALES: ModoFacial[] = ["off", "flag", "enforce"];

/** Cualquier valor raro cuenta como apagado (igual que en el servidor). */
export function modoFacial(v: unknown): ModoFacial {
  return v === "flag" || v === "enforce" ? v : "off";
}

/** Lo que el reloj apuntó en el turno (`guardShifts.rostroResultado`). */
export type ResultadoFacial =
  | "coincide"
  | "dudoso"
  | "no_coincide"
  | "reto_fallido"
  | "sin_cara"
  | "sin_registro"
  | "no_verificado";

export type TonoFacial = "ok" | "warn" | "bad" | "neutral";

export interface ChipFacial {
  tono: TonoFacial;
  clave: string;
  respaldo: string;
}

const CHIPS: Record<ResultadoFacial, ChipFacial> = {
  coincide: { tono: "ok", clave: "rostros.resultado.coincide", respaldo: "Coincide" },
  dudoso: { tono: "warn", clave: "rostros.resultado.dudoso", respaldo: "Dudoso" },
  no_coincide: { tono: "bad", clave: "rostros.resultado.no_coincide", respaldo: "No coincide" },
  reto_fallido: { tono: "bad", clave: "rostros.resultado.reto_fallido", respaldo: "Sin gesto" },
  sin_cara: { tono: "bad", clave: "rostros.resultado.sin_cara", respaldo: "Sin cara" },
  sin_registro: { tono: "neutral", clave: "rostros.resultado.sin_registro", respaldo: "Sin registro" },
  no_verificado: { tono: "neutral", clave: "rostros.resultado.no_verificado", respaldo: "Sin verificar" },
};

/**
 * El chip de un resultado. `null` cuando el turno no lleva resultado (la
 * empresa no usa el reconocimiento, o el turno es anterior) — entonces no se
 * pinta nada. Un valor desconocido sale neutro con su propio nombre, para no
 * esconder algo que el servidor haya empezado a mandar.
 */
export function chipFacial(resultado: string | null | undefined): ChipFacial | null {
  if (!resultado) return null;
  const c = CHIPS[resultado as ResultadoFacial];

  if (c) return c;

  return { tono: "neutral", clave: `rostros.resultado.${resultado}`, respaldo: resultado };
}

/** La puntuación (0-1) como porcentaje entero, o `null` si no la hay. */
export function porcentajeFacial(p: number | string | null | undefined): number | null {
  if (p === null || p === undefined || p === "") return null;
  const n = Number(p);

  if (!Number.isFinite(n)) return null;

  return Math.round(Math.min(1, Math.max(0, n)) * 100);
}

/** ¿El error es el 402 «este módulo no está contratado»? */
export function faltaElModulo(e: unknown): boolean {
  const err = e as { status?: number; data?: { code?: string } | null } | null;

  return !!err && (err.status === 402 || err?.data?.code === "addon_required");
}

/** Estado de la cara registrada de una persona. */
export type EstadoDeRegistroFacial = "sin_registro" | "pendiente" | "aprobado" | "rechazado";

const ESTADOS: Record<EstadoDeRegistroFacial, ChipFacial> = {
  pendiente: { tono: "warn", clave: "rostros.estado.pendiente", respaldo: "Por aprobar" },
  aprobado: { tono: "ok", clave: "rostros.estado.aprobado", respaldo: "Aprobada" },
  rechazado: { tono: "bad", clave: "rostros.estado.rechazado", respaldo: "Rechazada" },
  sin_registro: { tono: "neutral", clave: "rostros.estado.sin_registro", respaldo: "Sin registrar" },
};

/** La píldora del estado de registro (lo desconocido cuenta como sin registrar). */
export function chipDeEstado(estado: string | null | undefined): ChipFacial {
  return ESTADOS[(estado || "sin_registro") as EstadoDeRegistroFacial] ?? ESTADOS.sin_registro;
}
