/**
 * ════════════════════════════════════════════════════════════════════════════
 * PIEZAS COMPARTIDAS — FICHA DE CLIENTE Y FICHA DE PUESTO
 *
 * La ficha de cliente tiene 13 pestañas y la de puesto otras tantas. Antes de
 * este archivo cada una traía su propia copia del mismo bloque: el mismo
 * encabezado de tabla, el mismo paginador, la misma tira de pie con «Última
 * actualización», la misma tarjeta de KPI, la misma clase de campo. Copiado
 * once veces, doce si contamos el que se escriba mañana — y divergiendo: unas
 * pestañas ya usaban `cg-eyebrow` en las cabeceras y otras se habían quedado
 * con `text-xs uppercase tracking-wide` a mano; unas pintaban el paginador con
 * `border` de Tailwind y otras con `var(--hairline)`.
 *
 * Aquí vive UNA versión de cada bloque. Cambiarla cambia las trece pestañas a
 * la vez, que es justo lo que hacía falta para que Contrato, Cobertura,
 * Personal, Incidentes y Documentos no parezcan cinco productos distintos.
 *
 * ── PARA PROMOVER A `@/components/kit` ──────────────────────────────────────
 * Nada de esto es específico de clientes: `TabTable`/`Th`/`Tr`, `Pager`,
 * `TabFooter`, `KpiTile`, `RowAction`, `LabeledField` y `Avatar` sirven a
 * cualquier pestaña del CRM con una tabla dentro. Viven aquí porque el kit es
 * territorio compartido y esta pasada sólo podía tocar clientes y puestos.
 * El sitio definitivo es `@/components/kit`; la firma ya está pensada para
 * mudarse sin tocar quien las usa.
 *
 * ── COLOR ───────────────────────────────────────────────────────────────────
 * Ni un color escrito a mano. Neutros de `--ink*`/`--hairline`/`--glass*`,
 * marca de `--brand*`, y los semánticos `ok|warn|bad|info` para lo que
 * significa algo. Así el claro y el oscuro salen de un solo código.
 * ════════════════════════════════════════════════════════════════════════════
 */
import * as React from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  GlassPanel,
  IconTile,
  SkeletonCards,
  SmartImage,
} from "@/components/kit";
import { MeterBar } from "@/components/charts";

// ── Campos ──────────────────────────────────────────────────────────────────
/**
 * La clase de campo del sistema. `cg-input` trae el hueco de cristal y
 * `cg-focus` el aro del acento; la altura fija en 9 es lo que alinea un
 * `<input>` con un `<select>` puestos en la misma rejilla de filtros.
 *
 * Estaba declarada literal en ocho pestañas de cliente y con cuatro variantes
 * distintas en puestos — dos de ellas sin cristal (`border-input bg-background`),
 * que es lo que hacía que el mismo formulario cambiara de aspecto según la
 * pestaña.
 */
export const FIELD_CLS = "cg-input cg-focus flex h-9 w-full px-3 py-1 text-sm";

/** Variante alta, para modales donde el campo respira más. */
export const FIELD_CLS_LG = "cg-input cg-focus w-full px-3 py-2 text-sm";

/**
 * Etiqueta + control. La etiqueta va en `cg-eyebrow` (11 px, versalita, 0.08em)
 * porque es el mismo tratamiento que llevan las cabeceras de tabla y los
 * rótulos de `Field`/`StatCard` del kit: un solo idioma para «esto es un
 * rótulo, no contenido».
 */
export function LabeledField({
  label,
  children,
  full,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  full?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(full && "sm:col-span-2", "min-w-0", className)}>
      <label className="cg-eyebrow mb-1 block">{label}</label>
      {children}
    </div>
  );
}

// ── Tablas ──────────────────────────────────────────────────────────────────
/**
 * El envoltorio de tabla de las pestañas. El `overflow-x-auto` va SIEMPRE:
 * estas tablas tienen entre 6 y 9 columnas y sin él el móvil desborda la
 * página entera en vez de desplazar la tabla.
 *
 * `minWidth` va en `style` y no en `min-w-[720px]` porque Tailwind no genera
 * clases arbitrarias calculadas en tiempo de ejecución.
 */
