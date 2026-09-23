import { useQuery } from "@tanstack/react-query";

import {
  modulosAdicionalesService,
  tiendaVisible,
} from "@/lib/api/modulosAdicionalesService";

/**
 * La tienda de MÓDULOS ADICIONALES de la empresa actual. Quien no puede leer
 * la configuración recibe 403: para él la tienda no existe y el menú no la
 * enseña. Se refresca poco — el catálogo cambia rara vez.
 */
export function useTiendaDeModulos() {
  const tenant = typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;
  const q = useQuery({
    queryKey: ["modulos-adicionales", "tienda", tenant],
    queryFn: () => modulosAdicionalesService.tienda(),
    enabled: Boolean(tenant),
    staleTime: 5 * 60_000,
    retry: false,
  });

  return { ...q, visible: tiendaVisible(q.data) };
}
