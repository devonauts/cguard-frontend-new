// Shapes shared by the station-detail page and its children.

/**
 * A row from `GET /guard-shift?filter[stationName]=…` — the attendance /
 * clock-in record of a station.
 *
 * Lives aquí y no dentro de un componente porque `StationDetailPage` lee estas
 * filas UNA vez y se las pasa a la cabecera (para saber quién está de turno
 * ahora) y al resumen (para la lista de actividad reciente). Antes cada una
 * pedía la misma url por su cuenta.
 *
 * Ojo con `guardName`: el servidor anida ahí el nombre para mostrar, no lo
 * manda como texto suelto.
 */
export interface RecentShiftRow {
  id?: string;
  punchInTime?: string | null;
  punchOutTime?: string | null;
  status?: string;
  guardName?: { fullName?: string } | null;
}
