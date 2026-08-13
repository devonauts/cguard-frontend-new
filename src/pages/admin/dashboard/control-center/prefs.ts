/** Dashboard customization preferences.
 *
 * BACKEND GAP: there is no per-tenant dashboard/map customization store. The
 * `settings` model only persists theme/logo. Until a JSON prefs column or a
 * `/tenant/:id/dashboard-prefs` endpoint exists, these persist to localStorage
 * (per tenant). `loadPrefs`/`savePrefs` are the single seam to swap for a real
 * backend later — see README in this folder. */

import type { EntityKind, LiveStatus } from "./types";

export interface DashboardPrefs {
  accent: string;                                   // dashboard accent (hex)
  mapTheme: "dark" | "night" | "roadmap";
  pinColors: Record<EntityKind, string>;
  pinIcons: Record<EntityKind, string>;             // lucide icon name
  statusColors: Record<LiveStatus, string>;
  liveTracking: boolean;
  locationIntervalSec: number;                       // map refresh interval
  // security operations (mirror ronda-settings where backend supports it)
  requirePhotoCheckpoint: boolean;
  requireGpsCheckpoint: boolean;
  requireQrRonda: boolean;
  geofenceRadius: number;
  lateCheckpointThresholdMin: number;
  offlineDeviceWarningMin: number;
  alertEscalationLevels: number;
  emergencyAutoNotify: boolean;
}

export const DEFAULT_PREFS: DashboardPrefs = {
  accent: "#d4a017",
  mapTheme: "dark",
  pinColors: {
    tenant: "#38bdf8",
    station: "#d4a017",
    supervisor: "#a855f7",
    guard: "#22c55e",
    incident: "#ef4444",
    client: "#94a3b8",
  },
  pinIcons: {
    tenant: "Building2",
    station: "Shield",
    supervisor: "UserCog",
    guard: "User",
    incident: "AlertTriangle",
    client: "Home",
  },
  statusColors: {
    online: "#22c55e",
    offline: "#64748b",
    patrol: "#38bdf8",
    incident: "#ef4444",
    delayed: "#f59e0b",
    emergency: "#e11d48",
  },
  liveTracking: true,
  locationIntervalSec: 15,
  requirePhotoCheckpoint: true,
  requireGpsCheckpoint: true,
  requireQrRonda: true,
  geofenceRadius: 100,
  lateCheckpointThresholdMin: 10,
  offlineDeviceWarningMin: 15,
  alertEscalationLevels: 3,
  emergencyAutoNotify: true,
};

const keyFor = () => `cc.dashboardPrefs.${localStorage.getItem("tenantId") || "default"}`;

export function loadPrefs(): DashboardPrefs {
  try {
    const raw = localStorage.getItem(keyFor());
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      pinColors: { ...DEFAULT_PREFS.pinColors, ...(parsed.pinColors || {}) },
      pinIcons: { ...DEFAULT_PREFS.pinIcons, ...(parsed.pinIcons || {}) },
      statusColors: { ...DEFAULT_PREFS.statusColors, ...(parsed.statusColors || {}) },
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(p: DashboardPrefs) {
  try {
    localStorage.setItem(keyFor(), JSON.stringify(p));
  } catch {
    /* storage full / disabled — ignore */
  }
}
