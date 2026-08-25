/**
 * ════════════════════════════════════════════════════════════════════════════
 * ALARMAS — VOCABULARIO COMPARTIDO
 * La cola, el detalle del caso y el registro de señales hablan del MISMO
 * suceso. Sus tablas de estado, categoría y prioridad estaban copiadas carácter
 * a carácter entre archivos, y las copias ya divergían: los iconos de categoría
 * eran `size-3.5` en la cola y `size-4` en el detalle, y el mismo suceso se
 * fechaba con segundos en una pantalla y sin ellos en la otra. Con una sola
 * definición, una alarma se ve igual en las tres.
 *
 * ── LA REGLA QUE NO SE NEGOCIA ─────────────────────────────────────────────
 * Toda esta escala es SEMÁNTICA FIJA. Una alarma sin atender sigue en rojo
 * aunque la empresa haya elegido rojo como color de marca, y no se vuelve verde
 * porque alguien elija verde. El acento marca «lo importante de la pantalla»;
 * aquí lo importante es la GRAVEDAD, y ésa no es una preferencia del cliente.
 * ════════════════════════════════════════════════════════════════════════════
 */
import type { ReactNode } from 'react';
import {
  Siren, ShieldAlert, Flame, Hand, Bell, HeartPulse, Wrench, AlertTriangle,
  DoorOpen, Activity,
} from 'lucide-react';
import { StatusBadge } from '@/components/kit';
import { MeterBar } from '@/components/charts';
import { alarmSourceMeta } from '@/lib/api/alarmService';
import { conEtiqueta } from '@/lib/i18nLabel';
import i18n from '@/i18n';

export type AlarmTone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'brand';

// ── Estado del caso ─────────────────────────────────────────────────────────
// Las etiquetas se resuelven AL LEERLAS (ver lib/i18nLabel): esta tabla se
// evalúa al importar el módulo, antes de que el usuario elija idioma.
export const STATUS_META: Record<string, { label: string; tone: AlarmTone }> = {
  queued: conEtiqueta('alarm.status.queued', { tone: 'bad' as AlarmTone }),
  acknowledged: conEtiqueta('alarm.status.acknowledged', { tone: 'warn' as AlarmTone }),
  verifying: conEtiqueta('alarm.status.verifying', { tone: 'info' as AlarmTone }),
  dispatched: conEtiqueta('alarm.status.dispatched', { tone: 'info' as AlarmTone }),
  resolved: conEtiqueta('alarm.status.resolved', { tone: 'ok' as AlarmTone }),
  closed: conEtiqueta('alarm.status.closed', { tone: 'neutral' as AlarmTone }),
};

/** Los cuatro estados en los que el caso sigue vivo y cuenta para la carga. */
export const OPEN_STATUSES = new Set<string>(['queued', 'acknowledged', 'verifying', 'dispatched']);

/** El tono del origen vive en `alarmSourceMeta`; aquí sólo se reexpone para no
 *  repetir el mapeo en cada página. */
export function sourceTone(source?: string | null): string {
  return alarmSourceMeta(source).tone;
}

// ── Categoría ───────────────────────────────────────────────────────────────
/**
 * El icono NO trae tamaño propio: lo fija quien lo pinta. Cuando cada archivo
 * horneaba su `size-3.5`/`size-4` en la tabla, la misma categoría salía de dos
 * tamaños distintos en dos pantallas hermanas.
 */
