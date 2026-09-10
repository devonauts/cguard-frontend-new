import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DependencyList,
} from "react";

/**
 * One place for the load/race/unmount/debounce handling that every CRM list &
 * detail page was re-implementing by hand (and getting subtly wrong — stale
 * responses overwriting newer ones, setState-after-unmount, fetch-per-keystroke,
 * stale data left on screen after a param change).
 *
 * Guarantees:
 *  · **Latest wins** — a monotonic request id drops any earlier response that
 *    resolves late, so overlapping loads never clobber the newest state.
 *  · **No setState after unmount** — a mounted ref gates every state write.
 *  · **Debounce** — `debounceMs` delays the fetch and cancels the pending one on
 *    a fast dep change (e.g. typing in a search box → one request, not N).
 *  · **enabled gate** — skip fetching until ready (e.g. tenantId present).
 *  · **refetch()** — imperative reload without changing deps.
 *
 * The `fetcher` closes over the page's own params; pass the values that should
 * trigger a reload as `deps` (like useEffect). The fetcher itself is read from a
 * ref, so it may be an inline closure without causing extra reloads.
 *
 *   const { data, loading, error, refetch } = useAsyncList(
 *     () => clientService.getClients(filters, { limit, offset }),
 *     [filters, limit, offset],
 *     { debounceMs: 300, enabled: !!tenantId },
 *   );
 */
export interface UseAsyncListOptions<T> {
  /** Skip fetching while false (data/loading stay at their current values). */
  enabled?: boolean;
  /** Delay the fetch by N ms and cancel a pending one on a fast dep change. */
  debounceMs?: number;
  /** Value used before the first successful load. */
  initialData?: T;
  /** Called with the error of the LATEST failed request (superseded ones are ignored). */
  onError?: (error: unknown) => void;
}

export interface UseAsyncListResult<T> {
  data: T | undefined;
  loading: boolean;
  error: unknown;
  /** Reload now (ignores debounce). */
  refetch: () => void;
  /** Optimistic/local update of the data without a fetch. */
  setData: React.Dispatch<React.SetStateAction<T | undefined>>;
}

export function useAsyncList<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList,
  opts: UseAsyncListOptions<T> = {},
): UseAsyncListResult<T> {
  const { enabled = true, debounceMs = 0, initialData, onError } = opts;

  const [data, setData] = useState<T | undefined>(initialData);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<unknown>(null);

  // Read the latest fetcher/onError from refs so an inline closure doesn't force
  // extra reloads — reload cadence is driven only by `deps`/enabled/refetch.
  const fetcherRef = useRef(fetcher);

  fetcherRef.current = fetcher;
  const onErrorRef = useRef(onError);

  onErrorRef.current = onError;

  const seqRef = useRef(0);
  const mountedRef = useRef(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const run = () => {
      const mine = ++seqRef.current;

      setLoading(true);
      setError(null);
      // Promise.resolve().then so a fetcher that throws synchronously is caught.
      Promise.resolve()
        .then(() => fetcherRef.current())
        .then((res) => {
          if (!mountedRef.current || mine !== seqRef.current) return;
          setData(res);
          setLoading(false);
        })
        .catch((e) => {
          if (!mountedRef.current || mine !== seqRef.current) return;
          setError(e);
          setLoading(false);
          onErrorRef.current?.(e);
        });
    };

    if (debounceMs > 0) {
      const t = setTimeout(run, debounceMs);

      return () => clearTimeout(t); // fast dep change cancels the pending fetch
    }
    run();

    return undefined;
  }, [...deps, enabled, debounceMs, nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  return { data, loading, error, refetch, setData };
}

export default useAsyncList;
