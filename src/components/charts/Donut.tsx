import type { ReactNode } from 'react';
import { useChartColors, toneColor, resolveColor, type ChartTone } from '@/lib/chartColors';

export interface DonutSegment {
  value: number;
  /** Color del trozo — admite `var(--…)` y `color-mix(…)`. Si falta, se usa
   *  `tone`, y si tampoco, el escalón de serie que toque por posición. */
  color?: string;
  tone?: ChartTone;
  label?: string;
}

export interface DonutProps {
  segments: DonutSegment[];
  /** Diámetro en píxeles. */
  size?: number;
  thickness?: number;
  /** Cifra grande del centro. */
  centerTop?: ReactNode;
  /** Renglón pequeño del centro. */
  centerBottom?: ReactNode;
  /** Hueco entre trozos, en píxeles de arco. Un trozo único no se corta. */
  gap?: number;
  className?: string;
  ariaLabel?: string;
}

/**
 * Reparto de un total en trozos.
 *
 * El hueco de 2px entre segmentos no es adorno: sin él, dos trozos de tonos
 * contiguos de la misma rampa se leen como uno solo. Es la única forma de que
 * una rampa secuencial (que es lo que usa el CRM, derivada del acento) siga
 * siendo legible como partes separadas.
 */
export default function Donut({
  segments,
  size = 130,
  thickness = 15,
  centerTop,
  centerBottom,
  gap = 2,
  className,
  ariaLabel,
}: DonutProps) {
  const paleta = useChartColors();

  const r = (size - thickness) / 2;
  const centro = size / 2;
  const C = 2 * Math.PI * r;

  const validos = segments.filter((s) => s.value > 0);
  const suma = validos.reduce((a, s) => a + s.value, 0) || 1;
  const hueco = validos.length > 1 ? gap : 0;

  let offset = 0;

  return (
    <div className={className} style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block -rotate-90"
        role="img"
        aria-label={ariaLabel ?? validos.map((s) => `${s.label ?? ''} ${s.value}`).join(', ')}
      >
        <circle cx={centro} cy={centro} r={r} fill="none" stroke={paleta.track} strokeWidth={thickness} />
        {validos.map((s, i) => {
          const largo = (s.value / suma) * C;
          const dibujado = Math.max(0.5, largo - hueco);
          const color = s.color
            ? resolveColor(s.color)
            : s.tone ? toneColor(paleta, s.tone) : paleta.series[i % paleta.series.length];
          const el = (
            <circle
              key={i}
              cx={centro}
              cy={centro}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={thickness}
              strokeDasharray={`${dibujado} ${C - dibujado}`}
              strokeDashoffset={-offset}
            >
              {s.label && <title>{`${s.label}: ${s.value}`}</title>}
            </circle>
          );
          offset += largo;
          return el;
        })}
      </svg>

      {(centerTop != null || centerBottom != null) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerTop != null && (
            <span className="font-display font-bold leading-none text-foreground" style={{ fontSize: Math.round(size * 0.17) }}>
              {centerTop}
            </span>
          )}
          {centerBottom != null && <span className="mt-0.5 text-[11px] text-muted-foreground">{centerBottom}</span>}
        </div>
      )}
    </div>
  );
}
