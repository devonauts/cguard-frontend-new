import i18n from "@/i18n";
import api from "@/lib/api";
import { PostSiteInput } from "@/lib/validators/post-site";
import { cachedFetch } from "@/lib/queryClient";

export interface PostSite {
  id: string;
  name: string;
  clientId: string;
  client?: { id: string; name: string };
  address: string;
  email?: string;
  phone?: string;
  fax?: string;
  categoryId?: string;
  category?: { id: string; name: string };
  status: "active" | "inactive";
  createdAt?: string;
  updatedAt?: string;
  // Extended backend fields
  companyName?: string;
  description?: string;
  contactPhone?: string;
  contactEmail?: string;
  categoryIds?: string[] | null;
  // Station-specific frontend fields
  latitud?: string | number;
  longitud?: string | number;
  startingTimeInDay?: string | null;
  finishTimeInDay?: string | null;
  assignedGuards?: any[];
  guardsCount?: number;
  numberOfGuardsInStation?: string | number | null;
}

/**
 * Raw row shape returned by the backend `business-info` endpoints, before it is
 * mapped to the frontend `PostSite` shape. All fields optional because the
 * backend omits absent ones and the frontend reads several name variants.
 */
export interface RawBusinessInfoRow {
  id?: string;
  companyName?: string;
  name?: string;
  clientAccountId?: string;
  clientId?: string;
  client?: { id: string; name: string };
  clientAccount?: {
    id: string;
    name: string;
    lastName?: string;
    commercialName?: string;
  };
  clientAccountName?: string;
  address?: string;
  secondAddress?: string;
  addressLine2?: string;
  postalCode?: string;
  zipCode?: string;
  city?: string;
  country?: string;
  description?: string;
  contactPhone?: string;
  phone?: string;
  contactEmail?: string;
  email?: string;
  fax?: string;
  categoryIds?: string[] | null;
  active?: boolean;
  status?: string;
  latitud?: string | number;
  latitude?: string | number;
  longitud?: string | number;
  longitude?: string | number;
  startingTimeInDay?: string | null;
  finishTimeInDay?: string | null;
  chargeRate?: number | null;
  payRate?: number | null;
  assignedGuards?: unknown[];
  guardsCount?: number;
  tenantId?: string;
  tenant?: { id?: string; name?: string; tenantId?: string } | string;
  businessName?: string;
  serviceType?: string;
  companyAddress?: string;
  location?: { lat?: number | string; lng?: number | string };
}

export interface PostSiteFilters {
  name?: string;
  clientId?: string;
  // filter stations by their owning post-site (station list reads filter.postSite)
  postSite?: string;
  postSiteId?: string;
  // support both category and categoryId names used across the UI
  categoryId?: string;
  category?: string;
  email?: string;
  // some pages use `phoneNumber`, others `phone`
  phone?: string;
  phoneNumber?: string;
  city?: string;
  country?: string;
  // support both `status` (string) and `active` (boolean) used in different pages
  status?: "active" | "inactive";
  active?: boolean;
}

export interface PaginationOptions {
  limit: number;
  offset: number;
}

export interface PostSiteListResponse {
  rows: PostSite[];
  count: number;
}

// Variable global para almacenar el tenantId
let globalTenantId: string | null = null;

export const setTenantId = (id: string) => {
  globalTenantId = id;
  localStorage.setItem("tenantId", id);
};

const getTenantId = (): string => {
  if (globalTenantId) return globalTenantId;
  const local = localStorage.getItem("tenantId");

  if (local) {
    globalTenantId = local;

    return local;
  }

  // Fallback: try to read from window.__APP_AUTH which AuthProvider sets for debug
  try {
    const w = window as unknown as {
      __APP_AUTH?: {
        tenantId?: string;
        user?: {
          tenants?: Array<{
            tenantId?: string;
            tenant?: { id?: string; tenantId?: string };
          }>;
        };
      };
    };
    const info = w.__APP_AUTH;

    if (info) {
      if (info.tenantId) {
        globalTenantId = info.tenantId;
        try {
          localStorage.setItem("tenantId", info.tenantId);
        } catch {}

        return info.tenantId;
      }
      const u = info.user;

      if (u && Array.isArray(u.tenants) && u.tenants.length > 0) {
        const t = u.tenants[0];
        const tid =
          t.tenantId || (t.tenant && (t.tenant.id || t.tenant.tenantId));

        if (tid) {
          globalTenantId = tid;
          try {
            localStorage.setItem("tenantId", tid);
          } catch {}

          return tid;
        }
      }
    }
  } catch (e) {}

  throw new Error(
    i18n.t(
      "ui.apiService.elUsuarioDebeEstarVinculado",
      "El usuario debe estar vinculado a una empresa para continuar.",
    ),
  );
};

