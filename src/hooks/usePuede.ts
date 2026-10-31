import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/contexts/AuthContext";
import { useEntitlement } from "@/hooks/useEntitlement";
import { useGusto } from "@/hooks/useGusto";
import { ACCIONES, motivoParaNo, type Accion, type MotivoNo } from "@/lib/reglasDeAcciones";

/** The caller's authority in the current company, from `/auth/me`. */
export function nivelEnLaEmpresa(user: any): number | null {
  if (!user) return null;
  const tenantId = typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;
  const entradas: any[] = Array.isArray(user.tenants) ? user.tenants : [];
  const mia =
    entradas.find((t) => tenantId && (t.tenantId === tenantId || t?.tenant?.id === tenantId)) || entradas[0];
  const n = Number(mia?.authority);

  return Number.isFinite(n) && mia?.authority !== undefined && mia?.authority !== null ? n : null;
}

export interface Puede {
  puede: boolean;
  motivo: MotivoNo | null;
  /** The reason in words, for a tooltip on a disabled button. */
  porQueNo: string | undefined;
}

/**
 * Can the person do `accion`? Mirrors the server rule (lib/reglasDeAcciones),
 * so a button that would fail is hidden or disabled with the reason.
 */
export function usePuede(accion: Accion): Puede {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth() as any;
  const tieneRoles = useEntitlement("payroll_slips");
  const gusto = useGusto();
  const esAdmin = !!(user?.isSuperadmin);

  return useMemo(() => {
    const regla = ACCIONES[accion];
    const conDinero = tieneRoles || gusto.conectado ? true : gusto.isLoading ? null : false;
    const motivo = motivoParaNo(regla, {
      esAdmin,
      tienePermiso: (p: string) => !!hasPermission?.(p),
      nivel: nivelEnLaEmpresa(user),
      conDinero,
    });
    const textos: Record<MotivoNo, string> = {
      permiso: t("ui.puede.sinPermiso", "Tu rol no tiene permiso para esto. Pídeselo a un administrador."),
      nivel: t("ui.puede.sinNivel", "Esto lo hace un nivel más alto que el de tu rol."),
      modulo: t("ui.puede.sinModulo", "Necesita el módulo Roles de pago o Gusto conectado."),
    };

    return { puede: motivo === null, motivo, porQueNo: motivo ? textos[motivo] : undefined };
  }, [accion, esAdmin, hasPermission, user, tieneRoles, gusto.conectado, gusto.isLoading, t]);
}

export default usePuede;
