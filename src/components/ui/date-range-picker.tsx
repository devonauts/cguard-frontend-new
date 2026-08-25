import * as React from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
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
      return format(dateRange.from, "d/MM/yyyy", { locale: es });
    }
    return `${format(dateRange.from, "d/MM/yyyy", { locale: es })} – ${format(
      dateRange.to,
      "d/MM/yyyy",
      { locale: es }
    )}`;
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 justify-start text-left text-xs font-medium",
              !dateRange && "text-[color:var(--ink-faint)]"
            )}
          >
            <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
            {formatDateRange()}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="end">
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
                    onClick={() => handlePresetClick(preset)}
                    className="cg-focus w-auto shrink-0 whitespace-nowrap rounded-[var(--r-sm)] px-2.5 py-1.5 text-left text-xs font-medium text-[color:var(--ink-soft)] transition-colors duration-200 hover:bg-[var(--brand-wash)] hover:text-[color:var(--brand-text)] motion-reduce:transition-none sm:w-full"
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
                mode="range"
                defaultMonth={dateRange?.from}
                selected={dateRange}
                onSelect={onDateRangeChange}
                numberOfMonths={1}
                locale={es}
                className="[--cell-size:1.75rem]"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
