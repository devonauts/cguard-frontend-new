import { WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { soloHora, fechaYHora } from "@/lib/horaDeLaEmpresa";
import type { MarcaSinSenalDatos } from "@/lib/api/conexionAppService";

/**
 * «Registrado sin señal · llegó 03:40»: este registro se hizo en el teléfono
 * sin cobertura y llegó después. La hora del registro ya es la REAL (la de
 * cuando pasó); la etiqueta explica por qué apareció tarde en el CRM.
 */
export function MarcaSinSenal({
  marca,
  className,
}: {
  marca?: MarcaSinSenalDatos | null;
  className?: string;
}) {
  const { t } = useTranslation();

  if (!marca) return null;
  const detalle = t(
    "conexionApp.marcaDetalle",
    "Hecho a las {{hecho}} sin señal · llegó a las {{llego}}",
    {
      hecho: fechaYHora(marca.ocurridoEn),
      llego: fechaYHora(marca.llegoEn),
    },
  );

  return (
    <Badge
      variant="outline"
      className={className}
      title={detalle}
      aria-label={detalle}
    >
      <WifiOff />
      {t("conexionApp.marca", "Registrado sin señal · llegó {{hora}}", {
        hora: soloHora(marca.llegoEn),
      })}
    </Badge>
  );
}
