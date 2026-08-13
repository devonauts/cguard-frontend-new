import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Píldora + escala al pulsar. El radio grande es lo que separa el lenguaje
  // «cristal» del botón rectangular de panel de control clásico.
  "cg-focus inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-200 motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 active:scale-[0.97] motion-reduce:active:scale-100",
  {
    variants: {
      variant: {
        // Relleno de marca. La tinta es `--brand-ink`, calculada para contrastar
        // con CUALQUIER tono elegido — ver la cabecera de tokens.css.
        default: "cg-btn-brand",
        brand: "cg-btn-brand",
        destructive: "cg-btn-bad",
        // Cristal con filo: la acción secundaria del sistema.
        outline: "cg-btn-glass",
        secondary: "cg-btn-glass",
        ghost: "cg-btn-ghost",
        // Fantasma con tinta de peligro. Cuatro archivos escribían
        // `variant="ghost" style={{ color: 'var(--bad-text)' }}` a mano: la
        // acción destructiva de bajo peso (quitar una fila, revocar un acceso)
        // que no merece el relleno rojo de `destructive`.
        "danger-ghost": "cg-btn-ghost text-[color:var(--bad-text)] hover:text-[color:var(--bad-text)]",
        link: "underline-offset-4 hover:underline cg-btn-link",
      },
      size: {
        default: "h-9 px-4 has-[>svg]:px-3.5",
        sm: "h-8 gap-1.5 px-3.5 text-xs has-[>svg]:px-3",
        lg: "h-11 px-6 text-[15px] has-[>svg]:px-5",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)
const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }
>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
})
Button.displayName = "Button"

export { Button, buttonVariants }