const postSiteService = {
  /**
   * Get paginated list of post sites
   */
  /**
   * Los puestos de servicio, con la MISMA caché de lectura que usa
   * `stationService.list()`.
   *
   * Los dos servicios acaban en el mismo sitio: `/post-site` es un alias
   * literal de `/business-info` en el backend (ver `api/postSite/index.ts`,
   * «Legacy compatibility routes»), así que comparten clave a propósito —
   * `["stations", …]`— y una escritura por cualquiera de los dos refresca a los
   * dos. Las mutaciones de aquí van a `/business-info`, que YA está en
   * `URL_ENTITY_MAP`: la invalidación no hace falta añadirla, ya existía sin
   * que nadie la aprovechara.
   *
   * Once pantallas llaman a este método —entre ellas la pestaña «Puestos y
   * cobertura» de cada cliente— y hasta ahora ninguna se ahorraba nada.
   */
  async list(
    filters: PostSiteFilters = {},
    options: PaginationOptions = { limit: 25, offset: 0 },
  ): Promise<PostSiteListResponse> {
    const tenantIdParaClave = getTenantId();

    return cachedFetch(
      ["stations", tenantIdParaClave, "business-info", filters, options],
      () => this._listSinCache(filters, options),
      20_000,
    );
  },

  async _listSinCache(
    filters: PostSiteFilters = {},
    options: PaginationOptions = { limit: 25, offset: 0 },
  ): Promise<PostSiteListResponse> {
    try {
      const tenantId = getTenantId();
      const params = new URLSearchParams();

      if (filters.name) params.append("filter[name]", filters.name);
      if (filters.clientId) params.append("filter[clientId]", filters.clientId);

      // category may be provided as `category` or `categoryId`
      const categoryToUse = filters.categoryId ?? filters.category;

      if (categoryToUse) {
        // Only send `categoryIds` to avoid ambiguous column errors
        params.append("filter[categoryIds]", categoryToUse);
      }

      // email / phone filters - include common backend field variants
      if (filters.email) {
        params.append("filter[email]", filters.email);
        params.append("filter[contactEmail]", filters.email);
      }
      const phoneToUse = filters.phone ?? filters.phoneNumber;

      if (phoneToUse) {
        params.append("filter[phone]", phoneToUse);
        params.append("filter[contactPhone]", phoneToUse);
      }

      if (filters.city) params.append("filter[city]", filters.city);
      if (filters.country) params.append("filter[country]", filters.country);

      // status can be provided as a string `status` or boolean `active`.
      // Normalize to `filter[active]=true|false` which the backend accepts.
      if (typeof filters.status === "string") {
        params.append(
          "filter[active]",
          filters.status === "active" ? "true" : "false",
        );
      } else if (typeof filters.active === "boolean") {
        params.append("filter[active]", filters.active.toString());
      }

      params.append("limit", options.limit.toString());
      params.append("offset", options.offset.toString());

      if (typeof window !== "undefined") {
        // eslint-disable-next-line no-console
        console.debug("[postSiteService] list params ->", params.toString());
      }
      const { data } = await api.get<{
        rows?: RawBusinessInfoRow[];
        count: number;
      }>(`/tenant/${tenantId}/business-info?${params.toString()}`, {
        toast: { silentError: true },
      });

      // Map backend `business-info` shape to frontend `PostSite` shape
      const mappedRows = (data.rows || []).map((r: RawBusinessInfoRow) => ({
        id: r.id,
        name: r.companyName ?? r.name ?? "",
        companyName: r.companyName,
        description: r.description,

        client: r.client ?? r.clientAccount ?? undefined,
        clientAccount: r.clientAccount ?? r.client ?? undefined,
        clientAccountName: r.clientAccountName ?? undefined,
        address: r.address ?? "",
        secondAddress: r.secondAddress ?? r.addressLine2 ?? "",
        postalCode: r.postalCode ?? r.zipCode ?? undefined,
        city: r.city ?? undefined,
        country: r.country ?? undefined,
        email: r.contactEmail ?? r.email ?? undefined,
        contactEmail: r.contactEmail ?? r.email ?? undefined,
        phone: r.contactPhone ?? r.phone ?? undefined,
        contactPhone: r.contactPhone ?? r.phone ?? undefined,
        fax: r.fax ?? undefined,
        categoryId:
          Array.isArray(r.categoryIds) && r.categoryIds.length > 0
            ? r.categoryIds[0]
            : undefined,
        category: undefined,
        categoryIds: Array.isArray(r.categoryIds) ? r.categoryIds : [],
        status:
          typeof r.active === "boolean"
            ? r.active
              ? "active"
              : "inactive"
            : ((r.status as "active" | "inactive") ?? "inactive"),
        // station-specific fields (backend uses business-info for post-sites)
        latitud: r.latitud ?? r.latitude ?? undefined,
        longitud: r.longitud ?? r.longitude ?? undefined,
        startingTimeInDay: r.startingTimeInDay ?? undefined,
        finishTimeInDay: r.finishTimeInDay ?? undefined,
        assignedGuards: Array.isArray(r.assignedGuards)
          ? r.assignedGuards
          : undefined,
        guardsCount:
          typeof r.guardsCount === "number"
            ? r.guardsCount
            : Array.isArray(r.assignedGuards)
              ? r.assignedGuards.length
              : undefined,
      }));

      return { rows: mappedRows as unknown as PostSite[], count: data.count };
    } catch (error) {
      console.error("Error fetching post sites:", error);
      throw error;
    }
  },

  /**
   * Get a single post site by ID
   */
  async get(id: string): Promise<RawBusinessInfoRow> {
    try {
      const tenantId = getTenantId();
      const { data } = await api.get<RawBusinessInfoRow>(
        `/tenant/${tenantId}/business-info/${id}`,
        {
          // Prevent global interceptor from showing duplicate toasts for not-found errors.
          toast: { silentError: true },
        },
      );

      // Return raw backend object so callers can access fields like companyName, categoryIds, latitud, longitud, etc.
      console.debug("Fetched post site:", data);

      return data;
    } catch (error) {
      console.error("Error fetching post site:", error);
      throw error;
    }
  },

  async create(payload: PostSiteInput): Promise<PostSite> {
    try {
      const tenantId = getTenantId();
      // The form schema uses `latitud`/`longitud`; older callers may still pass
      // `latitude`/`longitude`, so widen for those legacy fallbacks.
      const p = payload as PostSiteInput & {
        latitude?: string;
        longitude?: string;
      };
      const body = {
        companyName: p.name ?? undefined,
        clientId: p.clientId ?? undefined,
        address: p.address ?? undefined,
        secondAddress: p.addressLine2 ?? undefined,
        postalCode: p.postalCode ?? undefined,
        city: p.city ?? undefined,
        country: p.country ?? undefined,
        description: p.description ?? undefined,
        email: p.email ?? undefined,
        contactPhone: p.phone ?? undefined,
        fax: p.fax ?? undefined,
        categoryIds: p.categoryId ? [p.categoryId] : [],
        contactEmail: p.email ?? undefined,
        // Ensure new records default to active = true when status not provided
        active: typeof p.status === "string" ? p.status === "active" : true,
        latitud: p.latitud ?? p.latitude ?? undefined,
        longitud: p.longitud ?? p.longitude ?? undefined,
        /* El horario NO vive en la sede (ver el alta más abajo): son columnas
           de `stations` y el backend las descartaba en silencio. */
      };

      // Debug log to inspect payload sent to backend (helps diagnose 400s for missing fields)
      if (typeof window !== "undefined") {
        // eslint-disable-next-line no-console
        console.debug("[postSiteService] create body ->", body);
      }

      const { data } = await api.post(
        `/tenant/${tenantId}/business-info`,
        body,
      );

      return data;
    } catch (error) {
      console.error("Error creating post site:", error);
      throw error;
    }
  },

  /**
   * Update an existing post site
   */
  async update(id: string, payload: Partial<PostSiteInput>): Promise<PostSite> {
    try {
      const tenantId = getTenantId();
      // Fetch existing record so we can preserve backend-expected fields
      const existingRes = await api.get<RawBusinessInfoRow>(
        `/tenant/${tenantId}/business-info/${id}`,
      );
      const existing: RawBusinessInfoRow = existingRes.data || {};

      // `chargeRate`/`payRate` and `latitude`/`longitude` are legacy/extra
      // fields not on the form schema; widen the access type for them.
      const p = payload as Partial<PostSiteInput> & {
        latitude?: string;
        longitude?: string;
        chargeRate?: number;
        payRate?: number;
      };
      const body = {
        // preserve or override
        companyName: p.name ?? existing.companyName ?? existing.name,
        // backend expects clientAccountId in some endpoints
        clientAccountId:
          p.clientId ?? existing.clientAccountId ?? existing.clientId,
        address: p.address ?? existing.address,
        secondAddress:
          p.addressLine2 ?? existing.secondAddress ?? existing.addressLine2,
        postalCode: p.postalCode ?? existing.postalCode ?? existing.zipCode,
        city: p.city ?? existing.city,
        country: p.country ?? existing.country,
        description: p.description ?? existing.description,
        contactPhone: p.phone ?? existing.contactPhone ?? existing.phone,
        fax: p.fax ?? existing.fax,
        categoryIds: p.categoryId ? [p.categoryId] : existing.categoryIds || [],
        contactEmail: p.email ?? existing.contactEmail ?? existing.email,
        // For updates, only change active when status provided
        active:
          typeof p.status === "string"
            ? p.status === "active"
            : existing.active,
        latitud:
          p.latitud ?? p.latitude ?? existing.latitud ?? existing.latitude,
        longitud:
          p.longitud ?? p.longitude ?? existing.longitud ?? existing.longitude,
        /* El horario NO vive en la sede: `stationSchedule`,
           `startingTimeInDay` y `finishTimeInDay` son columnas de `stations`.
           Se mandaban aquí y el backend las descartaba en silencio (ni el
           modelo ni el `pick` del repositorio las tienen), así que parecía que
           se guardaban y no se guardaba nada. */
        chargeRate:
          p.chargeRate !== undefined
            ? p.chargeRate
            : (existing.chargeRate ?? undefined),
        payRate:
          p.payRate !== undefined ? p.payRate : (existing.payRate ?? undefined),
      };

      const { data } = await api.patch(
        `/tenant/${tenantId}/business-info/${id}`,
        body,
      );

      return data;
    } catch (error) {
      console.error("Error updating post site:", error);
      throw error;
    }
  },

  /**
   * Delete one or multiple post sites
   */
  async delete(ids: string[]): Promise<void> {
    try {
      const tenantId = getTenantId();

      await api.delete(`/tenant/${tenantId}/business-info`, { data: { ids } });
    } catch (error) {
      console.error("Error deleting post sites:", error);
      throw error;
    }
  },

  /**
   * Export post sites as PDF
   */
  async exportPDF(filters: PostSiteFilters = {}): Promise<Blob> {
    try {
      const tenantId = getTenantId();
      const params = new URLSearchParams();

      if (filters.name) params.append("filter[name]", filters.name);
      if (filters.clientId) params.append("filter[clientId]", filters.clientId);
      const categoryToUse = filters.categoryId ?? filters.category;

      if (categoryToUse) {
        params.append("filter[categoryIds]", categoryToUse);
      }
      if (filters.email) {
        params.append("filter[email]", filters.email);
        params.append("filter[contactEmail]", filters.email);
      }
      const phoneToUse = filters.phone ?? filters.phoneNumber;

      if (phoneToUse) {
        params.append("filter[phone]", phoneToUse);
        params.append("filter[contactPhone]", phoneToUse);
      }
      if (typeof filters.status === "string") {
        params.append(
          "filter[active]",
          filters.status === "active" ? "true" : "false",
        );
      } else if (typeof filters.active === "boolean") {
        params.append("filter[active]", filters.active.toString());
      }
      params.append("format", "pdf");

      if (typeof window !== "undefined") {
        // eslint-disable-next-line no-console
        console.debug(
          "[postSiteService] exportPDF params ->",
          params.toString(),
        );
      }
      const { data } = await api.get(
        `/tenant/${tenantId}/business-info/export?${params.toString()}`,
        {
          responseType: "blob",
        },
      );

      return data;
    } catch (error) {
      console.error("Error exporting PDF:", error);
      throw error;
    }
  },

  /**
   * Export post sites as Excel
   */
  async exportExcel(filters: PostSiteFilters = {}): Promise<Blob> {
    try {
      const tenantId = getTenantId();
      const params = new URLSearchParams();

      if (filters.name) params.append("filter[name]", filters.name);
      if (filters.clientId) params.append("filter[clientId]", filters.clientId);
      const categoryExcel = filters.categoryId ?? filters.category;

      if (categoryExcel) {
        params.append("filter[categoryIds]", categoryExcel);
      }
      if (filters.email) {
        params.append("filter[email]", filters.email);
        params.append("filter[contactEmail]", filters.email);
      }
      const phoneExcel = filters.phone ?? filters.phoneNumber;

      if (phoneExcel) {
        params.append("filter[phone]", phoneExcel);
        params.append("filter[contactPhone]", phoneExcel);
      }
      if (typeof filters.status === "string") {
        params.append(
          "filter[active]",
          filters.status === "active" ? "true" : "false",
        );
      } else if (typeof filters.active === "boolean") {
        params.append("filter[active]", filters.active.toString());
      }
      params.append("format", "excel");

      if (typeof window !== "undefined") {
        // eslint-disable-next-line no-console
        console.debug(
          "[postSiteService] exportExcel params ->",
          params.toString(),
        );
      }
      const { data } = await api.get(
        `/tenant/${tenantId}/business-info/export?${params.toString()}`,
        {
          responseType: "blob",
        },
      );

      return data;
    } catch (error) {
      console.error("Error exporting Excel:", error);
      throw error;
    }
  },

  /**
   * Import post sites from CSV/Excel
   */
  async import(
    file: File,
  ): Promise<{ success: number; failed: number; errors: any[] }> {
    try {
      const tenantId = getTenantId();
      const formData = new FormData();

      formData.append("file", file);

      const { data } = await api.post(
        `/tenant/${tenantId}/business-info/import-file`,
        formData,
      );

      return data;
    } catch (error) {
      console.error("Error importing post sites:", error);
      throw error;
    }
  },

  /**
   * Get autocomplete suggestions
   */
  async autocomplete(query: string): Promise<PostSite[]> {
    try {
      const tenantId = getTenantId();
      const { data } = await api.get(
        `/tenant/${tenantId}/business-info/autocomplete`,
        {
          params: { query },
        },
      );

      return data;
    } catch (error) {
      console.error("Error fetching autocomplete:", error);
      throw error;
    }
  },

  // Notes CRUD
  async getPostSiteNotes(
    postSiteId: string,
    pagination: { limit?: number; offset?: number } = { limit: 25, offset: 0 },
  ) {
    const tenantId = getTenantId();
    const params = new URLSearchParams();

    if (pagination.limit !== undefined)
      params.append("limit", String(pagination.limit));
    if (pagination.offset !== undefined)
      params.append("offset", String(pagination.offset));

    const { data } = await api.get<any>(
      `/tenant/${tenantId}/post-site/${postSiteId}/notes?${params.toString()}`,
    );

    return data;
  },

  async createPostSiteNote(
    postSiteId: string,
    payload: Record<string, unknown>,
  ) {
    const tenantId = getTenantId();
    const { data } = await api.post<any>(
      `/tenant/${tenantId}/post-site/${postSiteId}/notes`,
      payload,
    );

    return data;
  },

  async updatePostSiteNote(
    postSiteId: string,
    noteId: string,
    payload: Record<string, unknown>,
  ) {
    const tenantId = getTenantId();
    const { data } = await api.put<any>(
      `/tenant/${tenantId}/post-site/${postSiteId}/notes/${noteId}`,
      payload,
    );

    return data;
  },

  async destroyPostSiteNote(postSiteId: string, noteId: string) {
    const tenantId = getTenantId();
    const { data } = await api.delete<any>(
      `/tenant/${tenantId}/post-site/${postSiteId}/notes/${noteId}`,
    );

    return data;
  },

  // Contacts listing for a post site
  async getPostSiteContacts(
    postSiteId: string,
    pagination: { limit?: number; offset?: number } = { limit: 25, offset: 0 },
  ) {
    const tenantId = getTenantId();
    const params = new URLSearchParams();

    if (pagination.limit !== undefined)
      params.append("limit", String(pagination.limit));
    if (pagination.offset !== undefined)
      params.append("offset", String(pagination.offset));

    const { data } = await api.get<any>(
      `/tenant/${tenantId}/post-site/${postSiteId}/contacts?${params.toString()}`,
      { toast: { silentError: true } },
    );

    return data;
  },
};

export { postSiteService };
