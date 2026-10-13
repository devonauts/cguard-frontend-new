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
/**
 * El texto según QUÉ se hizo sin señal. Un turno es un solo registro con dos
 * momentos: sin distinguir, «registrado sin señal» no decía si fue la entrada
 * o la salida — que es justo lo que se discute en una nómina.
 */
function textoDeAccion(
  t: (k: string, d: string, o?: any) => unknown,
  accion: string | null | undefined,
  hora: string,
): string {
  const a = String(accion || "").toLowerCase();

  if (a.includes("entrada") || a.includes("clock-in") || a === "in")
    return String(t("conexionApp.marcaEntrada", "Entrada registrada sin señal · llegó {{hora}}", { hora }));
  if (a.includes("salida") || a.includes("clock-out") || a === "out")
    return String(t("conexionApp.marcaSalida", "Salida registrada sin señal · llegó {{hora}}", { hora }));

  return String(t("conexionApp.marca", "Registrado sin señal · llegó {{hora}}", { hora }));
}

export function MarcaSinSenal({
  marca,
  accion,
  className,
}: {
  marca?: MarcaSinSenalDatos | null;
  /** Para forzar el texto (p. ej. la columna «Salida» de una tabla de turnos). */
  accion?: string | null;
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
      {textoDeAccion(t, accion ?? marca.accion, soloHora(marca.llegoEn))}
    </Badge>
  );
}
