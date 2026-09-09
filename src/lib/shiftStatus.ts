/**
 * Qué significa el estado de un turno — una sola definición para todo el CRM.
 *
 * Espejo de `backend/src/lib/shiftStatus.ts`. Existe porque la regla se estaba
 * reescribiendo a mano en cada pantalla y no todas coincidían:
 *
 *   · La pestaña Turnos de la estación tenía su propia lista (`ANULADOS`).
 *   · El Horario NO tenía ninguna: su píldora de cobertura salía de TODOS los
 *     turnos. Marcar «Libre» a un sacafranco deja su turno en `absent`, pero la
 *     casilla del puesto seguía enseñando «N ET» como si fuera a presentarse.
 *     Nadie veía el hueco. (Seguridad B.A.S., Edgardo Torres, 2026-09-08.)
 *
 * La regla es la del backend: **la fila del turno sobrevive, lo que cambia es su
 * estado**. Se conserva porque es la prueba de lo que se había planificado —la
 * necesitan la nómina, un reclamo del cliente y el expediente del vigilante— y
 * porque borrarla no servía de nada: la siguiente regeneración la traía de vuelta.
 *
 * Consecuencia para quien lee: que exista una fila YA NO significa que alguien
 * vaya a estar en el puesto. Lo que responda «¿quién cubre?» o «¿hay hueco?»
 * tiene que filtrar con `cuentaComoCobertura`. Lo que responda «¿qué pasó?»
 * —asistencia, historial, auditoría— NO debe filtrar: ahí es donde vive la
 * evidencia.
 */

/** Nadie está en el puesto: el turno se anuló, se trasladó, o la persona no va. */
export const ESTADOS_ANULADOS = [
  "cancelled",
  "transferred_out",
  "absent",
] as const;

/**
 * `absent` aparte de los otros dos.
 *
 * No son lo mismo aunque los tres dejen el puesto vacío:
 *   · `cancelled` / `transferred_out` — el turno dejó de existir aquí (se cerró
 *     la asignación, o se lo llevó otra estación). No hay nada que contar.
 *   · `absent` — la persona SÍ estaba programada y no va a venir. Eso es una
 *     novedad, y el historial de la estación tiene que enseñarla con su motivo
 *     y con quién la registró.
 */
export const ESTADO_NOVEDAD = "absent";

/** ¿Este turno significa que alguien va a estar en el puesto? */
export function cuentaComoCobertura(
  turno: { status?: string | null } | null | undefined,
): boolean {
  if (!turno) return false;

  // Sin estado = turno de siempre (la mayoría en empresas antiguas) = cuenta.
  // Se decide por lista NEGRA para que un estado nuevo cuente como cobertura
  // por defecto: que algo desaparezca del cuadrante sin avisar es el fallo caro.
  return !(ESTADOS_ANULADOS as readonly string[]).includes(
    String(turno.status || "planned"),
  );
}

/** ¿Es una novedad —alguien que estaba programado y no viene—? */
export function esNovedad(
  turno: { status?: string | null } | null | undefined,
): boolean {
  return String(turno?.status || "") === ESTADO_NOVEDAD;
}
