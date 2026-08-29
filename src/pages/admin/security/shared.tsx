/**
 * ════════════════════════════════════════════════════════════════════════════
 * SEGURIDAD — PIEZAS COMPARTIDAS
 * Las tres pantallas de esta carpeta (Registros del sistema, Registro de
 * seguridad e Historial de inicio de sesión) son la MISMA lectura sobre tres
 * orígenes distintos: una barra de búsqueda, un esqueleto de tabla, una tabla
 * con la fila de severidad marcada y un pie de desplazamiento infinito.
 *
 * Estaban copiadas literalmente en los tres archivos —incluido el mapa de
 * eventos, duplicado carácter a carácter entre dos de ellas—, y las copias ya
 * habían empezado a separarse: una redondeaba la tabla por arriba y otra por
 * abajo, y el contador de la cabecera decía «registros» o «eventos» según el
 * archivo. Con una sola implementación, arreglar el filo lo arregla en las tres.
 *
 * Nada de color escrito a mano: la severidad sale de `--bad` y los neutros de
 * `--ink*`, así que un intento fallido sigue siendo rojo aunque la empresa
 * elija el rojo como acento.
 * ════════════════════════════════════════════════════════════════════════════
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import {
  LogIn, LogOut, Smartphone, AlertTriangle, Search, ShieldCheck, Loader2,
} from 'lucide-react';
import { SkeletonBlock } from '@/components/kit';
import { cn } from '@/lib/utils';

export type SeverityTone = 'ok' | 'bad' | 'warn' | 'info' | 'neutral';

// ── Metadatos de evento ─────────────────────────────────────────────────────
/**
 * La severidad de un evento de auditoría es SEMÁNTICA, no decorativa: un intento
 * de acceso fallido va en rojo aunque la empresa haya elegido el rojo como
 * acento, y un inicio correcto en verde aunque el acento sea verde. Por eso cada
 * evento declara un `tone` del sistema y no un color propio.
 */
/**
 * Constante de MÓDULO: guarda la CLAVE, no el texto traducido. Llamar a `t()`
 * aquí se evaluaría al cargar el archivo —antes de que el idioma esté listo— y
 * la etiqueta quedaría congelada en el idioma de arranque para toda la sesión.
 * La traducción se hace en `metaFor`, que corre durante el render.
 */
export const EVENT_META: Record<string, { labelKey: string; label: string; icon: ReactNode; tone: SeverityTone }> = {
  login: { labelKey: 'security.event.login', label: 'Inicio de sesión', icon: <LogIn className="size-3.5" />, tone: 'ok' },
  login_failed: { labelKey: 'security.event.loginFailed', label: 'Intento fallido', icon: <AlertTriangle className="size-3.5" />, tone: 'bad' },
  logout: { labelKey: 'security.event.logout', label: 'Cierre de sesión', icon: <LogOut className="size-3.5" />, tone: 'neutral' },
  device_registered: { labelKey: 'security.event.deviceRegistered', label: 'Dispositivo registrado', icon: <Smartphone className="size-3.5" />, tone: 'info' },
  device_evicted: { labelKey: 'security.event.deviceEvicted', label: 'Dispositivo retirado', icon: <Smartphone className="size-3.5" />, tone: 'warn' },
  // El proveedor entrando al CRM de la empresa (soporte). En ámbar a propósito:
  // no es un fallo, pero es exactamente lo que el dueño quiere notar de un
  // vistazo en su historial.
  provider_access: { labelKey: 'security.event.providerAccess', label: 'Acceso de soporte (CGuardPro)', icon: <ShieldCheck className="size-3.5" />, tone: 'warn' },
};

/** Se traduce AQUÍ (en tiempo de render), no en la constante de arriba. */
export const metaFor = (event: string): { label: string; icon: ReactNode; tone: SeverityTone } => {
  const m = EVENT_META[event];
  if (!m) return { label: event, icon: <ShieldCheck className="size-3.5" />, tone: 'neutral' };
  return { label: i18n.t(m.labelKey, m.label), icon: m.icon, tone: m.tone };
};

