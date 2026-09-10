import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";

import {
  useNotificationStream,
  type PlatformNotification,
} from "@/hooks/useNotificationStream";

/**
 * One socket.io subscription for the whole radio feature. Both the draggable
 * widget and the dispatch page read this context, so they share a single stream
 * (no double-connect). Any radio.* event bumps `version` (consumers re-fetch the
 * console/session) and is stashed as `lastEvent` (the widget shows a toast/chime).
 */
interface RadioRealtimeValue {
  version: number;
  lastEvent: PlatformNotification | null;
  connected: boolean;
}

const RadioRealtimeContext = createContext<RadioRealtimeValue>({
  version: 0,
  lastEvent: null,
  connected: false,
});

export function useRadioRealtime() {
  return useContext(RadioRealtimeContext);
}

const isRadioEvent = (n: PlatformNotification) =>
  typeof n?.eventType === "string" && n.eventType.startsWith("radio.");

export function RadioRealtimeProvider({
  tenantId,
  children,
}: {
  tenantId?: string | null;
  children: React.ReactNode;
}) {
  const [version, setVersion] = useState(0);
  const [lastEvent, setLastEvent] = useState<PlatformNotification | null>(null);
  const seen = useRef<Set<string>>(new Set());

  const onLive = useCallback((n: PlatformNotification) => {
    if (!isRadioEvent(n)) return;
    if (n.id && seen.current.has(n.id)) return;
    if (n.id) seen.current.add(n.id);
    setLastEvent(n);
    setVersion((v) => v + 1);
  }, []);

  const { connected } = useNotificationStream(tenantId, onLive);

  const value = useMemo(
    () => ({ version, lastEvent, connected }),
    [version, lastEvent, connected],
  );

  return (
    <RadioRealtimeContext.Provider value={value}>
      {children}
    </RadioRealtimeContext.Provider>
  );
}
