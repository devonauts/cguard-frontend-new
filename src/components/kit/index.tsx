/**
 * ════════════════════════════════════════════════════════════════════════════
 * C-GUARD PRO — KIT DE INTERFAZ
 * El único sitio donde viven los bloques de composición. Importar desde
 * '@/components/kit'. Galería viva en /style-guide.
 *
 * ── CONTRATO ───────────────────────────────────────────────────────────────
 * 208 archivos del CRM importan de aquí. Las FIRMAS NO CAMBIAN: cambia el
 * aspecto y todo el producto lo hereda. Añadir props opcionales, sí; cambiar o
 * quitar los que ya existen, no.
 *
 * ── COLOR ──────────────────────────────────────────────────────────────────
 * Nada de `bg-green-500` ni `text-blue-600`. Los neutros salen de los tokens
 * acromáticos y el color de marca de `--brand`, que el usuario configura. Una
 * clase de color de Tailwind aquí es un color que ignora el acento elegido y
 * choca con la mitad de los tonos posibles. Los semánticos (ok/warn/bad/info)
 * son fijos a propósito: un pánico no cambia de color con las preferencias.
 * ════════════════════════════════════════════════════════════════════════════
 */
import * as React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ── Movimiento ──────────────────────────────────────────────────────────────
const EASE = [0.22, 1, 0.36, 1] as const;

/** Entrada por desvanecido + subida. Envuelve cualquier bloque. */
export function FadeIn({ children, delay = 0, y = 12, className, ...rest }: { children: React.ReactNode; delay?: number; y?: number } & HTMLMotionProps<'div'>) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Entra a los hijos en secuencia. */
export function Stagger({ children, className, gap = 0.06 }: { children: React.ReactNode; className?: string; gap?: number }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      /* El escalonado se ACOTA a ~230 ms en total: veinte filas a 60 ms cada una
         son 1,2 s mirando cómo se dibuja una tabla. */
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap, delayChildren: 0 } } }}
    >
      {React.Children.map(children, (child, i) => (
        <motion.div key={i} variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } }}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}

// ── Superficies ─────────────────────────────────────────────────────────────
/**
 * Cristal desnudo. Para cuando hace falta la superficie sin la cabecera de
 * `Section`.
 *
 * `flat` quita el desenfoque conservando el aspecto: `backdrop-filter` obliga a
 * rasterizar lo que hay detrás en cada fotograma, y en una lista de 500 filas
 * con cristal por fila el desplazamiento se cae. Cristal para superficies,
 * `flat` para lo que se repite.
 */
export function GlassPanel({ children, className, flat = false, hover = false, brand = false, ...rest }: {
  children: React.ReactNode; className?: string; flat?: boolean; hover?: boolean; brand?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(flat ? 'glass-flat' : 'glass', hover && 'glass-hover', brand && 'glass-brand', className)} {...rest}>
      {children}
    </div>
  );
}

/** El cuadrado redondeado con un icono dentro. */
export function IconTile({ children, tone = 'brand', size = 'md', className }: {
  children: React.ReactNode; tone?: 'brand' | 'neutral' | 'ok' | 'warn' | 'bad' | 'info'; size?: 'sm' | 'md' | 'lg'; className?: string;
}) {
  const dim = size === 'lg' ? 'h-14 w-14 rounded-2xl [&_svg]:size-7' : size === 'sm' ? 'h-9 w-9 rounded-xl [&_svg]:size-4' : 'h-11 w-11 rounded-xl [&_svg]:size-5';
  return (
    <div
      className={cn('flex shrink-0 items-center justify-center border', dim, className)}
      style={
        tone === 'brand'
          ? { background: 'var(--brand-wash)', borderColor: 'var(--brand-line)', color: 'var(--brand-text)' }
          : tone === 'neutral'
          ? { background: 'var(--glass-sunken)', borderColor: 'var(--hairline)', color: 'var(--ink-soft)' }
          : { background: `color-mix(in oklab, var(--${tone}) 14%, transparent)`, borderColor: `color-mix(in oklab, var(--${tone}) 32%, transparent)`, color: `var(--${tone}-text)` }
      }
    >
      {children}
    </div>
  );
}

// ── PageContainer ───────────────────────────────────────────────────────────
export function PageContainer({ children, className, width = 'default' }: { children: React.ReactNode; className?: string; width?: 'default' | 'wide' | 'narrow' }) {
  const w = width === 'wide' ? 'max-w-7xl' : width === 'narrow' ? 'max-w-3xl' : 'max-w-5xl';
  return <div className={cn('mx-auto w-full space-y-6 pb-16', w, className)}>{children}</div>;
}

