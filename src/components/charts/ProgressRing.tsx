import type { ReactNode } from 'react';
import { alphaVar, type ChartTone } from '@/lib/chartColors';
import { useSvgId, clamp } from './internals';
import { useSeriesColor } from './useSeriesColor';

export interface ProgressRingProps {
  /** Valor actual. Se acota a [0, max]. */
  value: number;
  max?: number;
  /** Diámetro exterior en píxeles. */
  size?: number;
  /** Grosor del arco. */
  thickness?: number;
  tone?: ChartTone;
  /** Color explícito — admite `var(--…)`. Gana sobre `tone`. */
  color?: string;
  /** Cifra del centro. Por defecto, el porcentaje. */
  centerLabel?: ReactNode;
  /** Renglón pequeño bajo la cifra. */
  caption?: ReactNode;
  /** Halo del acento alrededor del arco. */
  glow?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * Anillo de progreso: UN valor contra su máximo, con la cifra en el centro.
 *
 * Un anillo sólo sirve para eso — una parte de un todo. Para comparar
 * categorías entre sí usa barras, que se leen contra una línea base común; y
 * para repartir un total en trozos, `Donut`.
 *
 * El arco lleva un degradado `--chart-1 → --chart-2`: los dos salen del acento,
 * así que el relieve no introduce un color ajeno al sistema.
 */
export default function ProgressRing({
  value,
  max = 100,
  size = 132,
  thickness = 12,
  tone = 'brand',
  color,
  centerLabel,
  caption,
  glow = true,
  className,
  ariaLabel,
}: ProgressRingProps) {
  const [c, paleta] = useSeriesColor(color, tone);
  const gradId = useSvgId('ring');

  const tope = max > 0 ? max : 1;
  const v = clamp(value, 0, tope);
  const frac = v / tope;
  const pct = Math.round(frac * 100);

  // Sólo el acento tiene segundo escalón propio; los semánticos van planos para
  // no inventarles una variación que no existe en el sistema.
  const c2 = color || tone !== 'brand' ? c : paleta.chart2; // eslint-disable-line no-mixed-operators

  const r = (size - thickness) / 2;
  const centro = size / 2;
  const C = 2 * Math.PI * r;
  const arco = C * frac;

  return (
    <div className={className} style={{ position: 'relative', width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block"
        role="img"
        aria-label={ariaLabel ?? `${pct}%`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={c} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>

        {/* Canal: el todo contra el que se lee la parte. */}
        <circle cx={centro} cy={centro} r={r} fill="none" stroke={paleta.track} strokeWidth={thickness} />

        {/* Arco. Empieza arriba (-90°) porque es donde el ojo busca el origen. */}
        {frac > 0 && (
          <circle
            cx={centro}
            cy={centro}
            r={r}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={`${arco} ${C - arco}`}
            transform={`rotate(-90 ${centro} ${centro})`}
            style={{
              filter: glow ? `drop-shadow(0 0 8px ${alphaVar(c, 45)})` : undefined,
              transition: 'stroke-dasharray 0.6s var(--ease)',
            }}
          />
        )}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-display font-bold leading-none text-foreground" style={{ fontSize: Math.round(size * 0.24) }}>
          {centerLabel ?? `${pct}%`}
        </span>
        {caption != null && (
          <span className="mt-1 px-2 text-[11px] leading-tight text-muted-foreground">{caption}</span>
        )}
      </div>
    </div>
  );
}
