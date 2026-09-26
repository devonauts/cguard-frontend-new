import { useTranslation } from "react-i18next";

import { useChartColors } from "@/lib/chartColors";
import { topRoundedRect } from "@/components/charts/internals";

type Point = {
  name: string;
  target: number;
  actual: number;
};

type Props = {
  data: Point[];
  width?: number;
  height?: number;
};

/**
 * Objetivo contra real, por métrica.
 *
 * El REAL lleva el acento y el OBJETIVO va acromático: son dos papeles
 * distintos, no dos categorías. El objetivo es la referencia contra la que se
 * mide, y pintarlo con su propio color lo pone a competir con el dato que
 * importa. Antes eran gris y verde fijos, que además se salían del sistema en
 * cuanto el usuario cambiaba el acento.
 */
export default function KpiBarChart({
  data,
  width = 720,
  height = 300,
}: Props) {
  const paleta = useChartColors();
  const { t } = useTranslation();
  const etiquetaObjetivo = t("postSites.KPI.table.target", "Objetivo");
  const etiquetaActual = t("postSites.KPI.table.actual", "Actual");

  if (!data || !data.length) return null;

  const padding = { top: 20, right: 20, bottom: 40, left: 40 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const maxValue = Math.max(
    ...data.flatMap((d) => [d.target ?? 0, d.actual ?? 0]),
    1,
  );

  const barGroupWidth = innerW / data.length;
  const barWidth = Math.min(120, Math.max(24, (barGroupWidth * 0.6) / 2));
  const radio = Math.min(4, barWidth / 2);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
      }}
    >
      <svg height={height} style={{ display: "block" }} width={width}>
        <g transform={`translate(${padding.left}, ${padding.top})`}>
          {/* horizontal grid lines */}
          {Array.from({ length: 5 }).map((_, i) => {
            const y = (i / 4) * innerH;

            return (
              <line
                key={i}
                stroke={paleta.grid}
                x1={0}
                x2={innerW}
                y1={y}
                y2={y}
              />
            );
          })}

          {/* bars */}
          {data.map((d, i) => {
            const groupX = i * barGroupWidth + barGroupWidth / 2 - barWidth;
            const targetH = (d.target / maxValue) * innerH;
            const actualH = (d.actual / maxValue) * innerH;

            return (
              <g key={d.name}>
                {/* Target bar (left, achromatic — the reference) */}
                <path
                  d={topRoundedRect(
                    groupX,
                    innerH - targetH,
                    barWidth,
                    Math.max(targetH, radio),
                    radio,
                  )}
                  fill="url(#kpiGradTarget)"
                >
                  <title>{`${d.name} - ${etiquetaObjetivo}\n${d.target}`}</title>
                </path>

                {/* Actual bar (right, accent — the measured value) */}
                <path
                  d={topRoundedRect(
                    groupX + barWidth + 8,
                    innerH - actualH,
                    barWidth,
                    Math.max(actualH, radio),
                    radio,
                  )}
                  fill="url(#kpiGradActual)"
                >
                  <title>{`${d.name} - ${etiquetaActual}\n${d.actual}`}</title>
                </path>

                {/* label */}
                <text
                  fill={paleta.axis}
                  fontSize={12}
                  textAnchor="middle"
                  x={groupX + barWidth}
                  y={innerH + 18}
                >
                  {d.name}
                </text>

                {/* target value label above bar */}
                <text
                  fill={paleta.inkSoft}
                  fontSize={12}
                  textAnchor="middle"
                  x={groupX + barWidth / 2}
                  y={innerH - targetH - 6}
                >
                  {d.target}
                </text>

                {/* actual value label above bar */}
                <text
                  fill={paleta.ink}
                  fontSize={12}
                  fontWeight={600}
                  textAnchor="middle"
                  x={groupX + barWidth + 8 + barWidth / 2}
                  y={innerH - actualH - 6}
                >
                  {d.actual}
                </text>
              </g>
            );
          })}

          {/* y-axis values (0..max) */}
          {Array.from({ length: 5 }).map((_, i) => {
            const val = ((4 - i) / 4) * maxValue;
            const y = (i / 4) * innerH;

            return (
              <g key={`y-${i}`}>
                <text
                  fill={paleta.axis}
                  fontSize={10}
                  textAnchor="end"
                  x={-8}
                  y={y + 4}
                >
                  {val.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* defs */}
          <defs>
            <linearGradient id="kpiGradTarget" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={paleta.chart4} stopOpacity="0.85" />
              <stop
                offset="100%"
                stopColor={paleta.chart5}
                stopOpacity="0.35"
              />
            </linearGradient>
            <linearGradient id="kpiGradActual" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={paleta.chart1} stopOpacity="1" />
              <stop
                offset="100%"
                stopColor={paleta.chart1}
                stopOpacity="0.42"
              />
            </linearGradient>
          </defs>
        </g>
      </svg>

      {/* Legend (right side) */}
      <div
        style={{ minWidth: 120, display: "flex", alignItems: "center", height }}
      >
        <div
          className="glass-flat"
          style={{
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            alignItems: "flex-start",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 14,
                height: 14,
                background: `linear-gradient(${paleta.chart4}, ${paleta.chart5})`,
                borderRadius: 3,
              }}
            />
            <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>
              {etiquetaObjetivo}
            </div>
          </div>
          <div style={{ height: 8 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 14,
                height: 14,
                background: "var(--chart-1)",
                borderRadius: 3,
              }}
            />
            <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>
              {etiquetaActual}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
