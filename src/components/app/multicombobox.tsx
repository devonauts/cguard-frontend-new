"use client";
import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import i18n from "@/i18n";

type Option = { value: string; label: string };
type Props = {
  value?: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  options: Option[];
  empty?: string;
  className?: string;
  popoverClassName?: string;
  "aria-label"?: string;
};

export function MultiCombobox({ value = [], onChange, placeholder = i18n.t("kit.select.placeholder"), options, empty = i18n.t("kit.select.empty"), className, popoverClassName, "aria-label": ariaLabel }: Props) {
  const [open, setOpen] = React.useState(false);
  const selectedItems = options.filter((o) => value.includes(o.value));

  React.useEffect(() => {
    if (!value || value.length === 0) setOpen(false);
  }, [value]);

  const toggle = (val: string) => {
    if (!value) onChange([val]);
    else if (value.includes(val)) onChange(value.filter((v) => v !== val));
    else onChange([...value, val]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className={cn("w-full justify-between text-left pr-8", className)}
        >
          <div className="min-w-0 flex-1">
            <div className="flex gap-2 items-center overflow-x-auto pr-2">
              {selectedItems.length > 0 ? (
                selectedItems.map((item) => (
                  <span key={item.value} className="text-xs bg-muted px-2 py-0.5 rounded whitespace-nowrap flex-shrink-0">{item.label}</span>
                ))
              ) : (
                <span className="opacity-60">{placeholder}</span>
              )}
            </div>
          </div>
          <span className="ml-2 opacity-50"><ChevronsUpDown className="h-4 w-4" /></span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-[var(--radix-popper-anchor-width)] min-w-[var(--radix-popper-anchor-width)] p-0", popoverClassName)}>
        <Command>
          <CommandInput placeholder="Buscar..." />
          <CommandList className="max-h-60 overflow-y-auto">
            <CommandEmpty>{empty}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.value} onSelect={() => toggle(o.value)}>
                  <Check className={cn("mr-2 h-4 w-4", value.includes(o.value) ? "opacity-100" : "opacity-0")} />
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

export default MultiCombobox;
