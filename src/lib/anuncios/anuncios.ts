import { ApiService } from "@/services/api/apiService";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AVISOS DE LA PLATAFORMA — lo que el superadmin quiere contarle a la gente
 *
 * Dos formas: la FRANJA de siempre (`PlatformAnnouncements`) y la VENTANA con
 * imagen y botón (`AnuncioEmergente`). Las dos leen de aquí, y las dos se
 * refrescan al momento cuando el superadmin pulsa «Enviar ahora» (socket
 * `platform:announcement` → `cg:anuncio`, ver `lib/socket.ts`).
 *
 * El servidor ya quita lo que ESTA persona cerró o marcó «Entendido» (en
 * cualquier equipo) y devuelve el texto con {{marca}}: aquí se pone la marca
 * del anfitrión, así que en el dominio de un socio sale su nombre, no el nuestro.
 * ════════════════════════════════════════════════════════════════════════════
 */

export interface Aviso {
  id: string;
  title: string;
  body: string;
  level: "info" | "warning" | "critical" | string;
  format: "banner" | "popup";
  design: {
    imageUrl: string | null;
    ctaLabel: string | null;
    ctaUrl: string | null;
    accent: string | null;
    icon: string | null;
  } | null;
  requireAck: boolean;
  dismissible: boolean;
}

export type EventoDeAcuse = "shown" | "seen" | "dismissed" | "cta";

export const EVENTO = "cg:anuncio";

const tenantId = () => localStorage.getItem("tenantId") || "";

export async function cargarAvisos(): Promise<Aviso[]> {
  const t = tenantId();
  if (!t) return [];
  try {
    const r: any = await ApiService.get(`/tenant/${t}/announcements`);
    return ((r?.rows || r?.data?.rows || []) as Aviso[]).map((a) => ({ ...a, format: a.format || "banner" }));
  } catch {
    return [];
  }
}

/** El acuse de esta persona. Nunca lanza: un acuse perdido no rompe nada. */
export function acusar(id: string, event: EventoDeAcuse): void {
  const t = tenantId();
  if (!t || !id) return;
  try {
    Promise.resolve(ApiService.post(`/tenant/${t}/announcements/${id}/receipt`, { event })).catch(() => undefined);
  } catch {
    /* sin red: da igual */
  }
}

export { conMarca } from "./marca";
