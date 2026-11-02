import { diaDeLaEmpresa, horaDeLaEmpresa, zonaDeLaEmpresa } from "../../../lib/horaDeLaEmpresa";

/**
 * The route's window as the form shows it: date and time IN THE COMPANY'S
 * ZONE. The form saves with `desdeInputFechaHora` (company zone) but the edit
 * page read it back with the browser's clock, so from a browser in another
 * zone every «Actualizar» moved the schedule (00:00–23:59 in Guayaquil came
 * back as 05:00–04:59 from a UTC browser, and shifted again on each save).
 */
export function routeWindowForForm(
  windowStart: string | null | undefined,
  windowEnd: string | null | undefined,
  zone = zonaDeLaEmpresa(),
): { dateFrom: string; startTime: string; dateTo: string; endTime: string } {
  return {
    dateFrom: windowStart ? diaDeLaEmpresa(windowStart, zone) : "",
    startTime: windowStart ? horaDeLaEmpresa(windowStart, zone) : "00:00",
    dateTo: windowEnd ? diaDeLaEmpresa(windowEnd, zone) : "",
    endTime: windowEnd ? horaDeLaEmpresa(windowEnd, zone) : "23:59",
  };
}