const CATEGORY_META: Record<string, { label: string; icon: ReactNode; grave: boolean }> = {
  burglary: conEtiqueta('alarm.category.burglary', { icon: <ShieldAlert />, grave: true }),
  fire: conEtiqueta('alarm.category.fire', { icon: <Flame />, grave: true }),
  holdup: conEtiqueta('alarm.category.holdup', { icon: <Hand />, grave: true }),
  panic: conEtiqueta('alarm.category.panic', { icon: <Bell />, grave: true }),
  medical: conEtiqueta('alarm.category.medical', { icon: <HeartPulse />, grave: true }),
  tamper: conEtiqueta('alarm.category.tamper', { icon: <Wrench />, grave: false }),
  trouble: conEtiqueta('alarm.category.trouble', { icon: <AlertTriangle />, grave: false }),
  openclose: conEtiqueta('alarm.category.openclose', { icon: <DoorOpen />, grave: false }),
  test: conEtiqueta('alarm.category.test', { icon: <Activity />, grave: false }),
  supervisory: conEtiqueta('alarm.category.supervisory', { icon: <Activity />, grave: false }),
  restore: conEtiqueta('alarm.category.restore', { icon: <Activity />, grave: false }),
};

export function categoryMeta(cat?: string | null): { label: string; icon: ReactNode; grave: boolean } {
  // El respaldo usa el código crudo del panel si viene, y si no la palabra
  // genérica traducida: un código de fabricante no se traduce.
  return (cat && CATEGORY_META[cat]) || { label: cat || i18n.t('alarm.category.default'), icon: <Siren />, grave: false };
}

/**
 * Categorías que son una EMERGENCIA por sí mismas — fuego, atraco, pánico,
 * intrusión, médica. Se pintan en `--bad` vengan con la prioridad que vengan:
 * un incendio no deja de serlo porque el panel lo haya etiquetado P3.
 */
export function categoryTone(cat?: string | null): AlarmTone {
  return categoryMeta(cat).grave ? 'bad' : 'neutral';
}

// ── Prioridad ───────────────────────────────────────────────────────────────
const PRIORITY_META: Record<number, { label: string; token: AlarmTone }> = {
  1: conEtiqueta('alarm.priority.1', { token: 'bad' as AlarmTone }),
  2: conEtiqueta('alarm.priority.2', { token: 'warn' as AlarmTone }),
  3: conEtiqueta('alarm.priority.3', { token: 'warn' as AlarmTone }),
  4: conEtiqueta('alarm.priority.4', { token: 'info' as AlarmTone }),
  5: conEtiqueta('alarm.priority.5', { token: 'neutral' as AlarmTone }),
};

export function priorityMeta(p?: number) {
  return PRIORITY_META[p || 3] || PRIORITY_META[3];
}

/**
 * La píldora de prioridad. Va tintada y no rellena porque el texto sobre un
 * relleno semántico sólo contrasta en uno de los dos temas; el token `-text`
 * está medido contra el lienzo en ambos. Lo que hace que una P1 grite no es más
 * saturación: es el punto que late y el canto rojo de la fila.
 */
export function PriorityPill({ p }: { p?: number }) {
  const meta = priorityMeta(p);
  const critica = (p || 3) === 1;
  const fill = meta.token === 'neutral' ? 'var(--ink-faint)' : `var(--${meta.token})`;
  const texto = meta.token === 'neutral' ? 'var(--ink-soft)' : `var(--${meta.token}-text)`;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold"
      style={{
        background: `color-mix(in oklab, ${fill} ${critica ? 18 : 12}%, transparent)`,
        borderColor: `color-mix(in oklab, ${fill} ${critica ? 45 : 26}%, transparent)`,
        color: texto,
      }}
    >
      <span className={critica ? 'cc-dot' : 'h-1.5 w-1.5 rounded-full'} style={{ background: fill }} />
      {meta.label}
    </span>
  );
}

/** Píldora neutra de clasificación (categoría, disposición): no lleva color
 *  porque no es una severidad. */
export function Chip({ children }: { children: ReactNode }) {
  return <StatusBadge tone="neutral" dot={false}>{children}</StatusBadge>;
}

// ── Barras por severidad ────────────────────────────────────────────────────
/**
 * Reparto de casos donde CADA barra lleva su propia gravedad. El gráfico de
 * barras genérico pinta toda la serie de un color, y con eso «Incendio» y
 * «Prueba» salían del mismo dorado de marca y la P1 del mismo azul decorativo
 * que la P5. Aquí la barra la dibuja `MeterBar` del sistema; lo único que se
 * añade es que el tono lo decide el dato.
 */
