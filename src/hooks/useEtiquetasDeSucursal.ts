import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { useSucursales } from "@/hooks/useSucursales";
import { ApiService } from "@/services/api/apiService";
import { sucursalElegida } from "@/lib/sucursalElegida";

/**
 * LA SUCURSAL DE CADA FILA, EN EL CRM (Sucursales 2.0, fase 4 · 2026-10-23).
 *
 * «En la vista global, cada sede, vigilante, incidente y fila de informe lleva
 * una etiqueta con el color y el código de su sucursal; dentro de una sucursal
 * desaparece porque sobra.» Se resuelve aquí, sin pedir nada por fila: el
 * listado de sucursales ya trae qué sedes tiene cada una. Para la gente (su
 * sucursal de casa) hay una consulta aparte que sólo se hace si se pide.
 *
 * `activo` es falso —y nadie pinta nada— sin el módulo, con menos de dos
 * sucursales o trabajando dentro de una sola.
 */
export interface SucursalEtiqueta {
  id: string;
  nombre: string;
  codigo: string | null;
  color: string;
  principal: boolean;
}

export function useEtiquetasDeSucursal(opts: { personas?: boolean } = {}) {
  const suc = useSucursales();
  const lista = suc.lista.data;
  const activo =
    suc.activo && !!lista && lista.sucursales.length >= 2 && !sucursalElegida();
  const tenant =
    typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;

  const personas = useQuery({
    queryKey: ["sucursales", "personas", tenant],
    queryFn: (): Promise<{ personas: Record<string, string> }> =>
      ApiService.get(`/tenant/${tenant}/branch/people`),
    enabled: activo && !!opts.personas && !!tenant,
    staleTime: 5 * 60_000,
    retry: false,
  });

  return useMemo(() => {
    const porId = new Map<string, SucursalEtiqueta>();
    const deSedeA = new Map<string, string>();

    for (const b of lista?.sucursales ?? []) {
      porId.set(b.id, {
        id: b.id,
        nombre: b.name,
        codigo: b.code,
        color: b.color || "var(--brand)",
        principal: !!b.isHeadquarters,
      });
      for (const s of b.sedes) deSedeA.set(String(s.id), b.id);
    }
    const sucursal = (id: unknown) =>
      activo && id ? (porId.get(String(id)) ?? null) : null;
    const deSede = (siteId: unknown) =>
      siteId ? sucursal(deSedeA.get(String(siteId))) : null;
    const dePersona = (userId: unknown) =>
      userId ? sucursal(personas.data?.personas?.[String(userId)]) : null;
    /** Para tablas y exportaciones: «GYE · Guayaquil». */
    const texto = (b: SucursalEtiqueta | null) =>
      b ? (b.codigo ? `${b.codigo} · ${b.nombre}` : b.nombre) : "";

    return { activo, sucursal, deSede, dePersona, texto };
  }, [activo, lista, personas.data]);
}
