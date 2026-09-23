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

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { repartir, SIN_SUCURSAL } from "./repartir";

import {
  coberturaDe,
  type ListaDeSucursales,
  type ResumenDeSucursales,
} from "@/lib/api/sucursalesService";

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
}

export function useFocoDeSucursal(
  s: SucursalesParaMovil | undefined,
  entities: MapEntity[],
  sinSucursalNombre: string,
) {
  const [elegida, setElegida] = useState<string | null>(null);
  const pastillas: Pastilla[] = useMemo(() => {
    if (!s) return [];
    const por = repartir(entities, s.lista);
    const cifras = new Map((s.resumen?.porSucursal || []).map((c) => [c.branchId ?? SIN_SUCURSAL, c]));
    const armar = (clave: string, nombre: string, color: string, sedes: Array<{ lat: number | null; lng: number | null }>): Pastilla => {
      const ents = por.get(clave) || [];
      const c = cifras.get(clave);
      const emergencias = ents.filter((e) => e.kind === "incident" && e.status === "emergency").length;
      const con = sedes.filter((x) => x.lat != null && x.lng != null);

      return {
        clave,
        nombre,
        color,
        cobertura: coberturaDe(c),
        emergencias,
        peso: emergencias * 1000 + (c?.uncovered || 0) * 100 + (c?.at_risk || 0) * 10,
        entidades: ents,
        centro: con.length
          ? {
              lat: con.reduce((a, x) => a + (x.lat as number), 0) / con.length,
              lng: con.reduce((a, x) => a + (x.lng as number), 0) / con.length,
              zoom: 11,
            }
          : undefined,
      };
    };
    const reales = s.lista.sucursales
      .map((b) => armar(b.id, b.name, b.color || "var(--brand)", b.sedes))
      .sort((a, b) => b.peso - a.peso);
    const sueltas = s.lista.sinSucursal.length
      ? [armar(SIN_SUCURSAL, sinSucursalNombre, "var(--ink-faint)", s.lista.sinSucursal)]
      : [];

    return [...reales, ...sueltas];
  }, [s, entities, sinSucursalNombre]);

  const actual = pastillas.find((p) => p.clave === elegida) || pastillas[0] || null;

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
            style={activa ? { boxShadow: `inset 0 0 0 2px ${p.color}` } : undefined}
            type="button"
            onClick={() => onElegir(p.clave)}
          >
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            {p.nombre}
            {p.cobertura != null && (
              <span className="tabular-nums" style={{ color: "var(--ink-faint)" }}>
                {p.cobertura}%
              </span>
            )}
            {p.emergencias > 0 && (
              <span aria-label={t("sucursales.cifras.panicos", { count: p.emergencias })} className="size-2 rounded-full" style={{ background: "var(--bad, #dc2626)" }} />
            )}
          </button>
        );
      })}
    </div>
  );
}