// ── Formato ─────────────────────────────────────────────────────────────────
/** Fecha larga con segundos: en una auditoría el segundo es el dato. */
export function fmtStamp(d?: string): string {
  try {
    return new Date(d as string).toLocaleString(undefined, {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return '';
  }
}

// ── Buscador ────────────────────────────────────────────────────────────────
/** La caja de búsqueda de la barra de herramientas: lupa dentro del campo. */
export function AuditSearch({ value, onChange, placeholder = 'Buscar…' }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-xs">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
        style={{ color: 'var(--ink-faint)' }}
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="cg-input h-9 w-full pl-9 pr-3 text-sm"
      />
    </div>
  );
}

// ── Esqueleto ───────────────────────────────────────────────────────────────
/** Ocho renglones con el reparto de columnas de la tabla real: la carga tiene
 *  la misma silueta que el resultado y la página no salta al llegar los datos. */
export function AuditSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <SkeletonBlock className="h-3 w-1/5" />
          <SkeletonBlock className="h-3 w-2/5" />
          <SkeletonBlock className="h-3 w-1/5" />
          <SkeletonBlock className="h-3 w-1/5" />
        </div>
      ))}
    </div>
  );
}

// ── Tabla ───────────────────────────────────────────────────────────────────
/**
 * El armazón de la tabla. `flush` redondea el canto inferior para cuando la
 * tabla es lo último del panel; con pie de desplazamiento infinito debajo va sin
 * redondeo, que es lo que las tres pantallas hacían de tres maneras distintas.
 */
export function AuditTable({ head, children, flush = false }: {
  head: ReactNode; children: ReactNode; flush?: boolean;
}) {
  return (
    <div className={cn('overflow-x-auto', flush && 'rounded-b-2xl')}>
      {/* `min-w` es lo que hace que el `overflow-x-auto` de arriba sirva de algo:
          con sólo `w-full` las seis columnas se comprimían dentro de un teléfono
          hasta partir cada celda en una tira vertical ilegible. Con un ancho
          mínimo, la tabla se desplaza DENTRO de su marco y la página no. */}
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="cg-eyebrow border-b text-left" style={{ borderColor: 'var(--hairline)' }}>
            {head}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/**
 * Fila de auditoría. Cuando el evento es grave se tiñe MUY levemente y le crece
 * un filo rojo en el canto izquierdo: es lo que alguien viene a buscar a estas
 * pantallas, y tiene que encontrarse recorriendo la columna con la vista, sin
 * leer una a una.
 */
export function AuditRow({ tone, onClick, children }: {
  tone: SeverityTone; onClick?: () => void; children: ReactNode;
}) {
  const grave = tone === 'bad';
  return (
    <tr
      className={cn('border-b transition-colors hover:bg-muted/30', onClick && 'cursor-pointer')}
      style={{
        borderColor: 'var(--hairline)',
        background: grave ? 'color-mix(in oklab, var(--bad) 7%, transparent)' : undefined,
      }}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

/** El filo de severidad del canto izquierdo. Va dentro de la primera celda,
 *  que debe llevar `relative`. */
export function SeverityRail({ tone }: { tone: SeverityTone }) {
  if (tone !== 'bad') return null;
  return (
    <span
      aria-hidden
      className="absolute left-0 top-1/2 h-[60%] w-[3px] -translate-y-1/2 rounded-full"
      style={{
        background: 'var(--bad)',
        boxShadow: '0 0 12px color-mix(in oklab, var(--bad) 45%, transparent)',
      }}
    />
  );
}

// ── Pie de desplazamiento infinito ──────────────────────────────────────────
export function InfiniteFooter({ sentinelRef, loading, hasMore, count, endLabel }: {
  sentinelRef: React.Ref<HTMLDivElement>;
  loading: boolean; hasMore: boolean; count: number; endLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      ref={sentinelRef}
      className="flex items-center justify-center py-4 text-xs"
      style={{ color: 'var(--ink-faint)' }}
    >
      {loading && count > 0 ? (
        <span className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Cargando más…
        </span>
      ) : hasMore ? (
        <span>{t("ui.shared.desplazateParaVerMas", "Desplázate para ver más")}</span>
      ) : count > 0 ? (
        <span>— {endLabel} —</span>
      ) : null}
    </div>
  );
}
