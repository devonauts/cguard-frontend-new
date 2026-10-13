/**
 * ════════════════════════════════════════════════════════════════════════════
 * LA RECARGA AVISADA — un solo sitio que decide cuándo se recarga el CRM
 *
 * Antes, cada despliegue recargaba la página SIN AVISAR: el service worker
 * (`registerType: "autoUpdate"`) buscaba versión nueva cada 60 s y, al
 * encontrarla, recargaba — con alguien a mitad de un parte o de un formulario.
 *
 * Ahora nada recarga por su cuenta. Dos cosas piden recarga, y las dos pasan
 * por el mismo aviso con cuenta atrás (`AvisoDeRecarga`):
 *   · «version»:    el SW encontró una versión nueva (60 s).
 *   · «plataforma»: el superadmin pulsó «Recargar paneles» (socket
 *                   `platform:reload`, con sus segundos y su mensaje).
 * Al llegar a cero —o con «Recargar ahora»— `recargarAhora()` activa la versión
 * nueva si la hay y recarga.
 * ════════════════════════════════════════════════════════════════════════════
 */

export type MotivoDeRecarga = "version" | "plataforma";

export interface PeticionDeRecarga {
  id: string;
  segundos: number;
  motivo: MotivoDeRecarga;
  mensaje?: string | null;
}

export const EVENTO = "cg:recarga";

let actualizarSW: ((recargar?: boolean) => Promise<void>) | null = null;
let hayVersionNueva = false;

/** main.tsx lo llama con la función que devuelve `registerSW`. */
export function registrarActualizador(fn: (recargar?: boolean) => Promise<void>): void {
  actualizarSW = fn;
}

/** El SW avisa de versión nueva: se pide la recarga avisada. */
export function marcarVersionNueva(): void {
  hayVersionNueva = true;
  pedirRecarga({ id: "version", segundos: 60, motivo: "version" });
}

export function pedirRecarga(p: PeticionDeRecarga): void {
  window.dispatchEvent(new CustomEvent<PeticionDeRecarga>(EVENTO, { detail: p }));
}

/**
 * Recarga YA. Con versión nueva esperando, la activa antes (y el propio SW recarga).
 * `forzar`: intenta activarla aunque el SW aún no la haya anunciado — un fichero
 * que falta YA es la prueba de que hay versión nueva en el servidor.
 */
export async function recargarAhora(opciones: { forzar?: boolean } = {}): Promise<void> {
  if (opciones.forzar) {
    // Un fichero de la versión vieja falta en el servidor: hay que salir de esa
    // versión SÍ O SÍ. Primero se intenta activar la nueva; si en 3 s no hubo
    // recarga, se suelta el service worker y su caché y se recarga desde la red.
    try {
      if (actualizarSW) await actualizarSW(true);
    } catch {
      /* seguimos con la salida segura */
    }
    setTimeout(() => {
      void soltarVersionVieja().finally(() => window.location.reload());
    }, 3000);
    return;
  }
  if (hayVersionNueva && actualizarSW) {
    /* La red de seguridad se arma ANTES de esperar al SW. Antes iba detrás del
       `await`: si la activación no contestaba nunca, el aviso se quedaba en
       0:00 y la página no recargaba jamás. Si en 3 s el SW no recargó (otra
       pestaña ya lo activó, por ejemplo), se recarga a mano; y si a los 10 s
       seguimos aquí, se suelta la versión vieja y se recarga desde la red. */
    setTimeout(() => window.location.reload(), 3000);
    setTimeout(() => {
      void soltarVersionVieja().finally(() => window.location.reload());
    }, 10000);
    try {
      await actualizarSW(true);
    } catch {
      /* las recargas de arriba siguen armadas */
    }
    return;
  }
  window.location.reload();
}

/**
 * Salida de emergencia de una versión vieja: da de baja el service worker y
 * borra la Cache Storage (sólo guarda el bundle precacheado; los datos offline
 * viven en IndexedDB y no se tocan). La siguiente carga va a la red, recibe la
 * versión actual y vuelve a registrar el SW.
 */
export async function soltarVersionVieja(): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {
    /* sin SW */
  }
  try {
    if ("caches" in window) {
      const claves = await caches.keys();
      await Promise.all(claves.map((k) => caches.delete(k)));
    }
  } catch {
    /* sin Cache Storage */
  }
}

/** ¿Este error es un fichero de una versión anterior que ya no está en el servidor? */
export function esFicheroDeVersionVieja(error: unknown): boolean {
  const m = String((error as { message?: string })?.message ?? error ?? "");
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Failed to fetch dynamically/i.test(m);
}

export function formatoCuentaAtras(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
