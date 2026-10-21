import type { ReactNode } from "react";

import { motion, useReducedMotion } from "framer-motion";

import { Switch } from "@/components/ui/switch";
import { GlassPanel, IconTile } from "@/components/kit";

/**
 * LA TARJETA DE UN MÓDULO EN LA TIENDA — la misma caja para todos.
 *
 * Mike (2026-10-21): «deben tener el mismo tamaño». Todas las tarjetas comparten
 * esta forma, en el mismo orden y con las mismas alturas reservadas, para que
 * una rejilla de módulos distintos (mensual, pago único) se vea como una sola
 * pieza y ninguna cambie de alto cuando cambia su estado:
 *
 *   cabecera   icono · nombre · tipo            [interruptor]
 *   texto      la descripción, recortada a tres líneas (altura reservada)
 *   precio     el bloque de precio (altura reservada)
 *   situación  una línea de estado (altura reservada, puede ir vacía)
 *   pie        selector o hueco · botón principal
 *
 * El interruptor NO va en la `action` de `Section`: en el escritorio esa fila
 * se estira al ancho entero (`.cg-acciones { width: 100% }`) y el interruptor
 * caía debajo del título. Aquí la cabecera es una fila que no salta.
 *
 * Movimiento: entra con desvanecido y subida (escalonado por la página), se
 * eleva al pasar el ratón (`glass-hover`) y lo que cambia por dentro —precio,
 * situación— lo anima cada tarjeta con `Cifra`. Con «reducir movimiento»,
 * nada se mueve. Sin `layout` de framer: junto con la transformación CSS del
 * hover dejaba el hilo principal midiendo sin parar y la página se congelaba.
 */
export default function TarjetaModulo({
  icon,
  name,
  kicker,
  interruptor,
  accion,
  description,
  precio,
  situacion,
  pie,
  delay = 0,
}: {
  icon: ReactNode;
  name: string;
  /** Qué clase de módulo es: «Cuota mensual», «Pago único». */
  kicker: ReactNode;
  interruptor: {
    checked: boolean;
    disabled?: boolean;
    onChange: (on: boolean) => void;
    label: string;
  };
  /** Algo pequeño junto al interruptor (la píldora «Demo» de VigIA Pro). */
  accion?: ReactNode;
  description: string;
  precio: ReactNode;
  situacion?: ReactNode;
  pie: ReactNode;
  delay?: number;
}) {
  const quieto = !!useReducedMotion();

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="flex min-w-0 flex-col"
      initial={quieto ? false : { opacity: 0, y: 22 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay }}
    >
      <GlassPanel hover className="flex h-full flex-col p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <IconTile size="sm">{icon}</IconTile>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold tracking-tight">
                {name}
              </h3>
              <div
                className="truncate text-xs"
                style={{ color: "var(--ink-faint)" }}
              >
                {kicker}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {accion}
            <Switch
              aria-label={interruptor.label}
              checked={interruptor.checked}
              disabled={interruptor.disabled}
              onCheckedChange={interruptor.onChange}
            />
          </div>
        </div>

        <p
          className="mt-3 line-clamp-3 min-h-[3.75rem] text-sm"
          style={{ color: "var(--ink-soft)" }}
        >
          {description}
        </p>

        <div className="mt-4 min-h-[4.25rem]">{precio}</div>

        <div
          className="mt-2 min-h-5 text-xs"
          style={{ color: "var(--ink-soft)" }}
        >
          {situacion ?? " "}
        </div>

        <div className="mt-auto flex min-h-10 flex-wrap items-center justify-between gap-3 pt-4">
          {pie}
        </div>
      </GlassPanel>
    </motion.div>
  );
}

/** Un número o texto que cambia: el nuevo entra subiendo mientras el viejo se va. */
export function Cifra({
  k,
  children,
  className,
}: {
  k: string | number;
  children: ReactNode;
  className?: string;
}) {
  const quieto = !!useReducedMotion();

  return (
    <span
      className={`relative inline-grid overflow-hidden align-bottom ${className ?? ""}`}
    >
      <motion.span
        key={k}
        animate={{ y: 0, opacity: 1 }}
        className="[grid-area:1/1]"
        initial={quieto ? false : { y: "0.6em", opacity: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.span>
    </span>
  );
}
