"use client";
import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import i18n from "@/i18n";

type Option = { value: string; label: string };
type Props = {
  value?: string;
  onChange: (v: string) => void;
  placeholder?: string;
  options: Option[];
  empty?: string;
  /** Sólo lectura: el disparador no abre. Necesario donde el formulario entero
   *  se bloquea por permisos y antes había que envolver el combo en un
   *  <fieldset disabled>, que rompe la maquetación. */
  disabled?: boolean;
  "aria-label"?: string;
};

export function Combobox({
  value,
  onChange,
  placeholder = i18n.t("kit.select.placeholder"),
  options,
  empty = i18n.t("kit.select.empty"),
  disabled = false,
  ...aria
}: Props) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value)?.label ?? "";

  // Close popover when value becomes empty/undefined to support external resets
  React.useEffect(() => {
    if (value === undefined || value === null || value === "") {
      setOpen(false);
    }
  }, [value]);

  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
          role="combobox"
          variant="outline"
          {...aria}
        >
          {selected || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popper-anchor-width)] min-w-[var(--radix-popper-anchor-width)] p-0">
        <Command>
          <CommandInput placeholder={i18n.t("categories.searchPlaceholder", "Buscar...")} />
          <CommandList className="max-h-60 overflow-y-auto">
            <CommandEmpty>{empty}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      o.value === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
