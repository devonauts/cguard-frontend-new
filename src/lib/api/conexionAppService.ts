import api from "../api";

/**
 * Conexión de las apps de campo (vigilante y supervisor): quién tiene señal,
 * desde cuándo no, y qué registros se hicieron sin señal y llegaron después.
 * El servidor lo calcula con la última señal de cada teléfono (socket vivo o
 * cualquier petición de la app). Ver backend services/presenciaApp.
 */

export type TipoDeEpisodio = "sin_senal" | "sin_conexion";

export interface EpisodioDeConexion {
  desde: string;
  hasta: string;
  minutos: number;
  /** Acciones hechas sin señal dentro del hueco que llegaron después. */
  accionesSinSenal: number;
  /** `sin_senal`: se sabe que trabajaba sin cobertura (envió acciones guardadas). */
  tipo: TipoDeEpisodio;
}

export interface EstadoDeConexion {
  userId: string;
  canal: string | null;
  conectado: boolean;
  ultimaSenal: string;
  /** Conectado: desde cuándo. Sin conexión: desde cuándo no. */
  desde: string;
  ultimoEpisodio: EpisodioDeConexion | null;
}

export interface RespuestaDeConexion {
  rows: EstadoDeConexion[];
  umbralMs: number;
  ahora: string;
}

export interface MarcaSinSenalDatos {
  ocurridoEn: string;
  llegoEn: string;
  reloj: string | null;
}

const tid = () => localStorage.getItem("tenantId") || "";
const unwrap = (resp: any) =>
  resp && resp.data !== undefined ? resp.data : resp;
const silencio = { toast: { silentError: true } } as any;

export const conexionAppService = {
  async estado(userIds?: string[]): Promise<RespuestaDeConexion> {
    const qs = userIds?.length
      ? `?userIds=${encodeURIComponent(userIds.join(","))}`
      : "";

    return unwrap(
      await api.get(`/tenant/${tid()}/conexion-app${qs}`, silencio),
    );
  },

  async episodios(
    userId: string,
    desde?: Date,
    hasta?: Date,
  ): Promise<EpisodioDeConexion[]> {
    const p = new URLSearchParams();

    if (desde) p.set("desde", desde.toISOString());
    if (hasta) p.set("hasta", hasta.toISOString());
    const qs = p.toString();
    const r = unwrap(
      await api.get(
        `/tenant/${tid()}/conexion-app/${encodeURIComponent(userId)}/episodios${qs ? `?${qs}` : ""}`,
        silencio,
      ),
    );

    return Array.isArray(r?.rows) ? r.rows : [];
  },

  async marcas(ids: string[]): Promise<Record<string, MarcaSinSenalDatos>> {
    if (!ids.length) return {};
    const r = unwrap(
      await api.post(`/tenant/${tid()}/sin-senal/marcas`, { ids }, silencio),
    );

    return r?.marcas || {};
  },
};
