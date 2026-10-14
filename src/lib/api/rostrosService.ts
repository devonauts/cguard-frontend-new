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

export interface RostroRegistrado {
  userId: string;
  nombre?: string;
  estado: EstadoDeRostro;
  fotoUrl?: string | null;
  registradoEn?: string | null;
  revisadoEn?: string | null;
  motivoRechazo?: string | null;
  calidad?: CalidadDelRegistro | null;
}

export interface ListaDeRostros {
  rows: RostroRegistrado[];
  count: number;
  /** Cuántos esperan aprobación, sea cual sea el filtro. */
  pendientes: number;
}

export const rostrosService = {
  listar(estado?: EstadoListable): Promise<ListaDeRostros> {
    const q = estado ? `?estado=${encodeURIComponent(estado)}` : "";

    return ApiService.get(`${base()}${q}`);
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
