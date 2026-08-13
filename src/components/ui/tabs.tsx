import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

/* Riel hundido + píldora de acento, el mismo conmutador que `Segmented` del kit.
   El radio va en `style` porque `.glass-sunken` se declara sin capa en glass.css
   y su `border-radius` gana a cualquier utilidad de Tailwind. */
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, style, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    style={{ borderRadius: "9999px", ...style }}
    className={cn(
      "glass-sunken inline-flex h-9 items-center justify-center gap-1 p-1 text-[color:var(--ink-soft)]",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "cg-focus inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-all duration-200",
      "text-[color:var(--ink-soft)] hover:text-[color:var(--ink)]",
      "data-[state=active]:bg-[var(--brand)] data-[state=active]:text-[color:var(--brand-ink)] data-[state=active]:shadow-[0_0_18px_-6px_var(--brand-glow)]",
      "disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("cg-focus mt-3 outline-none", className)}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
