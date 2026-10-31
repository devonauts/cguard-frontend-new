import { ApiService } from "@/services/api/apiService";

/**
 * MÓDULOS ADICIONALES — lo que la empresa compra aparte, con un pago único.
 * Backend: `api/modulosAdicionales` (GET /addons, POST /addons/:key/purchase).
 */
const tenantId = (): string => {
  const t = localStorage.getItem("tenantId");

  if (!t) throw new Error("tenant");

  return t;
};

export interface ModuloEnTienda {
  key: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  status: "pending_payment" | "active" | "comp" | "revoked" | "trial" | "expired" | "canceled" | null;
  source: string | null;
  purchasedAt: string | null;
  owned: boolean;
  /** One-time modules: the company switched it off (still theirs). */
  paused?: boolean;
  pausedAt?: string | null;
  /** Who switched it off (name), when known. */
  pausedBy?: string | null;
  /** One-time modules: the company holds it now and may switch it off/on. */
  canToggle?: boolean;
  /** Sólo los mensuales (VigIA Pro): precio fijo por tamaño. */
  billingType?: "one_time" | "monthly_tiers";
  tiers?: Array<{ maxGuards: number; priceCents: number }>;
  activeGuards?: number;
  currentTier?: { maxGuards: number; priceCents: number } | null;
  exceedsTopTier?: boolean;
  monthlyCents?: number | null;
  yearlyCents?: number | null;
  annualMonthsFree?: number;
  trialDays?: number;
  canStartTrial?: boolean;
  trialDaysLeft?: number;
  trialEndsAt?: string | null;
  autoRenew?: boolean;
  interval?: "month" | "year" | null;
  periodEndsAt?: string | null;
  cancelAtPeriodEnd?: boolean;
  hasAccess?: boolean;
}

export interface Tienda {
  canPurchase: boolean;
  reason: string | null;
  modules: ModuloEnTienda[];
}

export interface ResultadoDeCompra {
  estado: "active" | "comp" | "pending_payment";
  yaLoTenia?: boolean;
  enlaceDePago?: string | null;
  motivoPendiente?: string | null;
}

/** Answer of /pause and /resume (backend `pausaDeModulo`). */
export interface ResultadoDePausa {
  key: string;
  paused: boolean;
  pausedAt: string | null;
  changed: boolean;
  hasAccess: boolean;
}

export const modulosAdicionalesService = {
  tienda(): Promise<Tienda> {
    return ApiService.get(`/tenant/${tenantId()}/addons`);
  },
  comprar(key: string): Promise<ResultadoDeCompra> {
    return ApiService.post(`/tenant/${tenantId()}/addons/${key}/purchase`, {});
  },
  /** Módulo mensual: 30 días gratis, una vez por empresa. */
  probar(key: string): Promise<ModuloEnTienda> {
    return ApiService.post(`/tenant/${tenantId()}/addons/${key}/trial`, {});
  },
  /** Módulo mensual: elegir pago (en prueba, se cobra al vencer). */
  suscribir(key: string, interval: "month" | "year"): Promise<{ estado: string; enlaceDePago?: string | null; seCobraEl?: string; aviso?: string }> {
    return ApiService.post(`/tenant/${tenantId()}/addons/${key}/subscribe`, { interval });
  },
  /** Pago único: apagarlo (no se borra nada; sus menús desaparecen). */
  apagar(key: string): Promise<ResultadoDePausa> {
    return ApiService.post(`/tenant/${tenantId()}/addons/${key}/pause`, {});
  },
  /** Pago único: volver a encenderlo. Nunca cobra. */
  encender(key: string): Promise<ResultadoDePausa> {
    return ApiService.post(`/tenant/${tenantId()}/addons/${key}/resume`, {});
  },
  /** Módulo mensual: deja de renovarse; sigue hasta el fin de lo pagado. */
  cancelar(key: string): Promise<{ estado: string; hasta?: string }> {
    return ApiService.post(`/tenant/${tenantId()}/addons/${key}/cancel`, {});
  },
};

/**
 * ¿Se enseña «Módulos adicionales» en el menú? Sólo si hay algo que enseñar
 * (algún módulo a la venta o ya suyo) y la empresa puede comprar — o la
 * factura su distribuidor, que es quien se lo activa.
 */
export function tiendaVisible(t: Tienda | null | undefined): boolean {
  if (!t || !t.modules.length) return false;
  if (t.modules.some((m) => m.owned || m.status === "pending_payment")) return true;
  /* Una PRUEBA gratis se ofrece aunque la empresa aún no pueda comprar (está en
     su periodo de prueba, la mayoría): es justo cuando hay que enseñársela. */
  if (t.modules.some((m) => m.canStartTrial || m.status === "trial")) return true;

  return t.canPurchase || t.reason === "la_factura_el_socio";
}
