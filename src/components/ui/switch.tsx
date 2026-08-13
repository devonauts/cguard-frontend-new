import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

/* Apagado: pozo de cristal con filo interior. Encendido: relleno del acento con
   halo. El pulgar cambia de tinta con el estado — `--ink-soft` sobre el pozo y
   `--brand-ink` sobre el relleno — que es lo que garantiza contraste en claro,
   en oscuro y con CUALQUIER tono de acento (ver cabecera de tokens.css). */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer cg-focus inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
      "bg-[var(--glass-sunken)] shadow-[inset_0_0_0_1px_var(--hairline)]",
      "data-[state=checked]:bg-[var(--brand)] data-[state=checked]:shadow-[0_0_16px_-4px_var(--brand-glow)]",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-4 w-4 rounded-full ring-0 transition-transform duration-200 motion-reduce:transition-none",
        "bg-[var(--ink-soft)] data-[state=checked]:bg-[var(--brand-ink)]",
        "data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
