import { ApiService } from "@/services/api/apiService";

/**
 * VIGIA PRO — el seguimiento automático: VigIA escribe al vigilante cuando
 * algo no cuadra y cierra el caso (falta, relevo) o lo pasa a una persona.
 * Backend: `api/vigiaPro` y `services/ai/despachador`.
 */
const tenantId = (): string => {
  const t = localStorage.getItem("tenantId");

  if (!t) throw new Error("tenant");

  return t;
};

export type TipoDeCaso =
  | "sin_fichar"
  | "salio_de_zona"
  | "salida_anticipada"
  | "sin_actividad"
  | "confirmar_turno";

export const TIPOS_DE_CASO: TipoDeCaso[] = [
  "sin_fichar",
  "salio_de_zona",
  "salida_anticipada",
  "sin_actividad",
  "confirmar_turno",
];

export interface AjustesDelSeguimiento {
  activo: boolean;
  casos: Record<TipoDeCaso, { activo: boolean; minutos: number }>;
  esperaRespuestaMin: number;
  reintentos: number;
  esperaLlegadaMaxMin: number;
  cobertura: "autonoma" | "aprobacion" | "no";
  responsableUserId: string | null;
  canales: { whatsapp: boolean; push: boolean; sms: boolean };
}

export interface ResumenDelSeguimiento {
  dias: number;
  total: number;
  resueltosSolos: number;
  escalados: number;
  abiertos: number;
  faltas: number;
  relevos: number;
  llegaron: number;
  porTipo: Record<string, number>;
}

export interface EstadoDelSeguimiento {
  tieneModulo: boolean;
  ajustes: AjustesDelSeguimiento;
  responsables: Array<{ id: string; nombre: string }>;
  responsableEfectivo: { id: string; nombre: string } | null;
  plantillaWhatsApp: boolean;
  resumen: ResumenDelSeguimiento;
}

export interface LineaDelCaso {
  at: string;
  evento: string;
  texto: string | null;
  motivo: string | null;
  canal: string | null;
  resolucion: string | null;
  minutos: number | null;
}

export interface CasoDelSeguimiento {
  id: string;
  tipo: TipoDeCaso;
  estado: "abierto" | "esperando" | "resuelto" | "escalado" | "cerrado";
  resolucion: string | null;
  intentos: number;
  canal: string | null;
  vigilante: string | null;
  guardUserId: string;
  puesto: string | null;
  stationId: string | null;
  coverageEventId: string | null;
  createdAt: string;
  resueltoAt: string | null;
  respondioAt: string | null;
  timeline: LineaDelCaso[];
}

export type FiltroDeCasos = "abiertos" | "escalado" | "todos";

export const vigiaProService = {
  leer(): Promise<EstadoDelSeguimiento> {
    return ApiService.get(`/tenant/${tenantId()}/vigia-pro/despachador`);
  },
  guardar(ajustes: AjustesDelSeguimiento): Promise<{ ajustes: AjustesDelSeguimiento }> {
    return ApiService.put(`/tenant/${tenantId()}/vigia-pro/despachador`, ajustes);
  },
  casos(filtro: FiltroDeCasos): Promise<{ rows: CasoDelSeguimiento[] }> {
    const estado = filtro === "todos" ? "" : filtro;

    return ApiService.get(`/tenant/${tenantId()}/vigia-pro/casos?limit=100${estado ? `&estado=${estado}` : ""}`);
  },
  cerrar(id: string): Promise<{ ok: boolean }> {
    return ApiService.post(`/tenant/${tenantId()}/vigia-pro/casos/${id}/cerrar`, {});
  },
};
