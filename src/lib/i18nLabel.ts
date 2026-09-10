import i18n from "@/i18n";

/**
 * Etiquetas traducidas dentro de CONSTANTES de módulo.
 *
 * EL PROBLEMA. Media interfaz saca sus textos de tablas declaradas arriba del
 * archivo — `STATUS_META`, `CATEGORY_META`, `PRIORITY_META`… — que se evalúan
 * UNA VEZ, al importar el módulo. Eso descarta las dos salidas obvias:
 *
 *   · `useTranslation()` no sirve: es un hook y esto no es un componente.
 *   · `i18n.t('clave')` a secas tampoco: se resolvería al cargar el módulo,
 *     que ocurre ANTES de que el usuario elija idioma y, sobre todo, una sola
 *     vez — quien cambiara de idioma seguiría viendo el de la carga.
 *
 * LA SALIDA. Definir `label` como PROPIEDAD DE ACCESO: no guarda un texto,
 * guarda la forma de obtenerlo. Se resuelve cada vez que alguien la lee, así
 * que sigue al idioma vigente sin que el sitio de uso cambie ni una línea —
 * `meta.label` se sigue escribiendo igual.
 *
 * OJO CON EL SPREAD. `{ ...conEtiqueta(...) }` COPIA el valor y lo congela: el
 * getter se invoca una vez y el resultado se queda fijo. Por eso el resto de
 * campos se pasan como argumento y no se esparce el resultado.
 *
 * Uso:
 *   const STATUS_META = {
 *     queued: conEtiqueta('alarm.status.queued', { tone: 'bad' }),
 *   };
 *   STATUS_META.queued.label   // → «En cola» / «Queued» / «Na fila»
 */
export function conEtiqueta<T extends object>(
  clave: string,
  resto: T,
): T & { label: string } {
  return Object.defineProperty({ ...resto }, "label", {
    get: () => i18n.t(clave),
    enumerable: true,
    configurable: true,
  }) as T & { label: string };
}

/** Igual, para tablas que son sólo `clave → texto`, sin campos extra. */
export function tablaDeEtiquetas<K extends string>(
  claves: Record<K, string>,
): Record<K, string> {
  const salida = {} as Record<K, string>;

  for (const k of Object.keys(claves) as K[]) {
    Object.defineProperty(salida, k, {
      get: () => i18n.t(claves[k]),
      enumerable: true,
      configurable: true,
    });
  }

  return salida;
}