export function SeverityBars({ items, empty = i18n.t('alarm.sinDatos') }: {
  items: Array<{ label: string; count: number; tone: AlarmTone }>;
  empty?: string;
}) {
  if (!items.length) {
    return <p className="py-4 text-sm" style={{ color: 'var(--ink-faint)' }}>{empty}</p>;
  }
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="space-y-3">
      {items.map((it) => (
        <div key={it.label}>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="truncate text-xs" style={{ color: 'var(--ink-soft)' }}>{it.label}</span>
            <span className="text-xs font-semibold tabular-nums">{it.count}</span>
          </div>
          <MeterBar pct={(it.count / max) * 100} tone={it.tone} height={7} ariaLabel={`${it.label}: ${it.count}`} />
        </div>
      ))}
    </div>
  );
}

/** Tono de una prioridad P1..P5, para las barras de reparto. */
export function priorityTone(key: string): AlarmTone {
  return priorityMeta(Number(key)).token;
}

/**
 * El canto rojo de una fila crítica. Es lo que permite encontrar la alarma que
 * importa recorriendo la columna con la vista, sin leer una a una.
 */
export function CriticalRail() {
  return (
    <span
      aria-hidden
      className="absolute left-0 top-1/2 h-3/5 w-[3px] -translate-y-1/2 rounded-full"
      style={{
        background: 'var(--bad)',
        boxShadow: '0 0 12px 0 color-mix(in oklab, var(--bad) 45%, transparent)',
      }}
    />
  );
}

/** El borde de la tarjeta de un caso crítico. */
export const criticalBorder = (urgente: boolean) =>
  (urgente ? { borderColor: 'color-mix(in oklab, var(--bad) 38%, transparent)' } : undefined);

// ── Tiempo ──────────────────────────────────────────────────────────────────
/** Fecha corta — listas, donde el segundo no aporta. */
export function formatWhen(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Fecha completa con segundos — la bitácora de un caso, donde el segundo ES el
 *  dato: es lo que sostiene un parte ante el cliente o la autoridad. */
export function formatWhenFull(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

/** Cronómetro compacto de espera — «3m 07s», «2h 14m». */
export function elapsedSince(iso?: string | null, now?: number): string {
  if (!iso) return '—';
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return '—';
  let secs = Math.max(0, Math.floor(((now ?? Date.now()) - start) / 1000));
  const h = Math.floor(secs / 3600);
  secs -= h * 3600;
  const m = Math.floor(secs / 60);
  const s = secs - m * 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/** Reloj de atención: el tono lo marca la ESPERA, no la marca. Diez minutos sin
 *  atender es rojo con independencia de las preferencias de color. */
export function slaTone(iso: string | null | undefined, live: boolean, now: number): { token: AlarmTone; alarmante: boolean } {
  if (!live || !iso) return { token: 'neutral', alarmante: false };
  const ageMin = (now - new Date(iso).getTime()) / 60000;
  if (ageMin >= 10) return { token: 'bad', alarmante: true };
  if (ageMin >= 5) return { token: 'warn', alarmante: false };
  return { token: 'ok', alarmante: false };
}

/** Píldora del cronómetro, con el mismo lenguaje de tinte que el resto. */
export function ClockPill({ token, pulsa, children }: {
  token: AlarmTone; pulsa?: boolean; children: ReactNode;
}) {
  const fill = token === 'neutral' ? 'var(--ink-faint)' : `var(--${token})`;
  const texto = token === 'neutral' ? 'var(--ink-soft)' : `var(--${token}-text)`;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums${pulsa ? ' animate-pulse' : ''}`}
      style={{
        background: `color-mix(in oklab, ${fill} 12%, transparent)`,
        borderColor: `color-mix(in oklab, ${fill} 28%, transparent)`,
        color: texto,
      }}
    >
      {children}
    </span>
  );
}
