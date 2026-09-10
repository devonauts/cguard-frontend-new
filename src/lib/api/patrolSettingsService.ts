import api from "@/lib/api";

const tenantId = (): string => {
  const t = localStorage.getItem("tenantId");

  if (!t)
    throw new Error(
      "No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.",
    );

  return t;
};

export type GeofenceEnforcement = "strict" | "warning" | "disabled";
export type ClientNotifyMode =
  | "per_visit"
  | "route_completion"
  | "daily"
  | "never";

/** Espejo de `PatrolSettings` del servidor (patrolSettingsService.ts). */
export interface PatrolSettings {
  geofenceEnforcement: GeofenceEnforcement;
  allowGeofenceOverride: boolean;
  requireOverrideReason: boolean;
  arrivalRadiusM: number;
  approachingRadiusM: number;
  allowSkip: boolean;
  requireSkipReason: boolean;
  minPhotosPerVisit: number;
  allowGalleryPhotos: boolean;
  lateThresholdMin: number;
  criticalDelayMin: number;
  requireClockInToStart: boolean;
  allowSupervisorReorder: boolean;
  notifyOps: {
    routeStart: boolean;
    routeCompletion: boolean;
    stopSkipped: boolean;
    criticalFinding: boolean;
    lateRoute: boolean;
    missedStop: boolean;
    routeAborted: boolean;
  };
  clientNotify: ClientNotifyMode;
  clientVisiblePhotosDefault: boolean;
  clientVisibleInspectionDefault: boolean;
}

export const PATROL_DEFAULTS: PatrolSettings = {
  geofenceEnforcement: "warning",
  allowGeofenceOverride: true,
  requireOverrideReason: true,
  arrivalRadiusM: 250,
  approachingRadiusM: 500,
  allowSkip: true,
  requireSkipReason: true,
  minPhotosPerVisit: 0,
  allowGalleryPhotos: true,
  lateThresholdMin: 15,
  criticalDelayMin: 45,
  requireClockInToStart: true,
  allowSupervisorReorder: false,
  notifyOps: {
    routeStart: true,
    routeCompletion: true,
    stopSkipped: true,
    criticalFinding: true,
    lateRoute: true,
    missedStop: true,
    routeAborted: true,
  },
  clientNotify: "per_visit",
  clientVisiblePhotosDefault: true,
  clientVisibleInspectionDefault: true,
};

/**
 * Política de patrullaje de supervisión. Vive en `settings.patrol` (una
 * columna JSON de la fila de ajustes del tenant) y el servidor la sanea al
 * guardar — aquí sólo se lee y se manda.
 */
export const patrolSettingsService = {
  async get(): Promise<{ row: any; patrol: PatrolSettings }> {
    const { data } = await api.get<any>(`/tenant/${tenantId()}/settings`);
    const raw = data?.patrol;
    const parsed =
      typeof raw === "string"
        ? (() => {
            try {
              return JSON.parse(raw);
            } catch {
              return {};
            }
          })()
        : raw || {};

    return {
      row: data || {},
      patrol: {
        ...PATROL_DEFAULTS,
        ...parsed,
        notifyOps: {
          ...PATROL_DEFAULTS.notifyOps,
          ...(parsed?.notifyOps || {}),
        },
      },
    };
  },
  async save(row: any, patrol: PatrolSettings): Promise<void> {
    await api.put(`/tenant/${tenantId()}/settings`, {
      settings: {
        theme: row?.theme || "default",
        logos: row?.logos || [],
        backgroundImages: row?.backgroundImages || [],
        patrol,
      },
    });
  },
};

export default patrolSettingsService;
