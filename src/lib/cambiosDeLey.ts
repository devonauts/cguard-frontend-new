/**
 * THE LAW'S DATED CHANGES, as the settings page shows them
 * (backend lib/payroll/legalCalendar).
 *
 * The server sends the country's changes; the status of each one is computed
 * HERE from the values on screen, so editing the weekly hours shows at once
 * whether the next legal step will still apply («se aplicará sola») or the
 * company's own value is kept. The chaining is the server's: a Mexican company
 * at 48 h follows 46 → 44 → 42 → 40; one at 45 h keeps 45.
 */
export type CampoFechado = "horasOrdinariasSemana" | "domingoRecargoPct" | "feriadoRecargoPct" | "descansoRecargoPct";

export interface CambioDeLey {
  id: string;
  country: string;
  effectiveFrom: string;
  field: CampoFechado;
  from: number;
  to: number;
  sources: string[];
}

export interface AvisoDeConvenio {
  id: string;
  country: string;
  expires: string;
  showFrom: string;
  agreement: string;
  sources: string[];
}

export interface EleccionDeLeyes {
  seguirCambios: boolean;
  omitidos: string[];
}

export type EstadoDelCambio = "seAplica" | "valorPropio" | "omitido" | "apagado";

export interface CambioConEstado extends CambioDeLey {
  estado: EstadoDelCambio;
  /** The company's value right before the date. */
  valorDeLaEmpresa: number;
  /** Already in force (the date has passed). */
  vigente: boolean;
}

export const LEYES_POR_DEFECTO: EleccionDeLeyes = { seguirCambios: true, omitidos: [] };

export function eleccionDe(v: Partial<EleccionDeLeyes> | null | undefined): EleccionDeLeyes {
  return {
    seguirCambios: v?.seguirCambios !== false,
    omitidos: Array.isArray(v?.omitidos) ? [...new Set(v!.omitidos.map(String))] : [],
  };
}

export function estadoDeLosCambios(
  politica: Partial<Record<CampoFechado, number | undefined>>,
  cambios: CambioDeLey[],
  leyes: EleccionDeLeyes,
  hoy: string,
): CambioConEstado[] {
  const actual: Record<string, number> = {};
  for (const c of cambios) if (!(c.field in actual)) actual[c.field] = Number(politica[c.field]) || 0;
  const orden = [...cambios].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.field.localeCompare(b.field));
  return orden.map((c) => {
    const valor = actual[c.field];
    let estado: EstadoDelCambio;
    if (Math.abs(valor - c.from) > 1e-9) estado = "valorPropio";
    else if (!leyes.seguirCambios) estado = "apagado";
    else if (leyes.omitidos.includes(c.id)) estado = "omitido";
    else estado = "seAplica";
    if (estado === "seAplica") actual[c.field] = c.to;
    return { ...c, estado, valorDeLaEmpresa: valor, vigente: c.effectiveFrom <= hoy };
  });
}

/** The next change of one field that will apply, or the last one already in force. */
export function cambioDelCampo(cambios: CambioConEstado[], campo: CampoFechado): CambioConEstado | null {
  const delCampo = cambios.filter((c) => c.field === campo && c.estado === "seAplica");
  return delCampo.find((c) => !c.vigente) || delCampo.filter((c) => c.vigente).pop() || null;
}

/** Turns «skip this change» on or off. */
export function conOmitido(leyes: EleccionDeLeyes, id: string, omitir: boolean): EleccionDeLeyes {
  const set = new Set(leyes.omitidos);
  if (omitir) set.add(id);
  else set.delete(id);
  return { ...leyes, omitidos: [...set] };
}
