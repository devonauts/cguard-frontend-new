/* ════════════════════════════════════════════════════════════════════════════
   GRÁFICOS DEL CRM
   Todos sacan el color de `@/lib/chartColors`, que a su vez lo saca de
   `--chart-1..5` en tokens.css. Ninguno escribe un color a mano, así que
   cambiar el acento en Ajustes los repinta todos.

       ProgressRing   un valor contra su máximo, la cifra en el centro
       Donut          un total repartido en trozos
       Sparkline      la forma de una tendencia, sin ejes, junto a la cifra
       BarChart       categorías comparadas sobre una línea base común
       MeterBar       una sola barra horizontal contra su canal
       AreaChart      serie temporal con cruceta y globo de datos

   Elegir la forma va ANTES que elegir el color: un anillo no compara categorías
   y unas barras no enseñan la evolución de una sola cifra.
   ════════════════════════════════════════════════════════════════════════════ */

export { default as ProgressRing } from './ProgressRing';
export type { ProgressRingProps } from './ProgressRing';

export { default as Sparkline } from './Sparkline';
export type { SparklineProps } from './Sparkline';

export { default as Donut } from './Donut';
export type { DonutProps, DonutSegment } from './Donut';

export { default as BarChart } from './BarChart';
export type { BarChartProps, BarDatum } from './BarChart';

export { default as MeterBar } from './MeterBar';
export type { MeterBarProps } from './MeterBar';

export { default as AreaChart } from './AreaChart';
export type { AreaChartProps, AreaPoint } from './AreaChart';

export { default as ChartTooltip, ChartSwatch } from './ChartTooltip';
