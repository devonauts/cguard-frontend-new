import { useTranslation } from "react-i18next";
import { ScanFace } from "lucide-react";

import { StatusBadge } from "@/components/kit";
import { chipFacial, porcentajeFacial } from "@/lib/rostro";

/**
 * El resultado del reconocimiento facial de un fichaje, en una píldora.
 * Sin resultado (la empresa no lo usa, o el turno es anterior) no pinta nada.
 */
export default function ChipRostro({
  resultado,
  puntuacion,
  className,
}: {
  resultado?: string | null;
  puntuacion?: number | string | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const chip = chipFacial(resultado);

  if (!chip) return null;
  const pct = porcentajeFacial(puntuacion);
  const etiqueta = t(chip.clave, { defaultValue: chip.respaldo });
  const titulo =
    pct === null
      ? t("rostros.chip.titulo", "Reconocimiento facial: {{resultado}}", { resultado: etiqueta })
      : t("rostros.chip.tituloConParecido", "Reconocimiento facial: {{resultado}} (parecido {{pct}} %)", {
          resultado: etiqueta,
          pct,
        });

  return (
    <span aria-label={titulo} className={className} role="img" title={titulo}>
      <StatusBadge dot={false} tone={chip.tono}>
        <span className="inline-flex items-center gap-1">
          <ScanFace aria-hidden className="size-3" />
          {etiqueta}
        </span>
      </StatusBadge>
    </span>
  );
}
