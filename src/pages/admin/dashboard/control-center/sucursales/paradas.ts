import type { MapEntity } from "../types";

import { useMemo } from "react";

import { repartir, SIN_SUCURSAL } from "./repartir";

import {
  coberturaDe,
  type CifrasDeSucursal,
  type ListaDeSucursales,
  type ResumenDeSucursales,
} from "@/lib/api/sucursalesService";

/**
 * LAS PARADAS DEL MAPA DE SUCURSALES (Sucursales 2.0, fase 3).
 *
 * Mike (2026-10-21): «el mapa debe tener el mapa global, y cuando hacemos
 * swipe sale la ciudad uno, ciudad dos». Una parada es un sitio al que viaja la
 * cámara de UN solo mapa: la vista global (todas las sedes) y luego cada
 * sucursal, la principal primero y después en su orden. Orden FIJO a propósito:
 * al deslizar, la ciudad dos tiene que estar siempre en el mismo sitio (el
 * carrusel de antes ordenaba por «lo que más arde» y cada minuto cambiaba).
 *
 * Cada parada lleva los PUNTOS que la cámara encuadra (sus sedes con
 * coordenadas; si no tiene ninguna, el centro guardado de la sucursal) y sus
 * cifras en vivo de `GET /branch/summary`.
 */
export const GLOBAL = "__global__";

export interface Parada {
  clave: string;
  global: boolean;
  /** Vacío en la global: el nombre lo pone quien pinta («Vista global»). */
  nombre: string;
  codigo: string | null;
  color: string;
  principal: boolean;
  cifras?: CifrasDeSucursal;
  cobertura: number | null;
  emergencias: number;
  sedes: number;
  entidades: MapEntity[];
  puntos: Array<{ lat: number; lng: number }>;
}

const numero = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : (v as number);

  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

export function useParadas(
  lista: ListaDeSucursales | undefined,
  resumen: ResumenDeSucursales | undefined,
  entities: MapEntity[],
): Parada[] {
  return useMemo(() => {
    if (!lista) return [];
    const por = repartir(entities, lista);
    const cifras = new Map(
      (resumen?.porSucursal || []).map((c) => [c.branchId ?? SIN_SUCURSAL, c]),
    );
    const emergenciasDe = (ents: MapEntity[]) =>
      ents.filter((e) => e.kind === "incident" && e.status === "emergency")
        .length;

    const sucursales = [...lista.sucursales].sort(
      (a, b) =>
        Number(!!b.isHeadquarters) - Number(!!a.isHeadquarters) ||
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name),
    );
    const deSucursales: Parada[] = sucursales.map((b) => {
      const ents = por.get(b.id) || [];
      const c = cifras.get(b.id);
      const conPunto = b.sedes
        .filter((s) => s.lat != null && s.lng != null)
        .map((s) => ({ lat: s.lat as number, lng: s.lng as number }));
      const centro =
        numero(b.centerLat) != null && numero(b.centerLng) != null
          ? [
              {
                lat: numero(b.centerLat) as number,
                lng: numero(b.centerLng) as number,
              },
            ]
          : [];

      return {
        clave: b.id,
        global: false,
        nombre: b.name,
        codigo: b.code,
        color: b.color || "var(--brand)",
        principal: !!b.isHeadquarters,
        cifras: c,
        cobertura: coberturaDe(c),
        emergencias: emergenciasDe(ents),
        sedes: b.sedes.length,
        entidades: ents,
        puntos: conPunto.length ? conPunto : centro,
      };
    });

    if (deSucursales.length < 2) return deSucursales;

    // La global es la SUMA de las sucursales: así cuadra con sus tarjetas.
    const sumar = (k: keyof CifrasDeSucursal) =>
      (resumen?.porSucursal || []).reduce((a, c) => a + (Number(c[k]) || 0), 0);
    const cifrasTotales: CifrasDeSucursal | undefined = resumen
      ? {
          branchId: null,
          estaciones: sumar("estaciones"),
          covered: sumar("covered"),
          at_risk: sumar("at_risk"),
          uncovered: sumar("uncovered"),
          idle: sumar("idle"),
          enTurno: sumar("enTurno"),
          incidentesAbiertos: sumar("incidentesAbiertos"),
        }
      : undefined;
    const global: Parada = {
      clave: GLOBAL,
      global: true,
      nombre: "",
      codigo: null,
      color: "var(--brand)",
      principal: false,
      cifras: cifrasTotales,
      cobertura: coberturaDe(cifrasTotales),
      emergencias: emergenciasDe(entities),
      sedes: deSucursales.reduce((a, p) => a + p.sedes, 0),
      entidades: entities,
      puntos: deSucursales.flatMap((p) => p.puntos),
    };

    return [global, ...deSucursales];
  }, [lista, resumen, entities]);
}
