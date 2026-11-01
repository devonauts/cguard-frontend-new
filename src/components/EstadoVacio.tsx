/**
 * EMPTY STATE WITH ONE NEXT STEP (phase 3, «Empresa nueva»).
 *
 * The kit's EmptyState plus the rule every empty list follows now:
 *   · what this page is for (title + description);
 *   · ONE next step as a button that goes there;
 *   · if the person can't take it, a line saying why / who can, not a button
 *     that fails;
 *   · a filtered list that came back empty says so and offers to clear the
 *     filter, instead of pretending the company has nothing.
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowRight, FilterX, Lock } from "lucide-react";

import { EmptyState } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { vistaDelPaso, type Paso } from "@/lib/proximoPaso";

export type { Paso } from "@/lib/proximoPaso";

export function EstadoVacio({
  icon,
  title,
  description,
  paso,
  filtrado,
  onLimpiarFiltro,
  variant,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  paso?: Paso | null;
  /** The list is empty because of a search/filter, not because there is nothing. */
  filtrado?: boolean;
  onLimpiarFiltro?: () => void;
  variant?: "boxed" | "inline";
  className?: string;
}) {
  const { t } = useTranslation();

  if (filtrado) {
    return (
      <EmptyState
        action={
          onLimpiarFiltro ? (
            <Button variant="outline" onClick={onLimpiarFiltro}>
              <FilterX className="mr-2 h-4 w-4" />
              {t("ui.EstadoVacio.limpiarFiltro", "Quitar el filtro")}
            </Button>
          ) : undefined
        }
        className={className}
        description={t("ui.EstadoVacio.filtradoAyuda", "Prueba con otras palabras o quita el filtro.")}
        icon={icon}
        title={t("ui.EstadoVacio.nadaCoincide", "Nada coincide con la búsqueda")}
        variant={variant}
      />
    );
  }

  const vista = vistaDelPaso(
    paso,
    t("ui.EstadoVacio.pideloAUnAdministrador", "Pídeselo a un administrador de la empresa."),
  );

  const accion =
    vista.modo === "boton" ? (
      vista.to ? (
        <Button asChild variant="brand">
          <Link to={vista.to}>
            {vista.label}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      ) : (
        <Button variant="brand" onClick={vista.onClick}>
          {vista.label}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      )
    ) : vista.modo === "aviso" ? (
      <p className="inline-flex max-w-sm items-start gap-1.5 text-xs" style={{ color: "var(--ink-soft)" }}>
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{vista.texto}</span>
      </p>
    ) : undefined;

  return (
    <EmptyState
      action={accion}
      className={className}
      description={description}
      icon={icon}
      title={title}
      variant={variant}
    />
  );
}

export default EstadoVacio;
