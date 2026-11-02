/**
 * The brand of an operations-map pin, and the filter by brand (Multimarca).
 * Pure: the component `FiltroDeMarcaEnMapa` holds the state and the chips.
 */
import type { MapEntity } from "@/pages/admin/dashboard/control-center/types";

/** The brand id of a map entity, or null when it cannot be told. */
export function marcaDeEntidad(
  e: MapEntity,
  deCliente: (clientId: unknown) => { id: string } | null,
  dePersona: (userId: unknown) => { id: string } | null,
): string | null {
  const m = e.meta || {};

  switch (e.kind) {
    case "station":
    case "incident":
      return deCliente(m.clientId)?.id ?? null;
    case "client":
      return deCliente(m.clientId ?? m.entityId)?.id ?? null;
    case "guard":
    case "supervisor":
      return dePersona(m.userId ?? m.entityId)?.id ?? null;
    default:
      return null;
  }
}

/** Keep what belongs to `marca`, the headquarters and incidents of no known brand. */
export function filtrarPorMarca(
  entidades: MapEntity[],
  marca: string | null,
  marcaDe: (e: MapEntity) => string | null,
): MapEntity[] {
  if (!marca) return entidades;

  return entidades.filter((e) => {
    if (e.kind === "tenant") return true;
    const b = marcaDe(e);

    return b === marca || (e.kind === "incident" && b === null);
  });
}
