/**
 * The desktop program, seen from the CRM: the company's approved computers and
 * the installer downloads. Contract: «CGuard Pro desktop program» (2026-10-31).
 *
 *   GET  /tenant/:tenantId/desktop-devices            → the computers
 *   POST /tenant/:tenantId/desktop-devices/:id/approve
 *   POST /tenant/:tenantId/desktop-devices/:id/reject
 *   POST /tenant/:tenantId/desktop-devices/:id/revoke
 *   GET  /desktop/downloads                           → what can be downloaded
 *   POST /desktop/downloads/link {platform, arch}     → {url} (10 min)
 *
 * The server decides who may see and do what (admins: every computer; anyone:
 * their own). The CRM only paints it; responses are normalised here so the
 * screens never deal with shapes.
 */
import { resolveApiBase } from "@/lib/apiBase";
import { ApiService } from "@/services/api/apiService";

export type DesktopDeviceStatus =
  "pending" | "approved" | "rejected" | "revoked";

export interface DesktopDevice {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  deviceId: string;
  /** The computer's name (as the OS calls it). */
  name: string | null;
  platform: string | null;
  arch: string | null;
  osVersion: string | null;
  appVersion: string | null;
  status: DesktopDeviceStatus;
  pairingCode: string | null;
  requestedAt: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  revokedAt: string | null;
  lastSeenAt: string | null;
  lastIp: string | null;
  lastAppVersion: string | null;
}

export interface DesktopDeviceList {
  devices: DesktopDevice[];
  /** The server says this person may approve/reject/revoke anyone's. */
  canManage: boolean | null;
}

export type DesktopPlatform = "darwin" | "win32";
export type DesktopArch = "arm64" | "x64";

export interface DesktopDownload {
  platform: DesktopPlatform;
  arch: DesktopArch;
  version: string | null;
  size: number | null;
  available: boolean;
}

/** The realtime event the API emits to the tenant when any row changes. */
export const DESKTOP_DEVICES_EVENT = "desktopDevices:changed";

const ESTADOS: DesktopDeviceStatus[] = [
  "pending",
  "approved",
  "rejected",
  "revoked",
];

const texto = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

function nombreDePersona(u: any): string | null {
  if (!u || typeof u !== "object") return null;
  const completo =
    texto(u.fullName) ||
    texto([u.firstName, u.lastName].filter(Boolean).join(" ")) ||
    texto(u.name);

  return completo;
}

/** One row as the server sends it → the shape the screens use. */
export function normalizarDispositivo(r: any): DesktopDevice | null {
  if (!r || typeof r !== "object") return null;
  const id = texto(r.id);

  if (!id) return null;
  const estado = ESTADOS.includes(r.status)
    ? (r.status as DesktopDeviceStatus)
    : "pending";
  const usuario = r.user && typeof r.user === "object" ? r.user : null;

  return {
    id,
    userId: String(r.userId ?? usuario?.id ?? ""),
    userName: texto(r.userName) || nombreDePersona(usuario),
    userEmail: texto(r.userEmail) || texto(usuario?.email),
    deviceId: String(r.deviceId ?? ""),
    name: texto(r.name),
    platform: texto(r.platform),
    arch: texto(r.arch),
    osVersion: texto(r.osVersion),
    appVersion: texto(r.appVersion),
    status: estado,
    pairingCode: texto(r.pairingCode),
    requestedAt: texto(r.requestedAt) || texto(r.createdAt),
    decidedAt: texto(r.decidedAt),
    decidedByName:
      texto(r.decidedByName) || nombreDePersona(r.decidedBy) || null,
    revokedAt: texto(r.revokedAt),
    lastSeenAt: texto(r.lastSeenAt),
    lastIp: texto(r.lastIp),
    lastAppVersion: texto(r.lastAppVersion),
  };
}

/** Accepts `[...]`, `{rows}`, `{devices}` or `{data}`; keeps `canManage`. */
export function normalizarLista(resp: any): DesktopDeviceList {
  const filas = Array.isArray(resp)
    ? resp
    : Array.isArray(resp?.rows)
      ? resp.rows
      : Array.isArray(resp?.devices)
        ? resp.devices
        : Array.isArray(resp?.data)
          ? resp.data
          : [];
  const canManage =
    resp && !Array.isArray(resp) && typeof resp.canManage === "boolean"
      ? resp.canManage
      : null;

  return {
    devices: filas
      .map(normalizarDispositivo)
      .filter((d: DesktopDevice | null): d is DesktopDevice => !!d),
    canManage,
  };
}

/** Accepts `[...]` or `{downloads}`/`{rows}`; drops anything unknown. */
export function normalizarDescargas(resp: any): DesktopDownload[] {
  const filas: any[] = Array.isArray(resp)
    ? resp
    : Array.isArray(resp?.downloads)
      ? resp.downloads
      : Array.isArray(resp?.rows)
        ? resp.rows
        : [];

  return filas
    .filter(
      (r) =>
        r &&
        (r.platform === "darwin" || r.platform === "win32") &&
        (r.arch === "arm64" || r.arch === "x64"),
    )
    .map((r) => ({
      platform: r.platform,
      arch: r.arch,
      version: texto(r.version),
      size:
        Number.isFinite(Number(r.size)) && Number(r.size) > 0
          ? Number(r.size)
          : null,
      available: r.available === true,
    }));
}

/**
 * The server's link may be absolute or a path on the API host
 * (`/api/public/desktop/download?t=…`). Only http(s) is ever followed.
 */
export function urlDeDescarga(
  url: unknown,
  apiBase: string = resolveApiBase() || "",
  pagina: string = typeof window !== "undefined" ? window.location.origin : "",
): string | null {
  const u = texto(url);

  if (!u) return null;
  try {
    const origen = new URL(apiBase || pagina, pagina || undefined).origin;
    const final = new URL(u, origen);

    return /^https?:$/.test(final.protocol) ? final.toString() : null;
  } catch {
    return null;
  }
}

const enc = encodeURIComponent;

export const desktopService = {
  async list(tenantId: string): Promise<DesktopDeviceList> {
    return normalizarLista(
      await ApiService.get(`/tenant/${enc(tenantId)}/desktop-devices`),
    );
  },
  approve(tenantId: string, id: string) {
    return ApiService.post(
      `/tenant/${enc(tenantId)}/desktop-devices/${enc(id)}/approve`,
      {},
    );
  },
  reject(tenantId: string, id: string) {
    return ApiService.post(
      `/tenant/${enc(tenantId)}/desktop-devices/${enc(id)}/reject`,
      {},
    );
  },
  revoke(tenantId: string, id: string) {
    return ApiService.post(
      `/tenant/${enc(tenantId)}/desktop-devices/${enc(id)}/revoke`,
      {},
    );
  },
  async downloads(): Promise<DesktopDownload[]> {
    return normalizarDescargas(await ApiService.get("/desktop/downloads"));
  },
  async downloadLink(
    platform: DesktopPlatform,
    arch: DesktopArch,
  ): Promise<string | null> {
    const r: any = await ApiService.post("/desktop/downloads/link", {
      platform,
      arch,
    });

    return urlDeDescarga(r?.url);
  },
};
