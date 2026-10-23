import type { SucursalEtiqueta } from "@/hooks/useEtiquetasDeSucursal";

import { useTranslation } from "react-i18next";
import { Globe2 } from "lucide-react";

/**
 * La etiqueta de sucursal de una fila: el color y el código (GYE). Con
 * `empresa`, la de «toda la empresa» (un cliente compartido). Sin sucursal y
 * sin `empresa`, no pinta nada.
 */
export default function EtiquetaDeSucursal({
  sucursal,
  empresa = false,
  className = "",
}: {
  sucursal: SucursalEtiqueta | null | undefined;
  empresa?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();

  if (!sucursal && !empresa) return null;
  if (!sucursal) {
    return (
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-semibold ${className}`}
        style={{ borderColor: "var(--hairline)", color: "var(--ink-soft)" }}
        title={t("sucursales.cliente.todaLaEmpresa")}
      >
        <Globe2 className="size-2.5" />
        {t("sucursales.etiqueta.empresa")}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-semibold ${className}`}
      style={{
        background: `color-mix(in oklab, ${sucursal.color} 15%, transparent)`,
        color: "var(--ink)",
      }}
      title={
        sucursal.principal
          ? `${sucursal.nombre} · ${t("sucursales.principal")}`
          : sucursal.nombre
      }
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ background: sucursal.color }}
      />
      {sucursal.codigo || sucursal.nombre}
    </span>
  );
}
