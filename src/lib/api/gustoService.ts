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
  /** Los avisos de Gusto (webhooks) de la plataforma: si llegan y el último. */
  avisos?: { estado: string; ultimoAviso: string | null } | null;
}

export type Senal = "email" | "name" | "dob";
export type RolEnNomina = "vigilante" | "supervisor" | "oficina";
/** Cómo le paga Gusto: por hora, sueldo fijo (sólo extras) o sueldo fijo exento (ninguna hora). */
export type ComoPaga = "hora" | "asalariado" | "exento" | "contratista" | "contratista_fijo";
export type TipoEnGusto = "Employee" | "Contractor";
export type FuenteDeTurno = "guard" | "supervisor" | "staff";
export type CategoriaLibre = "vacaciones" | "enfermedad" | "permiso";

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
    comoPaga: ComoPaga | null;
    gustoEstado?: string | null;
    tipo?: TipoEnGusto;
    jobsPorFuente?: Partial<Record<FuenteDeTurno, string>> | null;
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
  comoPaga: ComoPaga | null;
  tipo?: TipoEnGusto;
}

export interface ListadoDeGusto {
  personas: FilaDePersona[];
  empleados: EmpleadoDeGusto[];
  resumen: {
    personas: number; vinculadas: number; solidas: number; posibles: number;
    sinPareja: number; huerfanas: number; gustoSinPareja: number;
  };
}

export type ReglaDeExtras = "federal" | "california" | "none";

export interface AjustesDeHoras {
  regla: ReglaDeExtras;
  semanaEmpieza: number;
  zona: string;
  /** Regla de cada puesto (postSiteId → regla) encima de la de la empresa. */
  reglasPorPuesto: Record<string, ReglaDeExtras>;
  /** Política de Gusto para cada clase de tiempo libre pagado (null = no se envía). */
  politicasDeTiempoLibre: Record<CategoriaLibre, string | null>;
}

export interface OpcionesDeAjustes {
  puestos: Array<{ id: string; nombre: string; ciudad: string | null; direccion: string | null }>;
  politicas: Array<{ uuid: string; nombre: string; tipo: string }>;
}

export interface PeriodoDePago {
  payScheduleUuid: string;
  calendario: string | null;
  inicio: string;
  fin: string;
  procesada: boolean;
  fechaDePago: string | null;
  fechaLimite: string | null;
}

export interface VistaPreviaDeHoras {
  periodo: { inicio: string; fin: string };
  ajustes: AjustesDeHoras;
  personas: Array<{
    userId: string;
    nombre: string;
    rol: RolEnNomina;
    vinculado: boolean;
    turnos: number;
    regular: number;
    extra: number;
    doble: number;
    porRevisar: number;
    comoPaga: ComoPaga | null;
    /** Tiempo libre pagado del periodo, en horas. */
    libre?: { vacaciones: number; enfermedad: number; permiso: number; dias: number };
    /** Gusto le acepta las horas pero lo deja FUERA de la nómina. */
    fueraDeNomina: "sin_alta" | "antes_de_contratar" | null;
  }>;
  resumen: {
    personas: number; turnos: number; regular: number; extra: number; doble: number;
    sinVincular: number; porRevisar: number; exentos: number; asalariados: number; fueraDeNomina: number;
    contratistasFijos?: number;
    libre?: { vacaciones: number; enfermedad: number; permiso: number; diasSinPolitica: number };
    /** Lo que falta por mandar respecto a lo ya enviado. */
    porEnviar: { nuevos: number; cambiados: number; retirar: number };
  };
}

export interface EnvioDeHoras {
  id: string;
  inicio: string;
  fin: string;
  estado: "running" | "done" | "failed";
  cuenta: {
    creados: number; actualizados: number; borrados: number; iguales: number; fallidos: number; sinVincular: number;
    /** Turnos de personas exentas en Gusto: no se envían (Gusto ignora sus horas). */
    exentos?: number;
    libreEnviados?: number;
    libreRetirados?: number;
    libreSinPolitica?: number;
    /** Por dónde llegó el tiempo libre: solicitudes aprobadas, o directo en la nómina. */
    libreVia?: "solicitudes" | "nomina";
    /** Clasificaciones que Gusto conservaba de un envío anterior y se pusieron a 0. */
    sobrantes?: number;
  } | null;
  /** Errores, y notas (`tipo: "sobrante"`) de lo que se corrigió en Gusto. */
  errores: Array<{ userId?: string; turno?: string; mensaje: string; tipo?: "sobrante"; persona?: string; clase?: string; horas?: number }>;
  sincronizacion: string | null;
  empezadoEn: string | null;
  terminadoEn: string | null;
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
  /** Fase 3: las horas aprobadas a la nómina de Gusto. */
  ajustesDeHoras: async (): Promise<AjustesDeHoras> => unwrap(await api.get(`${base()}/hours/settings`)),
  opcionesDeAjustes: async (): Promise<OpcionesDeAjustes> => unwrap(await api.get(`${base()}/hours/options`)),
  asignarTrabajos: async (userId: string, jobsPorFuente: Partial<Record<FuenteDeTurno, string | null>>): Promise<{ jobsPorFuente: Record<string, string> }> =>
    unwrap(await api.put(`${base()}/employees/${userId}/jobs`, { jobsPorFuente })),
  guardarAjustesDeHoras: async (cambios: Partial<Pick<AjustesDeHoras, "regla" | "semanaEmpieza" | "reglasPorPuesto" | "politicasDeTiempoLibre">>): Promise<AjustesDeHoras> =>
    unwrap(await api.put(`${base()}/hours/settings`, cambios)),
  periodosDePago: async (): Promise<PeriodoDePago[]> => unwrap(await api.get(`${base()}/hours/pay-periods`)),
  vistaPrevia: async (inicio: string, fin: string): Promise<VistaPreviaDeHoras> =>
    unwrap(await api.get(`${base()}/hours/preview`, { params: { start: inicio, end: fin } })),
  enviarHoras: async (inicio: string, fin: string, payScheduleUuid: string | null): Promise<{ envioId: string }> =>
    unwrap(await api.post(`${base()}/hours/send`, { start: inicio, end: fin, payScheduleUuid })),
  envios: async (): Promise<EnvioDeHoras[]> => unwrap(await api.get(`${base()}/hours/runs`)),
};

export default gustoService;
