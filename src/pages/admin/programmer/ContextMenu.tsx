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

    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", esc);
      window.removeEventListener("resize", close);
    };
  }, [onClose]);

  const rows = menu.items.filter((i) => i.label !== "—").length;
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
        rows * 34 -
        16,
    ),
  );

  return (
    <div
      className="glass-raised fixed z-[90] min-w-[200px] max-w-[280px] py-1 animate-in fade-in zoom-in-95 duration-100"
      role="menu"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => e.stopPropagation()}
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
            className="cg-focus w-full px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-[var(--glass-sunken)] disabled:cursor-default disabled:opacity-40"
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
