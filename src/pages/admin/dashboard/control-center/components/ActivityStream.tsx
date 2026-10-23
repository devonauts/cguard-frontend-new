import type { ActivityItem } from "../types";

import { memo } from "react";
/**
 * El parte de novedades: lo que está pasando en la operación, en orden. Cada
 * fila es un avatar tonal, el hecho, la píldora de qué tipo de hecho es y la
 * hora alineada a la derecha.
 *
 * Sin cristal por fila a propósito: `backdrop-filter` obliga a rasterizar el
 * fondo en cada fotograma y aquí hay hasta 30 filas que además se desplazan
 * (ver la nota de coste en glass.css).
 */
import {
  AlertTriangle,
  LogIn,
  Route,
  Siren,
  Activity as ActivityIcon,
  Radio,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { activityRoute } from "../navigation";
import { clockOf, timeAgo, toneFill, toneOf } from "../tone";

import { Panel, PanelLink, TonePill } from "./Panel";

import { useEtiquetasDeSucursal } from "@/hooks/useEtiquetasDeSucursal";
import EtiquetaDeSucursal from "@/components/sucursales/EtiquetaDeSucursal";
import { EmptyState, IconTile } from "@/components/kit";

const ICON = {
  incident: AlertTriangle,
  checkin: LogIn,
  patrol: Route,
  alert: Siren,
  system: Radio,
  event: ActivityIcon,
} as const;

/** Translation keys + Spanish defaults; resolved with `t()` at render time. */
const KIND_LABEL: Record<ActivityItem["kind"], [string, string]> = {
  incident: ["maps.kind.incident", "Incidente"],
  checkin: ["ui.ActivityStream.fichaje", "Fichaje"],
  patrol: ["ui.ActivityStream.ronda", "Ronda"],
  alert: ["ui.ActivityStream.alerta", "Alerta"],
  system: ["ui.ActivityStream.sistema", "Sistema"],
  event: ["ui.ActivityStream.novedad", "Novedad"],
};

function ActivityStreamBase({
  items,
  live,
  className,
}: {
  items: ActivityItem[];
  live?: boolean;
  className?: string;
}) {
  // Módulo Sucursales (vista global): la sucursal de cada aviso.
  const etiquetas = useEtiquetasDeSucursal();
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <Panel
      action={<PanelLink to="/activities" />}
      bodyClassName="p-2"
      className={className}
      icon={<ActivityIcon />}
      live={live}
      subtitle={
        items.length
          ? t("ui.ActivityStream.eventosRecientes", {
              count: items.length,
              defaultValue: "{{count}} eventos recientes",
            })
          : t("ui.ActivityStream.sinEventosTodavia", "Sin eventos todavía")
      }
      title={t("ui.ActivityStream.parteDeNovedades", "Parte de novedades")}
    >
      {items.length === 0 ? (
        <EmptyState
          className="m-3 border-0"
          description={t(
            "ui.ActivityStream.fichajesRondasIncidentesYAlertas",
            "Fichajes, rondas, incidentes y alertas aparecerán aquí conforme ocurran.",
          )}
          icon={<ActivityIcon />}
          title={t("ui.Coverage.sinNovedades", "Sin novedades")}
        />
      ) : (
        <div className="cmd-scroll cmd-fade-b max-h-[26rem] px-1">
          {items.map((it) => {
            const Icon = ICON[it.kind] || ActivityIcon;
            const tone = toneOf(it.status);
            const urgente =
              it.status === "emergency" || it.status === "incident";
            const to = activityRoute(it);
            const [kindKey, kindDefault] =
              KIND_LABEL[it.kind] ?? KIND_LABEL.event;

            return (
              <div
                key={it.id}
                aria-label={it.title}
                className="cmd-row cg-focus flex cursor-pointer items-center gap-3 px-3 py-2.5"
                role="button"
                style={{ ["--cmd-tone" as string]: toneFill(tone) }}
                tabIndex={0}
                onClick={() => navigate(to)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(to);
                  }
                }}
              >
                <IconTile className="relative" size="sm" tone={tone}>
                  <Icon />
                  {urgente && (
                    <span
                      className="cc-dot absolute -right-0.5 -top-0.5"
                      style={{ background: toneFill(tone) }}
                    />
                  )}
                </IconTile>

                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{it.title}</span>
                    <EtiquetaDeSucursal
                      sucursal={
                        etiquetas.sucursal(it.branchId) ??
                        etiquetas.deSede(it.postSiteId)
                      }
                    />
                  </p>
                  {it.sub && (
                    <p
                      className="truncate text-xs"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      {it.sub}
                    </p>
                  )}
                </div>

                <TonePill className="hidden sm:inline-flex" tone={tone}>
                  {t(kindKey, kindDefault)}
                </TonePill>

                <div className="w-20 shrink-0 text-right">
                  <div className="text-xs font-semibold tabular-nums">
                    {timeAgo(it.at)}
                  </div>
                  <div
                    className="text-[10px] tabular-nums"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {clockOf(it.at)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/* ── MEMOIZADO ──────────────────────────────────────────────────────────────
   El panel se re-renderiza con cada ping de GPS —hasta 33 veces por segundo con
   mil vigilantes en movimiento— porque el hook devuelve un objeto de estado
   nuevo. Este componente no depende de las posiciones, así que sin `memo`
   repintaba 33 veces por segundo para enseñar exactamente lo mismo.
   No es el arreglo de fondo (ese es sacar `entities` del objeto grande), pero
   corta el coste donde se paga. */
export const ActivityStream = memo(ActivityStreamBase);
