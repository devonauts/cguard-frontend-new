/**
 * «ACCESO POR MARCA» in the office users list (Multimarca, phase 2): which
 * brands each person sees. Read from `GET /brands/access` (admin only), so it
 * shows only to an administrator with the module on.
 *
 *   · an administrator, or nobody limited → «Todas»;
 *   · limited → one chip per brand (colour + code);
 *   · a brand admin with no brand → a warning: they see nothing.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

import EtiquetaDeMarca from "./EtiquetaDeMarca";
import { usePuedeDarAccesoDeMarca } from "./CampoAccesoDeMarca";

import { useMarcas, type MarcaEtiqueta } from "@/hooks/useMarcas";
import { accesoDeMarcaService } from "@/lib/api/marcasService";
import {
  esRolAdminDeMarca,
  normalizarAcceso,
  rolVeTodasLasMarcas,
} from "@/lib/multimarca/accesoDeMarca";

export function useAccesosDeMarca() {
  const puede = usePuedeDarAccesoDeMarca();
  const { todas, marcas } = useMarcas();
  const tenant =
    typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;
  const mapa = useQuery({
    queryKey: ["marcas", "acceso", tenant],
    queryFn: () => accesoDeMarcaService.listar(),
    enabled: puede && !!tenant,
    staleTime: 60_000,
    retry: false,
  });

  return useMemo(() => {
    const porId = new Map<string, MarcaEtiqueta>();

    for (const b of todas.length ? todas : marcas)
      porId.set(b.id, {
        id: b.id,
        nombre: b.name,
        codigo: b.code,
        color: b.color || "var(--brand)",
        logoUrl: b.logoUrl,
        principal: !!b.isPrincipal,
      });

    return {
      /** The column is worth showing: admin, module on, the map answered. */
      activo: puede && mapa.isSuccess,
      acceso: (userId: unknown): string[] | null =>
        normalizarAcceso(mapa.data?.[String(userId ?? "")] ?? null),
      marca: (id: string) => porId.get(id) ?? null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puede, mapa.data, mapa.isSuccess, todas, marcas]);
}

export default function AccesoDeMarcaDePersona({
  accesos,
  userId,
  roles,
  className = "",
}: {
  accesos: ReturnType<typeof useAccesosDeMarca>;
  userId: unknown;
  /** The person's role slugs (any case). */
  roles: string[];
  className?: string;
}) {
  const { t } = useTranslation();

  if (!accesos.activo) return null;
  const veTodo = roles.some(rolVeTodasLasMarcas);
  const adminDeMarca = roles.some(esRolAdminDeMarca);
  const acceso = veTodo ? null : accesos.acceso(userId);

  if (acceso === null && !adminDeMarca)
    return (
      <span className={`text-xs ${className}`} style={{ color: "var(--ink-faint)" }}>
        {t("ui.AccesoDeMarcaDePersona.todas", "Todas")}
      </span>
    );
  if (!acceso || !acceso.length)
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs font-medium ${className}`}
        style={{ color: "var(--warn-text)" }}
        title={t(
          "ui.CampoAccesoDeMarca.sinMarcas",
          "Marca al menos una marca: sin ninguna, no vería nada.",
        )}
      >
        <AlertTriangle className="size-3.5" />
        {t("ui.AccesoDeMarcaDePersona.ninguna", "Sin marcas")}
      </span>
    );

  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {acceso.map((id) => (
        <EtiquetaDeMarca key={id} marca={accesos.marca(id)} />
      ))}
    </span>
  );
}

/** Role slugs of a list row, whatever shape the API gave. */
export function rolesDeFila(u: any): string[] {
  const r = u?.roles ?? u?.role ?? u?.rolesList ?? [];
  const arr = Array.isArray(r) ? r : [r];

  return arr
    .map((x: any) =>
      typeof x === "string" ? x : String(x?.slug || x?.name || x?.role || ""),
    )
    .filter(Boolean)
    .map((x: string) => x.toLowerCase());
}
