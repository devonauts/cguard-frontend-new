/** Types for the Control Center. Where the backend response shape is loose
 *  (the /dashboard/stats handler returns plain objects), these mirror it. */
import type { MapCenter } from "./defaultCenter";

export type EntityKind = "tenant" | "station" | "supervisor" | "guard" | "incident" | "client";
export type LiveStatus =
  | "online" | "offline" | "patrol" | "incident" | "delayed" | "emergency";

/**
 * Lo que el mapa de operaciones necesita saber de una entidad MÁS ALLÁ de su
 * coordenada: es lo que rellena el globo al pulsar y lo que decide a qué ficha
 * lleva el botón. Todo opcional —cada origen aporta lo que tiene— y con firma de
 * índice para que siga siendo asignable a `Record<string, unknown>`.
 *
 * Nada de esto cuesta una petición extra: sale de las MISMAS respuestas que ya
 * pide `useControlCenter` para las cifras.
 */
export interface MapEntityMeta {
  /** Color impuesto por el origen (modo demostración). Gana a todo. */
  color?: string;
  /** Identificador crudo, sin el prefijo del id del mapa — para las rutas. */
  entityId?: string;

  // ── Puestos y sedes ──
  geofenceRadius?: number;
  geofencePolygon?: Array<{ lat: number; lng: number }>;
  /** Un puesto móvil (base de patrullaje) no tiene geocerca que dibujar. */
  isMobile?: boolean;
  postSiteId?: string;
  postSiteName?: string;
  clientId?: string;
  clientName?: string;
  /** Vigilantes ASIGNADOS al puesto (plantilla), no los que hay ahora. */
  guardsCount?: number;

  // ── Clientes ──
  stationsCount?: number;
  riskLevel?: string;
  city?: string;
  /** Sedes agrupadas bajo esta chincheta (racimo de cliente). */
  sitesCount?: number;

  // ── Personas ──
  userId?: string;
  phone?: string;
  address?: string;
  photoUrl?: string;
  zone?: string;
  vehicle?: string;
  battery?: number;
  speed?: number;
  accuracy?: number;
  /** Momento del último dato de posición conocido (ISO). */
  lastSeenAt?: string;
  punchInTime?: string;
  onDutySince?: string;
  dutyLateMinutes?: number;
  stationName?: string;

  [k: string]: unknown;
}

export interface MapEntity {
  id: string;
  kind: EntityKind;
  lat: number;
  lng: number;
  label: string;
  sub?: string;
  status: LiveStatus;
  meta?: MapEntityMeta;
}

export interface MonthPoint { month: string; value: number; }

export interface Kpi {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  /** -1..1 trend hint, or null when unknown */
  trend?: number | null;
  status?: LiveStatus | "neutral";
  /** true when value is a documented fallback (no backend source yet) */
  fallback?: boolean;
  hint?: string;
  /** Destination route when the card is clicked (see ./navigation). */
  to?: string;
  /** Short contextual line under the value (e.g. "de 24 puestos"). */
  sub?: string;
  /** Optional mini series for the trailing sparkline. */
  spark?: number[];
}

export interface RevenueSeries {
  points: MonthPoint[];
  total: number;
  paid: number;
  pending: number;
  currency: string;
  hasData: boolean;
}

export interface ActivityItem {
  id: string;
  kind: "incident" | "checkin" | "patrol" | "alert" | "system" | "event";
  title: string;
  sub?: string;
  at: string; // ISO
  status?: LiveStatus;
  /** Explicit destination (e.g. a specific incident); falls back to the
   *  kind's default list route when absent (see ./navigation). */
  to?: string;
}

/** Raw shape of GET /tenant/:id/dashboard/stats */
export interface DashboardStats {
  clientAcquisition?: Array<{ month: string; count: number }>;
  incidentTypes?: Array<{ type?: string; wasRead?: boolean; count?: number }>;
  revenue?: Array<{ month: string; revenue: number }>;
  clientPortfolio?: Array<{ type: string; count: number }>;
  serviceRevenue?: Array<{ service?: string; revenue: number }>;
  guardPerformance?: Record<string, unknown>;
  securityPerformance?: Array<{ month: string; incidents: number; responseTime: number }>;
  customerSatisfaction?: Array<{ month: string; satisfaction: number; quality: number }>;
}

export interface ControlCenterData {
  kpis: Kpi[];
  entities: MapEntity[];
  /** Resolved default map center (company → address → IP country → fallback). */
  defaultCenter?: MapCenter;
  revenue: RevenueSeries;
  incidentsTrend: MonthPoint[];
  responseTrend: MonthPoint[];
  acquisitionTrend: MonthPoint[];
  activity: ActivityItem[];
  health: { sseConnected: boolean; onlineDevices: number; lastSync: string };
  counts: Record<string, number>;
  loading: boolean;
  error: string | null;
  gaps: string[];
}
