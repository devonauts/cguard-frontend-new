/**
 * Reload the CRM after changing the brand or branch in the top bar.
 *
 * The offline cache (persistCache.ts) is keyed by tenant, not by the brand or
 * branch being viewed. Restoring it after the reload would paint the previous
 * selection's lists (e.g. only Brand B's clients under "All brands") until each
 * query refetched. Dropping it first makes the reload show fresh data.
 */
import { clearPersistedCache } from "@/lib/offline/persistCache";

export async function recargarSinCache(): Promise<void> {
  try {
    await clearPersistedCache();
  } catch {
    /* the reload still happens; at worst the old lists show until refetch */
  }
  window.location.reload();
}
