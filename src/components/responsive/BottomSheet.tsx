/**
 * Hoja inferior. Es una superficie ÚNICA que flota por encima de todo, así que
 * aquí sí toca el cristal desenfocado (`.glass-raised`): el coste se paga una
 * vez, no por elemento de lista.
 */
import React from 'react';
import { cn } from '@/lib/utils';

type BottomSheetProps = {
    children: React.ReactNode;
    className?: string;
    onClose?: () => void;
};

export default function BottomSheet({ children, className = '', onClose }: BottomSheetProps) {
    // El hueco va como relleno del contenedor, no como margen de la hoja:
    // `w-full` + `m-2` medía el 100 % MÁS los márgenes y sacaba 16 px por el
    // lado en un teléfono.
    return (
        <div className={cn('fixed inset-0 z-50 flex items-end justify-center p-2 sm:items-center sm:p-4', className)}>
            <div
                className="fixed inset-0"
                style={{ background: 'oklch(0 0 0 / 0.45)' }}
                onClick={onClose}
            />
            <div className="glass-raised z-10 max-h-[90dvh] w-full overflow-y-auto p-4 sm:max-w-md sm:p-6">
                {/* El tirador: lo que dice «esto se arrastra» sin escribirlo. */}
                <div
                    aria-hidden
                    className="mx-auto mb-3 h-1 w-10 rounded-full sm:hidden"
                    style={{ background: 'var(--hairline)' }}
                />
                {children}
            </div>
        </div>
    );
}
