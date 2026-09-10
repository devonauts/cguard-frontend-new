/**
 * ════════════════════════════════════════════════════════════════════════════
 * DESCARGAR UN INFORME QUE ARMA EL SERVIDOR
 *
 * Los informes grandes no se arman en el navegador: el navegador sólo tiene las
 * filas que alcanzó a cargar, y una exportación recortada a la primera página
 * es peor que no tener exportación, porque parece completa. Esos endpoints
 * devuelven el archivo ya hecho (ver `backend/services/reportExportService`).
 *
 * ── QUÉ ARREGLA ESTE MÓDULO ────────────────────────────────────────────────
 * Ocho pantallas repetían las mismas quince líneas —pedir el blob, crear un
 * `<a>`, pulsarlo, revocar la URL— y las ocho ADIVINABAN el nombre del archivo
 * en vez de leer el que manda el servidor. Se notaba: la bitácora de accesos
 * bajaba siempre como `.csv` aunque pidieras el PDF, porque el nombre estaba
 * escrito a mano en la pantalla.
 *
 * Aquí el nombre sale de `Content-Disposition`, que es quien lo sabe. Sólo se
 * cae al nombre de reserva si la cabecera no llega.
 * ════════════════════════════════════════════════════════════════════════════
 */
import api from "../api";

import {
  downloadBlob,
  EXPORT_EXT,
  fileSafe,
  type ExportFormat,
} from "./reportExport";

/** El `filename="…"` de la cabecera, incluida la forma `filename*=UTF-8''…`. */
export function nombreDeContentDisposition(
  cabecera: string | null | undefined,
): string | null {
  if (!cabecera) return null;
  // `filename*` va primero: es la que lleva los acentos sin destrozar.
  const utf8 = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(cabecera);

  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1].trim());
    } catch {
      /* sigue abajo */
    }
  }
  const simple = /filename\s*=\s*"?([^";]+)"?/i.exec(cabecera);

  return simple?.[1]?.trim() || null;
}

/**
 * Pide el archivo al servidor y lo baja con el nombre que el servidor decida.
 *
 * `nombreBase` es sólo la reserva (sin extensión): si la cabecera falta, se le
 * pega la extensión que corresponde al formato pedido, que es lo que hacía
 * falta para que un PDF no acabe llamándose `.csv`.
 */
export async function descargarInforme(
  url: string,
  opciones: { format: ExportFormat; nombreBase: string },
): Promise<void> {
  const resp = await api.get<Blob>(url, { responseType: "blob" } as never);
  const blob: Blob =
    (resp as { data?: Blob })?.data ?? (resp as unknown as Blob);

  const cabeceras =
    (resp as { headers?: Record<string, string> })?.headers || {};
  const nombre =
    nombreDeContentDisposition(
      cabeceras["content-disposition"] || cabeceras["Content-Disposition"],
    ) || `${fileSafe(opciones.nombreBase)}.${EXPORT_EXT[opciones.format]}`;

  downloadBlob(nombre, blob);
}
