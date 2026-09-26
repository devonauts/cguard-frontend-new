import i18n from "@/i18n";
import { ItemCondition, InventoryItem } from "./inventoryItemService";

import api from "@/lib/api";

const getTenantId = (): string => {
  const t = localStorage.getItem("tenantId");

  if (!t)
    throw new Error(
      i18n.t(
        "ui.apiService.noPudimosIdentificarTuEmpresa",
        "No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.",
      ),
    );

  return t;
};

export interface InventoryAssignment {
  id: string;
  inventoryItemId: string;
  inventoryItem?: InventoryItem;
  stationId?: string;
  station?: { id: string; stationName?: string; name?: string };
  postSiteId?: string;
  assignedToUserId?: string;
  assignedTo?: {
    id: string;
    fullName?: string;
    firstName?: string;
    lastName?: string;
    governmentId?: string;
  };
  assignedAt: string;
  returnedAt?: string;
  conditionAtCheckout?: ItemCondition;
  conditionAtReturn?: ItemCondition;
  notes?: string;
  returnNotes?: string;
  createdAt?: string;
}

export interface InventoryAssignmentInput {
  inventoryItemId: string;
  stationId?: string;
  postSiteId?: string;
  assignedToUserId?: string;
  assignedAt?: string;
  returnedAt?: string;
  conditionAtCheckout?: ItemCondition;
  conditionAtReturn?: ItemCondition;
  notes?: string;
  returnNotes?: string;
}

const inventoryAssignmentService = {
  async list(
    params: {
      filter?: Record<string, unknown>;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ rows: InventoryAssignment[]; count: number }> {
    const tenantId = getTenantId();
    const query = new URLSearchParams();

    if (params.limit != null) query.append("limit", String(params.limit));
    if (params.offset != null) query.append("offset", String(params.offset));
    const f = params.filter || {};

    Object.entries(f).forEach(([k, v]) => {
      if (v != null && v !== "") query.append(`filter[${k}]`, String(v));
    });
    const { data } = await api.get(
      `/tenant/${tenantId}/inventory-assignment?${query.toString()}`,
    );

    return data;
  },

  async create(
    payload: InventoryAssignmentInput,
  ): Promise<InventoryAssignment> {
    const tenantId = getTenantId();
    const { data } = await api.post(
      `/tenant/${tenantId}/inventory-assignment`,
      { data: payload },
    );

    return data;
  },

  async update(
    id: string,
    payload: Partial<InventoryAssignmentInput>,
  ): Promise<InventoryAssignment> {
    const tenantId = getTenantId();
    const { data } = await api.put(
      `/tenant/${tenantId}/inventory-assignment/${id}`,
      { data: payload },
    );

    return data;
  },

  async delete(ids: string[]): Promise<void> {
    const tenantId = getTenantId();

    await api.delete(`/tenant/${tenantId}/inventory-assignment`, {
      data: { ids },
    });
  },

  async returnItem(
    id: string,
    payload: {
      returnedAt?: string;
      conditionAtReturn?: ItemCondition;
      returnNotes?: string;
    },
  ): Promise<InventoryAssignment> {
    const tenantId = getTenantId();
    const { data } = await api.patch(
      `/tenant/${tenantId}/inventory-assignment/${id}`,
      {
        data: {
          ...payload,
          returnedAt: payload.returnedAt || new Date().toISOString(),
        },
      },
    );

    return data;
  },
};

export default inventoryAssignmentService;
