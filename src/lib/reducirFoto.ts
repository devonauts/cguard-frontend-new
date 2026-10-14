/**
 * ════════════════════════════════════════════════════════════════════════════
 * REDUCIR UNA FOTO ANTES DE MANDARLA EN BASE64.
 *
 * La foto de perfil viaja dentro del PUT /auth/profile, y el servidor corta
 * los cuerpos de más de 2 MB (413). Una foto de móvil pesa 3-5 MB: el
 * 2026-10-14 falló tres veces seguidas («No se pudo subir…»). Aquí se lleva a
 * `ladoMax` px por el lado largo y a JPEG: 100-300 KB, de sobra para un avatar.
 *
 * Si el navegador no puede decodificarla (formato raro), devuelve el fichero
 * tal cual en base64: el servidor dirá lo que tenga que decir.
 * ════════════════════════════════════════════════════════════════════════════
 */

function leerComoDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();

    r.onload = () => resolve(String(r.result));
    r.onerror = (e) => reject(e);
    r.readAsDataURL(blob);
  });
}

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

/** Lo que mide la foto reducida (sin agrandar nunca). */
export function medidaReducida(
  ancho: number,
  alto: number,
  ladoMax: number,
): { ancho: number; alto: number } {
  const largo = Math.max(ancho, alto);

  if (!largo || largo <= ladoMax) return { ancho, alto };
  const f = ladoMax / largo;

  return { ancho: Math.round(ancho * f), alto: Math.round(alto * f) };
}

export async function reducirFoto(
  fichero: File,
  opts: { ladoMax?: number; calidad?: number } = {},
): Promise<{ dataUrl: string; mimeType: string; sizeInBytes: number }> {
  const ladoMax = opts.ladoMax ?? 1024;
  const calidad = opts.calidad ?? 0.85;
  const url = URL.createObjectURL(fichero);

  try {
    const img = await cargarImagen(url);
    const { ancho, alto } = medidaReducida(
      img.naturalWidth,
      img.naturalHeight,
      ladoMax,
    );
    const lienzo = document.createElement("canvas");

    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext("2d");

    if (!ctx) throw new Error("sin lienzo");
    // Fondo blanco: un PNG con transparencia no sale negro en JPEG.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(img, 0, 0, ancho, alto);
    const dataUrl = lienzo.toDataURL("image/jpeg", calidad);

    return {
      dataUrl,
      mimeType: "image/jpeg",
      sizeInBytes: Math.round(
        (dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75,
      ),
    };
  } catch {
    return {
      dataUrl: await leerComoDataUrl(fichero),
      mimeType: fichero.type,
      sizeInBytes: fichero.size,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
