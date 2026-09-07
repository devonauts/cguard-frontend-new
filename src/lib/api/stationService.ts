import api from '@/lib/api';
import { cachedFetch, invalidateEntity } from '@/lib/queryClient';
import { PostSiteInput } from '@/lib/validators/post-site';
import type { GuardAssignment } from '@/types';

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
  status: 'active' | 'inactive';
  createdAt?: string;
  updatedAt?: string;
  // station fields
  latitud?: string | number;
  longitud?: string | number;
  stationSchedule?: string | null;
  startingTimeInDay?: string | null;
  finishTimeInDay?: string | null;
  assignedGuards?: GuardAssignment[];
  guardsCount?: number;
  numberOfGuardsInStation?: string | number | null;
  serviceType?: string;
}

export interface PostSiteFilters {
  name?: string;
  clientId?: string;
  categoryId?: string;
  category?: string;
  email?: string;
  phone?: string;
  phoneNumber?: string;
  city?: string;
  country?: string;
  status?: 'active' | 'inactive';
  active?: boolean;
  serviceType?: string;
}

/**
 * Raw row shape returned by the backend `/post-site` and `/stations` endpoints
 * before it is mapped to the frontend `PostSite` shape. All fields optional
 * because the backend omits absent ones and the frontend reads name variants.
 */
export interface RawStationRow {
  id?: string;
  stationName?: string;
  name?: string;
  companyName?: string;
  description?: string;
  client?: { id: string; name: string };
  clientAccount?: { id: string; name: string; lastName?: string; commercialName?: string };
  clientAccountId?: string;
  clientId?: string;
  address?: string;
  secondAddress?: string;
  addressLine2?: string;
  postalCode?: string;
  zipCode?: string;
  city?: string;
  country?: string;
  contactEmail?: string;
  email?: string;
  contactPhone?: string;
  phone?: string;
  fax?: string;
  categoryIds?: string[] | null;
  active?: boolean;
  status?: string;
  latitud?: string | number;
  latitude?: string | number;
  longitud?: string | number;
  longitude?: string | number;
  stationSchedule?: string | null;
  startingTimeInDay?: string | null;
  finishTimeInDay?: string | null;
  assignedGuards?: GuardAssignment[];
  guardsCount?: number;
  numberOfGuardsInStation?: string | number | null;
  serviceType?: string;
  serviceConfig?: unknown;
}

export interface PaginationOptions {
  limit: number;
  offset: number;
}

export interface PostSiteListResponse {
  rows: PostSite[];
  count: number;
}

let globalTenantId: string | null = null;
export const setTenantId = (id: string) => {
  globalTenantId = id;
  localStorage.setItem('tenantId', id);
};

const getTenantId = (): string => {
  if (globalTenantId) return globalTenantId;
  const local = localStorage.getItem('tenantId');
  if (local) {
    globalTenantId = local;
    return local;
  }
  try {
    const w = window as unknown as {
      __APP_AUTH?: {
        tenantId?: string;
        user?: { tenants?: Array<{ tenantId?: string; tenant?: { id?: string; tenantId?: string } }> };
      };
    };
    const info = w.__APP_AUTH;
    if (info) {
      if (info.tenantId) {
        globalTenantId = info.tenantId;
        try { localStorage.setItem('tenantId', info.tenantId); } catch {}
        return info.tenantId;
      }
      const u = info.user;
      if (u && Array.isArray(u.tenants) && u.tenants.length > 0) {
        const t = u.tenants[0];
        const tid = t.tenantId || (t.tenant && (t.tenant.id || t.tenant.tenantId));
        if (tid) {
          globalTenantId = tid;
          try { localStorage.setItem('tenantId', tid); } catch {}
          return tid;
        }
      }
    }
  } catch (e) {}
  throw new Error('El usuario debe estar vinculado a una empresa para continuar.');
};

