import api, { getAuthToken } from "../api";
import { descargarInforme } from "@/lib/export/serverDownload";
import type { ExportFormat } from "@/lib/export/reportExport";
import { cachedFetch, invalidateEntity } from "@/lib/queryClient";
import type {
    Client,
    ClientInput,
    ClientFilters,
    PaginationParams,
    ClientListResponse,
} from "@/types/client";
import { resolveApiBase } from "@/lib/apiBase";

/**
 * Shape of a client row as it comes back RAW from the backend, before the
 * frontend field remapping (zipCode -> postalCode, addressComplement ->
 * addressLine2, active coerced to boolean). The backend also carries
 * categoryIds for category-usage checks.
 */
interface RawClientRow extends Omit<Client, "active"> {
    zipCode?: string;
    addressComplement?: string;
    active?: boolean | number | null;
    categoryIds?: string[];
}

interface RawClientListResponse {
    rows?: RawClientRow[];
    count: number;
}

// Variable global para almacenar el tenantId
let globalTenantId: string | null = null;

/**
 * Configura el tenantId globalmente para el servicio.
 * Debe ser llamado al inicio de la aplicación o cuando el usuario se autentica.
 */
export const setTenantId = (id: string) => {
    globalTenantId = id;
    localStorage.setItem("tenantId", id);
};

/**
 * Clear any configured tenant id from memory and storage.
 * Useful for global users (superadmin) that should not be tenant-scoped.
 */
export const clearTenantId = () => {
    globalTenantId = null;
    try { localStorage.removeItem('tenantId'); } catch (e) {}
};

/**
 * Obtiene el tenantId configurado.
 * Si no está en memoria, intenta recuperarlo de localStorage.
 * Si no existe, lanza un error.
 */
const getTenantId = (): string => {
    if (globalTenantId) return globalTenantId;
    const local = localStorage.getItem("tenantId");
    if (local) {
        globalTenantId = local;
        return local;
    }

    // NOTE: previously this fell back to a `window.__APP_AUTH` global, but that
    // handle is now dev-only and never exposes the token. The AuthProvider always
    // persists the resolved tenantId to localStorage (and calls setTenantId), so
    // the localStorage lookup above is the canonical source.

    throw new Error("El usuario debe estar vinculado a una empresa para continuar");
};

