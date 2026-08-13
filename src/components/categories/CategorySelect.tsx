import { useMemo, useState, useEffect, useRef } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { ChevronDown, Plus, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { categoryService } from "@/lib/api/categoryService";
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from 'react-i18next';

export type CategoryOption = { id: string; name: string };

type CategorySelectProps = {
    options?: CategoryOption[];
    value?: string | string[];
    onChange: (value?: string | string[]) => void;
    placeholder?: string;
    module: string;
    onCategoryCreated?: () => void;
    multiple?: boolean;
};

/**
 * Sector (category) multi-select. Renovated UI: selected sectors show as
 * removable chips; the dropdown searches AND lets you create a new sector inline
 * by typing its name ("Crear «…»") — no separate dialog. Single-select still
 * works (one chip, picking replaces).
 */
export function CategorySelect({
    options = [],
    value,
    onChange,
    placeholder,
    module,
    onCategoryCreated,
    multiple = false,
}: CategorySelectProps) {
    const { hasPermission } = usePermissions();
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [items, setItems] = useState<CategoryOption[]>(options);
    const [isLoading, setIsLoading] = useState(false);
    const hasLoadedRef = useRef(false);

    // Sync provided options into local state, keyed on count so a parent passing a
    // fresh `[]` each render doesn't thrash this effect.
    const optionsCount = options?.length ?? 0;
    useEffect(() => {
        if (optionsCount > 0) setItems(options);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [optionsCount]);

    useEffect(() => { hasLoadedRef.current = false; }, [module]);

    // When the parent supplies no options, fetch the list once for this module.
    useEffect(() => {
        if (optionsCount !== 0 || hasLoadedRef.current) return;
        hasLoadedRef.current = true;
        let cancelled = false;
        (async () => {
            try {
                setIsLoading(true);
                const res = await categoryService.list({ filter: { module }, limit: 1000 });
                if (cancelled) return;
                setItems(res.rows.map((c) => ({ id: c.id, name: c.name })));
            } catch {
                if (!cancelled) toast.error(t('categories.notcategories', 'No hay sectores disponibles'));
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [module, optionsCount]);

    const selectedIds = useMemo(
        () => (Array.isArray(value) ? value : value ? [value as string] : []),
        [value],
    );
    const selected = useMemo(() => items.filter((o) => selectedIds.includes(o.id)), [items, selectedIds]);

    const setIds = (ids: string[]) => onChange(multiple ? (ids.length ? ids : undefined) : ids[0]);

    const toggle = (id: string) => {
        if (multiple) {
            setIds(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
        } else {
            onChange(selectedIds.includes(id) ? undefined : id);
            setOpen(false);
        }
    };
    const remove = (id: string) => setIds(selectedIds.filter((x) => x !== id));

    const q = query.trim();
    const canCreate = !!q && !items.some((o) => o.name.toLowerCase() === q.toLowerCase()) && hasPermission('categoryCreate');

    const createFromQuery = async () => {
        if (!q || isCreating) return;
        setIsCreating(true);
        try {
            const created = await categoryService.create({ name: q, module });
            setItems((prev) => (prev.some((p) => p.id === created.id) ? prev : [...prev, { id: created.id, name: created.name }]));
            if (multiple) setIds(selectedIds.includes(created.id) ? selectedIds : [...selectedIds, created.id]);
            else { onChange(created.id); setOpen(false); }
            setQuery("");
            toast.success(t('categories.categoryCreated', 'Sector creado'));
            onCategoryCreated?.();
        } catch (error: any) {
            toast.error(error?.message || t('categories.categoryCreateFailed', 'Error al crear el sector'));
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    disabled={isLoading}
                    className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 py-1.5 text-left text-sm transition-colors hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                >
                    {selected.length === 0 ? (
                        <span className="py-0.5 text-muted-foreground">
                            {isLoading ? t('categories.loading', 'Cargando…') : (placeholder ?? t('clients.form.categoryLabel', 'Sector de seguridad'))}
                        </span>
                    ) : (
                        selected.map((s) => (
                            <span
                                key={s.id}
                                className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium"
                                style={{ background: 'var(--brand-wash)', borderColor: 'var(--brand-line)', color: 'var(--brand-text)' }}
                            >
                                {s.name}
                                <span
                                    role="button"
                                    tabIndex={-1}
                                    aria-label={`Quitar ${s.name}`}
                                    onClick={(e) => { e.stopPropagation(); remove(s.id); }}
                                    // El `#8a5e07` de antes era el oro viejo oscurecido a mano —
                                    // sólo funcionaba si el acento seguía siendo dorado.
                                    className="-mr-0.5 rounded p-0.5 hover:bg-[var(--brand-line)]"
                                >
                                    <X size={12} />
                                </span>
                            </span>
                        ))
                    )}
                    <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-60" />
                </button>
            </PopoverTrigger>

            <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
                <Command>
                    <CommandInput
                        value={query}
                        onValueChange={setQuery}
                        placeholder={hasPermission('categoryCreate') ? t('categories.searchOrCreate', 'Buscar o crear sector…') : t('categories.searchPlaceholder', 'Buscar…')}
                    />
                    <CommandList>
                        {canCreate && (
                            <CommandGroup>
                                <CommandItem value={`__create__${q}`} onSelect={createFromQuery} className="gap-2 font-medium text-primary">
                                    {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                    <span>{t('categories.createNamed', 'Crear')} «{q}»</span>
                                </CommandItem>
                            </CommandGroup>
                        )}
                        <CommandEmpty>{isLoading ? t('categories.loading', 'Cargando…') : t('categories.notfoundcategory', 'Sin resultados.')}</CommandEmpty>
                        <CommandGroup>
                            {items.map((opt) => {
                                const checked = selectedIds.includes(opt.id);
                                return (
                                    <CommandItem key={opt.id} value={opt.name} onSelect={() => toggle(opt.id)} className="gap-2">
                                        {/* Marcado: relleno de marca con tinta `--brand-ink`. Blanco
                                            sobre `--brand` daría ~2,2:1 — ver tokens.css. */}
                                        <span
                                            className="flex h-4 w-4 items-center justify-center rounded border"
                                            style={checked
                                                ? { borderColor: 'var(--brand)', background: 'var(--brand)', color: 'var(--brand-ink)' }
                                                : { borderColor: 'var(--hairline)' }}
                                        >
                                            {checked && <Check size={12} />}
                                        </span>
                                        <span>{opt.name}</span>
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
