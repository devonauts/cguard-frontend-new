/**
 * ════════════════════════════════════════════════════════════════════════════
 * C-GUARD PRO — BARRA DE HERRAMIENTAS DE LISTA
 * Buscador + filtros + conmutador de vista + acciones. Una sola superficie de
 * cristal por pantalla (el buscador y los botones que van dentro son planos),
 * así que el desenfoque se paga UNA vez y no por control.
 *
 * Existe porque una docena de páginas repetían el mismo bloque a mano, cada
 * una con sus propios márgenes y su propio gris. Aquí el color sale de las
 * variables y el conmutador es el `Segmented` del kit.
 * ════════════════════════════════════════════════════════════════════════════
 */
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";

import { Segmented, Toolbar } from "@/components/kit";
import { cn } from "@/lib/utils";
import i18n from "@/i18n";

/**
 * Fila de herramientas sobre una lista o tabla.
 * `search` va a la izquierda y crece; `children` (filtros, vistas) a la derecha.
 */
export function TableToolbar({
  leading,
  search,
  children,
  className,
}: {
  /** Controles anclados a la izquierda — acciones en lote, rango de fechas. */
  leading?: React.ReactNode;
  search?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Toolbar className={cn("gap-2 p-2", className)}>
      {leading && (
        <div className="flex flex-wrap items-center gap-2">{leading}</div>
      )}
      {search && <div className="min-w-0 flex-1 basis-56">{search}</div>}
      {children && (
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {children}
        </div>
      )}
    </Toolbar>
  );
}

/** Buscador de la lista. Campo hundido (`.cg-input`), lupa y botón de borrado. */
export function TableSearch({
  value,
  onChange,
  placeholder = i18n.t("kit.search.placeholder"),
  className,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className={cn("relative w-full", className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
        style={{ color: "var(--ink-faint)" }}
      />
      <input
        autoFocus={autoFocus}
        className="cg-input h-9 w-full pl-9 pr-9 text-sm [&::-webkit-search-cancel-button]:appearance-none"
        placeholder={placeholder}
        role="searchbox"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          aria-label={t("ui.TableToolbar.limpiarBusqueda", "Limpiar búsqueda")}
          className="cg-focus absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-[var(--ink-faint)] transition-colors hover:bg-[var(--glass-sunken)] hover:text-[var(--ink)]"
          type="button"
          onClick={() => onChange("")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Conmutador tarjetas ⇄ lista. Es el `Segmented` del kit con iconos. */
export function ViewToggle({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: React.ReactNode; title?: string }>;
  className?: string;
}) {
  return (
    <Segmented
      className={className}
      options={options.map((o) => ({
        value: o.value,
        label: o.title ? (
          <span aria-label={o.title} title={o.title}>
            {o.label}
          </span>
        ) : (
          o.label
        ),
      }))}
      value={value}
      onChange={onChange}
    />
  );
}
