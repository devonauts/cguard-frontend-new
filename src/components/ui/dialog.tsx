import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = (props: React.ComponentProps<typeof DialogPrimitive.Root>) => {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
};

Dialog.displayName = "Dialog";

const DialogTrigger = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Trigger>,
  React.ComponentProps<typeof DialogPrimitive.Trigger>
>(({ ...props }, ref) => {
  return (
    <DialogPrimitive.Trigger ref={ref} data-slot="dialog-trigger" {...props} />
  );
});

DialogTrigger.displayName = "DialogTrigger";

const DialogPortal = (
  props: React.ComponentProps<typeof DialogPrimitive.Portal>,
) => {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
};

DialogPortal.displayName = "DialogPortal";

const DialogClose = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Close>,
  React.ComponentProps<typeof DialogPrimitive.Close>
>(({ ...props }, ref) => {
  return (
    <DialogPrimitive.Close ref={ref} data-slot="dialog-close" {...props} />
  );
});

DialogClose.displayName = "DialogClose";

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentProps<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        "glass-scrim data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none! fixed inset-0 z-50",
        className,
      )}
      data-slot="dialog-overlay"
      {...props}
    />
  );
});

DialogOverlay.displayName = "DialogOverlay";

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentProps<typeof DialogPrimitive.Content> & {
    showCloseButton?: boolean;
  }
>(
  (
    {
      className,
      children,
      showCloseButton = true,
      onInteractOutside,
      onPointerDownOutside,
      style,
      ...props
    },
    ref,
  ) => {
    return (
      <DialogPortal data-slot="dialog-portal">
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            /* `max-w-lg` va SIN `sm:`: con el prefijo, una pantalla que pedía
             `max-w-3xl` a secas se quedaba capada a 512 px de 640 px para
             arriba, porque el `sm:` es otra clave para tailwind-merge y no lo
             pisaba. Sin prefijo, el valor de quien llama lo sustituye limpio.
             El hueco lateral del teléfono ya no depende de esto: va en el
             `width` en línea de más arriba. */
            "glass-raised data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 rounded-2xl border p-6 shadow-xl duration-200 motion-reduce:animate-none!",
            /* Sin altura máxima, un diálogo alto se sale de la pantalla del
             teléfono y los botones del pie quedan inalcanzables: Radix bloquea
             el desplazamiento del documento, así que no hay forma de llegar.
             El que ya trae su propio `max-h`/`overflow` sigue mandando. */
            "max-h-[90dvh] overflow-y-auto",
            className,
          )}
          onInteractOutside={(e) => {
            // Prevent Radix from closing or blocking clicks on Google Places
            // autocomplete dropdown (.pac-container) which is appended to <body>
            const target = e.target as HTMLElement | null;

            if (target?.closest?.(".pac-container")) {
              e.preventDefault();
            }
            onInteractOutside?.(e);
          }}
          onPointerDownOutside={(e) => {
            const target = e.target as HTMLElement | null;

            if (target?.closest?.(".pac-container")) {
              e.preventDefault();
            }
            onPointerDownOutside?.(e);
          }}
          data-slot="dialog-content"
          /* `position` en línea: `.glass-raised` se declara sin capa en glass.css
           y su `position: relative` gana el cascade a la utilidad `fixed`. Sin
           esto el diálogo cae en el flujo del documento en vez de centrarse.
           ── EL HUECO LATERAL TAMBIÉN VA EN LÍNEA ──────────────────────────
           Estaba escrito como `w-full max-w-[calc(100%-2rem)]`, y `cn()` es
           tailwind-merge: en cuanto una pantalla pasaba su propio `max-w-*`
           —cosa que hacen decenas— el tope se BORRABA y el diálogo salía de
           borde a borde en el teléfono, sin margen ni esquinas. Como ancho en
           línea no hay clase que lo pueda tirar, y los `max-w-*` de quien
           llama siguen mandando en el ancho grande. Un `style` propio con
           `width` gana igual, porque `...style` se esparce después. */
          style={{ position: "fixed", width: "calc(100% - 2rem)", ...style }}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity motion-reduce:transition-none hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
              data-slot="dialog-close"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  },
);

DialogContent.displayName = "DialogContent";

const DialogHeader = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      data-slot="dialog-header"
      {...props}
    />
  );
});

DialogHeader.displayName = "DialogHeader";

const DialogFooter = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      data-slot="dialog-footer"
      {...props}
    />
  );
});

DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentProps<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn("text-lg leading-none font-semibold", className)}
      data-slot="dialog-title"
      {...props}
    />
  );
});

DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentProps<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn("text-muted-foreground text-sm", className)}
      data-slot="dialog-description"
      {...props}
    />
  );
});

DialogDescription.displayName = "DialogDescription";

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
