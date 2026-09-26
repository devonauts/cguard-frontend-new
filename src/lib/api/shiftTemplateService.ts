import i18n from "@/i18n";
import api from "../api";

/**
 * Shift template API client (Programador · Plantillas de turno). Tenant-scoped;
 * mirrors timeOffRequestService. Replaces the former localStorage-only stub.
 */

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

const buildQuery = (params?: Record<string, unknown>): string => {
  if (!params) return "";
  const p = new URLSearchParams();

  for (const k of Object.keys(params)) {
    const v = params[k];

    if (v === undefined || v === null || String(v).trim() === "") continue;
    p.append(k, String(v));
  }
  const s = p.toString();

  return s ? `?${s}` : "";
};

const unwrap = (resp: any) =>
  resp && resp.data !== undefined ? resp.data : resp;

export interface ShiftTemplate {
  id: string;
  templateName: string;
  startTime: string;
  endTime: string;
  repeatShift: string | null;
  repeatBy: string | null;
  postSiteId: string | null;
  guardId: string | null;
  skillSet: string | null;
  department: string | null;
  breakDuration: string | null;
  note: string | null;
  category: string | null;
  status: string;
}

export interface ShiftTemplateInput {
  templateName: string;
  startTime: string;
  endTime: string;
  repeatShift?: string | null;
  repeatBy?: string | null;
  postSiteId?: string | null;
  guardId?: string | null;
  skillSet?: string | null;
  department?: string | null;
  breakDuration?: string | null;
  note?: string | null;
  category?: string | null;
  status?: string;
}

const shiftTemplateService = {
  async list(
    params?: Record<string, unknown>,
  ): Promise<{ rows: ShiftTemplate[]; count: number }> {
    const t = getTenantId();

    return unwrap(
      await api.get(`/tenant/${t}/shift-template${buildQuery(params)}`),
    );
  },

  async create(data: ShiftTemplateInput): Promise<ShiftTemplate> {
    const t = getTenantId();

    return unwrap(await api.post(`/tenant/${t}/shift-template`, { data }));
  },

  async update(
    id: string,
    data: Partial<ShiftTemplateInput>,
  ): Promise<ShiftTemplate> {
    const t = getTenantId();

    return unwrap(await api.put(`/tenant/${t}/shift-template/${id}`, { data }));
  },

  async remove(id: string): Promise<void> {
    const t = getTenantId();

    await api.delete(`/tenant/${t}/shift-template/${id}`);
  },
};

export default shiftTemplateService;
