import { useQuery } from "@tanstack/react-query";

import { addonOwnershipOf, type AddonOwnership } from "@/lib/addonOwnership";
import { modulosAdicionalesService } from "@/lib/api/modulosAdicionalesService";

/**
 * Whether the company owns the add-on `key` and switched it off (see
 * `addonOwnershipOf`).
 *
 * Reads the store list under the SAME query key as `useTiendaDeModulos` (the
 * sidebar and header keep it warm, and `useAddonChangesLive` invalidates it on
 * `addons:changed`), so in practice it adds no request. Whoever cannot read
 * the store (403) gets «not owned», i.e. the usual presentation.
 */
export function useAddonOwnership(key: string): AddonOwnership {
  const tenant = typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;
  const store = useQuery({
    queryKey: ["modulos-adicionales", "tienda", tenant],
    queryFn: () => modulosAdicionalesService.tienda(),
    enabled: Boolean(tenant),
    staleTime: 60_000,
    retry: false,
  });

  return addonOwnershipOf(store.data, key, Boolean(tenant) && store.isLoading);
}
