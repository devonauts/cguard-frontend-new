/** {{marca}} → la marca del anfitrión (en el dominio de un socio, la suya). Sin dependencias: se prueba sola. */
export const conMarca = (texto: string | null | undefined, marca: string): string =>
  String(texto ?? "").replace(/\{\{\s*marca\s*\}\}/g, marca || "");
