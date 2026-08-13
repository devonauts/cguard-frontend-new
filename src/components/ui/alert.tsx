import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/* No usa `.glass-flat`: esa clase va sin capa y fijaría fondo y borde para las
   dos variantes, con lo que el aviso destructivo no podría teñirse. El cristal
   se arma aquí con las mismas variables para que cada variante mande. */
const alertVariants = cva(
  "relative w-full rounded-[var(--r-lg)] border px-4 py-3.5 text-sm shadow-[var(--lift-2)] [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:size-4 [&>svg~*]:pl-7",
  {
    variants: {
      variant: {
        default:
          "border-[color:var(--hairline)] bg-[var(--glass)] text-[color:var(--ink)] [&>svg]:text-[color:var(--brand-text)]",
        destructive:
          "border-[color:color-mix(in_oklab,var(--bad)_38%,transparent)] bg-[color-mix(in_oklab,var(--bad)_12%,transparent)] text-[color:var(--bad-text)] [&>svg]:text-[color:var(--bad-text)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
))
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn(
      "mb-1 font-semibold leading-none tracking-[-0.01em]",
      className
    )}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm opacity-90 [&_p]:leading-relaxed", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
