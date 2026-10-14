import { useTranslation } from "react-i18next";

import { Avatar, SmartImage } from "@/components/kit";
import type { RostroRegistrado } from "@/lib/api/rostrosService";
import { fechaYHora } from "@/lib/horaDeLaEmpresa";

/** Fechas, calidad y motivo de rechazo. Lo comparte la ficha del vigilante. */
export function DatosDelRegistro({ rostro }: { rostro: RostroRegistrado }) {
  const { t } = useTranslation();
  const c = rostro.calidad;

  return (
    <div className="space-y-1 text-xs" style={{ color: "var(--ink-soft)" }}>
      {rostro.registradoEn && (
        <p>
          {t("rostros.datos.registrada", "Registrada el {{fecha}}", {
            fecha: fechaYHora(rostro.registradoEn),
          })}
        </p>
      )}
      {rostro.revisadoEn && rostro.estado !== "pendiente" && (
        <p>
          {t("rostros.datos.revisada", "Revisada el {{fecha}}", {
            fecha: fechaYHora(rostro.revisadoEn),
          })}
        </p>
      )}
      {c && c.cuadros > 0 && (
        <p className="tabular-nums">
          {t("rostros.datos.calidad", "Calidad: {{usables}} de {{cuadros}} fotos útiles", {
            usables: c.usables,
            cuadros: c.cuadros,
          })}
        </p>
      )}
      {rostro.estado === "rechazado" && rostro.motivoRechazo && (
        <p style={{ color: "var(--ink)" }}>
          {t("rostros.datos.motivo", "Motivo: {{motivo}}", { motivo: rostro.motivoRechazo })}
        </p>
      )}
    </div>
  );
}

/** La foto con la que se registró. Sin foto, las iniciales. */
export function FotoDeReferencia({
  url,
  nombre,
  size = 72,
}: {
  url?: string | null;
  nombre: string;
  size?: number;
}) {
  const { t } = useTranslation();

  return (
    <SmartImage
      alt={t("rostros.foto.alt", "Foto de referencia de {{nombre}}", { nombre })}
      className="shrink-0"
      fallback={<Avatar name={nombre} size="lg" tone="neutral" />}
      rounded="rounded-2xl"
      src={url || null}
      style={{ width: size, height: size }}
    />
  );
}
