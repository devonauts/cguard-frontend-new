import { soloFecha, soloFechaCivil } from "@/lib/horaDeLaEmpresa";

/**
 * The day a payment was received, as the office typed it. «Registrar pago»
 * stores the picked date as UTC midnight of that civil date: read as an
 * instant in the company zone (UTC-5) it showed the day before (QA retest
 * 2026-11-02). A payment stamped by a gateway is a real instant and is read in
 * the company's day. Same rule as the server (clientBilling paymentCivilDate).
 */
export function fechaDePago(valor: string | Date | null | undefined): string {
  if (valor == null || valor === "") return soloFecha(null);
  const iso = valor instanceof Date ? (Number.isNaN(valor.getTime()) ? "" : valor.toISOString()) : String(valor);

  return /T00:00:00(\.000)?Z$/.test(iso) || /^\d{4}-\d{2}-\d{2}$/.test(iso) ? soloFechaCivil(iso) : soloFecha(valor);
}
