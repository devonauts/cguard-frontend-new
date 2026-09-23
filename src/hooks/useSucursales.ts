import { useQuery } from "@tanstack/react-query";

import { useEntitlement } from "@/hooks/useEntitlement";
import { sucursalesService } from "@/lib/api/sucursalesService";

/**
 * SUCURSALES de la empresa actual (módulo adicional). Sin el módulo no se pide
 * nada: `activo` es falso y el panel sigue con su mapa general de siempre.
 * El resumen (cifras por sucursal) se refresca cada minuto, como el panel.
 */
export function useSucursales() {
  const activo = useEntitlement("sucursales");
  const tenant = typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;
  const lista = useQuery({
    queryKey: ["sucursales", "lista", tenant],
    queryFn: () => sucursalesService.listar(),
    enabled: activo && Boolean(tenant),
    staleTime: 60_000,
  });
  const resumen = useQuery({
    queryKey: ["sucursales", "resumen", tenant],
    queryFn: () => sucursalesService.resumen(),
    enabled: activo && Boolean(tenant) && Boolean(lista.data?.sucursales.length),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return { activo, lista, resumen };
}
