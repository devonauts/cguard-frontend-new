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
  /** Mensajes salientes por día, todos los canales juntos (200 por defecto). */
  topeMensajesDia: number;
  responsables: Array<{ id: string; nombre: string }>;
  responsableEfectivo: { id: string; nombre: string } | null;
  /** El WhatsApp de la empresa está conectado y su plantilla aprobada. */
  plantillaWhatsApp: boolean;
  resumen: ResumenDelSeguimiento;
}

export type IdiomaDePlantilla = "es" | "en" | "pt_BR";

export interface PlantillaPorIdioma {
  idioma: IdiomaDePlantilla;
  /** NO_CREADA · PENDING · APPROVED · REJECTED (u otro estado de Meta). */
  estado: string;
  motivo: string | null;
  id: string | null;
}

/**
 * Por dónde escribe el asistente a los vigilantes de ESTA empresa. Decisión
 * de producto: nosotros ponemos la IA, cada empresa pone su WhatsApp. Sin su
 * WhatsApp conectado (o sin la plantilla aprobada), escribe por la app y el
 * SMS. Backend: `services/ai/vigiaProCanales`.
 */
export interface CanalesDeLaEmpresa {
  tieneModulo: boolean;
  whatsapp: {
    conectado: boolean;
    estado: string;
    telefono: string | null;
    nombre: string | null;
    calidad: string | null;
    plantillas: {
      nombre: string;
      conectada: boolean;
      idiomas: PlantillaPorIdioma[];
      aprobada: boolean;
      aprobadas: IdiomaDePlantilla[];
      actualizadoAt: string | null;
    };
    /** Conectado y con la plantilla aprobada en algún idioma. */
    listo: boolean;
  };
  push: boolean;
  sms: boolean;
  topeMensajesDia: number;
  escribePor: Array<"whatsapp" | "push" | "sms">;
  hoy: { enviados: number; tope: number };
  /** Sólo al comprobar: qué se hizo con cada idioma. */
  resultado?: Record<string, string>;
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
    topeMensajesDia?: number,
  ): Promise<{ ajustes: AjustesDelSeguimiento; vigilantes: { activo: boolean }; topeMensajesDia: number }> {
    return ApiService.put(`/tenant/${tenantId()}/vigia-pro/despachador`, {
      ...ajustes,
      ...(vigilantes ? { vigilantes } : {}),
      ...(topeMensajesDia != null ? { topeMensajesDia } : {}),
    });
  },
  /** Por dónde escribe el asistente hoy (lo guardado; no toca a Meta). */
  canales(): Promise<CanalesDeLaEmpresa> {
    return ApiService.get(`/tenant/${tenantId()}/vigia-pro/canales`);
  },
  /** «Volver a comprobar»: pregunta a Meta y crea la plantilla si falta. */
  comprobarCanales(): Promise<CanalesDeLaEmpresa> {
    return ApiService.post(`/tenant/${tenantId()}/vigia-pro/canales/comprobar`, {});
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
