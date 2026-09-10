import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronsUpDown, Check } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { COUNTRIES, Country } from "@/lib/data/countries";
import { getTenantCountry } from "@/utils/tenantLocation";
import { cn } from "@/lib/utils";

/**
 * País con el que arranca el campo cuando aún no hay número.
 *
 * Era `COUNTRIES[0]` — Estados Unidos — para todo el mundo, ignorando el país
 * de la empresa que ya se guarda justo para esto. Quien daba de alta un
 * teléfono en Quito o en Madrid tenía que cambiar el prefijo a mano cada vez.
 * Orden: lo que pida quien usa el componente, el país de la empresa, la región
 * del idioma del navegador y, sólo entonces, el primero de la lista.
 */
function resolverPaisInicial(preferido?: string): Country {
  const candidatos = [preferido, getTenantCountry()];

  try {
    candidatos.push(
      (navigator?.language || "").match(/[-_]([A-Za-z]{2})\b/)?.[1],
    );
  } catch {
    /* navegador sin `navigator.language` */
  }
  for (const c of candidatos) {
    const code = (c || "").trim().toUpperCase();

    if (!code) continue;
    const encontrado = COUNTRIES.find((p) => p.code === code);

    if (encontrado) return encontrado;
  }

  return COUNTRIES[0];
}

type PhoneInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onCountryChange?: (country: Country) => void;
  /**
   * Optional override for the maximum number of local digits (excluding country code).
   * If provided, takes precedence over the country default maxLength.
   */
  maxLocalDigits?: number;
  /**
   * Limit the number of countries initially shown in the dropdown.
   * If omitted, all countries are shown. When set, a "Show all" toggle
   * will be rendered to expand the full list.
   */
  maxCountries?: number;
  /** Código ISO-2 con el que arrancar (p. ej. "ES"). Sin él se usa el país de
   *  la empresa o la región del navegador. */
  defaultCountry?: string;
};

