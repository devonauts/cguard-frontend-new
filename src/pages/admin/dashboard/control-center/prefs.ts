/** Preferencias de personalización del centro de mando.
 *
 * ANTES vivían SOLO en localStorage (el "BACKEND GAP" que documentaba este
 * archivo): se perdían al cambiar de navegador o de computadora. AHORA la fuente
 * de verdad es la CUENTA — `users.appearance.dashboards[tenantId]`, guardada con
 * el mismo PUT /auth/profile que el acento y el tema.
 *
 * localStorage se queda como CACHÉ DE PINTADO: `loadPrefs()` es síncrono porque
 * el tablero necesita pintar en el primer render; `hidratarDesdeLaCuenta()` llega
 * un instante después con lo que diga la cuenta y gana. */

import type { EntityKind, LiveStatus } from "./types";
import { guardarBloqueDeEmpresa, leerBloqueDeEmpresa, cambioLocalReciente } from "@/lib/appearanceSync";

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
    /* almacenamiento lleno o deshabilitado — la cuenta sigue siendo la verdad */
  }
  // …y a la cuenta, que es lo que hace que te siga a otra computadora.
  void guardarBloqueDeEmpresa("dashboards", p);
}

/**
 * Lo que la CUENTA tenga guardado para esta empresa, ya fusionado con los
 * valores por defecto. `null` si no hay sesión o nunca se personalizó nada:
 * en ese caso se queda lo que ya está pintado desde la caché.
 */
export async function hidratarDesdeLaCuenta(): Promise<DashboardPrefs | null> {
  try {
    // Cambio recién hecho aquí: la cuenta puede ir atrasada (ver appearanceSync).
    if (cambioLocalReciente()) return null;
    const guardado: any = await leerBloqueDeEmpresa("dashboards");
    if (!guardado) return null;
    const fusionado: DashboardPrefs = {
      ...DEFAULT_PREFS,
      ...guardado,
      pinColors: { ...DEFAULT_PREFS.pinColors, ...(guardado.pinColors || {}) },
      pinIcons: { ...DEFAULT_PREFS.pinIcons, ...(guardado.pinIcons || {}) },
      statusColors: { ...DEFAULT_PREFS.statusColors, ...(guardado.statusColors || {}) },
    };
    // Que la caché de este navegador quede al día para el próximo arranque.
    try { localStorage.setItem(keyFor(), JSON.stringify(fusionado)); } catch { /* nada */ }
    return fusionado;
  } catch {
    return null;
  }
}
