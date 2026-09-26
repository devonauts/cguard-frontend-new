import { idiomaElegido } from "@/lib/idiomaElegido";
import { getAuthToken } from "@/lib/api";
import { resolveApiBase } from "@/lib/apiBase";

/**
 * Opens the tenant SSE event stream.
 *
 * NOTE: events routes are mounted at `/api/:tenantId/events/*` (no `/tenant/`
 * segment), unlike the rest of the tenant API.
 *
 * SECURITY: EventSource cannot send headers, so the auth credential is passed in
 * the query string. Putting the long-lived session JWT in the URL leaks it into
 * server/proxy access logs, browser history, and Referer headers. The proper fix
 * is a backend-issued short-lived, single-purpose SSE ticket (or cookie-based
 * stream auth) — this helper centralizes the call site so that migration only
 * has to change here. Until the backend exposes a ticket endpoint, this falls
 * back to the session token. Stream URLs should be excluded from access logging.
 *
 * @returns the EventSource, or null if prerequisites (tenant/token/base) are missing.
 */
export function openEventStream(tenantId: string): EventSource | null {
  const token = getAuthToken() || localStorage.getItem("authToken") || "";
  const base = resolveApiBase() || "";

  if (!tenantId || !token || !base) return null;
  try {
    return new EventSource(
      `${base}/${encodeURIComponent(tenantId)}/events/stream?token=${encodeURIComponent(token)}&lang=${encodeURIComponent(idiomaElegido())}`,
    );
  } catch {
    // SSE unsupported in this environment.
    return null;
  }
}
