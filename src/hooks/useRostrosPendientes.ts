import { useQuery } from "@tanstack/react-query";

import { useEntitlement } from "@/hooks/useEntitlement";
import { usePermissions } from "@/hooks/usePermissions";
import { rostrosService } from "@/lib/api/rostrosService";
import { MODULO_RECONOCIMIENTO_FACIAL } from "@/lib/rostro";

/**
 * Cuántas caras esperan aprobación — la cifra del menú «Caras registradas».
 * Sólo se pregunta con el módulo contratado y permiso de asistencia; sin eso
 * es 0 y no se hace ninguna petición. Cuelga de `["rostros"]`, así que aprobar
 * o rechazar desde cualquier pantalla la refresca.
 */
export function useRostrosPendientes(): number {
  const activo = useEntitlement(MODULO_RECONOCIMIENTO_FACIAL);
  const { hasPermission } = usePermissions();
  const tenant = typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;
  const q = useQuery({
    queryKey: ["rostros", "pendientes", tenant],
    queryFn: () => rostrosService.listar("pendiente"),
    enabled: activo && Boolean(tenant) && hasPermission("attendanceRead"),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: false,
  });

  return q.data?.pendientes ?? 0;
}
