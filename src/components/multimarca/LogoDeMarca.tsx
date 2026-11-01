import { useState } from "react";

/**
 * A brand's mark: its logo when it has one, else a tile of its colour with
 * its initial. Used in the top bar, the chooser and the brand cards.
 */
export default function LogoDeMarca({
  nombre,
  color,
  logoUrl,
  size = 28,
  className = "",
}: {
  nombre: string;
  color: string | null | undefined;
  logoUrl: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const [roto, setRoto] = useState(false);
  const tinta = color || "var(--ink-faint)";
  const inicial = (nombre || "?").trim().charAt(0).toUpperCase() || "?";

  if (logoUrl && !roto) {
    return (
      <img
        alt=""
        className={`shrink-0 rounded-lg border object-contain ${className}`}
        src={logoUrl}
        style={{
          width: size,
          height: size,
          borderColor: "var(--hairline)",
          background: "var(--float)",
        }}
        onError={() => setRoto(true)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-lg font-semibold ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.45)),
        background: `color-mix(in oklab, ${tinta} 18%, transparent)`,
        color: tinta,
      }}
    >
      {inicial}
    </span>
  );
}