// ── PageHeader ──────────────────────────────────────────────────────────────
/** El encabezado de cada página: cristal con un halo del acento detrás. */
export function PageHeader({ title, subtitle, icon, actions, badges, className }: {
  title: React.ReactNode; subtitle?: React.ReactNode; icon?: React.ReactNode;
  actions?: React.ReactNode; badges?: React.ReactNode; className?: string;
}) {
  return (
    <FadeIn className={cn('glass overflow-hidden', className)}>
      {/* El halo va DETRÁS del cristal, no encima: es lo que el desenfoque tiene
          que difuminar para que la superficie parezca tener profundidad. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-32 h-72 w-72 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--brand) 0%, transparent 70%)', opacity: 0.16 }}
      />
      <div className="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
        {icon && <IconTile size="lg">{icon}</IconTile>}
        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm" style={{ color: 'var(--ink-soft)' }}>{subtitle}</p>}
          {badges && <div className="mt-3 flex flex-wrap items-center gap-2">{badges}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </FadeIn>
  );
}

// ── Section ─────────────────────────────────────────────────────────────────
/**
 * `bare` quita el cristal y deja sólo la cabecera sobre el lienzo. Es para
 * cuando lo que va debajo YA son tarjetas: una rejilla de cristal dentro de
 * otro cristal deja dos filos concéntricos y el segundo no significa nada.
 */
export function Section({ title, icon, action, children, className, contentClassName, bare = false, flat = false }: {
  title?: React.ReactNode; icon?: React.ReactNode; action?: React.ReactNode;
  children: React.ReactNode; className?: string; contentClassName?: string; bare?: boolean; flat?: boolean;
}) {
  return (
    <div className={cn(bare ? '' : flat ? 'glass-flat p-5' : 'glass p-5', className)}>
      {(title || action) && (
        /* Misma forma que `PageHeader`: la fila SALTA y la acción no se
           encoge. Sin `flex-wrap`, una acción ancha —un desplegable más un
           buscador— desbordaba la tarjeta a lo ancho en el teléfono. El
           `gap-3` del envoltorio es el mismo de la fila, así que una acción de
           varios hijos conserva su separación de siempre. */
        <div className={cn('flex flex-wrap items-center justify-between gap-3', bare ? 'mb-3' : 'mb-4')}>
          <div className="flex min-w-0 items-center gap-2">
            {icon && <span className="[&_svg]:size-4" style={{ color: 'var(--brand-text)' }}>{icon}</span>}
            {title && <h3 className="truncate text-sm font-semibold tracking-tight">{title}</h3>}
          </div>
          {action && <div className="flex shrink-0 flex-wrap items-center gap-3">{action}</div>}
        </div>
      )}
      <div className={contentClassName}>{children}</div>
    </div>
  );
}

// ── StatCard ────────────────────────────────────────────────────────────────
/** Los acentos heredados se remapean a tonos del sistema. `green`/`blue`/etc.
 *  siguen aceptándose porque los usan decenas de páginas; ya no pintan un color
 *  de Tailwind, sino el semántico equivalente. */
type TileTone = 'brand' | 'neutral' | 'ok' | 'warn' | 'bad' | 'info';
const TONE_ALIAS: Record<string, TileTone> = {
  primary: 'brand', brand: 'brand',
  green: 'ok', blue: 'info', red: 'bad', orange: 'warn',
  slate: 'neutral', neutral: 'neutral', ok: 'ok', warn: 'warn', bad: 'bad', info: 'info',
};

export function StatCard({ label, value, icon, accent = 'primary', hint, className, flat = false }: {
  label: React.ReactNode; value: React.ReactNode; icon?: React.ReactNode;
  accent?: string; hint?: React.ReactNode; className?: string; flat?: boolean;
}) {
  return (
    <div className={cn(flat ? 'glass-flat' : 'glass glass-hover', 'flex items-center gap-3 p-4', className)}>
      {icon && <IconTile tone={TONE_ALIAS[accent] ?? 'brand'}>{icon}</IconTile>}
      <div className="min-w-0">
        <div className="cg-eyebrow truncate">{label}</div>
        <div className="font-display truncate text-xl font-bold leading-tight tabular-nums">{value}</div>
        {hint && <div className="truncate text-xs" style={{ color: 'var(--ink-faint)' }}>{hint}</div>}
      </div>
    </div>
  );
}

/**
 * La métrica grande de las referencias: número enorme + píldora de variación.
 * Es lo que `StatCard` no puede ser sin romper su firma, así que va aparte.
 */
export function MetricTile({ label, value, delta, hint, icon, className }: {
  label: React.ReactNode; value: React.ReactNode;
  delta?: { value: React.ReactNode; direction: 'up' | 'down' | 'flat' };
  hint?: React.ReactNode; icon?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('glass glass-hover p-5', className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="cg-eyebrow">{label}</div>
        {icon && <IconTile tone="neutral" size="sm">{icon}</IconTile>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-display text-3xl font-bold leading-none tracking-tight tabular-nums">{value}</span>
        {delta && <DeltaPill direction={delta.direction}>{delta.value}</DeltaPill>}
      </div>
      {hint && <div className="mt-2 text-xs" style={{ color: 'var(--ink-faint)' }}>{hint}</div>}
    </div>
  );
}

/**
 * Píldora de variación — ▲ 12,4 %.
 *
 * ── POR QUÉ EXISTE `valence` ───────────────────────────────────────────────
 * Por omisión el color va atado a la flecha: sube = verde, baja = rojo. Eso
 * vale para ingresos y para cobertura, y es MENTIRA para media consola de
 * seguridad: «incidentes −18 %» es una flecha hacia abajo y una buena noticia,
 * y pintarla de rojo dice justo lo contrario de lo que pasó.
 *
 * `valence` separa HACIA DÓNDE se mueve el número (la flecha, que sigue siendo
 * `direction`) de SI ESO ES BUENO (el color). Sin el prop, el comportamiento es
 * exactamente el de siempre.
 */
export function DeltaPill({ children, direction = 'flat', valence, className }: {
  children: React.ReactNode;
  direction?: 'up' | 'down' | 'flat';
  /** `good`/`bad`/`neutral` fuerzan el color; sin él lo decide la dirección. */
  valence?: 'good' | 'bad' | 'neutral';
  className?: string;
}) {
  const signo = valence
    ? (valence === 'good' ? 'up' : valence === 'bad' ? 'down' : 'flat')
    : direction;
  const color = signo === 'up' ? 'var(--ok)' : signo === 'down' ? 'var(--bad)' : 'var(--ink-faint)';
  const texto = signo === 'up' ? 'var(--ok-text)' : signo === 'down' ? 'var(--bad-text)' : 'var(--ink-soft)';
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums', className)}
      style={{ background: `color-mix(in oklab, ${color} 14%, transparent)`, color: texto }}
    >
      <span aria-hidden>{direction === 'up' ? '▲' : direction === 'down' ? '▼' : '—'}</span>
      {children}
    </span>
  );
}

// ── StatusBadge ─────────────────────────────────────────────────────────────
export function StatusBadge({ children, tone = 'slate', dot = true, className }: {
  children: React.ReactNode; tone?: string; dot?: boolean; className?: string;
}) {
  const t = TONE_ALIAS[tone] ?? 'neutral';
  const fill = t === 'brand' ? 'var(--brand)' : t === 'neutral' ? 'var(--ink-faint)' : `var(--${t})`;
  const texto = t === 'brand' ? 'var(--brand-text)' : t === 'neutral' ? 'var(--ink-soft)' : `var(--${t}-text)`;
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', className)}
      style={{
        background: `color-mix(in oklab, ${fill} 12%, transparent)`,
        borderColor: `color-mix(in oklab, ${fill} 26%, transparent)`,
        color: texto,
      }}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: fill }} />}
      {/* Tabulares: ~8 insignias del CRM llevan una cifra dentro y sin esto
          bailan de ancho al actualizarse en vivo. */}
      <span className="tabular-nums">{children}</span>
    </span>
  );
}