export const clientService = {
    /**
     * Get list of clients with filters and pagination
     */
    async getClients(
        filters?: ClientFilters,
        pagination?: PaginationParams
    ): Promise<ClientListResponse> {
        const tenantId = getTenantId();
        // Read-through cache: the 16 pages that list clients now share one
        // cached result within staleTime instead of each re-querying MySQL on
        // mount. Mutations below invalidate it.
        return cachedFetch(["clients", tenantId, filters ?? null, pagination ?? null], async () => {
        const params = new URLSearchParams();

        // Add pagination
        if (pagination) {
            if (pagination.limit) params.append("limit", pagination.limit.toString());
            if (pagination.offset) params.append("offset", pagination.offset.toString());
            if (pagination.orderBy) params.append("orderBy", pagination.orderBy);
        }

        // Add filters
        if (filters) {
            if (filters.name) params.append("filter[name]", filters.name);
            if (filters.lastName) params.append("filter[lastName]", filters.lastName);
            if (filters.email) params.append("filter[email]", filters.email);
            if (filters.phoneNumber) params.append("filter[phoneNumber]", filters.phoneNumber);
            if (filters.address) params.append("filter[address]", filters.address);
            if (filters.city) params.append("filter[city]", filters.city);
            if (filters.country) params.append("filter[country]", filters.country);
            if (filters.faxNumber) params.append("filter[faxNumber]", filters.faxNumber);
            if (filters.website) params.append("filter[website]", filters.website);
            if (filters.category) params.append("filter[categoryIds]", filters.category);
            // Backend espera 1/0 para activo/inactivo
            if (filters.active !== undefined) {
                const activeInt = filters.active ? 1 : 0;
                params.append("filter[active]", String(activeInt));
            }
            /* La sección de Archivados. Lo archivado lleva `deletedAt` y por eso
               no se ve en ningún otro sitio; aquí se pide a propósito. */
            if (filters.archived) {
                params.append("filter[archived]", "true");
            }
            if (filters.createdAtRange) {
                params.append("filter[createdAtRange][]", filters.createdAtRange[0]);
                params.append("filter[createdAtRange][]", filters.createdAtRange[1]);
            }
        }

        const { data } = await api.get<RawClientListResponse>(
            `/tenant/${tenantId}/client-account?${params.toString()}`,
            // Prevent global interceptor from showing duplicate toasts; component will show one
            { toast: { silentError: true } }
        );
        // Mapear zipCode/addressComplement y normalizar active a boolean
        const rows: Client[] = (data.rows ?? []).map((client) => {
            const normalizedActive = client.active === true || client.active === 1
                ? true
                : client.active === false || client.active === 0
                ? false
                : true; // fallback activo si falta en lista
            return {
                ...client,
                postalCode: client.zipCode || client.postalCode,
                addressLine2: client.addressComplement || client.addressLine2,
                active: normalizedActive,
            };
        });
        return { rows, count: data.count };
        });
    },

    /**
     * Get a single client by ID
     */
    async getClient(id: string): Promise<Client> {
        const tenantId = getTenantId();
            const { data } = await api.get<RawClientRow>(
                `/tenant/${tenantId}/client-account/${id}`,
                // Prevent global interceptor from showing duplicate toasts; component will show one
                { toast: { silentError: true } }
            );
        // Mapear zipCode/addressComplement y normalizar active a boolean
        return {
            ...data,
            postalCode: data.zipCode || data.postalCode,
            addressLine2: data.addressComplement || data.addressLine2,
            active:
                data.active === true || data.active === 1
                    ? true
                    : data.active === false || data.active === 0
                    ? false
                    : true,
        };
    },

    /**
     * Create a new client
     */
    async createClient(input: ClientInput): Promise<Client> {
        const tenantId = getTenantId();
        // Mapear postalCode y addressLine2 del frontend a zipCode y addressComplement del backend
        const payload: any = { ...input };
        // Ensure latitude/longitude are sent as numbers when present, otherwise omit them
        if (typeof input.latitude !== 'undefined' && input.latitude !== null && String(input.latitude).trim() !== '') {
            const lat = Number(String(input.latitude));
            if (!Number.isNaN(lat)) payload.latitude = lat;
            else delete payload.latitude;
        } else {
            delete payload.latitude;
        }
        if (typeof input.longitude !== 'undefined' && input.longitude !== null && String(input.longitude).trim() !== '') {
            const lng = Number(String(input.longitude));
            if (!Number.isNaN(lng)) payload.longitude = lng;
            else delete payload.longitude;
        } else {
            delete payload.longitude;
        }
        if (input.postalCode !== undefined) {
            payload.zipCode = input.postalCode;
            delete payload.postalCode;
        }
        if (input.addressLine2 !== undefined) {
            payload.addressComplement = input.addressLine2;
            delete payload.addressLine2;
        }
        const { data } = await api.post<RawClientRow>(`/tenant/${tenantId}/client-account`,
            payload
        );
        invalidateEntity("clients");
        // Mapear zipCode y addressComplement del backend a postalCode y addressLine2 del frontend en la respuesta
        return {
            ...data,
            postalCode: data.zipCode || data.postalCode,
            addressLine2: data.addressComplement || data.addressLine2,
        } as unknown as Client;
    },

    /**
     * Update an existing client
     */
    async updateClient(id: string, input: ClientInput): Promise<Client> {
        const tenantId = getTenantId();
        // Mapear postalCode y addressLine2 del frontend a zipCode y addressComplement del backend
        const payload: any = { ...input };
        // Ensure latitude/longitude are sent as numbers when present, otherwise omit them
        if (typeof input.latitude !== 'undefined' && input.latitude !== null && String(input.latitude).trim() !== '') {
            const lat = Number(String(input.latitude));
            if (!Number.isNaN(lat)) payload.latitude = lat;
            else delete payload.latitude;
        } else {
            delete payload.latitude;
        }
        if (typeof input.longitude !== 'undefined' && input.longitude !== null && String(input.longitude).trim() !== '') {
            const lng = Number(String(input.longitude));
            if (!Number.isNaN(lng)) payload.longitude = lng;
            else delete payload.longitude;
        } else {
            delete payload.longitude;
        }
        if (input.postalCode !== undefined) {
            payload.zipCode = input.postalCode;
            delete payload.postalCode;
        }
        if (input.addressLine2 !== undefined) {
            payload.addressComplement = input.addressLine2;
            delete payload.addressLine2;
        }
            // Debug: log tenant and payload to help diagnose 400/403 issues
            try {
                console.debug('[clientService.updateClient] tenantId:', tenantId, 'id:', id);
                // avoid logging sensitive tokens; only log payload keys and lengths
                try { console.debug('[clientService.updateClient] payload preview:', Object.keys(payload).reduce((acc, k) => ({ ...acc, [k]: payload[k] && payload[k].length ? (typeof payload[k] === 'string' ? `${String(payload[k]).slice(0, 100)}` : payload[k]) : payload[k] }), {})); } catch (e) {}
            } catch (e) {}

            const { data } = await api.patch<RawClientRow>(
                `/tenant/${tenantId}/client-account/${id}`,
                payload
            );
        invalidateEntity("clients");
        // Mapear zipCode y addressComplement del backend a postalCode y addressLine2 del frontend en la respuesta
        return {
            ...data,
            postalCode: data.zipCode || data.postalCode,
            addressLine2: data.addressComplement || data.addressLine2,
        } as unknown as Client;
    },

    /**
     * Upload a file to storage for a client account field.
     * Returns a file object ready to include in create/update payload.
     * storageId must be one of: 'clientAccountLogoUrl' | 'clientAccountPlacePictureUrl'
     */
    async uploadFile(file: File, storageId: string) {
        const tenantId = getTenantId();
        const filename = file.name;
        const creds: any = await api.get(
            `/tenant/${tenantId}/file/credentials?filename=${encodeURIComponent(filename)}&storageId=${storageId}`,
        );

        const credData = creds.data ?? creds;
        const uploadUrl = credData?.uploadCredentials?.url;
        if (!uploadUrl) throw new Error('Upload URL not available');

        const form = new FormData();
        form.append('filename', filename);
        form.append('file', file);

        const uploadResp = await fetch(uploadUrl, { method: 'POST', body: form });
        if (!uploadResp.ok) {
            const text = await uploadResp.text().catch(() => null);
            throw new Error(`Upload failed: ${uploadResp.status} ${text}`);
        }

        return {
            new: true,
            name: filename,
            sizeInBytes: file.size,
            privateUrl: credData?.privateUrl,
            fileToken: credData?.fileToken ?? null,
            publicUrl: credData?.downloadUrl ?? null,
        };
    },

    /**
     * Delete a single client
     */
    async deleteClient(id: string): Promise<void> {
        const tenantId = getTenantId();
        // Backend routes delete requests to the base path and expects ids via query or body.
        // axios supports sending a body with DELETE via the `data` config field.
        await api.delete(`/tenant/${tenantId}/client-account`, { data: { ids: [id] }, toast: { silentError: true } });
        invalidateEntity("clients");
    },

    /**
     * Delete multiple clients
     */
    async deleteClients(ids: string[]): Promise<void> {
        const tenantId = getTenantId();
        await api.post(`/tenant/${tenantId}/client-account/destroy-all`, { ids }, { toast: { silentError: true } });
        invalidateEntity("clients");
    },

    /**
     * Qué se llevaría por delante archivar (o eliminar) este cliente: sedes,
     * estaciones y a qué vigilantes deja sin puesto. No cambia nada — existe
     * para poder DECIRLO antes de hacerlo.
     */
    async archiveImpact(id: string): Promise<{
        sedes: number; estaciones: number; vigilantes: number;
        nombresDeSedes: string[]; nombresDeVigilantes: string[];
    }> {
        const tenantId = getTenantId();
        const { data } = await api.get<any>(
            `/tenant/${tenantId}/client-account/${id}/impact`,
            { toast: { silentError: true } },
        );
        return data?.data ?? data;
    },

    /** Archivar: el servicio terminó. Recuperable desde Archivados. */
    async archiveClients(ids: string[], reason?: string | null): Promise<void> {
        const tenantId = getTenantId();
        await api.post(
            `/tenant/${tenantId}/client-account/archive`,
            { ids, reason: reason ?? null },
            { toast: { silentError: true } },
        );
        /* Se invalidan también puestos y horario: archivar suelta vigilantes y
           anula sus turnos, así que esas pantallas quedaron viejas. */
        invalidateEntity("clients");
        invalidateEntity("stations");
    },

    /** Restaurar: vuelve el sitio, no la gente. */
    async restoreClients(ids: string[]): Promise<void> {
        const tenantId = getTenantId();
        await api.post(
            `/tenant/${tenantId}/client-account/restore`,
            { ids },
            { toast: { silentError: true } },
        );
        invalidateEntity("clients");
        invalidateEntity("stations");
    },

    /**
     * Export clients to PDF
     */
    async exportPDF(filters?: ClientFilters): Promise<Blob> {
        const tenantId = getTenantId();
        const params = new URLSearchParams();
        params.append("format", "pdf");

        // Add filters if provided
        if (filters) {
            if (filters.name) params.append("filter[name]", filters.name);
            if (filters.category) params.append("filter[category]", filters.category);
        }

        const { data } = await api.get(
            `/tenant/${tenantId}/client-account/export?${params.toString()}`,
            {
                responseType: "blob",
            }
        );
        return data;
    },

    /**
     * Export clients to Excel
     */
    async exportExcel(filters?: ClientFilters): Promise<Blob> {
        const tenantId = getTenantId();
        const params = new URLSearchParams();
        params.append("format", "excel");

        // Add filters if provided
        if (filters) {
            if (filters.name) params.append("filter[name]", filters.name);
            if (filters.category) params.append("filter[category]", filters.category);
        }

        const { data } = await api.get(
            `/tenant/${tenantId}/client-account/export?${params.toString()}`,
            {
                responseType: "blob",
            }
        );
        return data;
    },

    /**
     * Import clients from Excel file
     */
    async importExcel(file: File): Promise<{ imported: number; errors?: string[] }> {
        const tenantId = getTenantId();
        
        // Generar un hash único para la importación
        const importHash = `import-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        
                const formData = new FormData();
                formData.append("file", file);
                formData.append("importHash", importHash);

                // Debug: log file info before sending
                try {
                    console.debug('[clientService.importExcel] file:', { name: file.name, size: file.size, type: file.type });
                } catch (e) {}

                // Try using fetch first to avoid axios multipart boundary issues observed in some environments.
                const base = (resolveApiBase() as string) || '';
                const url = `${base}/tenant/${tenantId}/client-account/import`;
                const token = typeof getAuthToken === 'function' ? getAuthToken() : null;

                try {
                    const headers: Record<string, string> = {};
                    if (token) headers['Authorization'] = `Bearer ${token}`;
                    const resp = await fetch(url, {
                        method: 'POST',
                        body: formData,
                        headers,
                        credentials: 'include',
                    });
                    const text = await resp.text();
                    let json: any = null;
                    try { json = text ? JSON.parse(text) : null; } catch (_) { json = text; }
                    if (!resp.ok) {
                        const err: any = json || { message: `HTTP ${resp.status}` };
                        throw err;
                    }
                    return json;
                } catch (fetchErr) {
                    // If fetch fails, fallback to axios post (keeps previous behavior)
                    console.warn('[clientService.importExcel] fetch upload failed, falling back to axios', fetchErr);
                    const { data } = await api.post(
                        `/tenant/${tenantId}/client-account/import`,
                        formData
                    );
                    return data;
                }
    },

    /**
     * Get autocomplete suggestions for client names
     */
    async autocomplete(query: string, limit = 10): Promise<Array<{ id: string; label: string }>> {
        const tenantId = getTenantId();
        const { data } = await api.get(
            `/tenant/${tenantId}/client-account/autocomplete?query=${encodeURIComponent(query)}&limit=${limit}`
        );
        return data;
    },

    /**
     * Check if a category is in use by any client
     */
    async checkCategoryUsage(categoryId: string): Promise<number> {
        const tenantId = getTenantId();
        
        // Obtener todos los clientes y filtrar manualmente
        // ya que el backend puede no soportar filtrado por array JSON
        const { data } = await api.get<RawClientListResponse>(
            `/tenant/${tenantId}/client-account?limit=9999&offset=0`
        );


        // Contar manualmente cuántos clientes tienen esta categoría
        let count = 0;
        if (data.rows) {
            count = data.rows.filter((client) => {
                const categoryIds = client.categoryIds || [];
                const hasCategory = Array.isArray(categoryIds) && categoryIds.includes(categoryId);
                if (hasCategory) {
                }
                return hasCategory;
            }).length;
        }
        
        return count;
    },

    /**
     * Get post sites for a client (supports pagination)
     */
    async getClientPostSites(clientId: string, pagination: { limit?: number; offset?: number } = { limit: 25, offset: 0 }) {
        const tenantId = getTenantId();
        const params = new URLSearchParams();
        if (pagination.limit !== undefined) params.append('limit', String(pagination.limit));
        if (pagination.offset !== undefined) params.append('offset', String(pagination.offset));

        const { data } = await api.get<any>(
            `/tenant/${tenantId}/client-account/${clientId}/post-sites?${params.toString()}`,
            { toast: { silentError: true } },
        );

        return data;
    },

    /**
     * Client contacts CRUD
     */
    async getClientContacts(clientId: string, pagination: { limit?: number; offset?: number } = { limit: 25, offset: 0 }) {
        const tenantId = getTenantId();
        const params = new URLSearchParams();
        if (pagination.limit !== undefined) params.append('limit', String(pagination.limit));
        if (pagination.offset !== undefined) params.append('offset', String(pagination.offset));

        const { data } = await api.get<any>(
            `/tenant/${tenantId}/client-account/${clientId}/contacts?${params.toString()}`,
            { toast: { silentError: true } },
        );

        return data;
    },

    async createClientContact(clientId: string, payload: Record<string, unknown>) {
        const tenantId = getTenantId();
        const { data } = await api.post<any>(
            `/tenant/${tenantId}/client-account/${clientId}/contacts`,
            payload,
        );
        // Return full payload from backend so callers can read message and data
        return data;
    },

    async updateClientContact(clientId: string, contactId: string, payload: Record<string, unknown>) {
        const tenantId = getTenantId();
        const { data } = await api.put<any>(
            `/tenant/${tenantId}/client-account/${clientId}/contacts/${contactId}`,
            payload,
        );
        return data;
    },

    async destroyClientContact(clientId: string, contactId: string) {
        const tenantId = getTenantId();
        const { data } = await api.delete<any>(
            `/tenant/${tenantId}/client-account/${clientId}/contacts/${contactId}`,
        );
        // For delete we return the whole payload so callers can read messages
        return data;
    },

    /**
     * Client notes CRUD
     */
    async getClientNotes(clientId: string, pagination: { limit?: number; offset?: number } = { limit: 25, offset: 0 }) {
        const tenantId = getTenantId();
        const params = new URLSearchParams();
        if (pagination.limit !== undefined) params.append('limit', String(pagination.limit));
        if (pagination.offset !== undefined) params.append('offset', String(pagination.offset));

        const { data } = await api.get<any>(
            `/tenant/${tenantId}/client-account/${clientId}/notes?${params.toString()}`,
            { toast: { silentError: true } },
        );

        return data;
    },

    async createClientNote(clientId: string, payload: Record<string, unknown>) {
        const tenantId = getTenantId();
        const { data } = await api.post<any>(
            `/tenant/${tenantId}/client-account/${clientId}/notes`,
            payload,
        );
        return data;
    },

    async updateClientNote(clientId: string, noteId: string, payload: Record<string, unknown>) {
        const tenantId = getTenantId();
        const { data } = await api.put<any>(
            `/tenant/${tenantId}/client-account/${clientId}/notes/${noteId}`,
            payload,
        );
        return data;
    },

    async destroyClientNote(clientId: string, noteId: string) {
        const tenantId = getTenantId();
        const { data } = await api.delete<any>(
            `/tenant/${tenantId}/client-account/${clientId}/notes/${noteId}`,
        );
        return data;
    },

    /**
     * Get guards assigned to a client (uses tenant pivot) - supports pagination
     */
    async getClientGuards(clientId: string, pagination: { limit?: number; offset?: number } = { limit: 25, offset: 0 }) {
        const tenantId = getTenantId();
        const params = new URLSearchParams();
        if (pagination.limit !== undefined) params.append('limit', String(pagination.limit));
        if (pagination.offset !== undefined) params.append('offset', String(pagination.offset));

        const { data } = await api.get<any>(
            `/tenant/${tenantId}/client-account/${clientId}/guards?${params.toString()}`,
            { toast: { silentError: true } },
        );

        return data;
    },

    /**
     * Get only the count of guards assigned to a client (much lighter)
     */
    async getClientGuardsCount(clientId: string): Promise<number> {
        const tenantId = getTenantId();
        const { data } = await api.get<any>(
            `/tenant/${tenantId}/client-account/${clientId}/guards/count`,
            { toast: { silentError: true } },
        );
        return Number(data?.count || 0);
    },


    /**
     * Get incidents for a client (by station ids) - supports filters and pagination
     */
    async getClientIncidents(clientId: string, options: { limit?: number; offset?: number; filter?: Record<string, unknown> } = {}) {
        const tenantId = getTenantId();
        const params = new URLSearchParams();
        if (options.limit !== undefined) params.append('limit', String(options.limit));
        if (options.offset !== undefined) params.append('offset', String(options.offset));
        if (options.filter && typeof options.filter === 'object') {
            for (const key of Object.keys(options.filter)) {
                const val = options.filter[key];
                if (Array.isArray(val)) {
                    for (const v of val) params.append(`filter[${key}][]`, String(v));
                } else {
                    params.append(`filter[${key}]`, String(val));
                }
            }
        }

        const { data } = await api.get<any>(
            `/tenant/${tenantId}/client-account/${clientId}/incidents?${params.toString()}`,
            { toast: { silentError: true } },
        );
        return data;
    },

    /**
     * Get aggregated overview for a client (postSitesCount, assignedCount, onsiteCount, toursLast7Days, tasksLast7Days, incidentsLast7Days, hoursLoggedSeconds)
     */
    /** Card-view metadata: signed logo + site/station counts per client id. */
    async getCardMeta(ids: string[]): Promise<Record<string, { logoUrl: string | null; sites: number; stations: number }>> {
        if (!ids.length) return {};
        const tenantId = getTenantId();
        const { data: resp } = await api.get<any>(
            `/tenant/${tenantId}/client-account/card-meta?ids=${ids.join(",")}`,
            { toast: { silentError: true } },
        );
        return resp?.data || resp || {};
    },

    /** Full operation tree (sites with their stations + loose stations). */
    async getOperation(clientId: string): Promise<{ sites: any[]; looseStations: any[] }> {
        const tenantId = getTenantId();
        const { data: resp } = await api.get<any>(`/tenant/${tenantId}/client-account/${clientId}/operation`);
        const payload = resp?.data || resp || {};
        return { sites: payload.sites || [], looseStations: payload.looseStations || [] };
    },

    async getClientOverview(clientId: string) {
        const tenantId = getTenantId();
        const { data } = await api.get<any>(`/tenant/${tenantId}/client-account/${clientId}/overview`, { toast: { silentError: true } });
        return data;
    },

    /** Unified activity timeline for the client (shifts, incidents, visitors,
     *  tasks, rondas, relevos) — GET /client-account/:id/activity. */
    async getClientActivity(clientId: string, params: { days?: number; limit?: number; before?: string } = {}) {
        const tenantId = getTenantId();
        const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null) as any).toString();
        const { data } = await api.get<any>(`/tenant/${tenantId}/client-account/${clientId}/activity${qs ? `?${qs}` : ''}`, { toast: { silentError: true } });
        const p = data?.data ?? data;
        return { rows: Array.isArray(p?.rows) ? p.rows : [], hasMore: !!p?.hasMore, nextBefore: p?.nextBefore || null };
    },

    // ----- Accesos (usuarios con acceso a la app/portal) ------------------
    async getClientAccessUsers(clientId: string) {
        const tenantId = getTenantId();
        const { data } = await api.get<any>(`/tenant/${tenantId}/client-account/${clientId}/access-users`, { toast: { silentError: true } });
        return (data?.data ?? data)?.users || [];
    },
    async revokeClientAccess(clientId: string, pivotId: string) {
        const tenantId = getTenantId();
        const { data } = await api.delete<any>(`/tenant/${tenantId}/client-account/${clientId}/access-users/${pivotId}`);
        return data?.data ?? data;
    },

    // ----- Reportes -------------------------------------------------------
    async getClientReports(clientId: string, opts: { from?: string; to?: string; q?: string; page?: number; perPage?: number } = {}) {
        const tenantId = getTenantId();
        const params = new URLSearchParams();
        Object.entries(opts).forEach(([k, v]) => { if (v !== undefined && v !== '' && v !== null) params.set(k, String(v)); });
        const qs = params.toString() ? `?${params.toString()}` : '';
        const { data } = await api.get<any>(`/tenant/${tenantId}/client-account/${clientId}/reports${qs}`, { toast: { silentError: true } });
        return data?.data ?? data;
    },
    /**
     * El informe del cliente, en el formato pedido.
     *
     * El nombre del archivo lo pone el SERVIDOR: aquí se escribía a mano
     * `reporte-<tipo>.csv`, así que en cuanto hubo más de un formato el PDF
     * habría bajado llamándose `.csv` — y, peor, sin el rango de fechas que el
     * servidor sí pone en el nombre. Se conserva un nombre de reserva por si la
     * cabecera no llega.
     */
    async exportClientReport(clientId: string, type: string, from?: string, to?: string, format: ExportFormat = 'csv') {
        const tenantId = getTenantId();
        const params = new URLSearchParams({ type, format });
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        await descargarInforme(
            `/tenant/${tenantId}/client-account/${clientId}/reports-export?${params.toString()}`,
            { format, nombreBase: `reporte-${type}` },
        );
    },
    /**
     * La biblioteca de documentos (`getClientDocuments`) es la trastienda; esto
     * es lo que el cliente RECIBE: un grupo con nombre y periodo, entregado por
     * la app o por un enlace que caduca a las 72 h, con constancia de quién lo
     * vio y qué descargó.
     */
    async getDocumentPackets(clientId: string) {
      const tenantId = getTenantId();
      const { data } = await api.get<any>(
        `/tenant/${tenantId}/client-account/${clientId}/document-packets`,
        { toast: { silentError: true } },
      );

      return data?.data ?? data;
    },
    async createDocumentPacket(
      clientId: string,
      payload: {
        name: string;
        periodStart?: string | null;
        periodEnd?: string | null;
        notes?: string | null;
        attachmentIds: string[];
      },
    ) {
      const tenantId = getTenantId();
      const { data } = await api.post<any>(
        `/tenant/${tenantId}/client-account/${clientId}/document-packets`,
        { data: payload },
      );

      return data?.data ?? data;
    },
    async updateDocumentPacket(
      clientId: string,
      packetId: string,
      payload: Record<string, unknown>,
    ) {
      const tenantId = getTenantId();
      const { data } = await api.patch<any>(
        `/tenant/${tenantId}/client-account/${clientId}/document-packets/${packetId}`,
        { data: payload },
      );

      return data?.data ?? data;
    },
    async deleteDocumentPacket(clientId: string, packetId: string) {
      const tenantId = getTenantId();
      const { data } = await api.delete<any>(
        `/tenant/${tenantId}/client-account/${clientId}/document-packets/${packetId}`,
      );

      return data?.data ?? data;
    },
    async shareDocumentPacketInApp(
      clientId: string,
      packetId: string,
      enabled: boolean,
    ) {
      const tenantId = getTenantId();
      const { data } = await api.post<any>(
        `/tenant/${tenantId}/client-account/${clientId}/document-packets/${packetId}/share-app`,
        { data: { enabled } },
      );

      return data?.data ?? data;
    },
    async createDocumentPacketLink(
      clientId: string,
      packetId: string,
      payload: {
        requireCode: boolean;
        recipients: string[];
        expiresInHours?: number;
        message?: string;
      },
    ) {
      const tenantId = getTenantId();
      const { data } = await api.post<any>(
        `/tenant/${tenantId}/client-account/${clientId}/document-packets/${packetId}/links`,
        { data: payload },
      );

      return data?.data ?? data;
    },
    async revokeDocumentPacketLink(
      clientId: string,
      packetId: string,
      linkId: string,
    ) {
      const tenantId = getTenantId();
      const { data } = await api.post<any>(
        `/tenant/${tenantId}/client-account/${clientId}/document-packets/${packetId}/links/${linkId}/revoke`,
        { data: {} },
      );

      return data?.data ?? data;
    },
    async getDocumentPacketEvents(clientId: string, packetId: string) {
      const tenantId = getTenantId();
      const { data } = await api.get<any>(
        `/tenant/${tenantId}/client-account/${clientId}/document-packets/${packetId}/events`,
        { toast: { silentError: true } },
      );

      return data?.data ?? data;
    },
    async getDocumentPacketRecipients(clientId: string) {
      const tenantId = getTenantId();
      const { data } = await api.get<any>(
        `/tenant/${tenantId}/client-account/${clientId}/document-packets/recipients`,
        { toast: { silentError: true } },
      );

      return data?.data ?? data;
    },

    async createReportSchedule(clientId: string, payload: { name: string; type: string; frequency: string }) {
        const tenantId = getTenantId();
        const { data } = await api.post<any>(`/tenant/${tenantId}/client-account/${clientId}/report-schedules`, payload);
        return data?.data ?? data;
    },
    async deleteReportSchedule(clientId: string, scheduleId: string) {
        const tenantId = getTenantId();
        const { data } = await api.delete<any>(`/tenant/${tenantId}/client-account/${clientId}/report-schedules/${scheduleId}`);
        return data?.data ?? data;
    },

    // ----- Documentos -----------------------------------------------------
    async getClientDocuments(clientId: string, opts: { q?: string; category?: string; type?: string; page?: number; perPage?: number } = {}) {
        const tenantId = getTenantId();
        const params = new URLSearchParams();
        Object.entries(opts).forEach(([k, v]) => { if (v !== undefined && v !== '' && v !== null) params.set(k, String(v)); });
        const qs = params.toString() ? `?${params.toString()}` : '';
        const { data } = await api.get<any>(`/tenant/${tenantId}/client-account/${clientId}/documents${qs}`, { toast: { silentError: true } });
        return data?.data ?? data;
    },
    async createClientDocument(clientId: string, payload: { name: string; mimeType: string; sizeInBytes: number; storageId: string; privateUrl?: string | null; publicUrl?: string | null; fileToken?: string | null; category?: string | null }) {
        const tenantId = getTenantId();
        const body = { ...payload, notableType: 'clientAccount', notableId: clientId };
        const { data } = await api.post<any>(`/tenant/${tenantId}/attachments`, body);
        return data?.data ?? data;
    },
    async deleteClientDocument(attachmentId: string) {
        const tenantId = getTenantId();
        const { data } = await api.delete<any>(`/tenant/${tenantId}/attachments/${attachmentId}`);
        return data?.data ?? data;
    },

    // ----- Incidentes -----------------------------------------------------
    async getClientIncidentsBoard(clientId: string, opts: { from?: string; to?: string; q?: string; sedeId?: string; puestoId?: string; tipo?: string; estado?: string; prioridad?: string; page?: number; perPage?: number } = {}) {
        const tenantId = getTenantId();
        const params = new URLSearchParams();
        Object.entries(opts).forEach(([k, v]) => { if (v !== undefined && v !== '' && v !== null) params.set(k, String(v)); });
        const qs = params.toString() ? `?${params.toString()}` : '';
        const { data } = await api.get<any>(`/tenant/${tenantId}/client-account/${clientId}/incidents-board${qs}`, { toast: { silentError: true } });
        return data?.data ?? data;
    },
    async getIncidentEvidence(clientId: string, incidentId: string) {
        const tenantId = getTenantId();
        const { data } = await api.get<any>(`/tenant/${tenantId}/client-account/${clientId}/incident/${incidentId}/evidence`, { toast: { silentError: true } });
        return (data?.data ?? data)?.items || [];
    },
    async updateIncidentStatus(clientId: string, incidentId: string, workStatus: string) {
        const tenantId = getTenantId();
        const { data } = await api.patch<any>(`/tenant/${tenantId}/client-account/${clientId}/incident/${incidentId}/status`, { workStatus });
        return data?.data ?? data;
    },

    // ----- Personal asignado ----------------------------------------------
    async getClientPersonnel(clientId: string, opts: { sedeId?: string; role?: string; estado?: string; turno?: string; q?: string; page?: number; perPage?: number } = {}) {
        const tenantId = getTenantId();
        const params = new URLSearchParams();
        Object.entries(opts).forEach(([k, v]) => { if (v !== undefined && v !== '' && v !== null) params.set(k, String(v)); });
        const qs = params.toString() ? `?${params.toString()}` : '';
        const { data } = await api.get<any>(`/tenant/${tenantId}/client-account/${clientId}/personnel${qs}`, { toast: { silentError: true } });
        return data?.data ?? data;
    },

    // ----- Horario (schedule grid + assignment CRUD) ----------------------
    async getClientSchedule(clientId: string, opts: { postSiteId?: string; startDate?: string; endDate?: string } = {}) {
        const tenantId = getTenantId();
        const params = new URLSearchParams();
        if (opts.postSiteId) params.set('postSiteId', opts.postSiteId);
        if (opts.startDate) params.set('startDate', opts.startDate);
        if (opts.endDate) params.set('endDate', opts.endDate);
        const qs = params.toString() ? `?${params.toString()}` : '';
        const { data } = await api.get<any>(`/tenant/${tenantId}/client-account/${clientId}/schedule${qs}`, { toast: { silentError: true } });
        return data?.data ?? data;
    },
    async guardAutocomplete(query = '', limit = 200) {
        const tenantId = getTenantId();
        const { data } = await api.get<any>(`/tenant/${tenantId}/security-guard/autocomplete?query=${encodeURIComponent(query)}&limit=${limit}`, { toast: { silentError: true } });
        const arr = (data?.data ?? data) || [];
        return Array.isArray(arr) ? arr.map((g: { id?: string | number; value?: string | number; label?: string; fullName?: string; name?: string }) => ({ id: String(g.id ?? g.value), label: g.label ?? g.fullName ?? g.name ?? '' })) : [];
    },
    async assignGuardToPosition(payload: { guardId: string; stationId: string; positionId: string; startDate?: string; isRelief?: boolean }) {
        const tenantId = getTenantId();
        const { data } = await api.post<any>(`/tenant/${tenantId}/guard-assignment`, { data: payload }, { toast: { silentError: true } });
        return data?.data ?? data;
    },
    async removeGuardAssignment(assignmentId: string) {
        const tenantId = getTenantId();
        const { data } = await api.delete<any>(`/tenant/${tenantId}/guard-assignment/${assignmentId}`, { toast: { silentError: true } });
        return data?.data ?? data;
    },

    // ----- Puestos y cobertura --------------------------------------------
    async getClientCoverage(clientId: string, opts: { postSiteId?: string; horizonMin?: number } = {}) {
        const tenantId = getTenantId();
        const params = new URLSearchParams();
        if (opts.postSiteId) params.set('postSiteId', opts.postSiteId);
        if (opts.horizonMin) params.set('horizonMin', String(opts.horizonMin));
        const qs = params.toString() ? `?${params.toString()}` : '';
        const { data } = await api.get<any>(`/tenant/${tenantId}/client-account/${clientId}/coverage${qs}`, { toast: { silentError: true } });
        return data?.data ?? data;
    },
    async setStationLocation(stationId: string, coords: { lat: number; lng: number; geofenceRadius?: number }) {
        const tenantId = getTenantId();
        const { data } = await api.patch<any>(`/tenant/${tenantId}/station/${stationId}/location`, { latitud: coords.lat, longitud: coords.lng, geofenceRadius: coords.geofenceRadius });
        return data?.data ?? data;
    },

    // ----- Contrato y servicios -------------------------------------------
    async getClientContract(clientId: string) {
        const tenantId = getTenantId();
        const { data } = await api.get<any>(`/tenant/${tenantId}/client-account/${clientId}/contract`, { toast: { silentError: true } });
        return data?.data ?? data;
    },
    async updateClientContract(clientId: string, payload: Record<string, unknown>) {
        const tenantId = getTenantId();
        const { data } = await api.patch<any>(`/tenant/${tenantId}/client-account/${clientId}/contract`, payload);
        return data?.data ?? data;
    },
    async createContractService(clientId: string, payload: Record<string, unknown>) {
        const tenantId = getTenantId();
        const { data } = await api.post<any>(`/tenant/${tenantId}/client-account/${clientId}/contract-services`, payload);
        return data?.data ?? data;
    },
    async updateContractService(clientId: string, serviceId: string, payload: Record<string, unknown>) {
        const tenantId = getTenantId();
        const { data } = await api.put<any>(`/tenant/${tenantId}/client-account/${clientId}/contract-services/${serviceId}`, payload);
        return data?.data ?? data;
    },
    async deleteContractService(clientId: string, serviceId: string) {
        const tenantId = getTenantId();
        const { data } = await api.delete<any>(`/tenant/${tenantId}/client-account/${clientId}/contract-services/${serviceId}`);
        return data?.data ?? data;
    },
    async createContractRenewal(clientId: string, payload: Record<string, unknown>) {
        const tenantId = getTenantId();
        const { data } = await api.post<any>(`/tenant/${tenantId}/client-account/${clientId}/contract-renewals`, payload);
        return data?.data ?? data;
    },
    async updateContractRenewal(clientId: string, renewalId: string, payload: Record<string, unknown>) {
        const tenantId = getTenantId();
        const { data } = await api.put<any>(`/tenant/${tenantId}/client-account/${clientId}/contract-renewals/${renewalId}`, payload);
        return data?.data ?? data;
    },
    async deleteContractRenewal(clientId: string, renewalId: string) {
        const tenantId = getTenantId();
        const { data } = await api.delete<any>(`/tenant/${tenantId}/client-account/${clientId}/contract-renewals/${renewalId}`);
        return data?.data ?? data;
    },

    /**
     * Send (or re-send) a client portal invitation email to the user linked to this client.
     * userId is the user id stored on the clientAccount (client.userId)
     */
    async sendPortalInvitation(userId: string, email?: string): Promise<{ sent: boolean; recipient: string }> {
        const tenantId = getTenantId();
        const body = email ? { email } : {};
        const { data } = await api.post<{ sent: boolean; recipient: string; data?: { sent: boolean; recipient: string } }>(`/tenant/${tenantId}/user/${userId}/send-portal-invitation`, body);
        return data?.data || data;
    },

    /**
     * Send (or re-send) a client portal invitation using the client account id.
     * Works even when the client doesn't have a linked user yet — the backend
     * will create one from the client's email address automatically.
     */
    async sendClientPortalInvitation(clientAccountId: string, email?: string): Promise<{ sent: boolean; recipient: string }> {
        const tenantId = getTenantId();
        const body = email ? { email } : {};
        const { data } = await api.post<{ sent: boolean; recipient: string; data?: { sent: boolean; recipient: string } }>(`/tenant/${tenantId}/client-account/${clientAccountId}/send-portal-invitation`, body);
        return data?.data || data;
    },

    /**
     * Send the "Invitar a la app" Mi Seguridad app-download invitation to a
     * client. Separate from the welcome/portal invitation.
     */
    async sendClientAppInvitation(clientAccountId: string, email?: string): Promise<{ sent: boolean; recipient: string }> {
        const tenantId = getTenantId();
        const body = email ? { email } : {};
        const { data } = await api.post<{ sent: boolean; recipient: string; data?: { sent: boolean; recipient: string } }>(`/tenant/${tenantId}/client-account/${clientAccountId}/send-app-invitation`, body);
        return data?.data || data;
    },
};
