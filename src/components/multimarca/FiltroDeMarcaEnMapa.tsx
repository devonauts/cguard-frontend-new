/**
 * THE BRAND FILTER OF THE OPERATIONS MAP (Multimarca).
 *
 * Operations are shared: one map with every brand's sites and people. Under
 * «Todas las marcas», with two or more brands, a row of chips (each with its
 * brand's colour) narrows the map to one brand without reloading the CRM:
 *   · a site/station → the brand of its client;
 *   · a client pin → its brand;
 *   · a guard or supervisor → the brand they are registered in;
 *   · an incident → the brand of its client; one whose client is unknown
 *     stays (an alarm is never hidden by a filter);
 *   · the headquarters pin stays.
 * Inside one brand (top bar) the server already narrowed everything and the
 * row is not shown. The pins keep their semantic colours (coverage, status):
 * the brand colour lives in the chips, never on the map.
 */
import type { MapEntity } from "@/pages/admin/dashboard/control-center/types";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Layers } from "lucide-react";

import { useEtiquetasDeMarca, useMarcas } from "@/hooks/useMarcas";

/** The brand id of a map entity, or null when it cannot be told. */
export function marcaDeEntidad(
  e: MapEntity,
  deCliente: (clientId: unknown) => { id: string } | null,
  dePersona: (userId: unknown) => { id: string } | null,
): string | null {
  const m = e.meta || {};

  switch (e.kind) {
    case "station":
    case "incident":
      return deCliente(m.clientId)?.id ?? null;
    case "client":
      return deCliente(m.clientId ?? m.entityId)?.id ?? null;
    case "guard":
    case "supervisor":
      return dePersona(m.userId ?? m.entityId)?.id ?? null;
    default:
      return null;
  }
}

/** Keep what belongs to `marca`, the headquarters and incidents of no known brand. */
export function filtrarPorMarca(
  entidades: MapEntity[],
  marca: string | null,
  marcaDe: (e: MapEntity) => string | null,
): MapEntity[] {
  if (!marca) return entidades;

  return entidades.filter((e) => {
    if (e.kind === "tenant") return true;
    const b = marcaDe(e);

    return b === marca || (e.kind === "incident" && b === null);
  });
}

export function useFiltroDeMarcaEnMapa(entidades: MapEntity[]) {
  const { marcas } = useMarcas();
  const etiquetas = useEtiquetasDeMarca({ clientes: true, personas: true });
  const [marca, setMarca] = useState<string | null>(null);
  const disponible = etiquetas.activo && marcas.length >= 2;
  const elegida = disponible && marcas.some((b) => b.id === marca) ? marca : null;

  const filtradas = useMemo(
    () =>
      filtrarPorMarca(entidades, elegida, (e) =>
        marcaDeEntidad(e, etiquetas.deCliente, etiquetas.dePersona),
      ),
    [entidades, elegida, etiquetas],
  );

  return { disponible, marca: elegida, setMarca, filtradas, marcas };
}

export default function FiltroDeMarcaEnMapa({
  filtro,
  className = "",
}: {
  filtro: ReturnType<typeof useFiltroDeMarcaEnMapa>;
  className?: string;
}) {
  const { t } = useTranslation();

  if (!filtro.disponible) return null;

  const Chip = ({
    activa,
    color,
    children,
    onClick,
  }: {
    activa: boolean;
    color?: string | null;
    children: React.ReactNode;
    onClick: () => void;
  }) => (
    <button
      aria-pressed={activa}
      className="cg-focus inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium"
      style={
        activa
          ? {
              borderColor: color || "var(--brand)",
              background: `color-mix(in oklab, ${color || "var(--brand)"} 14%, var(--float))`,
              color: "var(--ink)",
            }
          : { borderColor: "var(--hairline)", color: "var(--ink-soft)", background: "var(--float)" }
      }
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );

  return (
    <div
      aria-label={t("ui.FiltroDeMarcaEnMapa.etiqueta", "Ver en el mapa la marca")}
      className={`flex items-center gap-1.5 overflow-x-auto pb-0.5 ${className}`}
      data-testid="filtro-marca-mapa"
      role="group"
    >
      <Chip activa={!filtro.marca} onClick={() => filtro.setMarca(null)}>
        <Layers className="size-3.5" />
        {t("ui.SelectorDeMarca.todas", "Todas las marcas")}
      </Chip>
      {filtro.marcas.map((b) => (
        <Chip
          key={b.id}
          activa={filtro.marca === b.id}
          color={b.color}
          onClick={() => filtro.setMarca(filtro.marca === b.id ? null : b.id)}
        >
          <span
            aria-hidden
            className="size-2 rotate-45 rounded-[1px]"
            style={{ background: b.color || "var(--ink-faint)" }}
          />
          {b.code || b.name}
        </Chip>
      ))}
    </div>
  );
}
