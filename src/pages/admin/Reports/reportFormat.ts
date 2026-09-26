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

import { localeActual } from "@/lib/localeActual";
import i18n from "@/i18n";
import { fechaYHora, limitesDelDia, soloFecha } from "@/lib/horaDeLaEmpresa";

/** Fecha y hora — el formato por defecto de las columnas de un informe. */
export const formatDateTime = (iso?: string | null) => fechaYHora(iso);

/** Sólo la fecha — para lo que se mide en días (vencimientos, tareas). */
export const formatDate = (iso?: string | null) => soloFecha(iso);

/** Distancia en metros, redondeada. */
export const formatMeters = (m?: number | null) =>
  m == null ? "—" : `${Math.round(m)} m`;

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
/**
 * ════════════════════════════════════════════════════════════════════════════
 * UN DÍA ES EL DÍA DE LA EMPRESA, NO EL DE GREENWICH
 *
 * Esto convertía «26 de agosto» en `2026-08-26T00:00Z … 23:59Z`, o sea el día
 * UTC. Para una empresa en Perú (UTC-5) eso corta la jornada a las 18:59 hora
 * local: TODO lo que pase de siete de la tarde en adelante cae en el día
 * siguiente en UTC y desaparece del informe de ese día. En México (UTC-6) se
 * pierden las últimas seis horas; en Ecuador, cinco.
 *
 * Es justo el turno de noche — el que más rondas produce.
 *
 * Reportado el 2026-08-26: rondas escaneadas a las 21:09 hora local no salían
 * en el Informe de Recorridos del Sitio (quedaban guardadas como 02:09 UTC del
 * día siguiente). Afecta a TODOS los informes que usan este rango, no sólo a
 * rondas: asistencia, incidentes, novedades…
 *
 * La cuenta vive ahora en `lib/horaDeLaEmpresa` (`limitesDelDia`), que es el
 * mismo sitio del que beben el Horario, la Nómina y los filtros de Incidentes:
 * el instante UTC que corresponde a las 00:00:00.000 y a las 23:59:59.999 EN LA
 * ZONA DE LA EMPRESA. Sin zona configurada se usa la del dispositivo.
 * ════════════════════════════════════════════════════════════════════════════
 */

export function rangeBounds(
  from: string,
  to: string,
): { start: string; end: string } {
  return limitesDelDia(from, to);
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
export function warnIfCapped<T>(
  rows: T[],
  limit: number = REPORT_ROW_LIMIT,
): T[] {
  if (rows.length >= limit) {
    toast.warning(
      i18n.t("ui.reportFormat.maximoAlcanzado", {
        defaultValue:
          "Se alcanzó el máximo de {{limit}} registros: el informe puede estar incompleto. Reduce el rango de fechas.",
        limit: limit.toLocaleString(localeActual()),
      }),
      { duration: 8000 },
    );
  }

  return rows;
}
