/**
 * ════════════════════════════════════════════════════════════════════════════
 * C-GUARD PRO — LISTA EN TARJETAS (MÓVIL)
 * La cara móvil de `DataTable`: cada elemento es una fila de la tabla plegada
 * en tarjeta, con la misma tinta, el mismo carril de selección y los mismos
 * estados de vacío y carga.
 *
 * Las tarjetas usan `.glass-flat` — cristal SIN desenfoque. `backdrop-filter`
 * se rasteriza en cada fotograma; multiplicado por los elementos de una lista,
 * tumba el desplazamiento justo donde más se nota, que es en el teléfono.
 * ════════════════════════════════════════════════════════════════════════════
 */
import React from 'react';
import { EmptyState, SkeletonCards } from '@/components/kit';
import { cn } from '@/lib/utils';
import i18n from "@/i18n";

type MobileCardListProps<T> = {
    items: T[];
    renderCard: (item: T) => React.ReactNode;
    loading?: boolean;
    emptyMessage?: string;
    /** Estado vacío completo — gana sobre `emptyMessage`. */
    emptyState?: React.ReactNode;
    /** Icono del estado vacío por defecto. */
    emptyIcon?: React.ReactNode;
    /** Marca la tarjeta activa con el carril del acento. */
    selectedIds?: string[];
    onItemClick?: (item: T) => void;
    className?: string;
    /** Tarjetas fantasma mientras carga. */
    skeletonCount?: number;
};

export default function MobileCardList<T>({
    items,
    renderCard,
    loading,
    emptyMessage,
    emptyState,
    emptyIcon,
    selectedIds,
    onItemClick,
    className,
    skeletonCount = 4,
}: MobileCardListProps<T>) {
    const selectedSet = React.useMemo(() => new Set(selectedIds ?? []), [selectedIds]);

    if (loading) return <SkeletonCards count={skeletonCount} className={cn('sm:grid-cols-1', className)} />;

    if (!items || items.length === 0) {
        return (
            <>
                {emptyState ?? (
                    <EmptyState
                        icon={emptyIcon}
                        title={emptyMessage || i18n.t("kit.list.empty")}
                        description={emptyMessage ? undefined : i18n.t("kit.list.emptyHint")}
                        className={className}
                    />
                )}
            </>
        );
    }

    return (
        <div className={cn('cg-stagger space-y-3', className)}>
            {items.map((it: any) => {
                const id = it?.id ?? it?._id;
                const selected = id != null && selectedSet.has(String(id));
                return (
                    <div
                        key={id || JSON.stringify(it)}
                        onClick={onItemClick ? () => onItemClick(it) : undefined}
                        onKeyDown={onItemClick ? (e) => {
                            if (e.target !== e.currentTarget) return;
                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onItemClick(it); }
                        } : undefined}
                        role={onItemClick ? 'button' : undefined}
                        tabIndex={onItemClick ? 0 : undefined}
                        className={cn(
                            'glass-flat cg-focus flex flex-col gap-2 p-4 transition-colors duration-150',
                            selected && 'brand-rail',
                            onItemClick && 'cursor-pointer',
                            !selected && onItemClick && 'hover:border-[var(--brand-line)]'
                        )}
                        style={selected ? { background: 'var(--brand-wash)', borderColor: 'var(--brand-line)' } : undefined}
                    >
                        {renderCard(it)}
                    </div>
                );
            })}
        </div>
    );
}
