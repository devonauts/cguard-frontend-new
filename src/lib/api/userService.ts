import api from "@/lib/api";
import type { UserCreateData, UserUpdateData, UserCurrent } from "@/types/api";

const getTenantId = (): string => {
  const t = localStorage.getItem("tenantId");
  if (!t) throw new Error("No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.");
  return t;
};

export const userService = {
  async createUser(data: UserCreateData) {
    const tenantId = getTenantId();
    const url = `/tenant/${tenantId}/user`;
    // NOTE: do not log the payload/response — createUser commonly carries a temp password.
    try {
      const { data: resp } = await api.post<UserCurrent>(url, data);
      return resp;
    } catch (err: any) {
      if (import.meta.env.DEV) {
        try { console.error('[userService] createUser ERROR', { url, status: err?.response?.status, message: err?.message }); } catch (e) {}
      }
      throw err;
    }
  },

  async updateUser(id: string, data: Partial<UserUpdateData>) {
    const tenantId = getTenantId();
    const url = `/tenant/${tenantId}/user/${id}`;
    // PUT, not PATCH: the PATCH route only accepts firstName/lastName/phone/
    // office fields — name/email/role/clientIds/postSiteIds were silently
    // dropped (admin-user edits never persisted). The PUT (userEdit) handles
    // the full payload incl. roles/assignments/identity.
    // NOTE: do not log the payload/response — updateUser may carry credentials/PII.
    try {
      const { data: resp } = await api.put<UserCurrent>(url, data);
      return resp;
    } catch (err: any) {
      if (import.meta.env.DEV) {
        try {
          console.error('[userService] updateUser ERROR', {
            url,
            id,
            status: err?.response?.status,
            message: err?.message,
          });
        } catch (e) {}
      }
      throw err;
    }
  },

  /** Legacy PATCH transport (firstName/lastName/phone/office fields only). */
  async patchUser(id: string, data: Record<string, unknown>) {
    const tenantId = getTenantId();
    const url = `/tenant/${tenantId}/user/${id}`;
    const { data: resp } = await api.patch<UserCurrent>(url, data);
    return resp;
  },

  async fetchUser(id: string): Promise<UserCurrent | null> {
    const tenantId = getTenantId();
    const url = `/tenant/${tenantId}/user/${id}`;
    try {
      const { data: resp } = await api.get<UserCurrent & { data?: UserCurrent }>(url, { toast: { silentError: true } });
      return resp?.data || resp || null;
    } catch (err: any) {
      if (import.meta.env.DEV) {
        try { console.error('[userService] fetchUser ERROR', { url, id, status: err?.response?.status, message: err?.message }); } catch (e) {}
      }
      throw err;
    }
  },

  async fetchCurrentUser(): Promise<UserCurrent | null> {
    const { data: resp } = await api.get<UserCurrent & { data?: UserCurrent }>(`/auth/me`, { toast: { silentError: true } });
    return resp?.data || resp || null;
  }
  ,
  async listUsers(params?: Record<string, unknown>): Promise<UserCurrent[]> {
    const tenantId = getTenantId();
    let url = `/tenant/${tenantId}/user`;

    if (params) {
      const query = new URLSearchParams();

      const buildParams = (obj: Record<string, unknown>, prefix = '') => {
        Object.entries(obj).forEach(([key, value]) => {
          if (value === undefined || value === null) return;
          const paramKey = prefix ? `${prefix}[${key}]` : key;

          if (Array.isArray(value)) {
            value.forEach((item) => {
              if (item !== undefined && item !== null) {
                query.append(paramKey, String(item));
              }
            });
          } else if (typeof value === 'object') {
            buildParams(value as Record<string, unknown>, paramKey);
          } else {
            query.append(paramKey, String(value));
          }
        });
      };

      buildParams(params);
      const qs = query.toString();
      if (qs) {
        url += `?${qs}`;
      }
    }

    const { data: resp } = await api.get<UserCurrent[] | { rows?: UserCurrent[]; data?: UserCurrent[] } | null>(url, { toast: { silentError: true } });
    if (!resp) return [];
    if (Array.isArray(resp)) return resp;
    if (resp.rows && Array.isArray(resp.rows)) return resp.rows;
    if (resp.data && Array.isArray(resp.data)) return resp.data;
    return [];
  },

  async listUsersByRoles(roles: string[]): Promise<any[]> {
    const users = await this.listUsers({ limit: 200, offset: 0 });

    const normalizeRoles = (rolesValue: any): string[] => {
      if (!rolesValue) return [];
      if (Array.isArray(rolesValue)) {
        return rolesValue
          .map((item) =>
            typeof item === 'string'
              ? item
              : item && (item.name || item.role)
              ? item.name || item.role
              : ''
          )
          .filter(Boolean)
          .map((item) => String(item).toLowerCase().trim());
      }
      if (typeof rolesValue === 'string') {
        return [rolesValue.toLowerCase().trim()];
      }
      if (typeof rolesValue === 'object') {
        const candidate = rolesValue.name || rolesValue.role || rolesValue.type || '';
        return candidate ? [String(candidate).toLowerCase().trim()] : [];
      }
      return [];
    };

    const normalizedTargets = roles.map((role) => String(role).toLowerCase().trim());

    return users.filter((user: UserCurrent) => {
      const userRoles = normalizeRoles(user.roles || user.role || user.rolesList || user._rolesDisplay);
      return userRoles.some((role) => normalizedTargets.includes(role));
    });
  },

  /** Cierra todas las sesiones de esa persona (todos los canales), ya. */
  async closeSessions(id: string): Promise<void> {
    const tenantId = getTenantId();
    await api.post(`/tenant/${tenantId}/user/${id}/close-sessions`, {});
  },

  async suspendUser(id: string): Promise<void> {
    const tenantId = getTenantId();
    await api.post(`/tenant/${tenantId}/user/${id}/suspend`);
  },

  async suspendUsers(ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) return;
    const tenantId = getTenantId();
    await api.post(`/tenant/${tenantId}/user/suspend`, { ids });
  },

  async deleteUser(id: string): Promise<void> {
    const tenantId = getTenantId();
    // try delete with JSON body first — axios expects `data` for DELETE payload
    try {
      await api.delete(`/tenant/${tenantId}/user`, { data: { ids: [id] } });
      return;
    } catch (e) {
      // fallbacks
    }
    try {
      await api.post(`/tenant/${tenantId}/user/delete`, { ids: [id] });
      return;
    } catch (e) {
      // continue
    }
    await api.post(`/tenant/${tenantId}/user/remove`, { ids: [id] });
  },

  async resendInvitation(id: string): Promise<void> {
    const tenantId = getTenantId();
    await api.post(`/tenant/${tenantId}/user/${id}/resend-invitation`);
  },

  async restoreUser(id: string): Promise<void> {
    const tenantId = getTenantId();
    await api.post(`/tenant/${tenantId}/user/${id}/restore`);
  }

  ,

  async restoreUsers(ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) return;
    const tenantId = getTenantId();
    await api.post(`/tenant/${tenantId}/user/restore`, { ids });
  }

  ,

  async exportFile(format: "excel" | "pdf" | "csv", params?: Record<string, unknown>) {
    const tenantId = getTenantId();
    const qs = params ? `?${new URLSearchParams(params as Record<string, string>).toString()}&format=${format}` : `?format=${format}`;
    const response = await api.get(`/tenant/${tenantId}/user/export${qs}`, {
      responseType: "blob",
      toast: { silentError: true },
    });
    return response.data;
  }
};

export default userService;
