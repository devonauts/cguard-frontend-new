/**
 * A QUÉ SUCURSAL PERTENECE CADA PUNTO DEL MAPA.
 *
 * Las estaciones y las sedes lo dicen solas: su sede (`postSiteId`, o el id de
 * la sede en `cl-<id>`) tiene sucursal. Los vigilantes, supervisores e
 * incidentes no traen sede en el mapa, así que se colocan en la sucursal de la
 * SEDE MÁS CERCANA, si está a menos de `RADIO_KM`. Más lejos, no se inventa:
 * van a «sin sucursal».
 *
 * La chincheta de la propia empresa (`tenant`) no es de ninguna sucursal.
 */
import type { MapEntity } from "../types";
import type { ListaDeSucursales } from "@/lib/api/sucursalesService";

import { distanciaKm } from "@/lib/api/sucursalesService";

export const RADIO_KM = 60;
export const SIN_SUCURSAL = "none";

export function repartir(
  entities: MapEntity[],
  lista: ListaDeSucursales | undefined,
): Map<string, MapEntity[]> {
  const out = new Map<string, MapEntity[]>();

  if (!lista) return out;
  const sucursalDeSede = new Map<string, string>();
  const sedesConPunto: Array<{ lat: number; lng: number; suc: string }> = [];

  for (const b of lista.sucursales) {
    for (const s of b.sedes) {
      sucursalDeSede.set(s.id, b.id);
      if (s.lat != null && s.lng != null)
        sedesConPunto.push({ lat: s.lat, lng: s.lng, suc: b.id });
    }
  }
  const poner = (k: string, e: MapEntity) => {
    const l = out.get(k) || [];

    l.push(e);
    out.set(k, l);
  };
  const cercana = (e: MapEntity): string => {
    let mejor = SIN_SUCURSAL;
    let d = Infinity;

    for (const s of sedesConPunto) {
      const x = distanciaKm(s, e);

      if (x < d) {
        d = x;
        mejor = s.suc;
      }
    }

    return d <= RADIO_KM ? mejor : SIN_SUCURSAL;
  };

  for (const e of entities) {
    if (e.kind === "tenant") continue;
    let sede: string | null = null;

    if (e.kind === "station") sede = (e.meta?.postSiteId as string) || null;
    else if (
      e.kind === "client" &&
      e.id.startsWith("cl-") &&
      !e.id.startsWith("cl-acc-")
    )
      sede = (e.meta?.entityId as string) || null;

    if (sede) poner(sucursalDeSede.get(sede) || SIN_SUCURSAL, e);
    else poner(cercana(e), e);
  }

  return out;
}
