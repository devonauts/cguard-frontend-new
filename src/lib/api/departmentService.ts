import api from "@/lib/api";

const getTenantId = (): string => {
  const t = localStorage.getItem("tenantId");
  if (!t) throw new Error("No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.");
  return t;
};

export type Department = {
  id: string;
  name: string;
  description?: string | null;
  active: boolean;
  manager?: { id: string; name: string } | null;
  members: number;
  createdAt?: string;
};

export type DepartmentPayload = {
  name: string;
  description?: string | null;
  managerId?: string | null;
  active?: boolean;
};

export const departmentService = {
  async list(params?: { filter?: string }): Promise<{ rows: Department[]; count: number }> {
    const tenantId = getTenantId();
    const qs = params?.filter ? `?filter=${encodeURIComponent(params.filter)}` : "";
    const { data: resp } = await api.get<{ rows?: Department[]; count?: number; data?: { rows?: Department[]; count?: number } }>(`/tenant/${tenantId}/department${qs}`);
    const payload = resp?.data || resp || {};
    return {
      rows: Array.isArray(payload.rows) ? payload.rows : Array.isArray(payload) ? payload : [],
      count: payload.count ?? (Array.isArray(payload.rows) ? payload.rows.length : 0),
    };
  },

  async create(data: DepartmentPayload) {
    const tenantId = getTenantId();
    const { data: resp } = await api.post<Department & { data?: Department }>(`/tenant/${tenantId}/department`, { data });
    return resp?.data || resp;
  },

  async update(id: string, data: Partial<DepartmentPayload>) {
    const tenantId = getTenantId();
    const { data: resp } = await api.put<Department & { data?: Department }>(`/tenant/${tenantId}/department/${id}`, { data });
    return resp?.data || resp;
  },

  async destroy(id: string) {
    const tenantId = getTenantId();
    const { data: resp } = await api.delete<{ success?: boolean; data?: { success?: boolean } }>(`/tenant/${tenantId}/department/${id}`);
    return resp?.data || resp;
  },

  // userId is the USER id (same convention as time-off flows), not the securityGuard id.
  async getMemberDepartment(userId: string): Promise<{ departmentId: string | null; department: { id: string; name: string; active: boolean } | null }> {
    const tenantId = getTenantId();
    type MemberDept = { departmentId?: string | null; department?: { id: string; name: string; active: boolean } | null };
    const { data: resp } = await api.get<MemberDept & { data?: MemberDept }>(`/tenant/${tenantId}/department-member/${userId}`, {
      toast: { silentError: true },
    });
    const payload = resp?.data || resp || {};
    return { departmentId: payload.departmentId ?? null, department: payload.department ?? null };
  },

  async assignMember(userId: string, departmentId: string | null) {
    const tenantId = getTenantId();
    const { data: resp } = await api.put<{ success?: boolean; data?: { success?: boolean } }>(`/tenant/${tenantId}/department-member/${userId}`, {
      data: { departmentId },
    });
    return resp?.data || resp;
  },
};

export default departmentService;
