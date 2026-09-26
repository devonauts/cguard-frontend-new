import { useMemo, useState } from "react";

import { useElementWidth, useSvgId, topRoundedRect, clamp } from "./internals";
import { useSeriesColor } from "./useSeriesColor";
import ChartTooltip from "./ChartTooltip";

import { resolveColor, toneColor, type ChartTone } from "@/lib/chartColors";
import { localeActual } from "@/lib/localeActual";
import i18n from "@/i18n";
export interface BarDatum {
  /** Etiqueta de la categoría — es lo que sale en el globo. */
  label: string;
  value: number;
  /**
   * Tono PROPIO de esta barra. Sin él todas comparten el del gráfico, que es lo
   * correcto cuando las categorías son equivalentes («lunes, martes, …»).
   *
   * Con él se pintan las escalas que SIGNIFICAN algo: en un «por prioridad»,
   * todas las barras del mismo color hacen que P1 parezca P5. La severidad es
   * un dato, no una decoración, y tiene que poder decirse aquí — si no, se
   * vuelve a escribir a mano fuera del sistema.
   */
  tone?: ChartTone;
  /** Color explícito de esta barra. Gana sobre `tone`. */
  color?: string;
}

export interface BarChartProps {
  data: BarDatum[];
  /** Alto del área de barras, en píxeles. */
  height?: number;
  tone?: ChartTone;
  /** Color explícito — admite `var(--…)`. Gana sobre `tone`. */
  color?: string;
  /** Líneas de rejilla horizontales. 0 las quita. */
  gridLines?: number;
  /** Formato del valor en el globo. */
  formatValue?: (v: number) => string;
  /** Pie del gráfico: primera y última etiqueta. */
  showEdgeLabels?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * Barras verticales sobre una línea base común.
 *
 * La punta redondeada va SÓLO arriba: redondear también abajo despega la barra
 * de la línea base y con ella se pierde la referencia contra la que se comparan
 * las alturas. El degradado va de opaco arriba a translúcido abajo, así que la
 * punta —que es lo que se lee— es lo más denso de la barra.
 */
export default function BarChart({
  data,
  height = 96,
  tone = "brand",
  color,
  gridLines = 3,
  formatValue = (v) => v.toLocaleString(localeActual()),
  showEdgeLabels = false,
  className,
  ariaLabel,
}: BarChartProps) {
  const [c, paleta] = useSeriesColor(color, tone);
  const [ref, w] = useElementWidth<HTMLDivElement>(320);
  const gradId = useSvgId("bars");

  /* Un degradado por color DISTINTO, no uno por barra: en un gráfico de 30
     categorías con tres severidades eso son 3 `<defs>` en vez de 30. */
  const colores = useMemo(
    () =>
      data.map((d) =>
        d.color
          ? resolveColor(d.color)
          : d.tone
            ? toneColor(paleta, d.tone)
            : c,
      ),
    [data, paleta, c],
  );
  const unicos = useMemo(() => Array.from(new Set(colores)), [colores]);
  const [activo, setActivo] = useState<number | null>(null);
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.value)), [data]);

  const n = data.length || 1;
  const paso = w / n;
  const hueco = clamp(paso * 0.18, 1, 6); // 2px de superficie entre barras
  const ancho = Math.max(1, paso - hueco);
  const radio = Math.min(4, ancho / 2);

  if (!data.length)
    return <div ref={ref} className={className} style={{ height }} />;

  return (
    <div ref={ref} className={className} style={{ position: "relative" }}>
      <svg
        aria-label={
          ariaLabel ??
          i18n.t("ui.BarChart.valoresMaximo", {
            defaultValue: "{{n}} valores, máximo {{max}}",
            n: data.length,
            max: formatValue(max),
          })
        }
        className="block"
        height={height}
        role="img"
        viewBox={`0 0 ${w} ${height}`}
        width={w}
        onPointerLeave={() => setActivo(null)}
      >
        <defs>
          {unicos.map((col, k) => (
            <linearGradient
              key={k}
              id={`${gradId}-${k}`}
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <stop offset="0%" stopColor={col} stopOpacity={1} />
              <stop offset="100%" stopColor={col} stopOpacity={0.42} />
            </linearGradient>
          ))}
        </defs>

        {/* Rejilla acromática, por detrás de los datos y sin llamar la atención. */}
        {Array.from({ length: gridLines }).map((_, i) => {
          const y = ((i + 1) / (gridLines + 1)) * height;

          return (
            <line
              key={i}
              stroke={paleta.grid}
              strokeWidth={1}
              x1={0}
              x2={w}
              y1={y}
              y2={y}
            />
          );
        })}

        {data.map((d, i) => {
          const h = (d.value / max) * height;
          const x = i * paso + hueco / 2;
          const y = height - h;
          const resaltado = activo === i;

          return (
            <g key={`${d.label}-${i}`}>
              {/* Zona sensible del ancho completo: apuntar a una barra de 3px es imposible. */}
              <rect
                fill="transparent"
                height={height}
                width={paso}
                x={i * paso}
                y={0}
                onPointerEnter={() => setActivo(i)}
              />
              {h > 0 && (
                <path
                  d={topRoundedRect(x, y, ancho, Math.max(h, radio), radio)}
                  fill={`url(#${gradId}-${unicos.indexOf(colores[i])})`}
                  opacity={activo === null || resaltado ? 1 : 0.45}
                  style={{
                    transition: "opacity 0.15s var(--ease)",
                    pointerEvents: "none",
                  }}
                />
              )}
            </g>
          );
        })}
      </svg>

      {activo !== null && data[activo] && (
        <ChartTooltip
          title={formatValue(data[activo].value)}
          x={clamp(activo * paso + paso / 2, 40, Math.max(40, w - 40))}
          // Una barra al tope deja el globo fuera de la tarjeta: se frena en 24px.
          y={Math.max(24, height - (data[activo].value / max) * height)}
        >
          {data[activo].label}
        </ChartTooltip>
      )}

      {showEdgeLabels && (
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>{data[0]?.label}</span>
          <span>{data[data.length - 1]?.label}</span>
        </div>
      )}
    </div>
  );
}
