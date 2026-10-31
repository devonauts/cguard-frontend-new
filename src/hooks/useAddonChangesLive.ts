import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { crearSocket, cerrarSocket } from "@/lib/socket";
import { getAuthToken } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { announceAddonsChanged } from "@/lib/addonRequired";

/** The server's event when a company's add-on modules change (backend `lib/moduleAccessBus`). */
export const ADDONS_CHANGED_SOCKET_EVENT = "addons:changed";

/**
 * Keeps the menus in step with the company's add-on modules while the CRM is
 * open: when ANY admin switches a module off/on (or the platform gifts or
 * revokes one), every open session re-reads its profile — the features the
 * menus are built from — and the store, and the module gates forget a 402
 * they remembered.
 *
 * Only `addons:changed`, never `connect`: a reconnect does not mean anything
 * changed, and re-reading the profile on every reconnect would be pure load.
 * The socket is the shared one (`crearSocket` reference-counts it), so this
 * opens no extra connection. Mounted once, in the header.
 */
export function useAddonChangesLive(): void {
  const { refreshProfile } = useAuth();
  const qc = useQueryClient();
  const refreshRef = useRef(refreshProfile);

  refreshRef.current = refreshProfile;

  useEffect(() => {
    const tenantId = localStorage.getItem("tenantId") || "";

    if (!tenantId) return;
    const socket = crearSocket(getAuthToken() || "", tenantId);
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onChange = () => {
      if (timer) clearTimeout(timer);
      // A burst (several modules at once) is one refresh.
      timer = setTimeout(async () => {
        await refreshRef.current().catch(() => null);
        void qc.invalidateQueries({ queryKey: ["modulos-adicionales"] });
        void qc.invalidateQueries({ queryKey: ["dobletes"] });
        announceAddonsChanged();
      }, 400);
    };

    socket.on(ADDONS_CHANGED_SOCKET_EVENT, onChange);

    return () => {
      if (timer) clearTimeout(timer);
      socket.off(ADDONS_CHANGED_SOCKET_EVENT, onChange);
      cerrarSocket(socket);
    };
  }, [qc]);
}

export default useAddonChangesLive;
