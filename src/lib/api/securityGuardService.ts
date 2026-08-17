import api, { getAuthToken } from "../api";

// Reuse tenantId retrieval pattern
const getTenantId = (): string => {
  const t = localStorage.getItem("tenantId");

  if (!t) {
    throw new Error("No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.");
  }

  return t;
};

export const securityGuardService = {
  async create(input: Record<string, unknown>) {
    const tenantId = getTenantId();
    const resp = await api.post(`/tenant/${tenantId}/security-guard`, input);
    return resp && resp.data !== undefined ? resp.data : resp;
  },

  async invite(entries: Record<string, unknown>[]) {
    const tenantId = getTenantId();
    // Use the dedicated invite endpoint so the server sends invitation emails/SMS
    const resp = await api.post(`/tenant/${tenantId}/security-guard/invite`, { entries });
    return resp && resp.data !== undefined ? resp.data : resp;
  },

  async resendInvite(input: Record<string, unknown>) {
    const tenantId = getTenantId();
    const resp = await api.post(`/tenant/${tenantId}/security-guard/invite`, input);
    return resp && resp.data !== undefined ? resp.data : resp;
  },

  async joinByCode(code: string, entries: Record<string, unknown>[]) {
    const tenantId = getTenantId();
    const resp = await api.post(`/tenant/${tenantId}/security-guard`, { code, entries });

    return resp && resp.data !== undefined ? resp.data : resp;
  },

  async inviteByLink(link: string, entries: Record<string, unknown>[]) {
    const tenantId = getTenantId();
    const resp = await api.post(`/tenant/${tenantId}/security-guard`, { link, entries });

    return resp && resp.data !== undefined ? resp.data : resp;
  },

  async import(file: File | Blob, filename?: string) {
    const tenantId = getTenantId();
    const formData = new FormData();
    // If caller passed a filename, use it; if file is a File, use its name; otherwise fallback
    const nameToUse = filename ?? (file instanceof File ? file.name : undefined) ?? "upload.csv";
    formData.append("file", file as Blob, nameToUse);
    const resp = await api.post(`/tenant/${tenantId}/security-guard/import`, formData);

    return resp && resp.data !== undefined ? resp.data : resp;
  },

  async update(id: string, input: Record<string, unknown>) {
    const tenantId = getTenantId();
    const resp = await api.patch(`/tenant/${tenantId}/security-guard/${id}`, input);

    return resp && resp.data !== undefined ? resp.data : resp;
  },

  /** Admin-trigger a password reset for a guard → { email, emailed, pushed, link }. */
  async sendPasswordReset(id: string) {
    const tenantId = getTenantId();
    const resp = await api.post(`/tenant/${tenantId}/security-guard/${id}/send-password-reset`, {});

    return resp && resp.data !== undefined ? resp.data : resp;
  },

  async destroy(ids: string[]) {
    const tenantId = getTenantId();
    const resp = await api.delete(`/tenant/${tenantId}/security-guard`, { data: { ids }, toast: { silentError: true } });

    return resp && resp.data !== undefined ? resp.data : resp;
  },

  async archive(ids: string[]) {
    const tenantId = getTenantId();
    const resp = await api.post(`/tenant/${tenantId}/security-guard/archive`, { ids }, { toast: { silentError: true } });

    return resp && resp.data !== undefined ? resp.data : resp;
  },
  async restore(ids: string[]) {
    const tenantId = getTenantId();
    const resp = await api.post(`/tenant/${tenantId}/security-guard/restore`, { ids }, { toast: { silentError: true } });

    return resp && resp.data !== undefined ? resp.data : resp;
  },

  async autocomplete(query: string, limit = 10) {
    const tenantId = getTenantId();
    const resp = await api.get(`/tenant/${tenantId}/security-guard/autocomplete?query=${encodeURIComponent(query)}&limit=${limit}`);

    return resp && resp.data !== undefined ? resp.data : resp;
  },

  async list(params?: Record<string, unknown>) {
    const tenantId = getTenantId();
    const qs = params ? `?${new URLSearchParams(params as Record<string, string>).toString()}` : "";
    const resp = await api.get(`/tenant/${tenantId}/security-guard${qs}`);

    return resp && resp.data !== undefined ? resp.data : resp;
  },

  async activeLocations() {
    const tenantId = getTenantId();
    const resp = await api.get(`/tenant/${tenantId}/security-guard/active-locations`);
    return resp && resp.data !== undefined ? resp.data : resp;
  },

  /** Walked GPS trail (breadcrumb polyline) for a guard over a time window. */
  async trail(guardId: string, params?: { from?: string; to?: string; limit?: number }) {
    const tenantId = getTenantId();
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    const resp = await api.get(`/tenant/${tenantId}/security-guard/${guardId}/trail${q ? `?${q}` : ""}`);
    const data = resp && resp.data !== undefined ? resp.data : resp;
    return (data?.points || []) as Array<{ lat: number; lng: number; at: string; speed?: number; accuracy?: number; battery?: number }>;
  },

  async export(format: "excel" | "pdf" | "csv", params?: Record<string, unknown>) {
    const tenantId = getTenantId();
    const qs = params ? `?${new URLSearchParams(params as Record<string, string>).toString()}&format=${format}` : `?format=${format}`;
    const response = await api.get(`/tenant/${tenantId}/security-guard/export${qs}`, {
      responseType: "blob",
      // prevent global error toast; page will show its own
      toast: { silentError: true },
    });
    return response && response.data !== undefined ? response.data : response;
  },

  async find(id: string) {
    const tenantId = getTenantId();
    const resp = await api.get(`/tenant/${tenantId}/security-guard/${id}`, {
      // Prevent the global API interceptor from showing its own toast for this call.
      // The component will display a user-friendly toast once.
      toast: { silentError: true },
    });
    return resp && resp.data !== undefined ? resp.data : resp;
  },

  // Alias para compatibilidad
  get(id: string) {
    return securityGuardService.find(id);
  },

  // Notes CRUD
  async getSecurityGuardNotes(guardId: string, pagination: { limit?: number; offset?: number } = { limit: 25, offset: 0 }) {
    const tenantId = getTenantId();
    const params = new URLSearchParams();
    if (pagination.limit !== undefined) params.append('limit', String(pagination.limit));
    if (pagination.offset !== undefined) params.append('offset', String(pagination.offset));

    const { data } = await api.get<any>(`/tenant/${tenantId}/security-guard/${guardId}/notes?${params.toString()}`);
    return data;
  },

  async createSecurityGuardNote(guardId: string, payload: Record<string, unknown>) {
    const tenantId = getTenantId();
    const { data } = await api.post<any>(`/tenant/${tenantId}/security-guard/${guardId}/notes`, payload);
    return data;
  },

  async updateSecurityGuardNote(guardId: string, noteId: string, payload: Record<string, unknown>) {
    const tenantId = getTenantId();
    const { data } = await api.put<any>(`/tenant/${tenantId}/security-guard/${guardId}/notes/${noteId}`, payload);
    return data;
  },

  async destroySecurityGuardNote(guardId: string, noteId: string) {
    const tenantId = getTenantId();
    const { data } = await api.delete<any>(`/tenant/${tenantId}/security-guard/${guardId}/notes/${noteId}`);
    return data;
  },

  // Licenses CRUD for a guard
  async getSecurityGuardLicenses(guardId: string, pagination: { limit?: number; offset?: number } = { limit: 25, offset: 0 }) {
    const tenantId = getTenantId();
    const params = new URLSearchParams();
    if (pagination.limit !== undefined) params.append('limit', String(pagination.limit));
    if (pagination.offset !== undefined) params.append('offset', String(pagination.offset));

    const { data } = await api.get<any>(`/tenant/${tenantId}/security-guard/${guardId}/licenses?${params.toString()}`);
    return data;
  },

  async createSecurityGuardLicense(guardId: string, payload: Record<string, unknown>) {
    const tenantId = getTenantId();
    const { data } = await api.post<any>(`/tenant/${tenantId}/security-guard/${guardId}/licenses`, payload);
    return data;
  },

  async getSecurityGuardLicense(guardId: string, licenseId: string) {
    const tenantId = getTenantId();
    const { data } = await api.get<any>(`/tenant/${tenantId}/security-guard/${guardId}/licenses/${licenseId}`);
    return data;
  },

  async downloadSecurityGuardLicenseReport(guardId: string, licenseId: string) {
    const tenantId = getTenantId();
    const response = await api.get(`/tenant/${tenantId}/security-guard/${guardId}/licenses/${licenseId}/download?format=pdf`, {
      responseType: 'blob',
      toast: { silentError: true },
    });
    return response && response.data !== undefined ? response.data : response;
  },

  async updateSecurityGuardLicense(guardId: string, licenseId: string, payload: Record<string, unknown>) {
    const tenantId = getTenantId();
    const { data } = await api.put<any>(`/tenant/${tenantId}/security-guard/${guardId}/licenses/${licenseId}`, payload);
    return data;
  },

  async destroySecurityGuardLicenses(guardId: string, ids: string[]) {
    const tenantId = getTenantId();
    const { data } = await api.delete<any>(`/tenant/${tenantId}/security-guard/${guardId}/licenses?ids=${ids.join(',')}`);
    return data;
  },

  async uploadGuardLicenseImage(file: File) {
    const tenantId = getTenantId();
    const filename = file.name;
    const creds: any = await api.get(`/tenant/${tenantId}/file/credentials?filename=${encodeURIComponent(filename)}&storageId=securityGuardLicenseImage`);

    const uploadUrl = creds.data?.uploadCredentials?.url ?? creds.uploadCredentials?.url;
    if (!uploadUrl) throw new Error('Upload URL not available');

    const form = new FormData();
    form.append('filename', filename);
    form.append('file', file);

    const uploadResp = await fetch(uploadUrl, { method: 'POST', body: form });
    if (!uploadResp.ok) {
      const text = await uploadResp.text().catch(() => null);
      throw new Error(`Upload failed: ${uploadResp.status} ${text}`);
    }

      const fileObj = {
        new: true,
        name: filename,
        sizeInBytes: file.size,
        privateUrl: creds.data?.privateUrl ?? creds.privateUrl,
        fileToken: creds?.fileToken ?? creds.data?.fileToken ?? null,
        publicUrl: creds.data?.uploadCredentials?.publicUrl ?? creds.uploadCredentials?.publicUrl ?? null,
      };

    return fileObj;
  },

  async uploadFileToStorage(file: File, storageId: string) {
    const tenantId = getTenantId();
    const filename = file.name;
    const credsResp: any = await api.get(`/tenant/${tenantId}/file/credentials?filename=${encodeURIComponent(filename)}&storageId=${encodeURIComponent(storageId)}`);
    const creds = credsResp && credsResp.data ? credsResp.data : credsResp;

    const uploadUrl = creds?.uploadCredentials?.url ?? creds?.url ?? creds.uploadCredentials?.url;
    const fields = creds?.uploadCredentials?.fields ?? creds?.fields;

    if (!uploadUrl) throw new Error('Upload URL not available');

    const isBackendFileUpload = uploadUrl.includes('/file/upload?token=');

    // If backend returned fields (S3/GCS presigned POST), use FormData
    if (fields || isBackendFileUpload) {
      const form = new FormData();
      if (fields) {
        Object.keys(fields).forEach((k) => form.append(k, fields[k]));
      }
      if (!isBackendFileUpload) {
        form.append('file', file, filename);
      } else {
        form.append('filename', filename);
        form.append('file', file);
      }

      const uploadResp = await fetch(uploadUrl, { method: 'POST', body: form });
      if (!uploadResp.ok) {
        const text = await uploadResp.text().catch(() => null);
        throw new Error(`Upload failed: ${uploadResp.status} ${text}`);
      }
    } else {
      // If backend expects direct PUT to uploadUrl
      const putResp = await fetch(uploadUrl, { method: 'PUT', body: file });
      if (!putResp.ok) {
        const text = await putResp.text().catch(() => null);
        throw new Error(`Upload failed: ${putResp.status} ${text}`);
      }
    }

      const fileObj = {
        new: true,
        name: filename,
        sizeInBytes: file.size,
        privateUrl: creds?.privateUrl ?? creds.privateUrl,
        fileToken: creds?.fileToken ?? creds.data?.fileToken ?? null,
        publicUrl: creds?.uploadCredentials?.publicUrl ?? creds.publicUrl ?? creds?.publicUrl ?? null,
      };

    return fileObj;
  },

  /**
   * Upload with progress callback. onProgress receives a number [0-100].
   */
  async uploadFileToStorageWithProgress(file: File, storageId: string, onProgress: (p: number) => void) {
    const tenantId = getTenantId();
    const filename = file.name;
    const credsResp: any = await api.get(`/tenant/${tenantId}/file/credentials?filename=${encodeURIComponent(filename)}&storageId=${encodeURIComponent(storageId)}`);
    const creds = credsResp && credsResp.data ? credsResp.data : credsResp;

    const uploadUrl = creds?.uploadCredentials?.url ?? creds?.url ?? creds.uploadCredentials?.url;
    const fields = creds?.uploadCredentials?.fields ?? creds?.fields;

    if (!uploadUrl) throw new Error('Upload URL not available');

    return await new Promise<{ new: boolean; name: string; sizeInBytes: number; privateUrl?: string | null; publicUrl?: string | null }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          try { onProgress(percent); } catch (e) {}
        }
      };

      xhr.onerror = function () {
        reject(new Error('Upload failed'));
      };

      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          const fileObj = {
            new: true,
            name: filename,
            sizeInBytes: file.size,
            privateUrl: creds?.privateUrl ?? creds.privateUrl,
            publicUrl: creds?.uploadCredentials?.publicUrl ?? creds.publicUrl ?? creds?.publicUrl ?? null,
          };
          try { onProgress(100); } catch (e) {}
          resolve(fileObj);
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      };

      const isBackendFileUpload = uploadUrl.includes('/file/upload?token=');

      if (fields || isBackendFileUpload) {
        const form = new FormData();
        if (fields) {
          Object.keys(fields).forEach((k) => form.append(k, fields[k]));
        }
        if (!isBackendFileUpload) {
          form.append('file', file, filename);
        } else {
          form.append('filename', filename);
          form.append('file', file);
        }
        xhr.open('POST', uploadUrl, true);
        xhr.send(form);
      } else {
        // direct PUT
        xhr.open('PUT', uploadUrl, true);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.send(file);
      }
    });
  },

  // ── Worker-detail data (station/schedule/documents/performance) ──────────

  /** The guard's active station/post assignments (station + shift window). */
  async getAssignments(guardId: string) {
    const tenantId = getTenantId();
    const resp = await api.get(`/tenant/${tenantId}/security-guard/${guardId}/assignments`);
    const p: any = resp?.data ?? resp;
    return { rows: Array.isArray(p?.rows) ? p.rows : [], count: p?.count ?? 0 };
  },

  /** Forward rotation schedule (D/N/L grid) for the guard. */
  async getSchedule(guardId: string, params?: { startDate?: string; endDate?: string }) {
    const tenantId = getTenantId();
    const qs = params ? `?${new URLSearchParams(Object.entries(params).filter(([, v]) => v) as any).toString()}` : '';
    const resp = await api.get(`/tenant/${tenantId}/security-guard/${guardId}/schedule${qs}`);
    return resp?.data ?? resp;
  },

  /** 8-factor performance score for the guard. */
  async getPerformance(guardId: string, period = 30) {
    const tenantId = getTenantId();
    const resp = await api.get(`/tenant/${tenantId}/security-guard/${guardId}/performance?period=${period}`);
    return resp?.data ?? resp;
  },

  /** Documents linked to the guard. */
  async getDocuments(guardId: string) {
    const tenantId = getTenantId();
    const resp = await api.get(`/tenant/${tenantId}/security-guard/${guardId}/documents`);
    const p: any = resp?.data ?? resp;
    return { rows: Array.isArray(p?.rows) ? p.rows : [], count: p?.count ?? 0 };
  },

  /** Persist already-uploaded document descriptors for the guard. */
  async addDocuments(guardId: string, documents: Record<string, unknown>[]) {
    const tenantId = getTenantId();
    const resp = await api.post(`/tenant/${tenantId}/security-guard/${guardId}/documents`, { data: { documents } });
    return resp?.data ?? resp;
  },

  async deleteDocument(guardId: string, docId: string) {
    const tenantId = getTenantId();
    const resp = await api.delete(`/tenant/${tenantId}/security-guard/${guardId}/documents/${docId}`);
    return resp?.data ?? resp;
  },
};

export default securityGuardService;
