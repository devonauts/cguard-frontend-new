/**
 * ════════════════════════════════════════════════════════════════════════════
 * C-GUARD PRO — TABLA DE DATOS
 * La superficie que más se repite en el CRM. Todo el color sale de las
 * variables de `tokens.css`; nada está escrito a mano, así que claro y oscuro
 * salen del mismo código y el acento configurable se respeta.
 *
 * ── POR QUÉ EL CONTENEDOR NO LLEVA DESENFOQUE POR DEFECTO ──────────────────
 * `backdrop-filter` obliga al navegador a rasterizar lo que hay detrás en cada
 * fotograma. Una tabla vive casi siempre DENTRO de una `Section` (que ya es
 * `.glass`): un segundo desenfoque encima no se ve pero sí se paga, y en una
 * tabla larga el desplazamiento se cae. Por eso el contenedor es `.glass-flat`
 * — mismo aspecto, cero desenfoque — y `surface="glass"` queda para la tabla
 * que va suelta sobre el lienzo.
 * NUNCA se pone `backdrop-filter` en la fila, la celda o el chip: eso se
 * multiplica por el número de filas.
 *
 * ── CONTRATO ──────────────────────────────────────────────────────────────
 * Las props existentes NO cambian de significado (11 páginas dependen de
 * ellas). Lo nuevo es opcional: `surface`, `dense`, `stickyHeader`,
 * `maxHeight`, `toolbar`, `footer`, `skeletonRows`, y en `Column` los campos
 * `align` / `numeric`.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/kit";
import { cn } from "@/lib/utils";
import { RowActionsMenu, type RowAction } from "./RowActionsMenu";

export type Column<T = any> = {
    key: keyof T | string;
    header: string;
    className?: string;
    render?: (value: any, row: T) => React.ReactNode;
    sortable?: boolean;
    /** Alineación de la columna. Si se omite, se deduce del contenido. */
    align?: "left" | "center" | "right";
    /** Cifras: alineadas a la derecha y con `tabular-nums` para que las
     *  unidades queden una debajo de otra. Se deduce sola cuando la columna
     *  trae números sin `render` propio. */
    numeric?: boolean;
};

type DataTableProps<T> = {
    columns: Column<T>[];
    data: T[];
    loading?: boolean;
    selectedIds?: string[];
    onSelectOne?: (id: string, checked: boolean) => void;
    onSelectAll?: (checked: boolean) => void;
    rowActions?: (row: T) => RowAction[];
    emptyState?: React.ReactNode;
    // optional sorting
    sortKey?: string | null;
    sortDir?: "asc" | "desc" | null;
    onSortChange?: (key: string, dir: "asc" | "desc" | null) => void;
    onRowClick?: (row: T) => void;
    // When true, don't render the outer container (border/background).
    containerless?: boolean;
    /** Superficie del contenedor. `flat` (por defecto) = cristal sin desenfoque. */
    surface?: "glass" | "flat" | "none";
    /** Filas más compactas — para tablas de muchas columnas. */
    dense?: boolean;
    /** Cabecera fija al desplazar. Se activa sola si hay `maxHeight`. */
    stickyHeader?: boolean;
    /** Altura máxima del área desplazable (p. ej. 480 o "60vh"). */
    maxHeight?: number | string;
    /** Barra de herramientas pegada al borde superior de la tabla. */
    toolbar?: React.ReactNode;
    /** Pie de la tabla — paginación, totales. */
    footer?: React.ReactNode;
    /** Filas fantasma mientras carga. */
    skeletonRows?: number;
};

/** Ancho variado para que el esqueleto no parezca una rejilla. */
const SKELETON_WIDTHS = ["70%", "45%", "85%", "55%", "62%", "38%"];

