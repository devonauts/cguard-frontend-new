import { useEffect, useState } from "react";

/**
 * Returns a debounced copy of `value` that only updates after `delayMs` of
 * quiet. Use for search inputs so a list refetch fires once per typing burst
 * instead of on every keystroke.
 *
 *   const debounced = useDebouncedValue(searchQuery, 400);
 *   // ...use `debounced` in the fetch deps, not `searchQuery`.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);

    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}

export default useDebouncedValue;
