/**
 * The BRAND of the record in a detail header (Multimarca): «client of
 * Andina Seguridad», «registered in Beta Guard». Unlike the row labels of
 * the lists (shown only under «Todas las marcas»), a header always says it
 * when the company has two or more brands: on a person's sheet the brand
 * that pays them may not be the one in the top bar.
 */
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import LogoDeMarca from "./LogoDeMarca";

import { useMarcas, useModuloMultimarca } from "@/hooks/useMarcas";
import { marcasService } from "@/lib/api/marcasService";

/** A person's registration brand: their own record first, else `/brands/people`. */
export function useMarcaDePersona(
  userId: string | null | undefined,
  homeBrandId?: string | null,
): string | null {
  const activo = useModuloMultimarca();
  const tenant =
    typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;
  const personas = useQuery({
    queryKey: ["marcas", "personas", tenant],
    queryFn: () => marcasService.personas(),
    enabled: activo && !homeBrandId && !!userId && !!tenant,
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (homeBrandId) return homeBrandId;

  return userId ? (personas.data?.[String(userId)] ?? null) : null;
}

export default function ChipDeMarca({
  marcaId,
  tipo,
  className = "",
}: {
  marcaId: string | null | undefined;
  /** «Cliente de …» or «Registrado en …». */
  tipo: "cliente" | "persona";
  className?: string;
}) {
  const { t } = useTranslation();
  const { activo, todas, marcas } = useMarcas({ archivadas: true });

  if (!activo || !marcaId || marcas.length < 2) return null;
  const b = todas.find((x) => x.id === marcaId) ?? marcas.find((x) => x.id === marcaId);

  if (!b) return null;
  const color = b.color || "var(--ink-faint)";
  const texto =
    tipo === "cliente"
      ? t("ui.ChipDeMarca.clienteDe", "Cliente de {{marca}}", { marca: b.name })
      : t("ui.ChipDeMarca.registradoEn", "Registrado en {{marca}}", { marca: b.name });

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs font-medium ${className}`}
      data-testid="chip-de-marca"
      style={{
        borderColor: `color-mix(in oklab, ${color} 45%, var(--hairline))`,
        background: `color-mix(in oklab, ${color} 8%, transparent)`,
        color: "var(--ink)",
      }}
      title={
        tipo === "persona"
          ? t(
              "ui.ChipDeMarca.registradoAyuda",
              "La marca en cuya nómina cobra, aunque trabaje en sitios de otra.",
            )
          : undefined
      }
    >
      <LogoDeMarca
        className="!rounded-full"
        color={b.color}
        logoUrl={b.logoUrl}
        nombre={b.name}
        size={18}
      />
      <span className="truncate">{texto}</span>
    </span>
  );
}
