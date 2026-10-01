import { useQuery } from "@tanstack/react-query";

import { usePermissions } from "@/hooks/usePermissions";
import { gustoService } from "@/lib/api/gustoService";

/**
 * ¿Esta empresa tiene Gusto a mano? Lo usan el menú (Nómina › Gusto) y el botón
 * «Enviar a Gusto» de Registros de asistencia.
 *
 *  · `disponible`: empresa de EE. UU. con la integración configurada en la
 *    plataforma, y una persona que puede gestionarla.
 *  · `conectado`: además, ya enlazó su cuenta de Gusto.
 */
export function useGusto() {
  const { hasPermission } = usePermissions();
  const puede = hasPermission("payrollIntegrationManage");
  const tenant = typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;
  const q = useQuery({
    queryKey: ["gusto", "estado", tenant],
    queryFn: () => gustoService.estado(),
    enabled: Boolean(tenant) && puede,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const disponible = puede && !!q.data?.disponible && !!q.data?.configurado;

  return { ...q, disponible, conectado: disponible && !!q.data?.conectado };
}
