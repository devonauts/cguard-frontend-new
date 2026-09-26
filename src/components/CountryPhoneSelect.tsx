import * as React from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

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

export type CountryPhoneSelectValue = {
  code: string; // "EC"
  dialCode: string; // "+593"
  name: string; // "Ecuador"
  flag?: string; // "🇪🇨"
};

type FetchedCountry = {
  cca2?: string;
  flag?: string;
  name?: { common?: string };
  idd?: { root?: string | null; suffixes?: string[] | null };
};

type Props = {
  value?: CountryPhoneSelectValue;
  onChange?: (v: CountryPhoneSelectValue) => void;
  placeholder?: string;
  className?: string;
  apiUrl?: string;
};

function buildDialCode(
  root?: string | null,
  suffixes?: string[] | null,
): string {
  const r = (root || "").trim();

  if (!r) return "";

  // Si no hay sufijos o el array está vacío, devolver solo el root
  if (!suffixes || suffixes.length === 0) return r;

  // Si hay múltiples sufijos, tomar el primero (más común)
  // Por ejemplo: USA tiene root="+1" y suffixes=[""], Canada también
  const firstSuffix = suffixes[0] || "";

  return r + firstSuffix;
}

export default function CountryPhoneSelect({
  value,
  onChange,
  placeholder,
  className,
  apiUrl = "https://restcountries.com/v3.1/all?fields=name,cca2,idd,flag",
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [countries, setCountries] = React.useState<CountryPhoneSelectValue[]>(
    [],
  );

  React.useEffect(() => {
    let active = true;
    const ctrl = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(apiUrl, {
          signal: ctrl.signal,
          cache: "force-cache",
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: FetchedCountry[] = await res.json();

        const normalized = (data || [])
          .map((c) => {
            const name = c?.name?.common?.trim() || "";
            const code = (c?.cca2 || "").toUpperCase();
            const flag = c?.flag || "🏳️";
            const dialCode = buildDialCode(c?.idd?.root, c?.idd?.suffixes);

            if (!name || !code || !dialCode) return null;

            return { name, code, dialCode, flag } as CountryPhoneSelectValue;
          })
          .filter(Boolean) as CountryPhoneSelectValue[];

        // Orden alfabético por nombre
        normalized.sort((a, b) => a.name.localeCompare(b.name, "es"));

        if (active) setCountries(normalized);
      } catch (e: any) {
        if (active)
          setError(
            e?.message ||
              t(
                "ui.CountryPhoneSelect.noSePudoCargarPaises",
                "No se pudo cargar la lista de países",
              ),
          );
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
      ctrl.abort();
    };
  }, [apiUrl]);

  const current = React.useMemo(() => {
    if (!value) return undefined;

    return (
      countries.find((c) => c.code === value.code) || {
        name: value.name,
        code: value.code,
        dialCode: value.dialCode,
        flag: value.flag ?? "🏳️",
      }
    );
  }, [value, countries]);

  const handleSelect = (c: CountryPhoneSelectValue) => {
    onChange?.(c);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className={cn("w-48 justify-between", className)}
          disabled={loading || !!error}
          role="combobox"
          variant="outline"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("common.loading", "Cargando…")}
            </span>
          ) : current ? (
            <span className="truncate flex items-center gap-2">
              <span className="text-base">{current.flag}</span>
              <span className="text-sm font-medium">{current.dialCode}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">
              {placeholder ??
                t("ui.CountryPhoneSelect.seleccionarPais", "Seleccionar país…")}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="p-0 w-[300px]">
        {error ? (
          <div className="p-3 text-sm text-red-600">{error}</div>
        ) : (
          <Command>
            <CommandInput
              placeholder={t(
                "ui.CountryPhoneSelect.buscarPaisOCodigo",
                "Buscar país o código…",
              )}
            />
            <CommandList className="max-h-80">
              <CommandEmpty>
                {t("ui.CountryPhoneSelect.noSeEncontraronResultados")}
              </CommandEmpty>
              <CommandGroup>
                {countries.map((c) => (
                  <CommandItem
                    key={c.code}
                    className="flex items-center gap-2"
                    value={`${c.name} ${c.dialCode} ${c.code}`}
                    onSelect={() => handleSelect(c)}
                  >
                    <span className="text-lg">{c.flag}</span>
                    <span className="flex-1 text-sm">{c.name}</span>
                    <span className="text-xs text-muted-foreground mr-2 font-medium">
                      {c.dialCode}
                    </span>
                    <Check
                      className={cn(
                        "h-4 w-4",
                        value?.code === c.code ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}
