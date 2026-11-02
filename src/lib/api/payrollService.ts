import i18n from "@/i18n";
/**
 * TARJETAS DE NÓMINA — generar, aprobar y exportar para pagar.
 *
 * Distinto de `attendanceService`, que trabaja sobre MARCAJES sueltos: aquí la
 * unidad es la TARJETA de una persona en un periodo, que es lo que se paga.
 * Ver `backend/services/payroll/timecardApprovalService`.
 */
import api from "../api";
import { downloadBlob } from "@/lib/export/reportExport";
import { nombreDeContentDisposition } from "@/lib/export/serverDownload";

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

export type EstadoTarjeta = "borrador" | "aprobada" | "exportada";

export interface TarjetaDeNomina {
  id: string;
  userId: string;
  rol: "vigilante" | "supervisor" | "oficina";
  nombre: string | null;
  documento: string | null;
  periodoDesde: string;
  periodoHasta: string;
  estado: EstadoTarjeta;
  moneda: string;
  tarifaCentavos: number | null;
  horas: string | number;
  horasOrdinarias: string | number;
  horasExtra: string | number;
  horasNocturnas: string | number;
  diasTrabajados: number;
  faltas: number;
  sinResolver: number;
  importeCentavos: string | number;
  detalle?: { dias?: DiaDeTarjetaDeNomina[]; totales?: Record<string, unknown> } | null;
  aprobadaEl?: string | null;
  aprobadaPor?: { fullName?: string; firstName?: string; lastName?: string } | null;
}

/**
 * Un día de la tarjeta, tal como lo guarda el servidor (`DiaDeTarjeta`). Sólo
 * lo que la pantalla lee. `horasEnElPuesto` y `descansoMinutos` faltan en las
 * tarjetas generadas antes de pagar netas (2026-10-14): su foto es la que se
 * aprobó y no se inventa.
 */
export interface DiaDeTarjetaDeNomina {
  fecha: string;
  estado: string;
  puesto: string | null;
  real: { entrada: string | null; salida: string | null; horas: number } | null;
  horasEnElPuesto?: number;
  descansoMinutos?: number;
  motivo?: string | null;
  /** A justified absence that is NOT paid (unpaid leave): deducted, never a fault. */
  sinGoce?: boolean;
  /** Ordinary hours turned into overtime by the weekly threshold (US: 40 h). */
  extraSemanal?: number;
  /** Minutes not paid by the company's grace rules. */
  minutosRecortados?: number;
}

export type EstadoGeneracion = "en_cola" | "calculando" | "listo" | "fallo";

export interface GeneracionDeTarjetas {
  id: string;
  estado: EstadoGeneracion;
  periodo: Periodo;
  creadas: number | null;
  actualizadas: number | null;
  intactas: number | null;
  /** `true` = no había cambios desde la última vez y no se recalculó. */
  sinCambios: boolean;
  /** Ya traducido, en el idioma de quien pregunta. Sólo cuando falló. */
  error: string | null;
}

export interface Periodo {
  desde: string;
  hasta: string;
}

/**
 * Descarga un archivo que arma el SERVIDOR por POST.
 *
 * `descargarInforme` sólo sabe hacer GET, y estas exportaciones van por POST
 * porque llevan la SELECCIÓN de tarjetas en el cuerpo: una lista de ids no cabe
 * con garantías en una URL, y aquí la selección es el punto — se exporta lo que
 * el usuario marcó, no todo el periodo.
 */
async function descargarPost(
  url: string,
  cuerpo: unknown,
  nombreDeReserva: string,
): Promise<Record<string, string>> {
  const resp = await api.post<Blob>(url, cuerpo, {
    responseType: "blob",
  } as never);
  const blob: Blob =
    (resp as { data?: Blob })?.data ?? (resp as unknown as Blob);
  const cabeceras =
    (resp as { headers?: Record<string, string> })?.headers || {};
  const nombre =
    nombreDeContentDisposition(
      cabeceras["content-disposition"] || cabeceras["Content-Disposition"],
    ) || nombreDeReserva;

  downloadBlob(nombre, blob);

  return cabeceras;
}

/**
 * What stayed out of a pay export, from its X-Payroll-* headers (pure;
 * exported for tests). A card without a rate is not paid, and the screen has
 * to say so next to the download instead of «Nómina exportada».
 */
