import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import i18n from "@/i18n";

const Sheet = SheetPrimitive.Root;

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "glass-scrim fixed inset-0 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none!",
      className,
    )}
    {...props}
    ref={ref}
  />
));

SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  /* `overflow-y-auto`: un panel lateral con un formulario largo no cabía en un
     teléfono y no había forma de bajar — Radix bloquea el desplazamiento del
     documento mientras la hoja está abierta. */
  "glass-raised z-50 gap-4 overflow-y-auto p-6 text-[color:var(--ink)] transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out motion-reduce:animate-none! motion-reduce:transition-none",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 max-h-[90dvh] data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 max-h-[90dvh] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

/* Sólo se redondean los cantos INTERIORES: un panel anclado al borde con las
   cuatro esquinas redondeadas se despega de la pantalla y parece un error. */
const radiusBySide: Record<"top" | "bottom" | "left" | "right", string> = {
  right: "var(--r-2xl) 0 0 var(--r-2xl)",
  left: "0 var(--r-2xl) var(--r-2xl) 0",
  top: "0 0 var(--r-2xl) var(--r-2xl)",
  bottom: "var(--r-2xl) var(--r-2xl) 0 0",
};

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, children, style, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content
      className={cn(sheetVariants({ side }), className)}
      ref={ref}
      /* `position` y `border-radius` van en línea: `.glass-raised` se declara
         sin capa en glass.css y gana a las utilidades `fixed`/`rounded-*`. */
      style={{
        position: "fixed",
        borderRadius: radiusBySide[side ?? "right"],
        ...style,
      }}
      {...props}
    >
      <SheetPrimitive.Close className="cg-focus absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--ink-faint)] transition-colors hover:bg-[var(--glass-sunken)] hover:text-[color:var(--ink)] disabled:pointer-events-none motion-reduce:transition-none">
        <X className="h-4 w-4" />
        <span className="sr-only">{i18n.t("actions.close", "Cerrar")}</span>
      </SheetPrimitive.Close>
      {children}
    </SheetPrimitive.Content>
  </SheetPortal>
));

SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      className,
    )}
    {...props}
  />
);

SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      className,
    )}
    {...props}
  />
);

SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold tracking-[-0.02em] text-[color:var(--ink)]",
      className,
    )}
    {...props}
  />
));

SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-[color:var(--ink-soft)]", className)}
    {...props}
  />
));

SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
