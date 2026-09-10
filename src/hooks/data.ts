/**
 * Shared react-query data hooks for the CRM.
 *
 * These wrap the existing `*Service` functions so frequently-fetched reference
 * data (categories, clients, stations) is cached in-memory and shared across
 * pages instead of being re-queried on every mount/navigation. Adopt these in
 * place of ad-hoc `useState` + `useEffect(loadX)` blocks.
 *
 * Keys live in `qk` so mutations can invalidate precisely:
 *   queryClient.invalidateQueries({ queryKey: qk.categories("clientAccount") })
 */
import { useQuery } from "@tanstack/react-query";

import { categoryService } from "@/lib/api/categoryService";
import { clientService } from "@/lib/api/clientService";

const tenantId = () => localStorage.getItem("tenantId") || "";

export const qk = {
  categories: (module: string) => ["categories", tenantId(), module] as const,
  clients: (filters?: unknown, pagination?: unknown) =>
    ["clients", tenantId(), filters ?? null, pagination ?? null] as const,
  stations: (params?: unknown) =>
    ["stations", tenantId(), params ?? null] as const,
};

/** Category list for a module (e.g. "clientAccount"), cached per tenant. */
export function useCategories(module: string, enabled = true) {
  return useQuery({
    queryKey: qk.categories(module),
    queryFn: async () => {
      const data = await categoryService.list({
        filter: { module },
        limit: 1000,
      });

      return (data?.rows || []) as any[];
    },
    enabled: enabled && !!tenantId(),
    // Reference data — comfortably stale for a couple minutes.
    staleTime: 2 * 60_000,
  });
}

/** Paginated client list, cached by (filters, pagination). */
export function useClients(
  filters?: Record<string, any>,
  pagination?: Record<string, any>,
  enabled = true,
) {
  return useQuery({
    queryKey: qk.clients(filters, pagination),
    queryFn: () =>
      clientService.getClients(
        (filters || {}) as any,
        (pagination || {}) as any,
      ),
    enabled: enabled && !!tenantId(),
  });
}
