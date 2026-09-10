/**
 * ════════════════════════════════════════════════════════════════════════════
 * CONMUTADOR CLARO / OSCURO
 * Un riel hundido con un botón que se desliza. Dos estados, un solo control: es
 * más legible de un vistazo que un icono que cambia de forma, porque la POSICIÓN
 * ya dice en qué modo estás antes de mirar el icono.
 *
 * Los radios van en `style` y no en clases: `.glass-sunken` llega de una hoja
 * SIN capa y le gana a las utilidades de Tailwind, así que un `rounded-full`
 * suelto no se aplicaría. El estilo en línea sí.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { FC } from "react";
import { Moon, Sun } from "lucide-react";
import clsx from "clsx";

import { useThemeContext } from "@/contexts/ThemeContext";

export interface ThemeSwitchProps {
  className?: string;
  /** Sólo el botón redondo con el icono — para barras muy estrechas. */
  compact?: boolean;
}

export const ThemeSwitch: FC<ThemeSwitchProps> = ({
  className,
  compact = false,
}) => {
  const { theme, toggleTheme } = useThemeContext();
  const oscuro = theme === "dark";
  const etiqueta = oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro";

  if (compact) {
    return (
      <button
        aria-checked={oscuro}
        aria-label={etiqueta}
        className={clsx(
          "cg-focus cg-btn-glass grid h-9 w-9 shrink-0 place-items-center transition-all duration-200 active:scale-95",
          className,
        )}
        role="switch"
        style={{ borderRadius: 9999, color: "var(--ink-soft)" }}
        title={etiqueta}
        type="button"
        onClick={toggleTheme}
      >
        {oscuro ? (
          <Moon className="h-[18px] w-[18px]" />
        ) : (
          <Sun className="h-[18px] w-[18px]" />
        )}
      </button>
    );
  }

  return (
    <button
      aria-checked={oscuro}
      aria-label={etiqueta}
      className={clsx(
        "glass-sunken cg-focus relative h-9 w-[62px] shrink-0 p-1 transition-colors",
        className,
      )}
      role="switch"
      style={{ borderRadius: 9999 }}
      title={etiqueta}
      type="button"
      onClick={toggleTheme}
    >
      {/* El botón que se desliza. Lleva el relleno del acento, así que el
          conmutador cambia de color con el acento elegido sin tocar nada. */}
      <span
        aria-hidden
        className="absolute top-1 grid h-7 w-7 place-items-center transition-[left] duration-300"
        style={{
          left: oscuro ? "calc(100% - 2rem)" : "0.25rem",
          borderRadius: 9999,
          background: "var(--brand)",
          color: "var(--brand-ink)",
          boxShadow:
            "0 0 16px -4px var(--brand-glow), inset 0 1px 0 0 oklch(1 0 0 / 0.25)",
          transitionTimingFunction: "var(--ease)",
        }}
      >
        {oscuro ? (
          <Moon className="h-3.5 w-3.5" />
        ) : (
          <Sun className="h-3.5 w-3.5" />
        )}
      </span>

      {/* Los dos destinos, en tinta tenue: marcan a dónde va el botón. */}
      <span
        aria-hidden
        className="relative flex h-7 items-center justify-between px-[7px]"
      >
        <Sun
          className="h-3.5 w-3.5"
          style={{ color: oscuro ? "var(--ink-faint)" : "transparent" }}
        />
        <Moon
          className="h-3.5 w-3.5"
          style={{ color: oscuro ? "transparent" : "var(--ink-faint)" }}
        />
      </span>
    </button>
  );
};

export default ThemeSwitch;
