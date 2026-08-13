/* ════════════════════════════════════════════════════════════════════════════
   C-GUARD PRO — COLOR DE LOS GRÁFICOS
   El único sitio del CRM donde un gráfico decide de qué color pinta algo.

   ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
   El acento lo elige el usuario EN CALIENTE (AccentContext escribe `--brand-h`
   y `--brand-c` en el <html>). Un gráfico con `stroke="#C8860A"` se queda en
   dorado aunque el CRM entero pase a violeta. Aquí todo sale de los tokens
   `--chart-1..5`, que `tokens.css` deriva del acento.

   ── DOS CAMINOS, Y CUÁNDO USAR CADA UNO ────────────────────────────────────
   1) CSS (`CHART_VARS`, `seriesVar`, `rampVar`) devuelve cadenas `var(--…)`.
      Es lo PREFERIBLE: el navegador las recalcula solo al cambiar tema o
      acento, sin re-renderizar React. Sirve en `style={{ stroke: … }}` y en
      cualquier propiedad CSS. NO sirve en atributos SVG de presentación
      (`stroke="…"`) ni en <canvas>: ahí no hay sustitución de variables.
   2) JS (`useChartColors`, `readChartColors`) devuelve colores YA RESUELTOS
      (`oklch(0.72 0.16 88)`). Es lo que necesitan <canvas>, las librerías de
      gráficos y cualquier API que exija una cadena de color de verdad.

   ── POR QUÉ NO BASTA `getPropertyValue` A SECAS ────────────────────────────
   `--chart-2` está declarado como `oklch(from var(--brand) l calc(c*0.55) …)`.
   El valor computado sustituye las `var()` pero NO resuelve la sintaxis de
   color relativo ni los `calc()`: sale `oklch(from oklch(…) l calc(…) …)`.
   Chrome lo pinta, pero <canvas> y las librerías no. Por eso el valor pasa por
   una sonda: un <span> invisible al que se le asigna el color y del que se lee
   `getComputedStyle().color` — el navegador ya ha hecho la resolución.

   ── POR QUÉ SE RECALCULA SOLO ──────────────────────────────────────────────
   Tema y acento son ambos MUTACIONES DE ATRIBUTO en el <html>: el tema añade
   o quita la clase `dark`, el acento escribe `style="--brand-h: …"`. Un solo
   MutationObserver sobre `class` y `style` los ve los dos. Sin él, los
   gráficos se quedarían con el color del primer render.
   ════════════════════════════════════════════════════════════════════════════ */

import { useSyncExternalStore } from 'react';

/* ── CAMINO CSS ─────────────────────────────────────────────────────────────
   Cadenas `var(--…)` listas para `style={{ … }}`. Sin coste y siempre al día. */

export const CHART_VARS = {
  /** Series 1..5 — 1 es el acento, 2/3 variaciones suyas, 4/5 pasos acromáticos. */
  series: ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'] as const,
  brand: 'var(--brand)',
  brandText: 'var(--brand-text)',
  /** Tinta. Etiquetas de eje = faint; valores destacados = ink. */
  ink: 'var(--ink)',
  inkSoft: 'var(--ink-soft)',
  inkFaint: 'var(--ink-faint)',
  /** Rejilla y ejes — acromáticos, correctos en claro y en oscuro. */
  grid: 'var(--hairline)',
  axis: 'var(--ink-faint)',
  /** Semánticos: FIJOS a propósito. Un incidente es rojo aunque el acento sea rojo. */
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
  info: 'var(--info)',
} as const;

/** Nombre semántico → variable CSS. Para estados, nunca para «serie 4». */
export type StatusTone = 'ok' | 'warn' | 'bad' | 'info' | 'brand' | 'neutral';

export function statusVar(tone: StatusTone): string {
  switch (tone) {
    case 'ok': return CHART_VARS.ok;
    case 'warn': return CHART_VARS.warn;
    case 'bad': return CHART_VARS.bad;
    case 'info': return CHART_VARS.info;
    case 'neutral': return CHART_VARS.inkFaint;
    default: return CHART_VARS.series[0];
  }
}

/**
 * Color de la serie `i` (categórico). Cinco tokens, asignados SIEMPRE en el
 * mismo orden: la serie 3 es la serie 3 aunque un filtro elimine la 1. A partir
 * de la sexta serie el orden se repite — si de verdad hay más de cinco
 * categorías, agrúpalas en «Otros» o usa `rampVar`.
 */
