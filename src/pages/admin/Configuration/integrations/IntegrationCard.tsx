import { Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/kit";
import { cn } from "@/lib/utils";

type Props = {
  image: string;
  title: string;
  subtitle?: string;
  active?: boolean;
  href: string;
};

/**
 * Tarjeta de una conexión con otro sistema. Va en una rejilla, así que la
 * superficie es `glass-flat` (sin desenfoque): el desenfoque por tarjeta en un
 * `map()` es lo que tira el rendimiento del desplazamiento.
 * Conectada = filo del acento (`glass-brand`).
 */
export default function IntegrationCard({ image, title, subtitle, active, href }: Props) {
  return (
    <div
      className={cn(
        "glass-flat glass-hover flex h-full flex-col items-center justify-between gap-3 p-5",
        active && "glass-brand",
      )}
    >
      <div className="flex min-h-[26px] w-full items-start justify-end">
        {active && <StatusBadge tone="ok">Conectada</StatusBadge>}
      </div>

      <div
        className="flex h-16 w-full items-center justify-center rounded-2xl border p-3"
        style={{
          background: active ? "var(--brand-wash)" : "var(--glass-sunken)",
          borderColor: active ? "var(--brand-line)" : "var(--hairline)",
        }}
      >
        <img src={image} className="max-h-full max-w-full object-contain" alt={title} />
      </div>

      <div className="w-full border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{title}</div>
            {subtitle && subtitle !== title && (
              <div className="truncate text-xs" style={{ color: "var(--ink-soft)" }}>
                {subtitle}
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to={href} aria-label={`Gestionar ${subtitle ?? title}`}>
              <Settings className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
