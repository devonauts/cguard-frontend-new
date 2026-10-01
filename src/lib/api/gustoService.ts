import i18n from "@/i18n";
/**
 * GUSTO — la nómina de EE. UU. de la empresa. Ver `backend/api/gusto`.
 * Hoy: conectar, ver el estado y desconectar.
 */
import api from "../api";

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

const unwrap = <T,>(r: unknown): T =>
  ((r as { data?: T })?.data ?? (r as T));

export interface EstadoDeGusto {
  configurado: boolean;
  /** La empresa es de EE. UU. */
  disponible: boolean;
  conectado: boolean;
  estado: "active" | "error" | "disconnected" | null;
  entorno: "demo" | "production";
  compania: { uuid: string | null; nombre: string | null } | null;
  conectadoEn: string | null;
  ultimaSync: string | null;
  errorCodigo: string | null;
}

export type Senal = "email" | "name" | "dob";
export type RolEnNomina = "vigilante" | "supervisor" | "oficina";

export interface FilaDePersona {
  userId: string;
  nombre: string;
  email: string | null;
  rol: RolEnNomina;
  vinculo: {
    gustoUuid: string;
    gustoNombre: string | null;
    matchedBy: string;
    senales: Senal[];
    confirmadoEn: string | null;
    huerfano: boolean;
  } | null;
  sugerencia: { gustoUuid: string; nombre: string; senales: Senal[]; fuerza: "solida" | "posible" } | null;
}

export interface EmpleadoDeGusto {
  uuid: string;
  nombre: string;
  email: string | null;
  incorporado: boolean;
  trabajos: Array<{ uuid: string; titulo: string | null; principal: boolean; tarifa: string | null; unidad: string | null }>;
  vinculadoA: string | null;
}

export interface ListadoDeGusto {
  personas: FilaDePersona[];
  empleados: EmpleadoDeGusto[];
  resumen: {
    personas: number; vinculadas: number; solidas: number; posibles: number;
    sinPareja: number; huerfanas: number; gustoSinPareja: number;
  };
}

const base = () => `/tenant/${getTenantId()}/integrations/gusto`;

export const gustoService = {
  estado: async (): Promise<EstadoDeGusto> => unwrap(await api.get(base())),
  /** `ventana`: se autoriza en una ventanita (la vuelta lo sabrá por el state). */
  conectar: async (ventana = false): Promise<{ url: string }> =>
    unwrap(await api.post(`${base()}/connect`, { ventana })),
  desconectar: async (): Promise<{ desconectado: boolean }> =>
    unwrap(await api.delete(base())),
  /** Fase 2: la gente de la empresa frente a los empleados de Gusto. */
  empleados: async (): Promise<ListadoDeGusto> => unwrap(await api.get(`${base()}/employees`)),
  vincular: async (
    userId: string,
    gustoEmployeeUuid: string | null,
    extra: { matchedBy?: "manual" | "suggested"; senales?: Senal[] } = {},
  ): Promise<{ vinculado: boolean }> =>
    unwrap(await api.put(`${base()}/employees/${userId}`, { gustoEmployeeUuid, ...extra })),
  aceptarSugerencias: async (): Promise<{ aceptadas: number }> =>
    unwrap(await api.post(`${base()}/employees/accept-suggestions`, {})),
};

export default gustoService;
