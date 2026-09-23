/**
 * El selector de SUCURSAL de la barra superior (módulo «Sucursales»).
 *
 * Va junto al de empresa porque hace lo mismo a menor escala: cambia el
 * significado de TODO lo que hay en pantalla. Elegir «Quito» acota cada
 * listado, informe y exportación a Quito; «Todas» vuelve a las que la persona
 * puede ver. Sólo aparece si hay al menos dos sucursales que elegir; quien ve
 * una sola la tiene fija y no necesita elegir.
 *
 * Al cambiar se recarga la página: media aplicación guarda sus listas en
 * estado local y, sin recargar, enseñaría una mezcla de antes y después.
 */
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEntitlement } from "@/hooks/useEntitlement";
import { accesoService } from "@/lib/api/sucursalesService";
import { elegirSucursal, sucursalElegida } from "@/lib/sucursalElegida";

const TODAS = "__todas__";

export default function SelectorDeSucursal() {
  const { t } = useTranslation();
  const activo = useEntitlement("sucursales");
  const tenant = typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;
  const { data } = useQuery({
    queryKey: ["sucursales", "mias", tenant],
    queryFn: () => accesoService.mias(),
    enabled: activo && Boolean(tenant),
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (!activo || !data || data.sucursales.length < 2) return null;
  const elegida = sucursalElegida();
  const valida = elegida && data.sucursales.some((b) => b.id === elegida) ? elegida : TODAS;

  return (
    <Select
      value={valida}
      onValueChange={(v) => {
        elegirSucursal(v === TODAS ? null : v);
        window.location.reload();
      }}
    >
      <SelectTrigger
        aria-label={t("sucursales.barra.elegir")}
        className="h-9 max-w-[200px] gap-1.5 text-sm"
      >
        <Building2 className="size-4 shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODAS}>
          {data.todas ? t("sucursales.barra.todas") : t("sucursales.barra.lasMias")}
        </SelectItem>
        {data.sucursales.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            <span className="inline-flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ background: b.color || "var(--ink-faint)" }} />
              {b.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
