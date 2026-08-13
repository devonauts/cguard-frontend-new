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
    return (
        <div className={cn('fixed inset-0 z-50 flex items-end justify-center sm:items-center', className)}>
            <div
                className="fixed inset-0"
                style={{ background: 'oklch(0 0 0 / 0.45)' }}
                onClick={onClose}
            />
            <div className="glass-raised z-10 m-2 w-full p-4 sm:m-0 sm:max-w-md sm:p-6">
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