export function resultadoDeExportacion(cabeceras: Record<string, string> | undefined): {
  incluidas: number | null;
  rechazadas: number;
  motivos: string[];
} {
  const h = cabeceras || {};
  const leer = (k: string) => h[k] ?? h[k.toLowerCase()];
  const incluidas = leer("X-Payroll-Included");
  let motivos: string[] = [];

  try {
    const crudo = leer("X-Payroll-Rejected-Reasons");
    const lista = crudo ? JSON.parse(decodeURIComponent(crudo)) : [];

    motivos = Array.isArray(lista) ? lista.map(String) : [];
  } catch {
    motivos = [];
  }

  return {
    incluidas: incluidas == null ? null : Number(incluidas) || 0,
    rechazadas: Number(leer("X-Payroll-Rejected")) || 0,
    motivos,
  };
}

const payrollService = {
  /** Las tarjetas de un periodo. */
  async listar(
    periodo: Periodo,
    filtros?: { estado?: EstadoTarjeta; rol?: string },
  ): Promise<{ rows: TarjetaDeNomina[]; count: number }> {
    const t = getTenantId();
    const q = new URLSearchParams({ desde: periodo.desde, hasta: periodo.hasta });

    if (filtros?.estado) q.set("estado", filtros.estado);
    if (filtros?.rol) q.set("rol", filtros.rol);

    return unwrap(
      await api.get(`/tenant/${t}/payroll/timecards?${q.toString()}`),
    );
  },

  /**
   * Pide calcular el periodo. No toca lo aprobado ni lo exportado.
   *
   * YA NO DEVUELVE EL RESULTADO: el cálculo es pesado y lo hace el servidor en
   * segundo plano. Devuelve el id del trabajo; `estadoGeneracion` dice cómo va.
   * Un periodo cerrado se rechaza aquí mismo, sin esperar a nada.
   */
  async generar(periodo: Periodo): Promise<{ id: string; estado: EstadoGeneracion }> {
    const t = getTenantId();

    return unwrap(
      // The page shows its own error toast; without this the API client
      // showed the same message a second time.
      await api.post(
        `/tenant/${t}/payroll/timecards/generate`,
        { data: periodo },
        { toast: { silentError: true } } as any,
      ),
    );
  },

  /** Cómo va un cálculo pedido con `generar`. */
  async estadoGeneracion(id: string): Promise<GeneracionDeTarjetas> {
    const t = getTenantId();

    return unwrap(
      await api.get(
        `/tenant/${t}/payroll/timecards/generate/${encodeURIComponent(id)}`,
      ),
    );
  },

  async aprobar(
    ids: string[],
    opciones?: { forzar?: boolean; nota?: string },
  ): Promise<{
    aprobadas: number;
    rechazadas: Array<{ id: string; motivo: string }>;
  }> {
    const t = getTenantId();

    return unwrap(
      await api.post(`/tenant/${t}/payroll/timecards/approve`, {
        data: { ids, ...opciones },
      }),
    );
  },

  async reabrir(
    ids: string[],
  ): Promise<{
    reabiertas: number;
    rechazadas: Array<{ id: string; motivo: string }>;
  }> {
    const t = getTenantId();

    return unwrap(
      await api.post(`/tenant/${t}/payroll/timecards/reopen`, { data: { ids } }),
    );
  },

  /**
   * CSV resumen. Marca las tarjetas como exportadas. Dice cuántas quedaron
   * fuera y por qué; si no sale ninguna, el servidor responde un error.
   */
  async exportar(ids: string[], periodo: Periodo): Promise<ReturnType<typeof resultadoDeExportacion>> {
    const t = getTenantId();

    return resultadoDeExportacion(
      await descargarPost(
        `/tenant/${t}/payroll/timecards/export?desde=${periodo.desde}&hasta=${periodo.hasta}`,
        { data: { ids } },
        `nomina-${periodo.desde}_${periodo.hasta}.csv`,
      ),
    );
  },

  /**
   * Pone la tarifa de una o más personas.
   *
   * Escribe en la ficha de EMPLEO, que la tienen las tres poblaciones: un
   * supervisor y alguien de oficina también cobran, y antes no había dónde
   * ponerles la tarifa. No recalcula lo ya aprobado — eso lleva su propia foto.
   */
  async ponerTarifas(
    tarifas: Array<{ userId: string; hourlyRateCents: number | null }>,
  ): Promise<{ actualizadas: number; noEncontradas: string[] }> {
    const t = getTenantId();

    return unwrap(
      await api.put(`/tenant/${t}/payroll/rates`, { data: { tarifas } }),
    );
  },

  /** CSV día a día. No cambia el estado: se descarga las veces que haga falta. */
  async exportarDetalle(ids: string[], periodo: Periodo): Promise<void> {
    const t = getTenantId();

    await descargarPost(
      `/tenant/${t}/payroll/timecards/export/detail?desde=${periodo.desde}&hasta=${periodo.hasta}`,
      { data: { ids } },
      `nomina-detalle-${periodo.desde}_${periodo.hasta}.csv`,
    );
  },
};

export default payrollService;
