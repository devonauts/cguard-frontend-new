import type { MarcaEtiqueta } from "@/hooks/useMarcas";

import { useTranslation } from "react-i18next";

/**
 * The brand label of a row: its colour and its code (or name). Mirrors
 * `EtiquetaDeSucursal`. Without a brand it paints nothing.
 */
export default function EtiquetaDeMarca({
  marca,
  className = "",
}: {
  marca: MarcaEtiqueta | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();

  if (!marca) return null;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-semibold ${className}`}
      style={{
        borderColor: `color-mix(in oklab, ${marca.color} 40%, var(--hairline))`,
        color: "var(--ink)",
      }}
      title={
        marca.principal
          ? `${marca.nombre} · ${t("ui.Multimarca.principal", "Principal")}`
          : marca.nombre
      }
    >
      <span
        aria-hidden
        className="size-1.5 rotate-45 rounded-[1px]"
        style={{ background: marca.color }}
      />
      {marca.codigo || marca.nombre}
    </span>
  );
}
