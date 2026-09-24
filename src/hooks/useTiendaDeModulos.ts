import { useQuery } from "@tanstack/react-query";

import {
  modulosAdicionalesService,
  tiendaVisible,
} from "@/lib/api/modulosAdicionalesService";

/**
 * La tienda de MÓDULOS ADICIONALES de la empresa actual. Quien no puede leer
 * la configuración recibe 403: para él la tienda no existe y el menú no la
 * enseña.
 *
 * Siempre se vuelve a pedir al abrirla: el CRM restaura su caché desde
 * IndexedDB al arrancar, y con 5 minutos de frescura una empresa a la que el
 * SuperAdmin acababa de regalar (o revocar) un módulo seguía viendo «Comprar»
 * aunque recargara. Aquí hay dinero de por medio y la petición es mínima.
 */
export function useTiendaDeModulos() {
  const tenant = typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;
  const q = useQuery({
    queryKey: ["modulos-adicionales", "tienda", tenant],
    queryFn: () => modulosAdicionalesService.tienda(),
    enabled: Boolean(tenant),
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });

  return { ...q, visible: tiendaVisible(q.data) };
}
