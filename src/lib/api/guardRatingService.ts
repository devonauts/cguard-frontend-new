import api from "../api";
import { cachedFetch } from "@/lib/queryClient";

/**
 * CRM read of customer-generated guard ratings.
 *   GET /tenant/:tenantId/guard-ratings   query ?guardId=&limit=100
 * Returns { rows, count, average } scoped to the tenant.
 */

const getTenantId = (): string => {
  const t = localStorage.getItem("tenantId");

  if (!t)
    throw new Error(
      "No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.",
    );

  return t;
};

const buildQuery = (params?: Record<string, unknown>): string => {
  if (!params) return "";
  const p = new URLSearchParams();

  for (const k of Object.keys(params)) {
    const v = params[k];

    if (v !== undefined && v !== null && String(v).trim() !== "") {
      p.append(k, String(v));
    }
  }
  const s = p.toString();

  return s ? `?${s}` : "";
};

export interface GuardRatingRecord {
  id: string;
  guardId: string | null;
  guardName: string | null;
  clientAccountId: string | null;
  clientName: string | null;
  stationId: string | null;
  stationName: string | null;
  rating: number;
  comment: string | null;
  createdAt: string | null;
}

export interface GuardRatingListResult {
  rows: GuardRatingRecord[];
  count: number;
  average: number | null;
}

export interface GuardRatingSummary {
  average: number;
  count: number;
}

const guardRatingService = {
  async list(params?: {
    guardId?: string;
    limit?: number;
  }): Promise<GuardRatingListResult> {
    const tenantId = getTenantId();
    const qs = buildQuery(params);
    const resp = await api.get(`/tenant/${tenantId}/guard-ratings${qs}`);
    const payload = resp.data ?? resp;

    return {
      rows: Array.isArray(payload?.rows) ? payload.rows : [],
      count: payload?.count ?? 0,
      average: payload?.average ?? null,
    };
  },

  /**
   * Per-guard rating aggregates keyed by securityGuard.id, so any worker-detail
   * surface can show a review "level" in one round-trip. Pass the visible guard
   * ids (or none for all). Returns {} on failure (badges just don't render).
   */
  /**
   * Cacheado un minuto. Las reseñas las escribe el CLIENTE desde su app, no el
   * CRM: aquí no existe ninguna mutación que pueda dejar esto viejo desde
   * dentro, así que basta con el tiempo. Es una insignia de nivel junto al
   * nombre, no un dato operativo — que tarde un minuto en subir de 4,2 a 4,3
   * no le cambia el turno a nadie.
   */
  async summary(
    guardIds?: string[],
  ): Promise<Record<string, GuardRatingSummary>> {
    const tenantParaClave = (() => {
      try {
        return getTenantId();
      } catch {
        return "";
      }
    })();

    return cachedFetch(
      ["guard-ratings", tenantParaClave, guardIds?.slice().sort() ?? null],
      () => this._summarySinCache(guardIds),
      60_000,
    );
  },

  async _summarySinCache(
    guardIds?: string[],
  ): Promise<Record<string, GuardRatingSummary>> {
    try {
      const tenantId = getTenantId();
      const qs =
        guardIds && guardIds.length ? `?guardIds=${guardIds.join(",")}` : "";
      const resp = await api.get(
        `/tenant/${tenantId}/guard-ratings/summary${qs}`,
      );
      const payload = resp.data ?? resp;

      return payload?.summary && typeof payload.summary === "object"
        ? payload.summary
        : {};
    } catch {
      return {};
    }
  },
};

export default guardRatingService;
