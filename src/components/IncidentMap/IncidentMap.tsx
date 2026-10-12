import GoogleMapEmbed from "@/components/GoogleMap/GoogleMapEmbed";

/**
 * Miniatura de "dónde pasó esto".
 *
 * Envoltorio de `GoogleMapEmbed` que usan ocho pantallas (ficha y resumen de
 * puesto, perfil, resumen de cliente, detalle, impresión y vista pública de
 * despacho). Es el mapa dinámico directamente —la Maps Static API no está
 * habilitada en producción, así que la miniatura siempre acababa en un mapa
 * dinámico de todos modos—, pero barato:
 *  · sólo pide su instancia cuando el hueco se acerca a la pantalla;
 *  · la instancia sale del mapa compartido de la plataforma (`utils/mapPool.ts`)
 *    y vuelve a él al desmontar: ir de una ficha a otra no construye nada.
 */
export default function IncidentMap({
  lat,
  lng,
}: {
  lat?: number;
  lng?: number;
  /** Se conserva por compatibilidad con quien lo pasa. */
  label?: string;
}) {
  if (!lat || !lng) return null;

  return (
    <div className="w-full h-64 rounded-md overflow-hidden mb-4">
      <GoogleMapEmbed
        area="incident"
        draggable={false}
        lat={lat}
        lng={lng}
        mapType="roadmap"
        zoom={15}
      />
    </div>
  );
}
