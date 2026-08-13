import * as React from "react"
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"
import { Circle } from "lucide-react"

import { cn } from "@/lib/utils"

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Root
      className={cn("grid gap-2.5", className)}
      {...props}
      ref={ref}
    />
  )
})
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        "cg-focus aspect-square h-4 w-4 rounded-full border transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
        "border-[color:var(--hairline)] bg-[var(--glass-sunken)]",
        "data-[state=checked]:border-[color:var(--brand)] data-[state=checked]:bg-[var(--brand-wash)] data-[state=checked]:shadow-[0_0_14px_-4px_var(--brand-glow)]",
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex h-full w-full items-center justify-center">
        <Circle className="h-2 w-2 fill-[var(--brand)] text-[color:var(--brand)]" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
})
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName

export { RadioGroup, RadioGroupItem }
