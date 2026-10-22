/**
 * SUCURSALES EN EL TELÉFONO.
 *
 * En el teléfono el mapa ES la pantalla, así que no cabe un carrusel de mapas:
 * el mapa se queda, pero SIEMPRE centrado en una sucursal. Encima, una fila de
 * pastillas —una por sucursal, con su cobertura y un punto rojo si hay
 * pánico— que se desliza con el dedo; tocar una lleva el mapa a su zona. Arranca
 * en la que más arde, igual que el carrusel de escritorio.
 */
import type { MapEntity } from "../types";
import type {
  ListaDeSucursales,
  ResumenDeSucursales,
} from "@/lib/api/sucursalesService";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useParadas } from "./paradas";

import { sucursalElegida } from "@/lib/sucursalElegida";

export interface SucursalesParaMovil {
  lista: ListaDeSucursales;
  resumen?: ResumenDeSucursales;
}

interface Pastilla {
  clave: string;
  nombre: string;
  color: string;
  cobertura: number | null;
  emergencias: number;
  peso: number;
  entidades: MapEntity[];
  centro?: { lat: number; lng: number; zoom?: number };
  /** Lo que encuadra la cámara al elegir esta pastilla. */
  puntos?: Array<{ lat: number; lng: number }>;
}

export function useFocoDeSucursal(
  s: SucursalesParaMovil | undefined,
  entities: MapEntity[],
  sinSucursalNombre: string,
  globalNombre = "",
) {
  // Sucursales 2.0 (fase 3): las mismas paradas que el mapa de escritorio —
  // la vista global primero y luego cada ciudad, en orden fijo— y un solo mapa
  // que viaja entre ellas (`puntos` → `encuadre`).
  void sinSucursalNombre;
  const [elegida, setElegida] = useState<string | null>(null);
  const todas = useParadas(s?.lista, s?.resumen, entities);
  const enSucursal = sucursalElegida();
  const paradas =
    enSucursal && todas.some((p) => p.clave === enSucursal)
      ? todas.filter((p) => p.clave === enSucursal)
      : todas;
  const pastillas: Pastilla[] = useMemo(
    () =>
      paradas.map((p) => ({
        clave: p.clave,
        nombre: p.global ? globalNombre : p.nombre,
        color: p.color,
        cobertura: p.cobertura,
        emergencias: p.emergencias,
        peso: 0,
        entidades: p.entidades,
        puntos: p.puntos,
      })),
    [paradas, globalNombre],
  );

  const actual =
    pastillas.find((p) => p.clave === elegida) || pastillas[0] || null;

  return { pastillas, actual, elegir: setElegida };
}

export function PastillasDeSucursal({
  pastillas,
  actual,
  onElegir,
}: {
  pastillas: Pastilla[];
  actual: Pastilla | null;
  onElegir: (clave: string) => void;
}) {
  const { t } = useTranslation();

  if (pastillas.length < 2) return null;

  return (
    <div
      aria-label={t("sucursales.titulo")}
      className="pointer-events-auto flex gap-1.5 overflow-x-auto pb-1"
      role="tablist"
      style={{ scrollbarWidth: "none" }}
    >
      {pastillas.map((p) => {
        const activa = actual?.clave === p.clave;

        return (
          <button
            key={p.clave}
            aria-selected={activa}
            className="cg-tarjeta-mapa cg-focus inline-flex min-h-9 shrink-0 items-center gap-1.5 px-3 text-xs font-medium"
            role="tab"
            style={
              activa ? { boxShadow: `inset 0 0 0 2px ${p.color}` } : undefined
            }
            type="button"
            onClick={() => onElegir(p.clave)}
          >
            <span
              className="size-2 rounded-full"
              style={{ background: p.color }}
            />
            {p.nombre}
            {p.cobertura != null && (
              <span
                className="tabular-nums"
                style={{ color: "var(--ink-faint)" }}
              >
                {p.cobertura}%
              </span>
            )}
            {p.emergencias > 0 && (
              <span
                aria-label={t("sucursales.cifras.panicos", {
                  count: p.emergencias,
                })}
                className="size-2 rounded-full"
                style={{ background: "var(--bad, #dc2626)" }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
