/**
 * ════════════════════════════════════════════════════════════════════════════
 * CÓDIGOS QR DE LOS PUNTOS DE CONTROL — GENERADOS AQUÍ, NO FUERA
 *
 * Hasta hoy la hoja de QR se armaba con `https://api.qrserver.com/...`: por cada
 * punto se pedía la imagen a un servidor de terceros, metiendo el identificador
 * en la URL. Tres problemas, y ninguno es teórico:
 *
 *  1. **Se filtraban los códigos.** El identificador de cada punto de control de
 *     cada instalación vigilada —bancos, bodegas, urbanizaciones— viajaba a un
 *     servicio ajeno, en la cadena de consulta, en texto claro y registrable.
 *     Es exactamente el dato que no puede salir: quien lo tenga puede fabricar
 *     el QR.
 *  2. **Sin internet no había hoja.** La oficina de una empresa de seguridad
 *     imprime estas etiquetas en el momento en que instala un puesto nuevo, que
 *     es justo cuando la conexión es peor. Y el fallo era silencioso: la rutina
 *     de impresión esperaba 5 s a que cargaran las imágenes y, si no cargaban,
 *     **imprimía la hoja con los recuadros en blanco**. Alguien las pegaba.
 *  3. Ningún control sobre la corrección de errores, que es lo único que
 *     permite leer una etiqueta rayada, mojada o mal pegada.
 *
 * Ahora se genera en el navegador. No sale nada a la red, funciona sin conexión
 * y el nivel de corrección lo elegimos nosotros.
 * ════════════════════════════════════════════════════════════════════════════
 */
import QRCode from "qrcode";

/**
 * Nivel de corrección de errores ALTO (~30% del código recuperable).
 *
 * No es un lujo: estas etiquetas viven a la intemperie en un poste, en una
 * puerta de bodega o en un tablero eléctrico. Se rayan, se despegan por una
 * esquina y les cae sol y lluvia durante meses. Con corrección baja, un arañazo
 * que cruce el código lo deja ilegible y el vigilante no puede cerrar la ronda;
 * con alta, sigue leyendo. El precio es un QR algo más denso, que a 240 px de
 * impresión no se nota.
 */
const CORRECCION = "H" as const;

export interface OpcionesQR {
  /** Lado en píxeles de la imagen generada. */
  size?: number;
  /** Módulos de margen (la «zona tranquila»). Menos de 2 no lee bien. */
  margin?: number;
}

/**
 * El QR de un código, como data URI PNG.
 *
 * Data URI y no `blob:` a propósito: la hoja de impresión se abre en una
 * ventana nueva, y un blob creado en ESTE documento no es visible desde la
 * otra. Con data URI la imagen viaja dentro del HTML y la ventana imprime sola,
 * sin esperar a ninguna carga — que es lo que antes producía hojas en blanco.
 */
export async function qrDataUrl(
  codigo: string,
  opts: OpcionesQR = {},
): Promise<string> {
  return QRCode.toDataURL(String(codigo), {
    errorCorrectionLevel: CORRECCION,
    width: opts.size ?? 600,
    margin: opts.margin ?? 2,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
}

/**
 * Varios a la vez, en el mismo orden que entraron.
 *
 * Un fallo puntual devuelve `null` en su hueco en vez de tumbar la hoja entera:
 * es mejor imprimir once etiquetas y ver que falta una que no imprimir nada.
 */
export async function qrDataUrls(
  codigos: string[],
  opts: OpcionesQR = {},
): Promise<Array<string | null>> {
  return Promise.all(codigos.map((c) => qrDataUrl(c, opts).catch(() => null)));
}

/** Descargar un QR suelto como PNG, con nombre legible. */
export function descargarQr(dataUrl: string, nombreArchivo: string): void {
  const a = document.createElement("a");

  a.href = dataUrl;
  a.download = `${nombreArchivo.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 60)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default { qrDataUrl, qrDataUrls, descargarQr };
