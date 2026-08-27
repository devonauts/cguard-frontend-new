/**
 * Geometría de la hoja del Mes. Vive aparte porque la pintan tres archivos
 * (`Schedule`, `MonthStationBlock`, `SupervisionSection`) y los tres tienen que
 * usar el MISMO ancho de columna: si uno se desincroniza, las filas dejan de
 * cuadrar con la cabecera de días.
 *
 * `COL_W` además es la unidad de la aritmética de `scrollLeft` (ir a un mes,
 * traer una celda a la vista, saber qué columnas hay que pintar).
 */
export const COL_W = 44;
export const COL_STICKY_W = 240;
