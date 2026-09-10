import api from "@/lib/api";

const tenantId = (): string => {
  const t = localStorage.getItem("tenantId");

  if (!t)
    throw new Error(
      "No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.",
    );

  return t;
};

export type ItemType =
  | "boolean"
  | "yes_no"
  | "pass_fail"
  | "slider"
  | "rating"
  | "number"
  | "text"
  | "textarea"
  | "single_select"
  | "multi_select"
  | "photo"
  | "signature"
  | "date"
  | "time"
  | "datetime"
  | "guard_selector"
  | "checkbox"
  | "acknowledgement";

export interface TemplateItem {
  id: string;
  type: ItemType;
  label: string;
  help?: string;
  required?: boolean;
  clientVisible?: boolean;
  weight?: number;
  scale?: {
    min: number;
    max: number;
    step?: number;
    minLabel?: string;
    maxLabel?: string;
  };
  options?: Array<{ value: string; label: string; score?: number }>;
  photo?: { min?: number; max?: number };
  failWhen?: { equals?: any; lt?: number; in?: any[] };
  showIf?: { itemId: string; equals?: any; in?: any[]; isFail?: boolean };
  onFail?: {
    requireNote?: boolean;
    requirePhoto?: boolean;
    offerIncident?: boolean;
    offerTask?: boolean;
    severity?: string;
  };
}
export interface TemplateSection {
  id: string;
  title: string;
  items: TemplateItem[];
}
export interface TemplateContent {
  settings?: {
    requireGuardVerification?: boolean;
    requireNotes?: boolean;
    minPhotos?: number;
  };
  sections: TemplateSection[];
}
export interface InspectionTemplate {
  id: string;
  name: string;
  description?: string | null;
  version: number;
  content: TemplateContent;
  isDefault: boolean;
  active: boolean;
  updatedAt?: string;
}

/**
 * Plantillas de inspección de las paradas de supervisión. Cada guardado que
 * cambia el contenido SUBE la versión: las visitas ya hechas conservan su
 * instantánea y no se ven afectadas.
 */
export const routeInspectionTemplateService = {
  async list(): Promise<InspectionTemplate[]> {
    const { data } = await api.get<any>(
      `/tenant/${tenantId()}/route-inspection-template`,
    );

    return Array.isArray(data?.rows) ? data.rows : [];
  },
  async catalog(): Promise<{
    itemTypes: ItemType[];
    factoryDefault: TemplateContent;
  }> {
    const { data } = await api.get<any>(
      `/tenant/${tenantId()}/route-inspection-template/catalog`,
    );

    return data;
  },
  async find(id: string): Promise<InspectionTemplate> {
    const { data } = await api.get<any>(
      `/tenant/${tenantId()}/route-inspection-template/${id}`,
    );

    return data;
  },
  async create(body: {
    name: string;
    description?: string;
    content: TemplateContent;
    isDefault?: boolean;
  }): Promise<InspectionTemplate> {
    const { data } = await api.post<any>(
      `/tenant/${tenantId()}/route-inspection-template`,
      { data: body },
    );

    return data;
  },
  async update(
    id: string,
    body: Partial<{
      name: string;
      description: string;
      content: TemplateContent;
      isDefault: boolean;
      active: boolean;
    }>,
  ): Promise<InspectionTemplate> {
    const { data } = await api.put<any>(
      `/tenant/${tenantId()}/route-inspection-template/${id}`,
      { data: body },
    );

    return data;
  },
  async destroy(id: string): Promise<void> {
    await api.delete(`/tenant/${tenantId()}/route-inspection-template/${id}`);
  },
};

export default routeInspectionTemplateService;
