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

const base = () => `/tenant/${getTenantId()}/integrations/gusto`;

export const gustoService = {
  estado: async (): Promise<EstadoDeGusto> => unwrap(await api.get(base())),
  /** `ventana`: se autoriza en una ventanita (la vuelta lo sabrá por el state). */
  conectar: async (ventana = false): Promise<{ url: string }> =>
    unwrap(await api.post(`${base()}/connect`, { ventana })),
  desconectar: async (): Promise<{ desconectado: boolean }> =>
    unwrap(await api.delete(base())),
};

export default gustoService;
