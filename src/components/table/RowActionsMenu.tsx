/**
 * Menú «…» de una fila. Se dibuja una vez por fila, así que NO lleva cristal
 * desenfocado: el disparador es plano y sólo el desplegable (que es único y
 * flota) usa la superficie elevada de Radix.
 * La acción destructiva se pinta con `--bad-text`, no con un rojo escrito a
 * mano: así sigue siendo legible en claro y en oscuro.
 */
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EllipsisVertical } from "lucide-react";
import i18n from "@/i18n";

export type RowAction = {
    label: string;
    icon?: React.ReactNode;
    destructive?: boolean;
    onClick: () => void;
};

type RowActionsMenuProps = {
    actions: RowAction[];
};

export function RowActionsMenu({ actions }: RowActionsMenuProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label=i18n.t("kit.table.rowActions")
                    className="cg-focus inline-grid h-8 w-8 place-items-center rounded-lg border border-transparent text-[var(--ink-faint)] transition-colors hover:border-[var(--hairline)] hover:bg-[var(--glass-sunken)] hover:text-[var(--ink)] data-[state=open]:border-[var(--brand-line)] data-[state=open]:bg-[var(--brand-wash)] data-[state=open]:text-[var(--brand-text)]"
                >
                    <EllipsisVertical className="h-4 w-4" />
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-52">
                {actions.map((act, index) => (
                    <DropdownMenuItem
                        key={index}
                        onClick={act.onClick}
                        className="flex items-center gap-2 [&_svg]:size-4"
                        style={act.destructive ? { color: "var(--bad-text)" } : undefined}
                    >
                        {act.icon}
                        <span>{act.label}</span>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
