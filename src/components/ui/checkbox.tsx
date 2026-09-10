import * as React from "react";
import { Check } from "lucide-react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";

import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer cg-focus grid h-4 w-4 shrink-0 place-content-center rounded-[6px] border transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
      "border-[color:var(--hairline)] bg-[var(--glass-sunken)]",
      "data-[state=checked]:border-transparent data-[state=checked]:bg-[var(--brand)] data-[state=checked]:text-[color:var(--brand-ink)] data-[state=checked]:shadow-[0_0_14px_-4px_var(--brand-glow)]",
      "data-[state=indeterminate]:border-transparent data-[state=indeterminate]:bg-[var(--brand)] data-[state=indeterminate]:text-[color:var(--brand-ink)]",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("grid place-content-center text-current")}
    >
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));

Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
