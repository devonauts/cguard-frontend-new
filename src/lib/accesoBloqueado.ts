/**
 * ════════════════════════════════════════════════════════════════════════════
 * SACAR A ALGUIEN DE LA SESIÓN Y LLEVARLO A «ACCESO BLOQUEADO»
 *
 * Tres caminos llegan aquí, y los tres hacen lo mismo:
 *   1. el socket empuja `session:blocked` (el superadmin lo bloqueó: el servidor
 *      ya invalidó el token y avisa a todas sus pantallas abiertas);
 *   2. una petición cualquiera recibe 401 `auth.accessBlocked` (estaba sin
 *      socket: pestaña dormida, red caída cuando llegó el aviso);
 *   3. el inicio de sesión responde `auth.accessBlocked`.
 *
 * El cierre de sesión es el NORMAL — el mismo `signOut` del menú, que borra
 * token, almacenamiento, cachés y estado —, sólo que termina en esta página en
 * vez de en el login, y sin avisar al servidor (el token ya no vale y esa
 * llamada sólo daría otro 401). `AuthProvider` lo registra al montarse; si por
 * lo que sea no está, se hace lo mínimo: quitar el token y navegar.
 * ════════════════════════════════════════════════════════════════════════════
 */

export const RUTA_ACCESO_BLOQUEADO = "/acceso-bloqueado";

/** `bloqueo`: lo bloquearon. `sesion`: sólo se le cerró la sesión por seguridad. */
export type MotivoDeSalida = "bloqueo" | "sesion";

/** Lo que manda el servidor con `session:blocked`. */
export interface AvisoDeSesionBloqueada {
  codigo?: string;
  referencia?: string;
}

const REFERENCIA_VALIDA = /^[A-Z0-9]{3}-[A-Z0-9]{3}$/;

/** Sólo una referencia con la forma que emite el servidor; lo demás se descarta. */
export function referenciaValida(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";

  return REFERENCIA_VALIDA.test(s) ? s : null;
}

/** Una referencia nueva cuando el servidor no mandó ninguna (sin 0/O ni 1/I). */
export function nuevaReferencia(aleatorio: () => number = Math.random): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";

  for (let i = 0; i < 6; i++) s += abc[Math.floor(aleatorio() * abc.length) % abc.length];

  return `${s.slice(0, 3)}-${s.slice(3)}`;
}

/** La dirección de la página, con lo que necesita para pintar el incidente. */
export function rutaDeAccesoBloqueado(
  o: { motivo?: MotivoDeSalida; referencia?: string | null; en?: number } = {},
): string {
  const p = new URLSearchParams();

  if (o.motivo === "sesion") p.set("motivo", "sesion");
  const ref = referenciaValida(o.referencia);

  if (ref) p.set("ref", ref);
  p.set("en", String(o.en ?? Date.now()));

  return `${RUTA_ACCESO_BLOQUEADO}?${p.toString()}`;
}

type Cierre = (destino: string) => Promise<void> | void;
let cierre: Cierre | null = null;
let enCurso = false;

/** `AuthProvider` registra aquí su cierre de sesión. Devuelve cómo des-registrarlo. */
export function registrarCierreDeSesion(fn: Cierre): () => void {
  cierre = fn;

  return () => {
    if (cierre === fn) cierre = null;
  };
}

/**
 * Cierra la sesión y lleva a la página. Una sola vez: el aviso del socket y el
 * 401 de una petición en vuelo suelen llegar juntos.
 */
export async function sacarDeLaSesion(
  o: { motivo?: MotivoDeSalida; referencia?: string | null } = {},
): Promise<void> {
  if (enCurso) return;
  enCurso = true;
  const destino = rutaDeAccesoBloqueado(o);

  if (cierre) {
    try {
      await cierre(destino);

      return;
    } catch {
      /* el mínimo de abajo */
    }
  }
  try {
    localStorage.removeItem("authToken");
    localStorage.removeItem("authUserCache");
  } catch {
    /* sin almacenamiento */
  }
  try {
    window.location.replace(destino);
  } catch {
    /* sin window (pruebas) */
  }
}

/** El manejador de `session:blocked`. `bloqueado` → bloqueo; cualquier otro → sesión cerrada. */
export function alRecibirSesionBloqueada(p: AvisoDeSesionBloqueada | undefined): Promise<void> {
  const motivo: MotivoDeSalida = !p || !p.codigo || p.codigo === "bloqueado" ? "bloqueo" : "sesion";

  return sacarDeLaSesion({ motivo, referencia: p?.referencia ?? null });
}

/** ¿Este error del servidor es «acceso bloqueado»? (por el código, nunca por el texto) */
export function esAccesoBloqueado(datos: unknown): boolean {
  return !!datos && typeof datos === "object" && (datos as any).messageCode === "auth.accessBlocked";
}

/** Sólo para las pruebas. */
export function _reiniciarParaPruebas(): void {
  cierre = null;
  enCurso = false;
}
