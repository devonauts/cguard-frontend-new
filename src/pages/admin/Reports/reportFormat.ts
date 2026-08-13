/**
 * ════════════════════════════════════════════════════════════════════════════
 * C-GUARD PRO — FORMATO COMPARTIDO DE LOS INFORMES
 *
 * Seis informes traían la MISMA función `fmt` copiada carácter a carácter, y
 * un séptimo una variante sólo-fecha. Eso no es un detalle de estilo: lo que
 * devuelven estas funciones es lo que acaba en la tabla, en el CSV y en el PDF
 * (ver `DataReport.value()`), así que una copia que se quede atrás produce un
 * informe exportado con las fechas en otro formato que el de al lado.
 *
 * Aquí vive también el tope de filas y su aviso. Antes hubo un `inDateRange`
 * que recortaba el rango DESPUÉS de recibir las filas; se ha eliminado porque
 * el rango viaja ya en la consulta (`from`/`to`) en los siete informes.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { toast } from "sonner";

const LOCALE = "es-EC";

/** Fecha y hora — el formato por defecto de las columnas de un informe. */
export const formatDateTime = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString(LOCALE, {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "—";

/** Sólo la fecha — para lo que se mide en días (vencimientos, tareas). */
export const formatDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(LOCALE, { day: "2-digit", month: "2-digit", year: "numeric" })
    : "—";

/** Distancia en metros, redondeada. */
export const formatMeters = (m?: number | null) => (m == null ? "—" : `${Math.round(m)} m`);

/**
 * Recorta un texto largo para que quepa en una celda. El límite se pasa porque
 * cada informe tiene su ancho de columna: 80 en incidentes, 70 en tareas, 60 en
 * relevos. Lo que NO cambia es el carácter de continuación.
 */
export const truncate = (text?: string | null, max = 70) => {
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

/**
 * Las dos cotas ISO de un rango `YYYY-MM-DD` — lo que se manda al servidor.
 *
 * Se genera aquí y no en cada informe porque un día de diferencia entre el
 * `from` de un informe y el de otro es invisible en pantalla y visible en el
 * CSV. El día `to` entra ENTERO (23:59:59.999): el usuario que escribe "hasta
 * hoy" espera lo de hoy dentro.
 */
export function rangeBounds(from: string, to: string): { start: string; end: string } {
  return {
    start: new Date(`${from}T00:00:00.000Z`).toISOString(),
    end: new Date(`${to}T23:59:59.999Z`).toISOString(),
  };
}

/**
 * Tope duro de filas que un informe pide al servidor.
 *
 * Con el rango en la consulta el conjunto ya está acotado por fechas, pero un
 * tope sigue haciendo falta: nada impide pedir "desde 2019". 5000 es el mismo
 * techo que aplican los listados del servidor (incidentes, turnos), así que
 * pedir más no traería nada.
 */
export const REPORT_ROW_LIMIT = 5000;

/**
 * Avisa cuando la consulta llegó al tope y devuelve las filas tal cual.
 *
 * Esta es la mitad que faltaba del arreglo. El fallo original no era sólo que
 * el rango se filtrara tarde: era que el recorte NO SE VEÍA. Un informe que
 * corta a las N filas y exporta ese corte como si fuera el total es un informe
 * que miente. Si se alcanza el tope, el usuario se entera y puede estrechar el
 * rango.
 */
export function warnIfCapped<T>(rows: T[], limit: number = REPORT_ROW_LIMIT): T[] {
  if (rows.length >= limit) {
    toast.warning(
      `Se alcanzó el máximo de ${limit.toLocaleString(LOCALE)} registros: el informe puede estar incompleto. Reduce el rango de fechas.`,
      { duration: 8000 },
    );
  }
  return rows;
}
