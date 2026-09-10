import api from "@/lib/api";

export interface ClientProject {
  id: string;
  tenantId: string;
  clientAccountId: string;
  businessInfoId?: string;
  name: string;
  type: string;
  description?: string;
  status: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  estimatedHours?: number;
  assignedGuards?: any[];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  clientAccount?: {
    id: string;
    name: string;
    lastName?: string;
    commercialName?: string;
  };
}

export interface ProjectFilters {
  type?: string;
  status?: string;
  name?: string;
  clientAccountId?: string;
}

export interface ProjectListResponse {
  rows: ClientProject[];
  count: number;
}

let globalTenantId: string | null = null;

export const setProjectTenantId = (id: string) => {
  globalTenantId = id;
};

const getTenantId = (): string => {
  if (globalTenantId) return globalTenantId;
  const local = localStorage.getItem("tenantId");

  if (local) return local;
  throw new Error("tenantId not set");
};

export const projectService = {
  async list(
    filters: ProjectFilters = {},
    options = { limit: 25, offset: 0 },
  ): Promise<ProjectListResponse> {
    const tenantId = getTenantId();
    const params = new URLSearchParams();

    if (filters.name) params.append("filter[name]", filters.name);
    if (filters.type) params.append("filter[type]", filters.type);
    if (filters.status) params.append("filter[status]", filters.status);
    if (filters.clientAccountId)
      params.append("filter[clientAccountId]", filters.clientAccountId);
    params.append("limit", options.limit.toString());
    params.append("offset", options.offset.toString());
    const { data } = await api.get(
      `/tenant/${tenantId}/client-project?${params.toString()}`,
      {
        toast: { silentError: true },
      },
    );

    return data;
  },

  async listByClient(
    clientId: string,
    filters: Omit<ProjectFilters, "clientAccountId"> = {},
    options = { limit: 100, offset: 0 },
  ): Promise<ProjectListResponse> {
    const tenantId = getTenantId();
    const params = new URLSearchParams();

    if (filters.name) params.append("filter[name]", filters.name);
    if (filters.type) params.append("filter[type]", filters.type);
    if (filters.status) params.append("filter[status]", filters.status);
    params.append("limit", options.limit.toString());
    params.append("offset", options.offset.toString());
    const { data } = await api.get(
      `/tenant/${tenantId}/client-account/${clientId}/projects?${params.toString()}`,
      { toast: { silentError: true } },
    );

    return data;
  },

  async get(id: string): Promise<ClientProject> {
    const tenantId = getTenantId();
    const { data } = await api.get(`/tenant/${tenantId}/client-project/${id}`, {
      toast: { silentError: true },
    });

    return data;
  },

  async create(
    payload: Partial<ClientProject> & { clientAccountId: string; name: string },
  ): Promise<ClientProject> {
    const tenantId = getTenantId();
    const { data } = await api.post(
      `/tenant/${tenantId}/client-project`,
      payload,
    );

    return data;
  },

  async update(
    id: string,
    payload: Partial<ClientProject>,
  ): Promise<ClientProject> {
    const tenantId = getTenantId();
    const { data } = await api.put(
      `/tenant/${tenantId}/client-project/${id}`,
      payload,
    );

    return data;
  },

  async delete(ids: string[]): Promise<void> {
    const tenantId = getTenantId();

    await api.delete(`/tenant/${tenantId}/client-project`, { data: { ids } });
  },
};
