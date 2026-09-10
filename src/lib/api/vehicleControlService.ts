import { ApiService } from "@/services/api/apiService";

/**
 * Control vehicular: reglas por puesto, ocupación y placas vetadas.
 *
 * Todo es OPCIONAL. Un puesto sin reglas devuelve `enabled: false` y la interfaz
 * simplemente no enseña nada — el registro de entradas y salidas funciona igual.
 */
export interface ReglasVehiculo {
  enabled: boolean;
  capacity: number | null;
  bays: string[];
  maxStayMinutes: number | null;
  blacklistEnabled: boolean;
}

export interface Ocupacion {
  reglas: ReglasVehiculo;
  dentro: number;
  capacidad: number | null;
  libres: number | null;
  lleno: boolean;
  cajonesLibres: string[];
  cajonesOcupados: string[];
}

export interface PlacaVetada {
  id: string;
  plate: string;
  plateLabel?: string | null;
  reason?: string | null;
  stationId?: string | null;
  station?: { id: string; stationName: string } | null;
  active: boolean;
  createdAt?: string;
}

const tid = () => localStorage.getItem("tenantId") || "";
const unwrap = (r: any) => (r?.data !== undefined ? r.data : r);

export const vehicleControlService = {
  ocupacion: (stationId: string): Promise<Ocupacion> =>
    ApiService.get(
      `/tenant/${tid()}/station/${stationId}/vehicle-control`,
    ).then(unwrap),

  guardarReglas: (
    stationId: string,
    reglas: ReglasVehiculo,
  ): Promise<Ocupacion> =>
    ApiService.put(`/tenant/${tid()}/station/${stationId}/vehicle-control`, {
      data: reglas,
    }).then(unwrap),

  listaNegra: (): Promise<{ rows: PlacaVetada[]; count: number }> =>
    ApiService.get(`/tenant/${tid()}/vehicle-blacklist`).then(unwrap),

  vetar: (
    plate: string,
    reason?: string,
    stationId?: string | null,
  ): Promise<PlacaVetada> =>
    ApiService.post(`/tenant/${tid()}/vehicle-blacklist`, {
      data: { plate, reason, stationId: stationId || null },
    }).then(unwrap),

  quitarVeto: (id: string): Promise<void> =>
    ApiService.delete(`/tenant/${tid()}/vehicle-blacklist/${id}`).then(unwrap),
};

export default vehicleControlService;
