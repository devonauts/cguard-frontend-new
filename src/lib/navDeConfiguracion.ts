import NAVS from "@/data/settings-nav.json";
import { hasFeature } from "@/lib/entitlements";

/**
 * LA NAVEGACIÓN DE CONFIGURACIÓN, SIN LO QUE LA EMPRESA NO TIENE.
 *
 * Una entrada con `modulo` (p. ej. «Roles de pago», `payroll_slips`) sólo se
 * enseña si la empresa tiene ese módulo de pago. Los tres sitios que pintan
 * esta navegación —la portada de Configuración, su índice lateral y el buscador
 * de la cabecera— leen de aquí, para que ninguno ofrezca una página que la
 * empresa no ha contratado. Falla cerrado, como `hasFeature` con los módulos.
 */
export type ItemDeConfiguracion = {
  id: string;
  label: string;
  path: string;
  icon?: string;
  desc?: string;
  keywords?: string;
  modulo?: string;
};
export type SeccionDeConfiguracion = { id?: string; label?: string; hint?: string; items: ItemDeConfiguracion[] };

type Usuario = Parameters<typeof hasFeature>[0];

export function seccionesDeConfiguracion(user: Usuario): SeccionDeConfiguracion[] {
  const secciones = ((NAVS as Record<string, { sections: SeccionDeConfiguracion[] }>).configuracion?.sections ?? []);

  return secciones
    .map((sec) => ({ ...sec, items: sec.items.filter((it) => !it.modulo || hasFeature(user, it.modulo)) }))
    .filter((sec) => sec.items.length > 0);
}

