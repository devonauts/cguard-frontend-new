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
  status: "pending_payment" | "active" | "comp" | "revoked" | null;
  source: string | null;
  purchasedAt: string | null;
  owned: boolean;
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

export const modulosAdicionalesService = {
  tienda(): Promise<Tienda> {
    return ApiService.get(`/tenant/${tenantId()}/addons`);
  },
  comprar(key: string): Promise<ResultadoDeCompra> {
    return ApiService.post(`/tenant/${tenantId()}/addons/${key}/purchase`, {});
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

  return t.canPurchase || t.reason === "la_factura_el_socio";
}
