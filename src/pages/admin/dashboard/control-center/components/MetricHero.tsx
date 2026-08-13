/**
 * La métrica grande de la fila superior: cifra enorme, píldora de variación y
 * una pista debajo. Es la lectura de un instrumento, así que todo va en
 * `tabular-nums`: sin ancho fijo de dígito, el número BAILA al refrescarse cada
 * 15 s y el ojo lo lee como parpadeo, no como dato.
 */
import type { KeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DeltaPill, IconTile } from "@/components/kit";
import { Sparkline } from "@/components/charts";
import { cn } from "@/lib/utils";
import type { Kpi, LiveStatus } from "../types";
import {
  STATUS_LABEL, deltaDirection, fmtDelta, fmtValue, toneFill, toneInk, toneOf,
} from "../tone";
import { TonePill } from "./Panel";

export function MetricHero({ kpi, icon: Icon, to, className }: {
  kpi: Kpi; icon?: LucideIcon; to?: string; className?: string;
}) {
  const navigate = useNavigate();
  const tone = toneOf(kpi.status);
  const dir = deltaDirection(kpi.trend);
  const estado = kpi.status && kpi.status !== "neutral" ? STATUS_LABEL[kpi.status as LiveStatus] : null;
  const spark = kpi.spark && kpi.spark.length > 1 ? kpi.spark : null;
  const ir = to ? () => navigate(to) : undefined;

  return (
    <article
      className={cn("glass glass-hover relative flex min-h-[172px] flex-col overflow-hidden p-5", ir && "cursor-pointer", className)}
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
      {/* Filo de tono en el canto superior — el estado se lee antes que la cifra. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${toneFill(tone)}, transparent)`, opacity: 0.85 }}
      />
      {/* Halo del tono detrás del cristal. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 size-52 rounded-full blur-3xl"
        style={{ background: `radial-gradient(circle, ${toneFill(tone)} 0%, transparent 70%)`, opacity: 0.18 }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="cg-eyebrow truncate">{kpi.label}</div>
          {estado && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: toneInk(tone) }}>
              <span className="inline-block size-1.5 rounded-full" style={{ background: toneFill(tone) }} />
              {estado}
            </div>
          )}
        </div>
        {Icon && <IconTile tone={tone} size="sm"><Icon /></IconTile>}
      </div>

      <div className="relative mt-4 flex flex-wrap items-end gap-x-3 gap-y-2">
        <span className="font-display text-[40px] font-bold leading-none tracking-tight tabular-nums sm:text-[46px]">
          {fmtValue(kpi.value)}
        </span>
        {kpi.unit && (
          <span className="mb-1 text-base font-semibold" style={{ color: "var(--ink-faint)" }}>{kpi.unit}</span>
        )}
        {kpi.trend != null && dir !== "flat" && (
          <DeltaPill direction={dir} className="mb-1">{fmtDelta(kpi.trend)}</DeltaPill>
        )}
        {kpi.fallback && (
          <TonePill tone="warn" className="mb-1.5" >
            <span title={kpi.hint || "Sin datos disponibles"}>s/d</span>
          </TonePill>
        )}
      </div>

      <div className="relative mt-auto flex items-end justify-between gap-3 pt-4">
        <span className="truncate text-xs" style={{ color: "var(--ink-faint)" }}>{kpi.sub}</span>
        {spark && (
          <Sparkline
            data={spark}
            tone={tone}
            height={26}
            area={false}
            className="w-20 shrink-0"
            ariaLabel={`Tendencia de ${String(kpi.label)}`}
          />
        )}
      </div>
    </article>
  );
}
