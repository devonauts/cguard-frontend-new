import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Globo de datos en cristal.
 *
 * Se posiciona en píxeles DENTRO del contenedor del gráfico (que tiene que ser
 * `relative`), no con `position: fixed`: así se desplaza con la tarjeta y no se
 * queda flotando cuando la página hace scroll. `pointer-events: none` es
 * obligatorio — un globo que capture el puntero se persigue a sí mismo y
 * parpadea.
 */
export default function ChartTooltip({
  x, y, title, children, className,
}: {
  /** Coordenadas en píxeles relativas al contenedor del gráfico. */
  x: number;
  y: number;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="tooltip"
      className={cn(
        'glass-raised pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full',
        'whitespace-nowrap px-2.5 py-1.5 text-xs leading-tight text-foreground',
        className,
      )}
      style={{ left: x, top: y - 10, borderRadius: 'var(--r-md)' }}
    >
      {title != null && <div className="font-semibold">{title}</div>}
      {children != null && <div className="text-muted-foreground">{children}</div>}
    </div>
  );
}

/** Cuadradito de color + etiqueta, para el globo y para las leyendas. */
export function ChartSwatch({ color, children }: { color: string; children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: color }} />
      {children}
    </span>
  );
}