export function PhoneInput({
  value,
  onChange,
  placeholder,
  onCountryChange,
  maxLocalDigits,
  maxCountries,
  defaultCountry,
}: PhoneInputProps) {
  const { t } = useTranslation();
  // notify parent of selected country via onCountryChange when provided
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState<Country>(() =>
    resolverPaisInicial(defaultCountry),
  );
  const [showAllCountries, setShowAllCountries] = useState(false);

  // notify initial country to parent once
  useEffect(() => {
    if (onCountryChange) onCountryChange(country);
  }, []);

  const fullValue = useMemo(() => value ?? "", [value]);

  // Detect country from full value when it starts with a dial code
  useEffect(() => {
    if (!fullValue || !fullValue.startsWith("+")) return;

    const normalized = fullValue.replace(/^\+/, "");
    const local = normalized.split(" ")[0];

    const sorted = COUNTRIES.slice().sort(
      (a, b) => b.dialCode.length - a.dialCode.length,
    );
    const match = sorted.find((c) => local.startsWith(c.dialCode));

    if (match && match.code !== country.code) {
      setCountry(match);
      if (onCountryChange) onCountryChange(match);
    }
  }, [fullValue]);

  // Local part shown in the input: strip the leading +dialCode prefix
  const localValue = useMemo(() => {
    const prefix = `+${country.dialCode}`;

    if (fullValue.startsWith(prefix)) {
      return fullValue.slice(prefix.length).replace(/^\s+/, "");
    }

    // Strip any other leading +digits prefix
    return fullValue.replace(/^\+\d+\s*/, "");
  }, [fullValue, country]);

  const maxLocalLength = useMemo(() => {
    return maxLocalDigits ?? country.maxLength ?? 15;
  }, [country, maxLocalDigits]);

  const handleCountrySelect = (c: Country) => {
    setCountry(c);
    if (onCountryChange) onCountryChange(c);
    // Keep the local digits, just swap the country prefix
    onChange(`+${c.dialCode}${localValue ? localValue : ""}`);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const local = e.target.value;

    // Only allow digits and spaces in the local part
    if (!/^[\d\s]*$/.test(local)) return;

    // Limit local digit count
    if (local.replace(/\s/g, "").length > maxLocalLength) return;

    onChange(`+${country.dialCode}${local}`);
  };

  return (
    <div className="w-full">
      <div className="flex w-full">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              className="flex h-10 w-20 md:w-28 items-center gap-2 rounded-r-none border-r-0 px-2"
              type="button"
              variant="outline"
            >
              <span className="text-lg leading-none">{country.flag}</span>
              <span className="text-sm text-muted-foreground">
                +{country.dialCode}
              </span>
              <ChevronsUpDown className="ml-auto h-3 w-3 opacity-50" />
            </Button>
          </PopoverTrigger>

          <PopoverContent
            align="start"
            className="pt-3 p-0 w-screen left-0 right-0 max-w-[calc(100vw-32px)] md:w-[300px] md:left-auto md:right-auto md:max-w-none md:pt-0 max-h-[36vh] overflow-hidden"
            side="bottom"
            sideOffset={40}
          >
            <Command>
              <CommandInput
                className="sticky top-4 md:top-0 z-10 bg-card px-2 py-1 text-sm"
                placeholder="Search..."
              />
              <CommandList
                className="text-sm max-h-[36vh] overflow-auto overscroll-contain touch-auto"
                onWheel={(e: any) => {
                  const el = e.currentTarget as HTMLElement;
                  const delta = e.deltaY;

                  const atTop = el.scrollTop === 0;
                  const atBottom =
                    Math.ceil(el.scrollTop + el.clientHeight) >=
                    el.scrollHeight;

                  // If trying to scroll beyond the list, let parent handle it.
                  if ((delta < 0 && atTop) || (delta > 0 && atBottom)) {
                    return;
                  }

                  // Within list: manually adjust scroll. Avoid calling preventDefault
                  // to prevent passive event listener warnings in some browsers.
                  el.scrollTop += delta;
                }}
              >
                <CommandEmpty>
                  {t(
                    "ui.PhoneInput.noSeEncontraronPaises",
                    "No se encontraron países.",
                  )}
                </CommandEmpty>
                <CommandGroup>
                  {showAllCountries || typeof maxCountries !== "number"
                    ? COUNTRIES.map((c) => (
                        <CommandItem
                          key={c.code}
                          className="flex items-center gap-2 py-1.5"
                          value={`${c.name} +${c.dialCode}`}
                          onSelect={() => {
                            handleCountrySelect(c);
                            setOpen(false);
                          }}
                        >
                          <span className="text-lg">{c.flag}</span>
                          <span className="flex-1 text-sm">{c.name}</span>
                          <span className="text-xs text-muted-foreground">
                            +{c.dialCode}
                          </span>
                          <Check
                            className={cn(
                              "ml-1 h-3 w-3",
                              c.code === country.code
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                        </CommandItem>
                      ))
                    : COUNTRIES.slice(0, maxCountries).map((c) => (
                        <CommandItem
                          key={c.code}
                          className="flex items-center gap-2 py-1.5"
                          value={`${c.name} +${c.dialCode}`}
                          onSelect={() => {
                            handleCountrySelect(c);
                            setOpen(false);
                          }}
                        >
                          <span className="text-lg">{c.flag}</span>
                          <span className="flex-1 text-sm">{c.name}</span>
                          <span className="text-xs text-muted-foreground">
                            +{c.dialCode}
                          </span>
                          <Check
                            className={cn(
                              "ml-1 h-3 w-3",
                              c.code === country.code
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                        </CommandItem>
                      ))}
                </CommandGroup>
                {typeof maxCountries === "number" && (
                  <CommandGroup>
                    <CommandItem
                      className="justify-center text-sm text-muted-foreground py-1.5"
                      value={showAllCountries ? "show-less" : "show-all"}
                      onSelect={() => setShowAllCountries((s) => !s)}
                    >
                      {showAllCountries ? "Mostrar menos" : "Mostrar todos"}
                    </CommandItem>
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Input
          className="flex-1 min-w-0 rounded-l-none"
          maxLength={maxLocalLength + 4}
          placeholder={placeholder ?? "999 123 4567"}
          value={localValue}
          onChange={handleInputChange}
        />
      </div>
    </div>
  );
}