export interface StationCard {
  id: string;
  nickname: string | null;      // el «nominativo» — título de la tarjeta
  stationName: string;
  postSiteId: string | null;
  postSiteName: string | null;
  clientId: string | null;
  clientName: string | null;
  clientLogoUrl: string | null;
  /** Vigilantes ASIGNADOS al puesto (plantilla del contrato) — no es cobertura. */
  guardCount: number;
  /**
   * ── EL ESTADO DEL PUESTO AHORA MISMO ──────────────────────────────────────
   * `covered`   alguien está fichado en el puesto
   * `at_risk`   se le espera y aún no ficha (dentro de la tolerancia), o falta
   *             parte del relevo en un puesto de dos
   * `uncovered` se le espera y no está, pasada la tolerancia — o hay un hueco
   *             ya declarado
   * `idle`      no hay nadie esperado ahora: fuera de turno
   * `null`      no se pudo calcular (la tarjeta no pinta insignia)
   */
  coverageStatus: 'covered' | 'at_risk' | 'uncovered' | 'idle' | null;
  /** Cuántos hay fichados AHORA. */
  onDutyCount: number;
  /** Cuántos se esperan según el horario. */
  expectedCount: number;
  /** Próxima entrada planificada (24 h) — «Entra 19:00». */
  nextShiftStart: string | null;
  /** Turnos de HOY: «cerrado ahora» no es lo mismo que «sin turnos». */
  shiftsToday: number;
  /** Huecos de cobertura ya declarados por alguien. */
  openGaps: number;
  /**
   * EL TURNO QUE CORRE en el puesto — D día · T tarde · N noche — con el
   * estado de su relevo. «Vigilante en puesto» no dice si ya hubo relevo: el
   * de la noche que sigue fichado a las nueve de la mañana también es «un
   * vigilante en puesto». Lo calcula el backend (lib/turnoActivo).
   */
  shift: StationShift | null;
}

export interface StationShift {
  code: "D" | "T" | "N";
  /** «07:00» / «19:00» en la hora de la empresa. */
  start: string | null;
  end: string | null;
  endsInMin: number | null;
  /** Termina en menos de una hora: el relevo está por llegar. */
  endsSoon: boolean;
  /** La ventana ya terminó y sigue fichado: sin relevo. */
  overdue: boolean;
  /** Nadie fichado; la letra es la del bloque que debería estar. */
  vacant: boolean;
}

