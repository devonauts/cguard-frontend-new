import { useAuth } from "@/contexts/AuthContext";

/**
 * ¿Quien está usando el CRM es GERENTE DE SUCURSAL (y no administrador) en la
 * empresa abierta? El gerente es admin de sus sucursales pero no paga, no
 * contrata ni cierra la cuenta: eso es de la principal. El servidor lo cierra
 * igual (portero por ruta); aquí sólo se evita enseñarle botones que no van a
 * funcionar.
 */
function lista(r: unknown): string[] {
  if (Array.isArray(r)) return r.map(String);
  if (typeof r === "string") {
    try {
      const p = JSON.parse(r);

      return Array.isArray(p) ? p.map(String) : [r];
    } catch {
      return [r];
    }
  }

  return [];
}

export function rolesEnLaEmpresa(user: any): string[] {
  const tenantId =
    typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;
  const t = (Array.isArray(user?.tenants) ? user.tenants : []).find((x: any) =>
    [x?.tenant?.id, x?.tenantId, x?.id].map(String).includes(String(tenantId)),
  );

  return lista(t?.roles ?? t?.tenantUser?.roles ?? user?.roles);
}

export function useEsGerenteDeSucursal(): boolean {
  const { user } = useAuth();
  const r = rolesEnLaEmpresa(user);

  return r.includes("branchManager") && !r.includes("admin");
}
