import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ScanFace } from "lucide-react";

import { Section, SkeletonBlock, StatusBadge } from "@/components/kit";
import AccionesDeRostro from "@/components/rostro/AccionesDeRostro";
import { useEntitlement } from "@/hooks/useEntitlement";
import { rostrosService } from "@/lib/api/rostrosService";
import { MODULO_RECONOCIMIENTO_FACIAL, chipDeEstado, faltaElModulo } from "@/lib/rostro";
import { DatosDelRegistro, FotoDeReferencia } from "@/components/rostro/PiezasDeRostro";

/**
 * «Reconocimiento facial» en la ficha del vigilante: en qué punto está su
 * cara, la foto con la que se registró y las mismas acciones que la lista.
 * Sólo con el módulo; sin él no se pinta nada (la ficha no es sitio para
 * vender).
 *
 * `userId` es el id de USUARIO de la persona (el `guardId` de su ficha).
 */
export default function TarjetaReconocimientoFacial({
  userId,
  nombre,
}: {
  userId?: string | null;
  nombre?: string | null;
}) {
  const { t } = useTranslation();
  const tiene = useEntitlement(MODULO_RECONOCIMIENTO_FACIAL);
  const q = useQuery({
    queryKey: ["rostros", "persona", userId],
    queryFn: () => rostrosService.leer(String(userId)),
    enabled: tiene && Boolean(userId),
    retry: false,
  });

  if (!tiene || !userId || faltaElModulo(q.error)) return null;

  const titulo = t("rostros.ficha.titulo", "Reconocimiento facial");

  if (q.isLoading)
    return (
      <Section flat icon={<ScanFace />} title={titulo}>
        <SkeletonBlock className="h-20 rounded-2xl" />
      </Section>
    );

  if (q.isError || !q.data)
    return (
      <Section flat icon={<ScanFace />} title={titulo}>
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          {t("rostros.ficha.error", "No se pudo consultar su cara registrada. Vuelve a abrir la ficha en un momento.")}
        </p>
      </Section>
    );

  const r = { ...q.data, nombre: q.data.nombre || nombre || undefined };
  const chip = chipDeEstado(r.estado);
  const quien = r.nombre || t("comun.vigilante", "Vigilante");

  return (
    <Section
      flat
      action={
        <Link className="text-xs underline" style={{ color: "var(--ink-soft)" }} to="/security-guards/rostros">
          {t("rostros.ficha.verTodas", "Ver todas las caras")}
        </Link>
      }
      icon={<ScanFace />}
      title={titulo}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {r.estado !== "sin_registro" && <FotoDeReferencia nombre={quien} url={r.fotoUrl} />}
        <div className="min-w-0 flex-1 space-y-1.5">
          <StatusBadge tone={chip.tono}>{t(chip.clave, { defaultValue: chip.respaldo })}</StatusBadge>
          {r.estado === "sin_registro" ? (
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              {t(
                "rostros.ficha.sinRegistro",
                "Todavía no ha registrado su cara. La app se lo pedirá la próxima vez que fiche.",
              )}
            </p>
          ) : (
            <DatosDelRegistro rostro={r} />
          )}
          <div className="pt-1">
            <AccionesDeRostro rostro={r} />
          </div>
        </div>
      </div>
    </Section>
  );
}
