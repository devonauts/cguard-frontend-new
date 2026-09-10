/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL NOMBRE DE UN VIGILANTE, EN UN SOLO SITIO
 *
 * Había DOCE copias de esto repartidas por el Horario y el detalle de cliente:
 *
 *     `${g.firstName || ''} ${g.lastName || ''}`.trim()
 *
 * Y esa expresión devuelve CADENA VACÍA cuando el usuario no tiene esas dos
 * columnas — que era el caso de los 72 vigilantes en producción, porque el alta
 * escribía el nombre en la ficha de RR.HH. (`securityGuard.fullName`) y nunca en
 * el usuario. Resultado: rejilla del Horario sin nombres, y la pestaña de
 * estaciones del cliente igual.
 *
 * Lo peor de la expresión de arriba no es que falle: es que falla EN SILENCIO y
 * a un hueco. Un `undefined` se vería; una cadena vacía se lee como «esta celda
 * no tiene vigilante», que es una frase distinta y falsa.
 *
 * Los datos están reconciliados (migración z20260817e), pero esto se queda: es
 * el respaldo para cualquier respuesta que no traiga una de las formas, y el
 * único sitio donde hay que tocar si mañana aparece otra.
 * ════════════════════════════════════════════════════════════════════════════
 */

export interface ConNombre {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email?: string | null;
}

const limpio = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * El nombre para mostrar, probando las formas en orden de preferencia.
 *
 * `respaldo` es lo que se pinta cuando no hay ninguna — y conviene que diga algo
 * ('Vigilante', 'Sacafranco', '?') en vez de quedar vacío, porque una celda en
 * blanco en el Horario significa «nadie asignado».
 */
export function nombreDeVigilante(
  g: ConNombre | null | undefined,
  respaldo = "",
): string {
  if (!g) return respaldo;

  const completo = limpio(g.fullName) || limpio(g.name);

  if (completo) return completo;

  const compuesto = [limpio(g.firstName), limpio(g.lastName)]
    .filter(Boolean)
    .join(" ");

  if (compuesto) return compuesto;

  // El correo es feo, pero identifica. Mejor «jcevallos@…» que un hueco.
  const correo = limpio(g.email);

  if (correo) return correo;

  return respaldo;
}

/** Sólo el nombre de pila, para las celdas estrechas de la rejilla. */
export function primerNombre(
  g: ConNombre | null | undefined,
  respaldo = "?",
): string {
  const n = nombreDeVigilante(g, "");

  if (!n) return respaldo;
  // Un correo no se parte por espacios; se corta en la arroba.
  if (n.includes("@") && !n.includes(" ")) return n.split("@")[0];

  return n.split(/\s+/)[0] || respaldo;
}

/**
 * Iniciales para las fichas compactas del calendario.
 *
 * Con un solo nombre se toman sus dos primeras letras en vez de una: una inicial
 * suelta se confunde con los códigos de novedad de la rejilla (V, F, L…).
 */
export function inicialesDeVigilante(
  g: ConNombre | null | undefined,
  respaldo = "?",
): string {
  const n = nombreDeVigilante(g, "");

  if (!n) return respaldo;

  const partes = n.split(/\s+/).filter(Boolean);

  if (partes.length >= 2) {
    return (partes[0][0] + partes[1][0]).toUpperCase();
  }

  return partes[0].slice(0, 2).toUpperCase() || respaldo;
}

export default nombreDeVigilante;
