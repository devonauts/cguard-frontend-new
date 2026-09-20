import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/* Píldora, no rectángulo: misma familia de formas que el botón. Los semánticos
   (`destructive`) reutilizan `.cg-btn-bad` de glass.css para que el rojo salga
   de `--bad` y no de una clase de color escrita a mano. */
const badgeVariants = cva(
  "cg-focus inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap transition-colors motion-reduce:transition-none [&>svg]:size-3 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        /* `[background-image:…]` lleva la lámina del acabado metálico: con el
           acabado plano la variable vale `none` y no pinta nada. */
        default:
          "border-transparent bg-[var(--brand)] [background-image:var(--brand-sheen)] text-[color:var(--brand-ink)] shadow-[0_0_16px_-8px_var(--brand-glow)]",
        secondary:
          "border-[color:var(--hairline)] bg-[var(--glass-sunken)] text-[color:var(--ink)]",
        destructive: "cg-btn-bad border-transparent",
        outline:
          "border-[color:var(--hairline)] bg-transparent text-[color:var(--ink)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