export function TabTable({
  minWidth = 720,
  children,
  className,
}: {
  minWidth?: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-sm", className)} style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

/** La fila de cabecera. Filo inferior de `--hairline`, nunca `border` a secas. */
export function THead({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <thead>
      <tr
        className={cn("border-b text-left", className)}
        style={{ borderColor: "var(--hairline)" }}
      >
        {children}
      </tr>
    </thead>
  );
}

/** Celda de cabecera — `cg-eyebrow` y nada más. */
export function Th({
  children,
  align,
  className,
  ...rest
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
} & React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "cg-eyebrow px-2 py-2",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

/**
 * Fila de cuerpo. `selected` pinta el lavado del acento — el mismo marcador de
 * «esta es la fila activa» que usa el resto del sistema.
 *
 * El realce al pasar el puntero es UNO. Estaba escrito a mano archivo por
 * archivo con cuatro opacidades distintas (`hover:bg-muted/20`, `/30`, `/40`,
 * `/50`), así que la misma tabla se sentía más o menos viva según la pestaña.
 *
 * Sobre la fila SELECCIONADA no se aplica: ahí el fondo va en línea y ganaría
 * al hover, dejando el realce a medias.
 */
export function Tr({
  children,
  selected,
  onClick,
  className,
  style,
  ...rest
}: {
  children: React.ReactNode;
  selected?: boolean;
  className?: string;
} & React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-b transition-colors last:border-0",
        !selected && "hover:bg-muted/40",
        onClick && "cursor-pointer",
        className,
      )}
      style={{
        borderColor: "var(--hairline)",
        background: selected ? "var(--brand-wash)" : undefined,
        ...style,
      }}
      onClick={onClick}
      {...rest}
    >
      {children}
    </tr>
  );
}

// ── Acciones de fila ────────────────────────────────────────────────────────
/**
 * El botón-icono del final de una fila. `tone="bad"` para destructivo. Sale
 * también como `<a>` cuando la acción es una descarga, para no perder la
 * semántica del enlace.
 */
