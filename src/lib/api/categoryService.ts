import api from "@/lib/api";
import { cachedFetch, invalidateEntity } from "@/lib/queryClient";

export type Category = {
  id: string;
  name: string;
  description?: string;
  module: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
};

export type CategoryInput = {
  name: string;
  description?: string;
  module: string;
};

let _tenantId: string | null = null;

export const setTenantId = (tenantId: string) => {
  _tenantId = tenantId;
  if (typeof window !== "undefined") {
    localStorage.setItem("tenantId", tenantId);
  }
};

export const getTenantId = (): string => {
  if (_tenantId) return _tenantId;

  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("tenantId");

    if (stored) {
      _tenantId = stored;

      return stored;
    }
  }

  throw new Error("TenantId not set. Please login first.");
};

class CategoryService {
  async create(data: CategoryInput): Promise<Category> {
    const tenantId = getTenantId();
    const response = await api.post(`/tenant/${tenantId}/category`, data);

    invalidateEntity("categories");

    return response.data;
  }

  async update(id: string, data: CategoryInput): Promise<Category> {
    const tenantId = getTenantId();
    const response = await api.put(`/tenant/${tenantId}/category/${id}`, data);

    invalidateEntity("categories");

    return response.data;
  }

  async delete(ids: string[]): Promise<void> {
    const tenantId = getTenantId();

    await api.delete(`/tenant/${tenantId}/category`, {
      params: { ids },
    });
    invalidateEntity("categories");
  }

  async findById(id: string): Promise<Category> {
    const tenantId = getTenantId();
    const response = await api.get(`/tenant/${tenantId}/category/${id}`);

    return response.data;
  }

  async list(params?: {
    filter?: {
      name?: string;
      module?: string;
    };
    limit?: number;
    offset?: number;
    orderBy?: string;
  }): Promise<{ rows: Category[]; count: number }> {
    const tenantId = getTenantId();

    // Reference data — rarely changes; cache 60s across all consumers.
    return cachedFetch(
      ["categories", tenantId, params ?? null],
      async () => {
        const response = await api.get(`/tenant/${tenantId}/category`, {
          params,
          toast: { silentError: true },
        });

        return response.data;
      },
      60_000,
    );
  }

  async autocomplete(
    query: string,
    limit = 10,
  ): Promise<Array<{ id: string; label: string }>> {
    const tenantId = getTenantId();
    const response = await api.get(
      `/tenant/${tenantId}/category/autocomplete`,
      {
        params: { query, limit },
      },
    );

    return response.data;
  }
}

export const categoryService = new CategoryService();
