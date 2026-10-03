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
  try {
    if ((hayVersionNueva || opciones.forzar) && actualizarSW) {
      await actualizarSW(true);
      // Si en 3 s el SW no recargó (otra pestaña ya lo activó, por ejemplo), se recarga a mano.
      setTimeout(() => window.location.reload(), 3000);
      return;
    }
  } catch {
    /* sin SW utilizable: recarga normal */
  }
  window.location.reload();
}

/** Lo que el aviso muestra del tiempo que queda: «1:00», «0:07». */
export function formatoCuentaAtras(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
