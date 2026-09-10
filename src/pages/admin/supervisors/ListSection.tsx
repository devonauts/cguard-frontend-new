/**
 * ════════════════════════════════════════════════════════════════════════════
 * SECCIÓN DE LISTA — la `Section` del kit SIN desenfoque.
 *
 * `Section` es `.glass`, y `.glass` lleva `backdrop-filter`. Eso está bien para
 * UNA superficie por pantalla, pero estas tres páginas pintan una sección POR
 * PUESTO y POR DÍA: la lista de un supervisor con veinte puestos son veinte
 * capas que el navegador tiene que volver a rasterizar en cada fotograma, y el
 * desplazamiento se cae.
 *
 * Mismo aspecto, misma cabecera, mismas medidas — sólo cambia `.glass` por
 * `.glass-flat`. La regla del sistema: cristal para superficies, plano para lo
 * que se repite.
 *
 * ── PARA PROMOVER AL KIT ───────────────────────────────────────────────────
 * Esto debería ser `<Section flat>` en `@/components/kit`, igual que
 * `GlassPanel` ya tiene su prop `flat`. Vive aquí porque el kit es territorio
 * de otro agente; en cuanto `Section` acepte `flat`, este archivo se borra y
 * los tres usos pasan a `<Section flat …>`.
 * ════════════════════════════════════════════════════════════════════════════
 */
import * as React from "react";

import { cn } from "@/lib/utils";

export function ListSection({
  title,
  icon,
  action,
  children,
  className,
  contentClassName,
}: {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className={cn("glass-flat p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {icon && (
              <span
                className="[&_svg]:size-4"
                style={{ color: "var(--brand-text)" }}
              >
                {icon}
              </span>
            )}
            {title && (
              <h3 className="truncate text-sm font-semibold tracking-tight">
                {title}
              </h3>
            )}
          </div>
          {action}
        </div>
      )}
      <div className={contentClassName}>{children}</div>
    </div>
  );
}

export default ListSection;
