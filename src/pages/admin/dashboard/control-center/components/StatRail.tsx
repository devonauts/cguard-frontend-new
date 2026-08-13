/**
 * El riel de recursos: las métricas que no son signos vitales pero que se
 * consultan a diario (puestos, supervisores, respuesta, cartera). Van como
 * filas y no como tarjetas para que la columna respire al lado del dial.
 */
import type { KeyboardEvent } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { IconTile } from "@/components/kit";
import type { Kpi } from "../types";
import { fmtValue, toneFill, toneOf } from "../tone";
import { Panel } from "./Panel";
import { useNavigate } from "react-router-dom";

export interface RailItem { kpi: Kpi; icon?: LucideIcon; to?: string }

export function StatRail({ title, subtitle, icon, items }: {
  title: string; subtitle?: string; icon?: React.ReactNode; items: RailItem[];
}) {
  const navigate = useNavigate();
  return (
    <Panel title={title} subtitle={subtitle} icon={icon} bodyClassName="p-2" halo={false}>
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
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ir(); }
                  },
                }
              : {})}
          >
            {Icon && <IconTile tone={tone} size="sm"><Icon /></IconTile>}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{kpi.label}</div>
              {kpi.sub && <div className="truncate text-xs" style={{ color: "var(--ink-faint)" }}>{kpi.sub}</div>}
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-display text-lg font-bold tabular-nums">{fmtValue(kpi.value)}</span>
              {kpi.unit && <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>{kpi.unit}</span>}
            </div>
            {ir && <ChevronRight className="size-4 shrink-0" style={{ color: "var(--ink-faint)" }} />}
          </div>
        );
      })}
    </Panel>
  );
}
