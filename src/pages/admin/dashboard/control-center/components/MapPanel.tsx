/**
 * El marco del mapa. El mapa en sí (`OperationsMap`) NO se toca desde aquí:
 * este archivo sólo le pone la cabecera de cristal y el acceso a pantalla
 * completa, y le pasa las mismas props de siempre.
 *
 * SIN LEYENDA PROPIA: el mapa dibuja la suya encima del lienzo. Dos leyendas
 * con nombres distintos para los mismos pines es peor que ninguna.
 */
import { Maximize2, Map as MapIcon } from "lucide-react";
import { useTranslation } from 'react-i18next';
import type { MapEntity } from "../types";
import type { DashboardPrefs } from "../prefs";
import type { MapCenter } from "../defaultCenter";
import { OperationsMap } from "./OperationsMap";
import { Panel } from "./Panel";

export function MapPanel({ entities, prefs, defaultCenter, live, onFull, height = 560, className }: {
  entities: MapEntity[]; prefs: DashboardPrefs; defaultCenter?: MapCenter;
  live?: boolean; onFull: () => void; height?: number; className?: string;
}) {
  const { t } = useTranslation();
  const enMapa = entities.length;
  return (
    <Panel
      className={className}
      icon={<MapIcon />}
      title="Operaciones en tiempo real"
      subtitle={enMapa ? `${enMapa} elementos en el mapa` : "Esperando posiciones"}
      live={live}
      action={
        <button
          type="button"
          onClick={onFull}
          title={t("ui.MapPanel.abrirEnPantallaCompletaNueva", "Abrir en pantalla completa (nueva pestaña)")}
          aria-label="Abrir el mapa en pantalla completa"
          className="cg-btn-glass cg-focus grid size-8 place-items-center rounded-full"
        >
          <Maximize2 className="size-3.5" />
        </button>
      }
      bodyClassName="flex flex-col"
    >
      <div className="relative flex-1 overflow-hidden pt-3" style={{ minHeight: height }}>
        {/* El mapa se sirve con una altura fija en píxeles, pero esta columna la
            estira la rejilla: sin este envoltorio quedaba una franja muerta bajo
            el mapa cada vez que la columna de al lado crecía. El `!h-full` pisa
            el alto en línea del marco del mapa (una declaración `!important` de
            hoja de estilos gana a un `style=` normal). Si el mapa cambiara de
            estructura, simplemente vuelve a su alto fijo: no se rompe nada. */}
        <div className="absolute inset-x-0 bottom-0 top-3 [&>div]:!h-full">
          <OperationsMap entities={entities} prefs={prefs} height={height} defaultCenter={defaultCenter} />
        </div>
        {/* ── POR QUÉ AQUÍ NO HAY UNA CAPA QUE LO TAPE TODO ──────────────────
            Antes, la vista previa entera era un botón a pantalla completa: se
            comía cada clic, así que en el panel no se podía ni desplazar el
            mapa, ni abrir un globo, ni filtrar capas. El mapa del centro de
            mando ES la herramienta, no una miniatura; el acceso a pantalla
            completa vive en el botón de la cabecera del panel (`action`). */}
      </div>
    </Panel>
  );
}
