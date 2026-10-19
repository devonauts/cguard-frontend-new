/**
 * Selector that searches on the server while the user types.
 *
 * A plain <Select> fed with a fixed first page («limit=50», «limit=100»…)
 * leaves everything after that page out of reach in a large company: the
 * 51st post or the 101st client simply cannot be picked. This asks the
 * server for each query instead, so any record is one search away.
 *
 * `search` receives the trimmed query ("" when the box opens) and returns the
 * options to show. Change `scope` (e.g. the selected client id) to discard the
 * current results and search again within the new scope.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown } from "lucide-react";

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
import { cn } from "@/lib/utils";

export type AsyncOption = { value: string; label: string };

type Props = {
  value?: string;
  /** Label for `value` when it is not among the loaded results. */
  valueLabel?: string;
  onChange: (value: string, option: AsyncOption | null) => void;
  search: (query: string) => Promise<AsyncOption[]>;
  /** Changing it drops the loaded results (e.g. a parent client changed). */
  scope?: string;
  placeholder?: string;
  /** Optional first entry that clears the value (e.g. «Todos»). */
  clearOption?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-required"?: boolean | "true" | "false";
};

export function AsyncCombobox({
  value,
  valueLabel,
  onChange,
  search,
  scope,
  placeholder,
  clearOption,
  disabled = false,
  className,
  ...aria
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<AsyncOption[]>([]);
  const [loading, setLoading] = useState(false);
  // Remember the picked label: the next search may not contain it.
  const [picked, setPicked] = useState<AsyncOption | null>(null);
  // Latest `search` without making it an effect dependency (callers usually
  // pass an inline arrow, which would refire the request on every render).
  const searchRef = useRef(search);

  useEffect(() => {
    searchRef.current = search;
  });

  useEffect(() => {
    setOptions([]);
  }, [scope]);

  // Search only while open, with a short pause so typing is not one request
  // per key.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const h = setTimeout(() => {
      setLoading(true);
      searchRef
        .current(query.trim())
        .then((rows) => alive && setOptions(rows || []))
        .catch(() => alive && setOptions([]))
        .finally(() => alive && setLoading(false));
    }, 250);

    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [open, query, scope]);

  const label = !value
    ? ""
    : picked?.value === value
      ? picked.label
      : options.find((o) => o.value === value)?.label || valueLabel || "";

  return (
    <Popover
      modal
      open={open && !disabled}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className={cn("w-full min-w-0 justify-between font-normal", className)}
          disabled={disabled}
          role="combobox"
          type="button"
          variant="outline"
          {...aria}
        >
          <span
            className="truncate"
            style={label ? undefined : { color: "var(--ink-faint)" }}
          >
            {label || placeholder || t("kit.select.placeholder")}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popper-anchor-width)] min-w-[min(320px,calc(100vw-2rem))] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t("kit.select.search")}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-60 overflow-y-auto">
            <CommandEmpty>
              {loading ? t("kit.select.searching") : t("kit.select.empty")}
            </CommandEmpty>
            <CommandGroup>
              {clearOption && !query.trim() && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    setPicked(null);
                    onChange("", null);
                    setOpen(false);
                  }}
                >
                  <Check
                    className="mr-2 size-4"
                    style={{ opacity: value ? 0 : 1 }}
                  />
                  {clearOption}
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.value}
                  onSelect={() => {
                    setPicked(o);
                    onChange(o.value, o);
                    setOpen(false);
                  }}
                >
                  <Check
                    className="mr-2 size-4"
                    style={{ opacity: value === o.value ? 1 : 0 }}
                  />
                  <span className="truncate">{o.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default AsyncCombobox;