export function seriesVar(i: number): string {
  return CHART_VARS.series[((i % 5) + 5) % 5];
}

/**
 * Escalón `i` de `n` en una rampa SECUENCIAL del acento hacia el gris. Es lo
 * correcto cuando los segmentos están ordenados por magnitud (un anillo de
 * «incidentes por tipo», por ejemplo): da tantos pasos distinguibles como haga
 * falta y sigue derivando del acento, cosa que cinco tokens fijos no pueden.
 */
export function rampVar(i: number, n: number): string {
  if (n <= 1) return CHART_VARS.series[0];
  const t = Math.min(1, Math.max(0, i / (n - 1)));
  const pct = Math.round((1 - t) * 82 + 18); // 100% acento → 18% acento
  return `color-mix(in oklab, var(--brand) ${pct}%, var(--ink-faint))`;
}

/** El mismo color con transparencia — para rellenos, lavados y halos.
 *  Vale igual para una cadena `var(--…)` que para un color ya resuelto. */
export function alphaVar(color: string, pct: number): string {
  return `color-mix(in oklab, ${color} ${Math.round(pct)}%, transparent)`;
}

/** Tono de un componente de gráfico. `brand` = el acento; el resto, semánticos. */
export type ChartTone = StatusTone;

/* ── CAMINO JS ──────────────────────────────────────────────────────────────
   Colores resueltos para <canvas> y librerías que exigen cadenas de verdad. */

export interface ChartPalette {
  /** Series categóricas 1..5, en orden fijo. */
  series: string[];
  chart1: string; chart2: string; chart3: string; chart4: string; chart5: string;
  brand: string;
  brandText: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  /** Rejilla (hairline) y ejes (ink-faint) — acromáticos. */
  grid: string;
  axis: string;
  /** Canal vacío de barras y anillos (glass-sunken). */
  track: string;
  ok: string; warn: string; bad: string; info: string;
  /** Superficies, por si un <canvas> tiene que pintar su propio fondo. */
  surface: string;
  /** `true` con la clase `dark` en el <html>. */
  isDark: boolean;
}

const TOKENS: Array<[keyof ChartPalette, string]> = [
  ['chart1', '--chart-1'],
  ['chart2', '--chart-2'],
  ['chart3', '--chart-3'],
  ['chart4', '--chart-4'],
  ['chart5', '--chart-5'],
  ['brand', '--brand'],
  ['brandText', '--brand-text'],
  ['ink', '--ink'],
  ['inkSoft', '--ink-soft'],
  ['inkFaint', '--ink-faint'],
  ['grid', '--hairline'],
  ['axis', '--ink-faint'],
  ['track', '--glass-sunken'],
  ['ok', '--ok'],
  ['warn', '--warn'],
  ['bad', '--bad'],
  ['info', '--info'],
  ['surface', '--glass-solid'],
];

/** Reserva si no hay DOM. Acromática: mejor gris que un color inventado. */
const FALLBACK: ChartPalette = {
  series: ['#8a8a8a', '#7a7a7a', '#6a6a6a', '#5a5a5a', '#4a4a4a'],
  chart1: '#8a8a8a', chart2: '#7a7a7a', chart3: '#6a6a6a', chart4: '#5a5a5a', chart5: '#4a4a4a',
  brand: '#8a8a8a', brandText: '#6a6a6a',
  ink: '#1a1a1a', inkSoft: '#707070', inkFaint: '#9a9a9a',
  grid: 'rgba(0,0,0,0.10)', axis: '#9a9a9a', track: 'rgba(0,0,0,0.08)',
  ok: '#3f8f5f', warn: '#b4832a', bad: '#c0392b', info: '#3b74b8',
  surface: '#ffffff', isDark: false,
};

let sonda: HTMLSpanElement | null = null;

/**
 * Deja que el navegador resuelva color relativo / `calc()` / `color-mix`.
 * Devuelve `''` si el valor no es un color que este navegador entienda.
 *
 * Ojo con el vacío intermedio: el CSSOM IGNORA una asignación inválida, así que
 * sin la comprobación de abajo un token no soportado dejaría el `color` en
 * blanco y `getComputedStyle` devolvería el color HEREDADO — el gráfico saldría
 * pintado del color del texto, sin fallar y sin avisar. Peor que un error.
 *
 * La sonda cuelga de <body> y el observador vigila sólo atributos del <html>
 * sin `subtree`, así que tocarla aquí no dispara una relectura en bucle.
 */