const stationService = {
  /** Tarjetas de estación para la vista general (logo del cliente, nominativo, vigilantes). */
  async getStationCards(): Promise<StationCard[]> {
    const tenantId = getTenantId();
    const { data } = await api.get<StationCard[] | { data?: StationCard[] }>(
      `/tenant/${tenantId}/station/cards`,
      { toast: { silentError: true } },
    );
    return Array.isArray(data) ? data : (data?.data ?? []);
  },

  async list(filters: PostSiteFilters = {}, options: PaginationOptions = { limit: 25, offset: 0 }): Promise<PostSiteListResponse> {
    const tenantId = getTenantId();
    // Read-through cache shared by the ~10 pages that list post-sites/stations.
    return cachedFetch(["stations", tenantId, filters, options], async () => {
    const params = new URLSearchParams();
    if (filters.name) params.append('filter[name]', filters.name);
    if (filters.clientId) params.append('filter[clientId]', filters.clientId);
    // allow filtering stations by postSite id (station repository expects filter.postSite)
    const filtersExt = filters as PostSiteFilters & { postSite?: string; postSiteId?: string };
    const postSiteId = filtersExt.postSite || filtersExt.postSiteId || undefined;
    if (postSiteId) params.append('filter[postSite]', postSiteId);
    const categoryToUse = filters.categoryId ?? filters.category;
    if (categoryToUse) params.append('filter[categoryIds]', categoryToUse);
    if (filters.email) {
      params.append('filter[email]', filters.email);
      params.append('filter[contactEmail]', filters.email);
    }
    const phoneToUse = filters.phone ?? filters.phoneNumber;
    if (phoneToUse) {
      params.append('filter[phone]', phoneToUse);
      params.append('filter[contactPhone]', phoneToUse);
    }
    if (filters.city) params.append('filter[city]', filters.city);
    if (filters.country) params.append('filter[country]', filters.country);
    if (typeof filters.status === 'string') {
      params.append('filter[active]', filters.status === 'active' ? 'true' : 'false');
    } else if (typeof filters.active === 'boolean') {
      params.append('filter[active]', filters.active.toString());
    }
    params.append('limit', options.limit.toString());
    params.append('offset', options.offset.toString());
    // If caller asked for stations linked to a postSite, call the stations endpoint
    const useStationsEndpoint = !!postSiteId;
    const endpoint = useStationsEndpoint ? 'stations' : 'post-site';
    const { data } = await api.get<{ rows?: RawStationRow[]; count: number }>(`/tenant/${tenantId}/${endpoint}?${params.toString()}`, { toast: { silentError: true } });
    const mappedRows = (data.rows || []).map((r: RawStationRow) => ({
      id: r.id,
      name: r.stationName ?? r.name ?? '',
      companyName: r.stationName ?? r.companyName ?? undefined,
      description: r.description ?? undefined,
      client: r.client ?? r.clientAccount ?? undefined,
      clientId: r.clientAccountId ?? r.clientId ?? undefined,
      address: r.address ?? '',
      postalCode: r.postalCode ?? r.zipCode ?? undefined,
      city: r.city ?? undefined,
      country: r.country ?? undefined,
      email: r.contactEmail ?? r.email ?? undefined,
      phone: r.contactPhone ?? r.phone ?? undefined,
      fax: r.fax ?? undefined,
      categoryId: Array.isArray(r.categoryIds) && r.categoryIds.length > 0 ? r.categoryIds[0] : undefined,
      categoryIds: Array.isArray(r.categoryIds) ? r.categoryIds : [],
      status: typeof r.active === 'boolean' ? (r.active ? 'active' : 'inactive') : ((r.status as 'active' | 'inactive') ?? 'inactive'),
      latitud: r.latitud ?? r.latitude ?? undefined,
      longitud: r.longitud ?? r.longitude ?? undefined,
      stationSchedule: r.stationSchedule ?? undefined,
      startingTimeInDay: r.startingTimeInDay ?? undefined,
      finishTimeInDay: r.finishTimeInDay ?? undefined,
      assignedGuards: Array.isArray(r.assignedGuards) ? r.assignedGuards : undefined,
      guardsCount: typeof r.guardsCount === 'number' ? r.guardsCount : (Array.isArray(r.assignedGuards) ? r.assignedGuards.length : undefined),
      numberOfGuardsInStation: r.numberOfGuardsInStation ?? undefined,
      serviceType: r.serviceType ?? undefined,
    }));
    return { rows: mappedRows as unknown as PostSite[], count: data.count };
    });
  },

  async get(id: string): Promise<RawStationRow> {
    const tenantId = getTenantId();
    // Use the canonical `/post-site/:id` endpoint directly. Some deployments
    // previously attempted `/stations/:id` first which produced noisy 404s
    // for valid post-site resources; remove that fallback.
    const postSiteUrl = `/tenant/${tenantId}/post-site/${id}`;
    const { data } = await api.get<RawStationRow>(postSiteUrl, { toast: { silentError: true } });
    return data;
  },

  async create(payload: PostSiteInput): Promise<PostSite> {
    const tenantId = getTenantId();
    // The form schema lacks `companyName` and legacy `latitude`/`longitude`;
    // widen access for those.
    const p = payload as PostSiteInput & { companyName?: string; latitude?: string; longitude?: string };
    const body = {
      stationName: p.name ?? undefined,
      // backend requires companyName for post-site creation
      companyName: p.companyName ?? p.name ?? undefined,
      clientAccountId: p.clientId ?? undefined,
      address: p.address ?? undefined,
      secondAddress: p.addressLine2 ?? undefined,
      postalCode: p.postalCode ?? undefined,
      city: p.city ?? undefined,
      country: p.country ?? undefined,
      description: p.description ?? undefined,
      contactEmail: p.email ?? undefined,
      contactPhone: p.phone ?? undefined,
      fax: p.fax ?? undefined,
      categoryIds: p.categoryId ? [p.categoryId] : [],
      active: typeof p.status === 'string' ? p.status === 'active' : true,
      latitud: p.latitud ?? p.latitude ?? undefined,
      longitud: p.longitud ?? p.longitude ?? undefined,
      stationSchedule: p.stationSchedule ?? undefined,
      startingTimeInDay: p.startingTimeInDay ?? undefined,
      finishTimeInDay: p.finishTimeInDay ?? undefined,
      serviceType: p.serviceType ?? undefined,
      serviceConfig: p.serviceConfig ?? undefined,
    };
    const { data } = await api.post(`/tenant/${tenantId}/post-site`, body);
    invalidateEntity("stations");
    return data;
  },

  async update(id: string, payload: Partial<PostSiteInput>): Promise<PostSite> {
    const tenantId = getTenantId();
    // Load existing resource using stationService.get which already handles
    // legacy `/stations/:id` and `/post-site/:id` patterns. If that fails,
    // attempt a direct `/post-site/:id` GET as a last resort and proceed with
    // an empty fallback object so update still attempts to submit.
    let existing: RawStationRow = {};
    try {
      existing = await stationService.get(id);
    } catch (err) {
      console.error(`stationService.update: failed to load existing station/post-site ${id}`, err);
      try {
        const res = await api.get<RawStationRow>(`/tenant/${tenantId}/post-site/${id}`, { toast: { silentError: true } });
        existing = res.data || {};
      } catch (e) {
        console.error(`stationService.update: fallback direct post-site GET also failed for ${id}`, e);
        existing = {};
      }
    }
    const p = payload as Partial<PostSiteInput> & { companyName?: string; latitude?: string; longitude?: string };
    const body = {
      stationName: p.name ?? existing.stationName ?? existing.name,
      // include companyName for backend compatibility
      companyName: p.companyName ?? p.name ?? existing.companyName ?? existing.stationName ?? existing.name,
      clientAccountId: p.clientId ?? existing.clientAccountId ?? existing.clientId,
      address: p.address ?? existing.address,
      secondAddress: p.addressLine2 ?? existing.secondAddress ?? existing.addressLine2,
      postalCode: p.postalCode ?? existing.postalCode ?? existing.zipCode,
      city: p.city ?? existing.city,
      country: p.country ?? existing.country,
      description: p.description ?? existing.description,
      contactPhone: p.phone ?? existing.contactPhone ?? existing.phone,
      fax: p.fax ?? existing.fax,
      categoryIds: p.categoryId ? [p.categoryId] : (existing.categoryIds || []),
      contactEmail: p.email ?? existing.contactEmail ?? existing.email,
      active: typeof p.status === 'string' ? p.status === 'active' : existing.active,
      latitud: p.latitud ?? p.latitude ?? existing.latitud ?? existing.latitude,
      longitud: p.longitud ?? p.longitude ?? existing.longitud ?? existing.longitude,
      stationSchedule: p.stationSchedule ?? existing.stationSchedule,
      startingTimeInDay: p.startingTimeInDay ?? existing.startingTimeInDay,
      finishTimeInDay: p.finishTimeInDay ?? existing.finishTimeInDay,
      serviceType: p.serviceType ?? existing.serviceType ?? undefined,
      serviceConfig: p.serviceConfig ?? existing.serviceConfig ?? undefined,
    };
    const { data } = await api.put(`/tenant/${tenantId}/post-site/${id}`, body);
    invalidateEntity("stations");
    return data;
  },

  async delete(ids: string[]): Promise<void> {
    const tenantId = getTenantId();
    await api.delete(`/tenant/${tenantId}/post-site`, { data: { ids } });
    invalidateEntity("stations");
  },

  async exportPDF(filters: PostSiteFilters = {}): Promise<Blob> {
    const tenantId = getTenantId();
    const params = new URLSearchParams();
    if (filters.name) params.append('filter[name]', filters.name);
    if (filters.clientId) params.append('filter[clientId]', filters.clientId);
    const categoryToUse = filters.categoryId ?? filters.category;
    if (categoryToUse) params.append('filter[categoryIds]', categoryToUse);
    if (filters.email) {
      params.append('filter[email]', filters.email);
      params.append('filter[contactEmail]', filters.email);
    }
    const phoneToUse = filters.phone ?? filters.phoneNumber;
    if (phoneToUse) {
      params.append('filter[phone]', phoneToUse);
      params.append('filter[contactPhone]', phoneToUse);
    }
    if (typeof filters.status === 'string') params.append('filter[active]', filters.status === 'active' ? 'true' : 'false');
    else if (typeof filters.active === 'boolean') params.append('filter[active]', filters.active.toString());
    params.append('format', 'pdf');
    const { data } = await api.get(`/tenant/${tenantId}/post-site/export?${params.toString()}`, { responseType: 'blob' });
    return data;
  },

  async exportExcel(filters: PostSiteFilters = {}): Promise<Blob> {
    const tenantId = getTenantId();
    const params = new URLSearchParams();
    if (filters.name) params.append('filter[name]', filters.name);
    if (filters.clientId) params.append('filter[clientId]', filters.clientId);
    const categoryToUse = filters.categoryId ?? filters.category;
    if (categoryToUse) params.append('filter[categoryIds]', categoryToUse);
    if (filters.email) {
      params.append('filter[email]', filters.email);
      params.append('filter[contactEmail]', filters.email);
    }
    const phoneToUse = filters.phone ?? filters.phoneNumber;
    if (phoneToUse) {
      params.append('filter[phone]', phoneToUse);
      params.append('filter[contactPhone]', phoneToUse);
    }
    if (typeof filters.status === 'string') params.append('filter[active]', filters.status === 'active' ? 'true' : 'false');
    else if (typeof filters.active === 'boolean') params.append('filter[active]', filters.active.toString());
    params.append('format', 'excel');
    const { data } = await api.get(`/tenant/${tenantId}/post-site/export?${params.toString()}`, { responseType: 'blob' });
    return data;
  },

  async import(file: File): Promise<{ success: number; failed: number; errors: any[] }> {
    const tenantId = getTenantId();
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post(`/tenant/${tenantId}/post-site/import`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    return data;
  },

  async activeStatus(postSiteId: string): Promise<{
    stations: Array<{
      id: string;
      stationName: string;
      latitud?: string;
      longitud?: string;
      isActive: boolean;
      activeGuards: Array<{ id: string; securityGuardId: string; fullName: string; isOnDuty: boolean; photoUrl: string | null }>;
      nextShift: { startTime: string; endTime: string; guard: { fullName: string; photoUrl: string | null } | null } | null;
    }>;
  }> {
    const tenantId = getTenantId();
    const { data } = await api.get(`/tenant/${tenantId}/post-site/${postSiteId}/active-status`, { toast: { silentError: true } });
    return data;
  },

  async coverageGaps(postSiteId: string, from: string, to: string): Promise<{
    from: string;
    to: string;
    stations: Array<{
      id: string;
      stationName: string;
      numberOfGuardsInStation: string | null;
      startingTimeInDay: string | null;
      finishTimeInDay: string | null;
      is24h: boolean;
      requiredHoursPerDay: number;
      coverageScore: number;
      gaps: Array<{ day: string; startTime: string; endTime: string; hoursUncovered: number }>;
      coveredPeriods: Array<{ day: string; startTime: string; endTime: string }>;
    }>;
  }> {
    const tenantId = getTenantId();
    const params = new URLSearchParams({ from, to });
    const { data } = await api.get(
      `/tenant/${tenantId}/post-site/${postSiteId}/coverage-gaps?${params}`,
      { toast: { silentError: true } }
    );
    return data;
  },
};

export { stationService };
