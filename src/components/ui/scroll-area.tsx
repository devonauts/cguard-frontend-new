import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

import { cn } from "@/lib/utils";

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn("relative overflow-hidden", className)}
    {...props}
  >
    {/* ── `[&>div]:block!`: POR QUÉ NO SE DEJA COMO VIENE ────────────────────
        Radix maqueta al hijo del viewport con `display: table`, y una tabla se
        dimensiona por su CONTENIDO, no por el contenedor. Consecuencia: dentro
        de un ScrollArea, `truncate` y `line-clamp` no recortan nada —el bloque
        crece— y el texto largo se sale por el canto. Medido en la bandeja de
        notificaciones: las 50 filas median 862 px dentro de un panel de 446.

        Ese `display: table` sólo sirve para poder desplazar de lado contenido
        más ancho que el viewport, y aquí eso no existe: `ScrollArea` monta UNA
        barra y es vertical (`orientation = "vertical"`), y ninguna pantalla
        pide la horizontal. Sin barra que alcanzarlo, lo que se sale no se puede
        leer: no es desplazamiento, es texto perdido. */}
    <ScrollAreaPrimitive.Viewport className="cg-focus h-full w-full rounded-[inherit] [&>div]:block!">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));

ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    className={cn(
      "flex touch-none select-none p-[2px] transition-colors motion-reduce:transition-none",
      orientation === "vertical" &&
        "h-full w-2.5 border-l border-l-transparent",
      orientation === "horizontal" &&
        "h-2.5 flex-col border-t border-t-transparent",
      className,
    )}
    orientation={orientation}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-[var(--ink-faint)] opacity-40 transition-opacity duration-200 hover:opacity-70 motion-reduce:transition-none" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));

ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
