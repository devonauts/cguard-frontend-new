import * as React from "react";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";

/* El calendario NO trae fondo propio: vive dentro de un popover o una tarjeta de
   cristal y tiene que dejar ver el desenfoque de debajo. El día elegido es el
   único relleno del acento; el rango se marca con el lavado. */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      captionLayout={captionLayout}
      className={cn(
        "group/calendar bg-transparent p-2 [--cell-size:1.75rem]",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className,
      )}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-2 md:flex-row",
          defaultClassNames.months,
        ),
        month: cn("flex w-full flex-col gap-2", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
          defaultClassNames.nav,
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "h-[--cell-size] w-[--cell-size] select-none p-0 aria-disabled:opacity-50",
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "h-[--cell-size] w-[--cell-size] select-none p-0 aria-disabled:opacity-50",
          defaultClassNames.button_next,
        ),
        month_caption: cn(
          "mb-1 flex h-[--cell-size] w-full items-center justify-center px-[--cell-size]",
          defaultClassNames.month_caption,
        ),
        dropdowns: cn(
          "flex h-[--cell-size] w-full items-center justify-center gap-1 text-sm font-semibold",
          defaultClassNames.dropdowns,
        ),
        dropdown_root: cn(
          "cg-input relative px-1",
          defaultClassNames.dropdown_root,
        ),
        dropdown: cn(
          "absolute inset-0 bg-transparent opacity-0",
          defaultClassNames.dropdown,
        ),
        caption_label: cn(
          "select-none font-semibold text-[color:var(--ink)]",
          captionLayout === "label"
            ? "text-sm"
            : "flex h-8 items-center gap-1 rounded-[var(--r-sm)] pl-2 pr-1 text-sm [&>svg]:size-3.5 [&>svg]:text-[color:var(--ink-faint)]",
          defaultClassNames.caption_label,
        ),
        table: "w-full",
        weekdays: cn("grid grid-cols-7 gap-1", defaultClassNames.weekdays),
        weekday: cn(
          "select-none text-center text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-[color:var(--ink-faint)]",
          defaultClassNames.weekday,
        ),
        week: cn("mt-1 grid grid-cols-7 gap-1", defaultClassNames.week),
        week_number_header: cn(
          "w-[--cell-size] select-none",
          defaultClassNames.week_number_header,
        ),
        week_number: cn(
          "select-none text-[0.75rem] text-[color:var(--ink-faint)]",
          defaultClassNames.week_number,
        ),
        day: cn(
          "group/day relative select-none p-0 text-center",
          defaultClassNames.day,
        ),
        range_start: cn(
          "rounded-l-full bg-[var(--brand-wash)]",
          defaultClassNames.range_start,
        ),
        range_middle: cn(
          "bg-[var(--brand-wash)]",
          defaultClassNames.range_middle,
        ),
        range_end: cn(
          "rounded-r-full bg-[var(--brand-wash)]",
          defaultClassNames.range_end,
        ),
        today: cn(
          "font-semibold text-[color:var(--brand-text)]",
          defaultClassNames.today,
        ),
        outside: cn(
          "text-[color:var(--ink-faint)] aria-selected:text-[color:var(--ink-faint)]",
          defaultClassNames.outside,
        ),
        disabled: cn(
          "text-[color:var(--ink-faint)] opacity-50",
          defaultClassNames.disabled,
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              ref={rootRef}
              className={cn(className)}
              data-slot="calendar"
              {...props}
            />
          );
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("size-4", className)} {...props} />
            );
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon
                className={cn("size-4", className)}
                {...props}
              />
            );
          }

          return (
            <ChevronDownIcon className={cn("size-4", className)} {...props} />
          );
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-[--cell-size] items-center justify-center text-center">
                {children}
              </div>
            </td>
          );
        },
        ...components,
      }}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      showOutsideDays={showOutsideDays}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames();

  const ref = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <Button
      ref={ref}
      className={cn(
        "flex min-h-[--cell-size] min-w-[--cell-size] items-center justify-center rounded-full px-2 py-1 font-normal leading-none",
        "data-[selected-single=true]:bg-[var(--brand)] data-[selected-single=true]:text-[color:var(--brand-ink)] data-[selected-single=true]:shadow-[0_0_18px_-6px_var(--brand-glow)]",
        "data-[range-start=true]:bg-[var(--brand)] data-[range-start=true]:text-[color:var(--brand-ink)]",
        "data-[range-end=true]:bg-[var(--brand)] data-[range-end=true]:text-[color:var(--brand-ink)]",
        "data-[range-middle=true]:bg-transparent data-[range-middle=true]:text-[color:var(--ink)]",
        "group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:shadow-[0_0_0_3px_var(--brand-glow)]",
        defaultClassNames.day,
        className,
      )}
      data-day={day.date.toLocaleDateString()}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      data-range-start={modifiers.range_start}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      size="icon"
      variant="ghost"
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
