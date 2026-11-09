import { ApiService } from "@/services/api/apiService";

/**
 * RECONOCIMIENTO FACIAL (módulo adicional) — las caras registradas.
 *
 * El vigilante registra su cara desde la app; aquí la oficina la aprueba, la
 * rechaza o la reinicia (se borra y el vigilante vuelve a registrarse).
 * Backend: `api/rostros`. Todo responde 402 `addon_required` sin el módulo.
 *
 * `userId` es el id de USUARIO de la persona, no el de su ficha de vigilante
 * (en `securityGuards` viaja como `guardId`).
 */
const tenantId = (): string => {
  const t = localStorage.getItem("tenantId");

  if (!t) throw new Error("tenant");

  return t;
};
const base = () => `/tenant/${tenantId()}/rostros`;

export type EstadoDeRostro =
  | "sin_registro"
  | "pendiente"
  | "aprobado"
  | "rechazado";

/** Los tres estados que se listan (el «sin registro» no tiene fila). */
export type EstadoListable = Exclude<EstadoDeRostro, "sin_registro">;

export interface CalidadDelRegistro {
  /** Cuadros que mandó la app al registrar. */
  cuadros: number;
  /** Cuántos de ellos sirvieron. */
  usables: number;
  /** 0-1: cuánto se parecen entre sí. */
  coherencia: number;
}

/** Una de las fotos que guardó el registro, con sus números. */
export interface FotoDelRegistro {
  url: string | null;
  postura?: "frente" | "izquierda" | "derecha" | null;
  giro?: number | null;
  cabeceo?: number | null;
  nitidez?: number | null;
  luz?: number | null;
  anchoCara?: number | null;
  confianza?: number | null;
  referencia?: boolean;
  /** Posición en la ráfaga (1 = la primera). */
  cuadro?: number | null;
}

/** De dónde vino la captura (sólo en el detalle). */
export interface CapturaDelRegistro {
  app?: string | null;
  plataforma?: string | null;
  version?: string | null;
  build?: string | null;
  dispositivo?: string | null;
  sistema?: string | null;
  agente?: string | null;
  ip?: string | null;
  ubicacion?: { lat: number; lng: number; precision: number | null } | null;
  capturadoEn?: string | null;
}

export interface RafagaDelRegistro {
  total: number | null;
  usables: number | null;
  descartadosPorPersona: number | null;
  giroMin: number | null;
  giroMax: number | null;
  coherencia: number | null;
  motivoFrecuente: string | null;
  seleccionLocal: boolean | null;
}

export interface RostroRegistrado {
  userId: string;
  nombre?: string;
  estado: EstadoDeRostro;
  fotoUrl?: string | null;
  registradoEn?: string | null;
  revisadoEn?: string | null;
  motivoRechazo?: string | null;
  calidad?: CalidadDelRegistro | null;
  /* Sólo en el detalle (`leer`). */
  email?: string | null;
  telefono?: string | null;
  fotos?: FotoDelRegistro[];
  rafaga?: RafagaDelRegistro;
  captura?: CapturaDelRegistro | null;
  revisadoPor?: string | null;
}

export interface ListaDeRostros {
  rows: RostroRegistrado[];
  count: number;
  /** Cuántos esperan aprobación, sea cual sea el filtro. */
  pendientes: number;
}

export const rostrosService = {
  /** The newest `limit` of that state; `count` is the real total. */
  listar(estado?: EstadoListable, limit = 200): Promise<ListaDeRostros> {
    const q = new URLSearchParams({ limit: String(limit) });

    if (estado) q.set("estado", estado);

    return ApiService.get(`${base()}?${q.toString()}`);
  },

  leer(userId: string): Promise<RostroRegistrado> {
    return ApiService.get(`${base()}/${encodeURIComponent(userId)}`);
  },

  aprobar(userId: string): Promise<RostroRegistrado> {
    return ApiService.post(`${base()}/${encodeURIComponent(userId)}/aprobar`, {});
  },

  rechazar(userId: string, motivo?: string | null): Promise<RostroRegistrado> {
    return ApiService.post(`${base()}/${encodeURIComponent(userId)}/rechazar`, {
      data: { motivo: motivo?.trim() || null },
    });
  },

  /** Borra la cara: el vigilante se registra de nuevo desde la app. */
  reiniciar(userId: string): Promise<{ userId: string; estado: "sin_registro" }> {
    return ApiService.delete(`${base()}/${encodeURIComponent(userId)}`);
  },
};
