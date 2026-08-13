import * as React from "react"
import * as TogglePrimitive from "@radix-ui/react-toggle"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/* Píldora encendida/apagada con el mismo lenguaje que el botón de marca:
   encendida es relleno del acento con halo, apagada es tinta suave. */
const toggleVariants = cva(
  "cg-focus inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-[13px] font-semibold text-[color:var(--ink-soft)] outline-none transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none hover:text-[color:var(--ink)] data-[state=on]:bg-[var(--brand)] data-[state=on]:text-[color:var(--brand-ink)] data-[state=on]:shadow-[0_0_18px_-6px_var(--brand-glow)] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent hover:bg-[var(--glass-sunken)]",
        outline:
          "border border-[color:var(--hairline)] bg-[var(--glass)] hover:border-[color:var(--brand-line)]",
      },
      size: {
        default: "h-9 min-w-9 px-3",
        sm: "h-8 min-w-8 px-2.5",
        lg: "h-10 min-w-10 px-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
