import type { KeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";
import type { Kpi, LiveStatus } from "../types";

import { memo } from "react";
import { useTranslation } from "react-i18next";
/**
 * La métrica grande de la fila superior: cifra enorme, píldora de variación y
 * una pista debajo. Es la lectura de un instrumento, así que todo va en
 * `tabular-nums`: sin ancho fijo de dígito, el número BAILA al refrescarse cada
 * 15 s y el ojo lo lee como parpadeo, no como dato.
 */

import { useNavigate } from "react-router-dom";

import {
  STATUS_LABEL,
  deltaDirection,
  fmtDelta,
  fmtValue,
  toneFill,
  toneInk,
  toneOf,
} from "../tone";

import { TonePill } from "./Panel";

import { DeltaPill, IconTile } from "@/components/kit";
import { Sparkline } from "@/components/charts";
import { cn } from "@/lib/utils";

function MetricHeroBase({
  kpi,
  icon: Icon,
  to,
  className,
}: {
  kpi: Kpi;
  icon?: LucideIcon;
  to?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tone = toneOf(kpi.status);
  const dir = deltaDirection(kpi.trend);
  const estado =
    kpi.status && kpi.status !== "neutral"
      ? t(STATUS_LABEL[kpi.status as LiveStatus])
      : null;
  const spark = kpi.spark && kpi.spark.length > 1 ? kpi.spark : null;
  const ir = to ? () => navigate(to) : undefined;

  return (
    <article
      className={cn(
        "glass glass-hover relative flex min-h-[172px] flex-col overflow-hidden p-5",
        ir && "cursor-pointer",
        className,
      )}
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
      {/* Filo de tono en el canto superior — el estado se lee antes que la cifra. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${toneFill(tone)}, transparent)`,
          opacity: 0.85,
        }}
      />
      {/* Halo del tono detrás del cristal. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 size-52 rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle, ${toneFill(tone)} 0%, transparent 70%)`,
          opacity: 0.18,
        }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="cg-eyebrow truncate">{kpi.label}</div>
          {estado && (
            <div
              className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold"
              style={{ color: toneInk(tone) }}
            >
              <span
                className="inline-block size-1.5 rounded-full"
                style={{ background: toneFill(tone) }}
              />
              {estado}
            </div>
          )}
        </div>
        {Icon && (
          <IconTile size="sm" tone={tone}>
            <Icon />
          </IconTile>
        )}
      </div>

      <div className="relative mt-4 flex flex-wrap items-end gap-x-3 gap-y-2">
        <span className="font-display text-[40px] font-bold leading-none tracking-tight tabular-nums sm:text-[46px]">
          {fmtValue(kpi.value)}
        </span>
        {kpi.unit && (
          <span
            className="mb-1 text-base font-semibold"
            style={{ color: "var(--ink-faint)" }}
          >
            {kpi.unit}
          </span>
        )}
        {kpi.trend != null && dir !== "flat" && (
          <DeltaPill className="mb-1" direction={dir}>
            {fmtDelta(kpi.trend)}
          </DeltaPill>
        )}
        {kpi.fallback && (
          <TonePill className="mb-1.5" tone="warn">
            <span title={kpi.hint || t("dashboard.noData")}>s/d</span>
          </TonePill>
        )}
      </div>

      <div className="relative mt-auto flex items-end justify-between gap-3 pt-4">
        <span
          className="truncate text-xs"
          style={{ color: "var(--ink-faint)" }}
        >
          {kpi.sub}
        </span>
        {spark && (
          <Sparkline
            area={false}
            ariaLabel={`Tendencia de ${String(kpi.label)}`}
            className="w-20 shrink-0"
            data={spark}
            height={26}
            tone={tone}
          />
        )}
      </div>
    </article>
  );
}

/* ── MEMOIZADO ──────────────────────────────────────────────────────────────
   El panel se re-renderiza con cada ping de GPS —hasta 33 veces por segundo con
   mil vigilantes en movimiento— porque el hook devuelve un objeto de estado
   nuevo. Este componente no depende de las posiciones, así que sin `memo`
   repintaba 33 veces por segundo para enseñar exactamente lo mismo.
   No es el arreglo de fondo (ese es sacar `entities` del objeto grande), pero
   corta el coste donde se paga. */
export const MetricHero = memo(MetricHeroBase);
