import { useEffect } from "react";

/**
 * Lightweight right-click menu for the Horario views. Render it when open and
 * pass the click coordinates; it closes on any outside mousedown, scroll or
 * Escape. Use `label: '—'` for a separator row.
 */

export interface CtxItem {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export interface CtxMenuState {
  x: number;
  y: number;
  items: CtxItem[];
  /** Abierto con el dedo: filas más altas y se cierra también al tocar fuera. */
  tactil?: boolean;
}

export default function ContextMenu({
  menu,
  onClose,
}: {
  menu: CtxMenuState;
  onClose: () => void;
}) {
  useEffect(() => {
    const close = () => onClose();
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", esc);
    window.addEventListener("resize", close);
    /* En un móvil no hay `mousedown` hasta que el navegador lo sintetiza, así
       que sin esto el menú sólo se cerraba al girar la pantalla. Se engancha en
       el siguiente tick: el `touchend` de la propia pulsación que lo abrió
       todavía está en vuelo y lo cerraría antes de verse. */
    const t = setTimeout(
      () => window.addEventListener("touchstart", close),
      0,
    );

    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", close);
      window.removeEventListener("touchstart", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", esc);
      window.removeEventListener("resize", close);
    };
  }, [onClose]);

  const rows = menu.items.filter((i) => i.label !== "—").length;
  /* Una fila de 34 px se falla con el dedo. Cuando el menú viene de una
     pulsación larga se agranda, y el cálculo de posición usa ESE alto o el menú
     se saldría por abajo justo en la pantalla donde menos sitio hay. */
  const alto = menu.tactil ? 46 : 34;
  const x = Math.max(
    4,
    Math.min(
      menu.x,
      (typeof window !== "undefined" ? window.innerWidth : 1200) - 224,
    ),
  );
  const y = Math.max(
    4,
    Math.min(
      menu.y,
      (typeof window !== "undefined" ? window.innerHeight : 800) -
        rows * alto -
        16,
    ),
  );

  return (
    <div
      className={`glass-raised fixed z-[90] animate-in fade-in zoom-in-95 duration-100 ${menu.tactil ? "min-w-[240px] max-w-[300px] py-1.5" : "min-w-[200px] max-w-[280px] py-1"}`}
      role="menu"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {menu.items.map((it, i) =>
        it.label === "—" ? (
          <div
            key={i}
            className="my-1 h-px"
            style={{ background: "var(--hairline)" }}
          />
        ) : (
          <button
            key={i}
            className={`cg-focus w-full text-left font-medium transition-colors hover:bg-[var(--glass-sunken)] disabled:cursor-default disabled:opacity-40 ${menu.tactil ? "px-4 py-3 text-sm" : "px-3 py-2 text-xs"}`}
            disabled={it.disabled}
            style={{ color: it.danger ? "var(--bad-text)" : "var(--ink)" }}
            onClick={() => {
              onClose();
              it.onClick?.();
            }}
          >
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}
