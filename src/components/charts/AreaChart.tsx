import { useMemo, useState } from "react";

import { useElementWidth, useSvgId, clamp } from "./internals";
import { useSeriesColor } from "./useSeriesColor";
import ChartTooltip from "./ChartTooltip";

import { alphaVar, type ChartTone } from "@/lib/chartColors";
import { localeActual } from "@/lib/localeActual";
export interface AreaPoint {
  /** Etiqueta del eje X — lo que se enseña en el globo. */
  label: string;
  value: number;
}

export interface AreaChartProps {
  data: AreaPoint[];
  height?: number;
  tone?: ChartTone;
  /** Color explícito — admite `var(--…)`. Gana sobre `tone`. */
  color?: string;
  /** Líneas de rejilla horizontales. */
  gridLines?: number;
  /** Cuántas etiquetas del eje X dibujar bajo el gráfico. 0 las quita. */
  xTicks?: number;
  formatValue?: (v: number) => string;
  /** Relleno degradado bajo la línea. */
  area?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * Serie temporal: línea + relleno degradado, cruceta y globo de datos.
 *
 * El globo es parte del gráfico, no un extra: sin él, una línea de treinta días
 * sólo dice «sube» — el valor de un día concreto se vuelve inconsultable. La
 * cruceta recorre TODA la altura para que el ojo pueda bajar del punto a la
 * fecha sin perder la columna.
 *
 * El último punto va marcado. Es el dato que más se mira (dónde estamos hoy) y
 * en una línea sin marcas queda enterrado entre los otros veintinueve.
 */
export default function AreaChart({
  data,
  height = 200,
  tone = "brand",
  color,
  gridLines = 4,
  xTicks = 6,
  formatValue = (v) => v.toLocaleString(localeActual()),
  area = true,
  className,
  ariaLabel,
}: AreaChartProps) {
  const [c, paleta] = useSeriesColor(color, tone);
  const [ref, w] = useElementWidth<HTMLDivElement>(440);
  const gradId = useSvgId("area");
  const [activo, setActivo] = useState<number | null>(null);
  const padY = 12;
  const padX = 8;

  const geo = useMemo(() => {
    if (!data || data.length < 2) return null;
    const max = Math.max(1, ...data.map((d) => d.value));
    const px = (i: number) => padX + (i / (data.length - 1)) * (w - padX * 2);
    const py = (v: number) => height - padY - (v / max) * (height - padY * 2);
    const puntos = data.map((d, i) => [px(i), py(d.value)] as const);
    const linea = puntos
      .map(
        ([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`,
      )
      .join(" ");
    const relleno = `${linea} L${px(data.length - 1).toFixed(2)},${height - padY} L${padX},${height - padY} Z`;

    return {
      max,
      puntos,
      linea,
      relleno,
      paso: (w - padX * 2) / (data.length - 1),
    };
  }, [data, w, height]);

  const alPuntero = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!geo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const i = Math.round((x - padX) / (geo.paso || 1));

    setActivo(clamp(i, 0, data.length - 1));
  };

  if (!geo) return <div ref={ref} className={className} style={{ height }} />;

  // `Set` porque con pocos puntos dos marcas pueden caer en el mismo índice, y
  // React avisaría de claves duplicadas.
  const marcas =
    xTicks > 0
      ? Array.from(
          new Set(
            Array.from({ length: Math.min(xTicks, data.length) }, (_, i) =>
              Math.round(
                (i / Math.max(1, Math.min(xTicks, data.length) - 1)) *
                  (data.length - 1),
              ),
            ),
          ),
        )
      : [];

  return (
    <div ref={ref} className={className} style={{ position: "relative" }}>
      <svg
        aria-label={
          ariaLabel ??
          `Serie de ${data.length} puntos, máximo ${formatValue(geo.max)}`
        }
        className="block touch-none"
        height={height}
        role="img"
        viewBox={`0 0 ${w} ${height}`}
        width={w}
        onPointerDown={alPuntero}
        onPointerLeave={() => setActivo(null)}
        onPointerMove={alPuntero}
      >
        {area && (
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity={0.32} />
              <stop offset="100%" stopColor={c} stopOpacity={0} />
            </linearGradient>
          </defs>
        )}

        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const y = padY + (i / gridLines) * (height - padY * 2);

          return (
            <line
              key={i}
              stroke={paleta.grid}
              strokeDasharray="3 4"
              strokeWidth={1}
              x1={0}
              x2={w}
              y1={y}
              y2={y}
            />
          );
        })}

        {area && <path d={geo.relleno} fill={`url(#${gradId})`} />}
        <path
          d={geo.linea}
          fill="none"
          stroke={c}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
        />

        {/* Cruceta del dato apuntado. */}
        {activo !== null && geo.puntos[activo] && (
          <g pointerEvents="none">
            <line
              stroke={paleta.axis}
              strokeDasharray="2 3"
              strokeWidth={1}
              x1={geo.puntos[activo][0]}
              x2={geo.puntos[activo][0]}
              y1={padY / 2}
              y2={height - padY / 2}
            />
            <circle
              cx={geo.puntos[activo][0]}
              cy={geo.puntos[activo][1]}
              fill={paleta.surface}
              r={5}
            />
            <circle
              cx={geo.puntos[activo][0]}
              cy={geo.puntos[activo][1]}
              fill={c}
              r={3.5}
            />
          </g>
        )}

        {/* Punto final: dónde acaba la serie. Se esconde mientras se explora. */}
        {activo === null && (
          <g pointerEvents="none">
            <circle
              cx={geo.puntos[data.length - 1][0]}
              cy={geo.puntos[data.length - 1][1]}
              fill={paleta.surface}
              r={5}
            />
            <circle
              cx={geo.puntos[data.length - 1][0]}
              cy={geo.puntos[data.length - 1][1]}
              fill={c}
              r={3.5}
              style={{ filter: `drop-shadow(0 0 6px ${alphaVar(c, 60)})` }}
            />
          </g>
        )}
      </svg>

      {activo !== null && data[activo] && (
        <ChartTooltip
          title={formatValue(data[activo].value)}
          x={clamp(geo.puntos[activo][0], 52, Math.max(52, w - 52))}
          y={geo.puntos[activo][1]}
        >
          {data[activo].label}
        </ChartTooltip>
      )}

      {marcas.length > 0 && (
        <div className="relative mt-1 h-4">
          {marcas.map((i) => (
            <span
              key={i}
              className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground"
              style={{
                left: clamp(geo.puntos[i][0], 18, Math.max(18, w - 18)),
              }}
            >
              {data[i]?.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