export function RowAction({
  children,
  title,
  tone = "neutral",
  href,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  tone?: "neutral" | "bad";
  href?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const cls = "cg-focus rounded-md p-1.5 transition-opacity hover:opacity-70";
  const color = tone === "bad" ? "var(--bad-text)" : "var(--ink-soft)";

  if (disabled) {
    return (
      <span
        className="rounded-md p-1.5 opacity-40"
        style={{ color: "var(--ink-faint)" }}
        title={title}
      >
        {children}
      </span>
    );
  }
  if (href) {
    return (
      <a
        className={cls}
        href={href}
        rel="noreferrer"
        style={{ color }}
        target="_blank"
        title={title}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      className={cls}
      style={{ color }}
      title={title}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** El contenedor de los botones de acción — alineado a la derecha, siempre. */
export function RowActions({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end gap-1">{children}</div>;
}

// ── Paginación ──────────────────────────────────────────────────────────────
/**
 * El pie de tabla con «Mostrando X a Y de Z» y los números de página.
 *
 * Estaba copiado en cuatro pestañas y en dos de ellas los botones llevaban
 * `border` de Tailwind sin color: sobre el lienzo oscuro salía un filo que no
 * era `--hairline`. Aquí el filo es siempre el token y la página activa es
 * relleno de marca con tinta de marca, que es el contraste que el sistema
 * garantiza.
 */
export function Pager({
  page,
  pageCount,
  total,
  perPage,
  noun = "resultados",
  onPage,
  className,
}: {
  page: number;
  pageCount: number;
  total: number;
  perPage: number;
  noun?: string;
  onPage: (p: number) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const arrow = "cg-focus rounded-md border px-2 py-1 disabled:opacity-40";

  return (
    <div
      className={cn(
        "mt-3 flex flex-wrap items-center justify-between gap-2 text-sm",
        className,
      )}
      style={{ color: "var(--ink-soft)" }}
    >
      <span>
        Mostrando {total === 0 ? 0 : (page - 1) * perPage + 1} a{" "}
        {Math.min(page * perPage, total)} de {total} {noun}
      </span>
      <div className="flex items-center gap-1">
        <button
          aria-label={t("ui.tabkit.paginaAnterior", "Página anterior")}
          className={arrow}
          disabled={page <= 1}
          style={{ borderColor: "var(--hairline)" }}
          type="button"
          onClick={() => onPage(page - 1)}
        >
          ‹
        </button>
        {Array.from({ length: Math.min(5, pageCount) }).map((_, k) => {
          const n = k + 1;

          return (
            <button
              key={n}
              aria-current={n === page ? "page" : undefined}
              className="cg-focus grid h-7 min-w-[28px] place-items-center rounded-md border px-2 text-xs font-semibold"
              style={
                n === page
                  ? {
                      background: "var(--brand)",
                      color: "var(--brand-ink)",
                      borderColor: "transparent",
                    }
                  : { borderColor: "var(--hairline)" }
              }
              type="button"
              onClick={() => onPage(n)}
            >
              {n}
            </button>
          );
        })}
        <button
          aria-label={t("ui.tabkit.paginaSiguiente", "Página siguiente")}
          className={arrow}
          disabled={page >= pageCount}
          style={{ borderColor: "var(--hairline)" }}
          type="button"
          onClick={() => onPage(page + 1)}
        >
          ›
        </button>
      </div>
    </div>
  );
}

// ── Pie de pestaña ──────────────────────────────────────────────────────────
/**
 * La tira hundida del final: una nota de contexto a la izquierda y la hora del
 * último refresco con su botón a la derecha. Cinco pestañas la traían escrita
 * a mano, carácter por carácter.
 */
export function TabFooter({
  icon,
  note,
  updatedAt,
  onRefresh,
}: {
  icon?: React.ReactNode;
  note: React.ReactNode;
  updatedAt?: string;
  onRefresh?: () => void;
}) {
  return (
    <div
      className="glass-sunken flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs"
      style={{ color: "var(--ink-soft)" }}
    >
      <span className="inline-flex items-center gap-1.5 [&_svg]:size-3.5">
        {icon}
        {note}
      </span>
      <span className="inline-flex items-center gap-2">
        {updatedAt && <>Última actualización: {updatedAt}</>}
        {onRefresh && (
          <button
            className="cg-focus inline-flex items-center gap-1 rounded-md font-semibold hover:underline"
            style={{ color: "var(--brand-text)" }}
            type="button"
            onClick={onRefresh}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Actualizar
          </button>
        )}
      </span>
    </div>
  );
}

// ── Carga ───────────────────────────────────────────────────────────────────
/**
 * El estado de carga de una pestaña. Existe para que no vuelva a haber cuatro:
 * cuatro pestañas hermanas mostraban «Cargando contrato…» en texto plano
 * mientras las otras cinco ya pintaban esqueletos, y saltar entre ellas
 * parecía cambiar de aplicación.
 */
export function TabLoading({ count = 4 }: { count?: number }) {
  return <SkeletonCards className="p-1" count={count} />;
}

// ── KPI ─────────────────────────────────────────────────────────────────────
type Tono = "brand" | "neutral" | "ok" | "warn" | "bad" | "info";
const KPI_TONE: Record<string, Tono> = {
  primary: "brand",
  brand: "brand",
  green: "ok",
  ok: "ok",
  orange: "warn",
  warn: "warn",
  red: "bad",
  bad: "bad",
  blue: "info",
  info: "info",
  slate: "neutral",
  neutral: "neutral",
};

/**
 * La tarjeta de KPI de las pestañas: icono en baldosa, número grande, rótulo y
 * — opcional — una barra de progreso debajo.
 *
 * Va en `GlassPanel flat` (sin desenfoque) a propósito: estas tarjetas salen en
 * filas de cuatro a siete y `backdrop-filter` repetido es justo lo que tumba el
 * desplazamiento.
 */
export function KpiTile({
  icon,
  value,
  label,
  sub,
  accent = "primary",
  bar,
  barTone,
  className,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: React.ReactNode;
  sub?: React.ReactNode;
  accent?: string;
  bar?: number | null;
  barTone?: "ok" | "warn" | "bad";
  className?: string;
}) {
  return (
    <GlassPanel flat className={cn("p-4", className)}>
      <IconTile className="mb-2" size="sm" tone={KPI_TONE[accent] ?? "brand"}>
        {icon}
      </IconTile>
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-2xl font-bold leading-tight tabular-nums">
          {value}
        </span>
        {sub}
      </div>
      <div className="truncate text-xs" style={{ color: "var(--ink-soft)" }}>
        {label}
      </div>
      {bar != null && (
        <MeterBar
          ariaLabel={typeof label === "string" ? label : undefined}
          className="mt-2"
          height={6}
          minVisiblePct={3}
          pct={bar}
          tone={barTone ?? (bar >= 90 ? "ok" : bar >= 60 ? "warn" : "bad")}
        />
      )}
    </GlassPanel>
  );
}

// ── Avatar ──────────────────────────────────────────────────────────────────
/**
 * Foto de la persona o sus iniciales. Las iniciales van en el lavado del acento
 * con su filo, no en un gris: es lo que las distingue de un hueco vacío.
 * `solid` invierte a relleno de marca para marcar al titular.
 */
export function Avatar({
  url,
  name,
  solid,
  className,
}: {
  url?: string | null;
  name: string;
  solid?: boolean;
  className?: string;
}) {
  const dim = cn("h-9 w-9 shrink-0 rounded-full", className);
  const initials =
    (name || "?")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?";
  // Las iniciales son el fallback: se ven mientras no hay foto Y si la carga
  // falla — nunca el icono de imagen rota. Con foto: esqueleto → fundido.
  const inicialesFallback = (
    <span
      className={cn(
        "grid h-full w-full place-items-center text-xs font-semibold",
      )}
      style={
        solid
          ? { background: "var(--brand)", color: "var(--brand-ink)" }
          : { background: "var(--brand-wash)", color: "var(--brand-text)" }
      }
    >
      {initials}
    </span>
  );

  return (
    <SmartImage
      alt={name}
      className={cn(dim, !url && "border", solid ? "border-transparent" : "")}
      fallback={inicialesFallback}
      rounded="rounded-full"
      src={url}
    />
  );
}
