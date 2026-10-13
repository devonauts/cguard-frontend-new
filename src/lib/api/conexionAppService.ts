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
  /** Acciones guardadas en el teléfono que aún no llegaron (lo cuenta la app). */
  pendientes?: number | null;
  /** Acciones que el servidor rechazó en las últimas 24 h. */
  rechazadas24h?: number | null;
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
  /**
   * Qué se hizo sin señal sobre ese registro. Un turno es UN registro con dos
   * acciones (entrada y salida): sin esto la etiqueta no sabe cuál fue.
   */
  accion?: string | null;
}

/**
 * Una acción que el teléfono guardó sin señal y que el servidor NO aceptó al
 * llegar (o que la persona quitó del teléfono sin enviarla). Antes se perdía
 * sin rastro; ahora operaciones la ve con su motivo.
 */
export interface AccionRechazada {
  id: string;
  userId: string;
  nombre?: string | null;
  /** `rechazada` = la dijo que no el servidor · `descartada` = la quitó la persona. */
  estado: "rechazada" | "descartada" | string;
  tipo?: string | null;
  etiqueta?: string | null;
  ruta?: string | null;
  metodo?: string | null;
  motivo?: string | null;
  httpStatus?: number | null;
  ocurridoEn?: string | null;
  llegoEn?: string | null;
}

/** Un tramo del rastro GPS que llegó en tanda (grabado sin señal). */
export interface TramoDeRastroSinSenal {
  desde: string;
  hasta: string;
  puntos?: number;
  llegoEn: string;
}

const tid = () => localStorage.getItem("tenantId") || "";
const unwrap = (resp: any) =>
  resp && resp.data !== undefined ? resp.data : resp;
const silencio = { toast: { silentError: true } } as any;
/** Una versión del servidor sin este endpoint todavía: lista vacía, sin error. */
const filasOVacio = (r: any): any[] =>
  Array.isArray(r?.rows) ? r.rows : Array.isArray(r) ? r : [];

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

  /** Acciones rechazadas o quitadas sin enviar; de una persona o de toda la empresa. */
  async rechazadas(opts: { userId?: string; desde?: Date } = {}): Promise<AccionRechazada[]> {
    const p = new URLSearchParams();

    if (opts.userId) p.set("userId", opts.userId);
    if (opts.desde) p.set("desde", opts.desde.toISOString());
    const qs = p.toString();

    try {
      return filasOVacio(
        unwrap(await api.get(`/tenant/${tid()}/sin-senal/rechazadas${qs ? `?${qs}` : ""}`, silencio)),
      );
    } catch {
      return [];
    }
  },

  /** Tramos del rastro GPS que llegaron en tanda (grabados sin señal). */
  async rastro(
    quien: { userId?: string; securityGuardId?: string },
    desde: Date,
    hasta: Date,
  ): Promise<TramoDeRastroSinSenal[]> {
    const p = new URLSearchParams({ desde: desde.toISOString(), hasta: hasta.toISOString() });

    if (quien.userId) p.set("userId", quien.userId);
    if (quien.securityGuardId) p.set("securityGuardId", quien.securityGuardId);

    try {
      return filasOVacio(unwrap(await api.get(`/tenant/${tid()}/sin-senal/rastro?${p}`, silencio)));
    } catch {
      return [];
    }
  },

  async marcas(ids: string[]): Promise<Record<string, MarcaSinSenalDatos>> {
    if (!ids.length) return {};
    const r = unwrap(
      await api.post(`/tenant/${tid()}/sin-senal/marcas`, { ids }, silencio),
    );

    return r?.marcas || {};
  },
};