// ── StatusDot ───────────────────────────────────────────────────────────────
/**
 * El punto de estado suelto, de 8 px, con latido opcional.
 *
 * NO es el punto de `StatusBadge`: aquel mide 6 px y siempre lleva texto al
 * lado. Éste es para donde no cabe una etiqueta — la esquina de la miniatura de
 * una cámara, el canto de una fila apretada — y por eso el nombre del estado va
 * en `title` y en texto para lector de pantalla: un color por sí solo no es
 * información accesible.
 *
 * `pulse` sólo para lo que está VIVO ahora mismo (emitiendo, en curso). Un
 * punto que late sin significar nada es ruido que compite con las alarmas.
 */
export function StatusDot({ tone = 'neutral', pulse = false, label, className }: {
  tone?: 'brand' | 'neutral' | 'ok' | 'warn' | 'bad' | 'info';
  pulse?: boolean; label?: string; className?: string;
}) {
  const fill = tone === 'brand' ? 'var(--brand)' : tone === 'neutral' ? 'var(--ink-faint)' : `var(--${tone})`;
  return (
    <span className={cn('relative inline-flex shrink-0', className)} title={label}>
      <span
        className={cn('h-2 w-2 rounded-full', pulse && 'cc-dot')}
        style={{ background: fill }}
      />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}

// ── Segmented ───────────────────────────────────────────────────────────────
/** Conmutador de píldoras — «1 año / 6 meses / 3 meses», como en la referencia. */
export function Segmented<T extends string>({ value, onChange, options, className }: {
  value: T; onChange: (v: T) => void; options: Array<{ value: T; label: React.ReactNode }>; className?: string;
}) {
  return (
    /* Con cinco opciones el riel medía ~500 px y ensanchaba la página entera
       en el teléfono. Se desplaza por dentro en vez de crecer, igual que
       `TabNav`: partir un riel de píldoras en dos líneas deja los extremos
       redondeados colgando y se lee como un fallo. `min-w-0` hace falta
       porque dentro de un flex el mínimo por defecto es el del CONTENIDO.
       Con dos o tres opciones no cambia absolutamente nada. */
    <div className={cn('glass-sunken inline-flex min-w-0 max-w-full items-center gap-1 overflow-x-auto p-1', className)} role="tablist">
      {options.map((o) => {
        const activo = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={activo}
            onClick={() => onChange(o.value)}
            className="cg-focus min-h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 sm:min-h-0"
            style={
              activo
                ? { background: 'var(--brand)', color: 'var(--brand-ink)', boxShadow: '0 0 18px -6px var(--brand-glow)' }
                : { color: 'var(--ink-soft)' }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Barra de filtros/acciones de cristal. */
export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('glass flex flex-wrap items-center gap-2 p-2', className)}>{children}</div>;
}

// ── EmptyState ──────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, description, action, className, variant = 'boxed' }: {
  icon?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode;
  action?: React.ReactNode; className?: string;
  /** `inline` quita el marco punteado: dentro de una celda o de una tarjeta
   *  que YA tiene borde, el segundo marco no significa nada. 6+ sitios lo
   *  deshacían pasando `className="border-0"`. */
  variant?: 'boxed' | 'inline';
}) {
  return (
    <div
      className={cn('cg-in-soft flex flex-col items-center justify-center text-center',
        variant === 'inline' ? 'px-4 py-8' : 'rounded-3xl border border-dashed px-6 py-12', className)}
      style={variant === 'inline' ? undefined : { borderColor: 'var(--hairline)', background: 'var(--glass-sunken)' }}
    >
      {icon && <div className="mb-3"><IconTile tone="neutral" size="lg">{icon}</IconTile></div>}
      <div className="text-sm font-semibold">{title}</div>
      {description && <p className="mt-1 max-w-sm text-sm" style={{ color: 'var(--ink-soft)' }}>{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── Esqueletos ──────────────────────────────────────────────────────────────
export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('cg-skeleton h-4 w-full', className)} />;
}
/**
 * El esqueleto va en `glass-flat`, NO en `glass`: son N tarjetas dentro de un
 * `map()` y `backdrop-filter` obliga a rasterizar el fondo de cada una en cada
 * fotograma — justo mientras la página aún está cargando. Mismo aspecto, sin
 * el coste. Es la regla de la nota de coste de glass.css.
 */
export function SkeletonCards({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass-flat cg-swap space-y-3 p-4">
          <div className="cg-skeleton h-11 w-11 rounded-xl" />
          <SkeletonBlock className="h-3 w-2/3" />
          <SkeletonBlock className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────
export function Modal({ open, onOpenChange, title, description, icon, children, footer, size = 'md' }: {
  open: boolean; onOpenChange: (o: boolean) => void; title?: React.ReactNode; description?: React.ReactNode;
  icon?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  /* `xl` es para una ficha que se REVISA, no que se confirma: la tarjeta de
     tiempo de un día entera —fichajes, sesiones, mapas y bitácora— no cabe en
     `lg` sin convertirse en un tubo de scroll. */
  const w = size === 'xl' ? 'sm:max-w-4xl' : size === 'lg' ? 'sm:max-w-2xl' : size === 'sm' ? 'sm:max-w-sm' : 'sm:max-w-lg';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(w, 'gap-0 overflow-hidden p-0')}>
        {(title || icon) && (
          <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b p-5" style={{ borderColor: 'var(--hairline)' }}>
            {icon && <IconTile size="sm">{icon}</IconTile>}
            <div className="min-w-0">
              {title && <DialogTitle className="truncate text-base font-semibold">{title}</DialogTitle>}
              {description && <DialogDescription className="text-xs">{description}</DialogDescription>}
            </div>
          </DialogHeader>
        )}
        {/* El cuerpo no puede pedir 70vh cuando la cabecera y el pie ya se han
            llevado su parte: en una pantalla baja el pie quedaba recortado por
            el `overflow-hidden` del diálogo. */}
        <div className="max-h-[min(70vh,calc(90dvh-9rem))] overflow-y-auto p-5">{children}</div>
        {footer && (
          <DialogFooter className="border-t p-4" style={{ borderColor: 'var(--hairline)', background: 'var(--glass-sunken)' }}>
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Field ───────────────────────────────────────────────────────────────────
/** SÓLO LECTURA — el par etiqueta/dato de una ficha. Para un campo EDITABLE es
 *  `FormField`, que es otra cosa: lleva `<label for>`, pista y error. */
export function Field({ label, value, className, numeric = false }: {
  label: React.ReactNode; value: React.ReactNode; className?: string; numeric?: boolean;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="cg-eyebrow mb-0.5">{label}</div>
      <div className={cn('truncate text-sm font-medium text-foreground', numeric && 'tabular-nums')}>{value || '—'}</div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   PIEZAS PROMOVIDAS
   Todo lo que sigue estaba escrito a mano en 4 o más áreas del CRM. No son
   inventos: son la forma que ya había ganado, extraída al único sitio donde
   puede corregirse una vez para todos.
   ════════════════════════════════════════════════════════════════════════════ */

// ── InfoNote ────────────────────────────────────────────────────────────────
/**
 * El recuadro de aviso dentro de un formulario o un panel. Sustituye a los
 * `bg-yellow-50 border-yellow-300 text-yellow-800` con su gemelo `dark:` — que
 * era escribir dos temas a mano para cada tono.
 *
 * CUÁNDO: una explicación o una advertencia ligada a lo que hay al lado.
 * Para algo que interrumpe la tarea, un `Modal`; para el resultado de una
 * acción que acaba de ocurrir, un aviso emergente (`sonner`).
 */
export function InfoNote({ children, tone = 'info', icon, title, className }: {
  children?: React.ReactNode;
  tone?: 'info' | 'ok' | 'warn' | 'bad' | 'brand' | 'neutral';
  icon?: React.ReactNode; title?: React.ReactNode; className?: string;
}) {
  const esMarca = tone === 'brand';
  const esNeutro = tone === 'neutral';
  const fondo = esMarca
    ? 'var(--brand-wash)'
    : esNeutro
    ? 'var(--glass-sunken)'
    : `color-mix(in oklab, var(--${tone}) 12%, transparent)`;
  const filo = esMarca
    ? 'var(--brand-line)'
    : esNeutro
    ? 'var(--hairline)'
    : `color-mix(in oklab, var(--${tone}) 30%, transparent)`;
  const tinta = esMarca ? 'var(--brand-text)' : esNeutro ? 'var(--ink-soft)' : `var(--${tone}-text)`;

  return (
    <div
      className={cn('flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:translate-y-0.5', className)}
      style={{ background: fondo, borderColor: filo, color: tinta }}
      role={tone === 'bad' ? 'alert' : undefined}
    >
      {icon}
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={cn(title && 'mt-0.5', 'leading-relaxed')}>{children}</div>}
      </div>
    </div>
  );
}

// ── TabNav ──────────────────────────────────────────────────────────────────
/**
 * El carril de pestañas de una ficha. Estaba copiado literalmente en cinco
 * páginas y otras dos hacían el mismo trabajo con otro aspecto — un
 * `border-b-2` plano y unas pestañas de shadcn — así que el mismo producto
 * tenía tres lenguajes de pestañas.
 *
 * CUÁNDO: secciones de UN registro (un cliente, un vigilante, un puesto).
 * Para filtrar una misma lista —«Día / Semana / Mes»— es `Segmented`.
 *
 * Cada elemento navega (`to`) o conmuta (`onChange`). El subrayado activo es un
 * hijo posicionado y no un `border-bottom` porque tiene que llevar el halo del
 * acento, y una sombra sobre un borde se recorta.
 */
export function TabNav<T extends string>({ items, value, onChange, className }: {
  items: Array<{ value: T; label: React.ReactNode; icon?: React.ReactNode; badge?: number | null; to?: string }>;
  value: T;
  onChange?: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <nav className="flex min-w-max items-center gap-1 border-b" style={{ borderColor: 'var(--hairline)' }} role="tablist">
        {items.map((it) => {
          const activo = it.value === value;
          const dentro = (
            <>
              {it.icon && <span className="[&_svg]:size-4">{it.icon}</span>}
              {it.label}
              {typeof it.badge === 'number' && it.badge > 0 && (
                /* Sobre el relleno de marca la tinta es `--brand-ink`, NO
                   blanco: `--brand` es claro (L 0,72/0,78) y el blanco encima
                   da ~2,2:1. Ver la medición en tokens.css. */
                <span
                  className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
                  style={activo
                    ? { background: 'var(--brand)', color: 'var(--brand-ink)' }
                    : { background: 'var(--glass-sunken)', color: 'var(--ink-soft)' }}
                >
                  {it.badge}
                </span>
              )}
              {activo && (
                <span
                  aria-hidden
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                  style={{ background: 'var(--brand)', boxShadow: '0 0 12px 0 var(--brand-glow)' }}
                />
              )}
            </>
          );
          const clases = 'cg-focus relative flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition-colors motion-reduce:transition-none';
          const estilo = { color: activo ? 'var(--brand-text)' : 'var(--ink-soft)' };

          return it.to ? (
            <Link key={it.value} to={it.to} role="tab" aria-selected={activo} className={clases} style={estilo}>
              {dentro}
            </Link>
          ) : (
            <button key={it.value} type="button" role="tab" aria-selected={activo} onClick={() => onChange?.(it.value)} className={clases} style={estilo}>
              {dentro}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// ── Avatar ──────────────────────────────────────────────────────────────────
/** Las iniciales de un nombre. Estaba resuelto de OCHO formas distintas por el
 *  CRM, cada una fallando con un caso de borde diferente (nombre vacío, un solo
 *  apellido, espacios de más). Una sola, aquí. */
export function initialsOf(name?: string | null): string {
  return (
    (name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0] ?? '')
      .join('')
      .toUpperCase() || '?'
  );
}

/**
 * La foto —o las iniciales— de una persona. Sin `backdrop-filter`: aparece
 * dentro de listas largas.
 *
 * El fondo de las iniciales NO se deriva del nombre. Un tono por persona
 * («hash del nombre → matiz») mete un color aleatorio en una superficie
 * acromática y choca con la mitad de los acentos posibles.
 *
 * `solid` invierte a relleno de marca, para señalar al titular de una cuenta
 * entre sus acompañantes.
 *
 * La escala es la MISMA que la de `IconTile` (36 / 44 / 56 px) a propósito: un
 * retrato y una ficha de icono son el mismo objeto para la maquetación, y si no
 * miden igual una fila con los dos mezclados queda escalonada.
 */
export function Avatar({ name, src, icon, size = 'md', tone = 'brand', className }: {
  name?: string | null; src?: string | null; icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg'; tone?: 'brand' | 'neutral' | 'solid'; className?: string;
}) {
  const dim = size === 'lg' ? 'h-14 w-14 text-base [&_svg]:size-6' : size === 'sm' ? 'h-9 w-9 text-[11px] [&_svg]:size-4' : 'h-11 w-11 text-xs [&_svg]:size-5';
  const paleta = tone === 'solid'
    ? { background: 'var(--brand)', borderColor: 'transparent', color: 'var(--brand-ink)' }
    : tone === 'brand'
    ? { background: 'var(--brand-wash)', borderColor: 'var(--brand-line)', color: 'var(--brand-text)' }
    : { background: 'var(--glass-sunken)', borderColor: 'var(--hairline)', color: 'var(--ink-soft)' };

  if (src) {
    return (
      <img
        src={src}
        alt={name || ''}
        className={cn('shrink-0 rounded-full border object-cover', dim, className)}
        style={{ borderColor: paleta.borderColor }}
      />
    );
  }
  return (
    <div
      className={cn('flex shrink-0 items-center justify-center rounded-full border font-bold', dim, className)}
      style={paleta}
      aria-hidden={!name}
      title={name || undefined}
    >
      {icon ?? initialsOf(name)}
    </div>
  );
}

// ── ListRow ─────────────────────────────────────────────────────────────────
/**
 * La fila de una lista de personas o registros: retrato, nombre, una línea de
 * apoyo y lo que haga falta a la derecha. Quince áreas la escribían a mano.
 *
 * Sin desenfoque a propósito — se repite N veces (ver la nota de coste de
 * glass.css). `interactive` sólo cambia el fondo al pasar el puntero: una fila
 * que se levanta 2 px hace saltar a las de al lado.
 */
export function ListRow({ avatar, title, subtitle, badges, meta, actions, onClick, to, className }: {
  avatar?: React.ReactNode; title: React.ReactNode; subtitle?: React.ReactNode;
  badges?: React.ReactNode; meta?: React.ReactNode; actions?: React.ReactNode;
  onClick?: () => void; to?: string; className?: string;
}) {
  const interactivo = Boolean(onClick || to);
  const dentro = (
    <>
      {avatar}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{title}</span>
          {badges}
        </div>
        {subtitle && <div className="truncate text-xs" style={{ color: 'var(--ink-soft)' }}>{subtitle}</div>}
      </div>
      {meta && <div className="shrink-0 text-xs tabular-nums" style={{ color: 'var(--ink-faint)' }}>{meta}</div>}
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </>
  );
  const clases = cn(
    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors motion-reduce:transition-none',
    interactivo && 'cg-focus hover:[background:var(--glass-sunken)]',
    className,
  );

  if (to) return <Link to={to} className={clases}>{dentro}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={clases}>{dentro}</button>;
  return <div className={clases}>{dentro}</div>;
}

// ── CatalogTile ─────────────────────────────────────────────────────────────
/**
 * La tarjeta de un catálogo: ficha de icono, título, una línea de qué hace y a
 * dónde lleva. Es la rejilla de Ajustes, de Informes y de Nómina.
 *
 * `glass-flat` y no `glass`: van en rejillas de ocho o diez.
 */
export function CatalogTile({ icon, title, description, badge, to, onClick, tone = 'brand', className }: {
  icon?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; badge?: React.ReactNode;
  to?: string; onClick?: () => void; tone?: 'brand' | 'neutral' | 'ok' | 'warn' | 'bad' | 'info'; className?: string;
}) {
  const dentro = (
    <>
      {icon && <IconTile tone={tone} size="sm">{icon}</IconTile>}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          {badge}
        </div>
        {description && <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--ink-faint)' }}>{description}</p>}
      </div>
    </>
  );
  const clases = cn('glass-flat glass-hover cg-focus flex h-full items-start gap-3 p-4 text-left', className);

  if (to) return <Link to={to} className={clases}>{dentro}</Link>;
  return <button type="button" onClick={onClick} className={clases}>{dentro}</button>;
}

// ── FormField ───────────────────────────────────────────────────────────────
/**
 * El envoltorio de un campo EDITABLE: etiqueta, control, pista y error. Trece
 * áreas lo escribían a mano con cuatro variantes de espaciado distintas, y el
 * error salía en `text-red-600` — un rojo que no es el `--bad` del sistema.
 *
 * Ata la etiqueta al control con `htmlFor`, que es lo que hace que pulsar el
 * texto ponga el cursor dentro, y anuncia el error con `role="alert"`.
 */
export function FormField({ label, htmlFor, hint, error, required = false, full = false, children, className }: {
  label?: React.ReactNode; htmlFor?: string; hint?: React.ReactNode; error?: React.ReactNode;
  required?: boolean; full?: boolean; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('min-w-0 space-y-2', full && 'sm:col-span-2', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium">
          {label}
          {required && <span style={{ color: 'var(--brand-text)' }} aria-hidden> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs" style={{ color: 'var(--bad-text)' }} role="alert">{error}</p>
      ) : hint ? (
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{hint}</p>
      ) : null}
    </div>
  );
}

// ── Clase de campo ──────────────────────────────────────────────────────────
/**
 * La cadena de clases de un campo suelto: un `<input>`, un `<select>` o un
 * `<textarea>` nativos, donde no se pueda usar `<Input>`/`<Select>`.
 *
 * ── POR QUÉ NO VIVE EN `.cg-input` ─────────────────────────────────────────
 * `.cg-input` (glass.css) da la SUPERFICIE: hueco de cristal, filo, tinta y aro
 * de foco. Esto de aquí es TAMAÑO: alto, ancho y relleno. Meter el tamaño en
 * `.cg-input` rompería a todos los que necesitan otro — la casilla del código
 * de verificación es 44×44, el área de texto crece con el contenido, y el campo
 * de las pantallas de acceso mide 48 de alto para el dedo. Superficie y tamaño
 * son decisiones distintas y se combinan.
 *
 * `cg-focus` NO va aquí: `.cg-input:focus-visible` ya pinta su aro. Añadir los
 * dos deja dos anillos superpuestos de radios distintos.
 */
export const FIELD_CLS = 'cg-input flex h-9 w-full px-3 py-1 text-sm';

/** Variante alta, para modales y formularios donde el campo respira más. */
export const FIELD_CLS_LG = 'cg-input w-full px-3 py-2 text-sm';

// ── SearchInput ─────────────────────────────────────────────────────────────
/**
 * El buscador con lupa. Cuarenta y cuatro archivos lo montaban a mano con tres
 * cadenas de clases distintas para lo mismo.
 *
 * Lleva `type="search"` para que el teclado del móvil traiga la tecla «buscar»,
 * y el aspa de limpiar sólo existe cuando hay algo que limpiar.
 */
export function SearchInput({ value, onChange, placeholder, className, ...rest }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'className'>) {
  const { t } = useTranslation();
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t('kit.search.placeholder', { defaultValue: 'Buscar…' })}
        className="cg-input h-9 w-full pl-9 pr-9 text-sm [&::-webkit-search-cancel-button]:appearance-none"
        {...rest}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t('kit.search.clear', { defaultValue: 'Limpiar búsqueda' })}
          className="cg-focus absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1"
          style={{ color: 'var(--ink-faint)' }}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

// ── Meter ───────────────────────────────────────────────────────────────────
/**
 * La barra de progreso fina. Seis áreas la escribían idéntica.
 * Es `role="progressbar"` de verdad: un lector de pantalla anuncia el valor en
 * vez de leer dos divs vacíos.
 */
export function Meter({ value, max = 100, tone = 'brand', label, showValue = false, className }: {
  value: number; max?: number; tone?: 'brand' | 'ok' | 'warn' | 'bad' | 'info' | 'neutral';
  label?: React.ReactNode; showValue?: boolean; className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const relleno = tone === 'brand' ? 'var(--brand)' : tone === 'neutral' ? 'var(--ink-faint)' : `var(--${tone})`;
  return (
    <div className={cn('min-w-0', className)}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
          {label && <span style={{ color: 'var(--ink-soft)' }}>{label}</span>}
          {showValue && <span className="font-semibold tabular-nums">{Math.round(pct)} %</span>}
        </div>
      )}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--glass-sunken)' }}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${pct}%`, background: relleno }}
        />
      </div>
    </div>
  );
}

// ── Pagination ──────────────────────────────────────────────────────────────
/**
 * El pie de una tabla larga. Veintidós archivos repetían la misma fila —
 * incluida la cadena literal «Elementos por página»— y otra área había
 * inventado un paginador numerado en paralelo: dos idiomas de paginación en un
 * mismo producto.
 *
 * El rango va en `tabular-nums`: sin ancho fijo de cifra, «9 – 18 de 240» baila
 * horizontalmente cada vez que se cambia de página.
 */
export function Pagination({
  page, pageSize, total, onPageChange, onPageSizeChange,
  pageSizes = [10, 25, 50, 100], numbered = false, noun, className,
}: {
  page: number; pageSize: number; total: number;
  onPageChange: (p: number) => void; onPageSizeChange?: (n: number) => void;
  pageSizes?: number[];
  /** Botones de página numerados además de anterior/siguiente. */
  numbered?: boolean;
  /** «resultados», «vigilantes»… Sin él, el rango va escueto. */
  noun?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const ultima = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const desde = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const hasta = Math.min(total, page * pageSize);
  /* Alto mínimo de dedo: a 28 px de alto estos botones se fallaban con el
     pulgar y la página saltaba de página sin querer. */
  const flecha = 'cg-btn-glass cg-focus min-h-9 rounded-full px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-45';

  /* Ventana de cinco números centrada en la página actual. Empezar siempre por
     el 1 —como hacía una de las dos versiones que había— deja los botones
     inservibles en cuanto hay más de cinco páginas: en la 9 de 12 ofrecía
     saltar a la 1, 2, 3, 4 o 5 y a ninguna de las cercanas. */
  const primera = Math.max(1, Math.min(page - 2, ultima - 4));
  const numeros = Array.from({ length: Math.min(5, ultima) }, (_, k) => primera + k);

  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-x-6 gap-y-3 text-sm', className)} style={{ color: 'var(--ink-soft)' }}>
      {onPageSizeChange && (
        <div className="flex items-center gap-2">
          <span>{t('kit.pagination.perPage', { defaultValue: 'Elementos por página' })}</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {pageSizes.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="tabular-nums">
        {(() => {
          const of = t('kit.pagination.of', { defaultValue: 'de' });
          return total === 0
            ? `0 ${of} 0${noun ? ` ${noun}` : ''}`
            : `${desde} – ${hasta} ${of} ${total}${noun ? ` ${noun}` : ''}`;
        })()}
      </div>

      <div className="flex items-center gap-1.5">
        <button type="button" className={flecha} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>{t('kit.pagination.prev', { defaultValue: 'Anterior' })}</button>
        {numbered && numeros.map((n) => (
          <button
            key={n}
            type="button"
            aria-current={n === page ? 'page' : undefined}
            onClick={() => onPageChange(n)}
            className="cg-focus grid h-9 min-w-9 place-items-center rounded-full border px-2 text-xs font-semibold tabular-nums"
            style={n === page
              ? { background: 'var(--brand)', color: 'var(--brand-ink)', borderColor: 'transparent' }
              : { borderColor: 'var(--hairline)' }}
          >
            {n}
          </button>
        ))}
        <button type="button" className={flecha} disabled={page >= ultima} onClick={() => onPageChange(page + 1)}>{t('kit.pagination.next', { defaultValue: 'Siguiente' })}</button>
      </div>
    </div>
  );
}

// ── Stepper ─────────────────────────────────────────────────────────────────
/** El indicador de pasos numerado. Vivía suelto en `components/onboarding/`,
 *  donde nadie lo encontraba; se reexporta aquí para que esté donde se busca.
 *  Su implementación no se ha movido: quien ya lo importaba sigue igual. */
export { default as Stepper, type StepIndicatorStep as StepperStep } from '@/components/onboarding/StepIndicator';

// ── Movimiento (piezas que necesitan saber que un valor CAMBIÓ) ─────────────
export { Cifra, AlCambiar, ProgresoDeRuta } from './movimiento';
export { SmartImage } from './SmartImage';
