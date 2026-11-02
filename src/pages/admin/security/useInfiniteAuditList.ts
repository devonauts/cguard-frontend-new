import { useCallback, useEffect, useRef, useState } from "react";

import { ApiService } from "@/services/api/apiService";

type BuildParams = (offset: number, limit: number) => URLSearchParams;

interface Options<T> {
  /** Endpoint path (without query string), e.g. `/tenant/${tid}/audit-log`. */
  endpoint: string;
  /** Page size. */
  pageSize: number;
  /** Builds the per-request query params (limit/offset are passed in). */
  buildParams: BuildParams;
  /** Values that should trigger a reset + reload when they change. */
  deps: ReadonlyArray<unknown>;
  /** Optional side-effect run on every reset (e.g. collapse expanded row). */
  onReset?: () => void;
}

interface Result<T> {
  items: T[];
  total: number;
  loading: boolean;
  /** The last first-page load failed (the list is empty because of an error). */
  error: boolean;
  hasMore: boolean;
  load: (reset: boolean) => void;
  sentinelRef: React.MutableRefObject<HTMLDivElement | null>;
}

/**
 * Shared infinite-scroll + request-id-guarded fetch machinery used by the
 * audit/security list pages (SystemLogs, LoginHistory). Behaviour is identical
 * to the original per-page implementations: request-id guard against stale
 * responses, a loading-ref to prevent concurrent fetches, an IntersectionObserver
 * sentinel for pagination, and reset/reload on dependency change.
 */
export function useInfiniteAuditList<T>(opts: Options<T>): Result<T> {
  const { endpoint, pageSize, buildParams, deps, onReset } = opts;

  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const itemsRef = useRef<T[]>([]);
  const loadingRef = useRef(false);
  const reqIdRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Keep the latest buildParams without forcing `load` to change identity.
  const buildParamsRef = useRef(buildParams);

  buildParamsRef.current = buildParams;

  const load = useCallback(
    async (reset: boolean) => {
      if (loadingRef.current) return;
      if (!reset && itemsRef.current.length >= total && total > 0) return; // no more
      loadingRef.current = true;
      setLoading(true);
      const reqId = ++reqIdRef.current;

      const offset = reset ? 0 : itemsRef.current.length;
      const params = buildParamsRef.current(offset, pageSize);

      try {
        const r: any = await ApiService.get(`${endpoint}?${params.toString()}`);

        if (reqId !== reqIdRef.current) return; // a newer request superseded this one
        const rows: T[] = Array.isArray(r) ? r : (r?.rows ?? []);
        const count: number =
          typeof r?.count === "number" ? r.count : rows.length;

        setTotal(count);
        if (reset) setError(false);
        setItems((prev) => {
          const next = reset ? rows : [...prev, ...rows];

          itemsRef.current = next;

          return next;
        });
      } catch {
        if (reqId === reqIdRef.current && reset) {
          setError(true);
          setItems([]);
          itemsRef.current = [];
          setTotal(0);
        }
      } finally {
        // Only the CURRENT request may clear the shared flags — a superseded
        // response finishing late must not unblock/relabel the newer one.
        if (reqId === reqIdRef.current) {
          setLoading(false);
          loadingRef.current = false;
        }
      }
    },
    // `total` is read above; endpoint/pageSize are stable per page instance.
    [endpoint, pageSize, total],
  );

  // Reset + reload whenever the filters change.
  useEffect(() => {
    onReset?.();
    itemsRef.current = [];
    setItems([]);
    setTotal(0);
    // Supersede any in-flight page load (so its late response is dropped instead
    // of appending stale-filter rows) AND clear the in-flight guard so this
    // reset load isn't swallowed by `if (loadingRef.current) return`.
    reqIdRef.current++;
    loadingRef.current = false;
    load(true);
  }, deps);

  // Infinite scroll: load the next page when the sentinel comes into view.
  useEffect(() => {
    const el = sentinelRef.current;

    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) load(false);
      },
      { rootMargin: "300px" },
    );

    io.observe(el);

    return () => io.disconnect();
  }, [total]);

  const hasMore = items.length < total;

  return { items, total, loading, error, hasMore, load, sentinelRef };
}
