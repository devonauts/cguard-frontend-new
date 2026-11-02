import { useAuth } from "@/contexts/AuthContext";
import { useMarcas } from "@/hooks/useMarcas";
import {
  accesoDeLaSesion,
  normalizarAcceso,
  type AccesoDeLaSesion,
} from "@/lib/multimarca/accesoDeMarca";

/**
 * MULTIMARCA · PHASE 2 — is the person using the CRM limited to some brands?
 *
 * The session (`/auth/me`: `brandAccess`, `isBrandAdmin`) answers before any
 * request; `GET /brands` (`myAccess`) confirms it once loaded. Without the
 * module nothing is limited: the answer is «all brands, not restricted».
 */
export function useAccesoDeMarca(): AccesoDeLaSesion & { modulo: boolean } {
  const { user } = useAuth();
  const { activo, lista } = useMarcas();
  const tenant =
    typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;
  const sesion = accesoDeLaSesion(user, tenant);

  if (!activo)
    return {
      modulo: false,
      brandAccess: null,
      esAdminDeMarca: false,
      esAdmin: sesion.esAdmin,
      restringido: false,
    };

  const delServidor = lista.data?.myAccess;

  if (delServidor !== undefined && !sesion.esAdmin) {
    const brandAccess = normalizarAcceso(delServidor);

    return {
      ...sesion,
      modulo: true,
      brandAccess: sesion.esAdminDeMarca && brandAccess === null ? [] : brandAccess,
      restringido: sesion.esAdminDeMarca || brandAccess !== null,
    };
  }

  return { ...sesion, modulo: true };
}

/**
 * The «Administrador de marca» (or anyone narrowed to some brands) does not
 * pay, does not touch the account and does not change the brands: the same
 * buttons the branch manager does not get.
 */
export function useEsAdminDeMarca(): boolean {
  return useAccesoDeMarca().restringido;
}
