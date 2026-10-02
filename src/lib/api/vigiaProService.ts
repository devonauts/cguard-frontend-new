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
  canales: { whatsapp: boolean; push: boolean; sms: boolean; llamada: boolean };
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
  /** Los vigilantes pueden escribirle al asistente por WhatsApp. */
  vigilantes: { activo: boolean };
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

export interface TextoDeParte {
  titulo: string;
  descripcion: string;
  acciones: string;
}

export interface ParteMejorado extends TextoDeParte {
  /** Lo que tenía número (horas, placas, cifras) en el original y no está en el nuevo. */
  faltan: string[];
}

export interface ResumenParaCliente {
  texto: string;
  desde: string;
  hasta: string;
  idioma: string;
  conteos: {
    total: number;
    porPrioridad: Record<string, number>;
    porEstado: Record<string, number>;
    porTipo: Record<string, number>;
    porPuesto: Record<string, number>;
  };
}

/** Los idiomas a los que se traduce un parte (códigos del servidor). */
export const IDIOMAS_DE_PARTE = ["es", "en", "pt-BR", "fr", "de", "it", "nl", "pl"] as const;

/** El idioma de la interfaz en código del servidor (el CRM usa «pt»). */
export const idiomaDelServidor = (lang: string): string => {
  const base = String(lang || "es").split("-")[0];

  return base === "pt" ? "pt-BR" : (IDIOMAS_DE_PARTE as readonly string[]).includes(base) ? base : "es";
};

export const vigiaProService = {
  leer(): Promise<EstadoDelSeguimiento> {
    return ApiService.get(`/tenant/${tenantId()}/vigia-pro/despachador`);
  },
  guardar(
    ajustes: AjustesDelSeguimiento,
    vigilantes?: { activo: boolean },
  ): Promise<{ ajustes: AjustesDelSeguimiento; vigilantes: { activo: boolean } }> {
    return ApiService.put(`/tenant/${tenantId()}/vigia-pro/despachador`, { ...ajustes, ...(vigilantes ? { vigilantes } : {}) });
  },
  casos(filtro: FiltroDeCasos): Promise<{ rows: CasoDelSeguimiento[] }> {
    const estado = filtro === "todos" ? "" : filtro;

    return ApiService.get(`/tenant/${tenantId()}/vigia-pro/casos?limit=100${estado ? `&estado=${estado}` : ""}`);
  },
  cerrar(id: string): Promise<{ ok: boolean }> {
    return ApiService.post(`/tenant/${tenantId()}/vigia-pro/casos/${id}/cerrar`, {});
  },
  /** Mejora ortografía y redacción de un parte sin tocar los hechos. */
  redactar(parte: TextoDeParte): Promise<ParteMejorado> {
    return ApiService.post(`/tenant/${tenantId()}/vigia-pro/partes/redactar`, parte);
  },
  traducir(incidentId: string, idioma: string): Promise<TextoDeParte & { idioma: string; enCache: boolean }> {
    return ApiService.post(`/tenant/${tenantId()}/vigia-pro/partes/${incidentId}/traducir`, { idioma });
  },
  resumen(clientId: string, datos: { dias: number; idioma: string }): Promise<ResumenParaCliente> {
    return ApiService.post(`/tenant/${tenantId()}/vigia-pro/clientes/${clientId}/resumen`, datos);
  },
  enviarResumen(clientId: string, datos: { texto: string; desde: string; hasta: string; idioma: string }): Promise<{ enviado: boolean; a: string }> {
    return ApiService.post(`/tenant/${tenantId()}/vigia-pro/clientes/${clientId}/resumen/enviar`, datos);
  },
};
