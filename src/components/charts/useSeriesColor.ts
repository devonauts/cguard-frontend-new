import { useMemo } from 'react';
import { useChartColors, resolveColor, toneColor, type ChartPalette, type ChartTone } from '@/lib/chartColors';

/**
 * El color con el que pinta un gráfico, ya RESUELTO.
 *
 * Los gráficos aceptan `color` como cadena CSS cualquiera —`var(--ok)`,
 * `color-mix(…)`, un hexadecimal heredado— porque quien los usa piensa en
 * tokens, no en valores. Pero dentro hay `<linearGradient>`, y en un atributo
 * `stopColor` las variables CSS NO se sustituyen: un `stopColor="var(--ok)"` es
 * un degradado transparente. Esto lo convierte a algo pintable.
 *
 * Depende de la paleta viva a propósito: cuando el usuario cambia de tema o de
 * acento, la instantánea cambia de identidad, el `useMemo` se invalida y el
 * color se vuelve a resolver. Sin esa dependencia el gráfico se quedaría con el
 * color del primer render — que es exactamente el fallo que este módulo evita.
 */
export function useSeriesColor(color: string | undefined, tone: ChartTone = 'brand'): [string, ChartPalette] {
  const paleta = useChartColors();
  const c = useMemo(
    () => (color ? resolveColor(color) : toneColor(paleta, tone)),
    [color, tone, paleta],
  );
  return [c, paleta];
}
