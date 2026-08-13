/**
 * El parte de novedades: lo que está pasando en la operación, en orden. Cada
 * fila es un avatar tonal, el hecho, la píldora de qué tipo de hecho es y la
 * hora alineada a la derecha.
 *
 * Sin cristal por fila a propósito: `backdrop-filter` obliga a rasterizar el
 * fondo en cada fotograma y aquí hay hasta 30 filas que además se desplazan
 * (ver la nota de coste en glass.css).
 */
import { AlertTriangle, LogIn, Route, Siren, Activity as ActivityIcon, Radio } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmptyState, IconTile } from "@/components/kit";
import type { ActivityItem } from "../types";
import { activityRoute } from "../navigation";
import { clockOf, timeAgo, toneFill, toneOf } from "../tone";
import { Panel, PanelLink, TonePill } from "./Panel";

const ICON = {
  incident: AlertTriangle, checkin: LogIn, patrol: Route, alert: Siren, system: Radio, event: ActivityIcon,
} as const;

const KIND_LABEL: Record<ActivityItem["kind"], string> = {
  incident: "Incidente", checkin: "Fichaje", patrol: "Ronda",
  alert: "Alerta", system: "Sistema", event: "Novedad",
};

export function ActivityStream({ items, live, className }: { items: ActivityItem[]; live?: boolean; className?: string }) {
  const navigate = useNavigate();

  return (
    <Panel
      className={className}
      icon={<ActivityIcon />}
      title="Parte de novedades"
      subtitle={items.length ? `${items.length} eventos recientes` : "Sin eventos todavía"}
      live={live}
      action={<PanelLink to="/activities" />}
      bodyClassName="p-2"
    >
      {items.length === 0 ? (
        <EmptyState
          className="m-3 border-0"
          icon={<ActivityIcon />}
          title="Sin novedades"
          description="Fichajes, rondas, incidentes y alertas aparecerán aquí conforme ocurran."
        />
      ) : (
        <div className="cmd-scroll cmd-fade-b max-h-[26rem] px-1">
          {items.map((it) => {
            const Icon = ICON[it.kind] || ActivityIcon;
            const tone = toneOf(it.status);
            const urgente = it.status === "emergency" || it.status === "incident";
            const to = activityRoute(it);
            return (
              <div
                key={it.id}
                role="button"
                tabIndex={0}
                aria-label={it.title}
                onClick={() => navigate(to)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(to); }
                }}
                className="cmd-row cg-focus flex cursor-pointer items-center gap-3 px-3 py-2.5"
                style={{ ["--cmd-tone" as string]: toneFill(tone) }}
              >
                <IconTile tone={tone} size="sm" className="relative">
                  <Icon />
                  {urgente && (
                    <span className="cc-dot absolute -right-0.5 -top-0.5" style={{ background: toneFill(tone) }} />
                  )}
                </IconTile>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{it.title}</p>
                  {it.sub && (
                    <p className="truncate text-xs" style={{ color: "var(--ink-faint)" }}>{it.sub}</p>
                  )}
                </div>

                <TonePill tone={tone} className="hidden sm:inline-flex">
                  {KIND_LABEL[it.kind]}
                </TonePill>

                <div className="w-20 shrink-0 text-right">
                  <div className="text-xs font-semibold tabular-nums">{timeAgo(it.at)}</div>
                  <div className="text-[10px] tabular-nums" style={{ color: "var(--ink-faint)" }}>{clockOf(it.at)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
