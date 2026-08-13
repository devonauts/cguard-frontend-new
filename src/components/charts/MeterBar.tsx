import { statusVar, alphaVar, seriesVar, type ChartTone } from '@/lib/chartColors';
import { cn } from '@/lib/utils';

export interface MeterBarProps {
  /** Porcentaje de llenado, 0-100. */
  pct: number;
  tone?: ChartTone;
  /** Color explícito. Admite `var(--…)` o un color resuelto. Gana sobre `tone`. */
  color?: string;
  /** Escalón de serie (0-4) en lugar de un tono semántico. */
  series?: number;
  /** Alto en píxeles. */
  height?: number;
  /** Mínimo visible para que un valor pequeño distinto de cero no desaparezca. */
  minVisiblePct?: number;
  className?: string;
  ariaLabel?: string;
}

/**
 * Una barra horizontal contra su canal — «cuánto de esto, sobre el total».
 *
 * Va en CSS y no en SVG a propósito: aparece a docenas por página (listas de
 * factores, coberturas, repartos) y una etiqueta `<svg>` por fila es memoria y
 * tiempo de composición que no hace falta. El degradado sale del acento, así
 * que el color lo sigue mandando `tokens.css`.
 */
export default function MeterBar({
  pct,
  tone = 'brand',
  color,
  series,
  height = 8,
  minVisiblePct = 2,
  className,
  ariaLabel,
}: MeterBarProps) {
  const base = color ?? (series != null ? seriesVar(series) : statusVar(tone));
  const v = Math.min(100, Math.max(0, Number.isFinite(pct) ? pct : 0));
  const ancho = v > 0 ? Math.max(minVisiblePct, v) : 0;

  return (
    <div
      className={cn('w-full overflow-hidden rounded-full', className)}
      style={{ height, background: 'var(--glass-sunken)' }}
      role="meter"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${ancho}%`,
          // Del color a una versión más tenue: la punta —el borde que se lee— queda densa.
          background: `linear-gradient(90deg, ${alphaVar(base, 62)}, ${base})`,
          boxShadow: `0 0 10px -2px ${alphaVar(base, 55)}`,
          transition: 'width 0.5s var(--ease)',
        }}
      />
    </div>
  );
}