export function DataTable<T extends { id: string }>({
    columns,
    data,
    loading,
    selectedIds,
    onSelectOne,
    onSelectAll,
    rowActions,
    emptyState,
    sortKey,
    sortDir,
    onSortChange,
    onRowClick,
    containerless,
    surface,
    dense,
    stickyHeader,
    maxHeight,
    toolbar,
    footer,
    skeletonRows = 6,
}: DataTableProps<T>) {
    const allSelected = Array.isArray(selectedIds) && data && data.length > 0 && selectedIds.length === data.length;

    const showSelection = Array.isArray(selectedIds) && typeof onSelectOne === 'function' && typeof onSelectAll === 'function';

    // O(1) membership instead of O(rows x selected) Array.includes per row.
    const selectedSet = React.useMemo(
        () => new Set(selectedIds ?? []),
        [selectedIds]
    );

    // La alineación se decide POR COLUMNA, no por celda: si se mirara valor a
    // valor, una columna con un hueco saltaría de lado a mitad de la tabla.
    const resolved = React.useMemo(() => {
        const muestra = data.slice(0, 20);
        return columns.map((col) => {
            const numeric = col.numeric ?? (!col.render && muestra.some((r) => typeof (r as any)?.[col.key] === 'number'));
            const align = col.align ?? (numeric ? 'right' : 'left');
            return { col, numeric, align };
        });
    }, [columns, data]);

    const cellPad = dense ? "px-3 py-2" : "px-4 py-3";
    const sticky = stickyHeader ?? maxHeight != null;
    // Una cabecera pegajosa tiene filas pasando por debajo: necesita opacidad.
    // La que no se despega puede ser translúcida y leerse como banda hundida.
    const headBg = sticky ? "var(--glass-solid)" : "var(--glass-sunken)";
    const colCount = columns.length + (rowActions ? 1 : 0) + (showSelection ? 1 : 0);

    const alignClass = (a: 'left' | 'center' | 'right') =>
        a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

    const table = (
        <table className="min-w-full border-collapse text-left text-sm">
            <thead>
                <tr>
                    {showSelection && (
                        <th
                            scope="col"
                            className={cn(cellPad, "w-10", sticky && "sticky top-0 z-10")}
                            style={{ background: headBg, borderBottom: "1px solid var(--hairline)" }}
                        >
                            <Checkbox
                                aria-label="Seleccionar todo"
                                checked={allSelected}
                                onCheckedChange={(checked) => onSelectAll && onSelectAll(!!checked)}
                            />
                        </th>
                    )}

                    {resolved.map(({ col, align }) => {
                        const key = String(col.key);
                        const isSorted = sortKey === key && !!sortDir;
                        const nextSort = () => {
                            if (!onSortChange || !col.sortable) return;
                            let next: "asc" | "desc" | null = "asc";
                            if (!isSorted) next = "asc";
                            else if (sortDir === "asc") next = "desc";
                            else next = null;
                            onSortChange(key, next);
                        };

                        return (
                            <th
                                key={key}
                                scope="col"
                                aria-sort={isSorted ? (sortDir === "asc" ? "ascending" : "descending") : col.sortable ? "none" : undefined}
                                className={cn(
                                    "cg-eyebrow whitespace-nowrap",
                                    cellPad,
                                    alignClass(align),
                                    sticky && "sticky top-0 z-10",
                                    col.className ?? ""
                                )}
                                style={{ background: headBg, borderBottom: "1px solid var(--hairline)" }}
                            >
                                {col.sortable ? (
                                    <button
                                        type="button"
                                        onClick={nextSort}
                                        className={cn(
                                            "cg-focus -mx-1 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors",
                                            align === 'right' && "flex-row-reverse"
                                        )}
                                        style={isSorted ? { color: "var(--brand-text)" } : undefined}
                                    >
                                        <span>{col.header}</span>
                                        <span className="inline-flex" style={{ opacity: isSorted ? 1 : 0.4 }}>
                                            {isSorted
                                                ? (sortDir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)
                                                : <ChevronsUpDown className="h-3.5 w-3.5" />}
                                        </span>
                                    </button>
                                ) : (
                                    col.header
                                )}
                            </th>
                        );
                    })}

                    {rowActions && (
                        <th
                            scope="col"
                            className={cn("w-12", sticky && "sticky top-0 z-10")}
                            style={{ background: headBg, borderBottom: "1px solid var(--hairline)" }}
                        >
                            <span className="sr-only">Acciones</span>
                        </th>
                    )}
                </tr>
            </thead>

            <tbody>
                {loading ? (
                    // Barras fantasma con la MISMA rejilla que las filas reales: el
                    // contenido no salta al llegar los datos.
                    Array.from({ length: skeletonRows }).map((_, i) => (
                        <tr key={`sk-${i}`} className="border-b border-[var(--hairline)] last:border-b-0">
                            {showSelection && (
                                <td className={cellPad}><div className="cg-skeleton h-4 w-4 rounded" /></td>
                            )}
                            {columns.map((col, c) => (
                                <td key={String(col.key)} className={cn(cellPad, col.className ?? "")}>
                                    <div className="cg-skeleton h-3.5" style={{ width: SKELETON_WIDTHS[(i + c) % SKELETON_WIDTHS.length] }} />
                                </td>
                            ))}
                            {rowActions && (
                                <td className={cellPad}><div className="cg-skeleton ml-auto h-4 w-4 rounded" /></td>
                            )}
                        </tr>
                    ))
                ) : data.length === 0 ? (
                    <tr>
                        <td colSpan={colCount} className="p-4">
                            {emptyState ?? (
                                <EmptyState
                                    title="No se encontraron resultados"
                                    description="Intenta ajustar la búsqueda o los filtros."
                                />
                            )}
                        </td>
                    </tr>
                ) : (
                    data.map((row) => {
                        const selected = selectedSet.has(row.id);
                        // El carril del acento va en la PRIMERA celda, no en el <tr>:
                        // `position: relative` sobre una fila de tabla no es fiable en
                        // todos los navegadores, sobre una celda sí.
                        let first = true;
                        const railOnce = () => {
                            if (!selected || !first) return "";
                            first = false;
                            return "brand-rail";
                        };

                        return (
                            <tr
                                key={row.id}
                                onClick={onRowClick ? () => onRowClick(row) : undefined}
                                onKeyDown={onRowClick ? (e) => {
                                    if (e.target !== e.currentTarget) return;
                                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(row); }
                                } : undefined}
                                tabIndex={onRowClick ? 0 : undefined}
                                aria-selected={showSelection ? selected : undefined}
                                className={cn(
                                    "cg-focus border-b border-[var(--hairline)] transition-colors duration-150 last:border-b-0",
                                    !selected && "hover:bg-[var(--glass-sunken)]",
                                    onRowClick && "cursor-pointer"
                                )}
                                style={selected ? { background: "var(--brand-wash)" } : undefined}
                            >
                                {showSelection && (
                                    <td className={cn(cellPad, railOnce())} onClick={(e) => e.stopPropagation()}>
                                        <Checkbox
                                            aria-label="Seleccionar fila"
                                            checked={selected}
                                            onCheckedChange={(checked) => onSelectOne && onSelectOne(row.id, !!checked)}
                                        />
                                    </td>
                                )}

                                {resolved.map(({ col, numeric, align }, i) => {
                                    const value = (row as any)[col.key];
                                    return (
                                        <td
                                            key={String(col.key)}
                                            className={cn(
                                                cellPad,
                                                alignClass(align),
                                                numeric && "tabular-nums",
                                                // La primera columna es el nombre de la fila: se lee
                                                // como ancla y el resto queda un paso por detrás.
                                                i === 0 ? "font-medium text-[var(--ink)]" : "text-[var(--ink-soft)]",
                                                railOnce(),
                                                col.className ?? ""
                                            )}
                                        >
                                            {col.render ? col.render(value, row) : value}
                                        </td>
                                    );
                                })}

                                {rowActions && (
                                    <td className={cn(cellPad, "text-right")} onClick={(e) => e.stopPropagation()}>
                                        <RowActionsMenu actions={rowActions(row)} />
                                    </td>
                                )}
                            </tr>
                        );
                    })
                )}
            </tbody>
        </table>
    );

    const scroller = (
        <div
            className="w-full overflow-x-auto"
            style={maxHeight != null ? { maxHeight, overflowY: "auto" } : undefined}
        >
            {table}
        </div>
    );

    const modo = surface ?? (containerless ? "none" : "flat");
    if (modo === "none") return scroller;

    return (
        <div
            className={cn(modo === "glass" ? "glass" : "glass-flat", "overflow-hidden")}
            style={{ borderRadius: "var(--r-xl)" }}
        >
            {toolbar && (
                <div
                    className="flex flex-wrap items-center gap-2 px-3 py-2"
                    style={{ borderBottom: "1px solid var(--hairline)" }}
                >
                    {toolbar}
                </div>
            )}
            {scroller}
            {footer && (
                <div
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs"
                    style={{ borderTop: "1px solid var(--hairline)", color: "var(--ink-soft)" }}
                >
                    {footer}
                </div>
            )}
        </div>
    );
}
