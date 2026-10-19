import { ApiService } from "@/services/api/apiService";
import {
  crearLecturaCompartida,
  type LectorCompartido,
} from "@/lib/lecturaCompartida";

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
  /** 'notice' (texto) | 'maintenance' (carta de datos: el CRM la redacta). */
  kind?: "notice" | "maintenance";
  /** Sólo en una carta de mantenimiento. La fase la recalcula el CRM con el reloj. */
  phase?: FaseDeMantenimiento;
  startsAt?: string | null;
  endsAt?: string | null;
  affects?: PiezaAfectada[];
  reason?: string | null;
  /** Página de estado pública. Nunca llega a un cliente de socio. */
  statusUrl?: string | null;
}

export type FaseDeMantenimiento = "scheduled" | "starting" | "in_progress" | "completed" | "expired";
export type PiezaAfectada = "crm" | "api" | "cliente" | "socios" | "radio" | "web";

const ULTIMA_HORA_MS = 60 * 60 * 1000;
const COLA_MS = 30 * 60 * 1000;

/** La misma regla que el servidor: la fase sale del reloj, aquí con el del navegador. */
export function faseDeMantenimiento(startsAt?: string | null, endsAt?: string | null, ahora = new Date()): FaseDeMantenimiento {
  const s = startsAt ? new Date(startsAt).getTime() : NaN;
  const e = endsAt ? new Date(endsAt).getTime() : NaN;
  const t = ahora.getTime();
  if (!Number.isNaN(e) && t > e) return t - e <= COLA_MS ? "completed" : "expired";
  if (!Number.isNaN(s) && t < s) return s - t <= ULTIMA_HORA_MS ? "starting" : "scheduled";
  return "in_progress";
}

export type EventoDeAcuse = "shown" | "seen" | "dismissed" | "cta";

export const EVENTO = "cg:anuncio";

const tenantId = () => localStorage.getItem("tenantId") || "";

// La franja y la ventana emergente montan a la vez y cada una pedía la lista:
// dos peticiones idénticas en cada carga. Comparten la lectura mientras está
// en vuelo (y 3 s después); quien pregunte más tarde vuelve a leer.
const lectores = new Map<string, LectorCompartido<Aviso[]>>();

export async function cargarAvisos(): Promise<Aviso[]> {
  const t = tenantId();

  if (!t) return [];
  let lector = lectores.get(t);

  if (!lector) {
    lector = crearLecturaCompartida<Aviso[]>(async () => {
      const r: any = await ApiService.get(`/tenant/${t}/announcements`);

      return ((r?.rows || r?.data?.rows || []) as Aviso[]).map((a) => ({
        ...a,
        format: a.format || "banner",
      }));
    }, 3_000);
    lectores.set(t, lector);
  }
  try {
    return await lector.leer();
  } catch {
    return [];
  }
}

/** El acuse de esta persona. Nunca lanza: un acuse perdido no rompe nada. */
export function acusar(id: string, event: EventoDeAcuse): void {
  const t = tenantId();

  if (!t || !id) return;
  try {
    Promise.resolve(
      ApiService.post(`/tenant/${t}/announcements/${id}/receipt`, { event }),
    ).catch(() => undefined);
  } catch {
    /* sin red: da igual */
  }
}

export { conMarca } from "./marca";
