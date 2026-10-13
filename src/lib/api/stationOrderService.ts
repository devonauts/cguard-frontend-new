import { ApiService } from "@/services/api/apiService";

const tid = () => localStorage.getItem("tenantId") || "";

/** Station "consignas específicas" — recurring standing orders for a station. */
export const stationOrderService = {
  list: (stationId: string) =>
    ApiService.get(`/tenant/${tid()}/station/${stationId}/orders`),
  create: (stationId: string, data: Record<string, unknown>) =>
    ApiService.post(`/tenant/${tid()}/station/${stationId}/orders`, { data }),
  update: (stationId: string, id: string, data: Record<string, unknown>) =>
    ApiService.put(`/tenant/${tid()}/station/${stationId}/orders/${id}`, {
      data,
    }),
  remove: (stationId: string, id: string) =>
    ApiService.delete(`/tenant/${tid()}/station/${stationId}/orders/${id}`),
  /** Activity log: guard completions of this station's consignas (with evidence). */
  completions: (stationId: string) =>
    ApiService.get(`/tenant/${tid()}/station/${stationId}/order-completions`),
  /**
   * Bitácora: las novedades que dejan los vigilantes desde la app (abiertas,
   * cerradas o todas). El servidor ya la tenía; ninguna pantalla la pedía.
   */
  shiftNotes: (stationId: string, status: "abierta" | "cerrada" | "todas" = "todas") =>
    ApiService.get(`/tenant/${tid()}/station/${stationId}/shift-notes?status=${status}&limit=200`),
};

export default stationOrderService;