function resolver(valor: string): string {
  if (!sonda) {
    sonda = document.createElement('span');
    sonda.setAttribute('aria-hidden', 'true');
    sonda.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;opacity:0;pointer-events:none';
    document.body.appendChild(sonda);
  }
  sonda.style.color = '';
  sonda.style.color = valor;
  if (!sonda.style.color) return '';
  return getComputedStyle(sonda).color || '';
}

/**
 * Cualquier cadena de color CSS → color RESUELTO y pintable.
 *
 * Acepta `var(--ok)`, `color-mix(…)`, `oklch(from …)` o un hexadecimal. Es el
 * puente entre el camino CSS y el camino JS: un componente puede recibir
 * `var(--bad)` de quien lo usa y aun así meterlo en un `stopColor` de
 * `<linearGradient>`, donde las variables NO se sustituyen.
 *
 * Ojo: el resultado es una FOTO del valor actual. En un componente, resuelve
 * dentro de un `useMemo` que dependa de `useChartColors()`, para que se vuelva
 * a resolver cuando cambie el tema o el acento.
 */
export function resolveColor(valor: string): string {
  if (!valor || typeof document === 'undefined' || !document.body) return valor;
  if (!(valor.includes('var(') || valor.includes('from ') || valor.includes('color-mix'))) return valor;
  // Si el navegador no lo entiende, se devuelve tal cual: que decida él al pintar.
  return resolver(valor) || valor;
}

/**
 * Lee los tokens del <html> AHORA. Úsalo en un efecto o en un `useMemo`; para
 * un componente, `useChartColors()` ya se ocupa de volver a leerlos.
 */
export function readChartColors(): ChartPalette {
  if (typeof document === 'undefined' || !document.body) return FALLBACK;
  const raiz = document.documentElement;
  const cs = getComputedStyle(raiz);
  const salida = { isDark: raiz.classList.contains('dark') } as ChartPalette;

  for (const [clave, token] of TOKENS) {
    const bruto = cs.getPropertyValue(token).trim();
    // `oklch(from …)` y `var()` sin sustituir no los entiende <canvas>: se resuelven.
    const necesitaSonda = bruto.includes('from ') || bruto.includes('var(') || bruto.includes('color-mix');
    const valor = (necesitaSonda ? resolver(bruto) : bruto) || (FALLBACK[clave] as string);
    (salida as unknown as Record<string, string>)[clave as string] = valor;
  }
  salida.series = [salida.chart1, salida.chart2, salida.chart3, salida.chart4, salida.chart5];
  return salida;
}

/* ── SUSCRIPCIÓN ────────────────────────────────────────────────────────────
   Un solo observador para toda la aplicación, compartido por `useSyncExternal-
   Store`. La instantánea se cachea: sin eso, React entra en bucle porque cada
   lectura devolvería un objeto nuevo. */

let instantanea: ChartPalette | null = null;
const oyentes = new Set<() => void>();
let observador: MutationObserver | null = null;

function invalidar() {
  instantanea = null;
  oyentes.forEach((f) => f());
}

function suscribir(cb: () => void): () => void {
  oyentes.add(cb);
  if (!observador && typeof MutationObserver !== 'undefined') {
    observador = new MutationObserver(invalidar);
    // `class` = cambio de tema · `style` = cambio de acento (--brand-h/--brand-c).
    observador.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
  }
  return () => {
    oyentes.delete(cb);
    if (oyentes.size === 0 && observador) { observador.disconnect(); observador = null; }
  };
}

function instantaneaActual(): ChartPalette {
  if (!instantanea) instantanea = readChartColors();
  return instantanea;
}

/**
 * Paleta viva. Se vuelve a leer sola cuando el usuario cambia el tema o el
 * acento — que es justo lo que un gráfico pintado con cadenas de color no puede
 * hacer por su cuenta.
 */
export function useChartColors(): ChartPalette {
  return useSyncExternalStore(suscribir, instantaneaActual, () => FALLBACK);
}

/** Fuerza una relectura. Sólo hace falta si algo cambia los tokens sin tocar el <html>. */
export function refreshChartColors(): void {
  invalidar();
}

/** Tono semántico → color RESUELTO de la paleta. El equivalente en JS de `statusVar`. */
export function toneColor(p: ChartPalette, tone: ChartTone = 'brand'): string {
  switch (tone) {
    case 'ok': return p.ok;
    case 'warn': return p.warn;
    case 'bad': return p.bad;
    case 'info': return p.info;
    case 'neutral': return p.inkFaint;
    default: return p.chart1;
  }
}
