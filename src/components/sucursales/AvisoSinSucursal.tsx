import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { MapPinOff } from "lucide-react";

import { InfoNote } from "@/components/kit";
import { useAuth } from "@/contexts/AuthContext";
import { rolesEnLaEmpresa } from "@/hooks/useGerenteDeSucursal";
import { accesoService } from "@/lib/api/sucursalesService";

/**
 * Someone limited to branches with none assigned sees nothing (the server
 * fails closed). Without this, every page just looked empty. Asked for anyone
 * but administrators; the server answers 402 when the company never had
 * branches, and then there is nothing to say.
 */
export default function AvisoSinSucursal() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const roles = rolesEnLaEmpresa(user);
  const tenant =
    typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;
  const preguntar =
    Boolean(user) &&
    Boolean(tenant) &&
    roles.length > 0 &&
    !roles.includes("admin") &&
    !(user as any)?.isSuperadmin;

  const q = useQuery({
    queryKey: ["sucursales", "mias", "sinAcceso", tenant],
    queryFn: () => accesoService.mias(),
    enabled: preguntar,
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (!preguntar || !q.data?.sinAcceso) return null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-3">
      <InfoNote
        icon={<MapPinOff />}
        title={t("sucursales.sinAcceso.titulo")}
        tone="warn"
      >
        {t("sucursales.sinAcceso.desc")}
      </InfoNote>
    </div>
  );
}
