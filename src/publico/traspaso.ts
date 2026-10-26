/**
 * El TRASPASO de la mini-aplicación pública al CRM de verdad (ver
 * `lib/sesionDeCodigo.ts`): con sesión, se pide la cookie y se recarga en el
 * destino, que esta vez el servidor sirve con el CRM entero.
 *
 * Lo puro vive aquí para poder probarlo sin navegador.
 */

/** Almacenamiento mínimo (sessionStorage en la app, un mapa en las pruebas). */
export interface Almacen {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const CLAVE_DESTINO = "cg.destino";
const CLAVE_TRASPASOS = "cg.traspasos";

/** Como mucho dos traspasos en esta ventana: el tercero es un bucle. */
export const VENTANA_TRASPASOS_MS = 30_000;
export const MAX_TRASPASOS = 2;

/**
 * Un destino del MISMO origen y del CRM: empieza por una sola barra, no es la
 * propia mini-app ni el punto de la cookie. Lo demás no vale (redirección
 * abierta a otro sitio, o un bucle).
 */
export function destinoSeguro(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = v.trim();

  if (!d.startsWith("/") || d.startsWith("//") || d.startsWith("/\\"))
    return null;
  if (/^\/p(\/|$)/.test(d) || d.startsWith("/__sesion")) return null;

  return d.slice(0, 2000);
}

export function guardarDestino(destino: unknown, almacen: Almacen): void {
  const d = destinoSeguro(destino);

  if (!d) return;
  try {
    almacen.setItem(CLAVE_DESTINO, d);
  } catch {
    /* sin almacenamiento: se irá al panel */
  }
}

/** El destino guardado al mandar a iniciar sesión; se consume al leerlo. */
export function tomarDestino(almacen: Almacen): string | null {
  try {
    const d = destinoSeguro(almacen.getItem(CLAVE_DESTINO));

    almacen.removeItem(CLAVE_DESTINO);

    return d;
  } catch {
    return null;
  }
}

/**
 * ¿Se puede traspasar otra vez? Apunta este intento. Si el servidor no pone
 * la cookie (o el navegador no la guarda), cada recarga volvería a servir la
 * mini-app y a traspasar: esto corta el bucle al tercer intento.
 */
export function puedoTraspasar(almacen: Almacen, ahora = Date.now()): boolean {
  let lista: number[] = [];

  try {
    const crudo = JSON.parse(almacen.getItem(CLAVE_TRASPASOS) || "[]");

    if (Array.isArray(crudo))
      lista = crudo.filter((n) => typeof n === "number");
  } catch {
    lista = [];
  }
  lista = lista.filter((t) => ahora - t < VENTANA_TRASPASOS_MS);
  if (lista.length >= MAX_TRASPASOS) return false;
  lista.push(ahora);
  try {
    almacen.setItem(CLAVE_TRASPASOS, JSON.stringify(lista));
  } catch {
    /* sin almacenamiento: no hay bucle que contar entre recargas */
  }

  return true;
}
