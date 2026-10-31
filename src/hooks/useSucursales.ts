import { useQuery } from "@tanstack/react-query";

import { useEntitlement } from "@/hooks/useEntitlement";
import { usePermissions } from "@/hooks/usePermissions";
import { sucursalesService } from "@/lib/api/sucursalesService";

/**
 * SUCURSALES de la empresa actual (módulo adicional). Sin el módulo no se pide
 * nada: `activo` es falso y el panel sigue con su mapa general de siempre.
 * El resumen (cifras por sucursal) se refresca cada minuto, como el panel.
 *
 * Module off (paused or lapsed) but the company already has branches: the
 * server still answers the list read-only and lets an admin hand out branch
 * access, so whoever can edit settings still gets the list (`soloLectura`).
 * A company that never had branches answers a silent 402 and nothing changes.
 * Creating, editing and archiving branches stay behind `activo`.
 */
export function useSucursales() {
  const activo = useEntitlement("sucursales");
  const { hasPermission } = usePermissions();
  const puedeRepartirAcceso = hasPermission("settingsEdit");
  const tenant =
    typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;
  const lista = useQuery({
    queryKey: ["sucursales", "lista", tenant],
    queryFn: () => sucursalesService.listar(),
    enabled: (activo || puedeRepartirAcceso) && Boolean(tenant),
    staleTime: 60_000,
    ...(activo ? {} : { retry: false }),
  });
  const conSucursales = Boolean(lista.data?.sucursales.length);
  const soloLectura = !activo && conSucursales;
  const resumen = useQuery({
    queryKey: ["sucursales", "resumen", tenant],
    queryFn: () => sucursalesService.resumen(),
    enabled: Boolean(tenant) && conSucursales,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return { activo, soloLectura, lista, resumen };
}
