import { useTranslation } from "react-i18next";
import { Layers } from "lucide-react";

import LogoDeMarca from "./LogoDeMarca";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEspacio } from "@/hooks/useEspacio";
import { useEspacioDeMarca } from "@/hooks/useMarcas";
import { abrirSelectorDeMarca } from "@/lib/marcaElegida";

/**
 * The BRAND in the top bar (module «Multimarca»), next to the branch one.
 *
 * «Todas las marcas» = no narrowing; a brand narrows every list, report and
 * export to its clients, their sites and the people who work there. Brand
 * and branch are independent and combine. The change is saved in the
 * account too and RELOADS on the same route (like the branch selector).
 * On a phone the bar has no room for a dropdown: a pill with the brand code
 * opens the big chooser.
 *
 * With a single brand nothing is chosen: the pill only says where you are.
 */
export default function SelectorDeMarca({
  compacto = false,
}: {
  compacto?: boolean;
}) {
  const { t } = useTranslation();
  const { activo, opciones, actual, entrar } = useEspacioDeMarca();

  if (!activo || !actual) return null;

  const etiqueta = actual.todas
    ? t("ui.SelectorDeMarca.todas", "Todas las marcas")
    : actual.nombre;
  const color = actual.todas
    ? "var(--brand)"
    : actual.color || "var(--ink-faint)";

  if (compacto || opciones.length < 2) {
    const puede = opciones.length >= 2;

    return (
      <button
        aria-label={
          puede ? t("ui.SelectorDeMarca.elegir", "Elegir la marca") : etiqueta
        }
        className="cg-focus inline-flex h-9 max-w-[7.5rem] items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold"
        disabled={!puede}
        style={{
          borderColor: `color-mix(in oklab, ${color} 45%, var(--hairline))`,
          color: "var(--ink)",
        }}
        title={etiqueta}
        type="button"
        onClick={abrirSelectorDeMarca}
      >
        {actual.todas ? (
          <Layers className="size-3.5 shrink-0" />
        ) : (
          <span
            aria-hidden
            className="size-2 shrink-0 rotate-45 rounded-[1px]"
            style={{ background: color }}
          />
        )}
        <span className="truncate">
          {actual.todas
            ? t("ui.SelectorDeMarca.todasCorto", "Marcas")
            : actual.codigo || actual.nombre}
        </span>
      </button>
    );
  }

  return (
    <Select value={actual.id} onValueChange={(v) => entrar(v)}>
      <SelectTrigger
        aria-label={t("ui.SelectorDeMarca.elegir", "Elegir la marca")}
        className="h-9 max-w-[220px] gap-1.5 text-sm"
      >
        {actual.todas ? (
          <Layers className="size-4 shrink-0" />
        ) : (
          <LogoDeMarca
            color={actual.color}
            logoUrl={actual.logoUrl}
            nombre={actual.nombre}
            size={18}
          />
        )}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opciones.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            <span className="inline-flex items-center gap-2">
              {o.todas ? (
                <Layers className="size-3.5" />
              ) : (
                <span
                  aria-hidden
                  className="size-2 rotate-45 rounded-[1px]"
                  style={{ background: o.color || "var(--ink-faint)" }}
                />
              )}
              {o.todas
                ? t("ui.SelectorDeMarca.todas", "Todas las marcas")
                : o.nombre}
              {o.principal && (
                <span
                  className="text-[10px] font-semibold"
                  style={{ color: "var(--brand-text, var(--brand))" }}
                >
                  · {t("ui.Multimarca.principal", "Principal")}
                </span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The brand's colour line at the foot of the header, when working inside one
 * brand. The branch line wins when both modules narrow the view (one 3 px
 * line, never two stacked): absolute, so the header height never changes.
 */
export function LineaDeMarca() {
  const { activo, actual, opciones } = useEspacioDeMarca();
  const espacio = useEspacio();

  if (!activo || !actual || actual.todas || opciones.length === 0) return null;
  if (espacio.activo && espacio.actual && !espacio.actual.global) return null;
  const c = actual.color || "var(--brand)";

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px]"
      style={{
        background: `linear-gradient(90deg, ${c}, color-mix(in oklab, ${c} 35%, transparent))`,
      }}
    />
  );
}
