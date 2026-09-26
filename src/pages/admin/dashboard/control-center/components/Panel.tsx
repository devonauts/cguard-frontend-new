import type { ReactNode } from "react";

import { useTranslation } from "react-i18next";
/**
 * Panel de cristal del centro de mando: cabecera (icono + título + subtítulo +
 * acción «Ver todo») y un halo del acento POR DETRÁS del cristal — es lo que el
 * desenfoque difumina para que la superficie tenga profundidad en vez de
 * parecer un rectángulo con opacidad.
 */
import { ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { toneFill, toneInk, toneWash, type Tone } from "../tone";

import { IconTile } from "@/components/kit";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  subtitle,
  icon,
  action,
  live,
  tone = "brand",
  halo = true,
  className,
  bodyClassName,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  live?: boolean;
  tone?: Tone;
  halo?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn("glass relative flex flex-col overflow-hidden", className)}
    >
      {halo && (
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full blur-3xl"
          style={{
            background: `radial-gradient(circle, ${toneFill(tone)} 0%, transparent 70%)`,
            opacity: 0.15,
          }}
        />
      )}
      <header className="relative flex items-start justify-between gap-3 px-5 pb-3 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          {icon && (
            <IconTile size="sm" tone={tone}>
              {icon}
            </IconTile>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-display truncate text-sm font-semibold tracking-tight">
                {title}
              </h2>
              {live && <LivePip />}
            </div>
            {subtitle && (
              <p
                className="truncate text-xs"
                style={{ color: "var(--ink-faint)" }}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="cmd-hair mx-5" />
      <div className={cn("relative flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}

/** La acción de cabecera: «Ver todo» con la flecha en diagonal. */
export function PanelLink({
  to,
  children,
  onClick,
}: {
  to?: string;
  children?: ReactNode;
  onClick?: () => void;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <button
      className="cg-focus group inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors"
      style={{
        borderColor: "var(--hairline)",
        color: "var(--brand-text)",
        background: "var(--glass-sunken)",
      }}
      type="button"
      onClick={onClick ?? (to ? () => navigate(to) : undefined)}
    >
      {children ?? t("ui.PanelLink.verTodo", "Ver todo")}
      <ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </button>
  );
}

/**
 * Píldora tonal del centro de mando. UNA sola pieza para los cuatro sitios que
 * la reimplementaban: el indicador «en vivo» de las cabeceras de panel, la
 * etiqueta de tipo de cada novedad, el estado del enlace de la barra de mando y
 * la marca «s/d» de una métrica sin datos. Eran cuatro píldoras con cuatro
 * tamaños y tres pesos distintos para el mismo papel.
 *
 * No es `StatusBadge` del kit: ésta va sin borde y en versalitas diminutas
 * porque se apila DENTRO de una cabecera, junto a un título, y la del kit —con
 * su borde y su 12 px— compite con él. La del kit sigue siendo la correcta
 * cuando la píldora va suelta sobre el lienzo.
 */
export function TonePill({
  children,
  tone = "neutral" as Tone,
  pulse = false,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        className,
      )}
      style={{ background: toneWash(tone, 13), color: toneInk(tone) }}
    >
      {pulse && (
        <span
          className="cc-dot"
          style={{ background: toneFill(tone), width: 6, height: 6 }}
        />
      )}
      {children}
    </span>
  );
}

/** Indicador de «esto se actualiza solo». El punto late; el texto no. */
export function LivePip({
  label,
  tone = "ok" as Tone,
}: {
  label?: string;
  tone?: Tone;
}) {
  const { t } = useTranslation();

  return (
    <TonePill pulse tone={tone}>
      {label ?? t("dashboard.live")}
    </TonePill>
  );
}

/** Punto de estado sin animación — para listas donde 20 latidos serían ruido. */
export function Dot({ tone }: { tone: Tone }) {
  return (
    <span
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ background: toneFill(tone) }}
    />
  );
}
