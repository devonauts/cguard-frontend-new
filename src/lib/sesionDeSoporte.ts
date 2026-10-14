import { ApiService } from "@/services/api/apiService";

/**
 * A support session inside this company's CRM: a partner's support (see the
 * backend's `services/reseller/soporteAlCrm.ts`) or the platform's, entering
 * from the SuperAdmin. The session itself is a normal `authToken` +
 * `tenantId`; this key only tells the UI to show the support bar, with who is
 * inside, for which ticket and until when.
 *
 * Who writes it:
 *   · `AccesoSoporte.tsx` (partner pass) → `{ resellerName, tenantName, expiresAt,
 *     soportePlataforma, impersonatedByEmail }`
 *   · the SuperAdmin, before loading the CRM in its frame →
 *     `{ resellerName, nombreDelSoporte, tenantName, ticketAsunto, expiresAt }`
 */
export const CLAVE_SESION_DE_SOPORTE = "cg:sesionDeSoporte";

export interface SesionDeSoporte {
  resellerName: string;
  tenantName: string;
  expiresAt: string;
  /** Who gives the support; set by the SuperAdmin for the platform. */
  nombreDelSoporte?: string | null;
  /** «#A1B2C3 · Subject» of the ticket being handled, if any. */
  ticketAsunto?: string | null;
  /**
   * CGuard platform support that entered through the partner panel (the pass
   * says so: backend `canjearPase` → `soportePlataforma`). The bar then says
   * «CGuard Pro support», not «<partner> support».
   */
  soportePlataforma?: boolean;
  impersonatedByEmail?: string | null;
}

/** What the company's people see while support is inside (backend `vistaPublica`). */
export interface SoporteEnVivo {
  quien: "plataforma" | "socio";
  nombreDelSoporte: string;
  ticketId: string | null;
  ticketAsunto: string | null;
  desde: string;
  venceSesion: string;
  /** Platform support that came in through the partner panel: named as the platform, never the host brand. */
  viaSocio?: boolean;
}

export function leerSesionDeSoporte(): SesionDeSoporte | null {
  try {
    const crudo = localStorage.getItem(CLAVE_SESION_DE_SOPORTE);

    if (!crudo) return null;
    const s = JSON.parse(crudo);

    if (!s || typeof s !== "object" || !s.expiresAt) return null;

    return s as SesionDeSoporte;
  } catch {
    return null;
  }
}

/** Platform support that entered through a partner's panel (not the SuperAdmin frame). */
export function esSoportePlataformaPorSocio(s: SesionDeSoporte | null): boolean {
  return !!s && s.soportePlataforma === true;
}

/** The SuperAdmin marks its own sessions with the platform as `nombreDelSoporte`. */
export function esSoporteDeLaPlataforma(s: SesionDeSoporte | null): boolean {
  return !!s && !!s.nombreDelSoporte && s.nombreDelSoporte === s.resellerName;
}

const tenantActual = () => {
  try {
    return localStorage.getItem("tenantId") || "";
  } catch {
    return "";
  }
};

/** Is support inside this company right now? Never throws: no answer = no banner. */
export async function consultarSoporteEnVivo(): Promise<{
  soporte: SoporteEnVivo | null;
  soyElSoporte: boolean;
}> {
  const t = tenantActual();

  if (!t) return { soporte: null, soyElSoporte: false };
  try {
    const r: any = await ApiService.get(`/tenant/${t}/soporte-en-vivo`);
    const d = r?.data && "soporte" in r.data ? r.data : r;

    return { soporte: d?.soporte || null, soyElSoporte: !!d?.soyElSoporte };
  } catch {
    return { soporte: null, soyElSoporte: false };
  }
}

/** The support session's "still here", every minute. Never throws. */
export async function latidoDeSoporte(): Promise<void> {
  const t = tenantActual();

  if (!t) return;
  try {
    await ApiService.post(`/tenant/${t}/soporte-en-vivo/latido`, {});
  } catch {
    /* a lost beat only shortens the banner */
  }
}

/** Support leaves: the company's banner goes away now. Never throws. */
export async function finDeSoporte(): Promise<void> {
  const t = tenantActual();

  if (!t) return;
  try {
    await ApiService.post(`/tenant/${t}/soporte-en-vivo/fin`, {});
  } catch {
    /* if it fails, it expires on its own in a couple of minutes */
  }
}
