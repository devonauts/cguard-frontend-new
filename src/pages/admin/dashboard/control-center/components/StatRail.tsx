import type { KeyboardEvent } from "react";
import type { Kpi } from "../types";

import { memo } from "react";
/**
 * El riel de recursos: las métricas que no son signos vitales pero que se
 * consultan a diario (puestos, supervisores, respuesta, cartera). Van como
 * filas y no como tarjetas para que la columna respire al lado del dial.
 */
import { ChevronRight, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { fmtValue, toneFill, toneOf } from "../tone";

import { Panel } from "./Panel";

import { IconTile } from "@/components/kit";

export interface RailItem {
  kpi: Kpi;
  icon?: LucideIcon;
  to?: string;
}

function StatRailBase({
  title,
  subtitle,
  icon,
  items,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  items: RailItem[];
}) {
  const navigate = useNavigate();

  return (
    <Panel
      bodyClassName="p-2"
      halo={false}
      icon={icon}
      subtitle={subtitle}
      title={title}
    >
      {items.map(({ kpi, icon: Icon, to }) => {
        const tone = toneOf(kpi.status);
        const ir = to ? () => navigate(to) : undefined;

        return (
          <div
            key={kpi.key}
            className={`cmd-row cg-focus flex items-center gap-3 px-3 py-2.5 ${ir ? "cursor-pointer" : ""}`}
            style={{ ["--cmd-tone" as string]: toneFill(tone) }}
            {...(ir
              ? {
                  role: "button" as const,
                  tabIndex: 0,
                  "aria-label": `Ver ${String(kpi.label)}`,
                  onClick: ir,
                  onKeyDown: (e: KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      ir();
                    }
                  },
                }
              : {})}
          >
            {Icon && (
              <IconTile size="sm" tone={tone}>
                <Icon />
              </IconTile>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{kpi.label}</div>
              {kpi.sub && (
                <div
                  className="truncate text-xs"
                  style={{ color: "var(--ink-faint)" }}
                >
                  {kpi.sub}
                </div>
              )}
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-display text-lg font-bold tabular-nums">
                {fmtValue(kpi.value)}
              </span>
              {kpi.unit && (
                <span
                  className="text-[11px]"
                  style={{ color: "var(--ink-faint)" }}
                >
                  {kpi.unit}
                </span>
              )}
            </div>
            {ir && (
              <ChevronRight
                className="size-4 shrink-0"
                style={{ color: "var(--ink-faint)" }}
              />
            )}
          </div>
        );
      })}
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
export const StatRail = memo(StatRailBase);
