import { useMemo } from 'react';
import { alphaVar, type ChartTone } from '@/lib/chartColors';
import { useElementWidth, useSvgId, clamp } from './internals';
import { useSeriesColor } from './useSeriesColor';

export interface SparklineProps {
  /** La serie, en orden cronológico. Con menos de 2 puntos no se dibuja nada. */
  data: number[];
  /** Tono semántico. Por defecto `brand` = el acento del usuario. */
  tone?: ChartTone;
  /** Color explícito — admite `var(--…)`. Gana sobre `tone`. */
  color?: string;
  /** Alto en píxeles. 32 es el tamaño de ficha de KPI. */
  height?: number;
  /** Relleno degradado bajo la línea. */
  area?: boolean;
  /** Punto destacado en el último dato — dónde ha acabado la serie. */
  showEnd?: boolean;
  strokeWidth?: number;
  className?: string;
  /** Descripción para lectores de pantalla. Sin ella el gráfico es decorativo. */
  ariaLabel?: string;
}

/**
 * Línea de tendencia compacta, sin ejes ni etiquetas.
 *
 * Es la forma correcta cuando la cifra ya está escrita al lado y lo único que
 * añade el dibujo es la FORMA del cambio. Por eso no lleva rejilla ni valores:
 * cualquier adorno compite con el número que acompaña.
 *
 * El ancho se MIDE (ver `useElementWidth`) en vez de estirar el viewBox, que es
 * lo que deja los sparklines con el trazo de grosor desigual y el punto final
 * ovalado.
 */
export default function Sparkline({
  data,
  tone = 'brand',
  color,
  height = 32,
  area = true,
  showEnd = true,
  strokeWidth = 1.75,
  className,
  ariaLabel,
}: SparklineProps) {
  const [c, paleta] = useSeriesColor(color, tone);
  const [ref, w] = useElementWidth<HTMLDivElement>(120);
  const gradId = useSvgId('spark');

  const geo = useMemo(() => {
    if (!data || data.length < 2) return null;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const rango = max - min || 1;
    const pad = Math.max(strokeWidth, showEnd ? 3.5 : strokeWidth);
    const h = height;
    const px = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2);
    // Serie plana → línea a media altura, no pegada al borde inferior.
    const py = (v: number) => (max === min ? h / 2 : h - pad - ((v - min) / rango) * (h - pad * 2));
    const puntos = data.map((v, i) => [px(i), py(v)] as const);
    const linea = puntos.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
    const relleno = `${linea} L${px(data.length - 1).toFixed(2)},${h} L${pad.toFixed(2)},${h} Z`;
    return { linea, relleno, fin: puntos[puntos.length - 1] };
  }, [data, w, height, strokeWidth, showEnd]);

  if (!geo) return <div ref={ref} className={className} style={{ height }} />;

  return (
    <div ref={ref} className={className} style={{ height }}>
      <svg
        width={w}
        height={height}
        viewBox={`0 0 ${w} ${height}`}
        className="block overflow-visible"
        role={ariaLabel ? 'img' : 'presentation'}
        aria-label={ariaLabel}
        aria-hidden={ariaLabel ? undefined : true}
      >
        {area && (
          <defs>
            {/* Del color a transparente: el relleno da masa sin robarle peso a la línea. */}
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity={0.30} />
              <stop offset="100%" stopColor={c} stopOpacity={0} />
            </linearGradient>
          </defs>
        )}
        {area && <path d={geo.relleno} fill={`url(#${gradId})`} />}
        <path
          d={geo.linea}
          fill="none"
          stroke={c}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {showEnd && (
          <>
            {/* Anillo del color del lienzo: separa el punto de la línea al cruzarla. */}
            <circle cx={geo.fin[0]} cy={geo.fin[1]} r={clamp(strokeWidth + 1.4, 2.6, 4)} fill={paleta.surface} />
            <circle cx={geo.fin[0]} cy={geo.fin[1]} r={clamp(strokeWidth, 1.8, 3)} fill={c}
              style={{ filter: `drop-shadow(0 0 5px ${alphaVar(c, 55)})` }} />
          </>
        )}
      </svg>
    </div>
  );
}
