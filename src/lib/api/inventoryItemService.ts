import api from '@/lib/api';
import axiosInstance from '@/lib/api';

const getTenantId = (): string => {
  const t = localStorage.getItem('tenantId');
  if (!t) throw new Error("No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.");
  return t;
};

export type ItemType =
  | 'radio' | 'arma' | 'chaleco_antibalas' | 'tolete' | 'pito' | 'linterna'
  | 'bitacora' | 'cinto_completo' | 'poncho_de_aguas' | 'detector_de_metales'
  | 'caseta' | 'vehiculo' | 'otro';

export type ItemCondition = 'bueno' | 'regular' | 'dañado';
export type ItemStatus = 'disponible' | 'asignado' | 'en_mantenimiento' | 'retirado';

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  radio: 'Radio',
  arma: 'Arma',
  chaleco_antibalas: 'Chaleco antibalas',
  tolete: 'Tolete',
  pito: 'Pito',
  linterna: 'Linterna',
  bitacora: 'Bitácora',
  cinto_completo: 'Cinto completo',
  poncho_de_aguas: 'Poncho de aguas',
  detector_de_metales: 'Detector de metales',
  caseta: 'Caseta',
  vehiculo: 'Vehículo',
  otro: 'Otro',
};

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  disponible: 'Disponible',
  asignado: 'Asignado',
  en_mantenimiento: 'En mantenimiento',
  retirado: 'Retirado',
};

export const ITEM_CONDITION_LABELS: Record<ItemCondition, string> = {
  bueno: 'Bueno',
  regular: 'Regular',
  dañado: 'Dañado',
};

export const ITEM_STATUS_COLORS: Record<ItemStatus, string> = {
  disponible: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  asignado: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  en_mantenimiento: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  retirado: 'bg-muted text-muted-foreground',
};

export interface InventoryItemPhoto {
  id?: string;
  name: string;
  sizeInBytes?: number;
  privateUrl?: string;
  publicUrl?: string | null;
  downloadUrl?: string;
  new?: boolean;
}

export interface InventoryItem {
  id: string;
  name: string;
  type: ItemType;
  brand?: string;
  modelName?: string;
  serialNumber?: string;
  condition: ItemCondition;
  status: ItemStatus;
  notes?: string;
  expirationDate?: string;
  photos?: InventoryItemPhoto[];
  createdAt?: string;
  updatedAt?: string;
}

export interface InventoryItemInput {
  name: string;
  type: ItemType;
  brand?: string;
  modelName?: string;
  serialNumber?: string;
  condition?: ItemCondition;
  status?: ItemStatus;
  notes?: string;
  expirationDate?: string;
  photos?: InventoryItemPhoto[];
}

const inventoryItemService = {
  async list(params: {
    filter?: Record<string, unknown>;
    limit?: number;
    offset?: number;
    orderBy?: string;
  } = {}): Promise<{ rows: InventoryItem[]; count: number }> {
    const tenantId = getTenantId();
    const query = new URLSearchParams();
    if (params.limit != null) query.append('limit', String(params.limit));
    if (params.offset != null) query.append('offset', String(params.offset));
    if (params.orderBy) query.append('orderBy', params.orderBy);
    const f = params.filter || {};
    Object.entries(f).forEach(([k, v]) => { if (v != null && v !== '') query.append(`filter[${k}]`, String(v)); });
    const { data } = await api.get(`/tenant/${tenantId}/global-inventory?${query.toString()}`);
    return data;
  },

  async get(id: string): Promise<InventoryItem> {
    const tenantId = getTenantId();
    const { data } = await api.get(`/tenant/${tenantId}/global-inventory/${id}`);
    return data;
  },

  async create(payload: InventoryItemInput): Promise<InventoryItem> {
    const tenantId = getTenantId();
    const { data } = await api.post(`/tenant/${tenantId}/global-inventory`, { data: payload });
    return data;
  },

  async update(id: string, payload: Partial<InventoryItemInput>): Promise<InventoryItem> {
    const tenantId = getTenantId();
    const { data } = await api.put(`/tenant/${tenantId}/global-inventory/${id}`, { data: payload });
    return data;
  },

  async delete(ids: string[]): Promise<void> {
    const tenantId = getTenantId();
    await api.delete(`/tenant/${tenantId}/global-inventory`, { data: { ids } });
  },

  async uploadPhoto(file: File): Promise<InventoryItemPhoto> {
    const tenantId = getTenantId();
    const filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const credsResp: any = await api.get(
      `/tenant/${tenantId}/file/credentials?filename=${encodeURIComponent(filename)}&storageId=inventoryItemPhotos`,
    );
    const creds = credsResp && credsResp.data ? credsResp.data : credsResp;

    const uploadUrl = creds?.uploadCredentials?.url ?? creds?.url;
    const fields = creds?.uploadCredentials?.fields;
    if (!uploadUrl) throw new Error('Upload URL not available');

    const form = new FormData();
    if (fields) Object.keys(fields).forEach((k) => form.append(k, fields[k]));
    form.append('filename', filename);
    form.append('file', file);

    const resp = await fetch(uploadUrl, { method: 'POST', body: form });
    if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);

    return {
      new: true,
      name: filename,
      sizeInBytes: file.size,
      privateUrl: creds?.privateUrl ?? null,
      publicUrl: creds?.uploadCredentials?.publicUrl ?? creds?.publicUrl ?? null,
    };
  },

  async autocomplete(search?: string, limit = 100): Promise<{ id: string; label: string; type: string; status: string }[]> {
    const tenantId = getTenantId();
    const query = new URLSearchParams();
    if (search) query.append('query', search);
    query.append('limit', String(limit));
    const { data } = await api.get(`/tenant/${tenantId}/global-inventory/autocomplete?${query.toString()}`);
    return data;
  },
};

export default inventoryItemService;
