import { useTranslation } from "react-i18next";

import GoogleMapEmbed from "@/components/GoogleMap/GoogleMapEmbed";
import StaticMapImage from "@/components/maps/StaticMapImage";

/**
 * Miniatura de "dónde pasó esto".
 *
 * ── POR QUÉ ESTE ARCHIVO ES EL MEJOR SITIO PARA EL AHORRO ───────────────────
 * `IncidentMap` es un envoltorio de `GoogleMapEmbed` que usan OCHO pantallas
 * (ficha de puesto, resumen de puesto, perfil, resumen de cliente, detalle de
 * despacho, la vista de IMPRESIÓN de despacho y la vista PÚBLICA de despacho).
 * Todas lo montan con `draggable={false}`: son consultas de sólo lectura, y aun
 * así cada una construía un mapa dinámico ($7/1.000). La pública es la peor —
 * cualquiera con el enlace, o un rastreador, generaba cargas facturables sin
 * sesión y sin techo.
 *
 * Cambiando SÓLO este archivo, las ocho pasan a una imagen estática ($2/1.000,
 * −71 %, con su propio cupo gratuito) que además ni siquiera se pide hasta que
 * el hueco se acerca a la pantalla. Y no se pierde nada: al pulsar la imagen se
 * monta el `GoogleMapEmbed` de verdad, con su zoom y su geocerca. El cargo
 * dinámico se produce sólo cuando hay una persona que lo ha pedido.
 *
 * Las props no cambian: ninguna de las ocho pantallas necesita tocarse.
 */
export default function IncidentMap({
  lat,
  lng,
  label,
}: {
  lat?: number;
  lng?: number;
  label?: string;
}) {
  const { t } = useTranslation();

  if (!lat || !lng) return null;

  return (
    <div className="w-full h-64 rounded-md overflow-hidden mb-4">
      <StaticMapImage
        alt={
          label
            ? t("ui.IncidentMap.mapaDe", { defaultValue: "Mapa de {{label}}", label })
            : t("ui.IncidentMap.mapaDeLaUbicacion", "Mapa de la ubicación")
        }
        className="h-full w-full"
        height="100%"
        lat={lat}
        lng={lng}
        zoom={15}
      >
        <GoogleMapEmbed
          draggable={false}
          lat={lat}
          lng={lng}
          mapType="roadmap"
          zoom={15}
        />
      </StaticMapImage>
    </div>
  );
}
