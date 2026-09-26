import i18n from "@/i18n";
import api from "@/lib/api";
import { descargarInforme } from "@/lib/export/serverDownload";
import type { ExportFormat } from "@/lib/export/reportExport";

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

export interface VisitorLogFilters {
  id?: string;
  idNumber?: string;
  lastName?: string;
  firstName?: string;
  visitDateRange?: [string | undefined | null, string | undefined | null];
  exitTimeRange?: [string | undefined | null, string | undefined | null];
  query?: string;
  clientId?: string;
  postSiteId?: string;
  stationId?: string;
  guardId?: string;
  placeType?: string;
  tag?: string;
  archived?: boolean;
  /**
   * Opt-in for signed idPhoto/facePhoto thumbnails on list rows. The list is lean by
   * default (no photos); set this only on surfaces that render the thumbnail
   * (StationVisitors). Backend signs them in ONE batched query when present.
   */
  withPhotos?: boolean;
}

export interface PaginationOptions {
  limit: number;
  offset: number;
}

export const visitorLogService = {
  /**
   * Baja los registros de garita del periodo pedido, en el formato pedido.
   *
   * Lo arma el SERVIDOR y no el navegador a propósito: la pestaña de control
   * vehicular sólo carga 200 filas y filtra las que traen placa en memoria, así
   * que exportar lo que está en pantalla habría bajado un archivo que parece
   * completo y no lo es. El servidor consulta con el filtro puesto.
   */
  async exportar(
    format: ExportFormat,
    opciones: {
      stationId?: string;
      kind: "visitors" | "vehicles";
      from: string;
      to: string;
      nombreBase: string;
    },
  ): Promise<void> {
    const t = getTenantId();
    const qs = new URLSearchParams({
      format,
      kind: opciones.kind,
      from: opciones.from,
      to: opciones.to,
    });
    if (opciones.stationId) qs.set("stationId", opciones.stationId);
    await descargarInforme(`/tenant/${t}/visitor-log/export?${qs.toString()}`, {
      format,
      nombreBase: opciones.nombreBase,
    });
  },

  async list(
    filters: VisitorLogFilters = {},
    options: PaginationOptions = { limit: 25, offset: 0 },
  ) {
    const tenantId = getTenantId();
    const params = new URLSearchParams();

    if (filters.id) params.append("filter[id]", filters.id);
    if (filters.idNumber) params.append("filter[idNumber]", filters.idNumber);
    if (filters.lastName) params.append("filter[lastName]", filters.lastName);
    if (filters.firstName)
      params.append("filter[firstName]", filters.firstName);
    if (filters.query) params.append("filter[query]", filters.query);

    if (filters.clientId) params.append("filter[clientId]", filters.clientId);
    if (filters.postSiteId)
      params.append("filter[postSiteId]", filters.postSiteId);
    if (filters.guardId) params.append("filter[guardId]", filters.guardId);
    if (filters.placeType)
      params.append("filter[placeType]", filters.placeType);
    if (filters.stationId)
      params.append("filter[stationId]", filters.stationId);
    if (filters.tag) params.append("filter[tag]", filters.tag);
    if (typeof filters.archived === "boolean")
      params.append("filter[archived]", filters.archived ? "true" : "false");
    if (filters.withPhotos) params.append("withPhotos", "1");

    if (filters.visitDateRange) {
      const [start, end] = filters.visitDateRange;
      if (start) params.append("filter[visitDateRange][]", start);
      if (end) params.append("filter[visitDateRange][]", end);
    }

    if (filters.exitTimeRange) {
      const [start, end] = filters.exitTimeRange;
      if (start) params.append("filter[exitTimeRange][]", start);
      if (end) params.append("filter[exitTimeRange][]", end);
    }

    params.append("limit", String(options.limit));
    params.append("offset", String(options.offset));

    const { data } = await api.get(
      `/tenant/${tenantId}/visitor-log?${params.toString()}`,
      { toast: { silentError: true } },
    );
    return data;
  },

  async autocomplete(query = "", limit = 10) {
    const tenantId = getTenantId();
    const qs = new URLSearchParams();
    if (query) qs.append("query", query);
    if (limit) qs.append("limit", String(limit));
    const { data } = await api.get(
      `/tenant/${tenantId}/visitor-log/autocomplete?${qs.toString()}`,
      { toast: { silentError: true } },
    );
    return data;
  },

  async get(id: string) {
    const tenantId = getTenantId();
    const { data } = await api.get(`/tenant/${tenantId}/visitor-log/${id}`, {
      toast: { silentError: true },
    });
    return data;
  },

  async create(payload: Record<string, unknown>) {
    const tenantId = getTenantId();
    const { data } = await api.post(`/tenant/${tenantId}/visitor-log`, {
      data: payload,
    });
    return data;
  },

  async update(id: string, payload: Record<string, unknown>) {
    const tenantId = getTenantId();
    const { data } = await api.put(`/tenant/${tenantId}/visitor-log/${id}`, {
      data: payload,
    });
    return data;
  },

  async delete(ids: string[]) {
    if (!ids || ids.length === 0) return;
    const tenantId = getTenantId();
    // Try JSON body delete first
    try {
      await api.delete(`/tenant/${tenantId}/visitor-log`, { data: { ids } });
      return;
    } catch (e) {
      // fallback endpoints
    }
    await api.post(`/tenant/${tenantId}/visitor-log/delete`, { ids });
  },

  async import(data: unknown, importHash?: string) {
    const tenantId = getTenantId();
    const body: Record<string, unknown> = { data };
    if (importHash) body.importHash = importHash;
    const { data: resp } = await api.post(
      `/tenant/${tenantId}/visitor-log/import`,
      body,
    );
    return resp;
  },

  /**
   * Upload a visitor photo and return the file metadata object
   * that can be passed as `idPhoto: [result]` to create/update.
   */
  async uploadPhoto(
    file: File,
  ): Promise<{
    name: string;
    privateUrl: string;
    mimeType: string;
    sizeInBytes: number;
    fileToken?: string;
  }> {
    const tenantId = getTenantId();
    const filename = `visitor-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    // 1. Get upload credentials
    const { data: credData } = await api.get(
      `/tenant/${tenantId}/file/credentials?filename=${encodeURIComponent(filename)}&storageId=visitorLogIdPhoto`,
    );
    const uploadUrl = credData?.uploadCredentials?.url;
    if (!uploadUrl) throw new Error(i18n.t("ui.apiService.urlDeCargaNoDisponible", "URL de carga no disponible"));
    // 2. Upload file
    const form = new FormData();
    const fields = credData?.uploadCredentials?.fields || {};
    Object.entries(fields).forEach(([k, v]) => form.append(k, v as string));
    form.append("file", file);
    const uploadResp = await fetch(uploadUrl, { method: "POST", body: form });
    if (!uploadResp.ok) throw new Error(i18n.t("ui.apiService.errorAlSubirArchivo", { defaultValue: "Error al subir el archivo ({{status}}) {{detalle}}", status: uploadResp.status, detalle: "" }).trim());
    return {
      name: file.name,
      privateUrl: credData.privateUrl,
      mimeType: file.type || "image/jpeg",
      sizeInBytes: file.size,
      fileToken: credData.fileToken,
    };
  },
};

export default visitorLogService;
