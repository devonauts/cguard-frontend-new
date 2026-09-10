import { useEffect, useState } from "react";

import api from "./api";

const API_BASE = (
  import.meta.env.VITE_API_URL ?? "http://localhost:3001/api"
).replace(/\/+$/, "");

/**
 * Build a displayable URL for a stored private file (e.g. the clock-in selfie).
 * The /file/download endpoint is consumed via <img src>, so no auth header is
 * attached by the browser. Pass-through for already-absolute URLs.
 *
 * SECURITY (backend contract): the /file/download endpoint authorizes the
 * request and now prefers an opaque, unforgeable `?fileToken=<AES-GCM>` over a
 * raw, guessable `?privateUrl=` (the IDOR we're closing). The backend attaches a
 * token-based `downloadUrl` to every serialized file object, so the UI should
 * always render `obj.downloadUrl` (or one fetched from `/tenant/:id/file/token`)
 * rather than a raw `privateUrl`. A kill-switch (FILE_DOWNLOAD_REQUIRE_TOKEN)
 * will eventually reject raw `?privateUrl=` requests.
 *
 * `fileUrlFromPrivate` is kept only for backward-compat / transitional fallback
 * (e.g. legacy payloads that carry just a raw privateUrl string). Prefer
 * `fileUrlFromFile(obj)` when you have the file object, or the `useFileUrl`
 * hook when you only have a raw privateUrl at a component's top level.
 */
export function fileUrlFromPrivate(privateUrl?: string | null): string | null {
  if (!privateUrl) return null;
  const u = String(privateUrl);

  if (/^https?:\/\//i.test(u)) return u;

  return `${API_BASE}/file/download?privateUrl=${encodeURIComponent(u)}`;
}

/** A serialized file object as returned by the backend (FileRepository). */
export type FileLike =
  | {
      /** Token-based, ready-to-use download URL (preferred). */
      downloadUrl?: string | null;
      /** Raw, guessable private URL (legacy / being phased out). */
      privateUrl?: string | null;
    }
  | null
  | undefined;

/**
 * Preferred, synchronous resolver: returns the object's token-based
 * `downloadUrl` if present, otherwise falls back to building a URL from the raw
 * `privateUrl` (transitional only).
 */
export function fileUrlFromFile(obj: FileLike): string | null {
  if (obj?.downloadUrl) return obj.downloadUrl;

  return fileUrlFromPrivate(obj?.privateUrl);
}

const getTenantId = (): string | null => {
  try {
    return localStorage.getItem("tenantId");
  } catch {
    return null;
  }
};

const isRawPrivateUrl = (u: string): boolean => u.includes("?privateUrl=");

// Module-level cache so repeated images for the same privateUrl don't refetch.
const tokenUrlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

async function fetchTokenUrl(rawPrivateUrl: string): Promise<string | null> {
  const cached = tokenUrlCache.get(rawPrivateUrl);

  if (cached) return cached;
  const pending = inflight.get(rawPrivateUrl);

  if (pending) return pending;

  const tenantId = getTenantId();

  if (!tenantId) return null;

  const p = (async () => {
    try {
      const resp = await api.get(
        `/tenant/${tenantId}/file/token?privateUrl=${encodeURIComponent(rawPrivateUrl)}`,
      );
      const body = resp?.data?.data !== undefined ? resp.data.data : resp?.data;
      const downloadUrl: string | null = body?.downloadUrl ?? null;

      if (downloadUrl) tokenUrlCache.set(rawPrivateUrl, downloadUrl);

      return downloadUrl;
    } catch {
      return null;
    } finally {
      inflight.delete(rawPrivateUrl);
    }
  })();

  inflight.set(rawPrivateUrl, p);

  return p;
}

/**
 * Resolve a displayable, token-based download URL for a private file.
 *
 * `source` may be a raw `privateUrl` string OR a serialized file object.
 * Resolution:
 *  - If the object already carries a token `downloadUrl` (one that does NOT
 *    contain "?privateUrl="), return it immediately — no fetch.
 *  - If the value is an absolute http(s) URL, return it as-is.
 *  - Otherwise (a raw privateUrl only), fetch a token once via the tenant-scoped
 *    `/tenant/:tenantId/file/token` endpoint, cache it, and return its
 *    `downloadUrl`. While loading, the raw URL is returned as a transitional
 *    fallback so images don't flash broken; on error the raw fallback stays.
 *
 * Must be called at a component's top level (React hooks rules).
 */
export function useFileUrl(source: FileLike | string): string | null {
  // Derive the immediate (possibly raw) URL synchronously.
  let immediate: string | null = null;
  let rawPrivateUrl: string | null = null;

  if (typeof source === "string") {
    if (!source) {
      immediate = null;
    } else if (/^https?:\/\//i.test(source)) {
      immediate = source;
    } else {
      rawPrivateUrl = source;
      immediate = fileUrlFromPrivate(source);
    }
  } else if (source?.downloadUrl && !isRawPrivateUrl(source.downloadUrl)) {
    // Already a token URL — use it directly.
    immediate = source.downloadUrl;
  } else if (source?.downloadUrl && /^https?:\/\//i.test(source.downloadUrl)) {
    immediate = source.downloadUrl;
  } else if (source?.privateUrl) {
    rawPrivateUrl = source.privateUrl;
    immediate = fileUrlFromPrivate(source.privateUrl);
  }

  // Si hay que resolver un token, NO se arranca con la URL cruda: tras el
  // blindaje IDOR una `?privateUrl=` sin sesión da 403 → imagen rota que parpadea
  // antes de cambiar al token. Se arranca en `null` (el consumidor muestra su
  // placeholder) y se pasa a la URL real cuando el token está listo. Si ya
  // teníamos un token cacheado, se usa de una.
  const startWith = rawPrivateUrl
    ? (tokenUrlCache.get(rawPrivateUrl) ?? null)
    : immediate;
  const [resolved, setResolved] = useState<string | null>(startWith);

  useEffect(() => {
    let active = true;

    if (!rawPrivateUrl) {
      setResolved(immediate);

      return;
    }
    const cached = tokenUrlCache.get(rawPrivateUrl);

    if (cached) {
      setResolved(cached);

      return;
    }
    // Sin token todavía: placeholder (null), no la URL cruda que da 403.
    setResolved(null);
    fetchTokenUrl(rawPrivateUrl).then((url) => {
      if (active && url) setResolved(url);
    });

    return () => {
      active = false;
    };
  }, [rawPrivateUrl, immediate]);

  return resolved;
}
