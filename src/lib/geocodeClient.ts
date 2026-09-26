import { resolveApiBase } from "@/lib/apiBase";

const API_BASE = (
  resolveApiBase() ?? "http://localhost:3001/api"
).replace(/\/+$/, "");

export async function reverseGeocode(
  lat: number | string,
  lon: number | string,
  opts: Record<string, any> = {},
) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    ...opts,
  });
  const url = `${API_BASE}/geocode/reverse?${params.toString()}`;
  const res = await fetch(url, { credentials: "include" });

  if (!res.ok) throw new Error(`Reverse geocode failed: ${res.status}`);

  return res.json();
}

export async function searchGeocode(q: string, opts: Record<string, any> = {}) {
  const params = new URLSearchParams({ q, ...opts });
  const url = `${API_BASE}/geocode/search?${params.toString()}`;
  const res = await fetch(url, { credentials: "include" });

  if (!res.ok) throw new Error(`Search geocode failed: ${res.status}`);

  return res.json();
}

export default { reverseGeocode, searchGeocode };
