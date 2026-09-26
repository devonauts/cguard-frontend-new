import * as React from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { subDays, startOfDay, endOfDay, type Locale } from "date-fns";
import {
  de,
  enUS,
  es,
  fr,
  it as itLocale,
  nl,
  pl,
  ptBR,
} from "date-fns/locale";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import i18n from "@/i18n";
import { localeActual } from "@/lib/localeActual";

/** date-fns locale for the calendar, following the UI language (was fixed to `es`). */
const LOCALES_CALENDARIO: Record<string, Locale> = {
  es,
  en: enUS,
  pt: ptBR,
  fr,
  de,
  it: itLocale,
  nl,
  pl,
};
const localeCalendario = (): Locale =>
  LOCALES_CALENDARIO[String(i18n.language || "es").slice(0, 2).toLowerCase()] ??
  es;

const fechaCorta = (d: Date) =>
  d.toLocaleDateString(localeActual(), {
    day: "numeric",
    month: "2-digit",
    year: "numeric",
  });

interface DateRangePickerProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  className?: string;
}

export function DateRangePicker({
  dateRange,
  onDateRangeChange,
  className,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const presets = [
    {
      label: i18n.t("kit.dateRange.today"),
      getValue: () => ({
        from: startOfDay(new Date()),
        to: endOfDay(new Date()),
      }),
    },
    {
      label: i18n.t("kit.dateRange.yesterday"),
      getValue: () => ({
        from: startOfDay(subDays(new Date(), 1)),
        to: endOfDay(subDays(new Date(), 1)),
      }),
    },
    {
      label: i18n.t("kit.dateRange.last7d"),
      getValue: () => ({
        from: startOfDay(subDays(new Date(), 6)),
        to: endOfDay(new Date()),
      }),
    },
    {
      label: i18n.t("kit.dateRange.last2w"),
      getValue: () => ({
        from: startOfDay(subDays(new Date(), 13)),
        to: endOfDay(new Date()),
      }),
    },
    {
      label: i18n.t("kit.dateRange.last3w"),
      getValue: () => ({
        from: startOfDay(subDays(new Date(), 20)),
        to: endOfDay(new Date()),
      }),
    },
    {
      label: i18n.t("kit.dateRange.thisMonth"),
      getValue: () => {
        const now = new Date();

        return {
          from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
          to: endOfDay(new Date()),
        };
      },
    },
    {
      label: i18n.t("kit.dateRange.lastMonth"),
      getValue: () => {
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        return {
          from: startOfDay(lastMonth),
          to: endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)),
        };
      },
    },
    {
      label: i18n.t("kit.dateRange.last2m"),
      getValue: () => ({
        from: startOfDay(subDays(new Date(), 60)),
        to: endOfDay(new Date()),
      }),
    },
    {
      label: i18n.t("kit.dateRange.last3m"),
      getValue: () => ({
        from: startOfDay(subDays(new Date(), 90)),
        to: endOfDay(new Date()),
      }),
    },
  ];

  const handlePresetClick = (preset: any) => {
    const range = preset.getValue();

    onDateRangeChange(range);
    setIsOpen(false);
  };

  const formatDateRange = () => {
    if (!dateRange?.from) {
      return i18n.t("kit.dateRange.placeholder");
    }
    if (!dateRange.to) {
      return fechaCorta(dateRange.from);
    }

    return `${fechaCorta(dateRange.from)} – ${fechaCorta(dateRange.to)}`;
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            className={cn(
              "h-8 justify-start text-left text-xs font-medium",
              !dateRange && "text-[color:var(--ink-faint)]",
            )}
            size="sm"
            variant="outline"
          >
            <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
            {formatDateRange()}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto overflow-hidden p-0">
          {/* Atajos + calendario suman ~410 px: en un teléfono no caben uno al
              lado del otro, así que ahí se apilan y los atajos pasan a ser una
              fila que se desplaza. */}
          <div className="flex flex-col sm:flex-row">
            {/* Atajos — pozo hundido a la izquierda del calendario. */}
            <div className="w-full border-b border-[color:var(--hairline)] bg-[var(--glass-sunken)] p-1.5 sm:w-40 sm:border-b-0 sm:border-r">
              <div className="flex gap-1 overflow-x-auto sm:block sm:space-y-0.5 sm:overflow-visible">
                {presets.map((preset) => (
                  <button
                    key={preset.label}
                    className="cg-focus w-auto shrink-0 whitespace-nowrap rounded-[var(--r-sm)] px-2.5 py-1.5 text-left text-xs font-medium text-[color:var(--ink-soft)] transition-colors duration-200 hover:bg-[var(--brand-wash)] hover:text-[color:var(--brand-text)] motion-reduce:transition-none sm:w-full"
                    onClick={() => handlePresetClick(preset)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Calendar */}
            <div className="p-2">
              <Calendar
                initialFocus
                className="[--cell-size:1.75rem]"
                defaultMonth={dateRange?.from}
                locale={localeCalendario()}
                mode="range"
                numberOfMonths={1}
                selected={dateRange}
                onSelect={onDateRangeChange}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
