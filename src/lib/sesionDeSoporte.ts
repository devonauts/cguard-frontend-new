/**
 * A partner's support session inside this company's CRM (see the backend's
 * `services/reseller/soporteAlCrm.ts`). The session itself is a normal
 * `authToken` + `tenantId`; this key only tells the UI to show the support
 * banner, with who is inside and until when.
 */
export const CLAVE_SESION_DE_SOPORTE = "cg:sesionDeSoporte";

export interface SesionDeSoporte {
  resellerName: string;
  tenantName: string;
  expiresAt: string;
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
