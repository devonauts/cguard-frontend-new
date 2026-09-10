import { QueryClient } from "@tanstack/react-query";

/**
 * Shared react-query client for the CRM.
 *
 * The audit flagged that every navigation re-queried MySQL because the app had
 * no client cache and defaulted fetches to `cache:'no-store'`. react-query caches
 * resolved data in-memory, so re-visiting a page within `staleTime` serves
 * instantly with zero network — independent of the underlying fetch cache mode.
 *
 * Defaults chosen for an operations console (data changes, but not sub-second):
 *  · staleTime 30s   — re-navigating within 30s does NOT refetch.
 *  · gcTime 24h      — was 5m. El caché ahora se PERSISTE a IndexedDB para el
 *                      modo offline (lib/offline/persistCache.ts), y el
 *                      recolector borra de memoria Y del volcado: con 5m, a los
 *                      cinco minutos de no visitar una página su copia offline
 *                      desaparecía. 24h casa con el maxAge de la persistencia.
 *                      Coste en memoria: unos MB por jornada — irrelevante en
 *                      un desktop. staleTime no cambia: online se refresca igual
 *                      que siempre; gcTime solo decide cuánto se RETIENE.
 *  · refetchOnWindowFocus false — no refetch storm when tabbing back in.
 *  · retry 1         — one quiet retry; the fetch layer already retries GETs.
 * Real-time views (live map, alarms) can opt into their own short staleTime or
 * refetchInterval per-query.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/**
 * Transparent read-through cache for service-layer list methods. Wrapping a
 * service's list() in this makes EVERY page that calls it share one cached
 * result within `staleTime` — no page changes needed. Mutations must call
 * `invalidateEntity` so the next read refetches.
 *
 *   async list(f, p) { return cachedFetch(["clients", tid(), f, p], () => rawList(f, p)); }
 *   async create(x)  { const r = await rawCreate(x); invalidateEntity("clients"); return r; }
 */
export function cachedFetch<T>(
  queryKey: unknown[],
  queryFn: () => Promise<T>,
  staleTime = 20_000,
): Promise<T> {
  // retry:false so a wrapped read behaves exactly like the raw call on error
  // (the axios/fetch layer already handles transient retries + 401/402 redirects).
  return queryClient.fetchQuery({ queryKey, queryFn, staleTime, retry: false });
}

/** Invalidate every cached list for an entity (call after a create/update/delete). */
export function invalidateEntity(entity: string): void {
  queryClient.invalidateQueries({ queryKey: [entity] });
}

/**
 * Auto-invalidation for the read-through cache: EVERY successful mutating
 * request (from either http client — lib/api axios or ApiService fetch)
 * invalidates the cached entities its URL touches, so schedule/station/
 * client edits refresh everywhere immediately instead of serving a stale
 * copy for the rest of the staleTime window ("hice el cambio y sigue
 * mostrando lo viejo"). Pages using the raw clients directly are covered
 * without per-page invalidation calls.
 */
const URL_ENTITY_MAP: Array<[RegExp, string[]]> = [
  // Anything that reshapes stations, turnos, or coverage → stations cache
  // (the ["stations", …] keys back post-site AND station lists via stationService).
  [
    /\/(station|stations|post-site|business-info|auto-positions|positions|guard-assignment|guard-assignments|shift|shifts|shift-template|shift-exchange|schedule-overrides?|rotation-styles?|scheduler)(\/|\?|$)/,
    ["stations"],
  ],
  [/\/client-account(s)?(\/|\?|$)/, ["clients"]],
  [/\/category(\/|\?|$)/, ["categories"]],
];
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function autoInvalidateForMutation(
  method?: string | null,
  url?: string | null,
): void {
  if (!MUTATING.has(String(method || "").toUpperCase())) return;
  const u = String(url || "");

  for (const [re, entities] of URL_ENTITY_MAP) {
    if (re.test(u)) {
      for (const e of entities) invalidateEntity(e);
    }
  }
}
